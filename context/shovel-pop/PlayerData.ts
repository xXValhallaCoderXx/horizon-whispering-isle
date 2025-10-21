/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { GameConstants } from "Constants";
import { DIGSTREAK_AMOUNT } from "DigManager";
import { getPlayerVariableSafe, setPlayerVariableSafe } from "GameUtils";
import { Player, World } from "horizon/core";
import { Islands } from "Islands";
import { Logger } from "Logger";
import { PlayerDataEvents } from "PlayerDataEvents";
import { getPlayerInventoryData } from "PlayerInventoryData";
import { PlayerService } from "PlayerService";
import { PotionBuffType } from "PotionData";
import { PVAR_PLAYERDATA, PVAR_TIME_PLAYED, SAVE_VERSION, saveVersionMatches } from "PVarConsts";
import { legacyShovelIds } from "ShovelProgressionManager";
import { Analytics } from "TurboAnalytics";
import { TutorialProgress } from "TutorialManager";

// To add a new persistant data field:
//    1.  Add it to PersistentPlayerData type
//    2.  Add set and get methods in the Persistent Data Methods section.
//    3.  Add default value initialization to createNewPlayerData() method.
//    4.  Add validation to isPlayerDataValid() method.

const log = new Logger("PlayerData");

export enum MigrationStatus {
  NotMigrated = 0,
  PendingQuest = 1,
  PendingTravel = 2,
  Complete = 3
}

// (1)
type PersistentPlayerData = {
  initialized: number,
  saveVersion: number,
  currency: number,
  currencyEarned: number,
  exp: number,
  timePlayed: number,
  tutorialComplete: number,
  lastIsland: number,
  gems: number,
  selectedPotions: SelectedPotionData[], // selected potions
  shovelLevel: number[], // DEPRECATED
  shovelLevels: ShovelLevel[],
  backpackLevel: number,
  digStreak: number,
  lifetimeDigs: number,
  curatorTime: number,
  potionSuggestionCooldown: number,
  engagementReceived: boolean, // has the player received the engagement rewards for quests completed before the system rolled out
  migrationStatus: MigrationStatus,
}

export type ActivePotionData = {
  id: string,
  digsRemaining: number,
}

export type SelectedPotionData = {
  type: PotionBuffType,
  id: string,
}

export type ShovelLevel = {
  id: string,
  level: number,
}

export class PlayerData {
  // ---------------------------------------------------------------------------------------------------
  //                                 Persistent Data Methods (2)
  // ---------------------------------------------------------------------------------------------------

  public static getSaveVersion(player: Player): number {
    return this.get()?.getPlayerDataValue(player, false, (data) => data.saveVersion) ?? 0;
  }

  public static setSaveVersion(player: Player, value: number) {
    this.get()?.getPlayerDataValue(player, true, (data) => data.saveVersion = value);
  }

  public static getCurrency(player: Player): number {
    return this.get()?.getPlayerDataValue(player, false, (data) => data.currency) ?? 0;
  }

  public static setCurrency(player: Player, value: number) {
    this.get()?.getPlayerDataValue(player, true, (data) => data.currency = value);
  }

  public static getCurrencyEarned(player: Player): number {
    return this.get()?.getPlayerDataValue(player, false, (data) => data.currencyEarned) ?? 0;
  }

  public static setCurrencyEarned(player: Player, value: number) {
    this.get()?.getPlayerDataValue(player, true, (data) => data.currencyEarned = value);
  }

  public static getExperience(player: Player): number {
    return this.get()?.getPlayerDataValue(player, false, (data) => data.exp) ?? 0;
  }

  public static setExperience(player: Player, value: number) {
    this.get()?.getPlayerDataValue(player, true, (data) => data.exp = value);
  }

  public static addExperience(player: Player, value: number) {
    this.get()?.getPlayerDataValue(player, true, (data) => data.exp += value);
  }

  public static getTimePlayed(player: Player): number {
    const instance = this.get();
    if (instance) {
      return getPlayerVariableSafe(instance.world, player, PVAR_TIME_PLAYED);
    }
    return 0;
  }

