/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_ExpEvents } from 'BigBox_ExpEvents';
import { BigBox_Player_Inventory } from 'BigBox_Player_Inventory';
import { BigBox_ToastEvents } from 'BigBox_ToastManager';
import { Debug } from 'Debug';
import { DigZoneManager } from 'DigZoneManager';
import { Events } from 'Events';
import * as GameUtils from 'GameUtils';
import * as hz from 'horizon/core';
import { Entity, EventSubscription, LocalEvent, NetworkEvent, Player, PropTypes, Vec3 } from 'horizon/core';
import { getIslandDisplayName, getIslandFromID, Islands } from 'Islands';
import { IslandEvents } from 'IslandTeleportManager';
import { ItemContainer } from 'ItemContainer';
import { Logger } from 'Logger';
import { MuseumCuratorManager } from 'MuseumCuratorManager';
import { NavigationTarget } from 'NavigationArrow';
import { NavigationArrowEvents } from 'NavigationArrowEvents';
import { NPC } from 'NPC';
import { PlayerCatalogManager } from 'PlayerCatalogManager';
import { PlayerData } from 'PlayerData';
import { PlayerIslandData } from 'PlayerIslandData';
import { PlayerService } from 'PlayerService';
import { SAVE_VERSION, saveVersionMatches, SHOULD_USE_PERSISTENCE } from 'PVarConsts';
import { QuestData } from 'QuestData';
import { ShovelProgressionEvents } from 'ShovelProgressionEvents';
import { ShovelProgressionManager } from 'ShovelProgressionManager';
import { CatalogEntriesSubquestData, DigLuckSubquestData, GoToDigZoneSubquestData, GoToDigZoneSubquestParameters, InventorySubquestData, LocationSubquestData, NPCTalkSubquestData, NPCTalkSubquestParameters, RegionCompletionSubquestData, RetrievalSubquestData, ShovelSubquestData, SocialDigSubquestData, SubquestData, UpgradeShovelSubquestData, UsePotionSubquestData } from 'SubquestData';
import { Analytics } from 'TurboAnalytics';
import { TutorialProgress } from 'TutorialManager';

const log = new Logger("QuestManager");

export const QUEST_PERSISTENT_VAR = 'playerData:quests';

/**
 * Quest data used for persistent storage
 */
export type PlayerQuests = {
  saveVersion: number,
  activeQuests: ActiveQuestData[],
  currentQuestIndex: number,
  completedQuestIds: string[],
  completedRandomQuests: string[],
}

export type SubquestState = {
  subquestId: string, // corresponds to subquest id in subquest data
  count: number,
  countRequirement: number,
  subquestText: string, // text to display in UI
  itemIdsOfInterest: string, // item id that is of interest for this subquest, used for catalog
  parameters?: hz.PersistentSerializableState,
}

export type ActiveQuestData = {
  questId: string,
  questName: string,
  currencyReward: number,
  xpReward: number,
  gemReward: number,
  subquestStates: SubquestState[],
}

export const QuestEvents = {
  playerQuestsChangedForPlayer: new NetworkEvent<{ player: Player, playerQuests: PlayerQuests }>('playerQuestsChangedForPlayer'), // sent by manager to tell UI that subquest state has changed
  startQuestForPlayer: new NetworkEvent<{ player: Player, questId: string, playerQuests: PlayerQuests }>('startQuestForPlayer'), // sent by manager to tell UI that quest has started
  finishQuestForPlayer: new NetworkEvent<{ player: Player, questId: string, finishedQuest?: ActiveQuestData, playerQuests: PlayerQuests }>('finishQuestForPlayer'), // sent by manager to tell UI that quest has finished
  initializeUIQuestsForPlayer: new NetworkEvent<{ player: Player }>('initializeUIQuestsForPlayer'), // sent by UI to tell manager to initialize UI quests
  requestStartQuestForPlayer: new NetworkEvent<{ player: Player, questId: string, overwriteExisting?: boolean, questParameters?: hz.PersistentSerializableState, textParameters?: string[] }>('requestStartQuestForPlayer'), // sent by other components to tell manager that to try and start a quest
  requestFinishSubquestForPlayer: new LocalEvent<{ player: Player, questId: string }>('requestFinishQuestForPlayer'), // sent by other components to tell manager that to try and finish a quest
  requestResetQuestsForPlayer: new NetworkEvent<{ player: Player }>('requestResetQuestsForPlayer'), // sent by other components to tell manager that to try and reset all quests
  navigationTargetUpdatedForQuest: new NetworkEvent<{ questId: string, position: Vec3 }>('navigationTargetUpdatedForQuest'), // sent by other components to tell manager that navigation target has been updated for a quest
  navigationTargetsUpdatedForQuest: new NetworkEvent<{ questId: string, positions: NavigationTarget[] }>('navigationTargetsUpdatedForQuest'), // sent by other components to tell manager that navigation target has been updated for a quest
  questManagerInitialized: new LocalEvent('questManagerInitialized'), // sent by manager to tell other components that quests have been initialized for a player
  questInitialized: new LocalEvent<{ questData: QuestData }>('questInitialized'),
  requestCurrentQuestIndexChangedForPlayer: new NetworkEvent<{ player: Player, index: number }>('requestCurrentQuestIndexChangedForPlayer'), // sent
  newQuestsAvailableForPlayer: new LocalEvent<{ player: Player, newQuestIds: string[] }>('newQuestsAvailableForPlayer'), // sent to other server side components
};

export class QuestManager extends hz.Component<typeof QuestManager> {
  static propsDefinition = {
    questViewerAsset: { type: PropTypes.Asset },

    modelRoot: { type: PropTypes.Entity },

    repeatableQuestTrigger: { type: PropTypes.String }
  };

  // Singleton
  private static _instance: QuestManager | null;
  public static get instance(): QuestManager { return this._instance!; }
  static IsReady(): boolean {
    return QuestManager.instance !== undefined && QuestManager.instance.isReady;
  }
  private isReady: boolean = false;

  public static printQuestData(player: Player) {
    if (QuestManager.instance) {
      QuestManager.instance.print(player);
    }
  }

  // Cache for quest data
  private playerToQuestsMap = new Map<Player, PlayerQuests>();

  private indexToQuestData = new Map<number, QuestData>();
  private questIdToQuestData = new Map<string, QuestData>();
  private subquestIdToSubquestData = new Map<string, SubquestData<typeof SubquestData>>();
  private questDataIdToUnlockedQuestDataIds = new Map<string, string[]>();

  private onInitializeUIEventSubscription: EventSubscription | undefined;

  private getCurrentQuest(player: Player): ActiveQuestData | undefined {
    let playerQuests = this.playerToQuestsMap.get(player);

    if (playerQuests === undefined) {
      return undefined;
    }

    return playerQuests.activeQuests[playerQuests.currentQuestIndex];
  }

  /**
   * Creates and returns a new quest data object with empty values
   */
  private initializeQuests(player: Player): PlayerQuests {
    let playerQuestData: PlayerQuests = { saveVersion: SAVE_VERSION, activeQuests: [], currentQuestIndex: 0, completedQuestIds: [], completedRandomQuests: [] }
    GameUtils.setPlayerVariableSafe(this.world, player, QUEST_PERSISTENT_VAR, playerQuestData);

    return playerQuestData;
  }

  /**
   * Gets or Creates the Quest date from persistent storage
   */
  private getOrCreatePersistentQuestsForPlayer(player: Player): PlayerQuests {
    let playerQuests: PlayerQuests | null = GameUtils.getPlayerVariableSafe<PlayerQuests>(this.world, player, QUEST_PERSISTENT_VAR);
    if (playerQuests && playerQuests.activeQuests && (playerQuests.currentQuestIndex !== undefined) && playerQuests.completedQuestIds && playerQuests.saveVersion && saveVersionMatches(playerQuests.saveVersion)) {
      //add new value if data already exists.  Can remove this next time we bump versions
      if (!playerQuests.completedRandomQuests) {
        playerQuests.completedRandomQuests = [];
      }
      playerQuests = this.validateData(player, playerQuests);
      return playerQuests;
    }
    else {
      // Failed to get quests, create new and return
      log.info("QuestManager: Failed to get quests for player, creating new");
      return this.initializeQuests(player);
    }
  }

