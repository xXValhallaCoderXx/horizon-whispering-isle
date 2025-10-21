/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_ExpCurve } from 'BigBox_ExpCurve';
import { BigBox_ExpEvents } from 'BigBox_ExpEvents';
import { BigBox_ExpManager } from 'BigBox_ExpManager';
import { BigBox_Player_Inventory } from 'BigBox_Player_Inventory';
import { Events } from 'Events';
import * as hz from 'horizon/core';
import { Player } from 'horizon/core';
import { Logger } from 'Logger';
import { PlayerInventoryManager } from 'PlayerInventoryManager';
import { PlayerService } from 'PlayerService';
import { Analytics } from 'TurboAnalytics';

const log = new Logger("TimedRewardsManager");

export class TimedRewardData {
  time: number = 0;
  cash: number = 0;
  xp: number = 0;
}

export class PlayerRewardTracker {
  rewardTime: number = 0;
  rewardIndex: number = 0;
  rewardCount: number = 0;
}

class TimedRewardManager extends hz.Component<typeof TimedRewardManager> {
  static propsDefinition = {
    rewardData: { type: hz.PropTypes.Asset, default: undefined }
  };

  rewardData: TimedRewardData[] = [
    {
      time: 60,
      cash: 50,
      xp: 5
    }
  ];

  playerRewards: Map<hz.Player, PlayerRewardTracker> = new Map<hz.Player, PlayerRewardTracker>();

  async start() {
    if (this.props.rewardData) {
      await this.props.rewardData.fetchAsData().then(
        (output: hz.AssetContentData) => {
          log.info(`[Timed Reward] ${JSON.stringify(output)}`);
          this.rewardData = JSON.parse(output.asText()) as TimedRewardData[];
        })
    }
    this.connectNetworkBroadcastEvent(Events.PlayerRewardsReady, (data: { player: Player }) => {
      log.info(`[TimedReward] manager onPlayerReady ${data.player.id}`);
      if (data.player) {
        let tracker = new PlayerRewardTracker();
        tracker.rewardTime = this.rewardData[0].time;
        this.playerRewards.set(data.player, tracker);
        this.sendNetworkEvent(data.player, Events.StartRewardTimer, { rewardTime: tracker.rewardTime });
      }
    });

    this.connectNetworkBroadcastEvent(Events.RewardsCollected, (data: { player: Player }) => {
      let player: hz.Player | undefined = PlayerInventoryManager.instance.getPlayer(data.player.id);
      log.info(`[TimedReward] manager onPlayerReady ${data.player.id}`);
      if (player) {
        let xp = 0;
        let currency = 0;
        let tracker = this.playerRewards.get(player);
        if (tracker) {
          let currentLevel = BigBox_ExpManager.instance.getPlayerLevel(player);
          let xpRequired = BigBox_ExpCurve.instance.ExpRequiredForLevel(currentLevel + 1);
          for (let i = tracker.rewardIndex - tracker.rewardCount; i < tracker.rewardIndex; ++i) {
            xp += Math.ceil(this.rewardData[i].xp * xpRequired * 0.01);
            currency += this.rewardData[i].cash * (currentLevel + 1);
          }
          this.sendLocalBroadcastEvent(BigBox_ExpEvents.addExpToPlayer, { player: player, exp: xp, showToast: true });
          BigBox_Player_Inventory.instance.changePlayerCurrency(player, currency);
          Analytics()?.sendTaskEnd({player, taskKey: "collected_salary", taskType: currency.toString() + "," + xp.toString()});
          tracker.rewardCount = 0;
          this.sendNetworkEvent(player, Events.RewardContentsEvent, { xp: xp, currency: currency, items: [] });
        }
      }
    });

    PlayerService.connectPlayerExitWorld(this, (player: hz.Player) => {
      this.playerRewards.delete(player);
    });

    this.connectLocalBroadcastEvent(hz.World.onUpdate, (data: { deltaTime: number }) => {
      this.playerRewards.forEach((value: PlayerRewardTracker, key: hz.Player) => {
        if (value.rewardIndex < this.rewardData.length) {
          value.rewardTime -= data.deltaTime;
          if (value.rewardTime <= 0) {
            this.giveNextReward(key, value);
          }
        }
      });
    });
  }

  giveNextReward(player: hz.Player, tracker: PlayerRewardTracker) {
    if (tracker.rewardIndex < this.rewardData.length) {
      log.info("[TimedReward] manager giveNextReward");
      const reward = this.rewardData[tracker.rewardIndex];
      ++tracker.rewardIndex;
      ++tracker.rewardCount;
      tracker.rewardTime = 0;
      if (tracker.rewardIndex < this.rewardData.length) {
        tracker.rewardTime = this.rewardData[tracker.rewardIndex].time;
      }
      try {
        this.sendNetworkEvent(player, Events.RewardUnlocked, { rewardCount: tracker.rewardCount, nextRewardTime: tracker.rewardTime });
      } catch {}
    }
  }
}

hz.Component.register(TimedRewardManager);
