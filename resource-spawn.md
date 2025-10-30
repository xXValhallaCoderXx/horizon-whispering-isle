# Ore Mining & Spawn System - Implementation Plan

## Overview

This plan implements a mining resource system with dynamically spawned ores of varying rarity. Players use pickaxes to mine ores, which have health values and drop resources based on rarity. The system follows your existing patterns from TreeSpawnManager and integrates with your event-driven architecture.

---

## Architecture Summary

```
┌─────────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│ Player + Pickaxe    │────────▶│  HarvestableOre  │────────▶│  OreSpawnMgr    │
│  (BaseWeapon)       │  Swing  │  (Client-Local)  │  Drop   │  (Server)       │
└─────────────────────┘         └──────────────────┘         └─────────────────┘
                                         │                             │
                                         │ Events                      │
                                         ▼                             ▼
                                ┌──────────────────┐         ┌─────────────────┐
                                │  EventsService   │         │  CollectableOre │
                                │  (Mining Events) │         │  (InventoryDAO) │
                                └──────────────────┘         └─────────────────┘
```

---

## Phase 1: Constants & Configuration

### 1.1 Add Ore Types to `constants.ts`

**Location:** `constants.ts`

Add ore enum and item type definitions:

```typescript
// Add to ITEM_TYPES enum
export const ITEM_TYPES = {
  // ... existing items
  COMMON_ORE: "common_ore",
  RARE_ORE: "rare_ore",
  LEGENDARY_ORE: "legendary_ore",
};

// Add ore items to ITEMS object
export const ITEMS = {
  // ... existing items
  common_ore: {
    id: ITEM_TYPES.COMMON_ORE,
    label: "Common Ore",
    type: "material",
    value: 10,
    description: "A common chunk of ore",
  },
  rare_ore: {
    id: ITEM_TYPES.RARE_ORE,
    label: "Rare Ore",
    type: "material",
    value: 50,
    description: "A rare and valuable ore",
  },
  legendary_ore: {
    id: ITEM_TYPES.LEGENDARY_ORE,
    label: "Legendary Ore",
    type: "material",
    value: 200,
    description: "An extremely rare and precious ore",
  },
};

// Ore rarity enum
export enum ORE_RARITY {
  COMMON = "common",
  RARE = "rare",
  LEGENDARY = "legendary",
}

// Ore configuration interface
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

// Ore type configurations
export const ORE_TYPES: { [key: string]: HarvestableOreConfig } = {
  [ORE_RARITY.COMMON]: {
    rarity: ORE_RARITY.COMMON,
    toolType: "pickaxe",
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

    regenTimeMs: 20000, // 20 seconds
    oreItemId: ITEM_TYPES.COMMON_ORE,
  },

  [ORE_RARITY.RARE]: {
    rarity: ORE_RARITY.RARE,
    toolType: "pickaxe",
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
    skillRequired: 5, // Placeholder
  },

  [ORE_RARITY.LEGENDARY]: {
    rarity: ORE_RARITY.LEGENDARY,
    toolType: "pickaxe",
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
    skillRequired: 10, // Placeholder
  },
};
```

### 1.2 Add Mining Events to `constants.ts`

```typescript
// Add to EventsService class
export class EventsService {
  // ... existing events

  static readonly MiningEvents = {
    // Client -> Server: Request to hit an ore
    RequestOreHit: new NetworkEvent<IRequestOreHitPayload>(
      "mining.request_ore_hit"
    ),

    // Server -> All Clients: Ore was hit (confirmed)
    OreHit: new NetworkEvent<IOreHitPayload>("mining.ore_hit"),

    // Server -> All Clients: Ore depleted
    OreDepleted: new NetworkEvent<IOreDepletedPayload>("mining.ore_depleted"),

    // Server -> OreSpawnManager: Spawn ore chunk/drop
    SpawnOreChunk: new NetworkEvent<ISpawnOreChunkPayload>(
      "mining.spawn_ore_chunk"
    ),

    // Server -> Client: Wrong tool used (play error sound)
    OreHitWrongTool: new NetworkEvent<IOreWrongToolPayload>(
      "mining.ore_wrong_tool"
    ),
  };
}

// Type definitions for mining events
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
```

---

## Phase 2: Weapon System Enhancement

### 2.1 Update `BaseWeapon.ts` for Mining Tools

This is similar to the tree harvesting system - we need to track tool types.

**Add to `propsDefinition` (if not already present):**

```typescript
static propsDefinition = {
  isDroppable: { type: PropTypes.Boolean, default: false },
  damage: { type: PropTypes.Number, default: 25 },
  reach: { type: PropTypes.Number, default: 2.0 },
  weight: { type: PropTypes.Number, default: 5 },
  toolType: { type: PropTypes.String, default: "" }, // "pickaxe", "axe", "sword"
  isHarvestTool: { type: PropTypes.Boolean, default: false },
};
```

