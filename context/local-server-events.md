# Event Scripting & Ownership in Worlds — Technical Summary

## What this covers

- Ownership model (server vs local) and why it affects responsiveness & authority
- Script execution modes (Default vs Local) and when to use each
- Ways to assign/transfer ownership safely (and keep state)
- The event system (Local, Network, Code-block), payload rules, and targeting
- Direct vs broadcast patterns and performance best practices
- Concrete examples from a “Camera API example world”

---

## 1) Ownership Model

### Types of ownership

- **Server-owned (authoritative):**

  - Logic runs on the server.
  - Pros: consistency for all players; anti-cheat.
  - Cons: added round-trip latency on interactions.

- **Locally-owned (client authoritative for that entity):**

  - Logic runs on the player’s client (VR headset; for mobile/desktop the “client” runs in the cloud).
  - Pros: immediate feedback; ideal for tight controls.
  - Cons: must design carefully to avoid desync; limited to client-accessible APIs.

### Why it matters

- **Responsiveness:** Server ownership can feel “sluggish” for time-sensitive interactions (e.g., hit VFX after a shot); local ownership enables instant feedback.
- **Use cases for local ownership / ownership transfer:**

  - Player-controlled vehicles & weapons
  - Personal UI elements
  - Custom player controls (camera control, focus, etc.)

---

## 2) Script Execution Modes

| Mode        | Where it executes | Typical use                                    | Sync behavior                                                |
| ----------- | ----------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| **Default** | Server            | Core gameplay logic that must be authoritative | State auto-syncs to all players                              |
| **Local**   | Owning client     | Immediate, player-specific interactions        | State tied to owning player; variables reset on owner change |

**Platform note:** For mobile/desktop, both Default and Local scripts run in the cloud (no native client), which can change performance trade-offs vs VR (where Local runs on the headset).

**Ownership swap & Local scripts:**
When a Local script’s ownership changes, its **field variables reset**. Persist any needed state using the provided ownership lifecycle hooks (next section).

---

## 3) Assigning & Transferring Ownership

### Ways to change owner

- **`entity.setOwner(player)`**

  - Directly reassigns the entity’s owner.
  - **Resets script field variables** to their initial values.

- **Collision-initiated ownership**

  - Ownership can transfer in response to collisions, if the entity’s properties permit.

- **Grab-by-player**

  - Grabbing an entity can transfer ownership to the grabber (common for tools/weapons).

### Preserving state across owner changes

Use component-level hooks to serialize/restore state:

```ts
// Called before ownership leaves this player. Return serializable state.
transferOwnership(fromPlayer: Player, toPlayer: Player): Serializable {
  return {
    // e.g., ammoCount, currentMode, pathIndex, etc.
  };
}

// Called after ownership is assigned to new player.
receiveOwnership(payload: Serializable, fromPlayer: Player, toPlayer: Player) {
  // Restore state to fields
  // Reconnect any player-scoped listeners (e.g., input, camera)
}
```

**Key points**

- Return only **serializable** data (numbers, strings, simple objects, engine-safe classes like `Player`, `Entity`, `Vec3`, `Quaternion` where supported by the Network layer).
- Re-initialize **player-scoped listeners** in `receiveOwnership` (e.g., input/camera events for the new owner).

---

## 4) Event System

### Event types

- **Local events**

  - For communication among entities **with the same owner** (server↔server or player↔player-owned).
  - Cheapest, essentially like function calls within the same authority context.
  - Payload: Any TypeScript type allowed locally.

- **Network events**

  - For communication **across owners** (e.g., server system → player UI).
  - Required for multiplayer interactions.
  - Subject to network latency.
  - Payload: **Serializable** only (numbers, strings, simple objects, and specific engine classes).

- **Code-block events**

  - Built-in lifecycle/interaction hooks (enter trigger, grab object, player joined, etc.).
  - **Do not** use them as a general-purpose messaging bus; reserve them for engine-provided interactions.

### Sending events — design choices

When you emit an event, decide:

1. **Name** — clear and descriptive (`SetCameraMode`, `StartCutscene`, `GameOver`)
2. **Payload** — keep minimal and serializable (especially across the network)
3. **Target** — direct recipient(s) or broadcast

**Direct vs Broadcast**

- **Direct (targeted)** — send to one entity/player.

  - Most efficient (only one listener receives it).
  - Use when the recipient is known (e.g., projectile hit target).

- **Broadcast** — send to all listeners of that event.

  - More flexible, less efficient.
  - Use when multiple systems must react (e.g., `GameOver` for UI + scoreboards + spawners).

---

## 5) Implementation Patterns & Examples (Camera API Example World)

### A. Camera trigger → player camera (server → local)

- **Situation:** Player enters a trigger volume. The trigger logic runs on the **server** (Default).
- **Action:** Server **sends a Network event** to the **player’s locally-owned camera** to change mode (e.g., fixed camera path).
- **Why:** Owner differs (server entity → player-owned camera), so Network event is required.

_Pseudocode:_

```ts
// On server, within camera-trigger component
this.connect(CodeBlockEvent.OnPlayerEnterTrigger, (player: Player) => {
  PlayerCameraEvents.SetCameraMode.sendTo(player, CameraMode.FixedPath);
});
```

