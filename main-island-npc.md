# Island NPC Implementation Plan

## Overview
Create a scripted NPC using `AvatarAIAgent` that greets players when they enter the island, tracks player interactions, patrols a defined path, and is aware of nearby players.

**Key Features:**
- Multiple randomized greetings (not static)
- Player memory system (remembers previous encounters)
- Patrol path walking
- Player awareness and tracking (looks at nearby players)
- Audio playback system for dialogue
- NavMesh-based navigation

---

## Architecture Analysis from Example

### Key Components from `scripted-npc-example`

1. **AvatarAIAgent** - The NPC entity type
   - `spawnAgentPlayer()` - Spawns the NPC into the world
   - `locomotion` - Movement API
   - `lookAt()` - Makes NPC look at a position
   - `agentPlayer.get()` - Gets the player representation of the NPC

2. **NavMesh** - Navigation system
   - `getPath(from, to)` - Returns waypoints for navigation
   - `getNearestPoint(pos, radius)` - Snaps position to navmesh
   - Must be baked before use

3. **Audio System** - `NPCAudioPlayback` component
   - Manages multiple audio clips per dialogue type
   - Random selection from audio arrays
   - Simple API: `playWelcome()`, `playGoodbye()`, etc.

4. **Player Tracking**
   - `PlayerState` class to track per-player data
   - `Map<number, PlayerState>` for all players
   - Filter NPCs with `isNPC(player)` utility

---

## Phase 1: Core Components

### File: `island-npc-manager.ts`

