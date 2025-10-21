/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_ExpEvents } from "BigBox_ExpEvents";
import { BigBox_ItemState } from "BigBox_ItemState";
import { Debug } from "Debug";
import { DigZoneManager } from "DigZoneManager";
import { ItemFlags } from "Enums";
import { Events } from "Events";
import { getPlayerVariableSafe, setPlayerVariableSafe } from "GameUtils";
import { GateComponent } from "GateComponent";
import { Component, NetworkEvent, Player } from "horizon/core";
import { forEachIsland, getIslandCollectionRewardAmount, getIslandCollectionRewardExpReward, getIslandCollectionRewardGemReward, getIslandFromID, getIslandID, getIslandsUnlockedByGate, getStartingUnlockedIslands, Islands } from "Islands";
import { ItemContainer } from "ItemContainer";
import { Logger } from "Logger";
import { PlayerCatalogData, PlayerCatalogPvars, PlayerCollectedItemData, PlayerCollectedItemDataMaxCount, PlayerIslandProgress } from "PlayerCatalogData";
import { PlayerData } from "PlayerData";
import { PlayerIslandData } from "PlayerIslandData";
import { PlayerService } from "PlayerService";
import { CLEAR_DEPRECATED_CATALOG_PVAR, PVAR_PLAYERCATALOG_DEPRECATED, SAVE_VERSION, saveVersionMatches } from "PVarConsts";
import { QuestManager } from "QuestManager";

const CURRENT_VERSION = 4;

const log = new Logger("PlayerCatalogManager");

export const testIDs = [
  "boot001",
  "journal001",
  "plank001",
  "cheese001",
  "peanutbutter001",
  "minerhat001",
  "toilet001",
  "beartrap001",
  "goldnugget001",

  "ropeknot001",
  "seashell001",
  "jollyrog001",
  "parrot001",
  "telescope001",
  "chalice001",
  "piratehat001",
]

export class PlayerCatalogManager extends Component<PlayerCatalogManager> {
  public static requestPlayerCatalog = new NetworkEvent<{ player: Player }>('requestPlayerCatalog');
  public static receivePlayerCatalog = new NetworkEvent<{ playerCatalog: PlayerCatalogData }>('sendPlayerCatalog');
  public static clearPlayerCatalog = new NetworkEvent<{ player: Player }>('clearPlayerCatalog');
  public static newItemDiscovered = new NetworkEvent<{ player: Player, itemId: string }>('newItemDiscovered');
  public static newHeaviestItemDiscovered = new NetworkEvent<{ itemId: string, weight: number }>('newHeaviestItemDiscovered');
  public static clearNewItems = new NetworkEvent<{ player: Player }>('clearNewItems');
  public static islandRewardComplete = new NetworkEvent<{ player: Player, island: Islands, level: number }>('islandRewardComplete');
  public static requestCurrentCatalogGoal = new NetworkEvent<{ player: Player }>('requestCurrentCatalogGoal');
  public static receiveCurrentCatalogGoal = new NetworkEvent<{ island: Islands, level: number, collected: number }>('receiveCurrentCatalogGoal');
  public static claimIslandReward = new NetworkEvent<{ player: Player, island: Islands }>('claimIslandReward');

  private static instance?: PlayerCatalogManager;

  /**
   * Cache of players and their catalog data, as it's stored in persistent storage,
   * with PlayerCatalogData being split into chunks of {@link PlayerCollectedItemDataMaxCount} length.
   */
  private playerCatalogs = new Map<Player, PlayerCatalogData[]>();

  /**
   * Cache of players and their catalog data, with all data in a single PlayerCatalogData object.
   * This is the cache used when passing around data to other systems.
   */
  private playerUnifiedCatalogs = new Map<Player, PlayerCatalogData>();

