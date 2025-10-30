import * as hz from 'horizon/core';
import { CameraEvents } from 'CameraManagerLocal';
import {Quest} from 'Quest';
import { DialogueTreeEvents } from 'DialogueNPC';

/**
 * QuestManager.ts
 *
 * Summary:
 * Manage quests in your world. Here you can track and update quests status for players.
 *
 * Works with:
 * - UIQuestStartDialogue Prompts players to start quests
 * - UICurrentQuests Displays active quests
 * - UIQuestComplete Shows quest completion UI
 * - CameraManagerLocal.ts Manages camera-related functionality.
 * - QuestTrigger.ts Triggers quest-related events.
 * - Quest.ts - Represents a quest entity.
 * 
 * Setup:
 * - Decide if it blocks the player movement and how much time the quest has the new icon
 * - In the script where you want to start a quest, import the `QuestEvents` and call `QuestEvents.promptStartQuestDialogue` with the quest ID and player, sending the event to the `QuestManager` entity.
 * e.g.: this.sendLocalEvent(this.props.questManager!, QuestEvents.promptStartQuestDialogue, { questId: string.TutorialQuest1, player: player });
 */

//#region Enums
/**
 * Represents the status of a quest.
 */
export enum QuestStatus {
	NotStarted = 'NotStarted',
	InProgress = 'InProgress',
	Completed = 'Completed',
}
//#endregion

//#region Types
/*
 * Represents the data structure for a quest.
 */
export type QuestData = {
	questId: string; 		  // Unique identifier for the quest
	name: string; 			  // The title of the quest
	description: string; 	  // A brief description of the quest
	isOptional: boolean; 	  // Whether the quest is optional or mandatory
	reward: number;  		  // The reward amount for completing the quest
	primaryColor?: hz.Color;  // Primary color associated with the quest, optional
	secondaryColor?: hz.Color;// Secondary color associated with the quest, optional
	status: QuestStatus; 	  // Current status of the quest
	isNew: boolean; 		  // Whether the quest is new
}

export type PlayerQuests = {
	player: hz.Player;
	activeQuests: Map<string, QuestData>;
}
//#endregion

//#region Events
export const QuestEvents = {

	// Call this event to prompt the player to start a quest
	promptStartQuestDialogue: new hz.NetworkEvent<{ questId: string, player: hz.Player }>("promptStartQuestDialogue"),

	promptStartQuestDialogueUI: new hz.NetworkEvent<{ questId: string, questData: QuestData }>("promptStartQuestDialogue"),

	questUpdateUI: new hz.NetworkEvent<{ activeQuests: QuestData[] }>("questUpdate"),

	questAccepted: new hz.NetworkEvent<{ player: hz.Player, questId: string }>("questAccepted"),

	questCompleted: new hz.NetworkEvent<{ player: hz.Player, questId: string, reward?: number }>("questCompleted"),

	unlockPlayerMovement: new hz.NetworkEvent<{ player: hz.Player }>("unlockPlayerMovement"),

	resetQuests: new hz.LocalEvent<{ player: hz.Player }>("resetQuests"),
}
//#endregion

//#region QuestManager
class QuestManager extends hz.Component<typeof QuestManager> {
	static propsDefinition = {
		questContainer: { type: hz.PropTypes.Entity, required: true },	    // Reference to the entity containing all quests
		blockPlayerMovement: { type: hz.PropTypes.Boolean, default: true },	// Whether to block player movement when quest start dialogue is shown
		newQuestDuration: { type: hz.PropTypes.Number, default: 3 }, 		// Duration in seconds for a quest to be considered new
	};

	// Array to hold all quests in the world
	private quests: Array<QuestData> = [];
	// Array to hold active quests for each player
	private playerQuests: PlayerQuests[] = [];

	/**
	 * Lifecycle method called when the QuestManager component is initialized.
	 */
	start() {
		this.subscribeEvents();
		this.initializeQuestData();
	}

	/**
	 * Subscribes to all relevant quest-related events for this component.
	 */
	subscribeEvents() {
		this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterWorld, (player) =>
			this.onPlayerEnterWorld(player),
		);

