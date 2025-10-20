import * as hz from "horizon/core";
import { VARIABLE_GROUPS } from "constants";
import {
  EventsService,
  QuestItemCollected,
  PlayerInitialState,
} from "constants";

class PlayerManager extends hz.Component<typeof PlayerManager> {
  static propsDefinition = {};
  owner: hz.Player | null = null;
  serverPlayer?: hz.Player | null = null;
  state: Omit<PlayerInitialState, "player"> | null = null;

  preStart(): void {
    console.log(
      "[PlayerManager] preStart — connecting QuestItemCollected listener (client)"
    );

    this.connectNetworkBroadcastEvent(
      EventsService.PlayerEvents.QuestItemCollected,
      (payload: QuestItemCollected) => this.questItemCollected(payload)
    );

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

    // const attachedItem = hz.PlayerControls.connectLocalInput(
    //   hz.PlayerInputAction.RightPrimary,
    //   hz.ButtonIcon.Swap,
    //   this
    // );

    // attachedItem.registerCallback((action, pressed) => {
    //   console.log(
    //     `[PlayerManager] RightPrimary action: ${action}, pressed: ${pressed}`
    //   );
    //   // if (pressed) {
    //   //   this.heldItem?.as(hz.GrabbableEntity).forceRelease();
    //   //   // Attached object to the player
    //   //   this.heldItem?.as(hz.AttachableEntity).attachToPlayer(this.owner!, hz.AttachablePlayerAnchor.Torso);
    //   // }
    // });
  }

  private questItemCollected(payload: QuestItemCollected) {
    if (!this.owner) {
      console.error(
        "[PlayerManager] No current player to process QuestItemCollected."
      );
      return;
    }
    const isStorageInitialized = this.isStorageInitialized();

    if (isStorageInitialized) {
      console.log(
        `[PlayerManager] Player ${this.owner.name.get()} collected item: `,
        payload.entity
      );
      const entityId = (payload.entity as any)?.id;
      this.sendNetworkBroadcastEvent(EventsService.AssetEvents.DestroyAsset, {
        entityId,
        player: this.owner,
      });
    } else {
      console.warn(
        "[PlayerManager] Player storage not initialized. Ignoring QuestItemCollected event."
      );
    }
  }

  private isStorageInitialized(): boolean {
    if (!this.owner) {
      console.error("[PlayerManager] No current player to initialize.");
      return false;
    }

    // TODOD - Maybe do runtime checks
    if (this.state?.isStorageInitialized !== 1) {
      return false;
    } else {
      return true;
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
      isStorageInitialized: payload.isStorageInitialized,
      wearables: payload.wearables,
    };
  }
}
hz.Component.register(PlayerManager);
