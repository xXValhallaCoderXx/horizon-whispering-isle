
import * as hz from 'horizon/core';

export const ITEMS = {
    coconut: {
        type: 'collectible',
        label: 'Coconut',
        description: "A tasty tropical fruit.",
        spawnRate: 3000, // in milliseconds
        rareSpawnRate: 0.1,
        maxActive: 5,
        maxActiveRares: 1,
        spawnChance: 0.7,
    },
    ['enemy-chicken']: {
        type: 'enemy-chicken',
        label: 'Chicken',
        description: "A feathery foe.",
        spawnRate: 3000, // in milliseconds
        rareSpawnRate: 0.1,
        maxActive: 5,
        maxActiveRares: 1,
        spawnChance: 0.7,
    }
}


export const VARIABLE_GROUPS = {
    player: {
        group: "player",
        keys: {
            state: "state",
            isPlayerStorageInitialized: "isPlayerStorageInitialized",
            playerWearables: "playerWearables",
        }
    }
}




export type QuestSubmitCollectProgress = {
    player: hz.Player;
    itemId: string;
    amount: number;
    // Use string to safely serialize entity IDs (Entity.id is bigint)
    entityId: string;
};

export type PlayerInitialState = {
    isTutorialCompleted: number;
    isStorageInitialized: number;
    wearables: string[];
    player: hz.Player;
}

export type QuestPayload = {
    player: hz.Player;
    questId: string;
};
export type CheckQuestSubmissionPayload = {
    player: hz.Player;

    itemType: string;      // 'coconut', 'wood', etc.
    amount: number;
};
export class EventsService {

    static readonly PlayerEvents = {
        FetchInitialState: new hz.LocalEvent<{ player: hz.Player }>("FetchInitialState"),
        RecievedInitialState: new hz.LocalEvent<PlayerInitialState>("RecievedInitialState"),
    }

    static readonly AssetEvents = {
        // Carry entityId as string to avoid number/bigint mismatches across the wire
        DestroyAsset: new hz.NetworkEvent<{ entityId: string; player: hz.Player }>("DestroyAsset"),
    }

    static readonly QuestEvents = {
        // Use NetworkEvent so client-side item scripts can notify the server QuestManager
        SubmitQuestCollectProgress: new hz.NetworkEvent<{ player: hz.Player; itemId: string; amount: number; entityId?: string }>("SubmitQuestCollectProgress"),
        CheckPlayerQuestSubmission: new hz.LocalEvent<CheckQuestSubmissionPayload>(),
        QuestStarted: new hz.LocalEvent<QuestPayload>(),
        QuestCompleted: new hz.LocalEvent<QuestPayload>(),
        // (Legacy quest stage request/response removed; dialog should derive from objective state through QuestManager APIs.)
    }



    // Helper for logging events (debugging)
    static logEvent(eventName: string, payload: any) {
        console.log(`[EventsService] ${eventName}:`, JSON.stringify(payload, null, 2));
    }
}

// ---- Quest Types ----
export enum ObjectiveType {
    Collect = 'Collect',
    Talk = 'Talk',
    Hunt = 'Hunt',
}

export enum QuestStatus {
    NotStarted = 'NotStarted',
    InProgress = 'InProgress',
    Completed = 'Completed',
}

export interface QuestObjective {
    objectiveId: string;
    type: ObjectiveType;
    targetType: string; // e.g., 'coconut', 'npc:pineapple', 'chicken'
    targetCount: number;
    currentCount: number;
    description: string;
    isCompleted: boolean;
}

export interface Quest {
    questId: string;
    name: string;
    description: string;
    objectives: QuestObjective[];
    status: QuestStatus;
    isOptional: boolean;
    reward: number;
}

// Baseline quest definitions; clone before use to avoid mutating these.
export const QUEST_DEFINITIONS: Record<string, Quest> = {
    tutorial_survival: {
        questId: 'tutorial_survival',
        name: 'Island Survival Basics',
        description: 'Learn to gather resources on the island',
        objectives: [
            {
                objectiveId: 'collect_coconuts',
                type: ObjectiveType.Collect,
                targetType: 'coconut',
                targetCount: 5,
                currentCount: 0,
                description: 'Collect 5 coconuts',
                isCompleted: false,
            },
            {
                objectiveId: 'talk_to_npc',
                type: ObjectiveType.Talk,
                targetType: 'npc:pineapple',
                targetCount: 1,
                currentCount: 0,
                description: 'Great! Now, talk to Pineapple for an update',
                isCompleted: false,
            },
            {
                objectiveId: 'hunt_chicken',
                type: ObjectiveType.Hunt,
                targetType: 'chicken',
                targetCount: 1,
                currentCount: 0,
                description: 'Hunt a chicken for meat',
                isCompleted: false,
            },
            {
                objectiveId: 'gather_wood',
                type: ObjectiveType.Collect,
                targetType: 'wood',
                targetCount: 10,
                currentCount: 0,
                description: 'Gather 10 wood from trees',
                isCompleted: false,
            },
        ],
        status: QuestStatus.NotStarted,
        isOptional: false,
        reward: 100,
    },
};


export interface PlayerState {
    tutorial: {
        completed: boolean;
        bagGiven: boolean;
    };
    spawn: {
        lastIsland: string;
    };
    quests: {
        active: string;
        log: Record<string, {
            status: string;
            steps: Record<string, {
                need: number;
                have: number;
                done: boolean;
            }>;
            completedAt: number;
        }>;
    };
    inventory: {
        hasStorageBag: boolean;
        holster: {
            itemIds: string[];
        };
    };
}


export const PLAYER_INITIAL_STATE: PlayerState = {
    tutorial: {
        completed: false,
        bagGiven: false,
    },
    spawn: {
        lastIsland: "starter-island",
    },
    quests: {
        active: "",
        log: {},
    },
    inventory: {
        hasStorageBag: false,
        holster: {
            itemIds: [],
        },
    },
};