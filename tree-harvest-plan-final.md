# Tree Harvesting System - Final Implementation Plan

## Overview
This plan integrates a tree harvesting feature using your existing patterns: `SpawnManager`, `CollectableQuestItem`, `InventoryDAO`, `BaseWeapon`, and event-driven architecture via `EventsService`.

---

## Architecture Summary

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│  Player + Axe   │────────▶│  HarvestableTree │────────▶│  LogSpawnMgr    │
│  (BaseWeapon)   │  Swing  │  (Server-owned)  │  Spawn  │  (SpawnManager) │
└─────────────────┘         └──────────────────┘         └─────────────────┘
                                     │                             │
                                     │ Events                      │
                                     ▼                             ▼
                            ┌──────────────────┐         ┌─────────────────┐
                            │  EventsService   │         │  CollectableLog │
                            │  (Tree Events)   │         │  (InventoryDAO) │
                            └──────────────────┘         └─────────────────┘
```

---

## Phase 1: Constants & Configuration

### 1.1 Update `constants.ts`

You already have the tree configuration defined! The following is already present:
- `TREES` enum
- `HarvestableTreeConfig` interface  
- `TREE_TYPES` configuration
- `EventsService.HarvestEvents` (TreeHit, TreeDepleted)
- `ITreeHitPayload` and `ITreeDepletedPayload` types

**Action Required:** None - your constants are ready!

---

## Phase 2: Weapon System Enhancement

### 2.1 Extend `BaseWeapon` to Support Tool Types

**File:** `BaseWeapon.ts`

**Add to `propsDefinition`:**
```typescript
static propsDefinition = {
  isDroppable: { type: PropTypes.Boolean, default: false },
  damage: { type: PropTypes.Number, default: 25 },
  reach: { type: PropTypes.Number, default: 2.0 },
  weight: { type: PropTypes.Number, default: 5 },
  // NEW: Tool type classification
  toolType: { type: PropTypes.String, default: "" }, // "axe", "sword", "pickaxe"
  isHarvestTool: { type: PropTypes.Boolean, default: false }, // true for axes
};
```

**Modify `onFirePressed` method** to emit harvest capability info:
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
    toolType: this.props.toolType,        // NEW
    isHarvestTool: this.props.isHarvestTool, // NEW
  });
}
```

**Update Type:** In `constants.ts`, update `IAttackSwingPayload`:
```typescript
export type IAttackSwingPayload = {
  weapon: Entity;
  owner: Player;
  damage: number;
  reach?: number;
  durationMs?: number;
  toolType?: string;        // NEW
  isHarvestTool?: boolean;  // NEW
}
```

---

## Phase 3: Core Tree Harvesting Component

### 3.1 Create `HarvestableTree.ts`

**Location:** `/scripts/HarvestableTree.ts`

This is the **authoritative server component** attached to tree entities.

