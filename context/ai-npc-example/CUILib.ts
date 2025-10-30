import * as hz from 'horizon/core';	// Imports core functionalities from the Horizon engine.
import * as ui from 'horizon/ui';   // Imports Horizon UI functionalities, including base UI components and styles.

/**
 * Defines the current version of the CUILib library.
 * This can be used for debugging, logging, or compatibility checks.
 * Last update: 8/2/2025
 * History: v1.0.0 - original version
 *          v1.0.1 - removing button functions to the button module
 *          v1.0.2 - removing toggle, radiobutton and checkbox functions to the option module
 *          v1.0.3 - added CUILibViewContainer function, replacing CUILibTextLabel with CUILibText function, 
 */
export const CUILIB_VERSION = '1.0.3';

/**
 * Constant flag indicating a horizontal orientation for components like progress bars.
 */
export const CUILIB_ORIENT_HORIZONTAL = 1;

/**
 * Constant flag indicating a vertical orientation for components like progress bars.
 */
export const CUILIB_ORIENT_VERTICAL = 2;

/**
 * Defines a type for representing a rectangular area with position and dimensions.
 */
export type CUILibRect = {
  left: number;   // The x-coordinate of the left edge of the rectangle.
  top: number;    // The y-coordinate of the top edge of the rectangle.
  width: number;  // The width of the rectangle.
  height: number; // The height of the rectangle.
};

/**
 * Creates and returns a CUILibRect object with the specified dimensions.
 * This utility function provides a convenient way to construct rectangle definitions.
 *
 * @param left The x-coordinate for the left edge.
 * @param top The y-coordinate for the top edge.
 * @param width The width of the rectangle.
 * @param height The height of the rectangle.
 * @returns A CUILibRect object.
 */
export function CUILibSetRect(left: number, top: number, width: number, height: number) : CUILibRect {
  // Use shorthand property names to create the object from the parameters.
  const rect : CUILibRect = { left, top, width, height };
  return rect;
}

/**
 * Creates and returns a UINode representing an Image positioned absolutely within a View.
 * This function streamlines the process of placing images at specific coordinates.
 *
 * @param rect A CUILibRect object defining the position (left, top) and dimensions (width, height) of the image.
 * @param image The ImageSource specifying the image to display.
 * @returns A UINode containing the absolutely positioned image.
 */
export function CUILibImage(rect: CUILibRect, image: ui.ImageSource): ui.UINode {
  return ui.View({
    children:
      // Create the Image component itself.
      ui.Image({
        source: image, // Assigns the image source.
        style: {
          height: rect.height, // Sets the height of the image.
          width: rect.width,   // Sets the width of the image.
        }
    }),
    style: {
      position: 'absolute', // Positions the image container absolutely.
      left: rect.left,      // Sets the left offset of the image container.
      top: rect.top,        // Sets the top offset of the image container.
    },
  });
}

/**
 * Creates and returns a UINode representing an Image whose dimensions are controlled by a Binding.
 * This function is particularly useful for progress bars or indicators where an image needs to grow or shrink
 * based on a numerical progress value.
 *
 * @param orient A flag (CUILIB_ORIENT_HORIZONTAL or CUILIB_ORIENT_VERTICAL) indicating which dimension(s) should be controlled by the progress binding.
 *               Can be combined using bitwise OR (e.g., CUILIB_ORIENT_HORIZONTAL | CUILIB_ORIENT_VERTICAL) for both dimensions.
 * @param rect A CUILibRect object defining the initial position (left, top) and the maximum dimensions (width, height) of the image.
 * @param image The ImageSource specifying the image to display.
 * @param progressBinding A Binding<number> whose value (expected to be 0-100 for percentage) controls the image's dimensions.
 * @returns A UINode containing the absolutely positioned and dynamically sized image.
 */
export function CUILibImageBinding(orient: number, rect: CUILibRect, image: ui.ImageSource, progressBinding: ui.Binding<number>): ui.UINode {
  return ui.View({
    children:
      // Create the Image component itself.
      ui.Image({
        source: image, // Assigns the image source.
        style: {
          // Conditionally sets the height based on the 'orient' flag and 'progressBinding'.
          // If CUILIB_ORIENT_VERTICAL is set in 'orient', the height is derived from 'progressBinding'
          // as a percentage of the initial 'rect.height'. Otherwise, it uses the fixed 'rect.height'.
          height: ((orient & CUILIB_ORIENT_VERTICAL)   === CUILIB_ORIENT_VERTICAL)   ? progressBinding.derive((progress) => progress * rect.height / 100) : rect.height,
          // Conditionally sets the width based on the 'orient' flag and 'progressBinding'.
          // If CUILIB_ORIENT_HORIZONTAL is set in 'orient', the width is derived from 'progressBinding'
          // as a percentage of the initial 'rect.width'. Otherwise, it uses the fixed 'rect.width'.
          width:  ((orient & CUILIB_ORIENT_HORIZONTAL) === CUILIB_ORIENT_HORIZONTAL) ? progressBinding.derive((progress) => progress * rect.width / 100)  : rect.width,
	    }
    }),
    style: {
      position: 'absolute', // Positions the image container absolutely.
      left: rect.left,      // Sets the left offset of the image container.
      top: rect.top,        // Sets the top offset of the image container.
    },
  });
}


/////////////////////////////
// Progress Bar with texture

