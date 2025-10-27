# Inventory Revamp Plan

## 1) Overview

**Current behavior:**
- When the player presses Index Down (or in VR, when an item touches the CollectibleStorage), if an active quest needs that item, it is turned in to the quest
- If no active quest needs the item, the interaction is effectively rejected and nothing happens (item remains or is ignored)

**Desired behavior:**
- Keep quest priority exactly as-is: quest turn-ins always take precedence
- If no active quest needs the item, automatically collect it into the player's inventory instead of rejecting it
- Inventory must support multiple of the same item (stacking quantities)
- No UI work is required now; future UI will allow viewing/selecting items

**Success criteria:**
- Items required by an active quest are still submitted to the quest first (unchanged behavior)
- Items not required by any active quest are stored in inventory with proper audio/VFX feedback, and the world item is consumed/destroyed just like a successful turn-in
- InventoryDAO supports item quantities per item type

---

## 2) Current System Analysis

### Components and flow:

**CollectableQuestItem** (file: `CollectableQuestItem.ts`)
- Represents a world item that can be collected/turned-in
- Typical triggers:
  - Input press (e.g., Index Down) when the player is holding/near the item
  - Collision/trigger with CollectibleStorage
- Currently routes the attempt through QuestManager for quest turn-in via `SubmitQuestCollectProgress` network event
- Has `itemId` prop (e.g., 'coconut')

**CollectibleStorage** (file: `CollectibleStorage.ts`)
- A world object/zone that accepts items when they are brought into contact
- For accepted items (needed by the active quest), the item is turned in via QuestManager
- For items not needed, current behavior is to reject/do nothing (no inventory fallback)
- Also sends `SubmitQuestCollectProgress` event when items enter trigger zone

**QuestManager** (file: `QuestManager.ts`)
- `checkQuestCollectionSubmission(payload)` decides if an incoming item is needed by the active quest
- If yes, it processes the turn-in (quest progress, feedback, removal of the item)
- If not, it returns `false` and the item remains or is ignored
- Current logic:
  - Returns `false` if no active quest (line 179-182)
  - Returns `false` if item not relevant for current quest step (line 206-208)
  - Returns `false` if objective already completed (line 224-230)

**InventoryDAO** (file: `InventoryDAO.ts`)
- Exists to manage player-held items
- Currently stores arrays of unique item IDs (`items: string[]`) rather than quantities
- Has methods: `addItem()`, `removeItem()`, `getState()`
- Uses persistent storage keyed by `INVENTORY_STATE_KEY`

**Summary:** The decision point is `QuestManager.checkQuestCollectionSubmission(...)`. We will add a fallback path here so that when an item is not needed by any active quest, it is stored in inventory instead of being rejected. InventoryDAO will be updated to store quantities.

---

## 3) Required Changes

### High-level changes:
1. **Modify InventoryDAO to support per-item quantities**
   - Store item counts keyed by item type ID
   - Provide APIs: `addItem(itemId, qty)`, `removeItem(itemId, qty)`, `getItemCount(itemId)`, `getState()`, clear, and persistence hooks

2. **Update QuestManager.checkQuestCollectionSubmission(...)**
   - Maintain existing priority: if an active quest needs the item, process the quest turn-in exactly as now
   - If not needed by any active quest, store the item into InventoryDAO and consume/destroy the world item
   - Ensure appropriate audio/VFX and messaging feedback in both branches

3. **Preserve current quest-first priority across all entry points**
   - Press Index Down flow and CollectibleStorage trigger flow both route to QuestManager; ensure they both benefit from the new fallback

4. **Ensure proper destruction/collection**
   - After quest turn-in or inventory fallback, the item should be removed from the world and cannot be re-collected
   - The existing `DestroyAsset` event handles this; ensure it's called in inventory fallback path too

5. **Audio/VFX consistency**
   - Use existing "turn-in" feedback for quest submissions
   - Add "collected-to-inventory" feedback for inventory fallback (reuse existing collect sound/VFX)

---

## 4) Implementation Details

This section describes code structure changes, interfaces, and logic flow adapted to the TypeScript/Horizon Worlds codebase.

### 4.1 Data model and interfaces

**Item identity:**
- Each `CollectableQuestItem` already exposes `itemId` (string) via props that identifies the item category for stacking
- The `entityId` is used for destruction but not for inventory stacking

**InventoryDAO (quantities):**

Current interface:
```typescript
export interface InventoryDaoState {
  isStorageBagAcquired: boolean;
  items: string[];  // ← Currently just unique IDs
  wearables: string[];
}
```

New interface:
```typescript
export interface InventoryDaoState {
  isStorageBagAcquired: boolean;
  items: Record<string, number>;  // ← Changed to { itemId: quantity }
  wearables: string[];
}
```

New API methods:
```typescript
class InventoryDAO {
  // Add qty of itemId, returns new total
  public addItem(itemId: string, qty: number = 1): number

  // Remove qty of itemId if available, returns success
  public removeItem(itemId: string, qty: number = 1): boolean

  // Get current quantity of itemId
  public getItemCount(itemId: string): number

  // Get all items snapshot
  public getAllItems(): Record<string, number>

  // Clear all items (optional)
  public clearItems(): void
}
```

