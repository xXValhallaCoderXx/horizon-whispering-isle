/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
/**
 * (c) Meta Platforms, Inc. and affiliates. Confidential and proprietary.
 *
 * @format
 */

/**
 * 🚀 Turbo Analytics: Turbo API for Horizon In-World Analytics (Welcome!!)
 * TODO: (Creator) IMPORTANT: Make sure to attach an Entity to the Analytics Manager or nothing will work!
 * TODO: (Creator) <--- Search for this to uncover attention items
 * TODO: (Creator) Don't forget to have fun!
 */

export const TURBO_IS_ENABLED = true; /* TODO (Creator): Turbo Killswitch */
export const TURBO_DEBUG = false; /** TODO (Creator): IMPORTANT!!! Set to False before Release **/

import { Action, AreaEnterPayload, AreaExitPayload, CustomEventPayload, DeathByEnemyPayload, DeathByPlayerPayload, DiscoveryMadePayload, EventData, FrictionCausedPayload, FrictionHitPayload, ITurboSettings, KOEnemyPayload, KOPlayerPayload, LevelUpPayload, PlayerReadyEnterPayload, PlayerReadyExitPayload, QuestCompletedPayload, RewardsEarnedPayload, RoundEndPayload, SectionEndPayload, SectionStartPayload, StageEndPayload, StageStartPayload, TaskEndPayload, TaskStartPayload, TaskStepEndPayload, TaskStepStartPayload, Turbo, TurboDataService, TurboDebug, TurboEvents, WeaponEquipPayload, WeaponGrabPayload, WeaponReleasePayload, WearableEquipPayload, WearableReleasePayload } from 'horizon/analytics';
import * as hz from 'horizon/core';
import { Logger } from 'Logger';

const log = new Logger("TurboAnalytics");

function getTurboSettings(): Partial<ITurboSettings> {
  return {
    debug: TURBO_DEBUG,
    useTasks: true,
    useRewards: true,
    useFriction: true,
    useWeaponEquip: true,
    useLevelUp: true,
    useDiscovery: true,
  }
}

export function isTurboManagerReady(): boolean {
  return TURBO_IS_ENABLED && !!Turbo;
}

export function Analytics(): AnalyticsManager | undefined {
  return AnalyticsManager && AnalyticsManager.s_instance;
}

export enum LogType {
  WEAPON_EQUIP,
  TASK_START,
  TASK_END,
  FRICTION_HIT
}

/** TODO (Creator): Turbo Analytics Manager: IMPORTANT -> This Must be Attached to an entity in the world */
export class AnalyticsManager extends hz.Component {
  static s_instance: AnalyticsManager;
  public static clientLogToServer = new hz.NetworkEvent<{ player: hz.Player, log_type: LogType, weaponKey?: string, taskKey?: string, taskType?: string, frictionItemKey?: string }>("clientLogToServer");

  start() {
    AnalyticsManager.s_instance = this;
    if (!TURBO_IS_ENABLED) return;
    this.subscribeToEvents();
    Turbo.register(this, getTurboSettings());

    this.entity.visible.set(false);
    log.info(`🚀 TURBO: Initializing TurboAnalyticsManager API`);

    if (Turbo.getConfigs().debug) {
      this.async.setTimeout(() => {
        !Turbo.isReady() && log.warn("🚀 TURBO: Turbo Analytics is not ready yet.  Are you sure it's hooked up?");
      }, 1000 * 3);
    }

  }

