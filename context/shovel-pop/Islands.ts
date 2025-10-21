/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Asset } from "horizon/core";
import { missing_texture, UI_Utils } from "UI_Utils";

export enum Islands {
  None = 0,
  BeachCamp = 1,
  PirateCove = 2,
  IceTundra = 3,
  FairyTaleKingdom = 4,
  LTE = 5,
  Moon = 6,
}

const tuning: IslandTuning[] = [
  {
    island: Islands.BeachCamp,
    id: "Basecamp",
    displayName: 'Beach Camp',
    digDifficulty: 1,
    potionSellerNPCId: "potion_seller_basecamp",
    shopNPCId: "shopkeeper_basecamp",
    gateId: "",
    catalogImageAsset: "2612746872247796",
    showInCatalog: true,
    collectionRewardLevels: [
      { collectedAmount: 8, expReward: 80, gemReward: 0 },
      { collectedAmount: 16, expReward: 80, gemReward: 0 },
      { collectedAmount: 24, expReward: 80, gemReward: 0 },
      { collectedAmount: 32, expReward: 80, gemReward: 0 },
      { collectedAmount: 40, expReward: 80, gemReward: 0 },
      { collectedAmount: 46, expReward: 80, gemReward: 0 },
      { collectedAmount: 52, expReward: 80, gemReward: 0 },
      { collectedAmount: 58, expReward: 80, gemReward: 0 },
      { collectedAmount: 63, expReward: 80, gemReward: 0 },
      { collectedAmount: 68, expReward: 80, gemReward: 0 },
      { collectedAmount: 71, expReward: 80, gemReward: 0 },
      { collectedAmount: 74, expReward: 80, gemReward: 0 },
      { collectedAmount: 76, expReward: 80, gemReward: 0 },
      { collectedAmount: 78, expReward: 80, gemReward: 0 },
      { collectedAmount: 79, expReward: 80, gemReward: 0 },
    ]
  },
  {
    island: Islands.PirateCove,
    id: "Pirate",
    displayName: 'Pirate Cove',
    digDifficulty: 1.05,
    potionSellerNPCId: "potion_seller_piratecove",
    shopNPCId: "shopkeeper_piratecove",
    gateId: "beachcamp_ferry",
    catalogImageAsset: "4069983973273120",
    showInCatalog: true,
    collectionRewardLevels: [
      { collectedAmount: 8, expReward: 100, gemReward: 0 },
      { collectedAmount: 15, expReward: 100, gemReward: 0 },
      { collectedAmount: 21, expReward: 100, gemReward: 0 },
      { collectedAmount: 26, expReward: 100, gemReward: 0 },
      { collectedAmount: 30, expReward: 100, gemReward: 0 },
      { collectedAmount: 34, expReward: 100, gemReward: 0 },
      { collectedAmount: 37, expReward: 100, gemReward: 0 },
      { collectedAmount: 40, expReward: 100, gemReward: 0 },
      { collectedAmount: 42, expReward: 100, gemReward: 0 },
    ]
  },
  {
    island: Islands.IceTundra,
    id: "Tundra",
    displayName: 'Ice Tundra',
    digDifficulty: 1.1,
    potionSellerNPCId: "potion_seller_icetundra",
    shopNPCId: "shopkeeper_icetundra",
    gateId: "pirate_portal",
    catalogImageAsset: "1184291053134739",
    showInCatalog: false,
    collectionRewardLevels: [
      { collectedAmount: 8, expReward: 650, gemReward: 20 },
      { collectedAmount: 15, expReward: 650, gemReward: 20 },
      { collectedAmount: 21, expReward: 650, gemReward: 20 },
      { collectedAmount: 26, expReward: 650, gemReward: 20 },
      { collectedAmount: 30, expReward: 650, gemReward: 20 },
      { collectedAmount: 34, expReward: 650, gemReward: 20 },
      { collectedAmount: 37, expReward: 650, gemReward: 20 },
      { collectedAmount: 40, expReward: 650, gemReward: 20 },
      { collectedAmount: 42, expReward: 650, gemReward: 20 },
    ]
  },
  {
    island: Islands.FairyTaleKingdom,
    id: "Fantasy",
    displayName: 'Fairy Tale Isle',
    digDifficulty: 1.2,
    potionSellerNPCId: "potion_seller_fairytale",
    shopNPCId: "shopkeeper_fairytale",
    gateId: "tundra_portal",
    catalogImageAsset: "1862971647804611",
    showInCatalog: false,
    collectionRewardLevels: [
      { collectedAmount: 8, expReward: 650, gemReward: 20 },
      { collectedAmount: 15, expReward: 650, gemReward: 20 },
      { collectedAmount: 21, expReward: 650, gemReward: 20 },
      { collectedAmount: 26, expReward: 650, gemReward: 20 },
      { collectedAmount: 30, expReward: 650, gemReward: 20 },
      { collectedAmount: 34, expReward: 650, gemReward: 20 },
      { collectedAmount: 37, expReward: 650, gemReward: 20 },
      { collectedAmount: 40, expReward: 650, gemReward: 20 },
      { collectedAmount: 42, expReward: 650, gemReward: 20 },
    ]
  },
  {
    island: Islands.LTE,
    id: "LTE",
    displayName: 'LTE',
    digDifficulty: 1,
    potionSellerNPCId: "",
    shopNPCId: "",
    gateId: "",
    catalogImageAsset: "",
    showInCatalog: false,
    collectionRewardLevels: [
      { collectedAmount: 8, expReward: 650, gemReward: 20 },
      { collectedAmount: 15, expReward: 650, gemReward: 20 },
      { collectedAmount: 21, expReward: 650, gemReward: 20 },
      { collectedAmount: 26, expReward: 650, gemReward: 20 },
      { collectedAmount: 30, expReward: 650, gemReward: 20 },
      { collectedAmount: 34, expReward: 650, gemReward: 20 },
      { collectedAmount: 37, expReward: 650, gemReward: 20 },
      { collectedAmount: 40, expReward: 650, gemReward: 20 },
      { collectedAmount: 42, expReward: 650, gemReward: 20 },
    ]
  },
  {
    island: Islands.Moon,
    id: "Moon",
    displayName: '???',
    digDifficulty: 1.33,
    potionSellerNPCId: "",
    shopNPCId: "",
    gateId: "fantasy_finalgate",
    catalogImageAsset: "1819718352139532",
    showInCatalog: false,
    collectionRewardLevels: [
      { collectedAmount: 8, expReward: 650, gemReward: 20 },
      { collectedAmount: 15, expReward: 650, gemReward: 20 },
      { collectedAmount: 21, expReward: 650, gemReward: 20 },
      { collectedAmount: 26, expReward: 650, gemReward: 20 },
      { collectedAmount: 30, expReward: 650, gemReward: 20 },
      { collectedAmount: 34, expReward: 650, gemReward: 20 },
      { collectedAmount: 37, expReward: 650, gemReward: 20 },
      { collectedAmount: 40, expReward: 650, gemReward: 20 },
      { collectedAmount: 42, expReward: 650, gemReward: 20 },
    ]
  }
]

