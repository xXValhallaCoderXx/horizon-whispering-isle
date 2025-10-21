/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { AudioBank } from "AudioBank";
import { GameConstants } from "Constants";
import { DigMinigame } from "DigMinigame";
import { DigMinigameBase } from "DigMinigameBase";
import { HUDElementType } from "Enums";
import { Events } from "Events";
import * as GameUtils from 'GameUtils';
import { Color, Entity, InteractionInfo, LayerType, ParticleGizmo, Quaternion, TextGizmo, Vec3 } from "horizon/core";
import { getIslandDigDifficulty } from "Islands";
import { ItemUtils } from "ItemUtils";
import { Logger } from "Logger";
import { clamp, clamp01, lerp } from "MathUtils";
import { PlayerService } from "PlayerService";
import { Shovel } from "Shovel";
import { AnalyticsManager, LogType } from "TurboAnalytics";
import { UIView_Minigame } from "UIView_Minigame";

const SHOVEL_LEVEL_DIFFICULTY_RANGE = 4;

// clamped to within 10 levels of zone level
const LEVEL_RARITY_TO_DIFFICULTY_TABLE = [
  //-4   -3   -2   -1    0    1    2    3    4
  [0, 0, 0, .5, 1, 3.5, 6.5, 9, 10],  // Common
  [0, 0, .5, 1, 3, 5, 7.5, 10, 10],  // Uncommon
  [1, 1, 3.5, 4.4, 5.5, 7.5, 10, 10, 10],  // Rare
  [2, 2.5, 4.2, 5, 6.6, 9, 10, 10, 10],  // Epic
  [4, 4, 5, 6, 7.6, 10, 10, 10, 10],  // Legendary
  [6, 6.6, 7.3, 7.9, 8.5, 10, 10, 10, 10],  // Mythical
]

const DIFFICULTY_LEVEL_TUNING =
  //   0     1     2     3     4     5     6     7     8     9    10
  [.72, .81, .87, .92, .96, 1, 1.05, 1.09, 1.12, 1.14, 1.45]

export const MINIGAME_RARITY_BAR_WIDTHS =
  [1.15, 1.5, 0.7, 0.7, 1.3, 1.1]

export const MINIGAME_RARITY_X_OFFSET =
  [-1.95, -2.7, -1.1, -1.1, -2.3, -1.85]

export const MINIGAME_RARITY_X_OFFSET_WITH_ITEM =
  [-1.3, -2.2, -1.32, -1.32, -1.95, -1.75]

export const MINIGAME_RARITY_TEXT_X_OFFSET =
  [-2.8, -2.1, -3.65, -3.65, -2.43, -2.85]

export const MINIGAME_RARITY_TEXT_X_OFFSET_WITH_ITEM =
  [2.1, 2.85, 1.1, 1.1, 2.5, 2.15]

const log = new Logger("DigMinigamePhase2");
const hudHideContext = "minigame";

/**
 * Phase 2: Slider bar area control
 */
export class DigMinigamePhase2 extends DigMinigameBase {
  private tooltip!: TextGizmo;
  private tooltipShadow!: TextGizmo;
  private damageValue!: TextGizmo;
  private damageValueShadow!: TextGizmo;
  private dirtBurstPfx!: ParticleGizmo;
  private digImpactPfx!: ParticleGizmo;

  // Continue button config
  private readonly continueButtonDefaultColor = "#00900C";
  private readonly continueButtonSelectedColor = "#72d753";

  // Config
  private readonly defaultTooltip: string = "Press and hold anywhere to go RIGHT. Release to go LEFT.";
  private readonly startBufferDefault = 0.5; // How long to wait for user input before starting
  private readonly idleFadeInDuration = .8;
  private readonly pryLoopDuration = 2700;
  private readonly arrowShrinkScale = .5;
  private readonly arrowSpacing = 1.8;

  // Bar constraints: How far something can travel on the bar before falling off
  private readonly barMinX = -7.78;
  private readonly barMaxX = -this.barMinX;

  // Minigame tuning
  private readonly startingBarValue = 0.6; // position of the cursor at start
  private readonly tutorialBarValue = 0.5; // position of the cursor for tutorial only
  private readonly startingTargetValue = 0.5; // position of the target at start
  private readonly startingProgressValue = 0.2; // how much of the bar is full on start
  private readonly startingDistanceAmount = 0.8; // the maximum random distance across the UI the bar can move when it moves randomly
  private readonly timeUntilMaxDecreaseRate = 20; // How long until the progress bar is decreasing at max speed

  private readonly defaultTargetHealth = 1; // This is the damage interval (in seconds)
  private readonly defaultStrength = 4.8;
  private readonly defaultBarWidth = 0.35; // starting size of the bar before any rarity or shovel mods
  private readonly defaultBarSpeed = 1;
  private readonly defaultBarResponsiveness = 2; // Coefficient/multiplier of acceleration when the cursor is moving
  private readonly defaultProgressDecreaseRate = .1; // Bigger = faster decrease
  private readonly defaultDecayRateScaleIncreaseSpeed = .5;
  private readonly defaultTargetSpeed = 0.3;
  private readonly defaultTargetLerpSpeed = 2;
  private readonly defaultTargetAdjustThreshold = .1;
  private readonly defaultTargetHoldTime = 2.4;
  private readonly defaultLargeSwingCooldown = 3;
  private readonly defaultLargeSwingThreshold = .5;

  // Animation values
  private readonly shovelDigDepth: number = 1.5;
  private readonly shovelDigHorizontal: number = 0.65;

  private shovelStrength01 = 0.35; // Value [0, 1] representing how much progress each hit should break
  private targetHealth = this.defaultTargetHealth;
  private targetWidth = this.defaultBarWidth;
  private targetDirection = 1;
  private targetValue = this.startingTargetValue;
  private nextTargetValue = 0;
  private barValue = this.startingBarValue;
  private progressValue = this.startingProgressValue;
  private maxMoveDistance = this.startingDistanceAmount;
  private barAnimDirty = false;
  private lastBarOnTarget = false;
  private minigameRunning = false;
  private nearBreaking01: number = 0;
  private digAnimCount = 0;
  private arrowLeftScale = 1;
  private arrowRightScale = 0;
  private decayRateScaleIncreaseSpeed = this.defaultDecayRateScaleIncreaseSpeed;
  private largeSwingCooldownTimer = 0;
  private currentBarVelocity = this.defaultBarSpeed;
  private maxBarSpeed = this.defaultBarSpeed;
  private targetSpeed = this.defaultTargetSpeed;
  private targetLerpSpeed = this.defaultTargetLerpSpeed;
  private barResponsiveness = this.defaultBarResponsiveness;
  private progressDecreaseRateMax = this.defaultProgressDecreaseRate;
  private progressDecreaseRateMin = this.defaultProgressDecreaseRate;
  private progressDecreaseRateT = 0;
  private targetCurrentHoldTime = 0;
  private targetHoldTime = this.defaultTargetHoldTime;
  private targetAdjustThreshold = this.defaultTargetAdjustThreshold;
  private startBuffer = 0;
  private currentLerpSpeed = this.targetLerpSpeed;
  private decayRateScale = 0;
  private largeSwingCooldown = this.defaultLargeSwingCooldown;
  private largeSwingThreshold = this.defaultLargeSwingThreshold;
  private barAtMax = false;
  private shovelLevel: number = 0;
  private rarityBarInitialScale = Vec3.zero;
  private inTargetStartTimestampMs: number = 0;
  private hideDamageVisualOnComplete: boolean = false; // When damage animation is done, hide the visuals
  private defaultShovelPosition: Vec3 = new Vec3(-0.002289, 1.999998, 0.100708);
  private defaultShovelRotation: Quaternion = Quaternion.fromEuler(new Vec3(352.5, 180, 0));
  private digEndShovelRotation: Quaternion = Quaternion.fromEuler(new Vec3(352.5, 180, 40));
  private defaultDamageNumberPosition: Vec3 = new Vec3(1.399994, -0.500011, -0.59967);
  private defaultShovelTargetScale: Vec3 = new Vec3(6.300006, 2.000002, 0.600001);
  private defaultTargetGradientScale: Vec3 = new Vec3(6.300006, 0.600001, 2.000002);
  private defaultTreasureHex: string = "#FFFFFF";

