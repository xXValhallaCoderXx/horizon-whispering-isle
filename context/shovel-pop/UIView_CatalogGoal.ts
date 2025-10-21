/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { AudioBank } from 'AudioBank';
import { allHudElementTypes, HUDElementType } from 'Enums';
import { Events } from 'Events';
import { LocalEvent, NetworkEvent, Player } from 'horizon/core';
import { AnimatedBinding, Animation, Binding, Easing, Image, ImageSource, Pressable, Text, UINode, View } from 'horizon/ui';
import { getIslandCollectionRewardAmount, getIslandCollectionRewardExpReward, getIslandCollectionRewardGemReward, Islands } from 'Islands';
import { Logger } from 'Logger';
import { GetNewItemCount, PlayerCatalogData } from 'PlayerCatalogData';
import { PlayerCatalogManager } from 'PlayerCatalogManager';
import { PlayerInteractionTrigger } from 'PlayerInteractionTrigger';
import { UI_Catalog_Events } from 'UI_Catalog_Events';
import { UI_Utils } from 'UI_Utils';
import { UIView_InteractionNonBlocking3Base } from 'UIRoot_ChildrenBase';
import { UIRoot_InteractionNonBlocking3 } from 'UIRoot_InteractionNonBlocking3';
import { UIView_CatalogHudButton } from 'UIView_CatalogHudButton';

const HIDE_HUD_ELEMENTS = HUDElementType.Location | HUDElementType.Inventory | HUDElementType.AboveInventory | HUDElementType.PotionInventory;
const ISLAND_REWARD_CLAIM_DURATION = 1400;
const ISLAND_REWARD_CLAIM_TRIGGER_DELAY = 900;
const ISLAND_REWARD_CLAIM_AUDIO_DELAY = 350;

const log = new Logger("UIView_CatalogGoal");
const disableContext = "UIView_CatalogGoal";

export class UIView_CatalogGoal extends UIView_InteractionNonBlocking3Base {

  static toggleCatalogGoal = new LocalEvent('catalogGoal_toggleCatalogGoal');
  static close = new NetworkEvent('catalogGoal_close');

  private isOpen = false;
  private newItemCount = 0;
  private island = Islands.BeachCamp;

  private isOpenBinding = new Binding(false);
  private goalText = new Binding("3/10 New Items");
  private rewardText = new Binding("+320 XP");
  private newItemCountText = new Binding("");
  private goalProgressText = new Binding("");
  private canClaimReward = new Binding(true);
  private claimRewardScale = new AnimatedBinding(0);
  private isInteractable = new Binding(true);

  private gemVisible = new Binding(false);

  constructor(uiRoot: UIRoot_InteractionNonBlocking3) {
    super(uiRoot);

    this.uiRoot.connectLocalBroadcastEvent(UIView_CatalogGoal.toggleCatalogGoal, _ => this.onToggleCatalogGoal());
    this.uiRoot.connectNetworkBroadcastEvent(UIView_CatalogGoal.close, _ => this.setOpen(false));
    this.uiRoot.connectLocalBroadcastEvent(UIView_CatalogHudButton.incrementNewItemCount, () => this.onIncrementNewItemCount());
    this.uiRoot.connectNetworkBroadcastEvent(PlayerCatalogManager.clearNewItems, (payload) => this.onClearNewItems(payload.player));
    this.uiRoot.connectNetworkBroadcastEvent(PlayerCatalogManager.receivePlayerCatalog, (payload) => this.onPlayerCatalogReceived(payload.playerCatalog));
    this.uiRoot.connectNetworkBroadcastEvent(PlayerCatalogManager.receiveCurrentCatalogGoal, (payload) => this.onCurrentCatalogGoalReceived(payload.island, payload.level, payload.collected));
    this.uiRoot.connectNetworkBroadcastEvent(PlayerCatalogManager.islandRewardComplete, (payload) => this.onIslandRewardComplete(payload.player, payload.island, payload.level));

    // this.uiRoot.connectNetworkBroadcastEvent(Events.debugAction1, player => {
    //   this.claimReward();
    // })
  }

  private onPlayerCatalogReceived(playerCatalog: PlayerCatalogData) {
    this.newItemCount = GetNewItemCount(playerCatalog);
    this.newItemCountText.set(this.getNewItemCountText(), [this.localPlayer]);
  }

