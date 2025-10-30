import * as hz from "horizon/core";
import * as ui from "horizon/ui";
import { DialogueTreeEvents } from "DialogueNPC";
import { QuestEvents } from "QuestManager";
import { AssignArrowEvent } from "ArrowFollower";
import { ResetEntityEvent } from "HideEntity";

/**
 * DialogueTreeCustomUI.ts
 *
 * Summary:
 * It manages the display of dialogue text, speaker names, and selectable options.
 * Spawns in NPCDialogue component and connects to it.
 * Can handle a maximum of 3 selectable options.
 *
 * Works with:
 * - NPCDialogue.ts - Manages the overall dialogue system and connects to triggers.
 * - DialogueNode.ts - Represents a single dialogue node in the dialogue system.
 * - DialogueNodeOption.ts - Represents selectable options within a dialogue node.
 *
 */

// Represents a single selectable option within a dialogue node
export type DialogueOption = {
	text: string; // Text of the option
	nextId?: string; // ID of the next node to navigate to
	close?: boolean; // Whether this option closes the dialogue
};

// Represents a single dialogue node in the dialogue tree
export type DialogueNode = {
	id: string; // Unique identifier for the node
	speaker: string; // Name of the speaker
	text: string; // Text content of the node
	options: DialogueOption[]; // List of options for this node
};

// Represents the entire dialogue tree as a dictionary of nodes
export type DialogueTree = {
	[id: string]: DialogueNode; // Dictionary of nodes indexed by ID
};

export class DialogueTreeCustomUI extends ui.UIComponent<typeof DialogueTreeCustomUI> {
	static propsDefinition = {
		NPCDialogue: { type: hz.PropTypes.Entity, required: true }, // Reference to the DialogueNPC entity
		questManager: { type: hz.PropTypes.Entity, required: true }, // Reference to the QuestManager entity
		arrowAssignManager: { type: hz.PropTypes.Entity, required: true }, // Reference to the ArrowAssignManager entity
		hiddenGem: { type: hz.PropTypes.Entity, required: true }, // Reference to the hiddenGem entity used in the quest
		clickSFX: { type: hz.PropTypes.Entity }, // sound played when clicking buttons
	};

	private clickSFX: hz.AudioGizmo = hz.AudioGizmo.prototype;
	// Holds the full parsed dialogue tree
	private currentTree: DialogueTree = {};

	// Currently active node in the dialogue
	private currentNode: DialogueNode = {
		id: "start",
		speaker: "???",
		text: "...",
		options: [],
	};

	// Bindings for dialogue, bubbles and speaker name. Default values.
	private dialogueTextBinding = new ui.Binding("...");
	private speakerBinding = new ui.Binding("???");
	private dialogueWidthBinding = new ui.Binding("45%");
	private bubbleWidthBinding = new ui.Binding("100%");
	private dialogueHeightBinding = new ui.Binding(100);

	// Bindings for answer button labels
	private buttonTextBindings = [new ui.Binding(""), new ui.Binding(""), new ui.Binding("")];

	// Controls visibility of each answer button
	private buttonVisibilities = [new ui.Binding(false), new ui.Binding(false), new ui.Binding(false)];

	// Hover color bindings for each button
	private buttonHoverBindings = [new ui.Binding("#b0e0ff"), new ui.Binding("#b0e0ff"), new ui.Binding("#b0e0ff")];

	// Player who owns this component
	private owner: hz.Player = hz.Player.prototype;

	/**
	 * Lifecycle method called when the DialogueTreeCustomUI component is initialized.
	 * This method sets up the initial state and subscribes to events.
	 */
	public start() {
		this.owner = this.entity.owner.get();
		if (this.owner !== this.world.getServerPlayer()) {
			this.subscribeEvents();
			this.entity.visible.set(false);
		}

		if (this.props.clickSFX) {
			this.clickSFX = this.props.clickSFX.as(hz.AudioGizmo);
		}

		// Initialize speaker and text display
		this.dialogueTextBinding.set(this.currentNode.text);
		this.speakerBinding.set(this.currentNode.speaker);
		this.dialogueWidthBinding.set(this.getSizeDialogue() + "%");
		this.bubbleWidthBinding.set(this.getSizeBubble() + "%");
	}

