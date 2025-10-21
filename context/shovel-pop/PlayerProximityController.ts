/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Player, Vec3 } from "horizon/core";
import { Logger } from "Logger";
import { PlayerService } from "PlayerService";

const log = new Logger("PlayerProximityController");

const RADIUS_BUFFER = .3;

type TrackedProximity = {
  id: bigint,
  position: Vec3,
  radius: number,
  onPlayerEnter: (player: Player) => void,
  onPlayerExit: (player: Player) => void,
  playersInProximity: Array<Player>,
  playerFilter?: Player[],
}

export class PlayerProximityController implements IPlayerProximityController {
  private trackedProximities = new Array<TrackedProximity>();
  private nextID = BigInt(0);

  connect(
    position: Vec3,
    radius: number,
    onPlayerEnter: (player: Player) => void,
    onPlayerExit: (player: Player) => void,
    playerFilter?: Player[]): bigint {
    const id = this.nextID++;
    const playersInProximity = new Array<Player>();
    log.info(`Connecting player proximity (pos: ${position} rad: ${radius})`);
    for (let i = 0; i < this.trackedProximities.length; ++i) {
      const proximity = this.trackedProximities[i];
      const combinedRadius = proximity.radius + radius;
      if (position.distance(proximity.position) <= combinedRadius) {
        log.info(`Overlap detected between proximities (pos: ${position} rad: ${radius}) and (pos: ${proximity.position} rad: ${proximity.radius})`);
      }
    }
    this.trackedProximities.push({ id, position, radius, onPlayerEnter, onPlayerExit, playersInProximity, playerFilter });
    return id;
  }

  connectListener(
    position: Vec3,
    radius: number,
    playerProximityListener: IPlayerProximityListener,
    playerFilter?: Player[]): bigint {
    return this.connect(
      position,
      radius,
      player => playerProximityListener.onPlayerEnterProximity(player),
      player => playerProximityListener.onPlayerExitProximity(player)
    );
  }

  disconnect(id: bigint) {
    const index = this.trackedProximities.findIndex(p => p.id === id);
    if (index >= 0) {
      const proximity = this.trackedProximities.splice(index, 1)[0];
      log.info(`Disconnecting player proximity (pos: ${proximity.position} rad: ${proximity.radius})`);
      while (proximity.playersInProximity.length > 0) {
        this.removePlayerFromProximity(proximity.playersInProximity[0], proximity);
      }
    }
  }

  update(players: Array<Player>) {
    for (let i = 0; i < players.length; i++) {
      try {
        const player = players[i];
        // Check if the foot exists because sometimes it doesn't?
        const playerPosition = PlayerService.getPlayerFootPosition(player);
        for (let j = 0; j < this.trackedProximities.length; ++j) {
          const proximity = this.trackedProximities[j];
          this.updatePlayerProximity(player, playerPosition, proximity);
        };
      } catch (e) {
        const player = players[i];
        log.warn(`Error updating player ${player?.id}: ${e}`);
      }
    };
  }

  onPlayerEnterWorld(player: Player) { }

  onPlayerExitWorld(player: Player) {
    for (let i = 0; i < this.trackedProximities.length; ++i) {
      this.removePlayerFromProximity(player, this.trackedProximities[i]);
    }
  }

  private updatePlayerProximity(player: Player, playerPosition: Vec3, proximity: TrackedProximity) {
    if (!(proximity.playerFilter?.includes(player) ?? true)) {
      return;
    }
    const distance = playerPosition.distance(proximity.position);
    if (distance < proximity.radius) {
      this.addPlayerToProximity(player, proximity);
    } else if (distance >= proximity.radius + RADIUS_BUFFER) {
      this.removePlayerFromProximity(player, proximity);
    }
  }

  private addPlayerToProximity(player: Player, proximity: TrackedProximity) {
    if (!proximity.playersInProximity.includes(player)) {
      proximity.playersInProximity.push(player);
      proximity.onPlayerEnter(player);
      log.info(`Player ${player.id} entered proximity ${proximity.id} (pos: ${proximity.position} rad: ${proximity.radius})`);
    }
  }

  private removePlayerFromProximity(player: Player, proximity: TrackedProximity) {
    const index = proximity.playersInProximity.indexOf(player);
    if (index >= 0) {
      proximity.playersInProximity.splice(index, 1);
      proximity.onPlayerExit(player);
      log.info(`Player ${player.id} exited proximity ${proximity.id} (pos: ${proximity.position} rad: ${proximity.radius})`);
    }
  }
}

export interface IPlayerProximityListener {
  onPlayerEnterProximity: (player: Player) => void;
  onPlayerExitProximity: (player: Player) => void;
}

export interface IPlayerProximityController {
  connect(position: Vec3, radius: number, onPlayerEnter: (player: Player) => void, onPlayerExit: (player: Player) => void, playerFilter?: Player[]): bigint;
  connectListener(position: Vec3, radius: number, playerProximityListener: IPlayerProximityListener, playerFilter?: Player[]): bigint;
  disconnect(id: bigint): void;
}