export function getIslandDigDifficulty(island: Islands): number {
  return tuning.find(t => t.island === island)?.digDifficulty ?? 1;
}

export function getIslandFromID(id: string): Islands | undefined {
  return tuning.find(t => t.id === id)?.island;
}

export function getIslandID(island: Islands): string | undefined {
  return tuning.find(t => t.island === island)?.id;
}

export function getIslandDisplayName(island: Islands | string): string | undefined {
  return tuning.find(t => t.island === island || t.id === island)?.displayName;
}

export function getIslandCollectionRewardAmount(island: Islands, level: number): number | undefined {
  const rewardLevels = tuning.find(t => t.island === island)?.collectionRewardLevels;
  if (rewardLevels === undefined) {
    return undefined;
  }
  if (level < 0 || level >= rewardLevels.length) {
    return undefined;
  }
  return rewardLevels[level].collectedAmount;
}

export function getIslandCollectionRewardExpReward(island: Islands, level: number): number | undefined {
  const rewardLevels = tuning.find(t => t.island === island)?.collectionRewardLevels;
  if (rewardLevels === undefined) {
    return undefined;
  }
  if (level < 0 || level >= rewardLevels.length) {
    return undefined;
  }
  return rewardLevels[level].expReward;
}

export function getIslandCollectionRewardGemReward(island: Islands, level: number): number | undefined {
  const rewardLevels = tuning.find(t => t.island === island)?.collectionRewardLevels;
  if (rewardLevels === undefined) {
    return undefined;
  }
  if (level < 0 || level >= rewardLevels.length) {
    return undefined;
  }
  return rewardLevels[level].gemReward;
}

export function getIslandPotionNPCId(island: Islands): string | undefined {
  return tuning.find(t => t.island === island)?.potionSellerNPCId;
}

export function getIslandShopNPCId(island: Islands): string | undefined {
  return tuning.find(t => t.island === island)?.shopNPCId;
}

export function getStartingUnlockedIslands(): Islands[] {
  return tuning.filter(t => t.gateId === "").map(t => t.island);
}

export function getIslandsUnlockedByGate(gateId: string): Islands {
  return tuning.find(t => t.gateId === gateId)?.island ?? Islands.None;
}

export function forEachIsland(callback: (island: Islands) => void) {
  tuning.forEach(t => callback(t.island));
}

export function getIslandCatalogImageAsset(island: Islands): Asset | undefined {
    const imageAsset = tuning.find(t => t.island === island)?.catalogImageAsset;
    if (imageAsset === undefined) {
      return undefined;
    }
    return new Asset(BigInt(imageAsset), BigInt(0));
}

export function isShownInCatalog(island: Islands): boolean {
  return tuning.find(t => t.island === island)?.showInCatalog ?? false;
}

export type IslandTuning = {
  island: Islands,
  id: string,
  displayName: string,
  digDifficulty: number,
  potionSellerNPCId: string,
  shopNPCId: string,
  gateId: string,
  catalogImageAsset: string,
  showInCatalog: boolean,
  collectionRewardLevels: IslandCollectionReward[]
}

export type IslandCollectionReward = {
  collectedAmount: number,
  expReward: number,
  gemReward: number,
}