```typescript
import * as hz from 'horizon/core';
import { AvatarAIAgent, AgentSpawnResult, AgentLocomotionResult } from 'horizon/avatar_ai_agent';
import NavMeshManager, { NavMesh, NavMeshPath } from 'horizon/navmesh';
import { IslandNPCAudio } from './island-npc-audio';

/**
 * Player tracking data for the Island NPC
 */
export class PlayerVisitData {
  public player: hz.Player;
  public visitCount: number = 0;
  public lastVisitTime: number = 0;
  public hasBeenGreeted: boolean = false;

  constructor(player: hz.Player) {
    this.player = player;
  }
}

/**
 * IslandNPCManager - Main NPC controller
 * 
 * Manages:
 * - NPC spawning and initialization
 * - Player detection and greetings
 * - Patrol behavior
 * - Player awareness (looking at nearby players)
 */
export class IslandNPCManager extends hz.Component<typeof IslandNPCManager> {
  static propsDefinition = {
    // The AvatarAIAgent entity
    npcAgent: { type: hz.PropTypes.Entity },
    
    // Trigger zone for player greetings
    greetingTrigger: { type: hz.PropTypes.Entity },
    
    // Patrol waypoints (array of empty entities marking positions)
    patrolWaypoints: { type: hz.PropTypes.EntityArray },
    
    // Audio bank component entity
    audioBank: { type: hz.PropTypes.Entity },
    
    // Enable patrol behavior
    enablePatrol: { type: hz.PropTypes.Boolean, default: true },
    
    // Enable player tracking (NPC looks at nearby players)
    enablePlayerTracking: { type: hz.PropTypes.Boolean, default: true },
    
    // Distance to detect players for looking
    playerDetectionRadius: { type: hz.PropTypes.Number, default: 10 },
    
    // How often to update player awareness (ms)
    awarenessUpdateInterval: { type: hz.PropTypes.Number, default: 1000 }
  };

  // Player tracking
  private playerData = new Map<number, PlayerVisitData>();
  
  // NPC state
  private agent?: AvatarAIAgent;
  private navMesh?: NavMesh;
  private audio?: IslandNPCAudio;
  private isBusy = false;
  
  // Patrol state
  private currentWaypointIndex = 0;
  private isPatrolling = false;
  
  // Player awareness
  private trackedPlayer?: hz.Player;
  private awarenessTimerId?: number;

  /**
   * preStart - Initialize NPC and NavMesh
   */
  async preStart() {
    console.log("[IslandNPC] Initializing...");
    
    // Set up player enter/exit world events
    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnPlayerEnterWorld,
      (player) => this.onPlayerEnterWorld(player)
    );
    
    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnPlayerExitWorld,
      (player) => this.onPlayerExitWorld(player)
    );
    
    // Spawn the NPC
    if (this.props.npcAgent) {
      this.agent = this.props.npcAgent.as(AvatarAIAgent);
      const spawnResult = await this.agent.spawnAgentPlayer();
      this.onNPCSpawned(spawnResult);
    }
    
    // Initialize NavMesh
    const navMeshManager = NavMeshManager.getInstance(this.world);
    const navMesh = await navMeshManager.getByName("NPC");
    
    if (navMesh == null) {
      console.error("[IslandNPC] Could not find NavMesh named 'NPC'");
      return;
    }
    
    this.navMesh = navMesh;
    
    // Wait for NavMesh bake to complete
    const bake = this.navMesh.getStatus().currentBake;
    if (bake != null) {
      await bake;
    }
    
    console.log("[IslandNPC] NavMesh ready!");
  }

  /**
   * start - Set up triggers and behaviors
   */
  start() {
    // Get audio component
    this.audio = this.props.audioBank?.getComponents<IslandNPCAudio>()[0];
    
    // Set up greeting trigger
    if (this.props.greetingTrigger) {
      this.connectCodeBlockEvent(
        this.props.greetingTrigger,
        hz.CodeBlockEvents.OnPlayerEnterTrigger,
        (player) => this.onPlayerEnterGreetingZone(player)
      );
      
      this.connectCodeBlockEvent(
        this.props.greetingTrigger,
        hz.CodeBlockEvents.OnPlayerExitTrigger,
        (player) => this.onPlayerExitGreetingZone(player)
      );
    }
    
    // Start patrol behavior if enabled
    if (this.props.enablePatrol && this.props.patrolWaypoints && this.props.patrolWaypoints.length > 0) {
      this.startPatrol();
    }
    
    // Start player awareness system if enabled
    if (this.props.enablePlayerTracking) {
      this.awarenessTimerId = this.async.setInterval(
        () => this.updatePlayerAwareness(),
        this.props.awarenessUpdateInterval
      );
    }
    
    console.log("[IslandNPC] NPC ready!");
  }

  /**
   * Called when NPC successfully spawns
   */
  private onNPCSpawned(result: AgentSpawnResult) {
    if (result === AgentSpawnResult.Success) {
      console.log("[IslandNPC] NPC spawned successfully");
    } else {
      console.error(`[IslandNPC] Failed to spawn NPC: ${result}`);
    }
  }

  /**
   * Track player entering the world
   */
  private onPlayerEnterWorld(player: hz.Player) {
    // Filter out NPC players
    if (this.isNPC(player)) {
      return;
    }
    
    console.log(`[IslandNPC] Player entered world: ${player.name.get()}`);
    
    // Create or retrieve player data
    if (!this.playerData.has(player.id)) {
      this.playerData.set(player.id, new PlayerVisitData(player));
    }
  }

  /**
   * Track player leaving the world
   */
  private onPlayerExitWorld(player: hz.Player) {
    if (this.isNPC(player)) {
      return;
    }
    
    console.log(`[IslandNPC] Player exited world: ${player.name.get()}`);
    
    // Clean up if player is being tracked
    if (this.trackedPlayer?.id === player.id) {
      this.trackedPlayer = undefined;
    }
  }

  /**
   * Player enters greeting trigger zone
   */
  private async onPlayerEnterGreetingZone(player: hz.Player) {
    if (this.isNPC(player) || !this.agent) {
      return;
    }
    
    console.log(`[IslandNPC] Player entered greeting zone: ${player.name.get()}`);
    
    const playerVisit = this.playerData.get(player.id);
    if (!playerVisit) return;
    
    // Update visit data
    playerVisit.visitCount++;
    playerVisit.lastVisitTime = Date.now();
    
    // Determine greeting type based on visit count
    const isFirstVisit = !playerVisit.hasBeenGreeted;
    
    // Stop patrol to greet player
    if (this.isPatrolling) {
      this.pausePatrol();
    }
    
    // Wait for NPC to be available
    if (!this.isBusy) {
      await this.greetPlayer(player, isFirstVisit);
    }
    
    // Mark as greeted
    playerVisit.hasBeenGreeted = true;
  }

  /**
   * Player exits greeting trigger zone
   */
  private onPlayerExitGreetingZone(player: hz.Player) {
    if (this.isNPC(player)) {
      return;
    }
    
    console.log(`[IslandNPC] Player exited greeting zone: ${player.name.get()}`);
    
    // Resume patrol if enabled
    if (this.props.enablePatrol && !this.isPatrolling) {
      this.resumePatrol();
    }
  }

  /**
   * Greet a player with appropriate dialogue
   */
  private async greetPlayer(player: hz.Player, isFirstVisit: boolean) {
    if (!this.agent || !this.audio) return;
    
    this.isBusy = true;
    
    // Make NPC look at player
    const playerPos = player.foot.getPosition(hz.Space.World);
    await this.agent.lookAt(playerPos);
    
    // Select and play appropriate greeting
    if (isFirstVisit) {
      console.log(`[IslandNPC] First visit greeting for ${player.name.get()}`);
      this.audio.playFirstGreeting();
    } else {
      console.log(`[IslandNPC] Return visit greeting for ${player.name.get()}`);
      this.audio.playReturnGreeting();
    }
    
    // Optional: Make NPC perform a gesture
    // await this.agent.locomotion.jump();
    
    // Wait a bit before returning to normal behavior
    await new Promise(resolve => this.async.setTimeout(resolve, 3000));
    
    this.isBusy = false;
  }

  // ==================== PATROL SYSTEM ====================

  /**
   * Start patrol behavior
   */
  private startPatrol() {
    if (!this.props.patrolWaypoints || this.props.patrolWaypoints.length === 0) {
      console.warn("[IslandNPC] No patrol waypoints defined");
      return;
    }
    
    console.log(`[IslandNPC] Starting patrol with ${this.props.patrolWaypoints.length} waypoints`);
    this.isPatrolling = true;
    this.currentWaypointIndex = 0;
    this.patrolToNextWaypoint();
  }

  /**
   * Move to next waypoint in patrol
   */
  private async patrolToNextWaypoint() {
    if (!this.isPatrolling || !this.agent || this.isBusy) {
      return;
    }
    
    const waypoints = this.props.patrolWaypoints;
    if (!waypoints || waypoints.length === 0) return;
    
    const targetWaypoint = waypoints[this.currentWaypointIndex];
    if (!targetWaypoint) return;
    
    const targetPos = targetWaypoint.position.get();
    console.log(`[IslandNPC] Patrolling to waypoint ${this.currentWaypointIndex}: ${targetPos.toString()}`);
    
    // Move to waypoint using NavMesh
    await this.moveToPosition(
      targetPos,
      (result) => {
        if (result === AgentLocomotionResult.Success) {
          // Move to next waypoint
          this.currentWaypointIndex = (this.currentWaypointIndex + 1) % waypoints.length;
          
          // Wait a bit at waypoint, then continue
          this.async.setTimeout(() => {
            if (this.isPatrolling) {
              this.patrolToNextWaypoint();
            }
          }, 2000); // Wait 2 seconds at each waypoint
        } else {
          console.warn(`[IslandNPC] Patrol movement failed: ${result}`);
          // Try next waypoint
          this.currentWaypointIndex = (this.currentWaypointIndex + 1) % waypoints.length;
          this.patrolToNextWaypoint();
        }
      }
    );
  }

  /**
   * Pause patrol (e.g., when greeting player)
   */
  private pausePatrol() {
    console.log("[IslandNPC] Pausing patrol");
    this.isPatrolling = false;
  }

  /**
   * Resume patrol after interruption
   */
  private resumePatrol() {
    console.log("[IslandNPC] Resuming patrol");
    this.isPatrolling = true;
    this.patrolToNextWaypoint();
  }

  // ==================== PLAYER AWARENESS ====================

  /**
   * Update which player the NPC should be looking at
   */
  private updatePlayerAwareness() {
    if (!this.agent || this.isBusy) {
      return;
    }
    
    const npcPos = this.agent.agentPlayer.get()?.position.get();
    if (!npcPos) return;
    
    // Find closest player within detection radius
    let closestPlayer: hz.Player | undefined;
    let closestDistance = this.props.playerDetectionRadius;
    
    for (const [playerId, playerVisit] of this.playerData) {
      const player = playerVisit.player;
      const playerPos = player.foot.getPosition(hz.Space.World);
      const distance = npcPos.distance(playerPos);
      
      if (distance < closestDistance) {
        closestDistance = distance;
        closestPlayer = player;
      }
    }
    
    // Update tracked player and look at them
    if (closestPlayer && closestPlayer !== this.trackedPlayer) {
      this.trackedPlayer = closestPlayer;
      const playerPos = closestPlayer.foot.getPosition(hz.Space.World);
      this.agent.lookAt(playerPos);
      console.log(`[IslandNPC] Now tracking player: ${closestPlayer.name.get()}`);
    } else if (!closestPlayer && this.trackedPlayer) {
      // No players nearby, stop tracking
      this.trackedPlayer = undefined;
      console.log("[IslandNPC] No players nearby to track");
    }
  }

  // ==================== NAVIGATION HELPERS ====================

  /**
   * Move NPC to a position using NavMesh pathfinding
   */
  private async moveToPosition(
    destination: hz.Vec3,
    onComplete?: (result: AgentLocomotionResult) => void
  ): Promise<void> {
    if (!this.agent || !this.navMesh) return;
    
    const agentPos = this.agent.agentPlayer.get()?.foot.getPosition(hz.Space.World);
    if (!agentPos) return;
    
    // Snap positions to NavMesh
    let startPos = this.navMesh.getNearestPoint(agentPos, 0.3) || agentPos;
    let endPos = this.navMesh.getNearestPoint(destination, 0.3) || destination;
    
    // Get path
    const path = this.getPathTo(startPos, endPos);
    if (path.length === 0) {
      console.warn("[IslandNPC] No path found");
      onComplete?.(AgentLocomotionResult.Error);
      return;
    }
    
    // Rotate toward destination, then move
    const direction = endPos.sub(startPos);
    await this.agent.locomotion.rotateTo(direction);
    
    const result = await this.agent.locomotion.moveToPositions(path);
    onComplete?.(result);
  }

  /**
   * Get navigation path between two points
   */
  private getPathTo(from: hz.Vec3, to: hz.Vec3): Array<hz.Vec3> {
    if (!this.navMesh) return [];
    
    let path: NavMeshPath | null = null;
    let attempts = 0;
    const maxAttempts = 20;
    
    // Try to get path, adjusting Y coordinate if needed
    do {
      path = this.navMesh.getPath(from, to);
      attempts++;
      to.y = from.y; // Adjust Y to match start height
    } while (path == null && attempts < maxAttempts);
    
    if (path == null) {
      console.warn("[IslandNPC] Failed to find path after max attempts");
      return [];
    }
    
    return path.waypoints;
  }

  // ==================== UTILITIES ====================

  /**
   * Check if a player is an NPC
   */
  private isNPC(player: hz.Player): boolean {
    const serverPlayer = this.world.getServerPlayer();
    return player.id === serverPlayer.id;
  }
}

hz.Component.register(IslandNPCManager);
```

