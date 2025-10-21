/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { ClientStartupReporter } from 'ClientStartupReporter';
import { DigMinigame } from 'DigMinigame';
import { DigZoneManager } from 'DigZoneManager';
import { Events } from 'Events';
import * as hz from 'horizon/core';
import { Player, PlayerVisibilityMode, PropTypes, Vec3 } from 'horizon/core';
import { Islands } from 'Islands';
import { IslandEvents } from 'IslandTeleportManager';
import { Logger } from 'Logger';
import * as MathUtils from 'MathUtils';
import { NavigationArrowEvents } from 'NavigationArrowEvents';

const log = new Logger("NavigationArrow");

export type NavigationTarget = {
  /**
   * The island where the navigation target is located.
   */
  island: Islands
  /**
   * The specific region within the island, if applicable. If specified, the arrow will not show up if the player is in the same region.
   */
  region?: string
  /**
   * The 3D position of the navigation target.
   */
  position: Vec3
}

export class NavigationArrow extends hz.Component<typeof NavigationArrow> {
  static propsDefinition = {
    oscillateSpeed: { type: PropTypes.Number },
    oscillateDistance: { type: PropTypes.Number },
    translationSpeed: { type: PropTypes.Number },
    flatten: { type: PropTypes.Boolean },
    teleportDistance: { type: PropTypes.Number },
    arrowHeight: { type: PropTypes.Number },
    arrowForward: { type: PropTypes.Number },
    hideDistance: { type: PropTypes.Number }
  };

  public targets: NavigationTarget[] = [];
  public questId: string | undefined;

  private owner!: Player;
  private oscillation: number = 0;
  private currentArrowPosition: Vec3 = Vec3.zero;
  private currentIsland: Islands = Islands.None;
  private currentRegion?: string

  // Cache to minimize bridge calls
  private isVisible: boolean = true;

  private onUpdateCallback: hz.EventSubscription | undefined;

  start() {
    this.owner = this.world.getLocalPlayer();
    if (this.owner === this.world.getServerPlayer()) {
      this.entity.visible.set(false);
      return;
    }

    log.info(`Start called for player (${this.owner})`);
    this.entity.setVisibilityForPlayers([this.owner], PlayerVisibilityMode.VisibleTo);

    this.isVisible = false;

    this.connectNetworkBroadcastEvent(NavigationArrowEvents.updateNavigationArrowEvent, (data) => {
      if (this.owner === data.player) {
        log.info("updateNavigationArrowEvent quest " + data.questId + " position " + data.positions + " for player " + data.player.id);
        if (data.questId === "") {
          this.clearQuest();
          return;
        }

        this.targets = data.positions;
        this.questId = data.questId;

        this.onUpdateCallback?.disconnect();
        this.onUpdateCallback = this.connectLocalBroadcastEvent(
          hz.World.onUpdate, (payload) => this.updateArrow(payload.deltaTime)
        );

        if (!this.isVisible) {
          this.entity.visible.set(true);
          this.isVisible = true;
        }
      }
    })

    this.connectLocalBroadcastEvent(Events.localPlayerDigComplete, (data: { player: Player, isSuccess: boolean }) => {
      if (this.owner === data.player) {
        this.onUpdateCallback?.disconnect();
        this.onUpdateCallback = this.connectLocalBroadcastEvent(
          hz.World.onUpdate, (payload) => this.updateArrow(payload.deltaTime)
        );

        if (!this.isVisible) {
          this.entity.visible.set(true);
          this.isVisible = true;
        }
      }
    });

    this.connectNetworkBroadcastEvent(DigMinigame.minigameStartedEvent, (data: { player: Player }) => {
      if (this.owner === data.player) {
        this.onUpdateCallback?.disconnect();
        this.onUpdateCallback = undefined;
        if (this.isVisible) {
          this.entity.visible.set(false);
          this.isVisible = false;
        }
      }
    });

    this.connectNetworkBroadcastEvent(IslandEvents.playerTeleportedToIsland, (payload) => {
      if (payload.player === this.owner) {
        this.currentIsland = payload.island;
      }
    })

    this.connectNetworkBroadcastEvent(DigZoneManager.sendZoneId, (payload) => {
      if (payload.data.displayName.length === 0) {
        this.currentRegion = undefined;
      }
      else {
        this.currentRegion = payload.data.id;
      }
    })

    this.sendNetworkBroadcastEvent(NavigationArrowEvents.navigationArrowInitializedEvent, { player: this.owner }, [this.world.getServerPlayer()])

    this.currentArrowPosition = this.entity.position.get();

    ClientStartupReporter.addEntry("NavigationArrow start()", this);
  }

