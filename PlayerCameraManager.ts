import * as hz from 'horizon/core';
import { EventsService, IPanToEntityPayload } from 'constants';
import LocalCamera, { CameraMode, Easing, CameraTransitionOptions } from 'horizon/camera';

class PlayerCameraManager extends hz.Component<typeof PlayerCameraManager> {
  static propsDefinition = {};

  start() {
    const localPlayer = this.world.getLocalPlayer();
    if (localPlayer && this.entity.owner.get() !== localPlayer) {
      return
    }
    this.connectNetworkEvent(
      this.entity.owner.get(),
      EventsService.CameraEvents.PanToEntity,
      (payload: any) => this.onPanToEntity(payload)
    );
  }

  private onPanToEntity = async (payload: IPanToEntityPayload) => {
    console.log("Starting camera pan to entity");
    const transitionOptions = {
      duration: 0.5,
      easing: Easing.EaseInOut,
    };

    const targetPosition = payload.entity.position.get();
    console.log(`Target entity position: ${targetPosition.toString()}`);

    // Get player's current position to determine approach angle
    const player = this.world.getLocalPlayer();
    if (!player) return;

    const playerPos = player.position.get();
    const directionFromPlayer = targetPosition.sub(playerPos).normalize();

    // Place camera 5 units back from target in the direction of player, 2 units up
    const cinematicCameraPosition = targetPosition
      .sub(directionFromPlayer.mul(5))
      .add(new hz.Vec3(0, 2, 0));

    const lookVector = targetPosition.sub(cinematicCameraPosition).normalize();
    const cinematicRotation = hz.Quaternion.lookRotation(lookVector, hz.Vec3.up);

    LocalCamera.setCameraModeFixed({
      position: cinematicCameraPosition,
      rotation: cinematicRotation,
      ...transitionOptions,
    });

    this.async.setTimeout(() => {
      console.log("Cinematic hold complete. Returning control.");
      LocalCamera.setCameraModeThirdPerson(transitionOptions);
    }, payload.duration || 2000);

  };
}
hz.Component.register(PlayerCameraManager);