import * as hz from 'horizon/core';
import { HarvestableTreeConfig, TREE_TYPES, EventsService, ITEM_TYPES, ITEMS } from 'constants';

// Internal wrapper class to track spawned tree state
class TreeSpawnController {
  controller: hz.SpawnController;
  isSpawned = false;
  spawnPosition?: hz.Vec3;
  spawnedEntities: hz.Entity[] = [];

  // Server-side state ONLY
  maxHealth: number = 0;
  currentHealth: number = 0;
  treeType: string = '';
  treeIdKey: string | null = null; // Store the normalized ID key

  constructor(controller: hz.SpawnController) {
    this.controller = controller;
  }

  getRootEntity(): hz.Entity | null {
    if (!this.isSpawned || this.spawnedEntities.length === 0) return null;
    return this.spawnedEntities[0];
  }

  // Helper to normalize any entity id shape into a stable string key
  static toIdKey(id: unknown): string | null {
    const t = typeof id;
    if (t === "string") return id as string;
    if (t === "number") return String(id as number);
    if (t === "bigint") return (id as bigint).toString();
    return null;
  }

  async spawn(position: hz.Vec3, initData: { health: number, treeType: string }): Promise<void> {
    if (this.isSpawned) return;
    await this.controller.load();
    await this.controller.spawn();
    this.isSpawned = true;
    this.spawnPosition = position;
    this.spawnedEntities = this.controller.rootEntities.get();

    const root = this.getRootEntity();
    if (root) {
      this.treeIdKey = TreeSpawnController.toIdKey((root as any).id); // Store the ID key
      try {
        // Store server-side state
        this.maxHealth = initData.health;
        this.currentHealth = initData.health;
        this.treeType = initData.treeType;

        // Make tree visible
        root.visible.set(true);
      } catch (e) {
        console.error("[TreeSpawnManager] Failed to init tree:", e);
        this.unload(); // Clean up failed spawn
      }
    } else {
      console.error("[TreeSpawnManager] Spawned tree root entity not found!");
      this.unload();
    }
  }

  getEntities(): hz.Entity[] {
    return this.spawnedEntities;
  }

  async unload(): Promise<void> {
    if (!this.isSpawned) return;

    try {
      await this.controller.unload();
    } catch (e) {
      console.error("[TreeSpawnManager] Error during controller.unload()", e);
    }

    this.isSpawned = false;
    this.spawnPosition = undefined;
    this.spawnedEntities = [];
    this.treeIdKey = null;
  }

  dispose(): void {
    if (this.isSpawned) this.unload();
    try {
      this.controller.dispose();
    } catch (e) {
      console.error("[TreeSpawnManager] Error during controller.dispose()", e);
    }
  }
}

class TreeSpawnManager extends hz.Component<typeof TreeSpawnManager> {
  static propsDefinition = {
    treeAsset: { type: hz.PropTypes.Asset }, // The tree prefab (must have HarvestTree.ts)
    treeType: { type: hz.PropTypes.String, default: "oak" }, // e.g., "oak", "pine"
    woodLogAsset: { type: hz.PropTypes.Asset }, // The wood log asset to spawn on depletion
  };

  private spawnPoints: hz.Entity[] = [];
  private activeTrees: TreeSpawnController[] = [];
  private timer: number = 0;
  private spawnConfig: HarvestableTreeConfig | undefined = undefined;

  // Mapping from tree entity id (string) -> controller
  private entityToController: Map<string, TreeSpawnController> = new Map();

  // Helper to normalize any entity id shape into a stable string key
  private toIdKey(id: unknown): string | null {
    return TreeSpawnController.toIdKey(id);
  }

  preStart() {
    // Only the server should manage spawning
    if (!this.isOwnedByMe()) return;

    this.spawnPoints = this.findUnderContainer(this.entity, "SpawnLocations");

    // Listen for tree hit events
    this.connectNetworkBroadcastEvent(
      EventsService.HarvestEvents.TreeHit,
      (data: { player: hz.Player; treeEntity: hz.Entity; hitPosition: hz.Vec3; healthRemaining: number }) => 
        this.onTreeHit(data)
    );

    // Listen for tree depleted events
    this.connectNetworkBroadcastEvent(
      EventsService.HarvestEvents.TreeDepleted,
      (data: { player: hz.Player; treeEntity: hz.Entity; position: hz.Vec3 }) => 
        this.onTreeDepleted(data)
    );

    const treeAsset = this.props.treeAsset as hz.Asset | undefined;
    if (!treeAsset) {
      console.error("[TreeSpawnManager] Missing treeAsset prop.");
      return;
    }

    const treeConfig = TREE_TYPES[this.props.treeType as keyof typeof TREE_TYPES];
    if (!treeConfig) {
      console.error(`[TreeSpawnManager] Unknown treeType: ${this.props.treeType}`);
      return;
    }
    this.spawnConfig = treeConfig;
  }

  start() {
    // Only the server runs the spawn timer
    if (this.isOwnedByMe() && this.spawnConfig) {
      this.startSpawnTimer();
    }
  }