  private validateData(player: Player, quests: PlayerQuests) {
    let updated = false
    for (let i = 0; i < quests.activeQuests.length; i++) {
      let activeQuest = quests.activeQuests[i];
      if (this.questIdToQuestData.has(activeQuest.questId)) {
        for (let j = 0; j < activeQuest.subquestStates.length; j++) {
          let subquestState = activeQuest.subquestStates[j];
          if (!this.subquestIdToSubquestData.has(subquestState.subquestId)) {
            updated = true;
            log.info(`Removed subquest with ID: ${subquestState.subquestId}`);
            activeQuest.subquestStates.splice(j, 1);
            j--;
          }
          else {
            let subquestData = this.subquestIdToSubquestData.get(subquestState.subquestId)!;
            if (subquestData instanceof RegionCompletionSubquestData) {
              updated = updated || this.validateRegionCompleteSubquestState(player, subquestData, subquestState);
              log.info(`updated region complete subquest state? - ${updated}`)
            }
            // TODO: Validate other subquest datas like shovel
          }
          // TODO: Validate that the expected subquests per active quest match the subquest states stored in data
        }
      } else {
        updated = true
        log.info(`Removed quest with ID: ${activeQuest.questId}`);
        quests.activeQuests.splice(i, 1);
        i--;
      }
    }

    for (let i = 0; i < quests.completedQuestIds.length; i++) {
      let completedQuestId = quests.completedQuestIds[i];
      if (!this.questIdToQuestData.has(completedQuestId)) {
        updated = true
        log.info(`Removed completed quest with ID: ${completedQuestId}`);
        quests.completedQuestIds.splice(i, 1);
        i--;
      }
    }

    for (let i = 0; i < quests.completedRandomQuests.length; i++) {
      let completedRandomQuestId = quests.completedRandomQuests[i];
      if (!this.questIdToQuestData.has(completedRandomQuestId)) {
        updated = true
        log.info(`Removed completed random quest with ID: ${completedRandomQuestId}`);
        quests.completedRandomQuests.splice(i, 1);
        i--;
      }
    }

    if (updated) {
      GameUtils.setPlayerVariableSafe(this.world, player, QUEST_PERSISTENT_VAR, quests);
    }

    return quests
  }

  private print(player: Player) {
    // !! Leave as console.log !!
    console.log(`Quest Data for ${PlayerService.getPlayerName(player)}\n${JSON.stringify(this.getOrCreatePersistentQuestsForPlayer(player))}`);
  }