```typescript
import * as hz from "horizon/core";
import { EventsService, TREE_TYPES, HarvestableTreeConfig } from "constants";

export class HarvestableTree extends hz.Component<typeof HarvestableTree> {
  static propsDefinition = {
    treeType: { type: hz.PropTypes.String, default: "oak" },
    hitSoundGizmo: { type: hz.PropTypes.Entity },
    hitVFXGizmo: { type: hz.PropTypes.Entity },
    depletedSoundGizmo: { type: hz.PropTypes.Entity },
    logSpawnManager: { type: hz.PropTypes.Entity }, // Reference to spawn manager
  };

  private config: HarvestableTreeConfig | null = null;
  private currentHealth: number = 0;
  private isRegenerating: boolean = false;
  private hitCooldown: Map<string, number> = new Map(); // Prevent spam

  preStart() {
    // Load configuration
    const cfg = TREE_TYPES[this.props.treeType];
    if (!cfg) {
      console.error(`[HarvestableTree] Unknown tree type: ${this.props.treeType}`);
      return;
    }
    this.config = cfg;
    this.currentHealth = cfg.maxHealth;

    // Listen to weapon swings
    this.connectNetworkBroadcastEvent(
      EventsService.CombatEvents.AttackSwingEvent,
      (payload) => this.onWeaponSwing(payload)
    );
  }

  start() {}

  private onWeaponSwing(payload: any) {
    const { owner, weapon, toolType, isHarvestTool, reach } = payload;

    // Validate tool compatibility
    if (!isHarvestTool || toolType !== this.config?.toolType) {
      // Optional: Play error sound for incompatible tool
      if (this.isPlayerNearTree(owner)) {
        console.log(`[HarvestableTree] Incompatible tool: ${toolType}`);
        // TODO: Play "invalid tool" sound
      }
      return;
    }

    // Check if player is in range
    if (!this.isPlayerInRange(owner, reach || 2.0)) {
      return;
    }

    // Anti-spam cooldown (prevent double-hits)
    const playerId = (owner as any).id?.toString();
    if (this.isOnCooldown(playerId)) return;
    this.setCooldown(playerId);

    this.handleHit(owner);
  }

  private handleHit(player: hz.Player) {
    if (this.isRegenerating || !this.config) return;

    this.currentHealth--;
    const position = this.entity.position.get();

    // Emit hit feedback event
    this.sendNetworkBroadcastEvent(EventsService.HarvestEvents.TreeHit, {
      player,
      treeEntity: this.entity,
      hitPosition: position,
      healthRemaining: this.currentHealth,
    });

    // Play local feedback (VFX/SFX)
    this.playHitFeedback();

    console.log(
      `[HarvestableTree] Hit! Health: ${this.currentHealth}/${this.config.maxHealth}`
    );

    // Check if depleted
    if (this.currentHealth <= 0) {
      this.handleDepletion(player);
    }
  }

  private handleDepletion(player: hz.Player) {
    if (!this.config) return;

    this.isRegenerating = true;
    const position = this.entity.position.get();

    console.log(`[HarvestableTree] Tree depleted! Spawning logs...`);

    // Emit depletion event
    this.sendNetworkBroadcastEvent(EventsService.HarvestEvents.TreeDepleted, {
      player,
      treeEntity: this.entity,
      position,
    });

    // Play depletion feedback
    this.playDepletedFeedback();

    // Spawn logs
    this.spawnLogs(position);

    // Hide/fade tree (visual only, keep collision)
    this.setTreeVisualState(false);

    // Schedule regeneration
    this.async.setTimeout(() => {
      this.regenerateTree();
    }, this.config.regenTimeMs);
  }

  private spawnLogs(position: hz.Vec3) {
    if (!this.config) return;

    // Roll for drop
    if (Math.random() > this.config.dropChance) {
      console.log(`[HarvestableTree] No logs dropped (chance failed)`);
      return;
    }

    // Determine quantity
    const dropCount =
      Math.floor(
        Math.random() * (this.config.maxDrops - this.config.minDrops + 1)
      ) + this.config.minDrops;

    console.log(`[HarvestableTree] Spawning ${dropCount} logs`);

    // Request spawn manager to spawn logs
    // Note: The LogSpawnManager will handle actual spawning
    for (let i = 0; i < dropCount; i++) {
      const offsetPos = this.getScatteredPosition(position, 1.5);
      this.sendNetworkBroadcastEvent(EventsService.HarvestEvents.SpawnLog, {
        position: offsetPos,
        itemId: this.config.logItemId,
      });
    }
  }

  private regenerateTree() {
    if (!this.config) return;

    this.currentHealth = this.config.maxHealth;
    this.isRegenerating = false;
    this.setTreeVisualState(true);

    console.log(`[HarvestableTree] Tree regenerated!`);
  }

  private setTreeVisualState(visible: boolean) {
    try {
      this.entity.visible.set(visible);
    } catch (e) {
      console.warn(`[HarvestableTree] Failed to set visibility: ${e}`);
    }
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
    } catch {}
  }

  // --- Utility Functions ---

  private isPlayerInRange(player: hz.Player, reach: number): boolean {
    const playerPos = player.position.get();
    const treePos = this.entity.position.get();
    const distance = Math.sqrt(
      (playerPos.x - treePos.x) ** 2 +
      (playerPos.y - treePos.y) ** 2 +
      (playerPos.z - treePos.z) ** 2
    );
    return distance <= reach + 2.0; // Add buffer for tree size
  }

  private isPlayerNearTree(player: hz.Player): boolean {
    return this.isPlayerInRange(player, 5.0);
  }

  private isOnCooldown(playerId: string): boolean {
    const lastHit = this.hitCooldown.get(playerId) || 0;
    return Date.now() - lastHit < 500; // 500ms cooldown
  }

  private setCooldown(playerId: string) {
    this.hitCooldown.set(playerId, Date.now());
  }

  private getScatteredPosition(base: hz.Vec3, radius: number): hz.Vec3 {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * radius;
    return new hz.Vec3(
      base.x + Math.cos(angle) * dist,
      base.y + 0.5, // Slight elevation
      base.z + Math.sin(angle) * dist
    );
  }
}

hz.Component.register(HarvestableTree);
```

**Add to constants.ts:**
```typescript
static readonly HarvestEvents = {
  TreeHit: new NetworkEvent<ITreeHitPayload>('harvest.tree_hit'),
  TreeDepleted: new NetworkEvent<ITreeDepletedPayload>('harvest.tree_depleted'),
  SpawnLog: new NetworkEvent<ISpawnLogPayload>('harvest.spawn_log'), // NEW
};

export type ISpawnLogPayload = {
  position: Vec3;
  itemId: string;
};
```

---

## Phase 4: Log Collection System

### 4.1 Create `CollectableLog.ts`

**Location:** `/scripts/CollectableLog.ts`

This follows your existing `CollectableQuestItem` pattern.

