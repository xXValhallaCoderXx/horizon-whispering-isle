import * as hz from 'horizon/core';
import { EventsService } from 'constants';
import { LootTableConfig, ItemConfig, MONSTERS, ITEMS, ITEM_TYPES } from 'constants';
const DEBUG_LOOT = true;

interface LootRollResult {
  itemId: string;
  quantity: number;
}


class LootDropManager extends hz.Component<typeof LootDropManager> {
  static propsDefinition = {
    coin: { type: hz.PropTypes.Asset },
    feather: { type: hz.PropTypes.Asset },
    gem_small: { type: hz.PropTypes.Asset },
    coconut: { type: hz.PropTypes.Asset },
    chicken_meat: { type: hz.PropTypes.Asset },
  };

  start() {
    this.connectNetworkBroadcastEvent(
      EventsService.CombatEvents.MonsterDied,
      (payload) => this.onMonsterDeath(payload)
    );

    this.connectNetworkBroadcastEvent(
      EventsService.AssetEvents.DestroyAsset,
      ({ entityId, player }: { entityId: any; player: hz.Player }) => {
        this.onDestroyLootItem(entityId, player);
      }
    );
  }

  private async onDestroyLootItem(entityId: any, player?: hz.Player) {
    const key = typeof entityId === 'string' ? entityId :
      typeof entityId === 'bigint' ? entityId.toString() :
        String(entityId);

    console.log(`[LootDropManager] Destroy request for loot item: ${key}`);

    try {
      const idBig = typeof entityId === 'bigint' ? entityId : BigInt(entityId);
      const entity = new hz.Entity(idBig);

      // Delete the entity
      await this.world.deleteAsset(entity);
      console.log(`[LootDropManager] Successfully destroyed loot item: ${key}`);
    } catch (e) {
      console.warn(`[LootDropManager] Failed to destroy entity ${key}:`, e);
    }
  }


  private onMonsterDeath(payload: {
    monsterId: string;
    killerId?: string;
    position?: hz.Vec3
  }) {
    if (DEBUG_LOOT) {
      console.log(`[LootDropManager] Monster died: ${payload.monsterId}`);
    }

    // Resolve monster type from EnemySpawnManager or payload
    const monsterType = this.resolveMonsterType(payload.monsterId);
    if (!monsterType) {
      console.warn(`[LootDropManager] Could not resolve monster type for ${payload.monsterId}`);
      return;
    }

    // Get monster config
    const monsterConfig = MONSTERS[monsterType];
    if (!monsterConfig || !monsterConfig.lootTable) {
      // No loot table configured - silent return
      return;
    }

    const lootTable = monsterConfig.lootTable;
    const deathPosition = payload.position || new hz.Vec3(0, 1, 0);

    // 1. Start with guaranteed drops
    const results: LootRollResult[] = [];
    if (lootTable.guaranteedDrops) {
      lootTable.guaranteedDrops.forEach(itemId => {
        results.push({ itemId, quantity: 1 });
      });
    }

    // 2. Roll for probabilistic drops
    const rolledItems = this.rollForLoot(lootTable);
    results.push(...rolledItems);

    // 3. Enforce spawn cap
    const cap = lootTable.spawnCountCap || 12;
    const totalToSpawn = Math.min(
      results.reduce((sum, r) => sum + r.quantity, 0),
      cap
    );

    if (DEBUG_LOOT) {
      console.log(`[LootDropManager] Rolling ${results.length} item types, ${totalToSpawn} total items`);
    }

    // 4. Spawn each item
    let spawnedCount = 0;
    for (const result of results) {

      const itemConfig = ITEMS[result.itemId];
      if (!itemConfig) {
        console.warn(`[LootDropManager] Item ${result.itemId} not found or missing asset`);
        continue;
      }

      for (let i = 0; i < result.quantity && spawnedCount < totalToSpawn; i++) {
        this.spawnLootItem(itemConfig, deathPosition, lootTable);
        spawnedCount++;
      }
    }

    if (DEBUG_LOOT) {
      console.log(`[LootDropManager] Spawned ${spawnedCount} items at ${deathPosition}`);
    }
  }

