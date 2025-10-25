import * as hz from 'horizon/core';
import { EventsService, PlayerState, PLAYER_INITIAL_STATE } from 'constants';
import { TutorialQuestDAO } from 'TutorialQuestDAO';
import { InventoryDAO } from 'InventoryDAO';
import { PlayerStateDAO } from 'PlayerStateDAO';




export class PlayerStateService extends hz.Component<typeof PlayerStateService> {
  static propsDefinition = {};

  static instance: PlayerStateService;

  private inventoryDaos = new Map<hz.Player, InventoryDAO>();
  private tutorialDaos = new Map<hz.Player, TutorialQuestDAO>();
  private playerDaos = new Map<hz.Player, PlayerStateDAO>();

  start() {
    PlayerStateService.instance = this;

    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterWorld, (player) => {
      this.tutorialDaos.set(player, new TutorialQuestDAO(player, this.world));
      this.playerDaos.set(player, new PlayerStateDAO(player, this.world));
      this.inventoryDaos.set(player, new InventoryDAO(player, this.world));
      this.sendLocalBroadcastEvent(EventsService.PlayerEvents.OnPlayerStateLoaded, { player });
    });

    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerExitWorld, (player) => {
      this.inventoryDaos.delete(player);
      this.tutorialDaos.delete(player);
      this.playerDaos.delete(player);
    });
  }

  // --- PUBLIC API ---
  public getTutorialDAO(player: hz.Player): TutorialQuestDAO | undefined {
    return this.tutorialDaos.get(player);
  }

  public getPlayerDAO(player: hz.Player): PlayerStateDAO | undefined {
    return this.playerDaos.get(player);
  }

  public getInventoryDAO(player: hz.Player): InventoryDAO | undefined {
    return this.inventoryDaos.get(player);
  } 

}



hz.Component.register(PlayerStateService);




const PLAYER_STATE_KEY = "player:state";


export class PlayerStateUtils {
  /**
   * Get the full player state from persistent storage
   */
  static getPlayerState(player: hz.Player, world: hz.World): PlayerState {
    const stored = world.persistentStorage.getPlayerVariable(
      player,
      PLAYER_STATE_KEY
    ) as string | null;

    if (!stored) {
      return JSON.parse(JSON.stringify(PLAYER_INITIAL_STATE));
    }

    try {
      return JSON.parse(stored) as PlayerState;
    } catch (e) {
      console.error('[PlayerStateUtils] Failed to parse player state:', e);
      return JSON.parse(JSON.stringify(PLAYER_INITIAL_STATE));
    }
  }

  /**
   * Set the full player state to persistent storage
   */
  static setPlayerState(player: hz.Player, world: hz.World, state: PlayerState): void {
    const serialized = JSON.stringify(state);
    world.persistentStorage.setPlayerVariable(
      player,
      PLAYER_STATE_KEY,
      serialized
    );
  }

  /**
   * Update a specific nested property in player state
   * Usage: updatePlayerState(player, world, (state) => { state.inventory.hasStorageBag = true; })
   */
  static updatePlayerState(
    player: hz.Player,
    world: hz.World,
    updater: (state: PlayerState) => void
  ): void {
    const state = this.getPlayerState(player, world);
    updater(state);
    this.setPlayerState(player, world, state);
  }

  /**
   * Get a specific nested value from player state
   * Usage: getNestedValue(player, world, (state) => state.inventory.hasStorageBag)
   */
  static getNestedValue<T>(
    player: hz.Player,
    world: hz.World,
    getter: (state: PlayerState) => T
  ): T {
    const state = this.getPlayerState(player, world);
    return getter(state);
  }
}