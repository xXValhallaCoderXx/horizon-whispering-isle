# LootDropManager Implementation Plan
**Hackathon Scope: Stable, Flexible, Minimal-Effort**
**Asset Strategy: Props match Item IDs (like EnemySpawnManager pattern)**

## 🎯 Goals

Create a flexible loot drop system that:
- Integrates seamlessly with existing `EnemySpawnManager` and `MonsterDied` events
- Supports configurable drop tables with percentage-based chances
- Spawns items with physics (bounce/scatter) at monster death locations
- Allows 1-to-N item drops per monster (configurable)
- Minimal code changes to existing systems
- Production-ready stability for demo, extensible for future

---

## 📋 Architecture Overview

```
MonsterDied Event (EnemySpawnManager)
         ↓
  LootDropManager (listens)
         ↓
    Roll Loot Table
         ↓
   Spawn Items (physics)
         ↓
   Player Pickup (existing)
```

**Key Principle**: Use existing patterns from your codebase. No framework rewrites.

---

## 🗂️ Configuration Structure

### 1. Item Configuration (`constants.ts`)

Add a centralized `ITEMS` map for all loot items:

```typescript
export interface ItemConfig {
  id: string;
  label: string;
  type: 'currency' | 'material' | 'collectible' | 'weapon' | 'consumable';
  asset?: hz.Asset;           // The spawnable asset reference
  description?: string;
  baseValue?: number;         // For economy systems later
}

export const ITEMS: { [key: string]: ItemConfig } = {
  coin: {
    id: 'coin',
    label: 'Gold Coin',
    type: 'currency',
    baseValue: 10,
    asset: undefined,  // Set to your coin asset reference
    description: 'Shiny gold coin'
  },
  feather: {
    id: 'feather',
    label: 'Chicken Feather',
    type: 'material',
    baseValue: 5,
    asset: undefined,  // Set to your feather asset
    description: 'A soft feather from a defeated chicken'
  },
  gem_small: {
    id: 'gem_small',
    label: 'Small Gem',
    type: 'collectible',
    baseValue: 25,
    asset: undefined,  // Set to your gem asset
    description: 'A small but precious gem'
  }
};
```

### 2. Loot Table Types (`constants.ts`)

```typescript
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
```

### 3. Extend Monster Config (`constants.ts`)

Update the `MonsterConfigData` interface:

```typescript
export interface MonsterConfigData {
  type: string;
  label: string;
  spawnRate: number;
  spawnChance: number;
  maxActive: number;
  rareChance: number;
  commonStats: MonsterStats;
  rareStats: MonsterStats;
  
  // NEW: Loot table configuration
  lootTable?: LootTableConfig;
}
```

### 4. Example Monster with Loot (`constants.ts`)

Update the `CHICKEN` entry as a reference example:

```typescript
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
    
    // LOOT TABLE
    lootTable: {
      dropMode: 'multiple',  // Roll each item independently
      entries: [
        { itemId: 'feather', dropChance: 0.8, minQuantity: 1, maxQuantity: 3 },
        { itemId: 'coin', dropChance: 0.3, minQuantity: 1, maxQuantity: 2 },
        { itemId: 'gem_small', dropChance: 0.05, minQuantity: 1, maxQuantity: 1 }
      ],
      guaranteedDrops: [],      // None for now
      scatterRadius: 1.5,
      pluckHeight: 0.5,
      autoDespawnSeconds: 60,
      spawnCountCap: 12
    }
  }
};
```

**Alternative: Single-Drop Mode Example**

```typescript
lootTable: {
  dropMode: 'single',  // Pick only ONE item from the list
  entries: [
    { itemId: 'coin', dropChance: 0.6, minQuantity: 1, maxQuantity: 3 },
    { itemId: 'feather', dropChance: 0.3, minQuantity: 1, maxQuantity: 1 },
    { itemId: 'gem_small', dropChance: 0.1, minQuantity: 1, maxQuantity: 1 }
  ],
  noDropChance: 0.2,  // 20% chance to drop nothing
}
```

---

