/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_ItemState } from 'BigBox_ItemState';
import { BigBox_UI_Inventory_Manager } from 'BigBox_UI_Inventory_Manager';
import { Debug } from 'Debug';
import { DialogManager } from 'DialogManager';
import { DigManager } from 'DigManager';
import { HUDElementType } from 'Enums';
import { Events } from 'Events';
import { setPlayerVariableSafe } from 'GameUtils';
import * as hz from 'horizon/core';
import { Player } from 'horizon/core';
import { getIslandDisplayName, } from 'Islands';
import { ItemContainer } from 'ItemContainer';
import { ItemData } from 'ItemData';
import { ItemModifiers, ItemUtils } from 'ItemUtils';
import { Logger } from 'Logger';
import { MuseumCuratorManager } from 'MuseumCuratorManager';
import { NPC_Shop } from 'NPC_Shop';
import { PlayerData } from 'PlayerData';
import { PlayerDataEvents } from 'PlayerDataEvents';
import { getPlayerInventoryData, InventoryItemData, PlayerInventoryData } from 'PlayerInventoryData';
import { PlayerService } from 'PlayerService';
import { HARDCODED_POTION_TUNING, PotionData } from 'PotionData';
import { PVAR_INVENTORY, SAVE_VERSION, saveVersionMatches, SHOULD_USE_PERSISTENCE } from 'PVarConsts';
import { QuestEvents } from 'QuestManager';
import { RaycastHelper } from 'RaycastHelper';
import { Shovel } from 'Shovel';
import { ShovelProgressionManager } from 'ShovelProgressionManager';
import { Analytics } from 'TurboAnalytics';
import { TutorialProgress } from 'TutorialManager';
import { PopupDialogParams } from 'UIView_PopupDialog';
import { UIView_PotionInventory } from 'UIView_PotionInventory';

const log = new Logger("BigBox_Player_Inventory");

/**
 * Manages an inventory of item states for every player in the server
 */
export class BigBox_Player_Inventory extends hz.Component<typeof BigBox_Player_Inventory> {
  static propsDefinition = {
    uiManager: { type: hz.PropTypes.Entity },
  };

  // Singleton
  private static _instance: BigBox_Player_Inventory | null;
  public static get instance(): BigBox_Player_Inventory { return this._instance!; }
  public static inventorySizePerLevel: number[] = [4, 6, 8, 10, 12, 14, 16, 20, 24];
  public static backpackLevelPrices: number[] = [0, 500, 1200, 6000, 18000, 28800, 40300, 52400, 65500];
  public static backpackPlayerLevelRequirements: number[] = [0, 3, 8, 11, 15, 20, 25, 30, 35];

  public static onRequestCurrencyForInitialization = new hz.NetworkEvent<{ player: hz.Player }>('onRequestCurrencyForInitialization');
  public static onCurrencyChanged = new hz.NetworkEvent<{ player: hz.Player, newAmount: number }>('onCurrencyChanged');
  public static onInitializeCurrency = new hz.NetworkEvent<{ player: hz.Player, initialAmount: number }>('onInitializeCurrency');
  public static onItemEquipped = new hz.NetworkEvent<{ player: hz.Player, itemIndex: number, equipped: boolean }>('onItemEquipped');
  public static requestResetCurrencyForPlayer = new hz.NetworkEvent<{ player: hz.Player }>('requestResetCurrencyForPlayer');
  public static requestInventoryData = new hz.NetworkEvent<{ player: hz.Player }>('requestInventoryData');
  public static requestInventoryDataResponse = new hz.NetworkEvent<{ data: PlayerInventoryData }>('requestInventoryDataResponse');
  public static playerInventoryChanged = new hz.LocalEvent<{ player: hz.Player }>('playerInventoryChanged');
  public static lockItem = new hz.NetworkEvent<{ player: hz.Player, itemIndex: number, isLocked: boolean }>('playerInventoryLockItem');
  public static requestInventorySize = new hz.NetworkEvent<{ player: hz.Player }>('requestInventorySize');
  public static requestInventorySizeUpdated = new hz.NetworkEvent<{ size: number }>('requestInventorySizeUpdated');
  public static requestDigData = new hz.NetworkEvent<{player: hz.Player}>('requestDigData');
  public static digDataEvent = new hz.NetworkEvent<{streak: number}>('digDataEvent');

  /** If true, the player will hold the item they dig up */
  private static readonly HOLD_ITEM_ON_COMPLETE: boolean = false;

  public static printInventoryData(player: Player) {
    BigBox_Player_Inventory.instance.print(player);
  }

  private itemCatalog: ItemData[] = []
  private playersToRestore: hz.Player[] = []
  private uiManager!: BigBox_UI_Inventory_Manager

