/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_ItemState } from "BigBox_ItemState";
import { Color } from "horizon/core";
import { Logger } from "Logger";

const log = new Logger("ItemUtils");

/**
 * Configuration for items such as rarity.
 */
export class ItemUtils {
  public static readonly INVALID_ID: string = "";
  public static readonly SHOVEL_ID = "shovel001";
  public static readonly INVALID_INDEX: number = -1;
  public static readonly RARITY_MIN: number = 0;
  public static readonly RARITY_MAX: number = 5;
  public static readonly WEIGHT_MIN: number = 1;
  public static readonly WEIGHT_MAX: number = 1000;
  static readonly RARITY_HEX_COLORS_BEGIN: string[] = [
    "#666666", // Dark Grey
    "#529538", // Dark Green
    "#3e6caf", // Dark Blue
    "#66438a", // Dark Purp
    "#c89e0b", // Dark Gold
    "#af1d1d", // Dark Red
  ];
  public static readonly RARITY_HEX_COLORS: string[] = [
    "#c6c6c6", // Grey
    "#73cf50", // Green
    "#508ee8", // Blue
    "#a86ce5", // Purp
    "#ffd645", // Gold
    "#f75555", // Red
  ];
  public static readonly RARITY_WEIGHTING: number[][] = [
    [ // -4 (shovel level - region level)
      100000,
      0,
      0,
      0,
      0,
      0
    ],
    [ // -3
      90000,
      0,
      0,
      0,
      0,
      0
    ],
    [ // -2
      80000,
      40000,
      0,
      0,
      0,
      0
    ],
    [ // -1
      70000,
      37000,
      3000,
      400,
      0,
      0
    ],
    [ // 0
      60000,
      33000,
      6250,
      830,
      250,
      10
    ],
    [ // 1
      55000,
      32800,
      6200,
      820,
      245,
      10
    ],
    [ // 2
      50000,
      32600,
      6150,
      810,
      240,
      10
    ],
    [ // 3
      45000,
      32400,
      6100,
      800,
      235,
      10
    ],
    [ // 4
      40000,
      32200,
      6050,
      790,
      230,
      10
    ],
  ];

  public static readonly RARITY_INCREMENT: number[][] = [
    [ // -4 (shovel level - region level)
      0,
      0,
      0,
      0,
      0,
      0,
    ],
    [ // -3
      0,
      0,
      0,
      0,
      0,
      0
    ],
    [ // -2
      0,
      0,
      0,
      0,
      0,
      0
    ],
    [ // -1
      0,
      0,
      0,
      0,
      0,
      0
    ],
    [ // 0
      0,
      1000,
      750,
      170,
      50,
      5
    ],
    [ // 1
      0,
      1200,
      800,
      180,
      55,
      5
    ],
    [ // 2
      0,
      1400,
      850,
      190,
      60,
      5
    ],
    [ // 3
      0,
      1600,
      900,
      200,
      65,
      5
    ],
    [ // 4
      0,
      1800,
      950,
      210,
      70,
      5
    ]
  ];

  public static readonly RARITY_XP = [ // todo eban: serialize these values
    10,   // junk
    10,   // ordinary
    10,   // rare
    10,  // epic
    10,  // legendary
    10,  // mythical
  ]

  public static readonly RARITY_TEXT = [
    "Common",
    "Uncommon",
    "Rare",
    "Epic",
    "Legendary",
    "Mythical",
  ]

  // DEPRECATED
  public static readonly RARITY_TO_REGION_PITY = [
    999, // common is never in a region
    4,
    16,
    120,
    9999,
    9999,
  ]

  // Fake data for now - percentage chance of digging a specified item in a shiny spot based on rarity
  // Derive pity from this?
  public static readonly RARITY_BASE_PERCENTAGE = [
    1, // common always diggable
    0.2,
    0.1,
    0.04,
    0.02,
    0.004,
  ]

  // percentage increase per dig in a shiny spot based on rarity
  public static readonly RARITY_PERCENTAGE_INCREMENT = [
    0,
    0.2,
    0.05,
    0.02,
    0.01,
    0.001,
  ]

  public static getRarityWeighting(shovelLevel: number, regionLevel: number): number[] {
    let diff = shovelLevel - regionLevel;
    if (diff < -4) diff = -4;
    if (diff > 4) diff = 4;
    return ItemUtils.RARITY_WEIGHTING[diff + 4];
  }



