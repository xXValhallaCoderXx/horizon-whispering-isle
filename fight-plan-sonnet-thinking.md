# Fight System Implementation Plan - Sonnet Thinking

## Document Location

Project root: `/mnt/c/Users/Renate/AppData/LocalLow/Meta/Horizon Worlds/871161152741497/fight-plan-sonnet-thinking.md`

## Purpose

Define a phased, achievable combat system for Meta Horizon Worlds that starts simple for quick wins and cleanly grows into health, death, quest integration, and advanced features. The plan aligns with holster and inventory via `WieldableItem.ts` and respects project conventions.

---

## Key References and Inputs

### Core references in this project

- **WieldableItem.ts** - Weapon base and holster integration
- **NPCMonster.ts** - Combat pattern references (health, states, hit detection)
- **Sword.ts** - Weapon mechanic references (cooldown, network events)
- **NPCAgent.ts** - Animation and state management
- **constants.ts** - EventsService and event naming conventions
- **Existing quest system** - Hunt objectives already defined

### Provided reference sources

- `scripts/context/npc-scripts/` - NPC specialist implementations
- `context/shovel-pop/` - Tool interaction and harvesting mechanics

### Conventions

- New files in **kebab-case** with `.ts` suffix (e.g., `base-weapon.ts`)
- Keep compatibility with existing **PascalCase** files where they already exist
- Use Horizon SDK patterns (`hz.Component`, network events, etc.)

---

## High-Level System Goals

### Phase 1: Quick Wins (Immediate)

Simple melee combat with static NPCs that log hits. No health yet. Uses trigger zones and network events coordinated via `EventsService`.

### Phase 2: Health and Death

Add health pools, apply damage, death animations, respawn, and event emission for external systems.

### Phase 3: Quest Integration

Wire deaths into Hunt objectives and per-player kill tracking through the existing quest system.

### Phase 4: Advanced Features (Future)

AI behavior, ranged weapons, damage types, loot drops, and spawn system integration.

---

## Architecture Snapshot

### Flow Overview

1. **Weapons** broadcast attack start/end over EventsService
2. **NPCs** own hit detection using trigger colliders and record hits during active attack windows
3. **Damage application** is authoritative on the NPC (owner-side) and broadcast back to all clients
4. **Quest system** listens to death events and increments progress per player

### Network Authority

- **Weapon side**: Attacker-owned, only declares attack windows
- **NPC side**: Authoritative for damage, health, and death to avoid double application
- **All state changes**: Mirrored via EventsService network events

---

## File and Module Layout

```
scripts/
├── combat/
│   ├── base-weapon.ts          (Phase 1)
│   ├── hit-detector.ts         (Phase 1)
│   ├── enemy-npc.ts            (Phase 1, extended in Phase 2)
│   ├── damage-types.ts         (Phase 4 - future)
│   └── spawn-manager.ts        (Phase 4 - future integration)
├── constants.ts                 (extend with CombatEvents)
├── WieldableItem.ts            (existing - base for weapons)
├── EnemyNPC.ts                 (existing - replace/extend)
├── NPC.ts                      (existing - dialog NPCs)
└── context/
    ├── npc-scripts/            (reference only)
    │   ├── NPCMonster.ts       (reference - combat patterns)
    │   ├── Sword.ts            (reference - weapon patterns)
    │   └── NPCAgent.ts         (reference - animation)
    └── shovel-pop/             (reference - tool interaction)
```

---

## Event Names and Payloads

### Add to `constants.ts` under `EventsService`

```typescript
export class EventsService {
  // ... existing events ...

  static readonly CombatEvents = {
    AttackStart: new hz.NetworkEvent<AttackStartPayload>("combat.attack_start"),
    AttackEnd: new hz.NetworkEvent<AttackEndPayload>("combat.attack_end"),
    Hit: new hz.NetworkEvent<HitPayload>("combat.hit"),
    ApplyDamage: new hz.NetworkEvent<ApplyDamagePayload>("combat.apply_damage"),
    Died: new hz.NetworkEvent<DiedPayload>("combat.died"),
  };

  // ... existing QuestEvents can be extended with:
  static readonly HuntProgress = new hz.LocalEvent<HuntProgressPayload>(
    "quest.hunt.progress"
  );
}
```

