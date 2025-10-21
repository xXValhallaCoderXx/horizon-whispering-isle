/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { AudioBank } from 'AudioBank';
import { Component, Player } from 'horizon/core';
import { AnimatedBinding, Animation, Binding, Easing, Image, ImageSource, Pressable, Text, UIChildren, UINode, View } from 'horizon/ui';
import { getIslandDisplayName, getIslandID, Islands } from 'Islands';
import { ItemContainer } from 'ItemContainer';
import { ItemData } from 'ItemData';
import { Logger } from 'Logger';
import { GetCollectedItemData, PlayerCatalogData, PlayerCollectedItemData } from 'PlayerCatalogData';
import { UI_Catalog_Events } from 'UI_Catalog_Events';
import { ItemViewModel, ItemViewModelAssets } from 'UI_Catalog_ViewModels';

enum ItemDetailRevealType {
  None,
  Reveal,
  Select
}

const NUM_ITEM_ROWS = 3;
const ITEMS_DISPLAYED_PER_ROW = 5;
const ITEMS_DISPLAYED_PER_PAGE = NUM_ITEM_ROWS * ITEMS_DISPLAYED_PER_ROW;
const ITEM_COLUMN_SPACING = 94;  // From figma exported values
const ITEM_ROW_SPACING = 6.4;    // From figma exported values
const ITEM_COLUMN_OFFSET = -45;
const ITEM_ROW_OFFSET = 26.5;
const ITEM_SCALE = 1.3;

const ARROW_VERTICAL_POSITION = 30;
const ARROW_LEFT_HORIZONTAL_POSITION = 12;
const ARROW_RIGHT_HORIZONTAL_POSITION = 250;
const ARROW_WIDTH = 40;
const ARROW_HEIGHT = 40;

const UNDISCOVERED_ITEM_COLOR = "#888";

const NEW_ITEM_TRAVEL_EFFECT_Y_OFFSET = 260;
const NEW_ITEM_TRAVEL_EFFECT_DURATION = 250;
const NEW_ITEM_REVEAL_EFFECT_DURATION = 400;
const NEW_ITEM_REVEAL_DELAY = 800;
const NEW_ITEM_REVEAL_BORDER_MAX_SCALE = 3;
const NEW_ITEM_PAGE_FLIP_DELAY_BEFORE = NEW_ITEM_REVEAL_EFFECT_DURATION - 250;
const NEW_ITEM_PAGE_FLIP_DELAY_AFTER = 0;
const NEW_ITEM_EFFECT_POOL_SIZE = 5;
const NEW_ITEM_PRESELECT_DURATION = 0;

const USE_TRAVEL_EFFECT = true;
const SELECT_ITEMS_DURING_OPEN_SEQUENCE: ItemDetailRevealType = ItemDetailRevealType.Select;

const QUEST_OPACITY_DURATION = 500;

// Hardcoded mapping of LTE item IDs to islands IDs
export const lteItemIDToIsland: Map<string, string> = new Map([
  ["spaceicecream001", "Basecamp"],
  ["cow001", "Basecamp"],
  ["aliengoo001", "Basecamp"],
  ["teddybear001", "Basecamp"],
  ["raygun001", "Basecamp"],
  ["rocket001", "Basecamp"],
  ["astronaut001", "Basecamp"],
  ["alienstone001", "Basecamp"],
  ["ufokeycard001", "Basecamp"],
  ["jetpack001", "Basecamp"],
  ["cosmicjournal001", "Basecamp"],
  ["quantumpizza001", "Basecamp"],
  ["lavalamp001", "Basecamp"],
  ["ufomothership001", "Basecamp"],

  ["bucket001", "Pirate"],
  ["pirateshiphull001", "Pirate"],
  ["piratelantern001", "Pirate"],
  ["piratemedallion001", "Pirate"],
  ["purplefruit001", "Pirate"],
  ["blackpearl001", "Pirate"],
  ["trident001", "Pirate"],
  ["fishskeleton001", "Pirate"],
  ["goldskull001", "Pirate"],
  ["cthulu001", "Pirate"],
  ["goldpirateearrings001", "Pirate"],
  ["fancypegleg001", "Pirate"],
  ["divehelmet001", "Pirate"],

  ["icequeenscepter001", "Tundra"],
  ["frozencar001", "Tundra"],
  ["arcticjackalope001", "Tundra"],
  ["northstar001", "Tundra"],
  ["iceflower001", "Tundra"],
  ["softserve001", "Tundra"],
  ["swanicesculpture001", "Tundra"],
  ["frozeniceorb001", "Tundra"],
  ["frozentidalwave001", "Tundra"],
  ["icecrystal001", "Tundra"],
  ["frozenmusicbox001", "Tundra"],
  ["rednosedreindeer001", "Tundra"],
  ["sackofpresents001", "Tundra"],

  ["futurerobot001", "Fantasy"],
  ["gladiatorshelmet001", "Fantasy"],
  ["dinosauregg001", "Fantasy"],
  ["pyramid001", "Fantasy"],
  ["airplane001", "Fantasy"],
  ["cavepainting001", "Fantasy"],
  ["magicshardofchronos001", "Fantasy"],
  ["metaquest001", "Fantasy"],
  ["pop1energycore001", "Fantasy"],
  ["temporaldarkmatter001", "Fantasy"],
  ["allseeingeye001", "Fantasy"],
  ["temporaldrake001", "Fantasy"]
]);

