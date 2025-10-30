import {CodeBlockEvents, Component, LocalEvent, NetworkEvent, Player, PropTypes} from 'horizon/core';
import {LocalizableText} from "HorizonI18nUtils";

/**
 * TutorialManager.ts
 *
 * Summary:
 * Manages the tutorial flow for players.
 * 
 * Works with:
 * - TutorialController.ts - Controls the tutorial slides and player interactions.
 * - TutorialSlide.ts - Represents individual tutorial slides.
 * - UIHighlight.ts - Provides UI highlighting for the tutorial.
 */

export class TutorialManager extends Component<typeof TutorialManager> {
  static propsDefinition = {};

  public readonly TutorialEvents = {
    /**
     * Event triggered when a player starts a tutorial.
     * @param data - The data associated with the event.
     * @param data.player - The player who started the tutorial.
     * @param data.tutorialId - The identifier of the tutorial that has started.
     * @param [data.params] - Optional additional parameters associated with the tutorial.
     */
    onTutorialStarted:                new LocalEvent<{player: Player, tutorialId: string, params?: Map<any,any>}>('onTutorialStarted'),
    /**
     * Event triggered when a player finishes a tutorial.
     * @param data - The event data.
     * @param data.player - The player who completed the tutorial.
     * @param data.tutorialId - The unique identifier of the completed tutorial.
     * @param [data.params] - Optional additional parameters associated with the completion of the tutorial.
     */
    onTutorialFinished:               new LocalEvent<{player: Player, tutorialId: string, params?: Map<any,any>}>('onTutorialFinished'),
    /**
     * Event triggered when a tutorial step has started.
     * @param data.player - The player who has started the tutorial step.
     * @param data.stepId - The identifier of the tutorial step.
     * @param [data.params] - Optional parameters associated with the tutorial step.
     */
    onTutorialStepStarted:            new LocalEvent<{player: Player, stepId: string, params?: Map<any,any>}>('onTutorialStepStarted'),
    /**
     * Event triggered when a tutorial step is completed.
     * The event provides details about the player, the step identifier,
     * and optional parameters associated with the step.
     * @param data.player - The player who completed the tutorial step.
     * @param data.stepId - The identifier of the completed tutorial step.
     * @param [data.params] - Optional parameters related to the tutorial step.
     */
    onTutorialStepFinished:           new LocalEvent<{player: Player, stepId: string, params?: Map<any,any>}>('onTutorialStepFinished'),
    /**
     * Event triggered when a player performs a tutorial-related action.
     * @param data - The data associated with the tutorial action event.
     * @param data.player - The player performing the tutorial action.
     * @param data.actionId - The identifier of the tutorial action being performed.
     * @param [data.params] - Optional parameters associated with the tutorial action.
     */
    onTutorialActionPerformed:        new LocalEvent<{player: Player, actionId: string, params?: Map<any,any>}>('onTutorialActionPerformed'),
    /**
     * Represents a network event triggered when a player performs an action during a tutorial.
     * This event carries information about the player and the associated action ID.
     * It can be used by local (client) scripts to notify the server of an action.
     * @param data.player - The player who performed the action during the tutorial.
     * @param data.actionId - The identifier of the action that was performed.
     */
    onTutorialActionPerformedNetwork: new NetworkEvent<{player: Player, actionId: string}>('onTutorialActionPerformedNetwork'),
    /**
     * Event triggered to show a custom message.
     * This event allows for displaying a custom message to a specific player with configurable settings.

     * @param data - The event data.
     * @param data.player - The player to whom the message is displayed.
     * @param data.actionId - The identifier for the specific action associated with the custom message.
     * @param data.message - The message to be displayed. Can be a string or a localizable text object.
     * @param data.isPopup - Determines if the message should be displayed as a popup.
     * @param data.params - Optional parameters that can be passed along with the message.
     */
    onShowCustomMessage:              new LocalEvent<{player: Player, actionId: string, message: string | LocalizableText, isPopup: boolean, params?: Map<any,any>}>('onShowCustomMessage'),
    /**
     * Event triggered to hide a custom message.
     *
     * This event is dispatched when a specific custom message is hidden for a player.
     * It provides relevant details about the player, the action that triggered the event,
     * and whether the interaction was a popup.
     * @param player - The player instance for whom the event is triggered.
     * @param actionId - The unique identifier for the action related to hiding the message.
     * @param isPopup - Indicates whether the hidden message is part of a popup.
     */
    onHideCustomMessage:              new LocalEvent<{player: Player, actionId: string, isPopup: boolean}>('onHideCustomMessage'),
    /**
     * Event triggered to start the highlighting process.
     * The event provides information about the player initiating the highlight action,
     * the associated action ID of the process, and the relevant image ID.
     * This event only accepts one image, so any PlayerDeviceType (Mobile, Web, VR) detection should be done beforehand.
     * @param player - The player initiating the highlight action.
     * @param actionId - Identifies the specific highlight action.
     * @param imageId - Represents the ID of the image being displayed.
     */
    onStartHighlight:                 new LocalEvent<{player: Player, actionId: string, imageId: string}>('onStartHighlight'),
    /**
     * Event triggered to stop a highlight.
     * @param player - The player for whom the highlight will be stopped.
     * @param actionId - The identifier for the associated action leading to the stop.
     */
    onStopHighlight:                  new LocalEvent<{player: Player, actionId: string}>('onStopHighlight'),
    /**
     * Registers the action of a player to be listened to.
     * @param player - The player involved in the event.
     * @param actionId - The unique identifier for the action being performed.
     */
    onListen:                         new LocalEvent<{player: Player, actionId: string}>('onListen'),
    /**
     * Stops listening for the action.
     * @param player - The player associated with the event.
     * @param actionId - The identifier for the action that stopped listening.
     */
    onStopListen:                     new LocalEvent<{player: Player, actionId: string}>('onStopListen'),
    /**
     * Event triggered to stop listening to all active events of a player.
     * @param player - The player associated with the event.
     */
    onStopListenAll:                  new LocalEvent<{player: Player}>('onStopListenAll'),
  };

