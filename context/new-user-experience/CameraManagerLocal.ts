import LocalCamera from 'horizon/camera';
import * as hz from 'horizon/core';

/**
 * CameraManagerLocal.ts
 * 
 * Summary:
 * Manages camera mode changes for the local player.
 * 
 * Works with:
 * - QuestManager.ts Manages the overall quest system.
 * - QuestTrigger.ts Triggers quest-related events.
 * - UIQuestStartDialogue Prompts players to start quests
 * - UIQuestComplete Shows quest completion UI
 * - UICurrentQuests Displays active quests
 * - Quest.ts - Represents a quest entity.
 * 
 */

/**
 * If blockPlayerMovement is set to true in GameManager entity, 
 * it will lock the camera in place when the start quest dialogue is shown.
 */
export const CameraEvents = {
  setCameraMode: new hz.NetworkEvent<{ fixed: boolean }>("setCameraFixed")
};

/**
 * A local component that listens for camera mode change events
 * and applies them to the local player's camera.
 */
class CameraManagerLocal extends hz.Component<typeof CameraManagerLocal> {
  // No custom props needed for this component.
  static propsDefinition = {};

  // The player who owns this camera manager instance.
  private owner: hz.Player = hz.Player.prototype;

  /**
   * Lifecycle method called once when the component is added to an entity.
   * Caches the owner player and, if not the server, starts listening for events.
   */
  start() {
    this.owner = this.entity.owner.get();

    // Only hook events for real players, not the server player
    if (this.owner !== this.world.getServerPlayer()) {
      this.subscribeEvents();
    }
  }

  /**
   * Subscribes to the setCameraMode network event sent by other components.
   * When received, onSetCameraMode will be invoked with the event data.
   */
  private subscribeEvents() {
    this.connectNetworkEvent(
      this.owner,
      CameraEvents.setCameraMode,
      (data) => this.onSetCameraMode(data)
    );
  }

  /**
   * Handles camera mode change events.
   * - If `fixed` is true, locks the camera at its current position and rotation.
   * - If `fixed` is false, switches back to third-person view with a smooth transition.
   *
   * @param data.fixed whether to lock (true) or free (false) the camera
   */
  private onSetCameraMode(data: { fixed: boolean }) {
    if (data.fixed) {
      // Capture current transform to lock the camera in place
      const currentCameraPosition = LocalCamera.position.get();
      const currentCameraRotation = LocalCamera.rotation.get();
      LocalCamera.setCameraModeFixed({
        position: currentCameraPosition,
        rotation: currentCameraRotation,
        duration: 0
      });
    } else {
      // Return to third-person view over 1 second
      LocalCamera.setCameraModeThirdPerson({ duration: 1 });
    }
  }
}

// Register the component with horizon
hz.Component.register(CameraManagerLocal);