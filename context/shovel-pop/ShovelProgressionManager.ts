/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_ToastEvents } from 'BigBox_ToastManager';
import { Debug } from 'Debug';
import { Events } from 'Events';
import { setPlayerVariableSafe } from 'GameUtils';
import * as hz from 'horizon/core';
import { Player } from 'horizon/core';
import { Logger } from 'Logger';
import { PlayerData } from 'PlayerData';
import { getPlayerInventoryData, PlayerInventoryData } from 'PlayerInventoryData';
import { PVAR_INVENTORY, SAVE_VERSION, saveVersionMatches, SHOULD_USE_PERSISTENCE } from 'PVarConsts';
import { ShovelData, ShovelLevelData } from 'ShovelData';
import { ShovelProgressionEvents } from 'ShovelProgressionEvents';
import { Analytics } from 'TurboAnalytics';

const log = new Logger("ShovelProgressionManager");
export const legacyShovelIds: string[] = [
    "shovel_base01",
    "shovel_trusty",
    "shovel_trusty02",
    "shovel_trusty03",
    "shovel_trusty04",
    "shovel_pizza",
    "shovel_pizza02",
    "shovel_pizza03",
    "shovel_pizza04",
    "shovel_aquatic",
    "shovel_aquatic02",
    "shovel_aquatic03",
    "shovel_aquatic04",
    "shovel_fortune",
    "shovel_fortune02",
    "shovel_fortune03",
    "shovel_fortune04",
    "shovel_jungle",
    "shovel_jungle02",
    "shovel_jungle03",
    "shovel_jungle04",
    "shovel_skeleton",
    "shovel_skeleton02",
    "shovel_skeleton03",
    "shovel_skeleton04",
    "shovel_wisdom",
    "shovel_wisdom02",
    "shovel_wisdom03",
    "shovel_wisdom04",
    "shovel_icepop",
    "shovel_icepop02",
    "shovel_icepop03",
    "shovel_icepop04",
    "shovel_magic",
    "shovel_magic02",
    "shovel_magic03",
    "shovel_magic04",
    "shovel_creature",
    "shovel_inflate",
    "shovel_pink",
    "shovel_base04",
    "shovel_jewel",
    "shovel_evil",
    "shovel_surf",
    "shovel_base02",
    "shovel_broom",
    "shovel_base05",
    "shovel_captain",
    "shovel_prismatic"
];

//Shovel version of DigManager
export class ShovelProgressionManager extends hz.Component<typeof ShovelProgressionManager> {
  static propsDefinition = {
    itemDataRoot: { type: hz.PropTypes.Entity },
    equipShovelSound: { type: hz.PropTypes.Entity },
  };

  // Singleton
  private static _instance: ShovelProgressionManager | null;
  public static get instance(): ShovelProgressionManager { return this._instance!; }

  public static IsReady() {
    return ShovelProgressionManager.instance && ShovelProgressionManager.instance.isReady;
  }

  private isReady = false;

  private idToData = new Map<string, ShovelData>();
  allShovels: ShovelData[] = [];

  private idToNextShovelData = new Map<string, ShovelData>();

  private playerToUIMap = new Map<hz.Player, hz.Entity>();

  private defaultShovelId = "shovel_base01";

  start() {
    ShovelProgressionManager._instance = this;

    this.connectNetworkBroadcastEvent(Events.onShovelInitialized, (player: Player) => {
      if (!player) {
        log.info("[ShovelProgressionManager] onShovelInitialized failed")
        return;
      }
      log.info("[ShovelProgressionManager] onShovelInitialized " + player + " id " + player.id + " server player " + this.world.getServerPlayer());
      //log.info("[ShovelProgressionManager] onShovelInitialized " + player.id)

      // TODO: temporary until bad data is purged
      //this.setShovel(playerId, this.defaultShovelId);
      this.setShovel(player, this.getShovelId(player));
    });

    this.connectNetworkBroadcastEvent(ShovelProgressionEvents.requestNextShovelDataForPlayer, (data) => {
      let nextShovelData = this.getNextShovelDataForPlayer(data.player);
      if (!nextShovelData) {
        log.info("[ShovelProgressionManager] no next shovel data");
        return
      }

      this.sendNetworkBroadcastEvent(ShovelProgressionEvents.returnNextShovelDataForPlayer,
        { player: data.player, shovelName: nextShovelData.name, shovelPrice: nextShovelData.price, shovelLevelRequirement: nextShovelData.levelRequirement },
        [data.player]
      );
    });

    this.connectNetworkBroadcastEvent(ShovelProgressionEvents.requestResetShovelForPlayer, (data) => {
      let playerInventoryData: PlayerInventoryData = this.createPlayerInventoryData();
      setPlayerVariableSafe(this.world, data.player, PVAR_INVENTORY, playerInventoryData);
      this.setShovel(data.player, this.defaultShovelId);
    });

    this.connectNetworkBroadcastEvent(ShovelProgressionEvents.requestSetShovelForPlayer, (payload) => {
      this.setShovel(payload.player!, payload.shovelId);
    });

    this.connectNetworkBroadcastEvent(ShovelProgressionEvents.requestCycleShovelForPlayer, (data) => {
      this.equipNextShovel(data.player);
    });

    this.connectNetworkBroadcastEvent(Events.requestShovelUpgrade, (data) => { // is this the right spot?
      const gems = PlayerData.getGems(data.player);
      if (gems > 0){
        let level = this.getShovelLevel(data.player, data.shovelId)
        level++;
        PlayerData.startBatch();
        PlayerData.addGems(data.player, -data.gemCost)
        this.setShovelLevel(data.player, data.shovelId, level);
        Analytics()?.sendLevelUp({ player: data.player, playerLevel: level+1, playerTitle: `shovel_level,${data.shovelId},${data.gemCost}` });
        PlayerData.endBatch();
        this.sendLocalBroadcastEvent(Events.shovelUpgradeEvent, { player: data.player, shovelId: data.shovelId, level: level});
        this.sendNetworkBroadcastEvent(Events.shovelSetLevel, { player: data.player, shovel: data.shovelId, level: level }, [data.player, this.world.getServerPlayer()]);
      }
    });
  }

