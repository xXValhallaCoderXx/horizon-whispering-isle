import { PropTypes } from 'horizon/core'
import { UIComponent, View, Image, UINode, ImageSource, ViewStyle, ImageStyle, Text, Binding, TextStyle } from 'horizon/ui'


export class QuestHUD extends UIComponent<typeof QuestHUD> {

  static propsDefinition = {
    frameTexture: { type: PropTypes.Asset },

  }

  // Bindings for reactive state
  private titleTextBinding = new Binding<string>("");
  private isVisibleBinding = new Binding<boolean>(false); // This controls visibility

  initializeUI(): UINode {
  // -----------------------------------------------------------------
  // MODIFICATION:
  // Wrap your entire UI definition in UINode.if()
  // This links the 'isVisibleBinding' to the actual rendering
  // of the component.
  // -----------------------------------------------------------------
  return UINode.if(this.isVisibleBinding,
      View({
        style: RootStyle,
        children: [
          // Background Frame
          Image({
            source: ImageSource.fromTextureAsset(this.props.frameTexture!),
            style: FrameStyle,
          }),

          // Content Container
          View({
            style: ContentContainerStyle,
            children: [
              Text({
                text: this.titleTextBinding,
                style: TitleTextStyle,
              }),
              // You can add more UI elements here, like quest objectives
            ]
          })
        ],
      })
      // When the binding is false, it will render 'null' (nothing)
    )
  }

  // --- Public API ---
  // These methods are called from your parent script (e.g., QuestManager)
  // to control the HUD's state.

  /**
   * Shows the Quest HUD.
   */
  public show() {
    this.isVisibleBinding.set(true);
  }

  /**
   * Hides the Quest HUD.
   */
  public hide() {
    this.isVisibleBinding.set(false);
  }

  /**
   * Sets the visibility of the Quest HUD.
   * @param visible True to show, false to hide.
   */
  public setVisible(visible: boolean) {
    this.isVisibleBinding.set(visible);
  }

  /**
   * Updates the HUD content and visibility in one call.
   * @param title The new quest title to display.
   * @param visible True to show, false to hide.
   */
  public updateQuest(title: string, visible: boolean) {
    this.titleTextBinding.set(title);
    this.isVisibleBinding.set(visible);
  }


}
UIComponent.register(QuestHUD);

const HUD_WIDTH = 180
const HUD_HEIGHT = 240

const RootStyle: ViewStyle = {
  position: 'absolute',
  top: 120,
  left: 20,
  width: HUD_WIDTH,
  height: HUD_HEIGHT,
  // Debug border
  // borderWidth: 1,
  // borderColor: 'red',
}

const FrameStyle: ImageStyle = {
  position: 'absolute',
  width: '100%',
  height: '100%',
  resizeMode: 'stretch',
}

// This container holds the content *inside* the frame
const ContentContainerStyle: ViewStyle = {
  position: 'absolute',
  width: '100%',
  height: '100%',
  padding: 10, // Adjust padding to fit your frame's border
  flexDirection: 'column',
  alignItems: 'center',
}

// Style for the quest title
const TitleTextStyle: TextStyle = {
  marginTop: 80,
  width: '100%',
  fontSize: 16,
  color: 'gray',
  textAlign: 'center',
  textAlignVertical: 'top',
  fontWeight: 'bold',
}