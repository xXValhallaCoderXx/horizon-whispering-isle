import * as hz from "horizon/core";
import {
  EventsService,
  PlayerInitialState,
} from "constants";
import { PlayerStateService } from "PlayerStateService";
import { PlayerHealthHUD } from "PlayerHealthHUD";

class PlayerManager extends hz.Component<typeof PlayerManager> {
  static propsDefinition = {
    playerHPGizmo: { type: hz.PropTypes.Entity },
  };


  private hud: PlayerHealthHUD | null = null;

  preStart(): void {

  }

  start() {

    // MODIFIED: Initialize HUD from this.entity
    this.hud = this.initializeHud();
    if (!this?.hud) {
      // This error will still fire if you forget to add the PlayerHealthHUD script
      // to the same entity as the PlayerManager script.
      console.error(
        `[PlayerManager] Failed to initialize HUD for player. Ensure PlayerHealthHUD script is on the same entity.`
      );
      return;
    }

    this.hud?.setPlayerName("Unknown");
    this.hud?.updateHealth(100, 100);
    this.hud?.show();

  }




  private initializeHud(): PlayerHealthHUD | null {
    // 1. Get the reference to the CustomUI Gizmo entity via props
    const hpGizmoEntity = this.props.playerHPGizmo;

    if (!hpGizmoEntity) {
      console.error("Player HP Gizmo reference is missing.");
      return null;
    }

    // 2. Query the *referenced entity* for the desired component
    // Note: We cast the result to ensure TypeScript typing works correctly later.
    const components = hpGizmoEntity.getComponents(PlayerHealthHUD);

    // 3. Return the component instance
    return (components.length > 0) ? components[0] : null;
  }
}
hz.Component.register(PlayerManager);
