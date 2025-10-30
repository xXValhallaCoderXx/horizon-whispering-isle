import * as hz from 'horizon/core';
import * as ui from 'horizon/ui';
import { QuestData, QuestEvents } from 'QuestManager';

/**
 * UIQuestStartDialogue.ts
 * 
 * Summary:
 * Displays a dialogue to the player when a quest is offered.
 * It shows the quest title, description, and options to accept or decline the quest.
 * The dialogue colors adapt based on quest type (tutorial or side quest).
 * 
 * Works with:
 * - QuestManager.ts Manages the overall quest system.
 * - CameraManagerLocal.ts Manages camera-related functionality.
 * - QuestTrigger.ts Triggers quest-related events.
 * - UIQuestComplete Shows quest completion UI
 * - UICurrentQuests Displays active quests
 * - Quest.ts - Represents a quest entity.
 * 
 */
class UIQuestStartDialogue extends ui.UIComponent<typeof UIQuestStartDialogue> {
  static propsDefinition = {
    questManager: { type: hz.PropTypes.Entity, required: true }, // Reference to the quest manager entity
    clickSFX: { type: hz.PropTypes.Entity }, // sound played when clicking buttons
  };

  private clickSFX: hz.AudioGizmo = hz.AudioGizmo.prototype;

  // Binding indicating if the current quest can be declined (true = optional).
  private isQuestOptional: ui.Binding<boolean> = new ui.Binding<boolean>(true);

  // Color bindings for the dialogue background, updated per quest type.
  private colorBindings = {
    primaryColor: new ui.Binding<string>("rgb(75, 168, 47)"),
    secondaryColor: new ui.Binding<string>("rgb(27, 108, 33)"),
  };

  // Bindings for the dialogue title and description text.
  private startQuestDialogueBindings = {
    title: new ui.Binding<string>('Title of the Quest'),
    description: new ui.Binding<string>('This is the description of the quest.'),
  };

  // The player who owns this UI entity.
  private owner: hz.Player = hz.Player.prototype;

  // The ID of the quest currently being offered.
  private questToAccept: string | null = null;

  // Height of the UI panel in pixels.
  protected panelHeight: number = 1920;

  // Width of the UI panel in pixels.
  protected panelWidth: number = 1080;

  /**
   * Lifecycle method called once when the component is initialized.
   * Caches the owning player and sets up event subscriptions if not the server.
   */
  start() {
    this.owner = this.entity.owner.get();
    if (this.owner !== this.world.getServerPlayer()) {
      this.subscribeEvents();
      this.entity.visible.set(false);
    }
    if (this.props.clickSFX) {
      this.clickSFX = this.props.clickSFX.as(hz.AudioGizmo);
    }
  }

  /**
   * Subscribes to network events from QuestManager to trigger the UI.
   * @private
   */
  private subscribeEvents() {
    this.connectNetworkEvent(
      this.owner,
      QuestEvents.promptStartQuestDialogueUI,
      (data) => this.onPromptStartQuestDialogueUI(data)
    );
  }

  /**
   * Handler for showing the quest start dialogue when a quest is offered.
   * Updates text and colors based on quest data and makes the UI visible.
   * @param data Object containing questId and questData.
   */
  private onPromptStartQuestDialogueUI(data: { questId: string; questData: QuestData }) {
    const { questId, questData } = data;

    // Update title and description
    this.startQuestDialogueBindings.title.set(questData.name);
    this.startQuestDialogueBindings.description.set(questData.description);
    this.isQuestOptional.set(questData.isOptional);

    // Apply color scheme based on quest type
    const primaryColor: string = `rgb(${questData.primaryColor!.r * 255}, ${questData.primaryColor!.g * 255}, ${questData.primaryColor!.b * 255})`;
    const secondaryColor: string = `rgb(${questData.secondaryColor!.r * 255}, ${questData.secondaryColor!.g * 255}, ${questData.secondaryColor!.b * 255})`;
    this.colorBindings.primaryColor.set(primaryColor);
    this.colorBindings.secondaryColor.set(secondaryColor);

    this.entity.visible.set(true);
    this.questToAccept = questId;
  }

