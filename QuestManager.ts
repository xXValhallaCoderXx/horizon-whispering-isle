import * as hz from 'horizon/core';
import { EventsService, ISubmitQuestCollectProgress, QuestPayload } from 'constants';
import { PlayerStateService } from 'PlayerStateService';
import { TUTORIAL_QUEST_KEY, QuestStatus, QuestMessageDisplay, QuestStageConfig } from 'TutorialQuestDAO';
import { SoundFxBank } from 'SoundFxBank';
import { VisualFxBank } from 'VisualFxBank';

class QuestManager extends hz.Component<typeof QuestManager> {
  static propsDefinition = {
    questHud: { type: hz.PropTypes.Entity },
    // Asset to spawn for the player's storage bag
    storageBagAsset: { type: hz.PropTypes.Asset },
    storageBagSpawnPoint: { type: hz.PropTypes.Entity },
    starterAxeAsset: { type: hz.PropTypes.Asset },
    starterAxeSpawnPoint: { type: hz.PropTypes.Entity },
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

    this.connectLocalBroadcastEvent(
      EventsService.QuestEvents.RefreshQuestHUD,
      (payload: QuestPayload) => this.onRefreshQuestHUD(payload)
    );

    // TODO - Hack for now remove later
    this.connectLocalBroadcastEvent(
      EventsService.QuestEvents.SpawnPlayerQuestReward,
      (payload: QuestPayload) => this.spawnStarterAxeForPlayer(payload.player)
    );

    // TODO BELOW


    // --- Quest submission handlers ---
    this.connectNetworkBroadcastEvent(
      EventsService.QuestEvents.SubmitQuestCollectProgress,
      this.checkQuestCollectionSubmission.bind(this)
    );



  }

  start() { }

  /* NEW FUUNCTIONS WORKED ON MANUALLY */
  private onPlayerEnterWorld = (player: hz.Player) => {
    this.props.questHud?.owner.set(player);
    console.log(`[QuestManager] Player ${player.id} entered world - Transfering Ownership.`);

    const tutorialDao = PlayerStateService.instance?.getTutorialDAO(player);
    const activeQuestId = tutorialDao?.getActiveQuestId();


    if (activeQuestId) {
      this.async.setTimeout(() => {
        const objectiveText = this.getQuestObjectiveText(player, activeQuestId);
        this.sendNetworkEvent(player, EventsService.QuestEvents.DisplayQuestHUD, {
          player,
          title: "Tutorial",
          questId: activeQuestId,
          visible: true,
          objective: objectiveText
        });
      }, 1500);
    }
  }

  private onRefreshQuestHUD(payload: QuestPayload): void {
    const { player, questId } = payload;

    console.log(`[QuestManager] Refreshing HUD for ${player.name.get()}`);

    const questDAO = PlayerStateService.instance?.getTutorialDAO(player);
    if (!questDAO) {
      console.error(`[QuestManager] Could not get TutorialDAO for player`);
      return;
    }

    const quest = questDAO.getQuestLog(questId);
    if (!quest) {
      console.error(`[QuestManager] Could not find quest log`);
      return;
    }

    // Get current stage config for transition message
    const stageConfig = questDAO.getStageByStepIndex(quest.currentStepIndex);
    if (stageConfig) {
      // Show transition message
      // this.world.ui.showPopupForPlayer(player, stageConfig.description, 4);
    }

    // Update HUD with new objective
    const objectiveText = this.getQuestObjectiveText(player, questId);
    this.sendNetworkEvent(player, EventsService.QuestEvents.DisplayQuestHUD, {
      player,
      title: "Tutorial",
      questId: questId,
      visible: true,
      objective: objectiveText
    });
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
    questDAO.setActiveQuest(TUTORIAL_QUEST_KEY, 1);
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

    const objectiveText = this.getQuestObjectiveText(player, questId);
    this.sendNetworkEvent(player, EventsService.QuestEvents.DisplayQuestHUD, {
      player,
      title: "Tutorial",
      questId: questId,
      visible: true,
      objective: objectiveText
    });
    console.log(`[QuestManager] Quest started successfully for ${player.name.get()}`);
  }






