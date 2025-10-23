# Player State Quest Flow Plan (Sonnet-Think)

## Executive Summary

**Problem**: Quest progress must persist across sessions, but the current architecture has a disconnect between `WorldManager`/`PlayerManager` (join handlers), `PlayerStateService` (persistence), and `QuestManager` (runtime logic). The handoff flow is incomplete, leading to quest state loss on rejoin.

**Root Cause**: 
- `QuestManager` maintains runtime state in `activeQuestByPlayer` Map but never hydrates it from `PlayerStateService` on player join.
- `PlayerStateService` has no quest-specific save/load methods; the schema in `constants.ts` includes `quests.active` and `quests.log` but these are never read or written.
- `WorldManager.initializePlayer()` calls `playerService.getPlayerState()` but does nothing with the result.
- No event bridges the gap between "player joined + state loaded" and "QuestManager should rebuild runtime state."

**Solution**: Implement a clean handoff pattern using LocalEvent to notify QuestManager when a player's state is loaded, with PlayerStateService as the single persistence layer.

---

## Current Flow Analysis

### Join Sequence (As-Is)

```
1. WorldManager.playerEnterWorld(player)
   └─> initializePlayer(player)
       ├─> Play welcome sound
       ├─> playerService.getPlayerState(player) [reads but ignores result]
       └─> [END - no quest hydration]

2. PlayerManager (separate component, client-side?)
   └─> OnPlayerEnterWorld
       ├─> fetchInitialState(player) [emits FetchInitialState event]
       └─> initializePlayerState(payload) [stores local state copy]
```

**Gap**: QuestManager never receives notification that a player has joined or what their persisted quest state is.

### Current Quest Persistence Schema

From `constants.ts`, the `PlayerState` interface includes:
```typescript
quests: {
  active: string;                    // e.g., "tutorial_survival"
  log: Record<string, {
    status: string;                  // "NotStarted" | "InProgress" | "Completed"
    steps: Record<string, {
      need: number;
      have: number;
      done: boolean;
    }>;
    completedAt: number;
  }>;
}
```

**Gap**: This schema exists but is never read or written by any component. The `QuestManager.activeQuestByPlayer` Map uses a different in-memory structure (deep-cloned `Quest` objects from `QUEST_DEFINITIONS`).

---

## Proposed Architecture

### Three-Layer Pattern

1. **Persistence Layer**: `PlayerStateService`
   - Single source of truth for `world.persistentStorage` access
   - Owns all read/write operations for player variables
   - Exposes quest-specific methods: `loadQuestState()`, `saveQuestProgress()`, `saveQuestCompletion()`

2. **Handoff Layer**: Event-driven lifecycle
   - `WorldManager` or `PlayerStateService` emits `OnPlayerStateLoaded` LocalEvent after loading state
   - Payload includes `player` and their full `PlayerState` object

3. **Runtime Layer**: `QuestManager`
   - Listens for `OnPlayerStateLoaded` and rebuilds its `activeQuestByPlayer` Map
   - All quest logic (progress tracking, objective completion) operates on the runtime Map
   - Immediately persists changes by calling `PlayerStateService` methods
   - Cleans up Map on `OnPlayerExitWorld`

---

## Implementation Plan

### Phase 1: Add Event Bridge

**File**: `constants.ts` (or separate `Events.ts`)
```typescript
export const OnPlayerStateLoaded = new LocalEvent<{
  player: Player;
  state: PlayerState;
}>('OnPlayerStateLoaded');
```

Add to `EventsService.PlayerEvents` for consistency:
```typescript
static readonly PlayerEvents = {
  FetchInitialState: new LocalEvent<{ player: Player }>("FetchInitialState"),
  RecievedInitialState: new LocalEvent<PlayerInitialState>("RecievedInitialState"),
  OnPlayerStateLoaded: new LocalEvent<{ player: Player; state: PlayerState }>('OnPlayerStateLoaded'), // NEW
}
```

---

### Phase 2: Extend PlayerStateService

**File**: `PlayerStateService.ts`

Add singleton instance and quest-specific methods:

```typescript
export class PlayerStateService extends hz.Component<typeof PlayerStateService> {
  static propsDefinition = {
    playerStorageAsset: { type: hz.PropTypes.Asset },
  };

  // Singleton for easy access from QuestManager
  static instance: PlayerStateService;

  start() {
    PlayerStateService.instance = this;
  }

  // --- PUBLIC API: Called by WorldManager on join ---
  public loadAndBroadcastState(player: hz.Player): PlayerState {
    const state = this.getOrCreateState(player);
    this.sendLocalBroadcastEvent(EventsService.PlayerEvents.OnPlayerStateLoaded, { player, state });
    return state;
  }

  // --- PRIVATE: Get or initialize state ---
  private getOrCreateState(player: hz.Player): PlayerState {
    const state = this.getPlayerState(player) ?? this.cloneInitial();
    // Schema migration: ensure quests fields exist
    if (!state.quests) {
      state.quests = { active: "", log: {} };
    }
    if (!state.quests.log) {
      state.quests.log = {};
    }
    return state;
  }

  private cloneInitial(): PlayerState {
    return JSON.parse(JSON.stringify(PLAYER_INITIAL_STATE));
  }

  private saveState(player: hz.Player, state: PlayerState) {
    const key = `${VARIABLE_GROUPS.player.group}:${VARIABLE_GROUPS.player.keys.state}`;
    this.world.persistentStorage.setPlayerVariable(player, key, state as any);
  }

  // --- EXISTING: Read raw state (keep as-is) ---
  getPlayerState(player: hz.Player): PlayerState | null {
    const key = `${VARIABLE_GROUPS.player.group}:${VARIABLE_GROUPS.player.keys.state}`;
    const raw = this.world.persistentStorage.getPlayerVariable(player, key);
    if (raw == null) return null;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) as PlayerState; } catch { return null; }
    }
    if (typeof raw === 'object') {
      return raw as unknown as PlayerState;
    }
    return null;
  }

  // --- NEW: Quest-specific persistence methods ---
  
  // Called when QuestManager assigns a quest to a player
  public setActiveQuest(player: hz.Player, questId: string) {
    const state = this.getOrCreateState(player);
    state.quests.active = questId;
    // Initialize quest log entry if missing
    if (!state.quests.log[questId]) {
      state.quests.log[questId] = {
        status: 'InProgress',
        steps: {},
        completedAt: 0,
      };
    }
    this.saveState(player, state);
  }

  // Called by QuestManager after any objective progress
  public updateQuestObjective(player: hz.Player, questId: string, objectiveId: string, have: number, need: number, done: boolean) {
    const state = this.getOrCreateState(player);
    if (!state.quests.log[questId]) {
      state.quests.log[questId] = { status: 'InProgress', steps: {}, completedAt: 0 };
    }
    state.quests.log[questId].steps[objectiveId] = { have, need, done };
    this.saveState(player, state);
  }

  // Called when QuestManager completes a quest
  public completeQuest(player: hz.Player, questId: string) {
    const state = this.getOrCreateState(player);
    if (!state.quests.log[questId]) return;
    state.quests.log[questId].status = 'Completed';
    state.quests.log[questId].completedAt = Date.now();
    // Clear active if this was the active quest
    if (state.quests.active === questId) {
      state.quests.active = "";
    }
    this.saveState(player, state);
  }

  // --- EXISTING: Keep inventory methods as-is ---
  setHasStorageBag(player: hz.Player, has: boolean) {
    const state = this.getOrCreateState(player);
    state.inventory.hasStorageBag = has;
    this.saveState(player, state);
  }
}
hz.Component.register(PlayerStateService);
```

---

### Phase 3: Update WorldManager

**File**: `WorldManager.ts`

Trigger state load and broadcast on player join:

```typescript
class WorldManager extends Component<typeof WorldManager> {
  static propsDefinition = {
    welcomeSound: { type: PropTypes.Entity },
    playerStorageAsset: { type: PropTypes.Asset },
    playerServiceAsset: { type: PropTypes.Entity },
  };

  private currentActivePlayers: Set<Player> = new Set();

  preStart(): void {
    this.connectCodeBlockEvent(this.entity, CodeBlockEvents.OnPlayerEnterWorld, this.playerEnterWorld);
    this.connectCodeBlockEvent(this.entity, CodeBlockEvents.OnPlayerExitWorld, this.playerExitWorld);
  }

  start() {}

  private playerEnterWorld = (player: Player) => {
    this.initializePlayer(player);
  }

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
    soundGizmo && soundGizmo.play(options);

    // Load state and broadcast to all listeners (including QuestManager)
    const state = playerService.loadAndBroadcastState(player);
    
    console.log(`[WorldManager] Player ${player.name.get()} state loaded. Active quest: ${state.quests.active || 'none'}`);
  }

  private playerExitWorld = (player: Player) => {
    console.log(`[WorldManager] Player ${player.name.get()} has exited the world.`);
    this.currentActivePlayers.delete(player);
  }

  private playerService(): PlayerStateService | null {
    const gizmo = this.props.playerServiceAsset as Entity;
    if (!gizmo) return null;
    const comp = gizmo.getComponents(PlayerStateService)[0] as PlayerStateService | undefined;
    return comp ?? null;
  }

  // Keep handleGeneratingPlayerStorageItem if needed, unchanged
}
Component.register(WorldManager);
```

