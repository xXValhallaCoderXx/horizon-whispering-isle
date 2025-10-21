/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Component, Entity, Player } from "horizon/core";
import { Binding, Image, ImageSource, Pressable, Text, UIChildren, UINode, View } from "horizon/ui";
import { forEachIsland, getIslandCatalogImageAsset, getIslandDisplayName, getIslandFromID, getIslandID, Islands, isShownInCatalog } from "Islands";
import { Logger } from "Logger";
import { PlayerCatalogData } from "PlayerCatalogData";
import { UI_Catalog_Events } from "UI_Catalog_Events";
import { UI_Utils } from "UI_Utils";

const MAX_ISLAND_COUNT = 5;
const OUTLINE_SIZE = 1;
const UNSELECTABLE_LOCKED_ISLANDS = false;

const log = new Logger("UI_Catalog_IslandPanel");

export type IslandPanelAssets = {
  lock_icn: ImageSource,
  missingItemTexture: ImageSource,
}

export class UI_Catalog_IslandPanel {
  private owner: Component;
  private islandButtons: Array<IslandButtonViewModel> = []
  private selectedIsland?: Islands;
  private islands: Array<Islands> = [];
  private playerCatalogData?: PlayerCatalogData;
  private localPlayer!: Player;
  private isInteractable = new Binding(true);
  private assets: IslandPanelAssets;

  constructor(owner: Component, assets: IslandPanelAssets) {
    log.info("UI_Catalog_IslandPanel constructor");
    this.owner = owner;
    this.assets = assets;
    this.localPlayer = owner.world.getLocalPlayer();
    owner.connectLocalBroadcastEvent(UI_Catalog_Events.requestSelectedIsland, payload => this.onRequestSelectedIsland());
    for (let i = 0; i < MAX_ISLAND_COUNT; ++i) {
      this.islandButtons.push(new IslandButtonViewModel(assets.missingItemTexture));
    }
  }

  setCatalogData(data: PlayerCatalogData) {
    this.playerCatalogData = data;
    for (let i = 0; i < this.islands.length; ++i) {
      const island = this.islands[i];
      this.updateIslandButton(this.islandButtons[i], island);
    }
    this.selectIsland(this.selectedIsland ?? this.islands[0]);
  }

  setupIslands() {
    log.info("Initializing island data...");
    let index = 0;
    forEachIsland(island => {
      if (isShownInCatalog(island)) {
        if (index >= MAX_ISLAND_COUNT) {
          log.error(`Too many islands in catalog!`);
          return;
        }
        this.islands.push(island);
        var islandButton = this.islandButtons[index++];
        this.setupIslandButton(islandButton, island);
      }
    });
    this.selectIsland(this.islands[0]);
  }

  setInteractable(value: boolean) {
    this.isInteractable.set(value, [this.localPlayer]);
  }

  getIslandIndex(location: string) {
    for (let i = 0; i < this.islands.length; ++i) {
      if (getIslandID(this.islands[i]) === location) {
        return i;
      }
    }
    return -1;
  }

  getSelectedIslandID() {
    return getIslandID(this.selectedIsland ?? Islands.None);
  }

  selectIslandFromLocationID(location: string, force: boolean = false) {
    const index = this.getIslandIndex(location);
    if (index >= 0) {
      this.selectIsland(this.islands[index], force);
    }
  }

  private refresh() {
    for (let i = 0; i < this.islands.length; ++i) {
      const island = this.islands[i];
      var islandButton = this.islandButtons[i];
      this.refreshIslandButton(islandButton, island);
    }
  }

  private setupIslandButton(islandButton: IslandButtonViewModel, island: Islands) {
    islandButton.isUsed.set(true, [this.localPlayer]);
    const islandImage = getIslandCatalogImageAsset(island);
    if (islandImage !== undefined) {
      islandButton.background.set(ImageSource.fromTextureAsset(islandImage), [this.localPlayer]);
    }
    islandButton.name.set(getIslandDisplayName(island) ?? "MISSING", [this.localPlayer]);
    islandButton.buttonCallback = () => this.selectIsland(island);
    this.updateIslandButton(islandButton, island ?? Islands.None);
  }

  private updateIslandButton(islandButton: IslandButtonViewModel, island: Islands) {
    const isLocked = (this.playerCatalogData?.unlockedIslands.indexOf(island) ?? -1) < 0;
    islandButton.isLocked.set(isLocked, [this.localPlayer]);
  }

  private refreshIslandButton(islandButton: IslandButtonViewModel, island: Islands) {
    if (this.selectedIsland === island) {
      islandButton.backgroundColor.set("#FFF", [this.localPlayer]);
      islandButton.textColor.set("#FFF", [this.localPlayer]);
    } else {
      islandButton.backgroundColor.set("#AAA", [this.localPlayer]);
      islandButton.textColor.set("#AAA", [this.localPlayer]);
    }
  }

  private onRequestSelectedIsland() {
    log.info(`RequestSelectedIsland received.`);
    if (this.selectedIsland !== undefined) {
      this.owner.sendLocalBroadcastEvent(UI_Catalog_Events.islandSelected, { island: this.selectedIsland, isOpenSequence: false });
    }
  }

