import { AudioGizmo, Component, PropTypes, Player, CodeBlockEvents, AudioOptions, Entity, AttachableEntity, AttachablePlayerAnchor, AudibilityMode, PlayerVisibilityMode, Asset, GrabbableEntity } from 'horizon/core';
import { EventsService } from 'constants';
import { VARIABLE_GROUPS } from 'constants';
import { PlayerStateService } from 'PlayerStateService';

class WorldManager extends Component<typeof WorldManager> {
  static propsDefinition = {
    welcomeSound: { type: PropTypes.Entity },
    playerStorageAsset: { type: PropTypes.Asset },
    playerServiceAsset: { type: PropTypes.Entity },
  };

  private currentActivePlayers: Set<Player> = new Set();

  preStart(): void {
    this.connectCodeBlockEvent(this.entity, CodeBlockEvents.OnPlayerEnterWorld, this.playerEnterWorld)
    this.connectCodeBlockEvent(this.entity, CodeBlockEvents.OnPlayerExitWorld, this.playerExitWorld)
    // this.connectNetworkBroadcastEvent(
    //   EventsService.PlayerEvents.StorageInitialized,
    //   (payload: { player: hz.Player }) => {
    //     console.log(`[WorldManager] Received PlayerStorageInitialized for player ${payload.player.name.get()}`);
    //     this.setPlayerStorageInitialized(payload.player);
    //   }
    // );

    // this.connectNetworkBroadcastEvent(
    //   EventsService.PlayerEvents.FetchInitialState,
    //   (payload: { player: hz.Player }) => {
    //     console.log(
    //       `[WorldManager] Received FetchInitialState for player ${payload.player.name.get()}`
    //     );
    //     this.fetchPlayerInitialState(payload.player);
    //   }
    // );
  }

  start() {

  }

  private playerEnterWorld = (player: Player) => {
    // this.initializePlayerInitialState(player);
    this.initializePlayer(player);
  }

  private initializePlayer(player: Player) {
    const playerService = this.playerService();
    if (!playerService) return


    const soundGizmo = this.props.welcomeSound?.as(AudioGizmo);

    const options: AudioOptions = {
      fade: 0,
      players: [player],
      audibilityMode: AudibilityMode.AudibleTo,
    };
    soundGizmo && soundGizmo.play(options);
    const playerState = playerService.getPlayerState(player);
    // if (playerState === null) {
    //   console.log(`[WorldManager] Player ${player.name.get()} is entering the world for the first time.`);
    //   this.handleGeneratingPlayerStorageItem(player);
    // } else {
    //   console.log(`[WorldManager] Player ${player.name.get()} is re-entering the world with state: `, playerState);
    // }


  }

  private playerExitWorld = (player: Player) => {
    console.log(`Player ${player.name.get()} has exited the world.`);
    this.currentActivePlayers.delete(player);
  }


  private async handleGeneratingPlayerStorageItem(player: Player) {
    console.log(`Generating storage item for player ${player.name.get()}`);
    const asset = this.props.playerStorageAsset as Asset
    console.log("Player Storage Asset: ", asset);
    const spawnPosition = player.position.get();
    console.log("Spawn Position: ", spawnPosition);
    const spawnedEntities = await this.world.spawnAsset(asset, spawnPosition);
    console.log("Spawned Entities: ", spawnedEntities);
    const rootEntity = spawnedEntities[0];

    rootEntity.visible.set(true);
    rootEntity.setVisibilityForPlayers([player], PlayerVisibilityMode.VisibleTo);

    const grabbable = rootEntity.as(GrabbableEntity);
    grabbable.setWhoCanGrab([player]);
    console.log(`Set grabbable for player ${player.name.get()}`);



  }



  private playerService(): PlayerStateService | null {
    const gizmo = this.props.playerServiceAsset as Entity;
    if (!gizmo) return null;
    const comp = gizmo.getComponents(PlayerStateService)[0] as
      | PlayerStateService
      | undefined;
    return comp ?? null;
  }

}

Component.register(WorldManager);