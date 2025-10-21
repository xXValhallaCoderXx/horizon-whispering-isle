/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { DialogManager } from 'DialogManager';
import { DigZoneManager } from 'DigZoneManager';
import * as hz from 'horizon/core';
import { Islands } from 'Islands';
import { ItemContainer } from 'ItemContainer';
import { ItemUtils } from 'ItemUtils';
import { CuratorDialog } from 'NPC_Curator';
import { PlayerData } from 'PlayerData';
import { getPlayerInventoryData } from 'PlayerInventoryData';
import { PlayerIslandData } from 'PlayerIslandData';
import { QuestData } from 'QuestData';
import { ShovelProgressionManager } from 'ShovelProgressionManager';

/**
 * Manages the museum curator system that assigns item collection quests to players
 * Handles quest assignment, item selection, and region determination
 */
export class MuseumCuratorManager extends hz.Component<typeof MuseumCuratorManager> {
  static propsDefinition = {
    curatorQuest: {type: hz.PropTypes.Entity},
    minRarity: {type: hz.PropTypes.Number, default: 2},
    maxRarity: {type: hz.PropTypes.Number, default: 4},
    maxShovelLevelBuffer: {type: hz.PropTypes.Number, default: 1},
    refreshTimeMins: {type: hz.PropTypes.Number, default: 1},
    doNotAssign: {type: hz.PropTypes.String, default: 'redx001'},
  };

  private curatorQuest!: QuestData;

  static assignCuratorQuest = new hz.NetworkEvent<{ player: hz.Player, itemId: string, zoneId: string, questId: string }>('assignCuratorQuest');

  start() {
    this.curatorQuest = this.props.curatorQuest!.getComponents<QuestData>()[0];
  }

  /**
   * Assigns a new item collection quest to the player
   * Shows dialog with instructions and broadcasts a network event to track the assignment
   * @param player - The player to assign the quest to
   */
  public assignQuest(player: hz.Player) {
    const itemAndRegion = this.getItemInRegionForAssignment(player).split(',');

    DialogManager.show(this, player, {
      title: 'Museum Curator',
      text: CuratorDialog.getAssignmentResponse(itemAndRegion[0], itemAndRegion[1]),
      option1: 'Alright!',
      buttonShowDelayMs: 700,
    },
    (player) => this.sendNetworkBroadcastEvent(MuseumCuratorManager.assignCuratorQuest, {
      player: player,
      itemId: itemAndRegion[0],
      zoneId: itemAndRegion[1],
      questId: this.curatorQuest.props.id
    }, [this.world.getServerPlayer()]))
  }

  /**
   * Determines an appropriate item and region to assign to the player
   * Selects items based on player progression, island access, and shovel level
   * @param player - The player to find an assignment for
   * @returns A string containing the selected item ID and region ID, separated by a comma
   */
  private getItemInRegionForAssignment(player: hz.Player) : string {
    let maxIsland = Islands.PirateCove // if we can be assigned an item, we have already unlocked the pirate cove

    for (let i = maxIsland; i <= Islands.FairyTaleKingdom; i++) {
      let islandData = PlayerIslandData.getPlayerIslandData(player, i)!
      if (islandData.digZones.length > 0) { // this means we have dug at least once on this island
        maxIsland = i;
      }
      else{
        break
      }
    }

    const currentIsland = PlayerData.getLastIslandVisited(player);
    let randomIsland;
    do {
      randomIsland = Math.floor(Math.random() * (maxIsland - Islands.BeachCamp + 1)) + Islands.BeachCamp;
    } while (randomIsland === currentIsland);

    let highestShovelLevel = 0
    let playerInventory = getPlayerInventoryData(this.world, player)!
    let ownedShovels = playerInventory?.shovels
    ownedShovels.forEach(shovel => {
      const level = ShovelProgressionManager.instance.getShovelLevel(player, shovel) + 1
      highestShovelLevel = Math.max(highestShovelLevel, level)
    })

    highestShovelLevel += this.props.maxShovelLevelBuffer

    let eligibleItems: string[] = []
    const regions = DigZoneManager.instance.getIslandRegions(randomIsland)

    regions.forEach(region => {
      if (region.props.recommendedLevel <= highestShovelLevel){
        eligibleItems = this.filterItems(region.items, eligibleItems, region.props.id, ownedShovels)
      }
    })

    if (eligibleItems.length === 0){
      return 'sleepingbag001,camp' // there shouldn't be a natural case in which we hit this, but this is the case in which there were no items in the region that the player could access
    }

    return eligibleItems[ItemUtils.getRandomIndex(eligibleItems)]
  }

  /**
   * Filters items based on rarity and required shovels
   * Adds eligible items to the filtered list with their associated region
   * @param allItemIds - Array of all item IDs to filter
   * @param filteredItems - Array to store filtered items
   * @param regionId - ID of the region where items can be found
   * @param ownedShovels - Array of shovel IDs owned by the player
   * @returns Updated array of filtered items with region information
   */
  private filterItems(allItemIds: string[], filteredItems: string[], regionId: string, ownedShovels: string[]) : string[]{
    for (let i = 0; i < allItemIds.length; i++) {
      const itemId = allItemIds[i];
      if (this.props.doNotAssign.includes(itemId)) {
        continue;
      }

      const data = ItemContainer.localInstance.getItemDataForId(itemId);
      if (!data) {
        console.error(`[MuseumCurator] Item ${itemId} not found in ItemContainer!`);
        continue;
      }

      if (data.rarity >= this.props.minRarity && data.rarity <= this.props.maxRarity) {
        if (data.requiredShovels.length > 0 && !ownedShovels.includes(data.requiredShovels)){
          continue // requires a shovel we don't own
        }

        filteredItems.push(itemId + ',' + regionId); // encode region
      }
    }

    return filteredItems
  }
}
hz.Component.register(MuseumCuratorManager);