---

## Phase 2: Audio System

### File: `island-npc-audio.ts`

```typescript
import * as hz from 'horizon/core';

/**
 * IslandNPCAudio - Manages audio playback for the Island NPC
 * 
 * Features:
 * - Multiple audio clips per dialogue type
 * - Random selection for variety
 * - Easy expansion for new dialogue types
 */
export class IslandNPCAudio extends hz.Component<typeof IslandNPCAudio> {
  static propsDefinition = {
    // First greeting clips (when player lands for first time)
    firstGreeting01: { type: hz.PropTypes.Entity },
    firstGreeting02: { type: hz.PropTypes.Entity },
    firstGreeting03: { type: hz.PropTypes.Entity },
    firstGreeting04: { type: hz.PropTypes.Entity },
    
    // Return greeting clips (when player returns)
    returnGreeting01: { type: hz.PropTypes.Entity },
    returnGreeting02: { type: hz.PropTypes.Entity },
    returnGreeting03: { type: hz.PropTypes.Entity },
    returnGreeting04: { type: hz.PropTypes.Entity },
    
    // Idle chatter clips (optional, for future use)
    idleChatter01: { type: hz.PropTypes.Entity },
    idleChatter02: { type: hz.PropTypes.Entity },
    idleChatter03: { type: hz.PropTypes.Entity },
    
    // Farewell clips (optional, for future use)
    farewell01: { type: hz.PropTypes.Entity },
    farewell02: { type: hz.PropTypes.Entity },
  };

  // Audio clip arrays
  private firstGreetings: (hz.AudioGizmo | undefined)[] = [];
  private returnGreetings: (hz.AudioGizmo | undefined)[] = [];
  private idleChatter: (hz.AudioGizmo | undefined)[] = [];
  private farewells: (hz.AudioGizmo | undefined)[] = [];

  /**
   * Initialize audio arrays from props
   */
  preStart() {
    // Map entity props to AudioGizmo arrays
    this.firstGreetings = [
      this.props.firstGreeting01,
      this.props.firstGreeting02,
      this.props.firstGreeting03,
      this.props.firstGreeting04
    ].map(e => e?.as(hz.AudioGizmo));
    
    this.returnGreetings = [
      this.props.returnGreeting01,
      this.props.returnGreeting02,
      this.props.returnGreeting03,
      this.props.returnGreeting04
    ].map(e => e?.as(hz.AudioGizmo));
    
    this.idleChatter = [
      this.props.idleChatter01,
      this.props.idleChatter02,
      this.props.idleChatter03
    ].map(e => e?.as(hz.AudioGizmo));
    
    this.farewells = [
      this.props.farewell01,
      this.props.farewell02
    ].map(e => e?.as(hz.AudioGizmo));
    
    console.log("[IslandNPCAudio] Audio system initialized");
  }

  /**
   * Play a random audio clip from an array
   */
  private playRandom(clips: (hz.AudioGizmo | undefined)[]): void {
    // Filter out undefined clips
    const validClips = clips.filter(clip => clip !== undefined) as hz.AudioGizmo[];
    
    if (validClips.length === 0) {
      console.warn("[IslandNPCAudio] No valid audio clips to play");
      return;
    }
    
    // Select random clip
    const index = Math.floor(Math.random() * validClips.length);
    const selectedClip = validClips[index];
    
    console.log(`[IslandNPCAudio] Playing audio clip ${index + 1} of ${validClips.length}`);
    selectedClip.play();
  }

  // ==================== PUBLIC API ====================

  /**
   * Play first greeting (random selection)
   */
  public playFirstGreeting(): void {
    console.log("[IslandNPCAudio] Playing first greeting");
    this.playRandom(this.firstGreetings);
  }

  /**
   * Play return greeting (random selection)
   */
  public playReturnGreeting(): void {
    console.log("[IslandNPCAudio] Playing return greeting");
    this.playRandom(this.returnGreetings);
  }

  /**
   * Play idle chatter (random selection)
   */
  public playIdleChatter(): void {
    console.log("[IslandNPCAudio] Playing idle chatter");
    this.playRandom(this.idleChatter);
  }

  /**
   * Play farewell (random selection)
   */
  public playFarewell(): void {
    console.log("[IslandNPCAudio] Playing farewell");
    this.playRandom(this.farewells);
  }
}

hz.Component.register(IslandNPCAudio);
```

