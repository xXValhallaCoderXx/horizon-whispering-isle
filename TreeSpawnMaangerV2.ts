import * as hz from 'horizon/core';
import { EventsService, TREE_TYPES, TREE_RARITY, HarvestableTreeConfig } from 'constants';

// Internal wrapper class to track spawned tree state
class TreeSpawnController {
  controller: hz.SpawnController;
  isSpawned = false;
  spawnPosition?: hz.Vec3;
  spawnedEntities: hz.Entity[] = [];
  spawnLocation?: hz.Entity;

  // Server-side state ONLY
  maxHealth = 0;
  currentHealth = 0;
  treeRarity: string = '';
  treeIdKey: string | null = null;
  config: HarvestableTreeConfig | null = null;

  constructor(controller: hz.SpawnController) {
    this.controller = controller;
  }

  getRootEntity(): hz.Entity | null {
    if (!this.isSpawned || this.spawnedEntities.length === 0) return null;
    return this.spawnedEntities[0];
  }

  static toIdKey(id: unknown): string | null {
    const t = typeof id;
    if (t === 'string') return id as string;
    if (t === 'number') return String(id as number);
    if (t === 'bigint') return (id as bigint).toString();
    return null;
  }

  async spawn(position: hz.Vec3, initData: { health: number; treeRarity: string; config: HarvestableTreeConfig }): Promise<void> {
    if (this.isSpawned) return;
    await this.controller.load();
    await this.controller.spawn();
    this.isSpawned = true;
    this.spawnPosition = position;
    this.spawnedEntities = this.controller.rootEntities.get();

    const root = this.getRootEntity();
    if (!root) {
      console.error('[TreeSpawnMaangerV2] Spawned tree root entity not found!');
      await this.unload();
      return;
    }

    this.treeIdKey = TreeSpawnController.toIdKey((root as any).id);
    try {
      this.maxHealth = initData.health;
      this.currentHealth = initData.health;
      this.treeRarity = initData.treeRarity;
      this.config = initData.config;

      root.visible.set(true);
    } catch (e) {
      console.error('[TreeSpawnMaangerV2] Failed to init tree:', e);
      await this.unload();
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
      console.error('[TreeSpawnMaangerV2] Error during controller.unload()', e);
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
      console.error('[TreeSpawnMaangerV2] Error during controller.dispose()', e);
    }
  }
}

class TreeSpawnMaangerV2 extends hz.Component<typeof TreeSpawnMaangerV2> {
  static propsDefinition = {
    commonTreeAsset: { type: hz.PropTypes.Asset },
    rareTreeAsset: { type: hz.PropTypes.Asset },
    legendaryTreeAsset: { type: hz.PropTypes.Asset },
    woodLogAsset: { type: hz.PropTypes.Asset },
  };

  // Tweakable pacing
  private readonly RESPAWN_DELAY_MULTIPLIER = 1.5;

  // Cooldown per spawn point (entity id -> timestamp ms)
  private locationCooldowns: Map<string, number> = new Map();

  // Separate spawn locations per rarity
  private commonSpawnPoints: hz.Entity[] = [];
  private rareSpawnPoints: hz.Entity[] = [];
  private legendarySpawnPoints: hz.Entity[] = [];

  private activeTrees: TreeSpawnController[] = [];
  private timer: number = 0;

  // Mapping from tree entity id -> controller
  private entityToController: Map<string, TreeSpawnController> = new Map();

  // Spawn chance per tick for each rarity
  private readonly SPAWN_CHANCES = {
    [TREE_RARITY.COMMON]: 0.8,
    [TREE_RARITY.RARE]: 0.4,
    [TREE_RARITY.LEGENDARY]: 0.15,
  };

  private toIdKey(id: unknown): string | null {
    return TreeSpawnController.toIdKey(id);
  }

