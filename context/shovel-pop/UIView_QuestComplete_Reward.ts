/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Events } from 'Events';
import { LocalEvent } from 'horizon/core';
import { Animation, Binding, Easing, UINode, View } from 'horizon/ui';
import { QuestEvents } from 'QuestManager';
import { UI_Utils, UITransform } from 'UI_Utils';
import { UIView_NoInteractionBase } from 'UIRoot_ChildrenBase';
import { UIRoot_NoInteraction } from 'UIRoot_NoInteraction';

const ANIM_DELAY = 1200
const ANIM_DURATION = 500

export type Reward = {
  isXp: boolean,
  amount: number,
}

export class UIView_QuestComplete_Reward extends UIView_NoInteractionBase {
  private text = new Binding<string>('+1000XP')
  private textColor = new Binding<string>('#B6F9EE')
  private expRewardTransform = new UITransform()
  private queue:Reward[] = []
  private pause = false

  constructor(uiRoot: UIRoot_NoInteraction) {
    super(uiRoot);
    this.uiRoot.connectNetworkBroadcastEvent(QuestEvents.finishQuestForPlayer, (data) => {
      let hasReward = false
      if (data.finishedQuest?.xpReward){
        let reward = {isXp: true, amount: data.finishedQuest.xpReward}
        this.queue.push(reward)
        hasReward = true
      }
      if (data.finishedQuest?.currencyReward){
        let reward = {isXp: false, amount: data.finishedQuest.currencyReward}
        this.queue.push(reward)
        hasReward = true
      }

      if (hasReward && !this.pause){
        this.onQuestComplete(this.queue[0])
      }
    })

    this.uiRoot.connectLocalBroadcastEvent(Events.digResultHUDOpen, () => {
      this.pause = true;
    });

    this.uiRoot.connectLocalBroadcastEvent(Events.digResultHUDClose, () => {
      this.pause = false;
      if (this.queue.length > 0){
        this.onQuestComplete(this.queue[0])
      }
    })
  }

  private onQuestComplete(reward: Reward) {
    const target = [this.localPlayer]
    let text
    let localEvent: LocalEvent
    let color

    if (reward.isXp){
      text = '+' + reward.amount.toString() + 'XP'
      color = '#B6F9EE'
      localEvent = Events.updateExpUI
    } else {
      text = '+$' + UI_Utils.simplifyNumberToText(reward.amount)
      color = '#B6F9B6'
      localEvent = Events.updateCurrencyUI
    }

    this.text.set(text, target);
    this.textColor.set(color, target);

    this.expRewardTransform.translateX.set(0, undefined, target)
    this.expRewardTransform.translateY.set(0, undefined, target)
    this.expRewardTransform.scale.set(1, undefined, target)

    this.expRewardTransform.translateX.set(Animation.delay(ANIM_DELAY, Animation.timing(-500, { duration: ANIM_DURATION, easing: Easing.out(Easing.sin) })), undefined, target);
    this.expRewardTransform.translateY.set(Animation.delay(ANIM_DELAY, Animation.timing(reward.isXp ? -210 : -190, { duration: ANIM_DURATION, easing: Easing.out(Easing.sin) })), undefined, target);
    this.expRewardTransform.scale.set(Animation.sequence(
        Animation.timing(2, { duration: 200, easing: Easing.out(Easing.ease) }),
        Animation.timing(1, { duration: 300, easing: Easing.out(Easing.ease) }),
      ), undefined, target);
    this.expRewardTransform.opacity.set(Animation.timing(1, { duration: 500, easing: Easing.linear }), undefined, target);

    this.uiRoot.async.setTimeout(() => {
      this.expRewardTransform.opacity.set(0, undefined, target);
      this.uiRoot.sendLocalBroadcastEvent(localEvent, {});
    }, ANIM_DELAY + ANIM_DURATION);

    this.uiRoot.async.setTimeout(() => {
      this.queue.shift();
      if (this.queue.length > 0 && !this.pause){
        this.onQuestComplete(this.queue[0])
      }
    }, ANIM_DELAY + ANIM_DURATION + 500) // pause before attempting to process queue
  }

  createView(): UINode {
    const text = UI_Utils.outlinedText({
      text: this.text,
      outlineSize: 2,
      style: {
        color: this.textColor,
        textAlign: "center",
        fontFamily: "Roboto",
        fontSize: 32,
        fontWeight: "900",
        position: "absolute",
        alignSelf: "center",
        transform: [
          { translateX: this.expRewardTransform.translateX },
          { translateY: this.expRewardTransform.translateY },
          { scale: this.expRewardTransform.scale }
        ],
      },
    })

    return View({
      children: text,
      style:{
        width: '100%',
        top: '58%',
        opacity: this.expRewardTransform.opacity,
      }
    });
  }
}
