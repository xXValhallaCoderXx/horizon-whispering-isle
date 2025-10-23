# Player State & Quest Flow Architecture

**Date:** October 23, 2025  
**Purpose:** Central state management pattern for player persistence and quest progression

---

## Executive Summary

This document defines the **single source of truth** architecture for player state management in Horizon Worlds. The pattern separates **persistence logic** (`PlayerStateService`) from **runtime logic** (`QuestManager`), ensuring clean, maintainable code that scales.

### The Problem

Currently, when a player joins the world:

1. ✅ `WorldManager` detects the join event
2. ❌ Player's quest progress is **not loaded** from `persistentStorage`
3. ❌ `QuestManager` starts with a **blank slate** (empty Map)
4. ❌ Player loses all quest progress from previous sessions

### The Solution

Implement a **handoff flow**: `WorldManager` (on join) → `PlayerStateService` (load) → `QuestManager` (rebuild runtime state).

---

## Architecture Overview

### Two Sources of Truth

| Source                | Owner                | Purpose                          | Storage                        |
| --------------------- | -------------------- | -------------------------------- | ------------------------------ |
| **Persistence Truth** | `PlayerStateService` | Long-term storage of player data | `world.persistentStorage`      |
| **Runtime Truth**     | `QuestManager`       | Live game state during session   | In-memory `Map<Player, Quest>` |

### Key Principles

1. **Single Writer**: Only `PlayerStateService` touches `persistentStorage`
2. **Single Reader**: Only `PlayerStateService` reads from `persistentStorage`
3. **Event-Driven Sync**: Services communicate via `LocalEvent`s
4. **Separation of Concerns**:
   - `PlayerStateService` = data layer
   - `QuestManager` = business logic layer

---

## Current State Analysis

### What Exists

```typescript
// ✅ PlayerState interface defined in constants.ts
export interface PlayerState {
  tutorial: { completed: boolean; bagGiven: boolean; };
  spawn: { lastIsland: string; };
  quests: {
    active: string;
    log: Record<string, { status: string; steps: Record<string, any>; }>;
  };
  inventory: { hasStorageBag: boolean; holster: { itemIds: string[]; }; };
}

// ✅ QuestManager has in-memory state
private activeQuestByPlayer = new Map<hz.Player, Quest>();

// ✅ PlayerStateService can read/write storage
private getPlayerState(player: hz.Player): PlayerState | null { ... }
private saveState(player: hz.Player, state: PlayerState) { ... }
```

### What's Missing

- ❌ **No load-on-join flow**: `WorldManager` doesn't call `PlayerStateService` when player enters
- ❌ **No state broadcast event**: No `OnPlayerStateLoaded` to notify other services
- ❌ **No quest restoration**: `QuestManager` never rebuilds its Map from saved data
- ❌ **No quest persistence**: `QuestManager` never calls back to `PlayerStateService` to save changes
- ❌ **No singleton pattern**: Can't easily access `PlayerStateService` from other scripts

---

## The Complete Flow

### Visual Flow Diagram

```
┌─────────────────┐
│  Player Joins   │
│     World       │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│              WorldManager.ts                                │
│  - OnPlayerEnterWorld fires                                 │
│  - Calls PlayerStateService.loadAndBroadcastState(player)   │
└────────┬────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│           PlayerStateService.ts                             │
│  1. Reads persistentStorage for this player                 │
│  2. Gets or creates PlayerState object                      │
│  3. Fires OnPlayerStateLoaded event with state              │
└────────┬────────────────────────────────────────────────────┘
         │
         ├──────────────────┬──────────────────┬──────────────┐
         ▼                  ▼                  ▼              ▼
   ┌──────────┐      ┌──────────┐      ┌──────────┐   ┌──────────┐
   │  Quest   │      │   HUD    │      │ Spawn    │   │  Other   │
   │ Manager  │      │ Manager  │      │ Manager  │   │ Services │
   └────┬─────┘      └──────────┘      └──────────┘   └──────────┘
        │
        ▼
   ┌────────────────────────────────────────────┐
   │  QuestManager.onPlayerStateLoaded()        │
   │  - Rebuilds activeQuestByPlayer Map        │
   │  - Shows/hides HUD based on active quests  │
   └────────────────────────────────────────────┘
        │
        ▼
   ┌────────────────────────────────────────────┐
   │      During Gameplay                       │
   │  - Player collects item                    │
   │  - QuestManager updates runtime Map        │
   │  - Calls PlayerStateService.updateQuest()  │
   │  - PlayerStateService saves to storage     │
   └────────────────────────────────────────────┘
```

