/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as hz from 'horizon/core';
import { Player } from 'horizon/core';
import { Logger } from 'Logger';
import { NavigationArrowEvents } from 'NavigationArrowEvents';
import { QuestEvents, QuestManager } from 'QuestManager';

const log = new Logger("NavigationArrowManager");

class NavigationArrowManager extends hz.Component<typeof NavigationArrowManager> {
  static propsDefinition = {};

  start() {
    this.connectLocalBroadcastEvent(QuestEvents.questManagerInitialized, (data) => {
      log.info("[NavigationArrowManager] QuestManager initialized, setting up navigation arrows for all players");
      this.world.getPlayers().forEach((player) => {
        this.setupNavigationArrow(player);
      })
    })

    this.connectNetworkBroadcastEvent(NavigationArrowEvents.navigationArrowInitializedEvent, (data) => {
      this.setupNavigationArrow(data.player);
    })
  }

  setupNavigationArrow(player: Player) {
    if (!QuestManager.instance) {
      return;
    }

    QuestManager.instance.setupNavigationArrowForPlayer(player);
  }
}
hz.Component.register(NavigationArrowManager);
