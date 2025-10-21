/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { DigZoneManager } from 'DigZoneManager';
import { Events } from 'Events';
import * as hz from 'horizon/core';
import { getIslandFromID } from 'Islands';
import { ItemContainer } from 'ItemContainer';
import { ItemData } from 'ItemData';
import { ItemUtils } from 'ItemUtils';
import { Logger } from 'Logger';
import { PlayerIslandData } from 'PlayerIslandData';
import { PlayerQuests, QuestEvents, QuestManager } from 'QuestManager';
import { InventorySubquestData } from 'SubquestData';

const log = new Logger("LootPityManager");

export type ZonePity = { // id of the zone and the amount of pity digs we have for the next item in sequence
  id: string,
  digCount: number,
}

export class LootPityManager extends hz.Component<typeof LootPityManager> {
  static propsDefinition = {
      pityDigs: { type: hz.PropTypes.Number, default: 20 },
      maxWeight: { type: hz.PropTypes.Number, default: 1 }
    };

  private playerQuestObjective = new Map<hz.Player, InventorySubquestData>() // maps player to the id our player is searching for
  private playerPityWeight = new Map<hz.Player, number>()
  private playerQuestsCache = new Map<hz.Player, PlayerQuests>()

  start() {
    this.connectNetworkBroadcastEvent(QuestEvents.playerQuestsChangedForPlayer, (payload) => {
      let subquestDatas = QuestManager.instance.getAllSubquestDatasForPlayer(payload.player);
      let activeQuests = payload.playerQuests.activeQuests;
      let prevQuest = this.playerQuestObjective.get(payload.player);
      let currentQuest = activeQuests[payload.playerQuests.currentQuestIndex];
      // TODO [Multiple]: Should we check all quests or only the current one?
      let subquestStates = currentQuest.subquestStates;
      for (let i = 0; i < subquestDatas.length; i++) {
        let subquestData = subquestDatas[i];
        if (subquestData instanceof InventorySubquestData) {
          let subquestState = subquestStates[i]; // Maps 1:1 with subquestDatas (unless state does not have a data)
          // Currently only care about the first inventory subquest that is not completed
          if (subquestState && subquestState.count < subquestState.countRequirement)
          {
            // Check if player just incremented the subquest count
            let increasedSubquestCount = false;
            let prevPlayerQuests = this.playerQuestsCache.get(payload.player);
            if (prevPlayerQuests !== undefined) {
              let prevActiveQuest = prevPlayerQuests.activeQuests.find((quest) => { return quest.questId === currentQuest.questId });
              let prevSubquestState = prevActiveQuest?.subquestStates.find((subquest) => { return subquest.subquestId === subquestState.subquestId });
              increasedSubquestCount = prevSubquestState !== undefined && prevSubquestState.count < subquestState.count;
            }

            log.info('subquestData: ' + subquestData + ' prevQuest: ' + prevQuest + ' subquestData !== prevQuest ' + (subquestData !== prevQuest) + ' increasedSubquestCount: ' + increasedSubquestCount)

            // New quest or changed quest
            if (subquestData !== prevQuest || increasedSubquestCount) {
              this.playerQuestObjective.set(payload.player, subquestData);
              this.playerPityWeight.set(payload.player, 0);
              // TODO [Multiple]: shouldn't reset pity count for other items and also when swapping quests
            }

            // TODO: currently only one item is supported
            break;
          }
        }
      }

      this.playerQuestsCache.set(payload.player, payload.playerQuests);
    })

    this.connectNetworkBroadcastEvent(QuestEvents.finishQuestForPlayer, (payload) =>{
      this.playerQuestObjective.delete(payload.player)
      this.playerPityWeight.delete(payload.player)
    })

    this.connectNetworkBroadcastEvent(Events.playerDigComplete, (payload) =>{
      if (!payload.isSuccess){
        let currentZone = DigZoneManager.instance.getHighestPriorityZone(payload.player)
        if (currentZone){
          const island = getIslandFromID(currentZone.props.island)!
          let count = PlayerIslandData.decrementDigZonePityCount(payload.player, currentZone.props.id, island)
        }
        return
      }

      const subquest = this.playerQuestObjective.get(payload.player)
      if (!subquest){
        return
      }
      const objective = LootPityManager.getObjective(subquest)

      if (!objective){
        return // not looking for anything rn
      }

      let pity = this.playerPityWeight.get(payload.player)!
      if (subquest.props.pityDigs === 0){
        pity = 1
      }
      else{
        pity += 1 / subquest.props.pityDigs
      }

      this.playerPityWeight.set(payload.player, pity)
    })
  }

