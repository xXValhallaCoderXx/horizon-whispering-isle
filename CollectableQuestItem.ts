import * as hz from "horizon/core";
import { EventsService, ITEM_TYPES } from "constants";

class CollectableQuestItem extends hz.Component<typeof CollectableQuestItem> {
  static propsDefinition = {
    itemId: { type: hz.PropTypes.String, default: ITEM_TYPES.COCONUT },
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
    const id = this.props.itemId.trim()
    const rawId: any = (this.entity as any)?.id;
    const entityId = typeof rawId === 'bigint' ? rawId.toString() : String(rawId);

    if (!entityId || !player) {
      console.warn(`[CollectableQuestItem] - Invalid entityId or player. Aborting.`);
      return;
    }
    this.sendNetworkBroadcastEvent(EventsService.QuestEvents.SubmitQuestCollectProgress, {
      player,
      itemId: id,
      amount: 1,
      entityId,
    });

  }
}
hz.Component.register(CollectableQuestItem);