---

### Phase 4: Refactor QuestManager

**File**: `QuestManager.ts`

Add join/exit lifecycle and persist all progress changes:

```typescript
class QuestManager extends hz.Component<typeof QuestManager> {
  static propsDefinition = {
    questHud: { type: hz.PropTypes.Entity },
    storageBagAsset: { type: hz.PropTypes.Asset },
    collectSound: { type: hz.PropTypes.Entity },
    collectVfx: { type: hz.PropTypes.Entity },
  };

  // Runtime state (non-persistent, rebuilt from PlayerStateService on join)
  private activeQuestByPlayer = new Map<hz.Player, Quest>();
  private playerHasBag = new Map<hz.Player, boolean>();
  private spawnedBagByPlayer = new Map<hz.Player, hz.Entity>();
  private hud: QuestHUD | null = null;

  preStart(): void {
    // --- NEW: Listen for player join/exit lifecycle ---
    this.connectLocalBroadcastEvent(
      EventsService.PlayerEvents.OnPlayerStateLoaded,
      (payload: { player: hz.Player; state: PlayerState }) => {
        this.onPlayerStateLoaded(payload.player, payload.state);
      }
    );

    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnPlayerExitWorld,
      (player: hz.Player) => {
        this.onPlayerExit(player);
      }
    );

    // --- EXISTING: Quest event listeners ---
    this.connectNetworkBroadcastEvent(
      EventsService.QuestEvents.SubmitQuestCollectProgress,
      this.checkQuestCollectionSubmission.bind(this)
    );

    this.connectLocalBroadcastEvent(
      EventsService.QuestEvents.QuestStarted,
      (payload: QuestPayload) => this.onQuestStarted(payload)
    );

    this.connectLocalBroadcastEvent(
      EventsService.QuestEvents.CheckPlayerQuestSubmission,
      (payload) => this.onGenericQuestSubmission(payload)
    );
  }

  start() {
    console.log('[QuestManager] started');
    this.hud = this.initializeHud();
    if (!this.hud) {
      console.error('[QuestManager] QuestHUD not found');
      return;
    }
    this.hud?.setQuestTitle('No Active Quest');
  }

  // --- NEW: Hydrate quest state from persistence on join ---
  private onPlayerStateLoaded(player: hz.Player, state: PlayerState) {
    console.log(`[QuestManager] Hydrating quest state for ${player.name.get()}. Active: ${state.quests.active}`);

    // If player has an active quest, rebuild runtime state from persisted log
    const activeQuestId = state.quests.active;
    if (activeQuestId && state.quests.log[activeQuestId]) {
      const def = QUEST_DEFINITIONS[activeQuestId];
      if (def) {
        const quest = deepCloneQuest(def);
        const log = state.quests.log[activeQuestId];
        
        // Restore objective progress from log
        quest.status = log.status as QuestStatus;
        for (const obj of quest.objectives) {
          const step = log.steps[obj.objectiveId];
          if (step) {
            obj.currentCount = step.have;
            obj.isCompleted = step.done;
          }
        }

        this.activeQuestByPlayer.set(player, quest);
        console.log(`[QuestManager] Restored quest '${activeQuestId}' with ${quest.objectives.filter(o => o.isCompleted).length}/${quest.objectives.length} objectives completed`);

        // Update HUD if quest is in progress
        if (quest.status === QuestStatus.InProgress) {
          this.hud?.setQuestTitle(quest.name);
          // TODO: Update objective display
        }
      }
    }

    // Restore bag state if needed
    if (state.inventory.hasStorageBag) {
      this.playerHasBag.set(player, true);
    }
  }

  // --- NEW: Cleanup on player exit ---
  private onPlayerExit(player: hz.Player) {
    console.log(`[QuestManager] Player ${player.name.get()} exited; cleaning up runtime state`);
    this.activeQuestByPlayer.delete(player);
    this.playerHasBag.delete(player);
    this.spawnedBagByPlayer.delete(player);
  }

  // --- MODIFIED: checkQuestCollectionSubmission now persists progress ---
  private checkQuestCollectionSubmission(payload: QuestSubmitCollectProgress): boolean {
    const { itemId, player, amount, entityId } = payload;
    console.log(`[QuestManager] Checking quest collection for ${itemId} by ${player.name.get()}`);

    const quest = this.ensureActiveQuest(player, 'tutorial_survival');
    if (!quest) return false;

    const matching = quest.objectives.filter(
      (o: QuestObjective) => !o.isCompleted && o.type === ObjectiveType.Collect && o.targetType === itemId
    );
    if (matching.length === 0) {
      console.log(`[QuestManager] No matching objectives for '${itemId}'`);
      return false;
    }

    let progressed = false;
    const completedNow: QuestObjective[] = [];

    for (const obj of matching) {
      const inc = amount || 0;
      const before = obj.currentCount;
      const after = Math.min(obj.targetCount, obj.currentCount + inc);
      obj.currentCount = after;
      if (after !== before) progressed = true;

      if (after >= obj.targetCount && !obj.isCompleted) {
        obj.isCompleted = true;
        completedNow.push(obj);
        console.log(`[QuestManager] Objective completed: ${obj.objectiveId}`);
      } else {
        console.log(`[QuestManager] Progress: ${obj.objectiveId} ${obj.currentCount}/${obj.targetCount}`);
      }

      // --- NEW: Persist objective progress ---
      if (PlayerStateService.instance) {
        PlayerStateService.instance.updateQuestObjective(
          player,
          quest.questId,
          obj.objectiveId,
          obj.currentCount,
          obj.targetCount,
          obj.isCompleted
        );
      }
    }

    if (progressed) {
      this.playCollectionSoundForPlayer(player, entityId);
      this.playCollectionVfxForPlayer(player, entityId);

      if (completedNow.length > 0) {
        this.notifyObjectiveCompletion(player, quest, completedNow);
      }

      if (entityId != null) {
        this.sendNetworkBroadcastEvent(EventsService.AssetEvents.DestroyAsset, { entityId, player });
      }

      this.emitQuestProgressUpdated(player, quest);

      // Check if all objectives done
      const allDone = quest.objectives.every((o: QuestObjective) => o.isCompleted);
      if (allDone) {
        quest.status = QuestStatus.Completed;
        console.log(`[QuestManager] Quest completed: ${quest.questId}`);

        // --- NEW: Persist completion ---
        if (PlayerStateService.instance) {
          PlayerStateService.instance.completeQuest(player, quest.questId);
        }

        this.sendLocalBroadcastEvent(EventsService.QuestEvents.QuestCompleted, { player, questId: quest.questId });
        this.emitQuestProgressUpdated(player, quest);
      } else {
        quest.status = QuestStatus.InProgress;
      }

      return true;
    }
    return false;
  }

  // --- MODIFIED: onQuestStarted now persists activation ---
  private async onQuestStarted(payload: QuestPayload) {
    const { player, questId } = payload;
    if (!player || !questId) return;

    const quest = this.ensureActiveQuest(player, questId, true);
    if (!quest) return;

    quest.status = QuestStatus.InProgress;
    this.playerHasBag.set(player, false);

    // --- NEW: Persist active quest ---
    if (PlayerStateService.instance) {
      PlayerStateService.instance.setActiveQuest(player, questId);
    }

    await this.spawnStorageBagForPlayer(player);
    this.emitQuestProgressUpdated(player, quest);
  }

  // --- MODIFIED: onGenericQuestSubmission now persists progress ---
  private onGenericQuestSubmission(payload: { player: hz.Player; itemType: string; amount: number }) {
    const { player, itemType, amount } = payload || ({} as any);
    if (!player || !itemType) return false as any;

    const quest = this.ensureActiveQuest(player, 'tutorial_survival');
    if (!quest) return false as any;

    let type: ObjectiveType | undefined = undefined;
    if (itemType.startsWith('npc:')) type = ObjectiveType.Talk;
    else if (itemType === 'chicken' || itemType.startsWith('enemy:') || itemType.startsWith('enemy-'))
      type = ObjectiveType.Hunt;

    if (!type) return false as any;

    const matching = quest.objectives.filter(
      (o) => !o.isCompleted && o.type === type && o.targetType === itemType
    );
    if (matching.length === 0) return false as any;

    let progressed = false;
    const completedNow: QuestObjective[] = [];

    for (const obj of matching) {
      const inc = amount || 0;
      const before = obj.currentCount;
      const after = Math.min(obj.targetCount, obj.currentCount + inc);
      obj.currentCount = after;
      if (after !== before) progressed = true;

      if (after >= obj.targetCount && !obj.isCompleted) {
        obj.isCompleted = true;
        completedNow.push(obj);
      }

      // --- NEW: Persist objective progress ---
      if (PlayerStateService.instance) {
        PlayerStateService.instance.updateQuestObjective(
          player,
          quest.questId,
          obj.objectiveId,
          obj.currentCount,
          obj.targetCount,
          obj.isCompleted
        );
      }
    }

    if (!progressed) return false as any;

    if (completedNow.length > 0) {
      this.notifyObjectiveCompletion(player, quest, completedNow);
    }

    this.emitQuestProgressUpdated(player, quest);

    const allDone = quest.objectives.every((o) => o.isCompleted);
    if (allDone) {
      quest.status = QuestStatus.Completed;

      // --- NEW: Persist completion ---
      if (PlayerStateService.instance) {
        PlayerStateService.instance.completeQuest(player, quest.questId);
      }

      this.sendLocalBroadcastEvent(EventsService.QuestEvents.QuestCompleted, { player, questId: quest.questId });
    } else {
      quest.status = QuestStatus.InProgress;
    }

    return true as any;
  }

  // --- KEEP: All other methods unchanged (playCollectionSoundForPlayer, etc.) ---
  // ...
}
hz.Component.register(QuestManager);

function deepCloneQuest(def: Quest): Quest {
  return {
    ...def,
    objectives: def.objectives.map((o) => ({ ...o })),
  };
}
```