	/**
	 * Subscribes to events related to the dialogue tree.
	 */
	private subscribeEvents() {
		this.connectNetworkEvent(this.owner, DialogueTreeEvents.promptDialogueUI, (data) => this.onPromptDialogueUI(data));
	}

	/**
	 * Handles the prompt dialogue UI event.
	 * @param data - Data received from the network event containing the dialogue tree JSON.
	 */
	private onPromptDialogueUI(data: { TreeData: string }) {
		this.SetTree(data.TreeData);
		this.entity.visible.set(true);
	}

	/**
	 * Loads a dialogue tree from a JSON string and shows the first node
	 * @param treeJson - JSON string representing the dialogue tree
	 * @param onDialogueEnd  - Optional callback to run when the dialogue ends
	 */
	SetTree(treeJson: string) {
		try {
			const parsed: DialogueTree = JSON.parse(treeJson);
			this.currentTree = parsed;

			const startNode = parsed["Start"] || parsed["start"];
			if (!startNode) return;

			this.currentNode = {
				id: startNode.id,
				speaker: startNode.speaker,
				text: startNode.text,
				options: startNode.options,
			};

			this.dialogueTextBinding.set(this.currentNode.text);
			this.speakerBinding.set(this.currentNode.speaker);
			this.dialogueWidthBinding.set(this.getSizeDialogue() + "%");

			this.refreshOptions();
			this.entity.visible.set(true);
		} catch (e) {
			// Ignore parsing errors silently
		}
	}

	/**
	 * Calculates the width of the dialogue box based on the speaker's text length.
	 * @returns The width percentage for the dialogue box.
	 */
	getSizeDialogue(): number {
		const speakerLength = this.dialogueTextBinding["_globalValue"].length;
		let widthFactor: number;
		this.dialogueHeightBinding.set(100); // Increase height for short text
		if (speakerLength <= 15) {
			widthFactor = 0.3;
		} else if (speakerLength <= 50) {
			widthFactor = 0.45;
		} else if (speakerLength <= 100) {
			widthFactor = 0.8;
		} else {
			widthFactor = 1;
			this.dialogueHeightBinding.set(140); // Increase height for long text
		}
		widthFactor *= 100;
		return widthFactor;
	}

	/**
	 * Calculates the width of the answer buttons based on the longest text length.
	 * @returns The width percentage for the answer buttons.
	 */
	getSizeBubble(): number {
		// Calculate the longest text length among all answer buttons
		const longestText = Math.max(...this.buttonTextBindings.map((binding) => String(binding["_globalValue"] ?? "").length));

		let widthFactor: number;
		if (longestText <= 5) {
			widthFactor = 0.15;
		} else if (longestText <= 20) {
			widthFactor = 0.25;
		} else if (longestText <= 30) {
			widthFactor = 0.35;
		} else {
			widthFactor = 0.5;
		}
		widthFactor *= 100;
		return widthFactor;
	}