---

## Phase 3: Utility Functions

### File: `utils.ts` (if not already exists)

```typescript
import * as hz from 'horizon/core';

/**
 * Check if a player is an NPC (server player)
 */
export function isNPC(player: hz.Player): boolean {
  const serverPlayer = player.world.getServerPlayer();
  return player.id === serverPlayer.id;
}

/**
 * Get distance between two entities
 */
export function getDistance(entity1: hz.Entity, entity2: hz.Entity): number {
  const pos1 = entity1.position.get();
  const pos2 = entity2.position.get();
  return pos1.distance(pos2);
}

/**
 * Get player foot position (useful for ground-based positioning)
 */
export function getPlayerFootPosition(player: hz.Player): hz.Vec3 {
  return player.foot.getPosition(hz.Space.World);
}
```

---

## Implementation Checklist

### World Setup (Horizon Worlds Editor)

- [ ] **Create NPC Entity**
  - [ ] Add AvatarAIAgent gizmo to world
  - [ ] Name it "IslandNPC" or similar
  - [ ] Set spawn location
  - [ ] Configure appearance/avatar

- [ ] **Create NavMesh**
  - [ ] Add NavMesh to world
  - [ ] Name it "NPC"
  - [ ] Configure navmesh bounds to cover patrol area
  - [ ] Bake the navmesh

