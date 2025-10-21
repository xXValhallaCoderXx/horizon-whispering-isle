/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Events } from 'Events';
import { getPlayerVariableSafe, setPlayerVariableSafe } from 'GameUtils';
import { IslandEvents } from 'IslandTeleportManager';
import { Islands } from 'Islands';
import { ItemContainer } from 'ItemContainer';
import { PlayerDataEvents } from 'PlayerDataEvents';
import { QuestEvents } from 'QuestManager';
import { Shovel } from 'Shovel';
import * as hz from 'horizon/core';

class AchievementManager extends hz.Component<typeof AchievementManager> {
  static propsDefinition = {};

  readonly variableGroup: string = "permanentData:"

  diggingMutation: Map<hz.Player, boolean> = new Map()

  start() {
    /*
    Reborn: Complete all regions and travel through the end portal.
  */

    this.connectNetworkBroadcastEvent(QuestEvents.finishQuestForPlayer, (data) => {
      if (data.questId === 'chet_return') {
        this.incrementAchievement(data.player, 'hungryHelper', 1, 1)
      }
      else if (data.questId === 'talk_to_alen') {
        this.incrementAchievement(data.player, 'aliens', 1, 1)
      }
    })

    this.connectLocalBroadcastEvent(Events.shovelUpgradeEvent, (data) => {
      let shovelData = Shovel.getData(data.shovelId, data.level)
      if (shovelData && shovelData.baseShovel.length > 0 && shovelData.evolution.length === 0) {
        this.incrementAchievement(data.player, 'fullyEvolved', 1, 1)
      }
    })

    this.connectNetworkBroadcastEvent(Events.playerDigComplete, (data) => {
      if (!data.isSuccess) {
        return
      }
      let item = ItemContainer.localInstance.getItemDataForId(data.itemId)
      if (!item) {
        return
      }
      if (item.location.toLowerCase() === 'lte') {
        this.incrementAchievement(data.player, 'eventParticipant', 1, 10)
      }
      if (this.diggingMutation.has(data.player) && this.diggingMutation.get(data.player) === true) {
        this.incrementAchievement(data.player, 'mutant', 1, 1)
      }
      if (item.rarity === 5) {
        this.incrementAchievement(data.player, 'mythic', 1, 1)
      }
    })

    this.connectNetworkBroadcastEvent(Events.itemSelected, (data) => {
      this.diggingMutation.set(data.player, data.mutation.length > 0)
    })

    this.connectNetworkBroadcastEvent(IslandEvents.playerTeleportedToIsland, (data) => {
      if (data.island === Islands.PirateCove) {
        this.incrementAchievement(data.player, 'islandHopper', 1, 1)
      }
    })

    this.connectNetworkBroadcastEvent(Events.playerDigComplete, (data) => {
      if (data.isSuccess) {
        this.incrementAchievement(data.player, 'itemsDug', 1, -1)
      }
    })

    this.connectLocalBroadcastEvent(Events.potionUsedEvent, (data) => {
      this.incrementAchievement(data.player, 'potionsUsed', 1, -1)
    })

    this.connectLocalBroadcastEvent(PlayerDataEvents.currencyAdded, (data) => {
      if (data.currency > 0) {
        this.incrementAchievement(data.player, "moneyEarned", data.currency, -1)
      }
    })

    this.connectLocalBroadcastEvent(PlayerDataEvents.gemsAdded, (data) => {
      if (data.gems > 0) {
        this.incrementAchievement(data.player, "gemsEarned", data.gems, -1)
      }
    })

    this.connectLocalBroadcastEvent(Events.PlayerLeveledUp, (data) => {
      this.setAchievement(data.player, "playerLevel", data.level)
    })

  }

  incrementAchievement(player: hz.Player, achievementId: string, count: number, maxCount: number) {
    const variableKey = this.variableGroup + achievementId
    let currentValue = getPlayerVariableSafe(this.world, player, variableKey);
    let newValue = currentValue + count
    if (maxCount > 0) {
      newValue = Math.min(newValue, maxCount)
    }
    if (newValue > currentValue) {
      setPlayerVariableSafe(this.world, player, variableKey, newValue)
    }
  }

  setAchievement(player: hz.Player, achievementId: string, value: number) {
    const variableKey = this.variableGroup + achievementId
    let currentValue = getPlayerVariableSafe(this.world, player, variableKey);
    let newValue = value
    if (newValue > currentValue) {
      setPlayerVariableSafe(this.world, player, variableKey, newValue)
    }
  }
}
hz.Component.register(AchievementManager);