	/**
	 * Constructs and returns the full UI tree
	 * @returns ui.UINode - The root UI node containing the dialogue interface
	 */
	initializeUI() {
		return ui.View({
			style: {
				flex: 1,
				justifyContent: "flex-start",
				alignItems: "center",
				paddingTop: "10%",
			},
			children: [
				// Outer vertical stack
				ui.View({
					style: {
						width: "80%",
						maxWidth: 1000,
						flexDirection: "column",
						alignItems: "center",
						position: "relative",
					},
					children: [
						// Speaker Label (floating top)
						ui.View({
							style: {
								position: "absolute",
								zIndex: 2,
							},
							children: [
								ui.View({
									style: {
										gradientColorA: "#ce8900",
										gradientColorB: "#9b6000",
										paddingHorizontal: 50,
										paddingVertical: 8,
										borderRadius: 25,
										minWidth: 140,
										alignItems: "flex-start",
										justifyContent: "center",
										top: "-50%",
									},
									children: [
										ui.View({
											style: {
												position: "absolute",
												width: 42,
												height: 42,
												backgroundColor: "#45AECE",
												borderRadius: 40,
												marginLeft: 3,
											},
										}),
										ui.Image({
											source: ui.ImageSource.fromTextureAsset(new hz.TextureAsset(BigInt(771602605561028))),
											style: {
												position: "absolute",
												width: 42,
												height: 42,
												marginLeft: 3,
											},
										}),

										ui.Text({
											text: this.speakerBinding,
											style: {
												color: "white",
												fontWeight: "bold",
												fontSize: 24,
												textAlign: "center",
												marginLeft: 3,
											},
										}),
									],
								}),
							],
						}),

						ui.View({
							style: {
								position: "relative",
								width: this.dialogueWidthBinding,
								height: this.dialogueHeightBinding,
							},
							children: [
								// exit button shadow
								ui.View({
									style: {
										position: "absolute",
										width: 100,
										height: 50,
										top: "-60%",
										right: "0%",
										borderRadius: 25,
										backgroundColor: "#1313138e",
										transform: [{ translate: [3.5, 3.5] }],
									},
								}),

								//Exit button
								ui.Pressable({
									onPress: (player) => {
										this.finishDialogue();
										this.clickSFX.play({ fade: 0, players: [player] });
									},
									style: {
										position: "absolute",
										width: 100,
										height: 50,
										top: "-60%",
										right: "0%",
										borderRadius: 25,
										backgroundColor: "#aaaaaaff",
										borderColor: "rgba(146, 146, 146, 1)",
										borderWidth: 4,
										alignItems: "center",
										justifyContent: "center",
										paddingHorizontal: 20,
										paddingVertical: 8,
									},
									children: [
										ui.Text({
											text: "Skip",
											style: {
												position: "absolute",
												fontSize: 24,
												color: "white",
												textAlign: "center",
											},
										}),
									],
								}),

								// Dialogue Bubble shadow
								ui.View({
									style: {
										position: "absolute",
										width: "100%",
										height: "100%",
										backgroundColor: "#1313138e",
										borderTopLeftRadius: 50,
										borderTopRightRadius: 45,
										borderBottomRightRadius: 45,
										borderBottomLeftRadius: 0,
										transform: [{ translate: [3.5, 3.5] }],
									},
								}),

								// Dialogue Bubble
								ui.View({
									style: {
										position: "absolute",
										width: "100%",
										height: "100%",
										backgroundColor: "#E8D4B3",
										borderTopLeftRadius: 50,
										borderTopRightRadius: 45,
										borderBottomRightRadius: 45,
										borderBottomLeftRadius: 0,
										padding: 10,
										paddingVertical: 20,
										borderColor: "#A47127",
										borderWidth: 4,
										justifyContent: "center",
									},
									children: [
										ui.Text({
											text: this.dialogueTextBinding,
											style: {
												fontSize: 24,
												color: "#333333",
												textAlign: "center",
											},
										}),
									],
								}),
							],
						}),
						// Answer Buttons Container (outside bubble)
						ui.View({
							style: {
								width: "100%",
								marginTop: 16,
								alignItems: "center",
							},
							children: [
								ui.View({
									style: {
										width: this.bubbleWidthBinding,
										justifyContent: "flex-start",
									},
									children: this.buttonTextBindings.map((binding, index) =>
										ui.UINode.if(
											this.buttonVisibilities[index],
											this.createAnswerButton(
												binding,
												(player) => {
													this.handleAnswer(index);
													this.clickSFX.play({ fade: 0, players: [player] });
												},
												index
											)
										)
									),
								}),
							],
						}),
					],
				}),
			],
		});
	}

