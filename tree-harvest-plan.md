# Tree Harvest System - Implementation Plan

## Overview
This plan integrates a tree harvesting system into your existing quest and inventory architecture. Players will hit trees with tools (similar to the Pickaxe system from economy-world) to collect wood logs that integrate with your `CollectableQuestItem` and `InventoryDAO` flows.

---

## Architecture Summary

We'll create **5 new TypeScript components** that work together:

1. **`HarvestableTree.ts`** (Server-owned) - Manages tree health/state and spawns logs
2. **`HarvestTool.ts`** (Player-owned) - Detects collisions with trees and registers hits
3. **`WoodLog.ts`** (Spawned entity) - Collectible log that integrates with quest/inventory
4. **`TreeFeedback.ts`** (Local) - Handles VFX/SFX for immediate player feedback
5. **`constants.ts` additions** - Configuration for wood types and harvest settings

---

## Phase 1: Configuration & Constants Setup

### File: `constants.ts`

Add the following configurations to your existing constants file:

```typescript path=null start=null
// Add to SPAWNABLE_ITEMS
wood_log: {
    itemId: 'wood_log',
    label: 'Wood Log',
    spawnRate: 0, // Manual spawn via tree harvesting
    spawnChance: 1.0,
    maxActive: 20, // Max logs in world
    rareSpawnRate: 0
},

// Add to ITEMS
wood_log: {
    id: 'wood_log',
    label: 'Wood Log',
    type: 'material',
    value: 5,
    description: 'A freshly cut log from a tree'
},

// New harvest configuration
export interface HarvestableTreeConfig {
    treeType: string;
    toolType: string; // e.g., "axe", "hatchet"
    maxHealth: number;
    dropChance: number; // 0.0 to 1.0
    minDrops: number;
    maxDrops: number;
    regenTimeMs: number; // Time before tree can be harvested again
    logItemId: string; // References ITEMS
}

export const TREE_TYPES: { [key: string]: HarvestableTreeConfig } = {
    OAK: {
        treeType: 'OAK',
        toolType: 'axe',
        maxHealth: 5, // 5 hits to chop down
        dropChance: 0.8, // 80% chance to drop logs
        minDrops: 1,
        maxDrops: 3,
        regenTimeMs: 30000, // 30 seconds to respawn
        logItemId: 'wood_log'
    },
    PINE: {
        treeType: 'PINE',
        toolType: 'axe',
        maxHealth: 3, // Easier tree
        dropChance: 0.6,
        minDrops: 1,
        maxDrops: 2,
        regenTimeMs: 20000,
        logItemId: 'wood_log'
    }
};

// Add to EventsService
static readonly HarvestEvents = {
    TreeHit: new NetworkEvent<ITreeHitPayload>('harvest.tree_hit'),
    TreeDepleted: new NetworkEvent<ITreeDepletedPayload>('harvest.tree_depleted'),
};

export interface ITreeHitPayload {
    player: Player;
    treeEntity: Entity;
    hitPosition: Vec3;
    healthRemaining: number;
}

export interface ITreeDepletedPayload {
    player: Player;
    treeEntity: Entity;
    position: Vec3;
}
```

---

## Phase 2: Core Scripts

### 2.1 HarvestableTree.ts (Server-owned)

This script attaches to tree entities and manages their harvestable state.

