import { Component, PropTypes, Vec3, Asset, Player, SpawnController, Quaternion, ParticleGizmo } from "horizon/core";

/**
 * A helper class to hold a pool of VFX gizmos and its round-robin index.
 */
class VFXGizmoPool {
  public gizmos: ParticleGizmo[] = [];
  public nextIndex = 0;
  constructor(public poolSize: number) { }
}

export class VisualFxBank extends Component<typeof VisualFxBank> {
  static propsDefinition = {
    // --- Add ALL your one-shot VFX ASSETS here ---
    smokeDestroyAssetSmall: { type: PropTypes.Asset },
    sparkleStar: { type: PropTypes.Asset },
    // Add more as needed...
  };

  static instance: VisualFxBank;

  // A map to hold all our different VFX pools
  private pools: Map<string, VFXGizmoPool> = new Map();

  preStart() {
    VisualFxBank.instance = this;
  }

  async start() {
    // We link the prop asset to a simple string ID.

    // Asset from props, String ID, Pool Size
    this.spawnPoolHelper(this.props.sparkleStar as Asset, "sparkle_star", 5);
    this.spawnPoolHelper(this.props.smokeDestroyAssetSmall as Asset, "smoke_destroy_small", 5);

  }

  /**
   * Spawns all gizmos for a single VFX type and adds them to the Map.
   */
  private async spawnPoolHelper(asset: Asset, vfxId: string, poolSize: number) {
    if (!asset) {
      console.warn(`VisualFxBank: Asset for vfxId '${vfxId}' is not assigned.`);
      return;
    }

    console.log(`VisualFxBank: Initializing pool for '${vfxId}' with size ${poolSize}`);
    const newPool = new VFXGizmoPool(poolSize);
    this.pools.set(vfxId, newPool);

    const spawnPos = Vec3.zero;
    const spawnRot = Quaternion.one;
    const spawnScale = Vec3.one;

    for (let i = 0; i < poolSize; i++) {
      const spawnController = new SpawnController(asset, spawnPos, spawnRot, spawnScale);
      try {
        await spawnController.load();
        await spawnController.spawn();

        const gizmoEntities = spawnController.rootEntities.get();

        if (gizmoEntities.length > 0) {
          const particleGizmo = gizmoEntities[0].as(ParticleGizmo);
          if (particleGizmo) {

            // --- SAFETY NET ---
            // Stops VFX from playing on load.
            // The REAL fix is unchecking "Play on Start" on the asset.
            particleGizmo.stop();

            newPool.gizmos.push(particleGizmo);
          } else {
            console.warn(`Spawned asset for '${vfxId}' is not a ParticleGizmo.`);
            spawnController.dispose();
          }
        } else {
          console.warn(`SpawnController for '${vfxId}' returned no entities.`);
          spawnController.dispose();
        }
      } catch (e) {
        console.error(`Failed to spawn VFX for pool '${vfxId}'.`, e);
        try { spawnController.dispose(); } catch { }
      }
    }
  }

  /**
   * Finds the correct pool and returns the next gizmo in its cycle.
   */
  private getNextGizmo(vfxId: string): ParticleGizmo | null {
    const pool = this.pools.get(vfxId);
    if (!pool) {
      console.warn(`VisualFxBank: No pool found for vfxId '${vfxId}'.`);
      return null;
    }
    if (pool.gizmos.length === 0) {
      console.warn(`VisualFxBank: Pool for '${vfxId}' is empty.`);
      return null;
    }

    const gizmo = pool.gizmos[pool.nextIndex];
    pool.nextIndex = (pool.nextIndex + 1) % pool.gizmos.length;
    return gizmo;
  }

  // --- GENERIC "PLAY" FUNCTIONS ---
  // --- UPDATED FUNCTION ---
  /**
   * Plays a VFX at a 3D position. Everyone nearby will see it.
   * @param vfxId The ID of the VFX to play (e.g., "collect")
   * @param position The base position to play at
   * @param heightOffset Optional. How many meters to add to the Y-axis.
   */
  public playVFXAt(vfxId: string, position: Vec3, heightOffset: number = 0) {
    const gizmo = this.getNextGizmo(vfxId);
    console.log("[VisualFxBank] Attempting Playing VFX at position:", vfxId, position);
    if (gizmo) {
      // Apply the offset
      console.log("[VisualFxBank] Playing VFX at position:", vfxId, position);
      const playPos = new Vec3(position.x, position.y + heightOffset, position.z);
      gizmo.position.set(playPos);
      gizmo.play();
    }
  }

  /**
   * Plays a VFX only for a specific player.
   */
  public playVFXForPlayer(vfxId: string, player: Player) {
    const gizmo = this.getNextGizmo(vfxId);
    console.log("[VisualFxBank] Attempting Playing VFX for player:", vfxId, player.name.get());
    if (gizmo) {
      console.log("[VisualFxBank] Playing VFX for player:", vfxId, player.name.get());
      gizmo.play({ players: [player] });
    }
  }
}
Component.register(VisualFxBank);