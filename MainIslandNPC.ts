import * as hz from 'horizon/core';
import { AvatarAIAgent, AgentSpawnResult, AgentLocomotionResult } from 'horizon/avatar_ai_agent';
import NavMeshManager, { NavMesh, NavMeshPath } from 'horizon/navmesh';
import { MainIslandNPCAudio } from 'MainIslandNPCAudio';

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

class MainIslandNPC extends hz.Component<typeof MainIslandNPC> {
  static propsDefinition = {
    npcAgent: { type: hz.PropTypes.Entity },
    greetingTrigger: { type: hz.PropTypes.Entity },
    patrolWaypoints: { type: hz.PropTypes.EntityArray },
    audioBank: { type: hz.PropTypes.Entity },
    enablePatrol: { type: hz.PropTypes.Boolean, default: true },
    enablePlayerTracking: { type: hz.PropTypes.Boolean, default: true },
    playerDetectionRadius: { type: hz.PropTypes.Number, default: 10 },
    awarenessUpdateInterval: { type: hz.PropTypes.Number, default: 1000 },
    spawnPoint: { type: hz.PropTypes.Entity },
  };


  // Player tracking
  private playerData = new Map<number, PlayerVisitData>();

  // NPC state
  private agent?: AvatarAIAgent;
  private navMesh?: NavMesh;
  private audio?: MainIslandNPCAudio;
  private isBusy = false;

  // Patrol state
  private currentWaypointIndex = 0;
  private isPatrolling = false;

  // Player awareness
  private trackedPlayer?: hz.Player;
  private awarenessTimerId?: number;


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
    if (this.props.npcAgent && this.props?.spawnPoint) {
      this.agent = this.props.npcAgent.as(AvatarAIAgent);
      this.agent.position.set(this.props?.spawnPoint?.position.get());
      const spawnResult = await this.agent.spawnAgentPlayer();
      this.onNPCSpawned(spawnResult);
    }

    // Initialize NavMesh
    const navMeshManager = NavMeshManager.getInstance(this.world);
    const navMesh = await navMeshManager.getByName("MainIslandNPC");

    if (navMesh == null) {
      console.error("[IslandNPC] Could not find NavMesh named 'MainIslandNPC'");
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

  start() {
    // Get audio component
    this.audio = this.props.audioBank?.getComponents<MainIslandNPCAudio>()[0];

    // Set up greeting trigger
    if (this.props.greetingTrigger) {
      this.connectCodeBlockEvent(
        this.props.greetingTrigger,
        hz.CodeBlockEvents.OnPlayerEnterTrigger,
        (player) => this.onPlayerEnterWorld(player)
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
    console.log("[IslandNPC] Patrol paused for greeting: ", this.isBusy);
    // Wait for NPC to be available
    if (!this.isBusy) {
      await this.greetPlayer(player, isFirstVisit);
    }

    // Mark as greeted
    playerVisit.hasBeenGreeted = true;
  }

  private onPlayerExitGreetingZone(player: hz.Player) {
    if (this.isNPC(player)) {
      return;
    }

    console.log(`[IslandNPC] Player exited greeting zone: ${player.name.get()}`);

    this.greetPlayer(player, false);
    // Resume patrol if enabled
    if (this.props.enablePatrol && !this.isPatrolling) {
      this.resumePatrol();
    }
  }

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
        if (result === AgentLocomotionResult.Complete) {
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
    console.error("Updating Player Awareness", npcPos);
    if (!npcPos) return;

    // Find closest player within detection radius
    let closestPlayer: hz.Player | undefined;
    let closestDistance = this.props.playerDetectionRadius;
    console.log("Checking players for awareness 222", this.playerData);
    this.playerData.forEach((playerVisit) => {
      const player = playerVisit.player;
      const playerPos = player.foot.getPosition(hz.Space.World);
      const distance = npcPos.distance(playerPos);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestPlayer = player;
      }
    });


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
hz.Component.register(MainIslandNPC);