  start() {
    QuestManager._instance = this;
    PlayerData.init(this.world);

    this.async.setTimeout(() =>{ // need to integrate a delay so all the child objects are correctly set
      if (!this.isReady){
        this.initializeData();
      }
    }, 500)

    PlayerService.connectPlayerEnterWorld(
      this,
      (player: Player) => {
        if (!this.isReady){
          this.initializeData()
        }
        if (!this.playerToQuestsMap.has(player)) {
          log.info("[QuestManager] New player " + player.id + " entered world setting quest data");

          let playerQuests = this.getOrCreatePersistentQuestsForPlayer(player);
          this.playerToQuestsMap.set(player, playerQuests);

          // In case the UI is initialized before we enter the world, we need to initialize the UI
          this.initializeUIQuestsForPlayer(player);

          for (let i = 0; i < playerQuests.activeQuests.length; i++) {
            // Do anything we need to do for subquest states
            this.onSubquestStateChange(player, playerQuests.activeQuests[i]);
          }
          // Need to wait 500 ms to make sure quests are initialized before sending new quests available event
          this.async.setTimeout(() => {
            if (PlayerService.isConnected(player) === false) {
              return;
            }
            let availableQuests = this.getAllAvailableQuests(player);
            log.info("available quests: " + availableQuests);
            this.sendLocalBroadcastEvent(QuestEvents.newQuestsAvailableForPlayer, { player: player, newQuestIds: availableQuests });
          }, 500);
        }
      }
    );

    PlayerService.connectPlayerExitWorld(
      this,
      (player: Player) => {
        if (this.playerToQuestsMap.has(player)) {
          this.playerToQuestsMap.delete(player);
        }
      },
    );

    this.connectNetworkBroadcastEvent(QuestEvents.initializeUIQuestsForPlayer, (data: { player: Player }) => {
      let playerQuests = this.playerToQuestsMap.get(data.player);
      log.info("initializeUIQuestsForPlayer: " + playerQuests);

      if (playerQuests === undefined) {
        this.onInitializeUIEventSubscription?.disconnect();
        this.onInitializeUIEventSubscription = this.connectLocalBroadcastEvent(QuestEvents.questManagerInitialized, () => {
          this.onInitializeUIEventSubscription?.disconnect();
          this.onInitializeUIEventSubscription = undefined;
          this.initializeUIQuestsForPlayer(data.player);
        });
      }
      else {
        this.initializeUIQuestsForPlayer(data.player);
      }
    });

    this.connectNetworkBroadcastEvent(QuestEvents.requestStartQuestForPlayer, (data) => this.tryStartQuestForPlayer(data.player, data.questId, data.overwriteExisting, data.questParameters, data.textParameters));

    this.connectLocalBroadcastEvent(QuestEvents.requestFinishSubquestForPlayer, (data: { player: Player, questId: string }) => {
      let playerQuestData = this.playerToQuestsMap.get(data.player);
      if (playerQuestData === undefined) {
        log.info("[Quest] Error! Quest data or player quest data undefined during quest setup");
        return;
      }

      let playerQuests: PlayerQuests = this.playerToQuestsMap.get(data.player)!;

      // subquest check
      for (let index = 0; index < playerQuests.activeQuests.length; index++) {
        let activeQuest = playerQuests.activeQuests[index];
        if (activeQuest === undefined) continue;
        for (let i = 0; i < activeQuest.subquestStates.length; i++) {
          let subquestState = activeQuest.subquestStates[i];
          if (subquestState.subquestId === data.questId) {
            let prevCount = subquestState.count;
            if (prevCount === 0) {
              subquestState.count = 1;
              GameUtils.setPlayerVariableSafe(this.world, data.player, QUEST_PERSISTENT_VAR, playerQuests);
              this.onSubquestStateIncremented(data.player, subquestState);
              this.onSubquestStateChange(data.player, activeQuest);
            }
          }
        }
      }
    });

    this.connectNetworkBroadcastEvent(QuestEvents.requestResetQuestsForPlayer, (data: { player: Player }) => {
      let playerQuests = this.initializeQuests(data.player);
      this.playerToQuestsMap.set(data.player, playerQuests);
    });

    this.connectNetworkBroadcastEvent(MuseumCuratorManager.assignCuratorQuest, (data) => {
      this.constructCuratorQuest(data.player, data.itemId, data.zoneId, this.questIdToQuestData.get(data.questId)!);
    })

    this.connectNetworkBroadcastEvent(QuestEvents.navigationTargetUpdatedForQuest, (data: { questId: string, position: Vec3 }) => {
      for (const player of Array.from(this.playerToQuestsMap.keys())) {
        let currentQuest = this.getCurrentQuest(player)!;
        if (currentQuest === undefined) continue;
        for (let i = 0; i < currentQuest.subquestStates.length; i++) {
          if (currentQuest.subquestStates[i].subquestId === data.questId) {
            let target = {
              island: Islands.None, // todo - get island from position
              position: data.position
            }
            this.sendNetworkBroadcastEvent(NavigationArrowEvents.updateNavigationArrowEvent, { player: player, positions: [target], questId: data.questId }, [player]);
            break;
          }
        }
      }
    });

    this.connectNetworkBroadcastEvent(QuestEvents.navigationTargetsUpdatedForQuest, (data) => {
      for (const player of Array.from(this.playerToQuestsMap.keys())) {
        let currentQuest = this.getCurrentQuest(player)!;
        if (currentQuest === undefined) continue;
        for (let i = 0; i < currentQuest.subquestStates.length; i++) {
          if (currentQuest.subquestStates[i].subquestId === data.questId) {
            this.sendNetworkBroadcastEvent(NavigationArrowEvents.updateNavigationArrowEvent, { player: player, positions: data.positions, questId: data.questId }, [player]);
            break;
          }
        }
      }
    });

    this.connectLocalBroadcastEvent(BigBox_Player_Inventory.playerInventoryChanged, (data: { player: Player }) => {
      let playerQuests: PlayerQuests = this.playerToQuestsMap.get(data.player)!;

      let hasChanged = false;

      for (let index = 0; index < playerQuests.activeQuests.length; index++) {
        let activeQuest = playerQuests.activeQuests[index];
        if (activeQuest === undefined) continue;
        let questData = this.questIdToQuestData.get(activeQuest.questId);
        if (questData?.subquestDatas === undefined) continue;
        for (let j = 0; j < questData.subquestDatas.length; j++) {
          let inventorySubquestData = questData.subquestDatas[j];
          if (inventorySubquestData instanceof InventorySubquestData
            && inventorySubquestData.props.allowRegression
            && this.updateRegressableInventorySubquestState(data.player, inventorySubquestData, activeQuest)) {
            this.onSubquestStateChange(data.player, activeQuest);
            hasChanged = true
          }
        }

        // incredibly disgusting hack to check if we've done the curator quest
        let curatorQuest = activeQuest.subquestStates.find(x => x.subquestId === 'curatorFind')
        if (curatorQuest && this.updateCuratorSubquestState(data.player, curatorQuest)) {
          this.onSubquestStateChange(data.player, activeQuest);
          hasChanged = true
        }
      }

      if (hasChanged) {
        GameUtils.setPlayerVariableSafe(this.world, data.player, QUEST_PERSISTENT_VAR, playerQuests);
      }
    });

    this.connectNetworkBroadcastEvent(Events.playerDigComplete, (data) => {
      if (!data.isSuccess) {
        return
      }

      let playerQuests: PlayerQuests = this.playerToQuestsMap.get(data.player)!;

      let hasChanged = false;

      for (let index = 0; index < playerQuests.activeQuests.length; index++) {
        let activeQuest = playerQuests.activeQuests[index];
        let questData = this.questIdToQuestData.get(activeQuest.questId);

        if (questData?.subquestDatas === undefined) continue;
        for (let j = 0; j < questData.subquestDatas.length; j++) {
          let inventorySubquestData = questData.subquestDatas[j];
          if (inventorySubquestData instanceof InventorySubquestData
            && !inventorySubquestData.props.allowRegression
            && this.updateItemCollectionSubquestState(data.player, data.itemId, inventorySubquestData, activeQuest)) {
            this.onSubquestStateChange(data.player, activeQuest);
            hasChanged = true
          }
        }
      }

      if (hasChanged) {
        GameUtils.setPlayerVariableSafe(this.world, data.player, QUEST_PERSISTENT_VAR, playerQuests);
      }
    });

    this.connectNetworkBroadcastEvent(DigZoneManager.sendZoneId, (data) => {
      // On launch, this event fires before the player is ready.
      // TODO: Do the work after the player is ready.
      if (!this.playerToQuestsMap.has(data.player)) {
        return;
      }
      this.incrementSubquest(data.player, (subquestData, subquestState) =>
        subquestData instanceof LocationSubquestData && subquestData.props.zoneId === data.data.id);
    })

    this.connectNetworkBroadcastEvent(DigZoneManager.zoneComplete, (data) => {
      this.incrementSubquest(data.player, (subquestData, subquestState) =>
        subquestData instanceof RegionCompletionSubquestData &&
        (subquestData.props.zoneId === data.id || subquestData.props.zoneId.length === 0) &&
        (subquestData.props.firstTimeOnly || !data.isRenew));
    })

    this.connectNetworkBroadcastEvent(IslandEvents.playerTeleportedToIsland, (data) => {
      this.incrementSubquest(data.player, (subquestData, subquestState) =>
        subquestData instanceof LocationSubquestData && getIslandFromID(subquestData.props.islandId) === data.island);
    });

    this.connectNetworkBroadcastEvent(ShovelProgressionEvents.shovelGivenToPlayer, (data) => {
      this.incrementSubquest(data.player, (subquestData, subquestState) =>
        subquestData instanceof ShovelSubquestData && subquestData.props.shovelId === data.shovelId);
    });

    this.connectNetworkBroadcastEvent(QuestEvents.requestCurrentQuestIndexChangedForPlayer, (data: { player: Player, index: number }) => {
      let playerQuests: PlayerQuests = this.playerToQuestsMap.get(data.player)!;
      playerQuests.currentQuestIndex = data.index;
      GameUtils.setPlayerVariableSafe(this.world, data.player, QUEST_PERSISTENT_VAR, playerQuests);
      this.onSubquestStateChange(data.player, this.getCurrentQuest(data.player)!);
    });

    this.connectNetworkBroadcastEvent(PlayerCatalogManager.newItemDiscovered, (data) => {
      this.incrementSubquest(data.player, (subquestData, subquestState) => subquestData instanceof CatalogEntriesSubquestData);
    })

    this.connectLocalBroadcastEvent(Events.shovelUpgradeEvent, (data) => {
      this.incrementSubquest(data.player, (subquestData, subquestState) => subquestData instanceof UpgradeShovelSubquestData);
    })

    this.connectLocalBroadcastEvent(NPC.LocalTalkToNPC, (data) => {
      log.info(`LocalNPCTalk:  npcId: ${data.npcId}`);
      this.incrementSubquest(data.player, (subquestData, subquestState) =>
        subquestData instanceof NPCTalkSubquestData &&
        subquestState.parameters !== undefined &&
        (subquestState.parameters as NPCTalkSubquestParameters).npcId === data.npcId);
    });

    this.connectLocalBroadcastEvent(Events.digZoneEnter, (data) => {
      this.incrementSubquest(data.player, (subquestData, subquestState) =>
        subquestData instanceof GoToDigZoneSubquestData &&
        subquestState.parameters !== undefined &&
        (subquestState.parameters as GoToDigZoneSubquestParameters).zoneId === data.zoneId);
    })

    this.connectLocalBroadcastEvent(Events.potionUsedEvent, (data) => {
      let playerQuests: PlayerQuests = this.playerToQuestsMap.get(data.player)!;
      let hasChanged = false;
      for (let index = 0; index < playerQuests.activeQuests.length; index++) {
        let activeQuest = playerQuests.activeQuests[index];
        if (activeQuest === undefined) continue;
        for (let i = 0; i < activeQuest.subquestStates.length; i++) {
          let subquestState = activeQuest.subquestStates[i];
          let subquestData = this.subquestIdToSubquestData.get(subquestState.subquestId);
          if (subquestData instanceof UsePotionSubquestData && (subquestData.props.potionId.length === 0 || subquestData.props.potionId === data.potionID)) {
            ++subquestState.count;
            hasChanged = true;
            subquestState.subquestText = subquestData.getDisplayTextWithCount(subquestState.count)
            this.onSubquestStateIncremented(data.player, subquestState);
            this.onSubquestStateChange(data.player, activeQuest);
          }
        }
      }
      if (hasChanged) {
        GameUtils.setPlayerVariableSafe(this.world, data.player, QUEST_PERSISTENT_VAR, playerQuests);
      }
    })

    this.connectNetworkBroadcastEvent(Events.playerStartDig, (data) => {
      let playerQuests: PlayerQuests = this.playerToQuestsMap.get(data.player)!;
      let hasChanged = false;
      for (let index = 0; index < playerQuests.activeQuests.length; index++) {
        let activeQuest = playerQuests.activeQuests[index];
        if (activeQuest === undefined) continue;
        for (let i = 0; i < activeQuest.subquestStates.length; i++) {
          let subquestState = activeQuest.subquestStates[i];
          let subquestData = this.subquestIdToSubquestData.get(subquestState.subquestId);
          if (subquestData instanceof DigLuckSubquestData) {
            if (data.compliment >= subquestData.props.minCompliment) {
              ++subquestState.count;
              hasChanged = true;
              subquestState.subquestText = subquestData.getDisplayTextWithCount(subquestState.count)
              this.onSubquestStateIncremented(data.player, subquestState);
              this.onSubquestStateChange(data.player, activeQuest);
            }
            else if (subquestData.props.streak) {
              subquestState.count = 0
              hasChanged = true;
              subquestState.subquestText = subquestData.getDisplayTextWithCount(subquestState.count)
              this.onSubquestStateIncremented(data.player, subquestState);
              this.onSubquestStateChange(data.player, activeQuest);
            }
          }
        }
      }
      if (hasChanged) {
        GameUtils.setPlayerVariableSafe(this.world, data.player, QUEST_PERSISTENT_VAR, playerQuests);
      }
    })

    this.connectLocalBroadcastEvent(Events.socialBonusClaimedEvent, (data) => {
      let playerQuests: PlayerQuests = this.playerToQuestsMap.get(data.player)!;
      let hasChanged = false;
      for (let index = 0; index < playerQuests.activeQuests.length; index++) {
        let activeQuest = playerQuests.activeQuests[index];
        if (activeQuest === undefined) continue;
        for (let i = 0; i < activeQuest.subquestStates.length; i++) {
          let subquestState = activeQuest.subquestStates[i];
          let subquestData = this.subquestIdToSubquestData.get(subquestState.subquestId);
          if (subquestData instanceof SocialDigSubquestData) {
            subquestState.count = Math.min(subquestData.props.count, subquestState.count + data.bonus)
            hasChanged = true;
            subquestState.subquestText = subquestData.getDisplayTextWithCount(subquestState.count)
            this.onSubquestStateIncremented(data.player, subquestState);
            this.onSubquestStateChange(data.player, activeQuest);

          }
        }
      }
      if (hasChanged) {
        GameUtils.setPlayerVariableSafe(this.world, data.player, QUEST_PERSISTENT_VAR, playerQuests);
      }
    })
  }

