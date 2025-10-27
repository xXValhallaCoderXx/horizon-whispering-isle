import * as hz from 'horizon/core';
import { MonsterConfigData, MONSTERS, EventsService } from 'constants';


// Internal wrapper class (same pattern as your ItemSpawnController)
class MonsterSpawnController {
  controller: hz.SpawnController;
  isSpawned = false;
  spawnPosition?: hz.Vec3;
  spawnedEntities: hz.Entity[] = [];

  // Server-side state ONLY
  maxHealth: number = 0;
  currentHealth: number = 0;
  isRare: boolean = false; // Store rarity if needed for logic/events
  monsterIdKey: string | null = null; // Store the normalized ID key

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


  async spawn(position: hz.Vec3, initData: { isRare: boolean, health: number, scale: hz.Vec3 }): Promise<void> {
    if (this.isSpawned) return;
    await this.controller.load();
    await this.controller.spawn();
    this.isSpawned = true;
    this.spawnPosition = position;
    this.spawnedEntities = this.controller.rootEntities.get();

    const root = this.getRootEntity();
    if (root) {
      this.monsterIdKey = MonsterSpawnController.toIdKey((root as any).id); // Store the ID key
      try {
        // Set scale
        root.scale.set(initData.scale);

        // Store server-side state
        this.maxHealth = initData.health;
        this.currentHealth = initData.health;
        this.isRare = initData.isRare;

      } catch (e) {
        console.error("[MonsterSpawnManager] Failed to init monster:", e);
        this.unload(); // Clean up failed spawn
      }
    } else {
      console.error("[MonsterSpawnManager] Spawned asset root entity not found!");
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
      console.error("[MonsterSpawnManager] Error during controller.unload()", e);
    }

    this.isSpawned = false;
    this.spawnPosition = undefined;
    this.spawnedEntities = [];
    this.monsterIdKey = null;
  }

  dispose(): void {
    if (this.isSpawned) this.unload();
    try {
      this.controller.dispose();
    } catch (e) {
      console.error("[MonsterSpawnManager] Error during controller.dispose()", e);
    }
  }
}


class EnemyNPCSpawnManager extends hz.Component<typeof EnemyNPCSpawnManager> {
  static propsDefinition = {
    monsterAsset: { type: hz.PropTypes.Asset }, // The monster prefab (must have MonsterController.ts)
    monsterType: { type: hz.PropTypes.String, default: "" }, // e.g., "SLIME"
  };

  private spawnPoints: hz.Entity[] = [];
  private activeMonsters: MonsterSpawnController[] = [];
  private timer: number = 0;
  private spawnConfig: MonsterConfigData | undefined = undefined;

  // Mapping from monster entity id (string) -> controller
  private entityToController: Map<string, MonsterSpawnController> = new Map();

  // Helper to normalize any entity id shape into a stable string key
  private toIdKey(id: unknown): string | null {
    return MonsterSpawnController.toIdKey(id);
  }





