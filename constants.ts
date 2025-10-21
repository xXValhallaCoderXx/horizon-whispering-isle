
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



export type QuestItemCollected = {
    player: hz.Player;
    entity: hz.Entity;
    amount: number;
};

export type QuestSubmitCollectProgress = {
    player: hz.Player;
    itemId: string;
    amount: number;
    entityId: number;
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
        QuestItemCollected: new hz.LocalEvent<QuestItemCollected>("QuestItemCollected"),
        StorageInitialized: new hz.LocalEvent<{ player: hz.Player }>("StorageInitialized"),
        FetchInitialState: new hz.LocalEvent<{ player: hz.Player }>("FetchInitialState"),
        RecievedInitialState: new hz.LocalEvent<PlayerInitialState>("RecievedInitialState"),
    }

    static readonly AssetEvents = {
        DestroyAsset: new hz.NetworkEvent<{ entityId: number; player: hz.Player }>("DestroyAsset"),
    }

    static readonly QuestEvents = {
        // Use NetworkEvent so client-side item scripts can notify the server QuestManager
        SubmitQuestCollectProgress: new hz.NetworkEvent<{ player: hz.Player; itemId: string; amount: number; entityId?: number }>("SubmitQuestCollectProgress"),
        CheckPlayerQuestSubmission: new hz.LocalEvent<CheckQuestSubmissionPayload>(),
        QuestStarted: new hz.LocalEvent<QuestPayload>(),
        QuestCompleted: new hz.LocalEvent<QuestPayload>(),
        // Dialog can ask the server for the player's current quest stage
        RequestPlayerStage: new hz.LocalEvent<{ player: hz.Player }>("RequestPlayerStage"),
        PlayerStageResponse: new hz.LocalEvent<{ player: hz.Player; stage: string }>("PlayerStageResponse"),
    }



    // Helper for logging events (debugging)
    static logEvent(eventName: string, payload: any) {
        console.log(`[EventsService] ${eventName}:`, JSON.stringify(payload, null, 2));
    }
}


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