Example implementation:
```typescript
export class InventoryDAO {
  // ... existing code ...

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
}
```

**Migration note:** When loading old state with `items: string[]`, convert to `Record<string, number>` by counting occurrences.

---

### 4.2 QuestManager.checkQuestCollectionSubmission(...) fallback

**Current behavior:** Returns `false` when item not needed, no inventory fallback

**Updated behavior:** If quest doesn't need the item, add to inventory and destroy

Pseudocode changes:
```typescript
private checkQuestCollectionSubmission(payload: ISubmitQuestCollectProgress): any {
  const { itemId, player, amount, entityId } = payload;
  
  // ... existing code ...
  
  // Lines 177-182: No active quest
  if (!activeQuestId) {
    console.log(`[QuestManager] No active quest - adding to inventory instead`);
    // ← NEW: Add to inventory fallback
    const inventoryDAO = PlayerStateService.instance?.getInventoryDAO(player);
    if (inventoryDAO) {
      inventoryDAO.addItem(itemId, amount);
      console.log(`[QuestManager] Added ${amount}x ${itemId} to inventory`);
      
      // Play feedback
      if (entityId) {
        this.playCollectionSoundForPlayer(player, entityId);
        this.sendNetworkBroadcastEvent(EventsService.AssetEvents.DestroyAsset, { entityId, player });
      }
      
      // Optional: show popup
      this.world.ui.showPopupForPlayer(player, `Collected ${itemId}`, 2);
    }
    return false; // Still return false for quest purposes, but item was collected
  }
  
  // ... existing quest matching code ...
  
  // Lines 202-208: Item not relevant for current quest
  if (!matchingObjectiveDef) {
    console.log(`[QuestManager] Item '${itemId}' not needed for quest - adding to inventory`);
    // ← NEW: Add to inventory fallback
    const inventoryDAO = PlayerStateService.instance?.getInventoryDAO(player);
    if (inventoryDAO) {
      inventoryDAO.addItem(itemId, amount);
      console.log(`[QuestManager] Added ${amount}x ${itemId} to inventory`);
      
      // Play feedback
      if (entityId) {
        this.playCollectionSoundForPlayer(player, entityId);
        this.sendNetworkBroadcastEvent(EventsService.AssetEvents.DestroyAsset, { entityId, player });
      }
      
      // Optional: show popup
      this.world.ui.showPopupForPlayer(player, `Collected ${itemId}`, 2);
    }
    return false;
  }
  
  // ... rest of existing quest turn-in logic unchanged ...
}
```

**Key points:**
- Quest turn-in path remains completely unchanged (lines 216-302)
- Inventory fallback added at the two "return false" points where items are currently rejected
- Uses existing audio/VFX infrastructure (`playCollectionSoundForPlayer`, `DestroyAsset` event)
- Feedback differentiates between quest turn-in and inventory collection via popup message

---

### 4.3 CollectableQuestItem changes

**No changes required** - The component already:
- Exposes `itemId` via props
- Sends `SubmitQuestCollectProgress` event which includes `entityId`
- The `entityId` is used by QuestManager to destroy the item via `DestroyAsset` event

**Optional enhancement:** Add a collected flag to prevent double-submission, but the existing event-driven architecture should handle this naturally.

---

### 4.4 CollectibleStorage changes

**No changes required** - The component already:
- Sends `SubmitQuestCollectProgress` event when items enter trigger
- Uses same event flow as CollectableQuestItem
- Will automatically benefit from QuestManager's new inventory fallback

---

### 4.5 Audio/VFX

**Quest turn-in path (unchanged):**
- `playCollectionSoundForPlayer()` (line 441-454)
- `playCollectionVfxForPlayer()` (line 456-479)
- Popup: objective completion messages

**Inventory fallback path (new):**
- Reuse `playCollectionSoundForPlayer()` with same audio
- Reuse `DestroyAsset` event for item removal
- Show distinct popup: "Collected {itemId}" instead of quest progress

**Network safety:**
- Existing `DestroyAsset` event is already a NetworkEvent, so all clients see item disappear
- InventoryDAO changes are per-player and persisted

---

### 4.6 Network/multiplayer considerations

**Already handled:**
- `SubmitQuestCollectProgress` is a NetworkEvent, ensuring server authority
- `DestroyAsset` is a NetworkEvent, ensuring synchronized item removal
- InventoryDAO is per-player via `PlayerStateService` mapping
- Persistent storage is per-player via `world.persistentStorage.getPlayerVariable(player, ...)`

**No additional changes needed** - existing architecture already handles multiplayer safely.

---

### 4.7 Persistence

**Current:** InventoryDAO already uses `world.persistentStorage` with JSON serialization

**Required:** Update serialization to handle `Record<string, number>` instead of `string[]`

**Migration strategy:**
```typescript
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
```

---

### 4.8 Acceptance criteria and test cases

