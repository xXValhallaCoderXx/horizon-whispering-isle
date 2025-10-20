import * as hz from 'horizon/core';
import { EventsService } from 'constants';
import { VARIABLE_GROUPS } from 'constants';

class CollectibleStorage extends hz.Component<typeof CollectibleStorage> {
  static propsDefinition = {
    triggerZone: { type: hz.PropTypes.Entity },
  };

  currentPlayer: hz.Player | null = null;

  preStart(): void {
    console.log("[CollectibleStorage] preStart", this.props.triggerZone);
    const resolvedOwner = (this.entity as any)?.owner?.get?.() as hz.Player | null;
    if (resolvedOwner) {
      this.currentPlayer = resolvedOwner;
      console.log(`[CollectibleStorage] Owner resolved at start: ${resolvedOwner.name.get()}`);
    }

    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnGrabStart,
      (isRightHand: boolean, player: hz.Player) => this.onGrabStart(isRightHand, player)
    );

    // Set ownership to player on player j
    this.connectCodeBlockEvent(
      this.props.triggerZone as hz.Entity,
      hz.CodeBlockEvents.OnEntityEnterTrigger,
      (otherEntity: hz.Entity) => this.handleQuestCollection(otherEntity)
    );

  }

  start() {

  }

  private onGrabStart(isRightHand: boolean, player: hz.Player) {

    this.sendNetworkBroadcastEvent(EventsService.PlayerEvents.StorageInitialized, { player });

  }

  private handleQuestCollection(entity: hz.Entity) {
    if (this.currentPlayer) {
      // TODO  Display toast or some feedback to the player
      console.log(`[CollectibleStorage] Player ${this.currentPlayer.name.get()} RECEIVED ${entity.id} - sending event`);
      this.sendNetworkBroadcastEvent(EventsService.PlayerEvents.QuestItemCollected, { entity, player: this.currentPlayer, amount: 1 });
    } else {
      console.error("[CollectibleStorage] No current player to attribute collection to.");
    }

  }

}
hz.Component.register(CollectibleStorage);