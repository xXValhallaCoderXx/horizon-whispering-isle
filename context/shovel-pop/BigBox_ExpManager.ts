/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_ExpCurve } from 'BigBox_ExpCurve';
import { BigBox_ExpEvents } from 'BigBox_ExpEvents';
import { Events } from 'Events';
import * as hz from 'horizon/core';
import { Entity, Player, PropTypes, Vec3 } from 'horizon/core';
import { Bindable, Text, TextStyle, View } from 'horizon/ui';
import { Logger } from 'Logger';
import { PlayerData } from 'PlayerData';
import { PlayerEffects } from 'PlayerEffectsController';
import { PlayerService } from 'PlayerService';
import { SHOULD_USE_PERSISTENCE } from 'PVarConsts';
import { Analytics } from 'TurboAnalytics';

/** README
 * Turn on horizon/ui API by going into the Scripts menu -> Settings (gear icon) -> API -> horizon/ui
 *
 * In order to get persistent storage, add "playerData" to Variable Group
 * and then add "exp" as a variable under it.
 *
 * Copy this line of code to your script to add exp to the player
 * (replace currentPlayer with the player that wants to gain exp and xpGained with the amount that the player should gain):
 * this.sendNetworkBroadcastEvent(ExpEvents.expAddToPlayer, { player: currentPlayer, exp: xpGained });
*/

var localExpStorage = new Map<Player, number>();

export class BigBox_PlayerExpData {
  player: Player;
  expBarPersistentHudAsset: Entity | undefined;
  expBarPopupHudAsset: Entity | undefined;

  instantiatedAsset: Entity[] = [];

  constructor(player: Player) {
    this.player = player;
  }
}

export class BigBox_Exp_UI_Utils {
  // Create text with an outline - The nastiest h4XX0r the world has ever known
  static outlineText(text: Bindable<string>, outlineSize: number, textStyle: TextStyle) {
    return View({
      children: [
        Text({ text, style: { textShadowOffset: [-outlineSize, -outlineSize], ...textStyle } }),
        // Absolute position so this will stack directly over the main text object
        Text({ text, style: { textShadowOffset: [outlineSize, -outlineSize], position: "absolute", ...textStyle } }),
        Text({ text, style: { textShadowOffset: [-outlineSize, outlineSize], position: "absolute", ...textStyle } }),
        Text({ text, style: { textShadowOffset: [outlineSize, outlineSize], position: "absolute", ...textStyle } }),
      ],
      style: {
        flexDirection: "row",
        justifyContent: "center",
      },
    });
  }
}

const log = new Logger("BigBox_ExpManager");

export class BigBox_ExpManager extends hz.Component<typeof BigBox_ExpManager> {
  static propsDefinition = {
    expBarPersistentHudAsset: { type: PropTypes.Asset },
    expBarPopupHudAsset: { type: PropTypes.Asset },
  };

  // Singleton
  static instance: BigBox_ExpManager;

  private playerToDataMap = new Map<Player, BigBox_PlayerExpData>();
  private cachePosition: Vec3 = new Vec3(0, -10, 0); // NEEDED?

  preStart() {
    BigBox_ExpManager.instance = this;
  }

  start() {
    PlayerData.init(this.world);

    this.connectNetworkBroadcastEvent(BigBox_ExpEvents.expAddToPlayer, this.OnExpAddToPlayer.bind(this));
    this.connectLocalBroadcastEvent(BigBox_ExpEvents.addExpToPlayer, this.OnExpAddToPlayer.bind(this));

    PlayerService.connectPlayerEnterWorld(
      this,
      (player: Player) => {
        if (!this.playerToDataMap.has(player)) {
          log.info(`[${player.id}] Player Enter World`);

          let expData = new BigBox_PlayerExpData(player);
          this.playerToDataMap.set(player, expData);

          this.setup(player);
        }
      },
    );

    PlayerService.connectPlayerExitWorld(
      this,
      (player: Player) => {
        log.info(`[${player.id}] Player Exit World`);
        let data = this.playerToDataMap.get(player);
        if (data !== undefined) {
          // Remove the previously spawned objects
          data.instantiatedAsset.forEach(asset => {
            if (asset !== undefined) {
              this.world.deleteAsset(asset);
            }
          });
          this.playerToDataMap.delete(player);
        }
      },
    );

    this.connectNetworkBroadcastEvent(BigBox_ExpEvents.requestInitializeExpForPlayer, (data: { player: Player }) => {
      this.OnExpAddToPlayer({ player: data.player, exp: 0, showToast: false, save: false });
    });

    this.connectNetworkBroadcastEvent(BigBox_ExpEvents.requestResetExpForPlayer, (data: { player: Player }) => {
      PlayerData.setExperience(data.player, 0);
      localExpStorage.set(data.player, 0);

      this.sendNetworkBroadcastEvent(
        BigBox_ExpEvents.expUpdatedForPlayer,
        { player: data.player, currentLevel: BigBox_ExpCurve.instance.ExpToCurrentLevel(0), percentExpToNextLevel: BigBox_ExpCurve.instance.ExpToPercentToNextLevel(0), gainedExp: 0, showToast: false },
        [data.player]);
    });
  }

