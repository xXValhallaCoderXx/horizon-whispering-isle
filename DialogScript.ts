import { DialogContainer } from 'Dialog_UI';
import * as hz from 'horizon/core';
import { TUTORIAL_QUEST_STAGES, TUTORIAL_QUEST_KEY } from 'TutorialQuestDAO';
export { getTreeForStage, traverseByKeyFor };

// For conversations that can loop back on themselves, terminate after this many steps
const MAX_TREE_LENGTH = 16;

// Local dialogue data (no editor props required)
// Each node has a response and up to 3 options (index-based navigation)
type LocalOption = { text: string; next?: string | null; close?: boolean };
type LocalNode = { id: string; response: string; options: LocalOption[], startQuestOnEnter?: string, questId?: string, audio?: string };




const DIALOG_INTRO: Record<string, LocalNode> = {
  root: {
    id: 'root',
    response: "Hey there—you're safe now. That storm was a nasty one. I can get you settled if you're up for lending a hand?",
    audio: 'introRoot',
    options: [
      { text: 'Sure, happy to help', next: 'interested' },
      { text: 'Where am I?', next: 'where' },
    ],
  },
  where: {
    id: 'where',
    response: 'This is Whispering Isle. Quiet on good days, trouble on the rest. Extra hands make a big difference.',
    audio: 'introWhere',
    options: [
      { text: 'Alright—I’ll help!', next: 'interested' },
      { text: 'Not for me, sorry', close: true },
    ],
  },
  interested: {
    id: 'interested',
    response: "Nothing scary: grab a storage bag, then gather a few coconuts. Easy work, good warm-up after a storm.",
    audio: 'introInterested',
    options: [
      { text: 'Alright—I’ll help!', next: 'continued' },
      { text: 'Not ready yet', next: 'notReady' },
    ],
  },
  notReady: {
    id: 'notReady',
    response: "No rush. Take a breath, look around, then come talk to me when you’re ready.",
    audio: 'introNotReady',
    options: [
      { text: 'OK', close: true },
    ],
  },
  continued: {
    id: 'continued',
    response: 'First, pick up that woven bag. Then collect 5 coconuts from the beach. Come back to me after.',
    audio: 'introContinued',
    options: [{ text: 'OK', close: true }],
    startQuestOnEnter: TUTORIAL_QUEST_KEY
  },
};

// Player has quest, needs to collect storage bag
const DIALOG_STEP_1_COLLECT_BAG: Record<string, LocalNode> = {
  root: {
    id: 'root',
    response: 'Go ahead and grab that storage bag - you\'ll need it for collecting items.',
    options: [{ text: 'OK', close: true }],
  },
};

// Player has storage bag, now needs to collect coconuts
const DIALOG_STEP_2_COLLECT_COCONUTS: Record<string, LocalNode> = {
  root: {
    id: 'root',
    response: 'Great! Now bring me 2 coconuts and put them in the barrel next to me.',
    options: [{ text: 'OK', close: true }],
  },
};

// Player has collected coconuts, needs to return
const DIALOG_STEP_3_RETURN_COCONUTS: Record<string, LocalNode> = {
  root: {
    id: 'root',
    response: "You're back! And you have the coconuts! Great. Here's the Axe I promised. Now, use it to hunt 1 chicken.",
    options: [{ text: 'Thanks!', close: true }],
    questId: TUTORIAL_QUEST_KEY // This node will advance the quest
  },
};

// Player has quest, needs to hunt
const DIALOG_STEP_4_KILL_CHICKENS: Record<string, LocalNode> = {
  root: {
    id: 'root',
    response: "Go find 1 chicken and take it down with your Axe.",
    options: [{ text: 'On it!', close: true }],
  },
};

// Player has killed, needs to return
const DIALOG_STEP_5_RETURN_MEAT: Record<string, LocalNode> = {
  root: {
    id: 'root',
    response: "Nice work with that axe. Just one last thing: bring me 10 logs.",
    options: [{ text: 'OK', close: true }],
    questId: TUTORIAL_QUEST_KEY // This node will advance the quest
  },
};

// Player has quest, needs to collect logs
const DIALOG_STEP_6_COLLECT_LOGS: Record<string, LocalNode> = {
  root: {
    id: 'root',
    response: "I still need those 10 logs to finish the repairs.",
    options: [{ text: 'Working on it!', close: true }],
  },
};

// Player has logs, needs to return
const DIALOG_STEP_7_RETURN_LOGS: Record<string, LocalNode> = {
  root: {
    id: 'root',
    response: "Perfect! That's everything. You've been a great help. You're free to go!",
    options: [{ text: 'Awesome', close: true }],
    questId: TUTORIAL_QUEST_KEY // This node will complete the quest
  },
};

// Quest is finished
const DIALOG_COMPLETE: Record<string, LocalNode> = {
  root: {
    id: 'root',
    response: "Well done — you've completed the tutorial quest! Thanks again for the help.",
    options: [{ text: 'You got it.', close: true }],
  },
};


function getTreeForStage(stage: TUTORIAL_QUEST_STAGES): Record<string, LocalNode> {
  switch (stage) {
    case 'Step_1_Collect_Bag':
      return DIALOG_STEP_1_COLLECT_BAG;
    case 'Step_2_Collect_Coconuts':
      return DIALOG_STEP_2_COLLECT_COCONUTS;
    case 'Step_3_Return_Coconuts':
      return DIALOG_STEP_3_RETURN_COCONUTS;
    case 'Step_4_Kill_Chickens':
      return DIALOG_STEP_4_KILL_CHICKENS;
    case 'Step_5_Return_Meat':
      return DIALOG_STEP_5_RETURN_MEAT;
    case 'Step_6_Collect_Logs':
      return DIALOG_STEP_6_COLLECT_LOGS;
    case 'Step_7_Return_Logs':
      return DIALOG_STEP_7_RETURN_LOGS;
    case 'Complete':
      return DIALOG_COMPLETE;
    case 'NotStarted':
    default:
      return DIALOG_INTRO;
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



export function getNodeByKey(tree: Record<string, LocalNode>, key: number[]) {
  const { node } = traverseByKeyFor(tree, key);
  return node;
}

export class DialogScript extends hz.Component<typeof DialogScript> {
  static propsDefinition = {};

  // Build dialog from local constants instead of editor-linked entities
  start() { }


  getDialogFromTreeForStage(stage: TUTORIAL_QUEST_STAGES, key: number[]): DialogContainer | undefined {
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



/**
    * Returns questId when the LAST chosen option closes the dialog.
    * This lets us trigger the quest after the player confirms (presses OK).
    */
  // --- MODIFIED: This function now requires the correct tree to be passed in ---
  public getQuestIdOnClose(stage: TUTORIAL_QUEST_STAGES, key: number[]): string | null {
    const tree = getTreeForStage(stage);
    let node: LocalNode | undefined = tree['root'];
    if (!node) return null;

    for (let i = 0; i < key.length; i++) {
      const idx: number = key[i] ?? 0;
      const opt: LocalOption | undefined = node.options[idx];
      if (!opt) return null;

      const isLast = i === key.length - 1;
      if (opt.close === true) {
        // If the last selected option is a closing option, trigger quest based on the node being closed
        return isLast ? (node.questId ?? null) : null;
      }

      if (!opt.next) {
        // No navigation and not a close => no quest-on-close
        return null;
      }

      const nextNode: LocalNode | undefined = tree[opt.next as string];
      if (!nextNode) return null;
      node = nextNode;
    }

    // This case means the path ended but didn't "close"
    // (e.g., they are on a node with options)
    return null;
  }
}

hz.Component.register(DialogScript);