  private equipNextShovel(player: Player) {
    let playerInventoryData = getPlayerInventoryData(this.world, player);

    if (playerInventoryData == null || !this.isValidPlayerInventoryData(playerInventoryData)) {
      log.error("[ShovelProgressionManager] Failed to get inventory persistent var");
      return;
    }

    let shovels = playerInventoryData.shovels;
    let currentShovelIndex = shovels.indexOf(playerInventoryData.shovelId);
    if (currentShovelIndex === -1) {
      log.error("[ShovelProgressionManager] Failed to find current shovel in inventory");
      return;
    }

    let nextShovelIndex = (currentShovelIndex + 1) % shovels.length;
    let nextShovelId = shovels[nextShovelIndex];
    this.setShovel(player, nextShovelId);
  }

  // Give player a shovel
  public giveShovel(player: Player, shovelId: string, autoEquip: boolean) {
    let playerInventoryData = getPlayerInventoryData(this.world, player);

    if (playerInventoryData == null || !this.isValidPlayerInventoryData(playerInventoryData)) {
      // First time player has a shovel
      playerInventoryData = this.createPlayerInventoryData();
      setPlayerVariableSafe(this.world, player, PVAR_INVENTORY, playerInventoryData);
    }

    if (!playerInventoryData.shovels.includes(shovelId)) {
      playerInventoryData.shovels.push(shovelId);
      setPlayerVariableSafe(this.world, player, PVAR_INVENTORY, playerInventoryData);
      this.sendNetworkBroadcastEvent(ShovelProgressionEvents.shovelGivenToPlayer, { player: player, shovelId: shovelId }, [this.world.getServerPlayer(), player]);
    }
    else {
      log.info("[ShovelProgressionManager] Trying to give player " + player.id + " shovel " + shovelId + " but they already have it");
    }

    const data = this.idToData.get(shovelId)!
    if (data.defaultLevel > 0){
      this.setShovelLevel(player, shovelId, data.defaultLevel);
      this.sendNetworkBroadcastEvent(Events.shovelSetLevel, { player: player, shovel: shovelId, level: data.defaultLevel }, [player, this.world.getServerPlayer()]);
    }

    if (autoEquip) {
      // Auto equip the new shovel
      this.setShovel(player, shovelId);
    }
  }

