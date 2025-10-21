/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
// import * as hz from 'horizon/core';
// import { Logger } from 'Logger';
// import { PlayerInventoryManager } from 'PlayerInventoryManager';
// import { PlayerService } from 'PlayerService';

// const log = new Logger("DebugMenuSpawner");

// /** NOTE: Will only show up in Worlds that contain "[DEV]" in the name */
// export class DebugMenuSpawner extends hz.Component<typeof DebugMenuSpawner> {
//   static propsDefinition = {
//   };

//   private playerToDebugMenu: Map<hz.Player, hz.Entity> = new Map();
//   private debugMenuPool: Array<hz.Entity> = new Array();

//   start() {

//     if (PlayerInventoryManager.instance.isDevWorld) {
//       this.debugMenuPool = this.entity.children.get();
//       PlayerService.connectPlayerEnterWorld(
//         this,
//         (player: hz.Player) => { this.onPlayerEnterWorld(player); });

//       PlayerService.connectPlayerExitWorld(
//         this,
//         (player: hz.Player) => { this.onPlayerExitWorld(player); });
//       }
//       else {
//         // Only show the debug menu in dev worlds
//         this.entity.visible.set(false);
//       }
//     }

//     private async onPlayerEnterWorld(player: hz.Player) {
//       if (this.debugMenuPool.length == 0) {
//         log.error(`No debug console summons available for new player (${player.id}`);
//         return;
//       }
//       const summonInstance = this.debugMenuPool.pop()!;
//       this.playerToDebugMenu.set(player, summonInstance);
//       summonInstance.owner.set(player);
//     }

//     private onPlayerExitWorld(player: hz.Player) {
//       const summonInstance = this.playerToDebugMenu.get(player);
//       if (summonInstance === undefined) {
//         return;
//       }
//       summonInstance!.owner.set(this.world.getServerPlayer());
//       this.playerToDebugMenu.delete(player);
//       this.debugMenuPool.push(summonInstance!);
//     }
// }
// hz.Component.register(DebugMenuSpawner);