## 🔧 Implementation: `loot-drop-manager.ts`

### File Structure

```typescript
import * as hz from 'horizon/core';
import { EventsService, ITEMS, MONSTERS, ItemConfig, LootTableConfig, LootTableEntry } from 'constants';

// Debug flag (set in constants or config service)
const DEBUG_LOOT = true;

interface LootRollResult {
  itemId: string;
  quantity: number;
}

class LootDropManager extends hz.Component<typeof LootDropManager> {
  static propsDefinition = {};

  start() {
    // SERVER-ONLY execution guard
    if (!this.isOwnedByServer()) return;

    // Subscribe to monster death events
    this.connectNetworkBroadcastEvent(
      EventsService.CombatEvents.MonsterDied,
      (payload) => this.onMonsterDeath(payload)
    );
    
    console.log('[LootDropManager] Initialized and listening for monster deaths');
  }

  private isOwnedByServer(): boolean {
    const owner = this.entity.owner.get();
    const localPlayer = this.world.getLocalPlayer();
    return owner ? owner.id === localPlayer.id : false;
  }

  // Core handler - see detailed sections below
  private onMonsterDeath(payload: any) { }
  private rollForLoot(config: LootTableConfig): LootRollResult[] { }
  private spawnLootItem(itemConfig: ItemConfig, position: hz.Vec3, config: LootTableConfig) { }
}

hz.Component.register(LootDropManager);
```

### Implementation Details

#### 1. **onMonsterDeath Handler**

```typescript
private onMonsterDeath(payload: { 
  monsterId: string; 
  killerId?: string; 
  position?: hz.Vec3 
}) {
  if (DEBUG_LOOT) {
    console.log(`[LootDropManager] Monster died: ${payload.monsterId}`);
  }

  // Resolve monster type from EnemySpawnManager or payload
  const monsterType = this.resolveMonsterType(payload.monsterId);
  if (!monsterType) {
    console.warn(`[LootDropManager] Could not resolve monster type for ${payload.monsterId}`);
    return;
  }

  // Get monster config
  const monsterConfig = MONSTERS[monsterType];
  if (!monsterConfig || !monsterConfig.lootTable) {
    // No loot table configured - silent return
    return;
  }

  const lootTable = monsterConfig.lootTable;
  const deathPosition = payload.position || new hz.Vec3(0, 1, 0);

  // 1. Start with guaranteed drops
  const results: LootRollResult[] = [];
  if (lootTable.guaranteedDrops) {
    lootTable.guaranteedDrops.forEach(itemId => {
      results.push({ itemId, quantity: 1 });
    });
  }

  // 2. Roll for probabilistic drops
  const rolledItems = this.rollForLoot(lootTable);
  results.push(...rolledItems);

  // 3. Enforce spawn cap
  const cap = lootTable.spawnCountCap || 12;
  const totalToSpawn = Math.min(
    results.reduce((sum, r) => sum + r.quantity, 0),
    cap
  );

  if (DEBUG_LOOT) {
    console.log(`[LootDropManager] Rolling ${results.length} item types, ${totalToSpawn} total items`);
  }

  // 4. Spawn each item
  let spawnedCount = 0;
  for (const result of results) {
    const itemConfig = ITEMS[result.itemId];
    if (!itemConfig || !itemConfig.asset) {
      console.warn(`[LootDropManager] Item ${result.itemId} not found or missing asset`);
      continue;
    }

    for (let i = 0; i < result.quantity && spawnedCount < totalToSpawn; i++) {
      this.spawnLootItem(itemConfig, deathPosition, lootTable);
      spawnedCount++;
    }
  }

  if (DEBUG_LOOT) {
    console.log(`[LootDropManager] Spawned ${spawnedCount} items at ${deathPosition}`);
  }
}
```

#### 2. **rollForLoot Logic**