- [ ] **Create Greeting Trigger**
  - [ ] Add trigger zone entity near NPC spawn
  - [ ] Size appropriately for greeting detection
  - [ ] Name it "GreetingTrigger"

- [ ] **Create Patrol Waypoints**
  - [ ] Add empty entities as waypoint markers
  - [ ] Name them "Waypoint_01", "Waypoint_02", etc.
  - [ ] Position them along desired patrol path
  - [ ] Ensure all waypoints are on the navmesh

- [ ] **Create Audio Bank Entity**
  - [ ] Add empty entity to hold audio component
  - [ ] Attach `IslandNPCAudio` script to it
  - [ ] Name it "NPCAudioBank"

- [ ] **Create Audio Entities**
  - [ ] Create AudioGizmo entities for each dialogue type
  - [ ] Upload audio files for:
    - 4x First Greetings
    - 4x Return Greetings
    - 3x Idle Chatter (optional)
    - 2x Farewells (optional)
  - [ ] Name them descriptively (e.g., "FirstGreeting01")

- [ ] **Create Manager Entity**
  - [ ] Add empty entity named "IslandNPCManager"
  - [ ] Attach `IslandNPCManager` script
  - [ ] Configure properties:
    - Assign NPC agent entity
    - Assign greeting trigger
    - Assign patrol waypoints array
    - Assign audio bank entity
    - Enable patrol: true
    - Enable player tracking: true
    - Set detection radius: 10
    - Set awareness interval: 1000

