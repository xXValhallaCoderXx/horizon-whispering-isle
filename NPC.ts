
import { DialogContainer } from 'Dialog_UI';
import { DialogScript } from 'DialogScript';
import { EventsService } from 'constants';
import * as hz from 'horizon/core';
import { AudioGizmo, AudibilityMode, } from 'horizon/core';
import { NpcManager } from './NpcManager';
import { QuestLog, TUTORIAL_QUEST_STAGES, TUTORIAL_QUEST_KEY } from 'TutorialQuestDAO';
import { PlayerStateService } from 'PlayerStateService';

export class DialogEvents {
  public static requestDialog = new hz.NetworkEvent<{ player: hz.Player, key: number[] }>('sendDialogTreeKey'); // send the key to the dialog script to get the dialog tree
  public static sendDialogScript = new hz.NetworkEvent<{ container?: DialogContainer }>('sendDialogScript');
  public static onEnterTalkableProximity = new hz.NetworkEvent<{ npc: hz.Entity }>('onEnterNpcTrigger')
}

export class NPC extends hz.Component<typeof NPC> {
  static propsDefinition = {
    name: { type: hz.PropTypes.String }, // the human-readable name of the NPC
    proximityTrigger: { type: hz.PropTypes.Entity }, // trigger player enters to make this the NPC we are interacting with
    dialogScript: { type: hz.PropTypes.Entity }, // first entity in the list of dialog scripts
    questAcceptedSound: { type: hz.PropTypes.Entity },
    npcManager: { type: hz.PropTypes.Entity, default: undefined },
    questManager: { type: hz.PropTypes.Entity },
  };

  private scriptData?: DialogScript;

  start() {
    this.scriptData = this.props.dialogScript?.getComponents<DialogScript>()[0]
    this.connectCodeBlockEvent(this.props.proximityTrigger!, hz.CodeBlockEvents.OnPlayerEnterTrigger, (player: hz.Player) => this.onPlayerEnterTrigger(player))
    this.connectCodeBlockEvent(this.props.proximityTrigger!, hz.CodeBlockEvents.OnPlayerExitTrigger, (player: hz.Player) => { this.onPlayerExitTrigger(player) })
    this.connectNetworkEvent(this.entity, DialogEvents.requestDialog, (payload) => this.onOptionReceived(payload.player, payload.key))
  }

  private onPlayerEnterTrigger(player: hz.Player) {
    console.log(`NPC: Player ${player.name.get()} entered proximity of NPC ${this.entity.name.get()}`);
    this.sendNetworkBroadcastEvent(DialogEvents.onEnterTalkableProximity, { npc: this.entity }, [player])
    // Do not hard-stop loop here; NpcManager gates by dialog and quest state
  }

  private onPlayerExitTrigger(player: hz.Player) {
    console.log(`NPC: Player ${player.name.get()} exited proximity of NPC ${this.entity.name.get()}`);
    // No explicit start; NpcManager recomputes based on eligible players
  }



  private onOptionReceived(player: hz.Player, key: number[]) {

    if (!PlayerStateService.instance) {
      console.error(`[NPC] PlayerStateService instance not available.`);
      return;
    }

    // 1. Get the player's quest DAO
    const questDAO = PlayerStateService.instance.getTutorialDAO(player);
    if (!questDAO) {
      console.error(`[NPC] Could not get QuestDAO for player ${player.name.get()}`);
      return;
    }

    // 2. Get the specific quest log and map its step to a Stage string
    const questLog = questDAO.getQuestLog(TUTORIAL_QUEST_KEY);
    const stage = this.getStageStringFromLog(questLog);

    // 3. Get the correct dialog based on the player's persistent state
    const dialog = this.scriptData?.getDialogFromTreeForStage(stage, key);

    console.log(`[NPC] Dialog for ${player.name.get()} at stage ${stage}:`, dialog ? 'Found' : 'Null (dialog closed)');

    // 4. If dialog is null, it means the player closed the dialog tree
    //    Handle quest actions based on current stage
    if (!dialog) {
      this.handleQuestAction(player, questLog, stage);
    }

    if (dialog) {
      dialog.title = this.props.name;
    }

    // Inform NpcManager about dialog state for gating animations/sounds
    const mgr = this.getNpcManager();
    if (mgr && (mgr as any)['setDialogOpen']) {
      try { (mgr as any).setDialogOpen(player, !!dialog); } catch { /* ignore */ }
    }
    this.sendNetworkBroadcastEvent(DialogEvents.sendDialogScript, { container: dialog }, [player]);
  }