```typescript
import * as hz from "horizon/core";
import { EventsService } from "constants";

export class CollectableLog extends hz.Component<typeof CollectableLog> {
  static propsDefinition = {
    itemId: { type: hz.PropTypes.String, default: "raw_wood_log" },
    autoDespawnSeconds: { type: hz.PropTypes.Number, default: 60 },
  };

  private despawnTimer: number | null = null;

  preStart() {
    // Collection via trigger (player walks over it)
    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnPlayerEnterTrigger,
      (player: hz.Player) => this.collectLog(player)
    );

    // Collection via button press (similar to CollectableQuestItem)
    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnIndexTriggerDown,
      (player: hz.Player) => this.collectLog(player)
    );

    // Auto-despawn after timeout
    if (this.props.autoDespawnSeconds > 0) {
      this.scheduleAutoDespawn();
    }
  }

  start() {}

  private collectLog(player: hz.Player) {
    const rawId: any = (this.entity as any)?.id;
    const entityId = typeof rawId === "bigint" ? rawId.toString() : String(rawId);

    console.log(
      `[CollectableLog] Player ${player.name.get()} collected log (${this.props.itemId})`
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

    // Request despawn via AssetEvents.DestroyAsset (follows your pattern)
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
      console.log(`[CollectableLog] Auto-despawning uncollected log`);
      const rawId: any = (this.entity as any)?.id;
      const entityId = typeof rawId === "bigint" ? rawId.toString() : String(rawId);
      
      this.sendNetworkBroadcastEvent(EventsService.AssetEvents.DestroyAsset, {
        entityId,
        player: this.world.getServerPlayer(),
      });
    }, this.props.autoDespawnSeconds * 1000);
  }
}

hz.Component.register(CollectableLog);
```

---

## Phase 5: Log Spawn Management

### 5.1 Create `LogSpawnManager.ts`

This uses your existing `SpawnManager` pattern with `SpawnController`.

```typescript
import * as hz from "horizon/core";
import { EventsService, ITEM_TYPES } from "constants";

export class LogSpawnManager extends hz.Component<typeof LogSpawnManager> {
  static propsDefinition = {
    logAsset: { type: hz.PropTypes.Asset }, // Asset with CollectableLog script
  };

  private spawnController: hz.SpawnController | null = null;

  preStart() {
    if (!this.props.logAsset) {
      console.error("[LogSpawnManager] Missing logAsset prop!");
      return;
    }

    // Initialize spawn controller
    const position = new hz.Vec3(0, 0, 0);
    const rotation = new hz.Vec3(0, 0, 0);
    const scale = hz.Vec3.one;

    this.spawnController = new hz.SpawnController(
      this.props.logAsset as hz.Asset,
      position,
      rotation,
      scale
    );

    // Listen for spawn requests
    this.connectNetworkBroadcastEvent(
      EventsService.HarvestEvents.SpawnLog,
      (payload) => this.spawnLog(payload)
    );
  }

  async start() {
    // Pre-load asset for performance
    if (this.spawnController) {
      try {
        await this.spawnController.load();
        console.log("[LogSpawnManager] Log asset pre-loaded successfully");
      } catch (e) {
        console.error("[LogSpawnManager] Failed to pre-load asset:", e);
      }
    }
  }

  private async spawnLog(payload: any) {
    const { position, itemId } = payload;

    if (!this.spawnController) {
      console.error("[LogSpawnManager] SpawnController not initialized!");
      return;
    }

    try {
      // Spawn the log at the specified position
      await this.spawnController.spawn();
      
      const spawnedEntities = this.spawnController.rootEntities.get();
      if (spawnedEntities.length > 0) {
        const logEntity = spawnedEntities[0];
        logEntity.position.set(position);

        console.log(
          `[LogSpawnManager] Spawned log at (${position.x}, ${position.y}, ${position.z})`
        );
      }

      // Note: After collection, the log will be unloaded via DestroyAsset event
      // handled by your existing SpawnManager pattern
    } catch (e) {
      console.error("[LogSpawnManager] Failed to spawn log:", e);
    }
  }
}

hz.Component.register(LogSpawnManager);
```

**Alternative: Extend Existing SpawnManager**

If you prefer to use your existing `SpawnManager.ts`, simply:
1. Add `ITEM_TYPES.RAW_WOOD_LOG` to `SPAWNABLE_ITEMS` (already done!)
2. Create a manager entity with `SpawnManager` script
3. Set `itemType = "raw_wood_log"`
4. Trigger spawns via events instead of timer-based spawning

---

## Phase 6: Visual Feedback (Optional but Recommended)

### 6.1 Create `TreeHitFeedback.ts` (Client-side)

**Location:** `/scripts/TreeHitFeedback.ts`

This runs **locally** on the player's client for instant feedback.

```typescript
import * as hz from "horizon/core";
import { EventsService } from "constants";

export class TreeHitFeedback extends hz.Component<typeof TreeHitFeedback> {
  static propsDefinition = {
    localHitSound: { type: hz.PropTypes.Entity },
    localHitVFX: { type: hz.PropTypes.Entity },
  };

  preStart() {
    // Listen for tree hit events
    this.connectNetworkBroadcastEvent(
      EventsService.HarvestEvents.TreeHit,
      (payload) => this.onTreeHit(payload)
    );
  }

  start() {}

  private onTreeHit(payload: any) {
    const { player, treeEntity, healthRemaining } = payload;

    // Only play feedback for the local player
    const localPlayer = this.world.getLocalPlayer();
    if (!localPlayer || player !== localPlayer) return;

    console.log(`[TreeHitFeedback] Tree hit! Health: ${healthRemaining}`);

    // Play local feedback
    try {
      this.props.localHitSound?.as(hz.AudioGizmo)?.play();
      this.props.localHitVFX?.as(hz.ParticleGizmo)?.play();
    } catch {}

    // Optional: Haptic feedback for VR
    try {
      player.sendImpulse(hz.ImpulseStrength.Small, hz.ImpulseType.Impact);
    } catch {}
  }
}

hz.Component.register(TreeHitFeedback);
```

