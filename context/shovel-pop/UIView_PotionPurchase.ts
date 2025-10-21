/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { HUDElementType } from "Enums";
import { Events } from "Events";
import { Player } from "horizon/core";
import { Binding, Image, ImageSource, Pressable, Text, UIChildren, UINode, View } from "horizon/ui";
import { ItemUtils } from "ItemUtils";
import { POTION_BUNDLE_PRICE, POTION_BUNDLE_SIZE, PotionBuffType, PotionTuning } from "PotionData";
import { UI_Utils } from "UI_Utils";
import { UIView_InteractionNonBlockingBase } from "UIRoot_ChildrenBase";
import { UIRoot_InteractionNonBlocking } from "UIRoot_InteractionNonBlocking";

const MAX_CATEGORIES = 0;
const RED_COLOR = "#FF4C3F";
const MULTIPLIER_LIMIT = 10

export type PotionPurchaseDialogParams = {
  shovelID: string;
  playerMeetsLevelReq: boolean;
  playerCurrency: number;
  playerItemCount1: number;
  playerItemCount2: number;
  playerItemCount3: number;
}

export type PotionPurchaseDialogCallback = (multiple: number, player: Player) => void;

export class UIView_PotionPurchase extends UIView_InteractionNonBlockingBase {
  private isVisible = new Binding(false);
  private viewModel!: ShovelPurchaseViewModel;
  private onSelectionCallback: (purchase: number) => void;

  private potionMultiple = 1
  private playerCurrency = 0;

  constructor(uiRoot: UIRoot_InteractionNonBlocking, onSelectionCallback: (multiple: number) => void) {
    super(uiRoot);
    this.localPlayer = uiRoot.world.getLocalPlayer();
    this.onSelectionCallback = onSelectionCallback;
    this.createViewModel();
  }

  private createViewModel() {
    this.viewModel = new ShovelPurchaseViewModel(ImageSource.fromTextureAsset(this.props.icn_potionBundle!));
    for (let i = 0; i < MAX_CATEGORIES; i++) {
      this.viewModel.categories.push(new ShovelPurchaseCategoryViewModel());
    }
  }

  setVisible(isVisible: boolean) {
    this.isVisible.set(isVisible, [this.localPlayer]);

    if (isVisible){
      this.uiRoot.sendLocalBroadcastEvent(Events.localHideHUD, { context:'potion_purchase', exclude: HUDElementType.Resources });
    } else{
      this.uiRoot.sendLocalBroadcastEvent(Events.localShowHUD, { context:'potion_purchase', exclude:  HUDElementType.Resources});
    }
  }

  setup(params: PotionPurchaseDialogParams) {
    let target = [this.localPlayer];
    this.viewModel.shovelName.set("Random Luck Boost Potions", target);
    this.playerCurrency = params.playerCurrency;

    let description = "Find Rarer Items!";
    this.viewModel.description.set(description, target)
    let price = POTION_BUNDLE_PRICE * this.potionMultiple;
    this.viewModel.priceText.set(`$${UI_Utils.simplifyNumberToText(price)}`, target);
    this.viewModel.purchaseMultiple.set('x' + POTION_BUNDLE_SIZE * this.potionMultiple, target);
    const priceTextColor = this.playerCurrency >= price ? "#573615" : RED_COLOR;
    this.viewModel.priceTextColor.set(priceTextColor, target);
    let image = ImageSource.fromTextureAsset(this.props.icn_potionBundle!);
    if (image){
      this.viewModel.shovelImage.set(image, target);
    }

  }

  onCountChanged(increment: boolean) {
    this.potionMultiple += increment ? 1 : -1;
    this.potionMultiple = Math.max(1, Math.min(this.potionMultiple, MULTIPLIER_LIMIT)) // clamp

    const target = [this.localPlayer];
    const price = POTION_BUNDLE_PRICE * this.potionMultiple;

    this.viewModel.priceText.set(`$${UI_Utils.simplifyNumberToText(price)}`, target);
    const priceTextColor = this.playerCurrency >= price ? "#573615" : RED_COLOR;
    this.viewModel.priceTextColor.set(priceTextColor, target);
    this.viewModel.purchaseMultiple.set('x' + POTION_BUNDLE_SIZE * this.potionMultiple, target);
    this.viewModel.canDecrement.set(this.potionMultiple > 1, target);
    this.viewModel.canIncrement.set(this.potionMultiple < MULTIPLIER_LIMIT, target);
  }

