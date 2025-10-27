import { BaseWeapon } from 'BaseWeapon';
import { Entity, Player, Vec3, LocalEvent, NetworkEvent } from 'horizon/core';


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
        MonsterTookDamage: new NetworkEvent<{ monsterId: string; damage: number; attackerId?: string }>('combat.monster_took_damage'), // Player -> Server
        MonsterDied: new NetworkEvent<{ monsterId: string; killerId?: string }>('combat.monster_died'), // Server -> All (if needed for quests)
        MonsterHealthUpdate: new NetworkEvent<{ monsterId: string; currentHealth: number; maxHealth: number }>('combat.monster_health_update'), // Server -> All

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
    },

};


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

