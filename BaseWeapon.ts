import {
  Entity,
  Component,
  AudioGizmo,
  Player,
  PropTypes,
  CodeBlockEvents,
  AttachableEntity,
  AttachablePlayerAnchor,
  AvatarGripPoseAnimationNames,
  EntityInteractionMode,
  LocalEvent,
  Vec3,
  ParticleGizmo
} from "horizon/core";
import { EventsService } from "constants";
import { StartAttackingPlayer, StopAttackingPlayer } from "EnemyNPC";
import { VisualFxBank } from "VisualFxBank";
export const DamageEvent = new LocalEvent<{ amount: number }>();


export class BaseWeapon extends Component<typeof BaseWeapon> {
  static propsDefinition = {
    isDroppable: { type: PropTypes.Boolean, default: false },
    damage: { type: PropTypes.Number, default: 25 },
    reach: { type: PropTypes.Number, default: 2.0 },
    weight: { type: PropTypes.Number, default: 5 },
    type: { type: PropTypes.String, default: "" }, // "axe", "sword", "pickaxe"
    hitSparkEffect: { type: PropTypes.Entity },
    hitRingEffect: { type: PropTypes.Entity },
    hitResourceDullEffect: { type: PropTypes.Entity },
    hitResourceOreSuccessEffect: { type: PropTypes.Entity },
    hitResourceWoodSuccessEffect: { type: PropTypes.Entity },
    baseCooldownMs: { type: PropTypes.Number, default: 500 }, // Base cooldown in milliseconds
    weightMultiplier: { type: PropTypes.Number, default: 50 },
    hitCooldownMs: { type: PropTypes.Number, default: 100 }, // Minimum time between hits
  };
  private owner: Player | null = null;

  private hitSparkVfx?: ParticleGizmo | null = null;
  private hitRingVfx?: ParticleGizmo | null = null;
  private hitResourceDullSfx?: AudioGizmo | null = null;
  private hitResourceOreSuccessSfx?: AudioGizmo | null = null;
  private hitResourceWoodSuccessSfx?: AudioGizmo | null = null;
  private lastSwingTime: number = 0; // Track when the last swing occurred
  private isSwinging: boolean = false; // Track if currently swinging

  private lastHitTime: number = 0;
  private hitEntitiesThisSwing: Set<Entity> = new Set(); // Track what we've hit this swing
  private currentSwingId: number = 0; // Unique ID for each swing


  preStart(): void {
    this.hitRingVfx = this.props.hitRingEffect?.as(ParticleGizmo);
    this.hitSparkVfx = this.props.hitSparkEffect?.as(ParticleGizmo);
    this.hitResourceDullSfx = this.props.hitResourceDullEffect?.as(AudioGizmo);
    this.hitResourceOreSuccessSfx = this.props.hitResourceOreSuccessEffect?.as(AudioGizmo);
    this.hitResourceWoodSuccessSfx = this.props.hitResourceWoodSuccessEffect?.as(AudioGizmo);

    this.connectCodeBlockEvent(
      this.entity,
      CodeBlockEvents.OnGrabStart,
      (isRightHand: boolean, player: Player) =>
        this.onGrabStart(isRightHand, player)
    );

    this.connectCodeBlockEvent(
      this.entity,
      CodeBlockEvents.OnEntityCollision,
      (collideWith: Entity, collideAt: Vec3) => this.handleEntityCollision(collideWith, collideAt)
    );

    // When the player releases this item (for any reason), intercept the drop.
    this.connectCodeBlockEvent(
      this.entity,
      CodeBlockEvents.OnGrabEnd,
      (player: Player) => this.onGrabEnd(player)
    );

    // After being attached to the player (holstered), finalize its physical state.
    this.connectCodeBlockEvent(
      this.entity,
      CodeBlockEvents.OnAttachStart,
      (player: Player) => this.onAttached(player)
    );

    this.connectCodeBlockEvent(
      this.entity,
      CodeBlockEvents.OnIndexTriggerDown,
      (player: Player) => this.onFirePressed(player)
    );
    this.connectCodeBlockEvent(
      this.entity,
      CodeBlockEvents.OnIndexTriggerUp,
      (player: Player) => this.onFireReleased(player)
    );


  }

  start() {

    try {
      this.entity.visible.set(true);
      this.entity.collidable.set(true);
      this.entity.interactionMode.set(EntityInteractionMode.Both);
    } catch {
      console.error(
        `[BaseWeapon] Failed to initialize for ${this.entity.name.get()}`
      );
    }

  }

  public getOwner(): Player | null {
    return this.owner;
  }

  private getSwingCooldown(): number {
    return this.props.baseCooldownMs + (this.props.weight * this.props.weightMultiplier);
  }