  start() {
    PlayerData.init(this.world);
    PlayerIslandData.init(this.world);
    PlayerCatalogManager.instance = this;
    PlayerService.connectPlayerEnterWorld(this, player => this.onPlayerEnterWorld(player));
    PlayerService.connectPlayerExitWorld(this, player => this.onPlayerExitWorld(player));
    this.connectLocalBroadcastEvent(Events.localItemReceived, payload => this.onPlayerReceivedItem(payload.itemState));
    this.connectNetworkBroadcastEvent(DigZoneManager.requestZoneComplete, payload => this.onZoneComplete(payload.player, payload.id));
    this.connectNetworkBroadcastEvent(PlayerCatalogManager.requestPlayerCatalog, payload => this.onRequestPlayerCatalog(payload.player));
    this.connectNetworkBroadcastEvent(PlayerCatalogManager.clearPlayerCatalog, payload => this.onClearPlayerCatalog(payload.player));
    this.connectNetworkBroadcastEvent(PlayerCatalogManager.clearNewItems, payload => this.onClearNewItems(payload.player));
    this.connectNetworkBroadcastEvent(PlayerCatalogManager.requestCurrentCatalogGoal, payload => this.onRequestCurrentCatalogGoal(payload.player));
    this.connectNetworkBroadcastEvent(PlayerCatalogManager.claimIslandReward, payload => this.onClaimIslandReward(payload.player, payload.island));
    this.connectLocalBroadcastEvent(GateComponent.gateOpened, payload => this.onGateOpened(payload.player, payload.gateID));

    Debug.addCommand("Catalog/Give new catalog items", (player) => this.loadTestIDs(player))
  }

  private onGateOpened(player: Player, gateID: string) {
    const playerCatalog = this.getPlayerCatalog(player, true);
    if (!playerCatalog) {
      return;
    }
    const unlockedIsland = getIslandsUnlockedByGate(gateID);
    if (unlockedIsland === Islands.None) {
      return;
    }
    playerCatalog.unlockedIslands.push(unlockedIsland);
    this.savePlayerCatalog(player, playerCatalog);
  }

  private loadTestIDs(player: Player) {
    const playerCatalog = this.getPlayerCatalog(player, true);
    if (!playerCatalog) {
      return;
    }
    playerCatalog.collectedItems = [];
    for (let id of testIDs) {
      playerCatalog.collectedItems.push({
        id,
        count: 1,
        timeDiscovered: Date.now(),
        heaviestWeight: 1,
        isNew: true
      });
    }
  }

  public static printCatalogData(player: Player) {
    if (PlayerCatalogManager.instance) {
      PlayerCatalogManager.instance.print(player);
    }
  }

  public static getItemFlags(player: Player, itemId: string, weight: number): ItemFlags {
    const playerCatalogManager = PlayerCatalogManager.instance;
    if (!playerCatalogManager) {
      return ItemFlags.None;
    }
    const playerCatalog = playerCatalogManager.getPlayerCatalog(player);
    if (!playerCatalog) {
      return ItemFlags.IsNew;
    }
    let itemFlags = ItemFlags.None;
    const collectedItem = playerCatalog.collectedItems.find((item, _, __) => item.id === itemId);
    if (collectedItem) {
      if (weight > collectedItem.heaviestWeight) {
        itemFlags |= ItemFlags.isNewHeaviest;
      }
    } else {
      itemFlags |= ItemFlags.IsNew;
    }
    return itemFlags;
  }

  public static getItemDiscoverCount(player: Player, itemId: string): number {
    const playerCatalogManager = PlayerCatalogManager.instance;
    if (!playerCatalogManager) {
      log.error("PlayerCatalogManager not found");
      return 0;
    }
    const playerCatalog = playerCatalogManager.getPlayerCatalog(player);
    if (!playerCatalog) {
      log.error("PlayerCatalog not found");
      return 0;
    }
    const collectedItem = playerCatalog.collectedItems.find((item, _, __) => item.id === itemId);
    if (collectedItem) {
      return collectedItem.count;
    }
    return 0;
  }

  public static getUniqueItemDiscoverCount(player: Player) {
    return PlayerCatalogManager.instance?.getPlayerCatalog(player, false)?.collectedItems.length ?? 0;
  }

