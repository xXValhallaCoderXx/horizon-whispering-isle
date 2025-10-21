/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { AudioBank } from "AudioBank";
import { GameConstants } from "Constants";
import { DialogManager } from "DialogManager";
import { DigMinigame, LuckSource } from "DigMinigame";
import { DigMinigameBase } from "DigMinigameBase";
import { HUDElementType } from "Enums";
import { Events } from "Events";
import { ProprtionalTimer } from "GameUtils";
import LocalCamera from "horizon/camera";
import { Color, Entity, ParticleGizmo, Quaternion, TextGizmo, Vec3 } from "horizon/core";
import { ItemUtils } from "ItemUtils";
import { Logger } from "Logger";
import { clamp, clamp01, lerp, lerpVec3 } from "MathUtils";
import { PotionData } from "PotionData";
import { Shovel } from "Shovel";
import { AnalyticsManager, LogType } from "TurboAnalytics";
import { PopupDialogParams } from "UIView_PopupDialog";

const log = new Logger("DigMinigamePhase0");
const hudHideContext = "minigame";

/**
 * Phase 0: Cast it
 */
export class DigMinigamePhase0 extends DigMinigameBase {
  private tooltip!: TextGizmo;
  private tooltipShadow!: TextGizmo;
  private castPfx!: ParticleGizmo;

  // Text color config
  private readonly textStartColor = "#E4AB00";
  private readonly textEndColor = "#00DF13";

  // Bar constraints: How far something can travel on the bar before falling off
  private readonly barMinX = -6.23;
  private readonly barMaxX = -this.barMinX;

  // Config
  private readonly complimentTime = 1;
  private readonly cameraZoomTimeMs: number = 10 * 1000 // How long to get to full zoom level
  private readonly cameraZoomOffset = -5; // In degrees for FOV;
  private readonly pingPongTimeMs = 1.5 * 1000; // Number of milliseconds for a full ping-pong (counting up, then down)
  public readonly shovelRaiseRate = 1.8;
  public readonly shovelLowerRate = 1.8;
  private readonly minMaxScaleChangeRate = 8;

  // Refs
  private complimentEntities: Entity[] = [];

  // State
  private startTimeMs = 0;
  private casting: boolean = false;
  private animating: boolean = false;
  private pingPong01: number = 0;
  private complimentTimer: ProprtionalTimer = new ProprtionalTimer(0);
  private randomZRot: number = 0;
  private chanceBonusScale: number = 0;
  private complimentIndex: number = 0;
  private minMaxScale: number = 0;
  private complimentPosition: Vec3 = Vec3.zero;
  private complimentRotation: Vec3 = Vec3.zero;
  private complimentInitialPosition: Vec3 = new Vec3(5.044937, 1.2, 0);
  private complimentInitialScale: Vec3 = Vec3.one;
  private complimentScale: number = 1;
  private complimentTargetPosition: Vec3 = Vec3.zero;

  private set tooltipText(text: string) {
    this.tooltip.text.set(text);
    this.tooltipShadow.text.set(text);
  }

  private set tooltipColor(color: Color) {
    this.tooltip.color.set(color);
  }

  constructor(digMinigame: DigMinigame, root: Entity) {
    super(digMinigame, root);

    this.tooltip = this.props.phase0Tooltip!.as(TextGizmo);
    this.tooltipShadow = this.props.phase0TooltipShadow!.as(TextGizmo);
    this.castPfx = this.props.phase0CastPfx!.as(ParticleGizmo);

    this.complimentEntities = [
      this.props.phase0Compliment0!,
      this.props.phase0Compliment1!,
      this.props.phase0Compliment2!,
      this.props.phase0Compliment3!,
      this.props.phase0Compliment4!,
    ]
    for (const compliment of this.complimentEntities) {
      compliment.visible.set(false);
    }
  }

  public init() {
    super.init();

    this.casting = true;
    this.props.phase0ProgressRoot!.visible.set(true);
    this.props.phase0ComplimentRoot!.visible.set(false);
    this.startTimeMs = Date.now();
    this.pingPong01 = 0;
    this.movingUp = false;
    this.digMinigame.props.phase0TutorialRoot!.visible.set(true);
    this.minMaxScale = 0;
    this.props.phase0Min?.transform.localScale.set(Vec3.zero);
    this.props.phase0Max?.transform.localScale.set(Vec3.zero);

    const hasShinySpotItem = this.digMinigame.hasShinySpotItem;
    this.props.chanceResultText?.visible.set(hasShinySpotItem);
    this.props.dieRoot?.visible.set(hasShinySpotItem);
    this.props.itemImage?.visible.set(hasShinySpotItem);

    const eventSubscription = this.digMinigame.connectLocalBroadcastEvent(Shovel.digAction, (payload) => {
      if (!payload.isPressed) {
        eventSubscription.disconnect();
        this.onClickDown(false);
      }
    });

    if (hasShinySpotItem) {
      const x = -0.5;
      this.digMinigame.popIn(this.props.chanceResultRoot!, this.props.rarityBar!).then(() => this.digMinigame.flyToBottom(this.props.chanceResultRoot!, x, this.props.rarityBar!));
    }
  }