  /** TODO (Creator): Add Hooks here from Existing Broadcasts
   WARNING: DO NOT SEND TURBO EVENTS FOR WORLD ENTER/EXIT, AFK/ENTER EXIT or you'll have double logging!
   @example
   this.connectLocalBroadcastEvent(Events.onFoundFiveDollars, (player:hz.Player) => {
       this.sendDiscoveryMade(player, { discoveryItemKey: "found_five_dollars" });
   });
   **/
  subscribeToEvents() {
    this.connectLocalBroadcastEvent(TurboDebug.events.onDebugTurboPlayerEvent, (data: { player: hz.Player; eventData: EventData; action: Action }) => {
      this.onDebugTurboPlayerEvent(data.player, data.eventData, data.action);
    });

    this.connectNetworkBroadcastEvent(AnalyticsManager.clientLogToServer, (data) => {
      // Handle different log types from client
      switch (data.log_type) {
        case LogType.WEAPON_EQUIP:
          if (data.weaponKey) {
            this.sendWeaponEquip({ player: data.player, weaponKey: data.weaponKey });
          }
          break;
        case LogType.TASK_START:
          if (data.taskKey && data.taskType) {
            this.sendTaskStart({ player: data.player, taskKey: data.taskKey, taskType: data.taskType });
          }
          break;
        case LogType.TASK_END:
            if (data.taskKey && data.taskType) {
              this.sendTaskEnd({ player: data.player, taskKey: data.taskKey, taskType: data.taskType });
            }
            break;
        case LogType.FRICTION_HIT:
          if (data.frictionItemKey) {
            this.sendFrictionHit({ player: data.player, frictionItemKey: data.frictionItemKey });
          }
          break;
        default:
          log.warn(`Unhandled log type: ${data.log_type}`);
          break;
      }
    });
  }

  /* Turbo Debugging - DO NOT USE IN PRODUCTION
  @remarks Note: You can delete this once debug is off, but it's needed during Debugging
    because without it, sometimes the first emmitted debug event from Turbo is dropped which can cause the event to stop emmitting including for other potential subscribers
    See @DebugTurbo for various starter tools for you to debug and you'll see what's up (What's up!?)
  */
  onDebugTurboPlayerEvent(_player: hz.Player, _eventData: EventData, _action: Action): void {
    // return;
  }


  /** TURBO SEND EVENTS */

  sendAreaEnter(payload: AreaEnterPayload): boolean { return this.trySend(() => Turbo.send(TurboEvents.OnAreaEnter, payload)); }
  sendAreaExit(payload: AreaExitPayload): boolean { return this.trySend(() => Turbo.send(TurboEvents.OnAreaExit, payload)); }
  sendCustomEvent(payload: CustomEventPayload): boolean { return this.trySend(() => Turbo.send(TurboEvents.OnCustomAction, payload)); }
  sendDeathByEnemy(payload: DeathByEnemyPayload): boolean { return this.trySend(() => Turbo.send(TurboEvents.OnDeathByEnemy, payload)); }
  sendDeathByPlayer(payload: DeathByPlayerPayload): boolean { return this.trySend(() => Turbo.send(TurboEvents.OnDeathByPlayer, payload)); }
  sendKOPlayer(payload: KOPlayerPayload): boolean { return this.trySend(() => Turbo.send(TurboEvents.OnKOPlayer, payload)); }
  sendKOEnemy(payload: KOEnemyPayload): boolean { return this.trySend(() => Turbo.send(TurboEvents.OnKOEnemy, payload)); }
  sendLevelUp(payload: LevelUpPayload): boolean { return this.trySend(() => Turbo.send(TurboEvents.OnLevelUp, payload)); }
  sendPlayerReadyEnter(payload: PlayerReadyEnterPayload): boolean { return this.trySend(() => Turbo.send(TurboEvents.OnPlayerReadyEnter, payload)); }
  sendPlayerReadyExit(payload: PlayerReadyExitPayload): boolean { return this.trySend(() => Turbo.send(TurboEvents.OnPlayerReadyExit, payload)); }
  sendRewardsEarned(payload: RewardsEarnedPayload): boolean { return this.trySend(() => Turbo.send(TurboEvents.OnRewardsEarned, payload)); }
  sendStageStart(payload: StageStartPayload): boolean { return this.trySend(() => Turbo.send(TurboEvents.OnStageStart, payload)); };
  sendStageEnd(payload: StageEndPayload): boolean { return this.trySend(() => Turbo.send(TurboEvents.OnStageEnd, payload)); };
  sendSectionStart(payload: SectionStartPayload): boolean { return this.trySend(() => Turbo.send(TurboEvents.OnSectionStart, payload)); };
  sendSectionEnd(payload: SectionEndPayload): boolean { return this.trySend(() => Turbo.send(TurboEvents.OnSectionEnd, payload)); };
  sendTaskStart(payload: TaskStartPayload): boolean { return this.trySend(() => Turbo.send(TurboEvents.OnTaskStart, payload)); };
  sendTaskStepStart(payload: TaskStepStartPayload): boolean { return this.trySend(() => Turbo.send(TurboEvents.OnTaskStepStart, payload)); };
  sendTaskStepEnd(payload: TaskStepEndPayload): boolean { return this.trySend(() => Turbo.send(TurboEvents.OnTaskStepEnd, payload)); };
  sendTaskEnd(payload: TaskEndPayload): boolean { return this.trySend(() => Turbo.send(TurboEvents.OnTaskEnd, payload)); };
  sendWeaponEquip(payload: WeaponEquipPayload): boolean { return this.trySend(() => Turbo.send(TurboEvents.OnWeaponEquip, payload)); }
  sendWeaponGrab(payload: WeaponGrabPayload): boolean { return this.trySend(() => Turbo.send(TurboEvents.OnWeaponGrab, payload)); }
  sendWeaponRelease(payload: WeaponReleasePayload): boolean { return this.trySend(() => Turbo.send(TurboEvents.OnWeaponRelease, payload)); }
  sendWearableEquip(payload: WearableEquipPayload): boolean { return this.trySend(() => Turbo.send(TurboEvents.OnWearableEquip, payload)); }
  sendWearableRelease(payload: WearableReleasePayload): boolean { return this.trySend(() => Turbo.send(TurboEvents.OnWearableRelease, payload)); }