  private test_difficultyLevel = 5;

  private set tooltipText(text: string) {
    this.tooltip.text.set(text);
    this.tooltipShadow.text.set(text);
  }

  private set damageText(text: string) {
    this.damageValue.text.set(text);
    this.damageValueShadow.text.set(text);
  }

  constructor(digMinigame: DigMinigame, root: Entity) {
    super(digMinigame, root);

    this.tooltip = this.props.tooltip!.as(TextGizmo);
    this.tooltipShadow = this.props.tooltipShadow!.as(TextGizmo);
    this.damageValue = this.props.phase2DamageText!.as(TextGizmo);
    this.damageValueShadow = this.props.phase2DamageTextShadow!.as(TextGizmo);
    this.dirtBurstPfx = this.props.dirtBurstPfx!.as(ParticleGizmo);
    this.digImpactPfx = this.props.phase2DigImpactFx!.as(ParticleGizmo);
    this.rarityBarInitialScale = this.props.rarityBarRoot!.transform.localScale.get();
    this.onFocusInteractionCallback = this.onFocusInteraction;

    // digMinigame.connectNetworkBroadcastEvent(Events.debugAction1, player => {
    //   if (player !== this.world.getLocalPlayer()) {
    //     return;
    //   }
    //   this.test_difficultyLevel = Math.max(0, this.test_difficultyLevel - 1);
    //   digMinigame.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, { player, text: "Difficulty: " + this.test_difficultyLevel }, [player]);
    // });

    // digMinigame.connectNetworkBroadcastEvent(Events.debugAction2, player => {
    //   if (player !== this.world.getLocalPlayer()) {
    //     return;
    //   }
    //   this.test_difficultyLevel = Math.min(10, this.test_difficultyLevel + 1);
    //   digMinigame.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, { player, text: "Difficulty: " + this.test_difficultyLevel }, [player]);
    // });
  }

  public init() {
    super.init();

    if (this.digMinigame.isTutorialComplete) {
      this.setTutorialCompleted();
    }

    this.enableContinueButton = false;
    this.startBuffer = this.startBufferDefault;

    // if (DigMinigame.FAST_DIG) {
    //   this.digMinigame.sendLocalBroadcastEvent(Events.localHideHUD, { context: hudHideContext, exclude: HUDElementType.DigMinigameUsefulWidget });
    // }


    this.shovelLevel = 0;
    if (this.digMinigame.equippedShovelData != undefined) {
      this.shovelLevel = Shovel.getLevel(this.digMinigame.equippedShovelData.id);
    } else {
      log.error("DigMinigame: Invalid shovel data on init minigame.");
    }
    let itemHealth = 1;
    // Apply the current item data
    if (this.itemData !== null) {
      itemHealth = 27 + this.itemData.health * .1;
    } else {
      log.error("DigMinigame: Invalid item data on init minigame.");
    }

    // Value [0, 10] where 0 means it's the easiest and 10 means it's the hardest
    //const difficultyValue = this.test_difficultyLevel;
    const difficultyValue = this.getDifficultyLevel(this.shovelLevel, this.digMinigame.zoneLevel, this.itemRarity);
    const islandMultiplier = getIslandDigDifficulty(this.digMinigame.island) ?? 1;
    const zoneMultiplier = this.digMinigame.zoneDifficultyMultiplier;
    const difficultyMultiplier = this.getDifficultyMultiplier(difficultyValue * islandMultiplier * zoneMultiplier);

    // Some values bias even easier if they're a lower difficulty than the current shovel
    const difficultyMultiplierEasyBias = Math.min(difficultyMultiplier * difficultyMultiplier, difficultyMultiplier);
    const shovelStarStep = 5; // Number of stars for each rarity to feel as easy Common Rarity
    const raritySpeedMultiplier = 0.25;
    const shovelTimeStep = 1 + Math.max(0, (this.itemRarity + 1) - (this.shovelLevel + 1) / shovelStarStep) * raritySpeedMultiplier; // Larger number increases how long this will take to dig
    this.damageText = `x${this.shovelLevel + 1}`;

    this.digMinigame.sendNetworkBroadcastEvent(AnalyticsManager.clientLogToServer, { player: this.digMinigame.owner, log_type: LogType.TASK_START, taskKey: 'dig', taskType: `${this.digMinigame.equippedShovelData!.id},${this.shovelLevel + 1},${this.digMinigame.zoneLevel},${this.itemRarity}` }, [this.world.getServerPlayer()]);

    this.shovelStrength01 = this.defaultStrength / (itemHealth * difficultyMultiplier * shovelTimeStep);
    log.debug(`shovelStrength01: ${this.shovelStrength01}\nshovelTimeStep: ${shovelTimeStep}\nitemHealth: ${itemHealth}\ndifficultyMultiplier: ${difficultyMultiplier}`);
    this.targetHealth = this.defaultTargetHealth;
    this.targetWidth = this.defaultBarWidth / difficultyMultiplier;
    this.barResponsiveness = this.defaultBarResponsiveness / difficultyMultiplier;
    this.maxBarSpeed = this.defaultBarSpeed;
    this.targetSpeed = this.defaultTargetSpeed * difficultyMultiplier;
    this.targetLerpSpeed = this.defaultTargetLerpSpeed * difficultyMultiplier;
    this.targetAdjustThreshold = this.defaultTargetAdjustThreshold * difficultyMultiplier;
    this.targetHoldTime = this.defaultTargetHoldTime / difficultyMultiplierEasyBias;
    log.info(`Decrease Rate: ${this.defaultProgressDecreaseRate * difficultyMultiplier} (Difficulty Mod ${difficultyMultiplier})`);
    this.progressDecreaseRateMax = this.defaultProgressDecreaseRate * Math.min(difficultyMultiplier, 1); // Can get easier, but not harder
    this.initDecreaseRates();
    this.decayRateScaleIncreaseSpeed = this.defaultDecayRateScaleIncreaseSpeed;// * difficultyMultiplier;
    this.largeSwingCooldown = this.defaultLargeSwingCooldown / difficultyMultiplierEasyBias;
    this.largeSwingThreshold = 1 - this.defaultLargeSwingThreshold / difficultyMultiplier;
    this.maxMoveDistance = 1 - (1 - this.startingDistanceAmount) / difficultyMultiplier;

    // log.info("DigMinigame Values:\n" +
    //   `difficultyMultiplier: ${difficultyMultiplier}\n` +
    //   `targetHealth: ${this.targetHealth}\n` +
    //   `shovelStrength01: ${this.shovelStrength01}\n` +
    //   `targetWidth: ${this.targetWidth}\n` +
    //   `maxMoveDistance: ${this.maxMoveDistance}\n` +
    //   `targetLerpSpeed: ${this.targetLerpSpeed}\n` +
    //   `targetAdjustThreshold: ${this.targetAdjustThreshold}\n` +
    //   `targetHoldTime: ${this.targetHoldTime}\n` +
    //   `largeSwingCooldown: ${this.largeSwingCooldown}\n` +
    //   `largeSwingThreshold: ${this.largeSwingThreshold}\n` +
    //   `barResponsiveness: ${this.barResponsiveness}\n` +
    //   `progressDecreaseRate: ${this.progressDecreaseRate}\n` +
    //   `decayRateScaleIncreaseSpeed: ${this.decayRateScaleIncreaseSpeed}\n`);

    this.currentBarVelocity = 0;
    this.nearBreaking01 = 0;
    this.digAnimCount = 0;
    this.decayRateScale = 0;

    // Setup moving values
    const targetHalfWidth = this.targetWidth * 0.5;
    this.targetValue = clamp(this.startingTargetValue, targetHalfWidth, 1 - targetHalfWidth); // Within 0 to 1 - targetWidth
    this.barValue = this.tutorialComplete ? this.startingBarValue : this.tutorialBarValue;
    this.progressValue = this.startingProgressValue;
    this.targetCurrentHoldTime = 0; // Always clear the hold to start
    this.lastBarOnTarget = false;
    this.currentLerpSpeed = this.targetLerpSpeed;
    this.largeSwingCooldownTimer = this.largeSwingCooldown;
    this.setNextTargetValue(0);

    // Set the target bar
    let targetBarFullWidth = 3.88; // This number times the bar width = 100% full
    let targetBarCurrentMult = this.targetWidth * targetBarFullWidth; // How much of the bar is full when scale is 1
    this.props.targetBar!.scale.set(new Vec3(targetBarCurrentMult, 1, 1));

    // Start with the bright color as we start out in the target zone
    //this.props.backgroundBar?.color.set(ItemUtils.hexToColor(ItemUtils.RARITY_HEX_COLORS[this.itemRarity]));

    // Refresh all the visuals to the starting values
    this.refreshTargetArea();
    this.refreshBar();
    this.refreshProgressBar();
    this.props.phase2Root!.transform.localPosition.set(new Vec3(0, this.minigameStartOffsetY, 0));
    this.props.phase2PlayerShovel!.transform.localPosition.set(this.defaultShovelPosition);
    this.props.phase2DamageRoot!.visible.set(false);
    this.props.phase2ShovelTarget!.transform.localScale.set(new Vec3(0.01, 0.01, 0.01));
    this.props.phase2CircleGradient!.transform.localScale.set(this.defaultTargetGradientScale);
    this.props.cursorTreasure!.color.set(ItemUtils.hexToColor(this.defaultTreasureHex));

    // Tooltip
    this.tooltipText = this.defaultTooltip;

    // Lerp in the main panel
    this.moveInMinigame();
    // const playRate = 1;
    // const callback = this.pryingAnimationCallback();
    // this.owner.playAvatarAnimation(this.props.anim_prying_enter!, { playRate, callback });
  }

