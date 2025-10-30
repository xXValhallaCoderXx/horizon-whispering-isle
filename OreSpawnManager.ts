import * as hz from 'horizon/core';
import { EventsService, ORE_TYPES, ORE_RARITY, HarvestableOreConfig } from 'constants';

// Internal wrapper class to track spawned ore state
class OreSpawnController {
  controller: hz.SpawnController;
  isSpawned = false;
  spawnPosition?: hz.Vec3;
  spawnedEntities: hz.Entity[] = [];
  spawnLocation?: hz.Entity;

  // Server-side state ONLY
  maxHealth: number = 0;
  currentHealth: number = 0;
  oreRarity: string = '';
  oreIdKey: string | null = null;
  config: HarvestableOreConfig | null = null;

  constructor(controller: hz.SpawnController) {
    this.controller = controller;
  }

  getRootEntity(): hz.Entity | null {
    if (!this.isSpawned || this.spawnedEntities.length === 0) return null;
    return this.spawnedEntities[0];
  }

  static toIdKey(id: unknown): string | null {
    const t = typeof id;
    if (t === "string") return id as string;
    if (t === "number") return String(id as number);
    if (t === "bigint") return (id as bigint).toString();
    return null;
  }

  async spawn(position: hz.Vec3, initData: { health: number, oreRarity: string, config: HarvestableOreConfig }): Promise<void> {
    if (this.isSpawned) return;
    await this.controller.load();
    await this.controller.spawn();
    this.isSpawned = true;
    this.spawnPosition = position;
    this.spawnedEntities = this.controller.rootEntities.get();

    const root = this.getRootEntity();
    if (root) {
      this.oreIdKey = OreSpawnController.toIdKey((root as any).id);
      try {
        // Store server-side state
        this.maxHealth = initData.health;
        this.currentHealth = initData.health;
        this.oreRarity = initData.oreRarity;
        this.config = initData.config;

        // Make ore visible
        root.visible.set(true);
      } catch (e) {
        console.error("[OreSpawnManager] Failed to init ore:", e);
        this.unload();
      }
    } else {
      console.error("[OreSpawnManager] Spawned ore root entity not found!");
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
      console.error("[OreSpawnManager] Error during controller.unload()", e);
    }

    this.isSpawned = false;
    this.spawnPosition = undefined;
    this.spawnedEntities = [];
    this.oreIdKey = null;
  }

  dispose(): void {
    if (this.isSpawned) this.unload();
    try {
      this.controller.dispose();
    } catch (e) {
      console.error("[OreSpawnManager] Error during controller.dispose()", e);
    }
  }
}

class OreSpawnManager extends hz.Component<typeof OreSpawnManager> {
  static propsDefinition = {
    commonOreAsset: { type: hz.PropTypes.Asset },
    rareOreAsset: { type: hz.PropTypes.Asset },
    legendaryOreAsset: { type: hz.PropTypes.Asset },
    oreChunkAsset: { type: hz.PropTypes.Asset }, // Collectable ore drop
  };
  // Add a simple knob to slow down respawns without touching your constants
  private readonly RESPAWN_DELAY_MULTIPLIER = 1.5; // increase or decrease to taste
  // Cooldown per spawn point (entity id -> timestamp ms)
  private locationCooldowns: Map<string, number> = new Map();

  // Separate spawn locations for each rarity
  private commonSpawnPoints: hz.Entity[] = [];
  private rareSpawnPoints: hz.Entity[] = [];
  private legendarySpawnPoints: hz.Entity[] = [];

  private activeOres: OreSpawnController[] = [];
  private timer: number = 0;

  // Mapping from ore entity id (string) -> controller
  private entityToController: Map<string, OreSpawnController> = new Map();

  // Spawn chance per tick for each rarity (rare/legendary spawn less often)
  private readonly SPAWN_CHANCES = {
    [ORE_RARITY.COMMON]: 0.8,      // 80% chance to spawn when location available
    [ORE_RARITY.RARE]: 0.4,        // 40% chance to spawn when location available
    [ORE_RARITY.LEGENDARY]: 0.15,  // 15% chance to spawn when location available
  };

  private toIdKey(id: unknown): string | null {
    return OreSpawnController.toIdKey(id);
  }

