# Tree Resource Gathering System - Implementation Plan

## Overview

This plan details how to implement a tree-chopping resource gathering system that integrates with your existing `CollectibleQuestItem` and `InventoryDAO` infrastructure. Players will hit trees with tools (similar to the economy-world example), spawn collectible logs, and add them to their persistent inventory.

---

## Architecture Summary

The system orchestrates five components:

1. **Tree Resource Node** (Server-owned) - Manages tree health and hit detection
2. **Tool Script** (Weapon-based) - Detects collisions and registers hits
3. **Log Spawning** (Server SpawnController) - Dynamically spawns collectible logs
4. **Collectible Log** (Client trigger) - Handles pickup and inventory updates
5. **VFX/SFX Feedback** - Provides immediate player feedback

---

## Phase 1: Assets & Setup

### 1.1 Create Tree Entity

- **Location**: Place in world
- **Configuration**:
  - ✅ `Collidable`: **On**
  - ✅ `Collision Layer`: Accept tool/weapon collisions
  - ✅ Add `Gameplay Tag`: `TREE` (for tool detection)
  - ✅ Attach VFX gizmos for hit effects (particles)
  - ✅ Attach Sound gizmos for chopping sounds

### 1.2 Create Log Collectible Asset

- **Asset Template**: `log-collectible.ts` (asset reference)
- **Components**:
  - ✅ Visual mesh (log model)
  - ✅ `Trigger Gizmo` configured to detect `Players Only`
  - ✅ Attach `CollectibleLog.ts` script (Phase 4)
  - ✅ `Collidable`: **Off** (trigger only)

### 1.3 Register Item in Constants

Add to `constants.ts`:

```typescript path=null start=null
// Add to SPAWNABLE_ITEMS
log: {
    itemId: 'log',
    label: 'Wood Log',
    spawnRate: 0,           // Manually spawned, not auto-spawned
    spawnChance: 1.0,
    maxActive: 50,          // Max logs in world simultaneously
},
```

Add to `ITEMS`:

```typescript path=null start=null
log: {
    id: 'log',
    label: 'Wood Log',
    type: 'material',
    value: 5,
    description: 'Freshly chopped wood from a tree'
},
```

### 1.4 Tool Configuration

Ensure your weapon/tool (e.g., `BaseWeapon.ts` or new `Axe.ts`) can:

- ✅ Detect collisions with entities tagged `TREE`
- ✅ Send hit events with damage/progress values
- ✅ Play swing animations on trigger press

---

## Phase 2: Tree Resource Node Script

### File: `tree-resource-node.ts`

**Ownership**: Server (Default)
**Inspired by**: `context/economy-world/ResourceNode.ts` and `GlobalResourceNode.ts`

#### Props Definition

```typescript path=null start=null
static propsDefinition = {
    resourceType: { type: hz.PropTypes.String, default: "LOG" },
    maxHealth: { type: hz.PropTypes.Number, default: 5 },     // Hits required
    logAsset: { type: hz.PropTypes.Asset },                   // Log asset reference
    logSpawnCount: { type: hz.PropTypes.Number, default: 1 }, // Logs per depletion
    logSpawnChance: { type: hz.PropTypes.Number, default: 0.5 }, // 50% chance
    respawnTimeSeconds: { type: hz.PropTypes.Number, default: 30 },
    hitVFX: { type: hz.PropTypes.Entity },                    // Particle gizmo reference
    hitSFX: { type: hz.PropTypes.Entity },                    // Audio gizmo reference
    depleteVFX: { type: hz.PropTypes.Entity },                // Tree falls VFX
    respawnVFX: { type: hz.PropTypes.Entity },                // Tree regrows VFX
}
```

#### State Management

```typescript path=null start=null
currentHealth: number = this.props.maxHealth
nodeState: TreeState = TreeState.Ready  // Enum: Ready | Depleted | Respawning
spawnController: hz.SpawnController | null = null
originalPosition: hz.Vec3 = hz.Vec3.zero
```

