---
title: "Module 3 - NPC Manager Implementation"
source_urls:
  - "https://developers.meta.com/horizon-worlds/learn/documentation/tutorial-worlds/scripted-avatar-npc-tutorial/module-3-npc-manager"
last_updated: "2025-09-26T00:00:00Z"
tags: ["horizon_worlds", "npc_manager", "navmesh_pathfinding", "game_state_machine", "npc_behaviors"]
summary: "Detailed implementation of NPCManager.ts script covering player state tracking, NPC spawning, event handling, and behavior class architecture."
tutorial: "scripted-avatar-npc"
---

# Module 3 - NPC Manager Implementation

## What & Why

The **NPCManager.ts** script provides a **state-driven architecture** for managing NPC behaviors based on game events and player interactions. It implements a **finite state machine pattern** with specialized behavior classes for different game states (Ready, Playing, Finished), coordinating two NPCs: Village Elder (helper/guide) and Traveling Merchant (antagonist/reset manager).

## Key APIs / Concepts

- **PlayerState class** - Local tracking object for human player gem/coin statistics
- **preStart()** - Initialization method for player listeners, NPC spawning, NavMesh setup
- **spawnAgentPlayer()** - Async method to bring AvatarAIAgent NPCs into world
- **NPCBehavior abstract class** - Base class with pathfinding and movement methods
- **State behavior extensions** - NPCBehaviorGameReady, NPCBehaviorGamePlaying, NPCBehaviorGameFinished
- **NavMesh API** - GetPathTo(), moveToPosition(), rotateTo() for pathfinding
- **Event listeners** - gameStateChanged, collectGem for NPC behavioral triggers

## How-To (Recipe)

1. **Setup preStart()**: Configure player listeners, spawn NPCs, bake NavMesh
2. **Define PlayerState**: Track human player statistics locally
3. **Implement Event Listeners**: Handle game state changes and gem collection
4. **Create NPCBehavior Classes**: Extend base class for each game state
5. **Implement Pathfinding**: Use NavMesh API for NPC movement and positioning
6. **Coordinate Behaviors**: Update NPCs based on game state transitions

## NPC Character Behaviors

### Village Elder
- **Call to Action**: Delivers voice-over instructions to player
- **Assistance**: Helps collect gems during gameplay
- **Gratitude**: Thanks player when all 5 gems collected
- **Joy Expression**: Jumps when objectives completed

### Traveling Merchant
- **Interference**: Grabs collected gems and returns them to original locations
- **Game Reset**: Runs to Reset button when all gems collected
- **Trading Commentary**: Provides voice-over at gem trading kiosk
- **Game Restart**: Triggers new game when player trades all items

## Core Implementation

### PlayerState Class
```typescript
export class PlayerState {
  public player!: hz.Player;
  public gemsCollected : number = 0;
  public coins : number = 0;
  public gemQuestCompleted : boolean = false;
  
  public constructor(init?:Partial<PlayerState>) {
    Object.assign(this, init);
  }
}
```

### NPC Spawning Pattern
```typescript
if (this.props.villageElder) {
  const ve: AvatarAIAgent = this.props.villageElder?.as(AvatarAIAgent);
  ve.spawnAgentPlayer().then((spawnResult) => this.onSpawnResult(spawnResult, ve));
}
```

### Event Listener Setup
```typescript
this.connectLocalBroadcastEvent(
  gameStateChanged, 
  (payload: {state : GameState}) => this.onGameStateChanged(payload.state)
);
this.connectLocalBroadcastEvent(
  collectGem, 
  (payload: {gem: hz.Entity, collector: hz.Player}) => 
    this.onGemCollected(payload.gem, payload.collector)
);
```

## NPCBehavior Architecture

| Method | Purpose |
|--------|----------|
| `UpdateForPlayer` | Updates NPC behaviors for specified player based on game state |
| `onTransactionDone` | Handles trading transaction completion with gem/coin values |
| `GetPathTo` | Returns NavMesh waypoints between Vec3 points (20 attempts) |
| `moveToPosition` | NavMesh pathfinding with rotateTo() and moveToPosition() calls |
| `calcTargetPos` | Calculates entity target position (foot position for players) |
| `moveToEntity` | Moves agent to entity position (static targeting) |

## State Machine Extensions

| Class | Game State | Functionality |
|-------|------------|---------------|
| `NPCBehaviorGameReady` | Ready | Game setup for players and NPCs |
| `NPCBehaviorGamePlaying` | Playing | Gem collection behaviors; `shouldBennyHill()` interference |
| `NPCBehaviorGameFinished` | Finished | Reset coordination; `getWinningPlayer()` determination |

## Limits & Constraints

- **10-second update intervals** - Allows background Horizon World systems to initialize
- **Static pathfinding** - Does not continuously update target positions for moving entities  
- **20-attempt pathfinding** - GetPathTo() makes finite attempts to find NavMesh routes
- **Single state machine** - Simple implementation; complex behaviors may need hierarchical FSMs
- **Local PlayerState** - Player tracking maintained locally, not persistent across sessions

## Gotchas / Debugging

- **NavMesh baking required** - Must call bake() before NPC movement
- **Async spawning delays** - NPCs take several seconds to spawn; start in preStart()
- **Player/NPC differentiation** - Event listeners fire for both; use isNPC() filtering
- **State machine timing** - 10-second delay prevents race conditions with system initialization
- **Entity casting** - Ensure proper AvatarAIAgent casting before API calls

## See Also

- [Module 4 - Adding Voice-Over](./04-adding-voice-over.md) - Audio integration for NPC interactions
- [Module 2 - Overview of Scripted Avatar NPCs](./02-overview.md) - NPC fundamentals and API overview
- [Setting up NPCs with Navigation](../../desktop-editor-overview.md#npc-navigation) - NavMesh configuration details
- [NPCs Overview](../../objects-components-overview.md#npcs) - Comprehensive NPC system documentation

## Sources

- Tutorial page: https://developers.meta.com/horizon-worlds/learn/documentation/tutorial-worlds/scripted-avatar-npc-tutorial/module-3-npc-manager (accessed 2025-09-26)