/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Events } from 'Events';
import { Asset, EventSubscription, Player, World } from "horizon/core";
import { Social } from 'horizon/social';
import { AnimatedBinding, Animation, Binding, Easing, Image, ImageSource, ImageStyle, Pressable, Text, UINode, View } from "horizon/ui";
import { Logger } from "Logger";
import { Shovel } from "Shovel";
import { AnalyticsManager, LogType } from 'TurboAnalytics';
import { UIView_InteractionNonBlocking3Base } from 'UIRoot_ChildrenBase';
import { UIRoot_InteractionNonBlocking3 } from 'UIRoot_InteractionNonBlocking3';

const log = new Logger('FollowPlayerUI');

export class FollowPlayerUI extends UIView_InteractionNonBlocking3Base {

  static readonly maxDuration: number = 8

  possibleFriend: Player | undefined = undefined
  ignorePlayers: Player[] = []
  timingText: Binding<string> = new Binding<string>("(8s)")
  updateSubscription: EventSubscription | undefined = undefined
  dialogTimer: number = 0
  seconds: number = 0
  opacity: AnimatedBinding
  isDigPressed: boolean = false
  isInvisible: boolean = false

  constructor(uiRoot: UIRoot_InteractionNonBlocking3) {
    super(uiRoot)
    this.opacity = new AnimatedBinding(0);

    this.uiRoot.connectLocalBroadcastEvent(Shovel.digAction, (data) => {
      this.isDigPressed = data.isPressed;

      // Dismiss UI if trying to dig or clean it up
      // if it is still invisible and waiting to be
      // safe to clean up
      this.turnOffUI();
    })

    this.uiRoot.connectLocalBroadcastEvent(Events.showPotentialFollowEvent, (data) => {
      if (this.isDigPressed) {
        // Not safe to show UI
        return;
      }

      if (!this.ignorePlayers.includes(data.player)) {
        this.possibleFriend = data.player
        this.visible.set(this.possibleFriend !== undefined, [this.localPlayer])
        if (this.possibleFriend !== undefined) {
          let friendName = "";
          try {
            friendName = this.possibleFriend.name.get();
          } catch (e) { }
          if (friendName !== "") {
            this.setFriendIcon(this.possibleFriend)
            this.friendText.set("Follow @" + friendName + " for $" + data.bonus + " more friends bonus!", [this.localPlayer])
            this.timingText.set("(" + FollowPlayerUI.maxDuration + "s)", [this.localPlayer])
            this.dialogTimer = FollowPlayerUI.maxDuration
            this.seconds = FollowPlayerUI.maxDuration
            this.isInvisible = false;
            this.opacity.set((Animation.timing(1, { duration: 500, easing: Easing.inOut(Easing.ease) })), undefined, [this.localPlayer]);
            this.updateSubscription?.disconnect()
            this.updateSubscription = this.uiRoot.connectLocalBroadcastEvent(World.onUpdate, (data) => {
              this.dialogTimer -= data.deltaTime
              let remainingSeconds = Math.ceil(this.dialogTimer)
              if (remainingSeconds != this.seconds) {
                this.seconds = Math.max(0, remainingSeconds)

                this.timingText.set("(" + this.seconds + "s)", [this.localPlayer])
                if (this.seconds <= 0) {
                  this.uiRoot.sendNetworkBroadcastEvent(AnalyticsManager.clientLogToServer, { player: this.localPlayer, log_type: LogType.TASK_END, taskKey: 'follow_dialog', taskType: "timeout" }, [this.uiRoot.world.getServerPlayer()]);
                  this.turnOffUI();
                }
              }
            })
          }
        }
      }
    })

    this.uiRoot.connectNetworkBroadcastEvent(Events.itemSelected, (data) => {
      this.visible.set(false, [this.localPlayer])
    })
  }

  async setFriendIcon(player: Player) {
    this.friendImage.set(await Social.getAvatarImageSource(player), [this.localPlayer])
  }


  iconStyle: ImageStyle = {};
  visible: Binding<boolean> = new Binding<boolean>(false);
  friendText: Binding<string> = new Binding<string>("");
  friendImage: Binding<ImageSource> = new Binding<ImageSource>(ImageSource.fromTextureAsset(new Asset(BigInt(1304161181004610), BigInt(0))))

  turnOffUI() {
    if (this.updateSubscription !== undefined) {
      this.updateSubscription.disconnect()
      this.updateSubscription = undefined
    }

    if (!this.isDigPressed) {
      // Safe to turn off UI because we're not digging
      this.visible.set(false, [this.localPlayer])
      this.possibleFriend = undefined;
    }
    else {
      // NOT safe to turn off UI - use opacity instead
      this.opacity.set(0);
      this.isInvisible = true;
    }
  }

  onPressFriendButton() {
    if (this.isInvisible) {
      log.info("is invisible)")
      return;
    }

    if (this.possibleFriend) {
      Social.showFollowRequestModal(this.uiRoot.world.getLocalPlayer(), this.possibleFriend);
      this.ignorePlayers.push(this.possibleFriend)
    }
    this.uiRoot.sendNetworkBroadcastEvent(AnalyticsManager.clientLogToServer, { player: this.uiRoot.world.getLocalPlayer(), log_type: LogType.TASK_END, taskKey: 'follow_dialog', taskType: "yes" }, [this.uiRoot.world.getServerPlayer()]);

    this.turnOffUI();
  }

