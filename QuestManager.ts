import * as hz from 'horizon/core';
import { VARIABLE_GROUPS } from 'constants';
import { PlayerState } from 'constants';
import { EventsService, QuestSubmitCollectProgress, QuestPayload, QUEST_DEFINITIONS, Quest, QuestObjective, ObjectiveType, QuestStatus, QuestProgressUpdatedPayload } from 'constants';
import { PlayerStateService } from 'PlayerStateService';
import { QuestHUD } from 'QuestHUD';

class QuestManager extends hz.Component<typeof QuestManager> {
  static propsDefinition = {
    questHud: { type: hz.PropTypes.Entity },
    // Asset to spawn for the player's storage bag
    storageBagAsset: { type: hz.PropTypes.Asset },
    // Optional: an AudioGizmo entity to play when a quest item is collected
    collectSound: { type: hz.PropTypes.Entity },
    // Optional: a ParticleGizmo entity to play when a quest item is collected
    collectVfx: { type: hz.PropTypes.Entity },
  };

  preStart(): void {
    // When tutorial quest is started, mark stage and spawn bag
    this.connectLocalBroadcastEvent(
      EventsService.QuestEvents.QuestStarted,
      (payload: QuestPayload) => this.onQuestStarted(payload)
    );

    // TODO BELOW


    // --- Quest submission handlers ---
    this.connectNetworkBroadcastEvent(
      EventsService.QuestEvents.SubmitQuestCollectProgress,
      this.checkQuestCollectionSubmission.bind(this)
    );


    // Handle generic quest submissions (e.g., Talk/Hunt tokens)
    this.connectLocalBroadcastEvent(
      EventsService.QuestEvents.CheckPlayerQuestSubmission,
      (payload) => this.onGenericQuestSubmission(payload)
    );
  }

  start() { }

  // VERIFIED
  private async onQuestStarted(payload: QuestPayload) {
    console.log("BLAH")

    const { player, questId } = payload;
    console.log(`[QuestManager] Quest started event received: questId=${questId}, player=${player?.name.get()}`);

    if (!player || !questId) {
      console.error('[QuestManager] Invalid QuestStarted payload');
      return;
    }

    const questDAO = PlayerStateService.instance?.getTutorialDAO(player);
    if (!questDAO) {
      console.error('[QuestManager] Could not get quest DAO for player');
      return;
    }
    const questLog = questDAO.getQuestLog(questId);
    if (questLog.status !== 'InProgress') {
      console.warn(`[QuestManager] Quest ${questId} not in progress for ${player.name.get()}`);
      return;
    }
    await this.spawnStorageBagForPlayer(player);

    const inventoryDAO = PlayerStateService.instance.getInventoryDAO(player);
    if (inventoryDAO) {
      inventoryDAO.setIsStorageBagAcquired(true);
      console.log(`[QuestManager] Storage bag marked as acquired for ${player.name.get()}`);
    }

    this.sendNetworkBroadcastEvent(EventsService.QuestEvents.DisplayQuestHUD, { player, questId: questId, title: "Weeee" });

    this.sendLocalBroadcastEvent(EventsService.QuestEvents.QuestProgressUpdated, {
      player,
      questId: questId,
      stage: questLog.currentStepIndex.toString() // or map to TUTORIAL_QUEST_STAGES enum
    });
    console.log(`[QuestManager] Quest started successfully for ${player.name.get()}`);
  }

  // TODO BELOW


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
    const completedNow: QuestObjective[] = [];
    for (const obj of matching) {
      const inc = amount || 0;
      const before = obj.currentCount;
      const after = Math.min(obj.targetCount, obj.currentCount + inc);
      obj.currentCount = after;
      if (after !== before) progressed = true;
      if (after >= obj.targetCount && !obj.isCompleted) {
        obj.isCompleted = true;
        completedNow.push(obj);
        console.log(`[QuestManager] Objective completed: ${obj.objectiveId}`);
      } else {
        console.log(`[QuestManager] Objective progress '${obj.objectiveId}': ${obj.currentCount}/${obj.targetCount}`);
      }

      // --- NEW: Persist objective progress ---
      if (PlayerStateService.instance) {
        // PlayerStateService.instance.updateQuestObjective(
        //   player,
        //   quest.questId,
        //   obj.objectiveId,
        //   obj.currentCount,
        //   obj.targetCount,
        //   obj.isCompleted
        // );
      }
    }

