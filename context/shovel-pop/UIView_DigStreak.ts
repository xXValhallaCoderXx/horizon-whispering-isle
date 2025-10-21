/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_Player_Inventory } from 'BigBox_Player_Inventory';
import { DIGSTREAK_AMOUNT } from 'DigManager';
import { HUDElementType } from 'Enums';
import { Events, ItemSelectedPayload } from 'Events';
import { Player } from 'horizon/core';
import { AnimatedBinding, Animation, Easing, Image, ImageSource, Text, UIChildren, UINode, View } from 'horizon/ui';
import { HUDElementVisibilityTracker } from 'HUDElementVisibilityTracker';
import { Shovel } from 'Shovel';
import { ShovelAbilityType } from 'ShovelData';
import { UITransform } from 'UI_Utils';
import { UIView_NoInteractionBase } from 'UIRoot_ChildrenBase';
import { UIRoot_NoInteraction } from 'UIRoot_NoInteraction';
import { UIViewModel_CriticalHit } from 'UIViewModel_CriticalHit';

const GEM_BAR_FILL_DURATION = 1000;
const GEM_REWARD_ANIMATION_DURATION = 1200;
const GEM_REWARD_ANIMATION_DELAY = 1000;
const PULSE_DURATION = GEM_REWARD_ANIMATION_DURATION * .1;
const PULSE_PADDING = GEM_REWARD_ANIMATION_DURATION * .1;
const PAUSE_FOR_CRITICAL = GEM_REWARD_ANIMATION_DURATION * .2;
const CRITICAL_SHIFT_DURATION = GEM_REWARD_ANIMATION_DURATION * .18;
const CRIT_FADE_ON_DURATION = GEM_REWARD_ANIMATION_DURATION * .2;
const GEM_REWARD_X = 988;
const GEM_REWARD_Y = 473;

enum DigStreakState {
  None,
  Success,
  Fail
}

export class UIView_DigStreak extends UIView_NoInteractionBase {
  private hudElementVisible!: HUDElementVisibilityTracker;
  private digStreakCount: number = 0;
  private streakGems: number = 1;
  private hasCritReward: boolean = false;
  private criticalHitEffect!: UIViewModel_CriticalHit;
  private gemRewardTransform = new UITransform();
  private gemBonusOpacity = new AnimatedBinding(0);
  private gemProgressBarFill = new AnimatedBinding(0);

  private digStreakStatus: DigStreakState = DigStreakState.None;

  constructor(uiRoot: UIRoot_NoInteraction) {
    super(uiRoot);
    const setVisibleFunction = (isShown: boolean) => this.onSetVisible(isShown);
    this.hudElementVisible = new HUDElementVisibilityTracker(HUDElementType.AboveInventory, setVisibleFunction);
    this.hudElementVisible.connect(this.uiRoot);
    this.criticalHitEffect = new UIViewModel_CriticalHit(this.localPlayer);
    this.gemRewardTransform.reset({ translateX: GEM_REWARD_X, translateY: GEM_REWARD_Y });
    this.uiRoot.connectLocalBroadcastEvent(Events.localPlayerDigComplete, (data: { player: Player, isSuccess: boolean }) => this.onDigComplete(data.player, data.isSuccess));
    //this.uiRoot.connectNetworkBroadcastEvent(Events.itemSelected, data => this.onItemSelected(data));
    this.uiRoot.connectNetworkEvent(this.localPlayer, Events.digRewardsEvent, (data) => {
      this.streakGems = data.streakGems
    });
    this.uiRoot.connectNetworkEvent(this.localPlayer, BigBox_Player_Inventory.digDataEvent, (data) => {
      this.digStreakCount = data.streak;
      this.gemProgressBarFill.set((this.digStreakCount) / DIGSTREAK_AMOUNT, undefined, [this.localPlayer]);
    })

    this.uiRoot.sendNetworkBroadcastEvent(BigBox_Player_Inventory.requestDigData, { player: this.localPlayer }, [this.uiRoot.world.getServerPlayer()]);
  }

  private onItemSelected(data: ItemSelectedPayload): void {
    const shovelTuning = Shovel.getData(data.shovelId, 0);
    if (shovelTuning !== undefined && shovelTuning.abilities !== undefined && shovelTuning.abilities.length > 0) {
      this.hasCritReward = shovelTuning.abilities[0].type === ShovelAbilityType.GemMod;
      if (this.hasCritReward) {
        this.criticalHitEffect.setShovelAbility(ImageSource.fromTextureAsset(shovelTuning.getIconAsset()!), ImageSource.fromTextureAsset(shovelTuning.getAbilityIconAsset()!));
      }
    } else {
      this.hasCritReward = false;
    }
  }