  preStart() {
    // Only the server should manage spawning
    if (!this.isOwnedByMe()) return;

    // Find spawn locations for each rarity
    this.commonSpawnPoints = this.findUnderContainer(this.entity, "CommonSpawnLocations");
    this.rareSpawnPoints = this.findUnderContainer(this.entity, "RareSpawnLocations");
    this.legendarySpawnPoints = this.findUnderContainer(this.entity, "LegendarySpawnLocations");

    console.log(
      `[OreSpawnManager] Found spawn points - Common: ${this.commonSpawnPoints.length}, ` +
      `Rare: ${this.rareSpawnPoints.length}, Legendary: ${this.legendarySpawnPoints.length}`
    );

    // Listen for ore hit requests
    this.connectNetworkBroadcastEvent(
      EventsService.HarvestEvents.RequestOreHit,
      (data: any) => this.onOreHitRequest(data)
    );
  }

  start() {
    // Only the server runs the spawn timer
    if (this.isOwnedByMe()) {
      this.startSpawnTimer();
    }
  }

  private startSpawnTimer() {
    const tick = () => {
      this.attemptSpawn(this.activeOres);
      // Check for spawn every 3 seconds
      this.timer = this.async.setTimeout(tick, 3000);
    };
    tick();
  }

  private attemptSpawn(activeList: OreSpawnController[]) {
    this.cleanupInactiveControllers(activeList);

    // Try spawning each rarity type
    this.attemptSpawnRarity(ORE_RARITY.COMMON, this.commonSpawnPoints, activeList);
    this.attemptSpawnRarity(ORE_RARITY.RARE, this.rareSpawnPoints, activeList);
    this.attemptSpawnRarity(ORE_RARITY.LEGENDARY, this.legendarySpawnPoints, activeList);
  }

  private attemptSpawnRarity(
    rarity: ORE_RARITY,
    spawnPoints: hz.Entity[],
    activeList: OreSpawnController[]
  ) {
    if (spawnPoints.length === 0) return;

    // Find available location for this rarity
    const location = this.getAvailableSpawnLocation(spawnPoints);
    if (!location) return;

    // Roll spawn chance (rare/legendary spawn less frequently)
    const spawnChance = this.SPAWN_CHANCES[rarity] || 1.0;
    if (Math.random() > spawnChance) return;

    const config = ORE_TYPES[rarity];
    if (!config) {
      console.error(`[OreSpawnManager] Unknown ore rarity: ${rarity}`);
      return;
    }

    this.createAndSpawn(rarity, config, location, activeList);
  }


  private createAndSpawn(
    rarity: ORE_RARITY,
    config: HarvestableOreConfig,
    location: hz.Entity,
    activeList: OreSpawnController[]
  ) {
    const position = location.position.get();
    const rotation = location.rotation.get();

    // Select asset based on rarity
    let asset: hz.Asset | undefined;
    switch (rarity) {
      case ORE_RARITY.COMMON:
        asset = this.props.commonOreAsset as hz.Asset;
        break;
      case ORE_RARITY.RARE:
        asset = this.props.rareOreAsset as hz.Asset;
        break;
      case ORE_RARITY.LEGENDARY:
        asset = this.props.legendaryOreAsset as hz.Asset;
        break;
    }

    if (!asset) {
      console.error(`[OreSpawnManager] No asset configured for ${rarity} ore`);
      return;
    }

    const controller = new hz.SpawnController(asset, position, rotation, hz.Vec3.one);
    const wrapper = new OreSpawnController(controller);
    wrapper.spawnLocation = location;   // Remember which spawn point was used so we can cooldown that point later
    // Randomize health within range
    const health = Math.floor(
      Math.random() * (config.maxHealth - config.minHealth + 1) + config.minHealth
    );

    const initData = {
      health,
      oreRarity: rarity,
      config,
    };

    wrapper
      .spawn(position, initData)
      .then(() => {
        if (!wrapper.isSpawned || !wrapper.oreIdKey) {
          console.warn("[OreSpawnManager] Wrapper failed to spawn or get ID, bailing.");
          wrapper.dispose();
          return;
        }
        activeList.push(wrapper);
        this.entityToController.set(wrapper.oreIdKey, wrapper);

        console.log(
          `[OreSpawnManager] Spawned ${rarity} ore at ${position}, ID: ${wrapper.oreIdKey}, Health: ${health}`
        );
      })
      .catch((e) => {
        console.error("[OreSpawnManager] Failed to spawn ore", e);
        wrapper.dispose();
      });
  }

