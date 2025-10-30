import * as hz from 'horizon/core';
import * as ui from 'horizon/ui';
import { QuestEvents } from 'QuestManager';
/**
 * UIQuestComplete.ts
 * 
 * Summary:
 * Displays a “Task Completed” message and reward amount,
 * fading in when a quest completes and then fading out after a delay.
 * 
 * Works with:
 * - QuestManager.ts Manages the overall quest system.
 * - CameraManagerLocal.ts Manages camera-related functionality.
 * - QuestTrigger.ts Triggers quest-related events.
 * - UIQuestStartDialogue Prompts players to start quests
 * - UICurrentQuests Displays active quests
 * - Quest.ts - Represents a quest entity.
 * 
 * Setup:
 * - Create a pool that contains childrens with this script to have one per player.
 * - Decide how much time to show the completion UI by setting the `closeUIDelay` prop.
 */

class UIQuestComplete extends ui.UIComponent<typeof UIQuestComplete> {
  static propsDefinition = {
    closeUIDelay: { type: hz.PropTypes.Number, default: 3 }, //Time in seconds before the completion UI fades out.
  };

  //The player who owns this component instance.
  private owner: hz.Player = hz.Player.prototype;

  // Animated binding for the overall opacity of the UI (0 = hidden, 1 = visible).
  private opacityBinding = new ui.AnimatedBinding(0);

  // Binding for the reward text (e.g. "+50 XP").
  private reward = new ui.Binding<string>("");

  /**
   * Lifecycle method called once when the component is initialized.
   * Caches the owning player and subscribes to questCompleted events for real players.
   */
  start() {
    this.owner = this.entity.owner.get();
    if (this.owner !== this.world.getServerPlayer()) {
      this.subscribeEvents();
    }
  }

  /**
   * Subscribes to the QuestEvents.questCompleted network event.
   * When triggered, updates the reward text (if any) and starts the fade animation.
   */
  private subscribeEvents() {
    this.connectNetworkEvent(
      this.owner,
      QuestEvents.questCompleted,
      (data) => {
        const { reward } = data;
        if (reward !== undefined) {
          this.setRewardText(reward);
        }
        this.startAnimation();
      }
    );
  }

  /**
   * Begins the fade-in animation, then schedules a fade-out after `closeUIDelay` seconds.
   */
  private startAnimation() {
    // Fade in to full opacity
    this.opacityBinding.set(
      ui.Animation.timing(1, {
        duration: 300,
        easing: ui.Easing.inOut(ui.Easing.ease),
      })
    );

    // After the configured delay, fade out
    this.async.setTimeout(() => {
      this.opacityBinding.set(
        ui.Animation.timing(0, {
          duration: 300,
          easing: ui.Easing.inOut(ui.Easing.ease),
        })
      );
    }, this.props.closeUIDelay * 1000);
  }

  /**
   * Sets the reward text binding to show the earned XP.
   * @param reward Number of XP awarded by the quest
   */
  private setRewardText(reward: number) {
    this.reward.set(`+${reward} XP`);
  }

  //Height of the UI panel in pixels.
  protected panelHeight: number = 1920;
  //Width of the UI panel in pixels.
  protected panelWidth: number = 1080;

  /**
   * Builds the UI view tree:
   * - A full-screen container whose opacity is driven by `opacityBinding`
   * - “Task Completed!” title
   * - Reward text below the title
   * - Animated “star” composed of rotated squares scaling with opacity
   */
  initializeUI(): ui.UINode {
    return ui.View({
      style: {
        position: "absolute",
        width: "100%",
        height: "100%",
        justifyContent: "center",
        alignItems: "center",
        opacity: this.opacityBinding,
      },
      children: [
        // Background
        ui.View({
          style: {
            position: "absolute",
            width: 650,
            height: 250,
            borderRadius: 20,
            backgroundColor: "rgba(0, 0, 0, 0.88)",
            transform: [{ translate: [0, 170] }],
          },
        }),
        // Title text
        ui.Text({
          text: "Task Completed!",
          style: {
            position: "absolute",
            fontSize: 68,
            color: "rgb(255, 255, 255)",
            textAlign: "center",
            fontFamily: "Roboto",
            fontWeight: "900",
            transform: [{ translate: [0, 200] }],
          },
        }),
        // Reward amount
        ui.Text({
          text: this.reward,
          style: {
            position: "absolute",
            fontSize: 50,
            color: "rgb(255, 255, 255)",
            textAlign: "center",
            fontFamily: "Roboto",
            fontWeight: "900",
            transform: [{ translate: [0, 120] }],
          },
        }),
        // Star animation group
        ui.View({
          style: {
            position: "absolute",
            width: "100%",
            height: "100%",
            justifyContent: "center",
            alignItems: "center",
            transform: [{ scale: this.opacityBinding }],
          },
          children: [
            // Four rotated squares forming a star
            ui.View({
              style: {
                position: "absolute",
                width: 175,
                height: 175,
                backgroundColor: "rgba(255, 255, 255, 0.7)",
                transform: [{ translate: [0, -100] }, { rotate: "45deg" }],
              }
            }),
            ui.View({
              style: {
                position: "absolute",
                width: 175,
                height: 175,
                backgroundColor: "rgba(255, 255, 255, 0.7)",
                transform: [{ translate: [0, -100] }, { rotate: "29.42deg" }],
              }
            }),
            ui.View({
              style: {
                position: "absolute",
                width: 175,
                height: 175,
                backgroundColor: "rgba(255, 255, 255, 0.7)",
                transform: [{ translate: [0, -100] }, { rotate: "97.37deg" }],
              }
            }),
            ui.View({
              style: {
                position: "absolute",
                width: 175,
                height: 175,
                backgroundColor: "rgba(255, 255, 255, 0.7)",
                transform: [{ translate: [0, -100] }, { rotate: "74.42deg" }],
              }
            }),
            ui.Image({
              source: ui.ImageSource.fromTextureAsset(new hz.TextureAsset(BigInt(1303200331196760))),
              style: {
                position: "absolute",
                width: 160,
                height: 160,
                 transform: [{ translate: [0, -100] }],
              }
            })
          ]
        })
      ],
    });
  }
}

// Register the component so Horizon can use it in the scene
ui.UIComponent.register(UIQuestComplete);
