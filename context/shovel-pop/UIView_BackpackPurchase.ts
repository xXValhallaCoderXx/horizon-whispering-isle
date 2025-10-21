/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_Player_Inventory } from "BigBox_Player_Inventory";
import { HUDElementType } from "Enums";
import { Events } from "Events";
import { Binding, Image, ImageSource, Pressable, Text, UINode, View } from "horizon/ui";
import { UI_Utils } from "UI_Utils";
import { UIView_InteractionNonBlockingBase } from "UIRoot_ChildrenBase";
import { UIRoot_InteractionNonBlocking } from "UIRoot_InteractionNonBlocking";

const MAX_CATEGORIES = 3;
const MAX_ITEM_COST_COUNT = 3;
const RED_COLOR = "#FF4C3F";

export type BackpackPurchaseDialogParams = {
  currentBackpackLevel: number;
  nextBackpackLevel: number;
  playerMeetsLevelReq: boolean;
  playerHasEnoughMoney: boolean;
  price: number;
  currentInventorySize: number;
  newInventorySize: number;
}

export class UIView_BackpackPurchase extends UIView_InteractionNonBlockingBase {
  private isVisible = new Binding(false);
  private viewModel!: BackpackPurchaseViewModel;
  private onSelectionCallback: (purchase: boolean) => void;

  constructor(uiRoot: UIRoot_InteractionNonBlocking, onSelectionCallback: (purchase: boolean) => void) {
    super(uiRoot);
    this.localPlayer = uiRoot.world.getLocalPlayer();
    this.onSelectionCallback = onSelectionCallback;
    this.createViewModel();
  }

  private createViewModel() {
    this.viewModel = new BackpackPurchaseViewModel();
  }

  setVisible(isVisible: boolean) {
    this.isVisible.set(isVisible, [this.localPlayer]);

    if (isVisible){
      this.uiRoot.sendLocalBroadcastEvent(Events.localHideHUD, { context:'backpack_purchase', exclude: HUDElementType.Resources });
    } else{
      this.uiRoot.sendLocalBroadcastEvent(Events.localShowHUD, { context:'backpack_purchase', exclude:  HUDElementType.Resources});
    }
  }

  setup(params: BackpackPurchaseDialogParams) {
    const target = [this.localPlayer]

    this.viewModel.currentBackpackLevel.set(`Lv. ${params.currentBackpackLevel + 1}`, target);
    this.viewModel.nextBackpackLevel.set(`Lv. ${params.nextBackpackLevel + 1}`, target);
    this.viewModel.currentInventorySize.set(`${params.currentInventorySize} slots`, target);
    this.viewModel.nextInventorySize.set(`${params.newInventorySize} slots`, target);
    this.viewModel.priceText.set('$' + UI_Utils.simplifyNumberToText(params.price), target);
    const priceTextColor = params.playerHasEnoughMoney ? "#573615" : RED_COLOR;
    this.viewModel.priceTextColor.set(priceTextColor, target);
    const levelTextColor = params.playerMeetsLevelReq ? "#573615" : RED_COLOR;
    this.viewModel.levelTextColor.set(levelTextColor, target);
    this.viewModel.levelText.set('Lv. ' + BigBox_Player_Inventory.backpackPlayerLevelRequirements[params.nextBackpackLevel], target);
  }