  // ---- Ore Hit Handler (Server-Side) ----
  private onOreHitRequest(data: any) {
    const { player, oreEntity, oreRarity, toolType, hitPosition } = data;

    const oreId = (oreEntity as any)?.id;
    const key = this.toIdKey(oreId);

    if (!key) return;

    const controller = this.entityToController.get(key);
    if (!controller || !controller.isSpawned || !controller.config) {
      return; // Ore not found or already despawned
    }

    // Validate tool compatibility
    if (toolType !== controller.config.toolType) {
      console.error(
        `[OreSpawnManager] Wrong tool: ${toolType} (need ${controller.config.toolType})`
      );
      // Send wrong tool feedback
      // this.sendNetworkBroadcastEvent(EventsService.H.OreHitWrongTool, {
      //   player,
      //   oreEntity,
      // });
      return;
    }

    // Calculate damage (random within range)
    const damage = Math.floor(
      Math.random() *
      (controller.config.maxDamagePerHit - controller.config.minDamagePerHit + 1) +
      controller.config.minDamagePerHit
    );

    // Apply damage
    controller.currentHealth -= damage;
    if (controller.currentHealth < 0) controller.currentHealth = 0;

    console.log(
      `[OreSpawnManager] Ore hit! Damage: ${damage}, Health: ${controller.currentHealth}/${controller.maxHealth}`
    );

    // Broadcast hit confirmation
    this.sendNetworkBroadcastEvent(EventsService.HarvestEvents.OreHit, {
      player,
      oreEntity,
      hitPosition,
      damage,
      healthRemaining: controller.currentHealth,
    });

    // Roll for per-strike drop
    this.rollForOreStrikeDrop(controller.config, hitPosition);

    // Check if depleted
    if (controller.currentHealth <= 0) {
      this.handleOreDepletion(controller, player, hitPosition);
    }
  }

  private rollForOreStrikeDrop(config: HarvestableOreConfig, position: hz.Vec3) {
    if (Math.random() < config.dropChancePerStrike) {
      const dropCount = Math.floor(
        Math.random() * (config.maxDropsPerStrike - config.minDropsPerStrike + 1) +
        config.minDropsPerStrike
      );

      console.log(`[OreSpawnManager] Dropping ${dropCount} ore(s) from strike`);

      for (let i = 0; i < dropCount; i++) {
        const offsetPos = this.getScatteredPosition(position, 1.0);
        this.spawnOreChunk(offsetPos, config.oreItemId);
      }
    }
  }

  private handleOreDepletion(
    controller: OreSpawnController,
    player: hz.Player,
    position: hz.Vec3
  ) {
    const config = controller.config;
    if (!config) return;

    const loc = controller.spawnLocation;
    const locKey = loc ? this.toIdKey((loc as any).id) : null;
    if (locKey) {
      const delay = Math.round(config.regenTimeMs * this.RESPAWN_DELAY_MULTIPLIER);
      this.locationCooldowns.set(locKey, Date.now() + delay);
    }
    console.log(`[OreSpawnManager] Ore depleted! Rarity: ${controller.oreRarity}`);

    // Broadcast depletion event
    this.sendNetworkBroadcastEvent(EventsService.HarvestEvents.OreDepleted, {
      player,
      oreEntity: controller.getRootEntity(),
      position,
      oreRarity: controller.oreRarity,
    });

    // Roll for depletion drops
    if (Math.random() < config.dropChanceOnDepletion) {
      const dropCount = Math.floor(
        Math.random() * (config.maxDropsOnDepletion - config.minDropsOnDepletion + 1) +
        config.minDropsOnDepletion
      );

      console.log(`[OreSpawnManager] Dropping ${dropCount} ore(s) on depletion`);

      for (let i = 0; i < dropCount; i++) {
        const offsetPos = this.getScatteredPosition(position, 1.25);
        this.spawnOreChunk(offsetPos, config.oreItemId);
      }
    }

    // Remove ore from world
    this.handleOreRemoval(controller);
  }

