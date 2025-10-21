/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_Player_Inventory } from "BigBox_Player_Inventory";
import { requestClientStartupReport, sendClientStartupReport } from "ClientStartupReporter";
import { Events } from "Events";
import { PlayerList, setPlayerVariableSafe } from "GameUtils";
import { Component, Entity, LocalEvent, Player, PropTypes } from "horizon/core";
import { IslandTeleportManager } from "IslandTeleportManager";
import { ItemContainer } from "ItemContainer";
import { Logger } from "Logger";
import * as pd from "PlayerData";
import { PlayerDataEvents } from "PlayerDataEvents";
import { getPlayerInventoryData, PlayerInventoryData } from "PlayerInventoryData";
import { PlayerService } from "PlayerService";
import { PoolObjectAssigner } from "PoolObjectAssigner";
import { FORCE_PLAYER_LOADING_WAIT, PVAR_INVENTORY, SAVE_VERSION, saveVersionMatches } from "PVarConsts";
import { Shovel } from "Shovel";
import { Analytics } from "TurboAnalytics";

const log = new Logger(`PlayerInventoryManager`);
const CLOUD_STUCK_REPORT_TIMEOUT = 60000;
const LOG_STARTUP_REPORT = true;

/**
 * Server-Only: 1 exists in the world.
 * Spawns the player objects and sets up initial data.
 */
export class PlayerInventoryManager extends Component<typeof PlayerInventoryManager> {
  static propsDefinition = {
    // Spawnable assets
    shovelContainerAsset: { type: PropTypes.Asset },
    itemContainerAsset: { type: PropTypes.Asset },
    digHudAsset: { type: PropTypes.Asset },
    moundAsset: { type: PropTypes.Asset },

    // Refs
    playerInventory: { type: PropTypes.Entity },
    islandTeleportManager: { type: PropTypes.Entity },

    // Teleportation
    msBeforeTeleport: { type: PropTypes.Number, default: 250 },
  };

  // Singleton
  private static _instance: PlayerInventoryManager | null;
  public static get instance(): PlayerInventoryManager { return this._instance!; }

  public static onPlayerLoadingComplete = new LocalEvent<{ player: Player }>('onPlayerLoadingComplete');

  public getPlayer(playerId: number): Player | undefined {
    return this.playerIdToPlayer.get(playerId);
  }

  public getAllPlayers(): Player[] {
    return this.allPlayers.list;
  }

  /** Returns true if the name of this world contains "[dev]" */
  public get isDevWorld(): boolean {
    let lowerName = this.world.name.get().toLocaleLowerCase();
    return lowerName.includes("[dev]");
  }

  //private playerToDataMap = new Map<Player, PlayerPooledData>();
  private playerIdToPlayer = new Map<number, Player>();
  private allPlayers: PlayerList = new PlayerList();
  private connectingPlayers: PlayerList = new PlayerList();
  private playerStartTimes = new Map<Player, number>()
  private islandTeleportManager!: IslandTeleportManager;
  private inventories!: BigBox_Player_Inventory;

  private static MIN_LOADING_TIME = 3; // in seconds
  private static MIN_LOADING_TIME_DEV = 3; // in seconds

  private playerInitSteps = new Map<Player, { id: string, timestamp: number }[]>();

  preStart() {
    PlayerInventoryManager._instance = this;
  }

  start() {
    this.islandTeleportManager = this.props.islandTeleportManager!.getComponents<IslandTeleportManager>()[0];
    this.inventories = this.props.playerInventory!.getComponents<BigBox_Player_Inventory>()[0];

    PlayerService.connectPlayerEnterWorld(
      this,
      (player: Player) => {
        this.onPlayerEnterWorldAsync(player);
      },
    );

    PlayerService.connectPlayerExitWorld(
      this,
      (player: Player) => {
        if (player) {
          log.info(`[${player.id}] Player Exit World`);

          PoolObjectAssigner.localInstance?.unassignAllPoolObjectsFromPlayer(player);
          this.playerIdToPlayer.delete(player.id);
          this.allPlayers.remove(player);
          this.connectingPlayers.remove(player);
        }
        else {
          log.warn(`Undefined Player Exit World`);
        }
      },
    );

    this.connectNetworkBroadcastEvent(sendClientStartupReport, report => console.warn(report));
  }