  private getDifficultyLevel(shovelLevel: number, zoneLevel: number, rarity: number): number {
    log.info(`ShovelLevel: ${shovelLevel}  zoneLevel: ${zoneLevel}  rarity: ${rarity}`);
    const shovelLevelIndex = clamp(zoneLevel - shovelLevel + SHOVEL_LEVEL_DIFFICULTY_RANGE, 0, SHOVEL_LEVEL_DIFFICULTY_RANGE * 2);
    rarity = Math.floor(clamp(rarity, 0, 5));
    const result = LEVEL_RARITY_TO_DIFFICULTY_TABLE[rarity][shovelLevelIndex];
    log.info(`shovelLevelIndex: ${shovelLevelIndex}  result: ${result}`);
    return result;
  }

  private getDifficultyMultiplier(difficultyLevel: number): number {
    difficultyLevel = clamp(difficultyLevel, 0, 10);
    const index = Math.floor(difficultyLevel);
    const t = difficultyLevel - index;
    const lastIndex = DIFFICULTY_LEVEL_TUNING.length - 1;
    if (index === lastIndex) {
      return DIFFICULTY_LEVEL_TUNING[lastIndex]
    }
    return lerp(DIFFICULTY_LEVEL_TUNING[index], DIFFICULTY_LEVEL_TUNING[index + 1], t);
  }

  private initDecreaseRates() {
    this.progressDecreaseRateMin = this.progressDecreaseRateMax * 0.1; // Decrease rate starts suuuper slow!!
    this.progressDecreaseRateT = 0;
  }

  private onFocusInteraction(payload: { interactionInfo: InteractionInfo[]; }): boolean {
    let inputEaten = false;
    if (this.continueButtonEnabled) {
      for (let i = 0; i < payload.interactionInfo.length; i++) {
        const interactionInfo = payload.interactionInfo[i];
        const raycastHitInfo = this.digMinigame.raycast.raycast(interactionInfo.worldRayOrigin, interactionInfo.worldRayDirection, { layerType: LayerType.Objects, maxDistance: 100, }) as any;
        if (!raycastHitInfo) {
          continue;
        }
        if (raycastHitInfo.target == this.props.continueButton) {
          inputEaten = true; // Yummy!!
          this.continueButtonPressed();
        }
      }
    }

    return inputEaten;
  }

  public onClickDown(value: boolean) {
    this.startBuffer = 0; // Clear the start buffer to force the minigame to run
    this.barAnimDirty = true;
  }

  public cancel() {
    this.minigameRunning = false;
    // TODO(BI): only fire dig abandon log below when user X's out of dig, not if dig progress falls to 0
    // this.digMinigame.sendNetworkBroadcastEvent(AnalyticsManager.clientLogToServer, {player: this.digMinigame.owner, log_type: LogType.TASK_END, taskKey: 'dig', taskType: `${this.digMinigame.equippedShovelData!.id},${Shovel.getLevel(this.digMinigame.equippedShovelData!.id) + 1},${this.digMinigame.zoneLevel},${this.itemRarity},abandon`}, [this.world.getServerPlayer()]);
    this.digMinigame.sendLocalBroadcastEvent(UIView_Minigame.hideMinigameUI, {});
  }

  ////////////////////////////////////////////////////////////////
  // TUTORIAL START
  ////////////////////////////////////////////////////////////////

  private tutorialText: string[] = [
    "Welcome to the digging tutorial!",
    "Your shovel moves LEFT automatically.",
    "Press and hold anywhere to move your shovel RIGHT!",
    "Gain progress by keeping the yellow ring around the treasure",
    "Release to move your shovel LEFT.",
    "Press and hold anywhere to move your shovel RIGHT.",
    this.defaultTooltip,
  ];

