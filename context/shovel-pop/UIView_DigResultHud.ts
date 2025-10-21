/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { AudioBank } from 'AudioBank';
import { BigBox_Player_Inventory } from 'BigBox_Player_Inventory';
import { BigBox_ToastEvents } from 'BigBox_ToastManager';
import { CategoryUIData } from 'CategoryUIData';
import { DISCOVER_COUNT_PER_GEM } from 'DigManager';
import { HUDElementType, ItemFlags } from 'Enums';
import { Events, ItemSelectedPayload, PunchardInfo } from 'Events';
import { ColorLerp, getRGBAHex } from 'GameUtils';
import { Asset, Color, HapticSharpness, HapticStrength, Player } from 'horizon/core';
import { AnimatedBinding, Animation, Binding, Easing, Image, ImageSource, ImageStyle, Text, UIChildren, UINode, View, ViewStyle } from 'horizon/ui';
import { ItemContainer } from 'ItemContainer';
import { ItemData } from 'ItemData';
import { ItemUtils } from 'ItemUtils';
import { Logger } from 'Logger';
import { MutationData } from 'MutationData';
import { PlayerInteractionTrigger } from 'PlayerInteractionTrigger';
import { Shovel } from 'Shovel';
import { ShovelAbilityType } from 'ShovelData';
import { UI_Utils, UITransform } from 'UI_Utils';
import { UIView_NoInteractionBase } from 'UIRoot_ChildrenBase';
import { UIRoot_NoInteraction } from 'UIRoot_NoInteraction';
import { UIView_CatalogHudButton } from 'UIView_CatalogHudButton';
import { UIViewModel_CriticalHit } from 'UIViewModel_CriticalHit';

const DIG_RESULT_START_DELAY = 800;//1800;
const DIG_RESULT_DISPLAY_TIME = 1800;//2800;
const RESULT_FADE_ON_DURATION = 300;
const RESULT_FADE_OFF_DURATION = 400;
const SUNBURST_DELAY_BEFORE = 0;
const INFO_DELAY = 0;
const SUNBURST_DURATION = DIG_RESULT_DISPLAY_TIME - 500;
const INFO_SCALE_DURATION = 300;
const NEW_IMAGE_WIDTH = 40;
const NEW_IMAGE_SCALE_UP_TIME = 150;
const NEW_IMAGE_SCALE_DOWN_TIME = 100;
const NEW_IMAGE_MAX_SCALE = 2;
const NEW_IMAGE_RESTING_SCALE = 1.5;
const NEW_IMAGE_DELAY = 500;
const NEW_IMAGE_SFX_DELAY = 500;
const NEW_IMAGE_FLY_TO_CATALOG_DURATION = 500;
export const ITEM_FLY_TO_PUNCHCARD_DURATION = 300;
const ITEM_FLY_TO_PUNCHCARD_FADEAWAY_DURATION = 300;
const ITEM_PULSE_DURATION = 160;
const GEM_WIDTH = 60;
const GEM_BAR_FILL_DURATION = 1000;
const REWARD_ANIMATION_DURATION = 1200;
const CRITICAL_SHIFT_DURATION = REWARD_ANIMATION_DURATION * .18;
const PAUSE_FOR_CRITICAL = REWARD_ANIMATION_DURATION * .2;
const PULSE_DURATION = REWARD_ANIMATION_DURATION * .1;
const PULSE_PADDING = REWARD_ANIMATION_DURATION * .1;
const REWARD_FADE_ON_DURATION = REWARD_ANIMATION_DURATION * .2;
const WEIGHT_BONUS_DELAY = 500;
const WEIGHT_CRIT_FADE_ON_DURATION = REWARD_ANIMATION_DURATION * .1;
const DIGSTREAK_DELAY = 500;

export const DIG_RESULT_PRESENTATION_DURATION = DIG_RESULT_START_DELAY + RESULT_FADE_ON_DURATION + DIG_RESULT_DISPLAY_TIME;

const log = new Logger("UI_DigResultHud");
const disableContext = "digResultHud";

function getRandomItem(arr: string[]): string {
  const randomIndex = Math.floor(Math.random() * arr.length);
  return arr[randomIndex];
}

type RevealEffectBindings = {
  rotation: AnimatedBinding,
  translateX: AnimatedBinding,
  translateY: AnimatedBinding,
  scale: AnimatedBinding,
  opacity: AnimatedBinding,
  isActive: Binding<boolean>,
  tint: Binding<string>,
  flip: Binding<boolean>,
  skewX: AnimatedBinding,
  skewY: AnimatedBinding,
}

type ScrimBindings = {
  opacity: AnimatedBinding,
  color: Binding<string>,
}

type AnimationSequenceParams = {
  isGemRewardProgressFull: boolean,
  targetEndTime: number,
  abilityType: ShovelAbilityType,
  shovelIcon: ImageSource | undefined,
  abilityIcon: ImageSource | undefined,
  category: string,
  categoryBGColor: string,
  isCategoryMatch: boolean,
}

export class UIView_DigResultHud extends UIView_NoInteractionBase {
  // Define bindings for the custom UI
  private resultItemText = new Binding<string>('Stick');
  private resultWeightText = new Binding<string>('4.3kg');
  private xpText = new Binding<string>('+1000XP');
  private weightColor = new Binding<string>('darkorange');
  private isNewItem = new Binding<boolean>(false);
  private isNewHeaviestItem = new Binding<boolean>(false);
  private newBadgeScale = new AnimatedBinding(0);
  private digResultPresentationScale = new AnimatedBinding(0);
  private sunburstScale = new AnimatedBinding(0);
  private infoScale = new AnimatedBinding(0);
  private sunburstImage = new Binding(ImageSource.fromTextureAsset(this.props.digResultHud_SunburstJunkTextureAsset!));
  private newBadgeOpacity = new AnimatedBinding(0);
  private newBadgeFlyToCatalogScale = new AnimatedBinding(0);
  private itemScale = new AnimatedBinding(1);
  private itemTranslateX = new AnimatedBinding(0);
  private itemTranslateY = new AnimatedBinding(0);
  private itemRotation = new AnimatedBinding(0);
  private itemSkewX = new AnimatedBinding(0);
  private itemSkewY = new AnimatedBinding(0);
  private itemOpacity = new AnimatedBinding(0);
  private itemTint = new Binding("#FFFFFF");
  private gemProgressBarFill = new AnimatedBinding(0);
  private gemBonusOpacity = new AnimatedBinding(0);
  private gemRewardTransform = new UITransform();
  private expRewardTransform = new UITransform();
  private gemBarOpacity = new AnimatedBinding(0);
  private rarityText = new Binding("");
  private rarityColor = new Binding("");
  private scrimBack: ScrimBindings = this.createScrimBindings();
  private scrimFront: ScrimBindings = this.createScrimBindings();
  private revealEffectTexture = new Binding(ImageSource.fromTextureAsset(this.props.digResultHud_SunburstJunkTextureAsset!));
  private mutationPrefixTexture = new Binding(ImageSource.fromTextureAsset(this.props.digResultHud_SunburstJunkTextureAsset!));
  private mutationPrefixShown = new Binding(false);
  private weightScale = new AnimatedBinding(1);
  private revealEffect1: RevealEffectBindings = this.createRevealEffectBindings();
  private revealEffect2: RevealEffectBindings = this.createRevealEffectBindings();
  private criticalHitEffect!: UIViewModel_CriticalHit;

  private icon: Binding<ImageSource> | undefined = undefined;

  private isVisible!: Binding<boolean>;

  private get isNew() { return (this.itemSelectData.itemFlags & ItemFlags.IsNew) > 0; }
  private get isNewHeaviest() { return (this.itemSelectData.itemFlags & ItemFlags.isNewHeaviest) > 0; }

  // Config
  private readonly featuredTextSize = 36;
  private readonly defaultTextSize = 24;
  private readonly outlineSizeMult = 0.075; // How large the text outline should be as a fraction of the font size
  private readonly weightColorMin = new Color(0.92, 0.75, 0.6);
  private readonly weightColorMax = new Color(0.97, 0.7, 0.05);

  private itemData: ItemData | null = null;
  private isZoneLootItem: boolean = false;
  private zoneLootItemX: number = 0;
  private itemSelectData!: ItemSelectedPayload;

  constructor(uiRoot: UIRoot_NoInteraction) {
    super(uiRoot);

    log.info(`UI_DigResultHud CONNECT`);

    this.isVisible = new Binding<boolean>(false);
    this.criticalHitEffect = new UIViewModel_CriticalHit(uiRoot.world.getLocalPlayer());

    this.uiRoot.connectLocalBroadcastEvent(Events.localPlayerDigComplete, (data: { player: Player, isSuccess: boolean }) => this.onDigComplete(data.player, data.isSuccess));
    //this.uiRoot.connectNetworkBroadcastEvent(Events.playerDigComplete, (data: { player: Player, isSuccess: boolean }) => this.onDigComplete(data.player, data.isSuccess));   // Uncomment this and comment out local event for testing
    this.uiRoot.connectNetworkBroadcastEvent(Events.itemSelected, (data) => this.onItemSelected(data));
    this.uiRoot.sendNetworkBroadcastEvent(BigBox_Player_Inventory.requestDigData, { player: this.localPlayer }, [this.uiRoot.world.getServerPlayer()]);
  }

