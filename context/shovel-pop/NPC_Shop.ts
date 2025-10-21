/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_Player_Inventory } from 'BigBox_Player_Inventory';
import { BigBox_ToastEvents } from 'BigBox_ToastManager';
import * as hz from 'horizon/core';
import { getIslandShopNPCId, Islands } from 'Islands';
import { ItemContainer } from 'ItemContainer';
import { ItemUtils } from 'ItemUtils';
import { NavigationTarget } from 'NavigationArrow';
import { NPC } from 'NPC';
import { PlayerEffects } from 'PlayerEffectsController';
import { QuestEvents, QuestManager } from 'QuestManager';
import { Shovel } from 'Shovel';
import { ShovelProgressionManager } from 'ShovelProgressionManager';
import { RetrievalSubquestData, ShovelSubquestData, SubquestData } from 'SubquestData';
import { Analytics } from 'TurboAnalytics';
import { UI_Utils } from 'UI_Utils';

export class NPC_Shop extends hz.Component<typeof NPC_Shop> {
  static propsDefinition = {
    npc: { type: hz.PropTypes.Entity },
    sellHeldItemDialog: { type: hz.PropTypes.Entity },
    sellAllItemsDialog: { type: hz.PropTypes.Entity },
    playerInventoryManager: { type: hz.PropTypes.Entity },
    sellSubquest: { type: hz.PropTypes.Entity },
    sellSubquest2: { type: hz.PropTypes.Entity },
    nudgeSubquest: { type: hz.PropTypes.Entity },
  };

  private inventoryManager!: BigBox_Player_Inventory

  private sellSubquests: SubquestData<typeof SubquestData>[] = []

  start() {
    this.connectLocalEvent(this.props.npc!, NPC.LocalSendDialogScript, (payload) => {
      this.onDialogChosen(payload.player, payload.scriptId)
    })

    this.inventoryManager = this.props.playerInventoryManager!.getComponents<BigBox_Player_Inventory>()[0]
    let sellSubquest = this.props.sellSubquest?.getComponents<SubquestData<typeof SubquestData>>()[0]
    if (sellSubquest) {
      this.sellSubquests.push(sellSubquest);
    }

    let sellSubquest2 = this.props.sellSubquest2?.getComponents<SubquestData<typeof SubquestData>>()[0]
    if (sellSubquest2) {
      this.sellSubquests.push(sellSubquest2);
    }

    let nudgeSubquest = this.props.nudgeSubquest?.getComponents<SubquestData<typeof SubquestData>>()[0]
    if (nudgeSubquest) {
      this.sellSubquests.push(nudgeSubquest);
    }

    if (this.sellSubquests.length > 0) {
      if (QuestManager.IsReady()) {
        this.setupNavigationTargets(this.sellSubquests);
      } else {
        const sub = this.connectLocalBroadcastEvent(QuestEvents.questManagerInitialized, () => {
          this.setupNavigationTargets(this.sellSubquests);
          sub.disconnect();
        });
      }
    }
  }

  onDialogChosen(player: hz.Player, scriptId: hz.Entity){
    if (scriptId === this.props.sellAllItemsDialog!){
      const soldAny = NPC_Shop.sellItems(player, this.inventoryManager, this)
      if (soldAny){
        for (const subquest of this.sellSubquests) {
          this.sendLocalBroadcastEvent(QuestEvents.requestFinishSubquestForPlayer, {player: player, questId: subquest.props.id});
        }

        Analytics()?.sendTaskEnd({ player, taskKey: 'sell_rufus'});
      }
    }
  }

  static sellItems(player: hz.Player, inventoryManager: BigBox_Player_Inventory, component: hz.Component, mod: number = 1){
    let soldAny = false
    let totalXp = 0
    let proceedsTotal = 0

    inventoryManager.startBatchChange(player);
    const idsOfInterest = NPC_Shop.getIdsOfInterest(player)
    const target = [player]

    for (let i = 0, ii = inventoryManager.getInventorySize(player); i < ii; i++){
      let item = inventoryManager.getItem(player, i)
      if (item && !item.isLocked && !(idsOfInterest.has(item.info.id) || idsOfInterest.has(item.info.category))){
        inventoryManager.removeItem(player, i)
        const value = Math.ceil(ItemUtils.getItemValue(item) * mod)
        proceedsTotal += value

        const mutation = ItemContainer.localInstance.getMutationDataForId(item.modifiers.mutation)
        const itemName = mutation ? `${mutation.name} ${item.info.name}` : item.info.name

        component.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {player: player, text: `Sold ${itemName} for $${UI_Utils.simplifyNumberToText(value)}`}, target)
        Analytics()?.sendTaskEnd({ player, taskKey: 'sell_item', taskType: `${item.info.id},${value}`});
        totalXp += ItemUtils.RARITY_XP[item.info.rarity]
        soldAny = true
      }
    }

    inventoryManager.endBatchChange(player);

    // Auto-equip shovel
    component.sendNetworkBroadcastEvent(Shovel.equip, player, target);

    if (soldAny){
      component.sendNetworkBroadcastEvent(PlayerEffects.sellEffect, {}, target);
      inventoryManager.changePlayerCurrency(player, proceedsTotal)
    }

    return soldAny
  }

  /**
   * Retrieves a set of item IDs and category IDs that are of interest for the given player so that they can't be sold.
   * This is determined based on the player's active subquests.
   *
   * @param player - The player for whom the IDs of interest are being retrieved.
   * @returns A set of strings representing item IDs and category IDs that are required for the player's subquests.
   */
  static getIdsOfInterest(player: hz.Player): Set<string> {
    const subquestDatas = QuestManager.instance.getAllSubquestDatasForPlayer(player);
    if (subquestDatas.length === 0){
      return new Set<string>()
    }

    const ids = new Set<string>();

    for (const subquestData of subquestDatas) {
      if (subquestData instanceof RetrievalSubquestData) {
        const requiredItemIds = subquestData.getAllRequiredItemIds();
        for (const itemId of requiredItemIds) {
          ids.add(itemId);
        }

        const requiredItemCategoryIds = subquestData.getAllRequiredItemCategories();
        for (const itemCategoryId of requiredItemCategoryIds) {
          ids.add(itemCategoryId);
        }
      }
      else if (subquestData instanceof ShovelSubquestData) {
        const shovel = ShovelProgressionManager.instance.getShovelDataForId(subquestData.props.shovelId)!
        const requiredItemIds = [
          shovel.itemCost1ID,
          shovel.itemCost2ID,
          shovel.itemCost3ID,
        ]

        for (let i = 0; i < requiredItemIds.length && requiredItemIds[i].length > 0; i++) {
          ids.add(requiredItemIds[i]);
        }
      }
    }

    return ids
  }

  private setupNavigationTargets(subquests: SubquestData<typeof SubquestData>[] = []){
    let targets: NavigationTarget[] = []
    for (let i = Islands.BeachCamp; i <= Islands.FairyTaleKingdom; i++) {
      const id = getIslandShopNPCId(i)
      if (id){
        const npc = NPC.get(id)
        if (npc){
          targets.push({island: i, position: npc.entity.position.get() })
        }
      }
    }

    for (const subquest of subquests) {
      if (subquest.navigationTargets.length === 0){
        subquest.navigationTargets = targets;
      }
    }
  }
}
hz.Component.register(NPC_Shop);