  createView() {
    const root = View({ //UIBackpackUpgrade
      children: [View({ //Backpack Upgrade Dialog
        children: [
          View({ //BG
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
            children: [
              View({ //Horizontal Group
                children: [
                  View({ //Stats Current Level
                  children: [
                  //   Text({ // Lv. 2
                  //   text: this.viewModel.currentBackpackLevel,
                  //   style: {
                  //     alignSelf: "stretch",
                  //     color: "#896B4B",
                  //     textAlign: "center",
                  //     fontFamily: "Roboto",
                  //     fontSize: 24,
                  //     fontWeight: "900"
                  //   }
                  // }),
                  Image({ //icn_backpack
                    source: ImageSource.fromTextureAsset(this.props.inventory_backpack!),
                    style: {
                      width: 64,
                      height: 64,
                      resizeMode: "cover",
                      marginTop: 12
                    }
                  }),
                  View({ // Size Tag
                    children: [View({ //BG
                      style: {
                        width: 139,
                        height: 32,
                        position: "absolute",
                        borderRadius: 20,
                        backgroundColor: "#FFDC83",
                        left: 0,
                        top: 0
                      }
                    }),
                    Text({ // Current Inventory Size
                      text: this.viewModel.currentInventorySize,
                      style: {
                        display: "flex",
                        height: 32,
                        flexDirection: "column",
                        justifyContent: "center",
                        flexGrow: 1,
                        flexShrink: 0,
                        flexBasis: 0,
                        color: "#5C3B1B",
                        textAlign: "center",
                        fontFamily: "Roboto",
                        fontSize: 24,
                        fontWeight: "700"
                      }
                    })],
                    style: {
                      display: "flex",
                      height: 32,
                      alignItems: "flex-end",
                      alignSelf: "stretch",
                      marginTop: 12,
                      flexDirection: "row"
                    }
                  })],
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    flexGrow: 1,
                    flexShrink: 0,
                    flexBasis: 0
                  }
                }),
                View({ //Center Arrows
                  children: [Image({ //icn_arrowRight
                    source: ImageSource.fromTextureAsset(this.props.quest_icn_arrowRight!),

                    style: {
                      width: 24,
                      height: 24,
                      tintColor: "#5C3B1B"
                    }
                  }),
                  Image({ //icn_arrowRight
                    source: ImageSource.fromTextureAsset(this.props.quest_icn_arrowRight!),

                    style: {
                      width: 24,
                      height: 24,
                      tintColor: "#5C3B1B"
                    }
                  })],
                  style: {
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    alignSelf: "stretch",
                    marginLeft: 24,
                    flexDirection: "row"
                  }
                }),
                View({ //Stats Next Level
                  children: [
                  //   Text({ // Lv. 3
                  //   text: this.viewModel.nextBackpackLevel,
                  //   style: {
                  //     alignSelf: "stretch",
                  //     color: "#896B4B",
                  //     textAlign: "center",
                  //     fontFamily: "Roboto",
                  //     fontSize: 24,
                  //     fontWeight: "900"
                  //   }
                  // }),
                  Image({ //icn_backpack
                    source: ImageSource.fromTextureAsset(this.props.inventory_backpack!),
                    style: {
                      width: 64,
                      height: 64,
                      resizeMode: "cover",
                      marginTop: 12
                    }
                  }),
                  View({ //Size Tag
                    children: [View({ //BG
                      style: {
                        width: 139,
                        height: 32,
                        position: "absolute",
                        borderRadius: 20,
                        backgroundColor: "#FFDC83",
                        left: 0,
                        top: 0
                      }
                    }),
                    Text({ // Next Inventory Size
                      text: this.viewModel.nextInventorySize,
                      style: {
                        display: "flex",
                        height: 32,
                        flexDirection: "column",
                        justifyContent: "center",
                        flexGrow: 1,
                        flexShrink: 0,
                        flexBasis: 0,
                        color: "#5C3B1B",
                        textAlign: "center",
                        fontFamily: "Roboto",
                        fontSize: 24,
                        fontWeight: "700"
                      }
                    })],
                    style: {
                      display: "flex",
                      height: 32,
                      alignItems: "flex-end",
                      alignSelf: "stretch",
                      marginTop: 12,
                      flexDirection: "row"
                    }
                  })],
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    flexGrow: 1,
                    flexShrink: 0,
                    flexBasis: 0,
                    marginLeft: 24
                  }
                })],
                style: {
                  display: "flex",
                  alignItems: "flex-start",
                  alignSelf: "stretch",
                  flexDirection: "row",
                  marginTop: 16
                }
              }),
              View({ //Cost Div
                children: [
                  View({ //Divider
                  style: {
                    height: 4,
                    flexGrow: 1,
                    flexShrink: 0,
                    flexBasis: 0,
                    borderRadius: 2,
                    backgroundColor: "#FFD673"
                  }
                }),
                Text({ // Costs
                  text: "Requirements",
                  style: {
                    color: "#896B4B",
                    fontSize: 20,
                    fontWeight: "700",
                    marginLeft: 8
                  }
                }),
                View({ //Divider
                  style: {
                    height: 4,
                    flexGrow: 1,
                    flexShrink: 0,
                    flexBasis: 0,
                    borderRadius: 1.6,
                    backgroundColor: "#FFD673",
                    marginLeft: 8
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
                children: [View({ //Horizontal Group
                  children: [
                    View({ //Level Widget
                      children: [
                        Text({ // $2.99M
                          text: this.viewModel.levelText,
                          style: {
                            color: this.viewModel.levelTextColor,
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                            textAlign: "center",
                            fontFamily: "Roboto",
                            fontSize: 20,
                            height: 24,
                            fontWeight: "700"
                          }
                        })
                      ],
                      style: {
                        display: "flex",
                        height: 32,
                        paddingVertical: 0,
                        paddingHorizontal: 16,
                        justifyContent: "center",
                        alignItems: "center",
                        borderRadius: 16,
                        backgroundColor: "#FFF9E9",
                        marginLeft: 12,
                        flexDirection: "row"
                      }
                    }),
                    View({ //MoneyWidget
                    children: [
                      Image({ //img_moneyL
                        source: ImageSource.fromTextureAsset(this.props.icn_money!),
                        style: {
                          width: 33,
                          flexShrink: 0,
                          alignSelf: "stretch"
                        }
                      }),
                      Text({ // $2.99M
                        text: this.viewModel.priceText,
                        style: {
                          color: this.viewModel.priceTextColor,
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "center",
                          textAlign: "center",
                          fontFamily: "Roboto",
                          fontSize: 20,
                          height: 24,
                          fontWeight: "700",
                          marginLeft: 12
                        }
                      })
                    ],
                    style: {
                      display: "flex",
                      height: 32,
                      paddingVertical: 0,
                      paddingHorizontal: 16,
                      justifyContent: "center",
                      alignItems: "center",
                      borderRadius: 16,
                      backgroundColor: "#FFF9E9",
                      marginLeft: 12,
                      flexDirection: "row"
                    }
                  }),],
                  style: {
                    display: "flex",
                    width: 290,
                    justifyContent: "center",
                    alignItems: "center",
                    flexDirection: "row"
                  }
                })],
                style: {
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  alignContent: "center",
                  alignSelf: "stretch",
                  flexWrap: "wrap",
                  borderRadius: 35,
                  flexDirection: "row"
                }
              }),
              View({ //Spacer
              style: {
                width: 24,
                height: 24
              }
            }),
              View({ //Title
                children: [Text({ // Upgrade Backpack?
                  text: "Upgrade Backpack?",
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
                  alignSelf: "center",
                  top: -17,
                  borderRadius: 30,
                  backgroundColor: "#FECA47",
                  flexDirection: "row"
                }
              }),
              View({ //Btn Group
                children: [Pressable({ //button_No
                  children: [Text({ // No
                    text: "No",
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      flexGrow: 1,
                      flexShrink: 0,
                      flexBasis: 0,
                      alignSelf: "stretch",
                      color: "#61470B",
                      textAlign: "center",
                      textAlignVertical: "center",
                      fontFamily: "Roboto",
                      fontSize: 24,
                      fontWeight: "700"
                    }
                  })],
                  style: {
                    display: "flex",
                    width: 160,
                    height: 48,
                    padding: 12,
                    justifyContent: "center",
                    alignItems: "center",
                    borderRadius: 15,
                    borderBottomWidth: 4,
                    borderColor: "#CCA855",
                    backgroundColor: "#FFCB5C",
                    flexDirection: "row"
                  },
                  onClick: () => this.onSelectionCallback(false),
                }),
                Pressable({ //button_Yes
                  children: [Text({ // Yes
                    text: "Yes",
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      flexGrow: 1,
                      flexShrink: 0,
                      flexBasis: 0,
                      alignSelf: "stretch",
                      color: "#FFF",
                      textAlign: "center",
                      textAlignVertical: "center",
                      fontFamily: "Roboto",
                      fontSize: 24,
                      fontWeight: "700"
                    }
                  })],
                  style: {
                    display: "flex",
                    width: 160,
                    height: 48,
                    padding: 12,
                    justifyContent: "center",
                    alignItems: "center",
                    borderRadius: 15,
                    borderBottomWidth: 4,
                    borderColor: "#49A24C",
                    backgroundColor: "#70C04E",
                    marginLeft: 8,
                    flexDirection: "row"
                  },
                  onClick: () => this.onSelectionCallback(true),
                })],
                style: {
                  display: "flex",
                  alignItems: "center",
                  position: "absolute",
                  alignSelf: "center",
                  bottom: -22,
                  flexDirection: "row"
                }
              })],
            style: {
              display: "flex",
              padding: 24,
              marginLeft: -422,
              flexDirection: "column",
              alignItems: "center",
              flexGrow: 1,
              flexShrink: 0,
              flexBasis: 0
            }
          })],
        style: {
          display: "flex",
          width: 422,
          alignItems: "flex-start",
          flexShrink: 0,
          flexDirection: "row"
        }
      })],
      style: {
        display: "flex",
        width: "100%",
        height: "100%",
        justifyContent: "center",
        alignItems: "center",
        flexShrink: 0,
        flexDirection: "row",
        position: "relative"
      }
    });

    return UINode.if(this.isVisible, root);
  }
}

class BackpackPurchaseViewModel {
  currentBackpackLevel = new Binding("");
  currentInventorySize = new Binding("");
  nextBackpackLevel = new Binding("");
  nextInventorySize = new Binding("");
  priceText = new Binding("");
  priceTextColor = new Binding("#000000");
  levelText = new Binding("");
  levelTextColor = new Binding("#000000");

  constructor() {
  }
}