  private continueButtonEnabled: boolean = false;
  private tutorialProgress: number = 0;
  private tutorialBarFallTeach: number = 1;
  private tutorialBarControlTeach: number = 2;
  private tutorialBarStart: number = 3;
  private tutorialCursorStart: number = 4;
  private tutorialCursorEnd: number = 5;
  private desiredCursorValue: number = 0.5;
  private continue: boolean = false;
  private readonly tutorialProgressMax: number = this.tutorialText.length;
  private get tutorialComplete() { return this.tutorialProgress >= this.tutorialProgressMax };

  private setTutorialCompleted() {
    log.info("[Minigame] setting tutorial completed to " + this.tutorialProgressMax)
    this.tutorialProgress = this.tutorialProgressMax;
  }

  private set enableContinueButton(value: boolean) {
    this.continueButtonEnabled = value;

    if (value) {
      this.props.continueButton!.color.set(ItemUtils.hexToColor(this.continueButtonDefaultColor));
      this.props.continueButtonRoot!.visible.set(true);
      this.props.continueButtonRoot!.collidable.set(true);
    }
    else {
      this.props.continueButtonRoot!.visible.set(false);
      this.props.continueButtonRoot!.collidable.set(false);
    }
  }

  private get canMoveBar() {
    // Can only move the bar right if the tutorial is complete
    return this.tutorialComplete || this.tutorialProgress > this.tutorialBarFallTeach;
  }

  private get canProgressDecrease() {
    // Only reduce the digging progress if the tutorial is complete and there's a decrease rate
    return (this.tutorialComplete /*|| this.tutorialProgress > this.tutorialBarControlTeach*/) && this.progressDecreaseRateMax > 0;
  }

  private get canMoveCursor() {
    // Should not move the cursor until the player has learned to move
    return this.tutorialComplete || this.tutorialProgress >= this.tutorialCursorStart;
  }

  private get canRandomlySelectTargetValue() {
    // Once tutorial cursor has done the initial scripted movement, it can move freely
    return this.tutorialComplete || this.tutorialProgress > this.tutorialCursorEnd;
  }

  private continueButtonPressed() {
    this.props.continueButton!.color.set(ItemUtils.hexToColor(this.continueButtonSelectedColor));

    this.async.setTimeout(() => {
      this.continue = true;
      this.enableContinueButton = false;
    }, 10);
  }

  private tutorialNext() {
    this.tutorialProgress++;
    if (this.tutorialProgress >= this.tutorialProgressMax) {
      // Tutorial done!
      this.setTutorialCompleted();
      this.initDecreaseRates();
    }
    else if (this.tutorialProgress == this.tutorialProgressMax - 1) {
      // Start moving the digging area
      this.diggingAreaMovementStart();
    }
  }

  private async tutorialStart() {
    // Always start the tutorial from the beginning
    this.tutorialProgress = 0;
    this.shovelStrength01 *= 0.75; // During tutorial, players gain progress slower in order to learn
    this.continue = false;

    while (this.tutorialProgress < this.tutorialProgressMax) {
      if (this.tutorialProgress == this.tutorialBarFallTeach) {
        // If click is already down, tell use to release it
        if (this.clickDown) {
          this.tooltipText = "Now, stop pressing";
          while (this.clickDown) {
            await this.wait(10);
          }
        }
        this.minigameStart();

        // Make the user press the continue button
        this.continue = false;
      }

      this.tooltipText = this.tutorialText[this.tutorialProgress];

      if (!this.continue) {
        // Arbitrary wait time to allow the user to read the text
        await this.wait(1500);

        // Show the continue button and wait until it's pressed
        this.enableContinueButton = true;
        while (!this.continue) {
          await this.wait(10);
        }
      }
      else if (this.tutorialProgress == this.tutorialBarControlTeach) {
        // If click is already down, wait for it to be released
        while (this.clickDown) {
          await this.wait(10);
        }
        // Wait for the user to click down
        while (!this.clickDown) {
          await this.wait(10);
        }
        // Wait for the bar to go a certain distance before continuing the tutorial
        while (!this.lastBarOnTarget) {
          await this.wait(10);
        }
      }
      else if (this.tutorialProgress == this.tutorialBarStart) {
        // Wait for the user to complete their 1st dig
        while (this.progressValue < this.startingProgressValue) {
          await this.wait(10);
        }
      }
      else if (this.tutorialProgress == this.tutorialCursorStart) {
        const lastProgress = this.progressValue;
        this.desiredCursorValue = 0.1;

        // Wait for the user to complete this dig
        while (this.progressValue <= lastProgress) {
          await this.wait(10);
        }

        // Force the target to move immediately
        this.targetCurrentHoldTime = Number.EPSILON;
      }
      else if (this.tutorialProgress == this.tutorialCursorEnd) {
        const lastProgress = this.progressValue;
        this.desiredCursorValue = 0.9;

        // Wait for the user to complete this dig
        while (this.progressValue <= lastProgress) {
          await this.wait(10);
        }

        // Force the target to move immediately
        this.targetCurrentHoldTime = Number.EPSILON;
      }
      else {
        // Wait for the user to read the text
        await this.wait(3500);
      }

      this.tutorialNext();
    }

    if (!this.minigameRunning) {
      // Continue the minigame like normal
      this.minigameStart();
    }
  }

  ////////////////////////////////////////////////////////////////
  // TUTORIAL END
  ////////////////////////////////////////////////////////////////

  private readonly minigameStartOffsetY = 10.5;
  private readonly minigameDefaultOffsetY = 1.75;
  private readonly moveInOutTime = 0.25;

  private phase0OffsetY: number = 0;

  private wait(ms: number) {
    return new Promise(resolve => {
      this.async.setTimeout(() => resolve(true), ms);
    });
  }

  private async moveInMinigame() {
    this.minigameRunning = false;
    this.phase0OffsetY = this.minigameStartOffsetY;
    this.props.phase2Root?.visible.set(false); // Start invisible

    this.digMinigame.sendLocalBroadcastEvent(Events.usePotionsForMinigame, { flyToBottom: this.digMinigame.hasShinySpotItem });
    const potionCount = this.digMinigame.selectedPotions?.length ?? 0;
    const addedDelay = potionCount > 0 ? 400 : 100;
    await this.wait(GameConstants.Minigame.PotionActivationDelay * potionCount + addedDelay);
    if (!this.digMinigame.isRunning()) return;
    const initialWidth = this.digMinigame.hasShinySpotItem ? this.rarityBarInitialScale.x : 0;
    await this.animateRarity(initialWidth);
    await this.wait(400);
    if (!this.digMinigame.isRunning()) return;

    //this.digMinigame.flyLuckToBottom(this.getXForRarity(this.itemRarity));

    this.digMinigame.sendLocalBroadcastEvent(Events.localHideHUD, { context: hudHideContext, exclude: HUDElementType.Location });
    // Wait a short period for zoom-in & exclaimation to occur
    await this.wait(800);
    if (!this.digMinigame.isRunning()) return;

    const startTime = Date.now();
    AudioBank.play('minigame_digBarReveal');
    this.props.phase2Root?.visible.set(true);
    while (this.phase0OffsetY > this.minigameDefaultOffsetY) {
      let currentTime = Date.now();
      let timeElapsed = (currentTime - startTime) * 0.001; // Convert to seconds
      const t01 = clamp01(timeElapsed / this.moveInOutTime);
      this.phase0OffsetY = lerp(this.minigameStartOffsetY, this.minigameDefaultOffsetY, t01);
      this.props.phase2Root!.transform.localPosition.set(new Vec3(0, this.phase0OffsetY, 0));
      await this.wait(16); // wait 16ms (approximately 60fps)
    }
    if (!this.digMinigame.isRunning()) return;

    // Now the games may begin
    if (this.tutorialComplete) {
      this.minigameStart();
    }
    else {
      this.tutorialStart();
    }
  }

