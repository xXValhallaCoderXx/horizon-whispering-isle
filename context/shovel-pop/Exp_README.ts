/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as hz from 'horizon/core';

/**
 * README
 * In order to get persistent storage, add "playerData" to Variable Group
 * and then add "exp" as a variable under it.
 *
 * Copy this line of code to your script to add exp to the player:
 * this.sendNetworkBroadcastEvent(ExpEvents.expAddToPlayer, { player: currentPlayer, exp: xpGained }, [currentPlayer]);
*/

class Exp_README extends hz.Component<typeof Exp_README> {
  static propsDefinition = {};

  start() {
  }
}
hz.Component.register(Exp_README);