  private createRevealEffectBindings(): RevealEffectBindings {
    return {
      rotation: new AnimatedBinding(0),
      translateX: new AnimatedBinding(0),
      translateY: new AnimatedBinding(0),
      scale: new AnimatedBinding(0),
      opacity: new AnimatedBinding(0),
      isActive: new Binding(false),
      tint: new Binding("#FFFFFF"),
      flip: new Binding(false),
      skewX: new AnimatedBinding(0),
      skewY: new AnimatedBinding(0),
    }
  }

  private createScrimBindings(): ScrimBindings {
    return {
      opacity: new AnimatedBinding(0),
      color: new Binding("#FFFFFF"),
    }
  }

  private onItemSelected(data: ItemSelectedPayload) {
    if (data.player !== this.localPlayer) {
      return;
    }
    let itemData = ItemContainer.localInstance.getItemDataForId(data.itemId);
    if (itemData === undefined) {
      log.error("UI_DigResultHud: Item Selected To For Minigame " + data.itemId + " not found")
      return;
    }

    this.itemData = itemData;
    this.itemSelectData = data;

    const eventSubscription = this.uiRoot.connectLocalBroadcastEvent(Events.punchcardInfoResponse, payload => {
      eventSubscription.disconnect();
      this.onPunchcardInfoResponse(payload);
    });
    this.uiRoot.sendLocalBroadcastEvent(Events.requestPunchcardInfo, { itemId: data.itemId });
  }

  private onPunchcardInfoResponse(payload: PunchardInfo) {
    if (!payload.isOnPunchcard || payload.isFound) {
      this.isZoneLootItem = false;
      return;
    }
    this.isZoneLootItem = true;
    this.zoneLootItemX = payload.x;
  }

