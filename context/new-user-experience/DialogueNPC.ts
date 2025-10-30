import * as hz from "horizon/core";

/**
 * NPCDialogue.ts
 *
 * Summary:
 * Manages the overall dialogue system for a non-player character (NPC).
 * It connects to triggers and handles the display of dialogue options and responses.
 *
 * Works with:
 * - DialogueNode.ts - Represents a single dialogue node in the dialogue system.
 * - DialogueNodeOption.ts - Represents selectable options within a dialogue node.
 * - DialogueTreeCustomUI.ts - Custom UI for displaying dialogue trees.
 *
 * Setup:
 * - Place the StartDialogueTrigger and EnableDialogueTrigger where you want.
 *   The EnableDialogueTrigger is the one that enables again the StartDialogueTrigger
 * - Set the CharacterName prop to the NPC's name.
 * - Optionally, assign triggers to TriggerToEnableOnEnd and TriggerToEnableOnEnd2
 *    to enable them when the dialogue ends.
 */

// A single selectable option within a dialogue node
type DialogueOption = {
  text: string; // Text shown on the button
  nextId?: string; // ID of the next node to navigate to
  close?: boolean; // Whether this option closes the dialogue
};

// One dialogue node: speaker, text, and its options
type DialogueNodeDef = {
  id: string; // Unique identifier for the node
  speaker: string; // Name of the speaker (NPC)
  text: string; // Text content of the dialogue
  options: DialogueOption[]; // List of selectable options
};

export const DialogueTreeEvents = {
  closeUI: new hz.NetworkEvent<{ player: hz.Player }>(""),
  promptDialogueUI: new hz.NetworkEvent<{ TreeData: string }>("promptDialogueUI"),
  questCompleted: new hz.NetworkEvent<{ player: hz.Player }>("questCompleted"),
};

// A dictionary of nodes indexed by ID
type DialogueTree = Record<string, DialogueNodeDef>;

class DialogueNPC extends hz.Component<typeof DialogueNPC> {
  // JSON representation of the current dialogue tree
  private currentTreeJSON = "Null tree";

  static propsDefinition = {
    characterName: { type: hz.PropTypes.String }, // Name of the NPC (shown as the speaker)
    startDialogueTrigger: { type: hz.PropTypes.Entity }, // Trigger to handle the dialogue
    enableDialogueEndTrigger: { type: hz.PropTypes.Entity }, // Second trigger to enable trigger dialogue again
  };

  private playersWithActiveQuest: hz.Player[] = []; // Players who have an active quest

  private startDialogueTrigger: hz.TriggerGizmo = hz.TriggerGizmo.prototype;

