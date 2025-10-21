/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { AudioBank } from "AudioBank";
import { ClientStartupReporter } from "ClientStartupReporter";
import { DigZoneManager, ZoneItemsData } from "DigZoneManager";
import { HUDElementType } from "Enums";
import { Events } from "Events";
import * as GameUtils from "GameUtils";
import { logToServer, logUIComponent } from "GameUtils";
import { CodeBlockEvents, EventSubscription, Player, PropTypes, SerializableState } from "horizon/core";
import { Binding, Image, ImageSource, Pressable, Text, UIComponent, UINode, View } from "horizon/ui";
import { Islands } from "Islands";
import { ItemContainer } from "ItemContainer";
import { Logger } from "Logger";
import { PlayerCatalogData } from "PlayerCatalogData";
import { PlayerCatalogManager } from "PlayerCatalogManager";
import { OpeningSequenceModifiers, UI_Catalog_Events } from "UI_Catalog_Events";
import { UI_Catalog_IslandPanel } from "UI_Catalog_IslandPanel";
import { lteItemIDToIsland, UI_Catalog_ItemCollection } from "UI_Catalog_ItemCollection";
import { UI_Catalog_ItemDetails } from "UI_Catalog_ItemDetails";
import { IslandZoneItems, UI_Catalog_ZoneBrowser } from "UI_Catalog_ZoneBrowser";

export const OPEN_SEQUENCE_START_DELAY = 400;
const OUTLINE_SIZE = 1;
const OPEN_SEQUENCE_ISLAND_SWITCH_DELAY_BEFORE = 300;
const OPEN_SEQUENCE_ISLAND_SWITCH_DELAY_AFTER = 0;
const AUTOSELECT_DELAY_AFTER_OPENING_CATALOG = 500;
const AUTOSELECT_DELAY_AFTER_SELECTING_ISLAND = 500;
const AUTOSELECT_DELAY_AFTER_TURNING_PAGE = 500;
const AUTO_CLOSE_DELAY = 1200;

const log = new Logger("UI_Catalog");

enum CatalogViewType {
  ItemCollection,
  ZoneBrowser,
}

type IslandNewItems = {
  location: string,
  islandNewItems: Array<string>
}

export class UI_Catalog extends UIComponent<typeof UI_Catalog> {
  static propsDefinition = {
    missingIsland: { type: PropTypes.Asset },
    missingItem: { type: PropTypes.Asset },
    icn_flex: { type: PropTypes.Asset },
    icn_lock: { type: PropTypes.Asset },
    icn_locationWhite: { type: PropTypes.Asset },
    icn_checkmarkBig: { type: PropTypes.Asset },
    icn_gem: { type: PropTypes.Asset },
    icn_star: { type: PropTypes.Asset },
    reqShovelBG: { type: PropTypes.Asset },
    leftPageButton: { type: PropTypes.Asset },
    rightPageButton: { type: PropTypes.Asset },
    newItemHighlight: { type: PropTypes.Asset },
    newItemBorder: { type: PropTypes.Asset },
  };

  private localPlayer!: Player;
  private serverPlayer!: Player;
  private isOpen: boolean = false;
  private isOpenBinding!: Binding<boolean>;
  private showItemCollection!: Binding<boolean>;
  private showZoneBrowser!: Binding<boolean>;
  private currentCatalogViewType: CatalogViewType = CatalogViewType.ZoneBrowser;
  private exitFocusEvent?: EventSubscription;
  private newItems: Array<IslandNewItems> = [];
  private closeOnOpenSequenceComplete: boolean = false;

  private islandPanel!: UI_Catalog_IslandPanel;
  private itemCollection!: UI_Catalog_ItemCollection;
  private itemDetail!: UI_Catalog_ItemDetails;
  private zoneBrowser!: UI_Catalog_ZoneBrowser;
  private nextOpeningSequenceMods?: OpeningSequenceModifiers;
  private finishedInitializing: boolean = false;

