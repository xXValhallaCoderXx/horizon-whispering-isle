import * as hz from "horizon/core";
import { ITEMS } from "constants";
import { EventsService } from "constants";

interface ItemConfig {
  asset: hz.Asset; // ✅ Normal version asset (has CollectibleItem script)
  rareAsset?: hz.Asset; // ✅ Optional rare version asset
  itemType: string; // 'Coconut', 'Wood', 'Stone', etc.
  itemLabel: string; // Display name
  spawnRate: number; // seconds between attempts
  spawnChance: number; // 0..1 per attempt
  maxActive: number; // capacity
  rareChance?: number; // chance to use rareAsset
}

class SpawnManager extends hz.Component<typeof SpawnManager> {
  static propsDefinition = {
    commonAsset: { type: hz.PropTypes.Asset },
    rareAsset: { type: hz.PropTypes.Asset },
    itemType: { type: hz.PropTypes.String, default: "" },
  };

  private spawnPoints: hz.Entity[] = [];
  private activeItems: ItemSpawnController[] = [];
  private timer: number = 0;
  private spawnConfig: ItemConfig | undefined = undefined;

  // Mapping from entity id (string) -> controller. We normalize to string to handle bigint/number differences.
  private entityToController: Map<string, ItemSpawnController> = new Map();

  // Helper to normalize any entity id shape into a stable string key
  private toIdKey(id: unknown): string | null {
    // Horizon Entity.id is bigint per typings; callers may pass number. Normalize to string.
    const t = typeof id;
    if (t === "string") return id as string;
    if (t === "number") return String(id as number);
    if (t === "bigint") return (id as bigint).toString();
    return null;
  }

  preStart() {
    this.spawnPoints = this.findUnderContainer(this.entity, "SpawnLocations");

    // TODO Listen to destroy assets and remove from activeItems and entityToController
    this.connectNetworkBroadcastEvent(
      EventsService.AssetEvents.DestroyAsset,
      // Accept number|string for safety; we normalize internally.
      ({ entityId }: { entityId: any }) => this.onDestroyAssetRequest(entityId)
    );






    const commonAsset = this.props.commonAsset as hz.Asset | undefined;
    if (!commonAsset) {
      console.error(
        "[CollectibleSpawnManager] Missing commonAsset - Ensure its set with its script attached"
      );
      return;
    }

    const item = ITEMS[this.props.itemType as keyof typeof ITEMS];

    this.spawnConfig = {
      asset: commonAsset,
      rareAsset: this.props.rareAsset as hz.Asset | undefined,
      itemType: item.type,
      itemLabel: item.label,
      spawnRate: item.spawnRate,
      spawnChance: item.spawnChance,
      maxActive: item.maxActive,
      rareChance: item.rareSpawnRate || 0,
    };
  }

  start() {
    this.startSpawnTimerForCoconuts()

  }

  // ---- Timers ----
  private startSpawnTimerForCoconuts() {

    const tick = () => {
      // console.log("[CollectibleSpawnManager] Spawn timer tick", this.spawnConfig);
      const cfg = this.spawnConfig;
      if (cfg) {
        this.attemptSpawn(cfg, this.activeItems, cfg.itemLabel);
      }
      const delayMs = this.spawnConfig?.spawnRate ?? 3000;
      this.timer = this.async.setTimeout(tick, delayMs);
    };

    tick(); // immediate first attempt
  }

  // ---- Core spawn loop ----
  private attemptSpawn(
    config: ItemConfig,
    activeList: ItemSpawnController[],
    label: string
  ) {
    this.cleanupInactiveControllers(activeList);

    if (activeList.length >= config.maxActive) {
      // console.log(`[CollectibleSpawnManager] ${label} at capacity ${activeList.length}/${config.maxActive}`);
      return;
    }

    const roll = Math.random();
    if (roll > config.spawnChance) {
      // console.log(`[CollectibleSpawnManager] ${label} spawn chance failed (${roll.toFixed(2)} > ${config.spawnChance})`);
      return;
    }

    const location = this.getAvailableSpawnLocation();
    if (!location) return;

    this.createAndSpawn(config, location, activeList, label);
  }

  private findUnderContainer(
    root: hz.Entity,
    containerName: string
  ): hz.Entity[] {
    const containers = (root.children.get() || []).filter(
      (e) => e.name.get() === containerName
    );
    if (containers.length === 0) return [];
    const children: hz.Entity[] = [];
    for (const c of containers) children.push(...(c.children.get() || []));
    return children;
  }

  private cleanupInactiveControllers(activeList: ItemSpawnController[]) {
    const stillActive = activeList.filter((c) => c.isSpawned);
    if (stillActive.length !== activeList.length) {
      activeList.length = 0;
      activeList.push(...stillActive);
    }
  }