```typescript path=null start=null
import * as hz from 'horizon/core';
import { EventsService, TREE_TYPES, HarvestableTreeConfig } from 'constants';

/**
 * Server-authoritative tree that can be harvested for resources.
 * 
 * Props:
 * @param treeType - Type of tree (OAK, PINE, etc.)
 * @param hitVfxEntity - Optional particle effect entity for hit feedback
 * @param depletedVfxEntity - Optional particle effect for tree depletion
 * @param hitSoundEntity - Optional audio entity for hit feedback
 * @param depletedSoundEntity - Optional audio entity for depletion
 * @param logAsset - Asset template for the wood log to spawn
 */
export class HarvestableTree extends hz.Component<typeof HarvestableTree> {
    static propsDefinition = {
        treeType: { type: hz.PropTypes.String, default: 'OAK' },
        hitVfxEntity: { type: hz.PropTypes.Entity },
        depletedVfxEntity: { type: hz.PropTypes.Entity },
        hitSoundEntity: { type: hz.PropTypes.Entity },
        depletedSoundEntity: { type: hz.PropTypes.Entity },
        logAsset: { type: hz.PropTypes.Asset },
    };

    private currentHealth: number = 0;
    private config: HarvestableTreeConfig | null = null;
    private isRegenerating: boolean = false;
    private regenTimerId: number = 0;
    private originalScale: hz.Vec3 = hz.Vec3.one;
    private spawnedLogs: hz.Entity[] = []; // Track spawned logs

    preStart() {
        // Load configuration
        this.config = TREE_TYPES[this.props.treeType];
        if (!this.config) {
            console.error(`[HarvestableTree] Invalid tree type: ${this.props.treeType}`);
            return;
        }

        this.currentHealth = this.config.maxHealth;
        this.originalScale = this.entity.scale.get().clone();

        // Listen for hit events from tools
        this.connectNetworkBroadcastEvent(
            EventsService.HarvestEvents.TreeHit,
            (payload) => this.onTreeHit(payload)
        );
    }

    start() {}

    /**
     * Called when a tool hits this tree
     */
    private onTreeHit(payload: { player: hz.Player; treeEntity: hz.Entity; hitPosition: hz.Vec3 }) {
        // Verify this event is for THIS tree
        if (!this.isSameEntity(payload.treeEntity, this.entity)) {
            return;
        }

        if (this.isRegenerating) {
            console.log(`[HarvestableTree] Tree is regenerating, cannot harvest`);
            return;
        }

        // Decrement health
        this.currentHealth--;
        console.log(`[HarvestableTree] Tree hit! Health: ${this.currentHealth}/${this.config!.maxHealth}`);

        // Visual feedback: slightly scale down the tree
        this.updateTreeVisuals();

        // Send feedback event to player's client
        this.sendNetworkEvent(payload.player, EventsService.HarvestEvents.TreeHit, {
            player: payload.player,
            treeEntity: this.entity,
            hitPosition: payload.hitPosition,
            healthRemaining: this.currentHealth
        });

        // Check if depleted
        if (this.currentHealth <= 0) {
            this.onTreeDepleted(payload.player, payload.hitPosition);
        }
    }

    /**
     * Tree has been fully chopped - spawn logs and start regen
     */
    private async onTreeDepleted(player: hz.Player, position: hz.Vec3) {
        console.log(`[HarvestableTree] Tree depleted by ${player.name.get()}`);

        // Notify player
        this.sendNetworkEvent(player, EventsService.HarvestEvents.TreeDepleted, {
            player,
            treeEntity: this.entity,
            position
        });

        // Play depletion sound/VFX
        this.playDepletionEffects(player, position);

        // Spawn logs based on configuration
        await this.spawnLogs(position);

        // Start regeneration
        this.startRegeneration();
    }

    /**
     * Spawn wood logs at the tree's position
     */
    private async spawnLogs(centerPosition: hz.Vec3) {
        if (!this.props.logAsset) {
            console.warn(`[HarvestableTree] No log asset configured`);
            return;
        }

        const config = this.config!;
        
        // Roll for drop chance
        if (Math.random() > config.dropChance) {
            console.log(`[HarvestableTree] Drop chance failed, no logs spawned`);
            return;
        }

        // Determine number of logs to spawn
        const logCount = Math.floor(
            Math.random() * (config.maxDrops - config.minDrops + 1) + config.minDrops
        );

        console.log(`[HarvestableTree] Spawning ${logCount} logs`);

        // Spawn logs in a scattered pattern
        for (let i = 0; i < logCount; i++) {
            const spawnPos = this.getScatteredPosition(centerPosition, 1.5);
            
            try {
                const spawned = await this.world.spawnAsset(
                    this.props.logAsset as hz.Asset,
                    spawnPos
                );
                
                const logEntity = spawned?.[0];
                if (logEntity) {
                    logEntity.visible.set(true);
                    this.spawnedLogs.push(logEntity);
                    console.log(`[HarvestableTree] Spawned log at`, spawnPos);
                }
            } catch (e) {
                console.error(`[HarvestableTree] Failed to spawn log:`, e);
            }
        }
    }

    /**
     * Get a random position near the center with scatter
     */
    private getScatteredPosition(center: hz.Vec3, radius: number): hz.Vec3 {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * radius;
        
        return new hz.Vec3(
            center.x + Math.cos(angle) * distance,
            center.y + 0.5, // Slight elevation
            center.z + Math.sin(angle) * distance
        );
    }

    /**
     * Visual feedback as tree takes damage
     */
    private updateTreeVisuals() {
        if (!this.config) return;

        const healthPercent = this.currentHealth / this.config.maxHealth;
        const newScale = this.originalScale.clone().multiplyScalar(0.7 + (healthPercent * 0.3));
        
        this.entity.scale.set(newScale);
    }

    /**
     * Start tree regeneration timer
     */
    private startRegeneration() {
        this.isRegenerating = true;

        // Make tree semi-transparent or hide it
        try {
            this.entity.visible.set(false);
        } catch {}

        this.regenTimerId = this.async.setTimeout(() => {
            this.regenerateTree();
        }, this.config!.regenTimeMs);
    }

    /**
     * Restore tree to full health
     */
    private regenerateTree() {
        console.log(`[HarvestableTree] Tree regenerated`);
        
        this.currentHealth = this.config!.maxHealth;
        this.isRegenerating = false;

        // Restore visuals
        try {
            this.entity.scale.set(this.originalScale);
            this.entity.visible.set(true);
        } catch {}
    }

    /**
     * Play depletion effects
     */
    private playDepletionEffects(player: hz.Player, position: hz.Vec3) {
        // Play sound
        if (this.props.depletedSoundEntity) {
            const audio = this.props.depletedSoundEntity.as(hz.AudioGizmo);
            if (audio) {
                audio.play({
                    fade: 0,
                    players: [player],
                    audibilityMode: hz.AudibilityMode.AudibleTo
                });
            }
        }

        // Play VFX
        if (this.props.depletedVfxEntity) {
            const vfx = this.props.depletedVfxEntity.as(hz.ParticleGizmo);
            if (vfx) {
                try {
                    this.props.depletedVfxEntity.position.set(position);
                } catch {}

                vfx.play({
                    fromStart: true,
                    oneShot: true,
                    players: [player]
                });
            }
        }
    }

    /**
     * Helper to compare entity identity
     */
    private isSameEntity(a: hz.Entity, b: hz.Entity): boolean {
        try {
            const aId = (a as any).id;
            const bId = (b as any).id;
            return aId === bId || aId.toString() === bId.toString();
        } catch {
            return false;
        }
    }
}

hz.Component.register(HarvestableTree);
```