  start() {
    log.info(`Start()`);
    this.entity.visible.set(false);
    this.localPlayer = this.world.getLocalPlayer();
    this.serverPlayer = this.world.getServerPlayer();
    const isLocalPlayer = this.localPlayer !== this.serverPlayer;
    if (!isLocalPlayer) {
      log.info(`skipping Start() on server.`);
      return;
    }
    log.info("Start() on client");
    this.connectNetworkBroadcastEvent(Events.playerStartDig, payload => this.onDigStart(payload.player));
    this.connectNetworkBroadcastEvent(UI_Catalog_Events.openCatalog, (mods) => this.onOpenCatalog(mods));
    this.connectLocalBroadcastEvent(UI_Catalog_Events.requestToggleCatalog, () => this.setOpen(!this.isOpen));
    this.connectNetworkBroadcastEvent(UI_Catalog_Events.forceCloseCatalog, () => this.setOpen(false));
    this.connectNetworkBroadcastEvent(UI_Catalog_Events.modifyNextOpenSequence, (mods) => this.onModifyNextOpenSequence(mods));
    this.connectNetworkBroadcastEvent(UI_Catalog_Events.autoSelectItem, payload => this.onAutoSelectItemEvent(payload.itemId));
    this.connectNetworkBroadcastEvent(DigZoneManager.sendZoneItems, (payload) => this.onZoneItemsReceived(payload.zoneItemsDatas));
    this.setupItemsWhenAvailable();

    this.sendNetworkBroadcastEvent(DigZoneManager.requestZoneItems, { player: this.localPlayer });
    this.sendNetworkBroadcastEvent(Events.poolObjectInitialized, { player: this.localPlayer, id: "UI_Catalog", entity: this.entity }, [this.world.getServerPlayer()]);

    const expectedBindingCount = 435;
    GameUtils.connectUIFixup(this, expectedBindingCount, true);

    // Dump some info to the console about the state of this UI.
    this.connectLocalBroadcastEvent(Events.checkPlayerUiState, (payload) => {
      const player = payload.player;
      const uiComponentState = {
        localPlayerId: player.id,
        ownerId: this.entity.owner?.get()?.id,
        visible: this.entity.visible.get(),
        isVisibleToPlayer: this.entity.isVisibleToPlayer(player),
        finishedInitializing: this.finishedInitializing,
        position: this.entity.position.get(),
        panelWidth: this.panelWidth,
        panelHeight: this.panelHeight,
      }
      logToServer(this, `[UI_Catalog] logPlayerUiState() ${JSON.stringify(uiComponentState)}`);
      logUIComponent(this);
    });

    log.info("Start() finished on client");
    ClientStartupReporter.addEntry("UI_Catalog start()", this);
  }

  receiveOwnership(_serializableState: SerializableState, _oldOwner: Player, _newOwner: Player): void {
    if (this.world.getLocalPlayer() !== this.world.getServerPlayer()) {
      this.sendNetworkBroadcastEvent(Events.poolObjectReceived, { player: this.localPlayer, id: "UI_Catalog" }, [this.world.getServerPlayer()]);
      ClientStartupReporter.addEntry("UI_Catalog receiveOwnership()");
    }
  }

