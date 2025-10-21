# Fight System Phase 1 Plan (Sonnet)

## A short sonnet for intent

In simplest strokes we stage our clash and play,  
A blade, a bot, events that weave the fray.  
Let stats be tuned, let hits be heard and shown,  
With health to mark the wounds by players sown.  

No mind for now, our foes stand still and learn,  
To count each blow, and know when none return.  
From small beginnings flows a greater art:  
Add deaths and moves when we have built the heart.  

## Executive Summary

- **Goal**: Ship a minimal, expandable combat foundation for Horizon Worlds using event-driven patterns aligned with the existing quest/event architecture.
- **Scope now**: Base weapon script with modifiable stats; static NPCs that can receive and record hits; basic health and damage; network events for coordination; integration with WieldableItem.ts holster/inventory.
- **Non-goals now**: Full AI, animations, ragdolls, sophisticated hitboxes, VFX/SFX, loot, complex UIs.

## Design Principles

- Keep it small and shippable; get to first hit fast.
- Event-driven, server-authoritative where applicable, following local-events-overview.md and events-best-practices.md.
- Modularity: clean boundaries so we can add death events, AI, and animations later without breaking Phase 1.
- File naming: kebab-case with .ts suffix for all new files.
- Config consolidation: introduce extension-config.service.ts to centralize combat channel names and debug toggles.

## New Files and Touched Files

### New
- `scripts/extension-config.service.ts`
- `scripts/types/weapon-stats.ts`
- `scripts/services/combat-events.ts`
- `scripts/components/health-component.ts`
- `scripts/components/combat-npc.ts`
- `scripts/components/weapon-base.ts`
- `scripts/dev/spawn-fight-demo.ts` (optional for quick testing)

### Existing to integrate, do not rename
- `scripts/WieldableItem.ts` (non-breaking hooks for attack trigger)
- `scripts/NpcManager.ts` (optional: reference or keep separate registry inside combat-npc.ts)
- `scripts/QuestManager.ts` or existing events infra as reference

## Event Channels and Payloads

**Prefix**: `combat:` (controlled by extension-config.service.ts)

- **combat:attack**
  - Emitted by: weapon-base.ts when player attacks
  - Payload: `{ attackerId, weaponId, stats, origin, direction, range, timestamp }`
- **combat:register-hit**
  - Emitted by: weapon-base.ts upon local target acquisition in Phase 1 (simple proximity)
  - Payload: `{ attackerId, targetId, weaponId, damage, timestamp, hitMeta }`
- **combat:apply-damage**
  - Emitted by: target authority (NPC owner) upon validated hit
  - Payload: `{ targetId, attackerId, amount, weaponId, hitId }`
- **combat:health-update**
  - Emitted by: combat-npc.ts after taking damage
  - Payload: `{ targetId, current, max, lastHit }`
- **combat:death** (stub in Phase 1)
  - Emitted by: combat-npc.ts when health reaches 0
  - Payload: `{ targetId, killerId, weaponId }`

## Data Contracts (Types)

- **WeaponStats**
  - `id: string`
  - `displayName?: string`
  - `damage: number`
  - `attackSpeed: number` (attacks per second)
  - `range: number` (meters)
- **HitLogEntry**
  - `attackerId: string`
  - `weaponId: string`
  - `damage: number`
  - `timestamp: number`

## Minimal Flow, End-to-End

1) Player wields a weapon using existing inventory/holster via WieldableItem.ts.
2) On primary attack input, WieldableItem signals WeaponBase.
3) WeaponBase enforces attackSpeed cooldown and emits combat:attack.
4) WeaponBase performs simple target acquisition for Phase 1:
   - Find closest registered Combat NPC within stats.range and in front of attacker.
   - If found, emit combat:register-hit with damage = stats.damage.
5) The target NPC (combat-npc.ts) receives register-hit, validates authority/ownership, and emits combat:apply-damage to itself if valid.
6) The NPC health component applies damage, updates state, emits combat:health-update. If health reaches 0, emit combat:death (stub for later).
7) NPC records hit in a simple log for analytics and debugging.

## Phase 1 Acceptance Criteria

- A training weapon with configurable damage/attackSpeed/range can be attached to an object and used to attack.
- Static NPCs can be placed in the scene; they register themselves and can be hit.
- On hit, NPC health decreases, and a hit log entry is recorded.
- Event traffic is visible in logs; no hard coupling between weapon and NPC beyond events.
- WieldableItem holster/inventory behavior continues to work as before.

## File-by-File Blueprint

### 1) extension-config.service.ts
- **Purpose**: Single source of truth for combat channel names and debug toggles.
- **Shape**: `combat: { prefix, logEvents, defaultMaxHealth }`

### 2) types/weapon-stats.ts
- Export WeaponStats interface and defaultWeaponStats constants.
- Provide helper clamp and validation functions.

### 3) services/combat-events.ts
- Export string constants for channel names derived from extension-config.service.ts.
- Wrap subscribe and emit functions using the existing events pattern (mirror QuestManager style).
- Dev logging when extensionConfig.combat.logEvents is true.