  private setMinMaxScale(scale: number) {
    scale = clamp(scale, 0, 1);
    if (scale === this.minMaxScale) {
      return;
    }
    this.minMaxScale = scale;
    const scaleVec = new Vec3(this.minMaxScale, this.minMaxScale, this.minMaxScale);
    this.props.phase0Min?.transform.localScale.set(scaleVec);
    this.props.phase0Max?.transform.localScale.set(scaleVec);
  }

  public cancel() {
    this.casting = false;
  }

  public onClickDown(value: boolean) {
    if (this.casting) {
      if (!value) {
        this.casting = false;
        this.animating = true;
        // Show the global modifier
        this.chanceBonusScale = this.pingPong01;

        this.setCompliment();
        this.digMinigame.props.phase0TutorialRoot!.visible.set(false);

        this.props.phase0ProgressRoot!.visible.set(false);
        this.owner.playAvatarAnimation(this.props.digBreakAnim!, { looping: false, playRate: 1, fadeInDuration: .2, fadeOutDuration: .2 });
        this.castPfx.position.set(this.digMinigame.digPosition.add(new Vec3(0, 0.4, 0)));

        this.async.setTimeout(() => {
          // Sparkle!!
          this.castPfx.play();

          this.props.lightBeam!.visible.set(true);
          this.props.lightBeam!.transform.position.set(this.digMinigame.digPosition);
        }, 420);

        this.async.setTimeout(() => {
          AudioBank.play('minigame_phaseComplete');
        }, 300);

        AudioBank.play('minigame_digBegin');
        this.digMinigame.sendLocalBroadcastEvent(Events.localHideHUD, { context: hudHideContext, exclude: HUDElementType.DigMinigameUsefulWidget | HUDElementType.Location });

        this.async.setTimeout(() => {
          if (this.digMinigame.inFocusMode) { // only enter the animation if we are in focus mode
            this.owner.playAvatarAnimation(this.props.anim_prying_loop!, { looping: true, playRate: 1, fadeInDuration: .3 });
          }
        }, 1000);
      }
    }
  }

  private setVisibleCompliment(index: number) {
    //this.complimentEntities[index].visible.set(true);
    log.info(`Setting compliment ${index} visible`);
    for (let i = 0; i < this.complimentEntities.length; ++i) {
      this.complimentEntities[i].visible.set(i == index);
    }
  }

  private setCompliment() {
    this.props.phase0ComplimentRoot!.visible.set(true);
    this.complimentTimer.SetTime(this.complimentTime);

    // Give a compliment based on the value
    this.complimentIndex = 0;
    if (this.pingPong01 > .995) {
      this.complimentIndex = 4;
    }
    else if (this.pingPong01 > 0.95) {
      this.complimentIndex = 3;
    }
    else if (this.pingPong01 > 0.8) {
      this.complimentIndex = 2;
    }
    else if (this.pingPong01 > 0.5) {
      this.complimentIndex = 1;
    }
    const isPerfect = this.complimentIndex === 4;
    this.setVisibleCompliment(this.complimentIndex);
    this.complimentRotation = this.props.phase0ComplimentRoot!.transform.localRotation.get().toEuler();
    this.randomZRot = isPerfect ? 0 : (Math.random() > 0.5 ? -1 : 1) * (Math.random() + 1) * 10;
    this.complimentRotation.y = 0;
    this.complimentRotation.z = this.randomZRot;
    this.props.phase0ComplimentRoot!.transform.localRotation.set(Quaternion.fromEuler(this.complimentRotation));

    this.complimentPosition = this.complimentInitialPosition.clone();

    if (isPerfect) {
      this.complimentTargetPosition = new Vec3(0, 3.3, 0);
    } else {
      this.complimentTargetPosition = this.complimentInitialPosition.clone();
      this.complimentTargetPosition.y += 1.5;
    }
    this.props.phase0ComplimentRoot!.transform.localPosition.set(this.complimentPosition);

    this.complimentScale = 0;
    this.props.phase0ComplimentRoot!.transform.localScale.set(Vec3.zero);
  }

  private movingUp: boolean = false;