  private playerInventories = new Map<hz.Player, (BigBox_ItemState | null)[]>()
  private playerCurrencies = new Map<hz.Player, number>();
  private playerBatchChangeIndices = new Map<hz.Player, number[]>();

  private craftingItemIds = new Set<string>();
  private curatorItems = new Map<Player,string>()

  preStart() {
    BigBox_Player_Inventory._instance = this;
  }

  start() {
    PlayerData.init(this.world);

    this.connectLocalBroadcastEvent(ItemContainer.itemDataLoadComplete, (payload) => {
      ItemContainer.localInstance.allItems.forEach((item) => {
        this.itemCatalog.push(item)
      });
      this.playersToRestore.forEach((player) => {
        this.restoreInventory(player);
      })
      this.playersToRestore = [];
      this.loadDebugCommands();

      ShovelProgressionManager.instance.allShovels.forEach((shovel) => {
        if (shovel.itemCost1ID.length > 0) {
          this.craftingItemIds.add(shovel.itemCost1ID);
        }
        if (shovel.itemCost2ID.length > 0) {
          this.craftingItemIds.add(shovel.itemCost2ID);
        }
        if (shovel.itemCost3ID.length > 0) {
          this.craftingItemIds.add(shovel.itemCost3ID);
        }
      })
    })

    this.connectNetworkBroadcastEvent(Events.playerDigComplete, (payload) => {
      if (payload.isSuccess) {
        const player = payload.player;
        this.givePlayerItem(player!, payload.itemId, BigBox_Player_Inventory.HOLD_ITEM_ON_COMPLETE, true)
        if (BigBox_Player_Inventory.HOLD_ITEM_ON_COMPLETE) {
          this.async.setTimeout(() => {
            let equipIndex = this.getEquippedIndex(player!)
            if (equipIndex !== -1 && equipIndex !== 0) { // not holding anything or shovel, dont unequip
              this.onSlotSelected(payload.player, equipIndex, false)
            }
            if (equipIndex !== 0) { // not holding shovel, re-equip shovel
              this.onSlotSelected(player, 0, true)
              this.sendNetworkBroadcastEvent(Shovel.equip, player, [player]);
            }
          }, 3 * 1000)
        }
      }
    })

    this.connectNetworkBroadcastEvent(BigBox_Player_Inventory.onRequestCurrencyForInitialization, (payload) => {
      this.sendNetworkBroadcastEvent(
        BigBox_Player_Inventory.onInitializeCurrency,
        { player: payload.player, initialAmount: this.getPlayerCurrency(payload.player) },
        [payload.player])
    })

    this.connectNetworkBroadcastEvent(BigBox_Player_Inventory.requestResetCurrencyForPlayer, (payload) => {
      this.changePlayerCurrency(payload.player, -this.getPlayerCurrency(payload.player));

    });
    PlayerService.connectPlayerEnterWorld(this, player => this.onPlayerEnterWorld(player));

    this.connectNetworkBroadcastEvent(BigBox_Player_Inventory.requestInventoryData, (payload) => this.onInventoryDataRequested(payload.player));
    this.connectNetworkBroadcastEvent(Events.requestInventory, (payload) => {
      this.sendInventory(payload.player)

      // TODO: should this be a separate event
      let playerInventory = getPlayerInventoryData(this.world, payload.player);
      if (playerInventory === undefined) {
        playerInventory = this.createNewInventory();
      }

      let potionInventory = playerInventory!.potionInventory;
      potionInventory.sort(BigBox_Player_Inventory.sortPotionsByBoost);
      this.sendNetworkBroadcastEvent(UIView_PotionInventory.potionInventoryUpdated, { player: payload.player, potionInventory: potionInventory}, [ payload.player ])
    })

    this.connectNetworkBroadcastEvent(BigBox_Player_Inventory.lockItem, (payload) => this.onLockItem(payload.player, payload.itemIndex, payload.isLocked));

    this.connectNetworkBroadcastEvent(BigBox_Player_Inventory.requestInventorySize, (payload) => this.onInventorySizeUpdated(payload.player));

    this.connectNetworkBroadcastEvent(PlayerDataEvents.backpackLevelUpdated, (payload) => this.onInventorySizeUpdated(payload.player));

    this.connectNetworkBroadcastEvent(BigBox_Player_Inventory.requestDigData, (payload) => { this.onRequestDigData(payload.player)})

    this.connectNetworkBroadcastEvent(Events.requestSelectPotion, (payload) => this.selectPotion(payload.player, payload.potionId));
    this.connectNetworkBroadcastEvent(Events.requestUnselectPotion, (payload) => this.unselectPotion(payload.player, payload.potionId));
    this.connectNetworkBroadcastEvent(Events.requestUsePotion, (payload) => this.usePotion(payload.player, payload.potionId));
    this.connectNetworkBroadcastEvent(Events.requestShovelInit, (data) => {
      const inventoryData = getPlayerInventoryData(this.world, data.player);
      this.initializeShovelLevels(data.player, inventoryData!, [data.player]) // this event must respond to the client's shovel requesting this info
      this.sendNetworkBroadcastEvent(Shovel.setRaycastGizmo, RaycastHelper.instance, [data.player]);
    })

    this.connectNetworkBroadcastEvent(MuseumCuratorManager.assignCuratorQuest, (payload) => this.curatorItems.set(payload.player, payload.itemId))
    this.connectNetworkBroadcastEvent(QuestEvents.startQuestForPlayer, (data) => {
      if (data.questId === 'curator'){
        const item = data.playerQuests.activeQuests.find(q => q.questId === 'curator')?.subquestStates[0]?.itemIdsOfInterest
        if (item) {
          this.curatorItems.set(data.player, item)
        }
      }
    })
    this.connectNetworkBroadcastEvent(QuestEvents.finishQuestForPlayer, (data) =>{
      if (data.questId === 'curator'){
        this.curatorItems.delete(data.player)
      }
    })

    this.uiManager = this.props.uiManager!.getComponents<BigBox_UI_Inventory_Manager>()[0]
  }

