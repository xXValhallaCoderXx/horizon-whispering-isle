import { BaseWeapon } from 'BaseWeapon';
import { Entity, Player, Vec3, LocalEvent, NetworkEvent, Asset } from 'horizon/core';


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

    static readonly UIEvents = {
        TogglePlayerUI: new NetworkEvent<{ player: Player, visible: boolean }>("TogglePlayerUI"),
    }



    static readonly CombatEvents = {
        PlayerTookDamage: new NetworkEvent<{ player: Player; damage: number; monsterId?: string }>('combat.player_took_damage'), // Server -> Player
        MonsterTookDamage: new NetworkEvent<{ monsterId: string; damage: number; attackerId?: string }>('combat.monster_took_damage'), // Player -> Server
        MonsterDied: new NetworkEvent<{ monsterId: string; killerId?: string, monsterType: string }>('combat.monster_died'), // Server -> All (if needed for quests)
        MonsterHealthUpdate: new NetworkEvent<{ monsterId: string; currentHealth: number; maxHealth: number, visible: boolean }>('combat.monster_health_update'), // Server -> All

        // NOT YET UUSED
        AttackSwingEvent: new NetworkEvent<IAttackSwingPayload>('combat.attack_swing'),
        NPCDeath: new LocalEvent<INPCDeath>('combat.died'),
        MonsterStartAttackingPlayer: new NetworkEvent<{ player: Player }>('combat.monster_start_attacking_player'),
        MonsterStopAttackingPlayer: new NetworkEvent<{ player: Player }>('combat.monster_stop_attacking_player'),
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



export type CheckQuestSubmissionPayload = {
    player: Player;
    itemType: string;      // 'coconut', 'wood', etc.
    amount: number;
};

export type QuestPayload = {
    player: Player;
    questId: string;
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




export interface MonsterStats {
    health: number;
    scale: Vec3;
    // Future stats: damage: number, moveSpeed: number
}

export interface MonsterConfigData {
    type: string;
    label: string;
    spawnRate: number; // ms between spawn attempts
    spawnChance: number; // 0..1 per attempt
    maxActive: number; // Max concurrent spawns for this manager
    rareChance: number; // 0..1
    commonStats: MonsterStats;
    rareStats: MonsterStats;
    lootTable?: LootTableConfig;
}

export interface SpawnableItemConfig {
    itemId: string;              // References ITEMS[itemId] for inventory
    label: string;               // Display name
    spawnRate: number;           // milliseconds between spawn attempts
    spawnChance: number;         // 0..1 per attempt
    maxActive: number;           // Max concurrent spawns
    rareSpawnRate?: number;      // 0..1 chance for rare variant
}

export const SPAWNABLE_ITEMS: { [key: string]: SpawnableItemConfig } = {
    coconut: {
        itemId: 'coconut',       // Will add this to ITEMS
        label: 'Coconut',
        spawnRate: 3000,
        spawnChance: 0.7,
        maxActive: 5,
        rareSpawnRate: 0.1
    },
    wood: {
        itemId: 'wood',
        label: 'Wood',
        spawnRate: 5000,
        spawnChance: 0.6,
        maxActive: 8,
        rareSpawnRate: 0.05
    },
    stone: {
        itemId: 'stone',
        label: 'Stone',
        spawnRate: 4000,
        spawnChance: 0.65,
        maxActive: 6,
        rareSpawnRate: 0.08
    }
};


// export const ITEMS = {
//     coconut: {
//         type: 'collectible',
//         label: 'Coconut',
//         description: "A tasty tropical fruit.",
//         spawnRate: 3000, // in milliseconds
//         rareSpawnRate: 0.1,
//         maxActive: 5,
//         maxActiveRares: 1,
//         spawnChance: 0.7,
//     },
//     ['enemy-chicken']: {
//         type: 'enemy-chicken',
//         label: 'Chicken',
//         description: "A feathery foe.",
//         spawnRate: 3000, // in milliseconds
//         rareSpawnRate: 0.1,
//         maxActive: 5,
//         maxActiveRares: 1,
//         spawnChance: 0.7,
//     }
// }



export interface ItemConfig {
    id: string;
    label: string;
    type: 'currency' | 'material' | 'collectible' | 'weapon' | 'consumable';
    asset?: Asset;           // The spawnable asset reference
    description?: string;
    value?: number;         // For economy systems later
}

export enum ITEM_TYPES {
    COIN = 'coin',
    FEATHER = 'feather',
    GEM_SMALL = 'gem_small',
    CHICKEN_MEAT = 'chicken_meat'
}

export const ITEMS: { [key: string]: ItemConfig } = {
    coin: {
        id: ITEM_TYPES.COIN,
        label: 'Gold Coin',
        type: 'currency',
        value: 1,
        description: 'Shiny gold coin'
    },
    feather: {
        id: ITEM_TYPES.FEATHER,
        label: 'Chicken Feather',
        type: 'material',
        value: 5,
        description: 'A soft feather from a defeated chicken'
    },
    gem_small: {
        id: ITEM_TYPES.GEM_SMALL,
        label: 'Small Gem',
        type: 'collectible',
        value: 25,
        description: 'A small but precious gem'
    },
    chicken_meat: {
        id: ITEM_TYPES.CHICKEN_MEAT,
        label: 'Chicken Meat',
        type: 'material',
        value: 10,
        description: 'A piece of raw chicken meat'
    }
};

export interface LootTableEntry {
    itemId: string;              // References ITEMS[itemId]
    dropChance: number;          // 0.0 to 1.0 (e.g., 0.5 = 50% chance)
    minQuantity?: number;        // Default: 1
    maxQuantity?: number;        // Default: 1
}

export interface LootTableConfig {
    dropMode: 'single' | 'multiple';  // 'single' = pick one, 'multiple' = roll each
    entries: LootTableEntry[];

    // Optional overrides
    guaranteedDrops?: string[];       // ItemIds that always drop (quantity 1)
    noDropChance?: number;            // For 'single' mode: explicit chance of no drop
    scatterRadius?: number;           // Horizontal scatter range (default: 1.25m)
    pluckHeight?: number;             // Vertical spawn offset (default: 0.5m)
    autoDespawnSeconds?: number;      // Auto-cleanup time (default: 60s)
    spawnCountCap?: number;           // Max items to spawn per kill (default: 12)
}


export const MONSTERS: { [key: string]: MonsterConfigData } = {
    CHICKEN: {
        type: "CHICKEN",
        label: "Chicken",
        spawnRate: 3000,
        spawnChance: 0.8,
        maxActive: 5,
        rareChance: 0.1,
        commonStats: { health: 100, scale: Vec3.one },
        rareStats: { health: 500, scale: new Vec3(1.5, 1.5, 1.5) },
        lootTable: {
            dropMode: 'multiple',  // Roll each item independently
            entries: [
                { itemId: ITEM_TYPES.FEATHER, dropChance: 0.4, minQuantity: 1, maxQuantity: 2 },
                { itemId: ITEM_TYPES.CHICKEN_MEAT, dropChance: 0.3, minQuantity: 1, maxQuantity: 1 },
                { itemId: ITEM_TYPES.COIN, dropChance: 0.1, minQuantity: 1, maxQuantity: 1 },
                { itemId: ITEM_TYPES.GEM_SMALL, dropChance: 0.05, minQuantity: 1, maxQuantity: 1 }
            ],
            guaranteedDrops: [],      // None for now
            scatterRadius: 1.5,
            pluckHeight: 0.5,
            autoDespawnSeconds: 60,
            spawnCountCap: 12
        }
    },

};