  async onPlayerEnterWorldAsync(player: Player) {
    this.setInitStep(player, "Start");
    this.playerStartTimes.set(player, Date.now())
    this.async.setTimeout(() => {
      if ((this.connectingPlayers.includes(player)) && this.playerInitSteps.has(player)) {
        this.onPlayerStuckOnCloud(player);
      }
    }, CLOUD_STUCK_REPORT_TIMEOUT)

    // Wait arbitrary number to allow the player to spawn in
    await new Promise(resolve => {
      this.async.setTimeout(() => resolve(true), 100);
    });
    this.setInitStep(player, "Initial Delay");

    if (player && PlayerService.isConnected(player)) {
      this.setInitStep(player, "Post Initial Delay (Player)");
      if (!this.allPlayers.includes(player)) {
        this.setInitStep(player, "Post Initial Delay (New Player)");
        this.connectingPlayers.add(player);
        this.playerIdToPlayer.set(player.id, player);
        this.allPlayers.add(player);
        this.setup(player);
      }
    }
  }

  private onPlayerStuckOnCloud(player: Player) {
    const stuckSteps = this.playerInitSteps.get(player) ?? [];
    if (stuckSteps.length === 0) {
      return;
    }
    log.warn(`Player (${PlayerService.getPlayerName(player)}) hasn't teleported in ${CLOUD_STUCK_REPORT_TIMEOUT / 1000} seconds.  Showing unfinished report...`);
    const stuckStep = stuckSteps[stuckSteps.length - 1].id;
    if (stuckStep !== "") {
      //this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToastWithColor, { text: logMessage, color: new Color(1, .5, .5) });
      Analytics()?.sendTaskEnd({ player, taskKey: 'player_stuck_in_cloud', taskType: stuckStep })
      const logMessage = `(${PlayerService.getPlayerName(player)}) is STUCK at (${stuckStep})`;
      log.warn(logMessage);
    }
  }

  private logStartupReport(player: Player) {
    const stuckSteps = this.playerInitSteps.get(player) ?? [];
    if (stuckSteps.length === 0) {
      return;
    }
    const startTime = stuckSteps[0].timestamp;
    let lastTime = startTime;
    const report = stuckSteps.map(stuckStep => {
      const stepDuration = (stuckStep.timestamp - lastTime) / 1000;
      const overallTimePassed = (stuckStep.timestamp - startTime) / 1000;
      lastTime = stuckStep.timestamp;
      return `Step: ${stuckStep.id.padEnd(54, ' ')}  Duration: ${stepDuration.toString().padEnd(7, ' ')}   Overall: ${overallTimePassed}`;
    }).join("\n");
    this.async.setTimeout(() => {
      if (PlayerService.isConnected(player)) {
        console.warn(`Server Startup Report for ${PlayerService.getPlayerName(player)}:\n${report}`);
        this.sendNetworkBroadcastEvent(requestClientStartupReport, {}, [player]);
      }
    }, 20000) // Wait 10 seconds to allow any other client-side systems to finish

  }

  setInitStep(player: Player, step: string) {
    if (step === "") {
      this.playerInitSteps.delete(player);
    } else {
      let initSteps = this.playerInitSteps.get(player);
      if (!initSteps) {
        initSteps = [];
        this.playerInitSteps.set(player, initSteps);
      }
      if (initSteps.length === 0 || initSteps[initSteps.length - 1].id !== step) {
        initSteps.push({ id: step, timestamp: Date.now() });
      }
    }
  }

  // Give player all their starting objects
  async setup(player: Player) {
    this.setInitStep(player, "[Setup] Start");
    while (!PoolObjectAssigner.localInstance) {
      this.setInitStep(player, "[Setup] Wait for PoolObjectAssigner Init");
      await new Promise(resolve => { this.async.setTimeout(() => resolve(true), 500) })
    }

    this.setInitStep(player, "[Setup] PoolObjectAssigner Initialized");
    PoolObjectAssigner.localInstance.assignAllPoolObjectsToPlayer(player);
    this.setInitStep(player, "[Setup] Assign pool objects to player");
    while (PoolObjectAssigner.localInstance.isAssigning(player)) {
      this.setInitStep(player, "[Setup] Waiting for pool object assignment to player");
      await new Promise(resolve => { this.async.setTimeout(() => resolve(true), 100) })
    }

    this.setInitStep(player, "[Setup] Pool object assignment complete");
    this.setupShovel(player);

    if (PlayerService.isConnected(player)) {
      // Modify sprint speed (Worlds default is 1.4)
      player.sprintMultiplier.set(1.2);
    }
  }

