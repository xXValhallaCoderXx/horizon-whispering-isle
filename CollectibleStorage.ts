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
    this.sendNetworkBroadcastEvent(
      EventsService.PlayerEvents.StorageInitialized,
      { player }
    );
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
