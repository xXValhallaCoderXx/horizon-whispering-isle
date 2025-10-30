/**
 * VFXController.ts
 *
 * Summary:
 * Links a visual effect (VFX) to a grabbable object in order to visually indicate
 * that the object can or should be grabbed. The effect plays based on interaction events (e.g. grab, drop), making it useful
 * for drawing the player's attention during gameplay or tutorials.
 * 
 * Works with:
 * - HideEntity: Manages the visibility of a gem and its visual effects based on player interactions.
 *
 * Setup:
 * - Assign the target grabbable object to the `grabbableEntity` slot.
 * - Assign the VFX gizmo to the `vfxGizmo` slot.
 * - Adjust the `localPositionOffset` to position the VFX relative to the grabbable's origin.
 * - Toggle `playOnStart` to play the VFX automatically when the world starts.
 * - Toggle `playOnDrop` to replay the VFX when the object is released.
 *
 * Additional notes:
 * 	Perfect for:
 * 	  - Highlighting grab targets using particle effects
 * 	  - Tutorial prompts or guided interactions
 * 	  - Environmental cues or collectible indicators
 *
 * 	Features:
 * 	  - Adjust VFX offset position relative to the grabbable's origin
 * 	  - Configurable playback on world start and on drop
 * 	  - Full control over playback via external script calls
 * 	  - Ability to target specific players or all players
 * 	  - Customize visual behavior directly in the VFX asset, such as custom fx properties
 * 	  - Can be used by any grabbable object
 * 	  - Can be used by any looping or non-looping VFX gizmo
 *
 */

import * as hz from "horizon/core";
import { Entity2p, VFXParticleGizmo } from "horizon/2p";

class VFXController extends hz.Component<typeof VFXController> {
	static propsDefinition = {	
		grabbableEntity: { type: hz.PropTypes.Entity },				// The entity that can be grabbed		
		vfxGizmo: { type: hz.PropTypes.Entity },	   				// The VFX system to control
		localPositionOffset: {type: hz.PropTypes.Vec3,
			default: new hz.Vec3(0, 0, 0),}, 		   				// Optional offset from the grabbable's position	
		playOnStart: { type: hz.PropTypes.Boolean, default: true }, // Whether to play the VFX automatically when the scene starts	
		playOnDrop: { type: hz.PropTypes.Boolean, default: false }, // Whether to play the VFX when the object is dropped
	};

	private vfxGizmo: VFXParticleGizmo = VFXParticleGizmo.prototype;
	private grabbableEntity: hz.Entity = hz.Entity.prototype;
	private localPositionOffset: hz.Vec3 = hz.Vec3.prototype;

	/*
	 * Executes when the world starts and when an entity that has this script 
	 * attached is spawned.
	 */
	start() {
		this.initializeProps();
		this.subscribeToEvents();
		this.updateVfxPosition();

		if (this.props.playOnStart) {
			this.playVfx();
		}
	}

	/**
	 * Caches the properties for internal use and validates setup.
	 */
	private initializeProps() {
		if (!this.props.vfxGizmo) {
			console.warn(`'vfxGizmo' property has not been assigned.`);
			return;
		}
		this.vfxGizmo = this.props.vfxGizmo.as(VFXParticleGizmo);

		if (!this.props.grabbableEntity) {
			console.warn(`'grabbableEntity' property has not been assigned.`);
			return;
		}
		this.grabbableEntity = this.props.grabbableEntity;

		this.localPositionOffset = this.props.localPositionOffset;
	}

	/**
	 * Subscribes to grab-related events on the assigned entity.
	 */
	private subscribeToEvents() {
		this.connectCodeBlockEvent(this.grabbableEntity, hz.CodeBlockEvents.OnGrabStart, () => this.onGrabStart());

		this.connectCodeBlockEvent(this.grabbableEntity, hz.CodeBlockEvents.OnGrabEnd, () => this.onGrabEnd());
	}

	/**
	 * Called when the object is grabbed — stops the VFX.
	 */
	private onGrabStart() {
		this.stopVfx();
	}

	/**
	 * Called when the object is released — plays the VFX if `playOnDrop` is enabled.
	 */
	private onGrabEnd() {
		if (this.props.playOnDrop) {
			this.playVfx();
		}
	}

	/**
	 * Repositions the VFX to follow the grabbable entity,
	 * applying the configured local offset.
	 */
	public updateVfxPosition() {
		if (!this.props.grabbableEntity || !this.vfxGizmo) return;

		this.vfxGizmo.as(Entity2p).setTransformConstraint(this.grabbableEntity, this.localPositionOffset, hz.Quaternion.zero, this.vfxGizmo.scale.get());
	}

	/**
	 * Starts the VFX particle system.
	 * @param playFromStart Whether to play the effect from the beginning (default: true).
	 * @param players Players to show the effect to (empty = all players).
	 */
	public playVfx(playFromStart: boolean = true, players: hz.Player[] = []): void {
		if (!this.vfxGizmo) {
			console.warn("Cannot play VFX — not initialized properly.");
			return;
		}

		const playOptions: hz.ParticleFXPlayOptions = {
			fromStart: playFromStart,
			players: players.length > 0 ? players : undefined,
		};

		this.vfxGizmo.play(playOptions);
	}

	/**
	 * Stops the VFX particle system.
	 * @param players Players to stop the effect for (empty = all players).
	 */
	public stopVfx(players: hz.Player[] = []): void {
		if (!this.vfxGizmo) {
			console.warn("Cannot stop VFX — not initialized properly.");
			return;
		}

		const stopOptions: hz.ParticleFXStopOptions = {
			players: players.length > 0 ? players : undefined,
		};

		this.vfxGizmo.stop(stopOptions);
	}
}
// Register the component so it can be used in the world
hz.Component.register(VFXController);
