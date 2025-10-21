/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { ClientStartupReporter } from "ClientStartupReporter";
import { AudioGizmo, Component, Player, PropTypes, SerializableState } from "horizon/core";
import { Logger } from "Logger";

const log = new Logger("AudioBank");

export class AudioBank extends Component<typeof AudioBank> {
  static propsDefinition = {
    isServer: { type: PropTypes.Boolean },
    audioGizmosRoot: { type: PropTypes.Entity }
  };

  private static localInstance?: AudioBank;

  private localPlayer!: Player;
  private serverPlayer!: Player;
  private isServer!: boolean;

  private audioGizmoMap = new Map<string, AudioGizmo>();

  start() {
    this.localPlayer = this.world.getLocalPlayer();
    this.serverPlayer = this.world.getServerPlayer();
    this.isServer = this.localPlayer === this.serverPlayer;
    if (this.isServer !== this.props.isServer) {
      return;
    }
    AudioBank.localInstance = this;
    this.loadAudioGizmos();
    ClientStartupReporter.addEntry("AudioBank start()", this);
  }

  receiveOwnership(_serializableState: SerializableState, _oldOwner: Player, _newOwner: Player): void {
    if (this.world.getLocalPlayer() !== this.world.getServerPlayer()) {
      ClientStartupReporter.addEntry("AudioBank receiveOwnership()");
    }
  }

  private loadAudioGizmos() {
    this.props.audioGizmosRoot?.children.get().forEach(child => this.audioGizmoMap.set(child.name.get(), child.as(AudioGizmo)));
  }

  static play(id: string, fade?: number, players?: Player[]) {
    const audioBank = this.localInstance;
    if (!audioBank) {
      log.warn(`Trying to play sound ${id} before AudioBank is initialized`);
      return;
    }
    const audioGizmo = audioBank.audioGizmoMap.get(id);
    if (!audioGizmo) {
      log.warn(`Audio gizmo ${id} not found`);
      return;
    }
    if (!players && !audioBank.isServer) {
      players = [audioBank.localPlayer];
    }
    fade ??= 0;
    audioGizmo.play({ fade, players })
  }
}
Component.register(AudioBank);
