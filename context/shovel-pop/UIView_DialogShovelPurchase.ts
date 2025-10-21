/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { CategoryUIData } from "CategoryUIData";
import { HUDElementType } from "Enums";
import { Events } from "Events";
import { Asset, Player } from "horizon/core";
import { Binding, Image, ImageSource, Pressable, Text, UIChildren, UINode, View } from "horizon/ui";
import { ItemContainer } from "ItemContainer";
import { Logger } from "Logger";
import { Shovel } from "Shovel";
import { UI_Utils } from "UI_Utils";
import { UIView_InteractionNonBlockingBase } from "UIRoot_ChildrenBase";
import { UIRoot_InteractionNonBlocking } from "UIRoot_InteractionNonBlocking";

const MAX_CATEGORIES = 3;
const MAX_ITEM_COST_COUNT = 4;
const RED_COLOR = "#FF4C3F";

export type ShovelPurchaseDialogParams = {
  shovelID: string;
  playerMeetsLevelReq: boolean;
  playerHasEnoughMoney: boolean;
  playerItemCount1: number;
  playerItemCount2: number;
  playerItemCount3: number;
  playerItemCount4: number;
}

export type ShovelPurchaseDialogCallback = (purchase: boolean, player: Player) => void;

const log = new Logger('UIView_DialogShovelPurchase');

export class UIView_DialogShovelPurchase extends UIView_InteractionNonBlockingBase {
  private isVisible = new Binding(false);
  private viewModel!: ShovelPurchaseViewModel;
  private onSelectionCallback: (purchase: boolean) => void;

  constructor(uiRoot: UIRoot_InteractionNonBlocking, onSelectionCallback: (purchase: boolean) => void) {
    super(uiRoot);
    this.localPlayer = uiRoot.world.getLocalPlayer();
    this.onSelectionCallback = onSelectionCallback;
    this.createViewModel();
  }

  private createViewModel() {
    this.viewModel = new ShovelPurchaseViewModel(ImageSource.fromTextureAsset(this.props.shovelHud_image!));
    for (let i = 0; i < MAX_CATEGORIES; i++) {
      this.viewModel.categories.push(new ShovelPurchaseCategoryViewModel());
    }
    for (let i = 0; i < MAX_ITEM_COST_COUNT; i++) {
      this.viewModel.itemCosts.push(new ShovelPurchaseItemCostViewModel(ImageSource.fromTextureAsset(this.props.shovelHud_image!)));
    }
  }

  setVisible(isVisible: boolean) {
    this.isVisible.set(isVisible, [this.localPlayer]);

    if (isVisible){
      this.uiRoot.sendLocalBroadcastEvent(Events.localHideHUD, { context:'shovel_purchase', exclude: HUDElementType.Resources });
    } else{
      this.uiRoot.sendLocalBroadcastEvent(Events.localShowHUD, { context:'shovel_purchase', exclude:  HUDElementType.Resources});
    }
  }

