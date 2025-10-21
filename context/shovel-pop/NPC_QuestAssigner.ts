/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { DialogScript } from 'DialogScript';
import * as hz from 'horizon/core';
import { NPC } from 'NPC';
import { PlayerService } from 'PlayerService';
import { QuestData } from 'QuestData';
import { QuestEvents, QuestManager } from 'QuestManager';
import { NPCTalkSubquestData } from 'SubquestData';

// todo consolidate this with the npc collection quest
class NPC_QuestAssigner extends hz.Component<typeof NPC_QuestAssigner> {
  static propsDefinition = {
    npc: { type: hz.PropTypes.Entity },
    prereqQuest: { type: hz.PropTypes.Entity }, // quest that must be completed before the npc will assign a quest
    preQuestDialog: { type: hz.PropTypes.Entity }, // dialog that plays if the player has not completed the
    assignedQuest: { type: hz.PropTypes.Entity }, // quest that the npc first assigns
    assignedQuestDialog: { type: hz.PropTypes.Entity }, // dialog that plays after npc first assigns a quest ('you haven't finished the quest yet!')
    questCompleteDialog: { type: hz.PropTypes.Entity }, // dialog after you complete assigned quest ('you finished the quest!')
  };

  private npc!: NPC
  private assignedQuest!: QuestData

  start() {
    this.npc = this.props.npc!.getComponents<NPC>()[0];
    this.assignedQuest = this.props.assignedQuest!.getComponents<QuestData>()[0];

    PlayerService.connectPlayerEnterWorld(this, (player) => {
      this.async.setTimeout(() => {
        if (!PlayerService.isConnected(player)) {
          return;
        }
        if (QuestManager.IsReady()) {
          this.initializeDialogForPlayer(player);
        }
        else {
          const sub = this.connectLocalBroadcastEvent(QuestEvents.questManagerInitialized, () => {
            this.initializeDialogForPlayer(player);
            sub.disconnect();
          })
        }
      }, 2000);  // Wait 2 seconds to ensure player quest data has been loaded.
    })

    this.connectNetworkBroadcastEvent(QuestEvents.startQuestForPlayer, (payload) => this.onQuestStarted(payload.player, payload.questId))
    this.connectNetworkBroadcastEvent(QuestEvents.finishQuestForPlayer, (payload) => this.onQuestCompleted(payload.player, payload.questId))
  }

  initializeDialogForPlayer(player: hz.Player) {
    const prerequisiteQuest = this.props.prereqQuest?.getComponents<QuestData>()[0]

    if (QuestManager.instance.hasCompletedQuest(player, this.assignedQuest.props.id)) {
      this.onQuestCompleted(player, this.assignedQuest.props.id);
    }
    else if (prerequisiteQuest && !QuestManager.instance.hasCompletedQuest(player, prerequisiteQuest.props.id)
      && !QuestManager.instance.hasActiveQuest(player, prerequisiteQuest.props.id)) {
      const preReqDialog = this.props.preQuestDialog?.getComponents<DialogScript>()[0]
      this.npc.switchDialogForPlayer(player, preReqDialog)
    }
  }

  onQuestStarted(player: hz.Player, questId: string): void {
    if (questId === this.assignedQuest.props.id) { // started the initial quest, change dialog to 'you haven't finished the quest yet!!'
      const newDialog = this.props.assignedQuestDialog!.getComponents<DialogScript>()[0];
      this.npc.switchDialogForPlayer(player, newDialog);
      this.initializeScriptData(newDialog);
      return
    }

    const prerequisiteQuest = this.props.prereqQuest?.getComponents<QuestData>()[0]
    if (prerequisiteQuest && (prerequisiteQuest.props.id === questId || QuestManager.instance.hasActiveQuest(player, prerequisiteQuest.props.id))) {
      this.npc.switchDialogForPlayer(player, undefined)
    }
  }

  onQuestCompleted(player: hz.Player, questId: string): void {
    if (questId === this.assignedQuest.props.id) { // completed the initial quest, change dialog to 'you finished the quest!'
      const newDialog = this.props.questCompleteDialog!.getComponents<DialogScript>()[0];
      this.npc.switchDialogForPlayer(player, newDialog);
      this.initializeScriptData(newDialog);
    }
  }

  initializeScriptData(dialog: DialogScript) {
    let dialogs = dialog.getAllDialogsInTree();
    for (let i = 0; i < dialogs.length; i++) {
      let subquestComplete = dialogs[i].subquestComplete;
      if (subquestComplete === undefined) {
        continue;
      }

      subquestComplete.navigationTarget = this.npc.entity.position.get();
      this.sendNetworkBroadcastEvent(QuestEvents.navigationTargetUpdatedForQuest, {
        questId: subquestComplete.props.id,
        position: subquestComplete.navigationTarget
      }, [this.world.getServerPlayer()]);

      if (subquestComplete instanceof NPCTalkSubquestData) {
        subquestComplete.setNpcName(this.npc.props.name);
      }
    }
  }
}
hz.Component.register(NPC_QuestAssigner);
