/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as hz from 'horizon/core';

export class FollowerList{
  private static instance_: FollowerList|undefined = undefined;
  static Instance(): FollowerList {
    if (FollowerList.instance_ === undefined) {
      FollowerList.instance_ = new FollowerList();
    }
    return FollowerList.instance_;
  }


  friendDictionary: Map<hz.Player, number[]> = new Map<hz.Player, number[]>();

  setFollowing(player: hz.Player, following: hz.Player) {
    let friendData = this.friendDictionary.get(player) ?? [];
    if (friendData.indexOf(following.id) < 0) {
      friendData.push(following.id);
      this.friendDictionary.set(player, friendData);
    }
  }

  clearFollowing(player: hz.Player) {
    this.friendDictionary.set(player, [])
  }

  removeFollowing(player: hz.Player, following: hz.Player) {
    let friendData = this.friendDictionary.get(player) ?? [];
    if (friendData.indexOf(following.id) >= 0) {
      friendData.splice(friendData.indexOf(following.id), 1);
      this.friendDictionary.set(player, friendData);
    }
  }

  hasFollowerData(player: hz.Player): boolean {
    return this.friendDictionary.has(player);
  }

  setAllFollowing(player: hz.Player, following: number[])
  {
    this.friendDictionary.set(player, following);
  }

  getFollowing(player: hz.Player): number[] {
    return this.friendDictionary.get(player) ?? [];
  }

  removePlayer(player: hz.Player) {
    this.friendDictionary.delete(player)
    this.friendDictionary.forEach((value, key) => {
      if (value.indexOf(player.id) >= 0) {
        value.splice(value.indexOf(player.id), 1)
      }
    })
  }

  areFriends(player: hz.Player, friend: hz.Player): boolean {
    return this.isPlayerFollowing(player, friend) && this.isPlayerFollowing(friend, player)
  }

  isPlayerFollowing(player: hz.Player, friend: hz.Player): boolean {
    let friendData = this.friendDictionary.get(player);
    if (friendData && friendData.indexOf(friend.id) >= 0) {
      return true
    }
    return false
  }

}
