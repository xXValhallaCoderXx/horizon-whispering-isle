/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { ClientStartupReporter } from 'ClientStartupReporter';
import { Events } from 'Events';
import { FollowerList } from "FollowerList";
import { Component, Player, SerializableState } from 'horizon/core';
import { FollowStatus, Social } from 'horizon/social';
import { reliablePlayerExitWorldNetEvent } from 'PlayerService';

export class FollowPlayerTracker extends Component<typeof FollowPlayerTracker> {
  static propsDefinition = {};

  start() {
    if (this.world.getLocalPlayer() == this.world.getServerPlayer()) {
      return
    }
    this.connectNetworkBroadcastEvent(Events.updateFollowerListEvent, (data) => {
      if (data.player !== this.world.getLocalPlayer()) {
        let isNew = !FollowerList.Instance().hasFollowerData(data.player)
        FollowerList.Instance().setAllFollowing(data.player, data.friends)
        if (isNew) {
          this.checkIfFollowing(data.player)
        }
      }
    })

    this.connectNetworkBroadcastEvent(reliablePlayerExitWorldNetEvent, (player) => {
      FollowerList.Instance().removePlayer(player)
    })

    Social.registerFollowersLoadedEvent(() => {
      this.loadPlayer()
    })

    this.loadPlayer()
    ClientStartupReporter.addEntry("FollowPlayerTracker start()", this);
  }

  receiveOwnership(_serializableState: SerializableState, _oldOwner: Player, _newOwner: Player): void {
    if (this.world.getLocalPlayer() !== this.world.getServerPlayer()) {
      ClientStartupReporter.addEntry("FollowPlayerTracker receiveOwnership()");
    }
  }

  async loadPlayer() {
    const player = this.world.getLocalPlayer()
    let promises: Promise<boolean | void>[] = []
    FollowerList.Instance().clearFollowing(player)
    this.world.getPlayers().forEach((p) => {
      if (p !== player) {
        promises.push(Social.getFollowingStatus(player, p).then((following) => {
          if (following != FollowStatus.NOT_FOLLOWING) {
            FollowerList.Instance().setFollowing(player, p)
          }
        }))
      }
    })
    await Promise.all(promises)
    this.sendFriends()
  }

  async checkIfFollowing(other: Player) {
    const player = this.world.getLocalPlayer()
    if (player !== other) {
      let followerCount = FollowerList.Instance().getFollowing(player).length
      let promise = Social.getFollowingStatus(player, other).then((following) => {
        if (following != FollowStatus.NOT_FOLLOWING) {
          FollowerList.Instance().setFollowing(player, other)
        }
      })
      await promise
      if (FollowerList.Instance().getFollowing(player).length != followerCount) {
        this.sendFriends()
      }
    }
  }

  sendFriends() {
    const player = this.world.getLocalPlayer()
    let following = FollowerList.Instance().getFollowing(player)
    this.sendNetworkBroadcastEvent(Events.updateFollowerListEvent, { player: player, friends: following })
  }
}
Component.register(FollowPlayerTracker);