  if (progressed) {
      // SFX/VFX for the collector prior to destroy
      this.playCollectionSoundForPlayer(player, entityId);
      this.playCollectionVfxForPlayer(player, entityId);

      // If this action completed one or more objectives, notify the player
      if (completedNow.length > 0) {
        this.notifyObjectiveCompletion(player, quest, completedNow);
        // NEW: Check if we should advance to next step
        // this.checkAndAdvanceQuestStep(player, quest);
      }

      if (entityId != null) {
        this.sendNetworkBroadcastEvent(EventsService.AssetEvents.DestroyAsset, { entityId, player });
      }

      // Emit progress update for dialog gating
      this.emitQuestProgressUpdated(player, quest);

      // Check if all objectives done -> quest completed
      const allDone = quest.objectives.every((o: QuestObjective) => o.isCompleted);
      if (allDone) {
        quest.status = QuestStatus.Completed;
        console.log(`[QuestManager] Quest completed: ${quest.questId}`);

        // --- NEW: Persist completion ---
        if (PlayerStateService.instance) {
          // PlayerStateService.instance.completeQuest(player, quest.questId);
        }
        // this.hud?.hide();
        this.sendLocalBroadcastEvent(EventsService.QuestEvents.QuestCompleted, { player, questId: quest.questId });
        this.emitQuestProgressUpdated(player, quest);
      } else {
        quest.status = QuestStatus.InProgress;
      }
      return true;
    }
    return false;
  }




  // --- MODIFIED: onGenericQuestSubmission now persists progress ---
  // Handle local submissions such as Talk/Hunt tokens emitted by NPC or enemies
  private onGenericQuestSubmission(payload: { player: hz.Player; itemType: string; amount: number }) {
    const { player, itemType, amount } = payload || ({} as any);
    if (!player || !itemType) return false as any;
    const quest = this.ensureActiveQuest(player, 'tutorial_survival');
    if (!quest) return false as any;

    // Determine objective type from token prefix
    let type: ObjectiveType | undefined = undefined;
    if (itemType.startsWith('npc:')) type = ObjectiveType.Talk;
    else if (itemType === 'chicken' || itemType.startsWith('enemy:') || itemType.startsWith('enemy-')) type = ObjectiveType.Hunt;
    else type = undefined;

    if (!type) return false as any;

    const matching = quest.objectives.filter(o => !o.isCompleted && o.type === type && o.targetType === itemType);
    if (matching.length === 0) return false as any;

    let progressed = false;
    const completedNow: QuestObjective[] = [];
    for (const obj of matching) {
      const inc = amount || 0;
      const before = obj.currentCount;
      const after = Math.min(obj.targetCount, obj.currentCount + inc);
      obj.currentCount = after;
      if (after !== before) progressed = true;

      if (after >= obj.targetCount && !obj.isCompleted) {
        obj.isCompleted = true;
        completedNow.push(obj);
      }

      // --- NEW: Persist objective progress ---
      if (PlayerStateService.instance) {
        // PlayerStateService.instance.updateQuestObjective(
        //   player,
        //   quest.questId,
        //   obj.objectiveId,
        //   obj.currentCount,
        //   obj.targetCount,
        //   obj.isCompleted
        // );
      }
    }

    if (!progressed) return false as any;

    if (completedNow.length > 0) {
      this.notifyObjectiveCompletion(player, quest, completedNow);
    }

    // Emit progress updated for dialog gating
    this.emitQuestProgressUpdated(player, quest);

    // Check completion
    const allDone = quest.objectives.every(o => o.isCompleted);
    if (allDone) {
      quest.status = QuestStatus.Completed;
      // --- NEW: Persist completion ---
      if (PlayerStateService.instance) {
        // PlayerStateService.instance.completeQuest(player, quest.questId);
      }
      this.sendLocalBroadcastEvent(EventsService.QuestEvents.QuestCompleted, { player, questId: quest.questId });
    } else {
      quest.status = QuestStatus.InProgress;
    }
    return true as any;
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

  private notifyObjectiveCompletion(player: hz.Player, quest: Quest, completedObjectives: QuestObjective[]) {
    try {
      // Reuse collectSound as completion cue
      this.playCollectionSoundForPlayer(player);

      const completedNames = completedObjectives.map(o => o.description || o.objectiveId).join(', ');
      const next = quest.objectives.find((o: QuestObjective) => !o.isCompleted);
      const nextMsg = next ? `Next: ${next.description}` : `Quest complete!`;
      this.world.ui.showPopupForPlayer(
        player,
        `Objective complete: ${completedNames}\n${nextMsg}`,
        3
      );
    } catch { }
  }


  private async spawnStorageBagForPlayer(player: hz.Player) {
    try {
      const asset = this.props.storageBagAsset as hz.Asset;
      if (!asset) {
        console.warn('[QuestManager] storageBagAsset not set; cannot spawn bag.');
        return;
      }

      /** How far in front of the player to spawn the item (in meters). */
      const ITEM_SPAWN_FORWARD_DISTANCE = 12.0;
      /** How high up from the player's position to spawn the item (in meters). */
      const ITEM_SPAWN_UP_OFFSET = 2.0;

      // Bag spawn position
      const playerPos = player.position.get();
      const playerForward = player.forward.get();

      // Normalize the forward vector on the XZ plane to prevent spawning up/down hills
      const flatForward = new hz.Vec3(playerForward.x, 0, playerForward.z).normalize();

      // Calculate the offset
      const offset = flatForward.mul(ITEM_SPAWN_FORWARD_DISTANCE).add(new hz.Vec3(0, ITEM_SPAWN_UP_OFFSET, 0));

      // Final spawn position
      const spawnPos = playerPos.add(offset);

      const spawned = await this.world.spawnAsset(asset, spawnPos);


      const root = spawned?.[0];
      if (!root) return;
      // Prefer visible world spawn so player can pick it up
      root.visible.set(true);
      // Ownership can help scripts resolve player interactions
      try { root.owner.set(player); } catch { }
      // this.spawnedBagByPlayer.set(player, root);
      console.log(`[QuestManager] Spawned storage bag for ${player.name.get()} at`, spawnPos);
    } catch (e) {
      console.warn('[QuestManager] Failed to spawn storage bag', e);
    }
  }

  // Ensure the player has an active quest instance cloned from the definitions
  private ensureActiveQuest(player: hz.Player, questId: string, createIfMissing: boolean = false): Quest | null {
    // let quest = this.activeQuestByPlayer.get(player);
    // if (!quest || quest.questId !== questId) {
    //   if (!createIfMissing) return null;
    //   const def = QUEST_DEFINITIONS[questId];
    //   if (!def) return null;
    //   quest = deepCloneQuest(def);
    //   this.activeQuestByPlayer.set(player, quest);
    // }
    return null
  }



  private emitQuestProgressUpdated(player: hz.Player, quest: Quest) {
    try {
      const stage = this.computeStageFor(quest);
      console.log(`[QuestManager] Emitting QuestProgressUpdated for ${player.name.get()}: Quest=${quest.questId}, Stage=${stage}`);
      const payload: QuestProgressUpdatedPayload = { player, questId: quest.questId, stage, quest };
      this.sendLocalBroadcastEvent(EventsService.QuestEvents.QuestProgressUpdated, payload);
    } catch { }
  }

  // Map quest state to DialogScript QuestStage for dialog gating
  private computeStageFor(quest: Quest): string {
    if (!quest) return 'NotStarted';
    if (quest.status === QuestStatus.Completed) return 'Complete';
    // Determine next incomplete objective and map to stage
    const next = quest.objectives.find(o => !o.isCompleted);
    if (!next) return 'Complete';
    switch (next.type) {
      case ObjectiveType.Collect:
        return 'Collecting';
      case ObjectiveType.Talk:
        return 'ReturnToNPC';
      case ObjectiveType.Hunt:
        return 'Hunting';
      default:
        return 'NotStarted';
    }
  }


}
hz.Component.register(QuestManager);

// Utilities – clone a quest definition and ensure per-player state
function deepCloneQuest(def: Quest): Quest {
  return {
    ...def,
    objectives: def.objectives.map(o => ({ ...o })),
  };
}

