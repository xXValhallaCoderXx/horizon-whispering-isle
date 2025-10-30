import { ITEM_TYPES } from "constants";
import * as hz from "horizon/core";


export const TUTORIAL_QUEST_KEY = "tutorial_quest";
export const TUTORIAL_QUEST_STATE_KEY = `player:tutorial_quest_state`;

export interface QuestStepLog {
  have: number;
  need: number;
  done: boolean;
}

export enum QuestStatus {
  NotStarted = 'NotStarted',
  InProgress = 'InProgress',
  Completed = 'Completed',
}



export enum QuestMessageDisplay {
  None = 'none',           // Don't show any message
  Popup = 'popup',         // Use showPopupForPlayer
  InfoPanel = 'infopanel', // Use showInfoPanel (more detailed)
}

export interface QuestLog {
  questId: string;
  status: "InProgress" | "Completed" | "NotStarted";
  steps: Record<string, QuestStepLog>;
  currentStepIndex: number;
  startedAt: number;
  completedAt: number;
  objectives: Record<string, ObjectiveProgress>;
}

export interface ObjectiveProgress {
  objectiveId: string;
  currentCount: number;
  isCompleted: boolean;
}

export enum TUTORIAL_QUEST_STAGES {
  STAGE_NOT_STARTED = "NotStarted",
  STAGE_STEP_1_COLLECT_BAG = "Step_1_Collect_Bag",
  STAGE_STEP_2_COLLECT_COCONUTS = "Step_2_Collect_Coconuts",
  STAGE_STEP_3_RETURN_COCONUTS = "Step_3_Return_Coconuts",
  STAGE_STEP_4_KILL_CHICKENS = "Step_4_Kill_Chickens",
  STAGE_STEP_5_RETURN_MEAT = "Step_5_Return_Meat",
  STAGE_STEP_6_COLLECT_LOGS = "Step_6_Collect_Logs",
  STAGE_STEP_7_RETURN_LOGS = "Step_7_Return_Logs",
  STAGE_COMPLETE = "Complete",
}

export enum QuestStageAction {
  NONE = "none",
  START_QUEST = "start",
  ADVANCE_QUEST = "advance",
  COMPLETE_QUEST = "complete"
}

export interface StageObjective {
  objectiveId: string;      // e.g., 'collect_coconuts'
  itemType: string;         // e.g., 'coconut', 'chicken', 'wood'
  targetCount: number;      // How many needed
  description: string;      // UI display text
}

export interface QuestStageConfig {
  stage: TUTORIAL_QUEST_STAGES;
  stepIndex: number;
  nextStepIndex?: number;
  action: QuestStageAction;
  description: string;
  objectives?: StageObjective[];  // NEW: What items/tasks are needed

  displayType?: QuestMessageDisplay;      // How to show stage transition
  displayDuration?: number;                // Duration in seconds (for popup)
  infoPanelTitle?: string;                 // Title for info panel
  infoPanelDescription?: string;
}