  /**
   * Converts the player's persistent quest log into a stage string
   * that the DialogScript can understand.
   */
  private getStageStringFromLog(log: QuestLog): TUTORIAL_QUEST_STAGES {
    switch (log.status) {
      case 'Completed':
        return TUTORIAL_QUEST_STAGES.STAGE_COMPLETE;

      case 'InProgress':
        // Map the numerical step to our stage strings
        switch (log.currentStepIndex) {
          case 1: return TUTORIAL_QUEST_STAGES.STAGE_STEP_1_COLLECT;
          case 2: return TUTORIAL_QUEST_STAGES.STAGE_STEP_2_RETURN_COCONUTS;
          case 3: return TUTORIAL_QUEST_STAGES.STAGE_STEP_3_KILL;
          case 4: return TUTORIAL_QUEST_STAGES.STAGE_STEP_4_RETURN_MEAT;
          case 5: return TUTORIAL_QUEST_STAGES.STAGE_STEP_5_COLLECT;
          case 6: return TUTORIAL_QUEST_STAGES.STAGE_STEP_6_RETURN_LOGS;
          default:
            // Failsafe, should not happen if logic is correct
            console.warn(`[NPC] Player is InProgress on quest but has unknown step: ${log.currentStepIndex}`);
            return TUTORIAL_QUEST_STAGES.STAGE_NOT_STARTED;
        }

      case 'NotStarted':
      default:
        return TUTORIAL_QUEST_STAGES.STAGE_NOT_STARTED;
    }
  }

