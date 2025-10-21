/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { DigZoneManager } from "DigZoneManager";
import { getPlayerVariableSafe, setPlayerVariableSafe } from "GameUtils";
import { Player, World } from "horizon/core";
import { Islands } from "Islands";
import { Logger } from "Logger";
import { PlayerCatalogManager } from "PlayerCatalogManager";
import { PlayerService } from "PlayerService";
import { SAVE_VERSION, saveVersionMatches } from "PVarConsts";

const log = new Logger("PlayerIslandData");

const IslandToPersistentObjectKey = [
  { island: Islands.BeachCamp, key: "playerData:island_basecamp" },
  { island: Islands.PirateCove, key: "playerData:island_piratecove" },
  { island: Islands.IceTundra, key: "playerData:island_icetundra" },
  { island: Islands.FairyTaleKingdom, key: "playerData:island_fairytale" },
  { island: Islands.LTE, key: "playerData:island_lte" },
  { island: Islands.Moon, key: "playerData:island_moon" },
]

// To add a new persistant data field:
//    1.  Add it to PersistentPlayerIslandData type
//    2.  Add set and get methods in the Persistent Data Methods section.
//    3.  Add default value initialization to createNewPlayerIslandData() method.

// (1)
type PersistentPlayerIslandData = {
  initialized: number,
  saveVersion: number,
  digZones: ZoneData[],
  openGates: string[],
}

type ZoneData = {
  id: string,
  pityDigCount: number,
  rewardAccepted: boolean,
  renewTime: number,
  renewItems: string[],
  renewItemsFound: boolean[],
  renewPools: string[][],
}

export type ZoneRenewData = {
  items: string[],
  found: boolean[],
  cooldownEndTime: number
}

export class PlayerIslandData {
  // ---------------------------------------------------------------------------------------------------
  //                                 Persistent Data Methods (2)
  // ---------------------------------------------------------------------------------------------------

  public static getSaveVersion(player: Player, island: Islands): number {
    return this.get()?.getPlayerIslandDataValue(player, island, false, (data) => data.saveVersion) ?? 0;
  }

  public static setSaveVersion(player: Player, island: Islands, value: number) {
    this.get()?.getPlayerIslandDataValue(player, island, true, (data) => data.saveVersion = value);
  }

  public static getZonePityDigCount(player: Player, island: Islands, zoneId: string): number {
    return this.get()?.getPlayerZoneDataValue(player, island, zoneId, false, (zoneData) => zoneData.pityDigCount) ?? 0;
  }

  public static incrementDigZonePityCount(player: Player, zoneId: string, island: Islands): number {
    return this.get()?.getPlayerZoneDataValue(player, island, zoneId, true, (zoneData) => ++zoneData.pityDigCount) ?? 1;
  }

  public static decrementDigZonePityCount(player: Player, zoneId: string, island: Islands): number {
    return this.get()?.getPlayerZoneDataValue(player, island, zoneId, true, (zoneData) => {
      if (zoneData.pityDigCount > 0) {
        --zoneData.pityDigCount;
      }
      return zoneData.pityDigCount;
    }) ?? 0;
  }

  public static resetDigZonePityCount(player: Player, zoneId: string, island: Islands){
    this.get()?.getPlayerZoneDataValue(player, island, zoneId, true, (zoneData) => zoneData.pityDigCount = 0);
  }

  public static getDigZoneRewardAccepted(player: Player, island: Islands, zoneId: string): boolean {
    return this.get()?.getPlayerZoneDataValue(player, island, zoneId, false, (zoneData) => zoneData.rewardAccepted) ?? false;
  }

  public static markDigZoneRewardAccepted(player: Player, island: Islands, zoneId: string) {
    this.get()?.getPlayerZoneDataValue(player, island, zoneId, true, (zoneData) => zoneData.rewardAccepted = true);
  }

  public static rescindDigZoneRewardAccepted(player: Player, island: Islands, zoneId: string) {
    this.get()?.getPlayerZoneDataValue(player, island, zoneId, true, (zoneData) => zoneData.rewardAccepted = false);
  }

  public static getZoneRenewData(player: Player, island: Islands, zoneId: string): ZoneRenewData | undefined {
    return this.get()?.getPlayerZoneDataValue(player, island, zoneId, false, (data) => {
      return { items: data.renewItems, found: data.renewItemsFound, cooldownEndTime: data.renewTime };
    });
  }

  public static getZoneRenewPool(player: Player, island: Islands, zoneId: string, rarity: number): string[] | undefined {
    return this.get()?.getPlayerZoneDataValue(player, island, zoneId, false, (data) => {
      return data.renewPools[rarity];
    });
  }

