import { Asset, Player, PlayerVisibilityMode, PropTypes } from 'horizon/core';
import { Binding, FontFamily, Image, ImageSource, Pressable, Text, UIComponent, UINode, View } from 'horizon/ui';
import { TutorialManager } from "./TutorialManager";
import { LocalizableText } from "HorizonI18nUtils";

const COMMON_BORDER_RADIUS = 20;
const COMMON_MARGIN_BOTTOM = 10;
const COLOR_PRIMARY = '#20a1f7ff';
const COLOR_SECONDARY = '#F0EEEE';
const COLOR_HIGHLIGHT = '#2052F7';
const TEXT_PADDING_HORIZONTAL = 20;
const FONT_FAMILY = 'Roboto' as FontFamily;

/**
 * UIHighlight.ts
 * 
 * Summary:
 * Used for creating interactive UI elements aimed at drawing attention to specific parts of the user interface.
 * This component supports customizable visual properties such as color, opacity, font sizes, and text colors. It can be used in scenarios such as tutorials or onboarding workflows.
 * This class uses bindings and event connections to manage dynamic behaviors like showing popups, highlights, or toast notifications.
 * It also allows interactions such as button clicks to trigger further actions within the UI context.
 * 
 * Works with:
 * - TutorialManager.ts: Manages the overall tutorial flow and provides events for UI interactions.
 * - TutorialSlide.ts: Represents individual tutorial slides that can be displayed to players.
 * - TutorialController.ts: Manages the tutorial slides and plays them for players.
 * 
 * Additional notes:
 * - While this script can be used for some worlds, it might need some tweaks in some cases. To create a custom UI,
 *    creators have to subscribe to some events from TutorialManager as shown in the 'start' method.
 */
class UIHighlight extends UIComponent<typeof UIHighlight> {
  static propsDefinition = {
    tutorialManagerEntity: { type: PropTypes.Entity },                      // The entity that contains the TutorialManager component
    color: { type: PropTypes.String, default: '#FFFF00' },              // The color of the highlight
    opacity: { type: PropTypes.Number, default: 0.5 },                    // The opacity of the highlight
    titleFontSize: { type: PropTypes.Number, default: 32 },               // The font size of the title text
    titleColor: { type: PropTypes.String, default: '#ffffffff' },       // The color of the title text
    headerFontSize: { type: PropTypes.Number, default: 30 },              // The font size of the header text
    headerColor: { type: PropTypes.String, default: '#000000ff' },      // The color of the header text
    descriptionFontSize: { type: PropTypes.Number, default: 24 },         // The font size of the description text
    descriptionColor: { type: PropTypes.String, default: '#000000ff' }, // The color of the description text
    buttonTextFontSize: { type: PropTypes.Number, default: 18 },          // The font size of the button text
    buttonTextColor: { type: PropTypes.String, default: '#ffffffff' },  // The color of the button text
  };

  // Bindings for dynamic properties
  private titleBinding = new Binding<string>('TUTORIAL');
  private headerBinding = new Binding<string>('Welcome');
  private descriptionBinding = new Binding<string | LocalizableText>('Welcome to the tutorial. Are you ready?');
  private buttonTextBinding = new Binding<string>('Continue');
  private isPopupVisibleBinding = new Binding<boolean>(false);
  private isHighlightVisibleBinding = new Binding<boolean>(false);
  private isToastVisibleBinding = new Binding<boolean>(false);
  private highlightImageBinding = new Binding<ImageSource>(ImageSource.fromTextureAsset(new Asset(BigInt(''))));

  // Track the action shown for every player. That way we only use one CustomUI.
  private playersCurrentActionId: Map<Player, string> = new Map();
  private tutorialManager!: TutorialManager;

  /**
   * Initializes the UI component.
   * @returns The ui node that represents the UI component.
   */
  initializeUI(): UINode {
    return View({
      style: {
        width: '100%',
        height: '100%',
        alignSelf: 'center',
        justifyContent: 'center',
      },
      children: [
        UINode.if(this.isPopupVisibleBinding, this.popupView()),
        UINode.if(this.isHighlightVisibleBinding, this.highlightViewNormal()),
        UINode.if(this.isToastVisibleBinding, this.toastView()),
      ]
    });
  }

