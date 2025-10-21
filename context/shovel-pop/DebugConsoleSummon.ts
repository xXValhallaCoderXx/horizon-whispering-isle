/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Debug } from "Debug";
import { DebugConsole } from "DebugConsole";
import { Events } from "Events";
import { ButtonIcon, ButtonPlacement, Component, PlayerControls, PlayerInput, PlayerInputAction } from "horizon/core";
import { MARKETING_UI } from "PVarConsts";

const DEBUG_COMMAND_1 = "";
const DEBUG_COMMAND_2 = "";
const DEBUG_COMMAND_3 = "";
const DEBUG_COMMAND_4 = "";

class DebugConsoleSummon extends Component<typeof DebugConsoleSummon> {
  static propsDefinition = {};

  private input!: PlayerInput;

  start() {
    if (this.world.getLocalPlayer() == this.world.getServerPlayer()) {
      return;
    }

    if (!MARKETING_UI) {
      this.setupDebugButton(PlayerInputAction.LeftPrimary, ButtonIcon.Menu, this.onDebugConsoleSummon, false);
    }
    // this.setupDebugButton(PlayerInputAction.LeftTertiary, ButtonIcon.Heal, this.onDebugAction1, false);
    // this.setupDebugButton(PlayerInputAction.LeftSecondary, ButtonIcon.Invisible, this.onDebugAction2, false);
    // this.setupDebugButton(PlayerInputAction.RightSecondary, ButtonIcon.SpeedBoost, this.onDebugAction3, true);
    // this.setupDebugButton(PlayerInputAction.RightTertiary, ButtonIcon.Swap, this.onDebugAction4, true);

    this.setupDebugButtonCommand(PlayerInputAction.LeftTertiary, ButtonIcon.Net, DEBUG_COMMAND_1, false);
    this.setupDebugButtonCommand(PlayerInputAction.LeftSecondary, ButtonIcon.Invisible, DEBUG_COMMAND_2, false);
    this.setupDebugButtonCommand(PlayerInputAction.RightSecondary, ButtonIcon.SpeedBoost, DEBUG_COMMAND_3, true);
    this.setupDebugButtonCommand(PlayerInputAction.RightTertiary, ButtonIcon.Swap, DEBUG_COMMAND_4, true);
  }

  private setupDebugButton(inputAction: PlayerInputAction, icon: ButtonIcon, callback: (action: PlayerInputAction, pressed: boolean) => void, centered: boolean) {
    if (!PlayerControls.isInputActionSupported(inputAction)) {
      return;
    }
    this.input = PlayerControls.connectLocalInput(inputAction, icon, this, { preferredButtonPlacement: centered ? ButtonPlacement.Center : ButtonPlacement.Default });
    this.input.registerCallback(callback.bind(this));
  }

  private setupDebugButtonCommand(inputAction: PlayerInputAction, icon: ButtonIcon, command: string, centered: boolean) {
    if (command.length === 0) {
      return;
    }
    this.input = PlayerControls.connectLocalInput(inputAction, icon, this, { preferredButtonPlacement: centered ? ButtonPlacement.Center : ButtonPlacement.Default });
    this.input.registerCallback((inputAction, pressed) => {
      if (pressed)
        this.sendNetworkBroadcastEvent(Debug.executeDebugCommand, { player: this.world.getLocalPlayer(), path: command })
    });
  }

  private onDebugConsoleSummon(action: PlayerInputAction, pressed: boolean) {
    if (pressed) this.sendNetworkBroadcastEvent(DebugConsole.summon, { player: this.world.getLocalPlayer() }, [this.world.getServerPlayer()]);
  }

  private onDebugAction1(inputAction: PlayerInputAction, pressed: boolean) {
    let localPlayer = this.world.getLocalPlayer();
    if (pressed) {
      this.sendLocalBroadcastEvent(Events.checkPlayerUiState, { player: localPlayer });
      this.sendNetworkBroadcastEvent(Events.debugAction1, localPlayer, [localPlayer, this.world.getServerPlayer()]);
    }
  }

  private onDebugAction2(inputAction: PlayerInputAction, pressed: boolean) {
    if (pressed) {
      this.sendNetworkBroadcastEvent(Events.debugAction2, this.world.getLocalPlayer(), [this.world.getLocalPlayer(), this.world.getServerPlayer()]);
    }
  }

  private onDebugAction3(inputAction: PlayerInputAction, pressed: boolean) {
    if (pressed) this.sendNetworkBroadcastEvent(Events.debugAction3, this.world.getLocalPlayer(), [this.world.getLocalPlayer(), this.world.getServerPlayer()]);
  }

  private onDebugAction4(inputAction: PlayerInputAction, pressed: boolean) {
    if (pressed) this.sendNetworkBroadcastEvent(Events.debugAction4, this.world.getLocalPlayer(), [this.world.getLocalPlayer(), this.world.getServerPlayer()]);
  }
}
Component.register(DebugConsoleSummon);
