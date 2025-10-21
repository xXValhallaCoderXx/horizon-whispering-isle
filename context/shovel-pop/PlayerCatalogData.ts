/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Islands } from "Islands";
import { PVAR_CATALOG_0, PVAR_CATALOG_1, PVAR_CATALOG_10, PVAR_CATALOG_11, PVAR_CATALOG_2, PVAR_CATALOG_3, PVAR_CATALOG_4, PVAR_CATALOG_5, PVAR_CATALOG_6, PVAR_CATALOG_7, PVAR_CATALOG_8, PVAR_CATALOG_9 } from "PVarConsts";

export type PlayerCatalogData = {
  initialized: boolean,
  saveVersion: number,
  version: number,
  /**
   * Collection of all the collectedItems in this dataset.
   * Constrained to {@link PlayerCollectedItemDataMaxCount} items.
   */
  collectedItems: PlayerCollectedItemData[],
  itemIdsOfInterest: string[],
  islandCollectionProgress: PlayerIslandProgress[],
  completedZones: string[],
  unlockedIslands: Islands[],
  /**
   * True if there's still room in collectedItems to hold more data.
   * If full, we cannot add more data without risking exceeding the 10kb pvar limit.
   */
  hasCapacity: boolean,
  /**
   * True if this player data is deprecated and from before catalog data was split into multiple pvars.
   */
  deprecated?: boolean,
}

export const PlayerCollectedItemDataMaxCount = 70;

export type PlayerCollectedItemData = {
  id: string,
  count: number,
  timeDiscovered: number,
  heaviestWeight: number,
  isNew: boolean,
}

export type PlayerIslandProgress = {
  island: Islands,
  collectedRewards: number,
}

/**
 * Collection of all the player catalog pvars. Useful for iterating.
 */
export const PlayerCatalogPvars = [
  PVAR_CATALOG_0,
  PVAR_CATALOG_1 ,
  PVAR_CATALOG_2,
  PVAR_CATALOG_3,
  PVAR_CATALOG_4,
  PVAR_CATALOG_5,
  PVAR_CATALOG_6,
  PVAR_CATALOG_7,
  PVAR_CATALOG_8,
  PVAR_CATALOG_9,
  PVAR_CATALOG_10,
  PVAR_CATALOG_11,
]

export function GetCollectedItemData(catalogData: PlayerCatalogData, itemId: string) {
  for (let i = 0; i < catalogData.collectedItems.length; ++i) {
    const collectedItemData = catalogData.collectedItems[i];
    if (collectedItemData.id === itemId) {
      return collectedItemData;
    }
  }
  return null;
}

export function GetNewItemCount(catalogData: PlayerCatalogData) {
  let count = 0;
  for (let i = 0; i < catalogData.collectedItems.length; ++i) {
    const collectedItemData = catalogData.collectedItems[i];
    if (collectedItemData.isNew) {
      count++;
    }
  }
  return count;
}