  private async spawnOreChunk(position: hz.Vec3, itemId: string) {
    const oreAsset = this.props.oreChunkAsset as hz.Asset | undefined;
    if (!oreAsset) {
      console.warn("[OreSpawnManager] No ore chunk asset configured!");
      return;
    }

    try {
      const spawnedEntities = await this.world.spawnAsset(oreAsset, position);

      if (spawnedEntities.length === 0) {
        console.warn("[OreSpawnManager] Failed to spawn ore chunk");
        return;
      }

      const chunk = spawnedEntities[0];

      // Ensure interaction mode is set
      chunk.interactionMode.set(hz.EntityInteractionMode.Both);
      chunk.collidable.set(true);

      // Apply physics after short delay
      this.async.setTimeout(() => {
        const physicalChunk = chunk.as(hz.PhysicalEntity);
        if (physicalChunk) {
          // Launch velocity
          const angle = Math.random() * Math.PI * 2;
          const offsetX = Math.cos(angle) * 0.5;
          const offsetZ = Math.sin(angle) * 0.5;
          const velocityMag = 2 + Math.random() * 1;
          const velocity = new hz.Vec3(offsetX, 1, offsetZ).normalize().mul(velocityMag);
          physicalChunk.applyForce(velocity, hz.PhysicsForceMode.VelocityChange);

          // Angular velocity (spin)
          const angularMag = 1 + Math.random() * 5;
          const torque = new hz.Vec3(
            (Math.random() - 0.5) * angularMag,
            (Math.random() - 0.5) * angularMag,
            (Math.random() - 0.5) * angularMag
          );
          physicalChunk.applyTorque(torque);
        }
      }, 500);

      // Auto-despawn after 60 seconds
      this.async.setTimeout(() => {
        try {
          this.world.deleteAsset(chunk);
        } catch (e) {
          // Already collected or deleted
        }
      }, 60000);
    } catch (e) {
      console.error("[OreSpawnManager] Error spawning ore chunk:", e);
    }
  }

  private handleOreRemoval(controller: OreSpawnController) {
    const idKey = controller.oreIdKey;

    if (!idKey) {
      console.error("[OreSpawnManager] Cannot handle removal for controller with no ID Key!");
    } else {
      console.log(`[OreSpawnManager] Removing ore ID: ${idKey}`);
      this.entityToController.delete(idKey);
    }

    // Small delay before unloading
    this.async.setTimeout(() => {
      controller.unload().catch((e) => {
        console.error("[OreSpawnManager] Error unloading ore:", e);
      });
    }, 1000);

    // Remove from active list
    const idx = this.activeOres.indexOf(controller);
    if (idx >= 0) this.activeOres.splice(idx, 1);

    // Schedule respawn check
    const config = controller.config;
    if (config) {
      const respawnDelay = config.regenTimeMs;
      this.async.setTimeout(() => {
        if (this.isOwnedByMe()) {
          this.attemptSpawn(this.activeOres);
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

  private cleanupInactiveControllers(activeList: OreSpawnController[]) {
    const stillActive = activeList.filter((c) => c.isSpawned);
    if (stillActive.length !== activeList.length) {
      const activeIds = new Set(stillActive.map((c) => c.oreIdKey));
      const entries = Array.from(this.entityToController.entries());
      for (const [key, controller] of entries) {
        if (!activeIds.has(key)) {
          console.warn(`[OreSpawnManager] Cleaning up leaked controller reference: ${key}`);
          this.entityToController.delete(key);
          try {
            controller.dispose();
          } catch { }
        }
      }

      activeList.length = 0;
      activeList.push(...stillActive);
    }
  }

  private getAvailableSpawnLocation(spawnPoints: hz.Entity[]): hz.Entity | null {
    if (spawnPoints.length === 0) return null;

    // Shuffle to randomize spawn points
    const shuffled = [...spawnPoints];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Find first unoccupied location
    for (const loc of shuffled) {
      // Skip spawn points still on cooldown
      if (this.isLocationOnCooldown(loc)) continue;
      if (!this.isLocationOccupied(loc)) return loc;
    }

    return null; // All occupied
  }

  private isLocationOnCooldown(location: hz.Entity): boolean {
    const key = this.toIdKey((location as any)?.id);
    if (!key) return false;
    const until = this.locationCooldowns.get(key);
    if (!until) return false;
    if (Date.now() >= until) {
      this.locationCooldowns.delete(key);
      return false;
    }
    return true;
  }

  private isLocationOccupied(location: hz.Entity): boolean {
    const pos = location.position.get();
    const radius = 1.5; // Ores need less space than trees

    const near = (c: OreSpawnController) => {
      if (!c.isSpawned || !c.spawnPosition) return false;
      const s = c.spawnPosition;
      const d = Math.sqrt(
        (s.x - pos.x) ** 2 + (s.y - pos.y) ** 2 + (s.z - pos.z) ** 2
      );
      return d < radius;
    };

    for (const c of this.activeOres) if (near(c)) return true;
    return false;
  }

  private getScatteredPosition(base: hz.Vec3, radius: number): hz.Vec3 {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * radius;
    return new hz.Vec3(
      base.x + Math.cos(angle) * dist,
      base.y + 0.5,
      base.z + Math.sin(angle) * dist
    );
  }

  private isOwnedByMe(): boolean {
    const owner = this.entity.owner.get();
    const localPlayer = this.world.getLocalPlayer();
    return owner ? owner.id === localPlayer.id : false;
  }
}

hz.Component.register(OreSpawnManager);