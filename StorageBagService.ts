import * as hz from 'horizon/core';

export class StorageBagService {
  static async spawnAndEquipForPlayer(
    world: hz.World,
    player: hz.Player,
    asset: hz.Asset
  ): Promise<boolean> {
    try {
      console.log(`[StorageBagService] Spawning storage bag for ${player.name.get()}`);

      const spawnPosition = player.position.get();
      const spawnedEntities = await world.spawnAsset(asset, spawnPosition);

      if (spawnedEntities.length === 0) {
        console.error('[StorageBagService] Failed to spawn storage bag');
        return false;
      }

      const rootEntity = spawnedEntities[0];
      rootEntity.visible.set(true);
      rootEntity.setVisibilityForPlayers([player], hz.PlayerVisibilityMode.VisibleTo);

      const grabbable = rootEntity.as(hz.GrabbableEntity);
      grabbable.setWhoCanGrab([player]);


      return true;
    } catch (error) {
      console.error(`[StorageBagService] Error spawning storage bag:`, error);
      return false;
    }
  }
}