#### Core Logic

**1. Initialization (`preStart`)**

```typescript path=null start=null
preStart() {
    // Initialize spawn controller for log asset
    this.spawnController = new hz.SpawnController(this.props.logAsset);
    this.spawnController.preload(this.props.logSpawnCount * 2); // Pre-load pool
}
```

**2. Hit Detection (`start`)**

```typescript path=null start=null
start() {
    this.originalPosition = this.entity.position.get().clone();

    // Listen for collision with tools/weapons
    this.connectCodeBlockEvent(
        this.entity,
        hz.CodeBlockEvents.OnEntityCollision,
        (collidedWith: hz.Entity, collisionPoint: hz.Vec3) => {
            if (this.nodeState !== TreeState.Ready) return;

            // Check if colliding entity is a valid tool (has tag or weapon component)
            if (this.isValidTool(collidedWith)) {
                this.registerHit(collidedWith, collisionPoint);
            }
        }
    );
}
```

**3. Hit Registration**

```typescript path=null start=null
private registerHit(tool: hz.Entity, hitPosition: hz.Vec3) {
    // Decrement health
    this.currentHealth--;

    // Play immediate feedback (VFX + SFX)
    this.playHitFeedback(hitPosition);

    // Check if tree is depleted
    if (this.currentHealth <= 0) {
        this.handleTreeDepletion(hitPosition);
    }
}
```

**4. Tree Depletion**

```typescript path=null start=null
private handleTreeDepletion(lastHitPosition: hz.Vec3) {
    this.nodeState = TreeState.Depleted;

    // Play depletion effects
    this.playDepleteVFX();

    // Hide tree visually (or play fall animation)
    this.entity.visible.set(false);
    this.entity.collidable.set(false);

    // Spawn logs (with random chance)
    this.spawnLogs(lastHitPosition);

    // Schedule respawn
    this.async.setTimeout(() => {
        this.respawnTree();
    }, this.props.respawnTimeSeconds * 1000);
}
```

**5. Log Spawning** (Phase 3 detail)

```typescript path=null start=null
private spawnLogs(spawnPosition: hz.Vec3) {
    // Random chance check
    if (Math.random() > this.props.logSpawnChance) {
        console.log(`[TreeResourceNode] No logs dropped (chance: ${this.props.logSpawnChance})`);
        return;
    }

    // Spawn multiple logs in scatter pattern
    for (let i = 0; i < this.props.logSpawnCount; i++) {
        this.spawnController?.spawn().then(logEntity => {
            // Random scatter around tree base
            const offset = new hz.Vec3(
                (Math.random() - 0.5) * 2,
                0.5, // Slight height offset
                (Math.random() - 0.5) * 2
            );
            logEntity.position.set(spawnPosition.add(offset));

            // Ensure CollectibleLog script is active
            console.log(`[TreeResourceNode] Spawned log at ${logEntity.position.get()}`);
        }).catch(error => {
            console.error(`[TreeResourceNode] Spawn failed: ${hz.SpawnError[error.spawnError]}`);
        });
    }
}
```

**6. Tree Respawn**

```typescript path=null start=null
private respawnTree() {
    this.nodeState = TreeState.Respawning;

    // Play regrow VFX
    this.playRespawnVFX();

    // Restore tree state
    this.async.setTimeout(() => {
        this.currentHealth = this.props.maxHealth;
        this.entity.visible.set(true);
        this.entity.collidable.set(true);
        this.nodeState = TreeState.Ready;
    }, 1000); // Visual delay for regrow animation
}
```

**7. Tool Validation**

```typescript path=null start=null
private isValidTool(entity: hz.Entity): boolean {
    // Option 1: Check gameplay tag
    if (entity.tags.has("AXE") || entity.tags.has("WEAPON")) {
        return true;
    }

    // Option 2: Check for BaseWeapon component
    const weapon = entity.getComponents<BaseWeapon>()[0];
    return weapon !== null;
}
```