```typescript
private rollForLoot(config: LootTableConfig): LootRollResult[] {
  const results: Map<string, number> = new Map();

  if (config.dropMode === 'multiple') {
    // Roll each entry independently
    for (const entry of config.entries) {
      const roll = Math.random();
      if (roll < entry.dropChance) {
        const min = entry.minQuantity || 1;
        const max = entry.maxQuantity || 1;
        const quantity = Math.floor(Math.random() * (max - min + 1)) + min;
        
        // Coalesce quantities for same item
        const existing = results.get(entry.itemId) || 0;
        results.set(entry.itemId, existing + quantity);
      }
    }
  } else if (config.dropMode === 'single') {
    // Weighted single pick
    const totalWeight = config.entries.reduce((sum, e) => sum + e.dropChance, 0);
    const noDropChance = config.noDropChance ?? Math.max(0, 1 - totalWeight);
    
    const roll = Math.random();
    let cumulativeWeight = 0;

    // Check no-drop first
    if (roll < noDropChance) {
      return []; // No drop
    }

    // Weighted pick
    cumulativeWeight = noDropChance;
    for (const entry of config.entries) {
      cumulativeWeight += entry.dropChance;
      if (roll < cumulativeWeight) {
        const min = entry.minQuantity || 1;
        const max = entry.maxQuantity || 1;
        const quantity = Math.floor(Math.random() * (max - min + 1)) + min;
        results.set(entry.itemId, quantity);
        break;
      }
    }
  }

  // Convert map to array
  return Array.from(results.entries()).map(([itemId, quantity]) => ({
    itemId,
    quantity
  }));
}
```

#### 3. **spawnLootItem with Physics**

```typescript
private async spawnLootItem(
  itemConfig: ItemConfig, 
  centerPosition: hz.Vec3, 
  config: LootTableConfig
) {
  const scatterRadius = config.scatterRadius || 1.25;
  const pluckHeight = config.pluckHeight || 0.5;
  const autoDespawn = config.autoDespawnSeconds || 60;

  // Random scatter position
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.random() * scatterRadius;
  const offsetX = Math.cos(angle) * distance;
  const offsetZ = Math.sin(angle) * distance;
  
  const spawnPosition = new hz.Vec3(
    centerPosition.x + offsetX,
    centerPosition.y + pluckHeight,
    centerPosition.z + offsetZ
  );

  // Spawn the item
  const spawnedEntities = await this.world.spawnAsset(
    itemConfig.asset!,
    spawnPosition
  );

  if (spawnedEntities.length === 0) {
    console.warn(`[LootDropManager] Failed to spawn ${itemConfig.id}`);
    return;
  }

  const item = spawnedEntities[0];
  
  // Disable collision briefly to avoid interpenetration
  item.collidable.set(false);
  
  // Apply physics after short delay
  this.async.setTimeout(() => {
    item.collidable.set(true);
    item.interactionMode.set(hz.EntityInteractionMode.Physics);
    
    const physicalItem = item.as(hz.PhysicalEntity);
    if (physicalItem) {
      // Launch velocity (7-10 units, mostly horizontal + slight up)
      const velocityMag = 7 + Math.random() * 3;
      const velocity = new hz.Vec3(offsetX, 2, offsetZ).normalize().mul(velocityMag);
      physicalItem.applyForce(velocity, hz.PhysicsForceMode.VelocityChange);
      
      // Angular velocity (spin)
      const angularMag = 1 + Math.random() * 19;
      const torque = new hz.Vec3(
        (Math.random() - 0.5) * angularMag,
        (Math.random() - 0.5) * angularMag,
        (Math.random() - 0.5) * angularMag
      );
      physicalItem.applyTorque(torque);
    }
  }, 200); // 200ms collision delay

  // Auto-despawn
  this.async.setTimeout(() => {
    try {
      this.world.deleteAsset(item);
    } catch (e) {
      // Already collected or deleted
    }
  }, autoDespawn * 1000);
}
```

#### 4. **Resolve Monster Type Helper**

```typescript
private resolveMonsterType(monsterId: string): string | null {
  // Option 1: If EnemySpawnManager tracks type per ID, query it
  // Option 2: Parse from payload if it includes monsterType
  // Option 3: Lookup from a maintained registry
  
  // For hackathon, simplest approach:
  // Assume all current monsters are CHICKEN (expand as needed)
  return 'CHICKEN';
  
  // TODO: Extend EnemySpawnManager to broadcast monsterType in payload
  // or maintain a server-side registry: Map<monsterId, monsterType>
}
```

