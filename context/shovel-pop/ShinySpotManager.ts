/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Debug } from 'Debug';
import { DigZone } from 'DigZone';
import { DigZoneManager } from 'DigZoneManager';
import { Events } from 'Events';
import * as GameUtils from 'GameUtils';
import { AssetSpawnLog } from 'GlobalLoggers';
import * as hz from 'horizon/core';
import { Entity, Player, Vec3, World } from 'horizon/core';
import { getIslandFromID, getIslandID, Islands } from 'Islands';
import { IslandShinySpotLocators } from 'IslandShinySpotLocators';
import { IslandEvents } from 'IslandTeleportManager';
import { ItemContainer } from 'ItemContainer';
import { Logger } from 'Logger';
import { PlayerData } from 'PlayerData';
import { PlayerDataEvents } from 'PlayerDataEvents';
import { IPlayerEnterExitWorldListener, PlayerService } from 'PlayerService';
import { PoolObjectAssigner } from 'PoolObjectAssigner';
import { QuestEvents } from 'QuestManager';
import { ShinySpot } from 'ShinySpot';
import { ShinySpotWorldData } from 'ShinySpotWorldData';
import { SubquestData } from 'SubquestData';
import { TutorialProgress } from 'TutorialManager';

const SHINY_SPOTS_PER_PLAYER = 48;
const LTE_SPOTS_PER_PLAYER = 5
const SHINY_SPOT_EFFECTS_PER_PLAYER = 10;
const TOTAL_SHINY_SPOTS_PER_PLAYER = SHINY_SPOTS_PER_PLAYER + LTE_SPOTS_PER_PLAYER;
const SHINY_SPOT_PLAYER_ASSIGN_DELAY = 5000;
const NEW_SHINY_SPOT_SPAWN_INTERVAL = 0;
const SHINY_SPOT_EFFECT_UPDATE_INTERVAL = 2000;

const log = new Logger('ShinySpotManager');

class ShinySpotPoolManager extends hz.Component<typeof ShinySpotPoolManager> implements IPlayerEnterExitWorldListener {
  static propsDefinition = {
    spawnTime: { type: hz.PropTypes.Number, default: 30 }, //seconds
    tutorialShinySpotLocation: { type: hz.PropTypes.Entity },
    shinySpotSubquest: { type: hz.PropTypes.Entity },
    shinySpotAsset: { type: hz.PropTypes.Asset },
  };

  playerShinySpotManagers: Map<Player, PlayerShinySpotManager> = new Map();
  shinySpotSubquestData!: SubquestData<typeof SubquestData>;
  activeLteZones: DigZone[] = []

  private overrideRespawnTime?: number;

  start() {
    PlayerData.init(this.world);
    PlayerService.connectPlayerEnterExitWorldListener(this);
    this.connectNetworkBroadcastEvent(Events.playerDigComplete, (data) => this.onDigComplete(data))
    this.connectNetworkBroadcastEvent(Events.playerShovelChanged, (payload) => this.refreshPlayerShinySpotUIs(payload.player));
    this.connectNetworkBroadcastEvent(Events.shovelSetLevel, (payload) => this.refreshPlayerShinySpotUIs(payload.player))
    this.connectNetworkBroadcastEvent(IslandEvents.playerTeleportedToIsland, (data) => this.spawnAllIslandShinySpots(data.player)); // Spawn shiny spots when player goes to a new island
    this.connectLocalBroadcastEvent(Events.onLteZoneStart, (data) => this.onLteZoneStart(data.zone));
    this.connectLocalBroadcastEvent(Events.onLteZoneEnd, (data) => this.onLteZoneEnd(data.zone));
    this.connectLocalBroadcastEvent(Events.shinySpotUsed, (shinySpot) => this.onShinySpotUsed(shinySpot));
    this.connectLocalBroadcastEvent(World.onUpdate, (data) => this.update(data.deltaTime));
    this.connectNetworkBroadcastEvent(PlayerDataEvents.tutorialCompleteUpdated, (data) => this.onTutorialCompleteUpdated(data));
    this.connectNetworkBroadcastEvent(Events.shinySpotTriggerEnter, (data) => {
      this.sendLocalBroadcastEvent(QuestEvents.requestFinishSubquestForPlayer, { player: data.player, questId: this.shinySpotSubquestData.props.id });
    });

    this.shinySpotSubquestData = this.props.shinySpotSubquest!.getComponents(SubquestData)[0];

    Debug.addCommand("Shiny Spots/Override Respawn Time/CLEAR", (_) => this.overrideRespawnTime = undefined);
    Debug.addCommand("Shiny Spots/Override Respawn Time/10 seconds", (_) => this.overrideRespawnTime = 10);
    Debug.addCommand("Shiny Spots/Override Respawn Time/30 seconds", (_) => this.overrideRespawnTime = 10);
    Debug.addCommand("Shiny Spots/Override Respawn Time/60 seconds", (_) => this.overrideRespawnTime = 10);
  }