  private loadDebugCommands() {
    const itemContainer = ItemContainer.localInstance;
    if (!itemContainer) {
      return;
    }
    itemContainer.allItems.forEach((item) => {
      Debug.addCommand(`Inventory/Add Item/${getIslandDisplayName(item.location)}/${item.name}`, (player) => {
        this.givePlayerItem(player, item.id, false, true);
      });
    });
    PotionData.getAllPotionTuning().forEach((potion) => {
      Debug.addCommand(`Inventory/Add Potion/${potion.displayName}`, (player) => {
        this.givePotions(player, potion.potionId);
      });
      Debug.addCommand(`Inventory/Add Potion/${potion.displayName} (x100)`, (player) => {
        this.givePotions(player, potion.potionId, 100);
      });
    });

    Debug.addCommand(`Inventory/Increase Inventory Size`, (player) => {
      PlayerData.incrementBackpackLevel(player);
    });
  }

  private print(player: Player) {
    let playerInventory = getPlayerInventoryData(this.world, player);
    if (playerInventory === undefined) {
      playerInventory = this.createNewInventory();
    }

    // !! Leave as console.log !!
    console.log(`Inventory Data for ${PlayerService.getPlayerName(player)}\n${JSON.stringify(playerInventory)}`);
  }

  isInventoryFull(player: hz.Player): boolean {
    const inventoryData = getPlayerInventoryData(this.world, player);
    if (!inventoryData) {
      return true;
    }

    let size = this.getInventorySize(player);
    if (size === undefined) {
      log.error("Inventory size is undefined. User's saved backpack level might be outside of defined range.")
      return true;
    }

    return inventoryData.inventory.length >= size;
  }

  getInventorySize(player: hz.Player): number {
    return BigBox_Player_Inventory.inventorySizePerLevel[PlayerData.getBackpackLevel(player)]
  }

  hasPotions(player: hz.Player): boolean {
    const inventoryData = getPlayerInventoryData(this.world, player);
    if (!inventoryData) {
      return false;
    }
    return inventoryData.potionInventory.some(p => p.count > 0);
  }

  private onInventoryDataRequested(player: hz.Player) {
    const inventoryData = getPlayerInventoryData(this.world, player);
    this.sendNetworkBroadcastEvent(BigBox_Player_Inventory.requestInventoryDataResponse, { data: inventoryData }, [player]);
  }

  private onLockItem(player: hz.Player, itemIndex: number, isLocked: boolean) {
    let inventory = this.playerInventories.get(player)
    if (inventory === undefined) {
      return;
    }
    let item = inventory[itemIndex]
    if (!item) {
      return;
    }
    log.info(`${isLocked ? "LOCKING" : "UNLOCKING"} item ${item.info.id} for player ${player.id}`)
    item.isLocked = isLocked;
    const changedIndices = [itemIndex];
    this.sortInventory(player, inventory, changedIndices);
    this.sendInventoryIndices(player, changedIndices);
    this.saveInventory(player, inventory);
  }

  private onInventorySizeUpdated(player: hz.Player) {
    const backpackLevel = Math.min(PlayerData.getBackpackLevel(player), BigBox_Player_Inventory.inventorySizePerLevel.length - 1);
    log.info("inventory size updated, backpack level: " + backpackLevel + "  size: " + BigBox_Player_Inventory.inventorySizePerLevel[backpackLevel]);
    this.sendNetworkBroadcastEvent(BigBox_Player_Inventory.requestInventorySizeUpdated, { size: BigBox_Player_Inventory.inventorySizePerLevel[backpackLevel] }, [player]);
  }