---

## 🔌 Integration Points

### 1. **Event Payload Check**

Your current `MonsterDied` event from `EnemySpawnManager.ts` (line 287-288):

```typescript
const deathPayload = { 
  monsterId: idKey, 
  killerId: killerId, 
  position: deathPosition 
};
this.sendNetworkBroadcastEvent(EventsService.CombatEvents.MonsterDied, deathPayload);
```

✅ **Already includes `position`** - perfect! No changes needed.

### 2. **Monster Type Resolution**

**Current limitation**: The death event doesn't include monster type.

**Quick fix options**:
1. Add `monsterType` to death payload in `EnemySpawnManager.ts`
2. Maintain a Map in LootDropManager from monsterId → monsterType
3. For hackathon: hardcode to 'CHICKEN' and expand later

**Recommended**: Add one line to `EnemySpawnManager.ts` line 287:

```typescript
const deathPayload = { 
  monsterId: idKey, 
  killerId: killerId, 
  position: deathPosition,
  monsterType: this.props.monsterType  // ADD THIS
};
```

### 3. **Pickup Integration**

**No code changes needed!**

Assumption: Your loot item assets already have the `CollectableQuestItem` script attached.

If not, ensure each loot item prefab includes:
- `CollectableQuestItem.ts` component
- Proper `itemId` prop matching `ITEMS` config
- Trigger/grabbable setup

---

## 🧪 Testing & Debugging

### Debug Flag

Add to `constants.ts`:

```typescript
export const DEBUG_LOOT = true;  // Set false for production
```

### Quick Test Command

Add a dev method to `LootDropManager`:

```typescript
// DEV ONLY: Simulate monster death at player position
private testDrop(player: hz.Player) {
  if (!DEBUG_LOOT) return;
  
  const testPayload = {
    monsterId: 'test_chicken',
    killerId: player.id.toString(),
    position: player.position.get(),
    monsterType: 'CHICKEN'
  };
  
  this.onMonsterDeath(testPayload);
  console.log('[LootDropManager] Test drop triggered');
}
```

Hook this to a trigger or admin command for rapid testing.

### Validation Checklist

- [ ] Monster with no loot table: No drops, no errors
- [ ] `multiple` mode: Items roll independently, correct quantities
- [ ] `single` mode: Only 0 or 1 item type drops
- [ ] `guaranteedDrops`: Always present
- [ ] Items scatter and bounce visibly
- [ ] Items auto-despawn after configured time
- [ ] No errors when monster entity already despawned
- [ ] Spawn cap prevents physics overload

---

## 📝 Configuration Examples

### Example 1: Rare Boss with Guaranteed Loot

```typescript
BOSS_DRAGON: {
  // ... other config
  lootTable: {
    dropMode: 'multiple',
    entries: [
      { itemId: 'gold_bar', dropChance: 1.0, minQuantity: 5, maxQuantity: 10 },
      { itemId: 'dragon_scale', dropChance: 0.7, minQuantity: 1, maxQuantity: 3 },
      { itemId: 'legendary_sword', dropChance: 0.1, minQuantity: 1, maxQuantity: 1 }
    ],
    guaranteedDrops: ['dragon_heart'], // Always drops
    scatterRadius: 3.0,  // Bigger scatter for boss
    autoDespawnSeconds: 120  // Stay longer
  }
}
```

### Example 2: Common Mob with Single Drop

```typescript
GOBLIN: {
  // ... other config
  lootTable: {
    dropMode: 'single',
    entries: [
      { itemId: 'coin', dropChance: 0.5, minQuantity: 1, maxQuantity: 5 },
      { itemId: 'rusty_dagger', dropChance: 0.3, minQuantity: 1, maxQuantity: 1 }
    ],
    noDropChance: 0.2  // 20% chance to drop nothing
  }
}
```

