import * as hz from 'horizon/core';
import { VARIABLE_GROUPS } from 'constants';
import { PlayerState } from 'constants';
import { EventsService, ISubmitQuestCollectProgress, QuestPayload, QUEST_DEFINITIONS, Quest, QuestObjective, ObjectiveType, QuestStatus, QuestProgressUpdatedPayload } from 'constants';
import { PlayerStateService } from 'PlayerStateService';
import { QuestLog } from 'TutorialQuestDAO';


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

    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnPlayerEnterWorld,
      (player: hz.Player) => this.onPlayerEnterWorld(player)
    );

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

  /* NEW FUUNCTIONS WORKED ON MANUALLY */
  private onPlayerEnterWorld = (player: hz.Player) => {
    this.props.questHud?.owner.set(player);
    console.log(`[QuestManager] Player ${player.id} entered world - Transfering Ownership.`);

    const tutorialDao = PlayerStateService.instance?.getTutorialDAO(player);
    const isQuestActive = tutorialDao?.getActiveQuestId();


    if (isQuestActive) {
      this.async.setTimeout(() => {
        this.sendNetworkEvent(player, EventsService.QuestEvents.DisplayQuestHUD, { player, title: "Tutorial", questId: "tutorial_quest", visible: true, objective: "Collect 0/5 Coconuts." });
      }, 1500);
    }
  }


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

    this.sendNetworkEvent(player, EventsService.QuestEvents.DisplayQuestHUD, { player, title: "Tutorial", questId: "tutorial_quest", visible: true, objective: "Collect 0/5 Coconuts." });
    console.log(`[QuestManager] Quest started successfully for ${player.name.get()}`);
  }






  private checkQuestCollectionSubmission(payload: ISubmitQuestCollectProgress): any {
    const { itemId, player, amount, entityId } = payload;
    console.log(`[QuestManager] - Checking quest collection submission for item: ${itemId} by player: ${player.name.get()} with amount: ${amount}`);

    // --- 1. Get DAO and Active Quest ---
    const questDAO = PlayerStateService.instance?.getTutorialDAO(player);
    if (!questDAO) {
      console.error(`[QuestManager] Could not get TutorialDAO for player ${player.name.get()}`);
      this.world.ui.showPopupForPlayer(player, "Error: Could not access player quest data.", 3); // Native UI Popup
      return false;
    }

    const activeQuestId = questDAO.getActiveQuestId();
    if (!activeQuestId) {
      console.log(`[QuestManager] No active quest found for player ${player.name.get()}`);
    // Don't show popup here - player might just not have a quest active
      return false;
    }

    console.log("ACTIVE Quest ID: ", activeQuestId);

    const quest = questDAO.getQuestLog(activeQuestId);
    if (!quest || quest.status !== QuestStatus.InProgress) {
      console.warn(`[QuestManager] Quest ${activeQuestId} not found or not in progress for ${player.name.get()}`);
      return false; // Quest might have been completed or removed
    }



    // --- 2. Get Static Quest Definition ---
    const questDef = QUEST_DEFINITIONS[activeQuestId];
    if (!questDef) {
      console.error(`[QuestManager] Quest definition not found for quest ID: ${activeQuestId}`);
      this.world.ui.showPopupForPlayer(player, "Error: Quest definition missing.", 3); // Native UI Popup
      return false;
    }

    console.log("ACTIVE Quest DEF: ", questDef);

    // --- 3. Find Matching Objective Definitions ---
    const matchingObjectiveDefs = questDef.objectives.filter(
      (oDef) => oDef.type === ObjectiveType.Collect && oDef.targetType === itemId
    );

    console.log("MATCHING OBJECTIVES: ", matchingObjectiveDefs);

    if (matchingObjectiveDefs.length === 0) {
      console.log(`[QuestManager] No matching *collect* objectives for item '${itemId}' in quest '${activeQuestId}'.`);
      // It's possible the item is for a different quest or not quest-related
      // Only show popup if maybe expected? For now, just log.
      // this.world.ui.showPopupForPlayer(player, `Cannot use '${itemId}' for the current quest objective.`, 3);
      return false;
    }


    // --- 4. Process Progress ---
    let progressedOverall = false;
    const completedNowDefs: QuestObjective[] = []; // Store definitions for descriptions

    for (const objDef of matchingObjectiveDefs) {
      console.log("PROCESSING OBJECTIVE DEF: ", objDef);
      console.log("QUEEEST: ", quest);
      // Get LIVE progress state for this objective
      const objectiveProgress = quest.objectives[objDef.objectiveId];
      console.log("OBJECTIVE PROGRESS: ", objectiveProgress);
      if (!objectiveProgress) {
        console.error(`[QuestManager] Progress data missing for objective ${objDef.objectiveId} in quest ${quest.questId}. Initializing.`);
        // Initialize if missing (shouldn't happen with proper quest start)
        quest.objectives[objDef.objectiveId] = {
          objectiveId: objDef.objectiveId,
          currentCount: 0,
          isCompleted: false,

        };
        // Re-assign for safety
        const newObjectiveProgress = quest.objectives[objDef.objectiveId];
        if (!newObjectiveProgress) {
          console.error("Failed to initialize objective progress even after attempting.");
          continue; // Skip this objective if initialization failed
        }
      }
      console.log("UPDATED OBJECTIVE PROGRESS: ", objectiveProgress);
      // Check if already completed
      if (objectiveProgress.isCompleted) {
        continue; // Skip already completed objectives
      }

      // Calculate new count
      const before = objectiveProgress.currentCount;
      const after = Math.min(objDef.targetCount, before + amount);

      if (after > before) {
        objectiveProgress.currentCount = after; // MUTATE live quest object
        progressedOverall = true;
        console.log(`[QuestManager] Objective progress '${objDef.objectiveId}': ${after}/${objDef.targetCount}`);

        if (after >= objDef.targetCount) {
          objectiveProgress.isCompleted = true; // MUTATE live quest object
          completedNowDefs.push(objDef); // Add definition for notification text
          console.log(`[QuestManager] Objective completed: ${objDef.objectiveId}`);
        }

        questDAO.updateQuestObjective(
          quest.questId, // Pass questId
          objDef.objectiveId, // Pass objectiveId
          objectiveProgress.currentCount, // Pass updated count
          objectiveProgress.isCompleted // Pass updated completion status
        );
      }
    } // End loop through matching objectives


    // --- 5. Handle Results of Progress ---
    // if (progressedOverall) {
    //     console.log("Playing SFX/VFX and handling post-progress actions.");
    //     // SFX/VFX
    //     this.playCollectionSoundForPlayer(player, entityId);
    //     this.playCollectionVfxForPlayer(player, entityId);

    //     // Notify player about completed objectives
    //     if (completedNowDefs.length > 0) {
    //       console.log(`Notifying player about completed objectives: ${completedNowDefs.map(def => def.objectiveId).join(', ')}`);
    //       this.notifyObjectiveCompletion(player, quest, completedNowDefs);
    //        // console.error("notifyObjectiveCompletion not called - needs refactoring"); // Keep if notify func needs work
    //     }

    //     // Destroy the collected item entity
    //     if (entityId != null) {
    //        console.log(`Destroying collected entity: ${entityId}`);
    //       this.sendNetworkBroadcastEvent(EventsService.AssetEvents.DestroyAsset, { entityId, player });
    //     }

    //     // Emit progress update for UI/Dialogues
    //     console.log("Emitting QuestProgressUpdated event.");
    //     this.emitQuestProgressUpdated(player, quest); // Pass the mutated quest object

    //     // --- Check for Quest Completion ---
    //     const allObjectivesCompleted = questDef.objectives.every(
    //       (oDef) => quest.objectives[oDef.objectiveId]?.isCompleted // Check mutated quest object
    //     );
    //     console.log(`Checking quest completion. All objectives completed: ${allObjectivesCompleted}`);


    //     if (allObjectivesCompleted) {
    //       // Only update status if not already completed
    //       if (quest.status !== QuestStatus.Completed) {
    //           quest.status = QuestStatus.Completed;
    //           console.log(`Quest completed: ${quest.questId}. Updating status.`);

    //           // --- SAVE COMPLETION STATUS via DAO ---
    //           questDAO.completeQuest(quest.questId); // Use the dedicated DAO function
    //           console.log(`Saved quest completion status via DAO.`);
    //           // ------------------------------------

    //           // Notify other systems
    //           console.log("Sending QuestCompleted local event.");
    //           this.sendLocalBroadcastEvent(EventsService.QuestEvents.QuestCompleted, { player, questId: quest.questId });

    //           // Update UI/Dialogues one last time
    //           console.log("Emitting final QuestProgressUpdated event for completion.");
    //           this.emitQuestProgressUpdated(player, quest);

    //           // Show popup
    //            console.log("Showing quest completion popup.");
    //           this.world.ui.showPopupForPlayer(player, `Quest Complete: ${questDef.title}!`, 5);
    //            // TODO: Handle quest rewards, next quest logic, etc.
    //        } else {
    //            console.log(`Quest ${quest.questId} was already marked as completed.`);
    //        }

    //     } else {
    //       // Quest still in progress
    //       // Ensure status is correct if somehow changed, though it shouldn't have
    //       if (quest.status !== QuestStatus.InProgress) {
    //           console.warn(`Quest ${quest.questId} status was not InProgress after objective updates. Setting back.`);
    //           quest.status = QuestStatus.InProgress;
    //           // Optionally save this status change if it happened, though it's likely an anomaly
    //           // questDAO.updateQuestStatus(quest.questId, QuestStatus.InProgress); // Assumes such a function exists or modify saveState
    //       }
    //     }
    //     return true; // Progress was made
    //   } else {
    //        console.log(`No overall progress made for item ${itemId}.`);
    //        return false; // No progress was made overall
    //   }

  }

  private emitQuestProgressUpdated(player: hz.Player, quest: Quest) { // Pass the LIVE quest object
    try {
      // const stage = this.computeStageFor(quest); // Compute stage based on LIVE data
      console.error(`[QuestManager] Emitting QuestProgressUpdated for ${player.name.get()}: Quest=${quest.questId},`);

      // Payload includes the live quest object for potential UI updates
      // const payload: QuestProgressUpdatedPayload = { player, questId: quest.questId, stage, quest };
      // Send LOCAL event - other server scripts might react (like DialogScript)
      // this.sendLocalBroadcastEvent(EventsService.QuestEvents.QuestProgressUpdated, payload);

      // TODO: Send a NETWORK event specifically for the player's HUD update
      // This needs a new event type or modification of DisplayQuestHUD
      // Example:
      // const objectiveText = this.getCurrentObjectiveText(quest); // Needs implementation
      // this.sendNetworkEvent(player, EventsService.QuestEvents.UpdateQuestHUDObjective, { questId: quest.questId, objective: objectiveText });

    } catch (e) {
      console.error("[QuestManager] Error emitting progress update", e);
    }
  }

  // Map LIVE quest state to DialogScript QuestStage for dialog gating
  private computeStageFor(quest: Quest): string { // Pass the LIVE quest object
    if (!quest) return 'NotStarted'; // Should not happen if called correctly
    if (quest.status === QuestStatus.Completed) return 'Complete';
    if (quest.status === QuestStatus.NotStarted) return 'NotStarted'; // Although we usually check InProgress

    // Get static definition to know the order and types of objectives
    const questDef = QUEST_DEFINITIONS[quest.questId];
    if (!questDef) {
      console.error(`[QuestManager] Cannot compute stage, definition missing for ${quest.questId}`);
      return 'NotStarted'; // Fallback
    }

    // Find the *first* objective definition whose progress is NOT marked as completed in the LIVE quest object
    for (const objDef of questDef.objectives) {
      const objectiveProgress = quest.objectives[objDef.objectiveId as any];
      // Check if progress exists and is NOT completed
      if (!objectiveProgress || !objectiveProgress.isCompleted) {
        // Map this objective's type to a stage name
        switch (objDef.type) {
          case ObjectiveType.Collect:
            return 'Collecting'; // Example stage name
          case ObjectiveType.Talk:
            // Check if requirements met, maybe needs different stage like 'ReadyToTalk' vs 'GoTalk'
            return 'ReturnToNPC'; // Example stage name
          case ObjectiveType.Hunt:
            return 'Hunting'; // Example stage name
          // Add cases for other objective types
          default:
            console.warn(`[QuestManager] Unhandled objective type for stage computation: ${objDef.type}`);
            return 'InProgress'; // Generic fallback stage
        }
      }
    }

    // If we looped through all definitions and all corresponding progress entries are completed
    console.warn(`[QuestManager] computeStageFor reached end, but quest status is ${quest.status}. Marking Complete.`);
    return 'Complete'; // Should ideally align with quest.status being Completed already
  }




  /* OLDER FUNCTIONS TO BE EXPLORED */


  // --- MODIFIED: onGenericQuestSubmission now persists progress ---
  // Handle local submissions such as Talk/Hunt tokens emitted by NPC or enemies
  private onGenericQuestSubmission(payload: { player: hz.Player; itemType: string; amount: number }) {
    console.error("WARNING VIST ME VIST ME")
    console.error("WARNING WARNING VIST ME VIST ME")
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
      // this.notifyObjectiveCompletion(player, quest, completedNow);
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

  private notifyObjectiveCompletion(player: hz.Player, quest: QuestLog, completedObjectives: QuestObjective[]) {
    try {

      this.playCollectionSoundForPlayer(player);
      const completedNames = completedObjectives.map(o => o.description || o.objectiveId).join(', ');
      this.world.ui.showPopupForPlayer(
        player,
        `Objective complete: ${completedNames}`,
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





}
hz.Component.register(QuestManager);
