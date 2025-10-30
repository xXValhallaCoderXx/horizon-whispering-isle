import * as hz from "horizon/core";
import { VFXParticleGizmo } from "horizon/2p";
import { UIEvents } from "HintTextTrigger";

/**
 * QuestWaypointController.ts
 *
 * Summary:
 * Powers a per-player quest waypoint VFX (e.g., exclamation point or arrow)
 * Becomes visible when the player's quest is active and disappears once they reach it.
 * The visual effect scales based on whether the waypoint is used indoors or outdoors.
 *
 * Works with:
 * - TestSendEventQuest.ts - Sends the active quest waypoint event.
 *
 * Setup:
 * -  Set the trigger to define where the waypoint is completed.
 * - Customize the waypointVFX to use the desired particle effect and modify its properties as needed.
 * - Set isOutsideWaypoint = true for outdoor locations to enable appropriate scaling.
 *
 * Additional Notes:
 * - Multiplayer Behavior:
 *    - Each instance of this component is owned by a single player (via `this.entity.owner.get()`).
 *    - Logic only runs for the owning player, making this setup scalable for multiplayer.
 *
 * - Functionality:
 *    - Listens for a `WaypointEvents.activeQuestWaypoint` event and checks if it matches the owner.
 *    - If matched, plays the waypoint VFX for that player and makes it visible.
 *    - When the player enters the associated trigger, stops the VFX and hides the marker.
 *    - Automatically adjusts min/max size based on indoor/outdoor context.
 */

export const WaypointEvents = {
	activeQuestWaypoint: new hz.NetworkEvent<{ player: hz.Player }>("activeQuestWaypoint"),
};

class QuestWaypointController extends hz.Component<typeof QuestWaypointController> {
	static propsDefinition = {
		trigger: { type: hz.PropTypes.Entity }, // Trigger zone that completes the waypoint
		waypointVFX: { type: hz.PropTypes.Entity }, // ParticleGizmo VFX entity to show
		isOutsideWaypoint: { type: hz.PropTypes.Boolean, defaultValue: false }, // Use outdoor scale values if true
		// VFX size parameters based on location context
		indoorMinScale: { type: hz.PropTypes.Number, defaultValue: 1 }, // Min scale for indoor
		indoorMaxScale: { type: hz.PropTypes.Number, defaultValue: 15 }, // Max scale for indoor
		outdoorMinScale: { type: hz.PropTypes.Number, defaultValue: 1 }, // Min scale for outdoor
		outdoorMaxScale: { type: hz.PropTypes.Number, defaultValue: 50 }, // Max scale for outdoor
	};

	private trigger: hz.TriggerGizmo = hz.TriggerGizmo.prototype;
	private waypointVFX: VFXParticleGizmo = VFXParticleGizmo.prototype;

	private player: hz.Player | null = null; // Player that owns this instance
	private questActive = false; // Whether the waypoint is currently active

	/**
	 * Lifecycle method called when the QuestManager component is initialized.
	 * Automatically assigns the player based on entity owner -using Asset Pool Gizmo- and sets up event subscriptions.
	 */
	start() {
		this.player = this.entity.owner.get();

		this.initializeProps();
		this.subscribeEvents();

		// Set VFX scaling based on location context
		if (this.props.isOutsideWaypoint) {
			this.waypointVFX.setVFXParameterValue("minSize", this.props.outdoorMinScale);
			this.waypointVFX.setVFXParameterValue("maxSize", this.props.outdoorMaxScale);
		} else {
			this.waypointVFX.setVFXParameterValue("minSize", this.props.indoorMinScale);
			this.waypointVFX.setVFXParameterValue("maxSize", this.props.indoorMaxScale);
		}
	}

	/**
	 * Subscribes to:
	 * - Trigger activation when the player enters the waypoint zone.
	 * - Network broadcast to activate this waypoint for a player.
	 */
	private subscribeEvents() {
		this.connectCodeBlockEvent(this.trigger, hz.CodeBlockEvents.OnPlayerEnterTrigger, (player: hz.Player) => {
			// Only react if the owner player enters and quest is active
			if (this.player?.id !== player.id || !this.questActive) return;
			this.playerEnterTrigger(player);
		});

		this.connectNetworkBroadcastEvent(WaypointEvents.activeQuestWaypoint, (data) => {
			// Only react if the broadcasted player ID matches this instance's owner
			if (this.player?.id === data.player.id && !this.questActive) {
				this.playerActiveQuestWaypoint(data.player);
			}
		});
	}

	/**
	 * Called when the player reaches the trigger zone.
	 * Stops the VFX, hides the entity, and resets quest state.
	 */
	private playerEnterTrigger(player: hz.Player) {
		stopVFXForPlayer(player, this.waypointVFX);
		this.waypointVFX.visible.set(false);

		if (this.questActive) {
			this.sendNetworkBroadcastEvent(UIEvents.notification, { player: [player], title: "", message: "Waypoint reached!", time: 2.5 });
			this.questActive = false;
		}
	}

	/**
	 * Activates the waypoint VFX for the player and marks quest as active.
	 */
	private playerActiveQuestWaypoint(player: hz.Player) {
		playVFXForPlayer(player, this.waypointVFX);
		this.waypointVFX.visible.set(true);
		this.questActive = true;
	}

	/**
	 * Converts props to usable components. Logs warnings if props are missing.
	 */
	private initializeProps() {
		if (this.props.trigger) {
			this.trigger = this.props.trigger.as(hz.TriggerGizmo);
		} else {
			console.warn("QuestWaypointController: Trigger prop is not set.");
		}

		if (this.props.waypointVFX) {
			this.waypointVFX = this.props.waypointVFX.as(VFXParticleGizmo);
		} else {
			console.warn("QuestWaypointController: Waypoint VFX prop is not set.");
		}
	}
}

// Register the component so it can be used in the world
hz.Component.register(QuestWaypointController);

/**
 * Utility: Play VFX for a specific player only.
 */
function playVFXForPlayer(player: hz.Player, vfx: hz.Entity) {
	if (exists(vfx)) {
		const vfxOptions: hz.ParticleFXPlayOptions = { players: [player] };
		vfx.as(hz.ParticleGizmo)!.play(vfxOptions);
	}
}

/**
 * Utility: Stop VFX for a specific player only.
 */
function stopVFXForPlayer(player: hz.Player, vfx: hz.Entity) {
	if (exists(vfx)) {
		const vfxOptions: hz.ParticleFXPlayOptions = { players: [player] };
		vfx.as(hz.ParticleGizmo)!.stop(vfxOptions);
	}
}

/**
 * Utility: Check whether an entity exists and is valid.
 */
function exists(obj: hz.Entity): boolean {
	return obj && obj.exists();
}