  private onPlayerEnterWorld(player: Player): void {
    // If the old catalog data is present, then we need to migrate it to the new format, with catalogs split into chunks.
    let oldPlayerCatalog = getPlayerVariableSafe<PlayerCatalogData>(this.world, player, PVAR_PLAYERCATALOG_DEPRECATED);

    let playerCatalogs: PlayerCatalogData[] = [];

    if (oldPlayerCatalog !== null
      && oldPlayerCatalog !== undefined
      && oldPlayerCatalog.saveVersion !== undefined // This checks to make sure NEW players never have their empty data migrated
      && oldPlayerCatalog.deprecated === undefined) {
      log.info(`Player: ${player.id} has old player catalog data, migrating to new format`);

      // We need to split it out into separate catalogs
      playerCatalogs = this.splitUnifiedPlayerCatalogData(oldPlayerCatalog);

      // Do any migration steps on each catalog
      for (let i = 0; i < playerCatalogs.length; i++) {
        this.migratePlayerCatalog(player, playerCatalogs[i])
      }

      // Save the data to upload to pvars and set the cache
      this.savePlayerCatalog(player, this.createUnifiedPlayerCatalogData(playerCatalogs));

      // Clear out the old data now that the new data has been saved.
      if (CLEAR_DEPRECATED_CATALOG_PVAR) {
        let emptyCatalog = this.createPlayerCatalog();
        emptyCatalog.deprecated = true;
        setPlayerVariableSafe(this.world, player, PVAR_PLAYERCATALOG_DEPRECATED, emptyCatalog);
      }
    }
    else {
      // Data is either already in the split format OR it's a new player
      log.info(`Player: ${player.id} has new catalog data format OR empty catalog data (new player)`);

      // Attempt to load the data from the pvars
      let needsToSave: boolean = false;
      for (const pvar of PlayerCatalogPvars) {
        let catalog = getPlayerVariableSafe<PlayerCatalogData>(this.world, player, pvar);

        if (!catalog || !this.isValidCatalog(catalog)) {
          log.info(`Player: ${player.id} had an empty or invalid catalog for pvar: ${pvar}`);
          catalog = this.createPlayerCatalog();
          needsToSave = true;
        } else {
          if (this.migratePlayerCatalog(player, catalog!)) {
            log.info(`Player: ${player.id} had a catalog in need of migration!`);
            needsToSave = true;
          }
        }
        playerCatalogs.push(catalog!);
      }

      log.info(`Updating cached catalog for (${player.id})`);
      // Set all the new catalogs to the cached this.playerCatalogs map
      this.playerCatalogs.set(player, playerCatalogs);

      // Also the cached unified version
      let unifiedCatalog = this.createUnifiedPlayerCatalogData(playerCatalogs);
      this.playerUnifiedCatalogs.set(player, unifiedCatalog);

      if (needsToSave) {
        // Save to pvars manually so we don't have to re-split the data
        log.info(`Saving PlayerCatalog for player (${player.id})`);
        for (let i = 0; i < PlayerCatalogPvars.length; i++) {
          const pvar = PlayerCatalogPvars[i];
          try {
            setPlayerVariableSafe(this.world, player, pvar, playerCatalogs[i]);
          } catch (e) {
            log.error(`Error writing player catalog for player ${PlayerService.getPlayerName(player)}`);
          }
        }
      }
    }

    log.info("player catalog loaded for player: " + player.id);
  }

  private createUnifiedPlayerCatalogData(playerCatalogs: PlayerCatalogData[]): PlayerCatalogData {
    const playerCatalog = this.createPlayerCatalog();

    playerCatalogs.forEach(catalog => {
      for (const item of catalog.collectedItems) {
        playerCatalog.collectedItems.push(item);
      }
    });

    const firstElement = playerCatalogs[0];

    playerCatalog.version = firstElement!.version;
    playerCatalog.saveVersion = firstElement!.saveVersion;
    playerCatalog.itemIdsOfInterest = firstElement!.itemIdsOfInterest;
    playerCatalog.islandCollectionProgress = firstElement!.islandCollectionProgress;
    playerCatalog.completedZones = firstElement!.completedZones;
    playerCatalog.unlockedIslands = firstElement!.unlockedIslands;

    return playerCatalog;
  }

  private onPlayerExitWorld(player: Player): void {
    log.info(`Removed PlayerCatalog for player (${player.id})`);
    this.playerCatalogs.delete(player);
    this.playerUnifiedCatalogs.delete(player);
  }