  private onZoneItemsReceived(zoneItemsDatas: ZoneItemsData[]) {
    const itemMap = new Map<string, string>();
    const islandZoneMap = new Map<Islands, IslandZoneItems[]>();
    for (let i = 0; i < zoneItemsDatas.length; i++) {
      let zoneItemsData = zoneItemsDatas[i];
      let islandZoneItems = islandZoneMap.get(zoneItemsData.island);
      if (islandZoneItems === undefined) {
        islandZoneItems = [];
        islandZoneMap.set(zoneItemsData.island, islandZoneItems);
      }
      const zoneItems: IslandZoneItems = {
        name: zoneItemsData.zoneDisplayName,
        levelReq: zoneItemsData.levelReq,
        id: zoneItemsData.zoneId,
        itemIds: zoneItemsData.itemIds,
        isLTE: zoneItemsData.isLTE,
        gemReward: zoneItemsData.gemReward,
      }
      islandZoneItems.push(zoneItems);
      for (let j = 0; j < zoneItemsData.itemIds.length; j++) {
        let itemId = zoneItemsData.itemIds[j];
        if (itemMap.has(itemId)) {
          // Probably duplicated because we're concatenating all of the string arrays in the dig zone, including renews
          log.info(`Item ID ${itemId} already exists in the map.`);
          continue;
        }
        log.info(`Adding item ID ${itemId} to map with zone ${zoneItemsData.zoneDisplayName}.`);
        itemMap.set(itemId, zoneItemsData.zoneDisplayName);
      }
    }
    this.itemDetail.setDigZoneItemMap(itemMap);
    this.zoneBrowser.setIslandZoneMap(islandZoneMap);
  }

  private onOpenCatalog(mods: OpeningSequenceModifiers): void {
    this.onModifyNextOpenSequence(mods);
    this.setOpen(true);
  }

  private onModifyNextOpenSequence(mods: OpeningSequenceModifiers) {
    if (this.nextOpeningSequenceMods !== undefined) {
      log.warn("onModifyNextOpenSequence: Already modifying next open sequence, previous modifications will be overwritten.");
    }
    this.nextOpeningSequenceMods = mods;
  }

  private onAutoSelectItemEvent(itemId: string): void {
    const itemData = ItemContainer.localInstance?.getItemDataForId(itemId);
    if (itemData === undefined) {
      log.warn(`onSelectItemEvent: Item data not found for item id ${itemId}.`);
      return;
    }
    const selectIsland = (callback: () => void) => {
      if (this.islandPanel.getSelectedIslandID() !== itemData.location) {
        this.islandPanel.selectIslandFromLocationID(itemData.location, true);
        this.async.setTimeout(() => callback(), AUTOSELECT_DELAY_AFTER_SELECTING_ISLAND);
      } else {
        callback();
      }
    }

    const selectItemPage = (callback: () => void) => {
      if (this.itemCollection.openPageForItemID(itemId)) {
        this.async.setTimeout(() => callback(), AUTOSELECT_DELAY_AFTER_TURNING_PAGE);
      } else {
        callback();
      }
    }
    const selectItem = () => {
      this.itemCollection.selectItemFromID(itemId);
    }
    selectIsland(() => selectItemPage(() => selectItem()));
  }

  private setupItemsWhenAvailable() {
    const itemContainer = ItemContainer.localInstance;
    if (itemContainer === undefined || !itemContainer.isDataLoaded()) {
      log.info("ItemContainer is not available, waiting...")
      const event = this.connectLocalBroadcastEvent(ItemContainer.itemDataLoadComplete, () => {
        this.setupItemsWhenAvailable();
        event.disconnect();
      });
      return;
    }
    log.info("Passing ItemContainer to item collection.")
    this.itemCollection.setItemContainer(itemContainer)
    this.islandPanel.setupIslands();
  }