### 4) components/health-component.ts
- Reusable, entity-agnostic.
- **API**:
  - `constructor(max: number)`
  - `getCurrent()`, `getMax()`
  - `setMax()`, `reset()`
  - `takeDamage(amount, meta)` returns `{ current, dead }`
  - onChange and onDeath callbacks or event hooks

### 5) components/combat-npc.ts
- Static NPC that can:
  - Register itself in a simple in-memory registry for target lookup
  - Subscribe to combat:register-hit and combat:apply-damage for itself
  - Own a HealthComponent instance
  - Maintain `hitLog: HitLogEntry[]`
  - Emit combat:health-update and combat:death
- **Properties**:
  - `id: string`
  - `displayName?: string`
  - `maxHealth: number` (from config or per-NPC override)
- **Public methods**: `getHealth()`, `isDead()`, `clearLog()`, `getHitLog()`

### 6) components/weapon-base.ts
- Attach to a weapon object; expects WieldableItem.ts integration.
- **Maintains**:
  - `stats: WeaponStats`
  - `lastAttackAt: number`
- **Methods**:
  - `setStats(partial)` and `getStats()`
  - `canAttack(now)`
  - `performAttack(attackerId, origin, direction)` finds target in range
- Emits combat:attack; if target found, emits combat:register-hit.

### 7) dev/spawn-fight-demo.ts (optional)
- Spawns a demo weapon with configured stats and one or two CombatNPCs with visible names and health.
- Provides simple console commands or dev toggles for quick testing.

### 8) WieldableItem.ts integration
- Add a minimal extension hook without breaking existing API:
  - On primary-use or equivalent, if a weapon-base component is attached, call its performAttack.
  - Do not rename or move WieldableItem.ts.
- Ensure behavior is gated by isEquipped and holster state.

## Minimal Code Skeletons (Illustrative)

*Note: Do not copy-paste if your local APIs differ; align to your established event bus.*

### File: scripts/types/weapon-stats.ts
```typescript
export interface WeaponStats {
  id: string
  displayName?: string
  damage: number
  attackSpeed: number
  range: number
}

export const defaultWeaponStats: WeaponStats = {
  id: 'training-weapon',
  displayName: 'Training Weapon',
  damage: 10,
  attackSpeed: 1,
  range: 3
}
```

### File: scripts/extension-config.service.ts
```typescript
export const extensionConfig = {
  combat: {
    prefix: 'combat',
    logEvents: true,
    defaultMaxHealth: 100
  }
}
```

### File: scripts/services/combat-events.ts
```typescript
import { extensionConfig } from '../extension-config.service'

export const CombatEvent = {
  Attack: extensionConfig.combat.prefix + ':attack',
  RegisterHit: extensionConfig.combat.prefix + ':register-hit',
  ApplyDamage: extensionConfig.combat.prefix + ':apply-damage',
  HealthUpdate: extensionConfig.combat.prefix + ':health-update',
  Death: extensionConfig.combat.prefix + ':death'
}

// Pseudocode signatures; implement using your existing event bus pattern.
export function emit(eventName: string, payload: any) {}
export function on(eventName: string, handler: (payload: any) => void) {}
```

### File: scripts/components/health-component.ts
```typescript
export class HealthComponent {
  private max: number
  private current: number

  constructor(maxHealth: number) {
    this.max = Math.max(1, maxHealth)
    this.current = this.max
  }

  getCurrent() { return this.current }
  getMax() { return this.max }

  reset() { this.current = this.max }

  takeDamage(amount: number) {
    const dmg = Math.max(0, Math.floor(amount))
    this.current = Math.max(0, this.current - dmg)
    const dead = this.current === 0
    return { current: this.current, max: this.max, dead }
  }
}
```

### File: scripts/components/combat-npc.ts
```typescript
import { CombatEvent, on, emit } from '../services/combat-events'
import { extensionConfig } from '../extension-config.service'
import { HealthComponent } from './health-component'

type HitLogEntry = {
  attackerId: string
  weaponId: string
  damage: number
  timestamp: number
}

const registry = new Map()

export class CombatNPC {
  id: string
  health: HealthComponent
  hitLog: HitLogEntry[] = []

  constructor(id: string, maxHealth?: number) {
    this.id = id
    this.health = new HealthComponent(maxHealth || extensionConfig.combat.defaultMaxHealth)
    registry.set(this.id, this)
    this.bindEvents()
  }

  static getById(id: string) { return registry.get(id) }
  static getAll() { return Array.from(registry.values()) }

  bindEvents() {
    on(CombatEvent.RegisterHit, (p) => {
      if (p.targetId !== this.id) return
      // Authority validation suggested here
      emit(CombatEvent.ApplyDamage, { targetId: this.id, attackerId: p.attackerId, amount: p.damage, weaponId: p.weaponId, hitId: p.timestamp })
    })

    on(CombatEvent.ApplyDamage, (p) => {
      if (p.targetId !== this.id) return
      const result = this.health.takeDamage(p.amount)
      this.hitLog.push({ attackerId: p.attackerId, weaponId: p.weaponId, damage: p.amount, timestamp: Date.now() })
      emit(CombatEvent.HealthUpdate, { targetId: this.id, current: result.current, max: this.health.getMax(), lastHit: p })
      if (result.dead) {
        emit(CombatEvent.Death, { targetId: this.id, killerId: p.attackerId, weaponId: p.weaponId })
      }
    })
  }
}
```

