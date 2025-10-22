import { healthData } from "HealthData";
import { Component, PropTypes, Color, Player, TextureAsset } from 'horizon/core'
import { UIComponent, View, Text, Image, UINode, Binding, ImageSource, ViewStyle, TextStyle, ImageStyle } from 'horizon/ui'


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
        // Root container anchored to the top-left of the screen.
        style: RootStyle,
        children: [
          // The Frame (Background Image)
          Image({
            source: ImageSource.fromTextureAsset(this.props.frameTexture!),
            style: FrameStyle,
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
  top: 20, // 20px from the top edge
  left: 120, // 20px from the left edge
  width: HUD_WIDTH,
  height: HUD_HEIGHT,
  // Use a debug border to see the container if the texture fails to load
  // borderWidth: 1, 
  // borderColor: 'red',
}

const FrameStyle: ImageStyle = {
  position: 'absolute',
  width: '100%',
  height: '100%',
  resizeMode: 'stretch', // Stretches frame to fit the 500x120 container
}