**Ensure `onFirePressed` emits toolType:**

```typescript
private onFirePressed(player: Player) {
  if (!this.isHeld()) return;

  this.entity.owner
    .get()
    .playAvatarGripPoseAnimationByName(AvatarGripPoseAnimationNames.Fire);

  this.sendNetworkBroadcastEvent(EventsService.CombatEvents.AttackSwingEvent, {
    owner: player,
    weapon: this.entity,
    damage: this.props.damage,
    reach: this.props.reach,
    durationMs: 250,
    toolType: this.props.toolType,
    isHarvestTool: this.props.isHarvestTool,
  });
}
```

---

## Phase 3: Client-Side Ore Component

### 3.1 Create `HarvestableOre.ts` (Local Client Script)

**Purpose:** Immediate hit detection, visual feedback, and request forwarding to server

**Location:** `/scripts/HarvestableOre.ts`

```typescript
import * as hz from "horizon/core";
import { EventsService, ORE_TYPES } from "constants";

export class HarvestableOre extends hz.Component<typeof HarvestableOre> {
  static propsDefinition = {
    oreRarity: { type: hz.PropTypes.String, default: "common" },
    hitSoundGizmo: { type: hz.PropTypes.Entity },
    hitVFXGizmo: { type: hz.PropTypes.Entity },
    wrongToolSoundGizmo: { type: hz.PropTypes.Entity },
    depletedSoundGizmo: { type: hz.PropTypes.Entity },
    depletedVFXGizmo: { type: hz.PropTypes.Entity },
  };

  private lastHitTime: number = 0;
  private hitCooldown: number = 500; // ms

  preStart() {
    // Listen to weapon swings (local only)
    this.connectNetworkBroadcastEvent(
      EventsService.CombatEvents.AttackSwingEvent,
      (payload) => this.onLocalWeaponSwing(payload)
    );

    // Listen to server-validated ore hit responses
    this.connectNetworkBroadcastEvent(
      EventsService.MiningEvents.OreHit,
      (payload) => this.onOreHitConfirmed(payload)
    );

    // Listen to ore depletion
    this.connectNetworkBroadcastEvent(
      EventsService.MiningEvents.OreDepleted,
      (payload) => this.onOreDepleted(payload)
    );

    // Listen to wrong tool feedback
    this.connectNetworkBroadcastEvent(
      EventsService.MiningEvents.OreHitWrongTool,
      (payload) => this.onWrongTool(payload)
    );
  }

  start() {}

  private onLocalWeaponSwing(payload: any) {
    const { owner, weapon, toolType, isHarvestTool, reach } = payload;

    // Only handle hits by the local player
    const localPlayer = this.world.getLocalPlayer();
    if (!localPlayer || owner !== localPlayer) return;

    // Check if it's a harvest tool
    if (!isHarvestTool) return;

    // Check cooldown (prevent spam)
    const now = Date.now();
    if (now - this.lastHitTime < this.hitCooldown) return;

    // Check if player is in range
    if (!this.isPlayerInRange(localPlayer, reach || 2.0)) return;

    this.lastHitTime = now;

    // Request server to validate and process the hit
    const oreEntityId = this.toEntityIdString((this.entity as any)?.id);

    this.sendNetworkBroadcastEvent(EventsService.MiningEvents.RequestOreHit, {
      player: localPlayer,
      oreEntity: this.entity,
      oreRarity: this.props.oreRarity,
      toolType,
      hitPosition: this.entity.position.get(),
    });
  }

  private onOreHitConfirmed(payload: any) {
    const { oreEntity, healthRemaining, damage } = payload;
    const myOreId = this.toEntityIdString((this.entity as any)?.id);
    const hitOreId = this.toEntityIdString((oreEntity as any)?.id);

    if (myOreId !== hitOreId) return;

    console.log(
      `[HarvestableOre] Hit confirmed! Damage: ${damage}, Health: ${healthRemaining}`
    );

    // Play local hit feedback
    this.playHitFeedback();
  }

  private onWrongTool(payload: any) {
    const { oreEntity } = payload;
    const myOreId = this.toEntityIdString((this.entity as any)?.id);
    const hitOreId = this.toEntityIdString((oreEntity as any)?.id);

    if (myOreId !== hitOreId) return;

    console.log(`[HarvestableOre] Wrong tool used!`);

    // Play error sound
    try {
      this.props.wrongToolSoundGizmo?.as(hz.AudioGizmo)?.play();
    } catch {}
  }

  private onOreDepleted(payload: any) {
    const { oreEntity } = payload;
    const myOreId = this.toEntityIdString((this.entity as any)?.id);
    const depletedOreId = this.toEntityIdString((oreEntity as any)?.id);

    if (myOreId !== depletedOreId) return;

    console.log(`[HarvestableOre] Ore depleted!`);

    // Play depletion feedback
    this.playDepletedFeedback();
  }

  private playHitFeedback() {
    try {
      this.props.hitSoundGizmo?.as(hz.AudioGizmo)?.play();
      this.props.hitVFXGizmo?.as(hz.ParticleGizmo)?.play();
    } catch {}
  }

  private playDepletedFeedback() {
    try {
      this.props.depletedSoundGizmo?.as(hz.AudioGizmo)?.play();
      this.props.depletedVFXGizmo?.as(hz.ParticleGizmo)?.play();
    } catch {}
  }

  private isPlayerInRange(player: hz.Player, reach: number): boolean {
    const playerPos = player.position.get();
    const orePos = this.entity.position.get();
    const distance = Math.sqrt(
      (playerPos.x - orePos.x) ** 2 +
        (playerPos.y - orePos.y) ** 2 +
        (playerPos.z - orePos.z) ** 2
    );
    return distance <= reach + 1.5; // Buffer for ore size
  }

  private toEntityIdString(id: any): string {
    const t = typeof id;
    if (t === "string") return id;
    if (t === "number") return String(id);
    if (t === "bigint") return id.toString();
    return "";
  }
}

hz.Component.register(HarvestableOre);
```

