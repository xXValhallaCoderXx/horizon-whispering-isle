/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { ClientStartupReporter } from "ClientStartupReporter";
import { CodeBlockEvents, Component, NetworkEvent, Player, SerializableState, TriggerGizmo, Vec3 } from "horizon/core";
import { Logger } from "Logger";

const HIDDEN_POSITION = new Vec3(0, -100, 0);
const INTERACT_COOLDOWN = 1000;

const log = new Logger("PlayerInteractionTrigger");

export class PlayerInteractionTrigger extends Component<typeof PlayerInteractionTrigger> {
  static propsDefinition = {};

  private localPlayer!: Player;
  private serverPlayer!: Player;
  private trigger!: TriggerGizmo;
  private isOnCooldown = false;
  private disableContexts = new Array<string>();
  private currentPosition = Vec3.zero;

  static setTrigger = new NetworkEvent<{ position: Vec3 }>("PlayerInteractionTrigger_setPosition");
  static hide = new NetworkEvent("PlayerInteractionTrigger_hide");
  static onInteract = new NetworkEvent<Player>("PlayerInteractionTrigger_onInteract");
  static addDisableContext = new NetworkEvent<{ context: string }>("PlayerInteractionTrigger_addDisableContext");
  static removeDisableContext = new NetworkEvent<{ context: string }>("PlayerInteractionTrigger_removeDisableContext");

  start() {
    this.localPlayer = this.world.getLocalPlayer();
    this.serverPlayer = this.world.getServerPlayer();
    this.trigger = this.entity.as(TriggerGizmo);
    this.hide();
    if (this.localPlayer === this.serverPlayer) {
      this.trigger.setWhoCanTrigger([]);
      return;
    }
    log.info("Start");
    this.trigger.setWhoCanTrigger([this.localPlayer]);

    this.connectCodeBlockEvent(
      this.entity,
      CodeBlockEvents.OnPlayerEnterTrigger,
      (player: Player) => this.onInteract(player));

    this.connectNetworkBroadcastEvent(PlayerInteractionTrigger.setTrigger, (data) => {
      this.setLocation(data.position);
    });

    this.connectNetworkBroadcastEvent(PlayerInteractionTrigger.hide, () => {
      this.hide();
    });

    this.connectNetworkBroadcastEvent(PlayerInteractionTrigger.addDisableContext, data => this.addDisableContext(data.context));
    this.connectNetworkBroadcastEvent(PlayerInteractionTrigger.removeDisableContext, data => this.removeDisableContext(data.context));

    ClientStartupReporter.addEntry("PlayerInteractionTrigger start()", this);
  }

    receiveOwnership(_serializableState: SerializableState, _oldOwner: Player, _newOwner: Player): void {
      if (this.world.getLocalPlayer() !== this.world.getServerPlayer()) {
        ClientStartupReporter.addEntry("PlayerInteractionTrigger receiveOwnership()");
      }
    }

  private addDisableContext(context: string) {
    if (this.disableContexts.includes(context)) {
      return;
    }
    this.disableContexts.push(context);
    log.info(`Adding disable context ${context} to interaction trigger at ${this.currentPosition}`);
    if (this.disableContexts.length === 1) {
      this.trigger.setWhoCanTrigger([]);
      log.info(`Disabling interaction trigger at ${this.currentPosition}`);
    }
  }

  private removeDisableContext(context: string) {
    const index = this.disableContexts.indexOf(context);
    if (index < 0) {
      return;
    }
    this.disableContexts.splice(index, 1);
    log.info(`Removing disable context ${context} to interaction trigger at ${this.currentPosition}`);
    if (this.disableContexts.length === 0) {
      this.trigger.setWhoCanTrigger([this.localPlayer]);
      log.info(`Enabling interaction trigger at ${this.currentPosition}`);
    }
  }

  private onInteract(player: Player) {
    if (player.id != this.localPlayer.id || this.isOnCooldown) {
      return;
    }
    this.sendNetworkBroadcastEvent(PlayerInteractionTrigger.onInteract, this.localPlayer, [this.serverPlayer, this.localPlayer]);
    this.isOnCooldown = true;
    this.async.setTimeout(() => {
      this.isOnCooldown = false;
    }, INTERACT_COOLDOWN);
    log.info(`Player ${player.id} interacted with interaction trigger at ${this.currentPosition}`);
  }

  private hide() {
    this.setLocation(HIDDEN_POSITION);
  }

  private setLocation(position: Vec3) {
    this.entity.position.set(position);
    this.currentPosition = position;
  }
}
Component.register(PlayerInteractionTrigger);
