import * as hz from 'horizon/core';
import { VARIABLE_GROUPS } from 'constants';
import { EventsService, QuestSubmitCollectProgress, QuestPayload } from 'constants';

class QuestManager extends hz.Component<typeof QuestManager> {
  static propsDefinition = {
    // Asset to spawn for the player's storage bag
    storageBagAsset: { type: hz.PropTypes.Asset },
  };

  // In-memory per-player quest state (non-persistent for now)
  private playerStage = new Map<hz.Player, 'NotStarted' | 'Collecting' | 'ReturnToNPC' | 'Hunting' | 'Complete'>();
  private playerHasBag = new Map<hz.Player, boolean>();
  private spawnedBagByPlayer = new Map<hz.Player, hz.Entity>();

  preStart(): void {
    this.connectLocalBroadcastEvent(
      EventsService.QuestEvents.SubmitQuestCollectProgress,
      this.checkQuestCollectionSubmission.bind(this)
    );

    // Dialog asks for player stage -> respond with known state (defaults to NotStarted)
    this.connectLocalBroadcastEvent(
      EventsService.QuestEvents.RequestPlayerStage,
      ({ player }: { player: hz.Player }) => {
        const stage = this.playerStage.get(player) ?? 'NotStarted';
        this.sendLocalBroadcastEvent(EventsService.QuestEvents.PlayerStageResponse, { player, stage });
      }
    );

    // When tutorial quest is started, mark stage and spawn bag
    this.connectLocalBroadcastEvent(
      EventsService.QuestEvents.QuestStarted,
      (payload: QuestPayload) => this.onQuestStarted(payload)
    );

    // When any quest item is collected, see if it's the player's bag
    this.connectLocalBroadcastEvent(
      EventsService.PlayerEvents.QuestItemCollected,
      ({ player, entity }: { player: hz.Player; entity: hz.Entity }) => this.onAnyItemCollected(player, entity)
    );
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

  private async onQuestStarted(payload: QuestPayload) {
    const { player, questId } = payload;
    if (!player || !questId) return;
    // Only handle our tutorial quest here; future quests can expand logic
    if (questId === 'tutorial_survival') {
      // Move to Collecting stage
      this.playerStage.set(player, 'Collecting');
      this.playerHasBag.set(player, false);
      // Spawn the storage bag for this player to collect
      await this.spawnStorageBagForPlayer(player);
    }
  }

  private async spawnStorageBagForPlayer(player: hz.Player) {
    try {
      const asset = this.props.storageBagAsset as hz.Asset;
      if (!asset) {
        console.warn('[QuestManager] storageBagAsset not set; cannot spawn bag.');
        return;
      }
      const spawnPos = player.position.get();
      const spawned = await this.world.spawnAsset(asset, spawnPos);
      const root = spawned?.[0];
      if (!root) return;
      // Prefer visible world spawn so player can pick it up
      root.visible.set(true);
      // Ownership can help scripts resolve player interactions
      try { root.owner.set(player); } catch { }
      this.spawnedBagByPlayer.set(player, root);
      console.log(`[QuestManager] Spawned storage bag for ${player.name.get()} at`, spawnPos);
    } catch (e) {
      console.warn('[QuestManager] Failed to spawn storage bag', e);
    }
  }

  private onAnyItemCollected(player: hz.Player, entity: hz.Entity) {
    const bag = this.spawnedBagByPlayer.get(player);
    if (bag && bag === entity) {
      this.playerHasBag.set(player, true);
      // Optional: hide or destroy bag now that it's collected
      try { bag.visible.set(false); bag.simulated.set(false); } catch { }
      this.spawnedBagByPlayer.delete(player);
      console.log(`[QuestManager] ${player.name.get()} collected their storage bag.`);
    }
  }
}
hz.Component.register(QuestManager);