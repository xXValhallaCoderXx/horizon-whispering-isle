import * as hz from 'horizon/core'
import { World, playerAddedEvent, playerRemovedEvent } from 'World'
import * as Globals from 'Globals'
import * as HUD from 'CUIHUD'
import {  ItemType, ItemStatus, CurrencyDefsType, CurrencyType } from 'StoreTypes'
import * as Store from 'Store'
import * as StoreData from 'StoreData'
import { suffixes } from 'Utils'

/**
 * An array of currency names used for mapping currency types.
 */
const currencyNames = [ 'GREEN_CURRENCY', 'BLUE_CURRENCY', 'PURPLE_CURRENCY', 'RED_CURRENCY']

/**
 * A list of entity IDs for the different stores.
 */
let StoreList: Array<bigint> = []

/**
 * Manages the different stores in the game. It handles player interactions,
 * item purchases, and updating the store UI based on player data.
 */
class StoreManager extends hz.Component<typeof StoreManager> {
  /**
   * Defines the properties for the different store entities, linking them by color/type.
   */
  static propsDefinition = {
    FTUEStore_CUI: { type: hz.PropTypes.Entity },
    GreenStore_CUI: { type: hz.PropTypes.Entity },
    BlueStore_CUI: { type: hz.PropTypes.Entity },
    PurpleStore_CUI: { type: hz.PropTypes.Entity },
    RedStore_CUI: { type: hz.PropTypes.Entity },
  }

  /**
   * Called when the component starts. It initializes the list of stores and
   * connects to various network events.
   */
  start()
  {
    // Initialize the StoreList with the entity IDs of each store.
    StoreList = []
    StoreList.push(this.props.FTUEStore_CUI ? this.props.FTUEStore_CUI.id : BigInt(0))
    StoreList.push(this.props.GreenStore_CUI ? this.props.GreenStore_CUI.id : BigInt(0))
    StoreList.push(this.props.BlueStore_CUI ? this.props.BlueStore_CUI.id : BigInt(0))
    StoreList.push(this.props.PurpleStore_CUI ? this.props.PurpleStore_CUI.id : BigInt(0))
    StoreList.push(this.props.RedStore_CUI ? this.props.RedStore_CUI.id : BigInt(0))

    /**
     * Connects to the playerAddedEvent to set up the stores for a new player.
     */
    this.connectNetworkBroadcastEvent(playerAddedEvent, (data: { player: hz.Player}) => {
      // Defer the setup to avoid race conditions with player initialization.
      this.async.setTimeout(() => {
        const startTime = Date.now()
        // Check if the player has completed the 'First Time User Experience' (FTUE).
        const hasCompletedFTUE = World.world?.getSimPlayer(data.player.name.get())?.hasCompletedFTUE()

        console.log(`StoreManager: setting up stores for player: ${data.player.name.get()} - completed FTUE: ${hasCompletedFTUE}`)
        
        // Setup stores for the player. The FTUE store is only setup if the FTUE is not completed.
        if(!hasCompletedFTUE) setupStore(StoreList[0], StoreData.StoreCurrency, StoreData.InventoryLists[0], data.player)
        setupStore(StoreList[1], StoreData.StoreCurrency, StoreData.InventoryLists[1], data.player)
        setupStore(StoreList[2], StoreData.StoreCurrency, StoreData.InventoryLists[2], data.player)
        setupStore(StoreList[3], StoreData.StoreCurrency, StoreData.InventoryLists[3], data.player)
        setupStore(StoreList[4], StoreData.StoreCurrency, StoreData.InventoryLists[4], data.player)

        // Refresh currency and item prices after setup.
        refreshStoreCurrency(data.player)
        setStorePrices(data.player)

        // Make the stores visible to the player.
        if(!hasCompletedFTUE) Store.SetStoreReady(StoreList[0], true, data.player)
        Store.SetStoreReady(StoreList[1], true, data.player)
        Store.SetStoreReady(StoreList[2], true, data.player)
        Store.SetStoreReady(StoreList[3], true, data.player)
        Store.SetStoreReady(StoreList[4], true, data.player)

        console.log(`StoreManager: setup for player: ${data.player.name.get()} - completed elapsed: ${Date.now() - startTime}ms`)
      }, 100)
    })
    /**
     * Connects to the playerRemovedEvent. (Currently does nothing).
     */
    this.connectNetworkBroadcastEvent(playerRemovedEvent, (data: { player: hz.Player}) => {
      //console.log(`Received player removed event: ${data.player.id}`)
    })
    /**
     * Connects to the playerPurchaseEvent to handle item purchases.
     */
    this.connectNetworkBroadcastEvent(Store.playerPurchaseEvent, (data: {storeId: bigint, itemId: string, status: ItemStatus, price: CurrencyType, player: hz.Player}) => {
      //console.log(`Received player purchase event: ${data.player.id}`)
      PurchaseHandler(data.storeId, data.itemId, data.status, data.price, data.player)
    })
  }
}
// Registers the component with the Horizon engine.
hz.Component.register(StoreManager)