### Payload Types

```typescript
export type AttackStartPayload = {
  weaponId: string;
  attackerPlayer: hz.Player;
  attackId: string; // unique per swing
  stats: WeaponStats;
  timestamp: number;
};

export type AttackEndPayload = {
  weaponId: string;
  attackerPlayer: hz.Player;
  attackId: string;
  timestamp: number;
};

export type HitPayload = {
  attackId: string;
  attackerPlayer: hz.Player;
  targetNpcId: string;
  weaponId: string;
  hitPos: hz.Vec3;
  timestamp: number;
};

export type ApplyDamagePayload = {
  targetNpcId: string;
  amount: number;
  attackerPlayer: hz.Player;
  weaponId: string;
  attackId: string;
  timestamp: number;
};

export type DiedPayload = {
  targetNpcId: string;
  enemyType: string;
  killerPlayer: hz.Player | null;
  timestamp: number;
};

export type HuntProgressPayload = {
  player: hz.Player;
  enemyType: string;
  increment: number; // usually 1
  timestamp: number;
};

export type WeaponStats = {
  damage: number;
  attackCooldown: number; // in seconds
  attackRange: number; // in meters
  weaponType: "melee" | "ranged";
};
```

---

## Technical Choices and Rationale

### Collision Detection

- **Phase 1**: Use trigger colliders attached to NPCs for simplest and most reliable local overlap checks
- **Future**: Consider hybrid raycast from weapon for precise swing arcs and headshots

### Networking

- **AttackStart/End** sent from attacker to all clients so NPC hit detectors can validate attack windows
- **Hit reporting** sent from detecting client to authoritative NPC owner for damage adjudication in Phase 2
- **Death** broadcast to all clients via single authoritative source

### Holster and Inventory

- `base-weapon.ts` extends `WieldableItem.ts` so equipping, holstering, and using weapons is consistent with existing system
- Leverages existing `onGrabStart`, `onGrabEnd`, `onTriggerDown` events

### Naming Compatibility

- New files use kebab-case names (project preference)
- References to existing PascalCase files keep their original names to avoid import breakage

---

## Phase 1: Quick Wins - Simple Implementation

### Goal

Have a usable melee flow in multiplayer where weapons broadcast attacks, static NPCs detect hits via trigger zones, and we record and log hits. **No health yet.**

### Deliverables

1. `base-weapon.ts` - Extends WieldableItem.ts and exposes modifiable stats
2. `hit-detector.ts` - On NPCs, records hits during attack windows
3. `enemy-npc.ts` - Minimal identity and registration, no health logic yet
4. EventsService constants for CombatEvents
5. Basic weapon swing animations triggered by WieldableItem events
6. Network events for attack coordination and hit logging

### New Types and Interfaces

