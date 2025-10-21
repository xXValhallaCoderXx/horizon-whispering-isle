/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { GateComponent } from "GateComponent";
import { Component, Entity, Player, PropTypes } from "horizon/core";
import { NPC } from "NPC";

export class NPC_Guide extends Component<typeof NPC_Guide> {
  static propsDefinition = {
    npc: { type: PropTypes.Entity },
    openGateDialog: { type: PropTypes.Entity },
    gate: { type: PropTypes.Entity },
  };

  private gate!: GateComponent;
  private npc!: NPC;

  static gateIdToNPCIdMap: Map<string, string> = new Map<string, string>();

  start() {
    this.gate = this.props.gate!.getComponents<GateComponent>()[0];
    this.connectLocalEvent(this.props.npc!, NPC.LocalSendDialogScript, (payload) => {
      this.onDialogChosen(payload.player, payload.scriptId)
    })

    this.npc = this.props.npc!.getComponents<NPC>()[0];
    NPC_Guide.gateIdToNPCIdMap.set(this.gate.props.gateID, this.npc.props.id);
  }

  onDialogChosen(player: Player, scriptId: Entity) {
    if (!player) {
      return;
    }
    this.openGateIfSelected(scriptId, this.props.openGateDialog, player);
  }

  private openGateIfSelected(scriptId: Entity, dialog: Entity | undefined, player: Player) {
    // Open the gate on the given island if the player meets the requirements
    if (dialog === undefined || scriptId !== dialog) {
      return;
    }
    this.gate.tryOpenGate(player);
  }
}
Component.register(NPC_Guide);