  private checkQuestCollectionSubmission(payload: ISubmitQuestCollectProgress): any {
    const { itemId, player, amount, entityId } = payload;
    console.log(`[QuestManager] - Checking quest collection submission for item: ${itemId} by player: ${player.name.get()} with amount: ${amount}`);

    // --- 1. Get DAO and Active Quest ---
    const questDAO = PlayerStateService.instance?.getTutorialDAO(player);
    if (!questDAO) {
      console.error(`[QuestManager] Could not get TutorialDAO for player ${player.name.get()}`);
      return false;
    }

    const activeQuestId = questDAO.getActiveQuestId();
    if (!activeQuestId) {
      console.log(`[QuestManager] No active quest - adding to inventory instead`);
      // ← NEW: Add to inventory fallback
      const inventoryDAO = PlayerStateService.instance?.getInventoryDAO(player);
      if (inventoryDAO && inventoryDAO.getIsStorageBagAcquired()) {
        inventoryDAO.addItem(itemId, amount);
        console.log(`[QuestManager] Added ${amount}x ${itemId} to inventory`);

        // Play feedback
        if (entityId) {
          const latestInventory = inventoryDAO.getAllItems()
          this.playCollectionSoundForPlayer(player, entityId);
          this.sendNetworkBroadcastEvent(EventsService.AssetEvents.DestroyAsset, { entityId, player });
          this.sendNetworkEvent(player, EventsService.PlayerEvents.RefreshInventoryHUD, {
            player,
            inventory: latestInventory,
          });
        }

        // Optional: show popup
        this.world.ui.showPopupForPlayer(player, `Collected ${itemId}`, 2);
      } else {
        this.world.ui.showPopupForPlayer(player, `No storage bag`, 2);
      }
      return false; // Still return false for quest purposes, but item was collected
    }



    const quest = questDAO.getQuestLog(activeQuestId);
    if (!quest || quest.status !== QuestStatus.InProgress) {
      console.warn(`[QuestManager] Quest ${activeQuestId} not found or not in progress for ${player.name.get()}`);
      return false; // Quest might have been completed or removed
    }



    // --- 2. Get Static Quest Definition ---
    const stageConfig = questDAO.getStageByStepIndex(quest.currentStepIndex);
    if (!stageConfig || !stageConfig.objectives) {
      console.warn(`[QuestManager] No stage config found for step ${quest.currentStepIndex}`);
      return false;
    }

    // --- 3. Find Matching Objective Definitions ---
    const matchingObjectiveDef = stageConfig.objectives.find(
      obj => obj.itemType === itemId
    );

    if (!matchingObjectiveDef) {
      console.log(`[QuestManager] Item '${itemId}' not needed for quest - adding to inventory`);
      // ← NEW: Add to inventory fallback
      const inventoryDAO = PlayerStateService.instance?.getInventoryDAO(player);
      if (inventoryDAO && inventoryDAO.getIsStorageBagAcquired()) {
        inventoryDAO.addItem(itemId, amount);
        console.log(`[QuestManager] Added ${amount}x ${itemId} to inventory`);

        // Play feedback
        if (entityId) {
          const latestInventory = inventoryDAO.getAllItems()
          this.playCollectionSoundForPlayer(player, entityId);
          this.sendNetworkBroadcastEvent(EventsService.AssetEvents.DestroyAsset, { entityId, player });
          this.sendNetworkEvent(player, EventsService.PlayerEvents.RefreshInventoryHUD, {
            player,
            inventory: latestInventory,
          });
        }

        // Optional: show popup
        this.world.ui.showPopupForPlayer(player, `Collected ${itemId}`, 2);
      } else {
        this.world.ui.showPopupForPlayer(player, `No storage bag`, 2);
      }
      return false;
    }


    // --- 4. Process Progress ---
    const objectiveProgress = quest.objectives[matchingObjectiveDef.objectiveId];

    if (!objectiveProgress) {
      console.error(`[QuestManager] Progress data missing for objective ${matchingObjectiveDef.objectiveId}`);
      return false;
    }

    if (objectiveProgress.isCompleted) {
      console.log(`[QuestManager] Objective already completed`);
      if (entityId) {
        this.sendNetworkBroadcastEvent(EventsService.AssetEvents.DestroyAsset, { player, entityId });
      }
      return false;
    }

    // Calculate new count
    const before = objectiveProgress.currentCount;
    const after = Math.min(matchingObjectiveDef.targetCount, before + amount);

    if (after > before) {
      objectiveProgress.currentCount = after;
      console.log(`[QuestManager] Objective progress '${matchingObjectiveDef.objectiveId}': ${after}/${matchingObjectiveDef.targetCount}`);

      const wasCompleted = after >= matchingObjectiveDef.targetCount;
      if (wasCompleted) {
        objectiveProgress.isCompleted = true;
        console.log(`[QuestManager] Objective completed: ${matchingObjectiveDef.objectiveId}`);
      }

      // Save progress
      questDAO.updateQuestObjective(
        quest.questId,
        matchingObjectiveDef.objectiveId,
        objectiveProgress.currentCount,
        objectiveProgress.isCompleted
      );

      if (entityId) {
        console.log(`[QuestManager] Sending destroy request for entityId=${entityId}`);
        this.playCollectionSoundForPlayer(player, entityId);
        if (matchingObjectiveDef.objectiveId !== "collect_storage_bag") {
          this.sendNetworkBroadcastEvent(EventsService.AssetEvents.DestroyAsset, { entityId, player });
        }

      }


      // Update HUD with simple format
      const objectiveText = this.getQuestObjectiveText(player, activeQuestId);
      this.sendNetworkEvent(player, EventsService.QuestEvents.DisplayQuestHUD, {
        player,
        title: "Tutorial",
        questId: activeQuestId,
        visible: true,
        objective: objectiveText
      });

      // --- 5. Handle Objective Completion ---
      if (wasCompleted) {
        // Play sound and VFX

        this.playCollectionVfxForPlayer(player, entityId);

        // Show completion popup
        // this.world.ui.showPopupForPlayer(
        //   player,
        //   `✓ ${matchingObjectiveDef.description}`,
        //   3
        // );
        console.error(`[QuestManager] Objective completed popup for ${player.name.get()}: ${matchingObjectiveDef.description}`);

        // Check if all objectives in current stage are complete
        const allStageObjectivesComplete = stageConfig.objectives.every(
          obj => quest.objectives[obj.objectiveId]?.isCompleted
        );

        if (allStageObjectivesComplete) {
          console.log(`[QuestManager] All objectives complete for step ${quest.currentStepIndex}`);

          // Advance to next step after a brief delay
          this.async.setTimeout(() => {
            this.advanceQuestStep(player, activeQuestId);
          }, 1500);
        }
      }
      return true;
    }
    return false;
  }

