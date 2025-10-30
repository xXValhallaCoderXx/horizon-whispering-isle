import * as hz from "horizon/core";
import { TargetUpdateEvent } from "./TargetBroadcaster";
import { ArrowRecolorEvent, TargetQuestType } from "ArrowFollower";
import { UIEvents } from "HintTextTrigger";

/**
 * ObjectiveSequence.ts
 *
 * Summary:
 * Manages the sequence of objectives for a player, allowing them to progress through
 * a series of tasks by entering specific triggers.
 *
 * Works with:
 * - TargetBroadcaster.ts - Broadcasts target updates to players.
 * - ArrowFollower.ts - Handles the arrow mesh and quest type.
 * - ArrowAssignManager.ts - Manages the assignment of arrows to players.
 *
 * Setup:
 * - Create an empty object and add this script.
 * - Assign triggers and objectives in the propsDefinition.
 */

export const AssignObjectiveSequence = new hz.NetworkEvent<{ player: hz.Player; target: hz.Entity; arrowMesh: hz.Entity }>("AssignObjectiveSequence");
export const AssignNewTarget = new hz.NetworkEvent<{ newIndex: number }>("AssignNewTarget");

class ObjectiveSequence extends hz.Component {
	static propsDefinition = {
		trigger1: { type: hz.PropTypes.Entity }, // The first trigger entity that starts the sequence
		trigger2: { type: hz.PropTypes.Entity }, // The second trigger entity
		trigger3: { type: hz.PropTypes.Entity }, // The third trigger entity
		objective1: { type: hz.PropTypes.Entity }, // The first objective entity
		objective2: { type: hz.PropTypes.Entity }, // The second objective entity
		objective3: { type: hz.PropTypes.Entity }, // The third objective entity
		yOffset: { type: hz.PropTypes.Number, default: 0 }, // The vertical offset for the target position
	};

	private triggers: hz.Entity[] = [];
	private objectives: hz.Entity[] = [];
	private playerIndexMap = new Map<hz.Player, number>();

	private targetEntity: hz.Entity = hz.Entity.prototype;
	private arrowEntity: hz.Entity = hz.Entity.prototype;

	/**
	 * Lifecycle method called before the start when the ObjectiveSequence component is initialized.
	 * Sets up initial objective and event listeners
	 */
	preStart() {
		this.triggers = [this.props.trigger1, this.props.trigger2, this.props.trigger3].filter(Boolean);
		this.objectives = [this.props.objective1, this.props.objective2, this.props.objective3].filter(Boolean);

		// Listen for the AssignObjectiveSequence event to initialize the sequence
		this.connectNetworkEvent(this.entity, AssignObjectiveSequence, ({ player, target, arrowMesh }: { player: hz.Player; target: hz.Entity; arrowMesh: hz.Entity }) => {
			if (player === this.entity.owner.get()) {
				this.targetEntity = target;
				this.arrowEntity = arrowMesh;
				this.initializeSequence();
			}
		});
	}

	/**
	 * Lifecycle method called when the ObjectiveSequence component is initialized.
	 */
	start() {
		this.subscribeEvents();
	}

	/**
	 * Prepares triggers and objectives, sets the first target, and recolors arrow
	 */
	private initializeSequence() {
		if (this.triggers.length !== this.objectives.length) {
			console.warn("Mismatch: number of triggers and objectives must be the same.");
			return;
		}

		const player = this.entity.owner.get();
		if (!player) return;

		// Set the player index map to start at 0 for this player
		this.playerIndexMap.set(player, 0);

		if (this.objectives.length > 0) {
			const first = this.objectives[0];
			const firstPos = first.transform.position.get();
			const initialTarget = new hz.Vec3(firstPos.x, firstPos.y + (this.props.yOffset ?? 0), firstPos.z);

			// Send the initial target position to the target entity and recolor the arrow
			this.async.setTimeout(() => {
				this.sendNetworkEvent(this.targetEntity, TargetUpdateEvent, { player: player, position: initialTarget, questType: TargetQuestType.Collect });
				this.sendNetworkEvent(this.arrowEntity, ArrowRecolorEvent, { questType: TargetQuestType.Collect });
			}, 500);
		}
	}

	/**
	 * Subscribes to events related to objective sequence updates.
	 */
	subscribeEvents() {
		// Listen for player entering triggers to advance the objective sequence
		this.connectNetworkEvent(this.entity.owner.get(), AssignNewTarget, (data) => {
			const owner = this.entity.owner.get();
			const currentIndex = this.playerIndexMap.get(owner) ?? 0;
			if (data.newIndex === currentIndex) {
				this.advanceToNextObjective(owner, currentIndex + 1);
			}
		});
	}

	/**
	 * Moves to the next objective or finishes if all are done.
	 * @param player The player whose objective is being advanced.
	 * @param newIndex The index of the new objective.
	 */
	private advanceToNextObjective(player: hz.Player, newIndex: number) {
		if (this.entity.owner.get()?.id !== player.id) return;

		this.playerIndexMap.set(player, newIndex);
		let questTypeTarget: TargetQuestType = TargetQuestType.Collect;

		/*
		 * Checks if the second to last objective is reached and displays a popup.
		 */
		if (newIndex == this.objectives.length - 1) {
			this.sendNetworkBroadcastEvent(UIEvents.notification, { player: [player], title: "", message: "Grab the diamond, finish the task!", time: 2.5 });
			questTypeTarget = TargetQuestType.Defeat;
		}

		if (newIndex >= this.objectives.length) return;

		const next = this.objectives[newIndex];
		const pos = next.transform.position.get();
		const targetPos = new hz.Vec3(pos.x, pos.y + (this.props.yOffset ?? 0), pos.z);

		this.sendNetworkEvent(this.targetEntity, TargetUpdateEvent, { player: player, position: targetPos, questType: questTypeTarget });
	}
}
// Register the ObjectiveSequence component with Horizon
hz.Component.register(ObjectiveSequence);