/**
 * Helper function to get the numerical index from a color string.
 * @param value The color string (e.g., 'GREEN_CURRENCY').
 * @returns The corresponding index.
 */
function getIndexFromColor(value: string): number
{
  if(value.startsWith('GREEN')) return 0
  if(value.startsWith('BLUE')) return 1
  if(value.startsWith('PURPLE')) return 2
  if(value.startsWith('RED')) return 3
  return 0
}

/**
 * Sets the store's inventory based on the player's current status and
 * item metadata.
 * @param storeId The ID of the store to update.
 * @param itemList The list of all items in the store.
 * @param player The player to update the store for.
 */
function setStoreInventory(storeId: bigint, itemList: Array<ItemType>, player: hz.Player)
{
  let simPlayer = World.world?.getSimPlayer(player.name.get())
  if (!simPlayer) {
      console.error("StoreManager: No player for inventory display")
      return
  }
  let playerItemList: ItemType[] = []
  for(let i = 0; i < itemList.length; i++)
  {
    // Create a deep copy of the item to avoid modifying the original data.
    let itemCopy: ItemType =
    {
      id: itemList[i].id,
      name: itemList[i].name,
      description: itemList[i].description,
      level: itemList[i].level,
      itemImage: itemList[i].itemImage,
      statusImages: [ 
        itemList[i].statusImages[ItemStatus.Buyable], 
        itemList[i].statusImages[ItemStatus.Upgrade], 
        itemList[i].statusImages[ItemStatus.Owned], 
        itemList[i].statusImages[ItemStatus.Locked], 
        itemList[i].statusImages[ItemStatus.Hidden]
      ],
      price: itemList[i].price,
      startStatus: itemList[i].startStatus,
      status: itemList[i].startStatus,
    }
    const metaData = itemList[i].metaData
    if(metaData)
    {
      // Check item status based on player's owned tools.
      if(metaData.type == 'grab' || metaData.type == 'attach')
      {
        if(simPlayer.getPlayerTool(metaData.toolId) != Globals.NONE)
        {
          itemCopy.status = ItemStatus.Owned
        }
        else if(itemCopy.status == ItemStatus.Locked || itemCopy.status == ItemStatus.Hidden)
        {
          // Check for unlock conditions.
          for(let j = 0; j < metaData.unlockCondition.length; j++)
          {
            if(simPlayer.getPlayerTool(metaData.unlockCondition[j]) != Globals.NONE)
            {
              itemCopy.status = ItemStatus.Buyable
            }
          }
        }
      }
      else if(metaData.type == 'stats')
      {
        // Update item level based on player's stats.
        let stats = simPlayer.getPlayerStats()
        const index = getIndexFromColor(metaData.toolId)
        itemCopy.level = stats[index]
      }
      else if(metaData.type == 'upgrade')
      {
        // Check for upgrade unlock conditions.
        for(let j = 0; j < metaData.unlockCondition.length; j++)
        {
          if(simPlayer.getPlayerTool(metaData.unlockCondition[j]) != Globals.NONE)
          {
            itemCopy.status = ItemStatus.Upgrade
          }
        }
        // Update item level based on player's tool level.
        const level = simPlayer.getPlayerTool(metaData.toolId)
        if(level != Globals.NONE)
        {
          itemCopy.level = level
        }
      }
    }
    playerItemList.push(itemCopy)
  }
  // Send the updated item list to the store's UI component.
  Store.SetStoreInventory(storeId, playerItemList, player)
}

/**
 * Initializes a store for a player by setting up its currency, inventory,
 * and selecting the first visible item.
 * @param storeId The ID of the store.
 * @param currency The currency definitions.
 * @param itemList The list of items for this store.
 * @param player The player to setup for.
 */