```typescript
// scripts/combat/base-weapon.ts
import * as hz from "horizon/core";
import { WieldableItem } from "../WieldableItem";
import { EventsService, WeaponStats } from "../constants";

class BaseWeapon extends hz.Component<typeof BaseWeapon> {
  static propsDefinition = {
    ...WieldableItem.propsDefinition,
    weaponId: { type: hz.PropTypes.String, default: "weapon-1" },
    damage: { type: hz.PropTypes.Number, default: 10 },
    attackCooldown: { type: hz.PropTypes.Number, default: 0.6 },
    attackRange: { type: hz.PropTypes.Number, default: 2.0 },
    weaponType: { type: hz.PropTypes.String, default: "melee" },
  };

  private lastAttackTime: number = 0;
  private attackInProgress: boolean = false;
  private currentAttackId: string | null = null;
  private owner: hz.Player | null = null;

  preStart(): void {
    // Hook into WieldableItem events
    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnIndexTriggerDown,
      (player: hz.Player) => this.onTriggerDown(player)
    );

    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnGrabStart,
      (isRightHand: boolean, player: hz.Player) => {
        this.owner = player;
      }
    );
  }

  start() {}

  private onTriggerDown(player: hz.Player) {
    if (this.owner !== player) return;
    this.tryAttack(player);
  }

  private tryAttack(attackerPlayer: hz.Player) {
    const now = Date.now();
    if (now - this.lastAttackTime < this.props.attackCooldown * 1000) {
      return;
    }

    this.lastAttackTime = now;
    const attackId = `${attackerPlayer.id}-${now}`;
    this.currentAttackId = attackId;
    this.attackInProgress = true;

    // Trigger local animation
    this.playAttackAnimation(attackerPlayer);

    // Broadcast start so NPC hit detectors accept hits for this window
    const stats: WeaponStats = {
      damage: this.props.damage,
      attackCooldown: this.props.attackCooldown,
      attackRange: this.props.attackRange,
      weaponType: this.props.weaponType as "melee" | "ranged",
    };

    this.sendNetworkBroadcastEvent(EventsService.CombatEvents.AttackStart, {
      weaponId: this.props.weaponId,
      attackerPlayer,
      attackId,
      stats,
      timestamp: now,
    });

    // End window after swing animation
    this.async.setTimeout(() => {
      this.endAttack(attackerPlayer);
    }, this.estimatedSwingWindowMs());
  }

  private endAttack(attackerPlayer: hz.Player) {
    if (!this.attackInProgress || !this.currentAttackId) return;
    const now = Date.now();

    this.sendNetworkBroadcastEvent(EventsService.CombatEvents.AttackEnd, {
      weaponId: this.props.weaponId,
      attackerPlayer,
      attackId: this.currentAttackId,
      timestamp: now,
    });

    this.attackInProgress = false;
    this.currentAttackId = null;
  }

  private playAttackAnimation(player: hz.Player) {
    player.playAvatarGripPoseAnimationByName(
      hz.AvatarGripPoseAnimationNames.Fire
    );
  }

  private estimatedSwingWindowMs(): number {
    return 350; // Fixed window for Phase 1
  }

  // Expose for hit detector to check
  public getAttackState() {
    return {
      attackInProgress: this.attackInProgress,
      currentAttackId: this.currentAttackId,
      owner: this.owner,
    };
  }
}
hz.Component.register(BaseWeapon);
```

### Hit Detector Component

```typescript
// scripts/combat/hit-detector.ts
import * as hz from "horizon/core";
import { EventsService, AttackStartPayload } from "../constants";

class HitDetector extends hz.Component<typeof HitDetector> {
  static propsDefinition = {
    npcId: { type: hz.PropTypes.String, default: "npc-1" },
    enemyType: { type: hz.PropTypes.String, default: "generic" },
  };

  private acceptHitsUntil: number = 0;
  private lastProcessedAttackIds: Record<string, boolean> = {};
  private currentActiveAttack: AttackStartPayload | null = null;

  preStart(): void {
    // Listen to global attack start and end to know when hits are valid
    this.connectNetworkBroadcastEvent(
      EventsService.CombatEvents.AttackStart,
      (payload: AttackStartPayload) => {
        this.currentActiveAttack = payload;
        this.acceptHitsUntil = Date.now() + 400;
      }
    );

    this.connectNetworkBroadcastEvent(
      EventsService.CombatEvents.AttackEnd,
      () => {
        this.acceptHitsUntil = 0;
        this.currentActiveAttack = null;
      }
    );

    // Detect collisions with weapons
    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnEntityCollision,
      (otherEntity: hz.Entity) => this.onEntityCollision(otherEntity)
    );
  }

  start() {}

  private onEntityCollision(otherEntity: hz.Entity) {
    const now = Date.now();
    if (now > this.acceptHitsUntil || !this.currentActiveAttack) return;

    // Check if the colliding entity is a weapon
    const weapon = this.resolveWeaponFromEntity(otherEntity);
    if (!weapon) return;

    const attackId = this.currentActiveAttack.attackId;
    if (this.lastProcessedAttackIds[attackId]) return;
    this.lastProcessedAttackIds[attackId] = true;

    const hitPayload = {
      attackId,
      attackerPlayer: this.currentActiveAttack.attackerPlayer,
      targetNpcId: this.props.npcId,
      weaponId: this.currentActiveAttack.weaponId,
      hitPos: this.entity.position.get(),
      timestamp: now,
    };

    // For Phase 1, only log and broadcast hit event
    console.log(
      `[HitDetector] HIT detected on ${this.props.npcId}`,
      hitPayload
    );
    this.sendNetworkBroadcastEvent(EventsService.CombatEvents.Hit, hitPayload);
  }

  private resolveWeaponFromEntity(entity: hz.Entity): any {
    // Check if entity has BaseWeapon component
    const weaponComponents = entity.getComponents("BaseWeapon");
    return weaponComponents.length > 0 ? weaponComponents[0] : null;
  }
}
hz.Component.register(HitDetector);
```

