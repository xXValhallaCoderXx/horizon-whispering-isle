/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Events } from "Events";
import * as GameUtils from "GameUtils";
import { logPlayersInWorld } from "GameUtils";
import { Component, Entity, Player, PropTypes } from "horizon/core";
import { Logger } from "Logger";
import { PlayerEntityPool } from "PlayerEntityPool";
import { PlayerService } from "PlayerService";
import { Analytics } from "TurboAnalytics";

const TIMEOUT = 45 * 1000;
const ALLOW_RETRY = false;
const RETRY_DELAY = 30 * 1000;
const ASSIGN_DELAY = 0 * 1000;

const log = new Logger(`PoolObjectAssigner`);

type QueuedPoolObject = {
  player: Player,
  id: string,
  entity?: Entity,
}

enum AssignedState {
  Assigned,
  Initialized,
}

export class PoolObjectAssigner extends Component<typeof PoolObjectAssigner> {
  static propsDefinition = {
    uiNoInteractionRoot: { type: PropTypes.Entity },
    uiInteractionNonBlockingRoot: { type: PropTypes.Entity },
    uiInteractionNonBlocking2Root: { type: PropTypes.Entity },
    uiInteractionNonBlocking3Root: { type: PropTypes.Entity },
    uiInteractionBlockingRoot: { type: PropTypes.Entity },
    catalogRoot: { type: PropTypes.Entity },
    worldUIRoot: { type: PropTypes.Entity },
    dailyRewardsUIRoot: { type: PropTypes.Entity },
    shopUIRoot: { type: PropTypes.Entity },
  };

  private inProgress: QueuedPoolObject[] = [];
  private queued: QueuedPoolObject[] = [];
  private isProcessingQueue = false;
  private playerAssignedObjects = new Map<Player, Map<string, Entity>>();
  private poolMap = new Map<string, PlayerEntityPool>();

  private objStates: Map<Player, Map<string, AssignedState>> = new Map();
  private ownershipReceived: Map<Player, string[]> = new Map();
  private fixUICooldown = new Array<Player>();

  static localInstance?: PoolObjectAssigner;

  static IsInitializedForPlayer(player: Player, id: string): boolean {
    if (PoolObjectAssigner.localInstance === undefined) {
      return false;
    }
    return PoolObjectAssigner.localInstance.objStates.get(player)?.get(id) === AssignedState.Initialized;
  }

  start() {
    PoolObjectAssigner.localInstance = this;

    this.poolMap.set("UIRoot_NoInteraction", this.props.uiNoInteractionRoot!.getComponents(PlayerEntityPool)[0]);
    this.poolMap.set("UIRoot_InteractionNonBlocking", this.props.uiInteractionNonBlockingRoot!.getComponents(PlayerEntityPool)[0]);
    this.poolMap.set("UIRoot_InteractionNonBlocking2", this.props.uiInteractionNonBlocking2Root!.getComponents(PlayerEntityPool)[0]);
    this.poolMap.set("UIRoot_InteractionNonBlocking3", this.props.uiInteractionNonBlocking3Root!.getComponents(PlayerEntityPool)[0]);
    this.poolMap.set("UIRoot_InteractionBlocking", this.props.uiInteractionBlockingRoot!.getComponents(PlayerEntityPool)[0]);
    this.poolMap.set("UI_Catalog", this.props.catalogRoot!.getComponents(PlayerEntityPool)[0]);
    this.poolMap.set("WorldUI", this.props.worldUIRoot!.getComponents(PlayerEntityPool)[0]);
    this.poolMap.set("DailyRewardsUI", this.props.dailyRewardsUIRoot!.getComponents(PlayerEntityPool)[0]);
    this.poolMap.set("ShopUI", this.props.shopUIRoot!.getComponents(PlayerEntityPool)[0]);

    this.connectNetworkBroadcastEvent(Events.poolObjectInitialized, data => this.onInitialized(data.player, data.id));
    this.connectNetworkBroadcastEvent(Events.poolObjectReceived, data => this.onReceived(data.player, data.id));
    this.connectNetworkBroadcastEvent(Events.fixUI, player => this.resendPoolObjects(player));
    this.connectNetworkBroadcastEvent(Events.debugAction1, player => {
      let name: string = player.id.toString();
      try {
        name = player?.name.get();
      } catch (e) { }
      logPlayersInWorld(name, this.world);
      log.warn(`${name} enterWorldTime=${PlayerService.getPlayerEnterWorldTime(player)} joinTime=${PlayerService.getJoinTime(player)}`);
      this.poolMap.forEach((pool, id) => this.logPEP(name, id, pool));
      this.logMap(name);
    })

    // this.connectNetworkBroadcastEvent(Events.debugAction2, player => {
    //   this.resendPoolObjects(player);
    // })
  }

