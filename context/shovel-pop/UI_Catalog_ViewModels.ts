/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Player } from "horizon/core";
import { Binding, Image, ImageSource, Pressable, UINode, View, ViewStyle } from "horizon/ui";
import { ItemData } from "ItemData";
import { ItemUtils } from "ItemUtils";
import { Shovel } from "Shovel";

const MISSING_ITEM_BUTTON_TEXT = "?";
const OUTLINE_SIZE = 1;

export type ItemViewModelAssets = {
  missingTexture: ImageSource,
  checkmark: ImageSource,
  reqShovelBG: ImageSource,
}

export class ItemViewModel {
  image: Binding<ImageSource>;
  isFound = new Binding(false);
  isUsed = new Binding(false);
  requiresShovel = new Binding(false);
  reqShovelImage: Binding<ImageSource>;
  rarityColor = new Binding("#ffffff");
  isSelected = new Binding(false);
  isInteractable: Binding<boolean>;

  onClick: (() => void) | undefined = undefined;

  private missingTexture: ImageSource;
  private icn_checkmarkBig: Binding<ImageSource>;
  private reqShovelBG: Binding<ImageSource>;

  private player: Player;
  private showBlankWhenUnused: boolean;

  id: string = "";

  constructor(player: Player, assets: ItemViewModelAssets, showBlankWhenUnused?: boolean, isInteractable?: Binding<boolean>) {
    this.missingTexture = assets.missingTexture;
    this.player = player;
    this.reqShovelImage = new Binding(assets.missingTexture);
    this.image = new Binding(assets.missingTexture);
    this.icn_checkmarkBig = new Binding(assets.checkmark);
    this.reqShovelBG = new Binding(assets.reqShovelBG);
    this.showBlankWhenUnused = showBlankWhenUnused ?? false;
    this.isInteractable = isInteractable ?? new Binding(false);
  }

  setItem(item: ItemData | undefined, isFound?: boolean) {
    const hasItem = item !== undefined;
    this.id = hasItem ? item.id : "";
    this.isUsed.set(hasItem, [this.player]);
    if (!hasItem) {
      return;
    }
    const itemImage = item.getIconAsset();
    const itemImageSource = itemImage ? ImageSource.fromTextureAsset(itemImage) : this.missingTexture;
    this.image.set(itemImageSource, [this.player]);
    this.rarityColor.set(ItemUtils.RARITY_HEX_COLORS[item.rarity], [this.player]);
    this.isFound.set(isFound ?? false, [this.player]);
    const requiresShovel = item.requiredShovels.length > 0;
    this.requiresShovel.set(requiresShovel, [this.player]);
    if (requiresShovel) {
      const shovelData = Shovel.getData(item.requiredShovels, 0);
      if (!shovelData) {
        console.warn(`Shovel data not found for item ${item.id}  shovel:${item.requiredShovels}`);
      } else {
        const shovelImage = shovelData.getIconAsset();
        const shovelImageSource = shovelImage ? ImageSource.fromTextureAsset(shovelImage) : this.missingTexture;
        this.reqShovelImage.set(shovelImageSource, [this.player]);
      }
    }
  }

  getView(style?: ViewStyle) {
    return UINode.if(this.isUsed, View({ //Cell Punch Card
      children: [
        View({ //BG Inventory Item
        style: {
          width: 82,
          height: 82,
          flexShrink: 0,
          borderRadius: 4,
          borderWidth: 3.01,
          borderColor: this.rarityColor,
          backgroundColor: this.isFound.derive(x => x ? "#888" : "#000"),
          opacity: 0.7,
          position: "absolute",
          left: 0,
          top: 0
        }
      }),
      Image({ //icn_item
        source: this.image!,
        style: {
          width: 72,
          height: 72,
          flexShrink: 0,
          top: 4,
          resizeMode: "cover",
          position: "absolute",
          alignSelf: "center",
          tintColor: this.isFound.derive(x => x ? "#FFF" : "#666"),
        }
      }),
      UINode.if(this.isFound, Image({ //icn_checkmarkBig
        source: this.icn_checkmarkBig,
        style: {
          width: 24,
          height: 24,
          flexShrink: 0,
          position: "absolute",
          left: 4,
          top: 4
        }
      })),
      UINode.if(this.requiresShovel, View({ //Shovel Group
        children: [
          Image({ //icn_BGShovelMarker
            source: this.reqShovelBG,
            style: {
              width: 56,
              height: 56,
              flexShrink: 0,
              position: "absolute",
              tintColor: this.rarityColor,
              left: 0,
              top: 0
            }
          }),
          Image({ //icn_shovel
            source: this.reqShovelImage,
            style: {
              width: 52,
              height: 52,
              transform: [
                {
                  rotate: "30deg"
                }
              ],
              flexShrink: 0,
              position: "absolute",
              left: 11,
              top: 9
            }
          })],
        style: {
          width: 56,
          height: 56,
          flexShrink: 0,
          position: "absolute",
          right: 2,
          bottom: 2
        }
      })),
      // UINode.if(this.isFound.derive(x => !x), UI_Utils.outlinedText({ // Name
      //   text: MISSING_ITEM_BUTTON_TEXT,
      //   outlineSize: OUTLINE_SIZE,
      //   style: {
      //     width: 60,
      //     color: "#FFF",
      //     textAlign: "center",
      //     fontFamily: "Roboto",
      //     fontSize: 24,
      //     fontWeight: "700",
      //     position: "absolute",
      //     alignSelf: "center",
      //     top: 24
      //   }
      // })),
      UINode.if(this.isInteractable, Pressable({
        style: {
          width: "100%",
          height: "100%",
          position: "absolute",
        },
        onClick: () => this.onClick?.(),
      }))],
      style: {
        width: 82,
        height: 82,
        margin: 4,
        ...style,
      }
    }),
      View({ //Cell Empty
        children: this.showBlankWhenUnused ?
        [View({ //BG Inventory Item
          style: {
            width: 82,
            height: 82,
            flexShrink: 0,
            borderRadius: 4,
            backgroundColor: "rgb(0, 0, 0)",
            opacity: 0.07,
            position: "absolute",
            left: 0,
            top: 0
          }
        })] : [],
        style: {
          width: 82,
          height: 82,
          margin: 4,
          ...style,
        }
      })
    );
  }
}