  public update(deltaTime: number) {
    super.update(deltaTime);

    this.updateMinigameLocation();

    if (this.casting) {
      this.setMinMaxScale(this.minMaxScale + deltaTime * this.minMaxScaleChangeRate);
      const elapsedMs = Date.now() - this.startTimeMs;
      const t = (elapsedMs % this.pingPongTimeMs) / this.pingPongTimeMs; // Normalized time
      let previousPingPong = this.pingPong01;
      this.pingPong01 = 1 - Math.abs(1 - 2 * t);
      if (this.movingUp) {
        if (this.pingPong01 < previousPingPong) {
          this.movingUp = false;
          log.info(`Moving up ${this.movingUp}`);
          AudioBank.play('minigame_chargeDown');
          this.owner.playAvatarAnimation(this.props.anim_shovel_lower!, { looping: false, playRate: this.shovelLowerRate, fadeInDuration: 0.2, fadeOutDuration: 0.2 });
          //this.owner.playAvatarAnimation(this.props.anim_shovel_raise_lower_loop!, { looping: false, playRate: 1.9 });
        }
      }
      else {
        if (this.pingPong01 > previousPingPong) {
          this.movingUp = true;
          log.info(`Moving up ${this.movingUp}`);
          AudioBank.play('minigame_chargeUp');
          this.owner.playAvatarAnimation(this.props.anim_shovel_raise!, { looping: false, playRate: this.shovelRaiseRate, fadeInDuration: 0.2, fadeOutDuration: 0.2 });
        }
      }

      // Progress in GREEN
      this.props.progressBar!.color.set(ItemUtils.hexToColor("#32cd32"));

      // Slowly inch the camera forward to build intensity
      const zoomT = 1 - ((Math.cos(Math.min(1, elapsedMs / this.cameraZoomTimeMs) * Math.PI) + 1) * 0.5);
      const currentZoom = lerp(this.digMinigame.defaultFOV, this.digMinigame.defaultFOV + this.cameraZoomOffset, zoomT)
      LocalCamera.overrideCameraFOV(currentZoom);

      let cursor = this.props.phase0Cursor!;
      let position = cursor.transform.localPosition.get();
      position.x = lerp(this.barMinX, this.barMaxX, this.pingPong01);
      cursor.transform.localPosition.set(position);

      let color: Color = ItemUtils.hexToColor(ItemUtils.interpolateHexColors(this.textStartColor, this.textEndColor, this.pingPong01));

      const progressBarMaxLength = 12.371318;
      this.props.phase0Fill!.scale.set(new Vec3(this.pingPong01 * progressBarMaxLength, 1, 1));
      this.props.phase0Fill!.color.set(color);

      // Show the luck value and update the text
      const luckModifier = lerp(0, GameConstants.Minigame.Phase0ChanceBonus, this.pingPong01);
      const luckVisualLimiter = GameConstants.Minigame.Phase0ChanceBonus - 0.1; // Prevent double digits since it makes the text pop
      this.tooltipText = `Chance +${Math.min(luckModifier, luckVisualLimiter).toFixed(1)}%`;
      this.tooltipColor = color;
    } else if (this.animating) {
      const isPerfect = this.complimentIndex === 4;
      const targetScale = isPerfect ? 1.6 : this.complimentInitialScale.x;
      this.setMinMaxScale(this.minMaxScale - deltaTime * this.minMaxScaleChangeRate);
      if (!this.complimentTimer.Complete()) {
        const t = 1 - this.complimentTimer.TimeRemaining01();
        this.props.lightBeam!.transform.localScale.set(new Vec3(1, Math.sin(t * Math.PI), 1));

        this.randomZRot += deltaTime * 10 * Math.sign(this.randomZRot);
        this.complimentRotation.z = this.randomZRot;
        this.props.phase0ComplimentRoot!.transform.localRotation.set(Quaternion.fromEuler(this.complimentRotation));

        let positionScale = t;
        if (isPerfect) {
          positionScale = Math.sin(clamp01(3 * t) * Math.PI * .5);
        } else if (this.digMinigame.hasShinySpotItem) {
          positionScale = Math.sin(t * Math.PI * .5);
        }
        this.complimentPosition = lerpVec3(this.complimentInitialPosition, this.complimentTargetPosition, positionScale);
        this.props.phase0ComplimentRoot!.transform.localPosition.set(this.complimentPosition);

        const nonShinyScaleDownThreshold = .97;
        if (!this.digMinigame.hasShinySpotItem && t >= nonShinyScaleDownThreshold) {
          this.complimentScale = targetScale * (1 - t) / (1 - nonShinyScaleDownThreshold);
        } else {
          if (isPerfect) {
            this.complimentScale = Math.sin(t * Math.PI * .5) * targetScale;
          } else {
            this.complimentScale = lerp(0, targetScale, clamp01(t * 10));
          }
        }
        this.props.phase0ComplimentRoot!.transform.localScale.set(new Vec3(this.complimentScale, this.complimentScale, this.complimentScale));
      } else if (this.digMinigame.shinySpotItem === "") {
        this.onAnimationFinished();
      } else {
        const moveSpeed = 45;
        const targetPosition = new Vec3(0, -4.5, 0);
        const direction = targetPosition.sub(this.complimentPosition);
        const distance = direction.magnitude();
        const step = moveSpeed * deltaTime;
        if (distance <= step) {
          this.onAnimationFinished();
        } else {
          if (this.complimentScale > 0) {
            const scaleDecreaseSpeed = isPerfect ? 5 : 4;
            this.complimentScale = Math.max(0, this.complimentScale - scaleDecreaseSpeed * deltaTime);
            this.props.phase0ComplimentRoot!.transform.localScale.set(new Vec3(this.complimentScale, this.complimentScale, this.complimentScale));
          }
          this.complimentPosition.addInPlace(direction.normalize().mul(step));
          this.props.phase0ComplimentRoot!.transform.localPosition.set(this.complimentPosition);
        }
      }
    }
  }

