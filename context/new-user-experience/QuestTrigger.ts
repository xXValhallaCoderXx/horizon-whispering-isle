import * as hz from 'horizon/core';
import { QuestEvents } from './QuestManager';

/**
 * QuestTrigger.ts
 *
 * Summary:
 * Handles quest-related triggers for players.
 * 
 * Works with:
 * - QuestManager.ts Manages the overall quest system.
 * - CameraManagerLocal.ts Manages camera-related functionality.
 * - UIQuestStartDialogue Prompts players to start quests
 * - UIQuestComplete Shows quest completion UI
 * - UICurrentQuests Displays active quests
 * - Quest.ts - Represents a quest entity.
 * 
 * Setup:
 * - Set the questID to the ID of the quest this trigger is associated with.
 * - Set the operation to 'start' or 'complete' based on desired behavior.
 */

class QuestTrigger extends hz.Component<typeof QuestTrigger> {
  static propsDefinition = {
    questManager: { type: hz.PropTypes.Entity, required: true }, // Reference to the quest manager entity
    questID: { type: hz.PropTypes.String, required: true },      // Unique ID of the quest
    operation: { type: hz.PropTypes.String, default: 'start' },  // Operation: 'start' or 'complete'
  };

  // Track players who already started the quest
  private playersWithQuest: hz.Player[] = [];

  /**
   * Lifecycle method called once when component is initialized.
   */
  start() {
    // When a player enters the trigger area
    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterTrigger, (player) => {
      const { questID } = this.props;
      const id = questID as string;

      if (this.props.operation === 'start') {
        // Prompt the player with the quest start dialogue
        this.sendNetworkEvent(this.props.questManager!, QuestEvents.promptStartQuestDialogue, {
          questId: id,
          player: player
        });

        // If the player hasn't already started the quest, add them to the list
        if (!this.playersWithQuest.includes(player)) {
          this.playersWithQuest.push(player);
        }

        // Update which players are allowed to trigger the quest
        this.setWhoCanTriggerForPlayers();
      }
      else if (this.props.operation === 'complete') {
        // Notify the quest manager that the player has completed the quest
        this.sendNetworkEvent(this.props.questManager!, QuestEvents.questCompleted, {
          player: player,
          questId: id
        });
      }
    });

    // When a player enters the world, update the trigger to allow only players who haven't started the quest
    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterWorld, (player) => {
      this.setWhoCanTriggerForPlayers();
    });
  }

  /**
   * Update the trigger to be only activatable by players who haven't started the quest
   */
  private setWhoCanTriggerForPlayers() {
    const playersExcludingThoseWithQuest = this.world.getPlayers().filter(
      p => !this.playersWithQuest.includes(p)
    );
    this.entity.as(hz.TriggerGizmo).setWhoCanTrigger(playersExcludingThoseWithQuest);
  }
}

// Register the component with Horizon
hz.Component.register(QuestTrigger);