const log = new Logger("UI_Catalog_ItemCollection");

export type ItemCollectionAssets = {
  missingItemTexture: ImageSource;
  leftArrowImage: ImageSource;
  rightArrowImage: ImageSource;
  newItemBorderTexture: ImageSource;
  newItemTravelTexture: ImageSource;
  reqShovelBG: ImageSource;
  checkmark: ImageSource;
}

export class UI_Catalog_ItemCollection {
  private owner!: Component;
  private localPlayer!: Player;
  private selectedIsland?: Islands;
  private islandToItems: Map<string, ItemData[]> = new Map();
  private itemIDToIsland: Map<string, string> = new Map();
  private selectedIslandItems?: ItemData[];
  private selectedIslandCollectedItems: Map<string, PlayerCollectedItemData> = new Map();
  private currentPageIndex: number = 0;
  private displayedItems: Array<Array<ItemButtonViewModel>> = new Array(NUM_ITEM_ROWS);
  private selectedItem: ItemData | undefined = undefined;
  private playerCatalogData?: PlayerCatalogData;
  private assets!: ItemCollectionAssets;
  private isInteractable = new Binding(true);

  private isLeftArrowShowing = new Binding(false);
  private isRightArrowShowing = new Binding(false);
  private collectedItemsCountText = new Binding("");

  private newItemEffectPool = new Array<NewItemEffectViewModel>();
  private newItems = new Array<string>();

  constructor(owner: Component, assets: ItemCollectionAssets) {
    log.info("UI_Catalog_ItemCollection constructor");
    this.owner = owner;
    this.localPlayer = owner.world.getLocalPlayer();
    this.assets = assets;
    owner.connectLocalBroadcastEvent(UI_Catalog_Events.islandSelected, payload => this.selectIsland(payload.island, !payload.isOpenSequence));
    this.setupViewModels();
  }

  setCatalogData(data: PlayerCatalogData) {
    log.info(`Player catalog received.`);
    this.playerCatalogData = data;
    this.refresh();
  }

  setItemContainer(itemContainer: ItemContainer) {
    log.info("Set ItemContainer");
    this.initializeItemMap(itemContainer);
    if (this.selectedIsland === undefined) {
      this.owner.sendLocalBroadcastEvent(UI_Catalog_Events.requestSelectedIsland, {});
    } else {
      this.selectIsland(this.selectedIsland);
    }
  }

  setInteractable(value: boolean) {
    this.isInteractable.set(value, [this.localPlayer]);
  }

  loadNewItems(newItems: Array<string>) {
    this.newItems = newItems;
  }

  close() {
    for (let i = 0; i < NUM_ITEM_ROWS; ++i) {
      for (let j = 0; j < ITEMS_DISPLAYED_PER_ROW; ++j) {
        let itemButton = this.displayedItems[i][j];
        if (itemButton.isAnimating) {
          itemButton.stopQuestAnimation(this.localPlayer);
        }
      }
    }
  }