---

## Testing Checklist

### Single-Player Flow
- [ ] New player joins → WorldManager loads state → QuestManager has empty quest state
- [ ] NPC starts quest → QuestManager creates runtime quest + persists `quests.active` via PlayerStateService
- [ ] Player collects item → objective progress updates runtime Map + persists to `quests.log[questId].steps[objectiveId]`
- [ ] Player leaves world → runtime Map cleared
- [ ] Player rejoins → WorldManager broadcasts `OnPlayerStateLoaded` → QuestManager rebuilds quest from `quests.log` with correct progress
- [ ] Player completes final objective → QuestManager persists completion + clears `quests.active`

### Multi-Player Smoke
- [ ] Two players with different quest states join simultaneously
- [ ] Each player's quest progress is isolated (no cross-contamination)
- [ ] Player A's objective completion doesn't affect Player B's state

### Edge Cases
- [ ] Player joins with corrupted state → PlayerStateService returns `cloneInitial()` → QuestManager starts with clean slate
- [ ] Quest definition changes between sessions → QuestManager gracefully handles missing objectives in log
- [ ] Player completes quest, leaves, rejoins → Quest remains completed, HUD shows "No Active Quest"

---

## Acceptance Criteria

**Must Have (Phase 1)**
- [ ] `OnPlayerStateLoaded` event implemented and wired
- [ ] `PlayerStateService` has `loadAndBroadcastState()`, `setActiveQuest()`, `updateQuestObjective()`, `completeQuest()` methods
- [ ] `WorldManager.initializePlayer()` calls `playerService.loadAndBroadcastState(player)`
- [ ] `QuestManager` listens for `OnPlayerStateLoaded` and rebuilds `activeQuestByPlayer` Map from persisted state
- [ ] `QuestManager` persists all progress changes (objective updates, quest completion) via `PlayerStateService`
- [ ] `QuestManager` cleans up Map on `OnPlayerExitWorld`
- [ ] Single-player rejoin test passes: quest progress restored correctly