### Enemy NPC Component (Phase 1 - Minimal)

```typescript
// scripts/combat/enemy-npc.ts
import * as hz from "horizon/core";

class EnemyNPC extends hz.Component<typeof EnemyNPC> {
  static propsDefinition = {
    npcId: { type: hz.PropTypes.String, default: "npc-1" },
    enemyType: { type: hz.PropTypes.String, default: "generic" },
  };

  preStart(): void {
    console.log(
      `[EnemyNPC] Initialized: ${this.props.npcId} of type ${this.props.enemyType}`
    );
  }

  start() {}
}
hz.Component.register(EnemyNPC);
```

### Testing and Acceptance for Phase 1

#### Single Player

- Equip weapon, swing, see console hit logs when overlapping NPC trigger
- Attack cooldown prevents spam
- Animation plays on attack

#### Multiplayer

- Two players swing at the same NPC and both hits log with correct attackerPlayer
- Hit deduplication works (same attackId not processed twice)
- Weapon stats visible in AttackStart event payload

---

## Phase 2: Health and Death System

### Goal

Add authoritative health per NPC, visible death, and respawn, with events for other systems.

### Deliverables

1. `enemy-npc.ts` extended with health management and authority
2. Death animation and respawn after delay
3. Visual hit feedback (flash or flinch animation)
4. EventsService integration for ApplyDamage and Died
5. Support for different enemy types with varying health

### Core Changes to Enemy NPC

