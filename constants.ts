
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

export type PlayerInitialState = {
    isStorageInitialized: number;
    wearables: string[];
    player: hz.Player;
}

export class EventsService {

    static readonly PlayerEvents = {
        QuestItemCollected: new hz.LocalEvent<QuestItemCollected>("QuestItemCollected"),
        StorageInitialized: new hz.LocalEvent<{ player: hz.Player }>("StorageInitialized"),
        FetchInitialState: new hz.LocalEvent<{ player: hz.Player }>("FetchInitialState"),
        RecievedInitialState: new hz.LocalEvent<PlayerInitialState>("RecievedInitialState"),
    }

    static readonly AssetEvents = {
        DestroyAsset: new hz.LocalEvent<{ entity: hz.Entity; player: hz.Player }>("DestroyAsset"),
    }



    // Helper for logging events (debugging)
    static logEvent(eventName: string, payload: any) {
        console.log(`[EventsService] ${eventName}:`, JSON.stringify(payload, null, 2));
    }
}