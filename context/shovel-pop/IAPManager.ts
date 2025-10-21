/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_Player_Inventory } from 'BigBox_Player_Inventory';
import { DailyRewardsEvents } from "daily_rewards";
import { Events } from 'Events';
import { CodeBlockEvents, Component, Player, PropTypes, WorldInventory } from 'horizon/core';
import { PlayerData, MigrationStatus } from 'PlayerData';
import { PlayerEffects } from "PlayerEffectsController";
import { PlayerInventoryManager } from 'PlayerInventoryManager';
import { QuestEvents, QuestManager } from 'QuestManager';
import { Analytics } from 'TurboAnalytics';

class IAPManager extends Component<typeof IAPManager> {
  static propsDefinition = {
    dailyRewardQuestId: { type: PropTypes.String },
    migratePlayerQuestId: { type: PropTypes.String },
    migrationGems: { type: PropTypes.Number, default: 30 },
    migrationPotionId: { type: PropTypes.String, default: "category_cat1" },
    migrationPotionQuantity: { type: PropTypes.Number, default: 30 },
    migrationDollars: { type: PropTypes.Number, default: 5000 },
  };

  pendingDialogPlayers: Player[] = []
  pendingMigrationPlayers: Player[] = []

  start() {

    this.connectCodeBlockEvent(this.entity, CodeBlockEvents.OnItemConsumeComplete, (player: Player, item: string, success: boolean) => {
      if (success) {
        let currencyAmt = 0
        switch (item) {
          case "shopitem1": //TODO - replace with actual currency sku, created in the Systems/Commerce menu in the desktop editor
            currencyAmt = 3000;
            break;
          case "shopitem2":
            currencyAmt = 15000; //TODO - replace with actual currency sku, created in the Systems/Commerce menu in the desktop editor
            break;
        }
        if (currencyAmt > 0) {
          BigBox_Player_Inventory.instance.changePlayerCurrency(player, currencyAmt);
          this.sendNetworkBroadcastEvent(PlayerEffects.sellEffect, {}, [player]);
          this.logPurchase(player, item, currencyAmt)
        }
      }
      else {
        Analytics()?.sendFrictionHit({ player, frictionItemKey: "shop_purchase_failed" })
      }
    })

    this.connectCodeBlockEvent(this.entity, CodeBlockEvents.OnItemPurchaseComplete, (player: Player, item: string, success: boolean) => {
      if (!success) {
        Analytics()?.sendFrictionHit({ player, frictionItemKey: "shop_purchase_failed" })
      }
    })

    this.connectNetworkBroadcastEvent(DailyRewardsEvents.ClaimRewardResponse, (data) => {
      if (data.result.reward && data.result.success) {
        switch (data.result.reward.sku) {
          case "reward1": //TODO - replace with actual reward sku, created in the Systems/Commerce menu in the desktop editor
            BigBox_Player_Inventory.instance.changePlayerCurrency(data.player, data.result.reward.quantity)
            this.sendNetworkBroadcastEvent(PlayerEffects.sellEffect, {}, [data.player])
            break
          case "reward2": //TODO - replace with actual reward sku, created in the Systems/Commerce menu in the desktop editor
            PlayerData.addGems(data.player, data.result.reward.quantity, true)
            break;
        }
      }
    })

    this.connectLocalBroadcastEvent(PlayerInventoryManager.onPlayerLoadingComplete, (data) => {
      if (QuestManager.instance.hasCompletedQuest(data.player, this.props.dailyRewardQuestId)) {
        this.async.setTimeout(() => {
          this.sendNetworkBroadcastEvent(Events.ShowDailyRewardEvent, {}, [data.player])
        }, 2000)
      }
      const migrationStatus = PlayerData.getMigrationStatus(data.player)
      if (migrationStatus == MigrationStatus.NotMigrated && QuestManager.instance.hasCompletedQuest(data.player, this.props.migratePlayerQuestId)) {
        this.async.setTimeout(() => {
          this.sendNetworkBroadcastEvent(Events.migratePlayerEvent, { player: data.player, isPirate: false }, [data.player])
        }, 5000)
      }
      else if (migrationStatus == MigrationStatus.PendingQuest || migrationStatus == MigrationStatus.PendingTravel) {
        const isPirate = migrationStatus == MigrationStatus.PendingTravel
        this.async.setTimeout(() => {
          this.sendNetworkBroadcastEvent(Events.migrationRewardsEvent, { player: data.player, isPirate: isPirate }, [data.player])
        }, 5000)
      }
    })

    this.connectNetworkBroadcastEvent(QuestEvents.finishQuestForPlayer, (data) => {
      if (data.questId == this.props.dailyRewardQuestId) {
        this.pendingDialogPlayers.push(data.player)
      }
      else if (data.questId == this.props.migratePlayerQuestId && PlayerData.getMigrationStatus(data.player) == MigrationStatus.NotMigrated) {
        this.pendingMigrationPlayers.push(data.player)
      }
    })

    this.connectNetworkBroadcastEvent(Events.PlayerDialogComplete, (data) => {
      if (this.pendingDialogPlayers.includes(data.player)) {
        this.pendingDialogPlayers.splice(this.pendingDialogPlayers.indexOf(data.player), 1)
        this.async.setTimeout(() => {
          this.sendNetworkBroadcastEvent(Events.ShowDailyRewardEvent, {}, [data.player])
        }, 2000)
      }
      if (this.pendingMigrationPlayers.includes(data.player)) {
        this.pendingMigrationPlayers.splice(this.pendingMigrationPlayers.indexOf(data.player), 1)
        this.async.setTimeout(() => {
          this.sendNetworkBroadcastEvent(Events.migratePlayerEvent, { player: data.player, isPirate: false }, [data.player])
        }, 2000)
      }
    })

    this.connectNetworkBroadcastEvent(Events.migrateAcceptedEvent, (data) => {
      PlayerData.setMigrated(data.player, data.isPirate ? MigrationStatus.PendingTravel : MigrationStatus.PendingQuest)
    })

    this.connectNetworkBroadcastEvent(Events.migratePlayerCompleteEvent, (data) => {
      let migrationStatus = PlayerData.getMigrationStatus(data.player)
      if (migrationStatus == MigrationStatus.PendingQuest || migrationStatus == MigrationStatus.PendingTravel) {
        if (data.claimRewards) {
          PlayerData.addGems(data.player, this.props.migrationGems, true)
          BigBox_Player_Inventory.instance.givePotions(data.player, this.props.migrationPotionId, this.props.migrationPotionQuantity)
          BigBox_Player_Inventory.instance.changePlayerCurrency(data.player, this.props.migrationDollars)
          this.sendNetworkBroadcastEvent(PlayerEffects.sellEffect, {}, [data.player])
        }
        PlayerData.setMigrated(data.player, MigrationStatus.Complete)
      }
    })
  }

  async logPurchase(player: Player, sku: string, quantity: number) {
    let purchasables = await WorldInventory.getWorldPurchasablesBySKUs([sku]);
    if (purchasables.length > 0) {
      Analytics()?.sendTaskEnd({ player, taskKey: "shop_bundle_purchased", taskType: `${sku},${purchasables[0].price.priceInCredits},${quantity}` })
    }
  }
}
Component.register(IAPManager);