  private canSwing(): boolean {
    const now = Date.now();
    const cooldown = this.getSwingCooldown();
    return !this.isSwinging && (now - this.lastSwingTime) >= cooldown;
  }

  private handleEntityCollision(collideWith: Entity, collideAt: Vec3) {
    // Only process hits during active swings
    if (!this.isSwinging) return;

    // Prevent hitting the same entity multiple times in one swing
    if (this.hitEntitiesThisSwing.has(collideWith)) {
      return;
    }

    // Prevent rapid successive hits (debounce)
    const now = Date.now();
    if (now - this.lastHitTime < this.props.hitCooldownMs) {
      return;
    }

    // Mark this entity as hit for this swing
    this.hitEntitiesThisSwing.add(collideWith);
    this.lastHitTime = now;

    const entityName = collideWith.name.get();
    const baseName = entityName.split("_")[0].toLowerCase();
    const toolType = this.props.type.toLowerCase();

    console.log(`[BaseWeapon] Hit ${entityName} (base: ${baseName}) with ${toolType}`);
    // TODO - Hacky as shit but no time
    if (baseName === "ore" && toolType !== "pickaxe") {
      this.hitResourceDullSfx?.play();
      this.hitRingVfx?.play();
    } else if (baseName === "tree" && toolType !== "axe") {
      this.hitResourceDullSfx?.play();
      this.hitRingVfx?.play();
    } else {
      if (baseName === "ore") {
        this.hitResourceOreSuccessSfx?.play(); 
      } else if (baseName === "tree") {
        this.hitResourceWoodSuccessSfx?.play();
      }
      this.hitSparkVfx?.play();
    }
  }



  // ** ADD THIS: Pass input to components **
  private onFirePressed(player: Player) {
    if (!this.isHeld()) return;

    if (!this.canSwing()) {
      // Optional: Play a "blocked" sound or visual feedback
      console.log(`[BaseWeapon] Swing blocked - cooldown: ${this.getSwingCooldown()}ms`);
      return;
    }

    this.isSwinging = true;
    this.lastSwingTime = Date.now();
    this.currentSwingId++; // Increment swing ID
    this.hitEntitiesThisSwing.clear(); // Clear hit entities for new swing


    this.entity.owner
      .get()
      .playAvatarGripPoseAnimationByName(AvatarGripPoseAnimationNames.Fire);

    const swingDuration = Math.max(150, 250 + (this.props.weight * 10)); // Minimum 150ms, increases with weight

    this.sendNetworkBroadcastEvent(EventsService.CombatEvents.AttackSwingEvent, {
      owner: player,
      weapon: this.entity,
      damage: this.props.damage,
      reach: this.props.reach,
      durationMs: 250, // Was 250 TODO  - Check if we can pass this in from the props
      type: this.props.type,

    });

    // End swing after duration
    this.async.setTimeout(() => {
      this.isSwinging = false;
      this.hitEntitiesThisSwing.clear(); // Clean up at end of swing
    }, swingDuration);


  }

  // ** ADD THIS: Pass input to components **
  private onFireReleased(player: Player) {

    if (!this.isHeld()) return;
  }

  private onGrabStart(isRightHand: boolean, player: Player) {
    this.owner = player;
    this.entity.owner.set(player);

    try {
      this.entity.as(AttachableEntity)?.detach();
    } catch { }
    this.entity.simulated.set(true);
    this.entity.collidable.set(true);
  }

  private onGrabEnd(player: Player) {
    const targetPlayer = this.owner ?? player;

    if (this.props.isDroppable) {
      this.owner = null;
      this.entity.owner.set(this.world.getServerPlayer());
    } else {
      this.holsterToTorso(targetPlayer);
    }
  }

  private holsterToTorso(player: Player) {
    if (!player) return;
    this.sendNetworkBroadcastEvent(StopAttackingPlayer, { player });
    this.entity.collidable.set(false);
    // Immediately stop physics to prevent the weapon from flying away during attachment.
    this.entity.simulated.set(false);

    // Ensure the weapon is properly owned and visible before attaching.
    this.entity.owner.set(player);
    this.entity.visible.set(true);

    // Attach to the player's torso. This is our holstering mechanic.
    // The actual position/rotation will be set by our data-driven holster system later.
    try {
      const attachable = this.entity.as(AttachableEntity);
      if (attachable) {
        attachable.attachToPlayer(player, AttachablePlayerAnchor.Torso);
      }
    } catch (e) {
      console.warn(
        `[BaseWeapon] Holster attach failed for ${this.entity.name.get()}`
      );
    }
  }

  private onAttached(player: Player) {
    // Finalize the holstered state. The weapon is now attached.

    // Disable physics simulation while holstered to save performance, especially on mobile.
    this.entity.simulated.set(false);
  }

  public isHeld(): boolean {
    return this.owner !== null;
  }
}
Component.register(BaseWeapon);