### Step-by-Step Sequence

#### 1. Player Joins World

**File:** `WorldManager.ts`

```typescript
private playerEnterWorld = (player: Player) => {
  // Play welcome sound, etc.
  this.initializePlayer(player);
}

private initializePlayer(player: Player) {
  // ... other initialization ...

  // KEY: Trigger the load-and-broadcast flow
  if (PlayerStateService.instance) {
    PlayerStateService.instance.loadAndBroadcastState(player);
  } else {
    console.error("PlayerStateService.instance not available!");
  }
}
```

#### 2. Load from Persistence

**File:** `PlayerStateService.ts`

```typescript
// NEW METHOD
public loadAndBroadcastState(player: hz.Player): PlayerState {
  // 1. Load from persistentStorage (or create default)
  const state = this.getOrCreateState(player);

  // 2. Notify all server-side listeners
  this.sendLocalBroadcastEvent(EventsService.PlayerEvents.OnPlayerStateLoaded, {
    player,
    state
  });

  return state;
}

private getOrCreateState(player: hz.Player): PlayerState {
  const state = this.getPlayerState(player) ?? this.cloneInitial();

  // Schema migration: ensure quests.log exists
  if (!state.quests.log) {
    state.quests.log = {};
  }

  return state;
}
```

#### 3. Rebuild Runtime State

**File:** `QuestManager.ts`

```typescript
start() {
  // Listen for the load event
  this.connectLocalBroadcastEvent(
    EventsService.PlayerEvents.OnPlayerStateLoaded,
    (data: { player: hz.Player; state: PlayerState }) => {
      this.onPlayerStateLoaded(data.player, data.state);
    }
  );
}

private onPlayerStateLoaded(player: hz.Player, state: PlayerState) {
  // Convert saved quest data to runtime Quest objects
  const activeQuestId = state.quests.active;

  if (activeQuestId && QUEST_DEFINITIONS[activeQuestId]) {
    // Clone the quest definition
    const quest = deepCloneQuest(QUEST_DEFINITIONS[activeQuestId]);

    // Restore progress from state.quests.log
    const savedQuest = state.quests.log[activeQuestId];
    if (savedQuest) {
      quest.status = savedQuest.status as QuestStatus;

      // Restore each objective's progress
      for (const objId in savedQuest.steps) {
        const obj = quest.objectives.find(o => o.objectiveId === objId);
        if (obj) {
          obj.currentCount = savedQuest.steps[objId].have;
          obj.isCompleted = savedQuest.steps[objId].done;
        }
      }
    }

    // Store in runtime Map
    this.activeQuestByPlayer.set(player, quest);

    // Update HUD
    this.hud?.setQuestTitle(quest.name);
    this.hud?.updateObjectives(quest.objectives);
  }
}
```

#### 4. Save During Gameplay

**File:** `QuestManager.ts`

```typescript
private checkQuestCollectionSubmission(payload: QuestSubmitCollectProgress): boolean {
  const { itemId, player, amount } = payload;
  const quest = this.activeQuestByPlayer.get(player);

  if (!quest) return false;

  // ... update quest.objectives as before ...

  if (progressed) {
    // KEY: Persist the change immediately
    PlayerStateService.instance?.saveQuestProgress(player, quest);

    // ... rest of the logic (VFX, completion checks, etc.) ...
  }

  return progressed;
}
```

**File:** `PlayerStateService.ts`

```typescript
// NEW METHOD
public saveQuestProgress(player: hz.Player, quest: Quest) {
  const state = this.getOrCreateState(player);

  // Update the active quest ID
  state.quests.active = quest.questId;

  // Convert Quest to the saved format
  if (!state.quests.log[quest.questId]) {
    state.quests.log[quest.questId] = {
      status: quest.status,
      steps: {},
      completedAt: 0,
    };
  }

  const savedQuest = state.quests.log[quest.questId];
  savedQuest.status = quest.status;

  // Save each objective's progress
  for (const obj of quest.objectives) {
    savedQuest.steps[obj.objectiveId] = {
      need: obj.targetCount,
      have: obj.currentCount,
      done: obj.isCompleted,
    };
  }

  // Mark completion timestamp if applicable
  if (quest.status === QuestStatus.Completed && savedQuest.completedAt === 0) {
    savedQuest.completedAt = Date.now();
  }

  this.saveState(player, state);
}
```