  private incrementSubquest(player: Player, isMatch: (data: SubquestData<typeof SubquestData>, state: SubquestState) => boolean) {
    let playerQuests = this.playerToQuestsMap.get(player);
    if (playerQuests === undefined) {
      return;
    }
    let hasChanged = false;
    for (let index = 0; index < playerQuests.activeQuests.length; index++) {
      let activeQuest = playerQuests.activeQuests[index];
      if (activeQuest === undefined) continue;
      for (let i = 0; i < activeQuest.subquestStates.length; i++) {
        let subquestState = activeQuest.subquestStates[i];
        let subquestData = this.subquestIdToSubquestData.get(subquestState.subquestId)!;
        let match = isMatch(subquestData, subquestState);
        if (match) {
          let prevCount = subquestState.count;
          const reqCount = subquestState.countRequirement;
          if (prevCount === 0 || reqCount > 1) {
            subquestState.count++;
            hasChanged = true;
            if (reqCount > 1) {
              subquestState.subquestText = subquestData.getDisplayTextWithCount(subquestState.count);
            }
            this.onSubquestStateIncremented(player, subquestState);
            this.onSubquestStateChange(player, activeQuest);
          }
        }
      }
    }

    if (hasChanged) {
      GameUtils.setPlayerVariableSafe(this.world, player, QUEST_PERSISTENT_VAR, playerQuests);
    }
  }

  private tryStartQuestForPlayer(player: hz.Player, questId: string, overwriteExisting?: boolean, questParameters?: hz.PersistentSerializableState, textParameters?: string[]): boolean {
    let questData = this.questIdToQuestData.get(questId);
    let playerQuestData = this.playerToQuestsMap.get(player);
    if (questData === undefined || playerQuestData === undefined) {
      log.info("[Quest] Error! Quest data or player quest data undefined during quest setup");
      return false;
    }

    if (questData.prerequisiteQuestData === undefined || playerQuestData.completedQuestIds.includes(questData.prerequisiteQuestData.props.id)) {
      this.startQuestForPlayer(player, questData, overwriteExisting, questParameters, textParameters);
      return true;
    }
    return false;
  }

  initializeUIQuestsForPlayer(player: Player) {
    log.info("[Quest] Setting up player for quests!");

    let playerQuests = this.playerToQuestsMap.get(player)!;

    if (playerQuests.activeQuests.length === 0) {
      if (QuestManager.IsReady()) {
        this.startFirstQuest(player);
      } else {
        this.connectLocalBroadcastEvent(QuestEvents.questManagerInitialized, () => {
          this.startFirstQuest(player);
        });
      }
    }

    let currentQuest = this.getCurrentQuest(player);
    if (currentQuest !== undefined) {
      // Send event to UI to start quest
      this.sendNetworkBroadcastEvent(QuestEvents.startQuestForPlayer, { player: player, questId: currentQuest.questId, playerQuests: playerQuests }, [this.world.getServerPlayer(), player]);
    }
  }

  initializeData() {
    this.props.modelRoot!.children.get().forEach((child: Entity, childIndex: number) => {
        let questData = child.getComponents(QuestData)[0];
        if (this.questIdToQuestData.has(questData.props.id)) {
          log.error("[Quest] Quest already exists with id " + questData.props.id);
        }

        this.indexToQuestData.set(childIndex, questData);
        this.questIdToQuestData.set(questData.props.id, questData);

        for (let i = 0; i < questData.subquestDatas.length; i++) {
          if (this.subquestIdToSubquestData.has(questData.subquestDatas[i].props.id)) {
            log.error("[Quest] Subquest already exists with id " + questData.subquestDatas[i].props.id);
          }
          log.info("Adding subquest to map " + questData.subquestDatas[i].props.id);
          this.subquestIdToSubquestData.set(questData.subquestDatas[i].props.id, questData.subquestDatas[i]);
        }

        // Setting up cache for prerequisite quest ids -> unlocked quest ids
        let prerequisiteQuestId = "";
        if (questData.props.prerequisiteQuest) {
          let prerequisiteQuestData = questData.props.prerequisiteQuest.getComponents(QuestData)[0];
          prerequisiteQuestId = prerequisiteQuestData.props.id;
        }
        let unlockedQuests = this.questDataIdToUnlockedQuestDataIds.get(prerequisiteQuestId);
        if (unlockedQuests === undefined) {
          unlockedQuests = [];
        }
        unlockedQuests.push(questData.props.id);
        this.questDataIdToUnlockedQuestDataIds.set(prerequisiteQuestId, unlockedQuests);
      });

    log.info("[Quest] Quest Manager Initialized event sent")
    this.sendLocalBroadcastEvent(QuestEvents.questManagerInitialized, {});
    this.isReady = true;

    this.questIdToQuestData.forEach((data, id) => {
      Debug.addCommand(`Quests/${data.props.name}/Activate`, (player) => {
        this.debug_completeQuestAndPreReqs(player, data.props.prerequisiteQuest);
      });
      Debug.addCommand(`Quests/${data.props.name}/Complete`, (player) => {
        this.debug_completeQuestAndPreReqs(player, data.entity);
      });
    });
  }

