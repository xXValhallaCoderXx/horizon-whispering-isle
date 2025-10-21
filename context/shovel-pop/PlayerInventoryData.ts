/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { getPlayerVariableSafe } from "GameUtils";
import { Player, World } from "horizon/core";
import { PVAR_INVENTORY } from "PVarConsts";

// Data type structure for player inventory data pvar
export type PlayerInventoryData = {
  saveVersion: number,
  shovels: string[],
  shovelId: string, // equipped shovel id
  inventory: InventoryItemData[],
  potionInventory: PotionInventoryData[],
}


export type InventoryItemData = {
  id: string,
  weight: number,
  mutation: string,
  isLocked: boolean,
}

export type PotionInventoryData = {
  id: string,
  count: number,
}

export function getPlayerInventoryData(world: World, player: Player): PlayerInventoryData | null {
  const result = getPlayerVariableSafe<PlayerInventoryData>(world, player, PVAR_INVENTORY);
  if (result) {
    if (!result.shovels) result.shovels = [];
    if (!result.inventory) result.inventory = [];
    if (!result.potionInventory) result.potionInventory = [];
  }
  return result;
}