  private async animateRarity(initialWidth: number): Promise<void> {
    const hasShinySpotItem = this.digMinigame.hasShinySpotItem;
    let offset = 0;
    let chanceResultRootInitialPosition = Vec3.zero;
    if (!hasShinySpotItem) {
      this.props.chanceResultRoot!.visible.set(true);
      chanceResultRootInitialPosition = new Vec3(2, this.digMinigame.bottomYPosition, 0);
      offset = MINIGAME_RARITY_X_OFFSET[this.itemRarity];
    } else {
      chanceResultRootInitialPosition = this.props.chanceResultRoot!.transform.localPosition.get();
      offset = MINIGAME_RARITY_X_OFFSET_WITH_ITEM[this.itemRarity];
    }
    const rarityWidthIncreaseDuration = .2;
    const targetBarWidth = initialWidth + MINIGAME_RARITY_BAR_WIDTHS[this.itemRarity];
    let startTime = Date.now();
    let width = initialWidth;

    //console.log(`initialWidth: ${initialWidth}  targetBarWidth: ${targetBarWidth}  offset: ${offset}`);
    while (width < targetBarWidth) {
      let timeElapsed = (Date.now() - startTime) * 0.001; // Convert to seconds
      const t01 = clamp01(timeElapsed / rarityWidthIncreaseDuration);
      width = lerp(initialWidth, targetBarWidth, t01);
      this.props.rarityBarRoot!.transform.localScale.set(new Vec3(width, this.rarityBarInitialScale.y, this.rarityBarInitialScale.z));
      this.props.chanceResultRoot!.transform.localPosition.set(chanceResultRootInitialPosition.add(new Vec3(offset * t01, 0, 0)));
      if (this.digMinigame.hasShinySpotItem) {
        this.props.rarityArrow!.transform.localScale.set(new Vec3(t01, 1, 1));
      }
      await this.wait(16); // wait 16ms (approximately 60fps)
    }

    if (!this.props.rarityResultText) {
      return;
    }
    this.digMinigame.alert();

    const targetScale = 1;
    const rarityScaleIncreaseDuration = .25;
    let scale = 0;
    startTime = Date.now();
    while (scale < targetScale) {
      let timeElapsed = (Date.now() - startTime) * 0.001; // Convert to seconds
      const t01 = clamp01(timeElapsed / rarityScaleIncreaseDuration);
      scale = lerp(0, targetScale, t01);
      this.digMinigame.setRarityResultScale(scale);
      await this.wait(16); // wait 16ms (approximately 60fps)
    }
  }

  private async moveOutMinigame(isSuccess: boolean) {
    this.phase0OffsetY = this.minigameDefaultOffsetY;

    const startTime = Date.now();

    while (this.phase0OffsetY < this.minigameStartOffsetY) {
      let currentTime = Date.now();
      let timeElapsed = (currentTime - startTime) * 0.001; // Convert to seconds
      const t01 = clamp01(timeElapsed / this.moveInOutTime);
      this.phase0OffsetY = lerp(this.minigameDefaultOffsetY, this.minigameStartOffsetY, t01);
      this.props.phase2Root!.transform.localPosition.set(new Vec3(0, this.phase0OffsetY, 0));
      await this.wait(16); // wait 16ms (approximately 60fps)
    }

    this.digMinigame.onComplete(isSuccess);
  }

  public reset() {
    this.props.rarityBarRoot!.transform.localScale.set(this.rarityBarInitialScale);
    const rarityBarPosition = this.props.rarityBar?.transform.localPosition.get() ?? new Vec3(0, 0, 0);
    this.props.rarityBar?.transform.localPosition.set(new Vec3(rarityBarPosition.x, 0, rarityBarPosition.z));
    this.props.rarityArrow?.transform.localScale.set(new Vec3(0, 1, 1));
  }

  // Kick off the initial animations for the minigame
  private minigameStart() {
    // Start diggin animation
    //if (this.props.digReadyAnim !== undefined) {
    //  this.owner.playAvatarAnimation(this.props.digReadyAnim, { looping: false, playRate: 1 });
    //}
    //this.digMinigame.sendLocalBroadcastEvent(UIView_Minigame.showMinigameUI, { shovelLevel: this.shovelLevel + 1, zoneLevel: this.digMinigame.zoneLevel });
    if (this.tutorialComplete) {
      this.async.setTimeout(() => {
        AudioBank.play('minigame_digPhaseStart');
        this.async.setTimeout(() => {
          this.diggingAreaMovementStart();
          this.minigameRunning = true;
          this.playPryAudioLoop(0);
        }, 300);
      }, 500);
    } else {
      this.minigameRunning = true;
      this.playPryAudioLoop(0);
    }
  }

  private diggingAreaMovementStart() {
    // Kick off initial movement for the target bar
    if (Math.random() > .5) {
      this.setNextTargetValue(1 - this.targetWidth * 0.5); // go to end of slider
    } else {
      this.setNextTargetValue(this.targetWidth * 0.5); // go to beginning of slider
    }
  }

  private dig() {
    if (this.props.anim_attack_dig == null) {
      log.error("DigMinigame Null Animation!");
    } else {
      //log.info("DigMinigame Play Animation!");
      this.digAnimCount++;
      const digAnimCount = this.digAnimCount;
      this.owner.playAvatarAnimation(this.props.anim_attack_fast_dig!, { playRate: 1, fadeOutDuration: this.idleFadeInDuration });
      //this.owner.playAvatarAnimation(this.props.anim_prying_loop!, { playRate: 4, fadeInDuration: .2, fadeOutDuration: .2 });
      AudioBank.play('minigame_prying');
      this.async.setTimeout(() => {
        if (this.digAnimCount === digAnimCount && this.minigameRunning) {
          this.owner.playAvatarAnimation(this.props.anim_prying_loop!, { looping: true, fadeInDuration: .2, fadeOutDuration: .2 });
          this.playPryAudioLoop(digAnimCount);
        }
      }, 800);
    }

    if (this.groundDustFx !== null) {
      this.groundDustFx.position.set(PlayerService.getPlayerFootPosition(this.owner));
      this.groundDustFx.play();
    }
  }

  private playPryAudioLoop(digAnimCount: number) {
    if (this.digAnimCount === digAnimCount && this.minigameRunning) {
      AudioBank.play('minigame_prying');
      this.async.setTimeout(() => {
        this.playPryAudioLoop(digAnimCount);
      }, this.pryLoopDuration);
    }
  }


  private playFlingOutAnimation() {
    const playRate = 1;
    this.owner.playAvatarAnimation(this.props.anim_fling_out!, { playRate });
    AudioBank.play('minigame_prying');
  }

