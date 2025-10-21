/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { AudioBank } from 'AudioBank';
import { BigBox_ToastEvents } from 'BigBox_ToastManager';
import { ClientStartupReporter } from 'ClientStartupReporter';
import { GameConstants } from 'Constants';
import { DialogManager } from 'DialogManager';
import { DigMinigameBase } from 'DigMinigameBase';
import { DigMinigamePhase0 } from 'DigMinigamePhase0';
import { DigMinigamePhase2, MINIGAME_RARITY_TEXT_X_OFFSET, MINIGAME_RARITY_TEXT_X_OFFSET_WITH_ITEM } from 'DigMinigamePhase2';
import { DigZoneManager } from 'DigZoneManager';
import { HUDElementType } from 'Enums';
import { Events } from 'Events';
import * as GameUtils from 'GameUtils';
import LocalCamera from 'horizon/camera';
import { AnimationCallbackReasons, AudioGizmo, CodeBlockEvents, Color, Component, Entity, EventSubscription, InteractionInfo, LocalEvent, MeshEntity, NetworkEvent, ParticleGizmo, Player, PlayerControls, PlayerVisibilityMode, PropTypes, Quaternion, RaycastGizmo, SerializableState, TextGizmo, Vec3, World } from 'horizon/core';
import { Islands } from 'Islands';
import { ItemContainer } from 'ItemContainer';
import { ItemData } from 'ItemData';
import { ItemUtils } from 'ItemUtils';
import { Logger } from 'Logger';
import { clamp01, easeInOutQuad, lerp, lerpVec3 } from 'MathUtils';
import { SelectedPotionData } from 'PlayerData';
import { PlayerDataEvents } from 'PlayerDataEvents';
import { PlayerService } from 'PlayerService';
import { PVarEvents } from 'PVarManager';
import { Shovel } from 'Shovel';
import { ShovelData } from 'ShovelData';

const log = new Logger("DigMinigame");
const hudHideContext = "minigame";

export type OnFocusInteractionCallback = (payload: { interactionInfo: InteractionInfo[]; }) => boolean;

export enum LuckSource { Phase0, Potion }

export class DigMinigame extends Component<typeof DigMinigame> {
  // Refs
  static propsDefinition = {
    // Anim
    anim_shovel_raise: { type: PropTypes.Asset },
    anim_shovel_lower: { type: PropTypes.Asset },
    anim_shovel_raise_lower_loop: { type: PropTypes.Asset },
    anim_attack_dig: { type: PropTypes.Asset },
    anim_strike_gold: { type: PropTypes.Asset },
    anim_prying_enter: { type: PropTypes.Asset },
    anim_prying_loop: { type: PropTypes.Asset },
    anim_fling_out: { type: PropTypes.Asset },
    anim_attack_fast_dig: { type: PropTypes.Asset },
    anim_attack_fast_idle: { type: PropTypes.Asset },
    digBreakAnim: { type: PropTypes.Asset },
    digSadAnim: { type: PropTypes.Asset },

    digWarningThreshold: { type: PropTypes.Number }, // will warn player if this dig requires more than this number of digs, suggesting it is too hard
    warningTextColor: { type: PropTypes.Color, default: new Color(0.97, 0.31, 0.31) },
    digButtonMinPressTime: { type: PropTypes.Number, default: .2 },
    digReadyAnimCancelTime: { type: PropTypes.Number, default: .2 },
    digMinimumAnimationTime: { type: PropTypes.Number, default: .15 },
    digLuckBumpPerPotion: { type: PropTypes.Number, default: 1 },

    alertRoot: { type: PropTypes.Entity },
    lightBeam: { type: PropTypes.Entity },

    chanceResultRoot: { type: PropTypes.Entity },
    chanceResultText: { type: PropTypes.Entity },
    itemImage: { type: PropTypes.Entity },
    dieRoot: { type: PropTypes.Entity },
    rarityResultText: { type: PropTypes.Entity },
    rarityTextRoot: { type: PropTypes.Entity },
    rarityBar: { type: PropTypes.Entity },
    rarityArrow: { type: PropTypes.Entity },

    // Raycast refs
    raycast: { type: PropTypes.Entity },

    // Minigame entity references

    // Phase 0
    phase0Root: { type: PropTypes.Entity },
    phase0Cursor: { type: PropTypes.Entity },
    phase0Fill: { type: PropTypes.Entity },
    phase0ProgressRoot: { type: PropTypes.Entity },
    phase0Min: { type: PropTypes.Entity },
    phase0Max: { type: PropTypes.Entity },

    // Phase 0 Particles
    phase0CastPfx: { type: PropTypes.Entity },

    // Phase 0 Text refs
    phase0Tooltip: { type: PropTypes.Entity },
    phase0TooltipShadow: { type: PropTypes.Entity },
    phase0Compliment0: { type: PropTypes.Entity },
    phase0Compliment1: { type: PropTypes.Entity },
    phase0Compliment2: { type: PropTypes.Entity },
    phase0Compliment3: { type: PropTypes.Entity },
    phase0Compliment4: { type: PropTypes.Entity },
    phase0ComplimentRoot: { type: PropTypes.Entity },
    phase0TutorialRoot: { type: PropTypes.Entity },

    // Phase 2
    phase2Root: { type: PropTypes.Entity },
    cursor: { type: PropTypes.Entity },
    cursorTreasure: { type: PropTypes.Entity },

    targetBar: { type: PropTypes.Entity },
    phase2PlayerShovel: { type: PropTypes.Entity },
    phase2CircleGradient: { type: PropTypes.Entity },
    phase2ShovelTarget: { type: PropTypes.Entity },
    backgroundBar: { type: PropTypes.Entity },
    progressBar: { type: PropTypes.Entity },
    minigameRoot: { type: PropTypes.Entity },
    arrowLeft: { type: PropTypes.Entity },
    arrowRight: { type: PropTypes.Entity },
    continueButton: { type: PropTypes.Entity },
    continueButtonRoot: { type: PropTypes.Entity },
    rarityBarRoot: { type: PropTypes.Entity },

    phase2DamageRoot: { type: PropTypes.Entity },
    phase2DamageText: { type: PropTypes.Entity },
    phase2DamageTextShadow: { type: PropTypes.Entity },

    // Phase 2 Particles
    groundDustFx: { type: PropTypes.Entity },
    dirtBurstPfx: { type: PropTypes.Entity },
    phase2DigImpactFx: { type: PropTypes.Entity },

    // Phase 2 Text refs
    tooltip: { type: PropTypes.Entity },
    tooltipShadow: { type: PropTypes.Entity },
  };