  private onCurrentCatalogGoalReceived(island: Islands, level: number, collected: number) {
    const currentGoalAmount = getIslandCollectionRewardAmount(island, level) ?? 0;
    const prevGoalAmount = (level > 0) ? getIslandCollectionRewardAmount(island, level - 1) ?? 0 : 0;
    const nextGoal = currentGoalAmount - prevGoalAmount;
    const collectedToNextGoal = collected - prevGoalAmount;
    const readyToClaim = collectedToNextGoal >= nextGoal;
    this.goalProgressText.set(readyToClaim ?
      "Catalog goal complete!" :
      "Your next catalog goal:"
    , [this.localPlayer]);
    this.goalText.set(`${collectedToNextGoal}/${nextGoal} New Items`, [this.localPlayer]);
    const expReward = getIslandCollectionRewardExpReward(island, level)!;
    const gemReward = getIslandCollectionRewardGemReward(island, level)!;

    let rewards = []
    if (expReward > 0) {
      rewards.push('+' + expReward + "XP")
    }
    if (gemReward > 0) {
      this.gemVisible.set(true, [this.localPlayer]);
      rewards.push('+' + gemReward)
    }
    this.rewardText.set(rewards.join(' '), [this.localPlayer]);
    this.canClaimReward.set(readyToClaim, [this.localPlayer]);
    this.island = island;
  }

  protected onIncrementNewItemCount() {
    this.newItemCount++;
    this.newItemCountText.set(this.getNewItemCountText(), [this.localPlayer]);
  }

  private getNewItemCountText() {
    return this.newItemCount <= 0 ? "" : this.newItemCount > 9 ? "9+" : this.newItemCount.toString();
  }

  private onClearNewItems(player: Player) {
    if (player !== this.localPlayer) {
      return;
    }
    this.newItemCount = 0;
    this.newItemCountText.set("", [this.localPlayer]);
  }

  private onToggleCatalogGoal() {
    this.setOpen(!this.isOpen);
  }

  private setOpen(isOpen: boolean) {
    this.isOpen = isOpen;
    this.isOpenBinding.set(isOpen, [this.localPlayer]);
    if (isOpen) {
      this.uiRoot.sendLocalBroadcastEvent(Events.localHideHUD, { context: disableContext, exclude: allHudElementTypes & ~HIDE_HUD_ELEMENTS });
      this.uiRoot.sendNetworkBroadcastEvent(PlayerInteractionTrigger.addDisableContext, { context: disableContext }, [this.localPlayer]);
    } else {
      this.uiRoot.sendLocalBroadcastEvent(Events.localShowHUD, { context: disableContext });
      this.uiRoot.sendNetworkBroadcastEvent(PlayerInteractionTrigger.removeDisableContext, { context: disableContext }, [this.localPlayer]);
    }
  }

  private onIslandRewardComplete(player: Player, island: Islands, level: number): void {
    if (this.localPlayer !== player) {
      return;
    }
    // TODO: DO I need to do anything here?  I don't think so...
  }

  private goToCatalog() {
    this.uiRoot.sendLocalBroadcastEvent(UI_Catalog_Events.requestToggleCatalog, {});
    this.setOpen(false);
  }

  private claimReward() {
    this.isInteractable.set(false, [this.localPlayer]);
    this.claimRewardScale.set(Animation.timing(1, { duration: ISLAND_REWARD_CLAIM_DURATION, easing: Easing.linear }), undefined, [this.localPlayer]);
    this.uiRoot.async.setTimeout(() => {
      this.uiRoot.sendNetworkBroadcastEvent(PlayerCatalogManager.claimIslandReward, { player: this.localPlayer, island: this.island });
    }, ISLAND_REWARD_CLAIM_TRIGGER_DELAY);
    this.uiRoot.async.setTimeout(() => {
      AudioBank.play('gem');
    }, ISLAND_REWARD_CLAIM_AUDIO_DELAY);
    this.uiRoot.async.setTimeout(() => {
      this.claimRewardScale.stopAnimation();
      this.claimRewardScale.set(0, undefined, [this.localPlayer]);
      this.isInteractable.set(true, [this.localPlayer]);
    }, ISLAND_REWARD_CLAIM_DURATION);
  }