  finishQuestForPlayer(player: Player, activeQuest: ActiveQuestData) {
    let completedQuestData = this.questIdToQuestData.get(activeQuest.questId)!;
    log.info("[Quest] Finished quest " + completedQuestData.props.id);
    Analytics()?.sendTaskEnd({ player, taskKey: "quest", taskType: completedQuestData.props.id });

    let quest0 = this.indexToQuestData.has(0) ? this.indexToQuestData.get(0) : undefined;
    if (activeQuest.questId === quest0?.props.id) {
      if (PlayerData.getTutorialComplete(player) < TutorialProgress.TALKED_TO_DOUG) {
        PlayerData.setTutorialComplete(player, TutorialProgress.TALKED_TO_DOUG);
      }
    }

    let playerQuests: PlayerQuests = this.playerToQuestsMap.get(player)!;
    if (completedQuestData.props.randomObjective) {
      playerQuests.completedRandomQuests.push(completedQuestData.props.id);
    }
    else {
      playerQuests.completedQuestIds.push(completedQuestData.props.id);
    }

    let index = playerQuests.activeQuests.indexOf(activeQuest);
    let finishedQuest = playerQuests.activeQuests.splice(index, 1); // remove completed quest

    // Just completed a quest that is either currently displayed or before it in the array
    // so update the index so it's either pointing to the previous quest or the current quest
    if (index <= playerQuests.currentQuestIndex) {
      playerQuests.currentQuestIndex = Math.max(playerQuests.currentQuestIndex - 1, 0);
    }

    // Set up navigation arrow for the new current quest or clear it if necessary
    this.setupNavigationArrowForPlayer(player);

    GameUtils.setPlayerVariableSafe(this.world, player, QUEST_PERSISTENT_VAR, playerQuests);

    this.sendNetworkBroadcastEvent(BigBox_ExpEvents.expAddToPlayer, { player: player, exp: completedQuestData.props.xpReward, showToast: true }, [this.world.getServerPlayer()])
    BigBox_Player_Inventory.instance.changePlayerCurrency(player, completedQuestData.props.currencyReward);
    if (completedQuestData.props.gemReward > 0) {
      PlayerData.addGems(player, completedQuestData.props.gemReward, true)
    }

    this.sendNetworkBroadcastEvent(QuestEvents.finishQuestForPlayer, { player: player, questId: completedQuestData.props.id, finishedQuest: finishedQuest[0], playerQuests: playerQuests }, [this.world.getServerPlayer(), player]);

    completedQuestData.props.completionSfx?.as(hz.AudioGizmo).play({ players: [player], fade: 0, audibilityMode: hz.AudibilityMode.AudibleTo })

    if (completedQuestData.nextQuestData) {
      this.startQuestForPlayer(player, completedQuestData.nextQuestData);
    }

    let newAvailableQuests = this.questDataIdToUnlockedQuestDataIds.get(completedQuestData.props.id);
    if (newAvailableQuests !== undefined) {
      this.sendLocalBroadcastEvent(QuestEvents.newQuestsAvailableForPlayer, { player: player, newQuestIds: newAvailableQuests });
    }

    if (activeQuest.questId === this.props.repeatableQuestTrigger || completedQuestData.props.randomObjective) {
      this.startRandomQuest(player)
    }
  }

  startQuestForPlayer(player: Player, questData: QuestData, overwriteExisting?: boolean, questParameters?: hz.PersistentSerializableState, textParameters?: string[]) {
    log.info("[Quest] Starting quest quest " + questData.props.id + " for player " + player.id);
    // TODO(BI): Log start/completion of subquests with TaskStepStart and TaskStepEnd logs below (anthony)
    // on active subquest start: Analytics()?.sendTaskStepStart({ player, taskKey: questData.props.id, taskStepKey: subquestData.props.id } });
    // on active subquest complete: Analytics()?.sendTaskStepEnd({ player, taskKey: questData.props.id, taskStepKey: subquestData.props.id } });

    let activeQuest: ActiveQuestData | undefined = undefined;
    let activeQuestIndex = -1;
    let playerQuests: PlayerQuests = this.playerToQuestsMap.get(player)!;
    for (let i = playerQuests.activeQuests.length - 1; i >= 0; i--) {
      const playerQuest = playerQuests.activeQuests[i];
      if (playerQuest.questId === questData.props.id) {
        if (overwriteExisting) {
          activeQuest = playerQuest;
          activeQuest.subquestStates = [];
          activeQuestIndex = i;
          break;
        } else {
          log.info("[Quest] Quest already active");
          return;
        }
      }
    }

    for (let i = playerQuests.completedQuestIds.length - 1; i >= 0; i--) {
      if (playerQuests.completedQuestIds[i] === questData.props.id && !questData.props.repeatable) {
        log.info("[Quest] Nonrepeatable quest already completed " + questData.props.id);
        return;
      }
    }

    if (questData.props.id == 'talk_to_doug') {
      this.async.setTimeout(() => {
        Analytics()?.sendTaskStart({ player, taskKey: "quest", taskType: questData.props.id });
        log.info('Starting talk to doug quest')
      }, 3000);
    } else {
      Analytics()?.sendTaskStart({ player, taskKey: "quest", taskType: questData.props.id });
      log.info(`Started ${questData.props.id}`)
    }

    if (activeQuest === undefined) {
      activeQuest = questData.createActiveQuest(textParameters);
      playerQuests.activeQuests.push(activeQuest);
      activeQuestIndex = playerQuests.activeQuests.length - 1;
    }

    // Show the quest that you just started
    playerQuests.currentQuestIndex = activeQuestIndex;

    for (let i = 0; i < questData.subquestDatas.length; i++) {
      const subquestData = questData.subquestDatas[i];
      subquestData.setParameters(questParameters);
      if (subquestData instanceof InventorySubquestData) {
        this.createInventorySubquestState(player, subquestData, activeQuest);
      } else if (subquestData instanceof NPCTalkSubquestData) {
        this.createNPCTalkSubquestState(player, subquestData, activeQuest, questParameters);
      } else if (subquestData instanceof RetrievalSubquestData) {
        this.createCollectionSubquestState(player, subquestData, activeQuest);
      } else if (subquestData instanceof LocationSubquestData) {
        this.createLocationSubquestState(player, subquestData, activeQuest);
      } else if (subquestData instanceof ShovelSubquestData) {
        this.createShovelSubquestState(player, subquestData, activeQuest);
      } else if (subquestData instanceof CatalogEntriesSubquestData) {
        this.createCatalogEntriesSubquestState(player, subquestData, activeQuest)
      } else if (subquestData instanceof UpgradeShovelSubquestData) {
        this.createUpgradeShovelSubquestState(player, subquestData, activeQuest)
      } else if (subquestData instanceof UsePotionSubquestData) {
        this.createUsePotionSubquestState(player, subquestData, activeQuest)
      } else if (subquestData instanceof DigLuckSubquestData) {
        this.createDigLuckSubquestState(player, subquestData, activeQuest)
      } else if (subquestData instanceof SocialDigSubquestData) {
        this.createSocialDigSubquestState(player, subquestData, activeQuest)
      } else if (subquestData instanceof GoToDigZoneSubquestData) {
        this.createGoToDigZoneSubquestState(player, subquestData, activeQuest, questParameters)
      } else if (subquestData instanceof RegionCompletionSubquestData) {
        this.createRegionCompleteSubquestState(player, subquestData, activeQuest);
      } else {
        this.createBaseSubquestState(player, subquestData, activeQuest);
      }
    }

    GameUtils.setPlayerVariableSafe(this.world, player, QUEST_PERSISTENT_VAR, playerQuests);
    this.onSubquestStateChange(player, activeQuest);

    this.sendNetworkBroadcastEvent(QuestEvents.startQuestForPlayer, { player: player, questId: questData.props.id, playerQuests: playerQuests }, [this.world.getServerPlayer(), player]);

    questData.props.startSfx?.as(hz.AudioGizmo).play({ players: [player], fade: 0, audibilityMode: hz.AudibilityMode.AudibleTo })
  }

  private startFirstQuest(player: Player) {
    let quest0 = this.indexToQuestData.has(0) ? this.indexToQuestData.get(0) : undefined;
    if (quest0 === undefined) {
      log.info("Error! No quest entity found for quest 0");
      return;
    }

    this.startQuestForPlayer(player, quest0); // index 0
  }