---

## Phase 4: Server-Side Ore Spawn Manager

### 4.1 Create `OreSpawnManager.ts` (Server Authority)

**Purpose:** Spawn ores at locations, validate hits, manage ore health/state, calculate drops

**Location:** `/scripts/OreSpawnManager.ts`

```typescript
import * as hz from "horizon/core";
import {
  EventsService,
  ORE_TYPES,
  ORE_RARITY,
  HarvestableOreConfig,
} from "constants";

// Internal wrapper class to track spawned ore state
class OreSpawnController {
  controller: hz.SpawnController;
  isSpawned = false;
  spawnPosition?: hz.Vec3;
  spawnedEntities: hz.Entity[] = [];

  // Server-side state ONLY
  maxHealth: number = 0;
  currentHealth: number = 0;
  oreRarity: string = "";
  oreIdKey: string | null = null;
  config: HarvestableOreConfig | null = null;

  constructor(controller: hz.SpawnController) {
    this.controller = controller;
  }

  getRootEntity(): hz.Entity | null {
    if (!this.isSpawned || this.spawnedEntities.length === 0) return null;
    return this.spawnedEntities[0];
  }

  static toIdKey(id: unknown): string | null {
    const t = typeof id;
    if (t === "string") return id as string;
    if (t === "number") return String(id as number);
    if (t === "bigint") return (id as bigint).toString();
    return null;
  }

  async spawn(
    position: hz.Vec3,
    initData: {
      health: number;
      oreRarity: string;
      config: HarvestableOreConfig;
    }
  ): Promise<void> {
    if (this.isSpawned) return;
    await this.controller.load();
    await this.controller.spawn();
    this.isSpawned = true;
    this.spawnPosition = position;
    this.spawnedEntities = this.controller.rootEntities.get();

    const root = this.getRootEntity();
    if (root) {
      this.oreIdKey = OreSpawnController.toIdKey((root as any).id);
      try {
        // Store server-side state
        this.maxHealth = initData.health;
        this.currentHealth = initData.health;
        this.oreRarity = initData.oreRarity;
        this.config = initData.config;

        // Make ore visible
        root.visible.set(true);
      } catch (e) {
        console.error("[OreSpawnManager] Failed to init ore:", e);
        this.unload();
      }
    } else {
      console.error("[OreSpawnManager] Spawned ore root entity not found!");
      this.unload();
    }
  }

  getEntities(): hz.Entity[] {
    return this.spawnedEntities;
  }

  async unload(): Promise<void> {
    if (!this.isSpawned) return;

    try {
      await this.controller.unload();
    } catch (e) {
      console.error("[OreSpawnManager] Error during controller.unload()", e);
    }

    this.isSpawned = false;
    this.spawnPosition = undefined;
    this.spawnedEntities = [];
    this.oreIdKey = null;
  }

  dispose(): void {
    if (this.isSpawned) this.unload();
    try {
      this.controller.dispose();
    } catch (e) {
      console.error("[OreSpawnManager] Error during controller.dispose()", e);
    }
  }
}

class OreSpawnManager extends hz.Component<typeof OreSpawnManager> {
  static propsDefinition = {
    commonOreAsset: { type: hz.PropTypes.Asset },
    rareOreAsset: { type: hz.PropTypes.Asset },
    legendaryOreAsset: { type: hz.PropTypes.Asset },
    oreChunkAsset: { type: hz.PropTypes.Asset }, // Collectable ore drop
  };

  private spawnPoints: hz.Entity[] = [];
  private activeOres: OreSpawnController[] = [];
  private timer: number = 0;

  // Mapping from ore entity id (string) -> controller
  private entityToController: Map<string, OreSpawnController> = new Map();

  // Rarity spawn weights (common > rare > legendary)
  private readonly RARITY_WEIGHTS = {
    [ORE_RARITY.COMMON]: 0.7, // 70%
    [ORE_RARITY.RARE]: 0.25, // 25%
    [ORE_RARITY.LEGENDARY]: 0.05, // 5%
  };

  private toIdKey(id: unknown): string | null {
    return OreSpawnController.toIdKey(id);
  }

  preStart() {
    // Only the server should manage spawning
    if (!this.isOwnedByMe()) return;

    this.spawnPoints = this.findUnderContainer(this.entity, "SpawnLocations");

    // Listen for ore hit requests
    this.connectNetworkBroadcastEvent(
      EventsService.MiningEvents.RequestOreHit,
      (data: any) => this.onOreHitRequest(data)
    );
  }

  start() {
    // Only the server runs the spawn timer
    if (this.isOwnedByMe()) {
      this.startSpawnTimer();
    }
  }

  private startSpawnTimer() {
    const tick = () => {
      this.attemptSpawn(this.activeOres);
      // Check for spawn every 3 seconds
      this.timer = this.async.setTimeout(tick, 3000);
    };
    tick();
  }

  private attemptSpawn(activeList: OreSpawnController[]) {
    this.cleanupInactiveControllers(activeList);

    // Calculate max active ores
    const maxActiveOres = Math.min(this.spawnPoints.length, 15); // Max 15 active ores

    if (activeList.length >= maxActiveOres) return;

    const location = this.getAvailableSpawnLocation();
    if (!location) return;

    // Roll for ore rarity
    const rarity = this.rollOreRarity();
    const config = ORE_TYPES[rarity];
    if (!config) {
      console.error(`[OreSpawnManager] Unknown ore rarity: ${rarity}`);
      return;
    }

    this.createAndSpawn(rarity, config, location, activeList);
  }

  private rollOreRarity(): ORE_RARITY {
    const roll = Math.random();
    let cumulative = 0;

    for (const [rarity, weight] of Object.entries(this.RARITY_WEIGHTS)) {
      cumulative += weight;
      if (roll <= cumulative) {
        return rarity as ORE_RARITY;
      }
    }

    return ORE_RARITY.COMMON; // Fallback
  }

  private createAndSpawn(
    rarity: ORE_RARITY,
    config: HarvestableOreConfig,
    location: hz.Entity,
    activeList: OreSpawnController[]
  ) {
    const position = location.position.get();
    const rotation = location.rotation.get();

    // Select asset based on rarity
    let asset: hz.Asset | undefined;
    switch (rarity) {
      case ORE_RARITY.COMMON:
        asset = this.props.commonOreAsset as hz.Asset;
        break;
      case ORE_RARITY.RARE:
        asset = this.props.rareOreAsset as hz.Asset;
        break;
      case ORE_RARITY.LEGENDARY:
        asset = this.props.legendaryOreAsset as hz.Asset;
        break;
    }

    if (!asset) {
      console.error(`[OreSpawnManager] No asset configured for ${rarity} ore`);
      return;
    }

    const controller = new hz.SpawnController(
      asset,
      position,
      rotation,
      hz.Vec3.one
    );
    const wrapper = new OreSpawnController(controller);

    // Randomize health within range
    const health = Math.floor(
      Math.random() * (config.maxHealth - config.minHealth + 1) +
        config.minHealth
    );

    const initData = {
      health,
      oreRarity: rarity,
      config,
    };

    wrapper
      .spawn(position, initData)
      .then(() => {
        if (!wrapper.isSpawned || !wrapper.oreIdKey) {
          console.warn(
            "[OreSpawnManager] Wrapper failed to spawn or get ID, bailing."
          );
          wrapper.dispose();
          return;
        }
        activeList.push(wrapper);
        this.entityToController.set(wrapper.oreIdKey, wrapper);

        console.log(
          `[OreSpawnManager] Spawned ${rarity} ore at ${position}, ID: ${wrapper.oreIdKey}, Health: ${health}`
        );
      })
      .catch((e) => {
        console.error("[OreSpawnManager] Failed to spawn ore", e);
        wrapper.dispose();
      });
  }

  // ---- Ore Hit Handler (Server-Side) ----
  private onOreHitRequest(data: any) {
    const { player, oreEntity, oreRarity, toolType, hitPosition } = data;

    const oreId = (oreEntity as any)?.id;
    const key = this.toIdKey(oreId);

    if (!key) return;

    const controller = this.entityToController.get(key);
    if (!controller || !controller.isSpawned || !controller.config) {
      return; // Ore not found or already despawned
    }

    // Validate tool compatibility
    if (toolType !== controller.config.toolType) {
      console.log(
        `[OreSpawnManager] Wrong tool: ${toolType} (need ${controller.config.toolType})`
      );
      // Send wrong tool feedback
      this.sendNetworkBroadcastEvent(
        EventsService.MiningEvents.OreHitWrongTool,
        {
          player,
          oreEntity,
        }
      );
      return;
    }

    // Calculate damage (random within range)
    const damage = Math.floor(
      Math.random() *
        (controller.config.maxDamagePerHit -
          controller.config.minDamagePerHit +
          1) +
        controller.config.minDamagePerHit
    );

    // Apply damage
    controller.currentHealth -= damage;
    if (controller.currentHealth < 0) controller.currentHealth = 0;

    console.log(
      `[OreSpawnManager] Ore hit! Damage: ${damage}, Health: ${controller.currentHealth}/${controller.maxHealth}`
    );

    // Broadcast hit confirmation
    this.sendNetworkBroadcastEvent(EventsService.MiningEvents.OreHit, {
      player,
      oreEntity,
      hitPosition,
      damage,
      healthRemaining: controller.currentHealth,
    });

    // Roll for per-strike drop
    this.rollForOreStrikeDrop(controller.config, hitPosition);

    // Check if depleted
    if (controller.currentHealth <= 0) {
      this.handleOreDepletion(controller, player, hitPosition);
    }
  }

  private rollForOreStrikeDrop(
    config: HarvestableOreConfig,
    position: hz.Vec3
  ) {
    if (Math.random() < config.dropChancePerStrike) {
      const dropCount = Math.floor(
        Math.random() *
          (config.maxDropsPerStrike - config.minDropsPerStrike + 1) +
          config.minDropsPerStrike
      );

      console.log(`[OreSpawnManager] Dropping ${dropCount} ore(s) from strike`);

      for (let i = 0; i < dropCount; i++) {
        const offsetPos = this.getScatteredPosition(position, 1.0);
        this.spawnOreChunk(offsetPos, config.oreItemId);
      }
    }
  }

  private handleOreDepletion(
    controller: OreSpawnController,
    player: hz.Player,
    position: hz.Vec3
  ) {
    const config = controller.config;
    if (!config) return;

    console.log(
      `[OreSpawnManager] Ore depleted! Rarity: ${controller.oreRarity}`
    );

    // Broadcast depletion event
    this.sendNetworkBroadcastEvent(EventsService.MiningEvents.OreDepleted, {
      player,
      oreEntity: controller.getRootEntity(),
      position,
      oreRarity: controller.oreRarity,
    });

    // Roll for depletion drops
    if (Math.random() < config.dropChanceOnDepletion) {
      const dropCount = Math.floor(
        Math.random() *
          (config.maxDropsOnDepletion - config.minDropsOnDepletion + 1) +
          config.minDropsOnDepletion
      );

      console.log(
        `[OreSpawnManager] Dropping ${dropCount} ore(s) on depletion`
      );

      for (let i = 0; i < dropCount; i++) {
        const offsetPos = this.getScatteredPosition(position, 1.25);
        this.spawnOreChunk(offsetPos, config.oreItemId);
      }
    }

    // Remove ore from world
    this.handleOreRemoval(controller);
  }

  private async spawnOreChunk(position: hz.Vec3, itemId: string) {
    const oreAsset = this.props.oreChunkAsset as hz.Asset | undefined;
    if (!oreAsset) {
      console.warn("[OreSpawnManager] No ore chunk asset configured!");
      return;
    }

    try {
      const spawnedEntities = await this.world.spawnAsset(oreAsset, position);

      if (spawnedEntities.length === 0) {
        console.warn("[OreSpawnManager] Failed to spawn ore chunk");
        return;
      }

      const chunk = spawnedEntities[0];

      // Ensure interaction mode is set
      chunk.interactionMode.set(hz.EntityInteractionMode.Both);
      chunk.collidable.set(true);

      // Apply physics after short delay
      this.async.setTimeout(() => {
        const physicalChunk = chunk.as(hz.PhysicalEntity);
        if (physicalChunk) {
          // Launch velocity
          const angle = Math.random() * Math.PI * 2;
          const offsetX = Math.cos(angle) * 0.5;
          const offsetZ = Math.sin(angle) * 0.5;
          const velocityMag = 2 + Math.random() * 1;
          const velocity = new hz.Vec3(offsetX, 1, offsetZ)
            .normalize()
            .mul(velocityMag);
          physicalChunk.applyForce(
            velocity,
            hz.PhysicsForceMode.VelocityChange
          );

          // Angular velocity (spin)
          const angularMag = 1 + Math.random() * 5;
          const torque = new hz.Vec3(
            (Math.random() - 0.5) * angularMag,
            (Math.random() - 0.5) * angularMag,
            (Math.random() - 0.5) * angularMag
          );
          physicalChunk.applyTorque(torque);
        }
      }, 500);

      // Auto-despawn after 60 seconds
      this.async.setTimeout(() => {
        try {
          this.world.deleteAsset(chunk);
        } catch (e) {
          // Already collected or deleted
        }
      }, 60000);
    } catch (e) {
      console.error("[OreSpawnManager] Error spawning ore chunk:", e);
    }
  }

  private handleOreRemoval(controller: OreSpawnController) {
    const idKey = controller.oreIdKey;

    if (!idKey) {
      console.error(
        "[OreSpawnManager] Cannot handle removal for controller with no ID Key!"
      );
    } else {
      console.log(`[OreSpawnManager] Removing ore ID: ${idKey}`);
      this.entityToController.delete(idKey);
    }

    // Small delay before unloading
    this.async.setTimeout(() => {
      controller.unload().catch((e) => {
        console.error("[OreSpawnManager] Error unloading ore:", e);
      });
    }, 1000);

    // Remove from active list
    const idx = this.activeOres.indexOf(controller);
    if (idx >= 0) this.activeOres.splice(idx, 1);

    // Schedule respawn check
    const config = controller.config;
    if (config) {
      const respawnDelay = config.regenTimeMs;
      this.async.setTimeout(() => {
        if (this.isOwnedByMe()) {
          this.attemptSpawn(this.activeOres);
        }
      }, respawnDelay);
    }
  }

  // ---- Utility Functions ----

  private findUnderContainer(
    root: hz.Entity,
    containerName: string
  ): hz.Entity[] {
    const containers = (root.children.get() || []).filter(
      (e) => e.name.get() === containerName
    );
    if (containers.length === 0) return [];
    const children: hz.Entity[] = [];
    for (const c of containers) children.push(...(c.children.get() || []));
    return children;
  }

  private cleanupInactiveControllers(activeList: OreSpawnController[]) {
    const stillActive = activeList.filter((c) => c.isSpawned);
    if (stillActive.length !== activeList.length) {
      const activeIds = new Set(stillActive.map((c) => c.oreIdKey));
      const entries = Array.from(this.entityToController.entries());
      for (const [key, controller] of entries) {
        if (!activeIds.has(key)) {
          console.warn(
            `[OreSpawnManager] Cleaning up leaked controller reference: ${key}`
          );
          this.entityToController.delete(key);
          try {
            controller.dispose();
          } catch {}
        }
      }

      activeList.length = 0;
      activeList.push(...stillActive);
    }
  }

  private getAvailableSpawnLocation(): hz.Entity | null {
    const locations = this.spawnPoints;
    if (locations.length === 0) return null;

    // Shuffle to randomize spawn points
    const shuffled = [...locations];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Find first unoccupied location
    for (const loc of shuffled) {
      if (!this.isLocationOccupied(loc)) return loc;
    }

    return null; // All occupied
  }

  private isLocationOccupied(location: hz.Entity): boolean {
    const pos = location.position.get();
    const radius = 1.5; // Ores need less space than trees

    const near = (c: OreSpawnController) => {
      if (!c.isSpawned || !c.spawnPosition) return false;
      const s = c.spawnPosition;
      const d = Math.sqrt(
        (s.x - pos.x) ** 2 + (s.y - pos.y) ** 2 + (s.z - pos.z) ** 2
      );
      return d < radius;
    };

    for (const c of this.activeOres) if (near(c)) return true;
    return false;
  }

  private getScatteredPosition(base: hz.Vec3, radius: number): hz.Vec3 {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * radius;
    return new hz.Vec3(
      base.x + Math.cos(angle) * dist,
      base.y + 0.5,
      base.z + Math.sin(angle) * dist
    );
  }

  private isOwnedByMe(): boolean {
    const owner = this.entity.owner.get();
    const localPlayer = this.world.getLocalPlayer();
    return owner ? owner.id === localPlayer.id : false;
  }
}

hz.Component.register(OreSpawnManager);
```

