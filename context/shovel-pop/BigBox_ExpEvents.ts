/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { LocalEvent, NetworkEvent, Player } from "horizon/core";

export const BigBox_ExpEvents = {
  expAddToPlayer: new NetworkEvent<{player: Player, exp: number, showToast: boolean, updateUI?: boolean}>('expAddToPlayer'),
  addExpToPlayer: new LocalEvent<{player: Player, exp: number, showToast: boolean, updateUI?: boolean}>('addExpToPlayer'),
  expUpdatedForPlayer: new NetworkEvent<{player: Player, currentLevel: number, percentExpToNextLevel: number, gainedExp: number, showToast: boolean, updateUI?: boolean}>('expUpdatedForPlayer'),
  requestInitializeExpForPlayer: new NetworkEvent<{player: Player}>('requestInitializeExpForPlayer'),
  requestResetExpForPlayer: new NetworkEvent<{player: Player}>('requestResetExpForPlayer'),
};
