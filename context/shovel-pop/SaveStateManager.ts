/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Player, World } from "horizon/core";
import { Logger } from "Logger";

export const PLAYER_SAVE_STATE_COUNT = 3;
const PLAYER_SAVE_VARIABLE_GROUP = 'playerData';
const PLAYER_SAVE_STATE_VARIABLE_GROUP = 'saveStates';
const PLAYER_STATE_KEYS = [
  'catalog_0',
  'catalog_1',
  'catalog_2',
  'catalog_3',
  'catalog_4',
  'catalog_5',
  'catalog_6',
  'catalog_7',
  'catalog_8',
  'catalog_9',
  'catalog_10',
  'catalog_11',
  'inventory',
  'island_basecamp',
  'island_piratecove',
  'island_icetundra',
  'island_fairytale',
  'island_lte',
  'island_moon',
  'playerData',
  'quests',
]

const log = new Logger('SaveStateManager');

export namespace SaveStateManager {
  export function captureSaveState(world: World, player: Player, index: number) {
    if (index < 0 || index >= PLAYER_SAVE_STATE_COUNT) {
      log.error(`Invalid save state index: ${index}`);
      return;
    }
    PLAYER_STATE_KEYS.forEach(key => {
      transferState(world, player, getSaveKey(key), player, getSaveStateKey(index, key));
    });
  }

  export function restoreSaveState(world: World, player: Player, index: number, targetPlayer?: Player) {
    if (index < 0 || index >= PLAYER_SAVE_STATE_COUNT) {
      log.error(`Invalid save state index: ${index}`);
      return;
    }
    targetPlayer ??= player;
    PLAYER_STATE_KEYS.forEach(key => {
      transferState(world, player, getSaveStateKey(index, key), targetPlayer!, getSaveKey(key));
    });
  }

  export function copyCurrentSave(world: World, sourcePlayer: Player, targetPlayer: Player) {
    PLAYER_STATE_KEYS.forEach(key => {
      transferState(world, sourcePlayer, getSaveKey(key), targetPlayer, getSaveKey(key));
    });
  }

  function transferState(world: World, sourcePlayer: Player, sourceKey: string, targetPlayer: Player, targetKey: string) {
    try {
      const state = world.persistentStorage.getPlayerVariable<any>(sourcePlayer, sourceKey);
      world.persistentStorage.setPlayerVariable(targetPlayer, targetKey, state);
    } catch (e) {
      log.error(`Failed to transfer state: ${e}`);
    }
  }

  function getSaveKey(key: string): string {
    return `${PLAYER_SAVE_VARIABLE_GROUP}:${key}`;
  }

  function getSaveStateKey(index: number, key: string): string {
    return `${PLAYER_SAVE_STATE_VARIABLE_GROUP}:${index + 1}_${key}`;
  }
}