---

## Implementation Plan

### Phase 1: Setup Events & State Structure

#### 1.1 Add New Event to `constants.ts`

```typescript
export class EventsService {
  static readonly PlayerEvents = {
    FetchInitialState: new LocalEvent<{ player: Player }>("FetchInitialState"),
    RecievedInitialState: new LocalEvent<PlayerInitialState>(
      "RecievedInitialState"
    ),

    // ✨ NEW: Fired when player state is loaded from persistence
    OnPlayerStateLoaded: new LocalEvent<{
      player: Player;
      state: PlayerState;
    }>("OnPlayerStateLoaded"),
  };
  // ... rest of EventsService ...
}
```

#### 1.2 Verify `PlayerState` Structure

The existing `PlayerState` in `constants.ts` already has a quest structure:

```typescript
export interface PlayerState {
  // ... existing fields ...
  quests: {
    active: string; // Current active quest ID
    log: Record<
      string,
      {
        // History of all quests
        status: string; // 'NotStarted' | 'InProgress' | 'Completed'
        steps: Record<
          string,
          {
            // Per-objective progress
            need: number; // Target count
            have: number; // Current count
            done: boolean; // Is this objective complete?
          }
        >;
        completedAt: number; // Timestamp (0 if not completed)
      }
    >;
  };
}
```

✅ **No changes needed** - this structure is already sufficient!

---

### Phase 2: Update `PlayerStateService`

#### 2.1 Add Singleton Pattern

```typescript
export class PlayerStateService extends hz.Component<
  typeof PlayerStateService
> {
  // ✨ NEW: Singleton instance for easy access
  static instance: PlayerStateService | null = null;

  start() {
    PlayerStateService.instance = this;
    console.log("[PlayerStateService] Registered as singleton instance");
  }

  // ... existing methods ...
}
```

#### 2.2 Add Load-and-Broadcast Method

```typescript
// ✨ NEW: Called by WorldManager when player joins
public loadAndBroadcastState(player: hz.Player): PlayerState {
  console.log(`[PlayerStateService] Loading state for player: ${player.name.get()}`);

  const state = this.getOrCreateState(player);

  // Notify all listeners (QuestManager, HUD, etc.)
  this.sendLocalBroadcastEvent(
    EventsService.PlayerEvents.OnPlayerStateLoaded,
    { player, state }
  );

  return state;
}
```

#### 2.3 Add Quest-Specific Save Methods

```typescript
// ✨ NEW: Save quest progress to persistence
public saveQuestProgress(player: hz.Player, quest: Quest) {
  const state = this.getOrCreateState(player);

  // Set active quest
  state.quests.active = quest.questId;

  // Initialize quest log entry if needed
  if (!state.quests.log[quest.questId]) {
    state.quests.log[quest.questId] = {
      status: quest.status,
      steps: {},
      completedAt: 0,
    };
  }

  const savedQuest = state.quests.log[quest.questId];
  savedQuest.status = quest.status;

  // Save each objective's progress
  for (const obj of quest.objectives) {
    savedQuest.steps[obj.objectiveId] = {
      need: obj.targetCount,
      have: obj.currentCount,
      done: obj.isCompleted,
    };
  }

  // Mark completion timestamp
  if (quest.status === QuestStatus.Completed && savedQuest.completedAt === 0) {
    savedQuest.completedAt = Date.now();
    // Clear active quest on completion
    state.quests.active = "";
  }

  this.saveState(player, state);
  console.log(`[PlayerStateService] Saved quest progress for ${player.name.get()}: ${quest.questId}`);
}

// ✨ NEW: Mark quest as started
public startQuest(player: hz.Player, questId: string) {
  const state = this.getOrCreateState(player);
  state.quests.active = questId;

  if (!state.quests.log[questId]) {
    state.quests.log[questId] = {
      status: QuestStatus.InProgress,
      steps: {},
      completedAt: 0,
    };
  }

  this.saveState(player, state);
}

// ✨ NEW: Get active quest ID (for quick checks)
public getActiveQuestId(player: hz.Player): string | null {
  const state = this.getPlayerState(player);
  return state?.quests.active || null;
}
```

