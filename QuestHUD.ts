import { PropTypes } from 'horizon/core'
import { UIComponent, View, Image, UINode, ImageSource, ViewStyle, ImageStyle, Text, Binding, TextStyle } from 'horizon/ui'


export class QuestHUD extends UIComponent<typeof QuestHUD> {

  static propsDefinition = {
    frameTexture: { type: PropTypes.Asset },

  }


  private titleTextBinding = new Binding<string>("sss");

  initializeUI(): UINode {
    return (
      View({
        style: RootStyle,
        children: [
          // Background Frame
          Image({
            source: ImageSource.fromTextureAsset(this.props.frameTexture!),
            style: FrameStyle,
          }),

          // 2. Add the Text component for the title
          // It is layered on top of the frame.
          View({
            style: ContentContainerStyle,
            children: [
              Text({
                // 3. Link the 'text' property to your binding
                text: this.titleTextBinding,
                style: TitleTextStyle,
              }),
              // You can add more UI elements here, like quest objectives
            ]
          })
        ],
      })
    )
  }

  public setQuestTitle(title: string) {
    console.log('WAZAAAAAA')
    this.titleTextBinding.set(title);
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