---

## Phase 5: Collectable Ore Chunk

### 5.1 Create `CollectableOreChunk.ts`

**Purpose:** Handle collection of ore drops (same pattern as CollectableLog)

**Location:** `/scripts/CollectableOreChunk.ts`

```typescript
import * as hz from "horizon/core";
import { EventsService } from "constants";

export class CollectableOreChunk extends hz.Component<
  typeof CollectableOreChunk
> {
  static propsDefinition = {
    itemId: { type: hz.PropTypes.String, default: "common_ore" },
    autoDespawnSeconds: { type: hz.PropTypes.Number, default: 60 },
  };

  private despawnTimer: number | null = null;

  preStart() {
    // Collection via trigger (player walks over it)
    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnPlayerEnterTrigger,
      (player: hz.Player) => this.collectOre(player)
    );

    // Collection via button press
    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnIndexTriggerDown,
      (player: hz.Player) => this.collectOre(player)
    );

    // Auto-despawn after timeout
    if (this.props.autoDespawnSeconds > 0) {
      this.scheduleAutoDespawn();
    }
  }

  start() {}

  private collectOre(player: hz.Player) {
    const rawId: any = (this.entity as any)?.id;
    const entityId =
      typeof rawId === "bigint" ? rawId.toString() : String(rawId);

    console.log(
      `[CollectableOreChunk] Player ${player.name.get()} collected ore (${
        this.props.itemId
      })`
    );

    // Use existing quest/inventory flow
    this.sendNetworkBroadcastEvent(
      EventsService.QuestEvents.SubmitQuestCollectProgress,
      {
        player,
        itemId: this.props.itemId,
        amount: 1,
        entityId,
      }
    );

    // Request despawn
    this.sendNetworkBroadcastEvent(EventsService.AssetEvents.DestroyAsset, {
      entityId,
      player,
    });

    // Cancel auto-despawn timer
    if (this.despawnTimer !== null) {
      this.async.clearTimeout(this.despawnTimer);
    }
  }

  private scheduleAutoDespawn() {
    this.despawnTimer = this.async.setTimeout(() => {
      console.log(`[CollectableOreChunk] Auto-despawning uncollected ore`);
      const rawId: any = (this.entity as any)?.id;
      const entityId =
        typeof rawId === "bigint" ? rawId.toString() : String(rawId);

      this.sendNetworkBroadcastEvent(EventsService.AssetEvents.DestroyAsset, {
        entityId,
        player: this.world.getServerPlayer(),
      });
    }, this.props.autoDespawnSeconds * 1000);
  }
}

hz.Component.register(CollectableOreChunk);
```