---

## Phase 7: Integration Checklist

### 7.1 Editor Setup

**Tree Entity Setup:**
1. Create tree model entities in your world
2. Add `HarvestableTree` component
3. Set `treeType` prop (e.g., "oak")
4. Attach Audio Gizmos for hit/depleted sounds
5. Attach Particle Gizmos for hit effects
6. Reference the `LogSpawnManager` entity

**Axe Weapon Setup:**
1. Select your axe weapon entity
2. In `BaseWeapon` component:
   - Set `toolType = "axe"`
   - Set `isHarvestTool = true`
   - Set `reach` appropriately (2-3 meters)

**Log Asset Setup:**
1. Create a log collectible asset
2. Add `CollectableLog` component
3. Set `itemId = "raw_wood_log"`
4. Add a Trigger Gizmo (detect Players Only)
5. Save as an Asset Template

**Log Spawn Manager Setup:**
1. Create a manager entity (server-owned)
2. Add `LogSpawnManager` component
3. Assign the log asset template to `logAsset` prop

### 7.2 Quest Integration (Optional)

If you want tree harvesting as a quest objective:

**In `QuestManager.ts`:**
```typescript
// The existing SubmitQuestCollectProgress event will work!
// Just add a quest with:
{
  id: "gather_wood",
  objectives: [
    {
      type: "collect",
      itemId: "raw_wood_log",
      target: 10,
      current: 0
    }
  ]
}
```

Your existing `InventoryDAO` already handles `raw_wood_log` items!

---

## Phase 8: Testing & Validation

### 8.1 Testing Steps

1. **Tool Compatibility Test:**
   - Equip axe → Hit tree → Should register hit
   - Equip sword → Hit tree → Should NOT register hit (optional: play error sound)

2. **Health Depletion Test:**
   - Hit tree 5 times (for oak) → Should become invisible
   - Logs should spawn nearby
   - Wait 30 seconds → Tree should respawn

3. **Collection Test:**
   - Walk over spawned log → Should auto-collect
   - Press index trigger on log → Should collect
   - Check inventory count via `InventoryDAO`

4. **Spawn Manager Test:**
   - Hit multiple trees rapidly
   - Verify no performance lag
   - Check logs despawn after 60 seconds if uncollected

5. **Quest Integration Test:**
   - Start wood-gathering quest
   - Collect logs → Quest progress should update
   - Complete quest → Reward granted

---

## Phase 9: Performance Optimization Tips

1. **Spawn Controller Pre-loading:**
   - Always call `controller.load()` in `start()` to avoid lag on first spawn

2. **Anti-spam Cooldown:**
   - Implemented in `HarvestableTree` (500ms per player)

3. **Auto-despawn:**
   - Logs despawn after 60s to prevent entity buildup

4. **Spawn Cap:**
   - Limit max concurrent logs via spawn manager config

5. **VFX/SFX Optimization:**
   - Use local client-side feedback when possible
   - Pool audio/particle gizmos

---

## Phase 10: Extension Ideas

Once the core system works, consider:

1. **Tool Durability:**
   - Track axe usage in `BaseWeapon`
   - Decrease durability on each tree hit
   - Break/despawn when durability reaches 0

2. **Different Tree Types:**
   - Pine trees (3 hits, 20s regen)
   - Oak trees (5 hits, 30s regen)
   - Rare trees (harder, better loot)

3. **Skill Progression:**
   - Increase harvest speed with player level
   - Unlock better tools

4. **Crafting Integration:**
   - Use `raw_wood_log` in crafting recipes
   - Build structures with wood

5. **Visual States:**
   - Tree model swaps at 50% health (damaged tree)
   - Stump remains when depleted

---

## Summary of Files to Create

| File | Purpose | Authority |
|------|---------|-----------|
| `HarvestableTree.ts` | Tree health, hit detection, spawn logic | Server (Default) |
| `CollectableLog.ts` | Log collection via trigger/button | Spawned Entity |
| `LogSpawnManager.ts` | Manages log spawning with SpawnController | Server (Default) |
| `TreeHitFeedback.ts` (Optional) | Client-side VFX/SFX feedback | Local (Player) |

## Files to Modify

| File | Changes |
|------|---------|
| `BaseWeapon.ts` | Add `toolType` and `isHarvestTool` props |
| `constants.ts` | Add `SpawnLog` event, update `IAttackSwingPayload` |

---

## Final Notes

This system leverages your existing architecture:
- ✅ Uses `SpawnManager` pattern for efficient spawning
- ✅ Uses `InventoryDAO` for persistent inventory
- ✅ Uses `EventsService` for network communication
- ✅ Follows `CollectableQuestItem` pattern for loot
- ✅ Extends `BaseWeapon` for tool classification
- ✅ Compatible with your quest system

The tree harvesting feature integrates seamlessly with your current codebase and follows Horizon Worlds best practices for performance and authority management.

**Ready to implement? Start with Phase 1 (constants) and work through each phase sequentially!**

---

# Appendix: Architecture Adjustment Plan

## Requested Changes

Based on feedback, the following architectural adjustments are needed:

1. **HarvestableTree should be client-side (local script)** - For immediate player feedback and input detection
2. **Tree hit validation and spawning should happen on server** - For authoritative state management and access to player group variables
3. **Logs should drop per-hit (not just on tree depletion)** - Each strike has a chance to drop logs

---

## Revised Architecture

```
┌──────────────────┐                    ┌──────────────────────┐
│  Player + Axe    │──(swing event)────▶│  HarvestableTree     │
│  (BaseWeapon)    │                    │  (Local Client)      │
└──────────────────┘                    └──────────────────────┘
                                                 │
                                                 │ (tree hit request)
                                                 ▼
                                        ┌──────────────────────┐
                                        │ TreeHarvestManager   │
                                        │ (Server Authority)   │
                                        └──────────────────────┘
                                                 │
                          ┌──────────────────────┼──────────────────────┐
                          │                      │                      │
                          ▼                      ▼                      ▼
                  (validate hit)        (roll for loot)      (update tree state)
                          │                      │                      │
                          └──────────────────────┴──────────────────────┘
                                                 │
                                                 ▼
                                        ┌──────────────────────┐
                                        │  LogSpawnManager     │
                                        │  (Server)            │
                                        └──────────────────────┘
                                                 │
                                                 ▼
                                        ┌──────────────────────┐
                                        │  CollectableLog      │
                                        │  (InventoryDAO)      │
                                        └──────────────────────┘
```

---

## Adjustment Plan: Step-by-Step

### Step 1: Split Tree Logic into Client + Server

#### 1.1 Create `HarvestableTree.ts` (Local Client Script)

**Purpose:** Immediate hit detection, visual feedback, and request forwarding to server

**Location:** `/scripts/HarvestableTree.ts`

```typescript
import * as hz from "horizon/core";
import { EventsService, TREE_TYPES } from "constants";

export class HarvestableTree extends hz.Component<typeof HarvestableTree> {
  static propsDefinition = {
    treeType: { type: hz.PropTypes.String, default: "oak" },
    hitSoundGizmo: { type: hz.PropTypes.Entity },
    hitVFXGizmo: { type: hz.PropTypes.Entity },
    depletedSoundGizmo: { type: hz.PropTypes.Entity },
  };

  private lastHitTime: number = 0;
  private hitCooldown: number = 500; // ms

  preStart() {
    // Listen to weapon swings (local only)
    this.connectNetworkBroadcastEvent(
      EventsService.CombatEvents.AttackSwingEvent,
      (payload) => this.onLocalWeaponSwing(payload)
    );

    // Listen to server-validated tree hit responses
    this.connectNetworkBroadcastEvent(
      EventsService.HarvestEvents.TreeHit,
      (payload) => this.onTreeHitConfirmed(payload)
    );

    // Listen to tree depletion
    this.connectNetworkBroadcastEvent(
      EventsService.HarvestEvents.TreeDepleted,
      (payload) => this.onTreeDepleted(payload)
    );

    // Listen to tree regeneration
    this.connectNetworkBroadcastEvent(
      EventsService.HarvestEvents.TreeRegenerated,
      (payload) => this.onTreeRegenerated(payload)
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

    // Play INSTANT local feedback (no server roundtrip delay)
    this.playLocalHitFeedback();

    this.lastHitTime = now;

    // Request server to validate and process the hit
    const treeId = (this.entity as any)?.id?.toString();
    this.sendNetworkBroadcastEvent(EventsService.HarvestEvents.RequestTreeHit, {
      player: localPlayer,
      treeId,
      treeType: this.props.treeType,
      toolType,
      hitPosition: this.entity.position.get(),
    });
  }

  private onTreeHitConfirmed(payload: any) {
    const { treeId, healthRemaining } = payload;
    const myTreeId = (this.entity as any)?.id?.toString();
    
    if (treeId !== myTreeId) return;

    console.log(`[HarvestableTree] Hit confirmed! Health: ${healthRemaining}`);
    // Additional feedback could go here if needed
  }

  private onTreeDepleted(payload: any) {
    const { treeId } = payload;
    const myTreeId = (this.entity as any)?.id?.toString();
    
    if (treeId !== myTreeId) return;

    console.log(`[HarvestableTree] Tree depleted!`);
    
    // Play depletion feedback
    this.playDepletedFeedback();
    
    // Hide tree visually
    try {
      this.entity.visible.set(false);
    } catch {}
  }

  private onTreeRegenerated(payload: any) {
    const { treeId } = payload;
    const myTreeId = (this.entity as any)?.id?.toString();
    
    if (treeId !== myTreeId) return;

    console.log(`[HarvestableTree] Tree regenerated!`);
    
    // Show tree again
    try {
      this.entity.visible.set(true);
    } catch {}
  }

  private playLocalHitFeedback() {
    try {
      this.props.hitSoundGizmo?.as(hz.AudioGizmo)?.play();
      this.props.hitVFXGizmo?.as(hz.ParticleGizmo)?.play();
    } catch {}
  }

  private playDepletedFeedback() {
    try {
      this.props.depletedSoundGizmo?.as(hz.AudioGizmo)?.play();
    } catch {}
  }

  private isPlayerInRange(player: hz.Player, reach: number): boolean {
    const playerPos = player.position.get();
    const treePos = this.entity.position.get();
    const distance = Math.sqrt(
      (playerPos.x - treePos.x) ** 2 +
      (playerPos.y - treePos.y) ** 2 +
      (playerPos.z - treePos.z) ** 2
    );
    return distance <= reach + 2.0; // Add buffer for tree size
  }
}

hz.Component.register(HarvestableTree);
```