  private selectIsland(island: Islands, isOpenSequence: boolean = false) {
    if (UNSELECTABLE_LOCKED_ISLANDS && (this.playerCatalogData?.unlockedIslands.indexOf(island) ?? -1 < 0)) {
      return false;
    }
    log.info(`Selected island ${getIslandDisplayName(island)}`);
    this.getButtonFromData(this.selectedIsland)?.isSelected.set(false, [this.localPlayer]);
    this.selectedIsland = island;
    this.getButtonFromData(this.selectedIsland)?.isSelected.set(true, [this.localPlayer]);
    this.owner.sendLocalBroadcastEvent(UI_Catalog_Events.islandSelected, { island, isOpenSequence });
    this.refresh();
  }

  private getButtonFromData(island?: Islands): IslandButtonViewModel | undefined {
    if (island !== undefined) {
      const index = this.islands.indexOf(island);
      if (index >= 0) {
        return this.islandButtons[index];
      }
    }
    return undefined;
  }

  getView() {
    const buttonPanel: UIChildren[] = [];
    //buttonPanel.push(this.islandHeader());
    for (let i = 0; i < MAX_ISLAND_COUNT; ++i) {
      buttonPanel.push(this.islandButton(this.islandButtons[i]));
    }
    return View({ //Island Tab Group
      children: buttonPanel,
      style: {
        display: "flex",
        paddingTop: 32,
        paddingRight: 20,
        paddingBottom: 8,
        paddingLeft: 0,
        flexDirection: "column",
        alignItems: "flex-start"
      }
    });
  }

  private islandHeader() {
    return View({ //UI_Header
      children: [UI_Utils.outlinedText({ // Islands
        text: "Islands",
        outlineSize: 0,
        style: {
          color: "#6E2F0E",
          textAlign: "center",
          fontFamily: "Roboto",
          fontSize: 20,
          fontWeight: "700"
        }
      })],
      style: {
        display: "flex",
        width: 162,
        height: 32,
        paddingVertical: 0.8,
        paddingHorizontal: 36,
        justifyContent: "center",
        alignItems: "center",
        position: "absolute",
        left: 6.4,
        top: 2,
        borderRadius: 12,
        backgroundColor: "#FFB330",
        flexDirection: "row"
      }
    });
  }

  private islandButton(viewModel: IslandButtonViewModel) {
    return UINode.if(viewModel.isUsed,
      View({ //Island Tab Group
        children: [
          Pressable({ //button_TabCatalog_Locked
            children: [
              View({ //BG
                children: [],
                style: {
                  width: 180,
                  height: 64,
                  flexShrink: 0,
                  borderRadius: 12,
                  borderBottomWidth: 4,
                  borderColor: "#D3A334",
                  backgroundColor: "#FFF1C1",
                  position: "absolute",
                  left: 0,
                  top: 0
                }
              }),
              Image({ //icn_island
                source: viewModel.background,
                style: {
                  width: 172,
                  height: 52,
                  top: 4,
                  flexShrink: 0,
                  borderRadius: 8,
                  resizeMode: "cover",
                  position: "absolute",
                  alignSelf: "center",
                  tintColor: viewModel.backgroundColor
                }
              }),
              View({ //Content
                children: [
                  View({ //Locked State
                    children: [
                      UINode.if(viewModel.isLocked, Image({ //icon_locked
                        source: this.assets.lock_icn,
                        style: {
                          width: 20,
                          height: 20
                        }
                      })),
                      Text({ // 4/80
                        text: viewModel.discoverCountText,
                        style: {
                          color: "#FFB55C",
                          textAlign: "center",
                          fontFamily: "Roboto",
                          fontSize: 16,
                          fontWeight: "700"
                        }
                      })],
                    style: {
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      alignSelf: "stretch",
                      flexDirection: "row"
                    }
                  }),
                  UI_Utils.outlinedText({ // Tundra
                    text: viewModel.name,
                    outlineSize: 3,
                    style: {
                      color: viewModel.textColor,
                      textAlign: "center",
                      fontFamily: "Roboto",
                      fontSize: 19,
                      width: 180,
                      fontWeight: "700"
                    }
                  })],
                style: {
                  display: "flex",
                  width: 180,
                  height: 52,
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  flexShrink: 0,
                  position: "absolute",
                  left: 0,
                  top: 4
                }
              })],
            style: {
              width: 180,
              height: 64,
              borderRadius: 12,
              marginTop: 4
            },
            onClick: () => viewModel.buttonCallback()
          })],
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          //position: "absolute",
          left: 0,
          top: 36,
        }
      }));
  }
}

class IslandButtonViewModel {
  public background: Binding<ImageSource>;
  public backgroundColor = new Binding("");
  public textColor = new Binding("");
  public name: Binding<string> = new Binding("");
  public isSelected: Binding<boolean> = new Binding(false);
  public isUsed: Binding<boolean> = new Binding(false);
  public isLocked: Binding<boolean> = new Binding(false);
  public buttonCallback = () => { };
  public discoverCountText = new Binding("");

  constructor(image: ImageSource) {
    this.background = new Binding(image);
  }
}
