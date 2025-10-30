import * as hz from "horizon/core";
import { Color } from "horizon/core";

/**
 * ArrowFollower.ts
 *
 * Summary:
 * Shows a 3D arrow that floats above the local player and points toward a designated
 * target. Only one player will see the arrow, and it moves and rotates smoothly
 * in real-time based on the target position.
 *
 * Works with:
 * - ArrowAssignManager.ts: Manages the assignment of arrows to players.
 * - ObjectiveSequence.ts: Manages the sequence of objectives related to the arrow.
 * - TargetBroadcaster.ts: Provides the target entity that the arrow points to.
 *
 * Setup:
 * - Make sure you reference all the arrows if you want to use new vfx
 * - Optionally adjust the localOffset to control arrow distance/height.
 * - Use the lockToYAxis toggle to restrict arrow rotation to horizontal only.
 */

/**
 * Enum representing different types of quest objectives.
 * Used to visually differentiate arrows based on the objective type.
 */
export const enum TargetQuestType {
	Collect = "Collect", // For item collection quests
	Defeat = "Defeat", // For enemy/object destruction quests
}

/**
 * Maps each quest type to a specific color.
 */
export const QUEST_TYPE_COLORS: Record<TargetQuestType, Color> = {
	[TargetQuestType.Collect]: new Color(1, 1, 0), // Yellow
	[TargetQuestType.Defeat]: new Color(0, 0, 1), // Blue
};

/**
 * Local event used to signal that the arrow color should change.
 */
export const ArrowRecolorEvent = new hz.LocalEvent<{ questType: TargetQuestType }>("SetArrowColor");

/**
 * Network event used to assign the arrow to a specific player.
 */
export const AssignArrowEvent = new hz.NetworkEvent<{ player: hz.Player }>("AssignArrowToPlayer");

/**
 * Plays a VFX for a specific player.
 * @param player - The player to play the VFX for.
 * @param vfx - The VFX entity to play.
 */
export function playVFXForPlayer(player: hz.Player, vfx: hz.Entity) {
	if (exists(vfx)) {
		const vfxOptions: hz.ParticleFXPlayOptions = { players: [player] };
		vfx.as(hz.ParticleGizmo)!.play(vfxOptions);
	}
}

export function stopVFX(vfx: hz.Entity) {
	if (exists(vfx)) {
		vfx.as(hz.ParticleGizmo)!.stop();
	}
}

/**
 * Plays a VFX for multiple players.
 * @param players - The players to play the VFX for.
 * @param vfx - The VFX entity to play.
 */
export function playVFXForPlayers(vfx: hz.Entity, players: hz.Player[]) {
	if (exists(vfx)) {
		const vfxOptions: hz.ParticleFXPlayOptions = { players: players };
		vfx.as(hz.ParticleGizmo)!.play(vfxOptions);
	}
}

/**
 * Stops a VFX for a specific player.
 * @param player - The player to stop the VFX for.
 * @param vfx - The VFX entity to stop.
 */
export function stopVFXForPlayer(player: hz.Player, vfx: hz.Entity) {
	if (exists(vfx)) {
		const vfxOptions: hz.ParticleFXPlayOptions = { players: [player] };
		vfx.as(hz.ParticleGizmo)!.stop(vfxOptions);
	}
}

/**
 * Stops a VFX for multiple players.
 * @param vfx - The VFX entity to stop.
 * @param players - The players to stop the VFX for.
 */
export function stopVFXForPlayers(vfx: hz.Entity, players: hz.Player[]) {
	if (exists(vfx)) {
		const vfxOptions: hz.ParticleFXPlayOptions = { players: players };
		vfx.as(hz.ParticleGizmo)!.stop(vfxOptions);
	}
}

/**
 * Checks if an entity exists and is valid.
 * @param obj - The entity to check.
 * @returns True if the entity exists, false otherwise.
 */
export function exists(obj: hz.Entity): boolean {
	return obj && obj.exists();
}

