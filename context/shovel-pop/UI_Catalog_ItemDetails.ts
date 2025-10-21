/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { CategoryUIData } from "CategoryUIData";
import { DigZoneManager } from "DigZoneManager";
import { Component, Player } from "horizon/core";
import { AnimatedBinding, Animation, Binding, Easing, Image, ImageSource, Text, UINode, View } from "horizon/ui";
import { getIslandDisplayName } from "Islands";
import { ItemData } from "ItemData";
import { ItemUtils } from "ItemUtils";
import { Logger } from "Logger";
import { PlayerCatalogData } from "PlayerCatalogData";
import { UI_Catalog_Events } from "UI_Catalog_Events";

const MISSING_ITEM_DETAILS_TEXT = "???";
const UNDISCOVERED_ITEM_COLOR = "#888";
const OUTLINE_SIZE = 1;
const NEW_ITEM_REVEAL_EFFECT_DURATION = 80;

const log = new Logger("UI_Catalog_ItemDetails");

export type ItemDetailsAssets = {
  flex_icn: ImageSource;
  missingItemTexture: ImageSource;
}

export class UI_Catalog_ItemDetails {

  private owner!: Component;
  private localPlayer!: Player;
  private selectedItem: ItemData | undefined = undefined;
  private playerCatalogData?: PlayerCatalogData;
  private assets!: ItemDetailsAssets;
  private itemIdToDigZone: Map<string, string> = new Map();

  private itemDetailsViewModel: ItemDetailsViewModel
  private isInteractable = new Binding(true);

  constructor(owner: Component, assets: ItemDetailsAssets) {
    log.info("UI_Catalog_ItemDetails constructor");
    this.owner = owner;
    this.localPlayer = owner.world.getLocalPlayer();
    this.assets = assets;
    this.itemDetailsViewModel = new ItemDetailsViewModel(this.assets.missingItemTexture);

    owner.connectNetworkBroadcastEvent(DigZoneManager.sendZoneItems, (payload) => {
      this.itemIdToDigZone.clear();

      for (let i = 0; i < payload.zoneItemsDatas.length; i++) {
        let zoneItemsData = payload.zoneItemsDatas[i];
        for (let j = 0; j < zoneItemsData.itemIds.length; j++) {
          let itemId = zoneItemsData.itemIds[j];
          if (this.itemIdToDigZone.has(itemId)) {
            // Probably duplicated because we're concatenating all of the string arrays in the dig zone, including renews
            log.info(`Item ID ${itemId} already exists in the map.`);
            continue;
          }
          log.info(`Adding item ID ${itemId} to map with zone ${zoneItemsData.zoneDisplayName}.`);
          this.itemIdToDigZone.set(itemId, zoneItemsData.zoneDisplayName);
        }
      }
    });

    owner.connectLocalBroadcastEvent(UI_Catalog_Events.showItemDetails, payload => this.setupItemDetails(payload.item, payload.hideDiscovery));
    owner.connectLocalBroadcastEvent(UI_Catalog_Events.revealItemDetails, _ => this.revealItemDetails());
  }

  private revealItemDetails() {
    this.itemDetailsViewModel.revealHideScale.set(
      Animation.timing(1, { duration: NEW_ITEM_REVEAL_EFFECT_DURATION, easing: Easing.linear }),
      () => {
        this.itemDetailsViewModel.isDiscovered.set(true, [this.localPlayer]);
        this.itemDetailsViewModel.shouldDisplayName.set(true, [this.localPlayer]);
        this.itemDetailsViewModel.revealHideScale.set(
          Animation.timing(0, { duration: NEW_ITEM_REVEAL_EFFECT_DURATION, easing: Easing.linear }),
          undefined,
          [this.localPlayer]);
      },
      [this.localPlayer]);
  }

  setDigZoneItemMap(map: Map<string, string>) {
    this.itemIdToDigZone = map;
  }

  setCatalogData(data: PlayerCatalogData) {
    log.info(`Player catalog received.`);
    this.playerCatalogData = data;
    this.refresh();
  }

  setInteractable(value: boolean) {
    this.isInteractable.set(value, [this.localPlayer]);
  }

  private refresh() {
    this.setupItemDetails(this.selectedItem);
  }

