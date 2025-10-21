/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { DigMinigame } from "DigMinigame";
import { FollowStatus } from 'Enums';
import { Events, SocialBonusPayload } from "Events";
import { FollowerList } from 'FollowerList';
import { SocialDigBonus, SocialDigEntry } from 'FollowerManager';
import { EventSubscription, Player, World } from 'horizon/core';
import { Social } from 'horizon/social';
import { AnimatedBinding, Animation, Binding, DynamicList, Easing, Image, ImageSource, UINode, View } from 'horizon/ui';
import { PlayerEffects } from "PlayerEffectsController";
import { UI_Utils } from 'UI_Utils';
import { UIView_InteractionNonBlocking3Base } from 'UIRoot_ChildrenBase';
import { UIRoot_InteractionNonBlocking3 } from 'UIRoot_InteractionNonBlocking3';
import { UIView_Fanfare } from 'UIView_Fanfare';

export class UIView_FollowBonus extends UIView_InteractionNonBlocking3Base {

  static readonly visibleDuration: number = 2.5

  visible!: Binding<boolean>
  socialDigBonus: SocialDigBonus = new SocialDigBonus()
  socialDigIndexes!: Binding<number[]>
  updateSubscription: EventSubscription | undefined = undefined
  avatarImages: Binding<ImageSource>[] = []
  bonusText: Binding<string>[] = []
  totalBonusText!: Binding<string>
  visibleTimer: number = 0
  bonusIncrements: number[] = []
  topOffset: AnimatedBinding
  leftOffset: AnimatedBinding
  opacityChange: AnimatedBinding
  pendingReward: boolean = false
  isDigging: boolean = false


  constructor(uiRoot: UIRoot_InteractionNonBlocking3) {
    super(uiRoot);
    this.visible = new Binding<boolean>(false)
    this.socialDigIndexes = new Binding<number[]>([])
    this.totalBonusText = new Binding<string>("")
    this.topOffset = new AnimatedBinding(0);
    this.leftOffset = new AnimatedBinding(0);
    this.opacityChange = new AnimatedBinding(0);
    this.uiRoot.connectNetworkBroadcastEvent(Events.friendBonusEvent, (payload) => {
      this.onFriendBonus(payload)
      if (this.isDigging) {
        this.cancelPendingReward()
      }
    })

    this.uiRoot.connectNetworkBroadcastEvent(Events.itemSelected, (data) => {
      //don't show if we start a new dig
      this.cancelPendingReward()
    })

    this.uiRoot.connectNetworkBroadcastEvent(UIView_Fanfare.playFanfare, (payload) => {
      //don't show if we get a fanfare for the dig
      this.cancelPendingReward()
    })

    this.uiRoot.connectLocalBroadcastEvent(Events.digResultHUDClose, (data) => {
      this.isDigging = false
      if (this.pendingReward) {
        this.pendingReward = false
        this.showSocialBonus()
        this.uiRoot.sendNetworkBroadcastEvent(Events.claimSocialBonusEvent, { player: this.localPlayer })
      }
    })

    this.uiRoot.connectNetworkBroadcastEvent(DigMinigame.minigameStartedEvent, (data) => {
      this.cancelPendingReward()
      this.isDigging = true
    })
  }

  private cancelPendingReward() {
    if (this.pendingReward) {
      this.pendingReward = false
      this.uiRoot.sendNetworkBroadcastEvent(Events.claimSocialBonusEvent, { player: this.localPlayer })
    }
    this.updateSubscription?.disconnect()
    this.updateSubscription = undefined;
    this.visible.set(false, [this.localPlayer])
  }

  private async onFriendBonus(payload: SocialBonusPayload) {
    this.socialDigBonus.totalBonus = payload.totalBonus;
    this.socialDigBonus.entries = []
    this.totalBonusText.set(`$${payload.totalBonus}`, [this.localPlayer])
    this.bonusIncrements = payload.bonusIncrement
    let indexes: number[] = []
    this.topOffset.set((Animation.timing(1, { duration: 500, easing: Easing.inOut(Easing.ease) })), undefined, [this.localPlayer]);
    this.leftOffset.set((Animation.timing(1, { duration: 500, easing: Easing.inOut(Easing.ease) })), undefined, [this.localPlayer]);
    this.opacityChange.set((Animation.timing(1, { duration: 500, easing: Easing.inOut(Easing.ease) })), undefined, [this.localPlayer]);
    for (let i = 0; i < payload.players.length; ++i) {
      indexes.push(i)
      this.socialDigBonus.entries.push(new SocialDigEntry(payload.players[i], payload.status[i], payload.bonus[i]))
      if (i >= this.bonusText.length) {
        this.bonusText.push(new Binding<string>(""))
        this.avatarImages.push(new Binding<ImageSource>(new ImageSource()))
      }
      this.avatarImages[i].set(await Social.getAvatarImageSource(payload.players[i]), [this.localPlayer])
      this.bonusText[i].set(`+${payload.bonus[i]}$`, [this.localPlayer])
    }
    this.pendingReward = this.socialDigBonus.entries.length > 0
    this.socialDigIndexes.set(indexes, [this.localPlayer])
  }