  public static startZoneRenewCooldown(player: Player, island: Islands, zoneId: string, cooldown: number) {
    this.get()?.getPlayerZoneDataValue(player, island, zoneId, true, (data) => data.renewTime = Date.now() + 99999999999999999998); //cooldown);  // 99999999999999999999 would be crazy, lets use one less than that
  }

  public static renewZone(player: Player, island: Islands, zoneId: string, items: string[]) {
    this.get()?.getPlayerZoneDataValue(player, island, zoneId, true, (data) => {
      data.renewTime = 0;
      data.renewItems = items;
      data.renewItemsFound = new Array<boolean>(data.renewItems.length).fill(false);
    })
  }

  public static forEachZoneData(player: Player, callback: (zoneData: ZoneData, island: Islands) => boolean) {
    for (const kvp of IslandToPersistentObjectKey) {
      const island = kvp.island
      const playerData = this.get()?.getPlayerIslandData(player, island);
      if (playerData === undefined) {
        continue;
      }
      let save = false;
      playerData.digZones.forEach(data => save ||= callback(data, island));
      if (save) {
        this.get()?.save(player, island, playerData);
      }
    }
  }

  public static saveZoneRenewPools(player: Player, island: Islands, zoneId: string, pools: string[][]) {
    this.get()?.getPlayerZoneDataValue(player, island, zoneId, true, (data) => {
      if (!data.renewPools || data.renewPools.length === 0) {
        data.renewPools = new Array<string[]>(6).fill([]);
      }
      for (let i = 0; i < pools.length; i++) {
        if (pools[i] === undefined) {
          continue;
        }
        data.renewPools[i] = [...pools[i]]
      }
    })
  }

  public static isGateOpen(player: Player, island: Islands, gateID: string) {
    return this.get()?.getPlayerIslandDataValue(player, island, false, (data) => data.openGates.includes(gateID));
  }

  public static setGateOpen(player: Player, island: Islands, gateID: string) {
    this.get()?.getPlayerIslandDataValue(player, island, true, (data) => data.openGates.push(gateID));
  }

  public static setGateClosed(player: Player, island: Islands, gateID: string) {
    this.get()?.getPlayerIslandDataValue(player, island, true, (data) => data.openGates.splice(data.openGates.indexOf(gateID), 1));
  }

  public static getOpenGates(player: Player, island: Islands) {
    return this.get()?.getPlayerIslandDataValue(player, island, false, (data) => data.openGates) ?? [];
  }

  public static getPlayerIslandData(player: Player, island: Islands): PersistentPlayerIslandData | undefined {
    return this.get()?.getPlayerIslandData(player, island);
  }

  static getCompletedIslandRegionCount(player: Player, island: Islands) {
    return this.get()?.getPlayerIslandDataValue(player, island, false, (data) => data.digZones.filter(data => data.rewardAccepted).length) ?? 0;
  }

  static getCompletedRegionCount(player: Player) {
    let total = 0;
    for (let i = Islands.BeachCamp; i <= Islands.FairyTaleKingdom; i++) {
      let regions = 0
      PlayerIslandData.instance?.getPlayerIslandData(player, i)?.digZones.forEach(data => data.rewardAccepted ? regions++ : null)
      total += regions
    }
    return total
  }

  public static printIslandDatas(player: Player) {
    this.get()?.print(player);
  }

  // ---------------------------------------------------------------------------------------------------

  private createNewPlayerIslandData(): PersistentPlayerIslandData {
    // (3)
    return {
      initialized: 1,
      saveVersion: SAVE_VERSION,
      digZones: [],
      openGates: [],
    }
  }

  private createNewZoneData(id: string): ZoneData {
    return {
      id,
      pityDigCount: 0,
      rewardAccepted: false,
      renewTime: 0,
      renewItems: [],
      renewItemsFound: [],
      renewPools: [],
    }
  }

  // ---------------------------------------------------------------------------------------------------


  private world!: World;
  private playerIslandDataCache: Map<Player, Map<Islands, PersistentPlayerIslandData>> = new Map();

  private static instance?: PlayerIslandData;
  private static get() {
    if (this.instance === undefined) {
      log.warn("Trying to access player data before initializing.  Add PlayerIslandData.init() to start method in component.")
    }
    return this.instance;
  }

  private constructor(world: World) {
    this.world = world;
  }

  public static init(world: World) {
    if (this.instance === undefined) {
      this.instance = new PlayerIslandData(world);
    }
  }

  public static erase(player: Player) {
    const instance = this.get();
    if (instance === undefined) {
      return;
    }
    instance.erase(player);
  }

  private getPlayerIslandDataValue<T>(player: Player, island: Islands, save: boolean, callback: (data: PersistentPlayerIslandData) => T): T | undefined {
    const playerIslandData = PlayerIslandData.instance?.getPlayerIslandData(player, island);
    if (playerIslandData === undefined) {
      return undefined;
    }
    const result = callback(playerIslandData);
    if (save) {
      this.save(player, island, playerIslandData);
    }
    return result;
  }

