import * as hz from "horizon/core";


export const TUTORIAL_QUEST_KEY = "tutorial_quest";
export const TUTORIAL_QUEST_STATE_KEY = `player:tutorial_quest_state`;

export interface QuestStepLog {
  have: number;
  need: number;
  done: boolean;
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
  STAGE_STEP_1_COLLECT = "Step_1_Collect_Coconuts",
  STAGE_STEP_2_RETURN_COCONUTS = "Step_2_Return_Coconuts",
  STAGE_STEP_3_KILL = "Step_3_Kill_Chickens",
  STAGE_STEP_4_RETURN_MEAT = "Step_4_Return_Meat",
  STAGE_STEP_5_COLLECT = "Step_5_Collect_Logs",
  STAGE_STEP_6_RETURN_LOGS = "Step_6_Return_Logs",
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
}

export const TUTORIAL_QUEST_STAGE_CONFIG: Record<TUTORIAL_QUEST_STAGES, QuestStageConfig> = {
  [TUTORIAL_QUEST_STAGES.STAGE_NOT_STARTED]: {
    stage: TUTORIAL_QUEST_STAGES.STAGE_NOT_STARTED,
    stepIndex: 0,
    nextStepIndex: 1,
    action: QuestStageAction.START_QUEST,
    description: "Accept the tutorial quest",
    objectives: []
  },
  [TUTORIAL_QUEST_STAGES.STAGE_STEP_1_COLLECT]: {
    stage: TUTORIAL_QUEST_STAGES.STAGE_STEP_1_COLLECT,
    stepIndex: 1,
    action: QuestStageAction.NONE,
    description: "Collecting coconuts (in progress)",
    objectives: [
      {
        objectiveId: 'collect_coconuts',
        itemType: 'coconut',
        targetCount: 2,
        description: 'Collect 2 coconuts'
      }
    ]
  },
  [TUTORIAL_QUEST_STAGES.STAGE_STEP_2_RETURN_COCONUTS]: {
    stage: TUTORIAL_QUEST_STAGES.STAGE_STEP_2_RETURN_COCONUTS,
    stepIndex: 2,
    nextStepIndex: 3,
    action: QuestStageAction.ADVANCE_QUEST,
    description: "Return coconuts and advance to kill chickens",
    objectives: [] // Turn-in stage, no new objectives
  },
  [TUTORIAL_QUEST_STAGES.STAGE_STEP_3_KILL]: {
    stage: TUTORIAL_QUEST_STAGES.STAGE_STEP_3_KILL,
    stepIndex: 3,
    action: QuestStageAction.NONE,
    description: "Killing chickens (in progress)",
    objectives: [
      {
        objectiveId: 'hunt_chicken',
        itemType: 'chicken',
        targetCount: 1,
        description: 'Hunt 1 chicken for meat'
      }
    ]
  },
  [TUTORIAL_QUEST_STAGES.STAGE_STEP_4_RETURN_MEAT]: {
    stage: TUTORIAL_QUEST_STAGES.STAGE_STEP_4_RETURN_MEAT,
    stepIndex: 4,
    nextStepIndex: 5,
    action: QuestStageAction.ADVANCE_QUEST,
    description: "Return meat and advance to collect logs",
    objectives: []
  },
  [TUTORIAL_QUEST_STAGES.STAGE_STEP_5_COLLECT]: {
    stage: TUTORIAL_QUEST_STAGES.STAGE_STEP_5_COLLECT,
    stepIndex: 5,
    action: QuestStageAction.NONE,
    description: "Collecting logs (in progress)",
    objectives: [
      {
        objectiveId: 'gather_wood',
        itemType: 'wood',
        targetCount: 10,
        description: 'Gather 10 wood from trees'
      }
    ]
  },
  [TUTORIAL_QUEST_STAGES.STAGE_STEP_6_RETURN_LOGS]: {
    stage: TUTORIAL_QUEST_STAGES.STAGE_STEP_6_RETURN_LOGS,
    stepIndex: 6,
    action: QuestStageAction.COMPLETE_QUEST,
    description: "Return logs and complete quest",
    objectives: []
  },
  [TUTORIAL_QUEST_STAGES.STAGE_COMPLETE]: {
    stage: TUTORIAL_QUEST_STAGES.STAGE_COMPLETE,
    stepIndex: -1,
    action: QuestStageAction.NONE,
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

    // Initialize quest log if it doesn't exist
    if (!state.questLogs[questId]) {
      state.questLogs[questId] = {
        status: "NotStarted",
        steps: {},
        currentStepIndex: 0,
        startedAt: 0,
        completedAt: 0,
        objectives: {},
        questId: ""
      };
    }

    // Update quest log if starting
    if (state.questLogs[questId].status === "NotStarted") {
      state.questLogs[questId].status = "InProgress";
      state.questLogs[questId].startedAt = Date.now();
      state.questLogs[questId].currentStepIndex = currentStepIndex;
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

    const newState: TutorialQuestDaoState = {
      ...state,
      questLogs: {
        ...state.questLogs,
        [questId]: {
          ...state.questLogs[questId],
          currentStepIndex: stepIndex
        }
      }
    };

    this.saveState(newState);
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
