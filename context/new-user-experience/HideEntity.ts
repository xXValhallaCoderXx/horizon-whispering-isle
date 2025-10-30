import * as hz from "horizon/core";

/**
 * HideEntity.ts
 *
 * Summary:
 * Manages the visibility of a entity  and its visual effects
 * depending on whether players have picked it up.
 *
 * Works with:
 * - VFXController.ts - Controls the visual effects for the grabbable entity.
 *
 * Setup:
 * - Set the entity prop 
 * - Set the vfx prop 

 */

export const ResetEntityEvent = new hz.NetworkEvent<{ player: hz.Player }>("ResetEntityEvent");

class HideEntity extends hz.Component<typeof HideEntity> {
	static propsDefinition = {
		entityToHide: { type: hz.PropTypes.Entity }, // The entity to hide
		modularVFX: { type: hz.PropTypes.Entity }, // The modular VFX entity
	};

	// List of players who have already picked up the entity
	private playersWithEntity: hz.Player[] = [];

	/**
	 * Executes when the world starts and when an entity that has this script
	 * attached is spawned.
	 * Sets up event handlers for player triggers and exits.
	 */
	start() {
		// Event: player enters the entity's trigger area
		this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterTrigger, (player) => {
			// Only proceed if a entity is provided
			if (this.props.entityToHide) {
				// If the player hasn't already picked up the entity
				if (!this.playersWithEntity.includes(player)) {
					// Add them to the list of players with the entity
					this.playersWithEntity.push(player);
				}

				// Get all players currently in the world
				const worldPlayers = this.world.getPlayers();
				// Filter out those who already have the entity
				const playersWithoutEntity = worldPlayers.filter((p) => !this.playersWithEntity.includes(p));

				// Make the entity visible only to players who haven't picked it up
				this.props.entityToHide.setVisibilityForPlayers(playersWithoutEntity, hz.PlayerVisibilityMode.VisibleTo);

				// If a modular VFX effect is defined, stop it for the player who picked up the entity
				if (this.props.modularVFX) {
					this.stopVFXForPlayer(player, this.props.modularVFX!);
				}
			}
		});

		// Event: player leaves the world (disconnects)
		this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerExitWorld, (player) => {
			// Check if the player was in the list of those with the entity
			const index = this.playersWithEntity.indexOf(player);
			if (index !== -1) {
				// Remove them from the list
				this.playersWithEntity.splice(index, 1);

				// Recompute which players don't have the entity
				const worldPlayers = this.world.getPlayers();
				const playersWithoutEntity = worldPlayers.filter((p) => !this.playersWithEntity.includes(p));

				// Make the entity visible again for players who don’t have it
				if (this.props.entityToHide) {
					this.props.entityToHide.setVisibilityForPlayers(playersWithoutEntity, hz.PlayerVisibilityMode.VisibleTo);
				}
			}
		});

		// Event: reset the entity state
		this.connectNetworkEvent(this.entity, ResetEntityEvent, ({ player }) => {
			console.log(`Resetting entity state for player: ${player.name.get()}`);
			// Remove the player from the list of those who have picked up the entity
			const index = this.playersWithEntity.indexOf(player);
			if (index !== -1) {
				this.playersWithEntity.splice(index, 1);
			}

			// Make the entity visible to all players again
			if (this.props.entityToHide) {
				this.props.entityToHide.setVisibilityForPlayers(this.world.getPlayers(), hz.PlayerVisibilityMode.VisibleTo);
			}

			// Play the modular VFX for the player
			if (this.props.modularVFX) {
				this.playVFXForPlayer(player, this.props.modularVFX!);
			}
		});
	}

	/**
	 * Stops the particle VFX for a specific player.
	 * @param player The player for whom to stop the VFX.
	 * @param vfx The VFX entity to stop.
	 */
	private stopVFXForPlayer(player: hz.Player, vfx: hz.Entity) {
		// Options to stop the VFX only for the specified player
		const vfxOptions: hz.ParticleFXPlayOptions = { players: [player] };
		// Cast to ParticleGizmo and stop the effect
		vfx.as(hz.ParticleGizmo)!.stop(vfxOptions);
	}

	/**
	 * Plays the particle VFX for a specific player.
	 * @param player The player for whom to play the VFX.
	 * @param vfx The VFX entity to play.
	 */
	private playVFXForPlayer(player: hz.Player, vfx: hz.Entity) {
		// Options to play the VFX only for the specified player
		const vfxOptions: hz.ParticleFXPlayOptions = { players: [player] };
		// Cast to ParticleGizmo and play the effect
		vfx.as(hz.ParticleGizmo)!.play(vfxOptions);
	}
}

// Register the component with the Horizon system
hz.Component.register(HideEntity);