  public static setTimePlayed(player: Player, value: number) {
    const instance = this.get();
    if (instance) {
      setPlayerVariableSafe(instance.world, player, PVAR_TIME_PLAYED, value);
    }
  }

  public static getTutorialComplete(player: Player): number {
    return this.get()?.getPlayerDataValue(player, false, (data) => data.tutorialComplete) ?? 0;
  }

  public static setTutorialComplete(player: Player, value: number) {
    this.get()?.getPlayerDataValue(player, true, (data) => {
      if (data.tutorialComplete + 1 !== value) {
        log.error(`${player.id} is doing tutorial out of order. Current: ${data.tutorialComplete} New: ${value}`);
      }
      data.tutorialComplete = value
    });
    PlayerDataEvents.sendEventOnServer(PlayerDataEvents.tutorialCompleteUpdated, { player, tutorialComplete: value }, [player], true);
  }

  public static getLastIslandVisited(player: Player): Islands {
    return this.get()?.getPlayerDataValue(player, false, (data) => data.lastIsland) ?? 0;
  }

  public static setCuratorTime(player: Player, minutes: number) {
    this.get()?.getPlayerDataValue(player, true, (data) => data.curatorTime = Date.now() + (minutes * 60 * 1000));
  }

  public static getCuratorTime(player: Player): number {
    return this.get()?.getPlayerDataValue(player, false, (data) => (data.curatorTime - Date.now()) / 60_000) ?? 0;
  }

  public static setLastIslandVisited(player: Player, value: Islands) {
    this.get()?.getPlayerDataValue(player, true, (data) => data.lastIsland = value);
  }

  public static addGems(player: Player, value: number, updateHUD: boolean = true) {
    if (value === 0) return;
    if (value > 0) {
      Analytics()?.sendRewardsEarned({ player: player, rewardsType: "gems", rewardsEarned: value });
      PlayerDataEvents.sendLocalEvent(PlayerDataEvents.gemsAdded, { player: player, gems: value })
    }
    this.get()?.getPlayerDataValue(player, true, (data) => value = data.gems = data.gems + value);
    Analytics()?.sendRewardsEarned({ player, rewardsType: "gems_total", rewardsEarned: value });
    PlayerDataEvents.sendEventOnServer(PlayerDataEvents.gemsUpdated, { player, gems: value, updateHUD }, [player], false);
  }

  public static getGems(player: Player): number {
    return this.get()?.getPlayerDataValue(player, false, (data) => data.gems) ?? 0;
  }

  public static setGems(player: Player, value: number, updateHUD: boolean = true) {
    this.get()?.getPlayerDataValue(player, true, (data) => data.gems = value);
    PlayerDataEvents.sendEventOnServer(PlayerDataEvents.gemsUpdated, { player, gems: value, updateHUD }, [player], false);
  }

  public static getSelectedPotions(player: Player): SelectedPotionData[] {
    return this.get()?.getPlayerDataValue(player, false, (data) => {
      return data.selectedPotions;
    }) ?? [];
  }

  public static addSelectedPotion(player: Player, potionId: string, type: PotionBuffType) {
    this.get()?.getPlayerDataValue(player, true, (data) => {
      let found = false;
      for (let i = 0; i < data.selectedPotions.length; i++) {
        if (data.selectedPotions[i].type === type) {
          found = true;
          data.selectedPotions[i].id = potionId;
          break;
        }
      }

      if (!found) {
        data.selectedPotions.push({ type, id: potionId });
      }

      log.info("update selected potions after adding")
      PlayerDataEvents.sendEventOnServer(PlayerDataEvents.updateSelectedPotions, { player, selectedPotionsData: data.selectedPotions }, [player], true);
    })
  }

