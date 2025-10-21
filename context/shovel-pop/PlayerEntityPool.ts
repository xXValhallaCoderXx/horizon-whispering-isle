/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as GameUtils from "GameUtils";
import { Component, Entity, Player, PropTypes, Vec3 } from "horizon/core";
import { Logger } from "Logger";
import { PlayerService } from "PlayerService";

export class PlayerEntityPool extends Component<typeof PlayerEntityPool> {
  static propsDefinition = {
    autoAssign: { type: PropTypes.Boolean, default: true },
    detachOnRelease: { type: PropTypes.Boolean, default: false },
    hideUnderWorldOnRelease: { type: PropTypes.Boolean, default: false },
  };

  private all: Entity[] = [];
  public available: Entity[] = [];
  public activeMap = new Map<Player, Entity>;

  private log!: Logger;
  private logName = "";

  start() {
    const children = this.entity.children.get();
    this.logName = this.entity.name.get();
    this.log = new Logger(`PlayerEntityPool (${this.logName})`);
    if (children.length === 0) {
      this.log.error("No entities in entity pool.")
      return;
    }
    children.forEach(child => {
      this.all.push(child);
      this.available.push(child);
    })

    if (this.props.autoAssign) {
      PlayerService.connectPlayerEnterWorld(this, (player: Player) => {
        this.tryAssigningPlayer(player);
      });

      PlayerService.connectPlayerExitWorld(this, (player: Player) => {
        this.releasePlayer(player);
      });
    }
  }

  private hasAvailable() {
    return this.available.length > 0;
  }

  tryAssigningPlayer(player: Player): Entity | undefined {
    if (!this.hasAvailable()) {
      this.log.error(`Failed to assign player, not enough entities in pool`);
      return undefined;
    }

    let gameObject = this.available.shift()!;
    this.log.debug(`Registered player ${player.id} with entity ${gameObject?.id} free count: ${this.available.length}`);
    this.activeMap.set(player, gameObject);
    this.recursivelySetOwnershipToPlayer(player, gameObject);
    return gameObject;
  }

  releasePlayer(player: Player) {
    let obj = this.activeMap.get(player);
    if (obj !== undefined) {
      if (this.props.detachOnRelease) {
        GameUtils.detach(obj);
      }
      if (this.props.hideUnderWorldOnRelease) {
        obj.position.set(new Vec3(0, -100, 0));
      }
      this.recursivelySetOwnershipToPlayer(this.world.getServerPlayer(), obj);
      this.activeMap.delete(player);
      this.available.push(obj);
      this.log.debug(`Released player ${player.id} with entity ${obj.id} free count: ${this.available.length}`);
    }
    else {
      this.log.warn(`Failed to release ${player.id}`);
    }
  }

  toString() : string {
    var availableMessage = this.available.map((entity) => `[${entity.id} owned by ${entity.owner.get().id}]`).join(", ");
    var activeMessage = Array.from(this.activeMap.entries()).map(([player, entity]) => `[${entity.id} assigned to ${player.id} owned by ${entity.owner.get().id}]`).join(", ");
    return `[pool=${this.logName} active=${activeMessage} available=${availableMessage}]`;
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
Component.register(PlayerEntityPool);
