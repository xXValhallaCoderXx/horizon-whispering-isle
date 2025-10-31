import { EventsService } from 'constants';
import { AudioGizmo, Component, PropTypes, SpawnPointGizmo, Player, CodeBlockEvents, AttachablePlayerAnchor, AttachableEntity, AudioOptions, Entity, AudibilityMode, PlayerVisibilityMode, Asset, GrabbableEntity } from 'horizon/core';
import { PlayerStateService } from 'PlayerStateService';
import { VisualFxBank } from 'VisualFxBank';
class WorldManager extends Component<typeof WorldManager> {
  static propsDefinition = {
    welcomeSound: { type: PropTypes.Entity },
    seawaveSound: { type: PropTypes.Entity },
    backgroundMusic: { type: PropTypes.Entity },
    playerStorageAsset: { type: PropTypes.Asset },
    starterAxeAsset: { type: PropTypes.Asset },
    playerServiceAsset: { type: PropTypes.Entity },
    tutorialIslandSpawnPoint: { type: PropTypes.Entity },
    mainIslandSpawnPoint: { type: PropTypes.Entity },
    // tutorialNpcEntity: { type: PropTypes.Entity },
  };

  private currentActivePlayers: Set<Player> = new Set();

  preStart(): void {
    this.connectCodeBlockEvent(this.entity, CodeBlockEvents.OnPlayerEnterWorld, this.playerEnterWorld)
    this.connectCodeBlockEvent(this.entity, CodeBlockEvents.OnPlayerExitWorld, this.playerExitWorld)
    this.connectLocalBroadcastEvent(
      EventsService.PlayerEvents.OnPlayerStateLoaded,
      (payload: { player: Player; state: any }) => {
        this.playerDataInitialized(payload.player);
      }
    );
  }

  start() { }

  private playerEnterWorld = (player: Player) => {
    console.log(`[WorldManager] Player ${player} entered world.`);
    this.currentActivePlayers.add(player);
    const welcomeSound = this.props.welcomeSound?.as(AudioGizmo);
    const options: AudioOptions = {
      fade: 0,
      players: [player],
      audibilityMode: AudibilityMode.AudibleTo,
    };
    VisualFxBank.instance.playVFXForPlayerAt("smoke_destroy_small", player, player.position.get());
    welcomeSound && welcomeSound.play(options);
  }

  private async playerDataInitialized(player: Player) {
    const tutorialDao = PlayerStateService.instance?.getTutorialDAO(player);
    const isTutorialComplete = tutorialDao?.getTutorialCompletionStatus();
    const inventoryDao = PlayerStateService.instance?.getInventoryDAO(player);
    const isStorageInitialized = inventoryDao?.getIsStorageBagAcquired();
    if (isStorageInitialized && this.props.playerStorageAsset) {
      this.attachAsset(player, this.props.playerStorageAsset);
    }
    if (isTutorialComplete && this.props.starterAxeAsset) {
      this.attachAsset(player, this.props.starterAxeAsset);
      this.teleportPlayer(player, this.props.mainIslandSpawnPoint);
    } else {
      const questId = tutorialDao?.getActiveQuestId();
      const currentQuestIndex = tutorialDao?.getQuestStep(questId || "") || 0;
      if (currentQuestIndex >= 3 && this.props.starterAxeAsset) {
        this.attachAsset(player, this.props.starterAxeAsset);
      }
      this.teleportPlayer(player, this.props.tutorialIslandSpawnPoint);
    }
  }

  private playerExitWorld = (player: Player) => {
    this.currentActivePlayers.delete(player);
  }


  private async attachAsset(player: Player, asset: Asset) {
    const spawnPosition = player.position.get();
    const spawnedEntities = await this.world.spawnAsset(asset, spawnPosition);
    const rootEntity = spawnedEntities[0];
    rootEntity.setVisibilityForPlayers([player], PlayerVisibilityMode.HiddenFrom);
    rootEntity.visible.set(false);
    rootEntity.simulated.set(false);
    const attachable = rootEntity.as(AttachableEntity);
    attachable.attachToPlayer(player, AttachablePlayerAnchor.Torso);
    rootEntity.owner.set(player);
    rootEntity.visible.set(true);
    rootEntity.setVisibilityForPlayers([player], PlayerVisibilityMode.VisibleTo);
  }

  private teleportPlayer(player: Player, spawnPoint: Entity | null | undefined) {
    if (!spawnPoint) {
      console.error(`[PlayerSpawnManager] Spawn point is not set.`);
      return;
    }
    const gizmo = spawnPoint.as(SpawnPointGizmo);
    if (gizmo) {
      gizmo.teleportPlayer(player);
    } else {
      console.error(`[PlayerSpawnManager] entity is not a SpawnPointGizmo.`);
    }
  }

}

Component.register(WorldManager);