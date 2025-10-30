import * as hz from 'horizon/core';

/**
 * RestartTrigger.ts
 * 
 * This component triggers a restart of the experience and moves the player to a specified position.
 * 
 * Setup:
 * 1. Create an empty object in the scene.
 * 2. Attach this script to the object.
 * 3. Assign the target position object to the "toPosition" property in the inspector.
 * 4. Enable custom player movement in player settings
 */

class RestartTrigger extends hz.Component<typeof RestartTrigger> {
  static propsDefinition = {
    toPosition: { type: hz.PropTypes.Entity },
  };

  /**
     * Lifecycle method called when the component is initialized.
     */
  start() {
    this.subscribeEvents();
  }

  /**
   * Check when a player enters the trigger and move to the desired position
   */
  subscribeEvents() {
    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterTrigger, (enteredBy: hz.Player) => {
      if (this.props.toPosition) {
        this.props.toPosition.as(hz.SpawnPointGizmo).teleportPlayer(enteredBy);
      }
    });
  }
}

// Register the component so it can be used in the world
hz.Component.register(RestartTrigger);