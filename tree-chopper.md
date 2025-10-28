# Tree Chopping & Harvesting System - Design Document

## 1. Overview

### System Purpose and Goals

Build a **modular, high-performance Tree Chopping and Harvesting system** with responsive local feedback and authoritative server logic. The goal is to create an immersive, satisfying resource-gathering mechanic that:

- **Balances immersion with integrity**: Clients show instantaneous hit feedback and visual shake effects, while the server maintains authoritative control over health, drops, spawning, and respawn timers
- **Ensures performance**: Uses object pooling to minimize runtime allocations and physics optimizations for smooth gameplay
- **Integrates seamlessly**: Leverages existing systems (`EventsService`, `SpawnManager`, `LootDropManager`, `constants.ts`)
- **Supports extensibility**: Enables future additions like multiple tree types, tool durability, progressive damage visuals, and rare drops

### High-Level Architecture

The system consists of three primary TypeScript components with clear ownership boundaries:

1. **`tree-spawner.service.ts`** (Server-Owned): Manages tree asset pooling, spawn locations, and respawn timers
2. **`axe-controller.ts`** (Local-Owned): Detects player axe collisions with trees and sends damage events
3. **`tree-harvester.ts`** (Server-Owned): Maintains authoritative tree health, applies shake physics, handles destruction, and triggers loot drops

The `EventsService` mediates communication between components using network and local events. Object pooling is implemented via `SpawnController` for trees, and the existing `LootDropManager` handles loot spawning with randomized drops.

### Component Responsibilities

| Component | Ownership | Responsibilities | Key Mechanics |
| :--- | :--- | :--- | :--- |
| **tree-spawner.service.ts** | Server | Spawn points, object pooling, respawn timers | `SpawnController`, `async.setTimeout`, integration with `SpawnManager` patterns |
| **axe-controller.ts** | Local (Player) | Detect axe-to-tree collisions, validate gameplay tags, send damage events | `CodeBlockEvents.OnEntityCollision`, gameplay tags (`AxeTool`), network events |
| **tree-harvester.ts** | Server | Health tracking, shake visualization, loot drops, despawn/respawn orchestration | `PhysicalEntity` spring physics, `Math.random()` for RNG, `LootDropManager` integration |

---

## 2. Architecture Components

### A. TreeSpawner Service (`tree-spawner.service.ts`)

**Ownership**: Server-owned component

**Responsibilities**:
- Pre-warm a pool of tree assets using `SpawnController` to minimize runtime spawn costs
- Manage a list of spawn points and track current instances per spawn point
- Listen for `TreeDestroyed` events and schedule respawn using `async.setTimeout`
- Integrate with existing `SpawnManager` patterns: register as a domain-specific spawner, reuse spawn spot descriptors

**Key Data Structures**:
```typescript
spawnPoints: Array<{ id: string; position: Vec3; rotation: Quat }>
pool: SpawnController // Pooled tree asset controller
activeBySpawnPoint: Map<string, Entity> // spawnPointId -> tree entity
respawnSeconds: number // From constants.ts or extension-config.service.ts
```

**Lifecycle**:
1. `preStart()`: Initialize `SpawnController` pool with tree asset, load config from `constants.ts`
2. `start()`: Spawn trees at all designated spawn points, attach `TreeHarvester` components
3. On `TreeDestroyed`: Return entity to pool, clear mapping, schedule respawn timer
4. On respawn timeout: Spawn fresh tree at the location, emit `TreeRespawned` local event

---

### B. AxeController (`axe-controller.ts`)

**Ownership**: Local-owned component attached to the player's axe or its grabbable parent

**Responsibilities**:
- Subscribe to `CodeBlockEvents.OnEntityCollision` for this axe entity
- Validate the axe has gameplay tag `AxeTool` and the collided entity has tag `HarvestableTree`
- On valid hit, send `EventsService.HarvestingEvents.TreeTookDamage` network event with:
  - `treeEntityId`
  - `byPlayerId`
  - `damage`
  - `hitPosition`
  - `timestamp`
