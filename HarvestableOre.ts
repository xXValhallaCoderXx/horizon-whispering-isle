import { EventsService } from 'constants';
import { Component, PropTypes, CodeBlockEvents, Entity, Vec3, Player, AudioGizmo } from 'horizon/core';

class HarvestableOre extends Component<typeof HarvestableOre> {
  static propsDefinition = {
    oreCrumbleSfx1: { type: PropTypes.Entity },
    oreCrumbleSfx2: { type: PropTypes.Entity },
    oreCrumbleSfx3: { type: PropTypes.Entity },
  };

  private lastHitTime: number = 0;
  private hitCooldown: number = 500; // ms

  private crumbleSfxs: (AudioGizmo | undefined)[] = [];

  preStart(): void {

    this.connectNetworkBroadcastEvent(
      EventsService.CombatEvents.AttackSwingEvent,
      (payload) => this.onLocalWeaponSwing(payload)
    );

    // Listen to server-validated ore hit responses
    this.connectNetworkBroadcastEvent(
      EventsService.HarvestEvents.OreHit,
      (payload) => this.onOreHitConfirmed(payload)
    );

    // Listen to ore depletion
    this.connectNetworkBroadcastEvent(
      EventsService.HarvestEvents.OreDepleted,
      (payload) => this.onOreDepleted(payload)
    );

  }



  start() {
    this.crumbleSfxs = [
      this.props.oreCrumbleSfx1,
      this.props.oreCrumbleSfx2,
      this.props.oreCrumbleSfx3,
    ].map(e => e?.as(AudioGizmo));
  }


  private onLocalWeaponSwing(payload: any) {
    const { owner, reach, type } = payload;

    if (type !== "pickaxe") {
      console.error("[ORE]  - onLocalWeaponSwing - Ignored, not a pickaxe");
      return
    }

    const now = Date.now();
    if (now - this.lastHitTime < this.hitCooldown) return;

    // Check if player is in range
    if (!this.isPlayerInRange(owner, reach || 0.5)) return;

    console.log("[ORE]  - Valid ore hit detected by local player");
    this.lastHitTime = now;
    // Request server to validate and process the hit
    const oreEntityId = this.toEntityIdString((this.entity as any)?.id);
    this.sendNetworkBroadcastEvent(EventsService.HarvestEvents.RequestOreHit, {
      player: owner,
      oreEntity: this.entity,
      oreRarity: "",
      toolType: type,
      hitPosition: this.entity.position.get(),
    });
  }

  private onOreHitConfirmed(payload: any) {
    console.log("[ORE]  - onOreHitConfirmed invoked", payload);
    console.error("[ORE]  - onOreHitConfirmed not yet implemented", payload);
  }

  private onOreDepleted(payload: any) {
    console.log("[ORE]  - onOreDepleted invoked", payload);
    console.error("[ORE]  - onOreDepleted not yet implemented", payload);
    // Play a random crumble SFX
    const validSfxs = this.crumbleSfxs.filter(sfx => sfx !== undefined) as AudioGizmo[];
    console.log("[ORE]  - Valid SFXs:", validSfxs);
    if (validSfxs.length === 0) return;
    const randomIndex = Math.floor(Math.random() * validSfxs.length);
    const selectedSfx = validSfxs[randomIndex];
    // Add a small 200 ms delay before playing the sound
    this.async.setTimeout(() => {
      selectedSfx.play();
    }, 500);

  }

  private isPlayerInRange(player: Player, reach: number): boolean {
    const playerPos = player.position.get();
    const orePos = this.entity.position.get();
    const distance = Math.sqrt(
      (playerPos.x - orePos.x) ** 2 +
      (playerPos.y - orePos.y) ** 2 +
      (playerPos.z - orePos.z) ** 2
    );
    console.log(`[ORE]  - Player distance: ${distance}, Reach: ${reach}`);
    return distance <= reach + 1.5; // Buffer for ore size
  }

  private toEntityIdString(id: any): string {
    const t = typeof id;
    if (t === "string") return id;
    if (t === "number") return String(id);
    if (t === "bigint") return id.toString();
    return "";
  }
}
Component.register(HarvestableOre);