  private onTutorialCompleteUpdated(data: { player: Player; tutorialComplete: number; }): void {
    // We only care about tutorial complete before the first minigame tutorial
    if (data.tutorialComplete > TutorialProgress.COMPLETED_MINIGAME) {
      return;
    }
    this.spawnAllIslandShinySpots(data.player, true);
  }

  private spawnAllIslandShinySpots(player: hz.Player, reset = false): void {
    this.playerShinySpotManagers.get(player)?.spawnAllIslandShinySpots(reset);
  }

  onPlayerEnterWorld(player: Player): void {
    const playerShinySpotManager = new PlayerShinySpotManager(this, player);
    this.playerShinySpotManagers.set(player, playerShinySpotManager);
    // Make sure pool is created before assigning shiny spots
    // TODO: should we spawn more shiny spots
    this.async.setTimeout(() => {
      this.assignPlayerShinySpots(player);
    }, SHINY_SPOT_PLAYER_ASSIGN_DELAY);
  }

  onPlayerExitWorld(player: Player): void {
    const playerShinySpotManager = this.playerShinySpotManagers.get(player);
    if (playerShinySpotManager) {
      playerShinySpotManager.allShinySpotEffects.forEach(effect => {
        ShinySpot.s_pool.push(effect.entity);
      });
      playerShinySpotManager.destroy();
      this.playerShinySpotManagers.delete(player);
    }
  }

  private update(deltaTime: number): void {
    this.playerShinySpotManagers.forEach((playerShinySpotManager) => {
      playerShinySpotManager.update(deltaTime);
    });
  }

  private refreshPlayerShinySpotUIs(player: Player) {
    const playerShinySpotManager = this.playerShinySpotManagers.get(player);
    if (!playerShinySpotManager) {
      return;
    }
    playerShinySpotManager.forEachActive((shinySpot) => {
      if (shinySpot.itemId !== "") {
        shinySpot.refreshUI();
      }
    });
  }

  private onDigComplete(data: { player: Player; isSuccess: boolean; itemId: string; }) {
    if (!data.isSuccess) {
      return;
    }
    const playerShinySpotManager = this.playerShinySpotManagers.get(data.player);
    if (!playerShinySpotManager) {
      return;
    }
    playerShinySpotManager.onPlayerDigComplete(data.itemId);
  }

  private onShinySpotUsed(shinySpot: ShinySpotWorldData): void {
    this.playerShinySpotManagers.get(shinySpot.player)?.onShinySpotUsed(shinySpot);
  }

  private onLteZoneStart(lteZone: DigZone): void {
    this.activeLteZones.push(lteZone)
    this.playerShinySpotManagers.forEach((playerShinySpotManager) => {
      if (lteZone.getCurrentZoneItems(playerShinySpotManager.player) !== undefined) {
        playerShinySpotManager.spawnLteSpots(lteZone)
      }
    });
  }

  private onLteZoneEnd(lteZone: DigZone): void {
    this.activeLteZones = this.activeLteZones.filter(zone => zone !== lteZone)
    this.playerShinySpotManagers.forEach((playerShinySpotManager) => {
      playerShinySpotManager.removeLteSpots(lteZone)
    });
  }

