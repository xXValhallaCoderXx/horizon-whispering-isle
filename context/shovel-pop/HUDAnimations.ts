/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Events } from "Events";
import { Component } from "horizon/core";
import { AnimatedBinding, Animation, Easing } from "horizon/ui";

export namespace HUDAnimations {
  const quickHUDAnimation = linearHUDAnimation(150);
  const standardHUDAnimation = linearHUDAnimation(300);

  export const inventoryHideAnimation = standardHUDAnimation;
  export const locationAnimation = standardHUDAnimation;
  export const digSpotAnimation = standardHUDAnimation;

  export const iventoryExpandAnimation = quickHUDAnimation;

  function linearHUDAnimation(duration: number) { return (isShown: boolean) => Animation.timing(isShown ? 1 : 0, { duration, easing: Easing.linear }); }


  export function flyGem(component: Component, gemX: AnimatedBinding, gemY: AnimatedBinding, gemScale: AnimatedBinding, gemTextX: AnimatedBinding, gemTextY: AnimatedBinding, gemTextScale: AnimatedBinding) {

    const midwayX = 30;
    const midwayY = -100;
    const midwayScale = 1.8;

    const targetX = -450;
    const targetY = -20;
    const targetScale = .8;

    const textOffsetX = -42;
    const textScaleMultiplier = 0.5;

    const durationToMidway = 300;
    const midwayPauseDuration = 200;
    const durationToFinish = 300;

    const targetPlayer = [component.world.getLocalPlayer()];
    gemX.set(Animation.sequence(
      Animation.timing(midwayX, { duration: durationToMidway, easing: Easing.linear}),
      Animation.delay(midwayPauseDuration, Animation.timing(targetX, { duration: durationToFinish, easing: Easing.linear}))
    ), undefined, targetPlayer);
    gemY.set(Animation.sequence(
      Animation.timing(midwayY, { duration: durationToMidway, easing: Easing.linear}),
      Animation.delay(midwayPauseDuration, Animation.timing(targetY, { duration: durationToFinish, easing: Easing.linear}))
    ), undefined, targetPlayer);
    gemScale.set(Animation.sequence(
      Animation.timing(midwayScale, { duration: durationToMidway, easing: Easing.linear}),
      Animation.delay(midwayPauseDuration, Animation.timing(targetScale, { duration: durationToFinish, easing: Easing.linear})),
      Animation.timing(0, { duration: 0 })
    ), undefined, targetPlayer);
    gemTextX.set(Animation.sequence(
      Animation.timing(midwayX + textOffsetX * midwayScale, { duration: durationToMidway, easing: Easing.linear}),
      Animation.delay(midwayPauseDuration, Animation.timing(targetX + textOffsetX * targetScale, { duration: durationToFinish, easing: Easing.linear}))
    ), undefined, targetPlayer);
    gemTextY.set(Animation.sequence(
      Animation.timing(midwayY, { duration: durationToMidway, easing: Easing.linear}),
      Animation.delay(midwayPauseDuration, Animation.timing(targetY, { duration: durationToFinish, easing: Easing.linear}))
    ), undefined, targetPlayer);
    gemTextScale.set(Animation.sequence(
      Animation.timing(midwayScale * textScaleMultiplier, { duration: durationToMidway, easing: Easing.linear}),
      Animation.delay(midwayPauseDuration, Animation.timing(targetScale * textScaleMultiplier, { duration: durationToFinish, easing: Easing.linear})),
      Animation.timing(0, { duration: 0 })
    ), () => {
      component.sendLocalBroadcastEvent(Events.updateGemUI, {});
    }, targetPlayer);
  }

  export function flyStar(component: Component, starX: AnimatedBinding, starY: AnimatedBinding, scale: AnimatedBinding, animationTime: number, onComplete: () => void) {
    const targetPlayer = [component.world.getLocalPlayer()];
    starX.set(Animation.sequence(
      Animation.timing(0, { duration: 0 }),
      Animation.timing(1, { duration: animationTime, easing: Easing.in(Easing.ease) })
    ), undefined, targetPlayer);

    starY.set(Animation.sequence(
      Animation.timing(0, { duration: 0 }),
      Animation.timing(1, { duration: animationTime, easing: Easing.in(Easing.ease) })
    ), undefined, targetPlayer);

    scale.set(Animation.sequence(
      Animation.timing(0, { duration: 0 }),
      Animation.timing(1, { duration: animationTime, easing: Easing.inOut(Easing.cubic) }),
    ), () => onComplete(), targetPlayer);
  }
}