**Should Have (Phase 2)**
- [ ] Multi-quest support: Player can have multiple quests in `quests.log`, only one active at a time
- [ ] Quest history UI: Show completed quests from `quests.log`
- [ ] Migration logic: Handle old state schemas gracefully (e.g., state objects without `quests` field)

**Nice to Have (Phase 3)**
- [ ] PlayerStateService debouncing: Batch multiple rapid `updateQuestObjective()` calls to reduce `setPlayerVariable()` frequency
- [ ] Quest reset command for testing: Clear player's quest state without full account reset
- [ ] Analytics: Log quest start/completion events to external service

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `PlayerStateService.instance` not set before WorldManager calls it | High - state never loads | Add null check in `WorldManager.initializePlayer()` with error log; ensure PlayerStateService entity spawns before WorldManager in scene hierarchy |
| `OnPlayerStateLoaded` fires before QuestManager registers listener | High - quest state lost | Use LocalEvent (synchronous in same tick); ensure QuestManager `preStart()` runs before first player can join (scene setup dependency) |
| Quest definition changes break persisted state | Medium - player stuck | Add version field to `quests.log` entries; QuestManager checks for mismatches and resets that quest |
| Rapid progress updates spam `setPlayerVariable()` | Low - performance | Implement debounce: queue updates and flush every 1-2 seconds |
| Player exits during quest completion persistence | Low - completion lost | `setPlayerVariable()` is synchronous; completion should persist before `OnPlayerExitWorld` fires |

