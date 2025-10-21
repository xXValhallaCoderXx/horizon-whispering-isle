/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { AudioContainer } from 'AudioContainer';
import { DialogManager } from 'DialogManager';
import { DialogScript } from 'DialogScript';
import * as hz from 'horizon/core';
import { Logger } from 'Logger';
import { IPlayerInteractionListener } from 'PlayerInteractionController';
import { IPlayerProximityListener } from 'PlayerProximityController';
import { IPlayerEnterExitWorldListener, PlayerService } from 'PlayerService';
import { QuestEvents } from 'QuestManager';
import { NPCTalkSubquestData } from 'SubquestData';
import { Analytics } from 'TurboAnalytics';
import { GenericDialogParams } from 'UIView_DialogGeneric';

/** The radius in meters within which players can interact with the NPC */
const PROXIMITY_RADIUS = 7.5;
/** Delay in milliseconds before showing dialog option buttons */
const BUTTON_SHOW_DELAY = 700;

const log = new Logger("NPC");

/**
 * NPC (Non-Player Character) Component
 *
 * A comprehensive interactive NPC system that manages player interactions, dialog trees,
 * quest integration, and proximity-based behaviors. This component allows players to
 * engage in conversations with NPCs through a dialog system that supports branching
 * conversations, quest triggers, and audio feedback.
 *
 * Key Features:
 * - Interactive dialog system with branching conversation trees
 * - Player proximity detection and interaction management
 * - Quest integration (quest unlocking and subquest completion)
 * - Audio feedback for NPC chatter
 * - Player visibility management (show/hide NPCs from specific players)
 * - Analytics integration for tracking player interactions
 * - Support for alternate dialog scripts per player
 * - Customizable dialog display delegates
 *
 * The NPC maintains state for each player individually, tracking their position in
 * dialog trees and managing active dialog sessions. It integrates with the broader
 * game systems including quest management, audio systems, and analytics.
 *
 * @extends hz.Component
 * @implements IPlayerEnterExitWorldListener - Handles player world entry/exit events
 * @implements IPlayerProximityListener - Handles player proximity detection
 * @implements IPlayerInteractionListener - Handles direct player interactions
 */
export class NPC extends hz.Component<typeof NPC> implements IPlayerEnterExitWorldListener, IPlayerProximityListener, IPlayerInteractionListener {
  /**
   * Component properties definition for the NPC
   * Defines the configurable properties that can be set in the editor
   */
  static propsDefinition = {
    /** The human-readable display name of the NPC shown in dialogs */
    name: { type: hz.PropTypes.String },
    /** The unique identifier for the NPC, required for accessing through the NPC registry */
    id: { type: hz.PropTypes.String },
    /** Entity reference to the DialogScript component containing the conversation tree */
    dialogScript: { type: hz.PropTypes.Entity },
    /** Entity reference to the AudioContainer for NPC chatter sound effects */
    chatterSfx: { type: hz.PropTypes.Entity },
  };

  /**
   * Local event fired when a dialog script is sent to a player
   * Used to notify other systems when an NPC interaction occurs
   * @event LocalSendDialogScript
   * @param player - The player who triggered the dialog
   * @param scriptId - The entity ID of the dialog script being sent
   */
  public static LocalSendDialogScript = new hz.LocalEvent<{ player: hz.Player, scriptId: hz.Entity }>('LocalSendResponseScript');

  /**
   * Local event fired when a player talks to an NPC
   * Used for tracking and responding to NPC interactions across the system
   * @event LocalTalkToNPC
   * @param player - The player who initiated the conversation
   * @param npcId - The unique ID of the NPC being talked to
   */
  public static LocalTalkToNPC = new hz.LocalEvent<{ player: hz.Player, npcId: string }>('LocalTalkToNPC');

  /**
   * Static registry mapping NPC IDs to their instances
   * Allows global access to NPCs by their unique identifier
   * @private
   */
  private static npcMap = new Map<string, NPC>();

  /**
   * Maps each player to their current position in the dialog tree
   * Tracks the sequence of dialog choices made by each player
   * @private
   */
  private playerToOptionTree = new Map<hz.Player, Array<number>>();

  /**
   * Maps each player to their currently active dialog ID
   * Used to manage and cancel active dialog sessions
   * @private
   */
  private playerToDialogID = new Map<hz.Player, bigint>();

  /**
   * The main dialog script data for this NPC
   * Contains the conversation tree and dialog options
   * @private
   */
  private scriptData?: DialogScript;

