import * as hz from "horizon/core";
import { INVENTORY_STATE_KEY } from "constants";

export interface InventoryDaoState {
  isStorageBagAcquired: boolean;
  items: Record<string, number>;
  wearables: string[];
}

const INVENTORY_DAO_DEFAULT_STATE: InventoryDaoState = {
  isStorageBagAcquired: false,
  items: {},
  wearables: [],
};

export class InventoryDAO {

  constructor(private player: hz.Player, private world: hz.World) { }

  // --- PUBLIC API ---
  public getState(): InventoryDaoState {
  const stored = this.world.persistentStorage.getPlayerVariable(
    this.player,
    INVENTORY_STATE_KEY
  ) as string | null;

  if (stored === null || stored === undefined || Object.keys(stored).length === 0) {
    // Default state
    const serializedData = JSON.stringify(INVENTORY_DAO_DEFAULT_STATE);
    this.world.persistentStorage.setPlayerVariable(this.player, INVENTORY_STATE_KEY, serializedData);
    return INVENTORY_DAO_DEFAULT_STATE;
  } else {
    const parsed = JSON.parse(stored) as InventoryDaoState;

    // ← NEW: Migration for old format
    if (Array.isArray(parsed.items)) {
      // Convert old string[] to Record<string, number>
      const itemCounts: Record<string, number> = {};
      for (const itemId of parsed.items) {
        itemCounts[itemId] = (itemCounts[itemId] || 0) + 1;
      }
      parsed.items = itemCounts as any;
      this.saveState(parsed); // Persist migrated format
    }

    return parsed;
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

  public addItem(itemId: string, qty: number = 1): number {
    if (qty <= 0 || !itemId) {
      console.warn(`[InventoryDAO] Invalid add: itemId=${itemId}, qty=${qty}`);
      return this.getItemCount(itemId);
    }

    const state = this.getState();
    const current = state.items[itemId] || 0;
    const newCount = current + qty;

    const newState: InventoryDaoState = {
      ...state,
      items: {
        ...state.items,
        [itemId]: newCount
      }
    };

    this.saveState(newState);
    console.log(`[InventoryDAO] Added ${qty}x ${itemId}. Total: ${newCount}`);
    return newCount;
  }

  public removeItem(itemId: string, qty: number = 1): boolean {
    if (qty <= 0 || !itemId) {
      console.warn(`[InventoryDAO] Invalid remove: itemId=${itemId}, qty=${qty}`);
      return false;
    }

    const state = this.getState();
    const current = state.items[itemId] || 0;

    if (current < qty) {
      console.warn(`[InventoryDAO] Not enough ${itemId}. Have ${current}, need ${qty}`);
      return false;
    }

    const newCount = current - qty;
    const newItems = { ...state.items };

    if (newCount === 0) {
      delete newItems[itemId];
    } else {
      newItems[itemId] = newCount;
    }

    const newState: InventoryDaoState = {
      ...state,
      items: newItems
    };

    this.saveState(newState);
    console.log(`[InventoryDAO] Removed ${qty}x ${itemId}. Remaining: ${newCount}`);
    return true;
  }

  public getItemCount(itemId: string): number {
    const state = this.getState();
    return state.items[itemId] || 0;
  }

  public getAllItems(): Record<string, number> {
    const state = this.getState();
    return { ...state.items };
  }

  public clearItems(): void {
    const state = this.getState();
    const newState: InventoryDaoState = {
      ...state,
      items: {}
    };
    this.saveState(newState);
  }
  // --- PRIVATE UTILITIES (For Robustness and Efficiency) ---
  private saveState(state: InventoryDaoState): void {
    const serializedData = JSON.stringify(state);
    this.world.persistentStorage.setPlayerVariable(this.player, INVENTORY_STATE_KEY, serializedData);
  }

}