  private playersAndListenSteps: Map<Player, string[]> = new Map();

  /**
   * Executes when the world starts and when an entity that has this script 
   * Sets up event listeners for various tutorial-related events.
   */
  start() {
    this.connectLocalBroadcastEvent(this.TutorialEvents.onTutorialStepStarted, this.onTutorialStepStarted.bind(this));
    this.connectLocalBroadcastEvent(this.TutorialEvents.onTutorialStepFinished, this.onTutorialStepFinished.bind(this));
    this.connectLocalBroadcastEvent(this.TutorialEvents.onTutorialActionPerformed, this.onTutorialActionPerformed.bind(this));
    this.connectNetworkBroadcastEvent(this.TutorialEvents.onTutorialActionPerformedNetwork, this.onTutorialActionPerformedNetwork.bind(this));
    this.connectLocalBroadcastEvent(this.TutorialEvents.onListen, this.startListen.bind(this));
    this.connectLocalBroadcastEvent(this.TutorialEvents.onStopListen, this.stopListen.bind(this));
    this.connectLocalBroadcastEvent(this.TutorialEvents.onStopListenAll, this.stopListenAll.bind(this));
    this.connectCodeBlockEvent(this.entity, CodeBlockEvents.OnPlayerExitWorld, this.onPlayerExitWorld.bind(this));
  }

  //#region Listen Methods

  /**
   * Starts listening for a specific tutorial step for the specified player.
   *
   * @param payload - The details needed for starting the listener.
   * @param payload.player - The player who will start listening.
   * @param payload.actionId - The unique identifier of the tutorial action to listen for.
   */
  startListen(payload: {player: Player, actionId: string}) {
    const player = payload.player;
    const id = payload.actionId;
    let playerListenIds = this.playersAndListenSteps.get(player);

    if (!playerListenIds) {
      playerListenIds = [];
      this.playersAndListenSteps.set(player, playerListenIds);
    }

    if (playerListenIds?.includes(id)) {
      console.warn(`Player ${player.name.get()} already listening for tutorial step ${id}.`);
    } else {
      playerListenIds?.push(id);
    }
  }