function setupStore(storeId: bigint, currency: CurrencyDefsType, itemList: Array<ItemType>, player: hz.Player)
{
  if(storeId != BigInt(0))
  {
    Store.SetStoreCurrency(storeId, currency, player)
    setStoreInventory(storeId, itemList, player)
    Store.SetFirstVisibleActive(storeId, player)
  }
}

/**
 * Updates the price of a specific item in a store.
 * @param storeId The ID of the store.
 * @param itemId The ID of the item.
 * @param price The new price.
 * @param player The player to apply the change to.
 */
function updateStorePrice(storeId: bigint, itemId: string, price: CurrencyType, player: hz.Player)
{
  Store.SetItemPrice(storeId, itemId, price, player)
}

/**
 * Sets the dynamic prices for all items in the stores based on
 * player's stats and tool levels.
 * @param player The player to update prices for.
 */
function setStorePrices(player: hz.Player)
{
  let simPlayer = World.world?.getSimPlayer(player.name.get())
  if (!simPlayer) {
      console.error("StoreManager: No player for inventory display")
      return
  }
  
  const D = 5

  for(let i = 0; i < StoreData.InventoryLists.length; i++)
  {
    for(let j = 0; j < StoreData.InventoryLists[i].length; j++)
    {
      const metaData = StoreData.InventoryLists[i][j].metaData
      if(metaData)
      {
        if(metaData.type == 'upgrade')
        {
          let price: CurrencyType = [ 0, 0, 0, 0]
          let index = getIndexFromColor(metaData.toolId)
          // Price calculation for upgrades.
          const level = Math.max(1, simPlayer.getPlayerTool(metaData.toolId))
          const basePrice: number = D * 5 * level * level
          const adjustedPrice = priceAdjuster(basePrice)
          price[index] = adjustedPrice

          updateStorePrice(StoreList[i], StoreData.InventoryLists[i][j].id, price, player)
        }
        else if(metaData.type == 'stats')
        {
          const stats = simPlayer.getPlayerStats()
          let price: CurrencyType = [ 0, 0, 0, 0]
          let index = getIndexFromColor(metaData.toolId)
          // Price calculation for stat upgrades.
          const basePrice: number = D * ((stats[index] - 10) * (stats[index] - 10) + 4)
          const adjustedPrice = priceAdjuster(basePrice)
          price[index] = adjustedPrice
          updateStorePrice(StoreList[i], StoreData.InventoryLists[i][j].id, price, player)
        }
      }
    }
  }
}

/**
 * keeps the first 3 digits intact and 0's out the rest to match the fact that the display only handles 3 digits.
 * @param basePrice The inital price of the item
 * @returns a number with the 3 highest power digits remaining and all lower value digits zero'd out
 */
function priceAdjuster(basePrice: number): number {
  if (basePrice === 0) {
    return 0;
  }
  // Handle negative numbers by taking the absolute value for calculation
  const absNum = Math.abs(basePrice);
  // Calculate the power of 10 to shift the decimal point
  const powerOfTen = Math.floor(Math.log10(absNum)) - 2;
  // Round the number to the nearest integer after shifting
  const roundedNum = Math.round(absNum / Math.pow(10, powerOfTen));
  // Shift the decimal point back and apply the original sign
  return (roundedNum * Math.pow(10, powerOfTen)) * Math.sign(basePrice);
}


/**
 * Checks and updates the status of items that have unlock conditions.
 * @param itemName The name of the item that was just acquired.
 * @param player The player to update for.
 */
function checkItemUnlockConditions(itemName: string, player: hz.Player)
{
  for(let i = 0; i < StoreData.InventoryLists.length; i++)
  {
    for(let j = 0; j < StoreData.InventoryLists[i].length; j++)
    {
      const metaData = StoreData.InventoryLists[i][j].metaData
      if(metaData)
      {
        for(let k = 0; k < metaData.unlockCondition.length; k++)
        {
          if(itemName == metaData.unlockCondition[k])
          {
            if(metaData.type == 'grab' || metaData.type == 'attach')
              Store.SetItemStatus(StoreList[i], StoreData.InventoryLists[i][j].id, ItemStatus.Buyable, player)
            else
              Store.SetItemStatus(StoreList[i], StoreData.InventoryLists[i][j].id, ItemStatus.Upgrade, player)
          }
        }
      }
    }
  }
}

/**
 * Checks all item unlock conditions for a player and updates their status
 * in the store.
 * @param player The player to update for.
 */
