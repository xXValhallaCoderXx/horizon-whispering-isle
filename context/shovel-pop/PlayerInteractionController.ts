/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Component, Player, Vec3 } from "horizon/core";
import { Logger } from "Logger";
import { PlayerInteractionTrigger } from "PlayerInteractionTrigger";
import { PlayerProximityController } from "PlayerProximityController";

const INTERACT_RADIUS = 2.7;

const log = new Logger("PlayerInteractionController");

export class PlayerInteractionController implements IPlayerInteractionController {
  private proximityController: PlayerProximityController;
  private owner: Component<any>;
  private playerToCallback = new Map<Player, (player: Player) => void>();

  constructor(owner: Component<any>, proximityController: PlayerProximityController) {
    this.proximityController = proximityController;
    this.owner = owner;
    this.owner.connectNetworkBroadcastEvent(PlayerInteractionTrigger.onInteract, player => this.onInteract(player));
  }

  connect(position: Vec3, onPlayerInteract: (player: Player) => void, isEnabled?: (player: Player) => boolean, playerFilter?: Player[]): bigint {
    return this.proximityController.connect(
      position,
      INTERACT_RADIUS,
      player => this.onPlayerEnterProximity(player, position, onPlayerInteract, isEnabled),
      player => this.onPlayerExitProximity(player),
      playerFilter);
  }

  connectListener(position: Vec3, interactionListener: IPlayerInteractionListener, playerFilter?: Player[]): bigint {
    return this.proximityController.connect(
      position,
      INTERACT_RADIUS,
      player => this.onPlayerEnterProximity(player, position, player => interactionListener.onPlayerInteract(player)),
      player => this.onPlayerExitProximity(player),
      playerFilter);
  }

  enable(context: string) {
    this.owner.sendNetworkBroadcastEvent(PlayerInteractionTrigger.addDisableContext, { context });
  }

  disable(context: string) {
    this.owner.sendNetworkBroadcastEvent(PlayerInteractionTrigger.removeDisableContext, { context });
  }

  private onPlayerEnterProximity(player: Player, position: Vec3, onPlayerInteract: (player: Player) => void, isEnabled?: (player: Player) => boolean) {
    if (isEnabled !== undefined && !isEnabled(player)) {
      return;
    }
    this.owner.sendNetworkBroadcastEvent(PlayerInteractionTrigger.setTrigger, { position }, [player]);
    this.playerToCallback.set(player, onPlayerInteract);
  }

  private onPlayerExitProximity(player: Player) {
    //this.owner.sendNetworkBroadcastEvent(PlayerInteractionTrigger.hide, {}, [player]);
  }

  private onInteract(player: Player) {
    const callback = this.playerToCallback.get(player);
    if (callback) {
      callback(player);
      log.info(`Player ${player.id} interacted with interaction trigger.`)
    }
    else {
      log.warn(`Player ${player.id} interacted with interaction trigger but no callback was registered.`)
    }
  }

  disconnect(id: bigint) {
    this.proximityController.disconnect(id);
  }

  onPlayerEnterWorld(player: Player) { }

  onPlayerExitWorld(player: Player) {
    this.playerToCallback.delete(player);
  }
}

export interface IPlayerInteractionListener {
  onPlayerInteract: (player: Player) => void;
  isEnabled?: (player: Player) => boolean;
}

export interface IPlayerInteractionController {
  connect(position: Vec3, onPlayerInteract: (player: Player) => void, isEnabled?: (player: Player) => boolean, playerFilter?: Player[]): bigint;
  connectListener(position: Vec3, interactionListener: IPlayerInteractionListener, playerFilter?: Player[]): bigint;
  enable(context: string): void;
  disable(context: string): void;
  disconnect(id: bigint): void;
}