  getPotionBuffDescription(tuning: PotionTuning): string {
    if (tuning.buffType === PotionBuffType.Category){
      return "Boosts digs for type " + tuning.buffId + " for " + tuning.duration + " minutes.";
    }

    if (tuning.buffType === PotionBuffType.Rarity){
      const rarity = parseFloat(tuning.buffId);
      const rarityName = ItemUtils.RARITY_TEXT[rarity]
      const firstNonZeroBuffValue = tuning.buffValue.find(value => value !== 0)!;
      return `Boosts chance for ${rarityName} items by ${firstNonZeroBuffValue * 100}% and higher rarities for a smaller amount for ${tuning.digs} dig(s).`;
    }

    return 'This potion does nothing.'
  }

  private categoryHeader(): UINode {
    return Text({ // Discovers:
      text: "Boosts:",
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
    return UINode.if(viewModel.isShown, View({ //Type Name
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
        borderRadius: 18,
        backgroundColor: viewModel.bgColor,
        marginRight: 8,
        flexDirection: "row"
      }
    }));
  }

  private moneyLevelGroup(): UINode {
    return View({ //Money Level Group
      children: [
        View({ //Number Box Group
          children: [
            Pressable({ // Minus Button
              children: [Text({
                text: "-",
                style: {
                  color: this.viewModel.canDecrement.derive(x => x ? "#FFF" : "#A9A9A9"),
                  fontSize: 20,
                  fontFamily: "Roboto",
                  fontWeight: "700"
                }
              })],
              style: {
                display: "flex",
                width: 32,
                height: 32,
                justifyContent: "center",
                alignItems: "center",
                borderRadius: 16,
                backgroundColor: this.viewModel.canDecrement.derive(x => x ? "#FF4C3F" : "#B22222"),
                marginRight: 4
              },
              onClick: () => this.onCountChanged(false),
              disabled: this.viewModel.canDecrement.derive(x => !x)
            }),
            Text({ // Number Display
              text: this.viewModel.purchaseMultiple,
              style: {
                color: this.viewModel.priceTextColor,
                display: "flex",
                width: 80,
                flexDirection: "column",
                justifyContent: "center",
                textAlign: "center",
                fontFamily: "Roboto",
                fontSize: 20,
                height: 24,
                fontWeight: "700"
              }
            }),
            Pressable({ // Plus Button
              children: [Text({
                text: "+",
                style: {
                  color: this.viewModel.canIncrement.derive(x => x ? "#FFF" : "#A9A9A9"),
                  fontSize: 20,
                  fontFamily: "Roboto",
                  fontWeight: "700"
                }
              })],
              style: {
                display: "flex",
                width: 32,
                height: 32,
                justifyContent: "center",
                alignItems: "center",
                borderRadius: 16,
                backgroundColor: this.viewModel.canIncrement.derive(x => x ? "#70C04E" : "#3A6B2A"),
                marginLeft: 4
              },
              onClick: () => this.onCountChanged(true),
              disabled: this.viewModel.canIncrement.derive(x => !x)
            })
          ],
          style: {
            display: "flex",
            height: 32,
            paddingVertical: 4,
            paddingHorizontal: 4,
            justifyContent: "center",
            alignItems: "center",
            borderRadius: 16,
            backgroundColor: "#FFF9E9",
            flexDirection: "row",
          }
        }),
        View({ //Spacer
          style: {
            width: 12,
            height: 12
          }
        }),
        View({ //Money Widget
          children: [
            Image({ //img_moneyL
              source: ImageSource.fromTextureAsset(this.props.icn_money!),
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
        })],
      style: {
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        position: "relative",
        width: 400
      }
    });
  }

  createView() {
    const categoryChildren = new Array<UIChildren>();
    categoryChildren.push(this.categoryHeader());
    for (let i = 0; i < MAX_CATEGORIES; ++i) {
      categoryChildren.push(this.categoryTag(this.viewModel.categories[i]));
    }

    const itemCostChildren = new Array<UIChildren>();
    itemCostChildren.push(this.moneyLevelGroup());

    return UINode.if(this.isVisible, View({ //UIPurchasePopup
      children: [View({ //Purchase Widget
        children: [
          View({ //BG Group
            children: [
              View({ //Spacer
                style: {
                  width: 24,
                  height: 12
                }
              }),
              View({ //BG
                children: [],
                style: {
                  width: 400,
                  flexGrow: 1,
                  flexShrink: 0,
                  flexBasis: 0,
                  borderRadius: 12,
                  borderWidth: 4,
                  borderColor: "#FFCD46",
                  backgroundColor: "#FFEECB"
                }
              }),
              View({ //Spacer
                style: {
                  width: 24,
                  height: 24
                }
              })],
            style: {
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              flexGrow: 1,
              flexShrink: 0,
              flexBasis: 0,
              alignSelf: "stretch"
            }
          }),
          View({ //Content
            children: [
            View({ //Title
              children: [Text({ // Purchase shovel?
                text: "Purchase potion bundle?",
                style: {
                  color: "#6E2F0E",
                  textAlign: "center",
                  fontFamily: "Roboto",
                  height: 28,
                  fontSize: 24,
                  fontWeight: "700"
                }
              })],
              style: {
                display: "flex",
                width: 370,
                height: 36,
                paddingVertical: 0,
                paddingHorizontal: 8,
                justifyContent: "center",
                alignItems: "center",
                position: "relative",
                borderRadius: 16,
                backgroundColor: "#FFCD46",
                flexDirection: "row"
              }
            }),
            View({ //Vertical Group
              children: [
              View({ //Property Group
                children: [
                View({ //Name
                  children: [Text({ // UFO
                    text: this.viewModel.shovelName,
                    style: {
                      color: "#5C3B1B",
                      textAlign: "center",
                      textAlignVertical: "center",
                      fontFamily: "Roboto",
                      fontSize: 24,
                      fontWeight: "900",
                      width: 400
                    }
                  }),
                  ],
                  style: {
                    display: "flex",
                    alignItems: "center",
                    flexDirection: "row",
                    width: 400,
                  }
                }),
                Text({ // Description
                  text: this.viewModel.description,
                  style: {
                    width: 400,
                    color: "#7B5B3D",
                    textAlign: "center",
                    textAlignVertical: "center",
                    fontSize: 16,
                    fontWeight: "700",
                    flexWrap: "wrap",
                  }
                }),
                View({ //Item Group
                  children: [Image({ //icn_Shovel
                    source: this.viewModel.shovelImage,
                    style: {
                      width: 135,
                      height: 135,
                      resizeMode: "cover",
                    }
                  })],
                  style: {
                    display: "flex",
                    width: 230,
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                  }
                })
                ],
                style: {
                  display: "flex",
                  width: "100%",
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: "center",
                  position: "relative"
                }
              }),

              View({ //Spacer
                style: {
                  width: 24,
                  height: 24,
                }
              }),
                View({ //Requirement Group
                  children: itemCostChildren,
                  style: {
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    alignContent: "center",
                    alignSelf: "stretch",
                    flexWrap: "wrap",
                    borderRadius: 35,
                    flexDirection: "row",
                    position: "relative"
                  }
                })
              ],
              style: {
                display: "flex",
                width: 200,
                flexDirection: "column",
                justifyContent: "flex-start",
                alignItems: "flex-start",
                paddingVertical: 8
              }
            }),
            View({ //Btn Group
              children: [
              Pressable({ //BtnMain
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
                  borderRadius: 16,
                  borderBottomWidth: 4,
                  backgroundColor: "#FFCB5C",
                  borderColor: "#CCA855",
                  flexDirection: "row"
                },
                onClick: () => this.onSelectionCallback(0),
              }),
              Pressable({ //BtnMain
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
                  borderRadius: 16,
                  borderBottomWidth: 4,
                  backgroundColor: "#70C04E",
                  borderColor: "#49A24C",
                  marginLeft: 8,
                  flexDirection: "row"
                },
                onClick: () => this.onSelectionCallback(this.potionMultiple),
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
              width: 400,
              marginLeft: -400,
              paddingVertical: 0,
              paddingHorizontal: 24,
              flexDirection: "column",
              alignItems: "center",
              flexShrink: 0
            }
          })],
        style: {
          display: "flex",
          width: 400,
          justifyContent: "center",
          alignItems: "center",
          flexShrink: 0,
          flexDirection: "row"
        }
      }),
    ],
      style: {
        display: "flex",
        width: "100%",
        height: "95%",
        padding: 16,
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
  shovelName = new Binding("Random Luck Boost Potions");
  shovelImage: Binding<ImageSource>;
  description = new Binding("Find rarer items!");
  priceText = new Binding("$250");
  priceTextColor = new Binding("#000000");
  purchaseMultiple = new Binding('x5')
  categories = new Array<ShovelPurchaseCategoryViewModel>();
  canDecrement = new Binding(false);
  canIncrement = new Binding(true);

  constructor(shovelImage: ImageSource) {
    this.shovelImage = new Binding(shovelImage);
  }
}

class ShovelPurchaseCategoryViewModel {
  isShown = new Binding(false);
  categoryName = new Binding("");
  bgColor = new Binding("#000000");
}