  private initializeViews() {
    this.islandPanel = new UI_Catalog_IslandPanel(this, {
      missingItemTexture: ImageSource.fromTextureAsset(this.props.missingIsland!),
      lock_icn: ImageSource.fromTextureAsset(this.props.icn_lock ?? this.props.missingItem!)
    });
    this.itemCollection = new UI_Catalog_ItemCollection(this, {
      missingItemTexture: ImageSource.fromTextureAsset(this.props.missingItem!),
      leftArrowImage: ImageSource.fromTextureAsset(this.props.leftPageButton!),
      rightArrowImage: ImageSource.fromTextureAsset(this.props.rightPageButton!),
      newItemBorderTexture: ImageSource.fromTextureAsset(this.props.newItemBorder!),
      newItemTravelTexture: ImageSource.fromTextureAsset(this.props.newItemHighlight!),
      checkmark: ImageSource.fromTextureAsset(this.props.icn_checkmarkBig!),
      reqShovelBG: ImageSource.fromTextureAsset(this.props.reqShovelBG!),
    });
    this.itemDetail = new UI_Catalog_ItemDetails(this, {
      missingItemTexture: ImageSource.fromTextureAsset(this.props.missingItem!),
      flex_icn: ImageSource.fromTextureAsset(this.props.icn_flex!)
    });
    this.zoneBrowser = new UI_Catalog_ZoneBrowser(this, {
      missingItemTexture: ImageSource.fromTextureAsset(this.props.missingItem!),
      icn_locationWhite: ImageSource.fromTextureAsset(this.props.icn_locationWhite!),
      rightPageButton: ImageSource.fromTextureAsset(this.props.rightPageButton!),
      leftPageButton: ImageSource.fromTextureAsset(this.props.leftPageButton!),
      reqShovelBG: ImageSource.fromTextureAsset(this.props.reqShovelBG!),
      icn_checkmarkBig: ImageSource.fromTextureAsset(this.props.icn_checkmarkBig!),
      icn_gem: ImageSource.fromTextureAsset(this.props.icn_gem!),
      icn_star: ImageSource.fromTextureAsset(this.props.icn_star!)
    });
  }

  private onPlayerCatalogReceived(data: PlayerCatalogData): void {
    if (!this.isOpen) {
      return;
    }
    log.info(`Received player catalog data.`);
    this.islandPanel!.setCatalogData(data);
    this.itemCollection!.setCatalogData(data);
    this.itemDetail!.setCatalogData(data);
    this.zoneBrowser!.setCatalogData(data);
    const hasOpenSequence = this.runOpenSequence(data);
    if (!hasOpenSequence) {
      this.onOpenSequenceComplete();
    } else {
      this.setCurrentCatalogViewType(CatalogViewType.ItemCollection);
      this.setInteractable(false);
    }
  }

  private runOpenSequence(data: PlayerCatalogData): boolean {
    const mods = this.nextOpeningSequenceMods;
    this.nextOpeningSequenceMods = undefined;
    if (mods?.disable) {
      return false;
    }
    let hasOpenSequence = false;
    this.populateNewItemMap(data);
    if (this.newItems.length > 0) {
      this.sendNetworkBroadcastEvent(PlayerCatalogManager.clearNewItems, { player: this.localPlayer }, [this.serverPlayer, this.localPlayer]);
      const modDelay = mods?.delay ?? 0;
      this.async.setTimeout(() => this.playNextIslandNewItemOpenSequence(), OPEN_SEQUENCE_START_DELAY + modDelay);
      hasOpenSequence = true;
    }
    this.closeOnOpenSequenceComplete = mods?.closeAfterFinish ?? false;
    return hasOpenSequence;
  }

  private populateNewItemMap(data: PlayerCatalogData) {
    this.newItems = [];
    for (const item of data.collectedItems) {
      if (!item.isNew) {
        continue;
      }
      const itemData = ItemContainer.localInstance?.getItemDataForId(item.id);
      if (itemData === undefined) {
        continue;
      }
      let location = itemData.location;
      if (itemData.location === 'lte') {
        location = lteItemIDToIsland.get(item.id) ?? '';
      }
      if (location === '') {
        continue;
      }
      const index = this.newItems.findIndex(i => i.location === location);
      let islandNewItems: Array<string> = [];
      if (index < 0) {
        this.newItems.push({ location, islandNewItems: islandNewItems });
      } else {
        islandNewItems = this.newItems[index].islandNewItems;
      }
      islandNewItems.push(item.id);
    }
    // Sort in reverse order so we can use pop() to go through the queue
    this.newItems.sort((a, b) => this.islandPanel.getIslandIndex(b.location) - this.islandPanel.getIslandIndex(a.location));
    return this.newItems;
  }

