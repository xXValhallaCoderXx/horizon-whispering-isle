import * as hz from 'horizon/core';

export class WieldableItem extends hz.Component<typeof WieldableItem> {
  static propsDefinition = {
    type: { type: hz.PropTypes.String, default: "" },
    label: { type: hz.PropTypes.String, default: "" },
  };
  private owner: hz.Player | null = null;

  preStart(): void {
    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnGrabStart,
      (isRightHand: boolean, player: hz.Player) => this.onGrabStart(isRightHand, player)
    );
    // When the player releases this item (for any reason), immediately holster it instead of dropping
    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnGrabEnd,
      (...args: any[]) => this.onGrabEnd((args[1] ?? args[0]) as hz.Player)
    );
    // Finalize holster on successful attach
    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnAttachStart,
      (...args: any[]) => this.onAttached((args[1] ?? args[0]) as hz.Player)
    );

    // Startup stabilization: assert interactable defaults in case the editor leaves objects
    // in a weird state after play/stop cycles.
    this.async.setTimeout(() => {
      try { this.entity.visible.set(true); } catch {}
      try { this.entity.collidable.set(true); } catch {}
      // Keep simulation as-is on startup; it will be managed by grab/attach flow
    }, 200);

  }

  start() { }

  private onGrabStart(isRightHand: boolean, player: hz.Player) {
    // Establish ownership on first grab or transfer. Only owner can interact going forward
    this.owner = player;
    try { this.entity.owner.set(player); } catch { }
    // Ensure visible to owner and physics is enabled while held by the player
    try {
      // Make item globally visible and interactable while held
      try { this.entity.resetVisibilityForPlayers(); } catch {}
      try { this.entity.visible.set(true); } catch {}
      this.entity.simulated.set(true);
      this.entity.collidable.set(true);
    } catch {
      console.warn('[WieldableItem] onGrabStart: visibility/physics setup failed');
    }
    // If the item was previously attached to the torso, grabbing will implicitly detach. Ensure detach just in case.
    try { this.entity.as(hz.AttachableEntity)?.detach(); } catch {
      console.warn('[WieldableItem] Detach on grab failed');
    }
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
    // Prevent any physics throw drift during re-holster
    try { this.entity.simulated.set(false); } catch {}
    // Attach to torso as holstered state; keep it visible to all to avoid sticky invisibility when owner leaves.
    try { this.entity.visible.set(true); } catch { }
    // Keep ownership consistent (used by BaseWeapon to validate attacks)
    try { this.entity.owner.set(player); } catch { }
    // Attach now; OnAttachStart will finalize state
    try { this.entity.as(hz.AttachableEntity)?.attachToPlayer(player, hz.AttachablePlayerAnchor.Torso); } catch { }
  }


  private onAttached(player: hz.Player) {
    // Attachment succeeded: finalize holster state per device
    try {
      const device = player?.deviceType?.get?.();
      const isVR = device === hz.PlayerDeviceType.VR;
      // Keep colliders enabled for all devices so the item remains interactable while holstered.
      // Turn off physics simulation when holstered on non-VR to avoid stray physics.
      this.entity.simulated.set(!!isVR);
      this.entity.collidable.set(true);
    } catch { }
  }
}
hz.Component.register(WieldableItem);