---

## Phase 6: Editor Setup Guide

### 6.1 Spawn Manager Entity Setup

1. **Create a server-owned manager entity** in your world
2. Add `OreSpawnManager` component
3. Set props:
   - `commonOreAsset`: Assign common ore asset
   - `rareOreAsset`: Assign rare ore asset
   - `legendaryOreAsset`: Assign legendary ore asset
   - `oreChunkAsset`: Assign collectable ore chunk asset
4. Create child entity named "SpawnLocations"
5. Add multiple empty entities as children of "SpawnLocations" (these are spawn points)

### 6.2 Ore Asset Setup (for each rarity)

1. **Create ore model entity**
2. Add `HarvestableOre` component
3. Set props:
   - `oreRarity`: "common", "rare", or "legendary"
   - `hitSoundGizmo`: Audio for successful hit
   - `hitVFXGizmo`: Particles for successful hit
   - `wrongToolSoundGizmo`: Audio for wrong tool
   - `depletedSoundGizmo`: Audio for depletion
   - `depletedVFXGizmo`: Particles for depletion (rock break effect)
4. **Set component authority to "Local"** (runs on each client)
5. **Save as Asset Template**

### 6.3 Ore Chunk Asset Setup

1. **Create ore chunk collectible entity**
2. Add `CollectableOreChunk` component
3. Set props:
   - `itemId`: "common_ore", "rare_ore", or "legendary_ore"
   - `autoDespawnSeconds`: 60
