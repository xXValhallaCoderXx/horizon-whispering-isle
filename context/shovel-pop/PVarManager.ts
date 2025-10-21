/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as hz from 'horizon/core';
import { NetworkEvent, Player } from 'horizon/core';
import { Logger } from 'Logger';
import { PlayerData } from 'PlayerData';
import { SHOULD_USE_PERSISTENCE } from 'PVarConsts';
import { TutorialProgress } from 'TutorialManager';

const log = new Logger("PVarManager");

export const PVarEvents = {
  requestPVarTutorialComplete: new NetworkEvent<{player: Player}>('requestPVarTutorialComplete'),
  sendPVarTutorialComplete: new NetworkEvent<{player: Player, isTutorialComplete: boolean}>('sendPVarTutorialComplete'),
  requestResetPVarTutorialComplete: new NetworkEvent<{player: Player}>('requestResetPVarTutorialComplete'),
}

class PVarManager extends hz.Component<typeof PVarManager> {
  static propsDefinition = {};

  start() {
    PlayerData.init(this.world);

    this.connectNetworkBroadcastEvent(PVarEvents.requestResetPVarTutorialComplete, (data: {player: Player}) => {
      if (data.player === this.world.getServerPlayer()){
        return;
      }

      PlayerData.setTutorialComplete(data.player, 0);
    });

    this.connectNetworkBroadcastEvent(PVarEvents.requestPVarTutorialComplete, (data: {player: Player}) => {
      if (data.player === this.world.getServerPlayer()){
        return;
      }

      let isTutorialComplete = SHOULD_USE_PERSISTENCE
        ? PlayerData.getTutorialComplete(data.player) >= TutorialProgress.COMPLETED_MINIGAME
        : false;

      log.info("PVarManager: requestPVarTutorialComplete, player: " + data.player.id + " " + isTutorialComplete);
      this.sendNetworkBroadcastEvent(PVarEvents.sendPVarTutorialComplete, {player: data.player, isTutorialComplete: isTutorialComplete}, [data.player] )
    });
  }
}
hz.Component.register(PVarManager);