  assignPlayerShinySpots(player: Player) {
    if (!PlayerService.isConnected(player)) {
      return;
    }

    if (ShinySpot.s_pool.length < SHINY_SPOTS_PER_PLAYER + LTE_SPOTS_PER_PLAYER) {
      const missingSpots = SHINY_SPOTS_PER_PLAYER + LTE_SPOTS_PER_PLAYER - ShinySpot.s_pool.length;
      log.error(`not enough shiny spots in pool, waiting for more ${missingSpots}`);
      for (let i = 0; i < missingSpots; i++) {
        AssetSpawnLog.info("Spawn Asset (Add Shiny Spot)");
        this.world.spawnAsset(this.props.shinySpotAsset!, this.entity.position.get())
      }
      this.async.setTimeout(() => {
        this.assignPlayerShinySpots(player);
      }, 500);
      return;
    }

    log.info(`assigning shiny spots to player ${player} ${SHINY_SPOTS_PER_PLAYER + LTE_SPOTS_PER_PLAYER}`);
    const playerShinySpotManager = this.playerShinySpotManagers.get(player);
    if (playerShinySpotManager === undefined) {
      log.error(`playerShinySpotManager not found for player ${player}`);
      return;
    }
    for (let i = 0; i < SHINY_SPOT_EFFECTS_PER_PLAYER; i++) {
      const shinySpotEntity = ShinySpot.s_pool.pop()!;
      playerShinySpotManager.addShinySpotEffect(shinySpotEntity);
    }
    for (let i = 0; i < SHINY_SPOTS_PER_PLAYER; i++) {
      playerShinySpotManager.addShinySpot();
    }
    for (let i = 0; i < LTE_SPOTS_PER_PLAYER; i++) {
      playerShinySpotManager.addShinySpot(true);
    }

    playerShinySpotManager.initialized = true;
    playerShinySpotManager.spawnAllIslandShinySpots();

    this.activeLteZones.forEach(zone => {
      playerShinySpotManager.spawnLteSpots(zone)
    })
  }

  getRespawnTime(): number {
    return this.overrideRespawnTime ?? this.props.spawnTime;
  }
}
hz.Component.register(ShinySpotPoolManager);

class PlayerShinySpotManager {
  public allShinySpotEffects: ShinySpot[] = [];
  private allShinySpots: ShinySpotWorldData[] = [];
  private activeIslandShinySpots: ShinySpotWorldData[] = []; // Currently in the world
  private availableIslandShinySpots: ShinySpotWorldData[] = []; // Available to use
  private activeLTESpots: ShinySpotWorldData[] = []; // Currently in the world for LTE
  private availableLTESpots: ShinySpotWorldData[] = []; // Available to use for LTE
  private unusedSpots: ShinySpotWorldData[] = [];
  private shinySpotsInDigZone: Map<string, ShinySpotWorldData[]> = new Map();

  public initialized: boolean = false;
  private spawnedForIsland: Islands = Islands.None;
  private uiInitialized: boolean = false;
  private newShinySpotTime: number = 0;
  private nextShinySpotEffectUpdateTime: number = 0;

  constructor(private component: ShinySpotPoolManager, public player: Player) {
    this.waitForUIInitialization();
    // TODO: Possibly save shiny spot locations to persistent storage and/or time
    // so it can't be abused?
  }

  update(deltaTime: number) {
    this.spawnShinySpotIfReady();
    this.updateShinySpotEffects();
  }

  onPlayerDigComplete(itemId: string) {
    this.forEachActive(shinySpot => {
      if (shinySpot.isPlayerOnSpot()) {
        shinySpot.onPlayerDigComplete(itemId);
      }
    })
  }

  destroy() {
    for (let i = 0; i < this.allShinySpots.length; i++) {
      let shinySpot = this.allShinySpots[i];
      shinySpot.dispose();
    }

    this.allShinySpots = [];
    this.activeIslandShinySpots = [];
    this.availableIslandShinySpots = [];
    this.activeLTESpots = [];
    this.availableLTESpots = []

    this.uiInitialized = false;
    this.initialized = false;
  }

  addShinySpotEffect(shinySpotEntity: Entity) {
    const shinySpot = shinySpotEntity.getComponents<ShinySpot>()[0];
    this.allShinySpotEffects.push(shinySpot);
    shinySpot.setPlayer(this.player);
  }

  addShinySpot(lteSpot = false) {
    const shinySpot = new ShinySpotWorldData(this.player, this.component, lteSpot);
    if (lteSpot) {
      this.availableLTESpots.push(shinySpot);
    } else {
      this.availableIslandShinySpots.push(shinySpot);
    }
    this.allShinySpots.push(shinySpot);
  }

  forEachActive(callback: (shinySpot: ShinySpotWorldData) => void) {
    this.activeIslandShinySpots.forEach(shinySpot => callback(shinySpot));
    this.activeLTESpots.forEach(shinySpot => callback(shinySpot));
  }