  private startSpawnTimer() {
    const tick = () => {
      const cfg = this.spawnConfig;
      if (cfg) {
        this.attemptSpawn(cfg, this.activeTrees);
      }
      // Check for spawn every 2 seconds
      this.timer = this.async.setTimeout(tick, 2000);
    };
    tick();
  }

  private attemptSpawn(
    config: HarvestableTreeConfig,
    activeList: TreeSpawnController[]
  ) {
    this.cleanupInactiveControllers(activeList);
    
    // Calculate max active trees (e.g., based on spawn points or fixed number)
    const maxActiveTrees = Math.min(this.spawnPoints.length, 10); // Max 10 active trees
    
    if (activeList.length >= maxActiveTrees) return;
    
    const location = this.getAvailableSpawnLocation();
    if (!location) return;
    
    this.createAndSpawn(config, location, activeList);
  }

  private createAndSpawn(
    config: HarvestableTreeConfig,
    location: hz.Entity,
    activeList: TreeSpawnController[]
  ) {
    const position = location.position.get();
    const rotation = location.rotation.get();
    const asset = this.props.treeAsset as hz.Asset;

    const controller = new hz.SpawnController(asset, position, rotation, hz.Vec3.one);
    const wrapper = new TreeSpawnController(controller);

    const initData = {
      health: config.maxHealth,
      treeType: this.props.treeType as string,
    };

    wrapper
      .spawn(position, initData)
      .then(() => {
        if (!wrapper.isSpawned || !wrapper.treeIdKey) {
          console.warn("[TreeSpawnManager] Wrapper failed to spawn or get ID, bailing.");
          wrapper.dispose();
          return;
        }
        activeList.push(wrapper);
        this.entityToController.set(wrapper.treeIdKey, wrapper); // Index by ID key

        console.log(`[TreeSpawnManager] Spawned tree at ${position}, ID: ${wrapper.treeIdKey}`);
      })
      .catch((e) => {
        console.error("[TreeSpawnManager] Failed to spawn tree", e);
        wrapper.dispose();
      });
  }

  // ---- Tree Hit Handler (Server-Side) ----
  private onTreeHit(data: { player: hz.Player; treeEntity: hz.Entity; hitPosition: hz.Vec3; healthRemaining: number }) {
    const treeId = (data.treeEntity as any).id;
    const key = this.toIdKey(treeId);

    if (!key) return;

    const controller = this.entityToController.get(key);
    if (!controller || !controller.isSpawned) {
      return; // Tree not found or already despawned
    }

    // Update server-side health
    controller.currentHealth = data.healthRemaining;

    console.log(`[TreeSpawnManager] Tree hit! Health: ${controller.currentHealth}/${controller.maxHealth}`);
  }

  // ---- Tree Depleted Handler (Server-Side) ----
  private onTreeDepleted(data: { player: hz.Player; treeEntity: hz.Entity; position: hz.Vec3 }) {
    const treeId = (data.treeEntity as any).id;
    const key = this.toIdKey(treeId);

    if (!key) return;

    const controller = this.entityToController.get(key);
    if (!controller || !controller.isSpawned) {
      return; // Tree not found
    }

    console.log(`[TreeSpawnManager] Tree depleted! Processing drops for player: ${(data.player as any).alias || 'Unknown'}`);

    // Roll for wood drops based on config
    const cfg = this.spawnConfig;
    if (cfg) {
      this.handleWoodDrops(data.player, data.position, cfg);
    }

    // Remove tree from world
    this.handleTreeRemoval(controller);
  }

  private handleWoodDrops(player: hz.Player, position: hz.Vec3, config: HarvestableTreeConfig) {
    // Randomize if drops will occur
    const dropRoll = Math.random();
    if (dropRoll > config.dropChance) {
      console.log(`[TreeSpawnManager] No drops this time (roll: ${dropRoll.toFixed(2)}, chance: ${config.dropChance})`);
      return;
    }

    // Determine number of drops
    const numDrops = Math.floor(Math.random() * (config.maxDrops - config.minDrops + 1)) + config.minDrops;

    console.log(`[TreeSpawnManager] Spawning ${numDrops} wood logs`);

    // Spawn wood logs
    for (let i = 0; i < numDrops; i++) {
      this.spawnWoodLog(position, config);
    }
  }

