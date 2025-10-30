import * as hz from 'horizon/core';
import { WaypointEvents } from './QuestWaypointController';

/**
 * TestSendEventQuest.ts
 *
 * Summary:
 * This component is used to send a network broadcast event when a player enters a specific trigger zone to activate quest waypoints.
 *
 * Works with:
 * - QuestWaypointController.ts - Receives the broadcasted event to activate quest waypoints.
 */

class TestSendEventQuest extends hz.Component<typeof TestSendEventQuest> {
  static propsDefinition = {};

  /**
   * Lifecycle method called when the TestSendEventQuest component is initialized.
   * Sets up event listeners for player entering the trigger zone.
   */
  start() {
    this.subscribeEvents();
  }

  /**
   * Subscribes to the OnPlayerEnterTrigger event to send a network broadcast event
   * when a player enters the trigger zone.
   */
  private subscribeEvents() {
    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterTrigger, (player: hz.Player) => {
      this.sendNetworkBroadcastEvent(WaypointEvents.activeQuestWaypoint, { player });
    });


  }
}
// Register the component so it can be used in the world
hz.Component.register(TestSendEventQuest);