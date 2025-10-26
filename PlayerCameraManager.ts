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
    const cinematicOffset = new hz.Vec3(0, 2, -5);
    const cinematicCameraPosition = targetPosition.add(cinematicOffset);
    const lookVector = targetPosition.sub(cinematicCameraPosition).normalize();
    const cinematicRotation = hz.Quaternion.lookRotation(lookVector, hz.Vec3.up);

    LocalCamera.setCameraModeFixed({
      position: cinematicCameraPosition,
      rotation: cinematicRotation,
      ...transitionOptions,
    });

    // Use async.setTimeout like in DoorCutscene - multiply by 1000 for milliseconds
    this.async.setTimeout(() => {
      console.log("Cinematic hold complete. Returning control.");
      LocalCamera.setCameraModeThirdPerson(transitionOptions);
    }, payload.duration || 2000);

  };
}
hz.Component.register(PlayerCameraManager);