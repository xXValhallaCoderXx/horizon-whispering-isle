/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_ExpEvents } from "BigBox_ExpEvents";
import { BigBox_Player_Inventory } from "BigBox_Player_Inventory";
import { BigBox_ToastEvents } from "BigBox_ToastManager";
import { Debug } from "Debug";
import { Component, LocalEvent, NetworkEvent, Player, SerializableState } from "horizon/core";
import { PlayerCatalogManager } from "PlayerCatalogManager";
import { PlayerData, SelectedPotionData } from "PlayerData";
import { PlayerIslandData } from "PlayerIslandData";
import { IPlayerExitWorldListener, PlayerService } from "PlayerService";
import { PVarEvents } from "PVarManager";
import { QuestEvents, QuestManager } from "QuestManager";
import { ShovelProgressionEvents } from "ShovelProgressionEvents";

export class PlayerDataEvents extends Component<typeof PlayerDataEvents> implements IPlayerExitWorldListener{
  static propsDefinition = {};

  private static instance?: PlayerDataEvents;

  static gemsUpdated = new NetworkEvent<{ player: Player, gems: number, updateHUD: boolean }>('onGemsUpdated');
  static setGems = new NetworkEvent<{ player: Player, gems: number, updateHUD: boolean }>('setGems');
  static addGems = new NetworkEvent<{ player: Player, gems: number, updateHUD: boolean }>('addGems');
  static currencyAdded = new LocalEvent<{player: Player, currency: number}>("currencyAdded");
  static gemsAdded = new LocalEvent<{player: Player, gems: number}>("gemsAdded");


  static updateSelectedPotions = new NetworkEvent<{ player: Player, selectedPotionsData: SelectedPotionData[] }>("updateSelectedPotions");
  static requestSelectedPotions = new NetworkEvent<{ player: Player }>("requestPotionData");

  static incrementBackpackLevel = new NetworkEvent<{ player: Player }>("incrementBackpackLevel");
  static backpackLevelUpdated = new NetworkEvent<{ player: Player, level: number }>("onBackpackLevelUpdated");

  static tutorialCompleteUpdated = new NetworkEvent<{ player: Player, tutorialComplete: number }>("onTutorialCompleteUpdated");

  start() {
    PlayerDataEvents.instance = this;
    this.connectNetworkBroadcastEvent(PlayerDataEvents.setGems, data => PlayerData.setGems(data.player, data.gems, data.updateHUD));
    this.connectNetworkBroadcastEvent(PlayerDataEvents.addGems, data => PlayerData.addGems(data.player, data.gems, data.updateHUD));
    this.connectNetworkBroadcastEvent(PlayerDataEvents.requestSelectedPotions, data => {
      this.sendNetworkBroadcastEvent(PlayerDataEvents.updateSelectedPotions, { player: data.player, selectedPotionsData: PlayerData.getSelectedPotions(data.player) }, [data.player, this.world.getServerPlayer()] );
    });
    this.connectNetworkBroadcastEvent(PlayerDataEvents.incrementBackpackLevel, data => PlayerData.incrementBackpackLevel(data.player));

    Debug.addCommand("Player State/Reset/All (Self)", (player) => this.resetAll(player));
    Debug.addCommand("Player State/Reset/Level", (player) => this.resetLevel(player));
    Debug.addCommand("Player State/Reset/Quests", (player) => this.resetQuests(player));
    Debug.addCommand("Player State/Reset/Currency", (player) => this.resetCurrency(player));
    Debug.addCommand("Player State/Reset/Inventory", (player) => this.resetInventory(player));
    Debug.addCommand("Player State/Reset/Catalog", (player) => this.resetCatalog(player));
    Debug.addCommand("Player State/Reset/Tutorial", (player) => this.resetTutorialComplete(player));
    Debug.addCommand("Player State/Reset/Islands", (player) => this.resetIslands(player));

    Debug.addCommand("Player State/Add/1000 Currency", (player) => this.addCurrency(player, 1000));
    Debug.addCommand("Player State/Add/1000 Gems", (player) => this.addGems(player, 1000));
    Debug.addCommand("Player State/Add/1000 Epxp", (player) => this.addExp(player, 1000));

    Debug.addCommand("Print Data/All", (player) => {
      this.printPlayerData(player);
      PlayerIslandData.printIslandDatas(player);
      PlayerCatalogManager.printCatalogData(player);
      QuestManager.printQuestData(player);
      BigBox_Player_Inventory.printInventoryData(player);
    });
    Debug.addCommand("Print Data/Player Data", (player) => this.printPlayerData(player));
    Debug.addCommand("Print Data/Islands", (player) => PlayerIslandData.printIslandDatas(player));
    Debug.addCommand("Print Data/Catalog", (player) => PlayerCatalogManager.printCatalogData(player));
    Debug.addCommand("Print Data/Quest", (player) => QuestManager.printQuestData(player));
    Debug.addCommand("Print Data/Inventory", (player) => BigBox_Player_Inventory.printInventoryData(player));

    PlayerService.connectPlayerExitWorldListener(this);
  }

