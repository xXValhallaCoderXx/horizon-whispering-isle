import { BaseWeapon } from 'BaseWeapon';

import { Entity, Player, Vec3, LocalEvent, NetworkEvent, Asset } from 'horizon/core';


export const INVENTORY_STATE_KEY = `player:inventory_state`;
export const PLAYER_STATE_KEY_2 = `player:player_state`;

export class EventsService {

    static readonly PlayerEvents = {
        OnPlayerStateLoaded: new LocalEvent<{ player: Player }>('player.on_player_state_loaded'),
        DisplayHealthHUD: new NetworkEvent<{ player: Player; currentHealth: number; maxHealth: number; name: string }>('player.display_health_hud'),
        RefreshInventoryHUD: new NetworkEvent<{ player: Player; stats?: any; inventory?: any }>('player.refresh_inventory_hud'),
    }

    static readonly CameraEvents = {
        PanToEntity: new LocalEvent<IPanToEntityPayload>('player.pan_to_entity'),
    }
    static readonly HarvestEvents = {
        TreeHit: new NetworkEvent<ITreeHitPayload>('harvest.tree_hit'),
        TreeDepleted: new NetworkEvent<ITreeDepletedPayload>('harvest.tree_depleted'),
        SpawnLog: new NetworkEvent<ISpawnLogPayload>('harvest.spawn_log'), // NEW
        OreHit: new NetworkEvent<IOreHitPayload>('harvest.ore_hit'),
        OreDepleted: new NetworkEvent<IOreDepletedPayload>('harvest.ore_depleted'),
        RequestOreHit: new NetworkEvent<IRequestOreHitPayload>('harvest.request_ore_hit'),
        RequestTreeHit: new NetworkEvent<{ player: Player; treeEntity: Entity; toolType: string; hitPosition: Vec3 }>('harvest.request_tree_hit'),








        // Server -> OreSpawnManager: Spawn ore chunk/drop
        SpawnOreChunk: new NetworkEvent<ISpawnOreChunkPayload>('mining.spawn_ore_chunk'),


    };


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
        MonsterTookDamage: new NetworkEvent<{ monsterId: string; damage: number; attackerId?: string, player: Player }>('combat.monster_took_damage'), // Player -> Server
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

export type IRequestOreHitPayload = {
    player: Player;
    oreEntity: Entity;
    oreRarity: string;
    toolType: string;
    hitPosition: Vec3;
};

export type IOreHitPayload = {
    player: Player;
    oreEntity: Entity;
    hitPosition: Vec3;
    damage: number;
    healthRemaining: number;
};

export type IOreDepletedPayload = {
    player: Player;
    oreEntity: Entity;
    position: Vec3;
    oreRarity: string;
};

export type ISpawnOreChunkPayload = {
    position: Vec3;
    itemId: string;
};

export type IOreWrongToolPayload = {
    player: Player;
    oreEntity: Entity;
};



export type ITreeHitPayload = {
    player: Player;
    treeEntity: Entity;
    hitPosition: Vec3;
    healthRemaining: number;
}

export type ITreeDepletedPayload = {
    player: Player;
    treeEntity: Entity;
    position: Vec3;
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
    reach?: number;
    durationMs?: number;
    type?: string;
}
export type INPCDeath = {
    targetNpcId: string;
    enemyType: string;
    killerPlayer: Player | null;
    timestamp: number;
}



export type CheckQuestSubmissionPayload = {
    player: Player;
    itemType: ITEM_TYPES;     
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


export type ISpawnLogPayload = {
    position: Vec3;
    itemId: string;
};

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
    CHICKEN_MEAT = 'chicken_meat',
    RAW_WOOD_LOG = 'raw_wood_log',
    COCONUT = 'coconut',
    COMMON_ORE = 'common_ore',
    RARE_ORE = 'rare_ore',
    LEGENDARY_ORE = 'legendary_ore',
}

export const SPAWNABLE_ITEMS: { [key: string]: SpawnableItemConfig } = {
    [ITEM_TYPES.COCONUT]: {
        itemId: ITEM_TYPES.COCONUT,
        label: 'Coconut',
        spawnRate: 3000,
        spawnChance: 0.7,
        maxActive: 3,
        rareSpawnRate: 0.1
    },
    [ITEM_TYPES.RAW_WOOD_LOG]: {
        itemId: ITEM_TYPES.RAW_WOOD_LOG,
        label: 'Wood',
        spawnRate: 5000,
        spawnChance: 0.6,
        maxActive: 8,
        rareSpawnRate: 0.05
    },
};

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
    },
    raw_wood_log: {
        id: ITEM_TYPES.RAW_WOOD_LOG,
        label: 'Raw Wood Log',
        type: 'material',
        value: 10,
        description: 'A log of raw wood'
    },
    common_ore: {
        id: ITEM_TYPES.COMMON_ORE,
        label: 'Common Ore',
        type: 'material',
        value: 10,
        description: 'A common chunk of ore'
    },
    rare_ore: {
        id: ITEM_TYPES.RARE_ORE,
        label: 'Rare Ore',
        type: 'material',
        value: 50,
        description: 'A rare and valuable ore'
    },
    legendary_ore: {
        id: ITEM_TYPES.LEGENDARY_ORE,
        label: 'Legendary Ore',
        type: 'material',
        value: 200,
        description: 'An extremely rare and precious ore'
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
        commonStats: { health: 25, scale: Vec3.one },
        rareStats: { health: 50, scale: new Vec3(1.5, 1.5, 1.5) },
        lootTable: {
            dropMode: 'multiple',  // Roll each item independently
            entries: [
                // { itemId: ITEM_TYPES.FEATHER, dropChance: 0.4, minQuantity: 1, maxQuantity: 2 },
                { itemId: ITEM_TYPES.CHICKEN_MEAT, dropChance: 0.6, minQuantity: 1, maxQuantity: 1 },
                // { itemId: ITEM_TYPES.COIN, dropChance: 0.1, minQuantity: 1, maxQuantity: 1 },
                // { itemId: ITEM_TYPES.GEM_SMALL, dropChance: 0.05, minQuantity: 1, maxQuantity: 1 }
            ],
            guaranteedDrops: [],      // None for now
            scatterRadius: 1.5,
            pluckHeight: 0.5,
            autoDespawnSeconds: 60,
            spawnCountCap: 12
        }
    },

};


