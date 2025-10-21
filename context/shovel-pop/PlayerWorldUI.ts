/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { ClientStartupReporter } from "ClientStartupReporter";
import { DigSpotUI } from "DigSpotUI";
import { DigSpotParams, Events } from "Events";
import * as GameUtils from 'GameUtils';
import { Component, Player, SerializableState, Vec3, World } from "horizon/core";
import { UIComponent } from "horizon/ui";
import { Logger } from "Logger";
import { PlayerService } from "PlayerService";

const DIG_SPOT_RADIUS = 10;
const DIG_SPOT_RADIUS_SQR = DIG_SPOT_RADIUS * DIG_SPOT_RADIUS;

const log = new Logger('PlayerWorldUI');

export class PlayerWorldUI extends Component<typeof PlayerWorldUI> {
  static propsDefinition = {
  };

  private digSpotUIs!: WorldUIPool<DigSpotUI>;

  private playerDigSpots: Map<number, DigSpotParams> = new Map();

  private localPlayer!: Player;

  start() {
    this.localPlayer = this.world.getLocalPlayer();
    log.info(`Start()`);
    if (this.localPlayer === this.world.getServerPlayer()) {
      log.info(`skipping Start() on server.`);
      return;
    }
    log.info("Start() on client");
    this.digSpotUIs = new WorldUIPool<DigSpotUI>();
    GameUtils.connectUIFixup(this);

    this.connectNetworkBroadcastEvent(Events.addDigSpotUI, (data) => this.onAddDigSpotUI(data.id, data.params));
    this.connectNetworkBroadcastEvent(Events.updateDigSpotUI, (data) => this.onUpdateDigSpotUI(data.id, data.percentage, data.digsAttempted, data.delayUpdatePercentage));
    this.connectNetworkBroadcastEvent(Events.removeDigSpotUI, (data) => this.onRemoveDigSpotUI(data.id));
    this.connectLocalBroadcastEvent(World.onUpdate, payload => this.update(payload.deltaTime));

    this.connectLocalBroadcastEvent(Events.checkPlayerUiState, (payload) => {
      const player = payload.player;
      const uiComponentState = {
        localPlayerId: player.id,
        ownerId: this.entity.owner?.get()?.id,
        visible: this.entity.visible.get(),
        isVisibleToPlayer: this.entity.isVisibleToPlayer(player),
        position: this.entity.position.get(),
      }
      GameUtils.logToServer(this, `[PlayerWorldUI] logPlayerUiState() ${JSON.stringify(uiComponentState)}`);
    });

    this.sendNetworkBroadcastEvent(Events.poolObjectInitialized, { player: this.localPlayer, id: "WorldUI", entity: this.entity }, [this.world.getServerPlayer()]);

    log.info("Start() finished on client");
    ClientStartupReporter.addEntry("PlayerWorldUI start()", this);
  }

  receiveOwnership(_serializableState: SerializableState, _oldOwner: Player, _newOwner: Player): void {
    if (this.world.getLocalPlayer() !== this.world.getServerPlayer()) {
      this.sendNetworkBroadcastEvent(Events.poolObjectReceived, { player: this.localPlayer, id: "WorldUI" }, [this.world.getServerPlayer()]);
      ClientStartupReporter.addEntry("PlayerWorldUI receiveOwnership()");
    }
  }

  addDigSpotUI(ui: DigSpotUI) {
    this.digSpotUIs.addPooledUI(ui);
  }

  private update(deltaTime: number) {
    const playerPostion = PlayerService.getPlayerPosition(this.localPlayer);
    this.updateDigSpotUIs(playerPostion);
  }