  // Minigame funished!
  private minigameComplete(isSuccess: boolean) {
    this.minigameRunning = false;
    this.hideDamageVisualOnComplete = true;
    this.digMinigame.sendLocalBroadcastEvent(UIView_Minigame.hideMinigameUI, {});
    //this.digMinigame.sendLocalBroadcastEvent(Events.localShowHUD, { context: hudHideContext });
    if (isSuccess) {
      this.playFlingOutAnimation();
      this.digMinigame.sendNetworkBroadcastEvent(AnalyticsManager.clientLogToServer, { player: this.digMinigame.owner, log_type: LogType.TASK_END, taskKey: 'dig', taskType: `${this.digMinigame.equippedShovelData!.id},${Shovel.getLevel(this.digMinigame.equippedShovelData!.id) + 1},${this.digMinigame.zoneLevel},${this.itemRarity},success` }, [this.world.getServerPlayer()]);
    } else {
      this.digMinigame.sendNetworkBroadcastEvent(AnalyticsManager.clientLogToServer, { player: this.digMinigame.owner, log_type: LogType.TASK_END, taskKey: 'dig', taskType: `${this.digMinigame.equippedShovelData!.id},${Shovel.getLevel(this.digMinigame.equippedShovelData!.id) + 1},${this.digMinigame.zoneLevel},${this.itemRarity},fail` }, [this.world.getServerPlayer()]);
      this.digMinigame.sendNetworkBroadcastEvent(AnalyticsManager.clientLogToServer, { player: this.digMinigame.owner, log_type: LogType.FRICTION_HIT, frictionItemKey: 'dig' }, [this.world.getServerPlayer()]);
    }

    // Lerp outta here
    this.moveOutMinigame(isSuccess);
  }

  // Utility: sleep for given milliseconds
  private sleep(ms: number): Promise<boolean> {
    return new Promise(resolve => this.async.setTimeout(() => resolve(true), ms));
  }

  // Utility: Ugly function to get a value between 1 and 0, but with a smooth start and end
  private getCos10(t: number, freq: number, max: number = Math.PI): number {
    return (Math.cos(Math.min(t * freq * Math.PI, max)) + 1) * 0.5;
  }

  // Utility: Inverse of ugly function to get a value between 0 and 1, but with a smooth start and end
  private getCosInverse01(t: number, freq: number, max: number = Math.PI): number {
    return 1 - this.getCos10(t, freq, max);
  }

  private numberAnimateSparksRunning: number = 0;
  private get animateSparkRunning() { return this.numberAnimateSparksRunning > 0; }

  // Main function to animate the spark arc
  private async animateSpark() {
    this.numberAnimateSparksRunning++;
    this.props.phase2DamageRoot!.visible.set(true);
    this.hideDamageVisualOnComplete = false;
    let position = this.props.phase2DamageRoot!.transform.localPosition.get(); // Get the current position
    position.x = this.defaultDamageNumberPosition.x;
    position.y = this.defaultDamageNumberPosition.y;
    position.z = this.defaultDamageNumberPosition.z;

    // All in seconds
    const totalDuration = 1;
    const speedX = 0.5;
    const initialVelY = 2.5;
    const gravity = -9.8;

    let startTime = Date.now() / 1000; // Convert to seconds
    let lastTime = startTime;
    let velocityY = initialVelY;

    while (true) {
      const currentTime = Date.now() / 1000; // Convert to seconds
      const delta = currentTime - lastTime;
      const elapsed = currentTime - startTime;

      if (elapsed > totalDuration) {
        break;
      }

      // Apply motion
      position.x += speedX * delta;
      position.y += velocityY * delta;
      velocityY += gravity * delta;

      this.props.phase2DamageRoot!.transform.localPosition.set(position);

      let progress01 = elapsed / totalDuration;

      // AOE blast gradient effect
      const maxGradientScaleMul = 50;
      let gradientScale: Vec3 = new Vec3(
        this.defaultTargetGradientScale.x,
        this.defaultTargetGradientScale.y * lerp(1, maxGradientScaleMul, this.getCosInverse01(progress01, 4, 2 * Math.PI)),
        this.defaultTargetGradientScale.z
      );
      this.props.phase2CircleGradient!.transform.localScale.set(gradientScale);

      // Flash that chest
      let chestColor: Color = ItemUtils.hexToColor(ItemUtils.interpolateHexColors(this.defaultTreasureHex, "#00D500", this.getCosInverse01(progress01, 4, 2 * Math.PI)));
      this.props.cursorTreasure!.color.set(chestColor);

      // This "if" check is a hack to make it not snap from increase Progress also touching position later
      if (progress01 < 0.5) {
        // Move up shovel like it's moving dirt
        let shovelPosition: Vec3 = new Vec3(
          this.defaultShovelPosition.x - this.shovelDigHorizontal * this.getCosInverse01(progress01, 4, 2 * Math.PI), // Dig left, then back
          this.defaultShovelPosition.y - this.shovelDigDepth * this.getCos10(progress01, 2),
          this.defaultShovelPosition.z
        );
        this.props.phase2PlayerShovel!.transform.localPosition.set(shovelPosition);

        // Rotate shovel up like digging
        this.props.phase2PlayerShovel!.transform.localRotation.set(Quaternion.slerp(
          this.defaultShovelRotation,
          this.digEndShovelRotation,
          this.getCosInverse01(progress01, 4, 2 * Math.PI) // Rotate up, then back down
        ));
      }

      lastTime = currentTime;
      await this.sleep(16); // wait 16ms (approximately 60fps)
    }

    // If the shovel is no longer on the target, everything should go back to their defaults
    if (this.hideDamageVisualOnComplete) {
      this.props.phase2DamageRoot!.visible.set(false);
      this.props.phase2PlayerShovel!.transform.localPosition.set(this.defaultShovelPosition);
      this.props.phase2PlayerShovel!.transform.localRotation.set(this.defaultShovelRotation);
    }

    this.numberAnimateSparksRunning--;
  }

