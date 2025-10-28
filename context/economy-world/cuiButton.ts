import * as hz from 'horizon/core';	// Imports core functionalities from the Horizon engine.
import * as ui from 'horizon/ui';   // Imports Horizon UI functionalities, including base UI components and styles.

import {
	CUILibRect,
	CUILibImage,
} from 'CUILib';

/////////////////////////////
// Button with texture

/**
 * Defines the structure for holding different image sources corresponding to the
 * various states a button can be in (regular, disabled, hovered, pressed).
 */
export type cuiButtonImageSource = {
  buttonImage: ui.ImageSource;          // The image to display when the button is in its normal (uninteracted) state.
  buttonDisabledImage: ui.ImageSource;  // The image to display when the button is disabled and cannot be interacted with.
  buttonHoveredImage: ui.ImageSource;   // The image to display when the user's pointer is hovering over the button.
  buttonPressedImage: ui.ImageSource;   // The image to display when the button is actively being pressed (clicked).
};

/**
 * Creates and returns a cuiButtonImageSource object by loading images from provided Asset references.
 * This helper function facilitates the conversion of core Asset objects into renderable ImageSource objects.
 *
 * @param buttonAsset The Asset for the regular (default) button image.
 * @param buttonDisabledAsset The Asset for the disabled button image.
 * @param buttonHoveredAsset The Asset for the hovered button image.
 * @param buttonPressedAsset The Asset for the pressed button image.
 * @returns A cuiButtonImageSource object containing ImageSource references for each button state.
 */
export function cuiButtonSetImageSource(
  buttonAsset: hz.Asset,              // The Asset object for the default button image.
  buttonDisabledAsset: hz.Asset,      // The Asset object for the disabled button image.
  buttonHoveredAsset: hz.Asset,       // The Asset object for the hovered button image.
  buttonPressedAsset: hz.Asset        // The Asset object for the pressed button image.
) : cuiButtonImageSource {
  // Convert each Asset into an ImageSource using ImageSource.fromTextureAsset.
  const buttonImage: ui.ImageSource = ui.ImageSource.fromTextureAsset(buttonAsset);
  const buttonDisabledImage: ui.ImageSource = ui.ImageSource.fromTextureAsset(buttonDisabledAsset);
  const buttonHoveredImage: ui.ImageSource = ui.ImageSource.fromTextureAsset(buttonHoveredAsset);
  const buttonPressedImage: ui.ImageSource = ui.ImageSource.fromTextureAsset(buttonPressedAsset);

  // Create the CUILibButtonImageSource object using shorthand property names.
  const buttonImageSource: cuiButtonImageSource = { buttonImage, buttonDisabledImage, buttonHoveredImage, buttonPressedImage };
  return buttonImageSource;
}

