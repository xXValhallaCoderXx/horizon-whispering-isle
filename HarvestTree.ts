import * as hz from 'horizon/core';
import { HarvestableTreeConfig, TREE_TYPES, EventsService } from 'constants';

class HarvestTree extends hz.Component<typeof HarvestTree> {
  static propsDefinition = {
    treeType: { type: hz.PropTypes.String, default: "oak" },
    hitSoundGizmo: { type: hz.PropTypes.Entity },
    hitVFXGizmo: { type: hz.PropTypes.Entity },
    depletedSoundGizmo: { type: hz.PropTypes.Entity },
  };

  private config: HarvestableTreeConfig | null = null;
  private currentHealth: number = 0;
  private isRegenerating: boolean = false;
  private hitCooldown: Map<string, number> = new Map(); // Prevent spam


  preStart() {
    // Load configuration
    const cfg = TREE_TYPES[this.props.treeType];
    if (!cfg) {
      console.error(`[HarvestableTree] Unknown tree type: ${this.props.treeType}`);
      return;
    }
    this.config = cfg;
    this.currentHealth = cfg.maxHealth;

    // Listen to weapon swings
    this.connectNetworkBroadcastEvent(
      EventsService.CombatEvents.AttackSwingEvent,
      (payload) => this.onWeaponSwing(payload)
    );
  }

  start() {

  }


  private executeShake(entity: hz.PhysicalEntity, impactNormal: hz.Vec3): void {
    const shakeStrength = 50;

    // Calculate torque vector: use the normal (direction of impact) to determine the axis of rotation.
    // Torque application causes rotational movement around the impact axis.

    // Note: mulInPlace modifies the Vec3 instance provided (impactNormal) [5].
    const torqueVector = impactNormal.mulInPlace(shakeStrength);

    // Apply torque instantly to simulate the force of the axe impact.
    entity.applyTorque(torqueVector); // [6]

    // Optional: Play VFX and SFX
    // E.g., this.props.vfxGizmo.as(hz.ParticleGizmo)?.play(); [7, 8]
    // E.g., this.props.audioGizmo.as(hz.AudioGizmo)?.play(); [9, 10]
  }

  private onWeaponSwing(payload: any) {
    const { owner, weapon, toolType, isHarvestTool, reach } = payload;

    const treeEntity = this.entity.as(hz.PhysicalEntity); // [1-3]
    const testImpactNormal = new hz.Vec3(0, 0, -1); // [4]
    this.executeShake(treeEntity, testImpactNormal);
    // Validate tool compatibility
    // if (!isHarvestTool || toolType !== this.config?.toolType) {
    //   // Optional: Play error sound for incompatible tool
    //   if (this.isPlayerNearTree(owner)) {
    //     console.log(`[HarvestableTree] Incompatible tool: ${toolType}`);
    //     // TODO: Play "invalid tool" sound
    //   }
    //   return;
    // }

    // Check if player is in range
    if (!this.isPlayerInRange(owner, 3)) {
      return;
    }
    console.log("YO YOYOYO")

    // Anti-spam cooldown (prevent double-hits)
    const playerId = (owner as any).id?.toString();
    if (this.isOnCooldown(playerId)) return;
    this.setCooldown(playerId);

    this.handleHit(owner);
  }

  private handleHit(player: hz.Player) {
    if (this.isRegenerating || !this.config) return;
    console.log("HAAAANDLE HIIIIIIT")
    this.currentHealth--;
    const position = this.entity.position.get();

    // Emit hit feedback event
    this.sendNetworkBroadcastEvent(EventsService.HarvestEvents.TreeHit, {
      player,
      treeEntity: this.entity,
      hitPosition: position,
      healthRemaining: this.currentHealth,
    });

    // Play local feedback (VFX/SFX)
    this.playHitFeedback();

    console.log(
      `[HarvestableTree] Hit! Health: ${this.currentHealth}/${this.config.maxHealth}`
    );

    // Check if depleted
    if (this.currentHealth <= 0) {
      this.handleDepletion(player);
    }
  }

  private handleDepletion(player: hz.Player) {
    if (!this.config) return;

    this.isRegenerating = true;
    const position = this.entity.position.get();

    console.log(`[HarvestableTree] Tree depleted! Spawning logs...`);

    // Emit depletion event
    this.sendNetworkBroadcastEvent(EventsService.HarvestEvents.TreeDepleted, {
      player,
      treeEntity: this.entity,
      position,
    });

    // Play depletion feedback
    this.playDepletedFeedback();

    // Spawn logs

    // Hide/fade tree (visual only, keep collision)
    this.entity.visible.set(false)


  }




  private playHitFeedback() {
    try {
      this.props.hitSoundGizmo?.as(hz.AudioGizmo)?.play();
      this.props.hitVFXGizmo?.as(hz.ParticleGizmo)?.play();
    } catch { }
  }

  private playDepletedFeedback() {
    try {
      this.props.depletedSoundGizmo?.as(hz.AudioGizmo)?.play();
    } catch { }
  }

  // --- Utility Functions ---

  private isPlayerInRange(player: hz.Player, reach: number): boolean {
    const playerPos = player.position.get();
    const treePos = this.entity.position.get();
    const distance = Math.sqrt(
      (playerPos.x - treePos.x) ** 2 +
      (playerPos.y - treePos.y) ** 2 +
      (playerPos.z - treePos.z) ** 2
    );
    return distance <= reach; // Add buffer for tree size
  }

  private isPlayerNearTree(player: hz.Player): boolean {
    return this.isPlayerInRange(player, 5.0);
  }


  private isOnCooldown(playerId: string): boolean {
    const lastHit = this.hitCooldown.get(playerId) || 0;
    return Date.now() - lastHit < 500; // 500ms cooldown
  }

  private setCooldown(playerId: string) {
    this.hitCooldown.set(playerId, Date.now());
  }




}
hz.Component.register(HarvestTree);