---

#### 1.2 Create `TreeHarvestManager.ts` (Server Authority)

**Purpose:** Validate hits, manage tree state, calculate loot drops, access player group variables

**Location:** `/scripts/TreeHarvestManager.ts`

```typescript
import * as hz from "horizon/core";
import { EventsService, TREE_TYPES, HarvestableTreeConfig } from "constants";

interface TreeState {
  currentHealth: number;
  isRegenerating: boolean;
  lastHitByPlayer: Map<string, number>; // Anti-spam per player
}

export class TreeHarvestManager extends hz.Component<typeof TreeHarvestManager> {
  static propsDefinition = {};

  private treeStates: Map<string, TreeState> = new Map();

  preStart() {
    // Listen for tree hit requests from clients
    this.connectNetworkBroadcastEvent(
      EventsService.HarvestEvents.RequestTreeHit,
      (payload) => this.handleTreeHitRequest(payload)
    );
  }

  start() {}

  private handleTreeHitRequest(payload: any) {
    const { player, treeId, treeType, toolType, hitPosition } = payload;

    // Load tree config
    const config = TREE_TYPES[treeType];
    if (!config) {
      console.warn(`[TreeHarvestManager] Unknown tree type: ${treeType}`);
      return;
    }

    // Validate tool compatibility
    if (toolType !== config.toolType) {
      console.log(`[TreeHarvestManager] Wrong tool: ${toolType} (need ${config.toolType})`);
      // TODO: Send error event to player (play "clank" sound)
      return;
    }

    // Get or initialize tree state
    let state = this.treeStates.get(treeId);
    if (!state) {
      state = {
        currentHealth: config.maxHealth,
        isRegenerating: false,
        lastHitByPlayer: new Map(),
      };
      this.treeStates.set(treeId, state);
    }

    // Check if tree is regenerating
    if (state.isRegenerating) {
      console.log(`[TreeHarvestManager] Tree ${treeId} is regenerating`);
      return;
    }

    // Anti-spam check per player
    const playerId = (player as any)?.id?.toString();
    const lastHit = state.lastHitByPlayer.get(playerId) || 0;
    if (Date.now() - lastHit < 500) {
      console.log(`[TreeHarvestManager] Hit spam detected for player ${playerId}`);
      return;
    }
    state.lastHitByPlayer.set(playerId, Date.now());

    // Process hit
    state.currentHealth--;

    console.log(
      `[TreeHarvestManager] Tree ${treeId} hit! Health: ${state.currentHealth}/${config.maxHealth}`
    );

    // Broadcast hit confirmation to all clients
    this.sendNetworkBroadcastEvent(EventsService.HarvestEvents.TreeHit, {
      player,
      treeId,
      hitPosition,
      healthRemaining: state.currentHealth,
    });

    // *** PER-HIT LOOT DROP ***
    this.rollForLogDrop(config, hitPosition, player);

    // Check if tree is depleted
    if (state.currentHealth <= 0) {
      this.handleTreeDepletion(treeId, config, state, hitPosition, player);
    }
  }

  private rollForLogDrop(
    config: HarvestableTreeConfig,
    position: hz.Vec3,
    player: hz.Player
  ) {
    // Roll for drop chance per hit (adjust as needed)
    const dropChancePerHit = 0.3; // 30% chance per hit
    
    if (Math.random() < dropChancePerHit) {
      const dropCount = 1; // Drop 1 log per successful roll
      
      console.log(`[TreeHarvestManager] Dropping ${dropCount} log(s)`);
      
      for (let i = 0; i < dropCount; i++) {
        const offsetPos = this.getScatteredPosition(position, 1.5);
        this.sendNetworkBroadcastEvent(EventsService.HarvestEvents.SpawnLog, {
          position: offsetPos,
          itemId: config.logItemId,
        });
      }
    }
  }

  private handleTreeDepletion(
    treeId: string,
    config: HarvestableTreeConfig,
    state: TreeState,
    position: hz.Vec3,
    player: hz.Player
  ) {
    console.log(`[TreeHarvestManager] Tree ${treeId} depleted!`);

    state.isRegenerating = true;

    // Broadcast depletion to all clients
    this.sendNetworkBroadcastEvent(EventsService.HarvestEvents.TreeDepleted, {
      player,
      treeId,
      position,
    });

    // Optional: Spawn bonus logs on depletion (reward for full clear)
    const bonusLogCount = Math.floor(Math.random() * 2) + 1; // 1-2 bonus logs
    console.log(`[TreeHarvestManager] Spawning ${bonusLogCount} bonus log(s)`);
    
    for (let i = 0; i < bonusLogCount; i++) {
      const offsetPos = this.getScatteredPosition(position, 1.5);
      this.sendNetworkBroadcastEvent(EventsService.HarvestEvents.SpawnLog, {
        position: offsetPos,
        itemId: config.logItemId,
      });
    }

    // Schedule regeneration
    this.async.setTimeout(() => {
      this.regenerateTree(treeId, config, state);
    }, config.regenTimeMs);
  }

  private regenerateTree(
    treeId: string,
    config: HarvestableTreeConfig,
    state: TreeState
  ) {
    console.log(`[TreeHarvestManager] Tree ${treeId} regenerated!`);

    state.currentHealth = config.maxHealth;
    state.isRegenerating = false;
    state.lastHitByPlayer.clear();

    // Broadcast regeneration to all clients
    this.sendNetworkBroadcastEvent(EventsService.HarvestEvents.TreeRegenerated, {
      treeId,
    });
  }

  private getScatteredPosition(base: hz.Vec3, radius: number): hz.Vec3 {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * radius;
    return new hz.Vec3(
      base.x + Math.cos(angle) * dist,
      base.y + 0.5, // Slight elevation
      base.z + Math.sin(angle) * dist
    );
  }
}

hz.Component.register(TreeHarvestManager);
```