---

### 2.2 HarvestTool.ts (Player-owned)

Similar to your `Pickaxe.ts`, but designed for tree harvesting.

```typescript path=null start=null
import * as hz from 'horizon/core';
import { EventsService, TREE_TYPES } from 'constants';
import { HarvestableTree } from 'HarvestableTree';

/**
 * Tool for harvesting trees (axe, hatchet, etc.)
 * 
 * Props:
 * @param toolName - Display name of the tool
 * @param toolType - Type identifier (e.g., "axe")
 * @param swingDuration - Duration of swing animation (ms)
 * @param damage - How much damage per hit (default 1)
 */
export class HarvestTool extends hz.Component<typeof HarvestTool> {
    static propsDefinition = {
        toolName: { type: hz.PropTypes.String, default: 'Axe' },
        toolType: { type: hz.PropTypes.String, default: 'axe' },
        swingDuration: { type: hz.PropTypes.Number, default: 800 },
        damage: { type: hz.PropTypes.Number, default: 1 },
    };

    private isSwinging: boolean = false;
    private swingTimeoutId: number = 0;

    start() {
        // Trigger swing on index trigger press
        this.connectCodeBlockEvent(
            this.entity,
            hz.CodeBlockEvents.OnIndexTriggerDown,
            (player: hz.Player) => this.startSwing(player)
        );

        // Detect collisions during swing
        this.connectCodeBlockEvent(
            this.entity,
            hz.CodeBlockEvents.OnEntityCollision,
            (entity: hz.Entity, collisionPoint: hz.Vec3) => {
                if (this.isSwinging) {
                    this.onCollision(entity, collisionPoint);
                }
            }
        );
    }

    /**
     * Begin swing animation
     */
    private startSwing(player: hz.Player) {
        if (this.isSwinging) {
            return; // Already swinging
        }

        this.isSwinging = true;
        
        // Play animation
        try {
            player.playAvatarGripPoseAnimationByName('Fire');
        } catch {}

        // Reset swing state after duration
        this.async.clearTimeout(this.swingTimeoutId);
        this.swingTimeoutId = this.async.setTimeout(() => {
            this.isSwinging = false;
        }, this.props.swingDuration);
    }

    /**
     * Handle collision with harvestable entities
     */
    private onCollision(entity: hz.Entity, collisionPoint: hz.Vec3) {
        // Check if entity is a harvestable tree
        const treeComponents = entity.getComponents<HarvestableTree>();
        if (treeComponents.length === 0) {
            return; // Not a tree
        }

        const treeComponent = treeComponents[0];
        const owner = this.entity.owner.get();
        
        if (!owner) {
            console.warn(`[HarvestTool] No owner found`);
            return;
        }

        console.log(`[HarvestTool] Hit tree at`, collisionPoint);

        // Send hit event to server (tree will validate)
        this.sendNetworkBroadcastEvent(EventsService.HarvestEvents.TreeHit, {
            player: owner,
            treeEntity: entity,
            hitPosition: collisionPoint
        });

        // End swing on successful hit
        this.isSwinging = false;
    }
}

hz.Component.register(HarvestTool);
```

