/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_Player_Inventory } from 'BigBox_Player_Inventory';
import { CategoryUIData } from 'CategoryUIData';
import { HUDElementType } from 'Enums';
import { Events } from 'Events';
import { Asset, AudioGizmo, CodeBlockEvents, EventSubscription, Player } from 'horizon/core';
import { AnimatedBinding, Animation, Binding, Easing, Image, ImageSource, Pressable, Text, UIChildren, UINode, View } from 'horizon/ui';
import { Logger } from 'Logger';
import { PlayerDataEvents } from 'PlayerDataEvents';
import { PlayerInventoryData } from 'PlayerInventoryData';
import { QuestEvents, QuestManager } from 'QuestManager';
import { ShovelProgressionEvents } from 'ShovelProgressionEvents';
import { UI_Utils } from 'UI_Utils';
import { UIView_InteractionBlockingBase } from 'UIRoot_ChildrenBase';
import { UIRoot_InteractionBlocking } from 'UIRoot_InteractionBlocking';
import { PlayerMigration, MobileAppPlatform } from 'horizon/migration';

const SHOVELS_DISPLAYED_PER_PAGE = 3;
const MAX_RARITY_STARS = 0;
const CATEGORIES_PER_ROW = 3;
const CATEGORY_ROWS = 2;
const MAX_CATEGORIES = CATEGORIES_PER_ROW * CATEGORY_ROWS;
const SHOW_MISSING_STARS = false;
const OUTLINE_SIZE = 1;

const UPGRADE_ANIM_TIME = 1.2;

const SHOVELUTION_CLEAR_TIME = 0.5 * 1000

const log = new Logger("UIView_ShovelInventory");

export class UIView_MigrationRewards extends UIView_InteractionBlockingBase {
  private isOpenBinding!: Binding<boolean>;
  private unlockText!: Binding<string>
  private characterImage!: Binding<ImageSource>
  private readonly BlockingQuestId = 'talk_to_alen'
  private migratingPlayer: PlayerMigration

  constructor(uiRoot: UIRoot_InteractionBlocking) {
    super(uiRoot);
    this.migratingPlayer = new PlayerMigration(this.uiRoot.world.getLocalPlayer().id)
    if (this.migratingPlayer.mobileAppPlatform.get() === MobileAppPlatform.META_HORIZON) {
        this.uiRoot.connectNetworkBroadcastEvent(Events.migrationRewardsEvent, (data) => {
            if (data.isPirate) {
                this.unlockText.set("Pirate Cove is unlocked!")
                this.characterImage.set(ImageSource.fromTextureAsset(this.uiRootBlocking.props.icn_Fred!));
            }
            this.migratingPlayer.setMigrationComplete().then((migrated) => {
                this.show()
            });
        })
    }
}


  show() {
    this.uiRoot.sendLocalBroadcastEvent(Events.localHideHUD, { context: "migrated" });
    this.isOpenBinding.set(true, [this.localPlayer]);
    this.uiRootBlocking.setVisibility(true);
  }

  collect() {
    this.uiRoot.sendLocalBroadcastEvent(Events.localShowHUD, { context: "migrated" });
    this.uiRoot.sendNetworkBroadcastEvent(Events.migratePlayerCompleteEvent, {player: this.uiRoot.world.getLocalPlayer(), claimRewards: true}, [this.uiRoot.world.getServerPlayer()])
    this.uiRootBlocking.setVisibility(false);
    this.isOpenBinding.set(false, [this.localPlayer]);
  }

