/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_Player_Inventory } from 'BigBox_Player_Inventory';
import { Debug } from 'Debug';
import { DigManager } from 'DigManager';
import { DigMinigame } from 'DigMinigame';
import { DigZone } from 'DigZone';
import { HUDElementType } from 'Enums';
import { Events } from 'Events';
import * as hz from 'horizon/core';
import { OverlayId } from 'OverlayId';
import { PlayerData } from 'PlayerData';
import { PlayerInventoryManager } from 'PlayerInventoryManager';
import { QuestData } from 'QuestData';
import { QuestEvents, QuestManager } from 'QuestManager';
import { ShovelProgressionManager } from 'ShovelProgressionManager';
import { NotificationControlValues, TutorialNotificationManager } from 'TutorialNotificationManager';

export enum TutorialProgress {
  NONE,
  TALKED_TO_DOUG,
  COMPLETED_MINIGAME,
  BEGIN_LOCATION,
  VISITED_LOCATION,
  TUTORIAL_SHOVEL,
  ADVANCED_REGION,
  COMPLETED_ALL,
}

class TutorialManager extends hz.Component<typeof TutorialManager> {
  static propsDefinition = {
    firstDigQuestId: { type: hz.PropTypes.Entity },
    toyShovelPurchaseId: { type: hz.PropTypes.Entity },
    shinySpotQuestId: { type: hz.PropTypes.Entity },
    locationTutorial: { type: hz.PropTypes.Entity }, // teaches player to go to regions to get specific items
    locationTrigger: { type: hz.PropTypes.Entity },
    advancedRegionTrigger: { type: hz.PropTypes.Entity },
    postTutorialQuest: { type: hz.PropTypes.Entity },
    multipleQuestsQuest: { type: hz.PropTypes.Entity },
  };

  private notifiedOpenedShovelInventory = new Set<hz.Player>()
  private notifiedFirstDig = new Set<hz.Player>()
  private notfiedChangedQuestIndex = new Set<hz.Player>()

  private firstDigQuestId!: QuestData
  private purchaseShovel!: QuestData
  private shinySpotQuestId!: QuestData
  private locationTutorial!: QuestData
  private multipleQuestsQuestId!: QuestData

  private onShinySpotForFirstTime = new Set<hz.Player>()

