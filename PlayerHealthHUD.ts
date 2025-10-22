import { healthData } from "HealthData";
import { Component, PropTypes, Color, Player, TextureAsset } from 'horizon/core'
import { UIComponent, View, Text, Image, UINode, Binding, ImageSource, ViewStyle, TextStyle, ImageStyle } from 'horizon/ui'


const HP_BAR_BG_COLOR = '#8B0000' // Dark Red
const HP_BAR_FILL_COLOR = '#008000' // Dark Green

class PlayerHealthHUD extends UIComponent<typeof PlayerHealthHUD> {

  static propsDefinition = {
    // --- Textures ---
    frameTexture: { type: PropTypes.Asset },
  }

  initializeUI(): UINode {

    // This UI component will be spawned by a server script (like HudManager)
    // and assigned to the player. It runs on the client.
    return (
      View({
        style: RootStyle,
        children: [
          // 1. The Frame (Background Image)
          Image({
            source: ImageSource.fromTextureAsset(this.props.frameTexture!),
            style: FrameStyle,
          }),

          // 2. Main Content Container
          View({
            style: ContentContainerStyle,
            children: [
              // --- MIDDLE ROW: HP Bar ---
              View({
                style: MiddleRowStyle,
                children: [
                  // --- Our Custom HP Bar ---
                  // 1. Bar Background (The Red Track)
                  View({
                    style: BarBackgroundStyle,
                    children: [
                      // 2. Bar Fill (The Green Part)
                      View({
                        style: BarFillStyle,
                      }),
                    ],
                  }),

                  // 3. HP Text (overlayed on top of the bar)
                  Text({
                    text: "100/100", // Hardcoded for layout test
                    style: HPTextStyle,
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    )
  }
}
UIComponent.register(PlayerHealthHUD);

const HUD_WIDTH = 260
const HUD_HEIGHT = 90



const RootStyle: ViewStyle = {
  position: 'absolute',
  top: 20,
  left: 140,
  width: HUD_WIDTH,
  height: HUD_HEIGHT,
}

const FrameStyle: ImageStyle = {
  position: 'absolute',
  width: '100%',
  height: '100%',
  resizeMode: 'stretch',
}

const ContentContainerStyle: ViewStyle = {
  position: 'absolute',
  width: '100%',
  height: '100%',
  justifyContent: 'center',
  alignItems: 'center',
}

const MiddleRowStyle: ViewStyle = {
  height: 15,
  width: '85%', // Adjust this % to fit the bar inside the frame cutout
  justifyContent: 'center',
}

const BarBackgroundStyle: ViewStyle = {
  width: '100%',
  height: '100%',
  backgroundColor: HP_BAR_BG_COLOR,
  borderRadius: 3,
  overflow: 'hidden', // This clips the green bar inside
}

const BarFillStyle: ViewStyle = {
  width: '78%', // Hardcoded 780/1000
  height: '100%',
  backgroundColor: HP_BAR_FILL_COLOR,
}

const HPTextStyle: TextStyle = {
  position: 'absolute',
  width: '100%',
  height: '100%',
  textAlign: 'center',
  textAlignVertical: 'center',
  color: Color.white,
  fontSize: 14,
  fontWeight: 'bold',
}