  private updateDigSpotUIs(playerPostion: Vec3) {
    const inRangeDigSpots: { id: number, distance: number }[] = [];
    this.playerDigSpots.forEach((digSpot, id) => {
      const distance = digSpot.position.distanceSquared(playerPostion);
      if (distance <= DIG_SPOT_RADIUS_SQR) {
        inRangeDigSpots.push({ id, distance });
      }
    });
    inRangeDigSpots.sort((a, b) => a.distance - b.distance);
    const maxCount = this.digSpotUIs.getMaxCount();
    if (inRangeDigSpots.length > maxCount) {
      inRangeDigSpots.splice(maxCount);
    }
    const freeDigSpots: DigSpotUI[] = [];
    this.digSpotUIs.forEachActive(ui => {
      const index = inRangeDigSpots.findIndex((d) => d.id === ui.id);
      if (index === -1) {
        freeDigSpots.push(ui);
      } else {
        inRangeDigSpots.splice(index, 1);
      }
    });
    inRangeDigSpots.forEach((spot) => {
      let ui = freeDigSpots.pop() ?? this.digSpotUIs.acquire();
      if (ui) {
        ui.set(spot.id, this.playerDigSpots.get(spot.id)!, false);
      }
    });
    freeDigSpots.forEach((ui) => {
      this.digSpotUIs.release(ui)
      ui.set(0, { position: new Vec3(0, -50, 0), itemId: "", percentage: 0, starRequirement: 1, digsAttempted: 0 }, false);
    });
  }

  private onAddDigSpotUI(id: number, params: DigSpotParams) {
    log.info(`Adding dig spot ui for player ${this.localPlayer.id} with id ${id} and params ${JSON.stringify(params)}`);
    this.playerDigSpots.set(id, params);
  }

  private onUpdateDigSpotUI(id: number, percentage: number, digsAttempted: number, delayUpdatePercentage: boolean) {
    //log.info(`Updating dig spot ui for player ${this.localPlayer.id}: id ${id}, percentage ${percentage}, digsAttempted ${digsAttempted}, delayUpdatePercentage ${delayUpdatePercentage}`);
    const digSpot = this.playerDigSpots.get(id);
    if (!digSpot) {
      log.info(`Trying to update dig spot ui but player ${this.localPlayer.id} doesn't have a digspot with id ${id}`);
      return;
    }
    digSpot.percentage = percentage;
    digSpot.digsAttempted = digsAttempted;
    this.updateDigSpotUIForID(id, delayUpdatePercentage);
  }

  private onRemoveDigSpotUI(id: number) {
    log.info(`Removing dig spot ui for player ${this.localPlayer.id} with id ${id}`);
    const digSpot = this.playerDigSpots.get(id);
    if (!digSpot) {
      log.info(`Trying to remove dig spot ui but player ${this.localPlayer.id} doesn't have a digspot with id ${id}`);
      return;
    }
    this.playerDigSpots.delete(id);
  }

  private updateDigSpotUIForID(id: number, delayUpdatePercentage: boolean) {
    const digSpotUI = this.digSpotUIs.get(id);
    if (!digSpotUI) {
      return;
    }
    const digSpot = this.playerDigSpots.get(id);
    if (!digSpot) {
      return;
    }
    digSpotUI.set(id, digSpot, delayUpdatePercentage);
  }
}
Component.register(PlayerWorldUI);

class WorldUIPool<T extends IWorldUI> {
  private freeUIs: T[] = [];
  private usedUIs: T[] = [];

  private max = 0;

  addPooledUI(ui: T) {
    this.max++;
    this.freeUIs.push(ui);
  }

  acquire(): T | undefined {
    const ui = this.freeUIs.pop();
    if (!ui) {
      return undefined;
    }
    this.usedUIs.push(ui);
    return ui;
  }

  release(ui: T) {
    const index = this.usedUIs.indexOf(ui);
    if (index < 0) {
      return;
    }
    this.usedUIs.splice(index, 1);
    this.freeUIs.push(ui);
  }

  get(id: number): T | undefined {
    return this.usedUIs.find(ui => ui.id === id);
  }

  getMaxCount(): number {
    return this.max;
  }

  forEachActive(callback: (ui: T, id: number) => void) {
    this.usedUIs.forEach(callback);
  }
}

export interface IWorldUI extends UIComponent<any> {
  id: number;
}
