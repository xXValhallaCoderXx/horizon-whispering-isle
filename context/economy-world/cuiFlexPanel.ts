import * as ui from 'horizon/ui';   // Imports Horizon UI functionalities, including base UI components and styles.

/**
 * Defines a default set of text styles for general use within the CUILib.
 */
export interface cuiThemeStyle {
  textStyle: ui.TextStyle;
  textItemStyle: ui.TextStyle;
  textHeaderStyle: ui.TextStyle;
  panelBGStyle: ui.ViewStyle;
  panelStyle: ui.ViewStyle;
  panelTextBoxStyle: ui.ViewStyle;
  panelHeaderStyle: ui.ViewStyle;
  panelHeaderTextStyle: ui.TextStyle;
  panelBorderRadius: number,
};
export const defaultcuiBaseTextStyle: ui.TextStyle = {
  textShadowColor: 'black',  // Color of the text shadow.
  textShadowOffset: [1, -1], // Offset of the text shadow (horizontal, vertical).
  textShadowRadius: 8,       // Blur radius of the text shadow.
  color: '#ffffff',          // Default text color (white).
  fontSize: 24,              // Base font size for text.
  fontFamily: 'Roboto',      // Default font family.
};
export const  defaultBasePanelBGStyle: ui.ViewStyle = {
  backgroundColor: '#2c4a6c', // rgb( 44,  74, 108) - Mid DarkBlue // Sets the background color of the outer container.
  padding: 16,                // Adds padding inside the container.
  borderRadius: 32,           // Applies a border radius for rounded corners.
//  flexGrow: 1,                // Allows the container to grow and fill available space.
};
export const  defaultBasePanelStyle: ui.ViewStyle = {
  backgroundColor: '#44aece',	// rgb( 68, 174, 206) - AquaBlue
  borderColor: '#1b2c3b',       // rgb( 27,  44,  59)
  borderWidth: 5,               // Border width for the panel.
  padding: 16,                  // Padding inside the panel.
};
export const  defaultBasePanelTextBoxStyle: ui.ViewStyle = {
  backgroundColor: '#284567',	// rgb( 40,  69, 103)
  borderColor: '#142843',	    // rgb( 20,  40,  67)
  borderWidth: 5,               // Border width for the panel.
  padding: 16,                  // Padding inside the text box.
  //flexGrow: 1,                  // Allows the text box to grow and fill available space.
};
export const  defaultBasePanelHeaderStyle: ui.ViewStyle = {
  backgroundColor: '#142843',	// rgb( 20,  40,  67) - DarkBlue
  borderColor: '#03070c',       // rgb(  3,   7,  12)
  borderWidth: 5,
  borderRadius: 24,
};
export const defaultBasePanelHeaderTextStyle: ui.TextStyle = {
  color: '#ffffff',          // Default text color (white).
  fontFamily: 'Bangers',     // Default font family.
  textAlign: 'center',       // Centers the text horizontally within its bounds.
};
export const defaultcuiThemeStyle: cuiThemeStyle = {
  /**
  * Defines a default set of text styles
  */
  textStyle: defaultcuiBaseTextStyle,

  /**
  * Defines a default set of text styles for individual items, often within lists or groups,
  * that includes horizontal padding.
  */
  textItemStyle: {
	...defaultcuiBaseTextStyle,
    paddingHorizontal: 16,   // Horizontal padding for text items.
  },
  
  /**
  * Defines a default set of text styles for headers, including a larger font size
  * and bottom margin for spacing.
  */
  textHeaderStyle: {
	...defaultcuiBaseTextStyle,
    fontSize: 28,            // Larger font size suitable for headers.
    marginBottom: 16,        // Bottom margin for spacing below the header.
  },
  
  panelBGStyle: defaultBasePanelBGStyle,
  panelStyle: defaultBasePanelStyle,
  panelTextBoxStyle: defaultBasePanelTextBoxStyle,
  panelHeaderStyle: defaultBasePanelHeaderStyle,
  panelHeaderTextStyle: defaultBasePanelHeaderTextStyle,
  panelBorderRadius: 32,
};

/**
 * Defines the properties (props) that can be passed to the cuiFlexPanelHeader component.
 * All properties are optional unless explicitly marked as required (no '?').
 */
interface cuiFlexPanelHeaderProps {
  /**
   * The main title text to be displayed in the header panel.
   * This property is required.
   */
  title: string;

  /**
   * The overall width of the header panel in pixels.
   * Defaults to 400 if not provided.
   */
  panelWidth?: number;

  /**
   * The overall height of the header panel in pixels.
   * Defaults to 128 if not provided.
   */
  panelHeight?: number;

  /**
   * The height of the header section within the panel.
   * Defaults to 80 if not provided.
   */
  headerHeight?: number;

  /**
   * The horizontal offset (from the left edge) of the header section.
   * Defaults to 0 if not provided.
   */
  headerLeft?: number;

  /**
   * The vertical offset (from the top edge) of the header section.
   * Defaults to 8 if not provided.
   */
  headerTop?: number;