- Optionally trigger immediate local-only VFX and audio for responsiveness

**Implementation Notes**:
- Prefer client-side collision detection for immediate responsiveness; server validates via `TreeHarvester`
- Keep per-frame listeners lightweight; unsubscribe on component destruction
- Use gameplay tags for robust filtering (avoid string name matching)

---

### C. TreeHarvester (`tree-harvester.ts`)

**Ownership**: Server-owned component attached to each tree entity instance

**Responsibilities**:
- Maintain authoritative health state (`maxHealth`, `currentHealth`) and `isDestroyed` flag
- Handle `TreeTookDamage` events directed at this tree
- Apply shake visualization using `PhysicalEntity` spring methods (`springSpinTowardRotation`) for short bursts after hits
- When destroyed:
  - Broadcast `TreeDestroyed` event
  - Spawn loot via `LootDropManager` based on configured drop table
  - Notify `TreeSpawner` to manage respawn
- Optional: Listen for direct collisions server-side for anti-cheat or redundancy

**Key Data Structures**:
```typescript
maxHealth: number
currentHealth: number
isDestroyed: boolean
isShaking: boolean
shakeEndTime: number
physicalEntity: PhysicalEntity
spawnPointId: string // Links back to TreeSpawner
shakeConfig: { durationMs: number; angleDeg: number; stiffness: number; damping: number }
```

**Lifecycle**:
1. `start()`: Bind to `TreeTookDamage` event, cache `PhysicalEntity` handle, subscribe to `World.onUpdate` for shake loop
2. On damage: Decrement health, trigger shake, check for destruction
3. On destruction: Broadcast event, spawn loot, coordinate despawn with `TreeSpawner`
4. On `World.onUpdate`: Apply spring physics while `isShaking` is true

---

## 3. Event Architecture

Add a new namespace to `EventsService` for harvesting events:

### HarvestingEvents

#### TreeTookDamage (NetworkEvent)
- **Purpose**: Carry axe hit data from client to server
- **Payload**:
  ```typescript
  {
    treeEntityId: bigint | string;
    byPlayerId: string;
    damage: number;
    hitPosition: Vec3;
    hitNormal?: Vec3;
    swingForce?: number;
    timestamp: number;
  }
  ```
- **Routing**: Client → Server; server-side `TreeHarvester` subscribes

#### TreeDestroyed (NetworkEvent)
- **Purpose**: Announce authoritative tree destruction
- **Payload**:
  ```typescript
  {
    treeEntityId: bigint | string;
    byPlayerId: string;
    position: Vec3;
    dropSeed?: number; // Optional: deterministic loot RNG seed
  }
  ```
- **Routing**: Server → All clients (for global reactions, quest updates, VFX)

#### TreeRespawned (LocalEvent)
- **Purpose**: Track local spawn cycles for UI, debug, and metrics
- **Payload**:
  ```typescript
  {
    spawnPointId: string;
    treeEntityId: bigint | string;
    when: number; // timestamp
  }
  ```
- **Routing**: Local within server owner context or admin client dashboards

### Implementation in `constants.ts`:

```typescript
export class EventsService {
  // ... existing events ...

  static readonly HarvestingEvents = {
    TreeTookDamage: new NetworkEvent<ITreeTookDamagePayload>('harvesting.tree_took_damage'),
    TreeDestroyed: new NetworkEvent<ITreeDestroyedPayload>('harvesting.tree_destroyed'),
    TreeRespawned: new LocalEvent<ITreeRespawnedPayload>('harvesting.tree_respawned'),
  };
}
```

**Notes**:
- Follow existing `EventsService` conventions and naming patterns
- Use deterministic seeds (`dropSeed`) if needed to align loot outcomes across clients in the future
- Consider adding `TreeHit` local event for immediate client-side VFX/audio feedback

---

## 4. Implementation Phases

### Phase 1: Tree Asset and Spawning Setup