  /**
   * Called when the player clicks the "Accept" button.
   * Sends events to QuestManager to accept the quest and re-enable movement.
   */
  acceptQuest() {
    this.entity.visible.set(false);
    this.isQuestOptional.set(false);
    if (this.questToAccept === null) return;

    this.sendNetworkEvent(
      this.props.questManager!,
      QuestEvents.unlockPlayerMovement,
      { player: this.owner }
    );
    this.sendNetworkEvent(
      this.props.questManager!,
      QuestEvents.questAccepted,
      { player: this.owner, questId: this.questToAccept }
    );
  }

  /**
   * Called when the player clicks the "Decline" button.
   * Sends event to QuestManager to re-enable movement without accepting the quest.
   */
  declineQuest() {
    this.entity.visible.set(false);
    this.isQuestOptional.set(true);
    this.sendNetworkEvent(
      this.props.questManager!,
      QuestEvents.unlockPlayerMovement,
      { player: this.owner }
    );
  }

  /**
   * Builds the UI view hierarchy for the quest dialogue.
   * @returns A View tree describing the UI layout.
   */
  initializeUI() {
    return ui.View({
      style: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ translate: [0, 0] }],
        margin: 0,
        padding: 0,
      },
      children: [
        ui.View({
          style: {
            position: 'absolute',
            width: 600,
            height: 400,
            backgroundColor: this.colorBindings.primaryColor,
            borderColor: 'rgb(84, 146, 80)',
            borderWidth: 5,
            borderRadius: 20,
            alignItems: 'center',
          },
          children: [
            ui.Text({
              text: this.startQuestDialogueBindings.title,
              style: {
                color: 'rgb(32, 32, 32)',
                fontSize: 40,
                fontFamily: 'Optimistic',
                fontWeight: '900',
                textAlign: 'center',
                marginTop: 40,
              }
            }),
            ui.Text({
              text: this.startQuestDialogueBindings.description,
              style: {
                color: 'rgb(32, 32, 32)',
                fontSize: 30,
                fontFamily: 'Roboto',
                textAlign: 'center',
                marginTop: 10,
                marginHorizontal: 30,
                paddingHorizontal: 20,
              }
            }),
            ui.View({
              style: {
                position: 'absolute',
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                width: 400,
                height: 100,
                marginHorizontal: 50,
                transform: [{ translate: [0, 285] }],
              },
              children: [
                ui.UINode.if(
                  this.isQuestOptional,
                  ui.Pressable({
                    onClick: () => this.declineQuest(),
                    style: {
                      width: 180,
                      height: 70,
                      backgroundColor: 'rgb(162, 40, 40)',
                      borderColor: 'rgb(255, 255, 255)',
                      borderWidth: 5,
                      borderRadius: 20,
                      marginHorizontal: 10,
                      justifyContent: 'center',
                      alignItems: 'center',
                    },
                    children: [
                      ui.Text({
                        text: 'Decline',
                        style: {
                          color: 'white',
                          fontSize: 24,
                          fontFamily: 'Optimistic',
                          fontWeight: '900',
                          textAlign: 'center',
                          textAlignVertical: 'center',
                          padding: 15,
                        }
                      })
                    ]
                  })
                ),
                ui.Pressable({
                  onClick: () => {
                    this.acceptQuest();
                    this.clickSFX.play({ fade: 0, players: [this.owner] });
                  },
                  style: {
                    width: 180,
                    height: 70,
                    backgroundColor: 'rgb(211,255,148)',
                    borderColor: 'rgb(84, 146, 80)',
                    borderWidth: 5,
                    borderRadius: 20,
                    marginHorizontal: 10,
                    justifyContent: 'center',
                    alignItems: 'center',
                  },
                  children: [
                    ui.Text({
                      text: 'Accept',
                      style: {
                        color: 'black',
                        fontSize: 24,
                        fontFamily: 'Optimistic',
                        fontWeight: '900',
                        textAlign: 'center',
                        textAlignVertical: 'center',
                        padding: 15,
                      }
                    })
                  ]
                }),
              ]
            })
          ]
        })
      ]
    });
  }
}

// Register the UI component with Horizon
ui.UIComponent.register(UIQuestStartDialogue);