	/**
	 * Creates a stylized answer button.
	 * @param labelBinding The binding for the button label text.
	 * @param onClick The click event handler for the button.
	 * @param index The index of the button in the list.
	 * @returns A UI node representing the answer button.
	 */
	private createAnswerButton(labelBinding: ui.Binding<string>, onClick: (player: hz.Player) => void, index: number): ui.UINode {
		return ui.View({
			style: {
				marginBottom: "10%",
				right: "-50%",
			},
			children: [
				ui.View({
					style: {
						position: "absolute",
						backgroundColor: "#1313138e",
						borderTopLeftRadius: 30,
						borderTopRightRadius: 35,
						borderBottomRightRadius: 0,
						borderBottomLeftRadius: 30,
						width: "100%",
						height: "100%",
						transform: [{ translate: [3.5, 3.5] }],
					},
				}),
				ui.Pressable({
					onClick,
					onEnter: () => this.buttonHoverBindings[index].set("#d0f4ff"),
					onExit: () => this.buttonHoverBindings[index].set("#b0e0ff"),
					style: {
						backgroundColor: this.buttonHoverBindings[index],
						borderTopLeftRadius: 30,
						borderTopRightRadius: 35,
						borderBottomRightRadius: 0,
						borderBottomLeftRadius: 30,
						paddingVertical: 5,
						paddingHorizontal: 16,
						borderColor: "#006BB9",
						borderWidth: 4,
					},
					children: [
						ui.Text({
							text: labelBinding,
							style: {
								color: "#003b5c",
								fontSize: 24,
								fontWeight: "normal",
								textAlign: "center",
								margin: 10,
							},
						}),
					],
				}),
			],
		});
	}

	/**
	 * Finishes the dialogue and hides the UI.
	 */
	private finishDialogue() {
		this.entity.visible.set(false);
		this.sendNetworkEvent(this.props.NPCDialogue!, DialogueTreeEvents.closeUI, { player: this.owner });

		// Send event to start the quest
		this.sendNetworkEvent(this.props.questManager!, QuestEvents.promptStartQuestDialogue, { questId: "skellys_gem", player: this.owner });

		// Send event to assign arrow to player
		this.sendNetworkEvent(this.props.arrowAssignManager!, AssignArrowEvent, { player: this.owner });

		// Send event to reset the gem state
		this.sendNetworkEvent(this.props.hiddenGem!, ResetEntityEvent, { player: this.owner });
	}

	/**
	 * Handles user selecting a dialogue option
	 * @param index The index of the selected option.
	 */
	private handleAnswer(index: number) {
		const opt = this.currentNode.options[index];
		if (!opt) return;

		// If the option closes the dialogue, hide the UI
		if (opt.close) {
			this.finishDialogue();
			return;
		}

		// Move to the next node if it exists
		const nextNode = this.currentTree[opt.nextId!];
		if (nextNode) {
			this.currentNode = nextNode;
			this.dialogueTextBinding.set(nextNode.text);
			this.speakerBinding.set(nextNode.speaker);
			this.dialogueWidthBinding.set(this.getSizeDialogue() + "%");
			this.bubbleWidthBinding.set(this.getSizeBubble() + "%");
			this.refreshOptions();
		} else {
			// Fallback: show end-of-dialogue state
			this.dialogueTextBinding.set("The conversation ends.");
			this.dialogueWidthBinding.set("45%");
			this.bubbleWidthBinding.set("100%");
			this.speakerBinding.set("???");
			this.buttonTextBindings.forEach((b) => b.set(""));
			this.buttonVisibilities.forEach((v) => v.set(false));
		}
	}

	/**
	 * Refreshes the answer options displayed in the UI.
	 * Updates button texts, visibility, and bubble width based on current node options.
	 * If there are fewer options than buttons, hides the extra buttons.
	 */
	private refreshOptions() {
		this.currentNode.options.forEach((opt, i) => {
			this.buttonTextBindings[i]?.set(opt.text);
			this.buttonVisibilities[i]?.set(true);
			const size = this.getSizeBubble();
			this.bubbleWidthBinding.set(this.getSizeBubble() + "%");
		});

		for (let i = this.currentNode.options.length; i < this.buttonTextBindings.length; i++) {
			this.buttonTextBindings[i].set("");
			this.buttonVisibilities[i].set(false);
		}
	}
}
// Register the component with Horizon
ui.UIComponent.register(DialogueTreeCustomUI);