export const TUTORIAL_QUEST_STAGE_CONFIG: Record<TUTORIAL_QUEST_STAGES, QuestStageConfig> = {
  [TUTORIAL_QUEST_STAGES.STAGE_NOT_STARTED]: {
    stage: TUTORIAL_QUEST_STAGES.STAGE_NOT_STARTED,
    stepIndex: 0,
    nextStepIndex: 1,
    displayType: QuestMessageDisplay.None,
    action: QuestStageAction.START_QUEST,
    description: "Accept the tutorial quest",
    objectives: []
  },
  [TUTORIAL_QUEST_STAGES.STAGE_STEP_1_COLLECT_BAG]: {
    stage: TUTORIAL_QUEST_STAGES.STAGE_STEP_1_COLLECT_BAG,
    stepIndex: 1,
    nextStepIndex: 2,
    displayType: QuestMessageDisplay.Popup,
    action: QuestStageAction.NONE,
    description: "Collect the storage bag",
    objectives: [
      {
        objectiveId: 'collect_storage_bag',
        itemType: 'storage_bag',
        targetCount: 1,
        description: 'Pick up the storage bag'
      }
    ]
  },
  [TUTORIAL_QUEST_STAGES.STAGE_STEP_2_COLLECT_COCONUTS]: {
    stage: TUTORIAL_QUEST_STAGES.STAGE_STEP_2_COLLECT_COCONUTS,
    stepIndex: 2,
    nextStepIndex: 3,
    action: QuestStageAction.NONE,
    displayType: QuestMessageDisplay.None,
    description: "Collecting coconuts (in progress)",
    objectives: [
      {
        objectiveId: 'collect_coconuts',
        itemType: ITEM_TYPES.COCONUT,
        targetCount: 3,
        description: 'Collect 3 coconuts'
      }
    ]
  },
  [TUTORIAL_QUEST_STAGES.STAGE_STEP_3_RETURN_COCONUTS]: {
    stage: TUTORIAL_QUEST_STAGES.STAGE_STEP_3_RETURN_COCONUTS,
    stepIndex: 3,
    nextStepIndex: 4,
    action: QuestStageAction.ADVANCE_QUEST,
    displayType: QuestMessageDisplay.None,
    description: "Return coconuts and advance to kill chickens",
    objectives: [
      {
        objectiveId: 'return_coconuts',
        itemType: 'return_coconuts',
        targetCount: 1,
        description: 'Return to the NPC'
      }
    ]
  },
  [TUTORIAL_QUEST_STAGES.STAGE_STEP_4_KILL_CHICKENS]: {
    stage: TUTORIAL_QUEST_STAGES.STAGE_STEP_4_KILL_CHICKENS,
    stepIndex: 4,
    nextStepIndex: 5,
    action: QuestStageAction.NONE,
    displayType: QuestMessageDisplay.None,
    description: "Killing chickens (in progress)",
    objectives: [
      {
        objectiveId: 'hunt_chicken',
        itemType: ITEM_TYPES.CHICKEN_MEAT,
        targetCount: 1,
        description: 'Hunt chickens for meat'
      }
    ]
  },
  [TUTORIAL_QUEST_STAGES.STAGE_STEP_5_RETURN_MEAT]: {
    stage: TUTORIAL_QUEST_STAGES.STAGE_STEP_5_RETURN_MEAT,
    stepIndex: 5,
    nextStepIndex: 6,
    action: QuestStageAction.ADVANCE_QUEST,
    displayType: QuestMessageDisplay.None,
    description: "Return meat and advance to collect logs",
    objectives: [{
      objectiveId: 'return_meat',
      itemType: 'return_meat',
      targetCount: 1,
      description: 'Return to the NPC'
    }]
  },
  [TUTORIAL_QUEST_STAGES.STAGE_STEP_6_COLLECT_LOGS]: {
    stage: TUTORIAL_QUEST_STAGES.STAGE_STEP_6_COLLECT_LOGS,
    stepIndex: 6,
    nextStepIndex: 7,
    action: QuestStageAction.NONE,
    displayType: QuestMessageDisplay.None,
    description: "Collecting logs (in progress)",
    objectives: [
      {
        objectiveId: 'gather_wood',
        itemType: ITEM_TYPES.RAW_WOOD_LOG,
        targetCount: 1,
        description: 'Gather 1 wood from trees'
      }
    ]
  },
  [TUTORIAL_QUEST_STAGES.STAGE_STEP_7_RETURN_LOGS]: {
    stage: TUTORIAL_QUEST_STAGES.STAGE_STEP_7_RETURN_LOGS,
    stepIndex: 7,
    action: QuestStageAction.COMPLETE_QUEST,
    displayType: QuestMessageDisplay.None,
    description: "Return logs and complete quest",
    objectives: [{
      objectiveId: 'return_logs',
      itemType: 'return_logs',
      targetCount: 1,
      description: 'Return to the NPC'
    }]
  },
  [TUTORIAL_QUEST_STAGES.STAGE_COMPLETE]: {
    stage: TUTORIAL_QUEST_STAGES.STAGE_COMPLETE,
    stepIndex: -1,
    action: QuestStageAction.NONE,
    displayType: QuestMessageDisplay.None,
    description: "Quest already completed",
    objectives: []
  }
};



export interface TutorialQuestDaoState {
  activeQuestId: string;
  questLogs: Record<string, QuestLog>;
  tutorialCompleted: boolean;
}

const TUTORIAL_QUEST_DAO_DEFAULT_STATE: TutorialQuestDaoState = {
  activeQuestId: "",
  questLogs: {},
  tutorialCompleted: false,
};

export class TutorialQuestDAO {
  constructor(private player: hz.Player, private world: hz.World) { }