---

### Phase 3: Update `WorldManager`

#### 3.1 Trigger State Load on Join

```typescript
private initializePlayer(player: Player) {
  const playerService = this.playerService();
  if (!playerService) {
    console.error('[WorldManager] PlayerStateService not found!');
    return;
  }

  // Play welcome sound
  const soundGizmo = this.props.welcomeSound?.as(AudioGizmo);
  const options: AudioOptions = {
    fade: 0,
    players: [player],
    audibilityMode: AudibilityMode.AudibleTo,
  };
  soundGizmo?.play(options);

  // ✨ KEY CHANGE: Load and broadcast player state
  playerService.loadAndBroadcastState(player);
}
```

---

### Phase 4: Update `QuestManager`

#### 4.1 Listen for State Load Event

```typescript
preStart(): void {
  // ... existing event listeners ...

  // ✨ NEW: Restore quest state when player joins
  this.connectLocalBroadcastEvent(
    EventsService.PlayerEvents.OnPlayerStateLoaded,
    (data: { player: hz.Player; state: PlayerState }) => {
      this.onPlayerStateLoaded(data.player, data.state);
    }
  );
}
```

#### 4.2 Implement State Restoration

```typescript
private onPlayerStateLoaded(player: hz.Player, state: PlayerState) {
  console.log(`[QuestManager] Restoring quest state for ${player.name.get()}`);

  const activeQuestId = state.quests.active;

  if (!activeQuestId) {
    console.log(`[QuestManager] Player has no active quest`);
    this.hud?.setQuestTitle("No Active Quest");
    return;
  }

  // Get quest definition
  const questDef = QUEST_DEFINITIONS[activeQuestId];
  if (!questDef) {
    console.warn(`[QuestManager] Quest definition not found: ${activeQuestId}`);
    return;
  }

  // Clone definition
  const quest = deepCloneQuest(questDef);

  // Restore progress from saved state
  const savedQuest = state.quests.log[activeQuestId];
  if (savedQuest) {
    quest.status = savedQuest.status as QuestStatus;

    // Restore each objective
    for (const objId in savedQuest.steps) {
      const obj = quest.objectives.find(o => o.objectiveId === objId);
      if (obj) {
        const saved = savedQuest.steps[objId];
        obj.currentCount = saved.have;
        obj.targetCount = saved.need;
        obj.isCompleted = saved.done;
      }
    }
  }

  // Store in runtime Map
  this.activeQuestByPlayer.set(player, quest);

  // Update HUD
  this.hud?.setQuestTitle(quest.name);
  this.hud?.updateObjectives(quest.objectives);

  console.log(`[QuestManager] Restored quest: ${quest.questId} (${quest.status})`);
}
```

#### 4.3 Add Cleanup on Player Exit

```typescript
start() {
  // ... existing listeners ...

  // ✨ NEW: Clean up runtime state when player leaves
  this.connectCodeBlockEvent(
    this.entity,
    hz.CodeBlockEvents.OnPlayerExitWorld,
    (player: hz.Player) => {
      this.activeQuestByPlayer.delete(player);
      console.log(`[QuestManager] Cleaned up state for ${player.name.get()}`);
    }
  );
}
```

#### 4.4 Update Progress Methods to Save

```typescript
private checkQuestCollectionSubmission(payload: QuestSubmitCollectProgress): boolean {
  // ... existing logic to update quest.objectives ...

  if (progressed) {
    // ... existing VFX/SFX ...

    // ✨ KEY: Save to persistence immediately
    if (PlayerStateService.instance) {
      PlayerStateService.instance.saveQuestProgress(player, quest);
    } else {
      console.warn('[QuestManager] Cannot save - PlayerStateService not available');
    }

    // ... rest of existing logic ...
  }

  return progressed;
}

private onGenericQuestSubmission(payload: { player: hz.Player; itemType: string; amount: number }) {
  // ... existing logic to update quest ...

  if (!progressed) return false as any;

  // ✨ KEY: Save after any progress change
  if (PlayerStateService.instance) {
    PlayerStateService.instance.saveQuestProgress(player, quest);
  }

  // ... rest of existing logic ...
}
```