  private onAnimationFinished() {
    this.animating = false;
    this.props.lightBeam!.visible.set(false);
    this.complimentEntities[this.complimentIndex].visible.set(false);
    if (this.digMinigame.hasShinySpotItem) {
      const scale = (this.complimentIndex + 1) / 5;
      this.digMinigame.bumpLuck(scale * GameConstants.Minigame.Phase0ChanceBonus, LuckSource.Phase0);
    }
    if (!this.suggestPotion()) {
      // All out of compliments, next thing
      this.complete();
    }
  }

  private complete() {
    // Server is responsible of selecting which item we are digging!
    this.digMinigame.sendNetworkBroadcastEvent(Events.playerStartDig, {
      player: this.owner,
      digPosition: this.digPosition,
      minigameChanceScale: this.chanceBonusScale,
      compliment: this.complimentIndex
    }, [this.world.getServerPlayer()]);
    this.digMinigame.sendNetworkBroadcastEvent(AnalyticsManager.clientLogToServer, { player: this.owner, log_type: LogType.TASK_END, taskKey: 'pre_dig', taskType: (this.chanceBonusScale * 10).toFixed(1) }, [this.world.getServerPlayer()]);
    const event = this.digMinigame.connectNetworkBroadcastEvent(Events.itemSelected, (data) => {
      event.disconnect();
      this.digMinigame.onComplete(true);
    });
  }

  private suggestPotion(): boolean {
    const suggestedPotion = this.digMinigame.suggestedPotionId;
    if (suggestedPotion === "") {
      return false;
    }
    const potionTuning = PotionData.getPotionTuning(suggestedPotion);
    if (!potionTuning) {
      return false;
    }
    const suggestedPotionText = potionTuning.displayName;
    const suggestedPotionImageAsset = PotionData.getPotionImageAsset(suggestedPotion);
    const imageId = suggestedPotionImageAsset?.id ?? BigInt(0);
    const imageVersionId = suggestedPotionImageAsset?.versionId;
    const params: PopupDialogParams = {
      title: "Activate recommended Potion?",
      text: suggestedPotionText,
      option1: "Skip",
      option2: "Activate",
      option2TextColor: "#FFF",
      option2BGColor: "#70C04E",
      option2BorderColor: "#49A24C",
      imageId,
      imageVersionId,
    }
    this.digMinigame.dialogID = DialogManager.showPopup(this.digMinigame, this.world.getLocalPlayer(), params, (player, selection) => {
      this.digMinigame.dialogID = undefined;
      if (selection === 1) {
        log.info(`requesting potion ${suggestedPotion}`);
        this.digMinigame.sendNetworkBroadcastEvent(AnalyticsManager.clientLogToServer, { player: this.world.getLocalPlayer(), log_type: LogType.TASK_END, taskKey: 'potion_suggestion_accepted', taskType: suggestedPotion }, [this.world.getServerPlayer()]);
        this.digMinigame.sendNetworkBroadcastEvent(Events.requestSelectPotion, { player: this.owner, potionId: suggestedPotion }, [this.world.getServerPlayer()]);
        this.digMinigame.async.setTimeout(() => {
          // Need to wait for rpcs to propagate before we can complete
          this.complete();
        }, 200);
      } else {
        this.digMinigame.sendNetworkBroadcastEvent(AnalyticsManager.clientLogToServer, { player: this.world.getLocalPlayer(), log_type: LogType.TASK_END, taskKey: 'potion_suggestion_declined', taskType: suggestedPotion }, [this.world.getServerPlayer()]);
        this.complete();
      }
    });
    return true;
  }
}