**8. Feedback Methods**

```typescript path=null start=null
private playHitFeedback(position: hz.Vec3) {
    // Play particle effect
    if (this.props.hitVFX) {
        this.props.hitVFX.as(hz.ParticleGizmo)?.position.set(position);
        this.props.hitVFX.as(hz.ParticleGizmo)?.play();
    }

    // Play chopping sound
    if (this.props.hitSFX) {
        this.props.hitSFX.as(hz.AudioGizmo)?.position.set(position);
        this.props.hitSFX.as(hz.AudioGizmo)?.play();
    }
}

private playDepleteVFX() {
    if (this.props.depleteVFX) {
        this.props.depleteVFX.as(hz.ParticleGizmo)?.play();
    }
}

private playRespawnVFX() {
    if (this.props.respawnVFX) {
        this.props.respawnVFX.as(hz.ParticleGizmo)?.play();
    }
}
```

---

## Phase 3: Dynamic Log Spawning

**Already covered in Phase 2, Section 5** above using `SpawnController`.

### Key Performance Points:

- ✅ Use `SpawnController.preload()` to avoid lag
- ✅ Pool logs for reuse (despawned logs return to pool)
- ✅ Scatter spawn pattern prevents stacking
- ✅ Cap max active logs via `maxActive` config

---

## Phase 4: Collectible Log Script

### File: `collectible-log.ts`

**Ownership**: Server (Default) - Spawned entity
**Inspired by**: `CollectableQuestItem.ts`

```typescript path=null start=null
import * as hz from "horizon/core";
import { EventsService } from "constants";

class CollectibleLog extends hz.Component<typeof CollectibleLog> {
  static propsDefinition = {
    itemId: { type: hz.PropTypes.String, default: "log" },
    autoCollect: { type: hz.PropTypes.Boolean, default: false }, // Trigger vs button press
  };

  preStart(): void {
    if (this.props.autoCollect) {
      // Auto-collect on trigger enter
      this.connectCodeBlockEvent(
        this.entity,
        hz.CodeBlockEvents.OnPlayerEnterTrigger,
        (player: hz.Player) => this.collectLog(player)
      );
    } else {
      // Require button press to collect
      this.connectCodeBlockEvent(
        this.entity,
        hz.CodeBlockEvents.OnIndexTriggerDown,
        (player: hz.Player) => this.collectLog(player)
      );
    }
  }

  private collectLog(player: hz.Player) {
    console.log(`[CollectibleLog] Player ${player.name.get()} collecting log`);

    // Use existing quest/inventory event system
    const id = this.props.itemId.trim();
    const rawId: any = (this.entity as any)?.id;
    const entityId =
      typeof rawId === "bigint" ? rawId.toString() : String(rawId);

    if (!entityId || !player) {
      console.warn(`[CollectibleLog] Invalid entityId or player`);
      return;
    }

    // Broadcast to inventory system (your existing flow)
    this.sendNetworkBroadcastEvent(
      EventsService.QuestEvents.SubmitQuestCollectProgress,
      {
        player,
        itemId: id,
        amount: 1,
        entityId,
      }
    );

    // Play collection feedback
    // TODO: Add collection sound/VFX here

    // Despawn the log entity
    this.world.deleteAsset(this.entity);
  }
}
hz.Component.register(CollectibleLog);
```

### Integration Notes:

- ✅ Uses your **existing** `SubmitQuestCollectProgress` event
- ✅ Works with your `InventoryDAO.addItem()` flow
- ✅ Automatically despawns after collection
- ✅ Returns to spawn pool for reuse

---

## Phase 5: Visual & Audio Feedback

### Feedback Assets Required:

1. **Hit Effects**:

   - Particle Gizmo: Wood chips/splinters
   - Audio Gizmo: "Chop" sound (SFX_Pickaxe_Hit)

2. **Depletion Effects**:

   - Particle Gizmo: Tree fall dust cloud
   - Audio Gizmo: "Tree fall" sound
   - Optional: Tree entity rotation animation (fall over)