**Tree Asset Configuration**:
- **Motion**: `Interactive`
- **Interaction**: `Both` (Physics + Script)
- **Collidable**: Enabled
- **Gameplay Tags**: `HarvestableTree`

**Implement TreeSpawner**:
1. Pre-warm pool via `SpawnController` in `preStart()` or `start()`
2. Define spawn locations:
   - Option A: Authored empty child entities under a container (similar to `SpawnManager`)
   - Option B: Hardcoded positions from config
3. Spawn trees at all active points on `start()`
4. Attach `TreeHarvester` component (server-owned) to each spawned tree

**Respawn Timers**:
- On `TreeDestroyed` event:
  - Return entity to pool using `controller.unload()`
  - Clear active mapping: `activeBySpawnPoint.delete(spawnPointId)`
  - Schedule respawn: `this.async.setTimeout(() => this.spawnAt(spawnPointId), respawnSeconds * 1000)`
- On timeout: Spawn fresh tree, emit `TreeRespawned` local event

---

### Phase 2: Axe Interaction System

**Axe Setup**:
- Ensure the axe entity (or its grabbable parent) has gameplay tag `AxeTool`
- Attach `AxeController` as a local-owned component

**Collision Detection**:
1. `AxeController` listens to `CodeBlockEvents.OnEntityCollision` for this axe
2. On collision:
   - Verify this entity has tag `AxeTool`
   - Verify other entity has tag `HarvestableTree`
   - Compute damage (from config or local tuning)
   - Broadcast `EventsService.HarvestingEvents.TreeTookDamage` with tree entity ID, player ID, damage, hit position
3. `TreeHarvester` receives the event, validates, and applies damage

**Damage and Health**:
- Decrement `currentHealth` by damage amount
- Clamp at zero: `currentHealth = Math.max(0, currentHealth - damage)`
- Broadcast `TreeDestroyed` exactly once when `currentHealth` reaches zero

---

### Phase 3: Visual Feedback and Physics

**Spring Physics for Shake**:
- Use `PhysicalEntity.springSpinTowardRotation()` for a quick jolt toward a small angle offset
- The spring naturally damps back to rest position
- Configuration: small angle (5-10 degrees), moderate stiffness (10), high damping (0.8)

**Implementation**:
1. On hit: Set `isShaking = true` and compute `shakeEndTime`
2. Schedule shake stop: `this.async.setTimeout(() => { this.isShaking = false }, shakeDurationMs)`
3. In `World.onUpdate` loop:
   ```typescript
   onUpdate(dt: number) {
     if (!this.isShaking) return;
     
     const targetRotation = this.computeShakeRotation(); // small offset
     this.physicalEntity.springSpinTowardRotation(
       targetRotation,
       this.shakeConfig.stiffness,
       this.shakeConfig.damping
     );
   }
   ```

**Optimization**:
- Only run shake logic when `isShaking` is true
- Keep angle offsets conservative to avoid simulation instability
- Consider capping max concurrent shaking trees if performance is a concern

---

### Phase 4: Random Drop and Loot Logic

**Health Threshold and RNG**:
- **Standard path**: Drop loot when `currentHealth` reaches zero
- **Optional early drop**: On each hit, roll `Math.random()`:
  - If roll exceeds threshold (e.g., 0.95), eject a small bonus wood piece (1 unit)
  - This adds variability and rewards consistent chopping

**Integrate with ITEMS and SPAWNABLE_ITEMS**:
- Reference `wood` item from `constants.ts` `ITEMS` dictionary
- Define tree-specific loot table in `HARVESTABLE_RESOURCES` (see Section 5)

**Loot Spawn**:
1. When tree is destroyed, call `LootDropManager` to spawn wood logs
2. Use configured drop table: quantities, rarities, scatter radius, impulse
3. Apply small upward and outward physics impulses for visual appeal

**Despawn and Respawn**:
1. `TreeHarvester` calls `onDestroyed(byPlayerId)`
2. Broadcast `TreeDestroyed` event
3. `TreeSpawner` receives event, unloads entity from pool, schedules respawn timer

---

## 5. Configuration and Constants