  private playNextIslandNewItemOpenSequence() {
    if (!this.isOpen) {
      return;
    }
    const nextIslandNewItems = this.newItems.pop();
    if (nextIslandNewItems === undefined) {
      this.onOpenSequenceComplete();
      return;
    }
    log.info("open sequence for " + nextIslandNewItems.location);
    this.itemCollection.loadNewItems(nextIslandNewItems.islandNewItems);
    this.async.setTimeout(() => {
      this.islandPanel.selectIslandFromLocationID(nextIslandNewItems.location, true);
      this.async.setTimeout(() => {
        this.itemCollection.playNewItemOpenSequence(() => this.playNextIslandNewItemOpenSequence());
      }, OPEN_SEQUENCE_ISLAND_SWITCH_DELAY_AFTER);
    }, OPEN_SEQUENCE_ISLAND_SWITCH_DELAY_BEFORE);
  }

  private onOpenSequenceComplete() {
    this.setInteractable(true);
    this.sendNetworkBroadcastEvent(UI_Catalog_Events.openingSequenceComplete, this.localPlayer);
    if (this.closeOnOpenSequenceComplete) {
      this.async.setTimeout(() => this.setOpen(false), AUTO_CLOSE_DELAY);
    }
  }

  private setInteractable(value: boolean) {
    this.islandPanel.setInteractable(value);
    this.itemCollection.setInteractable(value);
    this.itemDetail.setInteractable(value);
    this.zoneBrowser.setInteractable(value);
  }

  private onDigStart(player: Player) {
    log.info(`Received dig start.`);
    let owner = this.world.getLocalPlayer();
    if (player == owner) {
      this.isOpen = false;
      this.isOpenBinding.set(this.isOpen, [owner]);
    }
  }

  private setOpen(isOpen: boolean) {
    if (this.isOpen === isOpen) {
      return;
    }
    log.info(`Setting catalog open (${isOpen}).`);
    this.isOpen = isOpen;
    let owner = this.world.getLocalPlayer();
    this.isOpenBinding.set(this.isOpen, [owner]);
    const localPlayer = this.world.getLocalPlayer();
    this.updateHUD(localPlayer);
    this.entity.visible.set(isOpen);
    if (this.isOpen) {
      const serverPlayer = this.world.getServerPlayer();
      this.sendNetworkBroadcastEvent(PlayerCatalogManager.requestPlayerCatalog, { player: localPlayer }, [serverPlayer]);
      const eventSubscription = this.connectNetworkBroadcastEvent(PlayerCatalogManager.receivePlayerCatalog, payload => {
        eventSubscription.disconnect();
        this.onPlayerCatalogReceived(payload.playerCatalog);
      });
    } else {
      this.itemCollection.close();
    }
    this.sendLocalBroadcastEvent(UI_Catalog_Events.catalogVisibilityChanged, { isShown: this.isOpen });
    if (this.isOpen) {
      AudioBank.play('catalog_open');
    } else {
      AudioBank.play('catalog_close');
    }
  }

  private updateHUD(localPlayer: Player) {
    const context = "catalog_open";
    if (this.isOpen) {
      this.sendLocalBroadcastEvent(Events.localHideHUD, { context, exclude: HUDElementType.None });
      localPlayer.enterFocusedInteractionMode();
      this.exitFocusEvent = this.connectCodeBlockEvent(this.entity,
        CodeBlockEvents.OnPlayerExitedFocusedInteraction,
        player => this.onExitFocusedInteraction(player));
    } else {
      this.sendLocalBroadcastEvent(Events.localShowHUD, { context });
      this.exitFocusEvent?.disconnect();
      this.exitFocusEvent = undefined;
      localPlayer.exitFocusedInteractionMode();
    }
  }

  private onExitFocusedInteraction(player: Player): void {
    if (this.world.getLocalPlayer() !== player) {
      return;
    }
    this.setOpen(false);
  }

