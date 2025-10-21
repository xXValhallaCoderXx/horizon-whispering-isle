/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Component, Player } from "horizon/core";
import { Binding, Image, ImageSource, Pressable, Text, UIChildren, UINode, View } from "horizon/ui";
import { getIslandFromID, Islands } from "Islands";
import { ItemContainer } from "ItemContainer";
import { ItemData } from "ItemData";
import { Logger } from "Logger";
import { PlayerCatalogData } from "PlayerCatalogData";
import { QuestEvents } from "QuestManager";
import { GoToDigZoneSubquestParameters } from "SubquestData";
import { UI_Catalog_Events } from "UI_Catalog_Events";
import { ItemViewModel } from "UI_Catalog_ViewModels";

const MAX_ZONES_PER_PAGE = 3;
const MAX_ROWS_PER_PAGE = 3;
const MAX_ROWS_PER_ZONE = 1;
const MAX_ITEMS_PER_ROW = 5;
const log = new Logger("UI_Catalog_ItemDetails");

export type IslandZoneItems = {
  gemReward: number,
  isLTE: boolean,
  name: string,
  levelReq: number,
  id: string,
  itemIds: string[]
}

export type ZoneBrowserAssets = {
  icn_locationWhite: ImageSource;
  rightPageButton: ImageSource;
  leftPageButton: ImageSource;
  reqShovelBG: ImageSource;
  icn_checkmarkBig: ImageSource;
  icn_gem: ImageSource;
  missingItemTexture: ImageSource;
  icn_star: ImageSource;
}

class ZoneViewModel {
  name = new Binding("");
  isComplete = new Binding(false);
  gemReward = new Binding("");
  items: ItemViewModel[] = [];
  reqLevelText = new Binding("");
  zoneId: string = "";
  isLTE = new Binding(false);
  isShown = new Binding(false);
}

export class UI_Catalog_ZoneBrowser {
  private owner!: Component;
  private localPlayer!: Player;
  private selectedItem: ItemData | undefined = undefined;
  private playerCatalogData?: PlayerCatalogData;
  private assets!: ZoneBrowserAssets;
  private islandZoneItemMap: Map<Islands, IslandZoneItems[]> = new Map();
  private zones: ZoneViewModel[] = [];
  private currentPageIndex: number = 0;
  private currentIsland: Islands = Islands.BeachCamp;
  private pages: IslandZoneItems[][] = [];

  private isInteractable = new Binding(true);
  private completedRegionText = new Binding("");

  constructor(owner: Component, assets: ZoneBrowserAssets) {
    log.info("UI_Catalog_ZoneBrowser constructor");
    this.owner = owner;
    this.localPlayer = owner.world.getLocalPlayer();
    this.assets = assets;
    for (let i = 0; i < MAX_ZONES_PER_PAGE; i++) {
      const zone = new ZoneViewModel();
      for (let j = 0; j < MAX_ROWS_PER_ZONE * MAX_ITEMS_PER_ROW; j++) {
        zone.items.push(new ItemViewModel(this.localPlayer, {
          missingTexture: assets.missingItemTexture,
          checkmark: assets.icn_checkmarkBig,
          reqShovelBG: assets.reqShovelBG,
        }, true, this.isInteractable));
      }
      this.zones.push(zone);
    }
    owner.connectLocalBroadcastEvent(UI_Catalog_Events.islandSelected, payload => this.setIsland(payload.island));
  }

  setIslandZoneMap(map: Map<Islands, IslandZoneItems[]>) {
    this.islandZoneItemMap = map;
  }

  setCatalogData(data: PlayerCatalogData) {
    log.info(`Player catalog received.`);
    this.playerCatalogData = data;
    this.updateIslandZones();
    this.refresh();
  }

  setInteractable(value: boolean) {
    this.isInteractable.set(value, [this.localPlayer]);
  }

  setIsland(island: Islands) {
    this.currentIsland = island;
    this.updateIslandZones();
    this.currentPageIndex = 0;
    this.refresh();
  }

  private updateIslandZones() {
    this.pages = [];
    const zones = this.islandZoneItemMap.get(this.currentIsland);
    let currentPageRowCount = 0;
    let currentPage: IslandZoneItems[] = [];
    this.pages.push(currentPage);
    let completedCount = 0;
    let total = 0;
    if (zones) {
      for (let i = 0; i < zones.length; i ++) {
        const zone = zones[i];
        const itemCount = zone.itemIds.length;
        if (itemCount === 0) {
          continue;
        }
        const zoneRowCount = Math.floor((itemCount + MAX_ITEMS_PER_ROW - 1) / MAX_ITEMS_PER_ROW);
        currentPageRowCount += zoneRowCount;
        if (currentPageRowCount > MAX_ROWS_PER_PAGE) {
          currentPage = [];
          this.pages.push(currentPage);
          currentPageRowCount = zoneRowCount;
        }
        currentPage.push(zone);
        total++;
        if ((this.playerCatalogData?.completedZones.indexOf(zone.id) ?? -1) >= 0) {
          completedCount++;
        }
      }
    }
    this.completedRegionText.set(`Completed Regions: ${completedCount}/${total}`, [this.localPlayer]);
  }

