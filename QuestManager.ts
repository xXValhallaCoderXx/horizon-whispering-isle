import * as hz from 'horizon/core';
import { VARIABLE_GROUPS } from 'constants';
import { EventsService, QuestSubmitCollectProgress } from 'constants';

class QuestManager extends hz.Component<typeof QuestManager> {
  static propsDefinition = {};

  preStart(): void {
    this.connectLocalBroadcastEvent(
      EventsService.QuestEvents.SubmitQuestCollectProgress, this.checkQuestCollectionSubmission.bind(this));
  }

  start() {

  }

  private checkQuestCollectionSubmission(payload: QuestSubmitCollectProgress): boolean {
    const { itemId, player, amount } = payload;
    console.log(`[QuestManager] - Checking quest collection submission for item: ${itemId} by player: ${player.name.get()} with amount: ${amount}`);
    return false;
  }

  private completeTutorialForPlayer(player: hz.Player) {

  }
}
hz.Component.register(QuestManager);