  playNewItemOpenSequence(callback: () => void) {
    if (!this.owner.entity.visible.get()) {
      return;
    }
    const nextIndex = this.getNextNewItemIndex();
    if (nextIndex.newItemIndex === -1) {
      callback();
      return;
    }
    const nextItemPageIndex = this.getPageIndexFromItemIndex(nextIndex.selectedIslandItemIndex);
    if (this.currentPageIndex != nextItemPageIndex) {
      this.owner.async.setTimeout(() => {
        if (!this.owner.entity.visible.get()) {
          return;
        }
        this.setPage(nextItemPageIndex);
        this.owner.async.setTimeout(() => {
          this.playNewItemOpenSequence(callback);
        }, NEW_ITEM_PAGE_FLIP_DELAY_AFTER);
      }, NEW_ITEM_PAGE_FLIP_DELAY_BEFORE);
      return;
    }
    this.playNextRevealItemSequence(nextIndex.newItemIndex, nextIndex.selectedIslandItemIndex, callback);
  }

  public selectItemFromID(itemID: string) {
    const itemIndex = this.selectedIslandItems?.findIndex(item => item.id === itemID);
    if (this.selectedIslandItems === undefined || itemIndex === undefined || itemIndex < 0) {
      log.warn(`Item with ID ${itemID} not found in selected island.`);
      return;
    }
    const item = this.selectedIslandItems[itemIndex];
    this.selectItem(item);
  }

  // Returns true if the page was changed.
  public openPageForItemID(itemID: string): boolean {
    const itemIndex = this.selectedIslandItems?.findIndex(item => item.id === itemID);
    if (this.selectedIslandItems === undefined || itemIndex === undefined || itemIndex < 0) {
      log.warn(`Item with ID ${itemID} not found in selected island.`);
      return false;
    }
    const pageIndex = this.getPageIndexFromItemIndex(itemIndex);
    if (this.currentPageIndex != pageIndex) {
      this.setPage(pageIndex);
    }
    return true;
  }

  private playNextRevealItemSequence(newItemIndex: number, selectedIslandItemIndex: number, callback: () => void) {
    this.newItems.splice(newItemIndex, 1);
    if (USE_TRAVEL_EFFECT) {
      this.playTravelEffect(selectedIslandItemIndex);
    } else {
      if (!USE_TRAVEL_EFFECT &&
        SELECT_ITEMS_DURING_OPEN_SEQUENCE === ItemDetailRevealType.Reveal) {
        const itemData = this.selectedIslandItems![selectedIslandItemIndex];
        this.selectItem(itemData, true);
        this.owner.async.setTimeout(() => {
          this.playRevealEffect(selectedIslandItemIndex);
        }, NEW_ITEM_PRESELECT_DURATION);
      } else {
        this.playRevealEffect(selectedIslandItemIndex);
      }
    }
    this.owner.async.setTimeout(() => {
      this.playNewItemOpenSequence(callback);
    }, NEW_ITEM_REVEAL_DELAY);
  }

  private playTravelEffect(islandItemIndex: number) {
    if (!this.owner.entity.visible.get()) {
      this.playRevealEffect(islandItemIndex);
      return;
    }
    const effect = this.newItemEffectPool.pop();
    if (effect === undefined) {
      log.warn("No effect available.");
      return;
    }
    const x = this.getItemX(islandItemIndex);
    const y = this.getItemY(islandItemIndex);
    const startY = y + NEW_ITEM_TRAVEL_EFFECT_Y_OFFSET;
    const itemData = this.selectedIslandItems![islandItemIndex];
    effect.showTravel.set(true, [this.localPlayer]);
    effect.x.set(x, [this.localPlayer]);
    effect.y.set(startY, undefined, [this.localPlayer]);
    effect.y.set(
      Animation.timing(y, { duration: NEW_ITEM_TRAVEL_EFFECT_DURATION, easing: Easing.linear }),
      () => {
        effect.showTravel.set(false, [this.localPlayer]);
        this.playRevealEffect(islandItemIndex, effect);
      },
      [this.localPlayer]);
    if (SELECT_ITEMS_DURING_OPEN_SEQUENCE === ItemDetailRevealType.Reveal) {
      this.owner.async.setTimeout(() => {
        this.selectItem(itemData, true);
      }, NEW_ITEM_TRAVEL_EFFECT_DURATION - NEW_ITEM_PRESELECT_DURATION);
    }
  }