  /**
   * Maps players to alternate dialog scripts
   * Allows different players to have different conversation experiences
   * @private
   */
  private playerAlternateDialogs: Map<hz.Player, DialogScript> = new Map()

  /**
   * Set of players from whom this NPC is currently hidden
   * Used for conditional NPC visibility based on game state
   * @private
   */
  private hiddenFromPlayers: Set<hz.Player> = new Set()

  /**
   * Delegate function for displaying dialogs to players
   * Allows customization of how dialogs are presented
   * @private
   */
  private showDialogDelegate: (player: hz.Player, dialog: string[]) => bigint = (player, dialog) => this.showGenericDialogForPlayer(player, dialog);

  /**
   * Audio container for NPC chatter sound effects
   * Plays audio feedback when the NPC speaks
   * @private
   */
  private chatterSfx: AudioContainer | undefined;

  /**
   * Component initialization method called when the NPC is created
   * Sets up the NPC's core functionality including:
   * - Registering the NPC in the global registry if it has an ID
   * - Initializing dialog script and audio components
   * - Connecting to player services for proximity, interaction, and world events
   * - Setting up quest integration and navigation targets
   *
   * @override
   */
  start() {
    const id = this.props.id;
    if (id && id.length > 0) {
      if (NPC.npcMap.has(id)) {
        log.error(`Duplicate NPC ID: ${id}`);
      }
      NPC.npcMap.set(id, this);
    }
    this.scriptData = this.props.dialogScript?.getComponents<DialogScript>()[0]
    this.chatterSfx = this.props.chatterSfx?.getComponents(AudioContainer)[0]
    const npcPosition = this.entity.position.get();
    PlayerService.connectPlayerEnterExitWorldListener(this);
    PlayerService.proximity()?.connectListener(npcPosition, PROXIMITY_RADIUS, this);
    PlayerService.interaction()?.connectListener(npcPosition, this);
    this.initializeScriptData();
  }

  /**
   * Retrieves an NPC instance by its unique identifier
   * Provides global access to NPCs that have been registered with an ID
   *
   * @param npcId - The unique identifier of the NPC to retrieve
   * @returns The NPC instance if found, undefined otherwise
   * @static
   */
  static get(npcId: string) {
    return NPC.npcMap.get(npcId);
  }

  /**
   * Initializes the dialog script data and sets up quest integration
   * Processes all dialogs in the conversation tree to:
   * - Set navigation targets for quest-related dialogs
   * - Update quest system with NPC position information
   * - Configure NPC names for talk-based subquests
   *
   * This method ensures that quest objectives pointing to this NPC
   * have the correct navigation information for player guidance.
   *
   * @private
   */
  private initializeScriptData() {
    if (!this.scriptData) {
      return;
    }
    let dialogs = this.scriptData?.getAllDialogsInTree();
    const localPlayer = this.world.getLocalPlayer();
    for (let i = 0; i < dialogs.length; i++) {
      let subquestComplete = dialogs[i].subquestComplete;
      if (subquestComplete === undefined) {
        continue;
      }

      subquestComplete.navigationTarget = this.entity.position.get();
      this.sendNetworkBroadcastEvent(QuestEvents.navigationTargetUpdatedForQuest, { questId: subquestComplete.props.id, position: subquestComplete.navigationTarget }, [localPlayer]);

      if (subquestComplete instanceof NPCTalkSubquestData) {
        subquestComplete.setNpcName(this.props.name);
      }
    }
  }

  /**
   * Checks if the NPC is enabled and visible to a specific player
   * Used to determine if the NPC should respond to player interactions
   *
   * @param player - The player to check visibility for
   * @returns True if the NPC is visible to the player, false if hidden
   * @public
   */
  isEnabled(player: hz.Player): boolean {
    return !this.hiddenFromPlayers.has(player);
  }

  /**
   * Called when a player enters the world
   * Part of the IPlayerEnterExitWorldListener interface
   * Currently no specific behavior is implemented for world entry
   *
   * @param player - The player who entered the world
   * @implements IPlayerEnterExitWorldListener.onPlayerEnterWorld
   */
  onPlayerEnterWorld(player: hz.Player) {
  }

  /**
   * Called when a player exits the world
   * Cleans up any active dialog sessions and conversation state for the departing player
   * Part of the IPlayerEnterExitWorldListener interface
   *
   * @param player - The player who exited the world
   * @implements IPlayerEnterExitWorldListener.onPlayerExitWorld
   */
  onPlayerExitWorld(player: hz.Player) {
    this.playerToDialogID.delete(player);
    this.playerToOptionTree.delete(player);
  }