export enum TREES {
    OAK = 'oak',
    PINE = 'pine',
}

export enum TREE_RARITY {
    COMMON = 'COMMON',
    RARE = 'RARE',
    LEGENDARY = 'LEGENDARY',
}


export interface HarvestableTreeConfig {
    treeType: TREES;
    toolType: string; // e.g., "axe", "hatchet"
    maxHealth: number;
    dropChance: number; // 0.0 to 1.0
    minDrops: number;
    maxDrops: number;
    regenTimeMs: number; // Time before tree can be harvested again
    logItemId: string; // References ITEMS
}

export enum ORE_RARITY {
    COMMON = 'common',
    RARE = 'rare',
    LEGENDARY = 'legendary',
}

export interface HarvestableOreConfig {
    rarity: ORE_RARITY;
    toolType: string; // Required tool (e.g., "pickaxe")
    minHealth: number;
    maxHealth: number;

    // Per-strike drop config
    dropChancePerStrike: number; // 0.0 to 1.0
    minDropsPerStrike: number;
    maxDropsPerStrike: number;

    // Depletion drop config
    dropChanceOnDepletion: number;
    minDropsOnDepletion: number;
    maxDropsOnDepletion: number;

    // Damage config (simple for now)
    minDamagePerHit: number; // Min damage per valid strike
    maxDamagePerHit: number; // Max damage per valid strike

    regenTimeMs: number; // Time before ore can respawn
    oreItemId: string; // References ITEMS

    // Optional: future skill requirements
    skillRequired?: number; // Placeholder for player skill level
}

export const TREE_TYPES: { [key: string]: HarvestableTreeConfig } = {
    [TREES.OAK]: {
        treeType: TREES.OAK,
        toolType: 'axe',
        maxHealth: 5, // 5 hits to chop down
        dropChance: 0.8, // 80% chance to drop logs
        minDrops: 1,
        maxDrops: 3,
        regenTimeMs: 30000, // 30 seconds to respawn
        logItemId: ITEM_TYPES.RAW_WOOD_LOG
    },
    [TREES.PINE]: {
        treeType: TREES.PINE,
        toolType: 'axe',
        maxHealth: 3, // Easier tree
        dropChance: 0.6,
        minDrops: 1,
        maxDrops: 2,
        regenTimeMs: 20000,
        logItemId: ITEM_TYPES.RAW_WOOD_LOG
    }
};


export const ORE_TYPES: { [key: string]: HarvestableOreConfig } = {
    [ORE_RARITY.COMMON]: {
        rarity: ORE_RARITY.COMMON,
        toolType: 'pickaxe',
        minHealth: 3,
        maxHealth: 5,

        // 20% chance per strike to drop 1 ore
        dropChancePerStrike: 0.2,
        minDropsPerStrike: 1,
        maxDropsPerStrike: 1,

        // 70% chance on depletion to drop 1-2 ore
        dropChanceOnDepletion: 0.7,
        minDropsOnDepletion: 1,
        maxDropsOnDepletion: 2,

        // Damage per hit: 1-3
        minDamagePerHit: 1,
        maxDamagePerHit: 3,

        regenTimeMs: 15000, // 15 seconds
        oreItemId: ITEM_TYPES.COMMON_ORE
    },

    [ORE_RARITY.RARE]: {
        rarity: ORE_RARITY.RARE,
        toolType: 'pickaxe',
        minHealth: 5,
        maxHealth: 8,

        // 15% chance per strike to drop 1 ore
        dropChancePerStrike: 0.15,
        minDropsPerStrike: 1,
        maxDropsPerStrike: 1,

        // 50% chance on depletion to drop 1-3 ore
        dropChanceOnDepletion: 0.5,
        minDropsOnDepletion: 1,
        maxDropsOnDepletion: 3,

        // Damage per hit: 1-2 (harder to mine)
        minDamagePerHit: 1,
        maxDamagePerHit: 2,

        regenTimeMs: 40000, // 40 seconds
        oreItemId: ITEM_TYPES.RARE_ORE,
        skillRequired: 5 // Placeholder
    },

    [ORE_RARITY.LEGENDARY]: {
        rarity: ORE_RARITY.LEGENDARY,
        toolType: 'pickaxe',
        minHealth: 8,
        maxHealth: 12,

        // 10% chance per strike to drop 1 ore
        dropChancePerStrike: 0.1,
        minDropsPerStrike: 1,
        maxDropsPerStrike: 1,

        // 30% chance on depletion to drop 1-2 ore (very rare!)
        dropChanceOnDepletion: 0.3,
        minDropsOnDepletion: 1,
        maxDropsOnDepletion: 2,

        // Damage per hit: 1-2 (very hard to mine)
        minDamagePerHit: 1,
        maxDamagePerHit: 2,

        regenTimeMs: 60000, // 60 seconds
        oreItemId: ITEM_TYPES.LEGENDARY_ORE,
        skillRequired: 10 // Placeholder
    }
};