function checkAllUnlockConditions(player: hz.Player)
{
  let simPlayer = World.world?.getSimPlayer(player.name.get())
  if (!simPlayer) {
      console.error("StoreManager: No player for inventory display")
      return
  }

  for(let i = 0; i < StoreData.InventoryLists.length; i++)
  {
    for(let j = 0; j < StoreData.InventoryLists[i].length; j++)
    {
      const metaData = StoreData.InventoryLists[i][j].metaData
      if(metaData)
      {
        for(let k = 0; k < metaData.unlockCondition.length;k ++)
        {
          if(simPlayer.getPlayerTool(metaData.unlockCondition[k]) != Globals.NONE)
          {
            if(metaData.type == 'grab' || metaData.type == 'attach')
              Store.SetItemStatus(StoreList[i], StoreData.InventoryLists[i][j].id, ItemStatus.Buyable, player)
            else
              Store.SetItemStatus(StoreList[i], StoreData.InventoryLists[i][j].id, ItemStatus.Upgrade, player)
          }
          else
          {
            Store.SetItemStatus(StoreList[i], StoreData.InventoryLists[i][j].id, StoreData.InventoryLists[i][j].status, player)
          }
        }
      }
    }
  }
}

/**
 * A comprehensive function to refresh all aspects of the store for a player.
 * @param player The player to refresh for.
 */
export function refreshStore(player: hz.Player)
{
  refreshStoreCurrency(player)
  setPlayerInventory(player)
  setStorePrices(player)
  checkAllUnlockConditions(player)
}

/**
 * Debug helper function to reset a player's store data to default.
 * @param player The player to reset.
 */
export function resetStorePlayerData(player: hz.Player)
{
  for(let i = 0; i < StoreData.InventoryLists.length; i++)
  {
    Store.ResetStoreStatus(StoreList[i], player)
    Store.SetFirstVisibleActive(StoreList[i], player)
  }

  refreshStore(player)
}

/**
 * Sets the inventory status of items based on the player's owned tools and stats.
 * @param player The player to update for.
 */
function setPlayerInventory(player: hz.Player)
{
  let simPlayer = World.world?.getSimPlayer(player.name.get())
  if (!simPlayer) {
      console.warn("StoreManager: No player for inventory display")
      return
  }
  
  for(let i = 0; i < StoreData.InventoryLists.length; i++)
  {
    for(let j = 0; j < StoreData.InventoryLists[i].length; j++)
    {
      const metaData = StoreData.InventoryLists[i][j].metaData
      if(metaData)
      {
        // For 'grab' and 'attach' tools, set the status to 'Owned' if the player has it.
        if(metaData.type == 'grab' || metaData.type == 'attach')
        {
          if(simPlayer.getPlayerTool(metaData.toolId) != Globals.NONE)
          {
            Store.SetItemStatus(StoreList[i], StoreData.InventoryLists[i][j].id, ItemStatus.Owned, player)
          }
        }
        // For 'stats' items, set the item level to the player's stat level.
        else if(metaData.type == 'stats')
        {
          setStatsLevel(StoreData.InventoryLists[i][j].id, metaData.toolId, player)
        }
        // For 'upgrade' items, set the item level to the player's tool level.
        else if(metaData.type == 'upgrade')
        {
          const level = simPlayer.getPlayerTool(metaData.toolId)
          console.warn(`setPlayerInventory: ${StoreData.InventoryLists[i][j].id}:${metaData.toolId} - level: ${level}`)
          if(level != Globals.NONE)
          {
            setItemLevel(StoreData.InventoryLists[i][j].id, level, player)
          }
        }
      }
    }
  }
}

/**
 * Sets the status for a player's tool item across all stores.
 * @param toolId The ID of the tool.
 * @param newStatus The new status to set.
 * @param player The player to update.
 */
function setPlayerToolStatus(toolId: string, newStatus: ItemStatus, player: hz.Player)
{
  let simPlayer = World.world?.getSimPlayer(player.name.get())
  if (!simPlayer) {
      console.error("StoreManager: No player for inventory display")
      return
  }
  
  for(let i = 0; i < StoreData.InventoryLists.length; i++)
  {
    for(let j = 0; j < StoreData.InventoryLists[i].length; j++)
    {
      const metaData = StoreData.InventoryLists[i][j].metaData
      if(metaData)
      {
        if(metaData.toolId == toolId && (metaData.type == 'grab' || metaData.type == 'attach'))
        {
          Store.SetItemStatus(StoreList[i], StoreData.InventoryLists[i][j].id, newStatus, player)
        }
      }
    }
  }
}