  /**
   * Called when a player enters the NPC's proximity radius
   * Part of the IPlayerProximityListener interface
   * Currently no specific behavior is implemented for proximity entry
   *
   * @param player - The player who entered proximity
   * @implements IPlayerProximityListener.onPlayerEnterProximity
   */
  onPlayerEnterProximity(player: hz.Player) {
  }

  /**
   * Called when a player exits the NPC's proximity radius
   * Automatically closes any active dialog with the player who moved away
   * Part of the IPlayerProximityListener interface
   *
   * @param player - The player who exited proximity
   * @implements IPlayerProximityListener.onPlayerExitProximity
   */
  onPlayerExitProximity(player: hz.Player) {
    this.closeCurrentDialog(player);
  }

  /**
   * Called when a player directly interacts with the NPC
   * Initiates a dialog session if one is not already active
   * Also sends analytics data about the interaction
   * Part of the IPlayerInteractionListener interface
   *
   * @param player - The player who interacted with the NPC
   * @implements IPlayerInteractionListener.onPlayerInteract
   */
  onPlayerInteract(player: hz.Player) {
    if (!this.isShowingDialog(player)) {
      this.showDialogForPlayer(player);
      Analytics()?.sendTaskEnd({player, taskType: this.props.name, taskKey: "npc"});
    }
  }

  /**
   * Switches the dialog script for a specific player
   * Allows different players to have different conversation experiences
   * Useful for quest progression or personalized interactions
   *
   * @param player - The player to set the alternate dialog for
   * @param script - The alternate dialog script to use, or undefined to remove alternate script
   * @public
   */
  public switchDialogForPlayer(player: hz.Player, script: DialogScript | undefined) {
    if (script === undefined) {
      this.playerAlternateDialogs.delete(player)
    }
    else {
      this.playerAlternateDialogs.set(player, script)
    }
  }

  /**
   * Sets a custom dialog display delegate function
   * Allows customization of how dialogs are presented to players
   * The delegate function should display the dialog and return a dialog ID
   *
   * @param delegate - Function that takes a player and dialog array, returns dialog ID
   * @public
   */
  public setDialogDelegate(delegate: (player: hz.Player, dialog: string[]) => bigint) {
    this.showDialogDelegate = delegate;
  }

  /**
   * Clears dialog state for a player when external dialog handling is complete
   * Used when dialog management is handled by external systems
   *
   * Note: This is a workaround solution. Ideally, derived NPC classes should
   * properly override showDialogForPlayer() instead of using delegates,
   * but that would require significant refactoring of existing NPCs.
   *
   * @param player - The player whose dialog state should be cleared
   * @public
   */
  public onExternalDialogComplete(player: hz.Player) {
    this.playerToDialogID.delete(player);
    this.playerToOptionTree.delete(player);
  }

  /**
   * Displays a dialog to a specific player based on their current position in the conversation tree
   * This is the core method that handles dialog presentation and quest integration
   *
   * The method performs the following operations:
   * - Retrieves the player's current dialog tree position
   * - Selects appropriate dialog script (main or alternate)
   * - Gets dialog content from the script based on player's choices
   * - Displays the dialog using the configured delegate
   * - Handles quest unlocking and subquest completion
   * - Plays audio feedback if available
   * - Sends events to notify other systems of the interaction
   *
   * @param player - The player to show the dialog to
   * @private
   */
  private showDialogForPlayer(player: hz.Player) {
    const optionTree = this.getPlayerOptionTree(player);
    let scriptData = this.scriptData;

    if (scriptData === undefined) {
      log.error(`No dialog script found for NPC: ${this.props.name}`);
      return;
    }

    if (this.playerAlternateDialogs.has(player)) {
      scriptData = this.playerAlternateDialogs.get(player)!
    }
    let optionTreeCopy = [...optionTree]
    const dialog = scriptData.getDialogFromTree(optionTreeCopy)
    log.info(`showing dialog for player ${player.id}\noptiontreeLength: ${optionTree.length}\ndialog: ${dialog}\ndialog[0]: (${dialog[0]})`);
    if (!dialog[0]) {
      this.playerToOptionTree.delete(player);
      this.playerToDialogID.delete(player);
    } else {
      const dialogID = this.showDialogDelegate(player, dialog);
      this.playerToDialogID.set(player, dialogID);
    }
    optionTreeCopy = [...optionTree]
    let script = scriptData.getScriptFromTree(optionTreeCopy)
    if (script && player) {
      if (script.props.response !== '') {
        this.chatterSfx?.play(player)
      }

      if (script.questUnlock) {
        const questUnlock = script.questUnlock
        this.sendNetworkBroadcastEvent(QuestEvents.requestStartQuestForPlayer, { player: player, questId: questUnlock.props.id }, [this.world.getServerPlayer()]);
      }

      if (script.subquestComplete) {
        const questComplete = script.subquestComplete
        this.sendLocalBroadcastEvent(QuestEvents.requestFinishSubquestForPlayer, { player: player, questId: questComplete.props.id });
      }
      this.sendLocalEvent(this.entity, NPC.LocalSendDialogScript, { player: player, scriptId: script.entity })
    }

    const id = this.props.id;
    if (id && id.length > 0) {
      this.sendLocalBroadcastEvent(NPC.LocalTalkToNPC, { player: player, npcId: id });
    }
  }