  private rollForLoot(config: LootTableConfig): LootRollResult[] {
    const results: Map<string, number> = new Map();

    if (config.dropMode === 'multiple') {
      // Roll each entry independently
      for (const entry of config.entries) {
        const roll = Math.random();
        if (roll < entry.dropChance) {
          const min = entry.minQuantity || 1;
          const max = entry.maxQuantity || 1;
          const quantity = Math.floor(Math.random() * (max - min + 1)) + min;

          // Coalesce quantities for same item
          const existing = results.get(entry.itemId) || 0;
          results.set(entry.itemId, existing + quantity);
        }
      }
    } else if (config.dropMode === 'single') {
      // Weighted single pick
      const totalWeight = config.entries.reduce((sum, e) => sum + e.dropChance, 0);
      const noDropChance = config.noDropChance ?? Math.max(0, 1 - totalWeight);

      const roll = Math.random();
      let cumulativeWeight = 0;

      // Check no-drop first
      if (roll < noDropChance) {
        return []; // No drop
      }

      // Weighted pick
      cumulativeWeight = noDropChance;
      for (const entry of config.entries) {
        cumulativeWeight += entry.dropChance;
        if (roll < cumulativeWeight) {
          const min = entry.minQuantity || 1;
          const max = entry.maxQuantity || 1;
          const quantity = Math.floor(Math.random() * (max - min + 1)) + min;
          results.set(entry.itemId, quantity);
          break;
        }
      }
    }

    // Convert map to array
    return Array.from(results.entries()).map(([itemId, quantity]) => ({
      itemId,
      quantity
    }));
  }

  private async spawnLootItem(
    itemConfig: ItemConfig,
    centerPosition: hz.Vec3,
    config: LootTableConfig
  ) {
    const scatterRadius = config.scatterRadius || 0.5; // Reduced from 1.25
    const pluckHeight = config.pluckHeight || 0.3; // Reduced from 0.5
    const autoDespawn = config.autoDespawnSeconds || 60;

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

    // Spawn the item
    const spawnAsset = this.mapAssetsToItems(itemConfig.id)

    if (!spawnAsset) {
      console.warn(`[LootDropManager] No mapped asset for item ${itemConfig.id}`);
      return;
    }
    const spawnedEntities = await this.world.spawnAsset(
      spawnAsset,
      spawnPosition
    );

    if (spawnedEntities.length === 0) {
      console.warn(`[LootDropManager] Failed to spawn ${itemConfig.id}`);
      return;
    }

    const item = spawnedEntities[0];

    // Ensure interaction mode is set
    item.interactionMode.set(hz.EntityInteractionMode.Both);

    // Keep collision enabled from the start
    item.collidable.set(true);

    // Apply physics after short delay
    this.async.setTimeout(() => {


      const physicalItem = item.as(hz.PhysicalEntity);
      if (physicalItem) {
        // Launch velocity (reduced to 3-5 units, less vertical)
        const velocityMag = 3 + Math.random() * 2; // Reduced from 7-10
        const velocity = new hz.Vec3(offsetX, 1, offsetZ).normalize().mul(velocityMag); // Reduced Y from 2 to 1
        physicalItem.applyForce(velocity, hz.PhysicsForceMode.VelocityChange);


        // Angular velocity (spin) - reduced
        const angularMag = 1 + Math.random() * 9; // Reduced from 1-20 to 1-10
        const torque = new hz.Vec3(
          (Math.random() - 0.5) * angularMag,
          (Math.random() - 0.5) * angularMag,
          (Math.random() - 0.5) * angularMag
        );
        physicalItem.applyTorque(torque);
      }
    }, 500); 

    // Auto-despawn
    this.async.setTimeout(() => {
      try {
        this.world.deleteAsset(item);
      } catch (e) {
        // Already collected or deleted
      }
    }, autoDespawn * 1000);
  }

  private resolveMonsterType(monsterId: string): string | null {
    // Option 1: If EnemySpawnManager tracks type per ID, query it
    // Option 2: Parse from payload if it includes monsterType
    // Option 3: Lookup from a maintained registry

    // For hackathon, simplest approach:
    // Assume all current monsters are CHICKEN (expand as needed)
    return 'CHICKEN';

    // TODO: Extend EnemySpawnManager to broadcast monsterType in payload
    // or maintain a server-side registry: Map<monsterId, monsterType>
  }

  private mapAssetsToItems(_item: string): hz.Asset | null {
    // Map each prop asset to its corresponding ITEMS entry
    if (_item === ITEM_TYPES.COIN && this.props.coin) {
      return this.props.coin
    }

    if (_item === ITEM_TYPES.FEATHER && this.props.feather) {
      return this.props.feather
    }

    if (_item === ITEM_TYPES.GEM_SMALL && this.props.gem_small) {
      return this.props.gem_small
    }

    if (_item === ITEM_TYPES.CHICKEN_MEAT && this.props.chicken_meat) {
      return this.props.chicken_meat
    }

    return null

  }

}
hz.Component.register(LootDropManager);




