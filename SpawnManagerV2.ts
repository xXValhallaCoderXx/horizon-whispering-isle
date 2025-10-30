import * as hz from 'horizon/core';
import { EventsService, SPAWNABLE_ITEMS, SpawnableItemConfig } from 'constants';

// Internal wrapper around SpawnController to track spawned entities and position
class ItemSpawnController {
  controller: hz.SpawnController;
  isSpawned = false;
  spawnPosition?: hz.Vec3;
  spawnedEntities: hz.Entity[] = [];
  // Track the spawn point entity used (for cooldowns)
  spawnLocation?: hz.Entity;

  constructor(controller: hz.SpawnController) {
    this.controller = controller;
  }

  async spawn(position: hz.Vec3): Promise<void> {
    if (this.isSpawned) return;
    await this.controller.load();
    await this.controller.spawn();
    this.isSpawned = true;
    this.spawnPosition = position;
    this.spawnedEntities = this.controller.rootEntities.get();
    // Make sure root is visible
    const root = this.spawnedEntities[0];
    try { root?.visible.set(true); } catch { }
  }

  getEntities(): hz.Entity[] {
    return this.spawnedEntities;
  }

  async unload(): Promise<void> {
    if (!this.isSpawned) return;
    try {
      await this.controller.unload();
    } catch (e) {
      console.error('[SpawnManagerV2] Error during controller.unload()', e);
    }
    this.isSpawned = false;
    this.spawnPosition = undefined;
    this.spawnedEntities = [];
  }

  dispose(): void {
    if (this.isSpawned) this.unload();
    try {
      this.controller.dispose();
    } catch (e) {
      console.error('[SpawnManagerV2] Error during controller.dispose()', e);
    }
  }
}

class SpawnManagerV2 extends hz.Component<typeof SpawnManagerV2> {
  static propsDefinition = {
    // Assets to spawn; rareAsset is optional and used based on SPAWNABLE_ITEMS[itemType].rareSpawnRate
    commonAsset: { type: hz.PropTypes.Asset },
    rareAsset: { type: hz.PropTypes.Asset },

    // Key into SPAWNABLE_ITEMS
    itemType: { type: hz.PropTypes.String, default: '' },


  };

  private spawnPoints: hz.Entity[] = [];
  private activeControllers: ItemSpawnController[] = [];

  // Mapping from any entity id within a spawned item -> its controller
  private entityToController: Map<string, ItemSpawnController> = new Map();

  // Cooldown per spawn point (entity id -> timestamp ms)
  private locationCooldowns: Map<string, number> = new Map();

  private config?: SpawnableItemConfig;
  private timer: number = 0;

  // Tune global cooldown scaling if needed
  private readonly RESPAWN_DELAY_MULTIPLIER = 1.0;

  // ---- Lifecycle ----

  preStart() {
    if (!this.isOwnedByMe()) return;

    const key = (this.props.itemType as string) || '';
    const cfg = SPAWNABLE_ITEMS[key];
    if (!cfg) {
      console.error(`[SpawnManagerV2] Unknown itemType '${key}' in SPAWNABLE_ITEMS`);
      return;
    }
    this.config = cfg;

    const containerName = 'SpawnLocations';
    this.spawnPoints = this.findUnderContainer(this.entity, containerName);

    this.connectNetworkBroadcastEvent(
      EventsService.AssetEvents.DestroyAsset,
      ({ entityId }: { entityId: any }) => this.onDestroyAssetRequest(entityId)
    );

    console.log(
      `[SpawnManagerV2] Ready. itemType=${key} spawnPoints=${this.spawnPoints.length} ` +
      `rate=${cfg.spawnRate}ms chance=${cfg.spawnChance} max=${cfg.maxActive} rare=${cfg.rareSpawnRate ?? 0}`
    );
  }

  start() {
    if (!this.isOwnedByMe() || !this.config) return;
    this.startSpawnTimer();
  }

  // ---- Timers ----

  private startSpawnTimer() {
    const tick = () => {
      try {
        if (this.config) this.attemptSpawn(this.config, this.activeControllers);
      } finally {
        const next = this.config?.spawnRate ?? 3000;
        this.timer = this.async.setTimeout(tick, next);
      }
    };
    tick();
  }

  // ---- Core spawn loop ----

  private attemptSpawn(config: SpawnableItemConfig, activeList: ItemSpawnController[]) {
    this.cleanupInactiveControllers(activeList);
    if (activeList.length >= (config.maxActive ?? 1)) return;
    if (this.spawnPoints.length === 0) return;

    // Spawn roll
    if (Math.random() > (config.spawnChance ?? 1.0)) return;

    const location = this.getAvailableSpawnLocation(this.spawnPoints);
    if (!location) return;

    this.createAndSpawn(config, location, activeList);
  }

