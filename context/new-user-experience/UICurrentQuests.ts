import * as hz from 'horizon/core';
import * as ui from 'horizon/ui';
import {QuestData, QuestEvents,} from 'QuestManager';

/**
 * UICurrentQuests.ts
 *
 * Summary:
 * Listens for quest updates and displays up to a fixed number of quest entries 
 * on the player’s screen, animating a “New” badge for newly added quests
 * 
 * Works with:
 * - QuestManager.ts Manages the overall quest system.
 * - CameraManagerLocal.ts Manages camera-related functionality.
 * - QuestTrigger.ts Triggers quest-related events.
 * - UIQuestStartDialogue Prompts players to start quests
 * - UIQuestComplete Shows quest completion UI
 * - Quest.ts - Represents a quest entity.
 *
 */

/**
 * Defines the set of UI bindings used for displaying an individual quest:
 */
type QuestBindings = {
  questId: string;                    // Unique identifier for the quest
  visible: ui.Binding<boolean>;       // Whether this quest entry is currently visible
  title: ui.Binding<string>;          // The quest’s display name
  primaryColor: ui.Binding<string>;   // Gradient color for the quest type
  secondaryColor: ui.Binding<string>; // Secondary gradient color for the quest type
  positionXNew: ui.AnimatedBinding;   // Animated binding for “New” badge horizontal position
  positionX: ui.AnimatedBinding;      // Current horizontal position of the quest entry
}

class UICurrentQuests extends ui.UIComponent<typeof UICurrentQuests> {
  static propsDefinition = {
    questManager: { type: hz.PropTypes.Entity, required: true }, // Reference to the QuestManager entity
  };

  // Current screen width in pixels (bound to player’s settings).
  private screenWidth: ui.Binding<number> = new ui.Binding<number>(1080);
  // Current screen height in pixels (bound to player’s settings).
  private screenHeight: ui.Binding<number> = new ui.Binding<number>(1920);

  // Array of QuestBindings for managing multiple quest entries.
  private questDisplays: QuestBindings[] = [];
  // The player who owns this UI component.
  private owner: hz.Player = hz.Player.prototype;

  // X-position when the “New” badge is hidden off-screen.
  private hiddenPositionXNew: number = 100;
  // X-position when the “New” badge is visible.
  private shownPositionXNew: number = 225;

  // Height of the UI panel
  protected panelHeight: number = 3000;
  // Width of the UI panel
  protected panelWidth: number = 3000;

  /**
   * Lifecycle method called once when component is initialized.
   * - Caches the player owner
   * - Reads screen size bindings
   * - Subscribes to quest update events if not the server
   */
  start() {
    this.owner = this.entity.owner.get();
    if (this.owner !== this.world.getServerPlayer()) {
      this.screenWidth.set(this.owner.screenWidth.get());
      this.screenHeight.set(this.owner.screenHeight.get());
      this.subscribeEvents();
    }
  }

  /**
   * Subscribes to the QuestEvents.questUpdateUI network event.
   * When received, onQuestUpdateUI will update the displayed quests.
   */
  private subscribeEvents() {
    this.connectNetworkEvent(
      this.owner,
      QuestEvents.questUpdateUI,
      (data) => this.onQuestUpdateUI(data)
    );
  }

  /**
   * Handler called when active quest data is received.
   * - Hides all existing displays
   * - For each active quest (up to the limit), shows/upates a display entry:
   *   • Sets title, questId
   *   • Animates “New” badge in or out based on questData.isNew
   *   • Applies color gradient based on quest type
   *
   * @param data Object containing an array of active QuestData
   */
  private onQuestUpdateUI(data: { activeQuests: QuestData[] }) {
    const { activeQuests } = data;

    // Hide all existing entries first
    this.questDisplays.forEach(q => q.visible.set(false));

    // Update each slot with new data
    activeQuests.forEach((questData, index) => {
      if (index < this.questDisplays.length) {
        const display = this.questDisplays[index];
        display.visible.set(true);
        display.title.set(questData.name);
        display.questId = questData.questId;

        // Animate “New” badge
        const duration = 300;
        const targetX = questData.isNew
          ? this.shownPositionXNew
          : this.hiddenPositionXNew;
        display.positionXNew.set(
          ui.Animation.timing(targetX, {
            duration: duration,
            easing: ui.Easing.inOut(ui.Easing.ease),
          })
        );

        // Hide the badge if not new
        if (!questData.isNew) {
          this.async.setTimeout(() => {
            display.positionX.set(
              ui.Animation.timing(-500, {
                duration: duration,
                easing: ui.Easing.inOut(ui.Easing.ease),
              })
            );
          }, 300);
        }

        // Set gradient colors
        const primaryColor: string = `rgb(${questData.primaryColor!.r * 255}, ${questData.primaryColor!.g * 255}, ${questData.primaryColor!.b * 255})`;
        const secondaryColor: string = `rgb(${questData.secondaryColor!.r * 255}, ${questData.secondaryColor!.g * 255}, ${questData.secondaryColor!.b * 255})`;
        display.primaryColor.set(primaryColor);
        display.secondaryColor.set(secondaryColor);
      }
    });
  }