  createView(): UINode<any> {
    this.isOpenBinding = new Binding(false);
    this.characterImage = new Binding(ImageSource.fromTextureAsset(this.uiRootBlocking.props.icn_Doug!));
    this.unlockText = new Binding("Full game is unlocked!");
    return UINode.if(this.isOpenBinding, View({ //UIUnlockedFullGameReward
      children: [ View({ //Dimmer
          children: [  ],
          style: {
              display: "flex",
              width: "100%",
              height: "100%",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              position: "absolute",
              backgroundColor: "rgb(0, 0, 0)",
              opacity: 0.75,
              left: 0,
              top: 0
          }
      }),
      View({ //GemRegionToast
          children: [
            View({ //BG
              children: [  ],
              style: {
                  display: "flex",
                  width: "110%",
                  height: "110%",
                  position: "absolute",
                  borderRadius: 16,
                  borderWidth: 4,
                  top:24,
                  borderColor: "#FFC800",
                  backgroundColor: "#FFFCE0"
              }
          }),
          View({ //Title
              children: [
                Text({ // Welcome Back! Shoveler!
                  text: "Welcome Back! Shoveler!",
                  style: {
                      color: "#510000",
                      textAlign: "center",
                      fontFamily: "Roboto",
                      fontSize: 24,
                      fontWeight: "900"
                  }
              }) ],
              style: {
                  display: "flex",
                  position: "absolute",
                  paddingVertical: 8,
                  paddingHorizontal: 32,
                  justifyContent: "center",
                  alignItems: "center",
                  alignSelf: "center",
                  top: 0,
                  borderRadius: 30,
                  backgroundColor: "#FFC800",
                  flexDirection: "row"
              }
          }),
          View({ //Subheader
                    children: [
                        Text({ // Download Meta Horizon App to unlock full game!
                        text: this.unlockText,
                        style: {
                            width: 359,
                            color: "#FB7100",
                            textAlign: "center",
                            fontFamily: "Roboto",
                            fontSize: 24,
                            fontWeight: "900"
                        }
                    }) ],
                    style: {
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        marginTop: 16,
                        flexDirection: "row"
                    }
                }),
          View({ //Rewards Vertical Layout
              children: [
              View({ //Rewards Group
                  children: [
                    View({ //CellInventoryItemSmall
                      children: [
                        View({ //ContentGroup
                          children: [ Image({ //MoneyBagSmall 3
                              source: ImageSource.fromTextureAsset(this.uiRootBlocking.props.moneyBagSmall3!),
                              style: {
                                  width: 64,
                                  height: 64,
                                  flexShrink: 0,
                                  resizeMode: "cover"
                              }
                          }) ],
                          style: {
                              display: "flex",
                              width: 84,
                              height: 84,
                              padding: 2,
                              justifyContent: "center",
                              alignItems: "center",
                              borderRadius: 8,
                              borderWidth: 2,
                              borderColor: "#C1B695",
                              backgroundColor: "#30283A",
                              flexDirection: "row"
                          }
                      }),
                      View({ //QuantityGroup
                          children: [ Text({ // Dig Dollar
                              text: "Dig Dollar",
                              style: {
                                  color: "#575758",
                                  textAlign: "center",
                                  fontFamily: "Roboto",
                                  fontSize: 20,
                                  fontWeight: "700"
                              }
                          }),
                          Text({ // x5000
                              text: "x5000",
                              style: {
                                  color: "#575758",
                                  textAlign: "center",
                                  fontFamily: "Roboto",
                                  fontSize: 20,
                                  fontWeight: "600"
                              }
                          }) ],
                          style: {
                              display: "flex",
                              paddingVertical: 4,
                              flexDirection: "column",
                              alignItems: "center",
                              borderRadius: 4,
                              marginTop: 2
                          }
                      }) ],
                      style: {
                          display: "flex",
                          width: 128,
                          flexDirection: "column",
                          alignItems: "center",
                          borderRadius: 8
                      }
                  }),
                  View({ //CellInventoryItemSmall
                      children: [
                        View({ //ContentGroup
                          children: [ Image({ //gem 2
                              source: ImageSource.fromTextureAsset(this.uiRootBlocking.props.shovelInventory_gems!),
                              style: {
                                  width: 64,
                                  height: 64,
                                  flexShrink: 0,
                                  resizeMode: "cover"
                              }
                          }) ],
                          style: {
                              display: "flex",
                              width: 84,
                              height: 84,
                              padding: 2,
                              justifyContent: "center",
                              alignItems: "center",
                              borderRadius: 8,
                              borderWidth: 2,
                              borderColor: "#C1B695",
                              backgroundColor: "#30283A",
                              flexDirection: "row"
                          }
                      }),
                      View({ //QuantityGroup
                          children: [
                            Text({ // Gem
                              text: "Gem",
                              style: {
                                  color: "#575758",
                                  textAlign: "center",
                                  fontFamily: "Roboto",
                                  fontSize: 20,
                                  fontWeight: "700"
                              }
                          }),
                          Text({ // x30
                              text: "x30",
                              style: {
                                  color: "#575758",
                                  textAlign: "center",
                                  fontFamily: "Roboto",
                                  fontSize: 20,
                                  fontWeight: "600"
                              }
                          }) ],
                          style: {
                              display: "flex",
                              paddingVertical: 4,
                              flexDirection: "column",
                              alignItems: "center",
                              borderRadius: 4,
                              marginTop: 2
                          }
                      }) ],
                      style: {
                          display: "flex",
                          flexDirection: "column",
                          width: 128,
                          alignItems: "center",
                          borderRadius: 8
                      }
                  }),
                  View({ //CellInventoryItemSmall
                      children: [
                        View({ //ContentGroup
                          children: [ Image({ //PotionCyan
                              source: ImageSource.fromTextureAsset(this.uiRootBlocking.props.potionCyan!),
                              style: {
                                  width: 64,
                                  height: 64,
                                  flexShrink: 0,
                                  resizeMode: "cover"
                              }
                          }) ],
                          style: {
                              display: "flex",
                              width: 84,
                              height: 84,
                              padding: 2,
                              justifyContent: "center",
                              alignItems: "center",
                              borderRadius: 8,
                              borderWidth: 2,
                              borderColor: "#C1B695",
                              backgroundColor: "#30283A",
                              flexDirection: "row"
                          }
                      }),
                      View({ //QuantityGroup
                          children: [ Text({ // Basic Potion
                              text: "Basic Potion",
                              style: {
                                  color: "#575758",
                                  textAlign: "center",
                                  fontFamily: "Roboto",
                                  fontSize: 20,
                                  fontWeight: "700"
                              }
                          }),
                          Text({ // x30
                              text: "x30",
                              style: {
                                  color: "#575758",
                                  textAlign: "center",
                                  fontFamily: "Roboto",
                                  fontSize: 20,
                                  fontWeight: "600"
                              }
                          }) ],
                          style: {
                              display: "flex",
                              paddingVertical: 4,
                              flexDirection: "column",
                              alignItems: "center",
                              borderRadius: 4,
                              marginTop: 2
                          }
                      }) ],
                      style: {
                          display: "flex",
                          flexDirection: "column",
                          width: 128,
                          alignItems: "center",
                          borderRadius: 8
                      }
                  }) ],
                  style: {
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      alignSelf: "center",
                      marginTop: 4,
                      flexDirection: "row"
                  }
              }) ],
              style: {
                  display: "flex",
                  width: 544,
                  paddingVertical: 8,
                  paddingHorizontal: 0,
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: "center",
                  backgroundColor: "#FFFCF4",
                  marginTop: 16
              }
          }),
          Image({ //icn_Doug
              source: this.characterImage,
              style: {
                  width: 160,
                  height: 160,
                  position: "absolute",
                  right: -16,
                  top: -32,
                  resizeMode: "cover",
                  marginTop: 16
              }
          }),
          View({ //Btn Group
              children: [
                Pressable({ //button_Download
                  children: [
                  Text({ // Claim Rewards!
                      text: "Claim Rewards!",
                      style: {
                          color: "#FFF",
                          fontFamily: "Roboto",
                          fontSize: 20,
                          fontWeight: "700",
                          marginLeft: 4
                      }
                  }) ],
                  onClick: this.collect.bind(this),
                  style: {
                      display: "flex",
                      paddingTop: 8,
                      paddingRight: 16,
                      paddingBottom: 8,
                      paddingLeft: 16,
                      justifyContent: "center",
                      alignItems: "center",
                      borderRadius: 12,
                      borderBottomWidth: 4,
                      borderColor: "#49A24C",
                      backgroundColor: "#70C04E",
                      flexDirection: "row"
                  }
              }) ],
              style: {
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  alignSelf: "stretch",
                  marginTop: 12,
                  marginBottom: 12,
                  flexDirection: "row"
              }
          }) ],
          style: {
              display: "flex",
              width: 568,
              paddingTop: 48,
              paddingRight: 32,
              paddingBottom: 24,
              paddingLeft: 32,
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              borderRadius: 16,
              marginTop: 10
          }
      }) ],
      style: {
          display: "flex",
          width: "100%",
          height: "100%",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          flexShrink: 0,
          position: "absolute"
      }
  }), View({}))
  }
}