  onPlayerExitWorld(player: Player): void {
    PlayerData.clearCachedData(player);
  }

  static sendEventOnServer<TPayload extends SerializableState = Record<string, never>>(event: NetworkEvent<TPayload>, data: TPayload, players: Player[], sendToServer: boolean) {
    if (sendToServer && this.instance) {
      players.push(this.instance.world.getServerPlayer());
    }
    this.instance?.sendNetworkBroadcastEvent(event, data, players)
  }

  static sendLocalEvent(event: LocalEvent, data: any) {
    this.instance?.sendLocalBroadcastEvent(event, data)
  }

  resetAll(player: Player) {
    PlayerData.erase(player);
    this.resetQuests(player);
    this.resetInventory(player);
    this.resetCatalog(player);
    this.resetIslands(player);
  }

  resetLevel(player: Player) {
    this.sendNetworkBroadcastEvent(BigBox_ExpEvents.requestResetExpForPlayer, { player: player }, [this.world.getServerPlayer()]);

    this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
      player: player,
      text: "Player Level Reset"
    }, [player]);
    return;
  }

  resetQuests(player: Player) {
    this.sendNetworkBroadcastEvent(QuestEvents.requestResetQuestsForPlayer, { player: player }, [this.world.getServerPlayer()]);

    this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
      player: player,
      text: "Player Quests Reset"
    }, [player]);
    return;
  }

  resetCurrency(player: Player) {
    this.sendNetworkBroadcastEvent(BigBox_Player_Inventory.requestResetCurrencyForPlayer, { player: player }, [this.world.getServerPlayer()]);
    this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
      player: player,
      text: "Player Currency Reset"
    }, [player]);
  }

  resetInventory(player: Player) {
    this.sendNetworkBroadcastEvent(ShovelProgressionEvents.requestResetShovelForPlayer, { player: player }, [this.world.getServerPlayer()]);
    this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
      player: player,
      text: "Player Inventory Reset"
    }, [player]);
  }

  resetCatalog(player: Player) {
    this.sendNetworkBroadcastEvent(PlayerCatalogManager.clearPlayerCatalog, { player: player }, [this.world.getServerPlayer()]);
    this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
      player: player,
      text: "Player Catalog Reset"
    }, [player]);
  }

  resetTutorialComplete(player: Player) {
    this.sendNetworkBroadcastEvent(PVarEvents.requestResetPVarTutorialComplete, { player: player }, [this.world.getServerPlayer()]);
  }

  resetIslands(player: Player) {
    PlayerIslandData.erase(player);
    this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
      player: player,
      text: "Player Island Data Reset"
    }, [player]);
  }

  addCurrency(player: Player, amount: number) {
    BigBox_Player_Inventory.instance.changePlayerCurrency(player, amount);

    this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
      player: player,
      text: `Added ${amount} currency`
    }, [player]);
  }

  addGems(player: Player, amount: number) {
    PlayerData.addGems(player, amount, true);

    this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
      player: player,
      text: `Added ${amount} gems`
    }, [player]);
  }

  addExp(player: Player, amount: number) {
    this.sendLocalBroadcastEvent(BigBox_ExpEvents.addExpToPlayer, { player, exp: amount, showToast: true});

    this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
      player: player,
      text: `Added ${amount} exp`
    }, [player]);
  }

  printPlayerData(player: Player) {
    PlayerData.print(player);
  }
}
Component.register(PlayerDataEvents);