4. Add Trigger Gizmo (detect Players Only)
5. **Save as Asset Template**

### 6.4 Pickaxe Weapon Setup

1. **Select pickaxe weapon entity**
2. In `BaseWeapon` component:
   - Set `toolType = "pickaxe"`
   - Set `isHarvestTool = true`
   - Set `reach` appropriately (2-3 meters)

---

## Phase 7: Testing & Validation

### 7.1 Testing Steps

1. **Spawn Test:**

   - Verify ores spawn at designated locations
   - Check rarity distribution (should see mostly common, few rare, very few legendary)
   - Confirm no two ores spawn at same location

2. **Tool Validation Test:**

   - Hit ore with pickaxe → Should deal damage and play mining sound
   - Hit ore with sword/axe → Should play error sound, no damage

3. **Health & Damage Test:**

   - Hit common ore 3-5 times → Should deplete
   - Hit rare ore 5-8 times → Should deplete
   - Hit legendary ore 8-12 times → Should deplete
   - Verify random damage per hit (1-3 for common, 1-2 for rare/legendary)

4. **Drop Rate Test:**

   - Mine 10 common ores → Should get drops with per-strike + depletion drops
   - Mine 10 rare ores → Should get fewer drops (lower rates)
   - Mine 10 legendary ores → Should get even fewer drops (lowest rates)

