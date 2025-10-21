/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_ToastEvents } from 'BigBox_ToastManager';
import { Component, PropTypes, World } from 'horizon/core';
import { IslandTeleportManager } from 'IslandTeleportManager';
import { PlayerService } from 'PlayerService';

class DrownTrigger extends Component<typeof DrownTrigger> {
  static propsDefinition = {
    message: { type: PropTypes.String, default: "You need a boat to cross the water!" },
    islandTeleportManager: { type: PropTypes.Entity },
  };

  private readonly checkFrequency: number = 0.5; // How often to check for players in the water (seconds)
  private checkTimer: number = 0.0;
  private islandTeleportManager!: IslandTeleportManager;

  // Stupidly this doesn't work because the player's hands trigger this in the digging animation...
  //start() {
  //  this.connectCodeBlockEvent(this.entity, CodeBlockEvents.OnPlayerEnterTrigger, (player: Player) => {
  //    this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
  //      player: player,
  //      text: this.props.message
  //    });
  //    // Teleport the player back to safety
  //    PlayerInventoryManager.instance.teleportPlayer(player);
  //  });
  //}

  start() {
    this.connectLocalBroadcastEvent(World.onUpdate, (data: { deltaTime: number }) => this.update(data.deltaTime));
    this.islandTeleportManager = this.props.islandTeleportManager!.getComponents<IslandTeleportManager>()[0];
  }

  update(deltaTime: number) {
    this.checkTimer += deltaTime;

    if (this.checkTimer >= this.checkFrequency) {
      this.checkTimer = 0.0;

      let players = PlayerService.getConnectedPlayers();

      for (let player of players) {
        // Check if the players feet are under water
        const footY = PlayerService.getPlayerFootPosition(player).y;
        if (footY < this.entity.position.get().y && footY !== -50) {  // Gross hack, we return a position below the world (y = -50) if there is any error in getting the player position, this ignores that case.
          this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
            player: player,
            text: this.props.message
          }, [player]);

          // Teleport the player back to safety
          this.islandTeleportManager.teleportPlayerToLastIsland(player, 0);
        }
      }
    }
  }
}

Component.register(DrownTrigger);