  /**
   * Executes when the world starts and when an entity that has this script is spawned.
   * This method initializes the component's properties and subscribes to events from the TutorialManager.
   */
  start() {
    this.initializeProps();
    this.subscribeEvents();
  }

  /**
   * Initializes the properties of the UIHighlight component.
   */
  initializeProps() {
    if (!this.props.tutorialManagerEntity) {
      console.error('UIHighlight: tutorialManagerEntity is not set');
      return;
    }
    this.tutorialManager = this.props.tutorialManagerEntity.getComponents(TutorialManager)[0];
  }

  /**
   * Subscribes to events from the TutorialManager to handle UI interactions.
   */
  subscribeEvents() {
    this.connectLocalBroadcastEvent(this.tutorialManager.TutorialEvents.onShowCustomMessage, this.onShowCustomMessage.bind(this));
    this.connectLocalBroadcastEvent(this.tutorialManager.TutorialEvents.onHideCustomMessage, this.onHideCustomMessage.bind(this));
    this.connectLocalBroadcastEvent(this.tutorialManager.TutorialEvents.onStartHighlight, this.onHighlightUI.bind(this));
    this.connectLocalBroadcastEvent(this.tutorialManager.TutorialEvents.onStopHighlight, this.onStopHighlight.bind(this));
  }

  //#region Views

