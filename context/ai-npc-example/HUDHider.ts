import * as hz from 'horizon/core'
import * as Globals from 'Globals'
import LocalCamera from 'horizon/camera'
import { CameraMode } from 'horizon/camera'

 /**
 * HUDHider class;
 * 
 * The HUDHider runs every 500ms checking to see if we are in a menu.  While we are in a menu, we turn off the HUD 
 * so it doesn't overdraw.
 * 
 * NOTE: This functionality to get an event on menu entry/exit did not exist in the Horizon API at the time this feature was written.
 * 
 */
export class HUDHider extends hz.Component<typeof HUDHider> {
  static propsDefinition = {
  }

  /**
  * Set up a half second timer.
  */ 
  start() {
    this.async.setInterval(() => {
      this.onUpdate()
    }, 500);
  }

  cachedCameraMode: CameraMode = CameraMode.Follow

  /**
  * Check to see if the camera mode has changed, send an event to toggle the HUD if necessary.
  */   
  protected onUpdate(): void {
    if (this.entity.owner.get() != this.world.getServerPlayer()) {
      // console.log(`${this.entity.owner.get()}: UPDATE CADENCE. CameraMode: ${LocalCamera.currentMode.get()}`)
      let localCameraMode = LocalCamera.currentMode.get();
      if (localCameraMode !== this.cachedCameraMode) {
        if (localCameraMode === CameraMode.Fixed) {
          // enter focused UI
          // console.log(`${this.entity.owner.get()}: Turn off HUD`)
          this.sendNetworkBroadcastEvent(Globals.DisplayHUDEvent, { player: this.entity.owner.get(), show: false }, [this.world.getServerPlayer()]);
        }
        if (localCameraMode === CameraMode.Follow) {
          // exit focused UI
          // console.log(`${this.entity.owner.get()}: Turn on HUD`)
          this.sendNetworkBroadcastEvent(Globals.DisplayHUDEvent, { player: this.entity.owner.get(), show: true }, [this.world.getServerPlayer()]);
        }
        this.cachedCameraMode = localCameraMode;
      }
    }
  }
}
hz.Component.register(HUDHider)