  private advanceQuestStep(player: hz.Player, questId: string): void {
    const questDAO = PlayerStateService.instance?.getTutorialDAO(player);
    if (!questDAO) {
      console.error(`[QuestManager] Could not get TutorialDAO for advancing quest`);
      return;
    }

    const quest = questDAO.getQuestLog(questId);
    if (!quest) {
      console.error(`[QuestManager] Could not find quest log for ${questId}`);
      return;
    }

    const currentStageConfig = questDAO.getStageByStepIndex(quest.currentStepIndex);
    if (!currentStageConfig) {
      console.error(`[QuestManager] Could not find stage config for step ${quest.currentStepIndex}`);
      return;
    }
    // Check if there's a next step
    if (currentStageConfig.nextStepIndex === undefined || currentStageConfig.nextStepIndex === null) {
      console.log(`[QuestManager] No next step defined, quest complete`);
      questDAO.completeQuest(questId);

      // Show final completion message
      this.world.ui.showPopupForPlayer(player, "Quest Complete!", 5);

      // Hide or update HUD
      this.sendNetworkEvent(player, EventsService.QuestEvents.DisplayQuestHUD, {
        player,
        title: "Tutorial",
        questId: questId,
        visible: false,
        objective: ""
      });

      return;
    }

    const nextStepIndex = currentStageConfig.nextStepIndex;
    console.log(`[QuestManager] Advancing quest from step ${quest.currentStepIndex} to ${nextStepIndex}`);

    // Update the quest step
    questDAO.updateQuestStep(questId, nextStepIndex);


    // Get new stage config
    const newStageConfig = questDAO.getStageByStepIndex(nextStepIndex);

    if (newStageConfig) {
      console.log(`[QuestManager] New stage: ${newStageConfig.description}`);
      console.log("WTF WTF: ", newStageConfig.displayType)
      // Show stage transition message
      this.showQuestMessage(player, newStageConfig);

      // Update HUD with new objective
      const objectiveText = this.getQuestObjectiveText(player, questId);
      this.sendNetworkEvent(player, EventsService.QuestEvents.DisplayQuestHUD, {
        player,
        title: "Tutorial",
        questId: questId,
        visible: true,
        objective: objectiveText
      });
    }
  }

  private async spawnStarterAxeForPlayer(player: hz.Player) {
    try {
      const asset = this.props.starterAxeAsset as hz.Asset;
      if (!asset) {
        console.warn('[QuestManager] starterAxeAsset not set; cannot spawn axe.');
        return;
      }

      const spawnPoint = this.props.starterAxeSpawnPoint as hz.Entity | undefined;
      if (!spawnPoint) {
        console.warn('[QuestManager] starterAxeSpawnPoint not set; cannot spawn axe.');
        return;
      }

      // Use the spawn point's position
      const spawnPos = spawnPoint.position.get();
      const spawned = await this.world.spawnAsset(asset, spawnPos);
      const root = spawned?.[0];

      // Pan camera to the axe
      this.sendNetworkEvent(player, EventsService.CameraEvents.PanToEntity, {
        player,
        entity: root,
        duration: 1500
      });

      if (!root) return;
      // Make visible and set ownership
      root.visible.set(true);
      try { root.owner.set(player); } catch { }

      console.log(`[QuestManager] Spawned starter axe for ${player.name.get()} at`, spawnPos);
    } catch (e) {
      console.warn('[QuestManager] Failed to spawn starter axe', e);
    }
  }