  createView(): UINode {
    return UINode.if(this.isOpenBinding, View({ //UICatalogStep1Modal
      children: [View({ //Catalog Step1 Modal
        children: [View({ //BG
          children: [],
          style: {
            display: "flex",
            width: 422,
            paddingVertical: 0,
            paddingHorizontal: 8,
            flexDirection: "column",
            alignItems: "center",
            flexShrink: 0,
            alignSelf: "stretch",
            borderRadius: 30,
            borderWidth: 4,
            borderColor: "#FECA47",
            backgroundColor: "#FFF1C1"
          }
        }),
        View({ //Content
          children: [View({ //Top Panel
            children: [Image({ //icn_Catalog
              source: ImageSource.fromTextureAsset(this.props.catalogHud_image!),
              style: {
                width: 128,
                height: 128,
                resizeMode: "cover"
              }
            }),
            Text({ // Your next catalog goal:
              text: this.goalProgressText,
              style: {
                color: "#876849",
                textAlign: "center",
                fontFamily: "Roboto",
                fontSize: 20,
                fontWeight: "700"
              }
            }),
            View({ //Property Widget New
              children: [Text({ // 3/10 New Items
                text: this.goalText,
                style: {
                  color: "#573615",
                  textAlign: "center",
                  fontFamily: "Roboto",
                  fontSize: 24,
                  fontWeight: "700"
                }
              })],
              style: {
                display: "flex",
                paddingVertical: 8,
                paddingHorizontal: 44,
                alignItems: "center",
                borderRadius: 24,
                backgroundColor: "#FFF9E9",
                marginTop: 12,
                flexDirection: "row"
              }
            })],
            style: {
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              alignSelf: "stretch"
            }
          }),
          View({ //Divider
            children: [View({ //Divider
              style: {
                height: 4,
                flexGrow: 1,
                flexShrink: 0,
                flexBasis: 0,
                borderRadius: 2,
                backgroundColor: "#FFD673"
              }
            }),
            View({ //Spacer
              style: {
                width: 8,
                height: 8
              }
            }),
            Text({ // Rewards
              text: "Rewards",
              style: {
                color: "#876849",
                fontSize: 20,
                fontWeight: "700"
              }
            }),
            View({ //Spacer
              style: {
                width: 8,
                height: 8
              }
            }),
            View({ //Divider
              style: {
                height: 4,
                flexGrow: 1,
                flexShrink: 0,
                flexBasis: 0,
                borderRadius: 1.6,
                backgroundColor: "#FFD673"
              }
            })],
            style: {
              display: "flex",
              height: 50,
              alignItems: "center",
              alignSelf: "stretch",
              flexDirection: "row"
            }
          }),
          View({ //Requirement Group
            children: [
              View({
                style: {
                  height: 50,  // Holds space for the absolute positioned reward text outside of this view context
                }
              }),
              // View({ //RewardGroup
              //   children: [
              // View({ //RewardGroupWithIcon
              //   children: [View({ //Content
              //     children: [Text({ // +320
              //       text: "+32",
              //       style: {
              //         color: "#573615",
              //         textAlign: "center",
              //         fontFamily: "Roboto",
              //         fontSize: 24,
              //         fontWeight: "700"
              //       }
              //     }),
              //     Image({ //Icon
              //       source: ImageSource.fromTextureAsset(this.props.missingTexture!),
              //       style: {
              //         width: 34,
              //         alignSelf: "stretch",
              //         resizeMode: "cover",
              //         marginLeft: 2
              //       }
              //     })],
              //     style: {
              //       display: "flex",
              //       alignItems: "center",
              //       flexGrow: 1,
              //       flexShrink: 0,
              //       flexBasis: 0,
              //       flexDirection: "row"
              //     }
              //   })],
              //   style: {
              //     display: "flex",
              //     height: 42,
              //     paddingRight: 24,
              //     paddingLeft: 36,
              //     flexDirection: "column",
              //     justifyContent: "center",
              //     alignItems: "center",
              //     borderTopLeftRadius: 0,
              //     borderTopRightRadius: 21,
              //     borderBottomLeftRadius: 0,
              //     borderBottomRightRadius: 21,
              //     borderWidth: 3,
              //     borderColor: "#FFB330",
              //     backgroundColor: "rgb(255, 255, 255)",
              //     opacity: 0.77,
              //     marginLeft: -24
              //   }
              // }),
              // Image({ //icn_giftBox
              //   source: ImageSource.fromTextureAsset(this.props.icn_giftbox!),
              //   style: {
              //     width: 48,
              //     height: 48,
              //     resizeMode: "cover"
              //   }
              // })

              // ],
              // style: {
              //   display: "flex",
              //   alignItems: "center",
              //   flexDirection: "row-reverse"
              // }
              // }),,

              // View({ //RewardGroup
              //   children: [
              //     View({ //RewardGroup
              //       children: [View({ //Content
              //         children: [Text({ // +320
              //           text: this.rewardText,
              //           style: {
              //             color: "#573615",
              //             textAlign: "center",
              //             fontFamily: "Roboto",
              //             fontSize: 24,
              //             fontWeight: "700"
              //           }
              //         })],
              //         style: {
              //           display: "flex",
              //           alignItems: "center",
              //           flexGrow: 1,
              //           flexShrink: 0,
              //           flexBasis: 0,
              //           flexDirection: "row"
              //         }
              //       })],
              //       style: {
              //         display: "flex",
              //         height: 42,
              //         paddingRight: 24,
              //         paddingLeft: 36,
              //         flexDirection: "column",
              //         justifyContent: "center",
              //         alignItems: "center",
              //         borderTopLeftRadius: 21,
              //         borderTopRightRadius: 21,
              //         borderBottomLeftRadius: 21,
              //         borderBottomRightRadius: 21,
              //         borderWidth: 3,
              //         borderColor: "#FFB330",
              //         backgroundColor: "rgb(255, 255, 255)",
              //         opacity: 0.77,
              //         marginLeft: -24
              //       }
              //     }),
              //     Image({ //icn_giftBox
              //       source: ImageSource.fromTextureAsset(this.props.icn_giftbox!),
              //       style: {
              //         width: 48,
              //         height: 48,
              //         resizeMode: "cover",
              //         position: "absolute",
              //         alignSelf: "center",
              //         left: 0,
              //         top: 0,
              //       }
              //     }),
              //   ],
              //   style: {
              //     display: "flex",
              //     alignItems: "center",
              //     marginTop: 8,
              //     flexDirection: "row-reverse"
              //   }
              // }),
              UINode.if(this.canClaimReward, Pressable({ //button_Catalog
                children: [Text({ // Go to Catalog
                  text: "Claim!",
                  style: {
                    color: "#FFF",
                    fontFamily: "Roboto",
                    fontSize: 24,
                    fontWeight: "700"
                  }
                })
                ],
                style: {
                  display: "flex",
                  width: 190,
                  height: 48,
                  justifyContent: "center",
                  alignItems: "center",
                  borderRadius: 15,
                  borderBottomWidth: 4,
                  borderColor: "#49A24C",
                  backgroundColor: "#70C04E",
                  marginLeft: 8,
                  marginTop: 16,
                  flexDirection: "row"
                },
                onClick: () => this.claimReward(),
              })),
            ],
            style: {
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              alignSelf: "stretch",
              borderRadius: 35
            }
          }),
          View({ //Spacer
            style: {
              width: 24,
              height: 24
            }
          }),
          View({ //Title
            children: [Text({ // Catalog Goal
              text: "Catalog Goal",
              style: {
                color: "#6E2F0E",
                textAlign: "center",
                fontFamily: "Roboto",
                fontSize: 24,
                fontWeight: "700"
              }
            })],
            style: {
              display: "flex",
              width: 334,
              paddingVertical: 4,
              paddingHorizontal: 8,
              justifyContent: "center",
              alignItems: "center",
              position: "absolute",
              left: 44,
              top: -17,
              borderRadius: 30,
              backgroundColor: "#FECA47",
              flexDirection: "row"
            }
          }),
          View({ //Btn Group
            children: [
              Pressable({ //button_Close
                children: [Text({ // Close
                  text: "Close",
                  style: {
                    color: "#61470B",
                    fontFamily: "Roboto",
                    fontSize: 24,
                    fontWeight: "700"
                  }
                })],
                style: {
                  display: "flex",
                  width: 190,
                  height: 48,
                  justifyContent: "center",
                  alignItems: "center",
                  borderRadius: 15,
                  borderBottomWidth: 4,
                  borderColor: "#CCA855",
                  backgroundColor: "#FFCB5C",
                  flexDirection: "row"
                },
                onClick: () => this.setOpen(false)
              }),
              Pressable({ //button_Catalog
                children: [Text({ // Go to Catalog
                  text: "Go to Catalog",
                  style: {
                    color: "#FFF",
                    fontFamily: "Roboto",
                    fontSize: 24,
                    fontWeight: "700"
                  }
                }),
                UINode.if(this.newItemCountText.derive(text => text !== ""), UI_Utils.makeNewBadge(this.newItemCountText, -20, -26))
                ],
                style: {
                  display: "flex",
                  width: 190,
                  height: 48,
                  justifyContent: "center",
                  alignItems: "center",
                  borderRadius: 15,
                  borderBottomWidth: 4,
                  borderColor: "#49A24C",
                  backgroundColor: "#70C04E",
                  marginLeft: 8,
                  flexDirection: "row"
                },
                onClick: () => this.goToCatalog(),
              })],
            style: {
              display: "flex",
              alignItems: "center",
              position: "absolute",
              bottom: -25,
              flexDirection: "row",
            }
          })],
          style: {
            display: "flex",
            padding: 24,
            flexDirection: "column",
            alignItems: "center",
            flexGrow: 1,
            flexShrink: 0,
            flexBasis: 0,
            marginLeft: -422
          }
        })],
        style: {
          display: "flex",
          width: 422,
          alignItems: "flex-start",
          flexShrink: 0,
          flexDirection: "row",
          opacity: this.claimRewardScale.interpolate([0, .1, .9, 1], [1, 0, 0, 1])
        }
      }),
      View({ //Reward Group
        children: [
          View({ //Reward Group
            children: [View({ //Content
              children: [
                Text({ // +320
                text: this.rewardText,
                style: {
                  color: "#573615",
                  textAlign: "center",
                  fontFamily: "Roboto",
                  fontSize: 24,
                  fontWeight: "700"
                }
              }),
            UINode.if(this.gemVisible, Image({ //icn_gem
                    source: ImageSource.fromTextureAsset(this.props.icn_gem!),
                    style: {
                      width: 28,
                      height: 28,
                      marginLeft: 2
                    }
                  })
                  ),
            ],
              style: {
                display: "flex",
                alignItems: "center",
                flexGrow: 1,
                flexShrink: 0,
                flexBasis: 0,
                flexDirection: "row"
              }
            })],
            style: {
              display: "flex",
              height: 42,
              paddingRight: 24,
              paddingLeft: 36,
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              borderTopLeftRadius: 0,
              borderTopRightRadius: 21,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 21,
              borderWidth: 3,
              borderColor: "#FFB330",
              backgroundColor: "rgb(255, 255, 255)",
              opacity: this.claimRewardScale.interpolate([0, .3, .79, .8, .9, 1], [.77, 1, 1, 0, 0, .77]),
              //opacity: 0.77,
              //marginLeft: -24
              marginLeft: -16
            }
          }),
          Image({ //icn_giftBox
            source: ImageSource.fromTextureAsset(this.props.icn_giftbox!),
            style: {
              width: 48,
              height: 48,
              resizeMode: "cover",
              //position: "absolute",
              //alignSelf: "center",
              left: -12,
              // top: 0,
            }
          }),
        ],
        style: {
          display: "flex",
          alignItems: "center",
          top: this.canClaimReward.derive((canClaim) => canClaim? 130 : 160),
          marginTop: 250,
          flexDirection: "row-reverse",
          position: "absolute",
          opacity: this.claimRewardScale.interpolate([0, .79, .8, .9, 1], [1, 1, 0, 0, 1]),
          transform: [
            { scale: this.claimRewardScale.interpolate([0, .1, .3, .4, .5, .6, .7, .8, .9, 1], [1, 1, 2, 2, 2.5, 2, 2, 2, 1, 1]) },
            { translateY: this.claimRewardScale.interpolate([0, .1, .3, .4, .5, .6, .7, .8, .9, 1], [0, 0, -40, -40, -34, -40, -40, -200, 0, 0]) }
          ]
        }
      })
      ],
      style: {
        display: "flex",
        width: "100%",
        height: "100%",
        justifyContent: "center",
        alignItems: "center",
        flexShrink: 0,
        flexDirection: "row",
        position: "absolute"
      }
    }));
  }
}