Add the following to `constants.ts`:

### HARVESTABLE_RESOURCES

A dictionary similar to `SPAWNABLE_ITEMS`:

```typescript
export interface HarvestableResourceConfig {
  id: string;
  label: string;
  assetId: string; // Asset GUID or placeholder
  maxHealth: number;
  damagePerHit: number; // Default damage per axe swing
  respawnSeconds: number;
  shake: {
    durationMs: number;
    angleDeg: number;
    stiffness: number;
    damping: number;
  };
  tags: string[]; // e.g., ['HarvestableTree']
  dropTable: HarvestableDropTable;
}

export interface HarvestableDropEntry {
  itemId: string; // References ITEMS
  minQuantity: number;
  maxQuantity: number;
  dropChance: number; // 0.0 to 1.0
  impulse: { min: number; max: number }; // Physics impulse range
}

export interface HarvestableDropTable {
  entries: HarvestableDropEntry[];
  scatterRadius?: number;
  pluckHeight?: number;
  autoDespawnSeconds?: number;
}

export const HARVESTABLE_RESOURCES: { [key: string]: HarvestableResourceConfig } = {
  tree: {
    id: 'tree',
    label: 'Oak Tree',
    assetId: '', // Set in Horizon Worlds editor
    maxHealth: 10,
    damagePerHit: 1,
    respawnSeconds: 30,
    shake: {
      durationMs: 100,
      angleDeg: 5,
      stiffness: 10,
      damping: 0.8,
    },
    tags: ['HarvestableTree'],
    dropTable: {
      entries: [
        { itemId: 'wood', minQuantity: 1, maxQuantity: 3, dropChance: 1.0, impulse: { min: 1, max: 3 } },
        { itemId: 'rare_wood', minQuantity: 1, maxQuantity: 1, dropChance: 0.05, impulse: { min: 1, max: 2 } },
      ],
      scatterRadius: 1.5,
      pluckHeight: 0.5,
      autoDespawnSeconds: 60,
    },
  },
};
```

### ITEMS Additions

Add wood items to the existing `ITEMS` dictionary:

```typescript
export const ITEMS: { [key: string]: ItemConfig } = {
  // ... existing items (coin, feather, etc.) ...
  
  wood: {
    id: 'wood',
    label: 'Wood',
    type: 'material',
    value: 5,
    description: 'Common wood logs for crafting',
  },
  rare_wood: {
    id: 'rare_wood',
    label: 'Rare Wood',
    type: 'material',
    value: 25,
    description: 'High-quality wood with unique properties',
  },
};
```

### Types

Add type definitions for payloads:

```typescript
export type ITreeTookDamagePayload = {
  treeEntityId: bigint | string;
  byPlayerId: string;
  damage: number;
  hitPosition: Vec3;
  hitNormal?: Vec3;
  swingForce?: number;
  timestamp: number;
};

export type ITreeDestroyedPayload = {
  treeEntityId: bigint | string;
  byPlayerId: string;
  position: Vec3;
  dropSeed?: number;
};

export type ITreeRespawnedPayload = {
  spawnPointId: string;
  treeEntityId: bigint | string;
  when: number;
};
```

**Notes**:
- Keep structures consistent with existing `constants.ts` patterns
- Allow overrides via `extension-config.service.ts` for `respawnSeconds`, `damagePerHit`, and spawn caps
- Consider adding multiple tree types (oak, pine, palm) in the future

---

## 6. Integration Points

### EventsService
- Add `HarvestingEvents` namespace with the three events
- Register handlers in `TreeSpawner` (for `TreeDestroyed`) and `TreeHarvester` (for `TreeTookDamage`)
- Follow existing patterns for network event routing

### SpawnManager Patterns
- `TreeSpawner` registers as a managed spawner similar to `SpawnManager`
- Reuse `SpawnController` patterns and lifecycle hooks (`load()`, `spawn()`, `unload()`)
- Use `ItemSpawnController` wrapper pattern from `SpawnManager.ts` for entity tracking