  private onDigComplete(player: Player, isSuccess: boolean) {
    this.digStreakStatus = isSuccess ? DigStreakState.Success : DigStreakState.Fail;
  }

  private onSetVisible(isShown: boolean) {
    if (isShown) {
      if (this.digStreakStatus === DigStreakState.Success) {
        this.animateGemProgress();
        this.digStreakStatus = DigStreakState.None;
      }
      else if (this.digStreakStatus === DigStreakState.Fail) {
        this.animateGemReset();
        this.digStreakStatus = DigStreakState.None;
      }
    }
  }

  private animateGemProgress() {
    const target = [this.localPlayer]
    const isFull = (this.digStreakCount + 1) % DIGSTREAK_AMOUNT === 0;
    const fillAmount = isFull ? 1 : (this.digStreakCount + 1) / DIGSTREAK_AMOUNT;
    this.gemProgressBarFill.set(fillAmount, undefined, target);
    this.digStreakCount = (this.digStreakCount + 1) % DIGSTREAK_AMOUNT;
    if (isFull) {
      this.uiRoot.async.setTimeout(() => {
        this.gemProgressBarFill.set(0, undefined, target);
        this.gemRewardTransform.opacity.set(1, undefined, target);
        this.playGemRewardAnimation(target);
      }, GEM_REWARD_ANIMATION_DELAY);
    }
  }

  private playGemRewardAnimation(target: Player[]) {
    const shiftToCenterDuration = GEM_REWARD_ANIMATION_DURATION * .2;
    const holdAtCenterDuration = GEM_REWARD_ANIMATION_DURATION * .4;
    const shiftToHUDDuration = GEM_REWARD_ANIMATION_DURATION * .4;
    const centerScale = 2.5;
    const centerPulseScale = 2.9;
    const atHUDScale = .8;
    let flyDelay = this.hasCritReward ? PAUSE_FOR_CRITICAL + PULSE_DURATION * 2 + PULSE_PADDING * 2 : 0;
    this.gemRewardTransform.translateX.set(Animation.timing(675, { duration: shiftToCenterDuration, easing: Easing.linear }), undefined, target);
    this.gemRewardTransform.translateY.set(Animation.timing(280, { duration: shiftToCenterDuration, easing: Easing.linear }), undefined, target);
    this.gemRewardTransform.scale.set(Animation.sequence(
      Animation.timing(centerScale, { duration: shiftToCenterDuration, easing: Easing.linear }),
      Animation.delay(PULSE_PADDING, Animation.timing(centerPulseScale, { duration: PULSE_DURATION, easing: Easing.linear })),
      Animation.timing(centerScale, { duration: PULSE_DURATION, easing: Easing.linear })
    ), undefined, target);
    this.uiRoot.async.setTimeout(() => {
      if (this.hasCritReward) {
        this.gemBonusOpacity.set(Animation.delay(PAUSE_FOR_CRITICAL - PULSE_DURATION, Animation.timing(1, { duration: PULSE_DURATION * 2, easing: Easing.linear })), undefined, target);
        this.gemRewardTransform.scale.set(Animation.sequence(
          Animation.delay(PAUSE_FOR_CRITICAL, Animation.timing(centerPulseScale, { duration: PULSE_DURATION, easing: Easing.linear })),
          Animation.timing(centerScale, { duration: PULSE_DURATION, easing: Easing.linear }),
          Animation.delay(PULSE_PADDING, Animation.timing(atHUDScale, { duration: shiftToHUDDuration, easing: Easing.linear }))
        ), undefined, target);
      } else {
        this.gemRewardTransform.scale.set(
          Animation.delay(PULSE_PADDING, Animation.timing(atHUDScale, { duration: shiftToHUDDuration, easing: Easing.linear })), undefined, [this.localPlayer]);
      }
      this.gemRewardTransform.translateX.set(Animation.delay(flyDelay, Animation.timing(100, { duration: shiftToHUDDuration, easing: Easing.linear })), undefined, target);
      this.gemRewardTransform.translateY.set(Animation.delay(flyDelay, Animation.timing(290, { duration: shiftToHUDDuration, easing: Easing.linear })), undefined, target);
    }, shiftToCenterDuration + holdAtCenterDuration);

    if (this.hasCritReward) {
      const critScale = .8;
      const critScalePulse = 1.1;
      const delay = 0;
      const shiftDelay = delay + PULSE_PADDING * 2 + PULSE_DURATION * 2
      const initialX = 260;
      const initialY = -20;
      const targetX = 45;
      this.criticalHitEffect.translateX.set(initialX, undefined, target);
      this.criticalHitEffect.translateY.set(initialY, undefined, target);
      this.criticalHitEffect.translateX.set(
        Animation.delay(shiftDelay, Animation.timing(targetX, { duration: CRITICAL_SHIFT_DURATION, easing: Easing.linear })), undefined, target);
      this.criticalHitEffect.opacity.set(Animation.sequence(
        Animation.delay(delay, Animation.timing(1, { duration: CRIT_FADE_ON_DURATION * .5, easing: Easing.linear })),
        Animation.delay(PULSE_PADDING * 2 + PULSE_DURATION * 2 + CRIT_FADE_ON_DURATION * .5 + CRITICAL_SHIFT_DURATION * .8, Animation.timing(0, { duration: CRITICAL_SHIFT_DURATION * .2, easing: Easing.linear }))), undefined, target)
      this.criticalHitEffect.scale.set(Animation.sequence(
        Animation.delay(delay, Animation.timing(critScale, { duration: CRIT_FADE_ON_DURATION, easing: Easing.linear })),
        Animation.delay(PULSE_PADDING, Animation.timing(critScalePulse, { duration: PULSE_DURATION, easing: Easing.in(Easing.linear) })),
        Animation.timing(critScale, { duration: PULSE_PADDING, easing: Easing.out(Easing.linear) })
      ), undefined, target);
    }

    this.uiRoot.async.setTimeout(() => {
      this.gemRewardTransform.reset({ translateX: GEM_REWARD_X, translateY: GEM_REWARD_Y });
      this.gemBonusOpacity.set(0, undefined, target);
      this.uiRoot.sendLocalBroadcastEvent(Events.updateGemUI, {});
    }, GEM_REWARD_ANIMATION_DURATION + (this.hasCritReward ? flyDelay : 0));
  }