### B. Door cutscene (local chaining on the same owner)

- **Situation:** Player presses a button (server-owned button).
- **Action:** Button triggers a **Local event** to the **server-owned cutscene controller** to start; that controller orchestrates camera changes via Network events to the player’s camera.
- **Why:** Keeping server authoritative for world state (door animation), but using Network events to drive the player’s local camera for a cinematic.

_Pseudocode:_

```ts
// Server: button press → local event within server authority
DoorCutsceneEvents.StartCutscene.emit(); // local, server-owned systems listen

// Server: cutscene controller → player camera
PlayerCameraEvents.SetCameraMode.sendTo(player, CameraMode.Cinematic);
```

### C. Weapon pickup (ownership transfer on grab)

- **Situation:** Player grabs a gun.
- **Action:** In `onGrab`, assign ownership of the **projectile launcher** to the grabber.
- **State:** Use `transferOwnership`/`receiveOwnership` to keep weapon state (e.g., ammo, fire mode).

_Pseudocode:_

```ts
onGrab(by: Player) {
  projectileLauncher.owner.set(by);
}
```

### D. Player join → assign camera entity

- **Situation:** Player enters the world; server’s camera manager maintains a pool of cameras.
- **Action:** Server **sets the owner** of one camera entity to the joining player; the camera’s Local script then initializes per-player listeners in `receiveOwnership`.

---

## 6) Payload Rules (Quick Reference)

| Channel     | Permitted data                                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Local**   | Any TS types available locally                                                                                                |
| **Network** | Serializable only: numbers, strings, simple objects; engine-approved classes (e.g., `Player`, `Entity`, `Vec3`, `Quaternion`) |

---

## 7) Event Listeners (Where & How)

- **Setup timing:** `preStart` / `start` of your component.
- **Connect correctly:** Receiver signature must match the event payload shape exactly; mis-matches silently drop the call (no console error).
- **Re-wire on owner change:** For Local scripts, re-attach player-scoped listeners in `receiveOwnership`.

_Pattern:_

```ts
start() {
  // Local event (same owner)
  ScoreEvents.Updated.connect(this, this.onScoreUpdated);

  // Network event (cross-owner)
  PlayerCameraEvents.SetCameraMode.connect(this, this.onSetCameraMode);
}

private onSetCameraMode(mode: number) {
  // apply mode
}
```

---

## 8) Performance & Best Practices

- **Prefer Local events** when the sender and receiver share an owner — they’re immediate and cheaper.
- **Minimize Network events**; they add latency and bandwidth usage.
- **Avoid event storms:**

  - Don’t emit in tight loops; throttle/debounce if needed.
  - There’s a per-frame event budget; exceeding it drops events and/or hitches.

- **Name events clearly** (`VerbNoun` or `Domain.Verb`) so intent is obvious.
- **Use Code-block events only** for engine-provided interactions (player enter/exit trigger, grab, player join, etc.).
- **Plan ownership early:** Decide which systems must be authoritative vs responsive; design event routes accordingly.
- **Cross-platform consideration:** On mobile/desktop, “Local” still runs in the cloud; test responsiveness vs VR.

---

## 9) Quick Checklists

### Ownership & Scripts

- [ ] Does this interaction demand instant feedback? → Use Local ownership.
- [ ] Will multiple players see/affect the same state? → Keep Server authority.
- [ ] On owner change, do I serialize/restore needed state? → `transferOwnership` / `receiveOwnership`.
- [ ] Did I re-bind player-scoped listeners after `receiveOwnership`?

### Events

- [ ] Same owner? → Local event. Different owners? → Network event.
- [ ] Can I target a specific recipient? → Prefer direct send over broadcast.
- [ ] Is the payload minimal and serializable (for network)?
- [ ] Are listener signatures exact? (No silent drops.)

---

## 10) Minimal End-to-End Example

**Goal:** Button press → cinematic camera on the pressing player → door opens → restore player camera.

```ts
// Server: Button component
this.connect(CodeBlockEvent.OnPressed, (by: Player) => {
  DoorCutsceneEvents.Start.emit(); // local, server-owned cutscene system
  PlayerCameraEvents.SetMode.sendTo(by, CameraMode.Cinematic); // network
});

// Server: Cutscene system
DoorCutsceneEvents.Start.connect(this, () => {
  door.open();
  // (Optionally) after timeline completes:
  this.broadcast(PlayerCameraEvents.RestoreMode); // or direct per player
});

// Player-owned: Camera component (Local)
receiveOwnership(payload, from, to) {
  this.bindPlayerListeners(to);
}

PlayerCameraEvents.SetMode.connect(this, (mode: number) => {
  this.controller.setMode(mode);
});

PlayerCameraEvents.RestoreMode.connect(this, () => {
  this.controller.setMode(CameraMode.PlayerControlled);
});
```

### Core Takeaway

Design **authority** (who owns what) and **messaging** (which event channel) together. Use **Local** ownership/events for immediacy, **Server** authority for shared truth, and **Network** events sparingly to bridge the two.