  /**
   * Lifecycle method called when the NPCDialogue component is initialized.
   * It sets up the dialogue tree and listens for player interactions to start the dialogue.
   */
  public start() {
    if (this.props.startDialogueTrigger) {
      const triggerGizmo = this.props.startDialogueTrigger.as(hz.TriggerGizmo);
      if (triggerGizmo) {
        this.startDialogueTrigger = triggerGizmo;
        this.startDialogueTrigger.setWhoCanTrigger(this.world.getPlayers());
      }
    }
    this.createTree();

    this.connectCodeBlockEvent(this.startDialogueTrigger, hz.CodeBlockEvents.OnPlayerEnterTrigger, (enteredBy: hz.Player) => {
      console.log("enter trigger");

      this.sendNetworkEvent(enteredBy, DialogueTreeEvents.promptDialogueUI, { TreeData: this.currentTreeJSON });
    });

    this.connectNetworkEvent(this.entity, DialogueTreeEvents.closeUI, (data) => this.onDialogueEnd(data.player));

    this.connectCodeBlockEvent(this.props.enableDialogueEndTrigger!, hz.CodeBlockEvents.OnPlayerEnterTrigger, (enteredBy: hz.Player) => {
      const triggerToHandleOnEnd = this.props.startDialogueTrigger;
      if (triggerToHandleOnEnd) {
        const triggerGizmo = triggerToHandleOnEnd.as(hz.TriggerGizmo);
        if (triggerGizmo) {
          triggerGizmo.enabled.set(true);
        }
      }
    });

    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterWorld, () => {
      this.updatePlayerInteraction();
    });

    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerExitWorld, (exitedBy: hz.Player) => {
      this.playersWithActiveQuest = this.playersWithActiveQuest.filter((p) => p !== exitedBy);
    });

    // delete player from playersWithActiveQuest when they complete the quest
    this.connectNetworkBroadcastEvent(DialogueTreeEvents.questCompleted, (data) => {
      const player = data.player;
      // Remove player from the list
      this.playersWithActiveQuest = this.playersWithActiveQuest.filter((p) => p !== player);
      this.updatePlayerInteraction();
      this.async.setTimeout(() => {
        this.updatePlayerInteraction();
      }, 1000);
    });
  }

  /**
   * Enables the specified triggers when the dialogue ends.
   */
  private onDialogueEnd(player: hz.Player) {
    const triggerToHandleOnEnd = this.props.startDialogueTrigger;
    if (triggerToHandleOnEnd) {
      const triggerGizmo = triggerToHandleOnEnd.as(hz.TriggerGizmo);
      if (triggerGizmo) {
        this.playersWithActiveQuest.push(player);
        this.updatePlayerInteraction();
      }
    }
    const triggerToEnableDialogueOnEnd = this.props.enableDialogueEndTrigger;
    if (triggerToEnableDialogueOnEnd) {
      const triggerGizmo = triggerToEnableDialogueOnEnd.as(hz.TriggerGizmo);
      if (triggerGizmo) {
        triggerGizmo.enabled.set(true);
      }
    }
  }

  private updatePlayerInteraction() {
    const triggerGizmo = this.props.startDialogueTrigger!.as(hz.TriggerGizmo);
    const playersWithoutQuest = this.world.getPlayers().filter((p) => !this.playersWithActiveQuest.includes(p));
    this.async.setTimeout(() => {
      triggerGizmo.setWhoCanTrigger(playersWithoutQuest);
    }, 500);
    console.log(`--- players with active quest: ${this.playersWithActiveQuest.map(p => p.name.get()).join(", ")} ---`);
    console.log(`--- players without active quest: ${playersWithoutQuest.map(p => p.name.get()).join(", ")} ---`);
  }

  /**
   * Creates the dialogue tree by gathering all DialogueNode components from the children entities,
   * and converting them into a specific display format.
   */
  private createTree() {
    const children = this.entity.children.get();
    const dialogueNodes: hz.Entity[] = [];

    // Filter children to find those with a DialogueNode component
    for (const child of children) {
      const hasDialogueNode = child.getComponents().find((c) => c.constructor.name === "DialogueNode");
      if (hasDialogueNode) {
        dialogueNodes.push(child);
      }
    }

    // No dialogue nodes found — exit early
    if (dialogueNodes.length === 0) {
      return;
    }

    // Build a dialogue tree from node entities
    const dialogueTree: DialogueTree = {};

    for (const nodeEntity of dialogueNodes) {
      const nodeComponent = nodeEntity.getComponents().find((c) => c.constructor.name === "DialogueNode") as any;
      if (!nodeComponent) continue;

      const nodeId = nodeEntity.name.get(); // Node ID is the entity name
      const textProp = nodeComponent.getText(); // Dialogue text
      const optionEntities = nodeEntity.children.get(); // Children options
      const options: DialogueOption[] = [];

      // Process each option entity
      for (const optionEntity of optionEntities) {
        const optionComponent = optionEntity.getComponents().find((c) => c.constructor.name === "DialogueNodeOption") as any;
        if (!optionComponent) continue;

        const optionText = optionComponent.getText(); // Text shown on the button
        const targetNode = optionComponent.getNextNode() as hz.Entity | null; // Link to next node
        const isClosing = optionComponent.isClosing(); // Whether this option closes the dialogue

        if (!optionText) continue;

        if (targetNode && !isClosing) {
          // Option leads to another node
          const targetName = targetNode.name.get();
          options.push({ text: optionText, nextId: targetName });
        } else {
          // Option ends the dialogue
          options.push({ text: optionText, close: true });
        }
      }

      // Add node to the dialogue tree
      dialogueTree[nodeId] = {
        id: nodeId,
        speaker: this.props.characterName || "???",
        text: textProp || "...",
        options,
      };
    }

    // Determine the starting node — look for one named "start", otherwise use the first node
    const startNode = dialogueNodes.find((e) => e.name.get().toLowerCase() === "start") || dialogueNodes[0];
    if (!startNode) {
      return;
    }

    // Send the dialogue tree to the UI
    this.currentTreeJSON = JSON.stringify(dialogueTree);
  }
}

// Register the component with Horizon
hz.Component.register(DialogueNPC);
