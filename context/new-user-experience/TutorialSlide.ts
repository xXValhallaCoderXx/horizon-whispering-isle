import { Component, InfoSlide, PropTypes } from 'horizon/core';

/**
 * TutorialSlide.ts
 *
 * Summary:
 * Represents a single tutorial slide that can be displayed to players.
 * 
 * Works with:
 * - TutorialController.ts - Manages the overall tutorial flow and plays slides.
 * - UIHighlight.ts - Provides UI highlighting for the tutorial.
 * - TutorialManager.ts - Manages the tutorial steps and actions.
 *
 * Setup:
 * - Duplicate or remove the Tutorial Slide entities according to your needs
 * - Configure the properties in the entity's inspector.
 */

export class TutorialSlide extends Component<typeof TutorialSlide> {
  static propsDefinition = {
    order: { type: PropTypes.Number, default: 1 },                             // The order of the slide in the tutorial sequence
    title: { type: PropTypes.String, default: 'Tutorial Slide' },              // The title of the slide
    message: { type: PropTypes.String, default: 'This is a tutorial slide.' }, // The message displayed on the slide
    imageUri: { type: PropTypes.String, default: '' },                         // The URI of the image to display on the slide
    attachImageToHeader: { type: PropTypes.Boolean, default: false }           // Whether to attach the image to the header
  };

  private slide!: InfoSlide;

  /**
   * Lifecycle method called before the start when the TutorialSlide component is initialized.
   * Sets up the slide properties based on the component's props.
   */
  preStart(): void {
    this.setup();
  }

  /**
   * Lifecycle method called when the component starts.
   */
  start() {}

  //#region Public Methods

  /**
   * Retrieves the current slide information.
   * @returns {InfoSlide} The current slide information.
   */
  getSlide(): InfoSlide {
    return this.slide;
  }

  //#endregion

  //#region Override Slide Properties

  /**
   * Changes the title of the slide.
   * @param newTitle The new title to set.
   */
  changeTitle(newTitle: string) {
    this.slide.title = newTitle;
  }

  /**
   * Changes the message of the slide.
   * @param newMessage The new message to set.
   */
  changeMessage(newMessage: string) {
    this.slide.message = newMessage;
  }

  /**
   * Changes the image URI of the slide.
   * @param newImageUri The new image URI to set. It should be a valid asset ID string.
   */
  changeImageUri(newImageUri: string) {
    this.slide.imageUri = newImageUri;
  }

  /**
   * Changes the attachment of the image to the header.
   * @param attach Whether to attach the image to the header.
   */
  changeAttachImageToHeader(attach: boolean) {
    this.slide.style = {
      attachImageToHeader: attach
    }
  }

  //#endregion

  //#region Private Methods

  /**
   * Sets up the slide properties based on the component's props.
   */
  private setup() {
    this.slide = {
      title: this.props.title,
      message: this.props.message,
      imageUri: this.props.imageUri,
      style: {
        attachImageToHeader: this.props.attachImageToHeader
      }
    };
  }
  //#endregion
}
// Register the TutorialSlide component with Horizon
Component.register(TutorialSlide);