---

### Step 2: Update Event Definitions

#### 2.1 Add New Events to `constants.ts`

```typescript
static readonly HarvestEvents = {
  // Client -> Server: Request to hit a tree
  RequestTreeHit: new NetworkEvent<IRequestTreeHitPayload>('harvest.request_tree_hit'),
  
  // Server -> All Clients: Tree was hit (confirmed)
  TreeHit: new NetworkEvent<ITreeHitPayload>('harvest.tree_hit'),
  
  // Server -> All Clients: Tree depleted
  TreeDepleted: new NetworkEvent<ITreeDepletedPayload>('harvest.tree_depleted'),
  
  // Server -> All Clients: Tree regenerated
  TreeRegenerated: new NetworkEvent<ITreeRegeneratedPayload>('harvest.tree_regenerated'),
  
  // Server -> LogSpawnManager: Spawn a log
  SpawnLog: new NetworkEvent<ISpawnLogPayload>('harvest.spawn_log'),
};

// New type definitions
export type IRequestTreeHitPayload = {
  player: Player;
  treeId: string;
  treeType: string;
  toolType: string;
  hitPosition: Vec3;
};

export type ITreeHitPayload = {
  player: Player;
  treeId: string;
  hitPosition: Vec3;
  healthRemaining: number;
};

export type ITreeDepletedPayload = {
  player: Player;
  treeId: string;
  position: Vec3;
};

export type ITreeRegeneratedPayload = {
  treeId: string;
};

export type ISpawnLogPayload = {
  position: Vec3;
  itemId: string;
};
```

---

### Step 3: Update Tree Configuration for Per-Hit Drops

#### 3.1 Modify `HarvestableTreeConfig` in `constants.ts`

```typescript
export interface HarvestableTreeConfig {
  treeType: TREES;
  toolType: string; // e.g., "axe", "hatchet"
  maxHealth: number;
  
  // Per-hit drop config (NEW)
  dropChancePerHit: number; // 0.0 to 1.0 (chance per hit)
  minDropsPerHit: number;   // Min logs per successful hit
  maxDropsPerHit: number;   // Max logs per successful hit
  
  // Bonus drops on full depletion (NEW)
  bonusDropsOnDepletion?: {
    minDrops: number;
    maxDrops: number;
  };
  
  regenTimeMs: number; // Time before tree can be harvested again
  logItemId: string; // References ITEMS
}

export const TREE_TYPES: { [key: string]: HarvestableTreeConfig } = {
  [TREES.OAK]: {
    treeType: TREES.OAK,
    toolType: 'axe',
    maxHealth: 5, // 5 hits to chop down
    
    // 30% chance per hit to drop 1 log
    dropChancePerHit: 0.3,
    minDropsPerHit: 1,
    maxDropsPerHit: 1,
    
    // Bonus: 1-2 logs on full depletion
    bonusDropsOnDepletion: {
      minDrops: 1,
      maxDrops: 2
    },
    
    regenTimeMs: 30000, // 30 seconds
    logItemId: ITEM_TYPES.RAW_WOOD_LOG
  },
  [TREES.PINE]: {
    treeType: TREES.PINE,
    toolType: 'axe',
    maxHealth: 3, // Easier tree
    
    // 40% chance per hit to drop 1 log (more generous)
    dropChancePerHit: 0.4,
    minDropsPerHit: 1,
    maxDropsPerHit: 1,
    
    bonusDropsOnDepletion: {
      minDrops: 0,
      maxDrops: 1
    },
    
    regenTimeMs: 20000,
    logItemId: ITEM_TYPES.RAW_WOOD_LOG
  }
};
```

---

### Step 4: Update Drop Logic in TreeHarvestManager

#### 4.1 Revise `rollForLogDrop` Method

Replace the hardcoded logic with config-driven logic:

```typescript
private rollForLogDrop(
  config: HarvestableTreeConfig,
  position: hz.Vec3,
  player: hz.Player
) {
  // Use config-defined drop chance
  if (Math.random() < config.dropChancePerHit) {
    // Determine drop quantity
    const dropCount = Math.floor(
      Math.random() * (config.maxDropsPerHit - config.minDropsPerHit + 1)
    ) + config.minDropsPerHit;
    
    console.log(`[TreeHarvestManager] Dropping ${dropCount} log(s) from hit`);
    
    for (let i = 0; i < dropCount; i++) {
      const offsetPos = this.getScatteredPosition(position, 1.5);
      this.sendNetworkBroadcastEvent(EventsService.HarvestEvents.SpawnLog, {
        position: offsetPos,
        itemId: config.logItemId,
      });
    }
  }
}
```