  receiveOwnership(_serializableState: hz.SerializableState, _oldOwner: Player, _newOwner: Player): void {
    if (this.world.getLocalPlayer() !== this.world.getServerPlayer()) {
      ClientStartupReporter.addEntry("NavigationArrow receiveOwnership()");
    }
  }

  clearQuest() {
    this.targets = [];
    this.questId = undefined;

    this.onUpdateCallback?.disconnect();
    this.onUpdateCallback = undefined;
    if (this.isVisible) {
      this.entity.visible.set(false);
      this.isVisible = false;
    }
  }

  checkArrowVisibility(playerPos: Vec3, target: NavigationTarget) {
    if (playerPos.distanceSquared(target.position) < this.props.hideDistance * this.props.hideDistance) {
      return false;
    }

    if (target.region && target.region === this.currentRegion) {
      return false;
    }

    return true
  }

  updateArrow(deltaTime: number) {
    if (this.owner == undefined || this.targets.length === 0) {
      this.onUpdateCallback?.disconnect();
      this.onUpdateCallback = undefined;
      if (this.isVisible) {
        this.entity.visible.set(false);
        this.isVisible = false;
      }

      return;
    }

    let playerPos = this.owner.position.get();
    let target = this.getTarget();

    if (!this.checkArrowVisibility(playerPos, target)) {
      if (this.isVisible) {
        this.entity.visible.set(false);
        this.isVisible = false;
      }

      this.oscillation = 0;
      return;
    }

    if (!this.isVisible) {
      this.entity.visible.set(true);
      this.isVisible = true;
    }

    let targetpos = target.position;
    this.oscillation = MathUtils.twoPiRotate(this.oscillation, deltaTime * this.props.oscillateSpeed);

    let direction = targetpos.sub(playerPos);
    direction.y = 0;
    direction = direction.normalize();
    let arrowPos = this.updateCurrentArrowPosition(playerPos, deltaTime);
    arrowPos.addInPlace(direction.mul(this.props.arrowForward));

    const directionToTarget = targetpos.sub(playerPos).normalize();
    const up = this.props.flatten ? Vec3.up : this.owner.up.get();
    // Set the arrow's rotation to face the target
    arrowPos.addInPlace(this.oscillationOffset(directionToTarget));

    this.entity.position.set(arrowPos);
    this.entity.rotation.set(hz.Quaternion.lookRotation(directionToTarget, up));
  }

  private updateCurrentArrowPosition(playerPos: Vec3, deltaTime: number): Vec3 {
    let result = this.currentArrowPosition;
    const targetPosition = playerPos.add(new Vec3(0, this.props.arrowHeight, 0));
    if (targetPosition.sub(result).magnitude() > this.props.teleportDistance) {
      this.currentArrowPosition.copy(targetPosition);
      return targetPosition;
    }
    result = Vec3.lerp(result, targetPosition, this.props.translationSpeed * deltaTime)
    this.currentArrowPosition.copy(result);
    return result;
  }

  private oscillationOffset(direction: Vec3): Vec3 {
    return direction.mul(Math.sin(this.oscillation) * this.props.oscillateDistance)
  }

  private getTarget(): NavigationTarget {
    let closestTarget = this.targets[0];
    const playerPos = this.owner.position.get();
    for (let i = 0; i < this.targets.length; i++) {
      let target = this.targets[i];
      if (target.island === this.currentIsland && target.position.distanceSquared(playerPos) < closestTarget.position.distanceSquared(playerPos)) {
        closestTarget = target;
      }
    }

    return closestTarget;
  }
}
hz.Component.register(NavigationArrow);
