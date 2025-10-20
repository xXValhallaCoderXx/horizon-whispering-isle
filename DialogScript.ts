import { DialogContainer } from 'Dialog_UI';
import * as hz from 'horizon/core';

// Local stage type to avoid cross-file coupling
export type QuestStage = 'NotStarted' | 'Collecting' | 'ReturnToNPC' | 'Hunting' | 'Complete';

// For conversations that can loop back on themselves, terminate after this many steps
const MAX_TREE_LENGTH = 16;

// Local dialogue data (no editor props required)
// Each node has a response and up to 3 options (index-based navigation)
type LocalOption = { text: string; next?: string | null; close?: boolean };
type LocalNode = { id: string; response: string; options: LocalOption[], startQuestOnEnter?: string };
const DIALOG: Record<string, LocalNode> = {
  root: {
    id: 'root',
    response: "Welcome! You're lucky you were brought ashore, the storm was rough. I can help you off here, interested?",
    options: [
      { text: 'Yes (Continue)', next: 'interested' },
      { text: 'Where am I?', next: 'where' },
    ],
  },
  where: {
    id: 'where',
    response: 'This is Whispering Isle, we need help from people to help us.',
    options: [
      { text: 'Yes (Continue)', next: 'interested' },
      { text: 'No', close: true },
    ],
  },
  interested: {
    id: 'interested',
    response: "Great! We need some resources gathered, if you help me, I can get you off the island:",
    options: [
      { text: 'Yes (Continue)', next: 'continued' },
      { text: 'No', next: 'notReady' },
    ],
  },
  notReady: {
    id: 'notReady',
    response: "Oh, when you're ready speak to me",
    options: [
      { text: 'OK', close: true },
    ],
  },
  continued: { id: 'continued', response: 'Great! Collect 5 coconuts, and put them in the barrel next to me.', options: [{ text: 'OK', close: true }], startQuestOnEnter: 'tutorial_survival' },
};

const DIALOG_INTRO: Record<string, LocalNode> = {
  root: {
    id: 'root',
    response: "Welcome! You're lucky you were brought ashore, the storm was rough. I can help you off here, interested?",
    options: [
      { text: 'Yes (Continue)', next: 'interested' },
      { text: 'Where am I?', next: 'where' },
    ],
  },
  where: {
    id: 'where',
    response: 'This is Whispering Isle, we need help from people to help us.',
    options: [
      { text: 'Yes (Continue)', next: 'interested' },
      { text: 'No', close: true },
    ],
  },
  interested: {
    id: 'interested',
    response: "Great! We need some resources gathered, if you help me, I can get you off the island:",
    options: [
      { text: 'Yes (Continue)', next: 'continued' },
      { text: 'No', next: 'notReady' },
    ],
  },
  notReady: {
    id: 'notReady',
    response: "Oh, when you're ready speak to me",
    options: [
      { text: 'OK', close: true },
    ],
  },
  continued: { id: 'continued', response: 'Great! Collect 5 coconuts, and put them in the barrel next to me.', options: [{ text: 'OK', close: true }], startQuestOnEnter: 'tutorial_survival' },
};

const DIALOG_RETURN: Record<string, LocalNode> = {
  root: {
    id: 'root',
    response: "You're back! Here's the Axe I promised. Use it to hunt a chicken.",
    options: [{ text: 'Thanks!', close: true }],
  },
};
const DIALOG_COLLECTING: Record<string, LocalNode> = {
  root: {
    id: 'root',
    response: 'Bring me 5 coconuts and drop them in the barrel next to me.',
    options: [{ text: 'OK', close: true }],
  },
};
const DIALOG_HUNTING: Record<string, LocalNode> = {
  root: {
    id: 'root',
    response: "Go find a chicken and take it down with your Axe.",
    options: [{ text: 'On it!', close: true }],
  },
};
const DIALOG_COMPLETE: Record<string, LocalNode> = {
  root: {
    id: 'root',
    response: "Well done — you’ve completed the tutorial quest!",
    options: [{ text: 'Awesome', close: true }],
  },
};