  onShinySpotUsed(shinySpot: ShinySpotWorldData) {
    if (!this.activeIslandShinySpots.includes(shinySpot) && !this.activeLTESpots.includes(shinySpot)) {
      // not for this player
      return;
    }
    let isRespawned = false;
    shinySpot.resetOff(false);
    if (shinySpot && shinySpot.autoRespawn) {
      var spawnPosition: Vec3 | undefined;
      spawnPosition = this.getNewPositionForShinySpotWithCurrentParameters(shinySpot);
      if (spawnPosition) {
        shinySpot.setup("", spawnPosition);
        shinySpot.resetOn();
        isRespawned = true;
        log.info("shiny spot autorespawn")
      } else {
        log.error(`No available locator spot for recycled shiny spot in ${shinySpot.zoneSettings.id}`);
      }
    }
    if (!isRespawned) {
      if (shinySpot.lteSpot) {
        this.activeLTESpots.splice(this.activeLTESpots.indexOf(shinySpot), 1);
        if (this.availableLTESpots.indexOf(shinySpot) < 0) {
          this.availableLTESpots.push(shinySpot);
        }
        shinySpot.zoneSettings.shinySpotIndex = -1;
        log.info('LTE spot used, ' + this.availableLTESpots.length + ' available')
      }
      else {
        this.activeIslandShinySpots.splice(this.activeIslandShinySpots.indexOf(shinySpot), 1);
        this.availableIslandShinySpots.push(shinySpot);
        shinySpot.timeToRespawn = this.component.getRespawnTime() * 1000 + Date.now();
        shinySpot.zoneSettings.shinySpotIndex = -1;
        log.info('Shiny spot used, ' + this.availableIslandShinySpots.length + ' available')
      }
    }
  }

