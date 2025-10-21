/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_Player_Inventory } from "BigBox_Player_Inventory";
import { DigZoneManager } from 'DigZoneManager';
import { FollowStatus } from 'Enums';
import { Events } from 'Events';
import { FollowerList } from 'FollowerList';
import { Component, Player, PropTypes } from 'horizon/core';
import { PlayerService } from 'PlayerService';
import { AnalyticsManager } from 'TurboAnalytics';

export class SocialDigEntry{
  player: Player
  followStatus: FollowStatus
  bonus: number
  constructor(p: Player, status: FollowStatus, bonus: number) {
    this.player = p
    this.followStatus = status
    this.bonus = bonus
  }
}

export class SocialDigBonus {
  entries: SocialDigEntry[] = []
  totalBonus: number = 0
  success: boolean = false
}

class FollowerManager extends Component<typeof FollowerManager> {
  static propsDefinition = {
    proxmityDistanceSquared: { type: PropTypes.Number },
    proximityGold: {type: PropTypes.Number},
    followGold: {type: PropTypes.Number},
    followBackGold: {type: PropTypes.Number},
    mutualFollowGold: {type: PropTypes.Number},
    maxNearbyBonusPlayers: {type: PropTypes.Number}
  };

  activeBonuses: Map<Player, SocialDigBonus> = new Map()

  start() {
    this.connectNetworkBroadcastEvent(Events.playerStartDig, (data) => {
      this.calculateBonus(data.player)
      let socialBonus = this.activeBonuses.get(data.player)
      if (socialBonus && socialBonus.totalBonus > 0) {
        let players: Player[] = []
        let money: number[] = []
        let status: FollowStatus[] = []
        let bonusIncrement = [this.props.followGold - this.props.proximityGold, this.props.mutualFollowGold - this.props.followBackGold]
        socialBonus.entries.forEach((entry) => {
          players.push(entry.player)
          money.push(entry.bonus)
          status.push(entry.followStatus)
        })
        this.sendNetworkBroadcastEvent(Events.friendBonusEvent, {
          players: players,
          bonus: money,
          status: status,
          bonusIncrement: bonusIncrement,
          totalBonus: socialBonus.totalBonus
        }, [data.player])
      }
    })

    this.connectNetworkBroadcastEvent(Events.updateFollowerListEvent, (data) => {
      FollowerList.Instance().setAllFollowing(data.player, data.friends)
    })

    this.connectNetworkBroadcastEvent(Events.playerDigComplete, (data) => {
      if (data.isSuccess) {
        let bonus = this.activeBonuses.get(data.player)
        if (bonus && bonus.totalBonus > 0) {
          bonus.success = true
        }
      }
    })

    this.connectNetworkBroadcastEvent(Events.claimSocialBonusEvent, (data) => {
      let bonus = this.activeBonuses.get(data.player)
      if (bonus && bonus.totalBonus > 0 && bonus.success) {
        let socialBonus = this.activeBonuses.get(data.player)
        if (socialBonus) {
          socialBonus.entries.forEach((element) => {
            const rewardStr = `social_bonus,${element.followStatus}`
            AnalyticsManager.s_instance.sendRewardsEarned({player: data.player, rewardsType: rewardStr, rewardsEarned: element.bonus})
          })
        }
        BigBox_Player_Inventory.instance.changePlayerCurrency(data.player, bonus.totalBonus)
        this.sendLocalBroadcastEvent(Events.socialBonusClaimedEvent, {player: data.player, bonus: bonus.totalBonus})
      }
      this.activeBonuses.delete(data.player)
    })
  }

  calculateBonus(player: Player) {
    let players = this.world.getPlayers()
    let socialBonus = new SocialDigBonus()
    for (let i = 0 ; i < players.length ; ++i) {
      let other = players[i]
      if (this.qualifiesForBonusByDistance(player, other)) {
        let status: FollowStatus = FollowStatus.NotFollowing
        let bonus: number = this.props.proximityGold
        let follow = FollowerList.Instance().isPlayerFollowing(player, other)
        let followBack = FollowerList.Instance().isPlayerFollowing(other, player)
        if (follow && followBack) {
          status = FollowStatus.MutualFollowing
          bonus = this.props.mutualFollowGold
        }
        else if (follow) {
          status = FollowStatus.FollowingThem
          bonus = this.props.followGold
        }
        else if (followBack){
          status = FollowStatus.FollowingUs
          bonus = this.props.followBackGold
        }

        let entry = new SocialDigEntry(other, status, bonus)
        socialBonus.entries.push(entry)
      }
    }
    if (this.props.maxNearbyBonusPlayers >= 0) {
      let removeStatus: FollowStatus = FollowStatus.NotFollowing
      while (socialBonus.entries.length > this.props.maxNearbyBonusPlayers) {
        let idx = socialBonus.entries.findIndex((entry) => entry.followStatus == removeStatus)
        if (idx >= 0)
        {
          socialBonus.entries.splice(idx, 1)
        }
        else{
          if (removeStatus == FollowStatus.MutualFollowing){
            break
          }
          else {
            ++removeStatus
          }
        }
      }
    }
    socialBonus.entries.forEach((entry) => {
      socialBonus.totalBonus += entry.bonus
    })
    this.activeBonuses.set(player, socialBonus)
  }

  qualifiesForBonusByDigZone(firstPlayer: Player, secondPlayer: Player) : boolean {
    if (firstPlayer === secondPlayer){
      return false
    }

    const firstPlayerRegion = DigZoneManager.instance.getHighestPriorityZone(firstPlayer)
    const secondPlayerRegion = DigZoneManager.instance.getHighestPriorityZone(secondPlayer)

    if (!firstPlayerRegion || !secondPlayerRegion){
      return false
    }

    return firstPlayerRegion === secondPlayerRegion
  }

  qualifiesForBonusByDistance(firstPlayer: Player, secondPlayer: Player) : boolean {
    if (firstPlayer === secondPlayer){
      return false
    }
    const firstPlayerPosition = PlayerService.getPlayerPosition(firstPlayer);
    const secondPlayerPosition = PlayerService.getPlayerPosition(secondPlayer);
    return firstPlayerPosition.distanceSquared(secondPlayerPosition) <= this.props.proxmityDistanceSquared
  }

}
Component.register(FollowerManager);
