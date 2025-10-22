import { PropTypes } from 'horizon/core'
import { UIComponent, View, Image, UINode, ImageSource, ViewStyle, ImageStyle } from 'horizon/ui'


class QuestHUD extends UIComponent<typeof QuestHUD> {

  static propsDefinition = {
    frameTexture: { type: PropTypes.Asset },
  }

  initializeUI(): UINode {
    return (
      View({
        style: RootStyle,
        children: [
          Image({
            source: ImageSource.fromTextureAsset(this.props.frameTexture!),
            style: FrameStyle,
          }),
        ],
      })
    )
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
}

const FrameStyle: ImageStyle = {
  position: 'absolute',
  width: '100%',
  height: '100%',
  resizeMode: 'stretch', // Stretches frame to fit the 500x120 container
}



