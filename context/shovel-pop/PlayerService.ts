/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_ToastEvents } from "BigBox_ToastManager";
import { Debug } from "Debug";
import { CodeBlockEvents, Color, Component, EventSubscription, LocalEvent, NetworkEvent, Player, Vec3, World } from "horizon/core";
import { Logger } from "Logger";
import { IPlayerInteractionController, PlayerInteractionController } from "PlayerInteractionController";
import { IPlayerProximityController, PlayerProximityController } from "PlayerProximityController";

const ENABLE_SANITY_CHECKS = false;
const SANITY_CHECK_DELAY = 5000;
const DELAY_BEFORE_JOIN = 12000;
//const MIN_DELAY_AFTER_JOIN_BEFORE_LEAVE = 2000;   // DISABLED - Could be causing issues in places trying to use disconnected players through the bridge.
const MIN_DELAY_AFTER_LEAVE_BEFORE_JOIN = 2000;
const PLAYER_JOIN_DELAY = 500;
const MAX_PLAYERS = 9;
const SHOW_TOASTS = false;

const reliablePlayerEnterWorldEvent = new LocalEvent<Player>("reliablePlayerEnterWorldEvent");
const reliablePlayerExitWorldEvent = new LocalEvent<Player>("reliablePlayerExitWorldEvent");
export const reliablePlayerEnterWorldNetEvent = new NetworkEvent<Player>("reliablePlayerEnterWorldNetEvent");
export const reliablePlayerExitWorldNetEvent = new NetworkEvent<Player>("reliablePlayerExitWorldNetEvent");

const log = new Logger("PlayerService");

// Cache player metadata to avoid multiple bridge calls for static information.
type PlayerMetadata = {
  name: string,
  joinTime: number;
}

//  - Player Service -
//
// This class wraps the OnPlayerEnterWorld and OnPlayerExitWorld events to improve reliability, specifically attempting to avoid:
// - calling API involving players before they are fully loaded
// - duplicate OnPlayerEnterWorld and OnPlayerExitWorld events
// - missing OnPlayerEnterWorld and OnPlayerExitWorld events
// - timing issues when sending events for players that join/leave quickly.
//
//  To do this, we introduce a delay in 3 situations:
//  1. When a player joins, we wait a delay before firing the EnterWorld event to ensure the player is fully loaded.
//  2. When a player leaves right after joining, we ensure a duration of time passes before firing the LeaveWorld event to give async initialization time to cleanly finish before shutting down.  CURRENTLY DISABLED.
//  3. When a player leaves, we ensure a duration of time passes before allowing any new EnterWorld events to fire to allow client entities from the previous player to fully transfer back to the server before using them.
//
//  This class also supports:
//  - Evaluating this.world.getPlayers() periodically to ensure that we are not missing any player enter/exit events.
//  - Throttling player joins to ensure too many aren't processed at the same time.

export class PlayerService extends Component<typeof PlayerService> {
  static propsDefinition = {};

  private connectedPlayers = new Array<Player>();                         // Players that have entered the world and are considered "joined"
  private connectedPlayerMetadata = new Map<number, PlayerMetadata>();    // Metadata for connected players
  private getPlayerCheckDelay = SANITY_CHECK_DELAY;                       // Delay between sanity checking the world for players
  private nextPlayerJoinTimestamp = 0;                                    // Timestamp for when the next player can be joined, used to throttle joins
  private playerJoinQueue = new Array<Player>();                          // Players that have entered the world, finished waiting DELAY_BEFORE_JOIN, and are ready to fire enter world events.
  private playerLeaveQueue = new Array<Player>();                         // Players that have left the world and are waiting to have their PlayerExitWorld event fired.  CURRENTLY DISABLED.
  private playerEnterWorldTime = new Map<Player, number>();               // Timestamp for when the player was first spotted in the world.
  private playerAsyncIds = new Map<Player, number[]>();                   // Async IDs for players that are connecting, used to interrupt async on disconnect.

  private recentlyDisconnectedPlayerCount = 0;                            // Number of players that have recently disconnected, used to prevent player joins right after a disconnect (giving entities time to change ownership back to server).  Waits MIN_DELAY_AFTER_LEAVE_BEFORE_JOIN before allowing new joins.
  private recentlyConnectedPlayers = new Array<Player>();                 // Players that have entered the world and are waiting to be moved to the join queue.  Waits DELAY_BEFORE_JOIN before moving to the join queue.