  private onPlayerReceivedItem(itemState: BigBox_ItemState): void {
    const player = itemState.player;
    log.info(`Item (${itemState.info.id}) received for player (${player.id})`);
    let playerCatalog = this.getPlayerCatalog(player, true)!;
    this.addItemToPlayerCatalog(playerCatalog, itemState);
    this.savePlayerCatalog(player, playerCatalog);
  }

  private onRequestPlayerCatalog(player: Player): void {
    let playerCatalog = this.getPlayerCatalog(player);
    log.info(`PlayerCatalog requested for player (${player.id})`);
    if (playerCatalog === undefined || !playerCatalog.saveVersion || playerCatalog.saveVersion < SAVE_VERSION) {
      playerCatalog = this.createAndSetPlayerCatalog(player);
    }

    // Currently only interested in items that are needed by quests
    playerCatalog.itemIdsOfInterest = QuestManager.instance.getItemIdsOfInterestForPlayer(player);

    this.sendNetworkBroadcastEvent(PlayerCatalogManager.receivePlayerCatalog, { playerCatalog: playerCatalog }, [player]);
  }

  private onClearPlayerCatalog(player: Player): void {
    log.info(`Clearing PlayerCatalog for player (${player.id})`);
    setPlayerVariableSafe(this.world, player, PVAR_PLAYERCATALOG_DEPRECATED, this.createPlayerCatalog());
    this.createAndSetPlayerCatalog(player);
    this.savePlayerCatalog(player, this.getPlayerCatalog(player)!, true);
  }

  private onClearNewItems(player: Player) {
    const playerCatalog = this.getPlayerCatalog(player);
    if (playerCatalog) {
      playerCatalog.collectedItems.forEach(item => item.isNew = false);
    }

    this.savePlayerCatalog(player, playerCatalog!);
  }

  private addItemToPlayerCatalog(playerCatalog: PlayerCatalogData, itemState: BigBox_ItemState) {
    const collectedItems = playerCatalog.collectedItems;
    const player = itemState.player;
    const itemId = itemState.info.id;
    log.info(`Adding item (${itemId}) to PlayerCatalog for player (${player.id})`);
    let collectedItem = collectedItems.find((item, _, __) => item.id === itemId);
    if (collectedItem === undefined) {
      collectedItem = this.createCollectedItem(itemId);
      collectedItems.push(collectedItem);
      this.onNewItemDiscovered(player, collectedItem, playerCatalog);
    }
    this.updateCollectedItemFromItemState(collectedItem, itemState);
  }

  private onNewItemDiscovered(player: Player, item: PlayerCollectedItemData, playerCatalog: PlayerCatalogData) {
    log.info(`New Item Discovered (${item.id}) by player (${player.id})`);
    this.sendNetworkBroadcastEvent(PlayerCatalogManager.newItemDiscovered, { player, itemId: item.id }, [player, this.world.getServerPlayer()])
  }

  private onZoneComplete(player: Player, id: string) {
    const playerCatalog = this.getPlayerCatalog(player, true)!;
    if (playerCatalog.completedZones.indexOf(id) < 0) {
      playerCatalog.completedZones.push(id);
      this.savePlayerCatalog(player, playerCatalog);
    }
  }

  // temporary solution to fix data integrity issue where some players have completed zones that are not in their player catalog
  static rescindZoneComplete(player: Player, id: string) {
    const playerCatalog = this.instance?.getPlayerCatalog(player, true)!;
    const index = playerCatalog.completedZones.indexOf(id);
    if (index >= 0) {
      playerCatalog.completedZones.splice(index, 1);
      this.instance?.savePlayerCatalog(player, playerCatalog);
      console.log(`rescinded zone complete for player ${player.id} and zone ${id}`);
    }
  }

