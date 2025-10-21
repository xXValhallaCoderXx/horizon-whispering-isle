/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Component, Entity, Player, PropTypes } from "horizon/core";
import { Islands } from "Islands";
import { IslandTeleportManager } from "IslandTeleportManager";
import { NPC } from "NPC";

class NPC_Ferryman extends Component<typeof NPC_Ferryman> {
  static propsDefinition = {
    npc: { type: PropTypes.Entity },
    beachcampDialog: { type: PropTypes.Entity },
    priatecoveDialog: { type: PropTypes.Entity },
    icetundraDialog: { type: PropTypes.Entity },
    ftkDialog: { type: PropTypes.Entity },
    moonDialog: { type: PropTypes.Entity },
    islandTeleportManager: { type: PropTypes.Entity },
  };

  private islandTeleportManager!: IslandTeleportManager;

  start() {
    this.connectLocalEvent(this.props.npc!, NPC.LocalSendDialogScript, (payload) => {
      this.onDialogChosen(payload.player, payload.scriptId)
    })

    this.islandTeleportManager = this.props.islandTeleportManager!.getComponents<IslandTeleportManager>()[0];
  }

  onDialogChosen(player: Player, scriptId: Entity) {
    if (!player) {
      return;
    }
    this.teleportIfSelected(scriptId, this.props.beachcampDialog, player, Islands.BeachCamp);
    this.teleportIfSelected(scriptId, this.props.priatecoveDialog, player, Islands.PirateCove);
    this.teleportIfSelected(scriptId, this.props.icetundraDialog, player, Islands.IceTundra);
    this.teleportIfSelected(scriptId, this.props.ftkDialog, player, Islands.FairyTaleKingdom);
    this.teleportIfSelected(scriptId, this.props.moonDialog, player, Islands.Moon);
  }

  private teleportIfSelected(scriptId: Entity, dialog: Entity | undefined, player: Player, island: Islands) {
    if (dialog === undefined || scriptId !== dialog) {
      return;
    }

    this.islandTeleportManager.showTeleportDialog(player, island);
  }
}
Component.register(NPC_Ferryman);