  private sortInventory(player: hz.Player, inventory: (BigBox_ItemState | null)[], changedIndices: number[]) {
    for (let i = 0; i < inventory.length; i++) {
      let nextItemIndex = -1;
      for (let j = i; j < inventory.length; j++) {
        const item = inventory[j];
        if (item == undefined) {
          continue;
        }
        if (nextItemIndex < 0) {
          nextItemIndex = j;
          continue;
        }
        if (item.isLocked && !inventory[nextItemIndex]!.isLocked) {
          nextItemIndex = j
          continue;
        }
      }
      if (nextItemIndex < 0 || i === nextItemIndex) {
        continue;
      }
      const swap = inventory[i];
      inventory[i] = inventory[nextItemIndex];
      inventory[nextItemIndex] = swap;
      if (!changedIndices.includes(i)) {
        changedIndices.push(i);
      }
      if (!changedIndices.includes(nextItemIndex)) {
        changedIndices.push(nextItemIndex);
      }
    }
  }

  public getPlayerInventory(player: hz.Player): (BigBox_ItemState | null)[] | undefined {
    return this.playerInventories.get(player)
  }

  public getPlayerPotions(player: hz.Player): string[] {
    let playerInventory = getPlayerInventoryData(this.world, player);
    if (playerInventory === undefined) {
      return [];
    }
    let potionInventory = playerInventory!.potionInventory;
    return potionInventory.filter(p => p.count > 0).map(p => p.id);
  }

  public getPlayerItemCount(player: hz.Player, itemID: string): number {
    let count = 0;
    let inventory = this.playerInventories.get(player)
    inventory?.forEach(item => {
      if (item?.info.id === itemID) count++;
    })
    return count;
  }

  checkItem(player: hz.Player, itemID: string, requiredAmount: number): boolean {
    if (itemID === undefined || itemID === '') {
      return true;
    }
    const inventoryItemCount = this.getPlayerItemCount(player, itemID);
    return inventoryItemCount >= requiredAmount;
  }

  private onRequestDigData(player: hz.Player) {
    let streak = PlayerData.getDigStreak(player)
    this.sendNetworkEvent(player, BigBox_Player_Inventory.digDataEvent, {streak: streak})
  }

  public onSlotSelected(player: hz.Player, slotId: number, selected: boolean) {
    const inventory = this.playerInventories.get(player)
    if (inventory) {
      const item = inventory[slotId]

      if (item) {
        if (selected) {
          item.equip()
          if (!item.info.isShovel()) {
            this.sendNetworkBroadcastEvent(Shovel.unequip, player, [player]);
          }
        }
        else {
          item.unequip()
          if (!item.info.isShovel()) {
            this.sendNetworkBroadcastEvent(Shovel.equip, player, [player]);
          }
        }

        this.sendNetworkBroadcastEvent(
          BigBox_Player_Inventory.onItemEquipped,
          { player: player, itemIndex: slotId, equipped: selected })
      }
    }
  }

  private onPlayerEnterWorld(player: hz.Player): void {
    if (this.itemCatalog.length === 0) {
      this.playersToRestore.push(player);
    }
    else {
      let inventory = this.restoreInventory(player);
      this.initializeShovelLevels(player, inventory, [player, this.world.getServerPlayer()])
    }
  }

  private restoreInventory(player: hz.Player) {
    let playerInventory = getPlayerInventoryData(this.world, player);
    if (playerInventory === undefined || playerInventory === null || !playerInventory.saveVersion || !saveVersionMatches(playerInventory.saveVersion)) {
      playerInventory = this.createNewInventory();
      setPlayerVariableSafe(this.world, player, PVAR_INVENTORY, playerInventory);
    }

    if (playerInventory.inventory.length > 0){
      playerInventory = this.validateInventory(player, playerInventory);
    }

    const restoredItems: Array<BigBox_ItemState | null> = [];
    for (let i = 0; i < playerInventory.inventory.length; i++) {
      let item = playerInventory.inventory[i];
      let restoredItem = this.restoreItem(item, player);
      if (restoredItem) {
        restoredItems.push(restoredItem);
      }
    }

    this.playerInventories.set(player, restoredItems);
    return playerInventory
  }

  private restoreItem(item: InventoryItemData, player: hz.Player): BigBox_ItemState | undefined {
    var itemModifiers = new ItemModifiers();
    itemModifiers.weight = item.weight;
    itemModifiers.mutation = item.mutation;
    var props = this.itemCatalog.find(i => i.id === item.id);
    if (props) {
      var itemState = new BigBox_ItemState(props, itemModifiers, player, null, item.isLocked);
      return itemState;
    }
    return undefined;
  }

