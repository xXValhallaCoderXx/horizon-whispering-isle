Here is a technical document based on the provided transcript, detailing the Holstering System in Meta Horizon Worlds.

---

## Technical Document: Horizon Worlds Holstering System

### 1\. Overview

The **Holstering System** is a built-in inventory mechanic in Horizon Worlds. It provides a simple, ready-to-use UI and logic for players, especially on **web and mobile platforms**, to manage and swap items.

This system leverages the `Attachable` component properties of an object to create an on-player inventory, which is visually represented by the **Holster Hot Bar** when more than one item is holstered. This document outlines the process for preparing objects, configuring their UI, and scripting the logic to attach them programmatically.

---

### 2\. Preparing Objects for Holstering

Before any scripting, an object must be properly configured to be grabbable and attachable.

#### 2.1. Object Setup

A recommended best practice for interactable items is to use an empty object as the parent.

1.  **Create an Empty Object**: This will be the root of your item (e.g., "Chicken").
2.  **Add Mesh**: Add a mesh (e.g., a 3D model) as a **child** of the empty object.
3.  **Add Collider**: Add a collider component (e.g., `Box Collider`) as another **child**.
4.  **Position Children**: Set the `Position` (X, Y, Z) of both the mesh and collider to `(0, 0, 0)` to center them within the parent's pivot point.
5.  **Disable Mesh Collider**: If your mesh asset includes its own collider, disable it to rely solely on your dedicated collider component.

#### 2.2. Component Properties

Select the **parent empty object** and configure the following properties in the Properties panel:

- **Motion**: Set to **Interactive**.
  - This automatically enables the **Grabbable** attribute.
  - **Best Practice**: For a cleaner web/mobile UI, set all **Action Icons** (under the `Grabbable` settings) to **None**. This removes extra buttons that appear when an item is held.
  - **Troubleshooting**: If grabbing appears offset, consider enabling the **Grab Anchor** for cross-screen players.
- **Avatar Attachable**: Set to **Anchor**.
  - **Anchor To**: You can select a default anchor point like **Torso**. While this property is primarily used for VR-based dropping-onto-avatar behavior, it's good practice to set. The programmatic attachment will override this setting, but it provides a fallback.

---

### 3\. Configuring the Holster UI

The Holster Hot Bar displays an icon for each holstered item. You can customize this icon on the **parent empty object**.

- **Holster Icon**: Choose from a list of built-in Horizon Worlds icons (e.g., "Fire," "Rocket"). This is useful for simple, distinct items.
- **Custom Holster Icon**: For more complex inventories, you can use a custom image.
  - Upload a **PNG** texture (max 50MB) to your world's assets.
  - Copy the **Asset ID** of the uploaded texture.
  - Paste this Asset ID into the `Custom Holster Icon` field.
  - **Note**: After setting a custom icon, you may need to **leave and re-enter the world** for the change to appear in the hot bar.

---

### 4\. Programmatic Attachment Scripting

To create a robust system, you must attach items to the player using scripts. This example uses a key press ('R') to holster the currently held item.

This system requires two main scripts:

1.  **Server Script**: Manages ownership of the player's local script object.
2.  **Player Script (Local)**: Handles player input and attachment logic.

#### 4.1. Server Script (for Ownership)

This script ensures that the `Player` object (which runs the local script) is owned by the player who enters the world. This is a simple setup for single-player testing.

- **Object**: Create an empty object named "Server."
- **Script**: `ServerScript` (Server Script)
- **Property**: Create an `entity` property named `playerObject`.

<!-- end list -->

```typescript
// ServerScript (Server Script)
import {
  HZComponent,
  HZEvent,
  server,
  world,
} from "@metahorizon/platform-ar-api";

export default class ServerScript extends HZComponent {
  @property("entity")
  playerObject: entity;

  start() {
    // Assign owner when player enters
    this.connectEvent(world, "onPlayerEnterWorld", (player) => {
      this.playerObject.owner.set(player);
    });

    // Revert owner when player leaves (good for testing in-editor)
    this.connectEvent(world, "onPlayerLeaveWorld", (player) => {
      this.playerObject.owner.set(world.serverPlayer);
    });
  }
}
```

#### 4.2. Player Script (Local Logic)

This script listens for the player to grab an item, tracks which item is held, and attaches it when an input key is pressed.