---

## 🚀 Deployment Steps

1. **Update `constants.ts`**:
   - Add `ItemConfig`, `LootTableEntry`, `LootTableConfig` types
   - Add `ITEMS` map with starter items
   - Extend `MonsterConfigData` with optional `lootTable`
   - Add loot table to `CHICKEN` as example

2. **Create `loot-drop-manager.ts`**:
   - Implement core logic from sections above
   - Add to scene as server-owned entity

3. **Optional: Update `EnemySpawnManager.ts`**:
   - Add `monsterType` to death event payload (1 line change)

4. **Configure Assets**:
   - Set `asset` references in `ITEMS` config
   - Ensure loot prefabs have pickup scripts

5. **Test**:
   - Kill a chicken
   - Verify items spawn with physics
   - Verify pickup works
   - Verify auto-despawn

---

## ⚠️ Known Limitations & Future Work

### Current Scope (Hackathon)
- ✅ Percentage-based drops
- ✅ Configurable quantities
- ✅ Physics scatter
- ✅ Single/multiple modes
- ✅ Guaranteed drops

### Not Included (Post-Demo)
- ❌ Rarity tiers (common/rare/legendary)
- ❌ Player-specific drop rates (luck stats)
- ❌ Drop table inheritance
- ❌ Conditional drops (quest-based, time-based)
- ❌ Visual effects per item rarity
- ❌ Sound effects on drop
- ❌ Inventory auto-pickup radius
- ❌ Drop pooling/optimization for many kills

### Post-Hackathon Ideas
1. **Rarity System**: Extend `ItemConfig` with rarity tier, use weighted tables
2. **Loot Notifications**: UI toast showing what dropped
3. **Magnetic Pickup**: Items fly to player after 2 seconds
4. **Drop VFX**: Particle effects on spawn (sparkles for rare items)
5. **Economy Integration**: Track gold earned, spending systems
6. **Quest Integration**: Specific items drop only when quest active
7. **Season Pass**: Bonus drop rates for premium players

---

## 🎬 Demo Script

**For Judges/Testers**:

1. Spawn chickens in the game area
2. Attack and kill a chicken
3. **Observe**: 
   - Items spawn at death location
   - Items bounce/scatter with physics
   - Multiple items may drop simultaneously
4. Walk over an item to pick it up
5. Check quest progress (if quest system integrated)
6. Wait 60 seconds to see items despawn (prevents clutter)

**Key Talking Points**:
- "Flexible config-driven loot tables"
- "Multiple drop modes: single-pick or multi-roll"
- "Physics-based drops feel dynamic and rewarding"
- "Easily extensible for future item types and rarities"

---

## 📁 Files Changed

### New Files
- `loot-drop-manager.ts`

### Modified Files
- `constants.ts`
  - Added `ItemConfig`, `LootTableEntry`, `LootTableConfig` interfaces
  - Added `ITEMS` map
  - Extended `MonsterConfigData.lootTable`
  - Updated `CHICKEN` with example loot table

### Optional Changes
- `EnemySpawnManager.ts` (line 287): Add `monsterType` to death payload

---

## 🏁 Success Criteria

- ✅ Monster dies → Items spawn
- ✅ Items have physics (bounce, spin)
- ✅ Items can be picked up
- ✅ No errors in console
- ✅ Items auto-despawn (no accumulation)
- ✅ Config is human-readable and easy to modify
- ✅ Works with existing pickup/quest systems
- ✅ Demo-ready stability

---

**Author**: Claude (Sonnet 4.5)  
**Date**: 2025-10-27  
**Version**: 2.0 - Props Edition  
**Status**: Ready for Implementation ✨

---

## 📝 Quick Implementation Summary

### Changes Needed:

#### 1. **constants.ts** - Add Types & Config