  spawnAllIslandShinySpots(reset = false) {
    if (!this.initialized) {
      log.info('Shiny spots initialized yet, waiting to spawn shiny spots');
      return;
    }

    if (!this.uiInitialized) {
      log.info('UI not initialized yet, waiting to spawn shiny spots');
      return;
    }

    if (!DigZoneManager.IsReady()) {
      const subscription = this.component.connectLocalBroadcastEvent(DigZoneManager.digZoneManagerReady, () => {
        this.spawnAllIslandShinySpots();
        subscription.disconnect();
      });
      return;
    }

    // Need ItemContainer to be ready so that the UI and the shiny spots can be set up properly
    if (!ItemContainer.IsReady()) {
      const subscription = this.component.connectLocalBroadcastEvent(ItemContainer.itemDataLoadComplete, () => {
        this.spawnAllIslandShinySpots();
        subscription.disconnect();
      });
      return;
    }

    const island = PlayerData.getLastIslandVisited(this.player);
    if (this.spawnedForIsland === island && !reset) {
      log.info(`already spawned shiny spots for this island ${island}`);
      return;
    }
    this.spawnedForIsland = island;

    // Reset all island shiny spots, leave LTE alone
    this.activeIslandShinySpots.forEach(shinySpot => {
      shinySpot.resetOff(true);
    });
    this.availableIslandShinySpots.push(...this.activeIslandShinySpots);
    this.availableIslandShinySpots.push(...this.unusedSpots);
    this.activeIslandShinySpots = [];
    this.unusedSpots = [];
    this.shinySpotsInDigZone.forEach((spots, id) => {
      const digZone = DigZoneManager.instance.getDigZoneFromZoneId(id);
      // Delete everything that isn't LTE related
      if (!digZone || digZone.props.island !== "LTE") {
        this.shinySpotsInDigZone.delete(id);
      }
    });

    if (PlayerData.getTutorialComplete(this.player) < TutorialProgress.TALKED_TO_DOUG) {
      // Haven't talked to Doug yet, don't spawn any shiny spots
      return;
    }
    else if (PlayerData.getTutorialComplete(this.player) < TutorialProgress.COMPLETED_MINIGAME) {
      // Spawn shiny spot for tutorial
      const shinySpot = this.availableIslandShinySpots.pop();
      if (shinySpot === undefined) {
        log.error(`No shiny spot available for player: ${this.player.id} for tutorial`);
        return;
      }
      const tutorialShinySpotLocation = this.component.props.tutorialShinySpotLocation;
      if (tutorialShinySpotLocation) {
        const position = tutorialShinySpotLocation.position.get();
        this.activeIslandShinySpots.push(shinySpot);
        shinySpot.setIsland(island);
        shinySpot.setup("", position, true);
        shinySpot.resetOn();
        log.info('Spawning shiny spot for tutorial at ' + position.toString());
      }
      else {
        log.error("No tutorial shiny spot location set");
        this.availableIslandShinySpots.push(shinySpot);
      }
      return;
    }

    // Logic to spawn the initial shiny spots
    let digZones = DigZoneManager.instance.getIslandRegions(island)

    // Only for debugging how many total items there are in the punchcards
    let totalItemCount = 0;
    for (let i = 0; i < digZones.length; i++) {
      const digZone = digZones[i];
      log.info('Adding shiny spots for digzone ' + digZone.props.id)
      let regionItems = DigZoneManager.instance.getZoneCategoriesAndItemsForZone(this.player, digZone);
      totalItemCount += regionItems.length;
    }

    log.info('totalItemCount ' + totalItemCount);

    for (let i = 0; i < digZones.length; i++) {
      const digZone = digZones[i];
      log.info('Adding shiny spots for digzone ' + digZone.props.id)

      let regionItems = digZone.getCurrentZoneItems(this.player);
      log.info('digzone ' + digZone.props.id + ': regionItems ' + regionItems.map(item => item.itemId));

      for (let j = 0; j < regionItems.length; j++) {
        const shinySpot = this.availableIslandShinySpots.pop();
        if (shinySpot === undefined) {
          log.error(`No shiny spot available for player: ${this.player.id} for punchcard item ${regionItems[j].itemId} in zone ${digZone.props.id}`);
          continue;
        }
        shinySpot.setDigZone(digZone);
        const spawnPosition = this.getNewPositionForShinySpotWithCurrentParameters(shinySpot);
        if (spawnPosition) {
          this.activeIslandShinySpots.push(shinySpot);
          shinySpot.autoRespawn = false
          // Add a shiny spot for each item on the punchcard
          const itemId = regionItems[j].itemId;
          log.info('Adding shiny spot for item ' + itemId + ' at position ' + spawnPosition.toString());
          shinySpot.setup(itemId, spawnPosition);
          shinySpot.resetOn();

          if (!this.shinySpotsInDigZone.has(digZone.props.id)) {
            this.shinySpotsInDigZone.set(digZone.props.id, []);
          }
          this.shinySpotsInDigZone.get(digZone.props.id)!.push(shinySpot);
        } else {
          log.error('No available locator spot for shiny spot in digzone ' + digZone.props.id + ' for item ' + regionItems[j].itemId + ' for player ' + PlayerService.getPlayerName(this.player));
          this.availableIslandShinySpots.push(shinySpot);
        }
      }
    }

    // Spawn common shiny spots around the current island
    const islandId = getIslandID(island)!;
    while (this.availableIslandShinySpots.length > 0) {
      const shinySpot = this.availableIslandShinySpots.pop();
      if (shinySpot === undefined) {
        log.error(`No shiny spot available for player: ${this.player.id} for common island shiny spot`);
        continue;
      }
      shinySpot.setIsland(island);
      const spawnPosition = this.getNewPositionForShinySpotWithCurrentParameters(shinySpot);
      if (spawnPosition) {
        log.info("spawning new shiny spot at " + spawnPosition.toString() + " for " + this.player.id + " shinyspot id " + shinySpot.id);
        this.activeIslandShinySpots.push(shinySpot);
        shinySpot.setup("", spawnPosition);
        shinySpot.resetOn();
        if (!this.shinySpotsInDigZone.has(islandId)) {
          this.shinySpotsInDigZone.set(islandId, []);
        }
        this.shinySpotsInDigZone.get(islandId)!.push(shinySpot);
      } else {
        log.info(`No position found for common island shiny spot, player: ${this.player.id} in zone ${islandId}`)
        // No more spaces on island, let's put the shiny spot back and stop placing.
        this.unusedSpots.push(shinySpot);
      }
    }
  }