  public static removeSelectedPotion(player: Player, potionId: string) {
    this.get()?.getPlayerDataValue(player, true, (data) => {
      data.selectedPotions = data.selectedPotions.filter((selectedPotionData) => selectedPotionData.id !== potionId);
      PlayerDataEvents.sendEventOnServer(PlayerDataEvents.updateSelectedPotions, { player, selectedPotionsData: data.selectedPotions }, [player], true);
    })
  }

  public static setShovelLevelForPlayer(player: Player, shovelId: string, level: number) {
    return this.get()?.getPlayerDataValue(player, true, (data) => {
      data.shovelLevels ??= [];
      let entry = data.shovelLevels.find((entry) => entry.id === shovelId);
      if (entry) {
        entry.level = level;
      }
      else {
        data.shovelLevels.push({ id: shovelId, level: level })
      }
    });
  }

  public static getShovelLevelForPlayer(player: Player, shovelId: string): number {
    return this.get()?.getPlayerDataValue(player, false, (data) => data.shovelLevels.find((entry) => entry.id === shovelId)?.level) ?? 0;
  }

  public static fixupShovelLevels(player: Player) {
    this.get()?.getPlayerDataValue(player, true, (data) => {
      const isLegacy = data.shovelLevels === undefined || data.shovelLevels.length === 0; // no new data yet, retrieve old and migrate to new
      if (isLegacy) { // is there a better way to check if we're on EA?
        data.shovelLevels = [];
        let playerInventoryData = getPlayerInventoryData(PlayerData.instance!.world, player);
        if (playerInventoryData!.shovels.length > 0) {
          for (const id of playerInventoryData!.shovels) {
            let index = legacyShovelIds.indexOf(id);
            let level = data.shovelLevel[index];
            let entry = data.shovelLevels.find((entry) => entry.id === id);
            if (entry) {
              entry.level = level;
            }
            else {
              data.shovelLevels.push({ id, level })
            }
          }
        }
        log.info(`Player ${PlayerService.getPlayerName(player)} migrated legacy shovel data to new format`)
      }
    });
  }

  public static incrementBackpackLevel(player: Player) {
    let value = 0;
    this.get()?.getPlayerDataValue(player, true, (data) => {
      data.backpackLevel += 1;
      value = data.backpackLevel;
    });
    PlayerDataEvents.sendEventOnServer(PlayerDataEvents.backpackLevelUpdated, { player, level: value }, [player], true);
  }

  public static setBackpackLevel(player: Player, value: number) {
    this.get()?.getPlayerDataValue(player, true, (data) => data.backpackLevel = value);
  }

  public static getBackpackLevel(player: Player): number {
    return this.get()?.getPlayerDataValue(player, false, (data) => data.backpackLevel) ?? 0;
  }

  public static resetDigStreak(player: Player) {
    this.get()?.getPlayerDataValue(player, true, (data) => data.digStreak = 0);
  }

  public static incrementDigStreak(player: Player): number {
    return this.get()?.getPlayerDataValue(player, true, (data) => {
      data.digStreak = data.digStreak + 1;
      data.lifetimeDigs = data.lifetimeDigs + 1;
      return data.digStreak;
    }) ?? 0;
  }

  public static getDigStreak(player: Player): number {
    return this.get()?.getPlayerDataValue(player, false, (data) => data.digStreak % DIGSTREAK_AMOUNT) ?? 0;
  }

  public static getLifetimeDigs(player: Player): number {
    return this.get()?.getPlayerDataValue(player, false, (data) => data.lifetimeDigs) ?? 0;
  }

  public static canSuggestionPotion(player: Player): boolean {
    const result = this.get()?.getPlayerDataValue(player, false, (data) => data.potionSuggestionCooldown <= Date.now()) ?? false;
    return result;
  }

  public static startPotionSuggestionCooldown(player: Player) {
    this.get()?.getPlayerDataValue(player, true, (data) => {
      if (data.potionSuggestionCooldown === Number.MAX_SAFE_INTEGER) {
        data.potionSuggestionCooldown = Date.now() + GameConstants.Potion.POTION_SUGGESTION_COOLDOWN_DURATION
      }
    });
  }

