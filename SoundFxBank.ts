import { Component, PropTypes, Vec3, AudioGizmo, Asset, Player, SpawnController, Quaternion } from "horizon/core";

/**
 * A helper class to hold a pool of gizmos and its round-robin index.
 */
class AudioGizmoPool {
  public gizmos: AudioGizmo[] = [];
  public nextIndex = 0;
  constructor(public poolSize: number) { }
}

export class SoundFxBank extends Component<typeof SoundFxBank> {
  static propsDefinition = {
    // --- Add ALL your one-shot sound ASSETS here ---
    oreHitSuccess: { type: PropTypes.Asset },
    woodHitSuccess: { type: PropTypes.Asset },
    hitDull: { type: PropTypes.Asset },
    questItemCollect: { type: PropTypes.Asset },
    oreCrumbleSfx: { type: PropTypes.Asset },
  };

  static instance: SoundFxBank;

  private pools: Map<string, AudioGizmoPool> = new Map();

  preStart() {
    SoundFxBank.instance = this;
  }

  async start() {
    // We link the prop asset to a simple string ID.

    // Asset from props, String ID, Pool Size
    this.spawnPoolHelper(this.props.oreHitSuccess as Asset, "ore_hit_success", 5);
    this.spawnPoolHelper(this.props.woodHitSuccess as Asset, "wood_hit_success", 5);
    this.spawnPoolHelper(this.props.questItemCollect as Asset, "quest_item_collect", 5);
    this.spawnPoolHelper(this.props.hitDull as Asset, "hit_dull", 5);
    this.spawnPoolHelper(this.props.oreCrumbleSfx as Asset, "ore_crumble_sfx", 5);
  }

  /**
   * Spawns all gizmos for a single sound type and adds them to the Map.
   */
  private async spawnPoolHelper(asset: Asset, soundId: string, poolSize: number) {
    if (!asset) {
      console.warn(`SoundFxBank: Asset for soundId '${soundId}' is not assigned.`);
      return;
    }

    console.log(`SoundFxBank: Initializing pool for '${soundId}' with size ${poolSize}`);
    const newPool = new AudioGizmoPool(poolSize);
    this.pools.set(soundId, newPool);

    // --- These are the defaults your SpawnController constructor needs ---
    const spawnPos = Vec3.zero; // We'll move them anyway
    const spawnRot = Quaternion.one;
    const spawnScale = Vec3.one;

    for (let i = 0; i < poolSize; i++) {
      // --- This is the CORRECT, 4-argument constructor ---
      const spawnController = new SpawnController(asset, spawnPos, spawnRot, spawnScale);
      try {
        await spawnController.load();
        await spawnController.spawn();

        const gizmoEntities = spawnController.rootEntities.get();

        if (gizmoEntities.length > 0) {
          const audioGizmo = gizmoEntities[0].as(AudioGizmo);
          if (audioGizmo) {

            // --- SAFETY NET ---
            // This stops sounds playing on load, but the *real* fix
            // is unchecking "Play on Start" on the asset itself.
            audioGizmo.stop();

            newPool.gizmos.push(audioGizmo);
          } else {
            console.warn(`Spawned asset for '${soundId}' is not an AudioGizmo.`);
            spawnController.dispose();
          }
        } else {
          console.warn(`SpawnController for '${soundId}' returned no entities.`);
          spawnController.dispose();
        }
      } catch (e) {
        console.error(`Failed to spawn SFX for pool '${soundId}'.`, e);
        try { spawnController.dispose(); } catch { }
      }
    }
  }

  /**
   * Finds the correct pool and returns the next gizmo in its cycle.
   */
  private getNextGizmo(soundId: string): AudioGizmo | null {
    const pool = this.pools.get(soundId);
    if (!pool) {
      console.warn(`SoundFxBank: No pool found for soundId '${soundId}'.`);
      return null;
    }
    if (pool.gizmos.length === 0) {
      console.warn(`SoundFxBank: Pool for '${soundId}' is empty.`);
      return null;
    }

    const gizmo = pool.gizmos[pool.nextIndex];
    pool.nextIndex = (pool.nextIndex + 1) % pool.gizmos.length;
    return gizmo;
  }

  // --- GENERIC "PLAY" FUNCTIONS ---

  // --- UPDATED FUNCTION ---
  /**
   * Plays a sound at a 3D position. Everyone nearby will hear it.
   * @param soundId The ID of the sound to play (e.g., "pickup")
   * @param position The base position to play at
   * @param heightOffset Optional. How many meters to add to the Y-axis.
   */
  public playSoundAt(soundId: string, position: Vec3, heightOffset: number = 0) {
    console.log("[SoundFxBank] Attempting Playing sound at position:", soundId, position);
    const gizmo = this.getNextGizmo(soundId);
    if (gizmo) {
      // Apply the offset
      console.log("[SoundFxBank] Playing sound at position:", soundId, position);
      const playPos = new Vec3(position.x, position.y + heightOffset, position.z);
      gizmo.position.set(playPos);
      gizmo.play();
    }
  }

  /**
   * Plays a sound only for a specific player.
   */
  public playSoundForPlayer(soundId: string, player: Player) {
    console.log("[SoundFxBank] Attempting Playing sound for player:", soundId, player.name.get());
    const gizmo = this.getNextGizmo(soundId);
    if (gizmo) {
      console.log("[SoundFxBank] Playing sound for player:", soundId, player.name.get());
      gizmo.play({ players: [player], fade: 0 });
    }
  }
}
Component.register(SoundFxBank);