  onPressIgnoreButton() {
    if (this.isInvisible) {
      return;
    }

    if (this.possibleFriend) {
      this.ignorePlayers.push(this.possibleFriend)
    }
    this.uiRoot.sendNetworkBroadcastEvent(AnalyticsManager.clientLogToServer, { player: this.uiRoot.world.getLocalPlayer(), log_type: LogType.TASK_END, taskKey: 'follow_dialog', taskType: "no" }, [this.uiRoot.world.getServerPlayer()]);

    this.turnOffUI();
  }

  createPressableView() {
    return View({ //CTAGroup
      children: [
        Pressable({ //button_No
          children: [Text({ // No
            text: "No",
            style: {
              color: "#61470B",
              fontFamily: "Roboto",
              textAlign: "center",
              textAlignVertical: "center",
              fontSize: 20,
              fontWeight: "700"
            }
          })],
          style: {
            display: "flex",
            width: 80,
            height: 36,
            paddingHorizontal: 12,
            justifyContent: "center",
            alignItems: "center",
            borderRadius: 12,
            borderBottomWidth: 4,
            borderColor: "#CCA855",
            backgroundColor: "#FFCB5C",
            flexDirection: "row"
          },
          onClick: this.onPressIgnoreButton.bind(this),
          propagateClick: false,
        }),
        View({ //button_Follow
          children: [
            Pressable({ //BG
              children: [],
              style: {
                width: 160,
                height: 36,
                position: "absolute",
                borderRadius: 12,
                borderBottomWidth: 4,
                borderColor: "#49A24C",
                backgroundColor: "#70C04E",
                left: 0,
                top: 0
              },
              onClick: this.onPressFriendButton.bind(this),
              propagateClick: false,
            }),
            Text({ // Follow
              text: "Follow  ",
              style: {
                color: "#FFF",
                fontFamily: "Roboto",
                textAlign: "center",
                textAlignVertical: "center",
                fontSize: 20,
                marginRight: 4,
                fontWeight: "700"
              }
            }),
            Text({ // (12s)
              text: this.timingText,
              style: {
                color: "#FFF",
                fontFamily: "Roboto",
                textAlign: "center",
                textAlignVertical: "center",
                fontSize: 16,
                fontWeight: "700",
              }
            })],
          style: {
            display: "flex",
            width: 160,
            height: 36,
            paddingLeft: 6,
            paddingBottom: 4,
            justifyContent: "center",
            alignItems: "center",
            marginLeft: 8,
            flexDirection: "row"
          },
        })],
      style: {
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        position: "absolute",
        width: "100%",
        bottom: 4,
        flexDirection: "row",
      }
    })
  }

  createView() {
    return UINode.if(this.visible, View({ //UISocialToastNotif
      children: [
        View({ //ToastNotification
          children: [
            View({ //Content
              children: [
                Image({ //icn_userAvatar
                  source: this.friendImage,

                  style: {
                    display: "flex",
                    width: 44,
                    height: 44,
                    alignItems: "flex-start",
                    resizeMode: "cover",
                    flexDirection: "row"
                  }
                }),
                View({ //Spacer
                  style: {
                    width: 12,
                    height: 12
                  }
                }),
                Text({ // You just shoveled together! Follow @Chirashidon for $50 more shovel together bonus cash!
                  text: this.friendText,
                  style: {
                    width: 320,
                    color: "#646E7B",
                    fontFamily: "Roboto",
                    fontSize: 16,
                    fontWeight: "700"
                  }
                })],
              style: {
                display: "flex",
                paddingTop: 16,
                paddingRight: 12,
                paddingBottom: 46,
                paddingLeft: 12,
                justifyContent: "center",
                alignItems: "center",
                borderRadius: 16,
                backgroundColor: "#ECFFF5",
                flexDirection: "row"
              }
            }),
            this.createPressableView(),
            View({ //Title
              children: [Text({ // More Friends More Bonus Cash!
                text: "You just Shoveled Together!",
                style: {
                  color: "#2A325C",
                  textAlign: "center",
                  fontFamily: "Roboto",
                  fontSize: 16,
                  fontWeight: "700"
                }
              })],
              style: {
                display: "flex",
                height: 24,
                paddingVertical: 0,
                paddingHorizontal: 32,
                top: -12,
                justifyContent: "center",
                alignItems: "center",
                alignSelf: "center",
                borderRadius: 12,
                borderWidth: 2,
                borderColor: "#ECFFF5",
                backgroundColor: "#30E389",
                flexDirection: "row",
                position: "absolute"
              }
            }),
          ],
          style: {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            alignSelf: "center"
          }
        })],
      style: {
        display: "flex",
        width: "100%",
        height: "100%",
        paddingVertical: 70,
        paddingHorizontal: 0,
        flexDirection: "column",
        alignItems: "flex-start",
        position: "absolute",
        opacity: this.opacity.interpolate([0, 1], [0, 1]),
        bottom: "-36%",
      }
    }))
  }
}
