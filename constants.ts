import { BaseWeapon } from 'BaseWeapon';

import { Entity, Player, Vec3, LocalEvent, NetworkEvent, Asset, InfoSlide } from 'horizon/core';
import { PlayerStateDaoState } from 'PlayerStateDAO';


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
        RefreshPlayerStatsUI: new NetworkEvent<IRefreshPlayerStatsUIPayload>("RefreshPlayerStatsUI"),

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


export type IRefreshPlayerStatsUIPayload = {
    player: Player;
    stats: any;
}

export type IRequestOreHitPayload = {
    player: Player;
    oreEntity: Entity;
    playerId: string;
    oreEntityId: string;
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
    // weapon: Entity;
    // owner: Player;
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
    ZOMBIE: {
        type: "ZOMBIE",
        label: "Zombie",
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






export interface HarvestableTreeConfig {
    rarity: TREE_RARITY;
    toolType: string;         // e.g., "axe"
    // Health range (trees used to be fixed health)
    minHealth?: number;       // optional for trees; default -> maxHealth
    maxHealth: number;

    // Per-hit drop config (added for trees)
    dropChancePerStrike?: number; // default -> dropChance
    minDropsPerStrike?: number;   // default -> minDrops
    maxDropsPerStrike?: number;   // default -> maxDrops

    // Depletion drop config (added for trees)
    dropChanceOnDepletion?: number; // default -> dropChance
    minDropsOnDepletion?: number;   // default -> minDrops
    maxDropsOnDepletion?: number;   // default -> maxDrops

    // Damage per valid hit (added for trees)
    minDamagePerHit?: number;     // default -> 1
    maxDamagePerHit?: number;     // default -> 1

    regenTimeMs: number;
    logItemId: string;

    // Back-compat (old tree fields). Kept so existing code doesn’t break.
    dropChance?: number;
    minDrops?: number;
    maxDrops?: number;
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

export enum ORE_RARITY {
    COMMON = 'common',
    RARE = 'rare',
    LEGENDARY = 'legendary',
}


export enum TREE_RARITY {
    COMMON = 'COMMON',
    RARE = 'RARE',
    LEGENDARY = 'LEGENDARY',
}

export const TREE_TYPES: { [key: string]: HarvestableTreeConfig } = {
    [TREE_RARITY.COMMON]: {
        rarity: TREE_RARITY.COMMON,
        toolType: 'axe',
        // Health unified
        minHealth: 5,
        maxHealth: 5,
        // Per-hit drops
        dropChancePerStrike: 0.25,
        minDropsPerStrike: 1,
        maxDropsPerStrike: 1,
        // Depletion guaranteed roll (not guaranteed drop)
        dropChanceOnDepletion: 0.8,
        minDropsOnDepletion: 1,
        maxDropsOnDepletion: 3,
        // Damage per hit
        minDamagePerHit: 1,
        maxDamagePerHit: 2,
        regenTimeMs: 30000,
        logItemId: ITEM_TYPES.RAW_WOOD_LOG,

        // Back-compat mirrors
        dropChance: 0.8,
        minDrops: 1,
        maxDrops: 3
    },
    [TREE_RARITY.RARE]: {
        rarity: TREE_RARITY.RARE,
        toolType: 'axe',
      minHealth: 6,
      maxHealth: 8,
      dropChancePerStrike: 0.2,
      minDropsPerStrike: 1,
      maxDropsPerStrike: 1,
      dropChanceOnDepletion: 0.7,
      minDropsOnDepletion: 1,
      maxDropsOnDepletion: 3,
      minDamagePerHit: 1,
      maxDamagePerHit: 2,
      regenTimeMs: 45000,
      logItemId: ITEM_TYPES.RAW_WOOD_LOG,

      dropChance: 0.7,
      minDrops: 1,
      maxDrops: 3
    },
    [TREE_RARITY.LEGENDARY]: {
        rarity: TREE_RARITY.LEGENDARY,
        toolType: 'axe',
      minHealth: 9,
      maxHealth: 12,
      dropChancePerStrike: 0.15,
      minDropsPerStrike: 1,
      maxDropsPerStrike: 2,
      dropChanceOnDepletion: 0.9,
      minDropsOnDepletion: 2,
      maxDropsOnDepletion: 4,
      minDamagePerHit: 1,
      maxDamagePerHit: 2,
      regenTimeMs: 60000,
      logItemId: ITEM_TYPES.RAW_WOOD_LOG,

      dropChance: 0.9,
      minDrops: 2,
      maxDrops: 4
    },
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




export type NormalizedHarvestConfig = {
    toolType: string;
    minHealth: number;
    maxHealth: number;
    perHitChance: number;
    perHitMin: number;
    perHitMax: number;
    depletionChance: number;
    depletionMin: number;
    depletionMax: number;
    minDamage: number;
    maxDamage: number;
    regenTimeMs: number;
    dropItemId: string; // wood log or ore item id
};

export function normalizeConfig(cfg: HarvestableTreeConfig | HarvestableOreConfig): NormalizedHarvestConfig {
    // Trees have optional fields; ores already have full set.
    const isOre = (cfg as HarvestableOreConfig).oreItemId !== undefined;
    const perHitChance = (cfg as any).dropChancePerStrike ?? (cfg as any).dropChance ?? 0;
    const perHitMin = (cfg as any).minDropsPerStrike ?? (cfg as any).minDrops ?? 0;
    const perHitMax = (cfg as any).maxDropsPerStrike ?? (cfg as any).maxDrops ?? 0;

    const depletionChance = (cfg as any).dropChanceOnDepletion ?? (cfg as any).dropChance ?? 0;
    const depletionMin = (cfg as any).minDropsOnDepletion ?? (cfg as any).minDrops ?? 0;
    const depletionMax = (cfg as any).maxDropsOnDepletion ?? (cfg as any).maxDrops ?? 0;

    const minHealth = (cfg as any).minHealth ?? cfg.maxHealth;
    const minDamage = (cfg as any).minDamagePerHit ?? 1;
    const maxDamage = (cfg as any).maxDamagePerHit ?? 1;

    const dropItemId = isOre ? (cfg as HarvestableOreConfig).oreItemId : (cfg as HarvestableTreeConfig).logItemId;

    return {
        toolType: cfg.toolType,
        minHealth,
        maxHealth: cfg.maxHealth,
        perHitChance,
        perHitMin,
        perHitMax,
        depletionChance,
        depletionMin,
        depletionMax,
        minDamage,
        maxDamage,
        regenTimeMs: cfg.regenTimeMs,
        dropItemId
    };
}

export function rollInt(min: number, max: number): number {
    if (max < min) [min, max] = [max, min];
    if (max <= 0) return 0;
    return Math.floor(Math.random() * (max - min + 1)) + Math.max(0, min);
}

export function rollDrops(chance: number, min: number, max: number): number {
    if (chance <= 0) return 0;
    if (Math.random() > chance) return 0;
    return rollInt(min, max);
}

export type ProcessHitResult = {
    damage: number;
    newHealth: number;
    perHitDrops: number;
    depleted: boolean;
    depletionDrops: number; // only >0 when depleted
};

// Apply one valid strike using the normalized config.
// Guaranteed roll at depletion = always run a depletion roll if newHealth <= 0.
export function processHarvestHit(currentHealth: number, cfg: NormalizedHarvestConfig): ProcessHitResult {
    const damage = rollInt(cfg.minDamage, cfg.maxDamage);
    let newHealth = Math.max(0, currentHealth - Math.max(1, damage));

    const perHitDrops = rollDrops(cfg.perHitChance, cfg.perHitMin, cfg.perHitMax);
    let depleted = newHealth <= 0;

    let depletionDrops = 0;
    if (depleted) {
        depletionDrops = rollDrops(cfg.depletionChance, cfg.depletionMin, cfg.depletionMax);
    }

    return { damage, newHealth, perHitDrops, depleted, depletionDrops };
}


export type WieldableId = string;

export interface WieldableConfig {
    id: WieldableId;
    label: string;
    // Core stats
    damage: number;
    reach: number;
    weight: number;
    baseCooldownMs: number;
    weightMultiplier: number;
    hitCooldownMs: number;
    // For harvest systems: must match TREE_TYPES/ORE_TYPES toolType
    toolType: 'axe' | 'pickaxe' | 'sword' | 'hammer' | string;
    // Optional explicit swing duration override
    swingDurationMs?: number;
}

export const WIELDABLES: Record<WieldableId, WieldableConfig> = {
    // AXES
    axe_wood: { id: 'axe_wood', label: 'Wooden Axe', damage: 18, reach: 1.9, weight: 6, baseCooldownMs: 520, weightMultiplier: 50, hitCooldownMs: 110, toolType: 'axe' },

    // PICKAXES
    pickaxe_wood: { id: 'pickaxe_wood', label: 'Wooden Pickaxe', damage: 14, reach: 1.8, weight: 6.5, baseCooldownMs: 560, weightMultiplier: 55, hitCooldownMs: 125, toolType: 'pickaxe' },

    // Future melee examples (kept for completeness)
    sword_wood: { id: 'sword_wood', label: 'Wooden Sword', damage: 26, reach: 2.1, weight: 4.5, baseCooldownMs: 420, weightMultiplier: 42, hitCooldownMs: 90, toolType: 'sword' },
    sword_mystical: { id: 'sword_mystical', label: 'Mystical Sword', damage: 34, reach: 2.3, weight: 4.8, baseCooldownMs: 400, weightMultiplier: 40, hitCooldownMs: 85, toolType: 'sword' },
    hammer_iron: { id: 'hammer_iron', label: 'Iron Hammer', damage: 38, reach: 1.9, weight: 8.5, baseCooldownMs: 670, weightMultiplier: 62, hitCooldownMs: 135, toolType: 'hammer' },
};

export function getWieldableConfig(id?: string): WieldableConfig | undefined {
    if (!id) return undefined;
    const key = id.toLowerCase();
    return WIELDABLES[key];
}