  private showSocialBonus() {
    this.uiRoot.sendLocalBroadcastEvent(PlayerEffects.sellEffectLocal, {})
    this.visibleTimer = UIView_FollowBonus.visibleDuration
    this.topOffset.set((Animation.timing(1, { duration: 500, easing: Easing.inOut(Easing.ease) })), undefined, [this.localPlayer]);
    this.leftOffset.set((Animation.timing(1, { duration: 500, easing: Easing.inOut(Easing.ease) })), undefined, [this.localPlayer]);
    this.opacityChange.set((Animation.timing(1, { duration: 500, easing: Easing.inOut(Easing.ease) })), undefined, [this.localPlayer]);
    this.visible.set(true, [this.localPlayer])
    if (this.updateSubscription === undefined) {
      this.updateSubscription = this.uiRoot.connectLocalBroadcastEvent(World.onUpdate, (data) => {
        this.visibleTimer -= data.deltaTime
        if (this.visibleTimer <= 0) {
          this.topOffset.set((Animation.timing(0, { duration: 500, easing: Easing.inOut(Easing.ease) })), undefined, [this.localPlayer]);
          this.leftOffset.set((Animation.timing(0, { duration: 500, easing: Easing.inOut(Easing.ease) })), undefined, [this.localPlayer]);
          this.opacityChange.set((Animation.timing(0, { duration: 500, easing: Easing.inOut(Easing.ease) })), undefined, [this.localPlayer]);
          this.updateSubscription?.disconnect()
          this.updateSubscription = undefined;
          this.uiRoot.async.setTimeout(() => {
            this.visible.set(false, [this.localPlayer])
            const localPlayer = this.uiRoot.world.getLocalPlayer()
            let possibleFriend: Player | undefined = undefined
            let bonusIncrement = 50
            for (let i = 0; i < this.socialDigBonus.entries.length; ++i) {
              if (!FollowerList.Instance().isPlayerFollowing(localPlayer, this.socialDigBonus.entries[i].player)) {
                possibleFriend = this.socialDigBonus.entries[i].player
                if (this.socialDigBonus.entries[i].followStatus === FollowStatus.NotFollowing && this.bonusIncrements.length > 0) {
                  bonusIncrement = this.bonusIncrements[0]
                }
                else if (this.socialDigBonus.entries[i].followStatus === FollowStatus.FollowingUs && this.bonusIncrements.length > 1) {
                  bonusIncrement = this.bonusIncrements[1]
                }
                break
              }
            }
            if (possibleFriend) {
              this.uiRoot.sendLocalBroadcastEvent(Events.showPotentialFollowEvent, { player: possibleFriend, bonus: bonusIncrement })
            }
            this.socialDigBonus.entries = []
          }, 500)
        }
      })
    }
  }