  preStart() {
    // Only the server should manage spawning
    if (!this.isOwnedByMe()) return;

    // Find spawn locations by rarity (same containers as Ore)
    this.commonSpawnPoints = this.findUnderContainer(this.entity, 'CommonSpawnLocations');
    this.rareSpawnPoints = this.findUnderContainer(this.entity, 'RareSpawnLocations');
    this.legendarySpawnPoints = this.findUnderContainer(this.entity, 'LegendarySpawnLocations');

    console.log(
      `[TreeSpawnMaangerV2] Found spawn points - Common: ${this.commonSpawnPoints.length}, ` +
      `Rare: ${this.rareSpawnPoints.length}, Legendary: ${this.legendarySpawnPoints.length}`
    );

    // Listen for tree hit requests from clients
    this.connectNetworkBroadcastEvent(
      EventsService.HarvestEvents.RequestTreeHit,
      (data: any) => this.onTreeHitRequest(data)
    );
  }

  start() {
    if (this.isOwnedByMe()) {
      this.startSpawnTimer();
    }
  }

  private startSpawnTimer() {
    const tick = () => {
      this.attemptSpawn(this.activeTrees);
      // Check every 3s (match Ore)
      this.timer = this.async.setTimeout(tick, 3000);
    };
    tick();
  }

  private attemptSpawn(activeList: TreeSpawnController[]) {
    this.cleanupInactiveControllers(activeList);

    this.attemptSpawnRarity(TREE_RARITY.COMMON, this.commonSpawnPoints, activeList);
    this.attemptSpawnRarity(TREE_RARITY.RARE, this.rareSpawnPoints, activeList);
    this.attemptSpawnRarity(TREE_RARITY.LEGENDARY, this.legendarySpawnPoints, activeList);
  }

  private attemptSpawnRarity(
    rarity: TREE_RARITY,
    spawnPoints: hz.Entity[],
    activeList: TreeSpawnController[]
  ) {
    if (spawnPoints.length === 0) return;

    const location = this.getAvailableSpawnLocation(spawnPoints);
    if (!location) return;

    const spawnChance = this.SPAWN_CHANCES[rarity] || 1.0;
    if (Math.random() > spawnChance) return;

    const config = TREE_TYPES[rarity];
    if (!config) {
      console.error(`[TreeSpawnMaangerV2] Unknown tree rarity: ${rarity}`);
      return;
    }

    this.createAndSpawn(rarity, config, location, activeList);
  }

  private createAndSpawn(
    rarity: TREE_RARITY,
    config: HarvestableTreeConfig,
    location: hz.Entity,
    activeList: TreeSpawnController[]
  ) {
    const position = location.position.get();
    const rotation = location.rotation.get();

    // Select asset by rarity
    let asset: hz.Asset | undefined;
    switch (rarity) {
      case TREE_RARITY.COMMON:
        asset = this.props.commonTreeAsset as hz.Asset;
        break;
      case TREE_RARITY.RARE:
        asset = this.props.rareTreeAsset as hz.Asset;
        break;
      case TREE_RARITY.LEGENDARY:
        asset = this.props.legendaryTreeAsset as hz.Asset;
        break;
    }

    if (!asset) {
      console.error(`[TreeSpawnMaangerV2] No asset configured for ${rarity} tree`);
      return;
    }

    const controller = new hz.SpawnController(asset, position, rotation, hz.Vec3.one);
    const wrapper = new TreeSpawnController(controller);
    wrapper.spawnLocation = location;

    // Randomize health within range
    const cfg = config as any;
    const minH = Number.isFinite(cfg?.minHealth) ? Number(cfg.minHealth) : Number(cfg?.maxHealth ?? 100);
    const maxH = Number.isFinite(cfg?.maxHealth) ? Number(cfg.maxHealth) : minH;
    const health = Math.floor(Math.random() * (Math.max(maxH - minH, 0) + 1) + minH);


    const initData = {
      health,
      treeRarity: rarity,
      config,
    };

    wrapper.spawn(position, initData).then(() => {
      if (!wrapper.isSpawned || !wrapper.treeIdKey) {
        console.warn('[TreeSpawnMaangerV2] Wrapper failed to spawn or get ID, bailing.');
        wrapper.dispose();
        return;
      }
      activeList.push(wrapper);
      this.entityToController.set(wrapper.treeIdKey, wrapper);

      console.log(
        `[TreeSpawnMaangerV2] Spawned ${rarity} tree at ${position}, ID: ${wrapper.treeIdKey}, Health: ${health}`
      );
    }).catch((e) => {
      console.error('[TreeSpawnMaangerV2] Failed to spawn tree', e);
      wrapper.dispose();
    });
  }