  // Consts
  public readonly defaultFOV: number = 55;// 40; // No where in the documentation is the default FOV listed, but seems like it's this
  public readonly intenseZoomFOV: number = 40;
  public readonly shortDigPressCooldown: number = 1;
  public readonly finishedDigCooldown: number = 2;
  private readonly modifierCenterStartPosition: Vec3 = new Vec3(0, .3, 0);
  public readonly bottomYPosition = -4.25;
  private readonly chanceDisplayChangeDuration = 200;

  // Exposed
  public raycast!: RaycastGizmo;
  public groundDustFx: ParticleGizmo | null = null;
  public equippedShovelData: ShovelData | null = null;
  public clickDown = false;
  public leftClickDown = false;
  public rightClickDown = false;
  public inFocusMode: boolean = false;
  public itemData: ItemData | null = null;
  public itemRarity: number = 0;
  public hasPlayedNearBreakingSfx = false;
  public isTutorialComplete = false;
  public digPosition: Vec3 = Vec3.zero;
  public island: Islands = Islands.BeachCamp;
  public zoneLevel: number = 0;
  public zoneDifficultyMultiplier: number = 1;
  public selectedPotions?: SelectedPotionData[];
  public baseChance: number = 0;
  public chanceTargetDisplayValue: number = 0;
  public luckValue: number = 0;
  public suggestedPotionId: string = "";
  public shinySpotItem: string = "";
  public owner!: Player;
  public dialogID?: bigint;

  private isRunnning: boolean = false;
  private isDigPressed = false;
  private digCooldown: GameUtils.Timer = new GameUtils.Timer(0)

  private chanceResultText!: TextGizmo;
  private set chanceResult(text: string) {
    this.chanceResultText.text.set(text);
  }

  private rarityResultText!: TextGizmo;
  private set rarityResult(text: string) {
    this.rarityResultText.text.set(text);
  }

  private chanceDisplayValue: number = 0;
  private set chanceDisplay(value: number) {
    this.chanceDisplayValue = value;
    const diplay = `${value.toFixed(0)}%`;
    this.chanceResultText.text.set(diplay);
  }

  public get hasShinySpotItem() { return this.shinySpotItem !== ""; }