### LootDropManager
- Call `LootDropManager.spawnLootItem()` or equivalent from `TreeHarvester.onDestroyed()`
- Pass configured drop table from `HARVESTABLE_RESOURCES`
- Apply small physics impulses to tossed loot for visual appeal
- Reuse scatter radius, pluck height, and auto-despawn logic

### Quest System
- Emit `EventsService.QuestEvents.SubmitQuestCollectProgress` when wood is collected
- Listen for `TreeDestroyed` in `QuestManager` for objectives like "Chop down 5 trees"
- Support quest rewards that include wood or rare wood items

### Extension Config
- Centralize tunables in `extension-config.service.ts`:
  - `respawnSeconds` (override per tree type)
  - `damagePerHit` (override per axe type or player level)
  - Maximum concurrent trees per area
  - Debug flags: `ENABLE_TREE_SHAKE`, `SHOW_TREE_HEALTH_DEBUG`

---

## 7. Performance Considerations

### Object Pooling
- Pre-warm pools sized to match spawn points (e.g., 10 trees = pool size 10)
- Reduces runtime allocations and GC pressure
- Use `SpawnController.dispose()` only on world cleanup, not per despawn

### Spring Physics Optimization
- Only enable shake on hits; auto-stop after `durationMs`
- Cap max concurrent shaking trees (e.g., max 5 at a time) if frame drops occur
- Limit angle offsets to avoid simulation instability
- Consider using simpler visual alternatives (animation clips, particle bursts) if physics becomes costly

### Network Synchronization
- Use single authoritative source for shake (server-owned physics)
- Keep `TreeTookDamage` payloads compact (avoid large Vector3 arrays or redundant data)
- Batch events if multiple trees are hit simultaneously (future optimization)

### Spawn Caps
- Hard cap on active trees per area (e.g., maxActive: 20)
- Hard cap on loot items per area (coordinate with `LootDropManager`)
- Despawn oldest loot items when cap is reached

### Event Coalescing
- Debounce or rate-limit rapid successive hits from the same player (e.g., max 1 hit per 200ms per tree)
- Prevents spam and reduces event bandwidth

---

## 8. Future Enhancements

### Multiple Tree Types
- Add oak, pine, palm, birch with distinct health, drop tables, and visual assets
- Support different damage multipliers per tool type (e.g., iron axe vs. stone axe)

### Tool Durability and Upgrades
- Track axe durability; degrade on hits
- Implement upgrade paths: stone → iron → diamond axe (higher damage, faster chop)
- Display durability bar in player HUD

### Progressive Damage Visuals
- Swap tree mesh or materials as health decreases (e.g., bark chips, cracks)
- Emit particle effects on each hit (wood splinters, leaves falling)
- Change color tint as tree approaches destruction

### Audio and VFX
- Play axe swing sound on hit (client-side for immediate feedback)
- Play tree groan/crack sound as health decreases
- Particle explosion on tree destruction
- Ambient sound loop for forests with many trees

### Rare Wood Variants and Seasonal Events
- Rare tree spawns with higher drop rates for rare wood
- Seasonal events: golden trees during holidays with special loot
- Time-limited "Ancient Tree" boss with high health and epic drops

### Admin Dashboard Integration
- **Optional Preact GraphDashboard panel** to visualize:
  - Active tree count per spawn zone
  - Hit rate metrics (hits per second)
  - Loot yield distribution (common wood vs. rare wood)
- Real-time debug overlay for tree health and respawn timers
- Use shared `Button.tsx` component styled with global CSS for consistent admin controls

---

## 9. Code Snippets

### TreeSpawner Component Structure

