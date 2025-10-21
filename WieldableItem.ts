import * as hz from 'horizon/core';

class WieldableItem extends hz.Component<typeof WieldableItem> {
  static propsDefinition = {
    type: { type: hz.PropTypes.String, default: "" },
    label: { type: hz.PropTypes.String, default: "" },
  };
  private owner: hz.Player | null = null;
  // Rely on OnAttachStart for finalizing holster; no timers or loops
  preStart(): void {
    // console.log("[CollectibleStorage] preStart", this.props.triggerZone);
    // const resolvedOwner = (this.entity as any)?.owner?.get?.() as hz.Player | null;
    // if (resolvedOwner) {
    //   this.currentPlayer = resolvedOwner;
    //   console.log(`[CollectibleStorage] Owner resolved at start: ${resolvedOwner.name.get()}`);
    // }

    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnGrabStart, (isRightHand: boolean, player: hz.Player) => this.onGrabStart(isRightHand, player));
    // When the player releases this item (for any reason), immediately holster it instead of dropping
    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnGrabEnd, (player: hz.Player) => this.onGrabEnd(player));
    // Finalize holster on successful attach
    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnAttachStart, (player: hz.Player) => this.onAttached(player));
    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnIndexTriggerDown,
      (player: hz.Player) => this.onTriggerDown(player)
    );

    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnEntityCollision,
      (otherEntity: hz.Entity) => this.onEntityCollision(otherEntity)
    );



  }
  start() {

  }

  private onGrabStart(isRightHand: boolean, player: hz.Player) {
    // Establish ownership on first grab or transfer. Only owner can interact going forward
    this.owner = player;
    try { this.entity.owner.set(player); } catch { }
    try { this.entity.as(hz.GrabbableEntity)?.setWhoCanGrab([player]); } catch { }
    // Ensure visible to owner and physics is enabled while held by the player
    try {
      this.entity.resetVisibilityForPlayers();
      this.entity.visible.set(true);
      this.entity.simulated.set(true);
      this.entity.collidable.set(true);
    } catch { }
    // If the item was previously attached to the torso, grabbing will implicitly detach. Ensure detach just in case.
    try { this.entity.as(hz.AttachableEntity)?.detach(); } catch { }
    // No timers to cancel; keep it simple

  }

  private onGrabEnd(player: hz.Player) {
    // Any drop action should holster the item to the owner's torso (never drop to ground)
    const target = this.owner ?? player;
    this.holsterToTorso(target);
  }

  private holsterToTorso(player: hz.Player) {
    if (!player) return;
    try {
      // Force release in case of edge cases where engine still thinks it's held
      this.entity.as(hz.GrabbableEntity)?.forceRelease();
    } catch { }
    // Attach to torso as holstered state; keep it owner-only. Rely on editor-set anchor offsets.
    // Ensure it's visible to owner
    try { this.entity.visible.set(true); } catch { }
    try { this.entity.setVisibilityForPlayers([player], hz.PlayerVisibilityMode.VisibleTo); } catch { }
    try { this.entity.as(hz.GrabbableEntity)?.setWhoCanGrab([player]); } catch { }
    // Keep ownership consistent
    try { this.entity.owner.set(player); } catch { }
    // Attach now; OnAttachStart will finalize state
    try { this.entity.as(hz.AttachableEntity)?.attachToPlayer(player, hz.AttachablePlayerAnchor.Torso); } catch { }
  }

  private onTriggerDown(player: hz.Player) {
    console.log(`[WieldableItem] onTriggerDown by player ${player.name.get()} for item type ${this.props.type}`);
    player.playAvatarGripPoseAnimationByName(
      hz.AvatarGripPoseAnimationNames.Fire
    );

  }

  private onEntityCollision(_otherEntity: hz.Entity) { /* no-op to keep logs clean */ }

  // No reattempt timers needed when anchor is correctly configured in editor

  private onAttached(_player: hz.Player) {
    // Attachment succeeded: finalize holster state
    try { this.entity.simulated.set(false); } catch { }
    try { this.entity.collidable.set(false); } catch { }
  }
}
hz.Component.register(WieldableItem);