  setup(params: ShovelPurchaseDialogParams) {
    const shovelData = Shovel.getData(params.shovelID, 0);
    if (shovelData === undefined) {
      log.error('Shovel data not found for ID: ' + params.shovelID);
      return;
    }
    this.viewModel.shovelName.set(shovelData.name, [this.localPlayer]);
    this.viewModel.shovelImage.set(ImageSource.fromTextureAsset(shovelData.getIconAsset()!), [this.localPlayer]);
    this.viewModel.rarityLevel.set((shovelData.defaultLevel + 1).toString(), [this.localPlayer]);
    this.viewModel.evolutionLevel.set((shovelData.evolutionLevel).toString(), [this.localPlayer]);
    this.viewModel.canEvolve.set(shovelData.evolutionLevel !== undefined && shovelData.evolutionLevel > 0, [this.localPlayer]);
    this.viewModel.description.set(shovelData.description, [this.localPlayer])
    this.viewModel.abilityText.set(shovelData.abilityDetails, [this.localPlayer]);
    let abilityIcon = shovelData.getAbilityIconAsset()
    if (abilityIcon)
    {
      this.viewModel.abilityIcon.set(ImageSource.fromTextureAsset(abilityIcon), [this.localPlayer])
    }
    else{
      this.viewModel.abilityIcon.reset()
    }
    this.viewModel.weightText.set(shovelData.maxKg.toString() + "KG", [this.localPlayer]);
    this.viewModel.levelReqText.set("Lvl " + shovelData.levelRequirement.toString(), [this.localPlayer]);
    const levelReqTextColor = params.playerMeetsLevelReq ? "#573615" : RED_COLOR;
    this.viewModel.levelReqTextColor.set(levelReqTextColor, [this.localPlayer]);
    this.viewModel.priceText.set(this.getPriceText(shovelData.price), [this.localPlayer]);
    const priceTextColor = params.playerHasEnoughMoney ? "#573615" : RED_COLOR;
    this.viewModel.priceTextColor.set(priceTextColor, [this.localPlayer]);

    // TODO - multiple categories?
    this.viewModel.categoryText.set(shovelData.categoryToBias, [this.localPlayer]);
    this.setupCategory(this.viewModel.categories[0], shovelData.categoryToBias);
    for (let i = 1; i < MAX_CATEGORIES; i++) {
      this.setupCategory(this.viewModel.categories[i]);
    }

    this.setupItemCost(0, shovelData.itemCost1ID, params.playerItemCount1, shovelData.itemCost1Amount);
    this.setupItemCost(1, shovelData.itemCost2ID, params.playerItemCount2, shovelData.itemCost2Amount);
    this.setupItemCost(2, shovelData.itemCost3ID, params.playerItemCount3, shovelData.itemCost3Amount);
    this.setupItemCost(3, shovelData.itemCost4ID, params.playerItemCount4, shovelData.itemCost4Amount);
  }

  private setupCategory(viewModel: ShovelPurchaseCategoryViewModel, categoryToBias?: string) {
    const isShown = categoryToBias !== undefined && categoryToBias !== "";
    viewModel.isShown.set(isShown, [this.localPlayer]);
    if (!isShown) {
      return;
    }
    const categoryData = CategoryUIData.get(categoryToBias!);
    viewModel.categoryName.set(categoryData.displayName, [this.localPlayer]);
    viewModel.bgColor.set(categoryData.color.toHex(), [this.localPlayer]);
    let itemsUnlocked = 0;

    itemsUnlocked = ItemContainer.localInstance.getDataArrayForCategory(categoryToBias).length;
    viewModel.itemsUnlocked.set(itemsUnlocked, [this.localPlayer])
  }

  setupItemCost(index: number, itemID: string, playerItemCount: number, costAmount: number) {
    const viewModel = this.viewModel.itemCosts[index];
    if (!itemID || !costAmount) {
      viewModel.isShown.set(false, [this.localPlayer]);
      return;
    }
    const itemData = ItemContainer.localInstance.getItemDataForId(itemID);
    if (itemData === undefined) {
      viewModel.isShown.set(false, [this.localPlayer]);
      log.error('Item data not found for ID: ' + itemID);
      return;
    }
    viewModel.isShown.set(true, [this.localPlayer]);
    viewModel.itemName.set(itemData.name, [this.localPlayer]);
    const iconAsset = itemData.getIconAsset();
    viewModel.itemImage.set(ImageSource.fromTextureAsset(iconAsset ?? this.props.shovelHud_image!), [this.localPlayer]);
    viewModel.costSatisfactionText.set(`${playerItemCount}/${costAmount}`, [this.localPlayer]);
    const costTextColor = playerItemCount >= costAmount ? "#000000" : RED_COLOR;
    viewModel.costSatisfactionTextColor.set(costTextColor, [this.localPlayer]);
  }

  private getPriceText(price: number): string {
    return '$' + UI_Utils.simplifyNumberToText(price);
  }

  private categoryHeader(): UINode {
    return Text({ // Discovers:
      text: "Discovers:",
      style: {
        flexShrink: 0,
        width: 450,
        color: "#7B5B3D",
        fontSize: 16,
        fontFamily: "Roboto",
        fontWeight: "700"
      }
    })
  }