  private followerBonus(index: number): UINode {
    let entry = this.socialDigBonus.entries[index]
    if (entry) {
      return UINode.if(entry.followStatus === FollowStatus.MutualFollowing, View({
        children: [
          View({ //Avatar State
            children: [
              Image({ //icn_userAvatar
                source: this.avatarImages[index],
                style: {
                  display: "flex",
                  width: 50,
                  height: 50,
                  alignItems: "flex-start",
                  borderRadius: 25,
                  borderWidth: 3,
                  borderColor: "#30E389",
                  resizeMode: "cover",
                  flexDirection: "row"
                }
              }),
              /*View({ //FriendStatus
                  children: [
                    Image({ //icn_2wayfriend
                      source: ImageSource.fromTextureAsset(this.uiRootNonBlocking.props.icn_2wayfriend!),
                      style: {
                          display: "flex",
                          width: 16,
                          height: 16,
                          alignItems: "flex-start",
                          flexShrink: 0,
                          resizeMode: "cover",
                          flexDirection: "row"
                      }
                    })
                  ],
                  style: {
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      alignItems: "center",
                      width: 24,
                      height: 24,
                      position: "absolute",
                      right: -7,
                      bottom: 0,
                      borderRadius: 12,
                      borderWidth: 2,
                      borderColor: "#023503",
                      backgroundColor: "#30E389"
                  }
              }) */
            ],
            style: {
              display: "flex",
              alignItems: "flex-end",
              flexDirection: "row",
              borderRadius: 25,
              backgroundColor: "#FFF"
            }
          }),
          /*Text({ // +$125
              text: this.bonusText[index],
              style: {
                  color: "#023503",
                  textAlign: "center",
                  fontFamily: "Roboto",
                  fontSize: 20,
                  fontWeight: "900"
              }
          })*/
        ],
        style: {
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          marginLeft: -30
        }
      }), View({
        children: [View({ //Avatar State
          children: [
            Image({ //icn_userAvatar
              source: this.avatarImages[index],
              style: {
                display: "flex",
                width: 50,
                height: 50,
                alignItems: "flex-start",
                borderRadius: 25,
                borderWidth: 3,
                borderColor: "#30E389",
                resizeMode: "cover",
                flexDirection: "row"
              }
            }),
            /*UINode.if(entry.followStatus !== FollowStatus.NotFollowing, View({ //FriendStatus
                children: [

                Image({ //icn_1wayfriend
                    source: ImageSource.fromTextureAsset(this.uiRootNonBlocking.props.icn_1wayfriend!),

                    style: {
                        display: "flex",
                        width: 16,
                        height: 16,
                        alignItems: "flex-start",
                        flexShrink: 0,
                        resizeMode: "cover",
                        flexDirection: "row"
                    }
                })],
                style: {
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    width: 24,
                    height: 24,
                    position: "absolute",
                    right: -7,
                    bottom: 0,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: "#023503",
                    backgroundColor: "#30E389"
                }
            }))*/
          ],
          style: {
            display: "flex",
            alignItems: "flex-end",
            backgroundColor: "#FFF",
            borderRadius: 25,
            flexDirection: "row"
          }
        }),
          /*Text({ // +$125
              text: this.bonusText[index],
              style: {
                  color: "#023503",
                  textAlign: "center",
                  fontFamily: "Roboto",
                  fontSize: 16,
                  fontWeight: "700"
              }
          })*/
        ],
        style: {
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          marginLeft: -30
        }

      }))
    } else {
      return View({})
    }
  }

  createView() {
    return UINode.if(this.visible, View({ //UISocialBonus
      children: [
        View({ //Social Bonus Cash Widget
          children: [
            /*View({ //BG
                style: {
                width: 478,
                height: 118,
                flexShrink: 0,
                borderRadius: 24,
                backgroundColor: "#ECFFF5",
                position: "absolute",
                left: 0,
                top: 20
                }
                }),*/
            View({ //Title Group Small
              children: [UI_Utils.outlinedText({ // Shovel Together text
                text: "Friends Bonus!",
                style: {
                  color: "#FFF",
                  textAlign: "center",
                  textAlignVertical: "center",
                  fontFamily: "Roboto",
                  fontSize: 20,
                  fontWeight: "900"
                },
                outlineSize: 2,
              })],
              style: {
                display: "flex",
                height: 40,
                paddingHorizontal: 24,
                justifyContent: "center",
                alignItems: "center",
                flexShrink: 0,
                borderRadius: 20,
                //borderWidth: 4,
                //borderColor: "#FFF",
                //backgroundColor: "#30E389",
                flexDirection: "row",
                position: "absolute",
                alignSelf: "center",
                top: 0
              }
            }),
            View({ //Users Group
              children: [
                DynamicList(
                  {
                    data: this.socialDigIndexes, renderItem: (id: number) => {
                      return this.followerBonus(id)
                    },
                    style: {
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      flexDirection: "row-reverse",
                      position: "absolute",
                      left: 0,
                      top: 0,
                    }
                  }
                )
              ],
              style: {
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                flexDirection: "row-reverse",
                position: "absolute",
                alignSelf: "center",
                top: 30
              }
            }),
            UI_Utils.outlinedText({ // Total text
              text: this.totalBonusText,
              style: {
                color: "#FFF",
                textAlign: "left",
                fontFamily: "Roboto",
                fontSize: 24,
                fontWeight: "900",
                position: "absolute",
                alignSelf: "center",
                top: 80,
                left: 0
              },
              outlineSize: 2,
            }),
            Image({ //icn_money
              source: ImageSource.fromTextureAsset(this.uiRootNonBlocking.props.icn_money!),
              style: {
                width: 36,
                height: 36,
                flexShrink: 0,
                resizeMode: "cover",
                position: "absolute",
                alignSelf: "center",
                left: -40,
                top: 74
              }
            })],
          style: {
            //width: 478,
            height: 138,
            position: "absolute",
            left: this.leftOffset.interpolate([0, 1], ["20%", "31%"]),
            top: this.topOffset.interpolate([0, 1], ["45%", "45%"]),
            opacity: this.opacityChange.interpolate([0, 1], [0, 1]),
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
        position: "absolute"
      }
    }))

  }
}