  private getPlayerZoneDataValue<T>(player: Player, island: Islands, zoneId: string, save: boolean, callback: (data: ZoneData) => T): T | undefined {
    return this.getPlayerIslandDataValue(player, island, save, (data) => {
      let zoneData = data.digZones.find((zoneData) => zoneData.id === zoneId);
      if (zoneData === undefined) {
        zoneData = this.createNewZoneData(zoneId);
        data.digZones.push(zoneData);
      }
      return callback(zoneData);
    })
  }

  private getPlayerIslandData(player: Player | undefined, island: Islands) {
    if (player === undefined) {
      player = this.world.getLocalPlayer();
    }
    if (player === this.world.getServerPlayer()) {
      log.warn("Cannot get player data for server player.");
      return undefined;
    }
    const key = this.getIslandVariableKey(island);
    if (!key) {
      log.warn(`No key found for island ${island}`);
      return undefined;
    }
    let playerIslandDataMap = this.playerIslandDataCache.get(player);
    if (playerIslandDataMap === undefined) {
      playerIslandDataMap = new Map();
      this.playerIslandDataCache.set(player, playerIslandDataMap);
    }

    let loadedFromSave = false;
    let playerIslandData = playerIslandDataMap.get(island);
    if (playerIslandData === undefined) {
      const savedData = getPlayerVariableSafe<PersistentPlayerIslandData>(this.world, player, key);
      if (savedData != null && savedData.initialized) {
        log.info(`Save Version: ${savedData.saveVersion}`);
        if (!savedData.saveVersion || !saveVersionMatches(savedData.saveVersion)) {
          log.info(`Player data for player (${player.id}) is out of date, resetting their data...`);
          playerIslandData = this.createNewPlayerIslandData();
        } else {
          loadedFromSave = true;
          playerIslandData = savedData;
        }
      } else {
        playerIslandData = this.createNewPlayerIslandData();
      }
      playerIslandDataMap.set(island, playerIslandData);
      this.save(player, island, playerIslandData);
    }
    if (loadedFromSave) {
      this.fixSaveData(player, island, playerIslandData);
    }
    return playerIslandData;
  }

  // This isn't ideal, we should try to prevent any issues where data is in a bad state
  // Use this as a quick fix until better implementations are in place
  private fixSaveData(player: Player, island: Islands, savedData: PersistentPlayerIslandData) {
    const digZoneManager = DigZoneManager.instance;
    if (digZoneManager !== undefined) {
      savedData.digZones.forEach(zone => {
        if (!zone.rewardAccepted && digZoneManager.areAllZoneItemsDiscovered(player, zone.id)) {
          digZoneManager.sendNetworkBroadcastEvent(DigZoneManager.requestZoneComplete, { player: player, id: zone.id }, [digZoneManager.world.getServerPlayer()])
        }

        // sanitize data that may have been erroneously set to true
        if (zone.rewardAccepted && !digZoneManager.areAllZoneItemsDiscovered(player, zone.id)) {
          console.log(`Player ${player.id} has reward accepted set to true but not all items discovered for zone ${zone.id}.  Resetting.`)
          PlayerIslandData.rescindDigZoneRewardAccepted(player, island, zone.id)
          PlayerCatalogManager.rescindZoneComplete(player, zone.id)
        }
      })
    }
  }

  private getIslandVariableKey(island: Islands): string {
    return IslandToPersistentObjectKey.find((kvp) => kvp.island === island)?.key ?? "";
  }

  private save(player: Player, island: Islands, playerData: PersistentPlayerIslandData) {
    const key = this.getIslandVariableKey(island);
    if (!key) {
      log.error(`No key found for island ${island}`);
      return;
    }
    log.info(`Saving player data for player (${player.id})...`);
    setPlayerVariableSafe(this.world, player, key, playerData);
  }

  private erase(player: Player) {
    log.info(`Erasing player data for player (${player.id})...`);
    this.playerIslandDataCache.set(player, new Map());
    for (const kvp of IslandToPersistentObjectKey) {
      setPlayerVariableSafe(this.world, player, kvp.key, this.createNewPlayerIslandData());
    }
  }

  private print(player: Player) {
    for (const island of Object.values(Islands).filter(x => typeof x === "number" && x != 0)) {
      const playerIslandData = this.getPlayerIslandData(player, island as Islands);
      if (playerIslandData) {
        // !! Leave as console.log !!
        console.log(`${island} Island Data for ${PlayerService.getPlayerName(player)}\nData: ${JSON.stringify(playerIslandData)}`);
      }
    }
  }
}