  public spawnLteSpots(digZone: DigZone) {
    digZone.maybeSetupItems()
    if (!this.shinySpotsInDigZone.has(digZone.props.id)) {
      this.shinySpotsInDigZone.set(digZone.props.id, []);
    }

    let punchcardItems = digZone.getCurrentZoneItems(this.player);
    log.info('digzone: ' + digZone.props.id + '  punchcardItems: ' + punchcardItems.map(item => item.itemId).join(', '));
    let regionItems: string[] = []
    if (punchcardItems.length === 0) {
      regionItems = digZone.items
    }
    else {
      punchcardItems.forEach(item => {
        regionItems.push(item.itemId)
      })
    }
    for (let j = 0; j < regionItems.length; j++) {
      const shinySpot = this.availableLTESpots.pop();
      if (shinySpot === undefined) {
        log.error(`No shiny spot available for player: ${this.player.id} for: #${j} lte item: ${regionItems[j]} in zone ${digZone.props.id}`);
        return;
      }
      shinySpot.setDigZone(digZone);
      shinySpot.zoneSettings.shinySpotIndex = -1
      const spawnPosition = this.getNewPositionForShinySpotWithCurrentParameters(shinySpot)
      if (spawnPosition) {
        this.activeLTESpots.push(shinySpot);
        shinySpot.autoRespawn = false
        shinySpot.setup(regionItems[j], spawnPosition);
        shinySpot.resetOn();
        this.shinySpotsInDigZone.get(digZone.props.id)!.push(shinySpot);
      }
      else {
        log.error(`No position found for region LTE shiny spot, player: ${this.player.id} for: #${j} lte item: ${regionItems[j]} in zone ${digZone.props.id}`)
        shinySpot.clearSettings();
        this.availableLTESpots.push(shinySpot)
      }
    }

    while (this.availableLTESpots.length > 0) {
      const shinySpot = this.availableLTESpots.pop();
      if (shinySpot === undefined) {
        log.error(`No shiny spot available for player: ${this.player.id} for common lte shiny spot`);
        continue;
      }
      shinySpot.setDigZone(digZone)
      shinySpot.zoneSettings.shinySpotIndex = -1
      const spawnPosition = this.getNewPositionForShinySpotWithCurrentParameters(shinySpot)
      if (spawnPosition) {
        this.activeLTESpots.push(shinySpot);
        shinySpot.autoRespawn = true
        shinySpot.setup("", spawnPosition);
        shinySpot.resetOn();
        this.shinySpotsInDigZone.get(digZone.props.id)!.push(shinySpot);
      } else {
        log.error(`No position found for common LTE shiny spot, player: ${this.player.id} in zone ${digZone.props.id}`)
        shinySpot.clearSettings();
        this.availableLTESpots.push(shinySpot);
      }
    }
  }

  public removeLteSpots(digZone: DigZone) {
    let spots = this.shinySpotsInDigZone.get(digZone.props.id);
    if (spots) {
      spots.forEach(shinySpot => {
        this.activeLTESpots.splice(this.activeLTESpots.indexOf(shinySpot), 1);
        if (this.availableLTESpots.indexOf(shinySpot) < 0) {
          this.availableLTESpots.push(shinySpot)
        }
        shinySpot.autoRespawn = false
        shinySpot.resetOff(true);
      });
      this.shinySpotsInDigZone.delete(digZone.props.id);
    }
    else {
      log.error(`No shiny spots found for ${digZone.props.id} for player ${this.player.id}`);
    }
  }

  private spawnShinySpotIfReady() {
    if (this.isReadyToSpawnNewShinySpot()) {
      log.info('Spawning new shiny spot ' + this.availableIslandShinySpots.length + " available");
      this.spawnNewShinySpot();
    }
  }

  private updateShinySpotEffects() {
    const now = Date.now();
    if (now < this.nextShinySpotEffectUpdateTime) {
      return;
    }
    this.nextShinySpotEffectUpdateTime = now + SHINY_SPOT_EFFECT_UPDATE_INTERVAL;
    const shinySpotDistances: { shinySpot: ShinySpotWorldData; distance: number; }[] = [];
    this.forEachActive((shinySpot) => {
      const distance = this.player.position.get().distance(shinySpot.position);
      shinySpotDistances.push({ shinySpot, distance });
    });
    shinySpotDistances.sort((a, b) => a.distance - b.distance).splice(SHINY_SPOT_EFFECTS_PER_PLAYER);
    const shinySpotEffectsToRemove = [...this.allShinySpotEffects];
    for (let i = 0; i < shinySpotDistances.length;) {
      const shinySpot = shinySpotDistances[i].shinySpot;
      const index = shinySpotEffectsToRemove.findIndex(effect => effect.data === shinySpot);
      if (index >= 0) {
        shinySpotEffectsToRemove.splice(index, 1);
        shinySpotDistances.splice(i, 1);
      } else {
        ++i;
      }
    }
    shinySpotDistances.forEach(({ shinySpot }) => {
      const effect = shinySpotEffectsToRemove.pop();
      if (!effect) {
        log.warn('No shiny spot effect available for ' + shinySpot.id);
        return;
      }
      effect.setup(shinySpot);
      shinySpot.shinySpotEffect = effect;
    });

    shinySpotEffectsToRemove.forEach(effect => {
      effect.stopVFX();
      effect.clearData();
    });
  }