  async setupShovel(player: Player) {
    this.setInitStep(player, "[SetupShovel] Start");
    log.info(`Shovel Load: Load completed for ${player.id}`);
    let timePassed = (Date.now() - this.playerStartTimes.get(player)!) / 1000
    let loadingTime = this.isDevWorld ? PlayerInventoryManager.MIN_LOADING_TIME_DEV : PlayerInventoryManager.MIN_LOADING_TIME;
    if (timePassed < loadingTime && FORCE_PLAYER_LOADING_WAIT) {
      this.setInitStep(player, "[SetupShovel] Waiting for forced loading time");
      const delta = loadingTime - timePassed
      await new Promise(resolve => { this.async.setTimeout(() => resolve(true), delta * 1000) })
      this.setInitStep(player, "[SetupShovel] Forced loading time complete");
      timePassed = (Date.now() - this.playerStartTimes.get(player)!) / 1000
    }

    log.info("[Shovel] firing set shovel event.");

    this.setInitStep(player, "[SetupShovel] Equipping Shovel");
    // Auto-equip shovel
    this.sendNetworkBroadcastEvent(Shovel.equip, player, [player]);

    this.setInitStep(player, "[SetupShovel] Sending inventory to player");

    this.sendInventoryToPlayer(this.inventories, player);

    // All done loading, teleport the player
    log.info("[Setup] Resending pool objects to player after teleport.");
    PoolObjectAssigner.localInstance?.resendPoolObjects(player);
    this.async.setTimeout(() => {
      this.teleportPlayer(player);
      this.sendLocalBroadcastEvent(PlayerInventoryManager.onPlayerLoadingComplete, { player: player })
      this.updateClientDataUi(player);
      this.connectingPlayers.remove(player);
      if (LOG_STARTUP_REPORT) {
        this.logStartupReport(player);
      }
      this.setInitStep(player, "");
    }, 6000);
  }

  private sendInventoryToPlayer(inventories: BigBox_Player_Inventory, player: Player) {
    this.setInitStep(player, "[SendInventoryToPlayer] Start");
    const itemContainer = ItemContainer.localInstance;
    if (itemContainer !== undefined && itemContainer.isDataLoaded()) {
      this.setInitStep(player, "[SendInventoryToPlayer] ItemContainer Data Loaded");
      inventories.sendInventory(player);
    } else {
      this.setInitStep(player, "[SendInventoryToPlayer] ItemContainer Data Not Loaded");
      const subscription = this.connectLocalBroadcastEvent(ItemContainer.itemDataLoadComplete, data => {
        subscription.disconnect();
        inventories.sendInventory(player);
      })
    }
    this.setInitStep(player, "[SendInventoryToPlayer] Complete");
  }

  // Send signals to update any UI that relies on all the player's data being ready
  private updateClientDataUi(player: Player) {
    const gems = pd.PlayerData.getGems(player);
    this.sendNetworkBroadcastEvent(PlayerDataEvents.gemsUpdated, { player, gems, updateHUD: true }, [player]);
  }

  teleportPlayer(player: Player) {
    const firstSeenTime = PlayerService.getPlayerEnterWorldTime(player);
    const startupDuration = firstSeenTime ? (Date.now() - firstSeenTime) * .001 : -1;
    log.info(`Teleport ${PlayerService.getPlayerName(player)} to starter destination after ${startupDuration} seconds`);
    Analytics()?.sendTaskEnd({ player, taskKey: 'player_startup', taskType: startupDuration.toString() });
    this.islandTeleportManager.teleportPlayerToLastIsland(player, this.props.msBeforeTeleport);
  }

  getShovelId(playerId: number): string {
    let player = PlayerInventoryManager.instance.getPlayer(playerId);
    let shovelId = "shovel_base01";

    if (!player) {
      return shovelId;
    }
    let playerInventoryData = getPlayerInventoryData(this.world, player);

    if (playerInventoryData === null || playerInventoryData === undefined || !playerInventoryData.saveVersion || !saveVersionMatches(playerInventoryData.saveVersion)) {
      let playerInventoryData: PlayerInventoryData = { saveVersion: SAVE_VERSION, shovels: [shovelId], shovelId: shovelId, inventory: [], potionInventory: [] };
      setPlayerVariableSafe(this.world, player, PVAR_INVENTORY, playerInventoryData);
    }
    else {
      shovelId = playerInventoryData.shovelId;
    }

    return shovelId;
  }
}
Component.register(PlayerInventoryManager);