  private validateInventory(player: hz.Player, inventory: PlayerInventoryData){
    let backpackSize = this.getInventorySize(player);
    if (backpackSize === undefined) { // data is invalid, we must fix
      log.error("Inventory size is undefined. User's saved backpack level might be outside of defined range.")
      PlayerData.setBackpackLevel(player, BigBox_Player_Inventory.inventorySizePerLevel.length - 1)
      backpackSize = BigBox_Player_Inventory.inventorySizePerLevel[BigBox_Player_Inventory.inventorySizePerLevel.length - 1]

      let excessItems = inventory.inventory.splice(backpackSize)
      // compensate player for excess items
      let total = 0
      excessItems.forEach(item => {
        let state = this.restoreItem(item, player)
        if (state) {
          total += ItemUtils.getItemValue(state)
        }
      })

      log.info(`Compensating player for ${excessItems.length} excess items, total: $${total}`)
      this.changePlayerCurrency(player, total)
      setPlayerVariableSafe(this.world, player, PVAR_INVENTORY, inventory);
    }

    return inventory
  }

  private saveItem(item: BigBox_ItemState): InventoryItemData {
    log.info(`Saving item ${item.info.id}`);
    return {
      id: item.info.id,
      weight: item.modifiers.weight,
      mutation: item.modifiers.mutation,
      isLocked: item.isLocked
    }
  }

  private createNewInventory(): PlayerInventoryData {
    let shovelId = "shovel_base01";
    return { saveVersion: SAVE_VERSION, shovels: [shovelId], shovelId: shovelId, inventory: [], potionInventory: [] };
  }

  public givePlayerItem(player: hz.Player, itemId: string, equip: boolean = false, newItem: boolean = false) {
    let itemInfo = this.itemCatalog.find(item => item.id === itemId)
    if (itemInfo) {
      this.givePlayerItemFromInfo(player, itemInfo, equip, null, newItem)
    }
    else {
      log.error('No item with id ' + itemId)
    }
  }

  public givePlayerItemFromInfo(
    player: hz.Player,
    itemInfo: ItemData,
    equip: boolean = false,
    grabbable: hz.GrabbableEntity | null = null,
    newItem: boolean = false) {
      let modifiers = DigManager.instance?.playerDigData.get(player)?.itemMods // kinda hacky
    if (!modifiers) {
      modifiers = new ItemModifiers()
      modifiers.weight = 1
    }

    let itemState = new BigBox_ItemState(itemInfo, modifiers, player, grabbable)
    let inventory = this.playerInventories.get(player)
    let indexOf = 0
    if (!inventory) {
      log.info(`Cannot give item (${itemInfo.name}) to player (${player.id}) because the inventory isn't initialized!`);
      return;
    }

    let firstAvailable = this.getFirstAvailableSlot(inventory);
    if (firstAvailable === -1) {
      inventory.push(itemState)
      indexOf = inventory.length - 1
    }
    else {
      inventory[firstAvailable] = itemState
      indexOf = firstAvailable
    }
    this.playerInventories.set(player, inventory)
    this.saveInventory(player, inventory)

    if (newItem) {
      this.sendLocalBroadcastEvent(Events.localItemReceived, { itemState: itemState });
    }
    this.uiManager.onSlotDataChanged(player, {
      itemId: itemInfo.id,
      index: indexOf,
      weight: modifiers.weight,
      selected: equip,
      mutation: modifiers.mutation,
    });
    if (equip) {
      itemState.equip()
    }
    if (this.craftingItemIds.has(itemInfo.id)) {
      this.onLockItem(player, indexOf, true)
    }
    else if (this.curatorItems.get(player) === itemInfo.id){
      this.onLockItem(player, indexOf, true)
    }

    log.info(`Added item (${itemState.info.name}) to player (${player.id})  equip: ${equip}  newItem: ${newItem}`);

    // prompt user to quick sell if they have a full inventory
    this.async.setTimeout(() => {
      let promptUser = PlayerData.getTutorialComplete(player) >= TutorialProgress.BEGIN_LOCATION
      promptUser &&= this.isInventoryFull(player)

      if (promptUser) {
        const valueMod = 2 // todo serialize?
        const params: PopupDialogParams = {
          title: "Inventory Full",
          text: `Quick Sell your items now\n-or-\nNavigate to Rufus for double Dig Dollars`,
          option1: "Quick Sell",
          option2: "Navigate",
          option1TextColor: "#FFF",
          option1BGColor: "#70C04E",
          option1BorderColor: "#49A24C",
          blockPlayerMovement: false,
          excludeUI: HUDElementType.Inventory,
        };

        DialogManager.showPopup(this, player, params, (player, selection) => {
          if (selection === 0){ // quick sell
            NPC_Shop.sellItems(player, this, this, 1 / valueMod)
            Analytics()?.sendTaskEnd({ player, taskKey: 'sell_quick'});
          }
          else{ // navigate
            this.sendNetworkBroadcastEvent(QuestEvents.requestStartQuestForPlayer, {
              player,
              questId: 'visit_rufus',
              overwriteExisting: true,
            })
          }
        })
      }
    }, 3200);
  }