  /**
   * Renders the normal highlight view.
   */
  highlightViewNormal(): UINode {
    return View({
      style: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        zIndex: 1000,
      },
      children: [
        Image({
          source: this.highlightImageBinding,
          style: {
            width: '100%',
            height: '100%',
            tintColor: this.props.color,
            opacity: this.props.opacity // Semi-transparent highlight
          }
        })
      ]
    });
  }

  /**
   * Renders the popup view with title, header, description, and button.
   */
  popupView(): UINode {
    return View({
      style: {
        width: '30%',
        alignSelf: 'center',
        alignContent: 'center',
        justifyContent: 'center',
        alignItems: 'center',
        borderColor: COLOR_PRIMARY,
        borderWidth: 4,
        borderRadius: COMMON_BORDER_RADIUS,
        backgroundColor: COLOR_SECONDARY,
        zIndex: 1001
      },
      children: [
        // Title
        Text({
          style: {
            fontFamily: FONT_FAMILY,
            fontSize: this.props.titleFontSize,
            color: this.props.titleColor,
            textAlign: 'center',
            textAlignVertical: 'center',
            fontWeight: 'bold',
            marginTop: -20,
            backgroundColor: COLOR_PRIMARY,
            paddingHorizontal: 20,
            paddingVertical: 0,
            marginBottom: COMMON_MARGIN_BOTTOM,
            borderRadius: COMMON_BORDER_RADIUS,
            borderColor: COLOR_PRIMARY,
            borderWidth: 2,
          },
          text: 'TUTORIAL',
        }),
        // Header
        Text({
          style: {
            fontFamily: FONT_FAMILY,
            fontSize: this.props.headerFontSize,
            color: this.props.headerColor,
            textAlign: 'center',
            fontWeight: 'bold',
            paddingHorizontal: TEXT_PADDING_HORIZONTAL,
          },
          text: this.headerBinding,
        }),
        // Description
        Text({
          text: this.descriptionBinding,
          style: {
            fontFamily: FONT_FAMILY,
            fontSize: this.props.descriptionFontSize,
            color: this.props.descriptionColor,
            textAlign: 'center',
            paddingHorizontal: TEXT_PADDING_HORIZONTAL,
            marginBottom: COMMON_MARGIN_BOTTOM,
          }
        }),
        // Continue button
        Pressable({
          onClick: (player) => this.onClick(player),
          children: [
            Text({
              text: this.buttonTextBinding,
              style: {
                fontFamily: FONT_FAMILY,
                fontSize: this.props.buttonTextFontSize,
                textAlign: 'center',
                textAlignVertical: 'center',
                color: this.props.buttonTextColor,
                backgroundColor: COLOR_HIGHLIGHT,
                borderColor: COLOR_PRIMARY,
                borderRadius: COMMON_BORDER_RADIUS,
                borderWidth: 2,
                paddingHorizontal: 20,
                paddingVertical: 5,
                marginBottom: COMMON_MARGIN_BOTTOM,
              }
            })
          ]
        })
      ]
    });
  }

  /**
   * Renders the toast notification view.
   */
  toastView(): UINode {
    return View({
      style: {
        width: '20%',
        position: 'absolute',
        top: 20,
        alignSelf: 'center',
        alignContent: 'center',
        justifyContent: 'center',
        alignItems: 'center',
        borderColor: COLOR_PRIMARY,
        borderWidth: 3,
        borderRadius: COMMON_BORDER_RADIUS,
        backgroundColor: COLOR_SECONDARY,
        zIndex: 1001
      },
      children: [
        // Title
        Text({
          style: {
            fontFamily: FONT_FAMILY,
            fontSize: this.props.titleFontSize * 0.8,
            color: this.props.titleColor,
            textAlign: 'center',
            textAlignVertical: 'center',
            fontWeight: 'bold',
            marginTop: -15,
            backgroundColor: COLOR_PRIMARY,
            paddingHorizontal: 15,
            paddingVertical: 0,
            marginBottom: COMMON_MARGIN_BOTTOM * 0.8,
            borderRadius: COMMON_BORDER_RADIUS,
            borderColor: COLOR_PRIMARY,
            borderWidth: 2,
          },
          text: this.titleBinding,
        }),
        // Description
        Text({
          text: this.descriptionBinding,
          style: {
            fontFamily: FONT_FAMILY,
            fontSize: this.props.descriptionFontSize * 0.8,
            color: this.props.descriptionColor,
            textAlign: 'center',
            paddingHorizontal: TEXT_PADDING_HORIZONTAL * 0.8,
            marginBottom: COMMON_MARGIN_BOTTOM * 0.8,
          }
        })
      ]
    });
  }


  //#endregion

  /**
   * Displays a custom message to a player with specified settings and parameters.
   *
   * @param payload - The data used to display the custom message.
   * @param payload.player - The player to whom the message will be shown.
   * @param payload.actionId - The identifier for the message action.
   * @param payload.message - The content of the message to be displayed.
   * @param payload.isPopup - Flag to determine whether the message is a popup or not.
   * @param payload.params - Optional parameters for additional settings, such as title, header, button text, and duration.
   */
  onShowCustomMessage(payload: { player: Player, actionId: string, message: string | LocalizableText, isPopup: boolean, params?: Map<any, any> }) {
    const player = payload.player;
    const actionId = payload.actionId;
    const title = payload.params?.get('title') ?? '';
    const header = payload.params?.get('header') ?? '';
    const description = payload.message;
    const buttonText = payload.params?.get('buttonText') ?? '';
    const duration = Number(payload.params?.get('duration') ?? -1);
    const isPopup = payload.isPopup;

    this.showPopup(player, actionId, title, description, {
      header: header,
      buttonText: buttonText,
      duration: duration,
      type: isPopup ? 1 : 0
    });
  }

  /**
   * Handles the action to hide a custom message for a player.
   *
   * @param payload - The information related to the hide operation.
   * @param payload.player - The player instance for which the message is being hidden.
   * @param payload.actionId - The identifier of the action triggering the hide operation.
   * @param payload.isPopup - A flag indicating whether the message is a popup.
   */
  onHideCustomMessage(payload: { player: Player, actionId: string, isPopup: boolean }) {
    const player = payload.player;
    const type = payload.isPopup ? 1 : 0;

    this.closePopup(player, type);
  }

  /**
   * Triggers the highlight UI for the specified player by updating the highlight visibility
   * and image source bindings, and displaying the UI.
   *
   * @param payload - An object containing the necessary parameters for updating the UI.
   * @param payload.player - The player for whom the highlight UI is updated.
   * @param payload.actionId - The identifier for the associated action.
   * @param payload.imageId - The identifier for the image to be highlighted.
   */
  onHighlightUI(payload: { player: Player, actionId: string, imageId: string }) {
    const player = payload.player;
    const highlight = true;
    const imageId = payload.imageId;
    const imageSource = ImageSource.fromTextureAsset(new Asset(BigInt(imageId)));

    this.isHighlightVisibleBinding.set(highlight, [player]);
    this.highlightImageBinding.set(imageSource, [player]);
    this.showTo(player);
  }

  /**
   * Handles the stop highlight action for a player, disabling any active highlights and hiding relevant elements.
   *
   * @param payload - The data required to process the stop highlight action.
   * @param payload.player - The player for whom the highlight should be stopped.
   * @param payload.actionId - The identifier of the action associated with the highlight.
   */
  onStopHighlight(payload: { player: Player, actionId: string }) {
    const player = payload.player;
    const highlight = false;

    this.isHighlightVisibleBinding.set(highlight, [player]);
    this.hideFrom(player);
  }

  /**
   * Show a popup or toast message
   * @param player The player to show the popup or toast to
   * @param actionId Unique identifier for the action
   * @param title Title of the popup or toast
   * @param description Description text (can be a string or LocalizableText)
   * @param params Additional parameters
   * @param params.header Header text (only for popup)
   * @param params.buttonText Button text (only for popup)
   * @param params.duration Duration in seconds. If less than 0, it will be permanent
   * @param params.type View type (0 for toast, 1 for popup)
   */
  showPopup(player: Player, actionId: string, title: string, description: string | LocalizableText, params: {
    header?: string,
    buttonText?: string,
    duration?: number,
    type?: number
  } = {}
  ) {
    const {
      header = params.header ?? '',
      buttonText = params.buttonText ?? '',
      duration = params.duration ?? -1,
      type = params.type ?? 0,
    } = params;

    this.showTo(player);

    this.titleBinding.set(title, [player]);
    this.descriptionBinding.set(description, [player]);

    if (type === 1) { // Popup
      this.headerBinding.set(header, [player]);
      this.buttonTextBinding.set(buttonText, [player]);
      this.isPopupVisibleBinding.set(true, [player]);
    } else { // Toast
      this.isToastVisibleBinding.set(true, [player]);
    }

    this.playersCurrentActionId.set(player, actionId);

    if (duration > 0) {
      this.async.setTimeout(() => {
        this.closePopup(player, type);
      }, duration * 1000);
    }
  }

  /**
   * Close the popup or toast
   * @param player
   * @param type View type to close (0 for toast, 1 for popup)
   */
  closePopup(player: Player, type: number = 1) {
    this.hideFrom(player);

    if (type === 1) {
      this.isPopupVisibleBinding.set(false, [player]);

      // Send this event only for popups, otherwise it will throw errors and potential recursive loops
      this.sendLocalBroadcastEvent(this.tutorialManager.TutorialEvents.onTutorialActionPerformed, {
        player: player,
        actionId: this.playersCurrentActionId.get(player) ?? '',
      });
    } else {
      this.isToastVisibleBinding.set(false, [player]);
    }

    this.playersCurrentActionId.delete(player);
    // this.entity.setVisibilityForPlayers([player], PlayerVisibilityMode.HiddenFrom);
    // this.entity.visible.set(false);
  }

  /**
   * Handles the onClick event and performs the associated action for the given player.
   * @param player - The player object that triggered the click event.
   */
  onClick(player: Player) {
    this.closePopup(player);
  }

  /**
   * Makes the entity visible to a specific player.
   * @param player - The player to whom the entity should be made visible.
   */
  showTo(player: Player) {
    this.entity.visible.set(true);
    this.entity.setVisibilityForPlayers([player], PlayerVisibilityMode.VisibleTo);
  }

  /**
   * Hides the entity from the specified player, making it invisible to them.
   * @param player - The player from whom the entity should be hidden.
   */
  hideFrom(player: Player) {
    this.entity.setVisibilityForPlayers([player], PlayerVisibilityMode.HiddenFrom);
  }
}
UIComponent.register(UIHighlight);