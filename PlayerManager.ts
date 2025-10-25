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

    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnPlayerEnterWorld, this.attachPlayerHUD)


  }

  start() {

    // MODIFIED: Initialize HUD from this.entity


    // this.hud?.setPlayerName("Unknown");
    // this.hud?.updateHealth(100, 100);
    // this.hud?.show();

  }

  private attachPlayerHUD(player: hz.Player) {

    const playerDao = PlayerStateService.instance?.getPlayerDAO(player);
    const state = playerDao?.getState();


    console.error(`[PlayerManager] CHECK WHAT IS THIS: `);
  }



}
hz.Component.register(PlayerManager);