  private getFirstAvailableSlot(inventory: (BigBox_ItemState | null)[]): number {
    for (let i = 0; i < inventory.length; i++) {
      if (inventory[i] === null) {
        return i;
      }
    }
    return -1;
  }

  public givePotions(player: hz.Player, potionId: string, amount: number = 1) {
    let playerInventory = getPlayerInventoryData(this.world, player);
    if (playerInventory === undefined) {
      playerInventory = this.createNewInventory();
    }
    let potionInventory = playerInventory!.potionInventory;
    let potionExists = false;
    for (let i = 0; i < potionInventory.length; i++) {
        if (potionInventory[i].id === potionId) {
          potionInventory[i].count += amount;
          potionExists = true;
          break;
        }
    }
    if (!potionExists) {
        potionInventory.push({ id: potionId, count: amount });
    }

    potionInventory.sort(BigBox_Player_Inventory.sortPotionsByBoost);
    setPlayerVariableSafe(this.world, player, PVAR_INVENTORY, playerInventory);
    this.sendNetworkBroadcastEvent(UIView_PotionInventory.potionInventoryUpdated, { player: player, potionInventory: potionInventory}, [ player ])
  }

  public givePotionBundle(player: Player, count: number) {
    const weights = HARDCODED_POTION_TUNING.map(potion => potion.bundleWeight);

    const rolledIndexes = [];
    let choseNonUncommon = false;
    for (let i = 0; i < count; i++) {
      let chosenIndex = ItemUtils.getWeightedRandomIndex(weights);
      rolledIndexes.push(chosenIndex);
      if (chosenIndex > 0) {
        choseNonUncommon = true;
      }
    }

    if (!choseNonUncommon) {
      rolledIndexes[rolledIndexes.length - 1] = 1;
    }

    // Ascending order
    rolledIndexes.sort((a, b) => a - b);

    // Give potions in inventory
    let playerInventory = getPlayerInventoryData(this.world, player);
    if (playerInventory === undefined) {
      playerInventory = this.createNewInventory();
    }

    let potionInventory = playerInventory!.potionInventory;
    let potionIdsInBundle = new Array(HARDCODED_POTION_TUNING.length).fill(0);

    for (let i = 0; i < rolledIndexes.length; i++) {
      const index = rolledIndexes[i];
      potionIdsInBundle[index] += 1;
      const potionId = HARDCODED_POTION_TUNING[index].potionId;
      Analytics()?.sendTaskEnd({player, taskKey: 'potion_add', taskType: potionId})
      let potionInInventory = potionInventory.find(potion => potion.id === potionId);
      if (potionInInventory) {
          potionInInventory.count += 1;
      } else {
          potionInventory.push({ id: potionId, count: 1 });
      }
    }

    potionInventory.sort(BigBox_Player_Inventory.sortPotionsByBoost);
    setPlayerVariableSafe(this.world, player, PVAR_INVENTORY, playerInventory);
    this.sendNetworkBroadcastEvent(UIView_PotionInventory.potionInventoryUpdated, { player: player, potionInventory: potionInventory}, [ player ])
    this.sendNetworkBroadcastEvent(Events.givePotionBundle, { player: player, potionCounts: potionIdsInBundle }, [player]);
  }

  private selectPotion(player: Player, potionId: string) {
    const tuning = PotionData.getPotionTuning(potionId)!;

    PlayerData.startBatch();
    PlayerData.addSelectedPotion(player, potionId, tuning.buffType);
    PlayerData.endBatch();
  }

  private unselectPotion(player: Player, potionId: string) {
    PlayerData.startBatch();
    PlayerData.removeSelectedPotion(player, potionId);
    PlayerData.endBatch();
  }

  public usePotion(player: Player, potionId: string) {
    let playerInventory = getPlayerInventoryData(this.world, player);
    if (playerInventory === undefined) {
      playerInventory = this.createNewInventory();
      log.error("Player inventory should not be empty here")
    }
    let potionInventory = playerInventory!.potionInventory;
    for (let i = 0; i < potionInventory.length; i++) {
      if (potionInventory[i].id === potionId) {
          potionInventory[i].count -= 1;
          Analytics()?.sendTaskEnd({player, taskKey: 'use_potion', taskType: `${potionId},${potionInventory[i].count}`});
          if (potionInventory[i].count <= 0) {
            potionInventory.splice(i, 1);
            // Used potion, unselect it
            PlayerData.removeSelectedPotion(player, potionId);
          }
          break;
      }
    }
    this.sendLocalBroadcastEvent(Events.potionUsedEvent, {player: player, potionID: potionId})
    setPlayerVariableSafe(this.world, player, PVAR_INVENTORY, playerInventory);
    this.sendNetworkBroadcastEvent(UIView_PotionInventory.potionInventoryUpdated, { player: player, potionInventory: potionInventory}, [ player ])
  }

