import { TargetQuestType } from "ArrowFollower";
import * as hz from "horizon/core";
export const TargetUpdateEvent = new hz.NetworkEvent<{ player: hz.Player; position?: hz.Vec3; questType?: TargetQuestType }>("SetTargetPosition");

/**
 * TargetBroadcaster.ts
 *
 * Summary:
 * Ued to **receive and update a 3D target position** in the world.
 * Other scripts (like ArrowFollower) can point to this target entity.
 *
 * It listens for a **local event** (`SetTargetPosition`) to update its position dynamically,
 * allowing creators to change objectives at runtime.
 *
 * Works with:
 * - ArrowFollower.ts: Points the arrow to this target.
 * - ArrowAssignManager.ts: Assigns arrows to players based on this target.
 * - ObjectiveSequence.ts: Manages the sequence of objectives related to this target.
 *
 * Setup:
 * - If you wish you can change the vfx referenced in the parameters. Make them as children of this object
 *
 * Additional notes:
 *  Example from another script:
 *    this.sendLocalEvent(targetEntity, TargetUpdateEvent, { position: newPosition, questType: TargetQuestType.SomeType });
 *
 */

class TargetBroadcaster extends hz.Component {
	static propsDefinition = {};

	/**
	 * Lifecycle method called when the ArrowFollower component is initialized.
	 * Hooks into the SetTargetPosition event
	 */
	start() {
		this.connectNetworkEvent(this.entity, TargetUpdateEvent, ({ player, position, questType }) => {
			if (this.entity.owner.get() !== this.world.getLocalPlayer()) return;

			if (position) {
				this.entity.transform.position.set(position);
			}
		});
	}
}

// Register the TargetBroadcaster component with Horizon
hz.Component.register(TargetBroadcaster);
