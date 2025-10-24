import * as hz from "horizon/core";
import { INVENTORY_STATE_KEY } from "constants";

export interface InventoryDaoState {
  isStorageBagAcquired: boolean;
  items: string[];
}

const INVENTORY_DAO_DEFAULT_STATE: InventoryDaoState = {
  isStorageBagAcquired: false,
  items: [],
};

export class InventoryDAO {

  constructor(private player: hz.Player, private world: hz.World) { }

  // --- PUBLIC API ---
  public getState(): InventoryDaoState {
    // PVAR key should include VariableGroup name (e.g., "VG:Key") [15]
    const stored = this.world.persistentStorage.getPlayerVariable(
      this.player,
      INVENTORY_STATE_KEY
    ) as string | null;

    if (stored === null || stored === undefined || Object.keys(stored).length === 0) {
      console.warn('[InventoryDAO] No stored state found, returning default state.');
      const serializedData = JSON.stringify(INVENTORY_DAO_DEFAULT_STATE);
      this.world.persistentStorage.setPlayerVariable(this.player, INVENTORY_STATE_KEY, serializedData);
      return INVENTORY_DAO_DEFAULT_STATE;
    } else {
      return JSON.parse(stored) as InventoryDaoState;
    }
  }

  public getIsStorageBagAcquired(): boolean {
    const state = this.getState();
    return state.isStorageBagAcquired;
  }

  public setIsStorageBagAcquired(acquired: boolean): void {
    const state = this.getState();
    const newState: InventoryDaoState = {
      ...state,
      isStorageBagAcquired: acquired
    }
    this.saveState(newState);
  }

  // --- PRIVATE UTILITIES (For Robustness and Efficiency) ---
  private saveState(state: InventoryDaoState): void {
    const serializedData = JSON.stringify(state);
    this.world.persistentStorage.setPlayerVariable(this.player, INVENTORY_STATE_KEY, serializedData);
  }

}