### Script Setup

- [ ] Create `island-npc-manager.ts`
- [ ] Create `island-npc-audio.ts`
- [ ] Create `utils.ts` (if needed)
- [ ] Build/compile scripts
- [ ] Upload to Horizon Worlds

### Testing

- [ ] **Initial Spawn**
  - [ ] NPC spawns correctly
  - [ ] NPC is on navmesh
  - [ ] No console errors

- [ ] **First Visit Greeting**
  - [ ] Enter greeting trigger
  - [ ] NPC looks at player
  - [ ] Random first greeting plays
  - [ ] Audio completes properly

- [ ] **Return Visit Greeting**
  - [ ] Exit and re-enter trigger
  - [ ] Different greeting type plays
  - [ ] Random selection works

- [ ] **Patrol Behavior**
  - [ ] NPC walks patrol path
  - [ ] NPC stops at waypoints
  - [ ] NPC loops back to start
  - [ ] Patrol pauses when greeting

- [ ] **Player Awareness**
  - [ ] NPC looks at nearby players
  - [ ] NPC tracks closest player
  - [ ] NPC returns to patrol when alone

- [ ] **Multiple Players**
  - [ ] Greetings work for each player
  - [ ] Player data tracked separately
  - [ ] No conflicts or errors

---

## Dialogue Content Suggestions

### First Greetings (4 variations)
1. "Welcome to the island, traveler! I've been expecting you."
2. "Ah, a new face! Welcome, welcome! You've come to the right place."
3. "Greetings, friend! Your journey begins here on our beautiful island."
4. "Hello there! So glad you could make it. Let me show you around!"