  /**
   * The horizontal offset (from the left edge) of the title text within the header.
   * Defaults to 0 if not provided.
   */
  textLeft?: number;

  /**
   * The vertical offset (from the top edge) of the title text within the header.
   * Defaults to 0 if not provided.
   */
  textTop?: number;

  /**
   * The font size of the title text in pixels.
   * Defaults to 60 if not provided.
   */
  textSize?: number;

  /**
   * The spacing value (e.g., between elements or padding) within the header.
   * Defaults to 8 if not provided.
   */
  spacing?: number;

  /**
   * The theme style used for the header panel text.
   * Defaults to 'defaultcuiThemeStyle' if not provided.
   */
  themeStyle?: cuiThemeStyle;
}

/**
 * Defines a constant object containing the default values for cuiFlexPanelHeaderProps.
 * This object is used to provide fallback values for properties that are not explicitly
 * passed when creating a cuiFlexPanelHeader.
 */
const defaultcuiFlexPanelHeaderProps: cuiFlexPanelHeaderProps = {
  title: "",            // Default empty string for the required title property
  panelWidth: 400,
  panelHeight: 128,
  headerHeight: 80,
  headerLeft: 0,
  headerTop: 8,
  textLeft: 0,
  textTop: 0,
  textSize: 60,
  spacing: 8,
  themeStyle: defaultcuiThemeStyle
};

/**
 * Renders a header panel UI component based on the provided properties.
 * It merges the input properties with a set of default properties to ensure
 * all styling and layout options are defined.
 *
 * @param inputprops The properties object containing configuration for the header panel.
 *                   These properties will override the default values if provided.
 * @returns A UINode representing the fully styled and laid-out header panel.
 */
export function cuiFlexPanelHeader(inputprops: cuiFlexPanelHeaderProps): ui.UINode {
  // Merge the provided input properties with the default properties.
  // Properties defined in 'inputprops' will take precedence over those in 'defaultCUILibHeaderPanelProps'.
  const props = { ...defaultcuiFlexPanelHeaderProps, ...inputprops };
  
  // Return the main container View for the header panel.
  return ui.View({
    style: {
      width: props.panelWidth,   // Sets the overall width of the panel.
      height: props.panelHeight, // Sets the overall height of the panel.
      position: 'relative',      // Essential for positioning child elements absolutely within this container.
    },
    children: [
      // This View acts as a container for the header's background and text.
      ui.View({
        style: {
          position: 'absolute',       // Positioned relative to its parent (the main container View).
          width: props.panelWidth,    // Matches the width of the main panel.
          height: props.headerHeight, // Sets the specific height of the header section.
          top: props.headerTop,       // Vertical offset for the header section.
          left: props.headerLeft,     // Horizontal offset for the header section.
        },
        children: [
          // This View creates the styled background shape (rounded rectangle with border) for the header.
          ui.View({
            children: [], // No direct children, as it's primarily for styling.
            style: {
			  ...props.themeStyle?.panelHeaderStyle,
              position: 'absolute',    // Positioned relative to its parent (the header container View).
              width: props.panelWidth, // Matches the header container width.
              height: props.headerHeight, // Matches the header container height.
            },
          }),
          // This is the Text element that displays the panel's title.
          ui.Text({
            text: props.title, // The title text from the merged properties.
            style: {
  			  ...props.themeStyle?.panelHeaderTextStyle,
              top: props.textTop,        // Vertical offset for the text within the header.
              left: props.textLeft,      // Horizontal offset for the text within the header.
              fontSize: props.textSize,    // Sets the font size of the title.
              letterSpacing: props.spacing, // Sets the spacing between letters.
            },
          }),
        ],
      }),
    ],
  });
}

// Defines the structure for configuring custom panels.
// This interface allows for building a hierarchical layout of panels.
export interface cuiCustomFlexPanelConfig {
  /**
   * Specifies the layout direction for the panel's children.
   * 'row' arranges children horizontally.
   * 'column' arranges children vertically.
   */
  type: 'row' | 'column';

  /**
   * Optional index to reference a specific UINode from the 'childPanels' array.
   * This is used when the current panel configuration represents a single UI component
   * rather than a container for other configurations.
   */
  nodeIdx?: number;

  /**
   * Optional array of nested panel configurations.
   * This allows for building complex layouts by nesting 'row' and 'column' panels.
   */
  children?: cuiCustomFlexPanelConfig[];
}

/**
 * Recursively sets up and renders custom panels based on the provided configuration.
 * This function processes the hierarchical 'config' and maps 'nodeIdx' to actual UINodes
 * from the 'childPanels' array.
 *
 * @param config The configuration object defining the structure and layout of the current panel.
 * @param childPanels An array of UINode components that can be referenced by 'nodeIdx'.
 * @returns A UINode representing the structured panel, either a row, column, or a specific child panel.
 * @throws Error if the configuration is invalid (e.g., unknown content or grid type).
 */