5. **VFX/SFX Test:**

   - Verify mining sounds play on valid hits
   - Verify wrong tool sound plays on invalid hits
   - Verify depletion VFX (particle burst) plays when ore depleted

6. **Respawn Test:**

   - Deplete ore → Wait regen time → Verify new ore spawns
   - Common: 20 seconds
   - Rare: 40 seconds
   - Legendary: 60 seconds

7. **Collection Test:**
   - Walk over ore chunk → Should auto-collect
   - Press trigger button on ore chunk → Should collect
   - Verify inventory count increases via `InventoryDAO`

---

## Phase 8: Performance Optimization

### 8.1 Best Practices

1. **Spawn Controller Pre-loading:**

   - Always call `controller.load()` in spawn logic to avoid lag

2. **Anti-spam Cooldown:**

   - Implemented in `HarvestableOre` (500ms per player)
   - Prevents rapid-fire exploits

3. **Auto-despawn:**

   - Ore chunks despawn after 60s to prevent entity buildup

4. **Spawn Cap:**

   - Limit max concurrent ores (15 in current config)
   - Adjust based on world size and performance

5. **Efficient Spawn Checks:**

   - Check for available spawns every 3 seconds (not every frame)

6. **Collision Optimization:**
   - Use appropriate collision radius (1.5m for ores)
   - Prevents overlapping spawns