**Quest item with active quest:**
- ✓ Turn-in occurs; inventory count for that item does NOT increase
- ✓ Item is destroyed; quest progress increments; quest feedback plays
- ✓ HUD updates with quest progress

**Item not needed by any active quest:**
- ✓ Inventory count increases by 1 (or specified amount) for that itemId
- ✓ Item is destroyed; "collected to inventory" feedback plays (sound + popup)
- ✓ Quest progress does NOT change

**Both entry points:**
- ✓ Press Index Down: follows quest-first then inventory-fallback logic
- ✓ CollectibleStorage trigger: follows same logic
- ✓ Behavior is identical between both entry points

**Edge cases:**
- ✓ Rapid double-trigger: `DestroyAsset` event should prevent re-collection (item no longer exists)
- ✓ Multiple copies of same item: correctly stack in inventory (e.g., 5x coconut)
- ✓ Items with empty/invalid itemId: safely ignored with warning log
- ✓ Multiple players: each has separate inventory via PlayerStateService mapping
- ✓ Persistence: inventory survives player leaving/rejoining world

---

## 5) Future Considerations

**UI/UX:**
- A future Preact-based UI for viewing inventory, item counts, and selecting items is out of scope for this change
- Per user rules: "User prefers using Preact for the UI layer to enable fast iteration"

**Non-stackable or unique items:**
- If needed later, add `maxStackSize` to item config
- For now, all items stack infinitely

**Quest pull-from-inventory:**
- Future quests may allow submitting from inventory directly (UI-driven)
- Would require: UI selection → `inventoryDAO.removeItem()` → quest progress
- Quest turn-in from world pickup would still bypass inventory (current behavior preserved)

**Telemetry:**
- Consider logging `addItem()` / `removeItem()` calls for balancing
- Track inventory size distribution across players

**UI Integration (future):**
- Inventory panel component (Preact)
- Item selection/use interface
- Quest vs. inventory item indicators
- Drag-and-drop for quest turn-in from inventory

---

## 6) Summary of Code Touchpoints

| File | Changes | Complexity |
|------|---------|------------|
| `InventoryDAO.ts` | Change `items: string[]` to `items: Record<string, number>`, add quantity-based methods, migration logic | Medium |
| `QuestManager.ts` | Add inventory fallback at two "item rejected" points, reuse existing feedback infrastructure | Small |
| `CollectableQuestItem.ts` | No changes required | None |
| `CollectibleStorage.ts` | No changes required | None |
| `constants.ts` | No changes required (events already defined) | None |

**Total effort:** ~2-4 hours for implementation + testing

---

## 7) Implementation Checklist

- [ ] Update `InventoryDAO.ts`:
  - [ ] Change `InventoryDaoState.items` type to `Record<string, number>`
  - [ ] Implement `addItem(itemId, qty)` method
  - [ ] Implement `removeItem(itemId, qty)` method
  - [ ] Implement `getItemCount(itemId)` method
  - [ ] Implement `getAllItems()` method
  - [ ] Add migration logic in `getState()` for old format
  - [ ] Update default state to use `items: {}`

- [ ] Update `QuestManager.ts`:
  - [ ] Add inventory fallback at "no active quest" check (line ~179)
  - [ ] Add inventory fallback at "item not relevant" check (line ~206)
  - [ ] Ensure both fallbacks call `inventoryDAO.addItem()`
  - [ ] Ensure both fallbacks play collection sound/VFX
  - [ ] Ensure both fallbacks destroy item via `DestroyAsset` event
  - [ ] Add appropriate popup messages for inventory collection

- [ ] Testing:
  - [ ] Test quest turn-in with active quest (unchanged behavior)
  - [ ] Test collection without active quest (new inventory fallback)
  - [ ] Test collection with quest that doesn't need item (new inventory fallback)
  - [ ] Test both Index Down and CollectibleStorage trigger paths
  - [ ] Test multiple of same item stack correctly
  - [ ] Test persistence (leave/rejoin world)
  - [ ] Test multiplayer (multiple players collecting items)
  - [ ] Test migration from old inventory format

- [ ] Documentation:
  - [ ] Update API documentation for InventoryDAO
  - [ ] Add console logging for debugging inventory operations
  - [ ] Document new inventory behavior in quest design guide

---

## 8) Notes

**Design decisions:**
- **Quest-first priority preserved:** Existing quest turn-in logic unchanged, inventory is only fallback
- **Reuse existing infrastructure:** Audio/VFX, destruction events, persistence all reused
- **Minimal code changes:** Only 2 files need modification (InventoryDAO, QuestManager)
- **Backward compatible:** Migration logic handles old inventory format gracefully
- **Multiplayer-safe:** Existing network events and per-player storage ensure safety

**Why this approach works:**
- Centralized decision point in QuestManager makes logic clear and maintainable
- No changes to collection trigger components (CollectableQuestItem, CollectibleStorage) reduces risk
- Quantity-based inventory enables future stacking, crafting, and economy features
- Feedback parity ensures consistent player experience between quest turn-in and inventory collection