```typescript
// Add these interfaces
export interface ItemConfig {
  id: string;
  label: string;
  type: 'currency' | 'material' | 'collectible' | 'weapon' | 'consumable';
  description?: string;
  baseValue?: number;
}

export interface LootTableEntry {
  itemId: string;
  dropChance: number;
  minQuantity?: number;
  maxQuantity?: number;
}

export interface LootTableConfig {
  dropMode: 'single' | 'multiple';
  entries: LootTableEntry[];
  guaranteedDrops?: string[];
  noDropChance?: number;
  scatterRadius?: number;
  pluckHeight?: number;
  autoDespawnSeconds?: number;
  spawnCountCap?: number;
}

// Add ITEMS map
export const ITEMS: { [key: string]: ItemConfig } = {
  coin: {
    id: 'coin',
    label: 'Gold Coin',
    type: 'currency',
    baseValue: 10,
  },
  feather: {
    id: 'feather',
    label: 'Chicken Feather',
    type: 'material',
    baseValue: 5,
  },
  gem_small: {
    id: 'gem_small',
    label: 'Small Gem',
    type: 'collectible',
    baseValue: 25,
  },
};

// Update MonsterConfigData interface
export interface MonsterConfigData {
  type: string;
  label: string;
  spawnRate: number;
  spawnChance: number;
  maxActive: number;
  rareChance: number;
  commonStats: MonsterStats;
  rareStats: MonsterStats;
  lootTable?: LootTableConfig;  // ADD THIS LINE
}

// Update CHICKEN monster with loot table
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
    // ADD THIS LOOT TABLE
    lootTable: {
      dropMode: 'multiple',
      entries: [
        { itemId: 'feather', dropChance: 0.8, minQuantity: 1, maxQuantity: 3 },
        { itemId: 'coin', dropChance: 0.3, minQuantity: 1, maxQuantity: 2 },
        { itemId: 'gem_small', dropChance: 0.05, minQuantity: 1, maxQuantity: 1 },
      ],
      scatterRadius: 1.5,
      pluckHeight: 0.5,
      autoDespawnSeconds: 60,
      spawnCountCap: 12,
    },
  },
};
```

#### 2. **loot-drop-manager.ts** - Create New File

See full implementation in the document above (Section: "Implementation: loot-drop-manager.ts")

**Key points:**
- Props: `coin`, `feather`, `gem_small` (match item IDs exactly)
- `buildAssetRegistry()` maps itemId → prop asset
- Listens to `EventsService.CombatEvents.MonsterDied`
- Spawns items with physics at death position

#### 3. **EnemySpawnManager.ts** - Optional Enhancement

**Line 287** - Add `monsterType` to death payload:

```typescript
// BEFORE:
const deathPayload = { 
  monsterId: idKey, 
  killerId: killerId, 
  position: deathPosition 
};

// AFTER:
const deathPayload = { 
  monsterId: idKey, 
  killerId: killerId, 
  position: deathPosition,
  monsterType: this.props.monsterType  // ADD THIS LINE
};
```

#### 4. **Horizon Editor Setup**

1. **Create loot item prefabs:**
   - Coin prefab with `CollectableQuestItem` script (itemId: 'coin')
   - Feather prefab with `CollectableQuestItem` script (itemId: 'feather')
   - Gem prefab with `CollectableQuestItem` script (itemId: 'gem_small')

2. **Add LootDropManager to scene:**
   - Create empty entity named "LootDropManager"
   - Set owner to **Server**
   - Attach `loot-drop-manager.ts` script
   - Assign props:
     - `coin` → coin prefab asset
     - `feather` → feather prefab asset  
     - `gem_small` → gem prefab asset

3. **Test:**
   - Kill a chicken
   - See items spawn and bounce
   - Pick up items
   - Verify auto-despawn after 60s

---

### Prop Naming Convention

**Rule:** Prop name = Item ID from ITEMS config

```
ITEMS config:        LootDropManager props:
─────────────        ─────────────────────
coin          →      coin: { type: PropTypes.Asset }
feather       →      feather: { type: PropTypes.Asset }
gem_small     →      gem_small: { type: PropTypes.Asset }
dragon_scale  →      dragon_scale: { type: PropTypes.Asset }
```

This keeps it simple and matches your EnemySpawnManager pattern! 🎯
