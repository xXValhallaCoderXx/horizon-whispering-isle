/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { HUDElementType } from "Enums";
import { Events } from 'Events';
import * as GameUtils from 'GameUtils';
import { Player, World } from "horizon/core";
import { Binding, Image, ImageSource, ImageStyle, Pressable, Text, UINode, View, ViewStyle } from 'horizon/ui';
import { HUDElementVisibilityTracker } from "HUDElementVisibilityTracker";
import { Logger } from "Logger";
import { PlayerEffects } from "PlayerEffectsController";
import { UI_Utils } from 'UI_Utils';
import { UIView_InteractionNonBlockingBase } from "UIRoot_ChildrenBase";
import { UIRoot_InteractionNonBlocking } from "UIRoot_InteractionNonBlocking";

const log = new Logger("UIView_TimedReward");

export class UIView_TimedReward extends UIView_InteractionNonBlockingBase {
  timerText!: Binding<string>;
  rewardCount!: Binding<string>;
  hasRewards!: Binding<boolean>;
  hudElementVisible!: HUDElementVisibilityTracker;
  nextRewardTime: number = 0;
  lastShownTime: number = 0
  unclaimedRewards: number = 0;

  constructor(uiRoot: UIRoot_InteractionNonBlocking) {
    super(uiRoot);

    this.timerText = new Binding<string>('0:00');
    this.rewardCount = new Binding<string>('1');
    this.hasRewards = new Binding<boolean>(false);
    this.hudElementVisible = new HUDElementVisibilityTracker(HUDElementType.Salary);

    // Only attach listeners if this is running on the local player
    if (this.localPlayer) {
      this.initForPlayer(this.localPlayer);
    }
  }

  initForPlayer(newOwner: Player): void {
    log.info('BigBox_UI_RightMenuBar: receiveOwnership');
    this.uiRoot.connectNetworkEvent(newOwner, Events.StartRewardTimer, (data: { rewardTime: number }) => {
      log.info('BigBox_UI_RightMenuBar: startRewardTimer');
      this.nextRewardTime = data.rewardTime;
    });
    const targetPlayer = [this.localPlayer];

    this.uiRoot.connectNetworkEvent(newOwner, Events.RewardUnlocked, (data: { rewardCount: number, nextRewardTime: number }) => {
      log.info('BigBox_UI_RightMenuBar: rewardUnlocked');
      this.nextRewardTime = data.nextRewardTime;
      this.unclaimedRewards = data.rewardCount;
      this.rewardCount.set(data.rewardCount.toString(), targetPlayer);
      this.hasRewards.set(data.rewardCount > 0, targetPlayer);
    });

    this.uiRoot.connectNetworkEvent(newOwner, Events.RewardContentsEvent, (data: { xp: number, currency: number, item: string[] }) => {
      this.unclaimedRewards = 0;
      this.rewardCount.set('0', targetPlayer);
      this.hasRewards.set(false, targetPlayer);
    });

    this.uiRoot.connectLocalBroadcastEvent(World.onUpdate, (data: { deltaTime: number }) => {
      if (this.nextRewardTime > 0) {
        this.nextRewardTime -= data.deltaTime;
        this.nextRewardTime = Math.max(this.nextRewardTime, 0);
        if (Math.abs(this.nextRewardTime - this.lastShownTime) > 1) {
          this.lastShownTime = this.nextRewardTime;
          this.timerText.set(GameUtils.getTimeString(this.nextRewardTime, false), targetPlayer);
        }
      }
    });

    log.info('BigBox_UI_RightMenuBar: send player ready');
    this.uiRoot.sendNetworkBroadcastEvent(Events.PlayerRewardsReady, { player: newOwner }, [this.uiRoot.world.getServerPlayer()]);
    this.hudElementVisible.connect(this.uiRoot);
  }

  createView(): UINode<any> {
    let bagImage = new ImageSource();
    let notificationImage = new ImageSource();
    let buttonStyle: ViewStyle = {
      alignItems: 'center',
      backgroundColor: 'clear',
      borderRadius: 0,
      height: 80,
      justifyContent: 'center',
      marginTop: 12,
      marginBottom: 12,
      width: 80,
    };

    let imageStyle: ImageStyle = {
      height: 70,
      width: 70,
      resizeMode: "contain",
    };

    if (this.props.timedReward_bagIcon) {
      bagImage = ImageSource.fromTextureAsset(this.props.timedReward_bagIcon);
    }
    if (this.props.timedReward_notificationIcon) {
      notificationImage = ImageSource.fromTextureAsset(this.props.timedReward_notificationIcon);
    }


    return UINode.if(this.hudElementVisible.isVisible(), View({
      children: [

        Pressable({
          children: [
            Image({
              source: bagImage,
              style: imageStyle,
            }),
            Text({
              text: this.timerText,
              style: {
                alignSelf: 'center',
                textAlign: "center",
                textAlignVertical: "center",
                color: 'white',
                fontSize: 20,
                textShadowColor: 'black',
                textShadowRadius: 5,
                textShadowOffset: [3, 3],
                top: -28,
                fontWeight: 'bold',
              }
            }),

            UINode.if(this.hasRewards, UI_Utils.makeNewBadge(this.rewardCount, 13, 0)),
            /*UINode.if(this.hasRewards, View({ //Pip
                          children: [
                            UI_Utils.outlinedText({ // 1
                            text: this.rewardCount,
                            outlineSize: 1,
                            style: {
                              top: 1,
                              alignSelf: "center",
                              fontSize: 17,
                              textAlign: "center",
                              textAlignVertical: "center",
                              fontFamily: "Roboto",
                              fontWeight: "bold",
                            }
                          }) ],
                          style: {
                            backgroundColor: "red",
                            borderRadius: 12,
                            borderColor: "red",
                            width: 24,
                            height: 24,
                            position: "absolute",
                            right: 3,
                            top: 16,
                          }
                      }))*/
          ],
          onClick: (player: Player) => {
            if (this.unclaimedRewards > 0) {
              this.uiRoot.sendNetworkBroadcastEvent(Events.RewardsCollected, { player: player }, [this.uiRoot.world.getServerPlayer()]);
              this.unclaimedRewards = 0;
              this.hasRewards.set(false, [player]);
              this.uiRoot.sendNetworkBroadcastEvent(PlayerEffects.sellEffect, {}, [player]);
            }
          },
          style: buttonStyle,
        }),
      ],
      style: {
        position: 'absolute',
        height: '14%',
        width: '6%',
        right: 18,
        top: 90,
        alignContent: 'flex-end',
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
      },
    }));
  }
}