  assignAllPoolObjectsToPlayer(player: Player) {
    if (this.playerAssignedObjects.has(player)) {
      log.error(`assignAllPoolObjectsToPlayer called for player already assigned objects`);
      return;
    }
    this.playerAssignedObjects.set(player, new Map());
    this.ownershipReceived.set(player, []);
    this.poolMap.forEach((_, id) => this.enqueue({ player, id }));
    this.processQueue();
  }

  unassignAllPoolObjectsFromPlayer(player: Player) {
    this.poolMap.forEach((pool) => pool.releasePlayer(player));
    this.inProgress = this.inProgress.filter(obj => obj.player !== player);
    this.queued = this.queued.filter(obj => obj.player !== player);
    this.objStates.delete(player);
    this.playerAssignedObjects.delete(player);
    this.ownershipReceived.delete(player);
  }

  isAssigning(player: Player) {
    return this.inProgress.some(obj => obj.player === player) ||
      this.queued.some(obj => obj.player === player);
  }

  private enqueue(obj: QueuedPoolObject) {
    this.queued.push(obj);
  }

  private processQueue() {
    if (this.isProcessingQueue || this.queued.length === 0) {
      log.info(`Skipping processQueue isProcessingQueue=${this.isProcessingQueue} queued=${this.queued.length}`);
      return;
    }
    this.isProcessingQueue = true;
    this.assign(this.queued.shift()!);
    if (ASSIGN_DELAY > 0) {
      this.async.setTimeout(() => {
        this.isProcessingQueue = false;
        this.processQueue();
      }, ASSIGN_DELAY);
    } else {
      this.isProcessingQueue = false;
      this.processQueue();
    }
  }

  private assign(obj: QueuedPoolObject) {
    log.info(`Calling assign for : ${obj.id} (player: ${PlayerService.getPlayerName(obj.player)})`);
    this.inProgress.push(obj);
    if (!this.assignToPlayer(obj)) {
      return;
    }

    log.info(`Pool Object Assignment finished: ${obj.id} (player: ${PlayerService.getPlayerName(obj.player)}`);
    if (!this.objStates.has(obj.player)) {
      this.objStates.set(obj.player, new Map<string, AssignedState>());
    }

    const currentState = this.objStates.get(obj.player);
    this.objStates.set(obj.player, currentState!.set(obj.id, AssignedState.Assigned));
  }

  private retry(obj: QueuedPoolObject) {
    if (obj.entity === undefined) {
      log.error(`Retrying Pool Object: ${obj.id} (player: ${PlayerService.getPlayerName(obj.player)}) but no entity was assigned`);
      return;
    }

    log.warn(`Retrying Pool Object: ${obj.id} (player: ${PlayerService.getPlayerName(obj.player)}) current owner: ${PlayerService.getPlayerName(obj.entity.owner.get())}`);
    this.recursivelySetOwnershipToPlayer(this.world.getServerPlayer(), obj.entity);
    this.async.setTimeout(() => {
      if (!PlayerService.isConnected(obj.player)) {
        return;
      }
      log.warn(`retry assign to player, current owner: ${PlayerService.getPlayerName(obj.entity!.owner.get())}" }`);
      this.assign(obj);
    }, RETRY_DELAY);
  }

  private assignToPlayer(obj: QueuedPoolObject): boolean {
    const id = obj.id;
    const player = obj.player;
    log.info(`Assigning Pool Object: ${id} (player: ${PlayerService.getPlayerName(player)})`);
    if (obj.entity === undefined) {
      obj.entity = this.assignToPlayerByID(player, id);
      if (obj.entity === undefined) {
        Analytics()?.sendTaskEnd({ player, taskKey: 'empty_pool', taskType: id })
        log.error(`Assigning Pool Object: ${id} (player: ${PlayerService.getPlayerName(player)}) FAILED, pool empty.`);
        return false;
      } else {
        this.addPlayerAssignedObject(player, id, obj.entity);
      }
    } else {
      this.recursivelySetOwnershipToPlayer(player, obj.entity);
    }
    this.async.setTimeout(() => {
      const inProgress = this.inProgress.find(obj => obj.player === player && obj.id === id);
      if (inProgress === undefined) {
        return;
      }
      Analytics()?.sendTaskEnd({ player, taskKey: 'pool_object_no_response', taskType: id })
      const logMessage = `Pool Object Timed out for (${id}) (player: ${PlayerService.getPlayerName(player)}), retrying...`;
      log.error(logMessage);
      if (ALLOW_RETRY) {
        this.retry(obj);
      }
    }, TIMEOUT);
    return true;
  }

