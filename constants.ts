import { BaseWeapon } from 'BaseWeapon';
import { Entity, Player, Vec3, LocalEvent, NetworkEvent } from 'horizon/core';
import { QuestLog } from 'TutorialQuestDAO';
import { TUTORIAL_QUEST_KEY } from 'TutorialQuestDAO';

export const INVENTORY_STATE_KEY = `player:inventory_state`;

export const PLAYER_STATE_KEY_2 = `player:player_state`;

export class EventsService {

    static readonly PlayerEvents = {
        OnPlayerStateLoaded: new LocalEvent<{ player: Player }>('player.on_player_state_loaded'),
        DisplayHealthHUD: new NetworkEvent<{ player: Player; currentHealth: number; maxHealth: number; name: string }>('player.display_health_hud'),

    }

    static readonly CameraEvents = {
        PanToEntity: new LocalEvent<IPanToEntityPayload>('player.pan_to_entity'),
    }

    static readonly QuestEvents = {

        QuestStarted: new LocalEvent<IQuestStarted>(), // Listen for when a new quest is started (Tutorial quest)
        DisplayQuestHUD: new NetworkEvent<IDisplayQuestHUD>("DisplayQuestHUD"), // Initiate showing the Quest HUD for a player
        RefreshQuestHUD: new NetworkEvent<IDisplayQuestHUD>("RefreshQuestHUD"), // Update the Quest HUD for a player
        SubmitQuestCollectProgress: new NetworkEvent<ISubmitQuestCollectProgress>("SubmitQuestCollectProgress"), // When collecting an item - submit to check quest submission.
        SpawnPlayerQuestReward: new NetworkEvent<{ player: Player; item: string }>("SpawnPlayerQuestReward"), // Spawn quest reward for player


        // NOT USED YET
        // Use NetworkEvent so client-side item scripts can notify the server QuestManager

        CheckPlayerQuestSubmission: new LocalEvent<CheckQuestSubmissionPayload>(),

        QuestCompleted: new LocalEvent<QuestPayload>(),
    }



    static readonly AssetEvents = {
        DestroyAsset: new NetworkEvent<{ entityId: string; player: Player }>("DestroyAsset"),
    }



    static readonly CombatEvents = {
        AttackSwingEvent: new NetworkEvent<IAttackSwingPayload>('combat.attack_swing'),
        NPCDeath: new LocalEvent<INPCDeath>('combat.died'),

        // DONT KNOW
        AttackStart: new NetworkEvent<AttackStartPayload>('combat.attack_start'),
        AttackEnd: new NetworkEvent<AttackEndPayload>('combat.attack_end'),
        // Event to apply damage (sent to the target entity). Attacker is optional.
        Hit: new LocalEvent<HitPayload>('combat.hit'),
        // Event to broadcast when health reaches zero

        // Broadcast UI update so any HUD can react
        EnemyHealthUpdate: new NetworkEvent<{ target: Entity, current: number, max: number, player?: Player, showMs?: number }>("combat.enemy_health_update"),
    }



    // Helper for logging events (debugging)
    static logEvent(eventName: string, payload: any) {
        console.log(`[EventsService] ${eventName}:`, JSON.stringify(payload, null, 2));
    }
}



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
            state: {
                tutorial_completed: "tutorial_completed",
                inventory_enabled: "inventory_enabled",
                spawn_lastIsland: "spawn_lastIsland",
                quest_active: "quest_active",
                quest_log_prefix: "quest_log_",
            }
        }
    }
}




export type QuestSubmitCollectProgress = {
    player: Player;
    itemId: string;
    amount: number;
    // Use string to safely serialize entity IDs (Entity.id is bigint)
    entityId: string;
};

export type PlayerInitialState = {
    isTutorialCompleted: number;
    isStorageInitialized: number;
    wearables: string[];
    player: Player;
}


export type CheckQuestSubmissionPayload = {
    player: Player;

    itemType: string;      // 'coconut', 'wood', etc.
    amount: number;
};
// Lightweight progress update payload for per-player NPC dialog gating
export type QuestProgressUpdatedPayload = {
    player: Player;
    questId: string;
    stage: string; // e.g., 'NotStarted' | 'Collecting' | 'ReturnToNPC' | 'Hunting' | 'Complete'
    quest?: Quest; // optional snapshot of quest state
};
export type QuestPayload = {
    player: Player;
    questId: string;
};

export interface IWeaponComp {
    parentWeapon: BaseWeapon;
    onGrab(isRightHand: boolean): void;
    onRelease(): void;
    onFirePressed(target?: Entity | Player): void;
    onFireReleased(): void;
}

/* COMBAT TYPES */

export type AttackStartPayload = {
    weaponId: string;
    attackerPlayer: Player;
    attackId: string;          // unique per swing
    stats: WeaponStats;
    timestamp: number;
}

export type AttackEndPayload = {
    weaponId: string;
    attackerPlayer: Player;
    attackId: string;
    timestamp: number;
}

export type HitPayload = {
    attackId: string;
    attackerPlayer: Player;
    targetNpcId: string;
    weaponId: string;
    hitPos: Vec3;
    timestamp: number;
}

export type ApplyDamagePayload = {
    targetNpcId: string;
    amount: number;
    attackerPlayer: Player;
    weaponId: string;
    attackId: string;
    timestamp: number;
}


export type HuntProgressPayload = {
    player: Player;
    enemyType: string;
    increment: number;        // usually 1
    timestamp: number;
}

export type WeaponStats = {
    damage: number;
    attackCooldown: number;   // in seconds
    attackRange: number;      // in meters
    weaponType: 'melee' | 'ranged';
}

// NEW 
export type IAttackSwingPayload = {
    weapon: Entity;
    owner: Player;
    damage: number;
    reach?: number;        // meters
    durationMs?: number;   // swing active window
}
export type INPCDeath = {
    targetNpcId: string;
    enemyType: string;
    killerPlayer: Player | null;
    timestamp: number;
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
    [TUTORIAL_QUEST_KEY]: {
        questId: 'tutorial_survival',
        name: 'Island Survival Basics',
        description: 'Learn to gather resources on the island',
        objectives: [
            {
                objectiveId: 'collect_coconuts',
                type: ObjectiveType.Collect,
                targetType: 'coconut',
                targetCount: 2,
                currentCount: 0,
                description: 'Collect 1 coconuts',
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
        log: Record<string, QuestLog>;
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


/* NEW TYPES */



export type IQuestStarted = {
    player: Player;
    questId: string;
};

export type IDisplayQuestHUD = {





    player: Player; questId: string; title: string, visible: boolean, objective: string
};

export type ISubmitQuestCollectProgress = {
    player: Player; itemId: string; amount: number; entityId?: string
};

export interface IPanToEntityPayload {
    player: Player;
    entity: Entity;
    duration?: number;
}