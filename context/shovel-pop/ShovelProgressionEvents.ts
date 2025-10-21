/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { LocalEvent, NetworkEvent, Player } from "horizon/core";

export const ShovelProgressionEvents = {
  requestNextShovelDataForPlayer: new NetworkEvent<{player: Player}>('requestNextShovelDataForPlayer'),
  returnNextShovelDataForPlayer: new NetworkEvent<{player: Player, shovelName: string, shovelPrice: number, shovelLevelRequirement: number}>('returnNextShovelDataForPlayer'),
  requestResetShovelForPlayer: new NetworkEvent<{player: Player}>('requestResetShovelForPlayer'),
  requestCycleShovelForPlayer: new NetworkEvent<{player: Player}>('requestCycleShovelForPlayer'),
  requestSetShovelForPlayer: new NetworkEvent<{player: Player, shovelId: string}>('requestSetShovelEvent'),
  forceCloseShovelInventory: new NetworkEvent<{}>('forceCloseShovelInventory'),
  requestToggleShovelInventory: new LocalEvent<{}>('requestToggleShovelInventory'),
  shovelInventoryVisibilityChanged: new LocalEvent<{isShown: boolean}>('shovelInventoryVisiblityChanged'),
  shovelProgressionManagerReady: new LocalEvent('shovelProgressionmanagerReady'),
  shovelGivenToPlayer: new NetworkEvent<{player: Player, shovelId: string}>('shovelGivenToPlayer'),
};