  /**
   * Progress go up
   */
  private increaseProgress(deltaTime: number) {
    const cameraZoomOffset = 5; // In degrees for FOV

    // Bob the damage number
    //const inTargetDuration = (Date.now() - this.inTargetStartTimestampMs) * 0.001; // Converted Ms to Seconds
    //const bobbingFreq = 2; // Number of wabbles per Second
    //this.props.phase2DamageRoot!.transform.localPosition.set(new Vec3(0, -1.7 + 0.1 * Math.sin(inTargetDuration * bobbingFreq * Math.PI), 0));

    this.targetHealth -= deltaTime;
    this.nearBreaking01 = (this.defaultTargetHealth - this.targetHealth) / this.defaultTargetHealth;
    //LocalCamera.overrideCameraFOV(this.digMinigame.intenseZoomFOV + this.nearBreaking01 * cameraZoomOffset);

    // Progress in GREEN
    let color: Color = ItemUtils.hexToColor(ItemUtils.interpolateHexColors("#f1f3d5", "#32f332", this.nearBreaking01));
    this.props.progressBar!.color.set(color);

    // Lower the shovel as the player gets closer to digging
    if (!this.animateSparkRunning) {
      let shovelPosition: Vec3 = new Vec3(
        this.defaultShovelPosition.x,
        this.defaultShovelPosition.y - this.shovelDigDepth * this.nearBreaking01,
        this.defaultShovelPosition.z,
      );
      this.props.phase2PlayerShovel!.transform.localPosition.set(shovelPosition);
    }
    // Hacky thing since when the dig is running, we don't want to interrup the shovel moving up to dig
    else if (this.nearBreaking01 > 0.5) {
      let shovelPosition: Vec3 = new Vec3(
        this.defaultShovelPosition.x,
        this.defaultShovelPosition.y - this.shovelDigDepth * ((this.nearBreaking01 - 0.5) / 0.5),
        this.defaultShovelPosition.z,
      );
      this.props.phase2PlayerShovel!.transform.localPosition.set(shovelPosition);
    }

    // Scale up target as player is about to break the rock
    this.props.phase2ShovelTarget!.transform.localScale.set(Vec3.lerp(
      new Vec3(0.01, 0.01, 0.01),
      this.defaultShovelTargetScale,
      this.nearBreaking01
    ));

    // Swing the cursor
    const shovelZ: number = 20;
    this.props.cursorTreasure!.transform.localRotation.set(Quaternion.fromEuler(
      new Vec3(0, 0, shovelZ * Math.sin(this.nearBreaking01 * Math.PI * 4))
    ));
    //this.dirtBurstPfx.position.set(this.owner.torso.getPosition(Space.World));

    // SFX
    if (!this.digMinigame.hasPlayedNearBreakingSfx && this.nearBreaking01 >= 0.5) {
      AudioBank.play('minigame_nearBreak');
      this.digMinigame.hasPlayedNearBreakingSfx = true;
    }

    // Wabble the target bar as needed
    //let inTargetDuration = (Date.now() - this.inTargetStartTimestampMs) * 0.001; // Converted Ms to Seconds
    //const rotationAmount = 5;
    //const freq = 20; // Number of wabbles per Second
    //const amplitude = this.nearBreaking01 * this.nearBreaking01 * rotationAmount; // How big the wabble is gets bigger as we get closer to breaking
    //const wabbleRotationZ = Math.sin(inTargetDuration * freq) * amplitude;
    //this.props.targetBar!.transform.localRotation.set(Quaternion.fromEuler(new Vec3(0, 0, wabbleRotationZ)));

    this.decayRateScale = 0;

    if (this.targetHealth <= 0 || this.progressValue >= 1) {
      // We broke thine rock!
      this.digMinigame.hasPlayedNearBreakingSfx = false;

      // Increase progress toward full completion
      this.progressValue = Math.min(1, this.progressValue + this.shovelStrength01);
      this.damageText = `+${Math.round(100 * this.shovelStrength01)}`;
      this.animateSpark();

      // Reset the rock health
      this.targetHealth = this.defaultTargetHealth;
      this.nearBreaking01 = 0;
      //this.dirtBurstPfx.position.set(this.props.cursorTreasure!.position.get());
      let targetBarPosition = this.props.targetBar!.position.get();
      let targetBarOffset = this.props.phase2PlayerShovel!.forward.get().mul(-0.5);
      this.dirtBurstPfx.position.set(targetBarPosition.add(targetBarOffset));
      this.dirtBurstPfx.play();
      this.digImpactPfx.position.set(targetBarPosition.add(targetBarOffset));
      this.digImpactPfx.play();
      //LocalCamera.overrideCameraFOV(this.digMinigame.intenseZoomFOV, { duration: 0.1 });

      // Break that rock
      this.digMinigame.sendLocalBroadcastEvent(Events.localPlayerDigProgress, { player: this.owner, progress01: this.progressValue });
      this.digMinigame.sendNetworkBroadcastEvent(Events.playerDigProgress, {
        player: this.owner,
        progress01: this.progressValue,
        itemId: this.itemData!.id
      }, [this.world.getServerPlayer()]);

      this.dig();

      if (this.progressValue >= 1) {
        // DONE DUG IT!
        this.minigameComplete(true);
      }
      else {
        // Wait until the dig animation finishes
        //let digAnimTime = 1.5;
        //this.async.setTimeout(() => {
        //  if (this.props.digReadyAnim !== undefined) {
        //    this.owner.playAvatarAnimation(this.props.digReadyAnim, { looping: false, playRate: 1 });
        //  }
        //}, digAnimTime * 1000);
      }
    }
  }

  private get currentProgressDecreaseRate() {
    return lerp(this.progressDecreaseRateMin, this.progressDecreaseRateMax, this.progressDecreaseRateT)
  }

  /**
   * Progress go down
   */
  private decreaseProgress(deltaTime: number) {
    const cameraZoomOffset = 5; // In degrees for FOV

    // Progress in RED
    this.props.progressBar!.color.set(ItemUtils.hexToColor("#cd5c5c"));

    if (this.decayRateScale < 1) {
      // Increase the decay speed overtime
      this.decayRateScale = Math.min(1, this.decayRateScale + deltaTime * this.decayRateScaleIncreaseSpeed);
    }
    if (this.canProgressDecrease) {
      this.progressValue = Math.max(0, this.progressValue - deltaTime * this.currentProgressDecreaseRate * this.decayRateScale);
    }

    // Straighten the target bar
    let speed = 20; // Number of wabbles per second
    let currentZ = this.props.targetBar!.transform.localRotation.get().toEuler().z;
    let wabbleRotationZ = Math.sign(currentZ) * Math.max(0, Math.abs(currentZ) - deltaTime * speed);
    this.props.targetBar!.transform.localRotation.set(Quaternion.fromEuler(new Vec3(0, 0, wabbleRotationZ)));
    this.props.cursorTreasure!.transform.localRotation.set(Quaternion.fromEuler(new Vec3(0, 0, 0)));
    if (this.progressValue <= 0) {
      // FAILED TO DIG!
      this.minigameComplete(false);
    }

    // Decay time
    this.targetHealth += deltaTime * 0.1;
    this.targetHealth = Math.min(this.defaultTargetHealth, this.targetHealth);
    this.nearBreaking01 = (this.defaultTargetHealth - this.targetHealth) / this.defaultTargetHealth;
    //LocalCamera.overrideCameraFOV(this.digMinigame.intenseZoomFOV + this.nearBreaking01 * cameraZoomOffset);
  }