- **Object**: Create an empty object named "Player."
- **Script**: `PlayerScript` (Local Script)
- **Properties**: Create `entity` properties for each item you want to be holster-able (e.g., `item1`, `item2`, etc.).

<!-- end list -->

```typescript
// PlayerScript (Local Script)
import {
  HZComponent,
  HZEvent,
  HZPlayerInputAction,
  HZButtonIcon,
  PlayerControls,
  world,
  AttachablePlayerAnchor,
} from "@metahorizon/platform-ar-api";

export default class PlayerScript extends HZComponent {
  // --- Properties for items ---
  @property("entity")
  item1: entity;

  @property("entity")
  item2: entity;
  // ...add more properties for more items

  // --- Class fields ---
  private items: entity[] = [];
  private heldItem: entity = null;
  private owner: player = null;

  start() {
    this.owner = this.entity.owner.get();

    // Stop script if it's not owned by an actual player
    if (this.owner === world.serverPlayer) {
      return;
    }

    // --- 1. Populate and listen to items ---
    // Add all item properties to the array
    if (this.props.item1) this.items.push(this.props.item1);
    if (this.props.item2) this.items.push(this.props.item2);
    // ...push other items

    // Loop through all items and listen for their 'onGrabStart' event
    this.items.forEach((item) => {
      this.connectEvent(item, "onGrabStart", (isRightHand, player) => {
        // When grabbed, set it as the currently held item
        this.holdItem(item);
      });
    });

    // --- 2. Setup Input ---
    // Connect to the 'R' key (RightPrimary)
    const attachInput = PlayerControls.connectLocalInput(
      HZPlayerInputAction.RightPrimary,
      HZButtonIcon.Swap,
      this
    );

    // --- 3. Register Input Callback ---
    attachInput.registerCallback((action, pressed) => {
      // When the button is pressed and we are holding an item
      if (pressed && this.heldItem) {
        this.attachHeldItem();
      }
    });
  }

  // Helper function to update the held item
  private holdItem(item: entity) {
    this.heldItem = item;
  }

  // Helper function to attach the item
  private attachHeldItem() {
    // Best practice: Force release the item before attaching
    (this.heldItem as GrabableEntity).forceRelease();

    // Attach the item to the player's torso
    (this.heldItem as AttachableEntity).attachToPlayer(
      this.owner as player,
      AttachablePlayerAnchor.Torso
    );

    // Clear the held item reference
    this.heldItem = null;
  }
}
```

**Disclaimer**: This `holdItem` logic is simplified for mobile and desktop, where a player can only hold one item. This logic would need to be adapted for VR, where a player can hold two items.

#### 4.3. Scene Wiring

1.  Drag the **Player** object onto the `playerObject` property of the **Server** object.
2.  Drag your item objects (e.g., "Chicken", "RedChicken") onto the `item1` and `item2` properties of the **Player** object.

---

### 5\. System Behavior and UI

Once the system is active, players will experience the following behaviors:

- **Single Holstered Item**:
  - No hot bar is visible.
  - Pressing the default holster key ('Z' on desktop) will toggle the item between the player's hand and its attached anchor point.
- **Multiple Holstered Items (2+)**:
  - The **Holster Hot Bar** appears when the player presses the holster key ('Z').
  - This UI displays the icons configured for each item.
  - The player can then press the corresponding number key (1, 2, etc.) to retrieve that specific item.
- **Pagination (7+ Items)**:
  - The hot bar displays a maximum of **6 items** at a time.
  - **Desktop**: Pressing 'Z' again will page to the next set of items, looping back to the beginning.
  - **Mobile**: An arrow button appears on the hot bar UI, allowing the player to tap to page through their inventory.
- **Mobile UI**: The mobile UI functions similarly but presents the hot bar and input buttons (like the 'R' / `Swap` button) as on-screen touch elements.

---

### 6\. Advanced Concepts

The transcript briefly mentioned further capabilities of the holstering system, which can be explored in the Creator Manual:

- **Holstering Events**: You can listen to events related to holstering and unholstering items.
- **Get Holstered Items**: TypeScript can be used to retrieve a list of all items currently holstered by a player.
- **Programmatic Swapping**: You can write scripts to force an item swap without player input, which is useful for cutscenes or game logic triggers.
