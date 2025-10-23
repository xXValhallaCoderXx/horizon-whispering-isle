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
  state: Omit<PlayerInitialState, "player"> | null = null;

  private hud: PlayerHealthHUD | null = null;

  preStart(): void {

    // On Player Enter World
    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnPlayerEnterWorld,
      (player: hz.Player) => {

        this.fetchInitialState(player);
        console.log(
          `[PlayerManager]: ${player.name.get()} has entered the world.`
        );
      }
    );

    this.connectNetworkBroadcastEvent(
      EventsService.PlayerEvents.RecievedInitialState,
      (payload: PlayerInitialState) => {
        this.initializePlayerState(payload);
      }
    );
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

  private fetchInitialState(player: hz.Player) {
    if (!player) {
      console.error(
        "[PlayerManager] No current player to fetch initial state."
      );
      return;
    }

    if (PlayerStateService.instance) {
      const playerState = PlayerStateService.instance.getPlayerState(
        player,
      );

      console.log("[PlayerManager] Fetched initial state:", playerState);
    }

    this.sendNetworkBroadcastEvent(
      EventsService.PlayerEvents.FetchInitialState,
      {
        player: player,
      }
    );
  }

  private initializePlayerState(payload: PlayerInitialState) {
    console.log(
      `[PlayerManager] Initializing state for player ${payload.isStorageInitialized}`
    );
    // Additional initialization logic can go here
    this.state = {
      isTutorialCompleted: payload.isTutorialCompleted,
      isStorageInitialized: payload.isStorageInitialized,
      wearables: payload.wearables,
    };
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
