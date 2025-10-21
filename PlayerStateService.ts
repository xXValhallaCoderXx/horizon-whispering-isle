import * as hz from 'horizon/core';
import { VARIABLE_GROUPS, PLAYER_INITIAL_STATE, PlayerState } from 'constants';

export class PlayerStateService extends hz.Component<typeof PlayerStateService> {
  static propsDefinition = {
    playerStorageAsset: { type: hz.PropTypes.Asset },
  };

  start() {

  }

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

  private getOrCreateState(player: hz.Player): PlayerState {
    return this.getPlayerState(player) ?? this.cloneInitial();
  }

  private cloneInitial(): PlayerState {
    // Shallow clone is fine for our current shape
    return JSON.parse(JSON.stringify(PLAYER_INITIAL_STATE));
  }

  private saveState(player: hz.Player, state: PlayerState) {
    const key = `${VARIABLE_GROUPS.player.group}:${VARIABLE_GROUPS.player.keys.state}`;
    this.world.persistentStorage.setPlayerVariable(player, key, state as any);
  }

  setHasStorageBag(player: hz.Player, has: boolean) {
    const state = this.getOrCreateState(player);
    state.inventory.hasStorageBag = has;
    this.saveState(player, state);
  }
}
hz.Component.register(PlayerStateService);