  private isReadyToSpawnNewShinySpot() {
    const now = Date.now();
    if (this.newShinySpotTime <= now) {
      this.newShinySpotTime = now + NEW_SHINY_SPOT_SPAWN_INTERVAL;
      if (this.spawnedForIsland === PlayerData.getLastIslandVisited(this.player) && // Make sure everything is already spawned for island
        PlayerData.getTutorialComplete(this.player) >= TutorialProgress.COMPLETED_MINIGAME && // Still in tutorial
        this.availableIslandShinySpots.length > 0) {
        const shinySpot = this.availableIslandShinySpots[0];
        return shinySpot.timeToRespawn <= Date.now();
      }
    }
    return false;
  }

  // Logic to spawn a new shiny spot for the island
  private spawnNewShinySpot() {
    const shinySpot = this.availableIslandShinySpots.shift();
    if (shinySpot == undefined) {
      log.error(`No shiny spot available for player: ${this.player.id} for spawning`);
      return;
    }
    const spawnPosition = this.getNewPositionForShinySpotWithCurrentParameters(shinySpot);
    if (spawnPosition) {
      log.info('Spawning new shiny spot at ' + spawnPosition.toString());
      this.activeIslandShinySpots.push(shinySpot);
      shinySpot.setup(shinySpot.itemId, spawnPosition);
      shinySpot.resetOn();
    } else {
      this.availableIslandShinySpots.push(shinySpot);
    }
  }

  private getUsedIndicesForZone(id: string, exclude: ShinySpotWorldData): number[] {
    const shinySpots = this.shinySpotsInDigZone.get(id) || [];
    const usedIndicesArray = shinySpots.map(shinySpot => {
      if (exclude !== shinySpot) {
        return shinySpot.zoneSettings.shinySpotIndex!;
      }
      else { // -1 index won't affect used indices
        return -1;
      }
    });

    return usedIndicesArray;
  }

  private getNewPositionForShinySpotWithCurrentParameters(shinySpot: ShinySpotWorldData): Vec3 | undefined {
    let digZone = DigZoneManager.instance.getDigZoneFromZoneId(shinySpot.zoneSettings.id);
    let island = getIslandFromID(shinySpot.zoneSettings.id);

    if (!digZone && !island) {
      log.error(`Shiny spot zone settings are invalid, id ${shinySpot.zoneSettings.id} not a dig zone or an island`);
      return undefined;
    }
    if (digZone && island) {
      log.error(`Id ${shinySpot.zoneSettings.id} for shiny spot zone is valid for both a dig zone and an island, choosing to use digZone as a fallback but this is not valid`);
    }

    let positions: Vec3[] = [];
    if (island) {
      positions = IslandShinySpotLocators.getLocators(island);
    }
    if (digZone) {
      positions = digZone.shinySpots;
    }

    const usedIndices = this.getUsedIndicesForZone(shinySpot.zoneSettings.id, shinySpot);
    const result = GameUtils.getRandomExcludingIndices(positions, usedIndices);

    if (result) {
      shinySpot.zoneSettings.shinySpotIndex = result.index;
      const position = result.value;
      return position;
    }

    return undefined;
  }

  private waitForUIInitialization() {
    this.uiInitialized = PoolObjectAssigner.IsInitializedForPlayer(this.player, "WorldUI");
    if (!this.uiInitialized) {
      const eventSubscription = this.component.connectNetworkBroadcastEvent(Events.poolObjectInitialized, data => {
        if (data.player === this.player && data.id === "WorldUI") {
          this.uiInitialized = true;
          if (this.initialized) {
            this.spawnAllIslandShinySpots();
          }
          eventSubscription.disconnect();
        }
      });
    }
  }
}