  /**
   * Prepares a fixed number of QuestBindings entries for the UI.
   * Initializes each with default “hidden” state and placeholder title.
   *
   * @param questAmount Number of quest slots to create
   */
  private initializeQuestBindings(questAmount: number) {
    for (let i = 0; i < questAmount; i++) {
      this.questDisplays.push({
        questId: "",
        visible: new ui.Binding<boolean>(false),
        title: new ui.Binding<string>(`Quest ${i + 1}`),
        primaryColor: new ui.Binding<string>(`rgba(75, 168, 47, 1)`),
        secondaryColor: new ui.Binding<string>(`rgba(27, 108, 33, 1)`),
        positionXNew: new ui.AnimatedBinding(this.hiddenPositionXNew),
        positionX: new ui.AnimatedBinding(0) // Default position
      });
    }
  }

  /**
   * Creates the UI node structure for a single quest entry.
   * - Conditionally rendered based on `visible`
   * - Contains an animated “New” badge and a colored title text
   *
   * @param visible Binding controlling visibility
   * @param title Binding for quest name
   * @param primaryColor Gradient start color
   * @param secondaryColor Gradient end color
   * @param positionXNew Animated binding for badge position
   * @param positionX Animated binding for the quest entry position
   */
  private createQuestDisplay(
    visible: ui.Binding<boolean>,
    title: ui.Binding<string>,
    primaryColor: ui.Binding<string>,
    secondaryColor: ui.Binding<string>,
    positionXNew: ui.AnimatedBinding,
    positionX: ui.AnimatedBinding
  ): ui.UINode {
    return ui.UINode.if(
      visible,
      ui.View({
        style: {
          justifyContent: 'center',
          marginBottom: 20,
          transform: [{ translateX: positionX }],
        },
        children: [
          // “New” badge
          ui.View({
            style: {
              position: 'absolute',
              height: 75,
              width: 150,
              backgroundColor: 'rgba(255, 0, 0, 1)',
              borderRadius: 10,
              borderTopRightRadius: 50,
              borderBottomRightRadius: 50,
              justifyContent: 'center',
              transform: [{ translateX: positionXNew }],
            },
            children: [
              ui.Text({
                text: 'New',
                style: {
                  color: 'white',
                  fontSize: 22,
                  fontFamily: 'Roboto',
                  fontWeight: '900',
                  textAlign: 'center',
                  textAlignVertical: 'center',
                  padding: 10,
                  position: 'absolute',
                  transform: [{ translate: [75, 0] }],
                },
              }),
            ],
          }),
          // Quest title with gradient border
          ui.Text({
            text: title,
            style: {
              color: 'white',
              fontSize: 26,
              fontFamily: 'Optimistic',
              fontWeight: '900',
              textAlign: 'left',
              textAlignVertical: 'center',
              height: 70,
              padding: 35,
              gradientColorA: primaryColor,
              gradientColorB: secondaryColor,
              gradientYa: 0.60,
              gradientYb: 0.90,
              gradientAngle: '0deg',
              borderColor: `rgb(255, 255, 255)`,
              borderWidth: 5,
              borderTopRightRadius: 40,
              borderBottomRightRadius: 40,
              transform: [{ translate: [-5, 0] }],
            },
          }),
        ],
      })
    );
  }

  /**
   * Builds and returns the root UI node for this component.
   * - Initializes quest bindings
   * - Lays out all quest entries in a vertical list
   */
  initializeUI(): ui.UINode {
    this.initializeQuestBindings(4);

    return ui.View({
      style: {
        width: this.screenWidth,
        height: this.screenHeight,
      },
      children: [
        ui.View({
          style: {
            position: 'absolute',
            width: '100%',
            height: '100%',
          },
          children: [
            ui.View({
              style: {
                position: 'absolute',
                width: 300,
                height: 600,
                transform: [{ translate: [0, 100] }],
              },
              children: this.questDisplays.map(q =>
                this.createQuestDisplay(
                  q.visible,
                  q.title,
                  q.primaryColor,
                  q.secondaryColor,
                  q.positionXNew,
                  q.positionX
                )
              ),
            }),
          ],
        }),
      ],
    });
  }
}

// Register this UI component with Horizon
ui.UIComponent.register(UICurrentQuests);
