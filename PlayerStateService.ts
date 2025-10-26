import * as hz from 'horizon/core';
import { EventsService } from 'constants';
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

