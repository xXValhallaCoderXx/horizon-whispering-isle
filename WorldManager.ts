import { PlayerState } from 'constants';
import { AudioGizmo, Component, PropTypes, SpawnPointGizmo, Player, CodeBlockEvents, AudioOptions, Entity, AudibilityMode, PlayerVisibilityMode, Asset, GrabbableEntity } from 'horizon/core';
import { PlayerStateService } from 'PlayerStateService';

class WorldManager extends Component<typeof WorldManager> {
  static propsDefinition = {
    welcomeSound: { type: PropTypes.Entity },
    seawaveSound: { type: PropTypes.Entity },
    backgroundMusic: { type: PropTypes.Entity },
    playerStorageAsset: { type: PropTypes.Asset },
    playerServiceAsset: { type: PropTypes.Entity },
    tutorialIslandSpawnPoint: { type: PropTypes.Entity },
    mainIslandSpawnPoint: { type: PropTypes.Entity },
  };

  private currentActivePlayers: Set<Player> = new Set();

  preStart(): void {
    this.connectCodeBlockEvent(this.entity, CodeBlockEvents.OnPlayerEnterWorld, this.playerEnterWorld)
    this.connectCodeBlockEvent(this.entity, CodeBlockEvents.OnPlayerExitWorld, this.playerExitWorld)
  }

  start() { }

  private playerEnterWorld = (player: Player) => {

    // Play welcome sound
    const soundGizmo = this.props.welcomeSound?.as(AudioGizmo);
    const options: AudioOptions = {
      fade: 0,
      players: [player],
      audibilityMode: AudibilityMode.AudibleTo,
    };
    soundGizmo && soundGizmo.play(options);


    const playerState = this.initializePlayer(player);
    this.currentActivePlayers.add(player);
    if (playerState?.tutorial?.completed) {
      this.teleportPlayer(player, this.props.mainIslandSpawnPoint);
    } else {
      this.teleportPlayer(player, this.props.tutorialIslandSpawnPoint);
    }
  }

  private initializePlayer(player: Player): PlayerState | void | null {
    const playerService = this.playerService();
    if (!playerService) {
      console.error('[WorldManager] PlayerStateService not found!');
      return;
    }
    // Load state and broadcast to all listeners (including QuestManager)
    const state = playerService.loadAndBroadcastState(player);
    console.log(`[WorldManager] Player ${player.name.get()} state loaded. Active quest: ${state.quests.active || 'none'}`);
    return state;
  }

  private playerExitWorld = (player: Player) => {
    console.log(`[WorldManager] Player ${player.name.get()} has exited the world.`);
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

  private teleportPlayer(player: Player, spawnPoint: Entity | null | undefined) {
    if (!spawnPoint) {
      console.error(`[PlayerSpawnManager] Spawn point is not set.`);
      return;
    }

    const gizmo = spawnPoint.as(SpawnPointGizmo);
    if (gizmo) {
      console.log(`[PlayerSpawnManager] Teleporting ${player.name.get()}.`);
      gizmo.teleportPlayer(player);
    } else {
      console.error(`[PlayerSpawnManager] entity is not a SpawnPointGizmo.`);
    }
  }

}

Component.register(WorldManager);