  private playRevealEffect(islandItemIndex: number, effect?: NewItemEffectViewModel) {
    if (!this.owner.entity.visible.get()) {
      this.resetNewItemEffect(effect!);
      return;
    }
    AudioBank.play('catalog_newItemReveal');
    if (effect === undefined) {
      const x = this.getItemX(islandItemIndex);
      const y = this.getItemY(islandItemIndex);
      effect = this.newItemEffectPool.pop();
      if (effect === undefined) {
        log.warn("No travel effect available.");
        return;
      }
      effect.x.set(x, [this.localPlayer]);
      effect.y.set(y, undefined, [this.localPlayer]);
    }
    effect.showReveal.set(true, [this.localPlayer]);
    const viewModel = this.getViewModelFromItemIndex(islandItemIndex);
    const itemData = this.selectedIslandItems![islandItemIndex];
    viewModel.isFound.set(true, [this.localPlayer]);
    const catalogData = this.selectedIslandCollectedItems.get(itemData?.id);
    if (catalogData !== undefined) {
      // update local catalog data.  note:  this is not synced with the server, the server updates new item flags on catalog open.
      catalogData.isNew = false;
    }
    effect.scale.set(
      Animation.timing(NEW_ITEM_REVEAL_BORDER_MAX_SCALE, { duration: NEW_ITEM_REVEAL_EFFECT_DURATION, easing: Easing.linear }), () => {
        effect!.showReveal.set(false, [this.localPlayer]);
        this.resetNewItemEffect(effect!);
      },
      [this.localPlayer]);
    effect.opacity.set(
      Animation.timing(0, { duration: NEW_ITEM_REVEAL_EFFECT_DURATION, easing: Easing.linear }), undefined, [this.localPlayer]);
    if (SELECT_ITEMS_DURING_OPEN_SEQUENCE === ItemDetailRevealType.Reveal) {
      this.owner.sendLocalBroadcastEvent(UI_Catalog_Events.revealItemDetails, {});
    } else if (SELECT_ITEMS_DURING_OPEN_SEQUENCE === ItemDetailRevealType.Select) {
      this.selectItem(itemData);
    }
  }

  private resetNewItemEffect(effect: NewItemEffectViewModel) {
    effect!.scale.set(1, undefined, [this.localPlayer]);
    effect!.opacity.set(1, undefined, [this.localPlayer]);
    this.newItemEffectPool.push(effect!);
  }

  private getItemX(itemIndex: number): number {
    const X = itemIndex % ITEMS_DISPLAYED_PER_ROW;
    return ITEM_SCALE * (X * ITEM_COLUMN_SPACING + ITEM_COLUMN_OFFSET);
  }

  private getItemY(itemIndex: number): number {
    const Y = Math.floor(itemIndex / ITEMS_DISPLAYED_PER_ROW) % NUM_ITEM_ROWS;
    const magicNumber = 5;   // The good stuff
    return ITEM_SCALE * (Y * (82 + ITEM_ROW_SPACING + magicNumber) + ITEM_ROW_OFFSET);
  }

  private getNextNewItemIndex(): { newItemIndex: number, selectedIslandItemIndex: number } {
    let newItemIndex = -1;
    let selectedIslandItemIndex = Number.MAX_VALUE;
    if (this.selectedIslandItems !== undefined) {
      for (let i = 0; i < this.newItems.length; ++i) {
        const index = this.selectedIslandItems.findIndex(item => item.id === this.newItems[i]);
        if (index < 0) {
          continue;
        }
        if (index < selectedIslandItemIndex) {
          selectedIslandItemIndex = index;
          newItemIndex = i;
        }
      }
    }
    return { newItemIndex, selectedIslandItemIndex };
  }