  private static instance?: PlayerService;

  private proximityController!: PlayerProximityController;
  private interactionController!: PlayerInteractionController;

  static proximity(): IPlayerProximityController | undefined { return PlayerService.instance?.proximityController; }
  static interaction(): IPlayerInteractionController | undefined { return PlayerService.instance?.interactionController; }

  static connectPlayerEnterWorld(component: Component, callback: (player: Player) => void): EventSubscription {
    const result = component.connectLocalBroadcastEvent(reliablePlayerEnterWorldEvent, player => callback(player));
    // const connectedPlayers = PlayerService.getConnectedPlayers();
    // if (connectedPlayers !== undefined) {
    //   // Trigger callback for existing connected players.
    //   for (let i = 0; i < connectedPlayers.length; ++i) {
    //     callback(connectedPlayers[i]);
    //   }
    // }
    return result;
  }

  static connectPlayerEnterWorldListener(playerEnterWorldListener: IPlayerEnterWorldListener): EventSubscription {
    return this.connectPlayerEnterWorld(playerEnterWorldListener, player => playerEnterWorldListener.onPlayerEnterWorld(player));
  }

  static connectPlayerExitWorld(component: Component, callback: (player: Player) => void): EventSubscription {
    const result = component.connectLocalBroadcastEvent(reliablePlayerExitWorldEvent, player => callback(player));
    return result;
  }

  static connectPlayerExitWorldListener(playerExitWorldListener: IPlayerExitWorldListener): EventSubscription {
    return this.connectPlayerExitWorld(playerExitWorldListener, player => playerExitWorldListener.onPlayerExitWorld(player));
  }

  static connectPlayerEnterExitWorldListener(playerEnterExitWorldListener: IPlayerEnterExitWorldListener): void {
    this.connectPlayerEnterWorldListener(playerEnterExitWorldListener);
    this.connectPlayerExitWorldListener(playerEnterExitWorldListener);
  }

  static getPlayerById(playerId: number) { return PlayerService.instance?.getPlayerById(playerId); }
  static getPlayerName(player: Player) { return PlayerService.instance?.getPlayerName(player); }
  static getJoinTime(player: Player) { return PlayerService.instance?.getJoinTime(player); }
  static isConnected(player: Player) { return PlayerService.instance?.isPlayerConnected(player) ?? false; }

  static getConnectedPlayers(): Player[] {
    if (PlayerService.instance === undefined) {
      return [];
    }
    return PlayerService.instance.getConnectedPlayers();
    //return [...PlayerService.instance.connectedPlayers];
  }

  private getPlayerById(playerId: number): Player | undefined {
    return this.getConnectedPlayers().find(player => player.id === playerId);
    //return this.connectedPlayers.find(player => player.id === playerId);
  }

  private getPlayerName(player: Player): string | undefined {
    return this.connectedPlayerMetadata.get(player.id)?.name ?? "undefined";
  }

  private getJoinTime(player: Player): number | undefined {
    return this.connectedPlayerMetadata.get(player.id)?.joinTime;
  }
  // Enter World Time is different from Join Time.  Enter world time is when the player is considered to be in the world at the platform level.
  // Join time is when the player service fires the enter world events for the player, causing client and server systems to begin processing the player intialization, which happens after DELAY_BEFORE_JOIN milliseconds from the enter world time.
  static getPlayerEnterWorldTime(player: Player) {
    return PlayerService.instance?.playerEnterWorldTime.get(player) ?? -1;
  }

  static getPlayerPosition(player: Player): Vec3 {
    let position = new Vec3(50, -50, 50);
    try {
      position = player.position.get();
    } catch (e) { }
    return position;
  }

  static getPlayerFootPosition(player: Player): Vec3 {
    // Arbitrary position in the air... using a place under the world can trigger the drown DrownTrigger check.
    let position = new Vec3(0, 100, 0);
    try {
      position = player.foot.position.get();
    } catch (e) {
      console.error("PLAYER IS MISSING HIS FOOT, OH NO!");
    }
    return position;
  }

  preStart() {
    if (PlayerService.instance !== undefined) {
      log.warn("PlayerService already exists!");
    };
    PlayerService.instance = this;
    this.proximityController = new PlayerProximityController();
    this.interactionController = new PlayerInteractionController(this, this.proximityController);
  }