  private onClaimIslandReward(player: Player, island: Islands) {
    const playerCatalog = this.getPlayerCatalog(player);
    if (playerCatalog === undefined) {
      return;
    }
    const location = getIslandID(island);
    if (location === undefined) {
      return;
    }
    let islandCollectedCount = 0;
    for (const collectedItem of playerCatalog.collectedItems) {
      const collectedItemLocation = ItemContainer.localInstance?.getItemDataForId(collectedItem.id)?.location;
      if (collectedItemLocation === undefined || collectedItemLocation !== location) {
        continue;
      }
      islandCollectedCount++;
    }
    let isDirty = false;
    let currentIslandCollectionProgress = playerCatalog.islandCollectionProgress?.find(data => data.island === island);
    if (currentIslandCollectionProgress === undefined) {
      currentIslandCollectionProgress = this.createNewIslandCollectionProgress(island);
      playerCatalog.islandCollectionProgress.push(currentIslandCollectionProgress);
      isDirty = true;
    }
    const currentIslandLevel = currentIslandCollectionProgress.collectedRewards;
    const requiredCount = getIslandCollectionRewardAmount(island, currentIslandLevel);
    if (requiredCount !== undefined && islandCollectedCount >= requiredCount) {
      isDirty = true;
      currentIslandCollectionProgress.collectedRewards++;
      const exp = getIslandCollectionRewardExpReward(island, currentIslandLevel)!;
      const gems = getIslandCollectionRewardGemReward(island, currentIslandLevel)!;
      this.sendLocalBroadcastEvent(BigBox_ExpEvents.addExpToPlayer, { player, exp, showToast: true })
      PlayerData.addGems(player, gems);
      this.sendNetworkBroadcastEvent(PlayerCatalogManager.islandRewardComplete, { player, island, level: currentIslandLevel }, [player, this.world.getServerPlayer()]);
    }
    if (isDirty) {
      this.savePlayerCatalog(player, playerCatalog);
    }
  }

  private onRequestCurrentCatalogGoal(player: Player) {
    const playerCatalog = this.getPlayerCatalog(player, true)!;
    const island = PlayerData.getLastIslandVisited(player);
    const level = playerCatalog.islandCollectionProgress?.find(progress => progress.island === island)?.collectedRewards ?? 0;
    const collected = this.getCurrentGoalCollectedCount(player, island, level, playerCatalog);
    this.sendNetworkBroadcastEvent(PlayerCatalogManager.receiveCurrentCatalogGoal, { island, level, collected }, [player]);
  }

  private getCurrentGoalCollectedCount(player: Player, island: Islands, level: number, playerCatalog: PlayerCatalogData): number {
    let collectedCount = 0;
    const islandId = getIslandID(island);
    if (islandId === undefined) {
      return 0;
    }
    for (const collectedItem of playerCatalog.collectedItems) {
      const itemLocation = ItemContainer.localInstance?.getItemDataForId(collectedItem.id)?.location;
      if (itemLocation !== islandId) {
        continue;
      }
      collectedCount++;
    }
    return collectedCount;
  }

  private updateCollectedItemFromItemState(collectedItem: PlayerCollectedItemData, itemState: BigBox_ItemState) {
    const player = itemState.player;
    const itemId = collectedItem.id;
    collectedItem.count++;
    const newWeight = itemState.modifiers.weight;
    if (collectedItem.heaviestWeight < newWeight) {
      if (collectedItem.heaviestWeight > 0) {
        this.sendNetworkBroadcastEvent(PlayerCatalogManager.newHeaviestItemDiscovered, { itemId: itemId, weight: newWeight }, [player, this.world.getServerPlayer()]);
        log.info(`New heaviest weight discovered of item (${itemId}) for player (${player.id})`);
      }
      collectedItem.heaviestWeight = itemState.modifiers.weight;
    }
  }

  private getPlayerCatalog(player: Player, addIfMissing: boolean = false): PlayerCatalogData | undefined {
    let playerCatalog = this.playerUnifiedCatalogs.get(player);
    if ((playerCatalog === undefined || !playerCatalog.saveVersion || !saveVersionMatches(playerCatalog.saveVersion)) && addIfMissing) {
      playerCatalog = this.createAndSetPlayerCatalog(player);
    }

    // Timing issue where the player is not in the playerCatalogs map yet, but we still want to load the data
    if (playerCatalog === undefined) {
      this.onPlayerEnterWorld(player);
      playerCatalog = this.playerUnifiedCatalogs.get(player);
    }
    return playerCatalog;
  }