  private startRandomQuest(player: Player) {
    //make sure the player only has one random objective quest active at a time
    let playerQuests: PlayerQuests = this.playerToQuestsMap.get(player)!;
    for (let i = 0; i < playerQuests.activeQuests.length; ++i) {
      let activeQuest = this.questIdToQuestData.get(playerQuests.activeQuests[i].questId)!
      if (activeQuest.props.randomObjective) {
        return
      }
    }
    let randomQuests: QuestData[] = []
    this.indexToQuestData.forEach((value: QuestData, key: number) => {
      if (value.props.randomObjective && value.isValid(player)) {
        randomQuests.push(value)
      }
    })
    if (playerQuests.completedRandomQuests.length >= randomQuests.length - 1) {
      playerQuests.completedRandomQuests = []
    }
    else {
      let filteredQuests = randomQuests.filter((value: QuestData) => !playerQuests.completedRandomQuests.includes(value.props.id))
      if (filteredQuests.length > 0) {
        randomQuests = filteredQuests
      }
    }
    this.startQuestForPlayer(player, randomQuests[Math.floor(Math.random() * randomQuests.length)])
  }

  /**
   * @remarks
   * Caller is responsible for saving to the persistent storage.
   */
  createInventorySubquestState(player: Player, inventorySubquestData: InventorySubquestData, activeQuest: ActiveQuestData) {
    if (activeQuest === undefined) return;
    let subquestState = {
      subquestId: inventorySubquestData.props.id,
      count: 0,
      countRequirement: inventorySubquestData.props.itemAmount,
      subquestText: inventorySubquestData.getDisplayTextWithCount(0),
      itemIdsOfInterest: inventorySubquestData.props.itemId,
    };
    activeQuest.subquestStates.push(subquestState);

    if (inventorySubquestData.props.allowRegression) {
      this.updateRegressableInventorySubquestState(player, inventorySubquestData, activeQuest);
    }
  }

  /**
   * @remarks
   * Caller is responsible for saving to the persistent storage.
   *
   * @returns true if the subquest state has changed.
   */
  private updateRegressableInventorySubquestState(player: Player, inventorySubquestData: InventorySubquestData, activeQuest: ActiveQuestData): boolean {
    if (inventorySubquestData === undefined) {
      return false;
    }

    let hasChanged = false;
    let subquestState = this.getSubquestState(player, inventorySubquestData, activeQuest);

    let prevCount = subquestState.count;
    let count = 0;

    if (inventorySubquestData.props.itemId.length > 0) {
      count = BigBox_Player_Inventory.instance.getCount(player, x => x?.info.id === inventorySubquestData.props.itemId);
    }
    else if (inventorySubquestData.props.itemCategory.length > 0) {
      count = BigBox_Player_Inventory.instance.getCount(player, x => x?.info.category === inventorySubquestData.props.itemCategory);
    }
    else if (inventorySubquestData.props.rarity >= 0) {
      count = BigBox_Player_Inventory.instance.getCount(player, x => x?.info.rarity === inventorySubquestData.props.rarity);
    }
    else if (inventorySubquestData.props.location.length > 0) {
      count = BigBox_Player_Inventory.instance.getCount(player, x => x?.info.location.toLowerCase() === inventorySubquestData.props.location.toLowerCase());
    }
    else {
      count = BigBox_Player_Inventory.instance.getCount(player, x => x !== null);
    }

    if (count !== prevCount) {
      hasChanged = true;
      subquestState.count = count;
      subquestState.subquestText = inventorySubquestData.getDisplayTextWithCount(count);
    }

    if (count > prevCount) {
      this.onSubquestStateIncremented(player, subquestState);
    }

    log.info("updating subquest state for " + inventorySubquestData.props.id + " count: " + subquestState.count + " requirement: " + subquestState.countRequirement);

    return hasChanged;
  }

  updateItemCollectionSubquestState(player: Player, itemId: string, inventorySubquestData: InventorySubquestData, activeQuest: ActiveQuestData): boolean {
    if (inventorySubquestData === undefined) {
      return false;
    }

    let item = ItemContainer.localInstance.getItemDataForId(itemId);
    if (!item) {
      log.info("[Quest] Error! Item data is not defined for itemId: " + itemId);
      return false;
    }

    let hasChanged = false;
    if (inventorySubquestData.props.location.length > 0 && item.location.toLowerCase() !== inventorySubquestData.props.location.toLowerCase()) {
      return false
    }
    if (inventorySubquestData.props.itemId.length > 0) {
      hasChanged = item.id === inventorySubquestData.props.itemId;
    }
    else if (inventorySubquestData.props.itemCategory.length > 0) {
      hasChanged = item.category === inventorySubquestData.props.itemCategory;
    }
    else if (inventorySubquestData.props.rarity >= 0) {
      hasChanged = item.rarity === inventorySubquestData.props.rarity;
    }
    else {
      hasChanged = true;
    }

    if (hasChanged) {
      let subquestState = this.getSubquestState(player, inventorySubquestData, activeQuest);
      subquestState.count++;
      subquestState.subquestText = inventorySubquestData.getDisplayTextWithCount(subquestState.count);
      this.onSubquestStateIncremented(player, subquestState);
    }

    return hasChanged
  }

  updateCuratorSubquestState(player: Player, state: SubquestState) {
    let hasChanged = BigBox_Player_Inventory.instance.getCount(player, x => x?.info.id === state.itemIdsOfInterest) > 0;

    if (hasChanged) {
      state.count = state.countRequirement
    }

    return hasChanged
  }

  createNPCTalkSubquestState(player: Player, npcTalkSubquestData: NPCTalkSubquestData, activeQuest: ActiveQuestData, parameters?: hz.PersistentSerializableState) {
    if (activeQuest === undefined) return;
    let subquestState = { subquestId: npcTalkSubquestData.props.id, count: 0, countRequirement: 1, subquestText: npcTalkSubquestData.getDisplayText(), itemIdsOfInterest: "", parameters };
    activeQuest.subquestStates.push(subquestState);
  }

  createCollectionSubquestState(player: Player, collectionSubquestData: RetrievalSubquestData, activeQuest: ActiveQuestData) {
    if (activeQuest === undefined) return;
    let subquestState = { subquestId: collectionSubquestData.props.id, count: 0, countRequirement: 1, subquestText: collectionSubquestData.getDisplayText(), itemIdsOfInterest: "" };
    activeQuest.subquestStates.push(subquestState);
  }

  createLocationSubquestState(player: Player, locationSubquestData: LocationSubquestData, activeQuest: ActiveQuestData) {
    if (activeQuest === undefined) return;
    let subquestState = { subquestId: locationSubquestData.props.id, count: 0, countRequirement: 1, subquestText: locationSubquestData.getDisplayText(), itemIdsOfInterest: "" };
    activeQuest.subquestStates.push(subquestState);
  }

  createShovelSubquestState(player: Player, shovelSubquestData: ShovelSubquestData, activeQuest: ActiveQuestData) {
    if (activeQuest === undefined) return;
    let count = ShovelProgressionManager.instance.hasShovel(player, shovelSubquestData.props.shovelId) ? 1 : 0;
    let subquestState = { subquestId: shovelSubquestData.props.id, count: count, countRequirement: 1, subquestText: shovelSubquestData.getDisplayText(), itemIdsOfInterest: "" };
    activeQuest.subquestStates.push(subquestState);
  }

  createCatalogEntriesSubquestState(player: Player, subquest: CatalogEntriesSubquestData, activeQuest: ActiveQuestData) {
    if (activeQuest === undefined) return;
    let subquestState = { subquestId: subquest.props.id, count: 0, countRequirement: subquest.props.count, subquestText: subquest.getDisplayTextWithCount(0), itemIdsOfInterest: "" };
    activeQuest.subquestStates.push(subquestState);
  }

  createUpgradeShovelSubquestState(player: Player, subquest: UpgradeShovelSubquestData, activeQuest: ActiveQuestData) {
    if (activeQuest === undefined) return;
    let subquestState = { subquestId: subquest.props.id, count: 0, countRequirement: subquest.props.count, subquestText: subquest.getDisplayTextWithCount(0), itemIdsOfInterest: "" };
    activeQuest.subquestStates.push(subquestState);
  }