  /**
   * Performs the correct quest action (start, advance, complete)
   * when the player closes a dialog with this NPC.
   */
  private handleQuestAction(player: hz.Player, log: QuestLog, currentStage: TUTORIAL_QUEST_STAGES) {
    const tutorialDao = PlayerStateService.instance.getTutorialDAO(player);

    if (!tutorialDao) {
      console.error(`[NPC] Could not get QuestDAO for player ${player.name.get()}`);
      return;
    }

    // Use a switch on the CURRENT step to decide the NEXT action.
    switch (currentStage) {
      case TUTORIAL_QUEST_STAGES.STAGE_NOT_STARTED: // Player was "NotStarted" and just accepted the quest
        // Player just accepted the quest
        console.log(`[NPC] Starting quest '${TUTORIAL_QUEST_KEY}' for ${player.name.get()}`);
        this.playQuestAcceptedSound(player);

        // FIRE the QuestStarted event so QuestManager can spawn bag, etc.
        this.sendLocalBroadcastEvent(EventsService.QuestEvents.QuestStarted, {
          player,
          questId: TUTORIAL_QUEST_KEY
        });
        break;

      case TUTORIAL_QUEST_STAGES.STAGE_STEP_1_COLLECT:
        // Player is currently collecting coconuts, they're just chatting
        console.log(`[NPC] Player ${player.name.get()} is still on step 1 (collecting coconuts)`);
        break;

      case TUTORIAL_QUEST_STAGES.STAGE_STEP_2_RETURN_COCONUTS:
        // Player is returning coconuts - manually advance and update HUD
        console.log(`[NPC] Player ${player.name.get()} turned in coconuts`);
        this.playQuestAcceptedSound(player);

        // Update the step in DAO
        tutorialDao.updateQuestStep(TUTORIAL_QUEST_KEY, 3);
        this.sendLocalBroadcastEvent(EventsService.QuestEvents.RefreshQuestHUD, {
          player,
          questId: TUTORIAL_QUEST_KEY
        });
        break;

      case TUTORIAL_QUEST_STAGES.STAGE_STEP_3_KILL:
        // Player is currently killing chickens, they're just chatting
        console.log(`[NPC] Player ${player.name.get()} is still on step 3 (killing chickens)`);
        break;

      case TUTORIAL_QUEST_STAGES.STAGE_STEP_4_RETURN_MEAT:
        // Player is returning meat
        console.log(`[NPC] Player ${player.name.get()} turned in meat`);
        this.playQuestAcceptedSound(player);

        // Update the step in DAO
        tutorialDao.updateQuestStep(TUTORIAL_QUEST_KEY, 5);

        // Tell QuestManager to refresh the HUD
        this.sendLocalBroadcastEvent(EventsService.QuestEvents.RefreshQuestHUD, {
          player,
          questId: TUTORIAL_QUEST_KEY
        });
        break;

      case TUTORIAL_QUEST_STAGES.STAGE_STEP_5_COLLECT:
        // Player is currently collecting logs, they're just chatting
        console.log(`[NPC] Player ${player.name.get()} is still on step 5 (collecting logs)`);
        break;

      case TUTORIAL_QUEST_STAGES.STAGE_STEP_6_RETURN_LOGS:
        // Player is returning logs and completing the quest
        console.log(`[NPC] Player ${player.name.get()} turned in logs, completing quest`);
        this.playQuestAcceptedSound(player);

        tutorialDao.completeQuest(TUTORIAL_QUEST_KEY);
        tutorialDao.setTutorialCompleted(true);

        this.sendLocalBroadcastEvent(EventsService.QuestEvents.QuestCompleted, {
          player,
          questId: TUTORIAL_QUEST_KEY
        });
        this.world.ui.showPopupForPlayer(player, "Lets get ota haere!", 5);
        break;

      case TUTORIAL_QUEST_STAGES.STAGE_COMPLETE:
        // Quest is already done, just chatting
        console.log(`[NPC] Player ${player.name.get()} has already completed the quest`);
        break;

      default:
        console.warn(`[NPC] Unknown stage: ${currentStage} for player ${player.name.get()}`);
        break;
    }
  }



  private playQuestAcceptedSound(player: hz.Player) {
    const soundGizmo = this.props.questAcceptedSound?.as(AudioGizmo);
    const options = {
      fade: 0,
      players: [player],
      audibilityMode: AudibilityMode.AudibleTo,
    };
    soundGizmo && soundGizmo.play(options);
  }

  // Resolve NpcManager from prop or nearby entities (parent subtree)
  private getNpcManager(): NpcManager | undefined {
    // Direct link via prop
    const linked = this.props.npcManager?.getComponents<NpcManager>(NpcManager)[0];
    if (linked) return linked;
    // Same entity
    const same = this.entity.getComponents<NpcManager>(NpcManager)[0];
    if (same) return same;
    // Search parent subtree for a manager (siblings/children) with small depth limit
    const parent = this.entity.parent.get();
    if (!parent) return undefined;
    return this.findNpcManagerInTree(parent, 2);
  }

  private findNpcManagerInTree(node: hz.Entity, depth: number): NpcManager | undefined {
    if (depth < 0) return undefined;
    try {
      // Check on this node
      const mgrHere = node.getComponents<NpcManager>(NpcManager)[0];
      if (mgrHere) return mgrHere;
      // Recurse children
      const kids = node.children.get() || [];
      for (const child of kids) {
        const found = this.findNpcManagerInTree(child, depth - 1);
        if (found) return found;
      }
    } catch { }
    return undefined;
  }

}
hz.Component.register(NPC);