---

## Phase 9: Future Enhancements

### 9.1 Extension Ideas

1. **Player Skill System:**

   - Check `skillRequired` field from config
   - Prevent mining rare/legendary ores until skill threshold met
   - Show UI message: "Requires Mining Level 5"

2. **Tool Durability:**

   - Track pickaxe usage in `BaseWeapon`
   - Decrease durability on each ore hit
   - Break/despawn when durability reaches 0

3. **Mining Speed Bonuses:**

   - Higher skill = more damage per hit
   - Better pickaxe quality = more damage
   - Implement damage multipliers in `OreSpawnManager`

4. **Critical Hits:**

   - Random chance for 2x-3x damage
   - Play special VFX/SFX on critical

5. **Ore Quality Variations:**

   - Same rarity, different quality tiers
   - Higher quality = more drops

6. **Visual Health Feedback:**

   - Swap ore material/texture at 50% health (show cracks)
   - Glow fade as health decreases
   - Requires material swapping in `HarvestableOre`

7. **Crafting Integration:**

   - Use ores in crafting recipes
   - Smelt ores into bars
   - Forge tools and weapons

8. **Multiplayer Collaboration:**
   - Multiple players can mine same ore
   - Shared drops or individual drops per player

---

## Phase 10: Summary

### 10.1 Files to Create

| File                     | Purpose                                 | Authority            |
| ------------------------ | --------------------------------------- | -------------------- |
| `HarvestableOre.ts`      | Local hit detection, instant feedback   | **Local (Player)**   |
| `OreSpawnManager.ts`     | Spawn management, hit validation, drops | **Server (Default)** |
| `CollectableOreChunk.ts` | Ore chunk collection                    | Spawned Entity       |

### 10.2 Files to Modify

| File            | Changes                                           |
| --------------- | ------------------------------------------------- |
| `constants.ts`  | Add ore types, configs, mining events             |
| `BaseWeapon.ts` | Ensure `toolType` and `isHarvestTool` props exist |

### 10.3 Key Differences from Tree Harvesting

| Aspect                  | Trees                      | Ores                                        |
| ----------------------- | -------------------------- | ------------------------------------------- |
| **Spawning**            | Fixed tree locations       | Dynamic ore spawning with rarity            |
| **Location Management** | Trees respawn at same spot | Ore can spawn anywhere in available slots   |
| **Rarity System**       | Single type (oak/pine)     | Three tiers (common/rare/legendary)         |
| **Health**              | Fixed per type             | Random range per type                       |
| **Drops**               | Per-hit + depletion        | Per-strike + depletion (configurable rates) |
| **Tool Validation**     | Axe required               | Pickaxe required                            |

### 10.4 Architecture Benefits

| Benefit              | Description                                                     |
| -------------------- | --------------------------------------------------------------- |
| **Instant Feedback** | Client-side `HarvestableOre` provides zero-latency hit response |
| **Server Authority** | `OreSpawnManager` prevents cheating and maintains state         |
| **Slot Management**  | No two ores spawn at same location                              |
| **Configurable**     | Easy balancing via `constants.ts`                               |
| **Scalable**         | Single manager handles all ores efficiently                     |
| **Modular**          | Easy to add new ore types or modify existing                    |

---

## Final Notes

This ore mining system integrates seamlessly with your existing codebase:

- ✅ Uses `SpawnController` pattern from `TreeSpawnManager`
- ✅ Uses `InventoryDAO` for persistent inventory
- ✅ Uses `EventsService` for network communication
- ✅ Follows `CollectableQuestItem` pattern for loot
- ✅ Extends `BaseWeapon` for tool classification
- ✅ Compatible with your quest system
- ✅ Server-authoritative with client-side feedback

**Ready to implement? Start with Phase 1 (constants) and work through each phase sequentially!**

---

## Quick Start Checklist

- [ ] Phase 1: Add ore configurations to `constants.ts`
- [ ] Phase 2: Verify `BaseWeapon.ts` has tool type props
- [ ] Phase 3: Create `HarvestableOre.ts` (client script)
- [ ] Phase 4: Create `OreSpawnManager.ts` (server script)
- [ ] Phase 5: Create `CollectableOreChunk.ts`
- [ ] Phase 6: Set up entities and assets in editor
- [ ] Phase 7: Test all scenarios
- [ ] Phase 8: Optimize performance
- [ ] Phase 9: Plan future enhancements

**Good luck with your ore mining system!** 🪨⛏️