function getTreeForStage(stage: QuestStage): Record<string, LocalNode> {
  switch (stage) {
    case 'ReturnToNPC': return DIALOG_RETURN;
    case 'Hunting': return DIALOG_HUNTING;
    case 'Complete': return DIALOG_COMPLETE;
    case 'Collecting': return DIALOG_COLLECTING; // do not re-offer quest start
    case 'NotStarted':
    default: return DIALOG_INTRO;
  }
}

// Generic traversal against a provided dialog tree
function traverseByKeyFor(tree: Record<string, LocalNode>, key: number[]): { node?: LocalNode; close?: boolean } {
  let node: LocalNode | undefined = tree['root'];
  if (!node) return { node: undefined, close: true };

  for (let i = 0; i < key.length; i++) {
    const idx = key[i] ?? 0;
    const opt: LocalOption | undefined = node?.options[idx];
    if (!opt) return { node: undefined, close: true }; // invalid index
    if (opt.close) return { node: undefined, close: true }; // immediate close
    if (!opt.next) return { node, close: false }; // stay on same node if no next specified
    const nextNode: LocalNode | undefined = tree[opt.next as string];
    if (!nextNode) return { node: undefined, close: true };
    node = nextNode;
  }
  return { node, close: false };
}

// Back-compat traversal using the default DIALOG tree
function traverseByKey(key: number[]): { node?: LocalNode; close?: boolean } {
  return traverseByKeyFor(DIALOG, key);
}

export function getNodeByKey(key: number[]) {
  const { node } = traverseByKey(key);
  console.log('getNodeByKey', key, node);
  return node;
}

export class DialogScript extends hz.Component<typeof DialogScript> {
  static propsDefinition = {};

  // Build dialog from local constants instead of editor-linked entities
  start() { }

  /**
   * Retrieves a dialog from the local dialog tree based on the provided key sequence.
   * key is the option index path chosen so far (e.g., [0,1]).
   */
  getDialogFromTree(key: number[]): DialogContainer | undefined {
    // Safety: avoid infinite paths
    if (key.length >= MAX_TREE_LENGTH) {
      return { response: 'You talk too much!', option1Text: 'Okay, sorry' };
    }

    const { node, close } = traverseByKey(key);
    if (!node || close) return undefined; // close UI

    return {
      response: node.response,
      option1Text: node.options[0]?.text ?? 'OK',
      option2Text: node.options[1]?.text,
      option3Text: node.options[2]?.text,
    };
  }

  getDialogFromTreeForStage(stage: QuestStage, key: number[]): DialogContainer | undefined {
    // Safety: avoid infinite paths
    if (key.length >= MAX_TREE_LENGTH) {
      return { response: 'You talk too much!', option1Text: 'Okay, sorry' };
    }

    const tree = getTreeForStage(stage);
    const { node, close } = traverseByKeyFor(tree, key);
    if (!node || close) return undefined; // close UI

    return {
      response: node.response,
      option1Text: node.options[0]?.text ?? 'OK',
      option2Text: node.options[1]?.text,
      option3Text: node.options[2]?.text,
    };
  }

  public getQuestIdForPath(key: number[]): string | null {
    const node = getNodeByKey(key);
    return (node as any)?.startQuestOnEnter ?? null;
  }

  /**
   * Returns questId when the LAST chosen option closes the dialog.
   * This lets us trigger the quest after the player confirms (presses OK).
   * Logic: walk the path; if the final option has `close: true`, return the
   * previous node's startQuestOnEnter (if any). Otherwise return null.
   */
  public getQuestIdOnClose(key: number[]): string | null {
    let node: LocalNode | undefined = DIALOG['root'];
    if (!node) return null;

    for (let i = 0; i < key.length; i++) {
      const idx: number = key[i] ?? 0;
      const opt: LocalOption | undefined = node.options[idx];
      if (!opt) return null;

      const isLast = i === key.length - 1;
      if (opt.close === true) {
        // If the last selected option is a closing option, trigger quest based on the node being closed
        return isLast ? ((node as any)?.startQuestOnEnter ?? null) : null;
      }

      if (!opt.next) {
        // No navigation and not a close => no quest-on-close
        return null;
      }

      const nextNode: LocalNode | undefined = DIALOG[opt.next as string];
      if (!nextNode) return null;
      node = nextNode;
    }

    return null;
  }
}

hz.Component.register(DialogScript);