  start() {
    log.info("Start");
    this.connectCodeBlockEvent(this.entity, CodeBlockEvents.OnPlayerEnterWorld, player => this.onPlayerEnterWorld(player));
    this.connectCodeBlockEvent(this.entity, CodeBlockEvents.OnPlayerExitWorld, player => this.onPlayerExitWorld(player));
    this.connectLocalBroadcastEvent(World.onUpdate, payload => this.onUpdate(payload.deltaTime));

    Debug.addCommand(`Print Players/Print All`, () => this.printAllPlayers());
  }

  private printAllPlayers() {
    const debugMessage = this.getConnectedPlayers().map(player => {
      const playerName = this.getPlayerName(player);
      const playerId = player.id;
      return `Player Name: ${playerName}, Player ID: ${playerId}`;
    }).join('\n');

    // !! Leave as console.log since it's debug !!
    console.log(debugMessage);
  }

  private onUpdate(deltaTime: number) {
    // if (ENABLE_SANITY_CHECKS) {
    //   if (this.getPlayerCheckDelay > 0) {
    //     this.getPlayerCheckDelay -= deltaTime;
    //     if (this.getPlayerCheckDelay <= 0) {
    //       this.updateConnectedPlayersFromWorld();
    //       this.getPlayerCheckDelay = SANITY_CHECK_DELAY;
    //     }
    //   }
    // }
    // this.processPlayerQueues();
    this.updateControllers();
  }

  private updateControllers() {
    //this.proximityController.update(this.connectedPlayers);
    this.proximityController.update(this.getConnectedPlayers());
  }

  private getConnectedPlayers() {
    return this.world.getPlayers().filter(player => this.isPlayerValid(player));
  }

  // private updateConnectedPlayersFromWorld() {
  //   const worldPlayers = this.world.getPlayers().filter(player => this.isPlayerValid(player));
  //   log.debug(`updateConnectedPlayersFromWorld - ${worldPlayers.length} player(s) in world.`);
  //   for (let i = 0; i < this.connectedPlayers.length; ++i) {
  //     const disconnectedPlayer = this.connectedPlayers[i];
  //     const index = worldPlayers.indexOf(disconnectedPlayer)
  //     if (index >= 0) {
  //       // Delete connected players from the world player list.
  //       worldPlayers.splice(index, 1);
  //       continue;
  //     }
  //     if (this.isPlayerDisconnecting(disconnectedPlayer)) {
  //       continue;
  //     }
  //     this.queuePlayerToLeave(disconnectedPlayer);
  //   }
  //   // Any world players that were not removed in the previous loop are new players and need to be added.
  //   for (let i = 0; i < worldPlayers.length; ++i) {
  //     const connectedPlayer = worldPlayers[i];
  //     if (this.isPlayerConnecting(connectedPlayer)) {
  //       continue;
  //     }
  //     this.addRecentlyConnectedPlayer(connectedPlayer);
  //   }
  // }

  // private processPlayerQueues() {
  //   // Wait until we no longer have recently disconnected players to avoid entity ownership race conditions.
  //   if (this.recentlyDisconnectedPlayerCount > 0) {
  //     return;
  //   }
  //   if (PLAYER_JOIN_DELAY <= 0) {
  //     while (this.playerJoinQueue.length > 0 && this.connectedPlayers.length < MAX_PLAYERS) {
  //       this.joinNextConnectedPlayer();
  //     }
  //   } else if (this.playerJoinQueue.length > 0 && this.connectedPlayers.length < MAX_PLAYERS) {
  //     const now = Date.now();
  //     if (this.nextPlayerJoinTimestamp <= now) {
  //       this.nextPlayerJoinTimestamp = now + PLAYER_JOIN_DELAY;
  //       this.joinNextConnectedPlayer();
  //     }
  //   }
  // }

  // private joinNextConnectedPlayer() {
  //   const connectedPlayer = this.playerJoinQueue.splice(0, 1)[0];
  //   this.addConnectedPlayer(connectedPlayer);
  // }

  // private addConnectedPlayer(player: Player) {
  //   log.info(`addConnectedPlayer - ${player} - adding...`);
  //   this.connectedPlayers.push(player);
  //   this.sendPlayerEnterWorldEvent(player);
  // }