3. **Respawn Effects**:

   - Particle Gizmo: Sparkle/growth effect
   - Audio Gizmo: "Magical regrow" sound

4. **Collection Effects** (on log pickup):
   - Audio Gizmo: "Item pickup" sound (SFX_ObtainItem_Alt from economy-world)
   - Optional: Flash effect on player

### Implementation Pattern (from economy-world):

```typescript path=null start=null
// In tree-resource-node.ts
private playHitFeedback(position: hz.Vec3) {
    // Move VFX to collision point (like Pickaxe.ts does)
    const movedOut = hz.Vec3.lerp(position, this.entity.position.get(), 0.15);

    // Play particle effect at adjusted position
    this.props.hitVFX?.as(hz.ParticleGizmo)?.position.set(movedOut);
    this.props.hitVFX?.as(hz.ParticleGizmo)?.play();

    // Play sound at collision point
    this.props.hitSFX?.as(hz.AudioGizmo)?.position.set(position);
    this.props.hitSFX?.as(hz.AudioGizmo)?.play();
}
```

---

## Integration with Existing Systems

### 1. Inventory Flow

```
Player hits tree
→ TreeResourceNode.registerHit()
→ Tree depletes
→ SpawnController spawns log entities
→ Player touches log
→ CollectibleLog.collectLog()
→ Broadcasts SubmitQuestCollectProgress
→ QuestManager/InventoryManager receives event
→ InventoryDAO.addItem('log', 1)
→ Player inventory updated
→ Log entity despawned
```

### 2. Quest System Integration

If you want logs to count for quests:

- ✅ The existing `SubmitQuestCollectProgress` event already handles this
- ✅ Just ensure your `QuestManager` listens for `itemId: 'log'`
- ✅ Example quest: "Collect 10 logs"

### 3. Tool/Weapon Integration

Two options:

**Option A: Modify BaseWeapon.ts** (if axes are weapons)

```typescript path=null start=null
// In BaseWeapon.ts onFirePressed()
this.connectCodeBlockEvent(
  this.entity,
  hz.CodeBlockEvents.OnEntityCollision,
  (entity: hz.Entity) => {
    if (entity.tags.has("TREE")) {
      // Let the tree handle the hit
      console.log(`[BaseWeapon] Hit tree: ${entity.name.get()}`);
    }
  }
);
```

**Option B: Create separate Axe.ts** (cleaner)

- Extend `BaseWeapon` or create new tool class
- Add specific tree-chopping logic
- Follow `Pickaxe.ts` pattern from economy-world

---

## File Structure Summary

```
scripts/
├── tree-resource-node.ts         (NEW - Phase 2)
├── collectible-log.ts            (NEW - Phase 4)
├── constants.ts                  (MODIFY - Phase 1.3)
├── InventoryDAO.ts               (EXISTING - no changes needed)
├── CollectableQuestItem.ts       (EXISTING - reference only)
└── BaseWeapon.ts                 (MODIFY - Phase 6, optional)
```

---

## Testing Checklist

### Phase 2 - Tree Node

- [ ] Tree takes damage on tool collision
- [ ] Tree health decrements correctly
- [ ] Tree becomes invisible/non-collidable when depleted
- [ ] VFX/SFX play on hit
- [ ] Tree respawns after configured time
- [ ] Multiple trees can be hit simultaneously

### Phase 3 - Log Spawning

- [ ] Logs spawn with correct random chance
- [ ] Logs spawn in scattered pattern (not stacked)
- [ ] Spawn count matches configuration
- [ ] No lag during spawn (SpawnController preload working)
- [ ] Max active logs cap respected

### Phase 4 - Log Collection

- [ ] Player can collect logs (trigger or button)
- [ ] Inventory updates correctly (check `InventoryDAO.getItemCount('log')`)
- [ ] Log despawns after collection
- [ ] Multiple players can collect different logs
- [ ] Quest progress updates if quest active