```typescript
// tree-spawner.service.ts
import * as hz from 'horizon/core';
import { EventsService, HARVESTABLE_RESOURCES } from 'constants';

class TreeSpawner extends hz.Component<typeof TreeSpawner> {
  static propsDefinition = {
    treeAsset: { type: hz.PropTypes.Asset },
  };

  private spawnPoints: Array<{ id: string; position: hz.Vec3; rotation: hz.Quat }> = [];
  private activeBySpawnPoint: Map<string, hz.Entity> = new Map();
  private spawnControllers: Map<string, hz.SpawnController> = new Map();
  private config = HARVESTABLE_RESOURCES.tree;

  preStart() {
    // Find spawn locations under a container entity
    this.spawnPoints = this.findSpawnPoints();
    
    // Initialize spawn controllers (one per spawn point for pooling)
    this.spawnPoints.forEach((point) => {
      const controller = new hz.SpawnController(
        this.props.treeAsset as hz.Asset,
        point.position,
        point.rotation,
        hz.Vec3.one
      );
      this.spawnControllers.set(point.id, controller);
    });
  }

  start() {
    // Spawn trees at all spawn points
    this.spawnPoints.forEach((point) => this.spawnAt(point.id));

    // Listen for tree destruction
    this.connectNetworkBroadcastEvent(
      EventsService.HarvestingEvents.TreeDestroyed,
      (evt) => this.onTreeDestroyed(evt)
    );
  }

  private async spawnAt(spawnPointId: string) {
    const point = this.spawnPoints.find((p) => p.id === spawnPointId);
    const controller = this.spawnControllers.get(spawnPointId);
    if (!point || !controller) return;

    await controller.load();
    await controller.spawn();

    const entity = controller.rootEntities.get()[0];
    this.activeBySpawnPoint.set(spawnPointId, entity);

    // Attach TreeHarvester component to the spawned tree
    // (Assumes TreeHarvester is registered and can be attached dynamically)
    // entity.addComponent(TreeHarvester, { spawnPointId, maxHealth: this.config.maxHealth });
  }

  private onTreeDestroyed(evt: { treeEntityId: bigint | string; byPlayerId: string; position: hz.Vec3 }) {
    // Find which spawn point this tree belongs to
    const spawnPointId = this.findSpawnPointByEntity(evt.treeEntityId);
    if (!spawnPointId) return;

    // Unload and clear mapping
    const controller = this.spawnControllers.get(spawnPointId);
    if (controller) {
      controller.unload();
    }
    this.activeBySpawnPoint.delete(spawnPointId);

    // Schedule respawn
    this.scheduleRespawn(spawnPointId);
  }

  private scheduleRespawn(spawnPointId: string) {
    const respawnMs = this.config.respawnSeconds * 1000;
    this.async.setTimeout(() => {
      this.spawnAt(spawnPointId);
      this.sendLocalBroadcastEvent(EventsService.HarvestingEvents.TreeRespawned, {
        spawnPointId,
        treeEntityId: this.activeBySpawnPoint.get(spawnPointId)?.id || 0n,
        when: Date.now(),
      });
    }, respawnMs);
  }

  private findSpawnPoints(): Array<{ id: string; position: hz.Vec3; rotation: hz.Quat }> {
    // Implementation: find child entities under "TreeSpawnLocations" container
    // Similar to SpawnManager.findUnderContainer
    return [];
  }

  private findSpawnPointByEntity(entityId: bigint | string): string | null {
    for (const [spawnPointId, entity] of this.activeBySpawnPoint.entries()) {
      if (entity.id === entityId) return spawnPointId;
    }
    return null;
  }
}

hz.Component.register(TreeSpawner);
```

---

### AxeController Collision Handler