#### 4.5 Update Quest Start Handler

```typescript
private async onQuestStarted(payload: QuestPayload) {
  const { player, questId } = payload;
  if (!player || !questId) return;

  const quest = this.ensureActiveQuest(player, questId, true);
  if (!quest) return;

  quest.status = QuestStatus.InProgress;

  // ✨ KEY: Save quest start to persistence
  if (PlayerStateService.instance) {
    PlayerStateService.instance.startQuest(player, questId);
  }

  // Spawn bag, etc.
  this.playerHasBag.set(player, false);
  await this.spawnStorageBagForPlayer(player);
  this.emitQuestProgressUpdated(player, quest);
}
```

---

## Data Flow Examples

### Example 1: New Player Joins

```
1. Player "Alice" joins world
   → WorldManager.playerEnterWorld(Alice)

2. WorldManager calls PlayerStateService
   → PlayerStateService.loadAndBroadcastState(Alice)

3. PlayerStateService reads persistentStorage
   → No data found (new player)
   → Creates PLAYER_INITIAL_STATE
   → state.quests.active = ""
   → state.quests.log = {}

4. PlayerStateService fires OnPlayerStateLoaded
   → QuestManager.onPlayerStateLoaded(Alice, state)

5. QuestManager checks state.quests.active
   → Empty string, so no quest to restore
   → Sets HUD to "No Active Quest"
   → activeQuestByPlayer.set(Alice, null) // or don't add entry
```

### Example 2: Returning Player with Active Quest

```
1. Player "Bob" joins world (has been playing before)
   → WorldManager.playerEnterWorld(Bob)

2. WorldManager calls PlayerStateService
   → PlayerStateService.loadAndBroadcastState(Bob)

3. PlayerStateService reads persistentStorage
   → Found existing data:
     {
       quests: {
         active: "tutorial_survival",
         log: {
           "tutorial_survival": {
             status: "InProgress",
             steps: {
               "collect_coconuts": { need: 2, have: 1, done: false },
               "talk_to_npc": { need: 1, have: 0, done: false },
               ...
             },
             completedAt: 0
           }
         }
       }
     }

4. PlayerStateService fires OnPlayerStateLoaded
   → QuestManager.onPlayerStateLoaded(Bob, state)

5. QuestManager rebuilds runtime state
   → Clones QUEST_DEFINITIONS["tutorial_survival"]
   → Restores objective progress:
     - collect_coconuts: currentCount = 1, isCompleted = false
     - talk_to_npc: currentCount = 0, isCompleted = false
   → activeQuestByPlayer.set(Bob, restoredQuest)
   → Updates HUD: "Island Survival Basics - Collect 1/2 coconuts"
```

### Example 3: Player Collects Item

```
1. Bob picks up a coconut
   → CollectableQuestItem fires SubmitQuestCollectProgress event

2. QuestManager.checkQuestCollectionSubmission receives event
   → Gets quest from activeQuestByPlayer.get(Bob)
   → Finds objective: collect_coconuts
   → Increments: currentCount from 1 to 2
   → Marks objective as completed

3. QuestManager calls PlayerStateService
   → PlayerStateService.saveQuestProgress(Bob, quest)

4. PlayerStateService updates persistentStorage
   → state.quests.log["tutorial_survival"].steps["collect_coconuts"].have = 2
   → state.quests.log["tutorial_survival"].steps["collect_coconuts"].done = true
   → Writes to world.persistentStorage

5. QuestManager updates HUD
   → "Objective Complete: Collect coconuts"
   → "Next: Talk to Pineapple for an update"
```

### Example 4: Player Completes Quest

```
1. Bob completes final objective (hunt_chicken)
   → QuestManager detects all objectives are complete
   → quest.status = QuestStatus.Completed

2. QuestManager calls PlayerStateService
   → PlayerStateService.saveQuestProgress(Bob, quest)

3. PlayerStateService updates persistentStorage
   → state.quests.log["tutorial_survival"].status = "Completed"
   → state.quests.log["tutorial_survival"].completedAt = 1729700000000
   → state.quests.active = "" (cleared)
   → Writes to world.persistentStorage

4. QuestManager fires QuestCompleted event
   → Other systems can react (give rewards, unlock areas, etc.)

5. HUD updates
   → Shows completion popup
   → Hides quest tracker
```