  // ---- Tree Hit Handler (Server-Side) ----
  private onTreeHitRequest(data: any) {
    const { player, treeEntity, toolType, hitPosition } = data || {};

    const treeId = (treeEntity as any)?.id;
    const key = this.toIdKey(treeId);
    if (!key) return;

    const controller = this.entityToController.get(key);
    if (!controller || !controller.isSpawned || !controller.config) return;

    const cfg = controller.config as any;

    // Validate tool (optional)
    if (cfg?.toolType && toolType && toolType !== cfg.toolType) {
      console.error(`[TreeSpawnMaangerV2] Wrong tool: ${toolType} (need ${cfg.toolType})`);
      return;
    }
    // Damage roll
    const minD = Number.isFinite(cfg?.minDamagePerHit) ? Number(cfg.minDamagePerHit) : 1;
    const maxD = Number.isFinite(cfg?.maxDamagePerHit) ? Number(cfg.maxDamagePerHit) : 3;
    const damage = Math.floor(Math.random() * (Math.max(maxD - minD, 0) + 1) + minD);


    controller.currentHealth -= damage;
    if (controller.currentHealth < 0) controller.currentHealth = 0;

    // Broadcast hit confirmation
    this.sendNetworkBroadcastEvent(EventsService.HarvestEvents.TreeHit, {
      player,
      treeEntity,
      hitPosition,
      healthRemaining: controller.currentHealth,
    });

    // Depleted?
    if (controller.currentHealth <= 0) {
      this.handleTreeDepletion(controller, player, hitPosition);
    }
  }

  private handleTreeDepletion(controller: TreeSpawnController, player: hz.Player, position: hz.Vec3) {
    const config = controller.config;
    if (!config) return;

    // Put used spawn point on cooldown (scaled)
    const loc = controller.spawnLocation;
    const locKey = loc ? this.toIdKey((loc as any).id) : null;
    if (locKey) {
      const delay = Math.round(config.regenTimeMs * this.RESPAWN_DELAY_MULTIPLIER);
      this.locationCooldowns.set(locKey, Date.now() + delay);
    }

    console.log(`[TreeSpawnMaangerV2] Tree depleted! Rarity: ${controller.treeRarity}`);

    // Broadcast depletion event
    this.sendNetworkBroadcastEvent(EventsService.HarvestEvents.TreeDepleted, {
      player,
      treeEntity: controller.getRootEntity(),
      position,
    });

    // Drops on depletion
    this.handleWoodDrops(position, config);

    // Remove from world
    this.handleTreeRemoval(controller);
  }

  private handleWoodDrops(center: hz.Vec3, config: HarvestableTreeConfig) {
    const dropChance = (config as any).dropChanceOnDepletion ?? (config as any).dropChance ?? 0.8;
    const minDrops = (config as any).minDropsOnDepletion ?? (config as any).minDrops ?? 1;
    const maxDrops = (config as any).maxDropsOnDepletion ?? (config as any).maxDrops ?? 3;

    if (Math.random() > dropChance) return;

    const numDrops = Math.floor(Math.random() * (maxDrops - minDrops + 1)) + minDrops;
    for (let i = 0; i < numDrops; i++) {
      const offsetPos = this.getScatteredPosition(center, 1.25);
      this.spawnWoodLog(offsetPos);
    }
  }

