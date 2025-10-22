import { Component, Player, PropTypes, CodeBlockEvents, AttachableEntity, AttachablePlayerAnchor, AvatarGripPoseAnimationNames, EntityInteractionMode } from 'horizon/core';
import { StartAttackingPlayer, StopAttackingPlayer } from 'EnemyNPC';

export class BaseWeapon extends Component<typeof BaseWeapon> {
  static propsDefinition = {
    isDroppable: { type: PropTypes.Boolean, default: false },
  };
  private owner: Player | null = null;

  preStart(): void {
    console.log(`[BaseWeapon] preStart called for ${this.entity.name.get()}`);
    // When the player grabs this item, they become the owner.
    this.connectCodeBlockEvent(
      this.entity,
      CodeBlockEvents.OnGrabStart,
      (isRightHand: boolean, player: Player) => this.onGrabStart(isRightHand, player)
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

    this.async.setTimeout(() => {
      console.log(`[BaseWeapon] Stabilizing properties for ${this.entity.name.get()}`);
      try { this.entity.visible.set(true); } catch {
        console.warn(`[BaseWeapon] Failed to set visibility for ${this.entity.name.get()}`);
      }
      try { this.entity.collidable.set(true); } catch {
        console.error(`[BaseWeapon] Failed to set collidable for ${this.entity.name.get()}`);
      }
      try { this.entity.interactionMode.set(EntityInteractionMode.Both); } catch {
        console.warn(`[BaseWeapon] Failed to set interactionMode for ${this.entity.name.get()}`);
      }
    }, 200); // 200ms is a safe delay.
  }

  public getOwner(): Player | null {
    return this.owner;
  }

  // ** ADD THIS: Pass input to components **
  private onFirePressed(player: Player) {
    console.log(`[BaseWeapon] onFirePressed called for ${this.entity.name.get()} by player ${player.name.get()}`);
    console.log(`[BaseWeapon] isHeld: ${this.isHeld()}`);
    if (!this.isHeld()) return;
    this.entity.owner.get().playAvatarGripPoseAnimationByName(AvatarGripPoseAnimationNames.Fire);
  }

  // ** ADD THIS: Pass input to components **
  private onFireReleased(player: Player) {
    if (!this.isHeld()) return;

  }

  private onGrabStart(isRightHand: boolean, player: Player) {
    console.log(`[BaseWeapon] onGrabStart called for ${this.entity.name.get()}`);
    this.owner = player;
    this.entity.owner.set(player);
    this.sendNetworkBroadcastEvent(StartAttackingPlayer, { player });
    try { this.entity.as(AttachableEntity)?.detach(); } catch { }
    this.entity.simulated.set(true);
    this.entity.collidable.set(true);

  }



  private onGrabEnd(player: Player) {
    console.log(`[BaseWeapon] onGrabEnd called for ${this.entity.name.get()}`);
    const targetPlayer = this.owner ?? player;

    if (this.props.isDroppable) {
      this.owner = null;
      this.entity.owner.set(this.world.getServerPlayer());
    } else {
      this.holsterToTorso(targetPlayer);
    }

  }   

  private holsterToTorso(player: Player) {
    console.log(`[BaseWeapon] Holstering weapon ${this.entity.name.get()} to torso of player ${player.name.get()}`);
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
      console.warn(`[BaseWeapon] Holster attach failed for ${this.entity.name.get()}`);
    }
  }

  private onAttached(player: Player) {
    console.log(`[BaseWeapon] onAttached called for ${this.entity.name.get()}`);
  // Finalize the holstered state. The weapon is now attached.

    // Disable physics simulation while holstered to save performance, especially on mobile.
    this.entity.simulated.set(false);
  }

  public isHeld(): boolean {
    console.log(`[BaseWeapon] isHeld check for ${this.entity.name.get()}: ${this.owner !== null}`);
    return this.owner !== null;
  }

}
Component.register(BaseWeapon);