  createUsePotionSubquestState(player: Player, subquest: UsePotionSubquestData, activeQuest: ActiveQuestData) {
    if (activeQuest === undefined) return;
    let subquestState = { subquestId: subquest.props.id, count: 0, countRequirement: subquest.props.count, subquestText: subquest.getDisplayTextWithCount(0), itemIdsOfInterest: "" };
    activeQuest.subquestStates.push(subquestState);
  }

  createDigLuckSubquestState(player: Player, subquest: DigLuckSubquestData, activeQuest: ActiveQuestData) {
    if (activeQuest === undefined) return;
    let subquestState = { subquestId: subquest.props.id, count: 0, countRequirement: subquest.props.count, subquestText: subquest.getDisplayTextWithCount(0), itemIdsOfInterest: "" };
    activeQuest.subquestStates.push(subquestState);
  }

  createSocialDigSubquestState(player: Player, subquest: SocialDigSubquestData, activeQuest: ActiveQuestData) {
    if (activeQuest === undefined) return;
    let subquestState = { subquestId: subquest.props.id, count: 0, countRequirement: subquest.props.count, subquestText: subquest.getDisplayTextWithCount(0), itemIdsOfInterest: "" };
    activeQuest.subquestStates.push(subquestState);
  }

  createGoToDigZoneSubquestState(player: Player, subquest: GoToDigZoneSubquestData, activeQuest: ActiveQuestData, parameters?: hz.PersistentSerializableState) {
    if (activeQuest === undefined) return;
    let subquestState = { subquestId: subquest.props.id, count: 0, countRequirement: 1, subquestText: GameUtils.formatString(subquest.getDisplayText()), itemIdsOfInterest: "", parameters };
    activeQuest.subquestStates.push(subquestState);
  }

  createRegionCompleteSubquestState(player: Player, subquest: RegionCompletionSubquestData, activeQuest: ActiveQuestData) {
    if (activeQuest === undefined) {
      return;
    }
    let zone = DigZoneManager.instance.getDigZoneFromZoneId(subquest.props.zoneId);
    if (zone === undefined) {
      log.error("Error: zone is undefined for subquest zoneId " + subquest.props.zoneId);
      return;
    }
    let island = getIslandFromID(zone.props.island);
    if (island === undefined) {
      log.error("Error: island is undefined for zone island " + zone.props.island);
      return;
    }
    let count = PlayerIslandData.getDigZoneRewardAccepted(player, island, subquest.props.zoneId) ? 1 : 0;
    let subquestState = { subquestId: subquest.props.id, count: count, countRequirement: 1, subquestText: GameUtils.formatString(subquest.getDisplayText()), itemIdsOfInterest: "" };
    activeQuest.subquestStates.push(subquestState);
  }

  createBaseSubquestState(player: Player, subquestData: SubquestData<typeof SubquestData>, activeQuest: ActiveQuestData) {
    if (activeQuest === undefined) return;
    let subquestState = { subquestId: subquestData.props.id, count: 0, countRequirement: 1, subquestText: subquestData.getDisplayText(), itemIdsOfInterest: "" };
    activeQuest.subquestStates.push(subquestState);
  }

  /**
   * Validates region complete subquest state and returns true if the state has changed.
   */
  validateRegionCompleteSubquestState(player: Player, subquest: RegionCompletionSubquestData, subquestState: SubquestState) {
    let zone = DigZoneManager.instance.getDigZoneFromZoneId(subquest.props.zoneId);
    if (zone === undefined) {
      log.error("Error: zone is undefined for subquest zoneId " + subquest.props.zoneId);
      return false;
    }
    let island = getIslandFromID(zone.props.island);
    if (island === undefined) {
      log.error("Error: island is undefined for zone island " + zone.props.island);
      return false;
    }

    let count = PlayerIslandData.getDigZoneRewardAccepted(player, island, subquest.props.zoneId) ? 1 : 0;

    if (count != subquestState.count) {
      subquestState.count = count;
      return true;
    }

    return false;
  }

  private getSubquestState(player: Player, subquestData: SubquestData<typeof SubquestData>, activeQuest: ActiveQuestData): SubquestState {
    let subquestStates = activeQuest.subquestStates;
    let subquestState!: SubquestState;

    for (let i = 0; i < subquestStates.length; i++) {
      if (subquestStates[i].subquestId === subquestData.props.id) {
        subquestState = subquestStates[i];
        break;
      }
    }

    return subquestState;
  }