		this.connectNetworkEvent(this.entity, QuestEvents.promptStartQuestDialogue, (data) =>{
			this.onPromptStartQuestDialogue(data);
		});

		this.connectNetworkEvent(this.entity, QuestEvents.questAccepted, (data) =>
			this.onQuestAccepted(data),
		);

		this.connectNetworkEvent(this.entity, QuestEvents.questCompleted, (data) => {
			this.onQuestCompleted(data);
		});

		this.connectNetworkEvent(this.entity, QuestEvents.unlockPlayerMovement, (data) =>
			this.togglePlayerMovement(data.player, true),
		);

		this.connectLocalEvent(this.entity, QuestEvents.resetQuests, (data) => {
			this.onResetQuests(data);
		});
	}

	/**
	 * Handles a player entering the world by initializing their quest data.
	 * @param player The player that entered the world.
	 */
	onPlayerEnterWorld(player: hz.Player) {
		const playerQuestData: PlayerQuests = {
			player,
			activeQuests: new Map<string, QuestData>(),
		};
		this.playerQuests.push(playerQuestData);
	}

	/**
	 * Prompts the specified player with a UI dialogue to start the given quest.
	 * @param data Contains questId and player for which to prompt.
	 */
	onPromptStartQuestDialogue(data: { questId: string; player: hz.Player }) {
		const { questId, player } = data;

		const playerQuestData = this.playerQuests.find(pq => pq.player === player);
		
		// Check if the player already has started or completed the quest
		if (playerQuestData && Array.from(playerQuestData.activeQuests.values()).some(q => q.questId === questId && q.status === QuestStatus.Completed)) return;

		if (player) {
			// get quest from this.quests that matches questId
			const questData = this.quests.find(q => q.questId === questId);
			if (questData) {
				//This event is received by the UIQuestStartDialogue.ts component to show the quest start dialogue.
				this.sendNetworkEvent(player, QuestEvents.promptStartQuestDialogueUI, { questId, questData });
			}
			this.togglePlayerMovement(player, false);
		}
	}

	/**
	 * Marks the specified quest as in progress for the given player when accepted.
	 * @param data Contains player and questId of the accepted quest.
	 */
	onQuestAccepted(data: { player: hz.Player; questId: string }) {
		const { player, questId } = data;
		if (!player) return;
		this.updateQuestStatus(player, questId, QuestStatus.InProgress);
	}

	/**
	 * Resets all active quests for the given player and updates the UI.
	 * @param data Contains the player whose quests should be reset.
	 */
	onResetQuests(data: { player: hz.Player }) {
		const { player } = data;
		const playerQuestData = this.playerQuests.find(pq => pq.player === player);
		if (playerQuestData) {
			playerQuestData.activeQuests.clear();
			this.sendQuestsUpdate(player);
		}
		this.togglePlayerMovement(player, true);

		// This event is received by the UIQuestStartDialogue.ts component to unlock player movement.
		this.sendNetworkEvent(player, QuestEvents.unlockPlayerMovement, { player });
	}

	/**
	 * Handles completion of a quest for a player, updating status.
	 * @param data Contains player and questId.
	 */
	onQuestCompleted(data: { player: hz.Player; questId: string }) {
		const { player, questId } = data;
		if (!player) return;

		this.updateQuestStatus(player, questId, QuestStatus.Completed);

		// NUX Demo: Send event to DialogueNPC to re-enable interaction trigger for this player
		this.sendNetworkBroadcastEvent(DialogueTreeEvents.questCompleted, { player });
	}

	/**
	 * Enables or disables player movement and camera based on quest interactions.
	 * @param player The player whose movement should be toggled.
	 * @param enable Whether to enable (true) or disable (false) movement.
	 */
	togglePlayerMovement(player: hz.Player, enable: boolean) {
		if (!this.props.blockPlayerMovement) return;

		if (enable) {
			player.locomotionSpeed.set(4.5);
			player.jumpSpeed.set(4.5);
			if (this.props.blockPlayerMovement) {
				// This event is received by the CameraManagerLocal.ts component to set the camera mode.
				this.sendNetworkEvent(player, CameraEvents.setCameraMode, { fixed: false });
			}
		} else {
			player.locomotionSpeed.set(0);
			player.jumpSpeed.set(0);
			if (this.props.blockPlayerMovement) {
				// This event is received by the CameraManagerLocal.ts component to set the camera mode.
				this.sendNetworkEvent(player, CameraEvents.setCameraMode, { fixed: true });
			}
		}
	}

	/**
	 * Initializes quest data from the questContainer entity.
	 * It retrieves all child entities that have a Quest component and populates the quests array.
	 */
	initializeQuestData() {
		//get childrens from the questContainer entity
		const questContainer = this.props.questContainer;
		if (!questContainer) {
			console.warn("Quest container not set in QuestManager props.");
			return [];
		}
		
		const questEntities = questContainer.children.get();
		questEntities.forEach((entity) => {
			const quest = entity.getComponents(Quest)[0];
			if (quest) {
				this.quests.push({
					questId: quest.getId(),
					name: quest.getTitle(),
					description: quest.getDescription(),
					isOptional: quest.isOptional(),
					reward: quest.getReward(),
					primaryColor: quest.getPrimaryColor(),
					secondaryColor: quest.getSecondaryColor(),
					status: QuestStatus.NotStarted,
					isNew: true,
				});
			}
		});
	}

	/**
	 * Updates the status of a quest for a player, handling addition, completion, and removal.
	 * @param player The player whose quest status is being updated.
	 * @param questId The ID of the quest to update.
	 * @param status The new status to set for the quest.
	 */
	updateQuestStatus(player: hz.Player, questId: string, status: QuestStatus) {
		const playerQuestData = this.playerQuests.find(pq => pq.player === player);
		if (!playerQuestData) return;

		const quest = playerQuestData.activeQuests.get(questId);

		if (quest) {
			if (quest.status === status) return;
			quest.status = status;

			if (status === QuestStatus.Completed) {
				playerQuestData.activeQuests.delete(questId);
				const reward = quest.reward || 0;

				// This event is received by the UIQuestComplete.ts component to show the quest completion UI.
				this.sendNetworkEvent(player, QuestEvents.questCompleted, { player, questId, reward });

			}
		} else if (status != QuestStatus.Completed) {
			const questTemplate = this.quests.find(q => q.questId === questId);
			if (questTemplate) {
				const newQuest: QuestData = { ...questTemplate, status };
				playerQuestData.activeQuests.set(questId, newQuest);
				this.updateIfQuestsAreNew(player, questId);
			} else {
				console.warn(`Quest with ID ${questId} not found in template.`);
			}
		}

		this.sendQuestsUpdate(player);
	}

	/**
	 * Sends the current list of active quests for the player to the UI.
	 * @param player The player for whom to send the quest update.
	 */
	sendQuestsUpdate(player: hz.Player) {
		const playerQuestData = this.playerQuests.find(pq => pq.player === player);
		if (!playerQuestData) return;

		const activeQuests = Array.from(playerQuestData.activeQuests.values());

		// This event is received by the UICurrentQuests.ts component to update the quest UI.
		this.sendNetworkEvent(player, QuestEvents.questUpdateUI, { activeQuests });
	}

	/**
	 * Sets a quest's isNew flag to false after a delay to indicate it's no longer new.
	 * @param player The player whose quest's new flag should be updated.
	 * @param questId The ID of the quest to update.
	 */
	updateIfQuestsAreNew(player: hz.Player, questId: string) {
		const playerQuestData = this.playerQuests.find(pq => pq.player === player);
		if (!playerQuestData) return;

		const quest = playerQuestData.activeQuests.get(questId);
		if (quest) {
			this.async.setTimeout(() => {
				quest.isNew = false;

				const activeQuests = Array.from(playerQuestData.activeQuests.values());

				// This event is received by the UICurrentQuests.ts component to update the quest UI.
				this.sendNetworkEvent(player, QuestEvents.questUpdateUI, { activeQuests });
			}, this.props.newQuestDuration * 1000);
		}
	}
}
// Register the component with Horizon
hz.Component.register(QuestManager);
//#endregion