  private trySend(turboEventSend: () => boolean): boolean {
    let result = false;
    try {
      result = turboEventSend();
    } catch (e) {
      log.warn(`Error sending turbo event: ${e}`);
    }
    return result;
  }

  /** TODO (Creator): Round Start (All Players)
   * @remarks WARN: This is for ALL players and will send events for EACH affected player
   * @param playersInRound - Players that are in the game when the round starts
  */
  sendAllRoundStart(playersInRound: Array<hz.Player>, payload: { gameMode?: string; roundName?: string; }): boolean {
    return Turbo.send(TurboEvents.OnGameRoundStartForPlayers, {
      players: playersInRound,
      sendPlayerRoundStart: true,
      gameStartData: payload
    });
  }

  /** TODO (Creator): Round End (All Players)
  * @remarks WARN: This is for ALL players and will send events for EACH affected player
  * @param playersLeftInRound - Players that are still in the game when the round ends
  */
  sendAllRoundEnd(playersLeftInRound: Array<hz.Player>, _payload: RoundEndPayload): boolean {
    return Turbo.send(TurboEvents.OnGameRoundEndForPlayers, {
      players: playersLeftInRound,
      sendPlayerRoundEnd: true,
    });
  }

  sendDiscoveryMade(payload: DiscoveryMadePayload, firstTimeOnly = false): boolean {
    if (firstTimeOnly && TurboDataService.getDiscoveryItemSeenCount(payload.player, payload.discoveryItemKey) > 0) {
      return false;
    }
    return Turbo.send(TurboEvents.OnDiscoveryMade, payload);
  }

  sendFrictionCaused(payload: FrictionCausedPayload, firstTimeOnly = false): boolean {
    if (firstTimeOnly && TurboDataService.getFrictionCausedSeen(payload.player).has(payload.frictionItemKey)) {
      return false;
    }
    return Turbo.send(TurboEvents.OnFrictionCaused, payload);
  }

  sendFrictionHit(payload: FrictionHitPayload, firstTimeOnly = false): boolean {
    if (firstTimeOnly && TurboDataService.getFrictionItemSeenCount(payload.player, payload.frictionItemKey) > 0) {
      return false;
    }
    return Turbo.send(TurboEvents.OnFrictionHit, payload);
  }

  sendQuestCompleted(payload: QuestCompletedPayload, firstTimeOnly: boolean = true): boolean {
    if (firstTimeOnly && TurboDataService.getQuestsUnlocked(payload.player).includes(payload.achievementKey)) {
      return false;
    }
    return Turbo.send(TurboEvents.OnQuestCompleted, payload);
  }

  // No... see @Turbo for automatic handlers
  // sendAFKEnter()
  // sendAFKExit()
  // sendWorldEnter()
  // sendWorldExit()

}
hz.Component.register(AnalyticsManager);