  private onSubquestStateIncremented(player: Player, subquestState: SubquestState) {
    let subquestData = this.subquestIdToSubquestData.get(subquestState.subquestId);
    if (subquestData === undefined) {
      return;
    }

    this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
      player: player,
      text: `Quest Updated: ${subquestData.getDisplayTextWithCount(subquestState.count)}`
    }, [player]);
  }

  private onSubquestStateChange(player: Player, activeQuest: ActiveQuestData) {
    if (activeQuest === undefined) return;
    let subquestStates = activeQuest.subquestStates;

    let incompleteSubquestState: SubquestState | undefined;

    for (let i = 0; i < subquestStates.length; i++) {
      let subquestState = subquestStates[i];
      if (subquestState.count < subquestState.countRequirement) {
        incompleteSubquestState = subquestState;
        break;
      }
    }

    if (activeQuest === this.getCurrentQuest(player)) {
      // Notify everyone (UI) that the subquest state has changed
      this.sendNetworkBroadcastEvent(QuestEvents.playerQuestsChangedForPlayer, { player: player, playerQuests: this.playerToQuestsMap.get(player)! }, [player, this.world.getServerPlayer()]);

      // Still have subquests to do
      if (incompleteSubquestState) {
        let subquestData = this.subquestIdToSubquestData.get(incompleteSubquestState.subquestId);

        log.info("incompleteSubquestState: " + incompleteSubquestState.subquestId + " navigationtarget: " + subquestData?.navigationTarget);

        if (subquestData && subquestData.navigationTargets.length > 0) {
          this.sendNetworkBroadcastEvent(NavigationArrowEvents.updateNavigationArrowEvent, { player: player, positions: subquestData.navigationTargets, questId: subquestData.props.id }, [player]);
        }
        else if (subquestData?.navigationTarget) { // legacy support for single target
          let target = {
            island: Islands.None,
            position: subquestData.navigationTarget
          }
          this.sendNetworkBroadcastEvent(NavigationArrowEvents.updateNavigationArrowEvent, { player: player, positions: [target], questId: subquestData.props.id }, [player]);
        }
        else {
          // Sending empty quest id clears the quest on the arrow
          this.sendNetworkBroadcastEvent(NavigationArrowEvents.updateNavigationArrowEvent, { player: player, positions: [], questId: "" }, [player]);
        }
      }
    }

    if (!incompleteSubquestState) {
      // Quest complete! All subquests done
      this.finishQuestForPlayer(player, activeQuest);
    }
  }

  private getAllAvailableQuests(player: Player) {
    let playerQuests = this.playerToQuestsMap.get(player)!;

    let availableQuests: string[] = this.questDataIdToUnlockedQuestDataIds.get("")!;
    log.info("quests with no prereqs: " + availableQuests);

    for (let i = 0; i < playerQuests.completedQuestIds.length; i++) {
      let unlockedQuests = this.questDataIdToUnlockedQuestDataIds.get(playerQuests.completedQuestIds[i]);
      if (unlockedQuests !== undefined) {
        availableQuests = availableQuests.concat(unlockedQuests);
      }
    }

    availableQuests = availableQuests.filter(questId => !playerQuests.completedQuestIds.includes(questId) && !playerQuests.activeQuests.some((activeQuest) => activeQuest.questId === questId));

    return availableQuests;
  }

  private constructCuratorQuest(player: Player, itemId: string, zoneId: string, questData: QuestData) {
    let playerQuests: PlayerQuests = this.playerToQuestsMap.get(player)!;
    for (let i = playerQuests.activeQuests.length - 1; i >= 0; i--) {
      if (playerQuests.activeQuests[i].questId === questData.props.id) {
        log.error("Player is already assigned a curator quest"); // should not be possible
        return;
      }
    }

    let activeQuest: ActiveQuestData = {
      questId: questData.props.id,
      questName: questData.props.name,
      currencyReward: questData.props.currencyReward,
      xpReward: questData.props.xpReward,
      gemReward: questData.props.gemReward,
      subquestStates: []
    };
    playerQuests.activeQuests.push(activeQuest);

    // Show the quest that you just started
    playerQuests.currentQuestIndex = playerQuests.activeQuests.length - 1;

    const item = ItemContainer.localInstance.getItemDataForId(itemId)!;
    const zone = DigZoneManager.instance.getDigZoneFromZoneId(zoneId)!;

    let findSubquest = {
      subquestId: 'curatorFind',
      count: 0,
      countRequirement: 1,
      subquestText: 'Find a ' + item.name + ' at ' + zone.props.displayName + ' on ' + getIslandDisplayName(item.location),
      itemIdsOfInterest: itemId
    }

    activeQuest.subquestStates.push(findSubquest);

    let returnSubquest = {
      subquestId: 'curatorReturn',
      count: 0,
      countRequirement: 1,
      subquestText: 'Return the ' + item.name + ' to Iris',
      itemIdsOfInterest: itemId
    }

    activeQuest.subquestStates.push(returnSubquest);

    GameUtils.setPlayerVariableSafe(this.world, player, QUEST_PERSISTENT_VAR, playerQuests);
    this.onSubquestStateChange(player, activeQuest);

    this.sendNetworkBroadcastEvent(QuestEvents.startQuestForPlayer, { player: player, questId: questData.props.id, playerQuests: playerQuests }, [this.world.getServerPlayer(), player]);

    questData.props.startSfx?.as(hz.AudioGizmo).play({ players: [player], fade: 0, audibilityMode: hz.AudibilityMode.AudibleTo })
  }

  public hasSubquestActive(player: Player, subquestId: string): boolean {
    let currentQuest = this.getCurrentQuest(player)!;
    if (currentQuest === undefined) return false;
    for (let i = 0; i < currentQuest.subquestStates.length; i++) {
      if (currentQuest.subquestStates[i].subquestId === subquestId) {
        return true;
      }
    }

    return false;
  }

  /**
   * Gets all subquests of all active quests for a player.
   */
  public getAllSubquestDatasForPlayer(player: Player): SubquestData<typeof SubquestData>[] {
    let subquestDatas: SubquestData<typeof SubquestData>[] = [];

    let playerQuests = this.playerToQuestsMap.get(player)!;

    for (let index = 0; index < playerQuests.activeQuests.length; index++) {
      let activeQuest = playerQuests.activeQuests[index];
      if (activeQuest === undefined) continue;
      for (let i = 0; i < activeQuest.subquestStates.length; i++) {
        let subquestData = this.subquestIdToSubquestData.get(activeQuest.subquestStates[i].subquestId);
        if (subquestData !== undefined) {
          subquestDatas.push(subquestData);
        }
      }
    }

    return subquestDatas;
  }

  public hasCompletedQuest(player: Player, questId: string): boolean {
    let playerQuests: PlayerQuests = this.playerToQuestsMap.get(player)!;
    if (playerQuests && playerQuests.completedQuestIds) {
      return playerQuests.completedQuestIds.includes(questId);
    }
    return false
  }

  public hasActiveQuest(player: Player, questId: string): boolean {
    let playerQuests: PlayerQuests = this.playerToQuestsMap.get(player)!;
    if (playerQuests === undefined) {
      log.error(`playerQuests is not defined for player ${PlayerService.getPlayerName(player)} while evaluating active quests for ${questId}`);
      return false;
    }
    return playerQuests.activeQuests.some((activeQuest) => activeQuest.questId === questId);
  }

  public getCurrentSubquestDataForPlayer(player: Player): SubquestData<typeof SubquestData> | undefined {
    let currentQuest = this.getCurrentQuest(player);
    if (currentQuest === undefined) {
      return undefined;
    }

    let currentSubquest = currentQuest.subquestStates.find((subquestState) => subquestState.count < subquestState.countRequirement);
    if (currentSubquest === undefined) {
      return undefined;
    }

    return this.subquestIdToSubquestData.get(currentSubquest.subquestId)!;
  }

  public setupNavigationArrowForPlayer(player: Player) {
    let currentQuest = this.getCurrentQuest(player);
    if (currentQuest === undefined) {
      return;
    }

    let subquestData = this.getCurrentSubquestDataForPlayer(player);
    if (subquestData && subquestData.navigationTargets.length > 0) {
      this.sendNetworkBroadcastEvent(NavigationArrowEvents.updateNavigationArrowEvent, { player: player, positions: subquestData.navigationTargets, questId: subquestData.props.id }, [player]);
    }
    else if (subquestData?.navigationTarget) { // legacy support for single target
      let target = {
        island: Islands.None,
        position: subquestData.navigationTarget
      }
      this.sendNetworkBroadcastEvent(NavigationArrowEvents.updateNavigationArrowEvent, { player: player, positions: [target], questId: subquestData.props.id }, [player]);
    } else {
      this.sendNetworkBroadcastEvent(NavigationArrowEvents.updateNavigationArrowEvent, { player: player, positions: [], questId: "" }, [player]);
    }
  }

  public getAllActiveQuestsForPlayer(player: Player): string[] {
    if (!this.playerToQuestsMap.has(player)) {
      return [];
    }

    let playerQuests: PlayerQuests = this.playerToQuestsMap.get(player)!;
    return playerQuests.activeQuests.map((activeQuest) => activeQuest.questId);
  }

  public getQuestDataFromQuestId(questId: string): QuestData | undefined {
    return this.questIdToQuestData.get(questId);
  }

  public getItemIdsOfInterestForPlayer(player: Player): string[] {
    let playerQuests = this.playerToQuestsMap.get(player);
    let itemIdsOfInterest: string[] = [];

    if (playerQuests === undefined) {
      return itemIdsOfInterest;
    }

    for (let index = 0; index < playerQuests.activeQuests.length; index++) {
      let activeQuest = playerQuests.activeQuests[index];
      if (activeQuest === undefined) continue;
      for (let i = 0; i < activeQuest.subquestStates.length; i++) {
        let subquestState = activeQuest.subquestStates[i];
        log.info("subquestState.itemIdsOfInterest: " + subquestState.itemIdsOfInterest + " for " + subquestState.subquestId);
        if (subquestState.itemIdsOfInterest !== "") {
          itemIdsOfInterest.push(subquestState.itemIdsOfInterest);
        }
      }
    }

    return itemIdsOfInterest;
  }

  private checkIfPersistentDataExists(player: Player): boolean {
    if (!SHOULD_USE_PERSISTENCE) {
      return false;
    }

    if (!player) {
      log.warn("Cannot get player data for undefined player.");
      return false;
    }

    if (player === this.world.getServerPlayer()) {
      log.warn("Cannot get player data for server player.");
      return false;
    }

    return true;
  }

  private async debug_completeQuestAndPreReqs(player: hz.Player, quest: hz.Entity | undefined) {
    if (!quest) {
      return;
    }
    const preReqQuestData = quest.getComponents(QuestData)[0];
    await this.debug_completeQuestAndPreReqs(player, preReqQuestData.props.prerequisiteQuest);
    await this.debug_completeQuest(player, preReqQuestData.props.id);
  }

  private async debug_completeQuest(player: Player, questId: string): Promise<void> {
    const DELAY = 500;
    if (!this.playerToQuestsMap.get(player)!.activeQuests.some(q => q.questId === questId)) {
      if (!this.tryStartQuestForPlayer(player, questId)) {
        return;
      }
      await GameUtils.wait(this, DELAY);
    }
    let playerQuests = this.playerToQuestsMap.get(player)!;
    let activeQuest = playerQuests.activeQuests.find(q => q.questId === questId);
    if (activeQuest === undefined) {
      return;
    }
    this.finishQuestForPlayer(player, activeQuest);
    await GameUtils.wait(this, DELAY);
  }
}
hz.Component.register(QuestManager);
