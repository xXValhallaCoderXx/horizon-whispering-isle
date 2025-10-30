import * as hz from 'horizon/core';

/**
 * DialogueNodeOption.ts
 *
 * Summary:
 * Represents a selectable option within a dialogue node.
 * It holds the text of the answer and provides methods to retrieve the text, next node, and whether it ends the dialogue.
 *
 * Works with:
 * - DialogueNode.ts - Represents a single dialogue node.
 * - NPCDialogue.ts - Manages the overall dialogue system and connects to triggers.
 * - DialogueTreeCustomUI.ts - Custom UI for displaying dialogue trees.
 *
 * Setup:
 * - If you need more options, up to 3, duplicate the NodeOption object inside a DialogueNode object. 
 * - Set the AnswerText, assign NextNode if the dialog continues and check EndsDialogue in the editor.
 */

class DialogueNodeOption extends hz.Component<typeof DialogueNodeOption> {
  static propsDefinition = {
    answerText: { type: hz.PropTypes.String },    // Text of the answer option
    nextNode: { type: hz.PropTypes.Entity },      // Next node to transition to
    endsDialogue: { type: hz.PropTypes.Boolean }, // This option ends the dialogue
  };

  /**
	 * Lifecycle method called when the DialogueNodeOption component is initialized. 
   * Do not delete this method.
	 */
  public start() {}

  /**
   * Retrieves the text of the answer option.
   * @returns The text of the answer.
   */
  public getText(): string {
    return this.props.answerText ?? "";
  }

  /**
   * Retrieves the next node to transition to.
   * @returns The next node entity or undefined.
   */
  public getNextNode(): hz.Entity | null {
    return this.props.nextNode ?? null;
  }

  /**
   * Checks if this option ends the dialogue.
   * @returns True if this option closes the dialogue, false otherwise.
   */
  public isClosing(): boolean {
    return this.props.endsDialogue === true;
  }
}

// Register the component with Horizon
hz.Component.register(DialogueNodeOption);
