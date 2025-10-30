import * as hz from 'horizon/core';

/**
 * Quest.ts
 *
 * Summary:
 * Define a quest in the game.
 *
 * Works with:
 * - QuestManager.ts Manages the overall quest system.
 * - CameraManagerLocal.ts Manages camera-related functionality.
 * - QuestTrigger.ts Triggers quest-related events.
 * - UIQuestStartDialogue Prompts players to start quests
 * - UICurrentQuests Displays active quests
 * - UIQuestComplete Shows quest completion UI
 * 
 * Setup:
 * - Duplicate or remove the entity containing this script to add or remove quests.
 * - Ensure the entity has a `Quest` component.
 * - Configure the quest properties in the entity's inspector.
 * - Ensure Quest entities are children of the entity QuestsContainer in the scene.
 * - QuestManager needs a reference to the QuestsContainer entity to manage quests.
 */

export class Quest extends hz.Component<typeof Quest> {
  static propsDefinition = {
    id: { type: hz.PropTypes.String, required: true },          // Unique identifier for the quest
    title: { type: hz.PropTypes.String, required: true },       // Title of the quest
    description: { type: hz.PropTypes.String, required: true }, // Description of the quest
    optional: { type: hz.PropTypes.Boolean, default: false },   // Whether the quest is optional or mandatory
    reward: { type: hz.PropTypes.Number, default: 0 },          // Reward for completing the quest, in currency or points
    primaryColor: { type: hz.PropTypes.Color },                 // Primary color associated with the quest, used for UI elements
    secondaryColor: { type: hz.PropTypes.Color },               // Secondary color associated with the quest, used for UI elements
  };

  /**
	 * Lifecycle method called when the Quest component is initialized. 
   * Do not delete this method.
	 */
  start() { }

  /**
   * Returns an unique identifier for the quest.
   */
  public getId(): string {
    return this.props.id;
  }

  /**
   * Returns the title of the quest.
   */
  public getTitle(): string {
    return this.props.title;
  }

  /**
   * Returns the description of the quest.
   */
  public getDescription(): string {
    return this.props.description;
  }

  /**
   * Checks if the quest is optional.
   * @returns {boolean} True if the quest is optional, false otherwise.
   */
  public isOptional(): boolean {
    return this.props.optional;
  }

  /**
   * Returns the reward for completing the quest.
   * @returns {number} The reward amount.
   */
  public getReward(): number {
    return this.props.reward;
  }

  /**
   * Returns the primary color associated with the quest.
   * @returns {hz.Color | undefined} The primary color, or undefined if not set.
   */
  public getPrimaryColor(): hz.Color | undefined {
    return this.props.primaryColor;
  }

  /**
   * Returns the secondary color associated with the quest.
   * @returns {hz.Color | undefined} The secondary color, or undefined if not set.
   */
  public getSecondaryColor(): hz.Color | undefined {
    return this.props.secondaryColor;
  }
}
// Register the component with Horizon
hz.Component.register(Quest);