```typescript
// axe-controller.ts
import * as hz from 'horizon/core';
import { EventsService, HARVESTABLE_RESOURCES } from 'constants';

class AxeController extends hz.Component<typeof AxeController> {
  private config = HARVESTABLE_RESOURCES.tree;

  start() {
    // Subscribe to collision events for this axe entity
    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnEntityCollision, (evt) =>
      this.onCollision(evt.other, evt)
    );
  }

  private onCollision(otherEntity: hz.Entity, hitInfo: any) {
    // Validate tags
    const axeHasTag = this.entity.hasTag('AxeTool');
    const treeHasTag = otherEntity.hasTag('HarvestableTree');

    if (!axeHasTag || !treeHasTag) return;

    // Compute damage (could be based on axe type or player level in the future)
    const damage = this.config.damagePerHit;

    // Send damage event to server
    this.sendNetworkBroadcastEvent(EventsService.HarvestingEvents.TreeTookDamage, {
      treeEntityId: otherEntity.id,
      byPlayerId: this.world.getServerPlayer()?.id.toString() || 'unknown',
      damage,
      hitPosition: hitInfo.position || hz.Vec3.zero,
      timestamp: Date.now(),
    });

    // Optional: Trigger local VFX/audio for immediate feedback
    // this.playLocalHitEffect(hitInfo.position);
  }

  destroy() {
    // Cleanup: unsubscribe listeners if needed
  }
}

hz.Component.register(AxeController);
```

---

### TreeHarvester Shake Physics and Damage Handling

```typescript
// tree-harvester.ts
import * as hz from 'horizon/core';
import { EventsService, HARVESTABLE_RESOURCES } from 'constants';

class TreeHarvester extends hz.Component<typeof TreeHarvester> {
  static propsDefinition = {
    spawnPointId: { type: hz.PropTypes.String },
    maxHealth: { type: hz.PropTypes.Number, default: 10 },
  };

  private currentHealth: number = 10;
  private isDestroyed: boolean = false;
  private isShaking: boolean = false;
  private physicalEntity: hz.PhysicalEntity | null = null;
  private config = HARVESTABLE_RESOURCES.tree.shake;

  start() {
    this.currentHealth = this.props.maxHealth;
    this.physicalEntity = this.entity.as(hz.PhysicalEntity);

    // Listen for damage events
    this.connectNetworkBroadcastEvent(
      EventsService.HarvestingEvents.TreeTookDamage,
      (evt) => this.onTookDamage(evt)
    );

    // Subscribe to update loop for shake physics
    this.connectLocalBroadcastEvent(hz.World.onUpdate, (evt) => this.onUpdate(evt.deltaTime));
  }

  private onTookDamage(evt: {
    treeEntityId: bigint | string;
    byPlayerId: string;
    damage: number;
    hitPosition: hz.Vec3;
    timestamp: number;
  }) {
    // Verify this is the correct tree
    if (evt.treeEntityId !== this.entity.id) return;
    if (this.isDestroyed) return;

    // Apply damage
    this.currentHealth = Math.max(0, this.currentHealth - evt.damage);

    // Trigger shake
    this.startShake();

    // Check for destruction
    if (this.currentHealth <= 0) {
      this.onDestroyed(evt.byPlayerId);
    }
  }

  private startShake() {
    this.isShaking = true;
    this.async.setTimeout(() => {
      this.isShaking = false;
    }, this.config.durationMs);
  }

  private onUpdate(dt: number) {
    if (!this.isShaking || !this.physicalEntity) return;

    // Compute shake rotation offset (small random angle)
    const offsetAngle = (Math.random() - 0.5) * this.config.angleDeg * (Math.PI / 180);
    const targetRotation = hz.Quat.fromEuler(offsetAngle, 0, offsetAngle);

    // Apply spring physics
    this.physicalEntity.springSpinTowardRotation(
      targetRotation,
      this.config.stiffness,
      this.config.damping
    );
  }

  private onDestroyed(byPlayerId: string) {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    // Broadcast destruction
    this.sendNetworkBroadcastEvent(EventsService.HarvestingEvents.TreeDestroyed, {
      treeEntityId: this.entity.id,
      byPlayerId,
      position: this.entity.position.get(),
    });

    // Spawn loot via LootDropManager
    // (Assumes LootDropManager has a method to spawn loot for trees)
    // this.world.getComponent(LootDropManager)?.spawnTreeLoot(this.entity.position.get());

    // TreeSpawner will handle despawn and respawn via TreeDestroyed event
  }
}

hz.Component.register(TreeHarvester);
```

---

### Event Definitions for EventsService

