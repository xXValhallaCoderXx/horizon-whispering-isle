import * as hz from "horizon/core";
import { EventsService } from "constants";

class CollectableQuestItem extends hz.Component<typeof CollectableQuestItem> {
  static propsDefinition = {
    // Optional override; defaults to 'coconut' if blank/undefined
    itemId: { type: hz.PropTypes.String, default: 'coconut' },
  };

  currentPlayer: hz.Player | null = null;

  preStart(): void {
    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnIndexTriggerDown,
      (player: hz.Player) => this.depositItemToPlayerInventory(player)
    );
  }

  start() { }

  private depositItemToPlayerInventory(player: hz.Player) {
    console.log(`[CollectableQuestItem] - Emit Event: depositItemToPlayerInventory`);

    // Structured quest progress for QuestManager (local broadcast)
    const id = (typeof this.props.itemId === 'string' && this.props.itemId.trim().length > 0)
      ? this.props.itemId.trim()
      : 'coconut';
    this.sendNetworkBroadcastEvent(EventsService.QuestEvents.SubmitQuestCollectProgress, {
      player,
      itemId: id,
      amount: 1,
    });

  }
}
hz.Component.register(CollectableQuestItem);