  private categoryTag(viewModel: ShovelPurchaseCategoryViewModel): UINode {
    return UINode.if(viewModel.isShown, View({ //Category tag
      children: [UI_Utils.outlinedText({ // Tag
        text: viewModel.categoryName,
        outlineSize: 1,
        style: {
          color: "#FFF",
          fontSize: 20,
          fontFamily: "Roboto",
          fontWeight: "700"
        }
      })],
      style: {
        display: "flex",
        paddingVertical: 4,
        paddingHorizontal: 16,
        justifyContent: "center",
        alignItems: "center",
        borderRadius: 16,
        backgroundColor: viewModel.bgColor,
        marginRight: 7,
        flexDirection: "row"
      }
    }));
  }

  private moneyLevelGroup(): UINode {
    return View({ //Money Level Group
      children: [
        View({ //Level Widget
          children: [Text({ // Lvl 88
            text: this.viewModel.levelReqText,
            style: {
              color: this.viewModel.levelReqTextColor,
              display: "flex",
              width: 100,
              flexDirection: "column",
              justifyContent: "center",
              textAlign: "center",
              textAlignVertical:"center",
              fontFamily: "Roboto",
              fontSize: 24,
              height: 24,
              fontWeight: "700"
            }
          })],
          style: {
            display: "flex",
            height: 32,
            paddingVertical: 0,
            paddingHorizontal: 4,
            justifyContent: "center",
            alignItems: "center",
            borderRadius: 16,
            backgroundColor: "#FFF9E9",
            flexDirection: "row"
          }
        }),
        View({ //Money Widget
          children: [
            Image({ //img_moneyL
              source: ImageSource.fromTextureAsset(this.props.dialogShovelPurchase_leftMoneySlice!),
              style: {
                width: 33,
                flexShrink: 0,
                alignSelf: "stretch"
              }
            }),
            View({ //Spacer
              style: {
                width: 12,
                height: 12
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
                textAlignVertical: "center",
                fontFamily: "Roboto",
                fontSize: 24,
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
        })],
      style: {
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "row",
        position: "relative",
        width: 450
      }
    });
  }

  private itemCost(viewModel: ShovelPurchaseItemCostViewModel): UINode {
    return UINode.if(viewModel.isShown, View({ //Requirement Item Group
      children: [Text({ // +
        text: "+",
        style: {
          color: "#000",
          textAlign: "center",
          fontSize: 24,
          fontFamily: "Roboto",
          fontWeight: "700"
        }
      }),
      View({ //Cell Inventory Item Small
        children: [View({ //Content Group
          children: [Image({ //icn_Item
            source: viewModel.itemImage,
            style: {
              flexGrow: 1,
              flexShrink: 0,
              flexBasis: 0,
              alignSelf: "stretch",
              borderRadius: 6,
              resizeMode: "cover"
            }
          })],
          style: {
            display: "flex",
            height: 64,
            padding: 2,
            marginTop: 24,
            alignItems: "center",
            alignSelf: "stretch",
            borderRadius: 8,
            borderWidth: 2,
            borderColor: "#FFDC83",
            backgroundColor: "#A59D90",
            flexDirection: "row"
          }
        }),
        /*View({ //NameGroup
          children: [UI_Utils.outlinedText({ // Name
            text: viewModel.itemName,
            outlineSize: 1,
            style: {
              flexGrow: 1,
              flexShrink: 0,
              flexBasis: 0,
              color: "#FFF",
              textAlign: "center",
              fontFamily: "Roboto",
              fontSize: 12,
              fontWeight: "700"
            }
          })],
          style: {
            display: "flex",
            paddingTop: 2,
            paddingRight: 2,
            paddingBottom: 4,
            paddingLeft: 2,
            justifyContent: "center",
            alignItems: "center",
            alignSelf: "stretch",
            flexDirection: "row"
          }
        }),*/
        View({ //Quantity Group
          children: [Text({ // 20/20
            text: viewModel.costSatisfactionText,
            style: {
              color: viewModel.costSatisfactionTextColor,
              textAlign: "center",
              fontFamily: "Roboto",
              fontSize: 16,
              fontWeight: "700"
            }
          })],
          style: {
            display: "flex",
            paddingVertical: 2,
            paddingHorizontal: 16,
            flexDirection: "column",
            alignItems: "center",
            borderRadius: 16,
            backgroundColor: "#FFF9E9",
            marginTop: 2
          }
        })],
        style: {
          display: "flex",
          width: 64,
          flexDirection: "column",
          alignItems: "center",
          borderRadius: 8,
          marginLeft: 8
        }
      })],
      style: {
        display: "flex",
        alignItems: "center",
        marginLeft: 8,
        flexDirection: "row",
        marginTop: 8
      }
    }));
  }

  createView() {
    const categoryChildren = new Array<UIChildren>();
    // categoryChildren.push(this.categoryHeader());
    for (let i = 0; i < MAX_CATEGORIES; ++i) {
      categoryChildren.push(this.categoryTag(this.viewModel.categories[i]));
    }
    const itemCostChildren = new Array<UIChildren>();
    itemCostChildren.push(this.moneyLevelGroup());
    for (let i = 0; i < MAX_ITEM_COST_COUNT; ++i) {
      itemCostChildren.push(this.itemCost(this.viewModel.itemCosts[i]));
    }

    return UINode.if(this.isVisible, View({ //UIPurchasePopup
      children: [View({ //Purchase Widget
        children: [
          View({ //BG
                children: [
                    /*View({ //Highlight BG
                    children: [  ],
                    style: {
                        height: 180,
                        alignSelf: "stretch",
                        backgroundColor: "#FFDC83"
                    }
                })*/
              ],
                style: {
                    display: "flex",
                    width: 860,
                    paddingTop: 0,
                    paddingBottom: 8,
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    flexShrink: 0,
                    alignSelf: "stretch",
                    borderRadius: 30,
                    borderWidth: 4,
                    borderColor: "#FECA47",
                    backgroundColor: "#FFF1C1"
                }
            }),
          View({ //Contents
            children: [
              View({ //RightPanel
                children: [
                  View({ //Requirement Title
                        children: [
                            Text({ // Requires:
                            text: "Requirements:",
                            style: {
                                color: "#7B5B3D",
                                fontSize: 20,
                                fontWeight: "700"
                            }
                        }) ],
                        style: {
                            display: "flex",
                            height: 48,
                            paddingVertical: 0,
                            paddingHorizontal: 15,
                            justifyContent: "center",
                            alignItems: "center",
                            alignSelf: "stretch",
                            flexDirection: "row"
                        }
                    }),
                  View({ //Requirement Group
                    children: itemCostChildren,
                    style: {
                      display: "flex",
                      height: 227,
                      justifyContent: "center",
                      alignItems: "center",
                      alignContent: "center",
                      flexGrow: 1,
                      flexShrink: 0,
                      flexBasis: 0,
                      alignSelf: "stretch",
                      flexWrap: "wrap",
                      flexDirection: "row",
                      paddingBottom: 8,
                    }
                  }),
                  View({ //Btn Group
                    children: [
                      Pressable({ //Btn No
                        children: [UI_Utils.outlinedText({ // NO
                          text: "No",
                          outlineSize: 0,
                          style: {
                            display: "flex",
                            height: 28,
                            flexDirection: "column",
                            justifyContent: "center",
                            flexShrink: 0,
                            alignSelf: "stretch",
                            color: "#61470B",
                            fontSize: 24,
                            fontFamily: "Roboto",
                            fontWeight: "700"
                          }
                        })],
                        style: {
                          display: "flex",
                          width: 160,
                          height: 48,
                          justifyContent: "center",
                          alignItems: "center",
                          flexShrink: 0,
                          borderRadius: 24,
                          borderBottomWidth: 4,
                          backgroundColor: "#FFCB5C",
                          borderColor: "#CCA855",
                          flexDirection: "row"
                        },
                        onClick: () => this.onSelectionCallback(false),
                      }),
                      Pressable({ //Btn Yes
                        children: [UI_Utils.outlinedText({ // YES!
                          text: "Yes",
                          outlineSize: 0,
                          style: {
                            display: "flex",
                            height: 28,
                            flexDirection: "column",
                            justifyContent: "center",
                            flexShrink: 0,
                            alignSelf: "stretch",
                            color: "#FFF",
                            fontSize: 24,
                            fontFamily: "Roboto",
                            fontWeight: "700"
                          }
                        })],
                        style: {
                          display: "flex",
                          width: 160,
                          height: 48,
                          justifyContent: "center",
                          alignItems: "center",
                          flexShrink: 0,
                          borderRadius: 24,
                          borderBottomWidth: 4,
                          backgroundColor: "#70C04E",
                          borderColor: "#49A24C",
                          marginLeft: 8,
                          flexDirection: "row"
                        },
                        onClick: () => this.onSelectionCallback(true),
                      })],
                    style: {
                      display: "flex",
                      alignItems: "center",
                      marginTop: 16,
                      flexDirection: "row"
                    }
                  })],
                style: {
                  display: "flex",
                  width: 392,
                  paddingVertical: 0,
                  paddingHorizontal: 16,
                  flexDirection: "column",
                  alignItems: "center",
                  alignSelf: "stretch"
                }
              }),
              View({ //Divider
                style: {
                  width: 2,
                  //height: 360,
                  //position: "absolute",
                  //right: 400,
                  //bottom: 24,
                  borderRadius: 2,
                  alignSelf: "stretch",
                  backgroundColor: "#FFCB4D",
                  //left: 458,
                  //top: 36
                }
              }),
              /*View({ //Tags
                children: categoryChildren,
                style: {
                  display: "flex",
                  width: "100%",
                  alignItems: "flex-start",
                  alignContent: "flex-start",
                  alignSelf: "stretch",
                  flexWrap: "wrap",
                  marginTop: 4,
                  flexDirection: "row"
                }
              }),*/
              View({ //Left Panel
                children: [
                  View({ //Horizontal Group
                    children: [
                      View({ //Stats
                        children: [
                          View({ //Name Level Group
                            children: [
                              Text({ // UFO
                                text: this.viewModel.shovelName,
                                style: {
                                  color: "#5C3B1B",
                                  textAlign: "center",
                                  fontFamily: "Roboto",
                                  fontSize: 32,
                                  fontWeight: "900"
                                }
                              }),
                              View({ //Spacer
                                style: {
                                  width: 12,
                                  height: 12
                                }
                              }),
                              View({ //Horizontal level star group
                                children: [

                                  Text({ // 2
                                    text: this.viewModel.rarityLevel,
                                    style: {
                                      alignSelf: "stretch",
                                      color: "#5C3B1B",
                                      textAlign: "center",
                                      textAlignVertical: "center",
                                      fontFamily: "Roboto",
                                      fontSize: 24,
                                      fontWeight: "900"
                                    }
                                  }),
                                  Image({ //icn_star
                                    source: ImageSource.fromTextureAsset(this.props.icn_star!),
                                    style: {
                                      width: 24,
                                      height: 24,
                                      resizeMode: "cover",
                                      tintColor: "#5C3B1B"
                                    }
                                  })],
                                style: {
                                  display: "flex",
                                  justifyContent: "center",
                                  alignItems: "center",
                                  flexDirection: "row",
                                  paddingHorizontal: 8,
                                  borderRadius: 10,
                                  backgroundColor: "#C3BA97"
                                }
                              }),
                            ],
                            style: {
                              display: "flex",
                              alignItems: "center",
                              flexDirection: "row"
                            }
                          }),
                          UINode.if(this.viewModel.canEvolve, View({ //Evolve Group
                            children: [Text({ // Evolves at 15
                              text: this.viewModel.evolutionLevel.derive(x => 'Evolves at ' + x),
                              style: {

                                color: "#7B5B3D",
                                fontFamily: "Roboto",
                                height: 28,
                                textAlignVertical: "bottom",
                                fontSize: 20,
                                fontWeight: "700"
                              }
                            }),
                            Image({ //icn_star
                              source: ImageSource.fromTextureAsset(this.props.icn_star!),

                              style: {
                                width: 20,
                                height: 20,
                                tintColor: "#5C3B1B",
                                marginLeft: 2
                              }
                            })],
                            style: {
                              display: "flex",
                              height: 24,
                              alignItems: "center",
                              justifyContent: "flex-start",
                              flexDirection: "row"
                            }
                          })),

                          View({ //Horizontal Group
                            children: [
                              View({ //Abitlity Group
                                children: [
                                  Image({ //icn_2xGem
                                    source: this.viewModel.abilityIcon,
                                    style: {
                                      width: 54,
                                      height: 54,
                                      borderRadius: 8
                                    }
                                  }),
                                  View({ //Spacer
                                    style: {
                                      width: 8,
                                      height: 8
                                    }
                                  }),
                                  Text({ // Ability description
                                    text: this.viewModel.abilityText,
                                    style: {
                                      display: "flex",
                                      flexDirection: "column",
                                      justifyContent: "center",
                                      alignSelf: "stretch",
                                      color: "#573615",
                                      fontFamily: "Roboto",
                                      fontSize: 20,
                                      fontWeight: "700"
                                    }
                                  })],
                                style: {
                                  display: "flex",
                                  paddingLeft: 16,
                                  paddingTop: 16,
                                  paddingRight: 112,
                                  paddingBottom: 16,
                                  backgroundColor: "#FFDC83",
                                  flexDirection: "column",
                                  borderRadius: 16,
                                  justifyContent: "center",
                                  alignItems: "center",
                                  alignSelf: "stretch",
                                  marginTop: 12
                                }
                              }),
                              View({ //Shovel Group
                                children: [Image({ //icn_Shovel
                                  source: this.viewModel.shovelImage,
                                  style: {
                                    width: 240,
                                    height: 240,
                                    position: "absolute",
                                    bottom: -8,
                                    right: -64,
                                    resizeMode: "cover",
                                    transform: [{ rotate: "5deg" }]
                                  }
                                })],
                                style: {
                                  //backgroundColor: "#FFFFF1",
                                  display: "flex",
                                  width: 1,
                                  justifyContent: "center",
                                  alignItems: "center",
                                  alignSelf: "stretch",
                                  borderRadius: 12,
                                  flexDirection: "row"
                                }
                              }),],
                            style: {

                              display: "flex",
                              alignItems: "flex-start",
                              alignSelf: "stretch",
                              flexDirection: "row"
                            }
                          }),



                          UINode.if(this.viewModel.categories[0].isShown, View({ //New items Group
                            children: [
                              Text({ // +
                                text: "Unlocks",
                                style: {
                                  color: "#573615",
                                  fontSize: 20,
                                  fontWeight: "700"
                                }
                              }),
                              View({ //New Tag
                                children: [Text({ // X NEW items!
                                  text: this.viewModel.categories[0].itemsUnlocked.derive(x => x + " NEW"),
                                  style: {

                                    color: "#573615",
                                    fontFamily: "Roboto",
                                    fontSize: 20,
                                    fontWeight: "700"
                                  }
                                })],
                                style: {

                                  display: "flex",
                                  height: 32,
                                  paddingVertical: 4,
                                  paddingHorizontal: 16,
                                  justifyContent: "center",
                                  alignItems: "center",
                                  borderRadius: 8,
                                  backgroundColor: "#FFDC83",
                                  marginLeft: 8,
                                  flexDirection: "row"
                                }
                              }),
                              UINode.if(categoryChildren.length > 0, View({
                                children: categoryChildren,
                                style:{
                                  display: "flex",
                                  paddingVertical: 4,
                                  justifyContent: "center",
                                  alignItems: "center",
                                  borderRadius: 16,
                                  // backgroundColor: "#53B1FD",
                                  marginLeft: 8,
                                  flexDirection: "row"
                                }
                              })),
                              // UINode.if(this.viewModel.categoryText !== "", View({ //Type Tag
                              //   children: [Text({
                              //     text: this.viewModel.categoryText,
                              //     style: {
                              //       color: "#FFF",
                              //       fontSize: 20,
                              //       fontWeight: "700"
                              //     }
                              //   })],
                              //   style: {
                              //     display: "flex",
                              //     paddingVertical: 4,
                              //     paddingHorizontal: 16,
                              //     justifyContent: "center",
                              //     alignItems: "center",
                              //     borderRadius: 16,
                              //     backgroundColor: "#53B1FD",
                              //     marginLeft: 7,
                              //     flexDirection: "row"
                              //   }
                              // })),
                              Text({ // items!
                                text: "items!",
                                style: {
                                  color: "#573615",
                                  fontSize: 20,
                                  marginLeft: 7,
                                  fontWeight: "700"
                                }
                              })],
                            style: {

                              display: "flex",
                              alignItems: "center",
                              marginTop: 12,
                              flexDirection: "row"
                            }
                          }))
                        ],
                        style: {
                          display: "flex",
                          width: 408,
                          flexDirection: "column",
                          alignItems: "flex-start"
                        }
                      }),],
                    style: {
                      display: "flex",
                      alignItems: "flex-start",
                      //alignSelf: "stretch",
                      flexDirection: "row"
                    }
                  }),
                  Text({ // Shovel flavor text
                    text: this.viewModel.description.derive(x => "\"" + x + "\""),
                    style: {

                      alignSelf: "stretch",
                      marginTop: 24,
                      color: "#7B5B3D",
                      textAlign: "center",
                      fontFamily: "Roboto",
                      fontSize: 18,
                      fontWeight: "700"
                    }

                  })],
                style: {
                  display: "flex",
                  width: 450,
                  paddingVertical: 0,
                  paddingHorizontal: 24,
                  flexDirection: "column",
                  alignItems: "flex-start"
                }
              }),
              View({ //Title
                children: [Text({ // Purchase shovel?
                  text: "Purchase shovel?",
                  style: {
                    color: "#6E2F0E",
                    textAlign: "center",
                    textAlignVertical: "center",
                    fontFamily: "Roboto",
                    fontSize: 24,
                    fontWeight: "700"
                  }
                })],
                style: {
                  display: "flex",
                  width: 796,
                  height: 48,
                  top: -24,
                  paddingVertical: 4,
                  paddingHorizontal: 8,
                  justifyContent: "center",
                  alignItems: "center",
                  position: "absolute",
                  borderRadius: 24,
                  backgroundColor: "#FECA47",
                  flexDirection: "row",
                  alignSelf: "center",

                }
              }),
            ],
            style: {
              display: "flex",
              width: 860,
              marginLeft: -860,
              paddingTop: 36,
              paddingRight: 0,
              paddingBottom: 24,
              paddingLeft: 0,
              justifyContent: "center",
              alignItems: "center",
              flexGrow: 1,
              flexShrink: 0,
              flexBasis: 0,
              flexDirection: "row-reverse"
            }
          })],
        style: {
          display: "flex",
          width: 860,
          justifyContent: "center",
          alignItems: "flex-start",
          flexShrink: 0,
          flexDirection: "row",
          position: "relative"
        }
      }),
      ],
      style: {
        display: "flex",
        width: "100%",
        height: "100%",
        paddingLeft: 64,
        justifyContent: "center",
        alignItems: "center",
        flexShrink: 0,
        flexDirection: "row",
        position: "relative"
      }
    }
    ));
  }
}

class ShovelPurchaseViewModel {
  shovelName = new Binding("");
  shovelImage: Binding<ImageSource>;
  rarityLevel = new Binding("");
  evolutionLevel = new Binding("");
  canEvolve = new Binding(false);
  description = new Binding("");
  abilityText = new Binding("");
  abilityIcon: Binding<ImageSource>
  weightText = new Binding("");
  levelReqText = new Binding("");
  levelReqTextColor = new Binding("#000000");
  priceText = new Binding("");
  priceTextColor = new Binding("#000000");
  categoryText = new Binding("");
  categories = new Array<ShovelPurchaseCategoryViewModel>();
  itemCosts = new Array<ShovelPurchaseItemCostViewModel>();

  constructor(shovelImage: ImageSource) {
    this.shovelImage = new Binding(shovelImage);
    this.abilityIcon = new Binding<ImageSource>(ImageSource.fromTextureAsset(new Asset(BigInt(1304161181004610), BigInt(0))));
  }
}

class ShovelPurchaseCategoryViewModel {
  isShown = new Binding(false);
  categoryName = new Binding("");
  bgColor = new Binding("#000000");
  itemsUnlocked = new Binding(0);
}

class ShovelPurchaseItemCostViewModel {
  isShown = new Binding(false);
  itemName = new Binding("");
  itemImage: Binding<ImageSource>;
  costSatisfactionText = new Binding("");
  costSatisfactionTextColor = new Binding("#000000");
  constructor(itemImage: ImageSource) {
    this.itemImage = new Binding(itemImage);
  }
}