  /**
   * A phase has been completed
   * @param isSuccess true if the phase was completed to satisfaction
   */
  public onComplete(isSuccess: boolean) {
    // Check if the ride is over
    let nextPhaseIndex = this.currentPhaseIndex + 1;

    if (nextPhaseIndex > this.minigamePhases.length - 1 || !isSuccess) {
      if (!isSuccess) {
        this.currentPhase.cancel();
        this.owner.stopAvatarAnimation();
        this.sendLocalBroadcastEvent(Events.localShowHUD, { context: hudHideContext });
      }
      this.isRunnning = false;

      // Tell locally we done
      this.sendLocalBroadcastEvent(Events.localPlayerDigComplete, { player: this.owner!, isSuccess: isSuccess });
      this.sendNetworkBroadcastEvent(Events.playerDigComplete, { player: this.owner!, isSuccess: isSuccess, itemId: this.itemData?.id ?? "" }, [this.world.getServerPlayer(), this.world.getLocalPlayer()]);

      if (!isSuccess) {
        // Sad
        if (this.props.digSadAnim) {
          this.owner.playAvatarAnimation(this.props.digSadAnim, {
            looping: false, playRate: 1, callback: (asset, reason) => {
              if (reason === AnimationCallbackReasons.Stopping) {
                //log.info("Sad animation complete " + reason);
                this.owner.locomotionSpeed.set(GameConstants.Player.MoveSpeed);
              }
            }
          });
        } else {
          this.owner.locomotionSpeed.set(GameConstants.Player.MoveSpeed);
        }
      }
      else {
        this.owner.locomotionSpeed.set(GameConstants.Player.MoveSpeed);
      }

      // All done, close out
      this.owner.exitFocusedInteractionMode();
      this.entity!.setVisibilityForPlayers([], PlayerVisibilityMode.VisibleTo);
      this.minigamePhases.forEach((phase) => phase.reset());
    }
    else {
      // Doesn't phase me!! Or does it...
      this.setCurrentPhase(nextPhaseIndex);
    }
  }

  /**
   * Show a little "!" because we caught something!!
   */
  public async alert() {
    let root: Entity = this.props.alertRoot!;
    root.visible.set(true);

    // Zoom in the camera for intensity
    LocalCamera.overrideCameraFOV(this.intenseZoomFOV, { duration: 0.4 });

    let endTime = 0.2;
    let startTime = Date.now() * 0.001; // Converted to Seconds
    let elapsed = 0;

    let scaleStart = Vec3.one.mul(0.1);
    let scaleEnd = Vec3.one.mul(1);

    let desiredPosition: Vec3 = PlayerService.getPlayerFootPosition(this.owner).add(new Vec3(0, 2.2, 0));

    root.transform.localScale.set(scaleStart);
    root.transform.position.set(desiredPosition);
    const lookDirection = LocalCamera.position.get().sub(desiredPosition);
    root.transform.rotation.set(Quaternion.lookRotation(lookDirection));
    root.as(MeshEntity).color.set(Color.fromHex(ItemUtils.RARITY_HEX_COLORS_BEGIN[this.itemRarity]));

    AudioBank.play('minigame_exclamation');

    // Zoom in
    while (true) {
      let currentTime = Date.now() * 0.001; // Converted to Seconds
      elapsed = currentTime - startTime;
      let t01 = clamp01(elapsed / endTime);

      let newScale = lerpVec3(scaleStart, scaleEnd, easeInOutQuad(t01));
      root.transform.localScale.set(newScale);
      const up = Quaternion.mulVec3(Quaternion.fromAxisAngle(lookDirection, Math.PI * .5 * (1 - t01)), Vec3.up);
      root.transform.rotation.set(Quaternion.lookRotation(lookDirection, up));


      if (elapsed >= endTime) {
        break;
      }
      // Wait
      await this.wait(16); // wait 16ms (approximately 60fps)
    }

    // Bounce
    let positionStart = desiredPosition;
    let positionEnd = desiredPosition.add(Vec3.up.mul(0.2));

    endTime = 0.8;
    startTime = Date.now() * 0.001; // Converted to Seconds
    elapsed = 0;

    const bounceCount = 2;


    while (elapsed < endTime) {
      let currentTime = Date.now() * 0.001; // Converted to Seconds
      elapsed = currentTime - startTime;

      let t01 = (Math.sin(elapsed * Math.PI * 2 * (bounceCount / endTime)) + 1) * 0.5;
      let newPosition = lerpVec3(positionStart, positionEnd, t01);
      root.transform.position.set(newPosition);

      // Wait
      await this.wait(16); // wait 16ms (approximately 60fps)
    }

    // Zoom out
    endTime = 0.2;
    startTime = Date.now() * 0.001; // Converted to Seconds
    elapsed = 0;

    scaleStart = Vec3.one.mul(1);
    scaleEnd = Vec3.one.mul(0.1);

    while (elapsed < endTime) {
      let currentTime = Date.now() * 0.001; // Converted to Seconds
      elapsed = currentTime - startTime;
      let t01 = clamp01(elapsed / endTime);

      let newScale = lerpVec3(scaleStart, scaleEnd, easeInOutQuad(t01));
      root.transform.localScale.set(newScale);

      // Wait
      await this.wait(16); // wait 16ms (approximately 60fps)
    }

    root.visible.set(false);
  }