### File: scripts/components/weapon-base.ts
```typescript
import { CombatEvent, emit } from '../services/combat-events'
import { defaultWeaponStats, WeaponStats } from '../types/weapon-stats'
import { CombatNPC } from './combat-npc'

export class WeaponBase {
  stats: WeaponStats = { ...defaultWeaponStats }
  lastAttackAt = 0

  setStats(newStats: Partial<WeaponStats>) {
    this.stats = { ...this.stats, ...newStats }
  }

  canAttack(now: number) {
    const delay = 1000 / Math.max(0.001, this.stats.attackSpeed)
    return (now - this.lastAttackAt) >= delay
  }

  performAttack(attackerId: string, origin: { x: number, y: number, z: number }, direction: { x: number, y: number, z: number }) {
    const now = Date.now()
    if (!this.canAttack(now)) return
    this.lastAttackAt = now
    emit(CombatEvent.Attack, { attackerId, weaponId: this.stats.id, stats: this.stats, origin, direction, range: this.stats.range, timestamp: now })

    // Simple target acquisition: nearest CombatNPC within range
    const npcs = CombatNPC.getAll()
    let best = null
    let bestDist = Number.POSITIVE_INFINITY
    for (const npc of npcs) {
      const npcPos = this.getNpcApproxPosition(npc) // Implementation detail depends on your scene
      const d = this.distance(origin, npcPos)
      if (d <= this.stats.range && d < bestDist) {
        best = npc
        bestDist = d
      }
    }
    if (best) {
      emit(CombatEvent.RegisterHit, { attackerId, targetId: best.id, weaponId: this.stats.id, damage: this.stats.damage, timestamp: now, hitMeta: { dist: bestDist } })
    }
  }

  distance(a, b) {
    const dx = a.x - b.x
    const dy = a.y - b.y
    const dz = a.z - b.z
    return Math.sqrt(dx*dx + dy*dy + dz*dz)
  }

  getNpcApproxPosition(npc) {
    return { x: 0, y: 0, z: 0 }
  }
}
```

*Note: Replace placeholder `getNpcApproxPosition` and event bus calls with your environment-specific APIs.*

## WieldableItem.ts Integration Plan

- Add a single, optional hook point so weapon-base can subscribe to the primary attack action without changing existing behavior.
- **Minimal patch idea**:
  - On equip, allow external registration of an `onAttack` callback.
  - On primary-use input, call `onAttack` if present and weapon is equipped.
- WeaponBase instance can be attached to the same entity and registered as the onAttack handler.

## Testing Checklist

### Single-player sanity:
- Spawn one CombatNPC with 100 HP and a training weapon at 10 damage, 1 attackSpeed, 3 range.
- Attacking within range should decrement health by 10; health-update events should fire; hitLog grows.
- Attacking out of range does nothing.
- Attack cooldown enforced.

### Multi-user smoke:
- Two users in the same world both see consistent health updates when one attacks.
- Only one death event emitted per NPC when reduced to zero.

### Resilience:
- Destroy and respawn NPC; registry should update and avoid stale references.
- Turn debug logging on/off via extension-config.service.ts.

## Expansion Roadmap

### Phase 1.1: Death handling
- Add death states, despawn timers, and a simple respawn.
- Hook death event into SpawnManager and optional loot drops.

### Phase 1.2: Animations and VFX
- Swing or hit animations; simple damage flash effects; sounds.

### Phase 2: Basic AI behaviors
- Walk toward player, basic aggro toggles, attack back.

### Phase 3: Hitboxes and directional damage
- Per-part damage, crits, blocking, knockback.

### Phase 4: UI
- Lightweight health bars; optional dev side panel for metrics.

## Risks and Mitigations

- **Ownership and authority**: Damage should be applied by the NPC owner; use apply-damage on NPC authority and do not trust client-only register-hit blindly.
- **Event spam**: Throttle or batch logging; consider turning off debug logs in production.
- **Mixed naming conventions**: New assets use kebab-case; do not rename legacy files to avoid regressions.

## Done Criteria

- Demo scene or dev script proves: modifiable stats, hit registration, health tracking, WieldableItem integration, and event flow.
- Documented APIs for weapons and NPCs so others can extend.

## Integration Notes

*To be filled in after auditing existing event patterns and WieldableItem.ts integration points.*

**Authority Model for Phase 1**: TBD - Will use simplified local events initially, with server authority patterns to be determined based on existing QuestManager and network event usage.

**WieldableItem.ts Hook**: TBD - Will identify the exact trigger input handler and add minimal onAttack callback support without breaking existing holster/inventory behavior.