---

## Testing Checklist

### Unit Tests (Manual Testing in World)

- [ ] **Test 1: New Player Join**
  - [ ] Create a new account or reset test player's state
  - [ ] Join the world
  - [ ] Verify HUD shows "No Active Quest"
  - [ ] Check console logs for state initialization
- [ ] **Test 2: Start First Quest**
  - [ ] Trigger quest start (e.g., talk to NPC)
  - [ ] Verify HUD updates with quest name
  - [ ] Leave world and rejoin
  - [ ] Verify quest is still active (not reset)
- [ ] **Test 3: Partial Progress Persistence**
  - [ ] Start quest "tutorial_survival"
  - [ ] Collect 1 coconut (out of 2 needed)
  - [ ] Verify HUD shows "1/2"
  - [ ] Leave world
  - [ ] Rejoin world
  - [ ] Verify HUD still shows "1/2" (progress saved)
  - [ ] Collect 2nd coconut
  - [ ] Verify objective completes
- [ ] **Test 4: Multi-Objective Progress**
  - [ ] Complete first objective (collect coconuts)
  - [ ] Leave and rejoin
  - [ ] Verify first objective is still marked complete
  - [ ] Verify second objective is active
  - [ ] Complete second objective
  - [ ] Leave and rejoin
  - [ ] Verify both objectives are complete
- [ ] **Test 5: Quest Completion Persistence**
  - [ ] Complete all quest objectives
  - [ ] Verify "Quest Complete" popup
  - [ ] Verify HUD hides or shows completion
  - [ ] Leave and rejoin
  - [ ] Verify quest is not active (active = "")
  - [ ] Verify quest appears in completed log

### Integration Tests

- [ ] **Test 6: Multiple Players**
  - [ ] Have Player A start quest
  - [ ] Have Player B join (no quest)
  - [ ] Verify each player has independent state
  - [ ] Both players make progress
  - [ ] Verify states don't interfere
- [ ] **Test 7: State Migration**
  - [ ] Use old save format (if migrating)
  - [ ] Join world
  - [ ] Verify migration logic runs
  - [ ] Verify new format is saved
- [ ] **Test 8: Error Handling**
  - [ ] Test with corrupted state data
  - [ ] Verify fallback to PLAYER_INITIAL_STATE
  - [ ] Verify console warnings (not errors)

---

## Acceptance Criteria

### Must Have (MVP)

✅ **AC1:** When a player joins the world, their saved quest progress loads from `persistentStorage`

✅ **AC2:** When a player makes quest progress, the change is immediately saved to `persistentStorage`

✅ **AC3:** When a player leaves and rejoins, they resume exactly where they left off

✅ **AC4:** Quest HUD accurately reflects the player's current quest state on join

✅ **AC5:** Multiple players can have independent quest progress simultaneously

### Should Have

✅ **AC6:** Console logs clearly indicate state load/save operations for debugging

✅ **AC7:** If a player has no saved state (new player), the system gracefully creates initial state

✅ **AC8:** If saved state is corrupted, the system falls back to a safe default

### Nice to Have

⚪ **AC9:** Admin commands to inspect/modify player quest state for testing

⚪ **AC10:** Analytics events for quest start/progress/completion

⚪ **AC11:** State schema versioning for future migrations

---

## Common Pitfalls & Solutions

### Pitfall 1: Forgetting to Save on Progress

**Problem:** Quest progress updates in runtime Map but never calls `PlayerStateService.saveQuestProgress()`

**Solution:** Add save call immediately after any state mutation:

```typescript
if (progressed) {
  // Save FIRST (before VFX/SFX that might fail)
  PlayerStateService.instance?.saveQuestProgress(player, quest);

  // Then do other stuff
  this.playCollectionSoundForPlayer(player);
  // ...
}
```

### Pitfall 2: Using Wrong Data Structure

**Problem:** Trying to save the runtime `Quest` object directly to `persistentStorage`

**Solution:** `PlayerStateService` converts between formats:

- **Runtime:** `Quest` with `QuestObjective[]` (rich, typed)
- **Saved:** `state.quests.log` (flat, serializable)

