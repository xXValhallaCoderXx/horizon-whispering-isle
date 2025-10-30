import {Component, PropTypes} from 'horizon/core';

/**
 * TutorialImageInfo.ts
 *
 * Summary:
 * Represents a sprite with an image ID and order for display purposes.
 * 
 * Works with:
 * - TutorialUIController.ts - Manages the UI components and their display order.
 *
 * Setup:
 * - Configure the properties in the entity's inspector.
 */

export class TutorialImageInfo extends Component<typeof TutorialImageInfo> {
  static propsDefinition = {
    order: {type: PropTypes.Number, default: 1}, // Order of the sprite in the UI
    imageId: {type: PropTypes.String},           // ID of the image to display
  };

  /**
   * Lifecycle method called when the TutorialImageInfo component is initialized.
   */
  start() {}
}
// Register the component so it can be used in the world
Component.register(TutorialImageInfo);