  public sendInventory(player: hz.Player) {
    let inventory = this.playerInventories.get(player);
    if (inventory) {
      for (let i = 0; i < inventory.length; i++) {
        this.sendInventoryItem(player, i, inventory[i]);
      }
    }
    //send current shovel so the UI updates
    ShovelProgressionManager.instance.setShovel(player, ShovelProgressionManager.instance.getShovelId(player));
  }

  private initializeShovelLevels(player: hz.Player, playerInventory: PlayerInventoryData, players: Player[]) {
    for (const shovel of ShovelProgressionManager.instance.allShovels) {
      if (playerInventory.shovels.includes(shovel.id)){
        let level = ShovelProgressionManager.instance.getShovelLevel(player, shovel.id)
        this.sendNetworkBroadcastEvent(Events.shovelSetLevel, { player: player, shovel: shovel.id, level: level}, players)
      }
    }
  }

  private sendInventoryIndices(player: hz.Player, indices: number[]) {
    let inventory = this.playerInventories.get(player);
    if (inventory) {
      for (let i = 0; i < indices.length; i++) {
        const index = indices[i];
        const item = inventory[index];
        this.sendInventoryItem(player, index, item);
      }
    }
  }

  private sendInventoryItem(player: hz.Player, index: number, item: BigBox_ItemState | null) {
    if (!item) {
      this.uiManager.onSlotDataChanged(player, {
        itemId: ItemUtils.INVALID_ID,
        index
      });
      return;
    }
    let modifiers = item.modifiers;
    if (!modifiers) {
      modifiers = new ItemModifiers()
      modifiers.weight = 1
    }
    this.uiManager.onSlotDataChanged(player, {
      itemId: item.info.id,
      index: index,
      weight: modifiers.weight,
      mutation: modifiers.mutation,
      isLocked: item!.isLocked
    });
  }

  private saveInventory(player: hz.Player, inventory: (BigBox_ItemState | null)[]) {
    let playerInventory = getPlayerInventoryData(this.world, player);
    if (playerInventory === undefined) {
      playerInventory = this.createNewInventory();
    }
    let savedItems: Array<InventoryItemData> = [];
    if (inventory) {
      inventory.forEach(item => {
        if (item) {
          savedItems.push(this.saveItem(item!))
        }
      });
    }
    playerInventory!.inventory = savedItems;
    setPlayerVariableSafe(this.world, player, PVAR_INVENTORY, playerInventory);
    this.sendLocalBroadcastEvent(BigBox_Player_Inventory.playerInventoryChanged, { player: player });

    return playerInventory
  }

  public startBatchChange(player: hz.Player) {
    if (this.playerBatchChangeIndices.has(player)) {
      log.warn('Player ' + player.id + ' already in batch change');
      return;
    }
    this.playerBatchChangeIndices.set(player, []);
  }

  public endBatchChange(player: hz.Player) {
    const changedIndices = this.playerBatchChangeIndices.get(player);
    if (changedIndices === undefined) {
      log.warn('Player ' + player.id + ' not in batch change');
      return;
    }
    this.playerBatchChangeIndices.delete(player);
    const inventory = this.playerInventories.get(player);
    this.sortInventory(player, inventory!, changedIndices);
    this.sendInventoryIndices(player, changedIndices);
    this.saveInventory(player, this.playerInventories.get(player)!);
  }

  public removeItem(player: hz.Player, index: number) {
    let inventory = this.playerInventories.get(player)!
    let itemState = inventory[index]
    if (itemState) {
      log.info('Removing item ' + itemState.info.name + ' from player ' + player.id)
      itemState.dispose()
      inventory[index] = null
      let changedIndices = this.playerBatchChangeIndices.get(player);
      if (changedIndices === undefined) {
        changedIndices = [index];
        this.sortInventory(player, inventory, changedIndices);
        this.sendInventoryIndices(player, changedIndices);
        this.saveInventory(player, inventory);
      } else {
        changedIndices.push(index);
      }
    }
    else {
      log.error('No item at index ' + index)
    }
  }

  public removeItemById(player: hz.Player, itemId: string, amount: number) {
    this.removeItems(player, [{ itemId: itemId, amount: amount }]);
  }