// return textured button using absolute position style
// rect - button rect
// buttonImageSource - button image source structure
// onClick: [optional] callback after button is released
// onPress: [optional] callback when button is pressed
// onRelease: [optional] callback when button is release
// disabled - [optional] button flag
export function cuiButtonImage( props: {
  rect: CUILibRect, 
  buttonImageSource: cuiButtonImageSource, 
  onClick?: () => void,
  onPress?: (player: hz.Player) => void,
  onRelease?: (player: hz.Player) => void,
  disabled?: boolean, 
}): ui.UINode {
  let hovered = false;
  const buttonSource = new ui.Binding<ui.ImageSource>('');

  if (props.disabled) {
	// If the button is disabled, render the disabled image immediately.
    return CUILibImage(props.rect, props.buttonImageSource.buttonDisabledImage)
  }
  else {
    // Initialize the button's visual state to "normal".
    buttonSource.set(props.buttonImageSource.buttonImage)
    return ui.Pressable({
      onClick: () => {
        // If an onClick handler is provided, invoke it.
        if (props.onClick != undefined) {
          props.onClick();
        }
      },
      onEnter: (player: hz.Player) => {
        // When the pointer enters the button area, switch to the hovered image.
        buttonSource.set(props.buttonImageSource.buttonHoveredImage)
        hovered = true; // Track the hovered state.
      },
      onExit: (player: hz.Player) => {
        // When the pointer exits the button area, revert to the normal image.
        buttonSource.set(props.buttonImageSource.buttonImage)
        hovered = false; // Reset hovered state.
      },
      onPress: (player: hz.Player) => {
        // When the button is pressed, display the pressed image.
        buttonSource.set(props.buttonImageSource.buttonPressedImage)
        // If an onPress handler is provided, invoke it with the player.
        if (props.onPress != undefined) {
          props.onPress(player);
        }
      },
      onRelease: (player: hz.Player) => {
        // When the button is released, display either the hovered or normal image
        // based on the current hovered state.
        buttonSource.set(hovered ? props.buttonImageSource.buttonHoveredImage : props.buttonImageSource.buttonImage);
        // If an onRelease handler is provided, invoke it with the player.
        if (props.onRelease != undefined) {
          props.onRelease(player);
        }
      },
      children: 
        // Render the image component within the Pressable area.
        ui.Image({
          source: buttonSource, // The image source (normal, hovered, pressed) is dynamically controlled by the 'buttonSource' binding.
          style: {
            height: props.rect.height, // Set the image height from the provided rectangle dimensions.
            width: props.rect.width,   // Set the image width from the provided rectangle dimensions.
	      }
      }),
      style: {
        position: 'absolute', // Position the button absolutely within its parent container.
        left: props.rect.left,     // Set the left offset of the button based on the provided rectangle.
        top: props.rect.top,       // Set the top offset of the button based on the provided rectangle.
      },
    });
  }
}


/////////////////////////////
// Currently supported default button colors
// Defines the allowed string literals for predefined button color schemes.
export type cuiButtonColors = 'pink' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'cyan' | 'purple' | 'gray' | 'custom';

// Defines the structure for a color type, including start, end, and border colors.
// This structure is typically used for gradients (startColor, endColor) and borders.
export type cuiColorType = {
  startColor: string; // The starting color for a gradient or a solid color.
  endColor: string;   // The ending color for a gradient.
  borderColor: string; // The color of the button's border.
};

// Defines the complete color scheme for a button across its different states.
export type cuiButtonColorType = {
  regular: cuiColorType; // Color definition for the default (uninteracted) state.
  pressed: cuiColorType; // Color definition for when the button is actively being pressed.
  hovered: cuiColorType; // Color definition for when the pointer is hovering over the button.
};

