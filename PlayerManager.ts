import * as hz from "horizon/core";
import {
  EventsService
} from "constants";
import { PlayerStateService } from "PlayerStateService";
import { PLAYER_STATE_DAO_DEFAULT_STATE } from "PlayerStateDAO";

class PlayerManager extends hz.Component<typeof PlayerManager> {
  static propsDefinition = {
    playerHPGizmo: { type: hz.PropTypes.Entity },
    playerInventoryGizmo: { type: hz.PropTypes.Entity },
    playerCameraManager: { type: hz.PropTypes.Entity },
  };

  preStart(): void {



    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnPlayerEnterWorld,
      (player: hz.Player) => this.onPlayerEnterWorld(player)
    );

    this.connectNetworkBroadcastEvent(
      EventsService.CombatEvents.PlayerTookDamage,
      (data: { player: hz.Player; damage: number; attackerId: string }) => {
        this.onPlayerTakeDamage(data);
      }
    );
  }

  start() { }

  private onPlayerEnterWorld(player: hz.Player) {

    console.log(`[PlayerManager] Player ${player.id} entered world - Transfering Ownership.`);
    this?.props?.playerHPGizmo?.owner.set(player);
    this?.props?.playerCameraManager?.owner.set(player);
    this?.props?.playerInventoryGizmo?.owner.set(player);
    const playerDao = PlayerStateService.instance?.getPlayerDAO(player);
    const playerState = playerDao?.getState();

    const playerMaxHealth = playerState?.health
    const playerName = player?.name.get() || "Unknown";
    this.async.setTimeout(() => {
      this.sendNetworkEvent(player, EventsService.PlayerEvents.DisplayHealthHUD, { player, currentHealth: playerMaxHealth ?? 100, maxHealth: playerMaxHealth ?? 100, name: playerName });
    }, 1000);
  }

  private onPlayerTakeDamage(data: { player: hz.Player; damage: number; attackerId: string }) {
    console.log(`[PlayerManager] Player ${data.player.id} took ${data.damage} damage from ${data.attackerId}`);

    const playerDao = PlayerStateService.instance?.getPlayerDAO(data.player);
    if (!playerDao) {
      console.error(`[PlayerManager] Could not find DAO for player ${data.player.id}`);
      return;
    }

    // Apply damage to player state
    const newHealth = playerDao.takeDamage(data.damage);
    const maxHealth = playerDao.getMaxHealth();

    console.log(`[PlayerManager] Player health: ${newHealth}/${maxHealth}`);

    // Update the player's health HUD
    this.sendNetworkEvent(data.player, EventsService.PlayerEvents.DisplayHealthHUD, {
      player: data.player,
      currentHealth: newHealth,
      maxHealth: maxHealth,
      name: data.player.name.get() || "Unknown"
    });

    // Check if player died
    if (playerDao.isDead()) {
      this.handlePlayerDeath(data.player, data.attackerId);
    }
  }
  private handlePlayerDeath(player: hz.Player, killerId: string) {
    console.log(`[PlayerManager] Player ${player.id} died. Killed by ${killerId}`);

    // TODO: Implement death logic
    // - Respawn player
    // - Reset health
    // - Play death effects
    // - Broadcast death event for quest/loot systems

    // For now, just respawn with full health
    const playerDao = PlayerStateService.instance?.getPlayerDAO(player);
    if (playerDao) {
      const state = playerDao.getState();
      state.health = PLAYER_STATE_DAO_DEFAULT_STATE.health; // Reset to default
      playerDao['saveState'](state); // Access private method

      // Update HUD
      this.sendNetworkEvent(player, EventsService.PlayerEvents.DisplayHealthHUD, {
        player: player,
        currentHealth: state.health,
        maxHealth: state.health,

        name: player.name.get() || "Unknown"
      });
    }
  }
}
hz.Component.register(PlayerManager);