  private animateGemReset() {
    this.digStreakCount = 0;
    this.gemProgressBarFill.set(0, undefined, [this.localPlayer]);
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
            height: 20,
            borderRadius: 10,
            backgroundColor: bgColor,
            overflow: "hidden",
          }
        }),
      ],
      style: {
        width: 240,
        borderRadius: 10,
        borderWidth: 4,
        borderColor: borderColor,
        alignSelf: "center",
        position: "absolute",
        right: "25",
        bottom: 110,
      }
    });
  }

  private gemProgressDividers() {
    const dividers: UIChildren[] = [];
    for (let i = 0; i < DIGSTREAK_AMOUNT - 1; ++i) {
      dividers.push(
        View({
          style: {
            width: 4,
            height: 20,
            //borderColor: "#888888",
            //borderWidth: 1,
            backgroundColor: "#F2E2FF",
          }
        })
      );
    }
    return dividers;
  }

  private gemView() {
    return Image({
      source: ImageSource.fromTextureAsset(this.props.digResultHud_GemTextureAsset!),
      style: {
        width: 45,
        height: 45,
        position: "absolute",
        bottom: 102,
        right: "23%",
      }
    })
  }

  private gemAnimatedView() {
    return View({
      children: [Image({
        source: ImageSource.fromTextureAsset(this.props.digResultHud_GemTextureAsset!),
        style: {
          width: 45,
          height: 45,
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

  // private gemAnimatedView() {
  //   return Image({
  //     source: ImageSource.fromTextureAsset(this.props.digResultHud_GemTextureAsset!),
  //     style: {
  //       width: 50,
  //       height: 50,
  //       position: "absolute",
  //       transform: [{ scale: this.animateGemRewardScale.interpolate([0, .2, .3, .4, .5, .6, 1], [1, 2, 2, 2.2, 2, 2, .4]) }],
  //       opacity: this.animatedGemOpacity,
  //       bottom: this.animateGemRewardScale.interpolate([0, .2, .6, 1], ["16.5%", "49%", "49%", "39.5%"]),
  //       left: this.animateGemRewardScale.interpolate([0, .2, .6, 1], ["60%", "48%", "48%", "10%"]),
  //     }
  //   })
  // }

  private shovelView() {
    return Image({
      source: ImageSource.fromTextureAsset(this.props.digResultHud_fallbackIcon!),
      style: {
        width: 45,
        height: 45,
        marginRight: -190,
        alignSelf: "center",
        position: "absolute",
        bottom: 102,
      }
    });
  }

  createView(): UINode {
    return UINode.if(this.hudElementVisible.isVisible(), this.getRootView());
  }

  getRootView() {
    return View({//Root Panel + Panel Background Image
      children: [
        this.gemProgress(),
        this.gemView(),
        this.gemAnimatedView(),
        this.shovelView(),
        this.criticalHitEffect.getView(),
      ],
      style: {
        width: "100%",
        height: "100%",
        position: "absolute",
      }
    });
  }

}