  // Set shovel for player
  public setShovel(player: Player, id: string) {
    // Set the persistent variable before checking if data has index so we
    // can still save data in case this fails.
    let playerInventoryData = getPlayerInventoryData(this.world, player);

    if (playerInventoryData == null || !this.isValidPlayerInventoryData(playerInventoryData)) {
      log.error("[ShovelProgressionManager] Failed to get inventory persistent var");
      return;
    }
    if (!playerInventoryData.shovels.includes(id)) {
      log.info("[ShovelProgressionManager] player doesn't have shovel " + id);
      return;
    }
    let shovelChanged: boolean = playerInventoryData.shovelId !== id;
    playerInventoryData.shovelId = id;
    setPlayerVariableSafe(this.world, player, PVAR_INVENTORY, playerInventoryData);

    log.info("[ShovelProgressionManager] set shovel " + id)
    this.sendNetworkBroadcastEvent(Events.playerShovelChanged, ({ player: player, shovelId: id }), [player, this.world.getServerPlayer()])
    if (shovelChanged) {
      this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, { player: player, text: `Equipped ${this.idToData.get(id)!.name} Shovel` })
      this.props.equipShovelSound?.as(hz.AudioGizmo).play({
        fade: 0,
        players: [player],
        audibilityMode: hz.AudibilityMode.AudibleTo
      })
    }
  }

  catalogData(allItemData: ShovelData[]) {
    this.allShovels = allItemData;
    allItemData.forEach((shovelData: ShovelData, index: number) => {
      this.idToData.set(shovelData.id, shovelData);
    });

    allItemData.sort((a, b) => a.price - b.price);

    for (let index = 0; index < allItemData.length; index++) {
      if (index < allItemData.length - 1) {
        this.idToNextShovelData.set(allItemData[index].id, allItemData[index + 1]);
      }
    }

    this.isReady = true;

    this.sendLocalBroadcastEvent(ShovelProgressionEvents.shovelProgressionManagerReady, {});

    this.allShovels.forEach(shovel => {
      Debug.addCommand(`Shovel/${shovel.name}/Add`, (player) => this.giveShovel(player, shovel.id, true));
      Debug.addCommand(`Shovel/${shovel.name}/Level Up`, (player) => this.debug_levelUpShovel(player, shovel.id));
    });
  }

  getShovelId(player: Player): string {
    let shovelId = this.defaultShovelId;

    if (!player || !SHOULD_USE_PERSISTENCE) {
      return shovelId;
    }
    let playerInventoryData = getPlayerInventoryData(this.world, player);

    if (playerInventoryData == null || !this.isValidPlayerInventoryData(playerInventoryData)) {
      playerInventoryData = this.createPlayerInventoryData();
      setPlayerVariableSafe(this.world, player, PVAR_INVENTORY, playerInventoryData);
    }
    else {
      shovelId = playerInventoryData.shovelId;
    }

    if (!this.idToData.has(shovelId)) {
      if (playerInventoryData !== null && this.isValidPlayerInventoryData(playerInventoryData)) {
        playerInventoryData.shovelId = this.defaultShovelId;
        setPlayerVariableSafe(this.world, player, PVAR_INVENTORY, playerInventoryData);
      }

      return this.defaultShovelId;
    }

    return shovelId;
  }

  public getBaseShovelDataForPlayer(player: Player): ShovelData | undefined {
    return this.idToData.get(this.getShovelId(player));
  }

  public getShovelDataForPlayer(player: Player): ShovelData | undefined {
    let baseShovelId = this.getShovelId(player);
    let shovelData = this.idToData.get(baseShovelId)
    let shovelLevel = this.getShovelLevel(player, baseShovelId)
    while (shovelData && shovelData.evolutionLevel <= shovelLevel && shovelData.evolution) {
      let nextData = this.idToData.get(shovelData.evolution)
      if (nextData) {
        shovelData = nextData
      }
      else {
        break;
      }
    }

    return shovelData;
  }

  public getNextShovelDataForPlayer(player: Player): ShovelData | undefined {
    return this.idToNextShovelData.get(this.getShovelId(player));
  }

  public getShovelLevelDataForPlayer(player: Player): ShovelLevelData | undefined {
    let shovelData = this.getBaseShovelDataForPlayer(player);
    if (!shovelData) {
      log.error("[ShovelProgressionManager] No shovel data for player " + player.id);
      return undefined;
    }
    let effectiveShovelLevel = Math.min(this.getShovelLevel(player, shovelData.id), shovelData.levelData.length-1)
    return shovelData.levelData[effectiveShovelLevel];
  }

  public getShovelDataForId(id: string): ShovelData | undefined {
    return this.idToData.get(id);
  }

  public hasShovel(player: Player, shovelId: string): boolean {
    let playerInventoryData = getPlayerInventoryData(this.world, player)!;
    return playerInventoryData.shovels.includes(shovelId);
  }

  public getShovelLevel(player: Player, shovelId: string): number {
    let baseShovelId = shovelId;
    let shovelData = this.getShovelDataForId(shovelId);
    if (shovelData?.baseShovel && shovelData.baseShovel.length > 0) {
      // Verify that the base shovel data is good
      let baseShovelData = this.getShovelDataForId(shovelData.baseShovel);
      if (baseShovelData) {
        baseShovelId = baseShovelData.id;
      }
      else {
        log.error(`Base shovel data for ${shovelId} is invalid.`);
      }
    }

    PlayerData.fixupShovelLevels(player);
    return PlayerData.getShovelLevelForPlayer(player, baseShovelId);
  }

  public setShovelLevel(player: Player, shovelId: string, level: number) {
      let shovelData = ShovelProgressionManager.instance.getShovelDataForId(shovelId);
      if (shovelData !== undefined) {
        PlayerData.setShovelLevelForPlayer(player, shovelId, level);
      }
  }

  private isValidPlayerInventoryData(playerInventoryData: PlayerInventoryData) {
    return playerInventoryData !== undefined && playerInventoryData.shovels !== undefined && playerInventoryData.shovelId !== undefined && playerInventoryData.inventory !== undefined && playerInventoryData.saveVersion && saveVersionMatches(playerInventoryData.saveVersion);
  }

  private createPlayerInventoryData(): PlayerInventoryData {
    return { saveVersion: SAVE_VERSION, shovels: [this.defaultShovelId], shovelId: this.defaultShovelId, inventory: [], potionInventory: [] };;
  }

  private debug_levelUpShovel(player: hz.Player, id: string): void {
    let level = this.getShovelLevel(player, id)
    level++;
    this.setShovelLevel(player, id, level);
    this.sendNetworkBroadcastEvent(Events.shovelSetLevel, { player: player, shovel: id, level: level }, [player, this.world.getServerPlayer()]);
  }
}
hz.Component.register(ShovelProgressionManager);