  // --- PUBLIC API ---
  public getState(): TutorialQuestDaoState {
    // PVAR key should include VariableGroup name (e.g., "VG:Key") [15]
    const stored = this.world.persistentStorage.getPlayerVariable(
      this.player,
      TUTORIAL_QUEST_STATE_KEY
    ) as string | null;

    if (stored === null || stored === undefined || Object.keys(stored).length === 0) {
      console.warn('[TutorialQuestDAO] No stored state found, setting initial state.');

      const serializedData = JSON.stringify(TUTORIAL_QUEST_DAO_DEFAULT_STATE);
      this.world.persistentStorage.setPlayerVariable(this.player, TUTORIAL_QUEST_STATE_KEY, serializedData);
      return TUTORIAL_QUEST_DAO_DEFAULT_STATE;
    } else {
      return JSON.parse(stored) as TutorialQuestDaoState;
    }
  }

  public getActiveQuestId(): string {
    const state = this.getState();
    return state.activeQuestId;
  }

  public getTutorialCompletionStatus(): boolean {
    const state = this.getState();
    return state.tutorialCompleted;
  }

  public setTutorialCompleted(completed: boolean): void {
    const state = this.getState();
    const newState: TutorialQuestDaoState = {
      ...state,
      tutorialCompleted: completed
    };
    this.saveState(newState);
  }


  public setActiveQuest(questId: string, currentStepIndex: number = 0): void {
    const state = this.getState();
    console.log(`[TutorialQuestDAO] Setting active quest to '${questId}' at step index ${currentStepIndex}`);

    // Initialize quest log if it doesn't exist
    if (!state.questLogs[questId]) {
      console.log(`[TutorialQuestDAO] Initializing quest log for questId '${questId}'`);

      // Get the stage configuration for the current step
      const stageConfig = this.getStageByStepIndex(currentStepIndex);

      // Initialize objectives based on the stage configuration
      const initialObjectives: Record<string, ObjectiveProgress> = {};
      if (stageConfig && stageConfig.objectives) {
        for (const stageObj of stageConfig.objectives) {
          initialObjectives[stageObj.objectiveId] = {
            objectiveId: stageObj.objectiveId,
            currentCount: 0,
            isCompleted: false
          };
        }
      }

      state.questLogs[questId] = {
        questId: questId,  // Set the questId properly
        status: "NotStarted",
        steps: {},
        currentStepIndex: 0,
        startedAt: 0,
        completedAt: 0,
        objectives: initialObjectives  // Initialize with stage objectives
      };
    }

    // Update quest log if starting
    if (state.questLogs[questId].status === "NotStarted") {
      state.questLogs[questId].status = "InProgress";
      state.questLogs[questId].startedAt = Date.now();
      state.questLogs[questId].currentStepIndex = currentStepIndex;

      // If we're starting at a step other than 0, ensure objectives are initialized
      if (currentStepIndex > 0) {
        const stageConfig = this.getStageByStepIndex(currentStepIndex);
        if (stageConfig && stageConfig.objectives) {
          for (const stageObj of stageConfig.objectives) {
            if (!state.questLogs[questId].objectives[stageObj.objectiveId]) {
              state.questLogs[questId].objectives[stageObj.objectiveId] = {
                objectiveId: stageObj.objectiveId,
                currentCount: 0,
                isCompleted: false
              };
            }
          }
        }
      }
    }

    const newState: TutorialQuestDaoState = {
      ...state,
      activeQuestId: questId,
      questLogs: { ...state.questLogs }
    };

    this.saveState(newState);
  }

  public getStageByStepIndex(stepIndex: number): QuestStageConfig | undefined {
    return Object.values(TUTORIAL_QUEST_STAGE_CONFIG).find(
      config => config.stepIndex === stepIndex
    );
  }

  public isItemRelevantForStage(stage: TUTORIAL_QUEST_STAGES, itemType: string): boolean {
    const objectives = this.getObjectivesForStage(stage);
    return objectives.some(obj => obj.itemType === itemType);
  }

  public getTargetCountForItem(stage: TUTORIAL_QUEST_STAGES, itemType: string): number {
    const objectives = this.getObjectivesForStage(stage);
    const objective = objectives.find(obj => obj.itemType === itemType);
    return objective?.targetCount || 0;
  }

