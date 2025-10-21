/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_ExpEvents } from 'BigBox_ExpEvents';
import { BigBox_Player_Inventory } from 'BigBox_Player_Inventory';
import { GameConstants } from 'Constants';
import { Debug } from 'Debug';
import { Events } from 'Events';
import * as hz from 'horizon/core';
import { Logger } from 'Logger';
import { PlayerData } from 'PlayerData';
import { IPlayerEnterExitWorldListener, PlayerService } from 'PlayerService';
import { QuestEvents } from 'QuestManager';
import { PLAYER_SAVE_STATE_COUNT, SaveStateManager } from 'SaveStateManager';
import { ShovelProgressionEvents } from 'ShovelProgressionEvents';

const log = new Logger("GameManager");

class GameManager extends hz.Component<typeof GameManager> implements IPlayerEnterExitWorldListener {
  static propsDefinition = {
    resetPersistence: { type: hz.PropTypes.Boolean },
  };

  playerToTimeStarted: Map<hz.Player, number> = new Map();

  start() {
    PlayerData.init(this.world);
    PlayerService.connectPlayerEnterExitWorldListener(this);
    Debug.addTunable("Player/Move Speed", (player, newValue) => {
      GameConstants.Player.MoveSpeed = newValue;
      this.sendNetworkBroadcastEvent(Events.setPlayerMoveSpeed, { speed: newValue });
    }, GameConstants.Player.MoveSpeed, .5, 1, 20);
    for (let i = 0; i < PLAYER_SAVE_STATE_COUNT; i++) {
      Debug.addCommand(`SaveState/Capture/SaveState ${i + 1}`, (targetPlayer) => SaveStateManager.captureSaveState(this.world, targetPlayer, i));
    }
    this.connectNetworkBroadcastEvent(Events.logToServer, (data) => {
      log.warn(`player=${data.playerName} timeStamp=${data.timeStamp} message=${data.message}`);
    });
  }

  onPlayerEnterWorld(player: hz.Player): void {
    this.playerToTimeStarted.set(player, Date.now());

    const localPlayer = this.world.getLocalPlayer();
    if (this.props.resetPersistence) {
      this.sendNetworkBroadcastEvent(BigBox_ExpEvents.requestResetExpForPlayer, { player: player }, [localPlayer]);
      this.sendNetworkBroadcastEvent(QuestEvents.requestResetQuestsForPlayer, { player: player }, [localPlayer]);
      this.sendNetworkBroadcastEvent(BigBox_Player_Inventory.requestResetCurrencyForPlayer, { player: player }, [localPlayer]);
      this.sendNetworkBroadcastEvent(ShovelProgressionEvents.requestResetShovelForPlayer, { player: player }, [localPlayer]);
    }
    const playerName = PlayerService.getPlayerName(player);
    Debug.addCommand(`SaveState/Restore/${playerName}/Current`, (targetPlayer) => SaveStateManager.copyCurrentSave(this.world, player, targetPlayer));
    for (let i = 0; i < PLAYER_SAVE_STATE_COUNT; i++) {
      Debug.addCommand(`SaveState/Restore/${playerName}/SaveState ${i + 1}`, (targetPlayer) => SaveStateManager.restoreSaveState(this.world, player, i, targetPlayer));
    }
  }

  onPlayerExitWorld(player: hz.Player): void {
    let timeStarted = this.playerToTimeStarted.get(player);
    if (!timeStarted) {
      return;
    }

    let timeEnded = Date.now();
    let totalTime = timeEnded - timeStarted;
    let totalTimeMin = totalTime / 60000;
    let timePlayed = PlayerData.getTimePlayed(player);
    timePlayed += totalTimeMin;
    timePlayed = Math.round(timePlayed);
    log.info("Time played: for player " + player.id + ": " + timePlayed);
    PlayerData.setTimePlayed(player, timePlayed);
    Debug.deletePath(`SaveState/Restore/${PlayerService.getPlayerName(player)}`);
    //this.world.leaderboards.setScoreForPlayer(LEADERBOARD_TIMEPLAYED, player, timePlayed, false);
  }
}
hz.Component.register(GameManager);