### Pitfall 3: Race Conditions on Join

**Problem:** `QuestManager` tries to access player state before `OnPlayerStateLoaded` fires

**Solution:** Always wait for the event:

```typescript
// ❌ BAD
start() {
  const state = PlayerStateService.instance?.getPlayerState(player);
  // state might be null if not loaded yet!
}

// ✅ GOOD
start() {
  this.connectLocalBroadcastEvent(
    EventsService.PlayerEvents.OnPlayerStateLoaded,
    (data) => { /* Now state is guaranteed loaded */ }
  );
}
```

### Pitfall 4: Forgetting Singleton Registration

**Problem:** `PlayerStateService.instance` is `null` when `QuestManager` tries to use it

**Solution:** Ensure `PlayerStateService` registers itself in `start()`:

```typescript
start() {
  PlayerStateService.instance = this;
  // Must happen before any other script tries to use it
}
```

### Pitfall 5: Memory Leaks on Player Exit

**Problem:** Runtime Map grows forever as players join/leave

**Solution:** Clean up on exit:

```typescript
this.connectCodeBlockEvent(
  this.entity,
  hz.CodeBlockEvents.OnPlayerExitWorld,
  (player) => {
    this.activeQuestByPlayer.delete(player);
    // No need to save here - already saved on progress
  }
);
```

---

## API Reference

### PlayerStateService

#### `loadAndBroadcastState(player: Player): PlayerState`

**Purpose:** Load player's state from persistence and notify all listeners

**When to Call:** `WorldManager.playerEnterWorld`

**Returns:** The loaded (or newly created) `PlayerState`

**Side Effects:**

- Reads from `world.persistentStorage`
- Fires `EventsService.PlayerEvents.OnPlayerStateLoaded`

---

#### `saveQuestProgress(player: Player, quest: Quest): void`

**Purpose:** Save quest progress to persistence

**When to Call:** Any time a quest objective changes

**Parameters:**

- `player`: The player whose state to update
- `quest`: The runtime `Quest` object (will be converted to saved format)

**Side Effects:**

- Writes to `world.persistentStorage`
- Updates `state.quests.active` and `state.quests.log[questId]`

---

#### `startQuest(player: Player, questId: string): void`

**Purpose:** Mark a quest as started in persistence

**When to Call:** When a player accepts/starts a new quest

**Side Effects:**

- Sets `state.quests.active = questId`
- Initializes `state.quests.log[questId]` if needed

---

#### `getActiveQuestId(player: Player): string | null`

**Purpose:** Quick lookup of player's active quest

**When to Call:** When you need to check if a player has an active quest without loading the full Quest object

**Returns:** Quest ID string, or `null` if no active quest

---

### QuestManager

#### `onPlayerStateLoaded(player: Player, state: PlayerState): void`

**Purpose:** Rebuild runtime quest state from loaded persistence data

**When Called:** Automatically via `EventsService.PlayerEvents.OnPlayerStateLoaded`

**Side Effects:**

- Populates `activeQuestByPlayer` Map
- Updates HUD

---

#### `ensureActiveQuest(player: Player, questId: string, createIfMissing: boolean): Quest | null`

**Purpose:** Get or create a quest instance for a player

**Returns:** Runtime `Quest` object, or `null` if not found and `createIfMissing` is false

---

### Event Payloads

#### `OnPlayerStateLoaded`

```typescript
{
  player: hz.Player;
  state: PlayerState;
}
```

**Listeners:** `QuestManager`, `HUDManager`, `SpawnManager`, etc.

---

## File Change Summary

| File                      | Changes Required                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **constants.ts**          | ✅ Add `EventsService.PlayerEvents.OnPlayerStateLoaded`                                                                                                                   |
| **PlayerStateService.ts** | ✅ Add singleton pattern<br>✅ Add `loadAndBroadcastState()`<br>✅ Add `saveQuestProgress()`<br>✅ Add `startQuest()`<br>✅ Add `getActiveQuestId()`                      |
| **WorldManager.ts**       | ✅ Call `PlayerStateService.loadAndBroadcastState()` on join                                                                                                              |
| **QuestManager.ts**       | ✅ Listen for `OnPlayerStateLoaded`<br>✅ Implement `onPlayerStateLoaded()`<br>✅ Call `saveQuestProgress()` on any progress change<br>✅ Add `OnPlayerExitWorld` cleanup |