  public getObjectivesForStage(stage: TUTORIAL_QUEST_STAGES): StageObjective[] {
    return TUTORIAL_QUEST_STAGE_CONFIG[stage].objectives || [];
  }

  public getQuestLog(questId: string): QuestLog {
    const state = this.getState();

    if (state.questLogs[questId]) {
      return state.questLogs[questId];
    }

    // Return a default, "NotStarted" state
    return {
      status: "NotStarted",
      steps: {},
      currentStepIndex: 0,
      startedAt: 0,
      completedAt: 0,
      objectives: {},
      questId: ""
    };
  }

  public getQuestStep(questId: string): number {
    return this.getQuestLog(questId).currentStepIndex;
  }

  public updateQuestStep(questId: string, stepIndex: number): void {
    const state = this.getState();

    if (!state.questLogs[questId]) {
      console.warn(
        `[TutorialQuestDAO] Cannot update step for non-existent quest: ${questId}`
      );
      return;
    }

  console.log(`[TutorialQuestDAO] Updating quest ${questId} to step ${stepIndex}`);

  // Get the new stage configuration
  const stageConfig = this.getStageByStepIndex(stepIndex);

  // Initialize objectives for the new step
  if (stageConfig && stageConfig.objectives) {
    for (const stageObj of stageConfig.objectives) {
      // Only initialize if not already present
      if (!state.questLogs[questId].objectives[stageObj.objectiveId]) {
        state.questLogs[questId].objectives[stageObj.objectiveId] = {
          objectiveId: stageObj.objectiveId,
          currentCount: 0,
          isCompleted: false
        };
        console.log(`[TutorialQuestDAO] Initialized objective: ${stageObj.objectiveId}`);
      }
    }
  }

  // Update the step index
  state.questLogs[questId].currentStepIndex = stepIndex;

    const newState: TutorialQuestDaoState = {
      ...state,
      questLogs: {
        ...state.questLogs,
        [questId]: {
          ...state.questLogs[questId]
        }
      }
    };

    this.saveState(newState);
  console.log(`[TutorialQuestDAO] Quest step updated to ${stepIndex}`);
  }

  public updateQuestObjective(
    questId: string,
    objectiveId: string,
    currentCount: number, // Use currentCount
    isCompleted: boolean  // Use isCompleted
  ): void {
    const state = this.getState();
    let questLog = state.questLogs[questId];
    if (!questLog) {
      console.warn(`[TutorialQuestDAO] Cannot update objective for non-existent quest: ${questId}. Initializing.`);
      // Initialize quest if needed (ensure objectives map is created)
      questLog = {
        questId: questId, // Store the ID within the object too
        status: "InProgress", // Assume starting if updating objective
        objectives: {}, // Initialize objectives map
        steps: {}, // Keep steps if still needed elsewhere, otherwise remove
        currentStepIndex: 0, // Or determine appropriately
        startedAt: Date.now(),
        completedAt: 0,
      };
      state.questLogs[questId] = questLog;
    }

    // Ensure objectives map exists
    if (!questLog.objectives) {
      questLog.objectives = {};
    }

    questLog.objectives[objectiveId] = {
      objectiveId,
      currentCount, // Save currentCount
      isCompleted   // Save isCompleted
    };

    if (questLog.status === "NotStarted") {
      questLog.status = "InProgress";
      questLog.startedAt = Date.now();
    }



    this.saveState(state);
  }

  public completeQuest(questId: string): void {
    const state = this.getState();

    if (!state.questLogs[questId]) {
      console.warn(`[TutorialQuestDAO] Cannot complete non-existent quest: ${questId}`);
      return;
    }

    if (state.questLogs[questId].status === "Completed") {
      return; // Already done
    }

    const newState: TutorialQuestDaoState = {
      ...state,
      activeQuestId: state.activeQuestId === questId ? "" : state.activeQuestId,
      questLogs: {
        ...state.questLogs,
        [questId]: {
          ...state.questLogs[questId],
          status: "Completed",
          completedAt: Date.now()
        }
      }
    };

    this.saveState(newState);
  }


  // --- PRIVATE UTILITIES (For Robustness and Efficiency) ---
  private saveState(state: TutorialQuestDaoState): void {
    const serializedData = JSON.stringify(state);
    this.world.persistentStorage.setPlayerVariable(this.player, TUTORIAL_QUEST_STATE_KEY, serializedData);
  }
}