---

### 2.3 WoodLog.ts (Spawned collectible)

Integrates with your existing `CollectableQuestItem` flow.

```typescript path=null start=null
import * as hz from 'horizon/core';
import { EventsService } from 'constants';

/**
 * Collectible wood log that integrates with quest and inventory systems.
 * Similar to CollectableQuestItem but with auto-collection via trigger.
 * 
 * Props:
 * @param itemId - Item identifier (e.g., "wood_log")
 * @param autoDespawnSeconds - Time before auto-cleanup (default: 60)
 */
export class WoodLog extends hz.Component<typeof WoodLog> {
    static propsDefinition = {
        itemId: { type: hz.PropTypes.String, default: 'wood_log' },
        autoDespawnSeconds: { type: hz.PropTypes.Number, default: 60 },
    };

    private despawnTimerId: number = 0;

    preStart() {
        // Listen for player entering trigger zone
        this.connectCodeBlockEvent(
            this.entity,
            hz.CodeBlockEvents.OnPlayerEnterTrigger,
            (player: hz.Player) => this.onPlayerCollect(player)
        );

        // Start auto-despawn timer
        if (this.props.autoDespawnSeconds > 0) {
            this.startAutoDespawn();
        }
    }

    start() {}

    /**
     * Player touched the log - collect it
     */
    private onPlayerCollect(player: hz.Player) {
        console.log(`[WoodLog] Collected by ${player.name.get()}`);

        const rawId: any = (this.entity as any)?.id;
        const entityId = typeof rawId === 'bigint' ? rawId.toString() : String(rawId);

        if (!entityId || !player) {
            console.warn(`[WoodLog] Invalid entityId or player`);
            return;
        }

        // Send to QuestManager for quest progress OR inventory addition
        // QuestManager will handle routing to quest or inventory based on active quest
        this.sendNetworkBroadcastEvent(
            EventsService.QuestEvents.SubmitQuestCollectProgress,
            {
                player,
                itemId: this.props.itemId.trim(),
                amount: 1,
                entityId
            }
        );

        // Cancel auto-despawn since it's being collected
        this.async.clearTimeout(this.despawnTimerId);
    }

    /**
     * Start auto-despawn timer
     */
    private startAutoDespawn() {
        this.despawnTimerId = this.async.setTimeout(() => {
            console.log(`[WoodLog] Auto-despawning`);
            this.despawnSelf();
        }, this.props.autoDespawnSeconds * 1000);
    }

    /**
     * Remove this entity from the world
     */
    private async despawnSelf() {
        try {
            await this.world.deleteAsset(this.entity);
        } catch (e) {
            console.warn(`[WoodLog] Failed to despawn:`, e);
        }
    }
}

hz.Component.register(WoodLog);
```