---

## Development Sequence

1. **Day 1**: Add `OnPlayerStateLoaded` event to constants.ts
2. **Day 1**: Extend `PlayerStateService` with quest methods (no QuestManager changes yet)
3. **Day 1**: Update `WorldManager.initializePlayer()` to call `loadAndBroadcastState()`
4. **Day 1**: Test: Join, verify event fires, check logs
5. **Day 2**: Add `QuestManager.onPlayerStateLoaded()` listener and hydration logic
6. **Day 2**: Add `QuestManager.onPlayerExit()` cleanup
7. **Day 2**: Test: Join with no saved state, start quest, verify runtime Map populated
8. **Day 3**: Add persistence calls to `checkQuestCollectionSubmission()`, `onQuestStarted()`, `onGenericQuestSubmission()`
9. **Day 3**: Test: Make progress, leave, rejoin → progress should restore
10. **Day 4**: Edge case testing and bug fixes
11. **Day 4**: Document API for other developers

---

## API Reference (For Other Systems)

### For NPC Dialog Scripts

```typescript
// To check if player has completed a specific quest objective:
// Listen for EventsService.QuestEvents.QuestProgressUpdated
this.connectLocalBroadcastEvent(
  EventsService.QuestEvents.QuestProgressUpdated,
  (payload: QuestProgressUpdatedPayload) => {
    if (payload.player === thisPlayer && payload.questId === 'tutorial_survival') {
      const quest = payload.quest;
      const talkObjective = quest?.objectives.find(o => o.objectiveId === 'talk_to_npc');
      if (talkObjective && talkObjective.isCompleted) {
        // Show follow-up dialog
      }
    }
  }
);
```

### For HUD Scripts

```typescript
// To display current quest progress:
// Listen for QuestProgressUpdated event, read payload.quest.objectives
this.connectLocalBroadcastEvent(
  EventsService.QuestEvents.QuestProgressUpdated,
  (payload: QuestProgressUpdatedPayload) => {
    const quest = payload.quest;
    if (quest && quest.status === QuestStatus.InProgress) {
      const progress = quest.objectives.map(o => `${o.description}: ${o.currentCount}/${o.targetCount}`);
      this.updateQuestUI(progress);
    }
  }
);
```

### For Item Collection Scripts

```typescript
// To submit quest progress (existing pattern, no changes):
this.sendNetworkBroadcastEvent(
  EventsService.QuestEvents.SubmitQuestCollectProgress,
  { player, itemId: 'coconut', amount: 1, entityId: this.entity.id.toString() }
);
```

---

## Notes

- **Single Responsibility**: PlayerStateService owns persistence; QuestManager owns game logic; WorldManager owns lifecycle coordination. Keep this separation strict.
- **Event-Driven**: Use LocalEvent for same-server communication; NetworkEvent only when client needs to notify server.
- **Idempotency**: PlayerStateService methods should be safe to call multiple times (e.g., `setActiveQuest` with same questId should not corrupt state).
- **Backwards Compatibility**: Old player states without `quests` field should initialize to `{ active: "", log: {} }` via `getOrCreateState()`.
- **Debugging**: Add `[ComponentName]` prefix to all console.logs for easy filtering; gate verbose logs behind a `DEBUG_QUESTS` constant.

---

## Future Enhancements

- **Quest Chains**: Support sequential quests with unlock conditions
- **Daily Quests**: Time-gated quests that reset at UTC midnight
- **Quest Sharing**: Party members contribute to shared quest objectives
- **Quest Abandonment**: Allow players to cancel and restart quests
- **Rich Quest Rewards**: Items, XP, currency beyond simple `reward: number`
- **Quest Journal UI**: Preact side panel with GraphDashboard.tsx showing active/completed quests