### Phase 5 - Feedback

- [ ] Hit particles visible at collision point
- [ ] Hit sound plays at correct location
- [ ] Depletion VFX plays when tree dies
- [ ] Respawn VFX plays when tree regrows
- [ ] Collection sound plays on log pickup

---

## Advanced Features (Post-MVP)

### 1. Progressive Damage Visuals

- Add multiple visual states to tree (cracks, damage)
- Update mesh based on `currentHealth / maxHealth` ratio
- Reference: `GlobalResourceNode.updateVisuals()` from economy-world

### 2. Tool Efficiency System

- Different tools deal different damage (axe > sword > fist)
- Reference: `Pickaxe.ts` primaryMult/secondaryMult pattern
- Add tool type checking in `isValidTool()`

### 3. Player Progress UI

- Show hit counter above tree (like health bar)
- Reference: `GlobalResourceNode` healthbar system
- Add text gizmo showing "3/5 hits"

### 4. Rare Log Drops

- Add `rareLogChance` prop for special logs
- Spawn different asset based on random roll
- Reference: `SPAWNABLE_ITEMS` rareSpawnRate pattern

### 5. Wood Type Variants

- Oak, Pine, Birch trees with different properties
- Different log items per tree type
- Extend `resourceType` prop to distinguish

---

## Performance Considerations

1. **Spawn Pool Size**: Preload 10-20 logs to prevent allocation lag
2. **Collision Detection**: Use gameplay tags instead of component checks (faster)
3. **Respawn Timers**: Stagger tree respawns to avoid mass spawns
4. **Log Cleanup**: Auto-despawn uncollected logs after 60 seconds
5. **Max Active Logs**: Cap at 50 total in world (configurable)

---

## Common Issues & Solutions

### Issue: Logs spawn inside tree/ground

**Solution**: Adjust spawn position Y-offset to 0.5-1.0 meters

### Issue: SpawnController lag on first spawn

**Solution**: Call `preload()` in `preStart()`, not `start()`

### Issue: Player collects same log multiple times

**Solution**: Add collected flag and early return in `collectLog()`

### Issue: Tree respawns while player still nearby

**Solution**: Add proximity check before respawn, or increase respawn time

### Issue: Inventory not updating

**Solution**: Verify event listener in `QuestManager` or inventory handler

---

## Estimated Implementation Time

| Phase                     | Time Estimate  | Priority |
| ------------------------- | -------------- | -------- |
| Phase 1: Assets & Setup   | 1-2 hours      | Critical |
| Phase 2: Tree Node Script | 2-3 hours      | Critical |
| Phase 3: Log Spawning     | 1 hour         | Critical |
| Phase 4: Collectible Log  | 1 hour         | Critical |
| Phase 5: VFX/SFX          | 1-2 hours      | High     |
| Integration & Testing     | 2-3 hours      | Critical |
| **Total**                 | **8-12 hours** | -        |

---

## Next Steps

1. ✅ Review this plan
2. ⬜ Create log asset template in Horizon Worlds editor
3. ⬜ Implement `tree-resource-node.ts` (Phase 2)
4. ⬜ Implement `collectible-log.ts` (Phase 4)
5. ⬜ Update `constants.ts` with log item config
6. ⬜ Test basic hit → spawn → collect flow
7. ⬜ Add VFX/SFX polish
8. ⬜ Integrate with quest system (if needed)

---

## References

- **economy-world/ResourceNode.ts**: Infinite resource pattern
- **economy-world/GlobalResourceNode.ts**: Finite resource with respawn
- **economy-world/Pickaxe.ts**: Tool collision and hit registration
- **CollectableQuestItem.ts**: Your existing collection flow
- **InventoryDAO.ts**: Your existing inventory persistence
- **BaseWeapon.ts**: Your existing weapon/tool base

---

**Ready to implement?** Start with Phase 1 asset setup, then move to Phase 2 script creation. Test each phase incrementally before moving forward.