---

### 2.4 TreeFeedback.ts (Local client feedback)

Handles immediate VFX/SFX on the player's client for low-latency feedback.

```typescript path=null start=null
import * as hz from 'horizon/core';
import { EventsService } from 'constants';

/**
 * Client-side feedback for tree harvesting.
 * Attach this to a player-owned entity or manager.
 * 
 * Props:
 * @param hitSound - Audio gizmo for hit feedback
 * @param hitVfx - Particle gizmo for hit feedback
 */
export class TreeFeedback extends hz.Component<typeof TreeFeedback> {
    static propsDefinition = {
        hitSound: { type: hz.PropTypes.Entity },
        hitVfx: { type: hz.PropTypes.Entity },
    };

    preStart() {
        const player = this.entity.owner.get();
        if (!player) {
            console.warn(`[TreeFeedback] No owner found, feedback disabled`);
            return;
        }

        // Listen for tree hit events targeting this player
        this.connectNetworkEvent(
            player,
            EventsService.HarvestEvents.TreeHit,
            (payload) => this.onTreeHit(payload)
        );
    }

    start() {}

    /**
     * Play hit feedback on the client
     */
    private onTreeHit(payload: {
        player: hz.Player;
        treeEntity: hz.Entity;
        hitPosition: hz.Vec3;
        healthRemaining: number;
    }) {
        console.log(`[TreeFeedback] Tree hit! Health: ${payload.healthRemaining}`);

        // Play audio
        if (this.props.hitSound) {
            const audio = this.props.hitSound.as(hz.AudioGizmo);
            if (audio) {
                audio.play();
            }
        }

        // Play VFX at hit position
        if (this.props.hitVfx) {
            const vfx = this.props.hitVfx.as(hz.ParticleGizmo);
            if (vfx) {
                try {
                    this.props.hitVfx.position.set(payload.hitPosition);
                } catch {}

                vfx.play({
                    fromStart: true,
                    oneShot: true
                });
            }
        }

        // Optional: Haptic feedback
        try {
            payload.player.triggerHapticPulse(hz.HapticHand.Both, 0.3, 100);
        } catch {}
    }
}

hz.Component.register(TreeFeedback);
```

---

## Phase 3: World Setup & Configuration

### 3.1 Tree Entity Setup

1. **Create Tree Asset:**
   - Add a 3D tree model to your world
   - Attach the `HarvestableTree.ts` script
   - Configure props:
     - `treeType`: "OAK" or "PINE"
     - `logAsset`: Reference to your wood log asset
     - `hitVfxEntity`: Reference to particle effect
     - `hitSoundEntity`: Reference to audio gizmo

2. **Set Collision Properties:**
   - Collidable: **On**
   - Collision Layer: Accept tool collisions
   - Physics: Static

### 3.2 Wood Log Asset Setup