---

## Migration Path (If Updating Existing Worlds)

If players already have save data in the old format, add migration logic:

```typescript
// In PlayerStateService.getOrCreateState()
private getOrCreateState(player: hz.Player): PlayerState {
  const state = this.getPlayerState(player) ?? this.cloneInitial();

  // ✨ MIGRATION: Add missing fields for existing players
  if (!state.quests) {
    state.quests = { active: "", log: {} };
  }
  if (!state.quests.log) {
    state.quests.log = {};
  }

  // You can also migrate old formats here
  // e.g., if you had a different structure before

  return state;
}
```

---

## Performance Considerations

### Read Performance

- **Good:** `world.persistentStorage.getPlayerVariable()` is fast (< 1ms typically)
- **No concern:** Loading state once per join is negligible

### Write Performance

- **Good:** `world.persistentStorage.setPlayerVariable()` is asynchronous and non-blocking
- **Watch:** Avoid calling save on every frame; only save on actual progress changes

### Memory Usage

- **Good:** Runtime Map only stores active players
- **Good:** Cleanup on exit prevents memory leaks
- **Scale:** Can handle 100+ concurrent players easily

---

## Future Enhancements

### 1. Quest Chains

Add support for sequential quests:

```typescript
export interface Quest {
  // ... existing fields ...
  nextQuestId?: string; // Auto-start this quest on completion
}
```

### 2. Quest Abandonment

Allow players to drop quests:

```typescript
public abandonQuest(player: hz.Player, questId: string) {
  const state = this.getOrCreateState(player);
  if (state.quests.active === questId) {
    state.quests.active = "";
    // Optionally delete from log, or mark as abandoned
    this.saveState(player, state);
  }
}
```

### 3. Quest Cooldowns

Prevent quest spam:

```typescript
export interface QuestLogEntry {
  // ... existing fields ...
  lastAttemptedAt: number; // Timestamp
  cooldownUntil: number; // Timestamp
}
```

### 4. Analytics Integration

Track quest metrics:

```typescript
private onQuestCompleted(player: hz.Player, quest: Quest) {
  // ... existing logic ...

  // Send analytics event
  this.world.analytics.logEvent("quest_completed", {
    questId: quest.questId,
    playerId: player.id.toString(),
    duration: Date.now() - quest.startedAt,
  });
}
```

---

## Support & Troubleshooting

### Debug Logging

Enable verbose logging by adding to each service:

```typescript
private DEBUG = true;

private log(...args: any[]) {
  if (this.DEBUG) {
    console.log(`[${this.constructor.name}]`, ...args);
  }
}
```

### Console Commands for Testing

Add admin commands (server-side only):

```typescript
// In WorldManager or a debug script
private handleAdminCommand(player: hz.Player, command: string) {
  if (!this.isAdmin(player)) return;

  if (command === "reset_quest") {
    const state = PlayerStateService.instance?.getPlayerState(player);
    if (state) {
      state.quests.active = "";
      state.quests.log = {};
      PlayerStateService.instance?.saveState(player, state);
      console.log("Reset quest state for", player.name.get());
    }
  }
}
```

---

## Conclusion

This architecture provides:

✅ **Separation of Concerns:** Data layer (PlayerStateService) vs. logic layer (QuestManager)

✅ **Scalability:** Handles many players with minimal overhead

✅ **Maintainability:** Clear flow, easy to debug, simple to extend

✅ **Reliability:** State persists across sessions, no progress loss

The key insight is: **PlayerStateService is the gatekeeper, QuestManager is the orchestrator.**

By following this pattern, you ensure that:

1. All persistence logic lives in one place
2. All game logic lives in another place
3. The two communicate via well-defined events
4. No "God scripts" that do everything

This is the winning architecture. Don't compromise it.

---

**Next Steps:**

1. Implement changes in order (constants → PlayerStateService → WorldManager → QuestManager)
2. Test each phase before moving to the next
3. Use the checklist to verify each acceptance criterion
4. Iterate on edge cases as you discover them

**Questions or Issues?**

- Check the "Common Pitfalls" section
- Enable debug logging in each service
- Verify singleton registration in PlayerStateService.start()
- Ensure events are firing in correct order (check console timestamps)
