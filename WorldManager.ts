import * as hz from 'horizon/core';
import { EventsService } from 'constants';
import { VARIABLE_GROUPS } from 'constants';

class WorldManager extends hz.Component<typeof WorldManager> {
  static propsDefinition = {
    playerStorageAsset: { type: hz.PropTypes.Asset },
  };

  private currentActivePlayers: Set<hz.Player> = new Set();

  preStart(): void {
    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterWorld, this.playerEnterWorld)
    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerExitWorld, this.playerExitWorld)
    this.connectNetworkBroadcastEvent(
      EventsService.PlayerEvents.StorageInitialized,
      (payload: { player: hz.Player }) => {
        console.log(`[WorldManager] Received PlayerStorageInitialized for player ${payload.player.name.get()}`);
        this.setPlayerStorageInitialized(payload.player);
      }
    );

    this.connectNetworkBroadcastEvent(
      EventsService.PlayerEvents.FetchInitialState,
      (payload: { player: hz.Player }) => {
        console.log(
          `[WorldManager] Received FetchInitialState for player ${payload.player.name.get()}`
        );
        this.fetchPlayerInitialState(payload.player);
      }
    );
  }

  start() {

  }

  private playerEnterWorld = (player: hz.Player) => {


    this.initializePlayerInitialState(player);

  }

  private playerExitWorld = (player: hz.Player) => {
    console.log(`Player ${player.name.get()} has exited the world.`);
    this.currentActivePlayers.delete(player);
  }


  private async handleGeneratingPlayerStorageItem(player: hz.Player) {
    console.log(`Generating storage item for player ${player.name.get()}`);
    const asset = this.props.playerStorageAsset as hz.Asset
    console.log("Player Storage Asset: ", asset);
    const spawnPosition = player.position.get();
    console.log("Spawn Position: ", spawnPosition);
    const spawnedEntities = await this.world.spawnAsset(asset, spawnPosition);
    console.log("Spawned Entities: ", spawnedEntities);
    const rootEntity = spawnedEntities[0];

    rootEntity.visible.set(true);
    rootEntity.setVisibilityForPlayers([player], hz.PlayerVisibilityMode.VisibleTo);

    const grabbable = rootEntity.as(hz.GrabbableEntity);
    grabbable.setWhoCanGrab([player]);
    console.log(`Set grabbable for player ${player.name.get()}`);



  }


  private async handleAttachAsset(player: hz.Player) {
    console.log(`Generating storage item for player ${player.name.get()}`);
    const asset = this.props.playerStorageAsset as hz.Asset
    console.log("Player Storage Asset: ", asset);
    const spawnPosition = player.position.get();
    console.log("Spawn Position: ", spawnPosition);
    const spawnedEntities = await this.world.spawnAsset(asset, spawnPosition);
    console.log("Spawned Entities: ", spawnedEntities);
    const rootEntity = spawnedEntities[0];
    rootEntity.setVisibilityForPlayers([player], hz.PlayerVisibilityMode.HiddenFrom);
    rootEntity.visible.set(false);
    rootEntity.simulated.set(false);

    const attachable = rootEntity.as(hz.AttachableEntity);
    attachable.attachToPlayer(player, hz.AttachablePlayerAnchor.Torso);

    // NEW: ensure the storage entity is owned by this player so scripts can resolve the owner
    rootEntity.owner.set(player);

    console.log(`Attached asset to player ${player.name.get()}`);
    rootEntity.visible.set(true);
    rootEntity.setVisibilityForPlayers([player], hz.PlayerVisibilityMode.VisibleTo);

  }

  private setPlayerStorageInitialized(player: hz.Player) {
    const varKey = `${VARIABLE_GROUPS.player.group}:${VARIABLE_GROUPS.player.keys.isPlayerStorageInitialized}`;
    this.world.persistentStorage.setPlayerVariable(player, varKey, 1);
  }

  private initializePlayerInitialState(player: hz.Player) {
    // Any additional initialization logic can go here

    console.log(`Player ${player.name.get()} has entered the world.`);
    this.currentActivePlayers.add(player);
    const varKey = `${VARIABLE_GROUPS.player.group}:${VARIABLE_GROUPS.player.keys.isPlayerStorageInitialized}`;
    const valueJson = this.world.persistentStorage.getPlayerVariable(
      player,
      varKey
    );
    if (valueJson !== 1) {
      console.log("Player has not yet initialized storage. Initializing now.");
      this.handleGeneratingPlayerStorageItem(player);
    } else {
      console.log("Player storage already initialized.");
      this.handleAttachAsset(player);
    }

    const wearablesKey = `${VARIABLE_GROUPS.player.group}:${VARIABLE_GROUPS.player.keys.playerWearables}`;
    const wearablesJson = this.world.persistentStorage.getPlayerVariable(
      player,
      wearablesKey
    );
    console.log(`Player wearables for ${player.name.get()}: `, wearablesJson);
  }

  private fetchPlayerInitialState(player: hz.Player) {


    const isStorageInitializedKey = `${VARIABLE_GROUPS.player.group}:${VARIABLE_GROUPS.player.keys.isPlayerStorageInitialized}`;
    const valueJson = this.world.persistentStorage.getPlayerVariable(
      player,
      isStorageInitializedKey
    );

    const wearablesKey = `${VARIABLE_GROUPS.player.group}:${VARIABLE_GROUPS.player.keys.playerWearables}`;
    const wearablesJson: any = this.world.persistentStorage.getPlayerVariable(
      player,
      wearablesKey
    );

    this.sendNetworkBroadcastEvent(EventsService.PlayerEvents.RecievedInitialState, {
      isStorageInitialized: valueJson,
      wearables: wearablesJson ? JSON.parse(wearablesJson) : [],
      player: player,
    });
  }



}
hz.Component.register(WorldManager);