  start() {
    PlayerData.init(this.world);

    this.firstDigQuestId = this.props.firstDigQuestId!.getComponents<QuestData>()[0]
    this.purchaseShovel = this.props.toyShovelPurchaseId!.getComponents<QuestData>()[0]
    this.shinySpotQuestId = this.props.shinySpotQuestId!.getComponents<QuestData>()[0]
    this.locationTutorial = this.props.locationTutorial!.getComponents<QuestData>()[0]
    this.multipleQuestsQuestId = this.props.multipleQuestsQuest!.getComponents<QuestData>()[0]

    this.connectLocalBroadcastEvent(PlayerInventoryManager.onPlayerLoadingComplete, (payload) => {
      const player = payload.player

      // Tutorial check
      if (PlayerData.getTutorialComplete(player) === TutorialProgress.NONE) {
        this.sendLocalBroadcastEvent(TutorialNotificationManager.broadcastNotification, {
          player: player,
          message: 'Your current quest is displayed here',
          context: 'Tutorial',
          minimumTime: 1,
          overlayId: OverlayId.QUEST,
          showHUDElement: HUDElementType.None,
        })

        this.sendLocalBroadcastEvent(TutorialNotificationManager.broadcastNotification, {
          player: player,
          message: 'The arrow points to your next quest goal',
          context: 'Tutorial',
          minimumTime: 1,
          overlayId: OverlayId.ARROW,
          showHUDElement: HUDElementType.None,
        })

        this.sendLocalBroadcastEvent(TutorialNotificationManager.broadcastNotification, {
          player: player,
          message: 'Complete your current quest!',
          context: 'Tutorial',
          minimumTime: 1,
          overlayId: OverlayId.QUEST,
          showHUDElement: HUDElementType.None,
        })
      }
    })

    this.connectNetworkBroadcastEvent(QuestEvents.startQuestForPlayer, (payload) => {
      if (payload.questId === this.locationTutorial.props.id
        && PlayerData.getTutorialComplete(payload.player) < TutorialProgress.BEGIN_LOCATION) { // started location tutorial
        PlayerData.setTutorialComplete(payload.player, TutorialProgress.BEGIN_LOCATION)
      }
      else if (payload.questId === this.shinySpotQuestId.props.id) {
        if (PlayerData.getTutorialComplete(payload.player) < TutorialProgress.COMPLETED_MINIGAME){
            this.sendLocalBroadcastEvent(TutorialNotificationManager.broadcastNotification, {
              player: payload.player,
              message: 'Find a Shiny Spot to dig up an item!',
              context: 'Doug Dig',
              minimumTime: 1,
              overlayId: OverlayId.NONE,
              showHUDElement: HUDElementType.None,
          })
        }
        else{ // Have already experienced the minigame tutorial, skip this quest
          this.sendLocalBroadcastEvent(QuestEvents.requestFinishSubquestForPlayer, { player: payload.player, questId: 'subquest_shinyspot' })
        }
      }
      else if (payload.questId === this.firstDigQuestId.props.id
        && this.onShinySpotForFirstTime.has(payload.player) // Needed to prevent softlock if exiting the game before first dig
        && PlayerData.getTutorialComplete(payload.player) < TutorialProgress.COMPLETED_MINIGAME
        && !this.notifiedFirstDig.has(payload.player)) {
        this.notifiedFirstDig.add(payload.player)
        DigManager.instance?.skipShinyCheck(payload.player, true);

        this.sendLocalBroadcastEvent(TutorialNotificationManager.broadcastNotification, {
          player: payload.player,
          message: 'Hold the dig button while standing on a Shiny Spot to dig up an item!',
          context: 'Shiny Spot',
          minimumTime: NotificationControlValues.UNSKIPPABLE,
          overlayId: OverlayId.ACTION,
          showHUDElement: HUDElementType.DigAction,
        })
      }
      else if (payload.questId === this.multipleQuestsQuestId.props.id && PlayerData.getTutorialComplete(payload.player) < TutorialProgress.COMPLETED_ALL) {
        PlayerData.setTutorialComplete(payload.player, TutorialProgress.COMPLETED_ALL)
        this.sendLocalBroadcastEvent(TutorialNotificationManager.broadcastNotification, {
          player: payload.player,
          message: 'Treasure Tasks have been added to your Quest Log!',
          context: 'Tutorial',
          minimumTime: 1,
          overlayId: OverlayId.QUEST,
          showHUDElement: HUDElementType.Quest,
          onCleared: (player) => this.notfiedChangedQuestIndex.add(player)
        })

        this.sendLocalBroadcastEvent(TutorialNotificationManager.broadcastNotification, {
          player: payload.player,
          message: 'Now that you have multiple quests, you can swap between them using the arrows.',
          context: 'Tutorial',
          minimumTime: NotificationControlValues.UNSKIPPABLE,
          overlayId: OverlayId.MULTIPLE_QUESTS,
          showHUDElement: HUDElementType.Quest,
        })
      }
    })

    this.connectNetworkBroadcastEvent(QuestEvents.finishQuestForPlayer, (payload) => {
      if (payload.questId === this.purchaseShovel.props.id) {
        this.sendLocalBroadcastEvent(TutorialNotificationManager.broadcastNotification, {
          player: payload.player,
          message: 'And that\'s the basics: Dig, Sell, and Upgrade your Shovel!',
          context: 'Doug Dig',
          minimumTime: 1,
          overlayId: OverlayId.NONE,
          showHUDElement: HUDElementType.None,
        })

        this.sendLocalBroadcastEvent(TutorialNotificationManager.broadcastNotification, {
          player: payload.player,
          message: '...but Shoveler, before you go I wanted to show you something. Walk to the lighthouse and look across the sea.',
          context: 'Doug Dig',
          minimumTime: 1,
          overlayId: OverlayId.NONE,
          showHUDElement: HUDElementType.None,
        })
      }
    })

    this.connectNetworkBroadcastEvent(Events.shinySpotTriggerEnter, (payload) => {
      this.onShinySpotForFirstTime.add(payload.player)

      if (PlayerData.getTutorialComplete(payload.player) < TutorialProgress.COMPLETED_MINIGAME
        && !this.notifiedFirstDig.has(payload.player)) {
        this.notifiedFirstDig.add(payload.player)
        DigManager.instance?.skipShinyCheck(payload.player, true);

        this.sendLocalBroadcastEvent(TutorialNotificationManager.broadcastNotification, {
          player: payload.player,
          message: 'Hold the dig button while standing on a Shiny Spot to dig up an item!',
          context: 'Shiny Spot',
          minimumTime: NotificationControlValues.UNSKIPPABLE,
          overlayId: OverlayId.ACTION,
          showHUDElement: HUDElementType.DigAction,
        })
      }
    });

    this.connectCodeBlockEvent(this.props.advancedRegionTrigger!, hz.CodeBlockEvents.OnPlayerEnterTrigger, (player) => {
      const progress = PlayerData.getTutorialComplete(player)
      if (QuestManager.instance.hasActiveQuest(player, 'complete_coastalcove') && progress < TutorialProgress.ADVANCED_REGION) {
        const equippedShovel = ShovelProgressionManager.instance.getShovelDataForPlayer(player)!
        const shovelPower = ShovelProgressionManager.instance.getShovelLevel(player, equippedShovel.id) + 1
        const regionLevel = this.props.advancedRegionTrigger!.getComponents(DigZone)[0].props.recommendedLevel
        const beaverName = 'Floyd'; // Name of the beaver

        if (shovelPower < regionLevel) {
          this.sendLocalBroadcastEvent(TutorialNotificationManager.broadcastNotification, {
            player: player,
            message: 'Ah, this Region\'s Stars are higher than your current Shovel...',
            context: beaverName,
            minimumTime: 1,
            overlayId: OverlayId.REGION_LEVEL,
            showHUDElement: HUDElementType.None,
          })

          const desiredGemCount = 9
          const delta = desiredGemCount - PlayerData.getGems(player)

          if (delta > 0) {
            this.sendLocalBroadcastEvent(TutorialNotificationManager.broadcastNotification, {
              player: player,
              message: 'Fine! Take some Gems to Upgrade your Shovel.',
              context: beaverName,
              minimumTime: 1,
              overlayId: OverlayId.GEM_HUD,
              showHUDElement: HUDElementType.None,
              onCleared: (player) => {
                PlayerData.addGems(player, delta, true)
                this.notifiedOpenedShovelInventory.add(player)
              }
            })
          }
          else {
            this.notifiedOpenedShovelInventory.add(player)
          }

          this.sendLocalBroadcastEvent(TutorialNotificationManager.broadcastNotification, {
            player: player,
            message: 'Let me show you, open your Shovel Inventory.',
            context: beaverName,
            minimumTime: NotificationControlValues.UNSKIPPABLE,
            overlayId: OverlayId.SHOVEL_INVENTORY,
            showHUDElement: HUDElementType.None,
          })

          this.sendLocalBroadcastEvent(TutorialNotificationManager.broadcastNotification, {
            player: player,
            message: 'This is where you can upgrade your Shovel.',
            context: beaverName,
            minimumTime: 1,
            overlayId: OverlayId.SHOVEL_UPGRADE,
            showHUDElement: HUDElementType.None,
          })

          this.sendLocalBroadcastEvent(TutorialNotificationManager.broadcastNotification, {
            player: player,
            message: 'Shovels with more Stars find rarer items!',
            context: beaverName,
            minimumTime: 1,
            overlayId: OverlayId.SHOVEL_LEVEL,
            showHUDElement: HUDElementType.None,
          })

          this.sendLocalBroadcastEvent(TutorialNotificationManager.broadcastNotification, {
            player: player,
            message: 'Collect all items in a Region to get a big reward of Gems to Upgrade your Shovel!',
            context: beaverName,
            minimumTime: 1,
            overlayId: OverlayId.NONE,
            showHUDElement: HUDElementType.None,
          })

          this.sendLocalBroadcastEvent(TutorialNotificationManager.broadcastNotification, {
            player: player,
            message: '...and tell me if you find any Aliens!',
            context: beaverName,
            minimumTime: 1,
            overlayId: OverlayId.NONE,
            showHUDElement: HUDElementType.None,
          })

          PlayerData.setTutorialComplete(player, TutorialProgress.ADVANCED_REGION)
        }
      }
    })

    // Check for players entering this area and see if they are doing the region quest
    this.connectCodeBlockEvent(this.props.locationTrigger!, hz.CodeBlockEvents.OnPlayerEnterTrigger, (player) => {
      if (PlayerData.getTutorialComplete(player) === TutorialProgress.BEGIN_LOCATION) {
        this.sendLocalBroadcastEvent(TutorialNotificationManager.broadcastNotification, {
          player: player,
          message: 'Certain regions contain items that can only be found there.',
          context: 'Chet Dig',
          minimumTime: 1,
          overlayId: OverlayId.REGION,
          showHUDElement: HUDElementType.None,
        })

        this.sendLocalBroadcastEvent(TutorialNotificationManager.broadcastNotification, {
          player: player,
          message: 'Dig up Green Shiny Spots around Lake House to find my Bowl of Os!',
          context: 'Chet Dig',
          minimumTime: 1,
          overlayId: OverlayId.REGION,
          showHUDElement: HUDElementType.None,
        })
        PlayerData.setTutorialComplete(player, TutorialProgress.VISITED_LOCATION)
        PlayerData.startPotionSuggestionCooldown(player);
      }
    })

    // Check for players opening the shovel inventory and see if they have the shovel inventory notification
    this.connectNetworkBroadcastEvent(BigBox_Player_Inventory.requestInventoryData, (payload) => {
      if (this.notifiedOpenedShovelInventory.has(payload.player)) {
        this.notifiedOpenedShovelInventory.delete(payload.player)
        this.sendLocalBroadcastEvent(TutorialNotificationManager.forceClearNotification, { player: payload.player })
      }
    })

    this.connectNetworkBroadcastEvent(DigMinigame.minigameStartedEvent, (payload) => {
      if (this.notifiedFirstDig.has(payload.player)) {
        this.notifiedFirstDig.delete(payload.player)
        DigManager.instance?.skipShinyCheck(payload.player, false);
        this.sendLocalBroadcastEvent(TutorialNotificationManager.forceClearNotification, { player: payload.player })
      }
    })

    this.connectNetworkBroadcastEvent(QuestEvents.requestCurrentQuestIndexChangedForPlayer, (payload) => {
      if (this.notfiedChangedQuestIndex.has(payload.player)) {
        this.notfiedChangedQuestIndex.delete(payload.player)
        this.sendLocalBroadcastEvent(TutorialNotificationManager.forceClearNotification, { player: payload.player })
      }
    })

    Debug.addCommand("Tutorial/Skip Tutorial", (player) => PlayerData.setTutorialComplete(player, TutorialProgress.COMPLETED_ALL));
  }
}
hz.Component.register(TutorialManager);