  public static getRarityIncrements(shovelLevel: number, regionLevel: number): number[] {
    let diff = shovelLevel - regionLevel;
    if (diff < -4) diff = -4;
    if (diff > 4) diff = 4;
    return ItemUtils.RARITY_INCREMENT[diff + 4];
  }

  /**
   * Returns ratios for rarities baesd on luck modifier, shovel level, and region level.
   */
  public static getWeightedRarityWithLuck(luckModifier: number = 0, shovelLevel: number, regionLevel: number): number[] {
    let rarityWeighting = this.getRarityWeighting(shovelLevel, regionLevel);
    let rarityIncrement = this.getRarityIncrements(shovelLevel, regionLevel);

    // Adjust weights based on the luck modifier
    return rarityWeighting.map((weight, index) => {
      const rarityFactor = rarityIncrement[index]; // Higher index means rarer value
      const adjustment = weight + (luckModifier * rarityFactor);
      return adjustment;
    });
  }

  /**
   * Return an index based on the given weights.
   */
  public static getWeightedRandomIndex(weights: number[]): number {
    // Calculate the total sum of adjusted weights
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

    // Generate a random number between 0 and totalWeight
    const random = Math.random() * totalWeight;

    // Iterate through the adjusted weights to find the corresponding index
    let cumulativeWeight = 0;
    for (let i = 0; i < weights.length; i++) {
      cumulativeWeight += weights[i];
      if (random < cumulativeWeight) {
        return i; // Return the index of the selected weight
      }
    }

    throw new Error("Weights array is invalid or empty");
  }

  public static getRandomIndex(array: any[]): number {
    return Math.floor(Math.random() * array.length);
  }

  public static getWeightPercent(weights: number[]): string {
    const totalWeight = weights.reduce((acc, weight) => acc + weight, 0);
    if (totalWeight === 0) return weights.map(() => '0%').join(', ');

    return weights.map(weight => ((weight / totalWeight) * 100).toFixed(2) + '%').join(', ');
  }

  public static hexToColor(hex: string): Color { // thank u chatgpt
    // Remove the leading '#' if present
    hex = hex.replace(/^#/, '');
    // Check if the hex string is valid
    if (hex.length !== 3 && hex.length !== 6) {
      log.error("hex value " + hex + " is not valid")
      return Color.black
    }
    // If the hex code is in shorthand form (e.g., #abc), convert it to full form (e.g., #aabbcc)
    if (hex.length === 3) {
      hex = hex.split('').map(char => char + char).join('');
    }
    // Parse the hex string into RGB components
    const num = parseInt(hex, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return new Color(r / 255, g / 255, b / 255);
  }

  static colorToHex(color: Color): string {
    const r = Math.round(color.r * 255).toString(16).padStart(2, '0');
    const g = Math.round(color.g * 255).toString(16).padStart(2, '0');
    const b = Math.round(color.b * 255).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  static interpolateHexColors(hex1: string, hex2: string, ratio: number): string {
    // Ensure the ratio is between 0 and 1
    ratio = Math.max(0, Math.min(1, ratio));

    // Convert hex to Color
    const color1 = ItemUtils.hexToColor(hex1);
    const color2 = ItemUtils.hexToColor(hex2);

    // Interpolate between the two colors
    const r = color1.r + (color2.r - color1.r) * ratio;
    const g = color1.g + (color2.g - color1.g) * ratio;
    const b = color1.b + (color2.b - color1.b) * ratio;

    return ItemUtils.colorToHex(new Color(r, g, b));
  }

  static interpolateRarityHexColor(rarity: number, ratio: number): string {
    return this.interpolateHexColors(ItemUtils.RARITY_HEX_COLORS_BEGIN[Math.min(rarity, ItemUtils.RARITY_MAX)], ItemUtils.RARITY_HEX_COLORS[Math.min(rarity, ItemUtils.RARITY_MAX)], ratio);
  }

  static getItemValue(state: BigBox_ItemState) : number{
    return Math.max(10, ItemUtils.getValue(state.modifiers.weight, state.info.maxWeight, state.info.minWeight, state.info.maxValue, state.info.minValue))
  }

  static getValue(weight: number, maxWeight: number, minWeight: number, maxValue: number, minValue: number): number {
    return Math.floor((weight / (maxWeight - minWeight) * (maxValue - minValue)) + minValue)
  }
}

/**
 * Stores current overrides for a given item
 */
export class ItemModifiers {
  public weight: number = 1;
  public mutation: string = "";
  public rarity: number = 0;
}