  refresh() {
    const page = this.pages[this.currentPageIndex];
    const target = [this.localPlayer]

    for (let i = 0; i < MAX_ZONES_PER_PAGE; i++) {
      const zone = this.zones[i];
      if (i < page.length) {
        zone.isShown.set(true, target);
        const zoneItems = page[i];
        zone.name.set(zoneItems.name, target);
        zone.reqLevelText.set(zoneItems.levelReq.toString(), target);
        zone.zoneId = zoneItems.id;
        zone.isLTE.set(zoneItems.isLTE, target);
        zone.gemReward.set(`x${zoneItems.gemReward}`, target);
        zone.isComplete.set((this.playerCatalogData?.completedZones.indexOf(zoneItems.id) ?? -1) >= 0, target);
        for (let j = 0; j < MAX_ITEMS_PER_ROW * MAX_ROWS_PER_ZONE; j++) {
          const itemViewModel = zone.items[j];
          if (j < zoneItems.itemIds.length) {
            const itemId = zoneItems.itemIds[j];
            const itemData = ItemContainer.localInstance?.getItemDataForId(itemId);
            itemViewModel.isUsed.set(true, target);
            itemViewModel.setItem(itemData, this.playerCatalogData?.collectedItems.some(x => x.id === itemId));
            itemViewModel.onClick = () => this.selectItem(itemData);
          } else {
            itemViewModel.isUsed.set(false, target);
          }
        }
      } else {
        zone.isShown.set(false, target);
      }
    }
  }

  private selectItem(item: ItemData | undefined, hideDiscovery: boolean = false) {
    this.getButtonFromData(this.selectedItem)?.isSelected.set(false, [this.localPlayer]);
    this.selectedItem = item;
    this.getButtonFromData(this.selectedItem)?.isSelected.set(true, [this.localPlayer]);
    if (item === undefined) {
      log.info(`Clearing selected item.`);
    } else {
      log.info(`Selecting item (${item.name}).`);
    }
    this.owner.sendLocalBroadcastEvent(UI_Catalog_Events.showItemDetails, { item, hideDiscovery });
  }

    private getButtonFromData(data: ItemData | undefined): ItemViewModel | undefined {
      if (data === undefined) {
        return undefined;
      }

      for (const zone of this.zones) {
        const itemViewModel = zone.items.find(item => (item.id === data.id));
        if (itemViewModel !== undefined) {
          return itemViewModel;
        }
      }
    }

  private pageForward() {
    this.currentPageIndex = Math.min(this.getMaxPageCount() - 1, this.currentPageIndex + 1);
    this.refresh();
  }

  private pageBackward() {
    this.currentPageIndex = Math.max(0, this.currentPageIndex - 1);
    this.refresh();
  }

  private getMaxPageCount() {
    return this.pages.length;
  }

  private navigateToZone(zoneId: string) {
    const GO_TO_DIG_ZONE_QUEST_ID = "go_to_digzone";
    const questParameters: GoToDigZoneSubquestParameters = { zoneId }
    this.owner.sendNetworkBroadcastEvent(QuestEvents.requestStartQuestForPlayer, {
      player: this.localPlayer,
      questId: GO_TO_DIG_ZONE_QUEST_ID,
      overwriteExisting: true,
      questParameters})
    this.owner.sendLocalBroadcastEvent(UI_Catalog_Events.requestToggleCatalog, {});
  }