  // Give player all their starting objects
  setup(player: Player) {
    // PlayerStartupReporter.BeginSample(player, "ExpBarPersistentHudAsset");
    // //this.spawnAssetHelper(player, this.props.expBarPersistentHudAsset!, this.cachePosition, (newEntity) => {
    // GameUtils.poolAssetHelper(player, BigBox_UI_ExpBarPersistent.s_pool, (newEntity) => {
    //   let data = this.playerToDataMap.get(player);
    //   if (data !== undefined) {
    //     newEntity.owner.set(player);
    //     data.expBarPersistentHudAsset = newEntity;
    //   }
    //   PlayerStartupReporter.EndSample(player, "ExpBarPersistentHudAsset");
    // });

    // PlayerStartupReporter.BeginSample(player, "ExpBarPopupHudAsset");
    // //this.spawnAssetHelper(player, this.props.expBarPopupHudAsset!, this.cachePosition, (newEntity) => {
    // GameUtils.poolAssetHelper(player, BigBox_UI_ExpBarPopup.s_pool, (newEntity) => {
    //   let data = this.playerToDataMap.get(player);
    //   if (data !== undefined) {
    //     newEntity.owner.set(player);
    //     data.expBarPersistentHudAsset = newEntity;
    //   }
    //   PlayerStartupReporter.EndSample(player, "ExpBarPopupHudAsset");
    // });
  }

    private OnExpAddToPlayer(data: { player: Player, exp: number, showToast: boolean, updateUI?: boolean, save?: boolean }) {
    if (data.player === this.world.getServerPlayer()) {
      return
    }

    var prevExp = 0;
    if (SHOULD_USE_PERSISTENCE) {
      prevExp = PlayerData.getExperience(data.player);
    }


    if (prevExp == 0 && localExpStorage.get(data.player) != 0) {
      log.info("no persistent storage - using local storage");
      prevExp = localExpStorage.get(data.player) ?? 0;
    }

    var newExp = prevExp + data.exp;
    if (data.save ?? true) {
      PlayerData.setExperience(data.player, newExp);
    }
    localExpStorage.set(data.player, newExp);

    log.info("Player " + data.player.id + " has " + newExp + " exp from " + prevExp + " exp");
    if (newExp > 0) {
      Analytics()?.sendRewardsEarned({ player: data.player, rewardsType: "xp", rewardsEarned: data.exp });
      Analytics()?.sendRewardsEarned({ player: data.player, rewardsType: "xp_total", rewardsEarned: newExp });
    }

    let currentLevel = BigBox_ExpCurve.instance.ExpToCurrentLevel(newExp);
    //this.world.leaderboards.setScoreForPlayer(LEADERBOARD_HIGHESTLEVEL, data.player, currentLevel, false);
    let prevLevel = BigBox_ExpCurve.instance.ExpToCurrentLevel(prevExp);
    if (currentLevel > prevLevel && currentLevel > 0) {
      Analytics()?.sendLevelUp({ player: data.player, playerLevel: currentLevel, playerTitle: "player_level" });
      this.sendNetworkBroadcastEvent(PlayerEffects.levelUpEffect, {}, [data.player])
      this.sendLocalBroadcastEvent(Events.PlayerLeveledUp, { player: data.player, level: currentLevel})
    }

    this.sendNetworkBroadcastEvent(
      BigBox_ExpEvents.expUpdatedForPlayer,
      { player: data.player, currentLevel: currentLevel, percentExpToNextLevel: BigBox_ExpCurve.instance.ExpToPercentToNextLevel(newExp), gainedExp: data.exp, showToast: data.showToast, updateUI: data.updateUI },
      [data.player]);
  }

  public GetPlayerExp(player: Player): number {
    if (player === this.world.getServerPlayer()) {
      return 0;
    }

    return PlayerData.getExperience(player);
  }

  public getPlayerLevel(player: Player): number {
    return BigBox_ExpCurve.instance.ExpToCurrentLevel(this.GetPlayerExp(player));
  }
}
hz.Component.register(BigBox_ExpManager);
