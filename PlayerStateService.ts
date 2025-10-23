import * as hz from 'horizon/core';
import { EventsService } from 'constants';
import { VARIABLE_GROUPS, PLAYER_INITIAL_STATE, PlayerState } from 'constants';

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
    // Shallow clone is fine for our current shape
    return JSON.parse(JSON.stringify(PLAYER_INITIAL_STATE));
  }

  private saveState(player: hz.Player, state: PlayerState) {
    const key = `${VARIABLE_GROUPS.player.group}:${VARIABLE_GROUPS.player.keys.state}`;
    this.world.persistentStorage.setPlayerVariable(player, key, state as any);
  }


  // --- EXISTING: Read raw state  ---
  getPlayerState(player: hz.Player): PlayerState | null {
    const key = `${VARIABLE_GROUPS.player.group}:${VARIABLE_GROUPS.player.keys.state}`;
    const raw = this.world.persistentStorage.getPlayerVariable(player, key);
    if (raw == null) return null;
    // raw could be an object or a JSON string or a legacy number; coerce safely
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) as PlayerState; } catch { return null; }
    }
    if (typeof raw === 'object') {
      return raw as unknown as PlayerState;
    }
    return null;
  }

  // --- Quest-specific persistence methods ---
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

  setHasStorageBag(player: hz.Player, has: boolean) {
    const state = this.getOrCreateState(player);
    state.inventory.hasStorageBag = has;
    this.saveState(player, state);
  }
}
hz.Component.register(PlayerStateService);