  private async spawnStorageBagForPlayer(player: hz.Player) {
    try {
      const asset = this.props.storageBagAsset as hz.Asset;
      if (!asset) {
        console.warn('[QuestManager] storageBagAsset not set; cannot spawn bag.');
        return;
      }

      const spawnPoint = this.props.storageBagSpawnPoint as hz.Entity | undefined;
      if (!spawnPoint) {
        console.warn('[QuestManager] storageBagSpawnPoint not set; cannot spawn bag.');
        return;
      }

      // Use the spawn point's position
      const spawnPos = spawnPoint.position.get();
      const spawned = await this.world.spawnAsset(asset, spawnPos);
      const root = spawned?.[0];

      this.sendNetworkEvent(player, EventsService.CameraEvents.PanToEntity, { player, entity: root, duration: 1500 });
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

  private playCollectionSoundForPlayer(player: hz.Player, entityId?: string) {
    try {
      SoundFxBank.instance.playSoundForPlayer("quest_item_collect", player);

    } catch { }
  }

  private playCollectionVfxForPlayer(player: hz.Player, entityId?: string) {
    try {
      VisualFxBank.instance.playVFXForPlayer("sparkle_star", player);
      // const vfxEntity = this.props.collectVfx as hz.Entity | undefined;
      // const particle = vfxEntity?.as(hz.ParticleGizmo);
      // if (!particle) return;

      // // Position the particle where the item was collected, if available
      // if (entityId) {
      //   try {
      //     const idBig = BigInt(entityId);
      //     const e = new hz.Entity(idBig);
      //     const pos = e.position.get();
      //     try { vfxEntity!.position.set(pos); } catch {}
      //   } catch {}
      // }

      // const options: hz.ParticleFXPlayOptions = {
      //   fromStart: true,
      //   oneShot: true,
      //   players: [player],
      // };
      // particle.play(options);
    } catch {}
  }

  private getQuestObjectiveText(player: hz.Player, questId: string): string {
    const questDAO = PlayerStateService.instance?.getTutorialDAO(player);
    if (!questDAO) {
      return "Loading...";
    }

    const questLog = questDAO.getQuestLog(questId);
    if (!questLog || questLog.status === 'NotStarted') {
      return "Quest not started";
    }

    if (questLog.status === 'Completed') {
      return "Quest Complete!";
    }

    // Get the current step configuration
    const stageConfig = questDAO.getStageByStepIndex(questLog.currentStepIndex);
    if (!stageConfig || !stageConfig.objectives || stageConfig.objectives.length === 0) {
      return "In progress...";
    }

    // If there are no objectives (e.g., return/turn-in stage), show the stage description
    if (!stageConfig.objectives || stageConfig.objectives.length === 0) {
      return stageConfig.description || "Return to NPC";
    }

    // Get first objective from current step
    const stageObj = stageConfig.objectives[0];
    const progress = questLog.objectives[stageObj.objectiveId];
    const current = progress?.currentCount || 0;
    const target = stageObj.targetCount;

    // Simple format: "coconut 1/2"
    return `${stageObj.itemType} ${current}/${target}`;
  }

  private showQuestMessage(
    player: hz.Player,
    stageConfig: QuestStageConfig, // Use proper type from TutorialQuestDAO
    fallbackMessage?: string
  ): void {
    try {
      console.warn(`[QuestManager] Showing quest message to ${stageConfig}`);
      const displayType = stageConfig.displayType || QuestMessageDisplay.Popup;

      switch (displayType) {
        case QuestMessageDisplay.None:
          // Silent - don't show any message
          console.log(`[QuestManager] Silent stage transition for ${player.name.get()}`);
          break;

        case QuestMessageDisplay.InfoPanel:
          // Show detailed info panel
          const title = stageConfig.infoPanelTitle || "Quest Update";
          const description = stageConfig.infoPanelDescription || stageConfig.description;

          // this.world.ui.s(
          //   player,
          //   title,
          //   description
          // );
          console.log(`[QuestManager] Showing info panel to ${player.name.get()}: "${title}"`);
          break;

        case QuestMessageDisplay.Popup:
        default:
          // Show simple popup
          const message = fallbackMessage || stageConfig.description;
          const duration = stageConfig.displayDuration || 3;

          this.world.ui.showPopupForPlayer(player, message, duration);
          console.log(`[QuestManager] Showing popup to ${player.name.get()}: "${message}"`);
          break;
      }
    } catch (error) {
      console.error(`[QuestManager] Failed to show quest message for ${player.name.get()}:`, error);
    }
  }

}
hz.Component.register(QuestManager);