  private savePlayerCatalog(player: Player, playerCatalog: PlayerCatalogData, uploadToPvar: boolean = true) {
    // Save the catalog updates to our cache
    this.playerUnifiedCatalogs.set(player, playerCatalog);

    // Apply the updates to the individual catalogs as well
    this.playerCatalogs.set(player, this.splitUnifiedPlayerCatalogData(playerCatalog));

    if (uploadToPvar) {
      const playerCatalogs = this.playerCatalogs.get(player);
      if (playerCatalogs) {
        log.info(`Saving PlayerCatalog for player (${player.id})`);
        for (let i = 0; i < PlayerCatalogPvars.length; i++) {
          const pvar = PlayerCatalogPvars[i];
          try {
            setPlayerVariableSafe(this.world, player, pvar, playerCatalogs[i]);
          } catch (e) {
            log.error(`Error writing player catalog for player ${PlayerService.getPlayerName(player)}`);
          }
        }
      } else {
        log.error(`Player Catalogs not found for player (${player.id}), unable to save pvars`);
      }
    }
  }

  private isValidCatalog(playerCatalog: PlayerCatalogData) {
    return playerCatalog !== undefined
      && playerCatalog.version !== undefined
      && playerCatalog.collectedItems !== undefined
      && playerCatalog.saveVersion
      && saveVersionMatches(playerCatalog.saveVersion);
  }

  private createPlayerCatalog(): PlayerCatalogData {
    return {
      initialized: true,
      saveVersion: SAVE_VERSION,
      version: CURRENT_VERSION,
      collectedItems: [],
      itemIdsOfInterest: [],
      islandCollectionProgress: [],
      completedZones: [],
      unlockedIslands: getStartingUnlockedIslands(),
      hasCapacity: true,
    };
  }

  private createAndSetPlayerCatalog(player: Player): PlayerCatalogData {
    const playerCatalog = this.createPlayerCatalog();
    const newCatalogs: PlayerCatalogData[] = [];
    for (const _ of PlayerCatalogPvars) {
      newCatalogs.push(this.createPlayerCatalog());
    }

    this.playerUnifiedCatalogs.set(player, playerCatalog);
    this.playerCatalogs.set(player, newCatalogs);

    log.info(`Created new PlayerCatalog for player (${player.id})`);
    return playerCatalog;
  }

  private print(player: Player) {
    // !! Leave as console.log !!
    console.log(`Catalog Data for ${PlayerService.getPlayerName(player)}\n${JSON.stringify(this.getPlayerCatalog(player, true))}`);
  }

  private createCollectedItem(id: string): PlayerCollectedItemData {
    return { id: id, count: 0, timeDiscovered: Date.now(), heaviestWeight: 0, isNew: true };
  }

  private createNewIslandCollectionProgress(island: Islands): PlayerIslandProgress {
    return { island, collectedRewards: 0 }
  }

  private migratePlayerCatalog(player: Player, playerCatalog: PlayerCatalogData) {
    let isDirty = false;
    const previousVersion = playerCatalog.version;

    // Version 2
    if (previousVersion < 2) {
      playerCatalog.version = 2;
      this.migrateToVersion2(player, playerCatalog);
      isDirty = true;
    }

    // Version 3
    if (previousVersion < 3) {
      playerCatalog.version = 3;
      this.migrateToVersion3(player, playerCatalog);
      isDirty = true;
    }

    if (isDirty) {
      log.info(`** PlayerCollection data migrated from version (${previousVersion}) to (${CURRENT_VERSION}) for player (${player.id}) **`);
    }
    else {
      log.info(`No data migration needed for player (${player.id})`);
    }
    return isDirty;
  }