  private setCurrentCatalogViewType(type: CatalogViewType) {
    if (type === this.currentCatalogViewType) {
      return;
    }
    this.setCatalogViewTypeVisible(this.currentCatalogViewType, false);
    this.currentCatalogViewType = type;
    this.setCatalogViewTypeVisible(this.currentCatalogViewType, true);
  }

  private setCatalogViewTypeVisible(type: CatalogViewType, isVisible: boolean) {
    switch (type) {
      case CatalogViewType.ItemCollection:
        this.showItemCollection.set(isVisible, [this.world.getLocalPlayer()]);
        break;
      case CatalogViewType.ZoneBrowser:
        this.showZoneBrowser.set(isVisible, [this.world.getLocalPlayer()]);
        break;
    }
  }

  initializeUI(): UINode {
    log.info(`InitializeUI()`);

    if (this.world.getLocalPlayer() === this.world.getServerPlayer()) {
      log.info(`skipping InitializeUI() on server`);
      return View({
        children: [
          Image({ source: ImageSource.fromTextureAsset(this.props.missingIsland!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.missingItem!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.leftPageButton!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.rightPageButton!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.newItemBorder!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.newItemHighlight!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_flex!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_lock!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_locationWhite!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_checkmarkBig!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_gem!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_star!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.reqShovelBG!), style: { display: "none" } }),
        ],
        style: { display: "none" }
      });
    }
    log.info(`InitializeUI() on client`);

    this.isOpenBinding = new Binding<boolean>(false);
    this.showItemCollection = new Binding<boolean>(false);
    this.showZoneBrowser = new Binding<boolean>(true);

    this.initializeViews();

    const catalogView = this.getCatalogView();
    const backgroundClick = this.getBackgroundClick();
    log.info(`InitializeUI() building view hierarchy on client()`);
    const result = UINode.if(this.isOpenBinding, View({
      children: [
        catalogView,
        backgroundClick],
      style: {
        position: 'absolute',
        justifyContent: "center",
        alignItems: "center",
        height: '100%',
        width: '100%',
      }
    }));
    this.finishedInitializing = true;
    log.info(`InitializeUI() finished on client()`);
    ClientStartupReporter.addEntry("UI_Catalog initializeUI()");
    return result;
  }

  private getBackgroundClick() {
    return View({
      children: [
        Pressable({
          style: {
            width: "10%",
            height: "100%",
            alignSelf: "flex-start",
          },
          onClick: () => this.setOpen(false),
          propagateClick: false
        }),
        Pressable({
          style: {
            width: "10%",
            height: "100%",
            alignSelf: "flex-end",
          },
          onClick: () => this.setOpen(false),
          propagateClick: false
        })
      ],
      style: {
        position: 'absolute',
        height: '100%',
        width: '100%',
        justifyContent: "space-between",
        flexDirection: "row",
      }
    });
  }

  getCatalogView() {
    const root = View({ //UICatalog
      children: [
        View({ //Modal
          children: [
            this.islandPanel.getView(),
            View({ //Contents
              children: [
                this.sideBG(),
                UINode.if(this.showItemCollection, this.itemCollection.getView()),
                UINode.if(this.showZoneBrowser, this.zoneBrowser.getView()),
                this.itemDetail.getView()
              ],
              style: {
                display: "flex",
                width: 896,
                paddingHorizontal: 16,
                alignItems: "flex-start",
                borderRadius: 16,
                borderColor: "#FFC90C",
                borderWidth: 4,
                backgroundColor: "#FFF1C1",
                flexDirection: "row",
                position: "absolute",
                left: 188,
                top: 24
              }
            }),
            this.getItemTabGroup()
          ],
          style: {
            width: 1084,
            height: 514,
            flexShrink: 0
          }
        })],
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
    })
    return root;
  }