  private async spawnWoodLog(position: hz.Vec3) {
    const woodAsset = this.props.woodLogAsset as hz.Asset | undefined;
    if (!woodAsset) {
      console.warn('[TreeSpawnMaangerV2] No wood log asset configured!');
      return;
    }

    try {
      const spawned = await this.world.spawnAsset(woodAsset, position);
      if (!spawned || spawned.length === 0) return;

      const log = spawned[0];
      log.interactionMode.set(hz.EntityInteractionMode.Both);
      log.collidable.set(true);

      // Add a small impulse after a short delay
      this.async.setTimeout(() => {
        const phys = log.as(hz.PhysicalEntity);
        if (!phys) return;

        const angle = Math.random() * Math.PI * 2;
        const offsetX = Math.cos(angle) * 0.7;
        const offsetZ = Math.sin(angle) * 0.7;
        const velocityMag = 2.5 + Math.random() * 1.5;
        const velocity = new hz.Vec3(offsetX, 1, offsetZ).normalize().mul(velocityMag);
        phys.applyForce(velocity, hz.PhysicsForceMode.VelocityChange);

        const angularMag = 1 + Math.random() * 6;
        const torque = new hz.Vec3(
          (Math.random() - 0.5) * angularMag,
          (Math.random() - 0.5) * angularMag,
          (Math.random() - 0.5) * angularMag
        );
        phys.applyTorque(torque);
      }, 400);

      // Auto-despawn after 60s
      this.async.setTimeout(() => {
        try { this.world.deleteAsset(log); } catch { }
      }, 60000);
    } catch (e) {
      console.error('[TreeSpawnMaangerV2] Error spawning wood log:', e);
    }
  }

  private handleTreeRemoval(controller: TreeSpawnController) {
    const idKey = controller.treeIdKey;
    if (idKey) this.entityToController.delete(idKey);

    // Slight delay before unloading
    this.async.setTimeout(() => {
      controller.unload().catch(e => console.error('[TreeSpawnMaangerV2] Error unloading tree:', e));
    }, 1000);

    const idx = this.activeTrees.indexOf(controller);
    if (idx >= 0) this.activeTrees.splice(idx, 1);

    // Schedule respawn check using regenTimeMs
    const cfg = controller.config;
    if (cfg) {
      const respawnDelay = Math.max(0, Number(cfg.regenTimeMs) || 30000);
      this.async.setTimeout(() => {
        if (this.isOwnedByMe()) this.attemptSpawn(this.activeTrees);
      }, respawnDelay);
    }
  }

  // ---- Utility ----

  private findUnderContainer(root: hz.Entity, containerName: string): hz.Entity[] {
    const containers = (root.children.get() || []).filter(e => e.name.get() === containerName);
    if (containers.length === 0) return [];
    const children: hz.Entity[] = [];
    for (const c of containers) children.push(...(c.children.get() || []));
    return children;
  }

  private cleanupInactiveControllers(activeList: TreeSpawnController[]) {
    const stillActive = activeList.filter(c => c.isSpawned);
    if (stillActive.length !== activeList.length) {
      const activeIds = new Set(stillActive.map(c => c.treeIdKey));
      const entries = Array.from(this.entityToController.entries());
      for (const [key, controller] of entries) {
        if (!activeIds.has(key)) {
          console.warn(`[TreeSpawnMaangerV2] Cleaning up leaked controller reference: ${key}`);
          this.entityToController.delete(key);
          try { controller.dispose(); } catch { }
        }
      }
      activeList.length = 0;
      activeList.push(...stillActive);
    }
  }

  private getAvailableSpawnLocation(spawnPoints: hz.Entity[]): hz.Entity | null {
    if (spawnPoints.length === 0) return null;

    // Shuffle
    const shuffled = [...spawnPoints];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // First unoccupied and not on cooldown
    for (const loc of shuffled) {
      if (this.isLocationOnCooldown(loc)) continue;
      if (!this.isLocationOccupied(loc)) return loc;
    }
    return null;
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
    const radius = 2.0; // trees need more space

    const near = (c: TreeSpawnController) => {
      if (!c.isSpawned || !c.spawnPosition) return false;
      const s = c.spawnPosition;
      const d = Math.sqrt((s.x - pos.x) ** 2 + (s.y - pos.y) ** 2 + (s.z - pos.z) ** 2);
      return d < radius;
    };

    for (const c of this.activeTrees) if (near(c)) return true;
    return false;
  }

  private getScatteredPosition(base: hz.Vec3, radius: number): hz.Vec3 {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * radius;
    return new hz.Vec3(base.x + Math.cos(angle) * dist, base.y + 0.6, base.z + Math.sin(angle) * dist);
  }

  private isOwnedByMe(): boolean {
    const owner = this.entity.owner.get();
    const localPlayer = this.world.getLocalPlayer();
    return owner ? owner.id === localPlayer.id : false;
  }
}

hz.Component.register(TreeSpawnMaangerV2);