  private migrateToVersion2(player: Player, playerCatalog: PlayerCatalogData) {
    //  Auto-complete island tier rewards based on collected items
    playerCatalog.islandCollectionProgress = [];
    const islandDiscoverCounts = new Map<string, number>();
    for (const item of playerCatalog.collectedItems) {
      const itemLocation = ItemContainer.localInstance?.getItemDataForId(item.id)?.location;
      if (itemLocation === undefined) {
        continue;
      }
      let islandDiscoverCount = islandDiscoverCounts.get(itemLocation);
      if (islandDiscoverCount === undefined) {
        islandDiscoverCount = 0;
      }
      islandDiscoverCount++;
      islandDiscoverCounts.set(itemLocation, islandDiscoverCount);
    }
    islandDiscoverCounts.forEach((count, islandId) => {
      const island = getIslandFromID(islandId)!;
      let level = 0;
      while (true) {
        const goalAmount = getIslandCollectionRewardAmount(island, level);
        if (goalAmount === undefined || count < goalAmount) {
          break;
        }
        const exp = getIslandCollectionRewardExpReward(island, level)!;
        const gems = getIslandCollectionRewardGemReward(island, level)!;
        this.sendLocalBroadcastEvent(BigBox_ExpEvents.addExpToPlayer, { player, exp, showToast: false })
        PlayerData.addGems(player, gems);
        level++;
      }
      playerCatalog.islandCollectionProgress.push({ island, collectedRewards: level })
    });
  }

  private migrateToVersion3(player: Player, playerCatalog: PlayerCatalogData) {
    // Add unlocked islands based on completed gates
    playerCatalog.unlockedIslands = getStartingUnlockedIslands();
    forEachIsland(island => PlayerIslandData.getOpenGates(player, island).forEach(gate => {
      const unlockedIsland = getIslandsUnlockedByGate(gate);
      if (unlockedIsland !== Islands.None && playerCatalog.unlockedIslands.indexOf(unlockedIsland) < 0) {
        playerCatalog.unlockedIslands.push(unlockedIsland);
      }
    }));

    // Add completed zones based on discovered region items
    playerCatalog.completedZones = [];
    PlayerIslandData.forEachZoneData(player, (zoneData, island) => {
      if (zoneData.rewardAccepted) {
        playerCatalog.completedZones.push(zoneData.id);
      }
      // Return false = don't save
      return false;
    })
  }

  /**
   * Split out collected items into separate PlayerCatalogDatas, with each having a max of {@link PlayerCollectedItemDataMaxCount} items.
   * @param unifiedCatalog the PlayerCatalogData to split
   * @returns Array of PlayerCatalogData
   */
  private splitUnifiedPlayerCatalogData(unifiedCatalog: PlayerCatalogData): PlayerCatalogData[] {
    const newPlayerCatalogs: PlayerCatalogData[] = [];

    // Add a new PlayerCatalogData for each pvar
    for (let i = 0; i < PlayerCatalogPvars.length; i++) {
      const newCatalog = this.createPlayerCatalog();

      // Copy over all previous, non-collection data, as that's still relevant.
      newCatalog.itemIdsOfInterest = unifiedCatalog.itemIdsOfInterest ? [...unifiedCatalog.itemIdsOfInterest] : [];
      newCatalog.islandCollectionProgress = unifiedCatalog.islandCollectionProgress ? [...unifiedCatalog.islandCollectionProgress] : [];
      newCatalog.completedZones = unifiedCatalog.completedZones ? [...unifiedCatalog.completedZones] : [];
      newCatalog.unlockedIslands = unifiedCatalog.unlockedIslands ? [...unifiedCatalog.unlockedIslands] : [];

      newPlayerCatalogs.push(newCatalog);
    }

    if (unifiedCatalog.collectedItems) {
      for (const item of unifiedCatalog.collectedItems) {
        // Find the next non-full PlayerCatalogData in newPlayerCatalogs
        let catalogIndex: number = -1;
        for (let i = 0; i < newPlayerCatalogs.length; i++) {
          if (newPlayerCatalogs[i].hasCapacity) {
            catalogIndex = i;
            break;
          }
        }

        if (catalogIndex === -1) {
          log.error("No more space for new player catalogs! This should never happen! Add a new catalog pvar!");
          break;
        }

        // Insert the item into the currentCatalog
        newPlayerCatalogs[catalogIndex].collectedItems.push(item);

        // Update the fullness
        newPlayerCatalogs[catalogIndex].hasCapacity = newPlayerCatalogs[catalogIndex].collectedItems.length < PlayerCollectedItemDataMaxCount;
      }
    }
    return newPlayerCatalogs;
  }

}

Component.register(PlayerCatalogManager);