class ArrowFollower extends hz.Component {
	static propsDefinition = {
		arrowParent: { type: hz.PropTypes.Entity }, // The parent entity to which the arrow is attached
		arrowMesh: { type: hz.PropTypes.Entity }, // The mesh entity representing the arrow
		target: { type: hz.PropTypes.Entity }, // The target entity that the arrow points to
		localOffset: { type: hz.PropTypes.Vec3 }, // The local offset from the player where the arrow should appear
		lockToYAxis: { type: hz.PropTypes.Boolean, default: true }, // Whether to lock the arrow's rotation to the Y-axis
	};

	private arrowMesh: hz.Entity | null = null;
	private arrowParent: hz.Entity | null = null;
	private target: hz.Entity | null = null;
	private localOffset: hz.Vec3 = new hz.Vec3(0, -0.2, 1.2);
	private playerToFollow?: hz.Player;
	private updateSub?: hz.EventSubscription;
	private lastPos?: hz.Vec3 = hz.Vec3.zero;

	/**
	 * Lifecycle method called before the start when the ArrowFollower component is initialized.
	 * Caches props and hooks recolor events.
	 */
	preStart() {
		this.arrowMesh = this.props.arrowMesh ?? null;
		this.target = this.props.target ?? null;
		this.localOffset = this.props.localOffset ?? new hz.Vec3(0, -0.2, 1.2);
		this.arrowParent = this.props.arrowParent ?? null;

		this.connectLocalEvent(this.entity, ArrowRecolorEvent, ({ questType }) => {
			const color = this.getQuestColor(questType);

			if (this.arrowMesh && this.arrowMesh.as(hz.MeshEntity).color) {
				this.arrowMesh.color.set(color);
			}
		});
	}

	/**
	 * Lifecycle method called when the ArrowFollower component is initialized.
	 * Assigns arrow to local player and listens for assignments
	 */
	start() {
		const owner = this.entity.owner.get();
		const localPlayer = this.world.getLocalPlayer();
		if (owner && localPlayer && owner.id === localPlayer.id) {
			this.assignToPlayer(localPlayer);
		}

		this.connectNetworkEvent(this.entity, AssignArrowEvent, (data) => {
			this.assignToPlayer(data.player);
		});
	}

	/**
	 * Assign arrow to a specific player and set up the update loop
	 * @param player - The player to whom the arrow should be assigned.
	 */
	private assignToPlayer(player: hz.Player) {
		this.playerToFollow = player;
		if (this.arrowMesh) {
			stopVFXForPlayers(this.arrowMesh, this.world.getPlayers());
		}

		// Attach the arrow to the player's head
		if (this.arrowParent) {
			this.arrowParent.as(hz.AttachableEntity).attachToPlayer(player, hz.AttachablePlayerAnchor.Torso);
			this.arrowParent.as(hz.AttachableEntity).socketAttachmentPosition.set(this.localOffset);
		}

		if (this.target) {
			const targetChild = this.target.children.get()[0];

			this.async.setTimeout(() => {
				if (this.arrowMesh) {
					playVFXForPlayer(player, this.arrowMesh);
				}
				playVFXForPlayer(player, targetChild);
			}, 1000); // Delay to ensure VFX is visible
		}

		// Start the update loop to keep the arrow facing the target
		this.updateSub = this.connectLocalBroadcastEvent(hz.World.onUpdate, this.onUpdate.bind(this));
	}

	/**
	 * Called every frame; updates arrow rotation to face the target
	 */
	private onUpdate() {
		if (!this.arrowMesh || !this.target || !this.playerToFollow) return;

		const arrowPos = this.arrowMesh.transform.position.get();
		const targetPos = this.target.transform.position.get();

		const lookAtPos = this.props.lockToYAxis ? new hz.Vec3(targetPos.x, arrowPos.y, targetPos.z) : targetPos;

		this.arrowMesh.lookAt(lookAtPos, hz.Vec3.up);
	}

	/**
	 * Returns the color for a given quest type or white by default
	 * @param type - The type of quest objective to get the color for.
	 * @returns The color associated with the quest type.
	 */
	private getQuestColor(type: TargetQuestType | "default"): hz.Color {
		return QUEST_TYPE_COLORS[type as TargetQuestType] ?? new hz.Color(1, 1, 1);
	}

	/**
	 * Cleanup on component disposal; stops the update loop
	 */
	dispose() {
		this.updateSub?.disconnect();
	}
}
// Register the ArrowFollower component with Horizon
hz.Component.register(ArrowFollower);