  getView() {
    const children: UIChildren[] = [];
    for (let i = 0; i < this.zones.length; i++) {
      const zone = this.zones[i];
      children.push(this.getZoneView(zone));
    }

    return View({ //Item Panel Left
      children: [
        View({ //Regions
          children: [
            View({ //Items Grid
              children,
              style: {
                display: "flex",
                height: 440,
                paddingTop: 8,
                flexDirection: "column",
                alignItems: "flex-start"
              }
            }),
            View({ //Pagination
              children: [
                Pressable({ //button_prevPage
                  children: [Image({ //icn_LeftCatalog
                    source: this.assets.leftPageButton,
                    style: {
                      width: 48,
                      height: 48,
                      flexShrink: 0,
                      borderRadius: 8,
                      position: "absolute",
                      left: 0,
                      top: 0
                    }
                  })],
                  style: {
                    display: "flex",
                    width: 48,
                    height: 48,
                    justifyContent: "center",
                    alignItems: "center"
                  },
                  onClick: () => this.pageBackward(),
                  disabled: this.isInteractable.derive(x => !x)
                }),
                Text({ // Completed Regions text
                  text: this.completedRegionText,
                  style: {
                    display: "flex",
                    height: 30,
                    flexDirection: "column",
                    justifyContent: "center",
                    flexGrow: 1,
                    flexShrink: 0,
                    flexBasis: 0,
                    color: "#A4610E",
                    textAlign: "center",
                    textAlignVertical: "center",
                    fontFamily: "Roboto",
                    fontSize: 24,
                    fontWeight: "700"
                  }
                }),
                Pressable({ //button_nextPage
                  children: [Image({ //icn_RightCatalog
                    source: this.assets.rightPageButton,

                    style: {
                      width: 48,
                      height: 48,
                      flexShrink: 0,
                      borderRadius: 8,
                      position: "absolute",
                      left: 0,
                      top: 0
                    }
                  })],
                  style: {
                    display: "flex",
                    width: 48,
                    height: 48,
                    justifyContent: "center",
                    alignItems: "center"
                  },
                  onClick: () => this.pageForward(),
                  disabled: this.isInteractable.derive(x => !x)
                })],
              style: {
                display: "flex",
                marginTop: -4,
                height: 48,
                justifyContent: "center",
                alignItems: "center",
                alignSelf: "stretch",
                flexDirection: "row"
              }
            })],
          style: {
            display: "flex",
            flexDirection: "column",
            alignItems: "center"
          }
        })],
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingBottom: 8,
        height: 490
      }
    })
  }

  private getZoneView(zone: ZoneViewModel): UIChildren {
    const itemRows: UIChildren[] = [];
    for (let i = 0; i < MAX_ROWS_PER_ZONE; i++) {
      itemRows.push(this.getItemRow(zone.items, i));
    }
    return UINode.if(zone.isShown, View({ //Region Group
      children: [
        View({ //BG Highlight
          children: [],
          style: {
            width: 163,
            height: 100,
            position: "absolute",
            right: 0,
            bottom: 0,
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 9,
            backgroundColor: zone.isComplete.derive(x => x ? "#FAFFD2" : "#FFEA9B"),
          }
        }),
        View({ //Title
          children: [
            /*View({ //LTE Group, only shows for LTE regions
            children: [Image({ //icn_clock
              source: ImageSource.fromTextureAsset(this.props.icn_clock!),
              style: {
                width: 28,
                height: 28,
                resizeMode: "cover",
                marginLeft: 4
              }
            }),
            Text({ // LTE
              text: "LTE",
              style: {
                color: "#9A3700",
                textAlign: "right",
                fontFamily: "Roboto",
                fontSize: 20,
                fontWeight: "700",
                marginLeft: 4
              }
            }),
            Text({ // on-going: only shows for ongoing LTE
              text: "On-going",
              style: {
                color: "#9A3700",
                textAlign: "right",
                fontFamily: "Roboto",
                fontSize: 20,
                fontWeight: "700",
                marginLeft: 8
              }
            }),
            Text({ // Timer Text, only shows for ongoing LTE
              text: "4:34",
              style: {
                color: "#9A3700",
                textAlign: "right",
                fontFamily: "Roboto",
                fontSize: 20,
                fontWeight: "700",
                marginLeft: 8,
                marginRight: 8
              }
            })],
            style: {
              display: "flex",
              alignItems: "center",
              flexDirection: "row"
            }
          }),*/
            Text({ // Workshop Lake
              text: zone.name,
              style: {
                color: zone.isComplete.derive(x => x ? "#004E1F" : "#9A3700"),
                textAlign: "center",
                fontFamily: "Roboto",
                fontSize: 20,
                fontWeight: "900",
                marginLeft: 16
              }
            }),
            Text({ // Level Number
              text: zone.reqLevelText,
              style: {
                color: zone.isComplete.derive(x => x ? "#004E1F" : "#9A3700"),
                textAlign: "center",
                fontFamily: "Roboto",
                fontSize: 20,
                fontWeight: "900",
                marginLeft: 8
              }
            }),
            Image({ //icn_star
              source: this.assets.icn_star, // Note for Dan: Need to replace this with the icn_star!
              style: {
                width: 24,
                height: 24,
                flexShrink: 0,
                tintColor: zone.isComplete.derive(x => x ? "#004E1F" : "#9A3700"),
              }
            }),
            Pressable({ //button_Locate
              children: [
                Image({ //icn_locationWhite
                  source: this.assets.icn_locationWhite,
                  style: {
                    width: 24,
                    height: 24,
                    flexShrink: 0
                  }
                }),
                Text({ // Locate
                  text: "Navigate",
                  style: {
                    color: "#FFF",
                    fontFamily: "Roboto",
                    textAlign: "center",
                    textAlignVertical: "center",
                    fontSize: 18,
                    fontWeight: "700",
                    marginLeft: 8
                  }
                })],
              style: {
                display: "flex",
                width: 165,
                height: 32,
                justifyContent: "center",
                alignItems: "center",
                position: "absolute",
                right: -0.4,
                borderTopLeftRadius: 4,
                borderTopRightRadius: 12,
                borderBottomLeftRadius: 4,
                borderBottomRightRadius: 0,
                borderBottomWidth: 4,
                backgroundColor: "#70C04E",
                borderColor: "#49A24C",
                flexDirection: "row",
                top: -2
              },
              onClick: () => this.navigateToZone(zone.zoneId),
              disabled: this.isInteractable.derive(x => !x)
            })],
          style: {
            display: "flex",
            width: "102.5%",
            height: 32,
            alignItems: "center",
            position: "absolute",
            top: -34,
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            backgroundColor: zone.isComplete.derive(x => x ? "#C8E254" : "#FD6"),
            borderColor: zone.isComplete.derive(x => x ? "#49A24C" : "#9A3700"),
            borderBottomWidth: 2,
            //borderColor: zone.isLTE.derive(x => x ? "#FFCED1" : "#9A3700"), // Tint this color to "#FFCED1" if it's LTE
            marginTop: 8,
            flexDirection: "row",
            left: -2
          }
        }),
        View({
          children: itemRows,
          style: {}
        }),
        UINode.if(zone.isComplete, View({ // Complete group (only show when it's completed)
          children: [
            /*Text({ // New Items In
            text: "Next goal in ",
            style: {
              color: "#A4610E",
              textAlign: "center",
              fontFamily: "Roboto",
              fontSize: 16,
              fontWeight: "700"
            }
          }),
          Text({ // Reset Timer
            text: "11m:45s",
            style: {
              color: "#9A3700",
              textAlign: "center",
              fontFamily: "Roboto",
              fontSize: 24,
              fontWeight: "900"
            }
          }),*/ // Cool down timer. Not doing this rn.
            Image({ //icn_checkmarkBig
              source: this.assets.icn_checkmarkBig,
              style: {
                width: 36,
                height: 36,
                flexShrink: 0,
                resizeMode: "cover"
              }
            }),
          Text({ // Complete text
              text: "Complete!",
              style: {
                color: "#31A24C",
                textAlign: "center",
                fontFamily: "Roboto",
                fontSize: 24,
                fontWeight: "700"
              }
            })
          ],
          style: {
            display: "flex",
            width: 163,
            height: 84,
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            position: "absolute",
            right: 2,
            top: 2,
            borderRadius: 12,
            marginTop: 8,
            left: 475
          }
        }),
        View({ //Reward Group (show by default)
          children: [
            View({ //Reward Content
              children: [Image({ //icn_gem
                source: this.assets.icn_gem,
                style: {
                  width: 54,
                  height: 54,
                  resizeMode: "cover"
                }
              }),
              Text({ // Gem Number
                text: zone.gemReward,
                style: {
                  color: "#3B1F68",
                  textAlign: "center",
                  fontFamily: "Roboto",
                  fontSize: 28,
                  fontWeight: "900"
                }
              })],
              style: {
                display: "flex",
                height: 47,
                paddingVertical: 0,
                paddingHorizontal: 12,
                justifyContent: "center",
                alignItems: "center",
                flexShrink: 0,
                borderRadius: 12,
                flexDirection: "row"
              }
            })],
          style: {
            display: "flex",
            width: 163,
            height: 84,
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            position: "absolute",
            right: 2,
            top: 2,
            marginTop: 8,
            left: 475
          }
        }))

      ],
      style: {
        display: "flex",
        width: 640,
        paddingTop: 8,
        paddingRight: 0,
        paddingBottom: 2,
        paddingLeft: 12,
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 12,
        borderWidth: 2,
        borderColor: zone.isComplete.derive(x => x ? "#49A24C" : "#9A3700"),
        backgroundColor: zone.isComplete.derive(x => x ? "#FAFFD2" : "#FFF9E0"),
        marginTop: 34
      }
    }),
    View({
      style: {
        width: 640
      }
    })
  );
  }

  private getItemRow(items: ItemViewModel[], rowIndex: number): UIChildren {
    const children: UIChildren[] = [];
    const indexOffset = rowIndex * MAX_ITEMS_PER_ROW;
    for (let i = 0; i < MAX_ITEMS_PER_ROW; i++) {
      children.push(items[indexOffset + i].getView());
    }
    return View({ //Items Group
      children,
      style: {
        display: "flex",
        alignItems: "center",
        borderRadius: 12,
        flexDirection: "row",
      }
    })

  }
}
