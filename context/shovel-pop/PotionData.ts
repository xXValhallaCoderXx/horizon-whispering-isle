/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Asset, PropTypes } from "horizon/core";
import { Image, ImageSource, UIComponent, UINode, View } from "horizon/ui";

export enum PotionBuffType {
  Category,
  Rarity
}

// TODO: JSON?
export const HARDCODED_POTION_TUNING: Array<PotionTuning> = [
  {
    potionId: "category_cat0",
    displayName: "Weak Chance Potion",
    shortName: "Weak",
    description: "Pickly spring tang.",
    details: "Meagerly improves chance of target item.",
    price: 180,
    buffType: PotionBuffType.Rarity,
    buffId: "1",
    buffValue: [
      0,
      0.16,
      0.001,
      0.004,
      0.002,
      0.00001,
    ],
    duration: 3,
    digs: 1,
    bundleWeight: 18,
    levelRequirement: 0,
    minigameBoost: .25,
  },
  {
    potionId: "category_cat1",
    displayName: "Basic Chance Potion",
    shortName: "Basic",
    description: "Cool berry sweetness.",
    details: "Slightly improves chance of target item.",
    price: 250,
    buffType: PotionBuffType.Rarity,
    buffId: "2",
    buffValue: [
      0,
      0,
      0.1,
      0.004,
      0.0002,
      0.00001,
    ],
    duration: 3,
    digs: 1,
    bundleWeight: 18,
    levelRequirement: 0,
    minigameBoost: .5,
  },
  {
    potionId: "category_cat2",
    displayName: "Greater Chance Potion",
    shortName: "Greater",
    description: "Rich lavender aroma.",
    details: "Doubles chance of target item.",
    price: 400,
    buffType: PotionBuffType.Rarity,
    buffId: "3",
    buffValue: [
      0,
      0,
      0,
      0.1,
      0.0025,
      0.00003,
    ],
    duration: 3,
    digs: 1,
    bundleWeight: 9,
    levelRequirement: 0,
    minigameBoost: 1,
  },
  {
    potionId: "category_cat3",
    displayName: "Superior Chance Potion",
    shortName: "Superior",
    description: "Fresh lemony zing.",
    details: "Triples chance of target item.",
    price: 1000,
    buffType: PotionBuffType.Rarity,
    buffId: "4",
    buffValue: [
      0,
      0,
      0,
      0,
      0.008,
      0.00005,
    ],
    duration: 3,
    digs: 1,
    bundleWeight: 4,
    levelRequirement: 0,
    minigameBoost: 2,
  },
  {
    potionId: "category_cat4",
    displayName: "Ultimate Chance Potion",
    shortName: "Ultimate",
    description: "Vibrant fiery twist.",
    details: "Quadruples chance of target item.",
    price: 1250,
    buffType: PotionBuffType.Rarity,
    buffId: "5",
    buffValue: [
      0,
      0,
      0,
      0,
      0,
      0.0002,
    ],
    duration: 3,
    digs: 1,
    bundleWeight: 1,
    levelRequirement: 0,
    minigameBoost: 4,
  },
]

export type PotionTuning = {
  potionId: string,
  displayName: string,
  shortName: string,
  description: string, // Flavor text - LITERALLY LOL
  details: string, // Text about the actual numbers being changed
  price: number,
  buffType: PotionBuffType, // the type of stat this potion buffs
  buffId: string,           // the id of the stat this potion buffs (e.g. "shiny" for type category, "1" for type rarity)
  buffValue: number[],        // the value the stat is altered by (e.g. 0.2 = 20%)
  duration: number, // deprecated
  digs: number, // deprecated
  bundleWeight: number,
  minigameBoost: number,
  levelRequirement: number,
  itemCost1ID?: string,
  itemCost1Amount?: number,
  itemCost2ID?: string,
  itemCost2Amount?: number,
  itemCost3ID?: string,
  itemCost3Amount?: number,
}

export const POTION_BUNDLE_PRICE = 500;
export const POTION_BUNDLE_SIZE = 5;
export const POTION_BUNDLE_ID = "potionbundle";

export class PotionData extends UIComponent<typeof PotionData> {
  static propsDefinition = {
    yellowPotion: { type: PropTypes.Asset },
    greenPotion: { type: PropTypes.Asset },
    bluePotion: { type: PropTypes.Asset },
    purplePotion: { type: PropTypes.Asset },
    redPotion: { type: PropTypes.Asset },
    orangePotion: { type: PropTypes.Asset },
    cyanPotion: { type: PropTypes.Asset },
    pinkPotion: { type: PropTypes.Asset },
    server: { type: PropTypes.Boolean },
  };

  private static instance?: PotionData;
  private potionImageMap!: Array<{ potionId: string, image: ImageSource, asset: Asset }>;

  start() {
    PotionData.instance = this;

    this.potionImageMap = [
      this.potionImageEntry("category_cat0", this.props.greenPotion!),
      this.potionImageEntry("category_cat1", this.props.cyanPotion!),
      this.potionImageEntry("category_cat2", this.props.purplePotion!),
      this.potionImageEntry("category_cat3", this.props.yellowPotion!),
      this.potionImageEntry("category_cat4", this.props.redPotion!),
    ]
  }

  private potionImageEntry(potionId: string, imageAsset: Asset): { potionId: string; image: ImageSource; asset: Asset; } {
    return { potionId, image: ImageSource.fromTextureAsset(imageAsset), asset: imageAsset };
  }

  initializeUI() {
    if (this.world.getLocalPlayer() === this.world.getServerPlayer()) {
      return View({
        children: [
          Image({ source: ImageSource.fromTextureAsset(this.props.yellowPotion!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.greenPotion!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.bluePotion!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.purplePotion!), style: { display: "none" } }),
        ],
        style: { display: "none" }
      });
    }
    return new UINode();
  }

  static getPotionTuning(potionId: string): PotionTuning | undefined {
    return HARDCODED_POTION_TUNING.find((potion) => potion.potionId === potionId);
  }

  static getPotionMinigameChanceBoost(potionId: string) {
    return HARDCODED_POTION_TUNING.find((potion) => potion.potionId === potionId)?.minigameBoost ?? 0;
  }

  static getAllPotionTuning(): PotionTuning[] {
    return HARDCODED_POTION_TUNING;
  }

  static getPotionImage(potionId: string): ImageSource | undefined {
    return this.instance?.potionImageMap.find((potion) => potion.potionId === potionId)?.image;
  }

  static getPotionImageAsset(potionId: string): Asset | undefined {
    return this.instance?.potionImageMap.find((potion) => potion.potionId === potionId)?.asset;
  }
}
UIComponent.register(PotionData);