  private setupItemDetails(itemData: ItemData | undefined, hideDiscovery: boolean = false) {
    this.selectedItem = itemData;
    if (itemData == undefined) {
      this.itemDetailsViewModel.isUsed.set(false, [this.localPlayer]);
      return;
    }
    const island = getIslandDisplayName(itemData.location);
    const targetPlayer = [this.localPlayer];
    const catalogData = this.playerCatalogData?.collectedItems.find(collectedItem => collectedItem.id === itemData.id);
    const isDiscovered = catalogData !== undefined;
    const categoryData = CategoryUIData.get(itemData.category);
    this.itemDetailsViewModel.isUsed.set(true, targetPlayer);
    let iconAsset = itemData.getIconAsset();
    if (iconAsset === undefined) {
      this.itemDetailsViewModel.icon.set(this.assets.missingItemTexture, targetPlayer);
    } else {
      this.itemDetailsViewModel.icon.set(ImageSource.fromTextureAsset(iconAsset), targetPlayer);
    }
    this.itemDetailsViewModel.rarityColor.set(ItemUtils.RARITY_HEX_COLORS[itemData.rarity], targetPlayer);
    this.itemDetailsViewModel.rarityText.set(ItemUtils.RARITY_TEXT[itemData.rarity], targetPlayer);
    this.itemDetailsViewModel.discoverLocationText.set(`Discovered in ${island}`, targetPlayer);
    this.itemDetailsViewModel.categoryText.set(categoryData.displayName, targetPlayer);
    this.itemDetailsViewModel.categoryColor.set(categoryData.color.toHex(), targetPlayer);
    this.itemDetailsViewModel.descriptionText.set(itemData.description, targetPlayer);

    let lootZoneHintText = itemData.lootZone;
    if (!lootZoneHintText) {
      if (this.itemIdToDigZone.has(itemData.id)) {
        const digZoneDisplayName = this.itemIdToDigZone.get(itemData.id)!;
        lootZoneHintText = `Found at ${digZoneDisplayName}.`;
      }
      else {
        lootZoneHintText = `Found everywhere on ${island}.`;
      }
    }

    this.itemDetailsViewModel.lootZoneText.set(lootZoneHintText, targetPlayer);
    this.itemDetailsViewModel.isDiscovered.set(isDiscovered && !hideDiscovery, targetPlayer);
    if (isDiscovered) {
      this.itemDetailsViewModel.discoverCountText.set(`Count: ${catalogData.count}`, targetPlayer);
      this.itemDetailsViewModel.discoveredDateText.set(`Discovered: ${this.getDiscoveredTime(catalogData.timeDiscovered)}`, targetPlayer);
      this.itemDetailsViewModel.heaviestFoundText.set(`Heaviest: ${catalogData.heaviestWeight}kg`, targetPlayer);
    }

    let isItemOfInterest = this.playerCatalogData?.itemIdsOfInterest.includes(itemData.id) ?? false;
    this.itemDetailsViewModel.shouldDisplayName.set(isDiscovered || isItemOfInterest, targetPlayer);
  }

  private getDiscoveredTime(timeDiscovered: number) {
    const date = new Date(timeDiscovered);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear().toString().slice(2, 4);
    return `${month}/${day}/${year}`;
  }

