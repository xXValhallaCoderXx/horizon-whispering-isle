// Copyright (c) Meta Platforms, Inc. and affiliates.

// This source code is licensed under the MIT license found in the
// LICENSE file in the root directory of this source tree.

import { BigBox_ItemState } from "BigBox_ItemState";
import { DigZone } from "DigZone";
import { FollowStatus, HUDElementType, ItemFlags, LTEState } from "Enums";
import { Entity, LocalEvent, NetworkEvent, Player, Vec3 } from "horizon/core";
import { ColorValue } from "horizon/ui";
import { Islands } from "Islands";
import { ShinySpotWorldData } from "ShinySpotWorldData";
import { ShovelData } from "ShovelData";

export const Events = {
  // add this to your local script to get a server callback when its start() method runs
  onShovelInitialized: new NetworkEvent<{ player: Player }>('onShovelInitialized'),
  requestInventory: new NetworkEvent<{ player: Player }>('requestInventory'),
  poolObjectInitialized: new NetworkEvent<{ player: Player, id: string, entity: Entity }>('poolObjectInitialized'),
  poolObjectReceived: new NetworkEvent<{ player: Player, id: string }>('poolObjectReceived'),

  // Shovel/Digging
  itemSelected: new NetworkEvent<ItemSelectedPayload>('itemSelected'),
  playerStartDig: new NetworkEvent<DigStartPayload>('playerStartDig'),
  playerDigProgress: new NetworkEvent<{ player: Player, progress01: number, itemId: string }>('playerDigProgress'),
  playerDigComplete: new NetworkEvent<{ player: Player, isSuccess: boolean, itemId: string }>('playerDigComplete'),
  playerShovelChanged: new NetworkEvent<{ player: Player, shovelId: string }>('playerShovelChanged'),
  requestShovelUpgrade: new NetworkEvent<{ player: Player, shovelId: string, gemCost: number }>('requestShovelUpgrade'),
  requestShovelInit: new NetworkEvent<{ player: Player }>('requestShovelInit'),
  shovelSetLevel: new NetworkEvent<{ player: Player, shovel: string, level: number }>('shovelSetLevelEvent'),
  shovelUpgradeEvent: new LocalEvent<{ player: Player, shovelId: string, level: number }>('shovelUpgradeEvent'),
  shovelInitialized: new LocalEvent("shovelInitialized"),
  spawnShovel: new NetworkEvent<{ player: Player, shovelId: string }>('spawnShovel'),
  despawnShovel: new NetworkEvent<{ player: Player, shovelId: string }>('despawnShovel'),
  shovelSpawned: new NetworkEvent<{ shovelId: string, entity: Entity }>('shovelSpawned'),

  // Timed Reward Events
  StartRewardTimer: new NetworkEvent<{ rewardTime: number }>('StartRewardTimer'),
  RewardUnlocked: new NetworkEvent<{ rewardCount: number, nextRewardTime: number }>('RewardUnlocked'),
  RewardsCollected: new NetworkEvent<{ player: Player }>('RewardsCollected'),
  RewardContentsEvent: new NetworkEvent<{ xp: number, currency: number, items: string[] }>('RewardContentsEvent'),
  PlayerRewardsReady: new NetworkEvent<{ player: Player }>('PlayerRewardsReady'),
  PlayerLeveledUp: new LocalEvent<{ player: Player, level: number }>('PlayerLeveledUp'),
  ShowDailyRewardEvent: new NetworkEvent<{}>('ShowDailyRewardEvent'),
  PlayerDialogComplete: new NetworkEvent<{ player: Player }>('PlayerDialogComplete'),

  // LTE Events
  lteStateChangeMessage: new LocalEvent<{ state: LTEState, islandId: string }>('lteStateChange'),
  lteTimeRemainingMessage: new NetworkEvent<{ time: number, color: ColorValue, imageAsset: string }>('lteTimeRemainingMessage'),
  lteNotificationMessage: new NetworkEvent<{ state: LTEState, text: string, imageAsset: string, color: ColorValue, borderColor: ColorValue }>('lteNotificationMessage'),
  onLteZoneStart: new LocalEvent<{ zone: DigZone }>('onLteZoneStart'),
  onLteZoneEnd: new LocalEvent<{ zone: DigZone }>('onLteZoneEnd'),

  // Social events
  friendBonusEvent: new NetworkEvent<SocialBonusPayload>('friendBonusEvent'),
  updateFollowerListEvent: new NetworkEvent<{ player: Player, friends: number[] }>("updateFollowerListEvent"),
  showPotentialFollowEvent: new LocalEvent<{ player: Player, bonus: number }>("updatePotentialFollowEvent"),
  claimSocialBonusEvent: new NetworkEvent<{ player: Player }>("claimSocialBonusEvent"),
  socialBonusClaimedEvent: new LocalEvent<{ player: Player, bonus: number }>("socialBonusClaimed"),
  migratePlayerEvent: new NetworkEvent<{player: Player, isPirate: boolean}>("migratePlayerEvent"),
  migrateAcceptedEvent: new NetworkEvent<{player: Player, isPirate: boolean}>("migrateAcceptedEvent"),
  migratePlayerCompleteEvent: new NetworkEvent<{player: Player, claimRewards: boolean}>("migratePlayerCompleteEvent"),
  migrationRewardsEvent: new NetworkEvent<{player: Player, isPirate: boolean}>("migrationRewardsEvent"),

  // Local events
  localPlayerSwingShovel: new LocalEvent<{ player: Player }>('localPlayerSwingShovel'),
  localPlayerDigProgress: new LocalEvent<{ player: Player, progress01: number }>('localPlayerDigProgress'),
  localPlayerDigComplete: new LocalEvent<{ player: Player, isSuccess: boolean }>('localPlayerDigComplete'),
  localPlayerDigAnimationComplete: new LocalEvent<{}>('localPlayerDigAnimationComplete'),
  localPlayerShovelChanged: new LocalEvent<{ shovelData: ShovelData }>('localPlayerShovelChanged'),
  localShowHUD: new LocalEvent<{ context: string }>('localShowHUD'),
  localHideHUD: new LocalEvent<{ context: string, exclude?: HUDElementType }>('localHideHUD'),
  localItemReceived: new LocalEvent<{ itemState: BigBox_ItemState }>('onItemReceived'),
  localSetShovelLevel: new LocalEvent<{ shovel: string, level: number }>('localSetShovelLevel'), // is this necessary??

  // Equip events
  itemSelectedForEquip: new LocalEvent<{ player: Player, itemId: string, weight: number }>('itemSelectedForEquip'),
  itemUnequip: new LocalEvent<{ player: Player, itemId: string }>('itemUnequip'),

  // Blocking events
  setPlayerBlocking: new LocalEvent<{ isBlocking: boolean }>('setPlayerBlocking'), // Set to block players from moving

  // Debug events
  debugAction1: new NetworkEvent<Player>('debugAction1'),
  debugAction2: new NetworkEvent<Player>('debugAction2'),
  debugAction3: new NetworkEvent<Player>('debugAction3'),
  debugAction4: new NetworkEvent<Player>('debugAction4'),

  // UI events
  digResultHUDOpen: new LocalEvent('digResultHUDOpen'),
  digResultHUDClose: new LocalEvent('digResultHUDClose'),
  updateGemUI: new LocalEvent('updateGemUI'),
  updateExpUI: new LocalEvent('updateExpUI'),
  updateCurrencyUI: new LocalEvent('updateCurrencyUI'),
  digRewardsEvent: new NetworkEvent<{ itemGems: number, streakGems: number }>('digRewardsEvent'),
  canUpgradeAnyShovelUpdated: new LocalEvent<{ canUpgradeAny: boolean }>('canUpgradeAnyShovelUpdated'),
  requestUpgradeAnyShovelUpdated: new LocalEvent('requestUpgradeAnyShovelUpdated'),
  requestPunchcardInfo: new LocalEvent<{ itemId: string }>('requestPunchcardInfo'),
  punchcardInfoResponse: new LocalEvent<PunchardInfo>('punchcardInfoResponse'),
  dialogPurchaseOpen: new LocalEvent<{ open: boolean }>('dialogPurchaseOpen'),

  // Potion events
  potionExpired: new LocalEvent<{ potionID: string }>("potionExpired"), // deprecated
  requestUsePotion: new NetworkEvent<{ player: Player, potionId: string }>("requestUsePotion"), // deprecated
  requestSelectPotion: new NetworkEvent<{ player: Player, potionId: string }>("requestSelectPotion"),
  requestUnselectPotion: new NetworkEvent<{ player: Player, potionId: string }>("requestUnselectPotion"),
  givePotionBundle: new NetworkEvent<{ player: Player, potionCounts: number[] }>("givePotionBundle"),
  showHasNewPotions: new LocalEvent<{count: number}>("showHasNewPotions"),
  potionUsedEvent: new LocalEvent<{ player: Player, potionID: string }>("potionUsedEvent"),
  usePotionsForMinigame: new LocalEvent<{ flyToBottom: boolean }>("usePotionsForMinigame"),

  // Minigame events
  canDig: new NetworkEvent<Player>('canDig'),
  canDigResponse: new NetworkEvent<{ canDig: boolean, suggestedPotionId: string, starRequirement: number, shinySpotItem: string, baseChance: number }>('canDigResponse'),
  digMinigamePhaseChanged: new LocalEvent<{ phase: number }>('onDigMinigamePhaseChanged'),
  setMinigameItemIconEntity: new NetworkEvent<{ player: Player, entity: Entity }>('setMinigameItemIconEntity'),

  // Shiny spot
  shinySpotUsed: new LocalEvent<ShinySpotWorldData>("shinySpotUsed"),
  shinySpotPercentageChanged: new NetworkEvent<{ itemId: string, rarity: number, percentage: number }>("shinySpotPercentageChanged"),
  requestShinySpotPercentage: new NetworkEvent<{ player: Player }>("requestShinySpotPercentage"),
  shinySpotTriggerEnter: new NetworkEvent<{ player: Player }>("shinySpotTriggerEnter"), // For tutorial only

  // World UI
  addDigSpotUI: new NetworkEvent<{ id: number, params: DigSpotParams }>("addDigSpotUI"),
  updateDigSpotUI: new NetworkEvent<{ id: number, percentage: number, digsAttempted: number, delayUpdatePercentage: boolean }>("updateDigSpotUI"),
  removeDigSpotUI: new NetworkEvent<{ id: number }>("removeDigSpotUI"),

  // Dig Zone
  digZoneEnter: new LocalEvent<{ player: Player, zoneId: string }>("digZoneEnter"),
  digZoneExit: new LocalEvent<{ player: Player, zoneId: string }>("digZoneExit"),

  // Debug
  setPlayerMoveSpeed: new NetworkEvent<{ speed: number }>("setPlayerMoveSpeed"),
  checkPlayerUiState: new LocalEvent<{ player: Player }>("checkPlayerUiState"),
  fixUI: new NetworkEvent<Player>("fixUI"),
  logToServer: new NetworkEvent<{ message: string, timeStamp: string, playerName: string }>("logToServer"),
};

export type ItemSelectedPayload = {
  player: Player,
  itemId: string,
  location: Vec3,
  weight: number,
  weightBonus: number,
  xp: number,
  xpBonus: number,
  gems: number,
  gemBonus: number,
  mutation: string,
  itemFlags: ItemFlags,
  discoverCount: number,
  island: Islands,
  shovelId: string,
}

export type DigStartPayload = {
  player: Player,
  digPosition: Vec3,
  minigameChanceScale: number,
  compliment: number,
}

export type SocialBonusPayload = {
  players: Player[],
  bonus: number[],
  status: FollowStatus[],
  bonusIncrement: number[],
  totalBonus: number
}

export type PunchardInfo = {
  isOnPunchcard: boolean,
  isFound: boolean,
  x: number,
}

export type DigSpotParams = {
  position: Vec3;
  itemId: string;
  percentage: number;
  starRequirement: number;
  digsAttempted: number;
}
