/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Asset } from 'horizon/core';

export enum ShovelAbilityType {
  None = "",
  WeightMod = "itemWeight",
  GemMod = "gemCount",
  MutationChance = "mutationChance",
  XPMod = "xpMod",
}

export class ShovelAbility {
  type: ShovelAbilityType = ShovelAbilityType.None
  minValue: number = 0
  maxValue: number = 0
  abilityChance: number = 0
  abilityKey: string = ""

  checkForApplication(): boolean {
    if (this.abilityChance <= 0) return true
    return Math.random() < this.abilityChance
  }

  rollAbilityMod(): number {
    return this.minValue + (Math.random() * (this.maxValue - this.minValue))
  }
}

/**
 * Stores per level overrides for a shovel
 */
export class ShovelLevelData {
  Gems: number = 0
  strength: number = 0
  staminaLoss: number = 0
  stability: number = 0
  precision: number = 0
  control: number = 0
  focus: number = 0
  luck: number = 0
}

/**
 * Stores data about a shovel
 */
export class ShovelData {
  id: string = ""
  name: string = ""
  icon: string = ""
  index: number = 0 // DEPRECATED
  price: number = 0
  levelRequirement: number = 0
  strength: number = 0
  staminaLoss: number = 0
  luck: number = 0
  precision: number = 0
  control: number = 0
  stability: number = 0
  focus: number = 0
  maxKg: number = 0
  categoryToBias: string = ""
  itemToBias: string = ""
  biasWeight: number = 0
  description: string = ""
  rarity: number = 0
  defaultLevel: number = 1 // 1 indexed for data entry simplicity
  itemCost1ID: string = ""
  itemCost1Amount: number = 0
  itemCost2ID: string = ""
  itemCost2Amount: number = 0
  itemCost3ID: string = ""
  itemCost3Amount: number = 0
  itemCost4ID: string = ""
  itemCost4Amount: number = 0
  abilityDetails: string = ""
  abilityIconAsset: string = ""
  evolution: string = ""
  evolutionLevel: number = 0
  baseShovel: string = ""
  levelData: ShovelLevelData[] = []
  abilities: ShovelAbility[] = []
  shovelAsset: string = ""

  getIconAsset(): Asset | undefined {
    if (this.icon) {
      let asset = new Asset(BigInt(this.icon), BigInt(0));
      return asset;
    }
    return undefined;
  }

  getAbilityIconAsset(): Asset | undefined {
    if (this.abilityIconAsset) {
      let asset = new Asset(BigInt(this.abilityIconAsset), BigInt(0));
      return asset;
    }
    return undefined;
  }

  getShovelAsset(): Asset | undefined {
    if (this.shovelAsset) {
      let asset = new Asset(BigInt(this.shovelAsset), BigInt(0));
      return asset;
    }
    return undefined;
  }

  getBaseId(): string {
    return this.baseShovel.length > 0 ? this.baseShovel : this.id
  }

  setLevelData(level: number, data: ShovelLevelData) {
    while (level >= this.levelData.length) {
      this.levelData.push(new ShovelLevelData());
    }
    this.levelData[level] = data;
  }

  getStrength(level: number): number {
    if (this.levelData.length == 0) return this.strength
    level = Math.min(level, this.levelData.length - 1)
    return this.levelData[level].strength
  }

  getStability(level: number): number {
    if (this.levelData.length == 0) return this.stability
    level = Math.min(level, this.levelData.length - 1)
    return this.levelData[level].stability
  }

  getStaminaLoss(level: number): number {
    if (this.levelData.length == 0) return this.staminaLoss
    level = Math.min(level, this.levelData.length - 1)
    return this.levelData[level].staminaLoss
  }

  getPrecision(level: number): number {
    if (this.levelData.length == 0) return this.precision
    level = Math.min(level, this.levelData.length - 1)
    return this.levelData[level].precision
  }

  getControl(level: number): number {
    if (this.levelData.length == 0) return this.control
    level = Math.min(level, this.levelData.length - 1)
    return this.levelData[level].control
  }

  getLuck(level: number): number {
    if (this.levelData.length == 0) return this.luck
    level = Math.min(level, this.levelData.length - 1)
    return this.levelData[level].luck
  }

  getFocus(level: number): number {
    if (this.levelData.length == 0) return this.focus
    level = Math.min(level, this.levelData.length - 1)
    return this.levelData[level].focus
  }
}