  resendPoolObjects(player: Player) {
    if (this.fixUICooldown.includes(player)) {
      return;
    }
    const assignedObjects = this.playerAssignedObjects.get(player);
    if (assignedObjects === undefined) {
      return;
    }
    assignedObjects.forEach((obj, key) => {
      if (key !== "WorldUI") {
        obj.owner.set(this.world.getServerPlayer());
      }
    });
    this.async.setTimeout(() => {
      assignedObjects.forEach((obj, key) => {
        if (key !== "WorldUI") {
          obj.owner.set(player);
        }
       });
    }, 3000);
    this.fixUICooldown.push(player);
    this.async.setTimeout(() => {
      this.fixUICooldown = this.fixUICooldown.filter(p => p !== player);
    }, GameUtils.FIX_UI_DELAY);
  }

  private logPEP(playerName: string, id: string, pool: PlayerEntityPool) {
    log.info(`Player: ${playerName}  Pool: ${id}   available=${this.getAvailableOwnersPEP(pool)}    active=${this.getActiveOwnersPEP(pool)}`);
  }

  private getAvailableOwnersPEP(pool: PlayerEntityPool): string {
    return pool.available.map(poolObject => {
      let name: string = "undefined";
      try {
        name = poolObject.owner?.get().name.get();
      } catch (e) { }
      return name !== "" ? name : "SRV";
    }).join(',');
  }

  private getActiveOwnersPEP(pool: PlayerEntityPool): string {
    const owners: (Player | undefined)[] = [];
    pool.activeMap.forEach(poolObject => owners.push(poolObject.owner?.get()));
    return owners.map(owner => {
      let name = "undefined";
      try {
        name = owner?.name.get() ?? "undefined";
      } catch (e) { }
      return name !== "" ? name : "SRV";
    }).join(',');
  }

  private logMap(callerName: string) {
    this.playerAssignedObjects.forEach((assignedObjects, player) => {
      const lines: string[] = [];
      lines.push(`Caller: ${callerName}`);
      const playerName = PlayerService.getPlayerName(player);
      lines.push(`  Player: ${playerName}`);
      assignedObjects.forEach((obj, id) => {
        const ownerName = PlayerService.getPlayerName(obj.owner.get());
        const received = this.ownershipReceived.get(player)?.includes(id) ?? false;
        const status = ((ownerName === playerName) && received) ? "GOOD" : "BAD";
        lines.push(`    ${id}  owner: ${ownerName}   received: ${received ? "YES" : "NO"}   status: ${status}`);
      });
      log.warn(lines.join('\n'));
    });
  }

  private assignToPlayerByID(player: Player, id: string) {
    const pool = this.poolMap.get(id);
    if (pool === undefined) {
      log.error(`Unknown UI id: ${id}`);
      return undefined;
    }
    return pool.tryAssigningPlayer(player);
  }

  private onInitialized(player: Player, id: string): void {
    log.info(`Pool Object Initialized: ${id} (player: ${player.id} playerID: ${player.id})`);
    this.inProgress = this.inProgress.filter(obj => obj.player !== player || obj.id !== id);

    if (!this.objStates.has(player)) {
      log.warn(`Pool Object Initialized: ${id} (player: ${player.id} playerID: ${player.id}) but no state was tracked, player probably left the world already`);
      return;
    }

    const currentState = this.objStates.get(player)!;
    if (!currentState.has(id)) {
      log.error(`Pool Object Initialized: ${id} (player: ${player.id} playerID: ${player.id}) but not tracked`);
      return;
    }

    if (currentState.get(id) === AssignedState.Assigned) {
      this.objStates.get(player)!.set(id, AssignedState.Initialized);
    } else {
      log.error(`Pool Object Initialized: ${id} (player: ${player.id} playerID: ${player.id}) but was not assigned`);
    }
  }

  private onReceived(player: Player, id: string): void {
    this.ownershipReceived.get(player)?.push(id);
  }

  private addPlayerAssignedObject(player: Player, id: string, obj: Entity) {
    let playerAssignedObjects = this.playerAssignedObjects.get(player);
    if (playerAssignedObjects === undefined) {
      log.error(`addPlayerAssignedObject called for player with no assigned objects`);
      return;
    }
    playerAssignedObjects.set(id, obj);
  }

  private removePlayerAssignedObject(player: Player, id: string) {
    let playerAssignedObjects = this.playerAssignedObjects.get(player);
    if (playerAssignedObjects === undefined) {
      return;
    }
    playerAssignedObjects.delete(id);
  }

  private recursivelySetOwnershipToPlayer(player: Player, entity: Entity, childrenFirst: boolean = false) {
    if (!childrenFirst) {
      entity.owner.set(player);
    }
    let children: Entity[] = entity.children.get();
    children.forEach((child: Entity) => {
      this.recursivelySetOwnershipToPlayer(player, child, childrenFirst);
    });
    if (childrenFirst) {
      entity.owner.set(player);
    }
  }
}
Component.register(PoolObjectAssigner);
