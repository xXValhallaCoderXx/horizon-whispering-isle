/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
// Whether the game should use persistent variables
export const SHOULD_USE_PERSISTENCE = true;

// TODO(kaden): Hardcoded for now, but we should have a way to get this from the world
export const MAX_PLAYER_COUNT = 9;

/**
 * WARNING: Increment this if you want to wipe all player data.
 * Only change this if you really mean it!
 */
export const SAVE_VERSION: number = 27;
export const CLIENT_VERSION: number = 1;

// List of all the consts used for persistent variables
export const PVAR_INVENTORY = "playerData:inventory";
export const PVAR_TIME_PLAYED = "playerData:timePlayed";

export const PVAR_PLAYERDATA = "playerData:playerData";

// Catalog data, split into PlayerCatalogData.PlayerCollectedItemDataMaxCount increments to avoid hitting 10kb pvar limit
export const PVAR_CATALOG_0 = "playerData:catalog_0";
export const PVAR_CATALOG_1 = "playerData:catalog_1";
export const PVAR_CATALOG_2 = "playerData:catalog_2";
export const PVAR_CATALOG_3 = "playerData:catalog_3";
export const PVAR_CATALOG_4 = "playerData:catalog_4";
export const PVAR_CATALOG_5 = "playerData:catalog_5";
export const PVAR_CATALOG_6 = "playerData:catalog_6";
export const PVAR_CATALOG_7 = "playerData:catalog_7";
export const PVAR_CATALOG_8 = "playerData:catalog_8";
export const PVAR_CATALOG_9 = "playerData:catalog_9";
export const PVAR_CATALOG_10 = "playerData:catalog_10";
export const PVAR_CATALOG_11 = "playerData:catalog_11";

/**
 * @deprecated Please use the above consts for catalogs now.
 */
export const PVAR_PLAYERCATALOG_DEPRECATED = 'playerData:catalog';

/**
 * If true, the player's deprecated catalog pvar data will be cleared after migration.
 */
export const CLEAR_DEPRECATED_CATALOG_PVAR: boolean = true;

// If true, will force the player to wait 30 seconds minimum for loading
export const FORCE_PLAYER_LOADING_WAIT = true

export const LEADERBOARD_HEAVIESTITEM = 'heaviestItem';
export const LEADERBOARD_CURRENCYEARNED = 'currencyEarned';
export const LEADERBOARD_HIGHESTLEVEL = 'highestLevel';
export const LEADERBOARD_TIMEPLAYED = 'timePlayed';

export function saveVersionMatches(currentVersion: number): boolean {
    return currentVersion === SAVE_VERSION;
}

// Set this to true to see the item audit log
export const ITEM_AUDIT_LOG = false;

// Set this to true to see minimal UI (for marketing videos)
export const MARKETING_UI = false;