// A constant object mapping each predefined color name to its detailed color scheme.
export const cuiColors: {[key in cuiButtonColors]: cuiButtonColorType} = {
  pink: {
    regular: {
      startColor: '#f734c4',//'rgb(247,52,196)', // Hex color for the gradient start (normal state).
      endColor: '#930884', //'rgb(147,8,132)', // Hex color for the gradient end (normal state).
      borderColor: '#000000', // Hex color for the border (normal state).
    },
    pressed: {
      startColor: '#fe70d8', //'rgb(254, 112, 216)', // Hex color for the gradient start (pressed state).
      endColor: '#f734c4', //'rgb(247, 52, 196)', // Hex color for the gradient end (pressed state).
      borderColor: '#ffffff', // Hex color for the border (pressed state).
    },
    hovered: {
      startColor: '#f734c4',//'rgb(247,52,196)', // Hex color for the gradient start (hovered state).
      endColor: '#930884', //'rgb(147,8,132)', // Hex color for the gradient end (hovered state).
      borderColor: '#ffffff', // Hex color for the border (hovered state).
    },
  },
  red: {
    regular: {
      startColor: '#e85c4a', //'rgb(232, 92, 74)',
      endColor: '#b60606', //'rgb(182, 6, 6)',
      borderColor: '#000000',
    },
    pressed: {
      startColor: '#fe7c6c', //'rgb(254, 124, 108)',
      endColor: '#fb1f1f', //'rgb(251, 31, 31)',
      borderColor: '#ffffff',
    },
    hovered: {
      startColor: '#e85c4a', //'rgb(232, 92, 74)',
      endColor: '#b60606', //'rgb(182, 6, 6)',
      borderColor: '#ffffff',
    },
  },
  orange: {
    regular: {
      startColor: '#f1a116', //'rgb(241, 161, 22)',
      endColor: '#ea6d0c', //'rgb(234, 109, 12)',
      borderColor: '#000000',
    },
    pressed: {
      startColor: '#ffc661', //'rgb(255, 198, 97)',
      endColor: '#ed9500', //'rgb(237, 149, 0)',
      borderColor: '#ffffff',
    },
    hovered: {
      startColor: '#f1a116', //'rgb(241, 161, 22)',
      endColor: '#ea6d0c', //'rgb(234, 109, 12)',
      borderColor: '#ffffff',
    },
  },
  yellow: {
    regular: {
      startColor: '#feee36', //'rgb(254, 238, 54)', // Yellow gradient start (normal state).
      endColor: '#ebc012', //'rgb(235, 192, 18)',   // Yellow gradient end (normal state).
      borderColor: '#000000',                  // Black border (normal state).
    },
    pressed: {
      startColor: '#fef3b1', //'rgb(254, 243, 177)', // Lighter yellow gradient start (pressed state).
      endColor: '#fce023', //'rgb(252, 224, 35)',   // Brighter yellow gradient end (pressed state).
      borderColor: '#ffffff',                  // White border (pressed state).
    },
    hovered: {
      startColor: '#feee36', //'rgb(254, 238, 54)', // Yellow gradient start (hovered state - same as regular).
      endColor: '#ebc012', //'rgb(235, 192, 18)',   // Yellow gradient end (hovered state - same as regular).
      borderColor: '#ffffff',                  // White border (hovered state).
    },
  },
  green: {
    regular: {
      startColor: '#44d956', //'rgb(68, 217, 86)', // Green gradient start (normal state).
      endColor: '#068908', //'rgb(6, 137, 8)',   // Green gradient end (normal state).
      borderColor: '#000000',                 // Black border (normal state).
    },
    pressed: {
      startColor: '#99faa3', //'rgb(153, 250, 163)', // Lighter green gradient start (pressed state).
      endColor: '#31de1e', //'rgb(49, 222, 30)',   // Brighter green gradient end (pressed state).
      borderColor: '#ffffff',                 // White border (pressed state).
    },
    hovered: {
      startColor: '#44d956', //'rgb(68, 217, 86)', // Green gradient start (hovered state - same as regular).
      endColor: '#068908', //'rgb(6, 137, 8)',   // Green gradient end (hovered state - same as regular).
      borderColor: '#ffffff',                 // White border (hovered state).
    },
  },
  blue: {
    regular: {
      startColor: '#3778ea', //'rgb(55, 120, 234)', // Blue gradient start (normal state).
      endColor: '#1537b7', //'rgb(21, 55, 183)',   // Blue gradient end (normal state).
      borderColor: '#000000',                 // Black border (normal state).
    },
    pressed: {
      startColor: '#699eff', //'rgb(105, 158, 255)', // Lighter blue gradient start (pressed state).
      endColor: '#2071ff', //'rgb(32, 113, 255)',   // Brighter blue gradient end (pressed state).
      borderColor: '#ffffff',                 // White border (pressed state).
    },
    hovered: {
      startColor: '#3778ea', //'rgb(55, 120, 234)', // Blue gradient start (hovered state - same as regular).
      endColor: '#1537b7', //'rgb(21, 55, 183)',   // Blue gradient end (hovered state - same as regular).
      borderColor: '#ffffff',                 // White border (hovered state).
    },
  },
  cyan: {
    regular: {
      startColor: '#07bdef', //'rgb(7, 189, 239)', // Cyan gradient start (normal state).
      endColor: '#0181b0', //'rgb(1, 129, 176)',   // Cyan gradient end (normal state).
      borderColor: '#000000',                 // Black border (normal state).
    },
    pressed: {
      startColor: '#75e8ff', //'rgb(117, 232, 255)', // Lighter cyan gradient start (pressed state).
      endColor: '#0ec7f0', //'rgb(14, 199, 240)',   // Brighter cyan gradient end (pressed state).
      borderColor: '#ffffff',                 // White border (pressed state).
    },
    hovered: {
      startColor: '#07bdef', //'rgb(7, 189, 239)', // Cyan gradient start (hovered state - same as regular).
      endColor: '#0181b0', //'rgb(1, 129, 176)',   // Cyan gradient end (hovered state - same as regular).
      borderColor: '#ffffff',                 // White border (hovered state).
    },
  },
  purple: {
    regular: {
      startColor: '#8417e8', //'rgb(132, 23, 232)', // Purple gradient start (normal state).
      endColor: '#490686', //'rgb(73, 6, 134)',   // Purple gradient end (normal state).
      borderColor: '#000000',                 // Black border (normal state).
    },
    pressed: {
      startColor: '#b260fe', //'rgb(178, 96, 254)', // Lighter purple gradient start (pressed state).
      endColor: '#8518e9', //'rgb(133, 24, 233)',   // Brighter purple gradient end (pressed state).
      borderColor: '#ffffff',                 // White border (pressed state).
    },
    hovered: {
      startColor: '#8417e8', //'rgb(132, 23, 232)', // Purple gradient start (hovered state - same as regular).
      endColor: '#490686', //'rgb(73, 6, 134)',   // Purple gradient end (hovered state - same as regular).
      borderColor: '#ffffff',                 // White border (hovered state).
    },
  },
  gray: {
    regular: {
      startColor: '#777198', //'rgb(119, 113, 152)', // Gray gradient start (normal state).
      endColor: '#423f55', //'rgb(66, 63, 85)',   // Gray gradient end (normal state).
      borderColor: '#000000',                 // Black border (normal state).
    },
    pressed: {
      startColor: '#aea5d1', //'rgb(174, 165, 209)', // Lighter gray gradient start (pressed state).
      endColor: '#777199', //'rgb(119, 113, 153)',   // Brighter gray gradient end (pressed state).
      borderColor: '#ffffff',                 // White border (pressed state).
    },
    hovered: {
      startColor: '#777198', //'rgb(119, 113, 152)', // Gray gradient start (hovered state - same as regular).
      endColor: '#423f55', //'rgb(66, 63, 85)',   // Gray gradient end (hovered state - same as regular).
      borderColor: '#ffffff',                 // White border (hovered state).
    },
  },
  custom: {
    regular: {
      startColor: '#000000', // Default black start color for custom buttons.
      endColor: '#000000',   // Default black end color for custom buttons.
      borderColor: '#000000', // Default black border color for custom buttons.
    },
    pressed: {
      startColor: '#000000', // Default black start color (pressed state).
      endColor: '#000000',   // Default black end color (pressed state).
      borderColor: '#ffffff', // White border (pressed state).
    },
    hovered: {
      startColor: '#000000', // Default black start color (hovered state).
      endColor: '#000000',   // Default black end color (hovered state).
      borderColor: '#ffffff', // White border (hovered state).
    },
  },
};
/////////////////////////////