/**
 * Defines the structure for configuring a textured progress bar.
 */
export type CUILibProgressBarProp = {
  orient: number;       // orientation of the progress bar (e.g., CUILIB_ORIENT_HORIZONTAL or CUILIB_ORIENT_VERTICAL).
  left: number;         // left position offset for the entire progress bar component (relative to its parent).
  top: number;          // top position offset for the entire progress bar component (relative to its parent).
  bgRect: CUILibRect;   // Defines the rectangle (position relative to 'left'/'top', and dimensions) for the progress bar background image.
  barRect: CUILibRect;  // Defines the rectangle (position relative to 'left'/'top', and dimensions) for the progress bar fill image.
  progressBinding: ui.Binding<number>;  // A Binding<number> that holds the current progress value (expected 0-100).
};

/**
 * Helper function to create and populate a CUILibProgressBarProp object.
 *
 * @param orient The orientation flag (e.g., CUILIB_ORIENT_HORIZONTAL).
 * @param left The left position offset for the entire component.
 * @param top The top position offset for the entire component.
 * @param bgRect The rectangle definition for the background image.
 * @param barRect The rectangle definition for the progress bar fill image.
 * @param progressBinding The Binding tracking the progress value (0-100).
 * @returns A CUILibProgressBarProp object.
 */
export function CUILibSetProgressBarProp(orient: number, left: number, top: number, bgRect: CUILibRect, barRect: CUILibRect, progressBinding: ui.Binding<number>) : CUILibProgressBarProp {
  // Use shorthand property names to create the object from the parameters.
  const progressBarProp: CUILibProgressBarProp = { orient, left, top, bgRect, barRect, progressBinding };
  return progressBarProp;
}

/**
 * Renders a textured progress bar UI component.
 * It uses two images: one for the static background track and one for the progress fill,
 * which animates based on a progress binding.
 *
 * @param props The CUILibProgressBarProp object configuring the progress bar's layout and behavior.
 * @param barBG The ImageSource for the static background track of the progress bar.
 * @param bar The ImageSource for the progress fill part of the bar, whose size will change.
 * @returns A UINode representing the complete textured progress bar.
 */
export function CUILibProgressBar(props: CUILibProgressBarProp, barBG: ui.ImageSource, bar: ui.ImageSource ): ui.UINode {
  // Create a new copy of the background rectangle.
  // It's important to create a copy to avoid modifying the original 'props.bgRect' object.
  var bgRect: CUILibRect = Object.assign({}, props.bgRect);
  // Adjust the background rectangle's position by adding the component's overall 'left' offset.
  bgRect.left += props.left;
  // Adjust the background rectangle's position by adding the component's overall 'top' offset.
  bgRect.top += props.top;

  // Create a new copy of the progress bar fill rectangle.
  // This is also a copy to avoid modifying the original 'props.barRect' object.
  var barRect: CUILibRect = Object.assign({}, props.barRect);
  // Adjust the progress bar fill rectangle's position.
  // Its 'left' position is relative to the background's calculated 'left'.
  barRect.left += bgRect.left;
  // Its 'top' position is relative to the background's calculated 'top'.
  barRect.top += bgRect.top;

  // Return the main View container for the progress bar.
  return ui.View({
    children: [
	  // Render the progress bar background image using the adjusted background rectangle.
	  CUILibImage(bgRect, barBG),
	  // Render the progress bar fill image. Its dimensions will be dynamically
	  // controlled by 'props.progressBinding' based on the 'orient' flag.
	  CUILibImageBinding(props.orient, barRect, bar, props.progressBinding),
	],
    style: {
      position: 'absolute',  // Positions the entire progress bar component absolutely within its parent.
    },
  });
}
/////////////////////////////

import {
  defaultcuiThemeStyle,
} from 'cuiFlexPanel'

export function CUILibText(props: {
  text: string | ui.Binding<string>,      // The text content for the text label.
  textStyle?: ui.TextStyle, // The style object to be applied to the text.
}) : ui.UINode {
  return ui.Text({
    text: props.text,    // Sets the text content.
    style: {
	  // if style is not specified, use the default text style
      ...(props.textStyle ? props.textStyle : defaultcuiThemeStyle.textStyle),
// for debugging
//borderColor:'white',
//borderWidth: 1,
    }
  })
}

/**
 * Creates a simple Text UINode for use as a label.
 * This helper function allows consistent styling and encapsulation of label creation.
 *
 * @param props An object containing the configuration for the text label.
 * @param props.label The string content of the text label.
 * @param props.textStyle A TextStyle object to apply to the label text.
 * @returns A UINode representing the styled text label.
 */
 // !!!DEPRECATED!!!  --> Use CUILibText
export function CUILibTextLabel(props: {
  label: string | ui.Binding<string>,      // The text content for the label.
  textStyle: ui.TextStyle, // The style object to be applied to the text.
}) : ui.UINode {
  return ui.Text({
    text: props.label,    // Sets the text content.
    style: {
      ...props.textStyle, // Spreads all properties from the provided textStyle object onto the Text component's style.
    }
  })
}

export function CUILibViewContainer(props: {
  children: ui.UINode[],
  style: ui.ViewStyle,
}) : ui.UINode {
  return ui.View({
	children: props.children,
	style: {
	  ...props.style,
// for debugging
//borderColor:'white',
//borderWidth: 1,
	}
  })
}