```typescript
// scripts/combat/enemy-npc.ts (Phase 2 Extension)
import * as hz from "horizon/core";
import { EventsService, ApplyDamagePayload, HitPayload } from "../constants";

class EnemyNPC extends hz.Component<typeof EnemyNPC> {
  static propsDefinition = {
    npcId: { type: hz.PropTypes.String, default: "npc-1" },
    enemyType: { type: hz.PropTypes.String, default: "generic" },
    maxHealth: { type: hz.PropTypes.Number, default: 50 },
    respawnDelayMs: { type: hz.PropTypes.Number, default: 5000 },
  };

  private currentHealth: number = 0;
  private alive: boolean = true;
  private lastHitByPlayer: hz.Player | null = null;
  private startPosition: hz.Vec3 = hz.Vec3.zero;
  private startRotation: hz.Quaternion = hz.Quaternion.zero;

  preStart(): void {
    this.currentHealth = this.props.maxHealth;
    this.startPosition = this.entity.position.get();
    this.startRotation = this.entity.rotation.get();

    // Listen to hit events and convert to damage
    this.connectNetworkBroadcastEvent(
      EventsService.CombatEvents.Hit,
      (payload: HitPayload) => {
        if (payload.targetNpcId !== this.props.npcId) return;
        this.onHit(payload);
      }
    );

    console.log(
      `[EnemyNPC] Initialized: ${this.props.npcId} with ${this.props.maxHealth} HP`
    );
  }

  start() {}

  private onHit(payload: HitPayload) {
    if (!this.alive) return;

    // Get damage from the weapon stats carried in AttackStart
    // For simplicity, we can cache the last AttackStart or look up weapon damage
    // In this example, we'll emit ApplyDamage directly
    const damageAmount = 10; // TODO: Get from weapon stats

    this.sendNetworkBroadcastEvent(EventsService.CombatEvents.ApplyDamage, {
      targetNpcId: this.props.npcId,
      amount: damageAmount,
      attackerPlayer: payload.attackerPlayer,
      weaponId: payload.weaponId,
      attackId: payload.attackId,
      timestamp: Date.now(),
    });
  }

  preStart(): void {
    // ... previous preStart code ...

    // Listen to ApplyDamage events
    this.connectNetworkBroadcastEvent(
      EventsService.CombatEvents.ApplyDamage,
      (payload: ApplyDamagePayload) => {
        if (payload.targetNpcId !== this.props.npcId) return;
        this.applyDamage(payload.amount, payload.attackerPlayer);
      }
    );
  }

  private applyDamage(amount: number, attackerPlayer: hz.Player) {
    if (!this.alive) return;

    this.currentHealth = Math.max(0, this.currentHealth - amount);
    this.lastHitByPlayer = attackerPlayer;

    console.log(
      `[EnemyNPC] ${this.props.npcId} took ${amount} damage. HP: ${this.currentHealth}/${this.props.maxHealth}`
    );

    this.playHitFeedback();

    if (this.currentHealth === 0) {
      this.die();
    }
  }

  private die() {
    if (!this.alive) return;

    this.alive = false;
    console.log(`[EnemyNPC] ${this.props.npcId} died!`);

    this.playDeathAnimation();

    // Emit death event
    this.sendNetworkBroadcastEvent(EventsService.CombatEvents.Died, {
      targetNpcId: this.props.npcId,
      enemyType: this.props.enemyType,
      killerPlayer: this.lastHitByPlayer,
      timestamp: Date.now(),
    });

    // Disable collision
    try {
      this.entity.collidable.set(false);
    } catch {}

    // Respawn after delay
    this.async.setTimeout(() => this.respawn(), this.props.respawnDelayMs);
  }

  private respawn() {
    this.currentHealth = this.props.maxHealth;
    this.alive = true;
    this.lastHitByPlayer = null;

    // Reset position
    this.entity.position.set(this.startPosition);
    this.entity.rotation.set(this.startRotation);

    // Re-enable collision
    try {
      this.entity.collidable.set(true);
    } catch {}

    console.log(
      `[EnemyNPC] ${this.props.npcId} respawned with ${this.props.maxHealth} HP`
    );
  }

  private playHitFeedback() {
    // TODO: Flash material or play flinch animation
    // For now, just scale pulse
    const originalScale = this.entity.scale.get();
    this.entity.scale.set(originalScale.mul(1.1));
    this.async.setTimeout(() => {
      this.entity.scale.set(originalScale);
    }, 100);
  }

  private playDeathAnimation() {
    // TODO: Play death animation if NPCAgent is attached
    // For now, just hide the entity temporarily
    try {
      this.entity.visible.set(false);
      this.async.setTimeout(() => {
        this.entity.visible.set(true);
      }, this.props.respawnDelayMs - 100);
    } catch {}
  }
}
hz.Component.register(EnemyNPC);
```

### Enemy Type Health Configuration

```typescript
// Add to constants.ts
export const ENEMY_HEALTH_CONFIG: Record<
  string,
  { maxHealth: number; respawnDelayMs: number }
> = {
  chicken: { maxHealth: 10, respawnDelayMs: 3000 },
  boar: { maxHealth: 40, respawnDelayMs: 5000 },
  golem: { maxHealth: 120, respawnDelayMs: 10000 },
  generic: { maxHealth: 50, respawnDelayMs: 5000 },
};
```

### Testing and Acceptance for Phase 2

- Damage applies only while alive and reduces health correctly
- Death event fires once per NPC death
- NPC respawns after delay with full health
- Visual hit and death feedback visible
- Multiplayer: damage adjudication happens once; all clients see consistent alive state

---

## Phase 3: Quest Integration

### Goal

Connect enemy deaths to quest Hunt objectives and track kills per player.

### Events and Flow

1. On NPC death, listen for `Died` event
2. Emit `HuntProgress` event with player and enemyType
3. Quest system increments relevant objectives per player
4. Support enemy-specific objectives (e.g., `hunt_chicken`)

### Implementation

