import * as hz from "horizon/core";
import {
  EventsService,
  PlayerInitialState,
} from "constants";

class PlayerManager extends hz.Component<typeof PlayerManager> {
  static propsDefinition = {};
  owner: hz.Player | null = null;
  serverPlayer?: hz.Player | null = null;
  state: Omit<PlayerInitialState, "player"> | null = null;

  preStart(): void {

    // On Player Enter World
    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnPlayerEnterWorld,
      (player: hz.Player) => {
        this.entity.owner.set(player);
        this.fetchInitialState(player);
        console.log(
          `[PlayerManager] Player ${player.name.get()} has entered the world (client).`
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
    this.owner = this.entity.owner.get();
    console.log(
      `[PlayerManager] Owner of this entity is ${this.owner?.name.get()}`
    );
    this.serverPlayer = this.world.getServerPlayer();

    if (this.owner === this.serverPlayer) {
      console.warn(
        `[PlayerManager] This is the server player: ${this.serverPlayer?.name.get()}`
      );
      return;
    }

  }



  private fetchInitialState(player: hz.Player) {
    if (!player) {
      console.error(
        "[PlayerManager] No current player to fetch initial state."
      );
      return;
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
}
hz.Component.register(PlayerManager);
