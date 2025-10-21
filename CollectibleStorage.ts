import * as hz from "horizon/core";
import { EventsService } from "constants";

class CollectibleStorage extends hz.Component<typeof CollectibleStorage> {
  static propsDefinition = {
    triggerZone: { type: hz.PropTypes.Entity },
  };

  owner: hz.Player | null = null;

  preStart(): void {
    const resolvedOwner = this.entity?.owner?.get?.() as hz.Player | null;
    if (resolvedOwner) {
      this.owner = resolvedOwner;
      console.log(
        `[CollectibleStorage] Owner Resolved: ${resolvedOwner.name.get()}`
      );
    }

    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnGrabStart,
      (isRightHand: boolean, player: hz.Player) =>
        this.onGrabStart(isRightHand, player)
    );

    // Set ownership to player on player j
    this.connectCodeBlockEvent(
      this.props.triggerZone as hz.Entity,
      hz.CodeBlockEvents.OnEntityEnterTrigger,
      (otherEntity: hz.Entity) => this.handleQuestCollection(otherEntity)
    );
  }

  start() { }

  private onGrabStart(isRightHand: boolean, player: hz.Player) {
    // Only the designated owner should be able to holster this storage entity
    if (this.owner && this.owner !== player) {
      console.warn(`[CollectibleStorage] ${player.name.get()} tried to grab a bag owned by ${this.owner.name.get()}`);
      return;
    }

    // Ensure ownership is set to the grabbing player (idempotent)
    try { this.entity.owner.set(player); } catch { }

    // Make it only visible to this player and disable physics before attaching
    try {
      this.entity.setVisibilityForPlayers([player], hz.PlayerVisibilityMode.VisibleTo);
      this.entity.visible.set(true);
      this.entity.simulated.set(false);
    } catch { }

    // Attach to player torso (holster)
    const attachable = this.entity.as(hz.AttachableEntity);
    if (attachable) {
      try { attachable.attachToPlayer(player, hz.AttachablePlayerAnchor.Torso); } catch { }
    } else {
      console.warn('[CollectibleStorage] Entity is not attachable');
    }

    // Optionally restrict future grabs to this player
    try { this.entity.as(hz.GrabbableEntity)?.setWhoCanGrab([player]); } catch { }

    // Notify systems: storage initialized/holstered for this player
    this.sendNetworkBroadcastEvent(EventsService.PlayerEvents.StorageInitialized, { player });

    // Also signal as a quest item "collection" so QuestManager can mark has-bag
    this.sendNetworkBroadcastEvent(EventsService.PlayerEvents.QuestItemCollected, { entity: this.entity, player, amount: 1 });
  }

  private handleQuestCollection(entity: hz.Entity) {
    if (this.owner) {
      // TODO  Display toast or some feedback to the player
      console.log(
        `[CollectibleStorage] - Submitting quest item collection for item: ${entity.name.get()} by player: ${this.owner.name.get()}`
      );
      this.sendNetworkBroadcastEvent(
        EventsService.PlayerEvents.QuestItemCollected,
        { entity, player: this.owner, amount: 1 }
      );
    } else {
      console.error(
        "[CollectibleStorage] No current player to attribute collection to."
      );
    }
  }
}
hz.Component.register(CollectibleStorage);