  private minigamePhases!: DigMinigameBase[];
  private currentPhaseIndex: number = 0;
  private get currentPhase(): DigMinigameBase { return this.minigamePhases[this.currentPhaseIndex]!; };

  public static minigameStartedEvent = new NetworkEvent<{ player: Player }>('minigameStartedEvent');
  public static bumpLuck = new LocalEvent<{ amount: number, source: LuckSource }>('minigame_bumpLuck');

  private onUpdateCallback: EventSubscription | undefined;

  start() {
    this.owner = this.world.getLocalPlayer();
    if (this.owner === this.world.getServerPlayer()) {
      this.entity.setVisibilityForPlayers([], PlayerVisibilityMode.VisibleTo);
      return;
    }
    this.chanceResultText = this.props.chanceResultText!.as(TextGizmo);
    this.rarityResultText = this.props.rarityResultText!.as(TextGizmo);

    LocalCamera.overrideCameraFOV(this.defaultFOV, { duration: 0.2 });

    this.minigamePhases = [
      new DigMinigamePhase0(this, this.props.phase0Root!),
      new DigMinigamePhase2(this, this.props.phase2Root!),
    ];

    this.raycast = this.props.raycast!.as(RaycastGizmo);
    this.groundDustFx = this.props.groundDustFx!.as(ParticleGizmo);

    this.entity.setVisibilityForPlayers([this.owner], PlayerVisibilityMode.VisibleTo);

    const sub = this.connectLocalBroadcastEvent(ItemContainer.itemDataLoadComplete, () => {
      this.itemData = ItemContainer.localInstance.allItems[0]; // ensure this is never null
      sub.disconnect()
    })

    this.connectLocalBroadcastEvent(Events.localPlayerSwingShovel, (data: { player: Player, digPosition: Vec3 }) => {
      log.info(`[${data.player ? data.player.id : "NULL"}] Starting Dig!`);
      if (this.owner != null && data.player === this.owner) {
        this.digPosition = data.digPosition;

        // Can't hide HUD, it will prevent release events from firing due to modified pressables.
        this.sendLocalBroadcastEvent(Events.localHideHUD, { context: hudHideContext, exclude: ~(HUDElementType.AboveInventory | HUDElementType.WorldUI_DigSpot) });
        this.owner.enterFocusedInteractionMode();
        this.enterFocusedState();
      }
    });

    //Listen to click down on the current owner player
    this.connectLocalBroadcastEvent(PlayerControls.onFocusedInteractionInputStarted, (payload: { interactionInfo: InteractionInfo[]; }) => {
      if (!this.isRunnning) {
        return;
      }
      // Button pressing for Tutorial
      let inputEaten = this.currentPhase.onFocusInteractionCallback(payload);

      // Handle the press down for the minigame
      if (!inputEaten) {
        this.clickDown = true;
        if (payload.interactionInfo[0].screenPosition.x <= .5) {
          this.leftClickDown = true;
        } else {
          this.rightClickDown = true;
        }
        this.currentPhase.onClickDown(this.clickDown);
        AudioBank.play('minigame_tap');
      }
    });

    //Listen to click up on the current owner player
    this.connectLocalBroadcastEvent(PlayerControls.onFocusedInteractionInputEnded, (payload) => {
      this.clickDown = false;
      this.leftClickDown = false;
      this.rightClickDown = false;
      this.currentPhase.onClickDown(this.clickDown);
    });

    this.connectCodeBlockEvent(
      this.entity,
      CodeBlockEvents.OnPlayerExitedFocusedInteraction,
      (player: Player) => {
        if (this.owner != null && player === this.owner) {
          if (this.isRunnning) {
            // Force complete the minigame
            log.info("DigMinigame: Force canceled by user");
            this.onComplete(false);
          }

          this.exitFocusedState();
        }
      },
    );

    this.connectNetworkBroadcastEvent(Events.itemSelected, (data) => {
      log.info("DigMinigame: got broadcast from " + data.player.id + " and owner is " + this.owner);
      if (data.player.id !== this.owner.id) {
        return;
      }

      let itemData = ItemContainer.localInstance.getItemDataForId(data.itemId);
      if (itemData === undefined) {
        log.error("DigMinigame: Item Selected To For Minigame " + data.itemId + " not found")
        return;
      }

      this.itemData = itemData;

      if (this.itemData !== null) {
        log.info("DigMinigame: Item Selected Local " + this.itemData.name);

        let data: ItemData = this.itemData;
        this.itemRarity = data.rarity;
        this.rarityResult = ItemUtils.RARITY_TEXT[this.itemRarity];
        this.props.rarityResultText?.color.set(Color.fromHex(ItemUtils.RARITY_HEX_COLORS_BEGIN[this.itemRarity]));
        const offset = this.hasShinySpotItem ? MINIGAME_RARITY_TEXT_X_OFFSET_WITH_ITEM[this.itemRarity] : MINIGAME_RARITY_TEXT_X_OFFSET[this.itemRarity]
        this.props.rarityTextRoot?.transform.localPosition.set(new Vec3(offset, 0, 0));
      }
      else {
        log.error("DigMinigame: Invalid item data on Item Selected Local.");
      }
      this.island = data.island;
    })

    this.connectLocalBroadcastEvent(Events.localPlayerShovelChanged, (payload) => {
      this.equippedShovelData = payload.shovelData
      //log.info("DigMinigame: Equipped shovel " + this.equippedShovelData.props.name)
    });

    this.connectNetworkBroadcastEvent(PVarEvents.sendPVarTutorialComplete, (data: { player: Player, isTutorialComplete: boolean }) => {
      //log.info("[Minigame] got tutorial complete pvar " + data.isTutorialComplete + " for player " + data.player.id + " and owner " + PlayerService.getPlayerName(this.owner))
      if (data.player == this.owner) {
        if (data.isTutorialComplete) {
          this.isTutorialComplete = true;
        }
      }
    });

    this.connectLocalBroadcastEvent(Shovel.digAction, (payload) => {
      this.isDigPressed = payload.isPressed;
      // Apparently avatar animations don't start playing immediately, wait a period of time before trying to stop.
      if (payload.isPressed) {
        if (this.canDig()) {
          this.digCooldown.SetTime(this.shortDigPressCooldown);
          this.owner.playAvatarAnimation(this.props.anim_shovel_raise!, { playRate: .01, fadeInDuration: .7, fadeOutDuration: .2 });
          this.sendNetworkBroadcastEvent(Events.canDig, this.owner, [this.world.getServerPlayer()]);
          this.async.setTimeout(() => {
            if (!this.isRunnning && !this.isDigPressed) {
              this.owner.stopAvatarAnimation({ fadeOutDuration: this.props.digReadyAnimCancelTime });
            }
          }, this.props.digMinimumAnimationTime * 1000);
        } else {
          // Locomotion speed is set to 0 when dig action is pressed, so we need to set it back to normal
          // after evaluating if player can dig
          this.owner.locomotionSpeed.set(GameConstants.Player.MoveSpeed);
        }
      } else {
        if (!this.isRunnning) {
          this.owner.stopAvatarAnimation({ fadeOutDuration: this.props.digReadyAnimCancelTime });
        }
      }
    })

    this.connectNetworkBroadcastEvent(Events.canDigResponse, (payload) => {
      this.async.setTimeout(() => {
        if (!this.isDigPressed) {
          this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
            player: this.owner,
            text: 'Keep button pressed to dig.'
          }, [this.owner])

          this.owner.locomotionSpeed.set(GameConstants.Player.MoveSpeed);
          return;
        }
        if (!payload.canDig) {
          this.owner.stopAvatarAnimation({ fadeOutDuration: this.props.digReadyAnimCancelTime });
          this.owner.locomotionSpeed.set(GameConstants.Player.MoveSpeed);
          return;
        }
        this.suggestedPotionId = payload.suggestedPotionId;
        this.zoneLevel = payload.starRequirement;
        this.shinySpotItem = payload.shinySpotItem;
        this.baseChance = payload.baseChance * 100;
        this.setChanceDisplay(this.baseChance, false);
        if (this.shinySpotItem !== undefined) {
          this.props.itemImage?.visible.set(true);
        } else {
          this.props.itemImage?.visible.set(false);
        }
        this.tryStartMinigame(this.owner);
      }, this.props.digButtonMinPressTime * 1000);
    })

    this.connectNetworkBroadcastEvent(DigZoneManager.sendZoneId, (payload) => {
      // Don't need zoneLevel because we will get star requirement from canDigResponse
      this.zoneDifficultyMultiplier = payload.data.difficultyMultiplier;
    });

    this.connectNetworkBroadcastEvent(PlayerDataEvents.updateSelectedPotions, (data) => this.updateSelectedPotions(data.selectedPotionsData));

    this.connectLocalBroadcastEvent(DigMinigame.bumpLuck, (data) => this.bumpLuck(data.amount, data.source));

    this.sendNetworkBroadcastEvent(PVarEvents.requestPVarTutorialComplete, { player: this.owner }, [this.world.getServerPlayer()]);

    this.connectLocalBroadcastEvent(Events.digResultHUDClose, () => {
      // We completed the dig, so wait until the dig result hud is closed before
      // showing the ui (to prevent ui from flickering on and off and on again after
      // a successful dig)
      this.sendLocalBroadcastEvent(Events.localShowHUD, { context: hudHideContext });
    });

    this.sendNetworkBroadcastEvent(Events.setMinigameItemIconEntity, { player: this.owner, entity: this.props.itemImage! }, [this.world.getServerPlayer()]);

    // Play all animations once, since they don't play on the first time for some reason....
    this.owner.playAvatarAnimation(this.props.anim_shovel_raise!);
    this.owner.playAvatarAnimation(this.props.anim_shovel_lower!);
    this.owner.playAvatarAnimation(this.props.digBreakAnim!);
    this.owner.playAvatarAnimation(this.props.anim_attack_dig!);
    this.owner.playAvatarAnimation(this.props.anim_attack_fast_dig!);
    this.owner.playAvatarAnimation(this.props.anim_attack_fast_idle!);
    this.owner.playAvatarAnimation(this.props.anim_strike_gold!);
    this.owner.playAvatarAnimation(this.props.anim_prying_enter!);
    this.owner.playAvatarAnimation(this.props.anim_prying_loop!);
    this.owner.playAvatarAnimation(this.props.anim_fling_out!);
    if (this.props.digSadAnim) {
      this.owner.playAvatarAnimation(this.props.digSadAnim);
    }

    this.owner.stopAvatarAnimation();

    ClientStartupReporter.addEntry("DigMinigame start()", this);
  }

  receiveOwnership(_serializableState: SerializableState, _oldOwner: Player, _newOwner: Player): void {
    if (this.world.getLocalPlayer() !== this.world.getServerPlayer()) {
      ClientStartupReporter.addEntry("DigMinigame receiveOwnership()");
    }
  }

  private canDig() {
    return this.digCooldown.Complete();
  }

  dispose() {
    // Cleanup
    if (this.groundDustFx !== null) {
      //this.world.deleteAsset(this.groundDustFx);
    }
  }

  private enterFocusedState() {
    this.inFocusMode = true;
    this.initMinigame();
  }

  private exitFocusedState() {
    this.inFocusMode = false;
    //LocalCamera.resetCameraFOV();
    LocalCamera.overrideCameraFOV(this.defaultFOV, { duration: 0.2 });
    //this.sendLocalBroadcastEvent(Events.localShowHUD, { context: hudHideContext });
    this.clickDown = false;
    this.digCooldown.SetTime(this.finishedDigCooldown);
    if (this.dialogID) {
      DialogManager.cancel(this, this.owner, this.dialogID);
    }
    this.onUpdateCallback?.disconnect();
    this.onUpdateCallback = undefined;
  }

  private setCurrentPhase(index: number) {
    this.currentPhaseIndex = index;

    for (let i = 0; i < this.minigamePhases.length; ++i) {
      this.minigamePhases[i].visible = i == index;
    }

    this.currentPhase.init();
    this.sendLocalBroadcastEvent(Events.digMinigamePhaseChanged, { phase: index });
  }

  private wait(ms: number) {
    return new Promise(resolve => {
      this.async.setTimeout(() => resolve(true), ms);
    });
  }

  private updateSelectedPotions(selectedPotionsData: SelectedPotionData[]): void {
    this.selectedPotions = selectedPotionsData;
  }

  public setChanceDisplay(value: number, interpolate: boolean) {
    if (!interpolate) {
      this.chanceDisplay = value;
    } else {
      const steps = 5;
      let i = 0;
      const prevValue = this.chanceTargetDisplayValue;
      const id = this.async.setInterval(() => {
        i++;
        if (i < steps) {
          this.chanceDisplay = lerp(prevValue, this.chanceTargetDisplayValue, i / steps);
        } else {
          this.chanceDisplay = value;
          this.async.clearInterval(id);
        }
      }, this.chanceDisplayChangeDuration / steps);
    }
    this.chanceTargetDisplayValue = value;
  }

  public setRarityResultScale(scale: number) {
    this.rarityResultText.transform.localScale.set(new Vec3(scale, scale, 1));
  }

  public isRunning() { return this.isRunnning; }

  // /**
  //  * Make the luck zoom in and fly up
  //  */
  // public flyLuck() {
  //   this.animateModifier(this.props.chanceResultRoot!, AnimationType.Center);
  // }

  // public flyLuckToBottom(x: number) {
  //   this.animateModifier(this.props.chanceResultRoot!, AnimationType.Bottom, x, this.props.rarityBar);
  // }

  public bumpLuck(amount: number, source: LuckSource) {
    let increment = 0;
    switch (source) {
      case LuckSource.Phase0:
        increment = amount;
        break;
      case LuckSource.Potion:
        increment = this.baseChance * amount;
        break;
    }
    if (increment === 0) {
      return;
    }
    this.setChanceDisplay(this.chanceTargetDisplayValue + increment, true);
    this.popModifier(this.props.chanceResultRoot!)
  }

  /**
   * Make the strength zoom in and fly up
   */
  // public flyStrength(value: string) {
  //   this.rarityResult = value;
  //   this.flyModifier(this.props.strengthResultRoot!, 1);
  // }

  // // Wait slightly
  // endTime = 0.5;
  // startTime = Date.now() * 0.001; // Converted to Seconds
  // elapsed = 0;

  // while (elapsed < endTime) {
  //   let currentTime = Date.now() * 0.001; // Converted to Seconds
  //   elapsed = currentTime - startTime;

  //   // Wait
  //   await this.wait(16); // wait 16ms (approximately 60fps)
  // }
  //}

  public async popIn(root: Entity, background?: Entity) {
    this.popRunning = false; // Cancel the popping if that's running
    root.visible.set(true);
    let startTime = Date.now() * 0.001; // Converted to Seconds
    let elapsed = 0;

    const fullScale: number = 1.5;
    let scaleStart = Vec3.zero;
    let scaleEnd = Vec3.zero;
    let endTime = 0;

    endTime = 0.2;
    scaleStart = Vec3.one.mul(0.1);
    scaleEnd = Vec3.one.mul(fullScale);
    root.transform.localScale.set(scaleStart);

    // Zoom in
    while (elapsed < endTime) {
      let currentTime = Date.now() * 0.001; // Converted to Seconds
      elapsed = currentTime - startTime;
      let t01 = clamp01(elapsed / endTime);

      let newScale = lerpVec3(scaleStart, scaleEnd, easeInOutQuad(t01));
      root.transform.localScale.set(newScale);

      // Wait
      await this.wait(16); // wait 16ms (approximately 60fps)
    }
  }

  public async flyToBottom(root: Entity, x: number, background?: Entity) {
    this.popRunning = false; // Cancel the popping if that's running
    root.visible.set(true);
    let startTime = Date.now() * 0.001; // Converted to Seconds
    let elapsed = 0;
    const fullScale: number = 1.5;
    let scaleStart = Vec3.one.mul(1);
    let scaleEnd = Vec3.one.mul(0.75);
    let endTime = 0.2;

    // Fly to bottom
    let posStart = root.transform.localPosition.get();
    let posEnd = new Vec3(x, this.bottomYPosition, 0);
    const backgroundStart = background?.transform.localPosition.get() ?? Vec3.zero;
    const backgroundOffset = -.15;

    while (elapsed < endTime) {
      let currentTime = Date.now() * 0.001; // Converted to Seconds
      elapsed = currentTime - startTime;
      let t01 = clamp01(elapsed / endTime);

      let newPos = lerpVec3(posStart, posEnd, easeInOutQuad(t01));
      root.transform.localPosition.set(newPos);

      let newScale = lerpVec3(scaleStart, scaleEnd, easeInOutQuad(t01));
      root.transform.localScale.set(newScale);
      background?.transform.localPosition.set(new Vec3(backgroundStart.x, lerp(backgroundStart.y, backgroundStart.y + backgroundOffset, t01), backgroundStart.z));

      // Wait
      await this.wait(16); // wait 16ms (approximately 60fps)
    }
  }

  /**
   * Make the strength pop in
   */
  public incrementStrength(value: string) {
    // this.strengthResult = value;
    // this.popModifier(this.props.strengthResultRoot!);
  }

  private popRunning: boolean = false;

  public async popModifier(root: Entity) {
    this.popRunning = true;
    root.visible.set(true);

    const popScale = 1.8;
    const popTime = .12;
    const initialScale = root.transform.localScale.get();

    let endTime = popTime;
    let startTime = Date.now() * 0.001; // Converted to Seconds
    let elapsed = 0;
    let scaleStart = initialScale;
    let scaleEnd = initialScale.mul(popScale);

    root.transform.localScale.set(scaleStart);

    // Zoom in
    while (this.popRunning && elapsed < endTime) {
      let currentTime = Date.now() * 0.001; // Converted to Seconds
      elapsed = currentTime - startTime;
      let t01 = clamp01(elapsed / endTime);

      let newScale = lerpVec3(scaleStart, scaleEnd, easeInOutQuad(t01));
      root.transform.localScale.set(newScale);

      // Wait
      await this.wait(16); // wait 16ms (approximately 60fps)
    }

    endTime = popTime;
    startTime = Date.now() * 0.001; // Converted to Seconds
    elapsed = 0;

    scaleStart = initialScale.mul(popScale);
    scaleEnd = initialScale;

    // Zoom down
    while (this.popRunning && elapsed < endTime) {
      let currentTime = Date.now() * 0.001; // Converted to Seconds
      elapsed = currentTime - startTime;
      let t01 = clamp01(elapsed / endTime);

      let newScale = lerpVec3(scaleStart, scaleEnd, easeInOutQuad(t01));
      root.transform.localScale.set(newScale);

      // Wait
      await this.wait(16); // wait 16ms (approximately 60fps)
    }

    this.popRunning = false;
  }

  // Deprive this object of lodgment
  private initMinigame() {
    //log.info(`Init Minigame`);
    this.isRunnning = true;
    this.setCurrentPhase(0); // Let the games begin
    this.clickDown = false;

    // Setup modifier roots
    this.props.chanceResultRoot!.transform.localPosition.set(this.modifierCenterStartPosition);
    this.props.chanceResultRoot!.transform.localScale.set(Vec3.one);
    this.props.chanceResultRoot!.visible.set(false);
    this.props.alertRoot!.visible.set(false);
    this.props.lightBeam!.visible.set(false);
    this.props.rarityArrow?.transform.localScale.set(new Vec3(0, 1, 1));

    this.setRarityResultScale(0);

    this.sendNetworkBroadcastEvent(DigMinigame.minigameStartedEvent, { player: this.owner }, [this.owner, this.world.getServerPlayer()]);

    this.onUpdateCallback?.disconnect();
    this.onUpdateCallback = this.connectLocalBroadcastEvent(World.onUpdate, (payload) => {
      this.onUpdate(payload.deltaTime);
    });

    this.entity!.setVisibilityForPlayers([this.owner], PlayerVisibilityMode.VisibleTo);

    ////////////////////////////////////////////////////////////////
    // TESTING ONLY - Skip to the reward
    //this.minigameComplete(true);
    ////////////////////////////////////////////////////////////////
  }

  private tryStartMinigame(player: Player) {
    if (player != null) {
      const digPosition = Shovel.getSurfaceDigPosition();
      if (digPosition !== undefined) {
        // Start the digging minigame
        this.sendLocalBroadcastEvent(Events.localPlayerSwingShovel, { player, digPosition });
      }
      else {
        // No diggable surface, try again
        player.locomotionSpeed.set(GameConstants.Player.MoveSpeed);
        this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
          player: this.owner,
          text: "You're not standing on diggable terrain."
        }, [this.owner]);
      }
    }
  }

  private onUpdate(deltaTime: number) {
    this.currentPhase.update(deltaTime);
  }
}
Component.register(DigMinigame);
