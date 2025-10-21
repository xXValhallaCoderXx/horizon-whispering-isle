/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
export enum HUDElementType {
  None              = 0,
  Catalog           = 1 << 0,
  Salary            = 1 << 1,
  ShovelProgression = 1 << 2,
  Quest             = 1 << 3,
  AboveInventory    = 1 << 4,
  Inventory         = 1 << 5,
  ShovelInventory   = 1 << 6,
  LootZone          = 1 << 7,
  Location          = 1 << 8,
  DigAction         = 1 << 9,
  PotionInventory   = 1 << 10,
  DigMinigameUsefulWidget   = 1 << 11,
  Resources         = 1 << 12,
  WorldUI_DigSpot   = 1 << 13,
}

export const allHudElementTypes = HUDElementType.Catalog |
                                  HUDElementType.Salary |
                                  HUDElementType.ShovelProgression |
                                  HUDElementType.Quest |
                                  HUDElementType.AboveInventory |
                                  HUDElementType.Inventory |
                                  HUDElementType.ShovelInventory |
                                  HUDElementType.LootZone |
                                  HUDElementType.Location |
                                  HUDElementType.DigAction |
                                  HUDElementType.PotionInventory |
                                  HUDElementType.DigMinigameUsefulWidget |
                                  HUDElementType.Resources |
                                  HUDElementType.WorldUI_DigSpot;

export const marketingUIElementTypes = HUDElementType.DigAction;

export enum LTEState {
  NONE,
  SELECTED,
  STARTED,
  ENDING_SOON,
  ENDED
}

export enum ItemFlags {
  None            = 0,
  IsNew           = 1 << 0,
  isNewHeaviest   = 1 << 1,
}

export enum  FollowStatus
{
  NotFollowing = 0,
  FollowingThem = 1,
  FollowingUs = 2,
  MutualFollowing = 3
}