// return the button view using the default style and button colors. The styles can be overrided
// label: button text
// color: color using the supported default color. Pass 'custom' to use the customColor params. 
// Note: This can be overrided in style. To change backgrounColor, gradient color must be changed as well 
// onClick: [optional] callback after button is released
// onPress: [optional] callback when button is pressed
// onRelease: [optional] callback when button is release
// disabled: [optional] set to true to disable the button
// style: [optional] override the default style
// textStyle: [optional] override the default text style
// customColorBorder: [optional] custom border Color,
// customColorStart: [optional] custom start Color (backgroundColor will use this)
// customColorEnd: [optional] custom end Color
// customColorDisabled: [optional] custom disabled Color
// customColorTextDisabled: [optional] custom disabled text Color
export function cuiButton( props: {
  label: string | ui.Binding<string>, // The text displayed on the button.
  color: cuiButtonColors, // The predefined color theme for the button (e.g., 'pink', 'red', 'custom').
  onClick?: () => void, // Optional: Callback function for a single click event.
  onPress?: (player: hz.Player) => void, // Optional: Callback function for when the button is initially pressed.
  onRelease?: (player: hz.Player) => void, // Optional: Callback function for when the button is released.
  disabled?: boolean, // Optional: If true, the button is disabled and non-interactive.
  style?: ui.ViewStyle, // Optional: Custom styles to apply to the button container.
  textStyle?: ui.TextStyle, // Optional: Custom styles to apply to the button's text label.
  // Custom color overrides for the 'regular' (default) state
  customColorBorder?: hz.Color, 
  customColorStart?: hz.Color, 
  customColorEnd?: hz.Color, 
  // Custom color overrides for the 'pressed' state
  customColorBorderPressed?: hz.Color, 
  customColorStartPressed?: hz.Color, 
  customColorEndPressed?: hz.Color, 
  // Custom color overrides for the 'hovered' state
  customColorBorderHovered?: hz.Color, 
  customColorStartHovered?: hz.Color, 
  customColorEndHovered?: hz.Color, 
  // Custom colors for the 'disabled' state
  customColorDisabled?: hz.Color,      // Custom background color for the disabled state.
  customColorTextDisabled?: hz.Color,  // Custom text color for the disabled state.
}): ui.UINode {

  // Define the default visual styles for the button's container.
  var defaultButtonStyle: ui.ViewStyle = {
    height: 48,           // Default height of the button.
    borderRadius: 24,     // Default border radius (makes it pill-shaped).
    alignItems: 'center', // Centers children (text) horizontally.
    justifyContent: 'center', // Centers children (text) vertically.
	borderWidth: 2,       // Default border width.
	marginBottom: 16,     // Default margin bottom
  };

  // Define the default visual styles for the button's text label.
  var defaultButtonTextStyle: ui.TextStyle = {
    fontSize: 24,         // Default font size.
    //lineHeight: 30,       // Default line height.
    textAlign: 'center',  // Centers text horizontally within its container.
    //fontWeight: '900',    // Bold font weight.
    paddingTop: 4,        // Small top padding to adjust vertical alignment.
  };
  
  if (props.disabled) {
	// If the button is disabled, render a non-interactive view with custom disabled colors.
	// Determine the disabled background color.
	var disabledColor: hz.Color = hz.Color.fromHex('#606060') // Default disabled background color (dark gray).
    if (props.customColorDisabled != undefined) {
      disabledColor = props.customColorDisabled // Use custom disabled background color if provided.
	}
	// Determine the disabled text color.
	var disabledTextColor: hz.Color = hz.Color.fromHex('#303030') // Default disabled text color (darker gray).
    if (props.customColorTextDisabled != undefined) {
      disabledTextColor = props.customColorTextDisabled // Use custom disabled text color if provided.
	}
    return ui.View({
      children: ui.Text({
        text: props.label,
        style: {
          ...defaultButtonTextStyle, // Apply default text styles.
          ...props.textStyle,        // Merge with any custom text styles provided via props.
		  color: disabledTextColor,  // Override text color with the determined disabled text color.
        },
      }),
      style: {
        ...defaultButtonStyle,       // Apply default button container styles.
        ...props.style,              // Merge with any custom view styles provided via props.
        backgroundColor: disabledColor,  // Override background color with the determined disabled color.
      },
	})
  }
  else {
    // Determine the base colors for the button states from the selected predefined color theme.
	var borderColor: hz.Color = hz.Color.fromHex(cuiColors[props.color].regular.borderColor)
	var startColor: hz.Color = hz.Color.fromHex(cuiColors[props.color].regular.startColor)
	var endColor: hz.Color = hz.Color.fromHex(cuiColors[props.color].regular.endColor)
	
	var borderColorPressed: hz.Color = hz.Color.fromHex(cuiColors[props.color].pressed.borderColor)
	var startColorPressed: hz.Color = hz.Color.fromHex(cuiColors[props.color].pressed.startColor)
	var endColorPressed: hz.Color = hz.Color.fromHex(cuiColors[props.color].pressed.endColor)
	
	var borderColorHovered: hz.Color = hz.Color.fromHex(cuiColors[props.color].hovered.borderColor)
	// Note: The following lines initialize hovered start/end colors from the *regular* state,
    // which matches your cuiColors definition.
	var startColorHovered: hz.Color = hz.Color.fromHex(cuiColors[props.color].regular.startColor)
	var endColorHovered: hz.Color = hz.Color.fromHex(cuiColors[props.color].regular.endColor)

    // Apply custom color overrides if provided, prioritizing them over the theme colors.
	if (props.color === 'custom') { // This block only applies if the 'color' prop is explicitly 'custom'.
      // Override regular state colors if custom colors are provided.
      if (props.customColorBorder != undefined) {
        borderColor = props.customColorBorder
      }
      if (props.customColorStart != undefined) {
        startColor = props.customColorStart
        // Also apply custom start color to pressed and hovered states as a base if not explicitly overridden later.
        startColorPressed = props.customColorStart 
        startColorHovered = props.customColorStart
      }
      if (props.customColorEnd != undefined) {
        endColor = props.customColorEnd
        // Also apply custom end color to pressed and hovered states as a base if not explicitly overridden later.
        endColorPressed = props.customColorEnd
        endColorHovered = props.customColorEnd
      }
      // Override pressed state colors if custom colors are provided.
      if (props.customColorBorderPressed != undefined) {
		borderColorPressed = props.customColorBorderPressed
      }
      if (props.customColorStartPressed != undefined) {
        startColorPressed = props.customColorStartPressed
      }
      if (props.customColorEndPressed != undefined) {
        endColorPressed = props.customColorEndPressed
      }
      // Override hovered state colors if custom colors are provided.
      if (props.customColorBorderHovered != undefined) {
		borderColorHovered = props.customColorBorderHovered
      }
      if (props.customColorStartHovered != undefined) {
        startColorHovered = props.customColorStartHovered
      }
      if (props.customColorEndHovered != undefined) {
        endColorHovered = props.customColorEndHovered // Apply custom hovered end color if provided.
      }
	} // Closing brace for the 'if (props.color === "custom")' block.
    // Initialize UI Binding objects for dynamic style updates.
    // These bindings will hold the current color values (normal, hovered, pressed)
    // and will be updated based on user interaction (onEnter, onExit, onPress, onRelease).
    const border = new ui.Binding<hz.Color>(borderColor); // Binding for the button's border color.
    const background = new ui.Binding<hz.Color>(startColor); // Binding for the button's background/gradient start color.
    const gradientA = new ui.Binding<hz.Color>(startColor); // Binding for the gradient's start color.
    const gradientB = new ui.Binding<hz.Color>(endColor);   // Binding for the gradient's end color.

    // Define the default style for the button's background, border, and gradient.
    var defaultButtonColorStyle: ui.ViewStyle = {
      backgroundColor: background,   // The background color, driven by the 'background' binding.
      borderColor: border,           // The border color, driven by the 'border' binding.
      gradientColorA: gradientA,     // The start color of the gradient, driven by 'gradientA' binding.
      gradientColorB: gradientB,     // The end color of the gradient, driven by 'gradientB' binding.
      gradientAngle: '0deg',         // Default gradient angle (e.g., horizontal).
    };
	  
    // Define the default style for the button's text label, including color and shadow.
    var defaultButtonTextColorStyle: ui.TextStyle = {
      color: '#ffffff',              // Default text color (white).
      textShadowColor: border,       // Text shadow color based on the current border color.
      textShadowOffset: [1, -1],     // Text shadow offset (e.g., creates a slight embossed effect).
      textShadowRadius: 8,           // Text shadow blur radius.
    };

    // State bindings for tracking button interaction.
    const isPressed = new ui.Binding<boolean>(false); // Tracks whether the button is currently pressed.
    var isHovered : boolean = false;               // Tracks whether the mouse pointer is hovering over the button. (Consider 'let' for block scope). 
    return ui.Pressable({
      children: ui.Text({
        text: props.label,
        style: {
          ...defaultButtonTextStyle,       // Apply default text base styles.
		  ...defaultButtonTextColorStyle,  // Apply default text color and shadow styles (overrides default text color).
          ...props.textStyle,              // Apply custom text styles from props, allowing overrides.
        },
      }),
      onClick: () => {
        // If an onClick handler is provided, invoke it when the button is clicked.
        if (props.onClick != undefined) {
          props.onClick();
        }
      },
      onEnter: (player: hz.Player) => {
        // When the pointer enters the button area:
		isHovered = true; // Set hover state. 
		border.set(borderColorHovered); // Update border color binding to the hovered state color.
		background.set(startColorHovered); // Update background color binding to the hovered state start color.
		gradientA.set(startColorHovered); // Update gradient start color binding to the hovered state.
		gradientB.set(endColorHovered);   // Update gradient end color binding to the hovered state.
      },
      onExit: (player: hz.Player) => {
        // When the pointer exits the button area:
		isHovered = false; // Reset hover state.
		border.set(borderColor); // Revert border color binding to the normal state color.
		background.set(startColor); // Revert background color binding to the normal state start color.
		gradientA.set(startColor); // Revert gradient start color binding to the normal state.
		gradientB.set(endColor);   // Revert gradient end color binding to the normal state.
      },
      onPress: (player: hz.Player) => {
        // When the button is pressed down:
	    border.set(borderColorPressed);   // Update border color to the pressed state color.
	    background.set(startColorPressed); // Update background color to the pressed state start color.
	    gradientA.set(startColorPressed);  // Update gradient A color to the pressed state start color.
	    gradientB.set(endColorPressed);    // Update gradient B color to the pressed state end color.
        isPressed.set(true);             // Set the 'isPressed' binding to true.
        if (props.onPress != undefined) {  // If an 'onPress' handler is provided in props:
          props.onPress(player);           // Invoke the provided 'onPress' handler with the player.
        }
      },
      onRelease: (player: hz.Player) => {
        // When the button is released:
	    if (isHovered) { // Check if the pointer is still hovering over the button.
	      border.set(borderColorHovered); // If hovered, revert to the hovered state border color.
	      background.set(startColorHovered); // If hovered, revert to the hovered state start color.
	      gradientA.set(startColorHovered);  // If hovered, revert to the hovered state gradient A color.
	      gradientB.set(endColorHovered);    // If hovered, revert to the hovered state gradient B color.
	    }
	    else { // If not hovered (pointer is outside the button area):
          border.set(borderColor);   // Revert to the normal state border color.
	      background.set(startColor);  // Revert to the normal state start color.
	      gradientA.set(startColor);   // Revert to the normal state gradient A color.
	      gradientB.set(endColor);     // Revert to the normal state gradient B color.
	    }
        isPressed.set(false);            // Set the 'isPressed' binding to false.
        if (props.onRelease != undefined) { // If an 'onRelease' handler is provided in props:
          props.onRelease(player);         // Invoke the provided 'onRelease' handler with the player.
        }
      },
      style: {
        ...defaultButtonStyle,         // Apply the base button container styles.
	    ...defaultButtonColorStyle,    // Apply the dynamic color/gradient styles (using the Bindings).
        ...props.style,                // Apply any custom styles passed in props (can override previous styles).
        transform: [{                  // Apply a transform for the pressed effect.
          // Scale down the button to display the 'pressed' effect when 'isPressed' is true.
	      scale: isPressed.derive((pressed) => pressed ? 0.95 : 1), // Dynamically scale based on 'isPressed' binding.
	    },
	    ],
      },
    });
  }
}