```typescript
// Add to QuestManager.ts or create hunt-adapter.ts
import { EventsService, DiedPayload, HuntProgressPayload } from "./constants";

// In QuestManager start() or similar initialization:
this.connectNetworkBroadcastEvent(
  EventsService.CombatEvents.Died,
  (payload: DiedPayload) => {
    if (!payload.killerPlayer) return;

    // Emit hunt progress for the killer
    this.sendLocalBroadcastEvent(EventsService.HuntProgress, {
      player: payload.killerPlayer,
      enemyType: payload.enemyType,
      increment: 1,
      timestamp: payload.timestamp,
    });
  }
);

// Listen to HuntProgress in quest system
this.connectLocalBroadcastEvent(
  EventsService.HuntProgress,
  (payload: HuntProgressPayload) => {
    this.incrementHuntObjective(
      payload.player,
      payload.enemyType,
      payload.increment
    );
  }
);
```

### Mapping Enemy Types to Quest Objectives

```typescript
// In QuestManager.ts
private incrementHuntObjective(player: hz.Player, enemyType: string, increment: number) {
  const activeQuest = this.getActiveQuestForPlayer(player);
  if (!activeQuest) return;

  // Find matching hunt objective
  const huntObjective = activeQuest.objectives.find(
    obj => obj.type === ObjectiveType.Hunt && obj.targetType === enemyType
  );

  if (huntObjective && !huntObjective.isCompleted) {
    huntObjective.currentCount += increment;

    if (huntObjective.currentCount >= huntObjective.targetCount) {
      huntObjective.isCompleted = true;
      console.log(`[QuestManager] ${player.name.get()} completed hunt objective for ${enemyType}`);
    }

    // Broadcast progress update
    this.sendLocalBroadcastEvent(EventsService.QuestEvents.QuestProgressUpdated, {
      player,
      questId: activeQuest.questId,
      stage: this.calculateQuestStage(activeQuest),
      quest: activeQuest,
    });
  }
}
```

### Edge Cases

- Only award progress to the killer recorded by `lastHitByPlayer` on the NPC
- If `killerPlayer` is null due to an edge case, award no progress
- Multiple players can work on same quest independently

### Testing and Acceptance for Phase 3

- Killing a chicken increments the `hunt_chicken` objective for the killer only
- Multiple players killing different enemies update their own progress independently
- Quest UI updates accordingly
- Death events properly tracked in quest log

---

## Phase 4: Advanced Features (Future)

### AI Behavior for Enemy NPCs

- Reuse NPCAgent.ts patterns for state machine (idle, chase, attack, stagger, dead)
- Add navigation via NavMeshAgent
- Perception cone checks
- Sync AI state via EventsService for remote clients

### Different Weapon Types

- **Melee**: Keep as is with improved hit arcs or capsules attached to weapon
- **Ranged**: Add projectile component, spawn point, and travel logic
  - Projectiles emit hit events on collision with NPCs

### Damage Types and Resistances

- Add damage types: slash, blunt, pierce, fire, frost
- Per-enemy resistances modify damage amounts
- Keep a lookup table in constants

### Loot Drops on Enemy Death

- On death, request SpawnManager to instantiate a loot pickup with rarity tables
- Broadcast a loot spawned event with itemId and position
- Players can collect loot as collectibles

### Enemy Spawning System

- Integrate with spawn-manager.ts to manage waves
- Respawn points and density limits
- Wave-based spawning for combat encounters

---

## Technical Considerations and Decisions

### Trigger Zones vs Raycast

#### Trigger Zones Advantages

- Very quick to implement
- Easy to visualize
- Works with static NPCs and swing windows

#### Raycast Advantages

- More precise in fast swings
- Supports directional arc logic
- Hit prioritization

#### Decision

- **Use trigger zones in Phase 1** for simplicity
- Consider hybrid rays per animation frame in Phase 4

### Networking Authority

- **Weapon side**: Attacker-owned and only declares attack windows
- **NPC side**: Authoritative for damage, health, and death to avoid double application
- **All state changes**: Mirrored via EventsService

### Holster and Inventory Compatibility

- All weapons derive from WieldableItem.ts with existing equip and holster events
- Ensure `onEquip` and `onUnequip` set up and tear down listeners to reduce leaks
- Stats are editable on the weapon instance to allow content creators to tune

### Compatibility Notes on Naming

- **New files use kebab-case `.ts`**:
  - `base-weapon.ts`
  - `hit-detector.ts`
  - `enemy-npc.ts`
- **Leave existing PascalCase files as is** to match current imports:
  - `WieldableItem.ts`
  - `NPCAgent.ts`
  - `NPCMonster.ts`
  - `Sword.ts`

