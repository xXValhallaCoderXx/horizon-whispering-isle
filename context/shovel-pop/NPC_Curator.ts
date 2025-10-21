/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_Player_Inventory } from 'BigBox_Player_Inventory';
import { DialogManager } from 'DialogManager';
import { DialogScript } from 'DialogScript';
import { DigZoneManager } from 'DigZoneManager';
import { getPlayerVariableSafe } from 'GameUtils';
import * as hz from 'horizon/core';
import { getIslandDisplayName, Islands } from 'Islands';
import { ItemContainer } from 'ItemContainer';
import { ItemData } from 'ItemData';
import { MuseumCuratorManager } from 'MuseumCuratorManager';
import { NPC } from 'NPC';
import { PlayerData } from 'PlayerData';
import { PlayerIslandData } from 'PlayerIslandData';
import { PlayerService } from 'PlayerService';
import { QuestData } from 'QuestData';
import { PlayerQuests, QUEST_PERSISTENT_VAR, QuestEvents, QuestManager } from 'QuestManager';

/**
 * Data containing class for the curator. This is where the NPC's dialog responses are stored.
 */
export class CuratorDialog {
  static hasNotOpenedGates = 'You haven\'t explored enough yet. Come back when you\'ve opened Turph\'s gate.'

  static getAssignmentResponse(itemId: string, regionId: string) : string {
    const itemData = ItemContainer.localInstance.getItemDataForId(itemId)!;
    const region = DigZoneManager.instance.getDigZoneFromZoneId(regionId)!;
    const responses = [
      `Bring me a ${itemData.name} from ${getIslandDisplayName(itemData.location)}!`,
      `I need a ${itemData.name} from ${getIslandDisplayName(itemData.location)} for the museum!`,
      `The museum needs a ${itemData.name} from ${getIslandDisplayName(itemData.location)}.`,
      `I don't have a ${itemData.name} from ${getIslandDisplayName(itemData.location)} yet. Can you help me out?`,
      `We've been looking for a ${itemData.name} from ${getIslandDisplayName(itemData.location)} for forever. Do you think you can find it?`,
      `Go to ${getIslandDisplayName(itemData.location)} and find a ${itemData.name} for the museum. We need one for display!`,
    ]

    let message = responses[Math.floor(Math.random() * responses.length)]
    if (itemData.lootZone.length > 0){
      message += ' ' + itemData.lootZone
    }
    return message + ' You can find it at ' + region.props.displayName + '.'
  }

  static missingItem(itemData: ItemData) : string {
    return `You don't have a ${itemData.name}! Keep looking.`
  }

  static successResponse(itemData: ItemData) : string {
    const responses = [
      `Great job! Just the ${itemData.name} I was looking for!`,
      `Thank you for finding the ${itemData.name}! It's going to look great in the museum!`,
      `I can't thank you enough for finding the ${itemData.name}! It's going to be a huge hit!`,
      `I can't believe you found the ${itemData.name}! I've been trying to find one for so long!`,
      `Is that really a ${itemData.name}? I've been looking for one of those for so long and now I finally have one!`,
      `What a beautiful ${itemData.name}! This is definitely going in our most prized collection...`,
      `We actually just found a massive box labelled "${itemData.name}". They're basically worthless now, but I suppose we can take one more...`,
    ]

    return responses[Math.floor(Math.random() * responses.length)];
  }

  static waitResponse(minutes: number) : string {
    return `Come back in ${minutes} minutes for a new assignment!`
  }

  static cooldownResponse(minutes: number) : string {
    if (minutes < 1) {
      return 'I don\'t have anything for you right now. Come back in a minute';
    }
    return 'I don\'t have anything for you right now. Come back in ' + Math.ceil(minutes) + ' minutes';
  }
}

/**
 * Controls the museum curator NPCs that assign item collection quests to players
 * Manages dialog interactions and quest assignment/completion
 */
class NPC_Curator extends hz.Component<typeof NPC_Curator> {
  static propsDefinition = {
    npc0: {type: hz.PropTypes.Entity}, // curator has an inverted control scheme, where one controller controls multiple npcs
    npc1: {type: hz.PropTypes.Entity},
    npc2: {type: hz.PropTypes.Entity},
    npc3: {type: hz.PropTypes.Entity},
    curatorManager: {type: hz.PropTypes.Entity},
    assignQuestDialogId: {type: hz.PropTypes.Entity},
    assignedQuestDialogBranch: {type: hz.PropTypes.Entity},
    returnItemQuestDialogId: {type: hz.PropTypes.Entity},
    waitingForQuestDialogId: {type: hz.PropTypes.Entity},
  };

  private curatorManager!: MuseumCuratorManager;
  private npc!: NPC;
  private npcs: NPC[] = [];

  start() {
    this.curatorManager = this.props.curatorManager!.getComponents<MuseumCuratorManager>(MuseumCuratorManager)[0];
    this.npc = this.props.npc0!.getComponents<NPC>(NPC)[0];

    const entities = [this.props.npc0, this.props.npc1, this.props.npc2, this.props.npc3];
    for (let i = 0; i < entities.length; i++) {
      const npc = entities[i]?.getComponents<NPC>(NPC)[0];
      if (npc) {
        this.npcs.push(npc);
        this.connectLocalEvent(npc.entity, NPC.LocalSendDialogScript, (payload) => {
          this.onDialogChosen(payload.player, payload.scriptId)
        })
      }
      else{
        break
      }
    }

    PlayerService.connectPlayerEnterWorld(this, player =>{
      if (QuestManager.IsReady()) {
        this.initDialog(player)
      }
      else {
        this.connectLocalBroadcastEvent(QuestEvents.questManagerInitialized, () => {
          this.initDialog(player)
        });
      }
    })
  }