/**
 * Refreshes the currency display for a player across all stores.
 * @param player The player to update.
 */
export function refreshStoreCurrency(player: hz.Player)
{
  let simPlayer = World.world?.getSimPlayer(player.name.get())
  if (!simPlayer) {
      console.error("StoreManager: No player for inventory display")
      return
  }

  let currency: CurrencyType = [ 0, 0, 0, 0]

  // Get the player's current currency amounts.
  for(let i = 0; i < currencyNames.length && i < currency.length; i++)
  {
    currency[i] = simPlayer.getPlayerResource(currencyNames[i])
  }

  // Update Currency for all stores
  for(let i = 0; i < StoreList.length; i++)
  {
    Store.SetPlayerCurrency(StoreList[i], currency, player)
  }
}

/**
 * Finds an item by its ID in the store's inventory data.
 * @param itemId The ID of the item to find.
 * @returns The item object, or undefined if not found.
 */
function findItem(itemId: string): ItemType | undefined
{
  for(let i = 0; i < StoreData.InventoryLists.length; i++)
  {
    for(let j = 0; j < StoreData.InventoryLists[i].length; j++)
    {
      if(StoreData.InventoryLists[i][j].id == itemId)
      {
        return StoreData.InventoryLists[i][j]
      }
    }
  }
  return undefined
}

/**
 * Updates the level of a specific item across all stores.
 * @param itemId The ID of the item.
 * @param level The new level to set.
 * @param player The player to update.
 */
function setItemLevel(itemId: string, level: number, player: hz.Player)
{
  for(let i = 0; i < StoreList.length; i++)
  {
    Store.SetItemLevel(StoreList[i], itemId, level, player)
  }
}

/**
 * Checks all upgrade items for a player and updates their level in the store UI.
 * @param toolId The ID of the tool to check for.
 * @param player The player to update.
 */
function checkAllUpgrades(toolId: string, player: hz.Player)
{
  let simPlayer = World.world?.getSimPlayer(player.name.get())
  if (!simPlayer) {
      console.error("StoreManager: No player for inventory display")
      return
  }

  for(let i = 0; i < StoreData.InventoryLists.length; i++)
  {
    for(let j = 0; j < StoreData.InventoryLists[i].length; j++)
    {
      const metaData = StoreData.InventoryLists[i][j].metaData
      if(metaData)
      {
        if(metaData.toolId == toolId && metaData.type == 'upgrade')
        {
          let level = simPlayer.getPlayerTool(toolId)
          Store.SetItemLevel(StoreList[i], StoreData.InventoryLists[i][j].id, level, player)
        }
      }
    }
  }
}

/**
 * Updates the level of a stats item based on the player's stat level.
 * @param itemId The ID of the stats item.
 * @param toolId The ID of the stats tool.
 * @param player The player to update.
 */
function setStatsLevel(itemId: string, toolId: string, player: hz.Player)
{
  let simPlayer = World.world?.getSimPlayer(player.name.get())
  if (!simPlayer) {
      console.error("StoreManager: No player for inventory display")
      return
  }
  let stats = simPlayer.getPlayerStats()
  let index = getIndexFromColor(toolId)
  for(let i = 0; i < StoreList.length; i++)
  {
    Store.SetItemLevel(StoreList[i], itemId, stats[index], player)
  }
}

/**
 * Converts a currency array to a single resource object.
 * @param cost The currency array.
 * @returns An object with the resource name and amount.
 */
function CurrencyToResource(cost: number[]): { name: string, amount: number}
{
  for(let i = 0; i < cost.length && i < currencyNames.length; i++)
  {
    if(cost[i])
    {
      return { name: currencyNames[i], amount: cost[i] }
    }
  }
  return { name: 'FREE', amount: 0}
}

/**
 * Converts a resource name and amount into a currency array.
 * @param name The name of the resource.
 * @param amount The amount of the resource.
 * @returns The currency array.
 */
function ResourceToCurrency(name: string, amount: number): Array<number>
{
  let currency = []
  for(let i = 0; i < currencyNames.length; i++)
  {
    currency.push(0)
    if(currencyNames[i] == name)
    {
      currency[i] = amount
    }
  }
  return currency
}

/**
 * The main purchase handler function. It processes a purchase request from a player.
 * @param storeId The ID of the store where the purchase was made.
 * @param itemId The ID of the item being purchased.
 * @param status The status of the item when the purchase was initiated.
 * @param price The price of the item.
 * @param player The player who made the purchase.
 */