### Instrumentation and Logging

- Phase 1: Log every combat event (attack_start, hit) with compact payloads
- Add a debug toggle `debugCombat` in constants or a debug service so logs can be silenced later
- Consider a simple overlay or console summary when testing

---

## Milestones and Definition of Done

### Phase 1 Done

- ✅ Weapon swings broadcast and animate
- ✅ Static NPCs detect and log hits
- ✅ Multiplayer hit logs show correct attacker IDs and dedupe per swing

### Phase 2 Done

- ✅ Health decreases and death animates and respawns
- ✅ Damage adjudicated once per hit in multiplayer
- ✅ Death events fire with correct killer ID

### Phase 3 Done

- ✅ Quest progress increments on enemy death for the killer only
- ✅ Enemy-specific objectives (e.g., `hunt_chicken`) supported

### Phase 4 Done (Baseline)

- ✅ Simple AI loop
- ✅ Basic ranged weapon
- ✅ One resistance table
- ✅ Simple loot drop
- ✅ Spawn manager link

---

## Implementation Checklist Per Phase

### Phase 1

- [ ] Create files `base-weapon.ts`, `hit-detector.ts`, `enemy-npc.ts` in `scripts/combat/`
- [ ] Extend `constants.ts` with CombatEvents
- [ ] Hook WieldableItem events to call BaseWeapon.tryAttack
- [ ] Attach HitDetector to NPC prefabs and ensure trigger colliders exist
- [ ] Verify logs in single and multiplayer

### Phase 2

- [ ] Add health to `enemy-npc.ts` and ApplyDamage handling
- [ ] Bridge Hit to ApplyDamage with weapon.stats.damage
- [ ] Add death animation and respawn after delay
- [ ] Emit Died event
- [ ] Test multiplayer damage adjudication

### Phase 3

- [ ] Listen for Died and emit quest.hunt.progress mapped by enemyType
- [ ] Update quest storage and any UI if present
- [ ] Add tests for per-player progress
- [ ] Verify quest objectives increment correctly

### Phase 4

- [ ] Introduce NPCAgent state machine
- [ ] Add projectile component for ranged
- [ ] Add damage types table and resistances
- [ ] Integrate SpawnManager and loot drops

---

## Risks and Mitigations

### Risk: Double Hit or Damage in Multiplayer

**Mitigation**: Deduplicate by attackId and centralize ApplyDamage on NPC owner

### Risk: Missed Triggers on Low Frame Rates

**Mitigation**: Keep a slightly generous attack window and consider capsule overlap checks per frame during the window

### Risk: Event Storms

**Mitigation**: Throttle logs in debug and keep payloads small

### Risk: Ownership Confusion

**Mitigation**: Clearly document which component owns which state. NPCs own health, weapons own attack timing.

---

## Next Actions to Kick Off Phase 1

1. **Create file structure**:

   ```bash
   mkdir -p scripts/combat
   ```

2. **Create the three new files** in `scripts/combat/` with the skeletons provided above:

   - `base-weapon.ts`
   - `hit-detector.ts`
   - `enemy-npc.ts`

3. **Add CombatEvents to constants.ts** and wire up EventsService network events

4. **Place a simple NPC prefab** with a trigger collider and attach both HitDetector and EnemyNPC components

5. **Create a weapon prefab** that extends BaseWeapon (similar to Sword.ts pattern)

6. **Hook WieldableItem events** and verify attack logs in console

7. **Test in multiplayer** with two players attacking the same NPC

---

## References from Provided Code

### scripts/context/npc-scripts

- **NPCMonster.ts**: Reuse animation triggers and state handling patterns
- **NPCAgent.ts**: Merge animation system and look-at for Phase 4
- **Sword.ts**: Use as template for weapon attachment and event flow

### context/shovel-pop

- **Shovel.ts**: Use harvesting pickup and respawn patterns to inform NPC respawn timing
- **Item systems**: Reference for loot drops in Phase 4

---

## End of Document

**Created**: 2025-10-21  
**Author**: Sonnet Thinking Analysis  
**Status**: Ready for Phase 1 Implementation