  private async spawnWoodLog(centerPosition: hz.Vec3, config: HarvestableTreeConfig) {
    const woodAsset = this.props.woodLogAsset as hz.Asset | undefined;
    if (!woodAsset) {
      console.warn("[TreeSpawnManager] No wood log asset configured!");
      return;
    }

    const scatterRadius = 1.0;
    const pluckHeight = 0.5;

    // Random scatter position
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * scatterRadius;
    const offsetX = Math.cos(angle) * distance;
    const offsetZ = Math.sin(angle) * distance;

    const spawnPosition = new hz.Vec3(
      centerPosition.x + offsetX,
      centerPosition.y + pluckHeight,
      centerPosition.z + offsetZ
    );

    try {
      const spawnedEntities = await this.world.spawnAsset(woodAsset, spawnPosition);

      if (spawnedEntities.length === 0) {
        console.warn("[TreeSpawnManager] Failed to spawn wood log");
        return;
      }

      const log = spawnedEntities[0];

      // Ensure interaction mode is set
      log.interactionMode.set(hz.EntityInteractionMode.Both);
      log.collidable.set(true);

      // Apply physics after short delay
      this.async.setTimeout(() => {
        const physicalLog = log.as(hz.PhysicalEntity);
        if (physicalLog) {
          // Launch velocity
          const velocityMag = 3 + Math.random() * 2;
          const velocity = new hz.Vec3(offsetX, 1, offsetZ).normalize().mul(velocityMag);
          physicalLog.applyForce(velocity, hz.PhysicsForceMode.VelocityChange);

          // Angular velocity (spin)
          const angularMag = 1 + Math.random() * 9;
          const torque = new hz.Vec3(
            (Math.random() - 0.5) * angularMag,
            (Math.random() - 0.5) * angularMag,
            (Math.random() - 0.5) * angularMag
          );
          physicalLog.applyTorque(torque);
        }
      }, 500);

      // Auto-despawn after 60 seconds
      this.async.setTimeout(() => {
        try {
          this.world.deleteAsset(log);
        } catch (e) {
          // Already collected or deleted
        }
      }, 60000);
    } catch (e) {
      console.error("[TreeSpawnManager] Error spawning wood log:", e);
    }
  }

  private handleTreeRemoval(controller: TreeSpawnController) {
    const idKey = controller.treeIdKey;

    if (!idKey) {
      console.error("[TreeSpawnManager] Cannot handle removal for controller with no ID Key!");
    } else {
      console.log(`[TreeSpawnManager] Removing tree ID: ${idKey}`);
      // Un-index
      this.entityToController.delete(idKey);
    }

    // Small delay before unloading to give clients time to see effects
    this.async.setTimeout(() => {
      // Unload and dispose the asset
      controller.unload().catch(e => {
        console.error("[TreeSpawnManager] Error unloading tree:", e);
      });
    }, 1000); // 1 second delay

    // Remove from active list
    const idx = this.activeTrees.indexOf(controller);
    if (idx >= 0) this.activeTrees.splice(idx, 1);

    // Schedule respawn check (tree regeneration cycle)
    const cfg = this.spawnConfig;
    if (cfg) {
      const respawnDelay = cfg.regenTimeMs || 30000; // Use config regen time
      this.async.setTimeout(() => {
        if (this.isOwnedByMe()) {
          this.attemptSpawn(cfg, this.activeTrees);
        }
      }, respawnDelay);
    }
  }

  // ---- Utility Functions ----

  private findUnderContainer(root: hz.Entity, containerName: string): hz.Entity[] {
    const containers = (root.children.get() || []).filter(
      (e) => e.name.get() === containerName
    );
    if (containers.length === 0) return [];
    const children: hz.Entity[] = [];
    for (const c of containers) children.push(...(c.children.get() || []));
    return children;
  }

  private cleanupInactiveControllers(activeList: TreeSpawnController[]) {
    const stillActive = activeList.filter((c) => c.isSpawned);
    if (stillActive.length !== activeList.length) {
      // Clean up map references for despawned controllers
      const activeIds = new Set(stillActive.map(c => c.treeIdKey));
      const entries = Array.from(this.entityToController.entries());
      for (const [key, controller] of entries) {
        if (!activeIds.has(key)) {
          console.warn(`[TreeSpawnManager] Cleaning up leaked controller reference: ${key}`);
          this.entityToController.delete(key);
          try { controller.dispose(); } catch { }
        }
      }

      activeList.length = 0;
      activeList.push(...stillActive);
    }
  }

  private getAvailableSpawnLocation(): hz.Entity | null {
    const locations = this.spawnPoints;
    if (locations.length === 0) return null;

    // Shuffle to randomize spawn points
    const shuffled = [...locations];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Find first unoccupied location
    for (const loc of shuffled) {
      if (!this.isLocationOccupied(loc)) return loc;
    }

    // If all occupied, return random one anyway
    return shuffled[0];
  }

  private isLocationOccupied(location: hz.Entity): boolean {
    const pos = location.position.get();
    const radius = 2.0; // Trees need more space

    const near = (c: TreeSpawnController) => {
      if (!c.isSpawned || !c.spawnPosition) return false;
      const s = c.spawnPosition;
      const d = Math.sqrt(
        (s.x - pos.x) ** 2 + (s.y - pos.y) ** 2 + (s.z - pos.z) ** 2
      );
      return d < radius;
    };

    for (const c of this.activeTrees) if (near(c)) return true;
    return false;
  }

  private isOwnedByMe(): boolean {
    const owner = this.entity.owner.get();
    const localPlayer = this.world.getLocalPlayer();
    return owner ? owner.id === localPlayer.id : false;
  }
}

hz.Component.register(TreeSpawnManager);
