import * as hz from 'horizon/core';
import { VARIABLE_GROUPS } from 'constants';
import { EventsService, QuestSubmitCollectProgress, QuestPayload, QUEST_DEFINITIONS, Quest, QuestObjective, ObjectiveType, QuestStatus } from 'constants';
import { PlayerStateService } from 'PlayerStateService';

class QuestManager extends hz.Component<typeof QuestManager> {
  static propsDefinition = {
    // Asset to spawn for the player's storage bag
    storageBagAsset: { type: hz.PropTypes.Asset },
    // Optional: an AudioGizmo entity to play when a quest item is collected
    collectSound: { type: hz.PropTypes.Entity },
    // Optional: a ParticleGizmo entity to play when a quest item is collected
    collectVfx: { type: hz.PropTypes.Entity },
  };

  // In-memory per-player quest state (non-persistent for now)
  // Active quest state per player (deep-cloned from definitions)
  private activeQuestByPlayer = new Map<hz.Player, Quest>();
  private playerHasBag = new Map<hz.Player, boolean>();
  private spawnedBagByPlayer = new Map<hz.Player, hz.Entity>();

  preStart(): void {
    this.connectNetworkBroadcastEvent(
      EventsService.QuestEvents.SubmitQuestCollectProgress,
      this.checkQuestCollectionSubmission.bind(this)
    );

    // When tutorial quest is started, mark stage and spawn bag
    this.connectLocalBroadcastEvent(
      EventsService.QuestEvents.QuestStarted,
      (payload: QuestPayload) => this.onQuestStarted(payload)
    );
  }

  start() {

  }

  private checkQuestCollectionSubmission(payload: QuestSubmitCollectProgress): boolean {
    const { itemId, player, amount, entityId } = payload;
    console.log(`[QuestManager] - Checking quest collection submission for item: ${itemId} by player: ${player.name.get()} with amount: ${amount}`);

    const quest = this.ensureActiveQuest(player, 'tutorial_survival');
    if (!quest) return false;

    // Find relevant objectives for this item type
    const matching = quest.objectives.filter((o: QuestObjective) => !o.isCompleted && o.type === ObjectiveType.Collect && o.targetType === itemId);
    if (matching.length === 0) {
      console.log(`[QuestManager] No matching collect objectives for item '${itemId}'.`);
      return false;
    }

    let progressed = false;
    for (const obj of matching) {
      const inc = amount || 0;
      const before = obj.currentCount;
      obj.currentCount = Math.min(obj.targetCount, obj.currentCount + inc);
      if (obj.currentCount !== before) progressed = true;
      if (obj.currentCount >= obj.targetCount) {
        obj.isCompleted = true;
        console.log(`[QuestManager] Objective completed: ${obj.objectiveId}`);
      } else {
        console.log(`[QuestManager] Objective progress '${obj.objectiveId}': ${obj.currentCount}/${obj.targetCount}`);
      }
    }

    if (progressed) {
      // SFX/VFX for the collector prior to destroy
      this.playCollectionSoundForPlayer(player, entityId);
      this.playCollectionVfxForPlayer(player, entityId);

      if (entityId != null) {
        this.sendNetworkBroadcastEvent(EventsService.AssetEvents.DestroyAsset, { entityId, player });
      }

      // Check if all objectives done -> quest completed
      const allDone = quest.objectives.every((o: QuestObjective) => o.isCompleted);
      if (allDone) {
        quest.status = QuestStatus.Completed;
        console.log(`[QuestManager] Quest completed: ${quest.questId}`);
        this.sendLocalBroadcastEvent(EventsService.QuestEvents.QuestCompleted, { player, questId: quest.questId });
      } else {
        quest.status = QuestStatus.InProgress;
      }
      return true;
    }
    return false;
  }

  private playCollectionSoundForPlayer(player: hz.Player, entityId?: string) {
    try {
      const soundEntity = this.props.collectSound as hz.Entity | undefined;
      const audio = soundEntity?.as(hz.AudioGizmo);
      if (!audio) return;

      const options: hz.AudioOptions = {
        fade: 0,
        players: [player],
        audibilityMode: hz.AudibilityMode.AudibleTo,
      };
      audio.play(options);
    } catch { }
  }

  private playCollectionVfxForPlayer(player: hz.Player, entityId?: string) {
    try {
      const vfxEntity = this.props.collectVfx as hz.Entity | undefined;
      const particle = vfxEntity?.as(hz.ParticleGizmo);
      if (!particle) return;

      // Position the particle where the item was collected, if available
      if (entityId) {
        try {
          const idBig = BigInt(entityId);
          const e = new hz.Entity(idBig);
          const pos = e.position.get();
          try { vfxEntity!.position.set(pos); } catch {}
        } catch {}
      }

      const options: hz.ParticleFXPlayOptions = {
        fromStart: true,
        oneShot: true,
        players: [player],
      };
      particle.play(options);
    } catch {}
  }

  private completeTutorialForPlayer(player: hz.Player) {

  }

  private async onQuestStarted(payload: QuestPayload) {
    const { player, questId } = payload;
    if (!player || !questId) return;
    const quest = this.ensureActiveQuest(player, questId, true);
    if (!quest) return;
    this.playerHasBag.set(player, false);
    await this.spawnStorageBagForPlayer(player);
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

  // Ensure the player has an active quest instance cloned from the definitions
  private ensureActiveQuest(player: hz.Player, questId: string, createIfMissing: boolean = false): Quest | null {
    let quest = this.activeQuestByPlayer.get(player);
    if (!quest || quest.questId !== questId) {
      if (!createIfMissing) return null;
      const def = QUEST_DEFINITIONS[questId];
      if (!def) return null;
      quest = deepCloneQuest(def);
      this.activeQuestByPlayer.set(player, quest);
    }
    return quest;
  }

  // Legacy stage helpers removed; dialog should query quest/objective state directly moving forward.



}
hz.Component.register(QuestManager);

// Utilities – clone a quest definition and ensure per-player state
function deepCloneQuest(def: Quest): Quest {
  return {
    ...def,
    objectives: def.objectives.map(o => ({ ...o })),
  };
}

