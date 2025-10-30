import { CodeBlockEvents, Component, InfoSlide, Player, PropTypes } from 'horizon/core';
import { TutorialSlide } from 'TutorialSlide';

/**
 * TutorialController.ts
 *
 * Summary:
 * Manages the tutorial slides and plays them for players.
 * It connects to a trigger to start the tutorial when a player enters it.
 *
 * Works with:
 * - TutorialSlide.ts - Represents a single tutorial slide.
 * - UIHighlight.ts - Provides UI highlighting for the tutorial.
 * - TutorialManager.ts - Manages the overall tutorial flow.
 *
 * Setup:
 * - Place the trigger where you want to show the tutorial
 */

export class TutorialController extends Component<typeof TutorialController> {
  static propsDefinition = {
    trigger: { type: PropTypes.Entity } // The trigger entity that starts the tutorial
  };

  private slides: InfoSlide[] = [];

/**
 * Executes when the world starts and when an entity that has this script is spawned.
 * Initializes the tutorial controller by subscribing to events and loading slides.
 */
  start() {
     this.subscribeEvents();
     this.loadSlides();
  }

  //#region Public Methods
  
  /**
   * Plays the tutorial for the specified player
   * @param player - The player playing the tutorial
   */
  public playTutorial(player: Player) {
    player.showInfoSlides(this.getTutorialSlides());
  }

  /**
   * Retrieve the loaded tutorial slides
   */
  public getTutorialSlides(): InfoSlide[] {
    return this.slides;
  }

  /**
   * Loads and processes tutorial slides by gathering all `TutorialSlide` components from the children entities,
   * sorting them based on their order, and converting them into a specific display format.
   * Use getTutorialSlides() to retrieve the loaded slides.
   */
  public loadSlides() {
    let slides: TutorialSlide[] = [];

    // Find all TutorialSlide components in children
    this.entity.children.get().forEach(child => {
      const tutorialSlides = child.getComponents(TutorialSlide);
      if (tutorialSlides.length > 0) {
        tutorialSlides.forEach(slide => {
          slides.push(slide);
        });
      }
    });

    // Sort slides by order
    slides.sort((a, b) => a.props.order - b.props.order);

    // Print sorted slides as: "Slide Title - Order
    slides.forEach(slide => {
    });

    // Convert to InfoSlide format
    this.slides = slides.map(slide => ({
      title: slide.props.title,
      message: slide.props.message,
      imageUri: slide.props.imageUri,
      style: {
        attachImageToHeader: slide.props.attachImageToHeader
      }
    }));

  }
  
  //#endregion

  //#region Private Methods

  /**
   * Subscribes to specific events based on the provided trigger, if any.
   * Once a player interacts with the trigger, the tutorial is played for them.
   */
  private subscribeEvents() {
    if (this.props.trigger)
      this.connectCodeBlockEvent(this.props.trigger, CodeBlockEvents.OnPlayerEnterTrigger, this.playTutorial.bind(this));
  }
  
  //#endregion
}
// This line registers the TutorialController component with Horizon
Component.register(TutorialController);