function PurchaseHandler(storeId: bigint, itemId: string, status: ItemStatus, price: CurrencyType, player: hz.Player)
{
  let simPlayer = World.world?.getSimPlayer(player.name.get())
  if (!simPlayer) {
      console.error("StoreManager: No player for inventory display")
      return
  }

  const item = findItem(itemId)
  if(!item)
  {
      console.log("StoreManager: error: Purchased item NOT found in InventoryList: " + itemId)
      return
  }
  
  // Reject the purchase if the item is not buyable or upgradeable.
  if(status != ItemStatus.Buyable && status != ItemStatus.Upgrade)
  {
    World.world?.playSoundAt("SFX_UI_Reject_UI", player.head.position.get())
    return
  }
  
  const itemCost = CurrencyToResource(price)
  const metaData = item.metaData
  if(metaData)
  {
    // If the item is a tool, check if the player already owns it.
    if(metaData.type == 'grab' || metaData.type == 'attach')
    {
      if(simPlayer.getPlayerTool(metaData.toolId) != Globals.NONE)
      {
        World.world?.playSoundAt("SFX_UI_Reject_UI", player.head.position.get())
        return
      }
    }
    // Check if the player has enough currency to make the purchase.
    if (simPlayer.getPlayerResource(itemCost.name) >= itemCost.amount) {
        simPlayer.subtractPlayerResource(itemCost.name, itemCost.amount)
        World.world?.playSoundAt("SFX_CashRegister_Open", player.head.position.get())
        HUD.refreshCurrency(player)
    }
    else {
        World.world?.playSoundAt("SFX_UI_Reject_UI", player.head.position.get())
        return
    }

    // Update the store's displayed info after a successful purchase.
    refreshStoreCurrency(player)

    switch(metaData.type)
    {
      case 'grab':
        // Equip the new grabbable tool.
        simPlayer.setPlayerTool(metaData.toolId, 1)

        if (!simPlayer.toolMap.has(metaData.toolId)) {
            console.error(`No ${item.id} found in ToolMap for player ${player.name}`)
        }
        simPlayer.equipGrabbable(metaData.toolId)
        simPlayer.setCompletedFTUE(true)
        simPlayer.player.setAchievementComplete("Getting Started", true)

        // Update the item status in the store UI.
        setPlayerToolStatus(metaData.toolId, ItemStatus.Owned, player)
        checkAllUpgrades(metaData.toolId, player)
        checkItemUnlockConditions(metaData.toolId, player)
        break
      case 'attach':
        // Equip the new attachable tool.
        simPlayer.setPlayerTool(metaData.toolId, 1)

        if (!simPlayer.toolMap.has(metaData.toolId)) {
            console.error(`No ${metaData.toolId} found in ToolMap for player ${player.name}`)
        }
        simPlayer.equipAttachable(metaData.toolId)
        simPlayer.player.setAchievementComplete("Extra Space", true)

        // Update the item status and unlock conditions.
        setPlayerToolStatus(metaData.toolId, ItemStatus.Owned, player)
        checkItemUnlockConditions(metaData.toolId, player)
        HUD.refreshBackpack(player)
        break
      case 'upgrade':
        // Upgrade the player's tool level.
        const level = simPlayer.getPlayerTool(metaData.toolId) + 1
        simPlayer.setPlayerTool(metaData.toolId, level)

        if (!simPlayer.toolMap.has(metaData.toolId)) {
            console.error(`No ${metaData.toolId} found in ToolMap for player ${player.name}`)
        }

        // Update the item level and prices in the store.
        setItemLevel(itemId, level, player)
        simPlayer.player.setAchievementComplete("Tool Upgrade", true)
        setStorePrices(player)
        break
      case 'stats':
        // Upgrade the player's stats.
        const oldStats = simPlayer.getPlayerStats()
        const index = getIndexFromColor(metaData.toolId)
        let newStats = [0, 0, 0, 0]
        newStats[index] = 1
        if (newStats.length != oldStats.length) {
            console.error("Shop: Size mismatch for upgrade stats function")
            return
        }
        for (var i = 0; i < oldStats.length; i++) {
            newStats[i] += oldStats[i]
        }
        console.log(`Setting player stats to ${newStats} `)
        simPlayer.setPlayerStats(newStats)

        // Update the item level and prices in the store.
        setStatsLevel(itemId, metaData.toolId, player)
        setStorePrices(player)
        break
    }
  }
}