  public static resetPotionSuggestionCooldown(player: Player) {
    this.get()?.getPlayerDataValue(player, true, (data) => data.potionSuggestionCooldown = Date.now() + GameConstants.Potion.POTION_SUGGESTION_COOLDOWN_DURATION);
  }

  public static skipPotionSuggestionCooldown(player: Player) {
    this.get()?.getPlayerDataValue(player, true, (data) => data.potionSuggestionCooldown = Date.now());
  }

  public static hasReceivedEngagementRewards(player: Player): boolean {
    const result = this.get()?.getPlayerDataValue(player, false, (data) => data.engagementReceived)
    return result ?? false
  }

  public static setReceivedEngagementRewards(player: Player) {
    this.get()?.getPlayerDataValue(player, true, (data) => data.engagementReceived = true)
  }

  public static getMigrationStatus(player: Player): MigrationStatus {
    const result = this.get()?.getPlayerDataValue(player, false, (data) => data.migrationStatus)
    return result ?? MigrationStatus.NotMigrated
  }

  public static setMigrated(player: Player, status: MigrationStatus) {
    this.get()?.getPlayerDataValue(player, true, (data) => data.migrationStatus = status)
  }


  // ---------------------------------------------------------------------------------------------------

  private createNewPlayerData(): PersistentPlayerData {
    // (3)
    return {
      initialized: 1,
      saveVersion: SAVE_VERSION,
      currency: 0,
      currencyEarned: 0,
      exp: 0,
      timePlayed: 0,
      tutorialComplete: 0,
      lastIsland: Islands.BeachCamp,
      gems: 0,
      selectedPotions: [],
      shovelLevel: [],
      shovelLevels: [],
      backpackLevel: 0,
      digStreak: 0,
      lifetimeDigs: 0,
      curatorTime: 0,
      potionSuggestionCooldown: Number.MAX_SAFE_INTEGER,
      engagementReceived: false,
      migrationStatus: MigrationStatus.NotMigrated,
    }
  }

  private isPlayerDataValid(playerData: PersistentPlayerData): boolean {
    if (playerData === undefined) {
      return false;
    }

    // (4)
    if ((playerData.initialized === undefined) ||
      (playerData.saveVersion === undefined) ||
      (playerData.currency === undefined) ||
      (playerData.currencyEarned === undefined) ||
      (playerData.exp === undefined) ||
      (playerData.timePlayed === undefined) ||
      (playerData.tutorialComplete === undefined) ||
      (playerData.lastIsland === undefined) ||
      (playerData.gems === undefined) ||
      (playerData.selectedPotions === undefined) ||
      (playerData.shovelLevel === undefined) ||
      //(playerData.shovelLevels === undefined) ||
      (playerData.backpackLevel === undefined) ||
      (playerData.digStreak === undefined) ||
      (playerData.curatorTime === undefined) ||
      (playerData.potionSuggestionCooldown === undefined)) {
      return false;
    }

    return true;
  }

  // ---------------------------------------------------------------------------------------------------

  private world!: World;
  private playerDataCache: Map<Player, PersistentPlayerData> = new Map();
  private isBatchingActive = false;
  private dirtyPlayers: Set<Player> = new Set();

  private static instance?: PlayerData;
  private static get() {
    if (this.instance === undefined) {
      const error = new Error();
      log.error(`Trying to access player data before initializing.  Add PlayerData.init() to start method in component.\n${error.stack}`);
    }
    return this.instance;
  }

  private constructor(world: World) {
    this.world = world;
  }

  public static init(world: World) {
    if (this.instance === undefined) {
      this.instance = new PlayerData(world);
    }
  }

  public static startBatch() {
    const instance = this.get();
    if (instance === undefined) {
      return;
    }
    if (instance.isBatchingActive) {
      log.warn("Cannot start batching, batching is already active...");
      return;
    }
    instance.isBatchingActive = true;
  }