  private onPlayerEnterWorld(player: Player) {
    if (!this.isPlayerValid(player)) {
      return;
    }
    log.info("onPlayerEnterWorld: " + player?.id);
    this.connectedPlayerMetadata.set(player.id, this.createMetadata(player));
    this.playerEnterWorldTime.set(player, Date.now());
    this.sendPlayerEnterWorldEvent(player);

    // if (!this.isPlayerValid(player)) {
    //   log.info(`onPlayerEnterWorld - ${player} - player is not valid.`);
    //   return;
    // }
    // if (this.isPlayerConnected(player)) {
    //   log.info(`onPlayerEnterWorld - ${player} - player is already connected.`);
    //   return;
    // }
    // if (this.isPlayerConnecting(player)) {
    //   log.info(`onPlayerEnterWorld - ${player} - player is already connecting.`);
    //   return;
    // }
    // log.info(`onPlayerEnterWorld - ${player} - starting add player flow.`);
    // this.addRecentlyConnectedPlayer(player);
  }

  private onPlayerExitWorld(player: Player) {
    log.info("onPlayerExitWorld: " + player?.id);
    this.sendPlayerExitWorldEvent(player);
    this.connectedPlayerMetadata.delete(player.id);
    this.playerEnterWorldTime.delete(player);

    // if (this.isPlayerConnecting(player)) {
    //   log.info(`onPlayerExitWorld - ${player} - player was connecting, interrupting...`);
    //   this.removeRecentlyConnectedPlayer(player);
    //   return;
    // }

    // if (!this.isPlayerConnected(player)) {
    //   log.info(`onPlayerExitWorld - ${player} - player is already disconnected.`);
    //   return;
    // }
    // if (this.isPlayerDisconnecting(player)) {
    //   log.info(`onPlayerExitWorld - ${player} - player is already disconnecting.`);
    //   return;
    // }
    // log.info(`onPlayerExitWorld - ${player} - queuing player to leave.`);
    // this.queuePlayerToLeave(player);
  }

  private queuePlayerToLeave(player: Player) {
    this.removeConnectedPlayer(player);

    // DISABLED - Could be causing issues in places trying to use disconnected players through the bridge.
    // const joinTime = this.connectedPlayerMetadata.get(player)?.joinTime;
    // const timeBeforeLeaveEvent = joinTime + MIN_DELAY_AFTER_JOIN_BEFORE_LEAVE - Date.now();
    // if (timeBeforeLeaveEvent <= 0) {
    //   this.removeConnectedPlayer(player);
    //   return;
    // }
    // this.playerLeaveQueue.push(player);
    // log.info(`queuePlayerToLeave - ${player} - waiting ${timeBeforeLeaveEvent}ms to remove.`);
    // this.async.setTimeout(() => {
    //   const index = this.playerLeaveQueue.indexOf(player);
    //   this.playerLeaveQueue.splice(index, 1);
    //   this.removeConnectedPlayer(player);
    // }, timeBeforeLeaveEvent);
  }

  private removeConnectedPlayer(player: Player, index?: number) {
    log.info(`removeConnectedPlayer - ${player} - removing...`);
    index ??= this.connectedPlayers.indexOf(player);
    this.connectedPlayers.splice(index, 1);
    this.connectedPlayerMetadata.delete(player.id);
    this.playerEnterWorldTime.delete(player);
    this.sendPlayerExitWorldEvent(player);
    this.incrementRecentlyDisconnectedPlayerCount();
  }

  private addRecentlyConnectedPlayer(player: Player) {
    this.connectedPlayerMetadata.set(player.id, this.createMetadata(player));
    this.playerEnterWorldTime.set(player, Date.now());
    this.recentlyConnectedPlayers.push(player);
    const id = this.async.setTimeout(() => {
      this.moveRecentlyConnectedPlayerToJoinQueue(player);
      this.removePlayerAsyncId(player, id);
    }, DELAY_BEFORE_JOIN)
    this.addPlayerAsyncId(player, id);
  }

  private moveRecentlyConnectedPlayerToJoinQueue(player: Player) {
      const index = this.recentlyConnectedPlayers.indexOf(player);
      if (index >= 0) {
        this.recentlyConnectedPlayers.splice(index, 1);
        this.playerJoinQueue.push(player);
      }
  }