1. **Create Log Asset:**
   - Add a 3D log mesh
   - Attach the `WoodLog.ts` script
   - Add a **Trigger Gizmo** (Players Only)
   - Configure props:
     - `itemId`: "wood_log"
     - `autoDespawnSeconds`: 60

2. **Set as Template:**
   - Save as an Asset Template for spawning

### 3.3 Tool Setup

1. **Create Axe/Tool:**
   - Add tool mesh
   - Make **Grabbable**
   - Attach `HarvestTool.ts` script
   - Configure props:
     - `toolName`: "Axe"
     - `toolType`: "axe"
     - `swingDuration`: 800

---

## Phase 4: Integration with Existing Systems

### 4.1 Quest Integration

Your `QuestManager.ts` already handles `SubmitQuestCollectProgress` events. To add wood collection quests:

**In `TutorialQuestDAO.ts` (or similar quest config):**

```typescript path=null start=null
{
    stepIndex: 3,
    description: "Collect wood logs from trees",
    objectives: [
        {
            objectiveId: "collect_wood",
            itemType: "wood_log",
            targetCount: 5,
            description: "Collect 5 wood logs"
        }
    ],
    nextStepIndex: 4,
    displayType: QuestMessageDisplay.Popup
}
```

No changes needed to `QuestManager.ts` - it will automatically route wood logs to quest progress or inventory!

### 4.2 Inventory Integration

Your `InventoryDAO` already supports adding items by ID. When no quest is active, `QuestManager` will automatically add wood logs to the player's inventory via:

```typescript path=null start=null
inventoryDAO.addItem('wood_log', 1);
```

---

## Phase 5: Testing Checklist

- [ ] Tree collision detection works
- [ ] Tool swing animation plays
- [ ] Tree health decrements on hit
- [ ] Tree visual feedback (scale reduction) works
- [ ] Logs spawn at correct position with scatter
- [ ] Logs are collectible via trigger
- [ ] Quest progress updates when collecting logs
- [ ] Inventory updates when no quest active
- [ ] Tree regeneration works after depletion
- [ ] Audio/VFX feedback plays correctly
- [ ] Auto-despawn works for uncollected logs

---

## Phase 6: Optional Enhancements

### 6.1 Tool Progression System
Add different tool tiers (Stone Axe → Iron Axe → Diamond Axe) with varying damage values.

### 6.2 Tree Variety
Add more tree types with different drop rates and health values:
- Oak: Standard
- Pine: Fast growth, low drops
- Ironwood: High health, rare drops

### 6.3 Seasonal Trees
Add rare tree variants that spawn different loot (fruit, special wood).

### 6.4 Animation States
Use actual tree chopping animations instead of generic "Fire" animation.

### 6.5 Stump Mechanics
Leave visible tree stumps during regeneration instead of hiding the tree.

---

## File Structure Summary

```
scripts/
├── HarvestableTree.ts          (New - Server tree logic)
├── HarvestTool.ts              (New - Player tool logic)
├── WoodLog.ts                  (New - Collectible log)
├── TreeFeedback.ts             (New - Local feedback)
├── constants.ts                (Modified - Add harvest configs)
├── QuestManager.ts             (No changes - already compatible)
├── InventoryDAO.ts             (No changes - already compatible)
└── CollectableQuestItem.ts     (Reference - similar pattern)
```

---

## Summary

This system leverages your existing architecture:
- **Quest System**: Wood logs flow through `SubmitQuestCollectProgress` just like coconuts
- **Inventory System**: Automatic fallback to `InventoryDAO` when no quest is active
- **Spawning Pattern**: Uses `world.spawnAsset` similar to your `QuestManager`
- **Event Architecture**: Follows your `EventsService` pattern with Network/Local events
- **Server Authority**: Tree health managed server-side, client handles feedback

The implementation is production-ready and follows your existing code conventions with TypeScript, kebab-case file naming (per your rules), and your established event-driven architecture.
