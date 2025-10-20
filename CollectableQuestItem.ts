import * as hz from "horizon/core";
import { EventsService } from "constants";

class CollectableQuestItem extends hz.Component<typeof CollectableQuestItem> {
  static propsDefinition = {};

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
    const payload = { entity: this.entity, player, amount: 1 as const };
    console.log(`[CollectableQuestItem] - Emit Event: depositItemToPlayerInventory`);
    this.sendNetworkBroadcastEvent(EventsService.PlayerEvents.QuestItemCollected, payload);
  }
}
hz.Component.register(CollectableQuestItem);
