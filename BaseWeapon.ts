import {
  Entity,
  Component,
  Player,
  PropTypes,
  CodeBlockEvents,
  AttachableEntity,
  AttachablePlayerAnchor,
  AvatarGripPoseAnimationNames,
  EntityInteractionMode,
} from "horizon/core";
import { EventsService } from "constants";
import { StartAttackingPlayer, StopAttackingPlayer } from "EnemyNPC";

export class BaseWeapon extends Component<typeof BaseWeapon> {
  static propsDefinition = {
    isDroppable: { type: PropTypes.Boolean, default: false },
  };
  private owner: Player | null = null;

  preStart(): void {
    this.connectCodeBlockEvent(
      this.entity,
      CodeBlockEvents.OnGrabStart,
      (isRightHand: boolean, player: Player) =>
        this.onGrabStart(isRightHand, player)
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

    this.connectCodeBlockEvent(
      this.entity,
      CodeBlockEvents.OnEntityEnterTrigger,
      (entity: Entity) => this.onEntityEnterTrigger(entity)
    );
  }

  start() {
    try {
      this.entity.visible.set(true);
    } catch {
      console.warn(
        `[BaseWeapon] Failed to set visibility for ${this.entity.name.get()}`
      );
    }
    try {
      this.entity.collidable.set(true);
    } catch {
      console.error(
        `[BaseWeapon] Failed to set collidable for ${this.entity.name.get()}`
      );
    }
    try {
      this.entity.interactionMode.set(EntityInteractionMode.Both);
    } catch {
      console.warn(
        `[BaseWeapon] Failed to set interactionMode for ${this.entity.name.get()}`
      );
    }
  }

  public getOwner(): Player | null {
    return this.owner;
  }

  private onEntityEnterTrigger(entity: Entity) {
    console.log(
      `[BaseWeapon] onEntityEnterTrigger called for ${entity.name.get()}`
    );
  }

  // ** ADD THIS: Pass input to components **
  private onFirePressed(player: Player) {
    if (!this.isHeld()) return;
    console.log(
      `[BaseWeapon] onFirePressed called by player ${player.name.get()}`
    );
    this.entity.owner
      .get()
      .playAvatarGripPoseAnimationByName(AvatarGripPoseAnimationNames.Fire);

    // Open a short swing window; NPCs will validate proximity/angle/cooldown.
    this.sendNetworkBroadcastEvent(EventsService.CombatEvents.AttackSwingEvent, {
      player,
      damage: 25,
      reach: 2.0,
      durationMs: 250,
    });
  }

  // ** ADD THIS: Pass input to components **
  private onFireReleased(player: Player) {
    if (!this.isHeld()) return;
  }

  private onGrabStart(isRightHand: boolean, player: Player) {
    this.owner = player;
    this.entity.owner.set(player);
    this.sendNetworkBroadcastEvent(StartAttackingPlayer, { player });
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
