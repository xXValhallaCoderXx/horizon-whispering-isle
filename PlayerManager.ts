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
    playerCameraManager: { type: hz.PropTypes.Entity },
  };

  preStart(): void {



    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnPlayerEnterWorld,
      (player: hz.Player) => this.onPlayerEnterWorld(player)
    );
  }

  start() { }

  private onPlayerEnterWorld(player: hz.Player) {

    console.log(`[PlayerManager] Player ${player.id} entered world - Transfering Ownership.`);
    this?.props?.playerHPGizmo?.owner.set(player);
    this?.props?.playerCameraManager?.owner.set(player);
    const playerDao = PlayerStateService.instance?.getPlayerDAO(player);
    const playerState = playerDao?.getState();

    const playerMaxHealth = playerState?.health
    const playerName = player?.name.get() || "Unknown";
    this.async.setTimeout(() => {
      this.sendNetworkEvent(player, EventsService.PlayerEvents.DisplayHealthHUD, { player, currentHealth: playerMaxHealth ?? 100, maxHealth: playerMaxHealth ?? 100, name: playerName });
    }, 1000);
  }
}
hz.Component.register(PlayerManager);