  private setupViewModels() {
    for (let i = 0; i < NUM_ITEM_ROWS; ++i) {
      this.displayedItems[i] = new Array(ITEMS_DISPLAYED_PER_ROW);
      for (let j = 0; j < ITEMS_DISPLAYED_PER_ROW; ++j) {
        this.displayedItems[i][j] = new ItemButtonViewModel(this.localPlayer, {
          missingTexture: this.assets.missingItemTexture,
          checkmark: this.assets.checkmark,
          reqShovelBG: this.assets.reqShovelBG,
        }, this.isInteractable);
      }
    }
    for (let i = 0; i < NEW_ITEM_EFFECT_POOL_SIZE; ++i) {
      this.newItemEffectPool.push(new NewItemEffectViewModel());
    }
  }

  private initializeItemMap(itemContainer: ItemContainer) {
    log.info("InitializeItemMap");
    const items = ItemContainer.localInstance.allItems;
    this.islandToItems.clear();
    this.itemIDToIsland.clear();
    log.debug(`Initializing item map with ${items.length} items...`);
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let location = item.location;
      if (item.location === "LTE" && lteItemIDToIsland.get(item.id)) {
        location = lteItemIDToIsland.get(item.id)!;
      }
      let islandItems = this.islandToItems.get(location);
      if (islandItems === undefined) {
        islandItems = new Array<ItemData>();
        this.islandToItems.set(location, islandItems);
      }
      islandItems.push(item);
      log.debug(`Adding item ${item.name} to island ${location} (count: ${islandItems.length})...`);
    }
    this.islandToItems.forEach((v, _, __) => v.sort((a, b) => this.sortItems(a, b)));
    log.debug(`Loaded item map for ${this.islandToItems.size} islands...`);
  }

  private selectIsland(island: Islands, selectItem: boolean = true) {
    log.info(`Selecting island (${getIslandDisplayName(island)}).`);
    const reselectedIsland = this.selectedIsland === island;
    this.selectedIsland = island;
    if (this.islandToItems.size === 0) {
      log.warn(`Selecting island before items are populated.`);
      // don't populate collected item page until we've built the item map.
      return;
    }
    this.currentPageIndex = 0;
    this.refresh(false);
    if (!reselectedIsland && this.owner.entity.visible.get()) {
      AudioBank.play('catalog_pageTurn');
    }
    if (selectItem) {
      if (this.selectedIslandItems === undefined ||
        this.selectedIslandItems.length === 0) {
        this.selectItem(undefined);
      } else {
        this.selectItem(this.selectedIslandItems[0]);
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

  private pageForward() {
    log.info(`Turning page forward.`);
    this.currentPageIndex = Math.min(this.currentPageIndex + 1, this.getPageCount() - 1);
    this.populatePageDisplayItems();
    this.updateArrowVisibility();
    AudioBank.play('catalog_pageTurn');
  }

  private pageBackward() {
    log.info(`Turning page backward.`);
    this.currentPageIndex = Math.max(this.currentPageIndex - 1, 0);
    this.populatePageDisplayItems();
    this.updateArrowVisibility();
    AudioBank.play('catalog_pageTurn');
  }

  private setPage(index: number) {
    const newPage = Math.max(0, Math.min(this.getPageCount() - 1, index));
    if (newPage === this.currentPageIndex) {
      return;
    }
    this.currentPageIndex = newPage;
    log.info(`Setting page to index (${this.currentPageIndex}).`);
    this.populatePageDisplayItems();
    this.updateArrowVisibility();
    AudioBank.play('catalog_pageTurn');
  }

  private canPageForward() {
    return this.currentPageIndex < (this.getPageCount() - 1);
  }

  private canPageBackward() {
    return this.currentPageIndex > 0;
  }

  private getPageCount() {
    if (this.selectedIslandItems === undefined) {
      return 1;
    }
    return Math.max(1, Math.floor((this.selectedIslandItems.length + ITEMS_DISPLAYED_PER_PAGE - 1) / ITEMS_DISPLAYED_PER_PAGE))
  }

  private getPageIndexFromItemIndex(itemIndex: number) {
    return Math.floor(itemIndex / ITEMS_DISPLAYED_PER_PAGE);
  }

  private getViewModelFromItemIndex(itemIndex: number) {
    const x = itemIndex % ITEMS_DISPLAYED_PER_ROW;
    const y = Math.floor(itemIndex / ITEMS_DISPLAYED_PER_ROW) % NUM_ITEM_ROWS;
    return this.displayedItems[y][x];
  }

  private updateArrowVisibility() {
    this.isLeftArrowShowing.set(this.canPageBackward(), [this.localPlayer]);
    this.isRightArrowShowing.set(this.canPageForward(), [this.localPlayer]);
  }

  private refresh(refreshItemDetails: boolean = true) {
    this.populateItemsForSelectedIsland();
    this.populateCollectedItemsForSelectedIsland();
    this.populatePageDisplayItems();
    if (refreshItemDetails) {
      this.owner.sendLocalBroadcastEvent(UI_Catalog_Events.showItemDetails, { item: this.selectedItem, hideDiscovery: false });
    }
    this.updateArrowVisibility();
  }

  private populateItemsForSelectedIsland() {
    if (this.selectedIsland === undefined) {
      log.warn(`Cannot populate items, selected island is undefined.`);
      return;
    }
    log.info(`Populating items for selected island. (name: ${getIslandDisplayName(this.selectedIsland)}`);
    const selectedIslandLocationID = getIslandID(this.selectedIsland) ?? "";
    this.selectedIslandItems = this.islandToItems.get(selectedIslandLocationID)!;
    if (this.selectedIslandItems !== undefined && this.selectedIslandItems.length > 0) {
      log.debug(`Selected island has ${this.selectedIslandItems.length} items.`)
    } else {
      log.debug(`Selected island has no items.`)
    }
  }

  private populateCollectedItemsForSelectedIsland() {
    if (this.selectedIsland === undefined) {
      log.warn(`Cannot populate collected items, selected island is undefined.`);
      return;
    }
    log.info(`Populating collected items for selected island (${getIslandDisplayName(this.selectedIsland)}).`);
    let numberOfCollectedItems = 0;
    let numberOfItems = 0;
    this.selectedIslandCollectedItems.clear();
    if (this.selectedIslandItems !== undefined) {
      numberOfItems = this.selectedIslandItems.length;
      if (this.playerCatalogData !== undefined) {
        for (let i = 0; i < this.selectedIslandItems.length; ++i) {
          const item = this.selectedIslandItems[i];
          const itemId = item.id;
          const catalogData = GetCollectedItemData(this.playerCatalogData, itemId)
          if (catalogData == null) {
            continue;
          }
          this.selectedIslandCollectedItems.set(itemId, catalogData);
        }
        numberOfCollectedItems = this.selectedIslandCollectedItems.size;
      }
    }
    this.collectedItemsCountText.set(`Completed: ${numberOfCollectedItems}/${numberOfItems}`, [this.localPlayer]);
  }

  private populatePageDisplayItems() {
    if (this.selectedIsland === undefined) {
      log.warn(`Cannot populate page display items, selected island is undefined.`);
      return;
    }
    log.info(`Populating currently displayed page (${this.currentPageIndex}) for selected island (${getIslandDisplayName(this.selectedIsland)}).`);
    const offset = this.currentPageIndex * ITEMS_DISPLAYED_PER_PAGE;
    const hasSelectedIslandItems = this.selectedIslandItems !== undefined;
    for (let i = 0; i < NUM_ITEM_ROWS; ++i) {
      for (let j = 0; j < ITEMS_DISPLAYED_PER_ROW; ++j) {
        const itemIndex = i * ITEMS_DISPLAYED_PER_ROW + j + offset;
        if (hasSelectedIslandItems && itemIndex < this.selectedIslandItems!.length) {
          this.setupItemButton(this.displayedItems[i][j], this.selectedIslandItems![itemIndex]);
        } else {
          this.setupItemButton(this.displayedItems[i][j], undefined);
        }
      }
    }
  }

  private setupItemButton(itemButton: ItemButtonViewModel, itemData: ItemData | undefined) {
    if (itemData === undefined) {
      itemButton.setItem(undefined);
      return;
    }
    const targetPlayer = [this.localPlayer];
    const catalogData = this.selectedIslandCollectedItems.get(itemData.id);
    const isDiscovered = catalogData !== undefined && !catalogData.isNew;
    itemButton.setItem(itemData, isDiscovered);
    itemButton.isSelected.set(itemData === this.selectedItem, targetPlayer);
    itemButton.onClick = () => this.selectItem(itemData);

    const isItemOfInterest = this.playerCatalogData?.itemIdsOfInterest.includes(itemData.id) ?? false;
    if (isItemOfInterest) {
      if (!itemButton.isAnimating) {
        itemButton.startQuestAnimation(this.localPlayer);
      }
    } else {
      if (itemButton.isAnimating) {
        itemButton.stopQuestAnimation(this.localPlayer);
      }
    }
  }

  private sortItems(a: ItemData, b: ItemData) {
    if (a.rarity !== b.rarity) {
      return a.rarity - b.rarity;
    }
    return a.name.localeCompare(b.name);
  }

  private getButtonFromData(data: ItemData | undefined): ItemButtonViewModel | undefined {
    if (data === undefined || this.selectedIslandItems === undefined) {
      return undefined;
    }
    const offset = this.currentPageIndex * ITEMS_DISPLAYED_PER_PAGE;
    for (let i = 0; i < NUM_ITEM_ROWS; ++i) {
      for (let j = 0; j < ITEMS_DISPLAYED_PER_ROW; ++j) {
        const itemIndex = i * ITEMS_DISPLAYED_PER_ROW + j + offset;
        if (itemIndex < this.selectedIslandItems.length && this.selectedIslandItems[itemIndex] === data) {
          return this.displayedItems[i][j];
        }
      }
    }
    return undefined;
  }

  getView() {
    const itemPanel = this.itemPanel();
    // const leftArrow = this.createArrowView(this.assets.leftArrowImage, this.isLeftArrowShowing, ARROW_LEFT_HORIZONTAL_POSITION, () => this.pageBackward());
    // const rightArrow = this.createArrowView(this.assets.rightArrowImage, this.isRightArrowShowing, ARROW_RIGHT_HORIZONTAL_POSITION, () => this.pageForward());
    const footer = this.footer();
    return View({ //Content
      children: [
        //background,
        itemPanel,
        footer
        //leftArrow,
        //rightArrow
      ],
      style: {
        height: 490,
        flexGrow: 1,
        // flexShrink: 0,
        // flexBasis: 0,
        justifyContent: "space-between",
        //marginLeft: 12.8,
        width: 640,
      }
    });
  }

  private itemPanel() {
    const itemGridPanel = this.itemGridPanel();
    return View({ //Item Content
      children: [
        itemGridPanel
      ],
      style: {
        display: "flex",
        width: 326.4,
        height: 331.2,
        paddingVertical: 4,
        paddingHorizontal: 12.8,
        alignItems: "flex-start",
        flexShrink: 0,
        flexGrow: 1,
        flexDirection: "row",
        //position: "absolute",
        top: 16,
        left: 75
      }
    });
  }

  private itemGridPanel() {
    //const collectedItemQuantity = this.collectedItemQuantity();
    const itemGrid = this.itemGrid();
    const effects = new Array<UIChildren>();
    for (let travelEffect of this.newItemEffectPool) {
      effects.push(this.newItemEffect(travelEffect));
    }
    return View({ //ItemPanelLeft
      children: [
        //collectedItemQuantity,
        itemGrid,
        ...effects
      ],
      style: {
        display: "flex",
        //width: 286.4,
        paddingVertical: 6.4,
        paddingHorizontal: 0,
        flexDirection: "column",
        alignItems: "flex-start",
        flexShrink: 0,
        alignSelf: "stretch"
      }
    });
  }

  private newItemEffect(effect: NewItemEffectViewModel): UINode {
    return View({
      children: [UINode.if(effect.showReveal, View({
        children: [
          Image({
            source: this.assets.newItemBorderTexture,
            style: {
              width: 82,
              height: 82,
              position: "absolute",
              transform: [{ scale: effect.scale }],
              opacity: effect.opacity
            }
          }),
          View({
            style: {
              width: 82,
              height: 82,
              position: "absolute",
              backgroundColor: "#FFF",
              borderRadius: 13,
              opacity: effect.opacity
            }
          })
        ],
      })),
      UINode.if(effect.showTravel,
        Image({
          source: this.assets.newItemTravelTexture,
          style: {
            width: 82,
            height: 82,
            position: "absolute",
            transform: [{ scale: 1.7 }, { translateY: 20 }]
          }
        }))
      ],
      style: {
        width: 82,
        height: 82,
        left: effect.x,
        top: effect.y,
        position: "absolute",
        transform: [{ scale: ITEM_SCALE }]
      }
    });
  }

  private itemGrid() {
    const buttonPanel: UIChildren[] = [];
    for (let i = 0; i < NUM_ITEM_ROWS; ++i) {
      buttonPanel.push(this.itemButtonRow(this.displayedItems[i], i > 0 ? ITEM_ROW_SPACING : 0));
    }
    return View({ //Item Grid
      children: buttonPanel,
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        flexGrow: 1,
        flexShrink: 0,
        flexBasis: 0,
        alignSelf: "stretch",
        marginTop: 8
      }
    });
  }

  private itemButtonRow(items: Array<ItemButtonViewModel>, topMargin: number) {
    const buttonRow: UIChildren[] = [];
    for (let i = 0; i < items.length; ++i) {
      buttonRow.push(items[i].getView({
        //   Add any UI overrides here.
        margin: 20,
        transform: [{ scale: ITEM_SCALE }]
      }));
      //buttonRow.push(this.itemButton(items[i], i * ITEM_COLUMN_SPACING));
    }
    return View({ //Row
      children: buttonRow,
      style: {
        display: "flex",
        flexDirection: "row",
        //width: 281.6,
        //height: 65.6,
        justifyContent: "center",
        alignItems: "flex-start",
        //marginTop: topMargin
      }
    });
  }

  private footer() {
    return View({ //Pagination
      children: [
        Pressable({ //button_prevPage
          children: [Image({ //icn_LeftCatalog
            source: this.assets.leftArrowImage,
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
          onClick: () => this.pageBackward()
        }),
        Text({ // Completed Regions text
          text: this.collectedItemsCountText,
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
            source: this.assets.rightArrowImage,

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
          onClick: () => this.pageForward()
        })],
      style: {
        display: "flex",
        height: 48,
        justifyContent: "center",
        alignItems: "center",
        alignSelf: "stretch",
        flexDirection: "row",
        paddingBottom: 12
      }
    })
  }
}

class ItemButtonViewModel extends ItemViewModel {
  public itemOfInterestOpacity: AnimatedBinding = new AnimatedBinding(0);
  public isAnimating: boolean = false;

  constructor(player: Player, assets: ItemViewModelAssets, isInteractable?: Binding<boolean>) {
    super(player, assets, false, isInteractable);
  }

  public startQuestAnimation(player: Player) {
    this.isAnimating = true;
    this.animation1(player);
  }

  public stopQuestAnimation(player: Player) {
    this.itemOfInterestOpacity.stopAnimation([player]);
    this.itemOfInterestOpacity.set(0, undefined, [player]);
    this.isAnimating = false;
  }

  private animation1(player: Player) {
    this.itemOfInterestOpacity.set(
      Animation.timing(1, { duration: QUEST_OPACITY_DURATION, easing: Easing.ease }),
      () => {
        if (this.isAnimating) {
          this.animation2(player)
        }
      },
      [player]);
  }

  private animation2(player: Player) {
    this.itemOfInterestOpacity.set(
      Animation.timing(0, { duration: QUEST_OPACITY_DURATION, easing: Easing.ease }),
      () => {
        if (this.isAnimating) {
          this.animation1(player)
        }
      },
      [player]);
  }
}

class NewItemEffectViewModel {
  public scale = new AnimatedBinding(1);
  public x = new Binding(0);
  public y = new AnimatedBinding(0);
  //public stage = new Binding(NewItemEffectStage.None);
  public opacity = new AnimatedBinding(1);
  public showTravel = new Binding(false);
  public showReveal = new Binding(false);
}