#### 4.2 Revise Bonus Drop Logic in `handleTreeDepletion`

```typescript
private handleTreeDepletion(
  treeId: string,
  config: HarvestableTreeConfig,
  state: TreeState,
  position: hz.Vec3,
  player: hz.Player
) {
  console.log(`[TreeHarvestManager] Tree ${treeId} depleted!`);

  state.isRegenerating = true;

  this.sendNetworkBroadcastEvent(EventsService.HarvestEvents.TreeDepleted, {
    player,
    treeId,
    position,
  });

  // Spawn bonus logs on depletion (if configured)
  if (config.bonusDropsOnDepletion) {
    const bonusLogCount = Math.floor(
      Math.random() * 
      (config.bonusDropsOnDepletion.maxDrops - config.bonusDropsOnDepletion.minDrops + 1)
    ) + config.bonusDropsOnDepletion.minDrops;
    
    if (bonusLogCount > 0) {
      console.log(`[TreeHarvestManager] Spawning ${bonusLogCount} bonus log(s)`);
      
      for (let i = 0; i < bonusLogCount; i++) {
        const offsetPos = this.getScatteredPosition(position, 1.5);
        this.sendNetworkBroadcastEvent(EventsService.HarvestEvents.SpawnLog, {
          position: offsetPos,
          itemId: config.logItemId,
        });
      }
    }
  }

  // Schedule regeneration
  this.async.setTimeout(() => {
    this.regenerateTree(treeId, config, state);
  }, config.regenTimeMs);
}
```

---

### Step 5: Editor Setup Changes

#### 5.1 Tree Entity Setup (Revised)

1. **Add `HarvestableTree` component** (now runs locally on each client)
   - Set `treeType` prop (e.g., "oak")
   - Attach Audio/Particle Gizmos
   - ⚠️ **Set component authority to "Local"** (not Server)

2. **Set tree entity ownership:**
   - Tree entity itself should be **Server-owned** (for consistent position/state)
   - Only the `HarvestableTree` script runs locally

#### 5.2 TreeHarvestManager Setup (NEW)

1. Create a single **server-owned manager entity** in your world
2. Add `TreeHarvestManager` component
3. This manager will handle ALL trees in the world
4. No per-tree configuration needed

---

### Step 6: Benefits of This Architecture

| Aspect | Benefit |
|--------|--------|
| **Client-side HarvestableTree** | Instant visual/audio feedback, no network latency |
| **Server-side TreeHarvestManager** | Authoritative validation, anti-cheat, access to player group vars |
| **Per-hit drops** | More engaging gameplay, progressive resource gain |
| **Configurable drop rates** | Easy balancing via `constants.ts` |
| **Centralized manager** | Single point of truth for all tree states |
| **Scalable** | Manager can track hundreds of trees without duplication |

---

### Step 7: Testing Checklist (Revised)

1. **Instant Feedback Test:**
   - Hit tree → Should hear/see feedback IMMEDIATELY (no server lag)
   - Hit tree rapidly → Cooldown prevents spam

2. **Drop Rate Test:**
   - Hit oak tree 10 times → Expect ~3 logs (30% drop rate)
   - Hit pine tree 10 times → Expect ~4 logs (40% drop rate)

3. **Bonus Drop Test:**
   - Fully deplete oak tree → Should drop 1-2 bonus logs
   - Count total logs from 5 hits + bonus → Should be ~3-4 total

4. **Server Authority Test:**
   - Disconnect/reconnect during harvest → Tree state should persist
   - Two players hit same tree → Health decreases correctly

5. **Player Group Variable Access:**
   - (Future) Implement server-side bonus based on player group
   - E.g., VIP players get 2x drop rate

---

## Summary of Changes

| Component | Original | Revised |
|-----------|----------|----------|
| **HarvestableTree** | Server-owned, handles everything | Local client script, immediate feedback only |
| **Tree State Management** | In HarvestableTree | NEW: TreeHarvestManager (server) |
| **Loot Drop Timing** | Only on tree depletion | Per-hit + bonus on depletion |
| **Drop Calculation** | In HarvestableTree | In TreeHarvestManager (server) |
| **Authority** | Single server component | Split: Client (input) + Server (validation) |

---

## Files to Create (Revised)

| File | Purpose | Authority |
|------|---------|----------|
| `HarvestableTree.ts` | Local hit detection, instant feedback | **Local (Player)** |
| `TreeHarvestManager.ts` | Authoritative tree state, loot drops | **Server (Default)** |
| `CollectableLog.ts` | Log collection (unchanged) | Spawned Entity |
| `LogSpawnManager.ts` | Log spawning (unchanged) | Server (Default) |

## Files to Modify (Revised)

| File | Changes |
|------|---------|
| `BaseWeapon.ts` | Add `toolType` and `isHarvestTool` props |
| `constants.ts` | Add `RequestTreeHit`, `TreeRegenerated` events; update config for per-hit drops |

---

**This revised architecture provides the best of both worlds: instant client-side feedback with authoritative server-side validation and flexible per-hit loot drops!**