### Return Greetings (4 variations)
1. "Back again, I see! How have your adventures been treating you?"
2. "Welcome back, friend! Did you find what you were looking for?"
3. "Ah, you've returned! It's good to see a familiar face."
4. "Hey there! Back for more excitement? You've come to the right place!"

### Idle Chatter (3 variations - for future)
1. "The weather's quite nice today, isn't it?"
2. "I wonder what adventures await beyond these shores..."
3. "Hmm, I should probably check on the other side of the island..."

---

## API Reference

### AvatarAIAgent API

```typescript
// Spawning
agent.spawnAgentPlayer(): Promise<AgentSpawnResult>

// Movement
agent.locomotion.moveToPositions(waypoints: hz.Vec3[]): Promise<AgentLocomotionResult>
agent.locomotion.rotateTo(direction: hz.Vec3): Promise<AgentLocomotionResult>
agent.locomotion.jump(): Promise<AgentLocomotionResult>
agent.locomotion.isMoving.get(): boolean

// Looking
agent.lookAt(position: hz.Vec3): void

// Player reference
agent.agentPlayer.get(): hz.Player | null
```

### NavMesh API

```typescript
// Pathfinding
navMesh.getPath(start: hz.Vec3, end: hz.Vec3): NavMeshPath | null

// Position snapping
navMesh.getNearestPoint(position: hz.Vec3, radius: number): hz.Vec3 | null

// Status
navMesh.getStatus(): NavMeshStatus
```

### Trigger Events

```typescript
hz.CodeBlockEvents.OnPlayerEnterTrigger  // Player enters trigger
hz.CodeBlockEvents.OnPlayerExitTrigger   // Player exits trigger
hz.CodeBlockEvents.OnPlayerEnterWorld    // Player joins world
hz.CodeBlockEvents.OnPlayerExitWorld     // Player leaves world
```

---

## Future Enhancements

### Phase 4: Additional Features
- [ ] Contextual dialogues based on game state
- [ ] Quest system integration
- [ ] Dynamic patrol path changes
- [ ] Gestures/emotes during greetings
- [ ] Time-of-day specific dialogues
- [ ] Player achievement reactions
- [ ] Multiple NPC coordination
- [ ] Idle animations at waypoints

### Phase 5: Advanced Behaviors
- [ ] Following player temporarily
- [ ] Pointing/directing players to locations
- [ ] Reacting to player equipment/items
- [ ] Multi-step conversations
- [ ] NPC-to-NPC interactions

---

## Troubleshooting Guide

### Common Issues

**NPC doesn't spawn**
- Check if `spawnAgentPlayer()` returns success
- Ensure NPC entity is properly configured as AvatarAIAgent
- Check console for spawn errors

**No audio plays**
- Verify audio entities are assigned in props
- Check if AudioGizmo components exist
- Ensure audio files are uploaded

**NPC doesn't move**
- Verify NavMesh is baked
- Check if waypoints are on navmesh (use `getNearestPoint()`)
- Ensure `getPath()` returns valid waypoints

**Player detection not working**
- Check trigger zone size and position
- Verify events are connected properly
- Ensure `isNPC()` filter is working

**NPC doesn't look at players**
- Check player detection radius
- Verify awareness update interval
- Ensure `lookAt()` is being called

---

## Best Practices

1. **NavMesh Coverage**: Ensure all patrol waypoints and interaction areas are within navmesh bounds
2. **Audio Organization**: Name audio files clearly and consistently
3. **Player Filtering**: Always filter out NPC players using `isNPC()`
4. **Error Handling**: Log errors and failures for debugging
5. **State Management**: Use `isBusy` flag to prevent behavior conflicts
6. **Performance**: Adjust awareness update interval based on player count
7. **Testing**: Test with single player first, then multiple players
8. **Fallbacks**: Provide fallback behavior if pathfinding fails

---

## Next Steps

1. Create the three TypeScript files
2. Set up world entities in Horizon Worlds editor
3. Record/upload audio files
4. Configure all entity properties
5. Test basic greeting functionality
6. Test patrol behavior
7. Test player awareness
8. Refine audio selection logic
9. Add additional dialogue variations
10. Test with multiple players

Good luck with your Island NPC! 🏝️
