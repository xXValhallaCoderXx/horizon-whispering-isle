import * as hz from 'horizon/core';
import { PLAYER_STATE_KEY_2 } from 'constants';

export interface PlayerStateDaoState {
  health: number;
  strength: number;
  agility: number;
  intelligence: number;
  currentLevelExperience: number;
  level: number;
}

const PLAYER_STATE_DAO_DEFAULT_STATE: PlayerStateDaoState = {
  health: 100,
  strength: 10,
  agility: 10,
  intelligence: 10,
  currentLevelExperience: 0,
  level: 1,
};

export class PlayerStateDAO {
  constructor(private player: hz.Player, private world: hz.World) { }

  // --- PUBLIC API ---
  public getState(): PlayerStateDaoState {
    // PVAR key should include VariableGroup name (e.g., "VG:Key") [15]
    const stored = this.world.persistentStorage.getPlayerVariable(
      this.player,
      PLAYER_STATE_KEY_2
    ) as string | null;

    if (stored === null || stored === undefined || Object.keys(stored).length === 0) {
      console.warn('[PlayerStateDAO] No stored state found, returning default state.');
      const serializedData = JSON.stringify(PLAYER_STATE_DAO_DEFAULT_STATE);
      this.world.persistentStorage.setPlayerVariable(this.player, PLAYER_STATE_KEY_2, serializedData);
      return PLAYER_STATE_DAO_DEFAULT_STATE;
    } else {
      return JSON.parse(stored) as PlayerStateDaoState;
    }
  }

  // --- PRIVATE UTILITIES (For Robustness and Efficiency) ---
  private saveState(state: PlayerStateDaoState): void {
    const serializedData = JSON.stringify(state);
    this.world.persistentStorage.setPlayerVariable(this.player, PLAYER_STATE_KEY_2, serializedData);
  }
}
