/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as hz from 'horizon/core';
import { PlayerService } from 'PlayerService';

class ServerLifetimeManager extends hz.Component<typeof ServerLifetimeManager> {
  static propsDefinition = {
    lifetime_minutes: {type: hz.PropTypes.Number, default: 30},
    max_player_joins: {type: hz.PropTypes.Number, default: 0}
  };

  playerJoins: number = 0

  start() {
    PlayerService.connectPlayerEnterWorld(this, (player: hz.Player) => {
      if (this.playerJoins == 0 && this.props.lifetime_minutes > 0) {
        this.async.setTimeout(() => {
          this.world.matchmaking.allowPlayerJoin(false)
        }, this.props.lifetime_minutes * 60 * 1000)
      }
      ++this.playerJoins
      if (this.props.max_player_joins > 0 && this.playerJoins >= this.props.max_player_joins) {
        this.world.matchmaking.allowPlayerJoin(false)
      }
    })
  }
}
hz.Component.register(ServerLifetimeManager);