  private createAndSpawn(
    config: SpawnableItemConfig,
    location: hz.Entity,
    activeList: ItemSpawnController[],
  ) {
    const position = location.position.get();
    const rotation = location.rotation.get();
    const scale = hz.Vec3.one;

    // Pick asset using SPAWNABLE_ITEMS rareSpawnRate
    const rareRate = Number(config.rareSpawnRate ?? 0);
    const useRare = !!this.props.rareAsset && rareRate > 0 && Math.random() < rareRate;

    const asset = (useRare ? (this.props.rareAsset as hz.Asset) : (this.props.commonAsset as hz.Asset));
    if (!asset) {
      console.error('[SpawnManagerV2] Missing asset. Provide commonAsset (and optional rareAsset).');
      return;
    }

    const controller = new hz.SpawnController(asset, position, rotation, scale);
    const wrapper = new ItemSpawnController(controller);
    wrapper.spawnLocation = location;

    wrapper.spawn(position)
      .then(() => {
        activeList.push(wrapper);

        // Index all spawned entities so any child id can be resolved
        for (const e of wrapper.getEntities()) {
          this.indexEntityTree(e, wrapper);
        }
      })
      .catch((e) => {
        console.error('[SpawnManagerV2] Failed to spawn item:', e);
        try { controller.dispose(); } catch { }
      });
  }

  // ---- Destroy / Collect handling ----

  private async onDestroyAssetRequest(entityId: any) {
    if (!this.isOwnedByMe()) return;

    const key = this.toIdKey(entityId);
    if (!key) return;

    const controller = this.entityToController.get(key);
    if (!controller) return;

    // Unindex BEFORE unloading
    for (const root of controller.getEntities()) {
      this.unindexEntityTree(root);
    }

    // Cooldown the used spawn location
    const loc = controller.spawnLocation;
    if (loc) {
      const locKey = this.toIdKey((loc as any).id);
      if (locKey) {
        const base = Math.max(500, Number(this.config?.spawnRate ?? 3000));
        const delay = Math.round(base * this.RESPAWN_DELAY_MULTIPLIER);
        this.locationCooldowns.set(locKey, Date.now() + delay);
      }
    }

    try {
      await controller.unload();
    } catch (e) {
      console.error('[SpawnManagerV2] Error unloading controller:', e);
    }

    const idx = this.activeControllers.indexOf(controller);
    if (idx >= 0) this.activeControllers.splice(idx, 1);
  }

  // ---- Utils ----

  private getAvailableSpawnLocation(spawnPoints: hz.Entity[]): hz.Entity | null {
    if (spawnPoints.length === 0) return null;

    // Shuffle copy
    const shuffled = [...spawnPoints];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    for (const loc of shuffled) {
      if (this.isLocationOnCooldown(loc)) continue;
      if (!this.isLocationOccupied(loc)) return loc;
    }
    return null;
  }

  private isLocationOccupied(location: hz.Entity): boolean {
    const pos = location.position.get();
    const radius = 1.0;
    for (const c of this.activeControllers) {
      if (!c.isSpawned || !c.spawnPosition) continue;
      const s = c.spawnPosition;
      const d = Math.hypot(s.x - pos.x, s.y - pos.y, s.z - pos.z);
      if (d < radius) return true;
    }
    return false;
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

  private findUnderContainer(root: hz.Entity, containerName: string): hz.Entity[] {
    try {
      const containers = (root.children.get() || []).filter(e => e.name.get() === containerName);
      if (containers.length === 0) return [];
      const children: hz.Entity[] = [];
      for (const c of containers) children.push(...(c.children.get() || []));
      return children;
    } catch {
      return [];
    }
  }

  private cleanupInactiveControllers(activeList: ItemSpawnController[]) {
    const stillActive = activeList.filter(c => c.isSpawned);
    if (stillActive.length !== activeList.length) {
      // Dispose leaked controllers
      for (const c of activeList) {
        if (!c.isSpawned) {
          try { c.dispose(); } catch { }
        }
      }
      // Rebuild index for still-active
      this.entityToController.clear();
      for (const c of stillActive) {
        for (const e of c.getEntities()) this.indexEntityTree(e, c);
      }
      activeList.length = 0;
      activeList.push(...stillActive);
    }
  }

  private indexEntityTree(entity: hz.Entity, controller: ItemSpawnController) {
    const key = this.toIdKey((entity as any)?.id);
    if (key) this.entityToController.set(key, controller);
    const kids = entity.children.get() || [];
    for (const k of kids) this.indexEntityTree(k, controller);
  }

  private unindexEntityTree(entity: hz.Entity) {
    const key = this.toIdKey((entity as any)?.id);
    if (key) this.entityToController.delete(key);
    const kids = entity.children.get() || [];
    for (const k of kids) this.unindexEntityTree(k);
  }

  private toIdKey(id: unknown): string | null {
    const t = typeof id;
    if (t === 'string') return id as string;
    if (t === 'number') return String(id as number);
    if (t === 'bigint') return (id as bigint).toString();
    return null;
  }

  private isOwnedByMe(): boolean {
    const owner = this.entity.owner.get();
    const localPlayer = this.world.getLocalPlayer();
    return owner ? owner.id === localPlayer.id : false;
  }
}

hz.Component.register(SpawnManagerV2);