  public removeItems(player: hz.Player, items: { itemId: string, amount: number }[]) {
    let inventory = this.playerInventories.get(player);
    if (!inventory) {
      log.warn(`Cannot remove items from player ${player} because the inventory isn't initialized!`);
      return;
    }
    let changedIndices = this.playerBatchChangeIndices.get(player);
    let sortAndSave = false;
    if (changedIndices === undefined) {
      sortAndSave = true;
      changedIndices = [];
    }
    for (const item of items) {
      let amount = item.amount;
      const itemId = item.itemId;
      if (amount <= 0) {
        return;
      }
      for (let i = 0; i < inventory.length && amount > 0; ++i) {
        const inventoryItem = inventory[i];
        if (inventoryItem?.info.id === itemId) {
          inventoryItem.dispose();
          inventory[i] = null;
          changedIndices.push(i);
          amount--;
        }
      }
      if (amount > 0) {
        log.warn(`Couldn't remove ${amount} of item ${itemId} for player ${player}`);
      }
    }
    if (sortAndSave) {
      this.sortInventory(player, inventory, changedIndices);
      this.sendInventoryIndices(player, changedIndices);
      this.saveInventory(player, inventory);
    }
  }

  public clearItems(player: hz.Player, includeLocked: boolean) {
    let inventory = this.playerInventories.get(player)!
    this.startBatchChange(player);
    inventory.forEach((item, i) => {
      if (item && (!item.isLocked || includeLocked)) {
        this.removeItem(player, i)
      }
    })
    this.endBatchChange(player);
  }

  public getInventoryCount(player: hz.Player): number {
    const inventory = this.playerInventories.get(player)
    return inventory ? inventory.length : 0
  }

  public getItem(player: hz.Player, index: number): BigBox_ItemState | null {
    let inventory = this.playerInventories.get(player)!
    let itemState = inventory[index]

    return itemState
  }

  public getCount(player: hz.Player, predicate: (item: BigBox_ItemState | null) => boolean): number {
    const inventory = this.playerInventories.get(player)!;
    let count = 0;
    inventory.forEach(item => {
      if (predicate(item)) {
        count++;
      }
    })
    return count;
  }

  public getEquippedIndex(player: hz.Player): number {
    let inventory = this.playerInventories.get(player)!
    let equippedIndex = inventory.findIndex(item => item?.equipped)

    return equippedIndex
  }

  public getEquippedItem(player: hz.Player): BigBox_ItemState | undefined {
    let equippedIndex = this.getEquippedIndex(player)

    if (equippedIndex === -1) {
      return undefined
    }

    let inventory = this.playerInventories.get(player)!
    return inventory[equippedIndex]!
  }

  public getPlayerCurrency(player: hz.Player): number {
    if (player && SHOULD_USE_PERSISTENCE) {
      var persistentAmount = PlayerData.getCurrency(player);
      if (persistentAmount != 0) {
        return persistentAmount;
      }
    }

    // Persistent var may not be set, so we need to check the map
    let amount = this.playerCurrencies.get(player)

    if (amount === undefined) {
      return 0
    }

    return amount
  }

  public changePlayerCurrency(player: hz.Player, delta: number) {
    let amt = 0;
    if (player && SHOULD_USE_PERSISTENCE) {
      amt = PlayerData.getCurrency(player);
    }

    if (amt == 0 && this.playerCurrencies.get(player) != 0) {
      log.info("[BigBox Player Inventory] no persistent storage - using local storage");
      amt = this.playerCurrencies.get(player) ?? 0;
    }

    amt += delta
    if (player) {
      PlayerData.setCurrency(player, amt);
      let accumulatedCurrency = PlayerData.getCurrencyEarned(player);
      accumulatedCurrency += delta;
      // Make sure accumulated currency is at least the current amount - caused by debugging values
      accumulatedCurrency = Math.max(accumulatedCurrency, amt);
      log.info(`[BigBox Player Inventory] accumulated currency ${accumulatedCurrency}`);
      if (delta > 0) {
        Analytics()?.sendRewardsEarned({ player, rewardsType: 'currency', rewardsEarned: delta })
        PlayerDataEvents.sendLocalEvent(PlayerDataEvents.currencyAdded, {player: player, currency: delta})
      }
      Analytics()?.sendRewardsEarned({ player, rewardsType: 'currency_total', rewardsEarned: accumulatedCurrency })
      PlayerData.setCurrencyEarned(player, accumulatedCurrency);
      //this.world.leaderboards.setScoreForPlayer(LEADERBOARD_CURRENCYEARNED, player, accumulatedCurrency, false);
    }
    this.playerCurrencies.set(player, amt)
    this.sendNetworkBroadcastEvent(BigBox_Player_Inventory.onCurrencyChanged, { player: player, newAmount: amt })
  }

  static sortPotionsByBoost(a: { id: string }, b: { id: string }): number {
    let potA = HARDCODED_POTION_TUNING.find(p => p.potionId === a.id);
    let potB = HARDCODED_POTION_TUNING.find(p => p.potionId === b.id);
    if (potA && potB) {
      if (potA.minigameBoost > potB.minigameBoost) {
        return -1;
      } else if (potA.minigameBoost < potB.minigameBoost) {
        return 1;
      }
      return 0; // Equal boosts
    }
    return 0;
  }
}
hz.Component.register(BigBox_Player_Inventory);