  private createAndSpawn(
    config: ItemConfig,
    location: hz.Entity,
    activeList: ItemSpawnController[],
    label: string
  ) {
    const position = location.position.get();
    const rotation = location.rotation.get();
    const scale = hz.Vec3.one;

    // Pick normal vs rare
    const useRare =
      !!config.rareAsset &&
      !!config.rareChance &&
      Math.random() < config.rareChance;
    const asset = useRare ? (config.rareAsset as hz.Asset) : config.asset;

    const controller = new hz.SpawnController(asset, position, rotation, scale);
    const wrapper = new ItemSpawnController(controller);

    wrapper
      .spawn(position)
      .then(() => {
        activeList.push(wrapper);
        // Index all spawned root entities and their descendants to this controller
        const spawned = wrapper.getEntities();
        for (const e of spawned) {
          this.indexEntityTree(e, wrapper);
        }

        const p = wrapper.spawnPosition!;
        console.log(
          `[CollectibleSpawnManager] Spawned ${useRare ? "RARE " : ""
          }${label} at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(
            1
          )})  Active=${activeList.length}/${config.maxActive}`
        );
      })
      .catch((e) => {
        console.error("[CollectibleSpawnManager] Failed to spawn", label, e);
        try {
          controller.dispose();
        } catch { }
      });
  }

  private getAvailableSpawnLocation(): hz.Entity | null {
    const locations = this.findUnderContainer(this.entity, "SpawnLocations");
    if (locations.length === 0) return null;

    // shuffle
    for (let i = locations.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [locations[i], locations[j]] = [locations[j], locations[i]];
    }

    for (const loc of locations) {
      if (!this.isLocationOccupied(loc)) return loc;
    }
    return null;
  }

  private isLocationOccupied(location: hz.Entity): boolean {
    const pos = location.position.get();
    const radius = 1.0;

    const near = (c: ItemSpawnController) => {
      if (!c.isSpawned || !c.spawnPosition) return false;
      const s = c.spawnPosition;
      const d = Math.sqrt(
        (s.x - pos.x) ** 2 + (s.y - pos.y) ** 2 + (s.z - pos.z) ** 2
      );
      return d < radius;
    };

    for (const c of this.activeItems) if (near(c)) return true;
    return false;
  }



  private async onDestroyAssetRequest(entityId: any) {
    const key = this.toIdKey(entityId);
    console.log(`[CollectibleSpawnManager] Destroy request for entityId=${entityId} (key=${key})`);
    if (!key) {
      console.warn(`[CollectibleSpawnManager] Destroy request: unsupported id type: ${typeof entityId}`);
      return;
    }
    const controller = this.entityToController.get(key);
    if (!controller) {
      console.warn(`[CollectibleSpawnManager] Destroy request: unknown entityId=${entityId}`);
      return;
    }

    // Unindex all root entities and their descendants for this controller BEFORE unloading
    for (const root of controller.getEntities()) {
      this.unindexEntityTree(root);
    }

    // Unload and clean up this controller
    try {
      await controller.unload();
    } catch (e) {
      this.world.ui.showPopupForEveryone(`Error unloading entityId=${entityId}`, 2);
      console.error("[CollectibleSpawnManager] Error unloading controller:", e);
    }

    // Remove from active list
    const idx = this.activeItems.indexOf(controller);
    if (idx >= 0) this.activeItems.splice(idx, 1);

    this.world.ui.showPopupForEveryone(`Item destoyed!`, 2);

    // Optionally trigger a spawn attempt now (capacity freed); or let the timer tick do it
    const cfg = this.spawnConfig;
    if (cfg) {
      this.attemptSpawn(cfg, this.activeItems, cfg.itemLabel);
    }
  }

  private unindexEntityTree(entity: hz.Entity): void {
    const id = (entity as any)?.id;
    const key = this.toIdKey(id);
    if (key) {
      this.entityToController.delete(key);
    }
    const children = entity.children.get() ?? [];
    for (const child of children) this.unindexEntityTree(child);
  }

  private indexEntityTree(entity: hz.Entity, controller: ItemSpawnController): void {
    const id = (entity as any)?.id;
    const key = this.toIdKey(id);
    if (key) {
      this.entityToController.set(key, controller);
    }
    const children = entity.children.get() ?? [];
    for (const child of children) this.indexEntityTree(child, controller);
  }
}

// Internal wrapper around SpawnController to track spawned entities and position
class ItemSpawnController {
  controller: hz.SpawnController;
  isSpawned = false;
  spawnPosition?: hz.Vec3;
  spawnedEntities: hz.Entity[] = [];

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
  }

  getEntities(): hz.Entity[] {
    return this.spawnedEntities;
  }

  async unload(): Promise<void> {
    if (!this.isSpawned) return;
    await this.controller.unload();
    this.isSpawned = false;
    this.spawnPosition = undefined;
    this.spawnedEntities = [];
  }

  dispose(): void {
    if (this.isSpawned) this.unload();
    this.controller.dispose();
  }
}

hz.Component.register(SpawnManager);