  private onDigComplete(player: Player, isSuccess: boolean) {
    if (this.localPlayer == null || player !== this.localPlayer) {
      return;
    }
    if (!isSuccess) {
      // Have the notification system take care of the failure
      this.uiRoot.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
        player: this.localPlayer,
        text: "Failed to dig up item."
      }, [this.uiRoot.world.getServerPlayer()]);
      return;
    }
    // Show the item that was earned
    log.info(`Show Result`);
    this.uiRoot.sendNetworkBroadcastEvent(PlayerInteractionTrigger.addDisableContext, { context: disableContext }, [player]);
    this.uiRoot.sendLocalBroadcastEvent(Events.localHideHUD, { context: disableContext, exclude: HUDElementType.Location });
    this.uiRoot.sendLocalBroadcastEvent(Events.digResultHUDOpen, {});

    const targetPlayer = [this.localPlayer];
    let revealStyle = "";
    if (this.itemData !== null) {
      let data: ItemData = this.itemData;
      const mutationData = ItemContainer.localInstance?.getMutationDataForId(this.itemSelectData.mutation);
      if (mutationData) {
        this.itemTint.set(mutationData.itemTint, targetPlayer);
        revealStyle = mutationData.uiRevealAnimationStyle ?? "";
        const revealTextureAsset = mutationData.getUIRevealTexture();
        if (revealTextureAsset) {
          this.revealEffectTexture.set(ImageSource.fromTextureAsset(revealTextureAsset), targetPlayer)
        }
        const prefixTexture = mutationData.getUIPrefixTexture();
        if (prefixTexture) {
          this.mutationPrefixTexture.set(ImageSource.fromTextureAsset(prefixTexture), targetPlayer);
          this.mutationPrefixShown.set(true, targetPlayer);
        } else {
          this.mutationPrefixShown.set(false, targetPlayer);
        }
      } else {
        this.itemTint.set("#FFFFFF", targetPlayer);
        this.mutationPrefixShown.set(false, targetPlayer);
      }

      this.resultItemText.set(data.name, targetPlayer);
      this.resultWeightText.set(`${this.itemSelectData.weight}kg`, targetPlayer);

      const xp = this.itemSelectData.xp;
      if (xp > 0) {
        const xpText = "+" + xp.toString() + "XP";
        this.xpText.set(xpText, targetPlayer);
      } else {
        this.xpText.set("", targetPlayer);
      }

      // Set which rarity sunburst be bursting
      this.setSunburstImage(targetPlayer, data.rarity, mutationData);

      // Weight
      let weight01 = Math.min(1, this.itemSelectData.weight / ItemUtils.WEIGHT_MAX);
      this.weightColor.set(getRGBAHex(ColorLerp(this.weightColorMin, this.weightColorMax, weight01)), targetPlayer);

      // Set the item's icon
      let textureAsset: Asset = this.props.digResultHud_fallbackIcon!;
      let iconAsset = data.getIconAsset();
      if (iconAsset !== undefined) {
        textureAsset = iconAsset;
      }
      this.icon!.set(ImageSource.fromTextureAsset(textureAsset), targetPlayer);
      this.rarityText.set(ItemUtils.RARITY_TEXT[data.rarity], targetPlayer);
      this.rarityColor.set(ItemUtils.RARITY_HEX_COLORS[data.rarity], targetPlayer);

      // Haptics
      this.localPlayer.rightHand.playHaptics(50 + Math.min(100 * weight01, 100), HapticStrength.Strong, HapticSharpness.Coarse);
    }
    else {
      this.resultItemText.set("Error! Invalid item data", targetPlayer);
    }
    const animationParams = this.getAnimationSequenceParams();
    this.setupCriticalHitEffect(animationParams, targetPlayer);
    this.gemProgressBarFill.set(this.getFillAmountForDiscoverCount(this.itemSelectData.discoverCount), undefined, targetPlayer);
    this.gemRewardTransform.reset({ translateX: 168, translateY: 210 });
    this.expRewardTransform.reset({ translateX: 0, translateY: -400, scale: .3 });
    this.gemBonusOpacity.set(0, undefined, targetPlayer);
    this.criticalHitEffect.scale.set(.6, undefined, targetPlayer);
    this.criticalHitEffect.opacity.set(0, undefined, targetPlayer);
    this.uiRoot.async.setTimeout(() => {
      this.initializeRevealAnimation(animationParams, targetPlayer);
      this.initializeRevealAnimationStyle(revealStyle, targetPlayer);
      this.itemOpacity.set(Animation.timing(1, { duration: RESULT_FADE_ON_DURATION, easing: Easing.linear }), undefined, targetPlayer);
      this.digResultPresentationScale.set(Animation.timing(1, { duration: RESULT_FADE_ON_DURATION, easing: Easing.linear }), () => {
        this.uiRoot.async.setTimeout(() => {
          if (animationParams.abilityType === ShovelAbilityType.WeightMod) {
            this.uiRoot.async.setTimeout(() => {
              this.resultWeightText.set(`${this.itemSelectData.weight + this.itemSelectData.weightBonus}kg`, targetPlayer);
              this.weightScale.set(Animation.sequence(
                Animation.timing(1.2, { duration: PULSE_DURATION, easing: Easing.linear }),
                Animation.timing(1, { duration: PULSE_DURATION, easing: Easing.linear }),
              ), undefined, targetPlayer)
            }, WEIGHT_BONUS_DELAY + CRITICAL_SHIFT_DURATION + WEIGHT_CRIT_FADE_ON_DURATION + PULSE_PADDING * 2 + PULSE_DURATION * 2 + WEIGHT_BONUS_DELAY);
          }
          this.playRevealAnimation(revealStyle, targetPlayer);
          this.onRevealAnimationComplete(animationParams, targetPlayer);
          this.uiRoot.async.setTimeout(() => {
            this.infoScale.set(Animation.timing(1, { duration: INFO_SCALE_DURATION, easing: Easing.linear }), undefined, targetPlayer);
          }, INFO_DELAY);
        }, SUNBURST_DELAY_BEFORE);
      }, targetPlayer);
    }, DIG_RESULT_START_DELAY);
    this.uiRoot.async.setTimeout(() => {
      this.playItemFinishAnimation(targetPlayer);
      this.digResultPresentationScale.set(Animation.timing(0, { duration: RESULT_FADE_OFF_DURATION, easing: Easing.linear }), () => {
        this.isVisible.set(false, targetPlayer);
        this.uiRoot.sendNetworkBroadcastEvent(PlayerInteractionTrigger.removeDisableContext, { context: disableContext }, [player]);
        this.uiRoot.sendLocalBroadcastEvent(Events.digResultHUDClose, {});
        this.uiRoot.sendLocalBroadcastEvent(Events.localShowHUD, { context: disableContext });
        this.resetRevealEffects(targetPlayer);
        this.scrimBack.opacity.set(0, undefined, targetPlayer);
        this.scrimFront.opacity.set(0, undefined, targetPlayer);
      }, targetPlayer);
    }, DIG_RESULT_DISPLAY_TIME + DIG_RESULT_START_DELAY + 500);
  }

  private getAnimationSequenceParams() {
    let abilityType = ShovelAbilityType.None;
    let shovelIcon: ImageSource | undefined = undefined;
    let abilityIcon: ImageSource | undefined = undefined;
    let category = "";
    let categoryBGColor = "";
    let isCategoryMatch = false;
    const shovelTuning = Shovel.getData(this.itemSelectData.shovelId, 0);
    if (shovelTuning !== undefined) {
      shovelIcon = ImageSource.fromTextureAsset(shovelTuning.getIconAsset()!);
      abilityIcon = ImageSource.fromTextureAsset(shovelTuning.getAbilityIconAsset()!);
      const categoryData = CategoryUIData.get(shovelTuning.categoryToBias);
      category = categoryData.displayName;
      categoryBGColor = categoryData.color.toHex();
      isCategoryMatch = shovelTuning.categoryToBias === this.itemData?.category;
      if (shovelTuning.abilities && shovelTuning.abilities.length > 0) {
        // TODO - If we add more abilities, we need to account for that here.
        switch (shovelTuning.abilities[0].type) {
          case ShovelAbilityType.GemMod:
            if (this.itemSelectData.gems > 0 && this.itemSelectData.gemBonus > 0) {
              abilityType = ShovelAbilityType.GemMod;
            }
            break;
          case ShovelAbilityType.XPMod:
            if (this.itemSelectData.xp > 0 && this.itemSelectData.xpBonus > 0) {
              abilityType = ShovelAbilityType.XPMod;
            }
            break;
          case ShovelAbilityType.WeightMod:
            if (this.itemSelectData.weight > 0 && this.itemSelectData.weightBonus > 0) {
              abilityType = ShovelAbilityType.WeightMod;
            }
            break;
        }
      }
    }
    const isGemRewardProgressFull = (this.itemSelectData.discoverCount + 1) % DISCOVER_COUNT_PER_GEM === 0;
    const targetEndTime = Date.now() + DIG_RESULT_START_DELAY + DIG_RESULT_DISPLAY_TIME + DIGSTREAK_DELAY;
    const result: AnimationSequenceParams = {
      isGemRewardProgressFull,
      targetEndTime,
      abilityType,
      shovelIcon,
      abilityIcon,
      category,
      categoryBGColor,
      isCategoryMatch,
    }
    return result;
  }

  private setupCriticalHitEffect(animationParams: AnimationSequenceParams, targetPlayer: Player[]) {
    switch (animationParams.abilityType) {
      case ShovelAbilityType.GemMod:
        this.setupGemCritical(animationParams, targetPlayer);
        break;
      case ShovelAbilityType.XPMod:
        this.setupXPCritical(animationParams, targetPlayer);
        break;
      case ShovelAbilityType.WeightMod:
        this.setupWeightCritical(animationParams, targetPlayer);
        break;
      default:
        if (animationParams.isCategoryMatch) {
          this.setupCategoryCritical(animationParams, targetPlayer);
        }
        break;
    }
  }

  private setupGemCritical(animationParams: AnimationSequenceParams, targetPlayer: Player[]) {
    const critScale = 1;
    const critScalePulse = 1.3;
    const delay = DIG_RESULT_START_DELAY;
    const delayToEnd = animationParams.targetEndTime - Date.now();
    const shiftDelay = delayToEnd + REWARD_FADE_ON_DURATION + PULSE_PADDING * 2 + PULSE_DURATION * 2
    const initialX = 260;
    const initialY = 0;
    const targetX = 60;
    this.criticalHitEffect.setShovelAbility(animationParams.shovelIcon!, animationParams.abilityIcon!);
    this.criticalHitEffect.translateX.set(initialX, undefined, targetPlayer);
    this.criticalHitEffect.translateY.set(initialY, undefined, targetPlayer);
    this.criticalHitEffect.translateX.set(
      Animation.delay(shiftDelay, Animation.timing(targetX, { duration: CRITICAL_SHIFT_DURATION, easing: Easing.linear })), undefined, targetPlayer);
    this.criticalHitEffect.opacity.set(Animation.sequence(
      Animation.delay(delay, Animation.timing(1, { duration: REWARD_FADE_ON_DURATION * .5, easing: Easing.linear })),
      Animation.delay(delayToEnd - delay + PULSE_PADDING * 2 + PULSE_DURATION * 2 + REWARD_FADE_ON_DURATION * .5 + CRITICAL_SHIFT_DURATION * .8, Animation.timing(0, { duration: CRITICAL_SHIFT_DURATION * .2, easing: Easing.linear }))), undefined, targetPlayer)
    this.criticalHitEffect.scale.set(Animation.sequence(
      Animation.delay(delay, Animation.timing(critScale, { duration: REWARD_FADE_ON_DURATION, easing: Easing.linear })),
      Animation.delay(PULSE_PADDING, Animation.timing(critScalePulse, { duration: PULSE_DURATION, easing: Easing.in(Easing.linear) })),
      Animation.timing(critScale, { duration: PULSE_PADDING, easing: Easing.out(Easing.linear) })
    ), undefined, targetPlayer);
  }

  private setupXPCritical(animationParams: AnimationSequenceParams, targetPlayer: Player[]) {
    const critScale = 1;
    const critScalePulse = 1.3;
    const delay = DIG_RESULT_START_DELAY;
    const delayToEnd = animationParams.targetEndTime - Date.now();
    const shiftDelay = delayToEnd + REWARD_FADE_ON_DURATION + PULSE_PADDING * 2 + PULSE_DURATION * 2
    this.criticalHitEffect.setShovelAbility(animationParams.shovelIcon!, animationParams.abilityIcon!);
    const initialX = 260;
    const initialY = -90;
    const targetX = 40;
    this.criticalHitEffect.translateX.set(initialX, undefined, targetPlayer);
    this.criticalHitEffect.translateY.set(initialY, undefined, targetPlayer);
    this.criticalHitEffect.translateX.set(
      Animation.delay(shiftDelay, Animation.timing(targetX, { duration: CRITICAL_SHIFT_DURATION, easing: Easing.linear })), undefined, targetPlayer);
    this.criticalHitEffect.opacity.set(Animation.sequence(
      Animation.delay(delay, Animation.timing(1, { duration: REWARD_FADE_ON_DURATION * .5, easing: Easing.linear })),
      Animation.delay(delayToEnd - delay + PULSE_PADDING * 2 + PULSE_DURATION * 2 + REWARD_FADE_ON_DURATION * .5 + CRITICAL_SHIFT_DURATION * .8, Animation.timing(0, { duration: CRITICAL_SHIFT_DURATION * .2, easing: Easing.linear }))), undefined, targetPlayer);
    this.criticalHitEffect.scale.set(Animation.sequence(
      Animation.delay(delay, Animation.timing(critScale, { duration: REWARD_FADE_ON_DURATION, easing: Easing.linear })),
      Animation.delay(PULSE_PADDING, Animation.timing(critScalePulse, { duration: PULSE_DURATION, easing: Easing.in(Easing.linear) })),
      Animation.timing(critScale, { duration: PULSE_PADDING, easing: Easing.out(Easing.linear) })
    ), undefined, targetPlayer);
  }

  private setupWeightCritical(animationParams: AnimationSequenceParams, targetPlayer: Player[]) {
    const critScale = 1;
    const critScalePulse = 1.3;
    const shrinkScale = .3;
    const delay = DIG_RESULT_START_DELAY// + RESULT_FADE_ON_DURATION + INFO_DELAY + WEIGHT_BONUS_DELAY;
    const delayBeforeShift = 150;
    const shiftDelay = delay + REWARD_FADE_ON_DURATION + PULSE_PADDING * 2 + PULSE_DURATION * 2 + delayBeforeShift + RESULT_FADE_ON_DURATION + INFO_DELAY + WEIGHT_BONUS_DELAY;
    const initialX = 260;
    const initialY = 168;
    const targetX = 40;
    this.criticalHitEffect.setShovelAbility(animationParams.shovelIcon!, animationParams.abilityIcon!);
    this.criticalHitEffect.translateX.set(initialX, undefined, targetPlayer);
    this.criticalHitEffect.translateY.set(initialY, undefined, targetPlayer);
    this.criticalHitEffect.translateX.set(
      Animation.delay(shiftDelay, Animation.timing(targetX, { duration: CRITICAL_SHIFT_DURATION, easing: Easing.linear })), undefined, targetPlayer);
    this.criticalHitEffect.opacity.set(Animation.sequence(
      Animation.delay(delay, Animation.timing(1, { duration: REWARD_FADE_ON_DURATION * .5, easing: Easing.linear })),
      Animation.delay(PULSE_PADDING * 2 + PULSE_DURATION * 2 + REWARD_FADE_ON_DURATION * .5 + CRITICAL_SHIFT_DURATION * .8 + delayBeforeShift + RESULT_FADE_ON_DURATION + INFO_DELAY + WEIGHT_BONUS_DELAY, Animation.timing(0, { duration: CRITICAL_SHIFT_DURATION * .2, easing: Easing.linear }))), undefined, targetPlayer);
    this.criticalHitEffect.scale.set(Animation.sequence(
      Animation.delay(delay, Animation.timing(critScale, { duration: WEIGHT_CRIT_FADE_ON_DURATION, easing: Easing.linear })),
      Animation.delay(PULSE_PADDING, Animation.timing(critScalePulse, { duration: PULSE_DURATION, easing: Easing.in(Easing.linear) })),
      Animation.timing(critScale, { duration: PULSE_DURATION, easing: Easing.out(Easing.linear) }),
      Animation.delay(PULSE_DURATION + delayBeforeShift + RESULT_FADE_ON_DURATION + INFO_DELAY + WEIGHT_BONUS_DELAY, Animation.timing(shrinkScale, { duration: CRITICAL_SHIFT_DURATION, easing: Easing.out(Easing.linear) }))
    ), undefined, targetPlayer);
  }

  private setupCategoryCritical(animationParams: AnimationSequenceParams, targetPlayer: Player[]) {
    const critScale = 1;
    const critScalePulse = 1.3;
    const fadeOnDelay = DIG_RESULT_START_DELAY;
    const fadeOffDelay = animationParams.targetEndTime - Date.now();
    const initialX = 260;
    const initialY = 168
    this.criticalHitEffect.setShovelCategory(animationParams.shovelIcon!, animationParams.category, animationParams.categoryBGColor);
    this.criticalHitEffect.translateX.set(initialX, undefined, targetPlayer);
    this.criticalHitEffect.translateY.set(initialY, undefined, targetPlayer);
    this.criticalHitEffect.opacity.set(Animation.sequence(
      Animation.delay(fadeOnDelay, Animation.timing(1, { duration: REWARD_FADE_ON_DURATION * .5, easing: Easing.linear })),
      Animation.delay(fadeOffDelay - fadeOnDelay - REWARD_FADE_ON_DURATION * .5, Animation.timing(0, { duration: RESULT_FADE_OFF_DURATION, easing: Easing.linear }))), undefined, targetPlayer);
    this.criticalHitEffect.scale.set(Animation.sequence(
      Animation.delay(fadeOnDelay, Animation.timing(critScale, { duration: REWARD_FADE_ON_DURATION, easing: Easing.linear })),
      Animation.delay(PULSE_PADDING, Animation.timing(critScalePulse, { duration: PULSE_DURATION, easing: Easing.in(Easing.linear) })),
      Animation.timing(critScale, { duration: PULSE_DURATION, easing: Easing.out(Easing.linear) }),
      Animation.delay(fadeOffDelay - fadeOnDelay - REWARD_FADE_ON_DURATION - PULSE_DURATION * 2 - PULSE_PADDING, Animation.timing(.2, { duration: RESULT_FADE_OFF_DURATION, easing: Easing.linear }))
    ), undefined, targetPlayer);
  }

  private resetRevealEffects(targetPlayer: Player[]) {
    this.setBothRevealEffects(effect => {
      effect.isActive.set(false, targetPlayer);
      effect.opacity.set(0, undefined, targetPlayer);
      effect.scale.set(0, undefined, targetPlayer);
      effect.rotation.set(0, undefined, targetPlayer);
      effect.translateX.set(0, undefined, targetPlayer);
      effect.translateY.set(0, undefined, targetPlayer);
      effect.tint.set("#FFFFFF", targetPlayer);
      effect.flip.set(false, targetPlayer);
      effect.skewX.set(0, undefined, targetPlayer);
      effect.skewY.set(0, undefined, targetPlayer);
    })
  }

  private playItemFinishAnimation(targetPlayer: Player[]) {
    if (!this.isZoneLootItem) {
      this.itemOpacity.set(Animation.timing(0, { duration: RESULT_FADE_OFF_DURATION, easing: Easing.linear }), undefined, targetPlayer);
      return;
    }
    const zoneLootItemY = -194;
    const zoneLootItemScale = .475;
    this.itemTranslateX.set(Animation.timing(this.zoneLootItemX, { duration: ITEM_FLY_TO_PUNCHCARD_DURATION, easing: Easing.linear }), undefined, targetPlayer);
    this.itemTranslateY.set(Animation.timing(zoneLootItemY, { duration: ITEM_FLY_TO_PUNCHCARD_DURATION, easing: Easing.linear }), undefined, targetPlayer);
    this.itemScale.set(Animation.timing(zoneLootItemScale, { duration: ITEM_FLY_TO_PUNCHCARD_DURATION, easing: Easing.linear }), undefined, targetPlayer);
    this.uiRoot.async.setTimeout(() => {
      this.itemOpacity.set(Animation.timing(0, { duration: ITEM_FLY_TO_PUNCHCARD_FADEAWAY_DURATION, easing: Easing.linear }), undefined, targetPlayer);
    }, ITEM_FLY_TO_PUNCHCARD_DURATION);
  }

  private initializeRevealAnimation(params: AnimationSequenceParams, targetPlayer: Player[]) {
    this.isVisible.set(true, targetPlayer);
    this.itemTranslateX.set(0, undefined, targetPlayer);
    this.itemTranslateY.set(0, undefined, targetPlayer);
    this.infoScale.set(0, undefined, targetPlayer);
    this.newBadgeFlyToCatalogScale.set(0, undefined, targetPlayer);
    this.newBadgeOpacity.set(1, undefined, targetPlayer);
    this.newBadgeScale.set(0, undefined, targetPlayer);
    this.gemRewardTransform.opacity.set(Animation.timing(1, { duration: RESULT_FADE_ON_DURATION, easing: Easing.linear }), undefined, targetPlayer);
    this.gemBarOpacity.set(Animation.timing(1, { duration: RESULT_FADE_ON_DURATION, easing: Easing.linear }), undefined, targetPlayer);
    this.sunburstScale.set(0, undefined, targetPlayer);
    this.itemOpacity.set(0, undefined, targetPlayer);
  }

  private initializeRevealAnimationStyle(style: string, targetPlayer: Player[]) {
    switch (style) {
      case "hot":
        this.initializeHotRevealAnimation(targetPlayer);
        break;
      case "evil":
        this.initializeEvilRevealAnimation(targetPlayer);
        break;
      case "spooky":
        this.initializeSpookyRevealAnimation(targetPlayer);
        break;
      case "sparkly":
        this.initializeSparklyRevealAnimation(targetPlayer);
        break;
      case "frosty":
        this.initializeFrostyRevealAnimation(targetPlayer);
        break;
    }
  }

  private playRevealAnimation(style: string, targetPlayer: Player[]) {
    switch (style) {
      case "hot":
        this.playHotRevealAnimation(targetPlayer);
        break;
      case "evil":
        this.playEvilRevealAnimation(targetPlayer);
        break;
      case "spooky":
        this.playSpookyRevealAnimation(targetPlayer);
        break;
      case "sparkly":
        this.playSparklyRevealAnimation(targetPlayer);
        break;
      case "frosty":
        this.playFrostyRevealAnimation(targetPlayer);
        break;
      default:
        this.playDefaultRevealAnimation(targetPlayer);
        break;
    }
  }

  private initializeHotRevealAnimation(targetPlayer: Player[]) {
    const dimOpacity = .6;
    const dimDuration = DIG_RESULT_DISPLAY_TIME;
    const dimFadeDuration = 500;
    AudioBank.play("mutation_hot");
    this.scrimBack.color.set("#999", targetPlayer);
    this.scrimBack.opacity.set(Animation.sequence(
      Animation.timing(dimOpacity, { duration: dimFadeDuration, easing: Easing.linear }),
      Animation.delay(dimDuration, Animation.timing(0, { duration: dimFadeDuration, easing: Easing.linear }))
    ), undefined, targetPlayer);

    const spacing = 180;
    const scale = 5;
    const startY = 100;
    const shake = 8;
    const delay = 200;
    this.setBothRevealEffects((effect, sign) => {
      effect.isActive.set(true, targetPlayer);
      effect.tint.set("#999", targetPlayer);
      effect.scale.set(scale, undefined, targetPlayer);
      effect.translateX.set(sign * spacing, undefined, targetPlayer);
      effect.translateY.set(startY, undefined, targetPlayer);
    });

    this.itemTranslateX.set(Animation.delay(delay, Animation.sequence(
      Animation.timing(-shake, { duration: 40, easing: Easing.linear }),
      Animation.timing(shake, { duration: 40, easing: Easing.linear }),
      Animation.timing(-shake, { duration: 40, easing: Easing.linear }),
      Animation.timing(shake, { duration: 40, easing: Easing.linear }),
      Animation.timing(-shake, { duration: 40, easing: Easing.linear }),
      Animation.timing(shake, { duration: 40, easing: Easing.linear }),
      Animation.timing(0, { duration: 20, easing: Easing.linear }),
    )), undefined, targetPlayer);
    this.itemTranslateY.set(Animation.delay(delay, Animation.sequence(
      Animation.timing(-shake, { duration: 30, easing: Easing.linear }),
      Animation.timing(shake, { duration: 30, easing: Easing.linear }),
      Animation.timing(-shake, { duration: 30, easing: Easing.linear }),
      Animation.timing(shake, { duration: 30, easing: Easing.linear }),
      Animation.timing(-shake, { duration: 30, easing: Easing.linear }),
      Animation.timing(shake, { duration: 30, easing: Easing.linear }),
      Animation.timing(-shake, { duration: 30, easing: Easing.linear }),
      Animation.timing(0, { duration: 15, easing: Easing.linear }),
    )), undefined, targetPlayer);
  }

  private playHotRevealAnimation(targetPlayer: Player[]) {
    const smokeRotation = 70;
    const smokeDrift = -250;
    const smokeAlpha = 1;
    const smokeSmallScale = 6;
    const smokeBigScale = 11;
    const smokeDuration = 1800;
    const smokeFadeThreshold = .2;
    this.playDefaultRevealAnimation(targetPlayer);
    this.setBothRevealEffects((effect, sign) => {
      effect.rotation.set(Animation.timing(smokeRotation * sign, { duration: smokeDuration, easing: Easing.linear }), undefined, targetPlayer);
      effect.translateY.set(Animation.timing(smokeDrift, { duration: smokeDuration, easing: Easing.linear }), undefined, targetPlayer);
      effect.opacity.set(Animation.sequence(
        Animation.timing(smokeAlpha, { duration: smokeFadeThreshold * smokeDuration }),
        Animation.timing(0, { duration: (1 - smokeFadeThreshold) * smokeDuration })
      ), undefined, targetPlayer);
      effect.scale.set(Animation.sequence(
        Animation.timing(smokeBigScale, { duration: smokeFadeThreshold * smokeDuration }),
        Animation.timing(smokeSmallScale, { duration: (1 - smokeFadeThreshold) * smokeDuration })
      ), undefined, targetPlayer);
    })
  }

  private initializeEvilRevealAnimation(targetPlayer: Player[]) {
    const dimOpacityInit = .86;
    const dimOpacityEnd = .94;
    const dimDuration = DIG_RESULT_DISPLAY_TIME;
    const dimFadeDuration = 500;
    AudioBank.play("mutation_evil");
    this.scrimBack.color.set("#190000", targetPlayer);
    this.scrimBack.opacity.set(Animation.sequence(
      Animation.timing(dimOpacityInit, { duration: dimFadeDuration, easing: Easing.linear }),
      Animation.timing(dimOpacityEnd, { duration: dimDuration, easing: Easing.linear }),
      Animation.timing(0, { duration: dimFadeDuration, easing: Easing.linear })
    ), undefined, targetPlayer);

    const spacing = 330;
    const yOffset = 650;
    const opacity = .4;
    const closeScale = .2;

    const closedSkewX = -60;
    const closedSkewY = -30;

    this.setBothRevealEffects((effect, sign) => {
      effect.isActive.set(true, targetPlayer);
      effect.opacity.set(opacity, undefined, targetPlayer);
      effect.translateX.set(spacing * sign, undefined, targetPlayer);
      effect.translateY.set(yOffset, undefined, targetPlayer);
      effect.skewX.set(closedSkewX, undefined, targetPlayer);
      effect.skewY.set(closedSkewY, undefined, targetPlayer);
      effect.scale.set(0, undefined, targetPlayer);
    });
    this.revealEffect2.flip.set(true, targetPlayer);

    const eyeOpenDurationBeforeBlink = 350;
    const eyeOpenDurationAfterBlink = 180;
    const eyeBlinkDuration = 80;
    const eyeTransitionOnDuration = 460;
    const eyeTransitionOffDuration = 170;
    const blinkDelay = 500;
    const scale = 4;
    const targetYOffset = -100;

    this.uiRoot.async.setTimeout(() => {
      this.setBothRevealEffects((effect, sign) => {
        effect.skewX.set(Animation.sequence(
          Animation.timing(0, { duration: eyeTransitionOnDuration, easing: Easing.ease }),
          Animation.delay(eyeOpenDurationBeforeBlink, Animation.timing(closedSkewX, { duration: eyeBlinkDuration, easing: Easing.linear })),
          Animation.timing(0, { duration: eyeBlinkDuration, easing: Easing.linear }),
          Animation.delay(eyeOpenDurationAfterBlink, Animation.timing(closedSkewX, { duration: eyeTransitionOffDuration, easing: Easing.linear })),
        ), undefined, targetPlayer);
        effect.skewY.set(Animation.sequence(
          Animation.timing(0, { duration: eyeTransitionOnDuration, easing: Easing.ease }),
          Animation.delay(eyeOpenDurationBeforeBlink, Animation.timing(closedSkewY, { duration: eyeBlinkDuration, easing: Easing.linear })),
          Animation.timing(0, { duration: eyeBlinkDuration, easing: Easing.linear }),
          Animation.delay(eyeOpenDurationAfterBlink, Animation.timing(closedSkewY, { duration: eyeTransitionOffDuration, easing: Easing.linear })),
        ), undefined, targetPlayer);
        effect.scale.set(Animation.sequence(
          Animation.timing(scale, { duration: eyeTransitionOnDuration, easing: Easing.ease }),
          Animation.delay(eyeOpenDurationBeforeBlink, Animation.timing(closeScale, { duration: eyeBlinkDuration, easing: Easing.linear })),
          Animation.timing(scale, { duration: eyeBlinkDuration, easing: Easing.linear }),
          Animation.delay(eyeOpenDurationAfterBlink, Animation.timing(0, { duration: eyeTransitionOffDuration, easing: Easing.linear })),
        ), undefined, targetPlayer);
        effect.translateY.set(Animation.timing(targetYOffset, { duration: eyeTransitionOnDuration, easing: Easing.bezier(0, .5, .5, 1) }), undefined, targetPlayer);
      });
    }, blinkDelay);
  }

  private playEvilRevealAnimation(targetPlayer: Player[]) {
    this.playDefaultRevealAnimation(targetPlayer);
  }

  private initializeSpookyRevealAnimation(targetPlayer: Player[]) {
    const dimOpacity = .8;
    const dimDuration = DIG_RESULT_DISPLAY_TIME;
    const dimFadeDuration = 500;
    const spacing = 400;
    const scale = 1;
    const startY = 100;
    AudioBank.play("mutation_spooky");
    this.scrimBack.color.set("#000", targetPlayer);
    this.scrimBack.opacity.set(Animation.sequence(
      Animation.timing(dimOpacity, { duration: dimFadeDuration, easing: Easing.linear }),
      Animation.delay(dimDuration, Animation.timing(0, { duration: dimFadeDuration, easing: Easing.linear }))
    ), undefined, targetPlayer);

    this.itemSkewX.set(12, undefined, targetPlayer);
    this.setBothRevealEffects((effect, sign) => {
      effect.isActive.set(true, targetPlayer);
      effect.scale.set(scale, undefined, targetPlayer);
      effect.translateY.set(startY, undefined, targetPlayer);
      effect.translateX.set(spacing * sign, undefined, targetPlayer);
    });
  }

  private playSpookyRevealAnimation(targetPlayer: Player[]) {
    const lightningFlashDuration = 150;
    const lightningDelay = 1000;
    const ghostSpacing = 400;
    const ghostDrift = -100;
    const ghostAlpha = .4;
    const ghostSmallScale = 1;
    const ghostBigScale = 3;
    const ghostDuration = 2200;
    const ghostFadeThreshold = .2;
    const ghostShift = 10;
    const ghostShiftDuration = 300;
    this.scrimFront.color.set("#FFFFFF", targetPlayer);
    this.scrimFront.opacity.set(Animation.sequence(
      Animation.delay(lightningDelay, Animation.timing(1, { duration: lightningFlashDuration, easing: Easing.linear })),
      Animation.timing(0, { duration: lightningFlashDuration, easing: Easing.linear })
    ), undefined, targetPlayer);
    this.uiRoot.async.setTimeout(() => {
      AudioBank.play("mutation_spooky_lightningStrike");
    }, lightningDelay);
    this.playDefaultRevealAnimation(targetPlayer);
    this.setBothRevealEffects((effect, sign) => {
      effect.translateY.set(Animation.timing(ghostDrift, { duration: ghostDuration, easing: Easing.linear }), undefined, targetPlayer);
      effect.opacity.set(Animation.sequence(
        Animation.timing(ghostAlpha, { duration: ghostFadeThreshold * ghostDuration, easing: Easing.linear }),
        Animation.delay((1 - 2 * ghostFadeThreshold) * ghostDuration,
          Animation.timing(0, { duration: ghostFadeThreshold * ghostDuration, easing: Easing.linear }))
      ), undefined, targetPlayer);
      effect.scale.set(Animation.sequence(
        Animation.timing(ghostBigScale, { duration: ghostFadeThreshold * ghostDuration }),
        Animation.delay((1 - 2 * ghostFadeThreshold) * ghostDuration,
          Animation.timing(ghostSmallScale, { duration: ghostFadeThreshold * ghostDuration }))
      ), undefined, targetPlayer);
      effect.translateX.set(Animation.sequence(
        Animation.timing((ghostSpacing + ghostShift) * sign, { duration: ghostShiftDuration, easing: Easing.linear }),
        Animation.timing((ghostSpacing - ghostShift) * sign, { duration: ghostShiftDuration, easing: Easing.linear }),
        Animation.timing((ghostSpacing + ghostShift) * sign, { duration: ghostShiftDuration, easing: Easing.linear }),
        Animation.timing((ghostSpacing - ghostShift) * sign, { duration: ghostShiftDuration, easing: Easing.linear }),
        Animation.timing((ghostSpacing + ghostShift) * sign, { duration: ghostShiftDuration, easing: Easing.linear }),
        Animation.timing((ghostSpacing - ghostShift) * sign, { duration: ghostShiftDuration, easing: Easing.linear }),
      ), undefined, targetPlayer);
    })

    this.itemSkewX.set(Animation.sequence(
      Animation.timing(-12, { duration: 600, easing: Easing.ease }),
      Animation.timing(0, { duration: 400, easing: Easing.ease })
    ), undefined, targetPlayer);
  }

  private initializeSparklyRevealAnimation(targetPlayer: Player[]) {
    const dimOpacity = .65;
    const dimDuration = DIG_RESULT_DISPLAY_TIME;
    const dimFadeDuration = 100;
    AudioBank.play("mutation_sparkly");
    this.scrimBack.color.set("#FFC", targetPlayer);
    this.scrimBack.opacity.set(Animation.sequence(
      Animation.timing(dimOpacity, { duration: dimFadeDuration, easing: Easing.linear }),
      Animation.delay(dimDuration, Animation.timing(0, { duration: dimFadeDuration, easing: Easing.linear }))
    ), undefined, targetPlayer);

    const flashDelay = 440;
    const flashDuration = 80;

    this.scrimFront.color.set("#FFFFFF", targetPlayer);
    this.scrimFront.opacity.set(Animation.sequence(
      Animation.delay(flashDelay, Animation.timing(1, { duration: flashDuration, easing: Easing.linear })),
      Animation.timing(0, { duration: flashDuration, easing: Easing.linear })
    ), undefined, targetPlayer);

    const spacing = 400;
    const scale = 20;
    const startY = 100;
    const rotation = 200;
    const beamsOpacity = .25;
    this.revealEffect1.isActive.set(true, targetPlayer);
    this.revealEffect1.scale.set(scale, undefined, targetPlayer);
    this.revealEffect1.tint.set("#FF4", targetPlayer);
    this.revealEffect1.opacity.set(Animation.sequence(
      Animation.timing(beamsOpacity, { duration: dimFadeDuration, easing: Easing.linear }),
      Animation.delay(dimDuration, Animation.timing(0, { duration: dimFadeDuration, easing: Easing.linear }))
    ), undefined, targetPlayer);
    this.revealEffect1.rotation.set(Animation.timing(rotation, { duration: dimDuration + 2 * dimFadeDuration, easing: Easing.linear }), undefined, targetPlayer);
    // this.revealEffect1.translateY.set(startY, undefined, targetPlayer);
    // this.revealEffect1.translateX.set(spacing, undefined, targetPlayer);
  }

  private playSparklyRevealAnimation(targetPlayer: Player[]) {
    this.playDefaultRevealAnimation(targetPlayer);
  }

  private initializeFrostyRevealAnimation(targetPlayer: Player[]) {
    const dimOpacityInit = .58;
    const dimOpacityEnd = .7;
    const dimDuration = DIG_RESULT_DISPLAY_TIME;
    const dimFadeDuration = 500;
    AudioBank.play("mutation_frosty");
    this.scrimBack.color.set("#9ADAF5", targetPlayer);
    this.scrimBack.opacity.set(Animation.sequence(
      Animation.timing(dimOpacityInit, { duration: dimFadeDuration, easing: Easing.linear }),
      Animation.timing(dimOpacityEnd, { duration: dimDuration, easing: Easing.linear }),
      Animation.timing(0, { duration: dimFadeDuration, easing: Easing.linear })
    ), undefined, targetPlayer);

    const spacing = 400;
    const yOffset = -200;
    const opacity = .5;
    const scale = 8;

    this.setBothRevealEffects((effect, sign) => {
      effect.isActive.set(true, targetPlayer);
      effect.opacity.set(opacity, undefined, targetPlayer);
      effect.translateX.set(spacing * sign, undefined, targetPlayer);
      effect.translateY.set(yOffset, undefined, targetPlayer);
      effect.scale.set(scale, undefined, targetPlayer);
    });

    const targetXOffset = 220;
    const targetYOffset = 200;
    const duration = 3500;
    const offset = 50;

    this.setBothRevealEffects((effect, sign) => {
      effect.translateX.set(Animation.timing(targetXOffset * sign + offset, { duration, easing: Easing.linear}));
      effect.translateY.set(Animation.timing(targetYOffset, { duration, easing: Easing.linear }), undefined, targetPlayer);
    });
  }

  private playFrostyRevealAnimation(targetPlayer: Player[]) {
    this.playDefaultRevealAnimation(targetPlayer);
  }

  private playDefaultRevealAnimation(targetPlayer: Player[]) {
    this.sunburstScale.set(Animation.timing(1, { duration: SUNBURST_DURATION, easing: Easing.linear }), undefined, targetPlayer);
    this.itemScale.set(Animation.sequence(
      Animation.timing(NEW_IMAGE_MAX_SCALE, { duration: ITEM_PULSE_DURATION, easing: Easing.linear }),
      Animation.timing(1, { duration: ITEM_PULSE_DURATION, easing: Easing.linear }),
    ), undefined, targetPlayer)
  }

  private onRevealAnimationComplete(params: AnimationSequenceParams, targetPlayer: Player[]) {
    AudioBank.play('digReveal');
    this.animateGemProgress(params);
    this.uiRoot.async.setTimeout(() => {
      this.gemBarOpacity.set(Animation.timing(0, { duration: RESULT_FADE_ON_DURATION, easing: Easing.inOut(Easing.ease) }), undefined, [this.localPlayer]);
      this.animateRewards(params);
    }, params.targetEndTime - Date.now());
    if (this.isNew) {
      this.animateNewBadge(this.isNewItem, params.targetEndTime, true);
    } else if (this.isNewHeaviest) {
      this.animateNewBadge(this.isNewHeaviestItem, params.targetEndTime, false);
    }
  }

  private setBothRevealEffects(callback: (bindings: RevealEffectBindings, sign: number) => void) {
    callback(this.revealEffect1, -1);
    callback(this.revealEffect2, 1);
  }

  private getFillAmountForDiscoverCount(discoverCount: number): number {
    let percent = discoverCount / DISCOVER_COUNT_PER_GEM;
    percent = percent - Math.floor(percent);
    return percent;
  }

  private setSunburstImage(targetPlayer: Player[], rarity: number, mutationData?: MutationData) {
    let image = mutationData?.getUIBackgroundTexture();
    if (image === undefined) {
      switch (rarity) {
        case 1:
          image = this.props.digResultHud_SunburstOrdinaryTextureAsset;
          break;
        case 2:
          image = this.props.digResultHud_SunburstRareTextureAsset;
          break;
        case 3:
          image = this.props.digResultHud_SunburstEpicTextureAsset;
          break;
        case 4:
          image = this.props.digResultHud_SunburstLegendaryTextureAsset;
          break;
        case 5:
          image = this.props.digResultHud_SunburstMythicalTextureAsset;
          break;
        default:
          image = this.props.digResultHud_SunburstJunkTextureAsset;
          break;
      }
    }
    this.sunburstImage.set(ImageSource.fromTextureAsset(image!), targetPlayer);
  }

  private animateNewBadge(binding: Binding<boolean>, targetEndTime: number, sendToCatalog: boolean) {
    const targetPlayer = [this.localPlayer];
    binding.set(true, targetPlayer);
    this.newBadgeOpacity.set(1, undefined, targetPlayer);
    const easing = Easing.bezier(.37, 1.09, .56, .99);
    this.newBadgeScale.set(Animation.delay(NEW_IMAGE_DELAY, Animation.sequence(
      Animation.timing(NEW_IMAGE_MAX_SCALE, { duration: NEW_IMAGE_SCALE_UP_TIME, easing: Easing.in(easing) }),
      Animation.timing(NEW_IMAGE_RESTING_SCALE, { duration: NEW_IMAGE_SCALE_DOWN_TIME, easing: Easing.out(easing) }))),
      undefined,
      targetPlayer
    );
    this.uiRoot.async.setTimeout(() => {
      AudioBank.play('newItem');
    }, NEW_IMAGE_SFX_DELAY);
    this.uiRoot.async.setTimeout(() => {
      if (sendToCatalog) {
        this.sendNewBadgeToCatalog(binding, targetPlayer);
      } else {
        this.fadeOutNewBadge(binding, targetPlayer);
      }
    }, targetEndTime - Date.now());
  }

  private animateGemProgress(params: AnimationSequenceParams) {
    const fillAmount = params.isGemRewardProgressFull ? 1 : this.getFillAmountForDiscoverCount(this.itemSelectData.discoverCount + 1);
    this.gemProgressBarFill.set(Animation.timing(fillAmount, { duration: GEM_BAR_FILL_DURATION, easing: Easing.out(Easing.ease) }), undefined, [this.localPlayer]);
  }

  private animateRewards(params: AnimationSequenceParams) {
    this.animateExpReward(params);
    this.animateGemReward(params);
    if (params.isGemRewardProgressFull) {
      this.uiRoot.async.setTimeout(() => {
        AudioBank.play('newItem');
      }, 80);
    }
  }

  private animateExpReward(params: AnimationSequenceParams) {
    const holdAtCenterDuration = REWARD_ANIMATION_DURATION * .4;
    const shiftToHUDDuration = REWARD_ANIMATION_DURATION * .4;

    const centerScale = 1;
    const centerPulseScale = 1.3;
    const atHUDScale = .4;

    this.expRewardTransform.scale.set(Animation.sequence(
      Animation.timing(centerScale, { duration: REWARD_FADE_ON_DURATION, easing: Easing.linear }),
      Animation.delay(PULSE_PADDING, Animation.timing(centerPulseScale, { duration: PULSE_DURATION, easing: Easing.linear })),
      Animation.timing(centerScale, { duration: PULSE_DURATION, easing: Easing.linear }),
    ), undefined, [this.localPlayer]);
    this.expRewardTransform.opacity.set(Animation.timing(1, { duration: REWARD_FADE_ON_DURATION, easing: Easing.linear }), undefined, [this.localPlayer]);

    const hasCritReward = params.abilityType === ShovelAbilityType.XPMod;
    const hasCritDelay = params.abilityType === ShovelAbilityType.GemMod;
    this.uiRoot.async.setTimeout(() => {
      if (hasCritReward) {
        this.uiRoot.async.setTimeout(() => {
          const xp = this.itemSelectData.xp + this.itemSelectData.xpBonus;
          this.xpText.set("+" + xp.toString() + "XP", [this.localPlayer]);
        }, PAUSE_FOR_CRITICAL)
        this.expRewardTransform.scale.set(Animation.sequence(
          Animation.delay(PAUSE_FOR_CRITICAL, Animation.timing(centerPulseScale, { duration: PULSE_DURATION, easing: Easing.linear })),
          Animation.timing(centerScale, { duration: PULSE_DURATION, easing: Easing.linear }),
          Animation.delay(PULSE_PADDING, Animation.timing(atHUDScale, { duration: shiftToHUDDuration, easing: Easing.linear }))
        ), undefined, [this.localPlayer]);
      } else if (hasCritDelay) {
        this.expRewardTransform.scale.set(
          Animation.delay(PAUSE_FOR_CRITICAL + PULSE_DURATION * 2 + PULSE_PADDING, Animation.timing(atHUDScale, { duration: shiftToHUDDuration, easing: Easing.linear })), undefined, [this.localPlayer]);
      } else {
        this.expRewardTransform.scale.set(
          Animation.delay(PULSE_PADDING, Animation.timing(atHUDScale, { duration: shiftToHUDDuration, easing: Easing.linear })), undefined, [this.localPlayer]);
      }
      const flyDelay = hasCritDelay || hasCritReward ? PAUSE_FOR_CRITICAL + PULSE_DURATION * 2 + PULSE_PADDING : PULSE_PADDING;
      this.expRewardTransform.translateX.set(Animation.delay(flyDelay, Animation.timing(-520, { duration: shiftToHUDDuration, easing: Easing.linear })), undefined, [this.localPlayer]);
      this.expRewardTransform.translateY.set(Animation.delay(flyDelay, Animation.timing(-350, { duration: shiftToHUDDuration, easing: Easing.linear })), undefined, [this.localPlayer]);
      this.uiRoot.async.setTimeout(() => {
        this.expRewardTransform.opacity.set(0, undefined, [this.localPlayer]);
        this.uiRoot.sendLocalBroadcastEvent(Events.updateExpUI, {});
      }, flyDelay + shiftToHUDDuration);
    }, REWARD_FADE_ON_DURATION + holdAtCenterDuration);
  }

  private animateGemReward(params: AnimationSequenceParams) {
    if (params.isGemRewardProgressFull) {
      const shiftToCenterDuration = REWARD_ANIMATION_DURATION * .2;
      const holdAtCenterDuration = REWARD_ANIMATION_DURATION * .4;
      const shiftToHUDDuration = REWARD_ANIMATION_DURATION * .4;
      const centerScale = 2;
      const centerPulseScale = 2.2;
      const atHUDScale = .4;
      this.gemRewardTransform.translateX.set(Animation.timing(30, { duration: shiftToCenterDuration, easing: Easing.linear }), undefined, [this.localPlayer]);
      this.gemRewardTransform.translateY.set(Animation.timing(0, { duration: shiftToCenterDuration, easing: Easing.linear }), undefined, [this.localPlayer]);
      this.gemRewardTransform.scale.set(Animation.sequence(
        Animation.timing(centerScale, { duration: shiftToCenterDuration, easing: Easing.linear }),
        Animation.delay(PULSE_PADDING, Animation.timing(centerPulseScale, { duration: PULSE_DURATION, easing: Easing.linear })),
        Animation.timing(centerScale, { duration: PULSE_DURATION, easing: Easing.linear })
      ), undefined, [this.localPlayer]);
      const hasCritReward = params.abilityType === ShovelAbilityType.GemMod;
      const hasCritDelay = params.abilityType === ShovelAbilityType.XPMod;
      this.uiRoot.async.setTimeout(() => {
        if (hasCritReward) {
          this.gemBonusOpacity.set(Animation.delay(PAUSE_FOR_CRITICAL - PULSE_DURATION, Animation.timing(1, { duration: PULSE_DURATION * 2, easing: Easing.linear })), undefined, [this.localPlayer]);
          this.gemRewardTransform.scale.set(Animation.sequence(
            Animation.delay(PAUSE_FOR_CRITICAL, Animation.timing(centerPulseScale, { duration: PULSE_DURATION, easing: Easing.linear })),
            Animation.timing(centerScale, { duration: PULSE_DURATION, easing: Easing.linear }),
            Animation.delay(PULSE_PADDING, Animation.timing(atHUDScale, { duration: shiftToHUDDuration, easing: Easing.linear }))
          ), undefined, [this.localPlayer]);
        } else if (hasCritDelay) {
          this.gemRewardTransform.scale.set(
            Animation.delay(PAUSE_FOR_CRITICAL + PULSE_DURATION * 2 + PULSE_PADDING, Animation.timing(atHUDScale, { duration: shiftToHUDDuration, easing: Easing.linear })), undefined, [this.localPlayer]);
        } else {
          this.gemRewardTransform.scale.set(
            Animation.delay(PULSE_PADDING, Animation.timing(atHUDScale, { duration: shiftToHUDDuration, easing: Easing.linear })), undefined, [this.localPlayer]);
        }
        const flyDelay = hasCritDelay || hasCritReward ? PAUSE_FOR_CRITICAL + PULSE_DURATION * 2 + PULSE_PADDING : PULSE_PADDING;
        this.gemRewardTransform.translateX.set(Animation.delay(flyDelay, Animation.timing(-500, { duration: shiftToHUDDuration, easing: Easing.linear })), undefined, [this.localPlayer]);
        this.gemRewardTransform.translateY.set(Animation.delay(flyDelay, Animation.timing(10, { duration: shiftToHUDDuration, easing: Easing.linear })), undefined, [this.localPlayer]);
        this.uiRoot.async.setTimeout(() => {
          this.gemRewardTransform.opacity.set(0, undefined, [this.localPlayer]);
          this.uiRoot.sendLocalBroadcastEvent(Events.updateGemUI, {});
        }, flyDelay + shiftToHUDDuration);
      }, shiftToCenterDuration + holdAtCenterDuration);
    } else {
      this.gemRewardTransform.opacity.set(Animation.timing(0, { duration: RESULT_FADE_OFF_DURATION, easing: Easing.inOut(Easing.ease) }), undefined, [this.localPlayer]);
    }
  }

  private sendNewBadgeToCatalog(binding: Binding<boolean>, targetPlayer: Player[]) {
    this.newBadgeFlyToCatalogScale.set(Animation.timing(1, { duration: NEW_IMAGE_FLY_TO_CATALOG_DURATION, easing: Easing.linear }), () => {
      binding.set(false, targetPlayer);
      this.uiRoot.sendLocalBroadcastEvent(UIView_CatalogHudButton.incrementNewItemCount, {});
    }, [this.localPlayer]);
  }

  private fadeOutNewBadge(binding: Binding<boolean>, targetPlayer: Player[]) {
    this.newBadgeOpacity.set(Animation.timing(0, { duration: RESULT_FADE_OFF_DURATION, easing: Easing.linear }), () => {
      binding.set(false, targetPlayer);
    }, targetPlayer);
    this.newBadgeScale.set(Animation.timing(.8, { duration: RESULT_FADE_OFF_DURATION, easing: Easing.linear }), undefined, targetPlayer);
  }

  ////////////////////////////////////////////////////////////////////////
  // UI Formatting
  ////////////////////////////////////////////////////////////////////////

  createView() {
    const style: ViewStyle = {
      width: "60%",
      height: "80%",
      bottom: "22.5%",
      position: "absolute",
      justifyContent: "flex-end", // Align vertical to the bottom
      alignContent: "center",
      alignSelf: "center",
      alignItems: "center", // Align horizontal to the middle
      opacity: this.digResultPresentationScale,
      transform: [{ scale: this.digResultPresentationScale.interpolate([0, 1], [.8, 1]) }]
    }

    this.icon = new Binding<ImageSource>(ImageSource.fromTextureAsset(this.props.digResultHud_fallbackIcon!));

    return View({//Root Panel + Panel Background Image
      children: [
        this.scrim(this.scrimBack),
        this.revealEffect(this.revealEffect1),
        this.revealEffect(this.revealEffect2),
        UINode.if(this.isVisible, View({//Button Row Root
          children: [
            this.itemView(),
            this.textView(),
            View({ // Spacer
              style: {
                width: 20,
              }
            }),
          ],
          style
        })),
        this.itemImage(),
        this.gemProgress(),
        this.newItemSticker(),
        this.newHeaviestItemSticker(),
        this.gemView(),
        this.gemBarItem(),
        this.criticalHitEffect.getView(),
        this.expView(),
        this.repeatDigText(),
        this.scrim(this.scrimFront)
      ],
      style: {
        width: "100%",
        height: "100%",
        position: "absolute",
        justifyContent: "center",
        alignItems: "center"
      }
    });
  }

  private itemImage() {
    return Image({
      source: this.icon,
      style: {
        width: 160,
        height: 160,
        tintColor: this.itemTint,
        //backgroundColor: "blue",
        //alignContent: "center",
        //alignSelf: "center",
        //alignItems: "center", // Align horizontal to the middle
        //justifyContent: "center",
        position: "absolute",
        opacity: this.itemOpacity,
        transform: [
          { translateX: this.itemTranslateX },
          { translateY: this.itemTranslateY },
          { rotate: this.itemRotation.interpolate([-1080, 1080], ["-1080deg", "1080deg"]) },
          { scale: this.itemScale },
          { skewX: this.itemSkewX.interpolate([-180, 180], ["-180deg", "180deg"]) },
          { skewY: this.itemSkewY.interpolate([-180, 180], ["-180deg", "180deg"]) },
        ],
      },
    })
  }

  private revealEffect(revealEffect: RevealEffectBindings) {
    return UINode.if(revealEffect.isActive, Image({
      source: this.revealEffectTexture,
      style: {
        position: "absolute",
        width: 100,
        height: 100,
        top: "42%",
        opacity: revealEffect.opacity,
        alignSelf: "center",
        transform: [
          { translateX: revealEffect.translateX },
          { translateY: revealEffect.translateY },
          { rotate: revealEffect.rotation.interpolate([-360, 360], ["-360deg", "360deg"]) },
          { scale: revealEffect.scale },
          { scaleX: revealEffect.flip.derive(value => value ? 1 : -1) },
          { skewX: revealEffect.skewX.interpolate([-180, 180], ["-180deg", "180deg"]) },
          { skewY: revealEffect.skewY.interpolate([-180, 180], ["-180deg", "180deg"]) }
        ],
      }
    }));
  }

  private scrim(bindings: ScrimBindings) {
    return View({
      style: {
        width: "100%",
        height: "100%",
        backgroundColor: bindings.color,
        opacity: bindings.opacity,
        position: "absolute"
      }
    });
  }

  private gemBarItem() {
    return Image({
      source: this.icon,
      style: {
        width: 90,
        height: 90,
        marginRight: 320,
        opacity: this.gemBarOpacity,
        alignSelf: "center",
        position: "absolute",
        bottom: "9%",
      }
    });
  }

  private itemView() {
    return View({
      children: [
        View({ // Background
          children: [
            this.sunburstView(),
          ],
          style: {
            width: "200%", // Slightly overlap the background
            height: "200%",
            position: "absolute",
            opacity: this.sunburstScale.interpolate([0, .1, 1], [0, 1, 1]),
            transform: [
              { scale: this.sunburstScale.interpolate([0, .05, .08, .1, .12, .15, 1], [0, .7, 1, 1.2, 1.1, 1, 1]) },
              { rotate: this.sunburstScale.interpolate([0, .2, .3, .4, 1], ["-15deg", "-4deg", "0deg", "3deg", "15deg"]) }
            ]
          }
        })
      ],
      style: {
        width: 200,
        height: 200,
        //position: "absolute",
        alignContent: "center",
        alignSelf: "center",
        alignItems: "center", // Align horizontal to the middle
        justifyContent: "center",
      },
    });
  }

  private textView() {
    return View({
      children: [
        View({ // Background
          style: {
            width: "100%",
            height: "100%",
            //backgroundColor: "black",
            position: "absolute",
            //opacity: 0.75,
            //borderRadius: 5, // Very slightly round the edges
          }
        }),
        View({
          children: [
            UINode.if(this.mutationPrefixShown, Image({
              source: this.mutationPrefixTexture,
              style: {
                width: 100,
                height: 100,
                marginRight: 8
              }
            })),
            UI_Utils.outlineText(this.resultItemText, this.featuredTextSize * this.outlineSizeMult, {
              fontFamily: "Roboto",
              color: "white",
              fontWeight: "900", // Maximum bold
              fontSize: this.featuredTextSize,
              alignSelf: "center",
            })
          ],
          style: {
            flexDirection: "row"
          }
        }),
        // Result Weight Value
        UI_Utils.outlineText(this.resultWeightText, this.defaultTextSize * this.outlineSizeMult, {
          top: "-20%",
          fontFamily: "Roboto",
          color: this.weightColor,
          fontWeight: "700",
          fontSize: this.defaultTextSize,
          alignSelf: "flex-start",
          transform: [{ scale: this.weightScale }]
        }),
        // Rarity
        UI_Utils.outlineText(this.rarityText, this.defaultTextSize * this.outlineSizeMult, {
          top: "-25%",
          fontFamily: "Roboto",
          color: this.rarityColor,
          fontWeight: "700",
          fontSize: this.defaultTextSize,
          alignSelf: "flex-start",
        }),
      ],
      style: {
        height: this.featuredTextSize + 20,
        flexDirection: "column",
        alignContent: "center",
        justifyContent: "center",
        margin: 5,
        opacity: this.infoScale
      },
    });
  }

  private gemProgress() {
    const borderColor = "#F2E2FF"
    const bgColor = "#190041";
    const barColor = "#BC79FF";
    return View({
      children: [
        View({
          children: [
            View({
              style: {
                backgroundColor: barColor,
                height: "100%",
                position: "absolute",
                width: this.gemProgressBarFill.interpolate([0, 1], ["0%", "100%"]),
              }
            }),
            View({
              children: this.gemProgressDividers(),
              style: {
                justifyContent: "space-evenly",
                alignItems: "center",
                position: "relative",
                flexDirection: "row"
              }
            })
          ],
          style: {
            width: "100%",
            height: 30,
            borderRadius: 10,
            backgroundColor: bgColor,
            overflow: "hidden",
          }
        })],
      style: {
        width: 300,
        borderRadius: 10,
        borderWidth: 4,
        borderColor: borderColor,
        overflow: "hidden",
        opacity: this.gemBarOpacity,
        alignSelf: "center",
        position: "absolute",
        bottom: "13%",
      }
    });
  }

  private gemProgressDividers() {
    const dividers: UIChildren[] = [];
    for (let i = 0; i < DISCOVER_COUNT_PER_GEM - 1; ++i) {
      dividers.push(
        View({
          style: {
            width: 4,
            height: 30,
            //borderColor: "#444444",
            //borderWidth: 1,
            backgroundColor: "#F2E2FF",
          }
        })
      );
    }
    return dividers;
  }

  private sunburstView() {
    return View({
      children: [
        View({ // Background
          children: [
            Image({
              source: ImageSource.fromTextureAsset(this.props.digResultHud_ShadowTextureAsset!),
              style: {
                width: "100%",
                height: "100%",
                position: "absolute",
                alignContent: "center",
                alignSelf: "center",
                alignItems: "center", // Align horizontal to the middle
                justifyContent: "center",
              }
            }),
          ],
          style: {
            width: "100%",
            height: "100%",
            position: "absolute",
          }
        }),
        Image({
          source: this.sunburstImage,
          style: {
            width: "100%",
            height: "100%",
            position: "absolute",
            alignSelf: "center",
          }
        }),
      ],
      style: {
        width: "100%",
        height: "100%",
        position: "absolute",
        alignContent: "center",
        justifyContent: "center",
      },
    });
  }

  private flyToCatalogStyle(): ImageStyle {
    return {
      top: this.newBadgeFlyToCatalogScale.interpolate([0, .4, 1], ["30%", "27%", "25%"]),
      left: this.newBadgeFlyToCatalogScale.interpolate([0, .4, 1], ["55%", "75%", "95%"]),
      position: "absolute",
      transform: [{ scale: this.newBadgeFlyToCatalogScale.interpolate([0, .5, 1], [1, 1, .3]) }],
      opacity: this.newBadgeFlyToCatalogScale.interpolate([0, .95, 1], [1, 1, 0])
    }
  }

  private badgeStyle(): ImageStyle {
    return {
      width: NEW_IMAGE_WIDTH,
      height: NEW_IMAGE_WIDTH,
      position: "absolute",
      transform: [{ scale: this.newBadgeScale }],
      opacity: this.newBadgeOpacity
    };
  }

  private newItemSticker(): UINode<any> {
    // New Item Sticker
    return UINode.if(
      this.isNewItem,
      View({
        children: [Image({
          source: ImageSource.fromTextureAsset(this.props.digResultHud_NewItemTextureAsset!),
          style: this.badgeStyle()
        })],
        style: this.flyToCatalogStyle(),
      }));
  }

  private newHeaviestItemSticker() {
    // New Heaviest Item Sticker
    return UINode.if(
      this.isNewHeaviestItem,
      View({
        children: [Image({
          source: ImageSource.fromTextureAsset(this.props.digResultHud_NewHeaviestItemTextureAsset!),
          style: this.badgeStyle()
        })],
        style: this.flyToCatalogStyle(),
      }));
  }

  private gemView() {
    return View({
      children: [Image({
        source: ImageSource.fromTextureAsset(this.props.digResultHud_GemTextureAsset!),
        style: {
          width: GEM_WIDTH,
          height: GEM_WIDTH,
        }
      }),
      Text({
        text: "x2",
        style: {
          color: "#3B1F68",
          textAlign: "center",
          textAlignVertical: "center",
          fontFamily: "Roboto",
          fontSize: 24,
          fontWeight: "900",
          opacity: this.gemBonusOpacity,
        }
      })
      ],
      style: {
        flexDirection: "row",
        position: "absolute",
        transform: [
          { translateX: this.gemRewardTransform.translateX },
          { translateY: this.gemRewardTransform.translateY },
          { scale: this.gemRewardTransform.scale }
        ],
        opacity: this.gemRewardTransform.opacity,
      }
    });
  }

  private expView() {
    return UI_Utils.outlinedText({ // +10XP
      text: this.xpText,
      outlineSize: 2,
      style: {
        color: "#B6F9EE",
        textAlign: "center",
        fontFamily: "Roboto",
        fontSize: 32,
        width: 200,
        fontWeight: "900",
        position: "absolute",
        alignSelf: "center",
        transform: [
          { translateX: this.expRewardTransform.translateX },
          { translateY: this.expRewardTransform.translateY },
          { scale: this.expRewardTransform.scale }
        ],
        opacity: this.expRewardTransform.opacity,
      }
    })
  }

  private repeatDigText() {
    return View({
      children: [
        UI_Utils.outlineText("REPEAT ITEM!", this.featuredTextSize * this.outlineSizeMult, {
          fontFamily: "Roboto",
          color: "white",
          fontWeight: "900", // Maximum bold
          fontSize: this.featuredTextSize,
          alignSelf: "flex-start",
        }),
      ],
      style: {
        left: "24%",
        top: "73%",
        opacity: this.gemBarOpacity,
      },
    });
  }
}