  preStart() {
    // Only the server should manage spawning
    if (!this.isOwnedByMe()) return;

    this.spawnPoints = this.findUnderContainer(this.entity, "SpawnLocations");

    // Listen for damage requests (e.g., from player weapons)
    this.connectNetworkBroadcastEvent(
      EventsService.CombatEvents.MonsterTookDamage,
      (data: { monsterId: string; damage: number; attackerId?: string }) => this.onDamageRequest(data)
    );



    const monsterAsset = this.props.monsterAsset as hz.Asset | undefined;
    if (!monsterAsset) {
      console.error("[MonsterSpawnManager] Missing monsterAsset prop.");
      return;
    }

    const monster = MONSTERS[this.props.monsterType as keyof typeof MONSTERS];
    if (!monster) {
      console.error(`[MonsterSpawnManager] Unknown monsterType: ${this.props.monsterType}`);
      return;
    }
    this.spawnConfig = monster;
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
        this.attemptSpawn(cfg, this.activeMonsters, cfg.label);
      }
      const delayMs = this.spawnConfig?.spawnRate ?? 10000;
      this.timer = this.async.setTimeout(tick, delayMs);
    };
    tick();
  }

  private attemptSpawn(
    config: MonsterConfigData,
    activeList: MonsterSpawnController[],
    label: string
  ) {
    this.cleanupInactiveControllers(activeList);
    if (activeList.length >= config.maxActive) return;
    if (Math.random() > config.spawnChance) return;
    const location = this.getAvailableSpawnLocation();
    if (!location) return;
    this.createAndSpawn(config, location, activeList, label);
  }

  private createAndSpawn(
    config: MonsterConfigData,
    location: hz.Entity,
    activeList: MonsterSpawnController[],
    label: string
  ) {
    const position = location.position.get();
    const rotation = location.rotation.get();
    const useRare = Math.random() < config.rareChance;
    const stats = useRare ? config.rareStats : config.commonStats;
    const asset = this.props.monsterAsset as hz.Asset;

    const controller = new hz.SpawnController(asset, position, rotation, stats.scale);
    const wrapper = new MonsterSpawnController(controller);

    const initData = {
      isRare: useRare,
      health: stats.health,
      scale: stats.scale,
    };

    wrapper
      .spawn(position, initData)
      .then(() => {
        if (!wrapper.isSpawned || !wrapper.monsterIdKey) { // Check ID key was set
          console.warn("[MonsterSpawnManager] Wrapper failed to spawn or get ID, bailing.");
          wrapper.dispose();
          return;
        }
        activeList.push(wrapper);
        this.entityToController.set(wrapper.monsterIdKey, wrapper); // Index by ID key
        // No need to index children unless they are independently targetable


        // Broadcast initial health state to all clients
        this.broadcastHealthUpdate(wrapper);

      })
      .catch((e) => {
        console.error("[MonsterSpawnManager] Failed to spawn", label, e);
        wrapper.dispose();
      });
  }

  // ---- Combat Handlers (Server-Side) ----

  private onDamageRequest(data: { monsterId: string; damage: number; attackerId?: string }) {
    const key = this.toIdKey(data.monsterId);
    if (!key) return;

    const controller = this.entityToController.get(key);
    if (!controller || !controller.isSpawned || controller.currentHealth <= 0) {
      return; // Target unknown or dead
    }

    // --- Basic Anti-Cheat/Validation (Example) ---
    // 1. Rate Limiting: Could track damage requests per player/per second.
    // 2. Sanity Check: Is damage value reasonable?
    // 3. Line of Sight/Range (Complex): Requires knowing player/weapon position.
    // For now, we trust the client's damage value.
    const damageAmount = Math.max(0, data.damage); // Ensure non-negative

    controller.currentHealth -= damageAmount;
    controller.currentHealth = Math.max(0, controller.currentHealth); // Clamp health at 0

    // Broadcast the health update to ALL players
    this.broadcastHealthUpdate(controller);

    if (controller.currentHealth <= 0) {
      const killerId = data.attackerId; // Get attacker ID from payload

      // TODO: Grant quest credit/XP using killerId
      this.handleMonsterDeath(controller, killerId);
    }
  }

  // Central function to broadcast health updates
  private broadcastHealthUpdate(controller: MonsterSpawnController) {
    if (!controller.isSpawned || !controller.monsterIdKey) return;

    const payload = {
      monsterId: controller.monsterIdKey, // Use the stored ID key
      currentHealth: controller.currentHealth,
      maxHealth: controller.maxHealth,
    };
    this.sendNetworkBroadcastEvent(EventsService.CombatEvents.MonsterHealthUpdate, payload);
  }


  private handleMonsterDeath(controller: MonsterSpawnController, killerId?: string) {
    const idKey = controller.monsterIdKey;
    if (!idKey) {
      console.error("[MonsterSpawnManager] Cannot handle death for controller with no ID Key!");
      // Attempt cleanup anyway
    } else {
      // Broadcast death event BEFORE unloading
      const deathPayload = { monsterId: idKey, killerId: killerId, monsterType: this.props.monsterType as string };
      this.sendNetworkBroadcastEvent(EventsService.CombatEvents.MonsterDied, deathPayload);

      // Un-index
      this.entityToController.delete(idKey);
    }


    // Unload and dispose the asset
    controller.unload().catch(e => {
      console.error("[MonsterSpawnManager] Error unloading dead monster:", e);
    });

    // Remove from active list
    const idx = this.activeMonsters.indexOf(controller);
    if (idx >= 0) this.activeMonsters.splice(idx, 1);

    // Schedule respawn check
    const cfg = this.spawnConfig;
    if (cfg) {
      const respawnDelay = cfg.spawnRate < 2000 ? 2000 : 1000;
      this.async.setTimeout(() => {
        if (this.isOwnedByMe()) { // Double-check ownership in case of shutdown
          this.attemptSpawn(cfg, this.activeMonsters, cfg.label);
        }
      }, respawnDelay);
    }
  }


  // --- Late Join Sync ---
  private onPlayerJoined = (player: hz.Player) => {
    // Server only
    if (!this.isOwnedByMe()) return;

    const playerName = (player as any)?.alias || 'Unknown';


    // Send the current health of all active monsters ONLY to the new player
    for (const controller of this.activeMonsters) {
      if (controller.isSpawned && controller.monsterIdKey) {
        const payload = {
          monsterId: controller.monsterIdKey,
          currentHealth: controller.currentHealth,
          maxHealth: controller.maxHealth,
        };
        // Send the health update event
        this.sendNetworkBroadcastEvent(EventsService.CombatEvents.MonsterHealthUpdate, payload);
      }
    }
  }


  // ---- Utility Functions ----

  private findUnderContainer(root: hz.Entity, containerName: string): hz.Entity[] {
    // ... (same as your original script)
    const containers = (root.children.get() || []).filter(
      (e) => e.name.get() === containerName
    );
    if (containers.length === 0) return [];
    const children: hz.Entity[] = [];
    for (const c of containers) children.push(...(c.children.get() || []));
    return children;
  }

  private cleanupInactiveControllers(activeList: MonsterSpawnController[]) {
    // ... (same as your original script)
    const stillActive = activeList.filter((c) => c.isSpawned);
    if (stillActive.length !== activeList.length) {
      // Clean up map references for despawned controllers that weren't properly handled (e.g., world unload)
      const activeIds = new Set(stillActive.map(c => c.monsterIdKey));
      const entries = Array.from(this.entityToController.entries());
      for (const [key, controller] of entries) {
        if (!activeIds.has(key)) {
          console.warn(`[MonsterSpawnManager] Cleaning up potentially leaked controller reference: ${key}`);
          this.entityToController.delete(key);
          // Attempt to dispose just in case
          try { controller.dispose(); } catch { }
        }
      }

      activeList.length = 0;
      activeList.push(...stillActive);
    }
  }

  private getAvailableSpawnLocation(): hz.Entity | null {
    // ... (same as your original script)
    const locations = this.spawnPoints; // Use cached list
    if (locations.length === 0) return null;

    // Simple shuffle
    for (let i = locations.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [locations[i], locations[j]] = [locations[j], locations[i]];
    }

    for (const loc of locations) {
      if (!this.isLocationOccupied(loc)) return loc;
    }

    return null; // Explicitly return null if none found
  }

  private isLocationOccupied(location: hz.Entity): boolean {
    // ... (same as your original script)
    const pos = location.position.get();
    const radius = 2.0; // Monster spawn radius

    const near = (c: MonsterSpawnController) => {
      if (!c.isSpawned || !c.spawnPosition) return false;
      const s = c.spawnPosition;
      const dx = pos.x - s.x;
      const dy = pos.y - s.y;
      const dz = pos.z - s.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz) < radius;
    };

    // Check against the current list
    for (const c of this.activeMonsters) {
      if (near(c)) return true;
    }
    return false;
  }

  private isOwnedByMe(): boolean {
    const owner = this.entity.owner.get();
    const localPlayer = this.world.getLocalPlayer();
    return owner ? owner.id === localPlayer.id : false;
  }
}
hz.Component.register(EnemyNPCSpawnManager);