  public static endBatch() {
    const instance = this.get();
    if (instance === undefined) {
      return;
    }
    if (!instance.isBatchingActive) {
      log.warn("Cannot end batching, batching isn't currently active...");
      return;
    }
    instance.isBatchingActive = false;
    instance.dirtyPlayers.forEach(player => {
      const playerData = instance.getPlayerData(player);
      if (playerData !== undefined) {
        instance.save(player, playerData);
      }
    });
    instance.dirtyPlayers.clear();
  }

  public static erase(player: Player) {
    const instance = this.get();
    if (instance === undefined) {
      return;
    }
    instance.erase(player);
  }

  public static print(player: Player) {
    const instance = this.get();
    if (instance === undefined) {
      return;
    }
    instance.print(player);
  }

  static clearCachedData(player: Player) {
    const instance = this.get();
    if (instance === undefined) {
      return;
    }
    instance.playerDataCache.delete(player);
  }

  private getPlayerDataValue<T>(player: Player, save: boolean, callback: (data: PersistentPlayerData) => T): T | undefined {
    const playerData = PlayerData.instance?.getPlayerData(player);
    if (playerData === undefined) {
      return undefined;
    }
    const result = callback(playerData);
    if (save) {
      if (this.isBatchingActive) {
        this.dirtyPlayers.add(player);
      } else {
        this.save(player, playerData);
      }
    }
    return result;
  }

  private getPlayerData(player: Player | undefined) {
    if (player === undefined) {
      player = this.world.getLocalPlayer();
    }
    if (player === this.world.getServerPlayer()) {
      log.warn("Cannot get player data for server player.");
      return undefined;
    }
    let playerData = this.playerDataCache.get(player);
    if (playerData === undefined) {
      const savedData = getPlayerVariableSafe<PersistentPlayerData>(this.world, player, PVAR_PLAYERDATA);
      if (savedData && savedData.initialized) {
        log.info(`Save Version: ${savedData.saveVersion}`);
        if (!this.isPlayerDataValid(savedData) || !savedData.saveVersion || !saveVersionMatches(savedData.saveVersion)) {
          log.info(`Player data for player (${PlayerService.getPlayerName(player)}) is out of date, resetting their data...`);
          playerData = this.createNewPlayerData();
        } else {
          this.fixSaveData(player, savedData);
          playerData = savedData;
        }
      } else {
        playerData = this.createNewPlayerData();
      }
      this.playerDataCache.set(player, playerData);
    }
    return playerData;
  }

  // This isn't ideal, we should try to prevent any issues where data is in a bad state
  // Use this as a quick fix until better implementations are in place
  private fixSaveData(player: Player, savedData: PersistentPlayerData) {
    let isDirty = false;

    // Fix: Player didn't trigger potion nudges during tutorial.
    if (savedData.tutorialComplete >= TutorialProgress.VISITED_LOCATION &&
      savedData.potionSuggestionCooldown === Number.MAX_SAFE_INTEGER) {
      savedData.potionSuggestionCooldown = Date.now();
      isDirty = true;
    }

    if (savedData.timePlayed > 0) {
      PlayerData.setTimePlayed(player, savedData.timePlayed)
      savedData.timePlayed = 0;
      isDirty = true;
    }

    if (isDirty) {
      this.save(player, savedData);
    }
  }

  private save(player: Player, playerData: PersistentPlayerData) {
    log.info(`Saving player data for player (${PlayerService.getPlayerName(player)})...`);
    setPlayerVariableSafe(this.world, player, PVAR_PLAYERDATA, playerData);
  }

  private erase(player: Player) {
    const newData = this.createNewPlayerData();
    this.playerDataCache.set(player, newData);
    setPlayerVariableSafe(this.world, player, PVAR_PLAYERDATA, newData);
  }

  private print(player: Player) {
    const playerData = PlayerData.instance?.getPlayerData(player);
    if (playerData === undefined) {
      return;
    }

    // !! Leave as console.log !!
    console.log(`Player Data for ${PlayerService.getPlayerName(player)}\n${JSON.stringify(playerData)}`);
  }
}
