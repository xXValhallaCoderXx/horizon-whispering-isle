/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
// import { Component, Player, PropTypes } from "horizon/core";
// import { Logger } from "Logger";
// import { PlayerInventoryManager } from "PlayerInventoryManager";

// const log = new Logger("DirtMoundAutoPooled");

// export class DirtMoundAutoPooled extends Component<typeof DirtMoundAutoPooled> {
//   static propsDefinition = {
//     id: { type: PropTypes.String, default: 'Object' },
//   };

//   start() {
//     log.info("DirtMoundAutoPooled: Start");
//   }

//   receiveOwnership(state: null, fromPlayer: Player, toPlayer: Player) {
//     log.info(`DirtMoundAutoPooled: receiveOwnership  fromPlayer: ${fromPlayer}  toPlayer: ${toPlayer}`);
//   }

//   transferOwnership(fromPlayer: Player, toPlayer: Player): null {
//     log.info(`DirtMoundAutoPooled: transferOwnership  fromPlayer: ${fromPlayer}  toPlayer: ${toPlayer}`);
//     if (fromPlayer === this.world.getServerPlayer()) {
//       let playerData = PlayerInventoryManager.instance.getData(toPlayer);
//       if (playerData) {
//         playerData.mound = this.entity;
//       }
//       else {
//         log.info("DirtMoundAutoPooled: transferOwnership: playerData is null");
//       }
//     }
//     return null;
//   }
// }
// Component.register(DirtMoundAutoPooled);