  /**
   * Creates and displays a generic dialog UI for a player
   * This is the default dialog display implementation used when no custom delegate is set
   *
   * @param player - The player to show the dialog to
   * @param dialog - Array of dialog strings [main_text, option1, option2, option3]
   * @returns The dialog ID for tracking and management purposes
   * @private
   */
  private showGenericDialogForPlayer(player: hz.Player, dialog: string[]): bigint {
    const dialogParams: GenericDialogParams = {
      title: this.props.name,
      text: dialog[0],
      option1: dialog[1],
      option2: dialog[2],
      option3: dialog[3],
      buttonShowDelayMs: BUTTON_SHOW_DELAY,
      nextDialogDelayMs: 0,
    }
    return DialogManager.show(this, player, dialogParams, (player, selection) => this.onDialogSelection(player, selection));
  }

  /**
   * Handles player dialog option selection
   * Records the player's choice and continues the conversation
   *
   * @param player - The player who made the selection
   * @param selection - The dialog option number selected by the player
   * @private
   */
  private onDialogSelection(player: hz.Player, selection: number): void {
    const optionTree = this.getPlayerOptionTree(player);
    optionTree.push(selection);
    this.showDialogForPlayer(player);
  }

  /**
   * Retrieves or creates the dialog option tree for a specific player
   * The option tree tracks the sequence of choices made by the player
   * to determine their current position in the conversation
   *
   * @param player - The player whose option tree to retrieve
   * @returns Array of dialog choice numbers representing the player's conversation path
   * @private
   */
  private getPlayerOptionTree(player: hz.Player): Array<number> {
    let optionTree = this.playerToOptionTree.get(player)
    if (!optionTree) {
      optionTree = new Array<number>();
      this.playerToOptionTree.set(player, optionTree);
    }
    return optionTree
  }

  /**
   * Closes any currently active dialog for a specific player
   * Cancels the dialog through the DialogManager and cleans up tracking state
   *
   * @param player - The player whose dialog should be closed
   * @private
   */
  private closeCurrentDialog(player: hz.Player) {
    const dialogID = this.playerToDialogID.get(player);
    if (dialogID !== undefined) {
      DialogManager.cancel(this, player, dialogID);
      this.playerToDialogID.delete(player);
    }
    this.playerToOptionTree.delete(player);
  }

  /**
   * Checks if a player currently has an active dialog with this NPC
   *
   * @param player - The player to check dialog status for
   * @returns True if the player has an active dialog, false otherwise
   * @private
   */
  private isShowingDialog(player: hz.Player): boolean {
    return this.playerToDialogID.has(player);
  }

  /**
   * Hides the NPC from a specific player
   * Closes any active dialog and makes the NPC and its children invisible to the player
   * Useful for quest progression or conditional NPC availability
   *
   * @param player - The player from whom to hide the NPC
   * @public
   */
  public hideFromPlayer(player: hz.Player) {
    this.closeCurrentDialog(player)
    this.hiddenFromPlayers.add(player)
    const hideFrom = Array.from(this.hiddenFromPlayers)
    this.entity.children.get().forEach(child => {
      child.setVisibilityForPlayers(hideFrom, hz.PlayerVisibilityMode.HiddenFrom)
    })
    this.entity.setVisibilityForPlayers(hideFrom, hz.PlayerVisibilityMode.HiddenFrom)
    let visibleTo = [...this.world.getPlayers()]
    visibleTo.filter((player) => hideFrom.find(x => x === player))
  }

  /**
   * Gets the list of players from whom this NPC is currently hidden
   *
   * @returns Array of players who cannot see this NPC
   * @public
   */
  public getHiddenFromPlayers(): hz.Player[] {
    return Array.from(this.hiddenFromPlayers)
  }
}
hz.Component.register(NPC);
