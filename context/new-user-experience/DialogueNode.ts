import * as hz from 'horizon/core';

/**
 * DialogueNode.ts
 * 
 * Summary:
 * Represents a single dialogue node in dialogue system. 
 * 
 * Works with:
 * - DialogueNodeOption.ts - Represents selectable options within a dialogue node.
 * - NPCDialogue.ts - Manages the overall dialogue system and connects to triggers.
 * - DialogueTreeCustomUI.ts - Custom UI for displaying dialogue trees.
 * 
 * Setup:
 * - Create an empty object inside a parent that has a NPCDialogue component and add this script.
 * - The system looks for one named "start", otherwise the first node called is the first child of the parent.
 * - Set the NPCText prop to the text of the NPC in this node.
 */

class DialogueNode extends hz.Component<typeof DialogueNode> {
  static propsDefinition = {
   npcText: { type: hz.PropTypes.String }, // Text of the NPC in this node
  };

  /**
	 * Lifecycle method called when the DialogueNode component is initialized. 
   * Do not delete this method.
	 */
  public start() {}

  /**
   * Retrieves the text of the NPC in this node.
   * @returns The text of the NPC.
   */
  public getText(): string {
    return this.props.npcText ?? "";
  }

  /**
   * Retrieves the possible answers (options) for this dialogue node.
   * @returns An array of entities representing the answers.
   */
  public getAnswers(): hz.Entity[] {
    const children = this.entity.children.get();
    return children.filter(child =>
      child.getComponents().some(c => c.constructor.name === "DialogueAnswer")
    );
  }
}

// Register the component with Horizon
hz.Component.register(DialogueNode);
