import { EventsService, PlayerState } from 'constants';
import { AudioGizmo, Component, PropTypes, SpawnPointGizmo, Player, CodeBlockEvents, AttachablePlayerAnchor, AttachableEntity, AudioOptions, Entity, AudibilityMode, PlayerVisibilityMode, Asset, GrabbableEntity } from 'horizon/core';
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
    this.connectLocalBroadcastEvent(
      EventsService.PlayerEvents.OnPlayerStateLoaded,
      (payload: { player: Player; state: PlayerState }) => {
        this.playerDataInitialized(payload.player);
      }
    );
  }

  start() { }

  private playerEnterWorld = (player: Player) => {
    this.currentActivePlayers.add(player);
    const welcomeSound = this.props.welcomeSound?.as(AudioGizmo);
    const options: AudioOptions = {
      fade: 0,
      players: [player],
      audibilityMode: AudibilityMode.AudibleTo,
    };
    welcomeSound && welcomeSound.play(options);
  }

  private async playerDataInitialized(player: Player) {
    console.log(`[WorldManager] Player ${player.name.get()} data initialized.`);
    const tutorialDao = PlayerStateService.instance?.getTutorialDAO(player);
    const isTutorialComplete = tutorialDao?.getTutorialCompletionStatus();
    const inventoryDao = PlayerStateService.instance?.getInventoryDAO(player);
    const isStorageInitialized = inventoryDao?.getIsStorageBagAcquired();
    if (isStorageInitialized && this.props.playerStorageAsset) {
      this.handleAttachAsset(player);
    }
    if (isTutorialComplete) {
      this.teleportPlayer(player, this.props.mainIslandSpawnPoint);
    } else {
      const isQuestActive = tutorialDao?.getActiveQuestId();


      if (isQuestActive) {
        console.log(`[WorldManager] Player ${player.name.get()} has a quest in progress - open Quest HUD: ${isQuestActive}`);
        console.error("SENDING EVENT FOR PLAYER: ", player);
        this.sendNetworkEvent(player, EventsService.QuestEvents.DisplayQuestHUD, { player, title: "Welcome Back to the Tutorial!", questId: isQuestActive });


      }
      this.teleportPlayer(player, this.props.tutorialIslandSpawnPoint);
    }
  }

  private playerExitWorld = (player: Player) => {
    this.currentActivePlayers.delete(player);
  }

  private async handleAttachAsset(player: Player) {
    const asset = this.props.playerStorageAsset as Asset
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
      console.log(`[PlayerSpawnManager] Teleporting ${player.name.get()}.`);
      gizmo.teleportPlayer(player);
    } else {
      console.error(`[PlayerSpawnManager] entity is not a SpawnPointGizmo.`);
    }
  }

}

Component.register(WorldManager);