  private removeRecentlyConnectedPlayer(player: Player) {
    let index = this.recentlyConnectedPlayers.indexOf(player);
    if (index >= 0) {
      this.recentlyConnectedPlayers.splice(index, 1);
    }
    index = this.playerJoinQueue.indexOf(player);
    if (index >= 0) {
      this.playerJoinQueue.splice(index, 1);
    }
    this.playerAsyncIds.get(player)?.forEach(id => this.async.clearTimeout(id));
    this.playerAsyncIds.delete(player);
    this.connectedPlayerMetadata.delete(player.id);
    this.playerEnterWorldTime.delete(player);
  }

  private sendPlayerEnterWorldEvent(player: Player) {
    log.info(`sendPlayerEnterWorldEvent - ${player}`);
    this.proximityController.onPlayerEnterWorld(player);
    this.interactionController.onPlayerEnterWorld(player);
    if (SHOW_TOASTS) {
      this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToastWithColor, { text: `PLAYER JOINED: ${PlayerService.getPlayerName(player)}`, color: Color.white });
    }
    this.sendLocalBroadcastEvent(reliablePlayerEnterWorldEvent, player);
    this.sendNetworkBroadcastEvent(reliablePlayerEnterWorldNetEvent, player);
  }

  private sendPlayerExitWorldEvent(player: Player) {
    log.info(`sendPlayerExitWorldEvent - ${player}`);
    this.proximityController.onPlayerExitWorld(player);
    this.interactionController.onPlayerExitWorld(player);
    if (SHOW_TOASTS) {
      this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToastWithColor, { text: `PLAYER EXIT: ${PlayerService.getPlayerName(player)}`, color: Color.white });
    }
    this.sendLocalBroadcastEvent(reliablePlayerExitWorldEvent, player);
    this.sendNetworkBroadcastEvent(reliablePlayerExitWorldNetEvent, player);
  }

  private incrementRecentlyDisconnectedPlayerCount() {
    this.recentlyDisconnectedPlayerCount++;
    log.debug(`incremented recentlyDisconnectedPlayerCount (${this.recentlyDisconnectedPlayerCount})`);
    this.async.setTimeout(() => {
      this.recentlyDisconnectedPlayerCount--;
      log.debug(`decremented recentlyDisconnectedPlayerCount (${this.recentlyDisconnectedPlayerCount})`);
    }, MIN_DELAY_AFTER_LEAVE_BEFORE_JOIN);
  }

  private isPlayerConnected(player: Player) {
    return this.getConnectedPlayers().indexOf(player) >= 0;
  }

  private isPlayerConnecting(player: Player) {
    if (this.playerJoinQueue.indexOf(player) >= 0) {
      return true;
    }
    if (this.recentlyConnectedPlayers.indexOf(player) >= 0) {
      return true;
    }
    return false;
  }

  private isPlayerDisconnecting(player: Player) {
    if (this.playerLeaveQueue.indexOf(player) >= 0) {
      return true;
    }
    return false;
  }

  private isPlayerValid(player: Player) {
    if (player === this.world.getServerPlayer()) {
      return false;
    }
    let result = false;
    try {
      if (!player.isInBuildMode.get()) {
        result = true;
      }
    } catch (e) { }
    return result;
  }

  private addPlayerAsyncId(player: Player, id: number) {
    let ids = this.playerAsyncIds.get(player);
    if (ids === undefined) {
      ids = new Array<number>();
      this.playerAsyncIds.set(player, ids);
    }
    ids.push(id);
  }

  private removePlayerAsyncId(player: Player, id: number) {
    let ids = this.playerAsyncIds.get(player);
    if (ids === undefined) {
      return;
    }
    const index = ids.indexOf(id);
    if (index >= 0) {
      ids.splice(index, 1);
    }
    if (ids.length === 0) {
      this.playerAsyncIds.delete(player);
    }
  }

  private createMetadata(player: Player): PlayerMetadata {
    let name = "UNKNOWN";
    try {
      name = player.name.get();
    } catch (e) { }
    return {
      name,
      joinTime: Date.now()
    }
  }
}
Component.register(PlayerService);

export interface IPlayerEnterWorldListener extends Component<any> {
  onPlayerEnterWorld(player: Player): void;
}

export interface IPlayerExitWorldListener extends Component<any> {
  onPlayerExitWorld(player: Player): void;
}

export interface IPlayerEnterExitWorldListener extends IPlayerEnterWorldListener, IPlayerExitWorldListener { }