export function cuiSetupCustomFlexPanel(config: cuiCustomFlexPanelConfig, childPanels : ui.UINode[], debug = false) : ui.UINode {
  // Recursively process any child configurations.
  // If 'config.children' is undefined or null, it defaults to an empty array to prevent errors.
  const childrenNodes = (config.children || []).map((child, index) =>
    // For each child configuration, call cuiSetupCustomFlexPanel again to build its structure.
    cuiSetupCustomFlexPanel(child, childPanels)
  );

  let contentToRender: ui.UINode | ui.UINode[];

  // Determine what content should be rendered for the current panel.
  if (childrenNodes.length > 0) {
    // If there are child panel configurations, render them as children.
    contentToRender = childrenNodes;
  } else if (config.nodeIdx != undefined && config.nodeIdx >= 0 && config.nodeIdx < childPanels.length) {
    // If no child configurations but a valid 'nodeIdx' is provided,
    // fetch the corresponding UINode from the 'childPanels' array.
    contentToRender = childPanels[config.nodeIdx]
  } else {
    // If neither child configurations nor a valid 'nodeIdx' is found, it's an error.
    throw new Error(`Unknown content! idx: ${config.nodeIdx} type: ${config.type}`);
  }

  // Create a View (container) based on the specified layout type ('row' or 'column').
  if (config.type === 'row') {
    return ui.View({
      style: {
        flexDirection: 'row', // Arranges children horizontally
        ...(debug ? { // <-- The conditional spread operator
          // for debugging
          borderColor: 'white',
          borderWidth: 1,
        } : {}),
      },
      children: contentToRender, // Assigns the determined content (either single node or array of nodes)
    });
  } else if (config.type === 'column') {
    return ui.View({
      style: {
        flexDirection: 'column', // Arranges children vertically
        ...(debug ? { // <-- The conditional spread operator
          // for debugging
          borderColor: 'white',
          borderWidth: 1,
        } : {}),
      },
      children: contentToRender,
    });
  } else {
    // If the 'type' is neither 'row' nor 'column', it's an invalid configuration.
    throw new Error(`Unknown grid type: ${config.type}`);
  }
}

/**
 * Creates the outer container for a custom panel, providing a consistent style.
 * This function wraps the content generated by CUILibSetupCustomPanel within a styled View.
 *
 * @param config The configuration object defining the structure and layout of the panel content.
 * @param childPanels An array of UINode components that can be referenced by 'nodeIdx'.
 * @returns A UINode representing the styled outer panel containing the custom layout.
 */
export function cuiCustomFlexPanel(config: cuiCustomFlexPanelConfig, childPanels : ui.UINode[], themeStyle: cuiThemeStyle, debug = false) : ui.UINode {
  return ui.View({
    style: {
      ...themeStyle.panelBGStyle,
      flexGrow: 1,
      ...(debug ? { // <-- The conditional spread operator
	// for debugging
        borderColor: 'white',
        borderWidth: 1,
      } : {}),
    },
    children: [
      // The single child of this outer container is the entire custom layout
      // generated by the recursive cuiSetupCustomFlexPanel function.
      cuiSetupCustomFlexPanel(config, childPanels, debug)
    ],
  });	
}

export function cuiGetCustomPanelStyle( props: {
  style: ui.ViewStyle,
  radius: number,
  topLeft?: boolean,
  topRight?: boolean,
  bottomLeft?: boolean,
  bottomRight?: boolean
}): ui.ViewStyle {
  let panelStyle: ui.ViewStyle = {
    ...props.style,
    // Reset all corners to 0 by default to ensure only specified corners are rounded
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  };

  if (props.topLeft) {
    panelStyle.borderTopLeftRadius = props.radius;
  }
  if (props.topRight) {
    panelStyle.borderTopRightRadius = props.radius;
  }
  if (props.bottomLeft) {
    panelStyle.borderBottomLeftRadius = props.radius;
  }
  if (props.bottomRight) {
    panelStyle.borderBottomRightRadius = props.radius;
  }

  return panelStyle;
}

// DEPRECATED!!! use cuiGetCustomPanelStyle
export function cuiGetPanelStyle( props: {
  themeStyle: cuiThemeStyle,
  topLeft?: boolean,
  topRight?: boolean,
  bottomLeft?: boolean,
  bottomRight?: boolean
}): ui.ViewStyle {
  return cuiGetCustomPanelStyle({ 
		style: props.themeStyle.panelStyle, radius: props.themeStyle.panelBorderRadius, 
		topLeft: props.topLeft, topRight: props.topRight, bottomLeft: props.bottomLeft, bottomRight: props.bottomRight })
}

// DEPRECATED!!! use cuiGetCustomPanelStyle
export function cuiGetPanelTextBoxStyle( props: {
  themeStyle: cuiThemeStyle,
  topLeft?: boolean,
  topRight?: boolean,
  bottomLeft?: boolean,
  bottomRight?: boolean
}): ui.TextStyle {
  return cuiGetCustomPanelStyle({ 
		style: props.themeStyle.panelTextBoxStyle, radius: props.themeStyle.panelBorderRadius, 
		topLeft: props.topLeft, topRight: props.topRight, bottomLeft: props.bottomLeft, bottomRight: props.bottomRight })
}