  public getPlayerPityWeight(player: hz.Player, objectiveId: string) : number{
    const quest = this.playerQuestObjective.get(player)
    if (!quest){
      return 0
    }

    const objective = LootPityManager.getObjective(quest)
    if (!objective){
      return 0 // player doesnt have a quest objective item
    }

    if (objective !== objectiveId){
      return 0 // not looking for this
    }

    log.info('pity weight: ' + this.playerPityWeight.get(player) + ' for ' + objectiveId);

    const pityWeight = this.playerPityWeight.get(player)! // should not be undefined
    return LootPityManager.interpolate(0, this.props.maxWeight, pityWeight)
  }

  public isMaxPity(player: hz.Player) : boolean{
    const weight = this.playerPityWeight.get(player)
    if (weight){
      return weight >= 1
    }

    return false
  }

  public getPlayerObjective(player: hz.Player) : string {
    const quest = this.playerQuestObjective.get(player)
    if (quest){
      const objective = LootPityManager.getObjective(quest)
      return objective ? objective : ''
    }

    return ''
  }

  public getItemFromRegionPity(player: hz.Player, rolledItem: ItemData, qualifiedDropTable: ItemData[]) : ItemData | undefined{
    let currentZone = DigZoneManager.instance.getHighestPriorityZone(player)
    if (!currentZone){
      log.info('No current zone')
      return undefined // not in a zone
    }
    const island = getIslandFromID(currentZone.props.island);
    if (!island){
      log.info('No island')
      return undefined; // no island
    }
    let undiscoveredZoneItems: ItemData[] = []; // array of zone items we have not discovered yet
    for (let zoneItem of currentZone.getCurrentZoneItems(player)) {
      const itemId = zoneItem.itemId;
      const itemData = ItemContainer.localInstance.getItemDataForId(itemId)
      if (itemData
        && qualifiedDropTable.includes(itemData)
        && !zoneItem.isFound) { // todo need to account for resetting zones
        if (itemId === rolledItem.id){
          // found a "desired" item, so reset pity and return that item
          PlayerIslandData.resetDigZonePityCount(player, currentZone.props.id, island)
          log.info('Found desired item organically ' + itemData.name);
          return rolledItem
        }

        undiscoveredZoneItems.push(itemData);
      }
    }

    if (undiscoveredZoneItems.length === 0){
      // no items to discover
      return rolledItem
    }

    let zonePityCount = PlayerIslandData.incrementDigZonePityCount(player, currentZone.props.id, island)
    log.info('Zone Pity Count: '+ zonePityCount)

    const pityItems = undiscoveredZoneItems.filter(x => zonePityCount >= x.regionPityDigs)
    if (pityItems.length === 0){
      return rolledItem // no pity, return og item
    }

    const pityItem = pityItems[ItemUtils.getRandomIndex(pityItems)]
    log.info('Pity item: ' + pityItem.name);
    PlayerIslandData.resetDigZonePityCount(player, currentZone.props.id, island)
    return pityItem
  }

  static getObjective(inventorySubquestData: InventorySubquestData) : string | undefined{
    let objectiveId = inventorySubquestData.props.itemCategory;

    if (objectiveId.length === 0){
      objectiveId = inventorySubquestData.props.itemId;
    }

    if (objectiveId.length === 0){
      return undefined
    }

    return objectiveId
  }

  static interpolate(min: number, max: number, t: number): number{
    return min + (max - min) * Math.pow(t, 5)
  }
}
hz.Component.register(LootPityManager);