  /**
   * Update the minigame
   */
  public update(deltaTime: number) {
    super.update(deltaTime);

    this.progressDecreaseRateT = Math.min(1, this.progressDecreaseRateT + deltaTime / this.timeUntilMaxDecreaseRate);

    this.updateMinigameLocation();

    if (this.startBuffer > 0) {
      // Give the player some grace before actually starting
      this.startBuffer -= deltaTime;
      return;
    }

    if (this.inFocusMode === false || this.minigameRunning === false) {
      return;
    }

    // Determine if the target is within the bar area
    const targetHalfWidth = this.targetWidth / 2;
    //let targetValueCubeMiddle = this.targetValueCube + targetHalfWidth;
    const barOnTarget = Math.abs(this.barValue - this.targetValue) <= targetHalfWidth;
    //this.props.cursor?.color.set(barOnTarget ? new Color(1, 1, 1) : new Color(1, 0, 0));

    if (barOnTarget) {
      this.increaseProgress(deltaTime);
    }
    else {
      this.decreaseProgress(deltaTime);
    }

    this.refreshProgressBar();

    if (!barOnTarget) {
      let currentPosition = this.props.phase2PlayerShovel!.transform.localPosition.get();
      // Reset shovel position
      let nextShovelPosition: Vec3 = new Vec3(
        this.defaultShovelPosition.x,
        this.defaultShovelPosition.y,
        this.defaultShovelPosition.z,
      );
      const shovelMoveSpeed = 2; // In meters per second
      let toNext = nextShovelPosition.sub(currentPosition).mul(deltaTime * shovelMoveSpeed);
      let shovelPosition: Vec3 = currentPosition.add(toNext);
      this.props.phase2PlayerShovel!.transform.localPosition.set(shovelPosition);
      this.props.phase2ShovelTarget!.transform.localScale.set(new Vec3(0.01, 0.01, 0.01));
    }

    if (this.lastBarOnTarget != barOnTarget) {
      this.lastBarOnTarget = barOnTarget;

      if (!barOnTarget) {
        // Bar is no longer on target so damage should hide when it's done
        this.hideDamageVisualOnComplete = true;
      }

      this.inTargetStartTimestampMs = Date.now();
      //this.damageTimer = 0;
    }

    const shouldMoveRight = this.clickDown && this.canMoveBar;

    this.arrowLeftScale = lerp(this.arrowLeftScale, !shouldMoveRight ? 1 : this.arrowShrinkScale, 20 * deltaTime);
    this.arrowRightScale = lerp(this.arrowRightScale, shouldMoveRight ? 1 : this.arrowShrinkScale, 20 * deltaTime);
    this.props.arrowLeft!.scale.set(new Vec3(this.arrowLeftScale, this.arrowLeftScale, this.arrowLeftScale));
    this.props.arrowRight!.scale.set(new Vec3(this.arrowRightScale, this.arrowRightScale, this.arrowRightScale));
    this.props.arrowLeft!.transform.localPosition.set(new Vec3(-this.arrowSpacing, 1 - this.arrowLeftScale - 1, 0));
    this.props.arrowRight!.transform.localPosition.set(new Vec3(this.arrowSpacing, 1 - this.arrowRightScale - 1, 0));

    // Directions switched!
    if (this.barAnimDirty) {
      this.barAnimDirty = false;

      let greyColor: Color = new Color(0.1, 0.1, 0.1);
      let whiteColor: Color = new Color(1, 1, 1);

      this.props.arrowLeft?.color.set(!shouldMoveRight
        ? whiteColor
        : GameUtils.ColorLerp(this.props.arrowLeft?.color.get(), greyColor, 1)); // TODO(kaden): make this a nice transition
      this.props.arrowRight?.color.set(shouldMoveRight
        ? whiteColor
        : GameUtils.ColorLerp(this.props.arrowRight?.color.get(), greyColor, 1)); // TODO(kaden): make this a nice transition

      this.barAtMax = false;
    }

    let responsiveness = .8  //this.barResponsiveness;
    let maxBarSpeed = 2.5 //this.maxBarSpeed;

    // Apply acceleration to move the bar toward max speed
    let direction = 0;
    if (shouldMoveRight) direction++;
    else direction--;
    let currentVelocity = this.currentBarVelocity;

    // Apply proportional acceleration
    let acceleration = responsiveness * direction;
    currentVelocity += acceleration * deltaTime;

    // Limit the speed
    this.currentBarVelocity = clamp(currentVelocity, -maxBarSpeed, maxBarSpeed);

    const bounceDamp = .4;
    const halfWidth = (this.targetWidth / 2);
    let newBarValue = this.barValue + deltaTime * this.currentBarVelocity;
    if (newBarValue < halfWidth) {
      newBarValue = halfWidth;
      this.currentBarVelocity *= -bounceDamp
    } else if (newBarValue > 1 - halfWidth) {
      newBarValue = 1 - halfWidth;
      this.currentBarVelocity *= -bounceDamp
    }

    this.barValue = clamp(newBarValue, halfWidth, 1 - halfWidth);
    if ((this.barValue >= 1 - halfWidth && shouldMoveRight) || (this.barValue <= halfWidth && !shouldMoveRight)) {
      this.barAtMax = true;
    }

    this.refreshBar();

    // Handle target area holding
    if (this.canMoveCursor) {
      if (this.largeSwingCooldownTimer > 0) {
        this.largeSwingCooldownTimer -= deltaTime;
      }
      if (this.targetCurrentHoldTime > 0) {
        this.targetCurrentHoldTime -= deltaTime;
        if (this.targetCurrentHoldTime <= 0) {
          const nextTargetValue = this.getNextTargetValue();
          this.setNextTargetValue(nextTargetValue);
          const lerpSpeedVariation = .4;
          this.currentLerpSpeed = this.targetLerpSpeed + (Math.random() - .5) * 2 * lerpSpeedVariation;
        }
      }
      if (this.targetCurrentHoldTime <= 0 && Math.abs(this.targetValue - this.nextTargetValue) < this.targetAdjustThreshold) {
        // Arrived at destination
        const targetHoldTimeVariation = 1;
        this.targetCurrentHoldTime = this.targetHoldTime * (1 + Math.random() * targetHoldTimeVariation);
      }
      this.targetValue = lerp(this.targetValue, this.nextTargetValue, deltaTime * this.currentLerpSpeed);
    }
    this.refreshTargetArea();
  }

  private getNextTargetValue(): number {
    if (this.canRandomlySelectTargetValue) {
      // Calculate a new value for the cursor to move to
      if (this.largeSwingCooldownTimer <= 0) {
        let lower = this.nextTargetValue - this.largeSwingThreshold;
        let upper = this.nextTargetValue + this.largeSwingThreshold;
        if (lower >= 0 || upper <= 1) {
          log.info("BIG SWING");
          this.largeSwingCooldownTimer = this.largeSwingCooldown;
          if (lower < 0) {
            return upper + Math.random() * (1 - upper);
          }
          if (upper > 1) {
            return Math.random() * lower;
          }
          if (Math.random() > .5) {
            return upper + Math.random() * (1 - upper);
          }
          return Math.random() * lower;
        }
        log.info("MOVING TO BIG SWING");
        if (Math.random() > .5) {
          return this.largeSwingThreshold + Math.random() * (1 - this.largeSwingThreshold);
        }
        return Math.random() * (1 - this.largeSwingThreshold);
      }
      const random = Math.random();
      const min = Math.max(0, this.nextTargetValue - this.largeSwingThreshold);
      const max = Math.min(1, this.nextTargetValue + this.largeSwingThreshold);
      return lerp(min, max, random);
    }
    // Tutorial uses very specific movement
    else {
      return this.desiredCursorValue;
    }
  }

  private setNextTargetValue(nextTargetValue: number) {
    const targetHalfWidth = this.targetWidth / 2;
    this.nextTargetValue = clamp(nextTargetValue, targetHalfWidth, 1 - targetHalfWidth); // Within 0 to 1
    this.targetDirection = Math.sign(this.nextTargetValue - this.targetValue);
  }

  private refreshTargetArea() {
    let newTargetPos = this.props.cursor!.transform.localPosition.get();
    newTargetPos.x = this.targetValue * (this.barMaxX - this.barMinX) + this.barMinX;
    this.props.cursor!.transform.localPosition.set(newTargetPos);
  }

  private refreshBar() {
    let newBarPos = this.props.targetBar!.transform.localPosition.get();
    newBarPos.x = this.barValue * (this.barMaxX - this.barMinX) + this.barMinX;
    this.props.targetBar!.transform.localPosition.set(newBarPos);
  }

  private refreshProgressBar() {
    const progressBarMaxLength = 12.371318;
    this.props.progressBar!.scale.set(new Vec3(this.progressValue * progressBarMaxLength, 1, 1));
  }
}