  getView() {
    return View({ //Item Panel Right
      children: [
        Text({ // Honey Jar
          text: this.itemDetailsViewModel.shouldDisplayName.derive(shouldDisplayName =>
           shouldDisplayName ? this.selectedItem?.name ?? MISSING_ITEM_DETAILS_TEXT : MISSING_ITEM_DETAILS_TEXT),
          style: {
            color: "#9A3700",
            textAlign: "center",
            textAlignVertical: "center",
            height: 48,
            fontFamily: "Roboto",
            fontSize: 22,
            fontWeight: "700",
            marginTop: 8,
          }
        }),
        View({ //UI_CellCatalogItemBig
          children: [View({ //BG Rarity Frame
          children: [View({ //BG Inner
            children: [],
            style: {
              display: "flex",
              padding: 16,
              alignItems: "flex-start",
              flexGrow: 1,
              flexShrink: 0,
              flexBasis: 0,
              alignSelf: "stretch",
              borderRadius: 12,
              backgroundColor: "#F7E5D0",
              flexDirection: "row"
            }
          })],
          style: {
            display: "flex",
            width: 128,
            height: 128,
            padding: 6,
            flexDirection: "column",
            alignItems: "flex-start",
            flexShrink: 0,
            borderRadius: 16,
            backgroundColor: this.itemDetailsViewModel.rarityColor,
            position: "absolute",
            left: 0,
            top: 0
          }
        }),
        Image({ //icn_itemBig
          source: this.itemDetailsViewModel.icon,
          style: {
            width: 120,
            height: 120,
            flexShrink: 0,
            resizeMode: "cover",
            position: "absolute",
            left: 4,
            top: 3.599609375,
            tintColor: this.itemDetailsViewModel.isDiscovered.derive(x => x ? "#FFF" : UNDISCOVERED_ITEM_COLOR)
          }
        })],
        style: {
          width: 128,
          height: 128,
          flexShrink: 0
        }
      }),
      Text({ // Hints to discover can fit 3 lines of texts at most
        text: this.itemDetailsViewModel.lootZoneText,
        style: {
          display: "flex",
          width: 176,
          height: 96,
          flexDirection: "column",
          justifyContent: "center",
          flexShrink: 0,
          color: "#9A3700",
          textAlign: "center",
          textAlignVertical: "center",
          fontFamily: "Roboto",
          fontSize: 20,
          fontWeight: "700"
        }
      }),
      View({ //Type Divider
        children: [
          View({ //Divider
          style: {
            height: 2,
            flexGrow: 1,
            flexShrink: 0,
            flexBasis: 0,
            borderRadius: 2,
            backgroundColor: "#FFEDC1"
          }
        }),
        Text({ // Type
          text: "Type",
          style: {
            color: "#A4610E",
            textAlign: "center",
            fontFamily: "Roboto",
            fontSize: 16,
            fontWeight: "700",
            marginLeft: 8
          }
        }),
        View({ //Divider
          style: {
            height: 2,
            flexGrow: 1,
            flexShrink: 0,
            flexBasis: 0,
            borderRadius: 2,
            backgroundColor: "#FFEDC1",
            marginLeft: 8
          }
        })],
        style: {
          display: "flex",
          width: 200,
          height: 19,
          paddingVertical: 0,
          paddingHorizontal: 8,
          justifyContent: "center",
          alignItems: "center",
          flexShrink: 0,
          flexDirection: "row"
        }
      }),
      View({ //Tags
        children: [View({ //Type Tag
          children: [Text({ // Aliens
            text: this.itemDetailsViewModel.categoryText,
            style: {
              color: "#FFF",
              fontSize: 16,
              fontWeight: "700"
            }
          })],
          style: {
            display: "flex",
            paddingVertical: 4,
            paddingHorizontal: 8,
            justifyContent: "center",
            alignItems: "center",
            borderRadius: 16,
            backgroundColor: this.itemDetailsViewModel.categoryColor,
            flexDirection: "row"
          }
        }),
          // View({ //Frame 7
          //   children: [Text({ // Cousins
          //     text: "Cousins",
          //     style: {
          //       color: "#FFF",
          //       fontSize: 16,
          //       fontWeight: "700"
          //     }
          //   })],
          //   style: {
          //     display: "flex",
          //     paddingVertical: 4,
          //     paddingHorizontal: 8,
          //     justifyContent: "center",
          //     alignItems: "center",
          //     borderRadius: 16,
          //     backgroundColor: "#8E45C2",
          //     marginLeft: 4,
          //     flexDirection: "row"
          //   }
          // })
        ],
        style: {
          display: "flex",
          width: 200,
          height: 75,
          justifyContent: "center",
          alignItems: "center",
          flexShrink: 0,
          flexDirection: "row",
          marginTop: -16
        }
      }),
      UINode.if(this.itemDetailsViewModel.isDiscovered,
        Text({ // Description of the item.
          text: this.itemDetailsViewModel.descriptionText,
          style: {
            display: "flex",
            width: 200,
            minHeight: 74,
            flexDirection: "column",
            justifyContent: "center",
            flexShrink: 0,
            color: "#A4610E",
            textAlign: "center",
            textAlignVertical: "center",
            fontFamily: "Roboto",
            fontSize: 17,
            fontWeight: "700"
          }
        })),
      UINode.if(this.itemDetailsViewModel.isDiscovered,
        View({ //Info Group
          children: [
            Image({ //icn_flex
            source: this.assets.flex_icn,
            style: {
              width: 20,
              height: 20,
              flexShrink: 0,
              resizeMode: "cover"
            }
          }),
          Text({ // Heaviest Record
            text: this.itemDetailsViewModel.heaviestFoundText,
            style: {
              color: "#A4610E",
              fontFamily: "Roboto",
              fontSize: 17,
              fontWeight: "700",
              marginLeft: 8
            }
          })],
          style: {
            display: "flex",
            width: 200,
            marginTop: 12,
            justifyContent: "center",
            alignItems: "center",
            flexDirection: "row"
          }
        }))],
      style: {
        display: "flex",
        width: 200,
        height: 467,
        flexDirection: "column",
        alignItems: "center",
        flexShrink: 0,
        marginLeft: 20
      }
    })
  }





}

class ItemDetailsViewModel {
  public icon: Binding<ImageSource>;
  public rarityColor = new Binding("#ffffff");
  public rarityText = new Binding("");
  public discoverLocationText = new Binding("");
  public categoryText = new Binding("");
  public categoryColor = new Binding("#000000");
  public lootZoneText = new Binding("");
  public descriptionText = new Binding("");
  public discoverCountText = new Binding("");
  public discoveredDateText = new Binding("");
  public heaviestFoundText = new Binding("");
  public isDiscovered = new Binding(false);
  public shouldDisplayName = new Binding(false);
  public isUsed = new Binding(false);
  public revealHideScale = new AnimatedBinding(0);

  constructor(image: ImageSource) {
    this.icon = new Binding(image);
  }
}