  /**
   * Stops the listening action for a specified tutorial step associated with a player.
   *
   * @param payload - The payload containing the player and the action ID.
   * @param payload.player - The player for whom the listening action is to be stopped.
   * @param payload.actionId - The unique identifier of the tutorial step to stop listening for.
   */
  stopListen(payload: {player: Player, actionId: string}) {
    const player = payload.player;
    const id = payload.actionId;
    let ids = this.playersAndListenSteps.get(player);

    if (!ids) {
      console.warn(`Player ${player.name.get()} is not listening for any tutorial step.`);
      return;
    }
    if (ids.includes(id)) {
      // Remove the id from ids
      ids.splice(ids.indexOf(id), 1);
    }
  }

  /**
   * Stops all listening actions associated with the given player.
   * @param payload.player
   */
  stopListenAll(payload: {player: Player}) {
    const player = payload.player;
    const ids = this.playersAndListenSteps.get(player);

    if (ids) {
      ids.forEach(id => {
        this.stopListen({
          player: player,
          actionId: id,
        });
      });
    }
    this.playersAndListenSteps.delete(player);
  }

  //#endregion

  //#region Event Methods

  /**
   * Handles the event when a player exits the world. Performs the necessary cleanup or unsubscription for the player.
   * @param player - The player instance that is exiting the world.
   */
  onPlayerExitWorld(player: Player) {
    this.stopListenAll({player: player});
  }

  /**
   * Handles the event when a tutorial step is started. Logs the event and initiates the start listen process for the given player and step.
   * @param payload - The data related to the tutorial step start event.
   * @param payload.player - The player who started the tutorial step.
   * @param payload.stepId - The identifier of the tutorial step being started.
   * @param payload.params - Optional parameters associated with the tutorial step.
   */
  onTutorialStepStarted(payload: {player: Player, stepId: string, params?: Map<any,any>}) {
    this.startListen({player: payload.player,actionId: payload.stepId,});
  }

  /**
   * Handles the event when a tutorial step is finished. Logs the completion and triggers a stop listen action.
   * @param payload An object containing information about the tutorial step and player.
   * @param payload.player The player who completed the tutorial step.
   * @param payload.stepId The identifier of the completed tutorial step.
   * @param payload.completed Indicates if the tutorial step was successfully completed.
   * @param payload.params Optional additional parameters or metadata related to the tutorial step.
   */
  onTutorialStepFinished(payload: {player: Player, stepId: string, completed: boolean, params?: Map<any,any>}) {
    this.stopListen({ player: payload.player,actionId: payload.stepId,});
  }

  /**
   * Handles the specified tutorial action performed by a player and determines whether the action completes a tutorial step.
   * @param payload An object containing the details of the action and player involved.
   * @param payload.player The player performing the tutorial action.
   * @param payload.actionId The identifier of the action performed by the player.
   * @param payload.params An optional map of additional parameters associated with the action.
   */
  onTutorialActionPerformed(payload: {player: Player, actionId: string, params?: Map<any,any>}) {
    const player = payload.player;
    const actionId = payload.actionId;
    const params = payload.params;
    const currentPlayerSteps = this.playersAndListenSteps.get(player);

    if (currentPlayerSteps && currentPlayerSteps.includes(actionId)) {
      this.sendLocalBroadcastEvent(this.TutorialEvents.onTutorialStepFinished, {player: player, stepId: actionId, completed: true, params: params});
    }
  }

  /**
   * Local to Server.
   * Redirects the action perform call to the server without passing any extra params since they are not serializable.
   * @param payload
   */
  onTutorialActionPerformedNetwork(payload: {player: Player, actionId: string}) {
    this.sendLocalBroadcastEvent(this.TutorialEvents.onTutorialActionPerformed, {
      player: payload.player,
      actionId: payload.actionId
    });
  }
  //#endregion

}
// This line registers the TutorialManager component with Horizon
Component.register(TutorialManager);