  /**
   * Handles player dialog choices when interacting with curator NPCs
   * Routes to appropriate handlers based on the selected dialog option
   * @param player - The player who made the dialog choice
   * @param scriptId - The ID of the dialog script that was chosen
   */
  onDialogChosen(player: hz.Player, scriptId: hz.Entity) {
    if (scriptId.id === this.props.assignQuestDialogId!.id) {
      if (PlayerIslandData.getPlayerIslandData(player, Islands.BeachCamp)!.openGates.length > 0){
        this.curatorManager.assignQuest(player);

        const newDialog = this.props.assignedQuestDialogBranch!.getComponents<DialogScript>()[0];
        this.npcs.forEach(x => x.switchDialogForPlayer(player, newDialog))
      }
      else{
        DialogManager.show(this, player, {
          title: this.npc.props.name,
          text: CuratorDialog.hasNotOpenedGates,
          option1: 'Okay',
        });
      }
    }
    else if (scriptId.id === this.props.returnItemQuestDialogId!.id) {
      this.checkAssignment(player)
    }
    else if (scriptId.id === this.props.waitingForQuestDialogId!.id) {
      const minutes = PlayerData.getCuratorTime(player);
      if (minutes > 0){
        DialogManager.show(this, player, {
          title: this.npc.props.name,
          text: CuratorDialog.cooldownResponse(minutes),
          option1: "Will do!",
        });
      }
      else{
        this.onDialogChosen(player, this.props.assignQuestDialogId!)
      }
    }
  }

  /**
   * Verifies if the player has the requested item and processes quest completion
   * Removes the item from inventory and updates quest state if successful
   * @param player - The player to check for quest completion
   */
  checkAssignment(player: hz.Player) {
    const curatorQuest = this.curatorManager.props.curatorQuest!.getComponents<QuestData>()[0];
    let playerQuests: PlayerQuests = getPlayerVariableSafe<PlayerQuests>(this.world, player, QUEST_PERSISTENT_VAR)!;
    let curatorQuestState = playerQuests.activeQuests.find(q => q.questId === curatorQuest!.props.id)

    if (!curatorQuestState) {
      throw new Error("Player does not have curator quest active. This should not be possible for this dialog.");
    }

    const itemOfInterest = curatorQuestState.subquestStates[1].itemIdsOfInterest;
    const itemData = ItemContainer.localInstance.getItemDataForId(itemOfInterest)!
    let itemIndex = -1

    const inventory = BigBox_Player_Inventory.instance.getPlayerInventory(player)!
    for (let index = 0; index < inventory.length; index++) {
      const item = inventory[index];
      if (item?.info.id === itemOfInterest) {
        itemIndex = index;
        break;
      }
    }

    if (itemIndex === -1) {
      DialogManager.show(this, player, {
        title: this.npc.props.name,
        text: CuratorDialog.missingItem(itemData),
        option1: "Okay, sorry",
      });

      return // ----------------------------------------------------------------------------------------------------------
    }

    BigBox_Player_Inventory.instance.removeItem(player, itemIndex);
    this.sendLocalBroadcastEvent(QuestEvents.requestFinishSubquestForPlayer, { player, questId: curatorQuestState.subquestStates[1].subquestId });
    PlayerData.setCuratorTime(player, this.curatorManager.props.refreshTimeMins)

    DialogManager.show(this, player, {
      title: this.npc.props.name,
      text: CuratorDialog.successResponse(itemData),
      option1: "No problem",
    }, (player) => {
      DialogManager.show(this, player, {
        title: this.npc.props.name,
        text: CuratorDialog.waitResponse(this.curatorManager.props.refreshTimeMins),
        option1: "Will do!",
    }, (player) => {
      const newDialog = this.props.waitingForQuestDialogId!.getComponents<DialogScript>()[0];
      this.npcs.forEach(x => x.switchDialogForPlayer(player, newDialog));
    })});
  }

  /**
   * Sets up the appropriate dialog for a player based on their quest status
   * Determines which dialog branch to show based on active quests and cooldown time
   * @param player - The player to initialize dialog for
   */
  initDialog(player: hz.Player) {
    let activeQuests = QuestManager.instance.getAllActiveQuestsForPlayer(player);
    const curatorQuest = this.curatorManager.props.curatorQuest!.getComponents<QuestData>()[0];

    // already assigned the quest: set the dialog to 'have you found the item yet?'
    if (activeQuests.includes(curatorQuest.props.id)){
      const newDialog = this.props.assignedQuestDialogBranch!.getComponents<DialogScript>()[0];
      this.npcs.forEach(x => x.switchDialogForPlayer(player, newDialog));
    }else{
      // no quest assigned: check cooldown and set dialog accordingly
      const timeRemaining = PlayerData.getCuratorTime(player);
      if (timeRemaining <= 0){
        this.npcs.forEach(x => x.switchDialogForPlayer(player, undefined)) // default dialog: 'can you find an item for me?'
      }
      else{
        const newDialog = this.props.waitingForQuestDialogId!.getComponents<DialogScript>()[0];
        this.npcs.forEach(x => x.switchDialogForPlayer(player, newDialog)); // cooldown dialog: 'come back in x minutes'
      }
    }
  }
}
hz.Component.register(NPC_Curator);