  private sideBG() {
    return View({ //Side BG
      children: [View({ //BG Highlight
        children: [],
        style: {
          width: 203,
          height: 220,
          borderRadius: 22,
          backgroundColor: "#FFFAE8",
          position: "absolute",
          left: 10,
          top: 128
        }
      })],
      style: {
        display: "flex",
        width: 223,
        paddingTop: 139,
        paddingRight: 10,
        paddingBottom: 123,
        paddingLeft: 10,
        flexDirection: "column",
        justifyContent: "flex-end",
        alignItems: "center",
        position: "absolute",
        height: "100%",
        right: 0,
        top: 0,
        borderTopLeftRadius: 0,
        borderTopRightRadius: 12,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 12,
        backgroundColor: "#FFEA9B",
      }
    })
  }

  private getItemTabGroup() {
    return View({ //Item Tab Group
      children: [
        Pressable({ //button_TabRegions
          children: [View({ //BG Active
            children: [],
            style: {
              width: 176,
              height: 36,
              position: "absolute",
              top: 0,
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              borderTopWidth: 3,
              borderLeftWidth: 4,
              borderRightWidth: 4,
              borderBottomWidth: 0,
              borderColor: "#FFC90C",
              backgroundColor: this.showZoneBrowser.derive(x => x ? "#FFF1C1" : "#FFC90C"),
              left: 0
            }
          }),
          Text({ // Regions
            text: "Regions",
            style: {
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              flexGrow: 1,
              flexShrink: 0,
              flexBasis: 0,
              alignSelf: "stretch",
              color: this.showZoneBrowser.derive(x => x ? "#A4610E" : "#9A3700"),
              textAlign: "center",
              textAlignVertical: "top",
              fontFamily: "Roboto",
              fontSize: this.showZoneBrowser.derive(x => x ? 24 : 20),
              fontWeight: this.showZoneBrowser.derive(x => x ? "900" : "700")
            }
          })],
          style: {
            display: "flex",
            width: 176,
            paddingTop: 6,
            justifyContent: "center",
            alignItems: "center",
            flexShrink: 0,
            alignSelf: "stretch",
            borderRadius: 12,
            flexDirection: "row"
          },
          onClick: () => this.setCurrentCatalogViewType(CatalogViewType.ZoneBrowser)
        }),
        Pressable({ //button_TabAll
          children: [
            View({ //BG Default
              children: [],
              style: {
                width: 176,
                height: 36,
                position: "absolute",
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                borderBottomLeftRadius: 0,
                borderBottomRightRadius: 0,
                borderTopWidth: 3,
                borderLeftWidth: 4,
                borderRightWidth: 4,
                borderBottomWidth: 0,
                borderColor: "#FFC90C",
                backgroundColor: this.showItemCollection.derive(x => x ? "#FFF1C1" : "#FFC90C"),
                left: 0,
                top: 0
              }
            }),
            Text({ // All Items
              text: "All Items",
              style: {
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                flexGrow: 1,
                flexShrink: 0,
                flexBasis: 0,
                alignSelf: "stretch",
                color: this.showItemCollection.derive(x => x ? "#A4610E" : "#9A3700"),
                textAlign: "center",
                textAlignVertical: "top",
                fontFamily: "Roboto",
                fontSize: this.showItemCollection.derive(x => x ? 24 : 20),
                fontWeight: this.showItemCollection.derive(x => x ? "900" : "700")
              }
            })],
          style: {
            display: "flex",
            width: 176,
            justifyContent: "center",
            alignItems: "center",
            paddingTop: 6,
            flexShrink: 0,
            alignSelf: "stretch",
            borderRadius: 12,
            flexDirection: "row",
            position: "relative",
            marginLeft: 8
          },
          onClick: () => this.setCurrentCatalogViewType(CatalogViewType.ItemCollection)
        })],
      style: {
        display: "flex",
        width: 464,
        height: 36,
        paddingVertical: 0,
        paddingHorizontal: 24,
        alignItems: "center",
        flexShrink: 0,
        flexDirection: "row",
        position: "absolute",
        left: 188,
        top: -8
      }
    })
  }
}
UIComponent.register(UI_Catalog);