```typescript
// In constants.ts - Add to EventsService

export class EventsService {
  // ... existing events ...

  static readonly HarvestingEvents = {
    TreeTookDamage: new hz.NetworkEvent<ITreeTookDamagePayload>('harvesting.tree_took_damage'),
    TreeDestroyed: new hz.NetworkEvent<ITreeDestroyedPayload>('harvesting.tree_destroyed'),
    TreeRespawned: new hz.LocalEvent<ITreeRespawnedPayload>('harvesting.tree_respawned'),
  };
}

// Payload type definitions
export type ITreeTookDamagePayload = {
  treeEntityId: bigint | string;
  byPlayerId: string;
  damage: number;
  hitPosition: hz.Vec3;
  hitNormal?: hz.Vec3;
  swingForce?: number;
  timestamp: number;
};

export type ITreeDestroyedPayload = {
  treeEntityId: bigint | string;
  byPlayerId: string;
  position: hz.Vec3;
  dropSeed?: number;
};

export type ITreeRespawnedPayload = {
  spawnPointId: string;
  treeEntityId: bigint | string;
  when: number;
};
```

---

## 10. Testing Checklist

### Collision Detection Validation
- [ ] Axe with `AxeTool` tag triggers damage only on entities with `HarvestableTree` tag
- [ ] No false positives on non-harvestable entities (rocks, NPCs, players)
- [ ] Collision events fire consistently across clients

### Health Tracking Accuracy
- [ ] Damage per hit reduces health correctly
- [ ] Health cannot go below zero
- [ ] `TreeDestroyed` event fires exactly once when health reaches zero
- [ ] No duplicate destruction events

### Respawn Timing Verification
- [ ] Despawn and respawn adheres to configured `respawnSeconds`
- [ ] Trees respawn at correct spawn points
- [ ] No orphaned entities after multiple respawn cycles

### Loot Drop Randomness Testing
- [ ] `Math.random()` thresholds produce expected drop distribution
- [ ] Rare wood appears near configured rate (e.g., 5% of drops)
- [ ] Loot spawns at correct positions with scatter radius
- [ ] Loot items have physics impulses and despawn after timeout

### Performance Benchmarks
- [ ] With N trees (e.g., 20) and M concurrent players (e.g., 4): measure frame stability (target: 60 FPS)
- [ ] Monitor event bandwidth (target: <100 events/sec under normal gameplay)
- [ ] Shake effect only active briefly; no runaway physics or jitter
- [ ] Object pooling reduces GC pressure (use profiler to verify)

### Network Consistency
- [ ] All clients see the same destroyed state (no desyncs)
- [ ] Loot spawns are consistent across clients
- [ ] Local VFX (client-side shake) does not desync authoritative state
- [ ] Server health state is authoritative; client predictions are corrected

---

## Additional Notes

### References
- **Research Source**: High-level system architecture for tree chopping with three-component design (TreeSpawner, AxeController, TreeHarvester)
- **Spring Physics**: Using `PhysicalEntity` spring methods for shake visualization
- **Server Authority**: Authoritative health and drop logic to ensure game integrity

### File Naming Conventions
- `tree-spawner.service.ts` (kebab-case with `.service.ts` suffix)
- `axe-controller.ts` (kebab-case with `.ts` suffix)
- `tree-harvester.ts` (kebab-case with `.ts` suffix)

### Integration with Existing Systems
- **SpawnManager.ts**: Reuse `SpawnController` patterns and pooling strategy
- **LootDropManager.ts**: Leverage existing loot spawn API and physics impulses
- **constants.ts**: Define `HARVESTABLE_RESOURCES` and `HarvestingEvents` following established patterns
- **extension-config.service.ts**: Centralize tunables for respawn, damage, and spawn caps

### Tunables and Configuration
- All tunables (respawn seconds, damage per hit, shake parameters) should be configurable via `constants.ts` and optionally overridable in `extension-config.service.ts`
- Support debug flags for development: `ENABLE_TREE_SHAKE`, `SHOW_TREE_HEALTH_DEBUG`, `LOG_HARVESTING_EVENTS`

---

**End of Document**
