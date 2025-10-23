// Copyright (c) Meta Platforms, Inc. and affiliates.

// This source code is licensed under the MIT license found in the
// LICENSE file in the root directory of this source tree.

import { PropTypes, Color } from 'horizon/core'
import {
  UIComponent,
  View,
  Text,
  Image,
  UINode,
  ImageSource,
  ViewStyle,
  TextStyle,
  ImageStyle,
  Binding,
  AnimatedBinding,
  Animation,
  Easing,
} from 'horizon/ui'

const HP_BAR_BG_COLOR = '#8B0000' // Dark Red (Damage)
const HP_BAR_FILL_COLOR = '#008000' // Green (Health)

export class PlayerHealthHUD extends UIComponent<typeof PlayerHealthHUD> {
  static propsDefinition = {
    // --- Textures ---
    frameTexture: { type: PropTypes.Asset },
  }

  // --- Bindings for Dynamic Data ---
  /** AnimatedBinding for the health bar's fill percentage (0.0 to 1.0) */
  private hpFillBinding = new AnimatedBinding(1.0)
  /** Binding for the health text (e.g., "100" or "80/100") */
  private hpTextBinding = new Binding('100')
  /** Binding for the player's name */
  private playerNameBinding = new Binding('xXValhallaMonkXx')
  /** Binding for visibility */
  private isVisibleBinding = new Binding<boolean>(true);

  initializeUI(): UINode {
    // This UI component will be spawned by a server script (like HudManager)
    // and assigned to the player. It runs on the client.

    return UINode.if(this.isVisibleBinding,
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
              // --- TOP ROW: Icon Spacer + Player Name ---
              View({
                style: TopRowStyle,
                children: [
                  // Spacer to account for the Owl icon in the frame
                  View({ style: IconSpacerStyle }),
                  // Player Name
                  Text({
                    text: this.playerNameBinding,
                    style: PlayerNameTextStyle,
                  }),
                ],
              }),

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
                        style: {
                          ...BarFillStyle,
                          // Bind the width to the animated value
                          // interpolate maps the 0.0-1.0 value to a 0%-100% width
                          width: this.hpFillBinding.interpolate(
                            [0, 1],
                            ['0%', '100%'],
                          ),
                        },
                      }),
                    ],
                  }),

                  // 3. HP Text (overlayed on top of the bar)
                  Text({
                    text: this.hpTextBinding, // Bind to the text binding
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
    * Sets The player's health display.
    * @param health Current health value.
    * @param maxHealth Maximum health value.
    */
  public updateHealth(health: number, maxHealth: number) {
    // 1. Clamp values to be safe
    const currentHealth = Math.max(0, health)
    const totalHealth = Math.max(1, maxHealth) // Avoid division by zero
    const healthPercent = currentHealth / totalHealth

    // 2. Update the text binding
    if (healthPercent >= 1) {
      this.hpTextBinding.set(`${totalHealth}`)
    } else {
      this.hpTextBinding.set(`${currentHealth}/${totalHealth}`)
    }

    // 3. Update the animated fill binding
    // This will create a smooth animation from its current value to the new percentage.
    this.hpFillBinding.set(
      Animation.timing(healthPercent, {
        duration: 300, // 300ms animation duration
        easing: Easing.out(Easing.cubic),
      }),
    )
  }

  /**
    * Sets the player's name display.
    * @param name The name of the player.
    */
  public setPlayerName(name: string) {
    this.playerNameBinding.set(name)
  }
}
UIComponent.register(PlayerHealthHUD)

// --- STYLES ---

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
  justifyContent: 'flex-start', // Stack from the top
  alignItems: 'center', // Center children horizontally
  paddingTop: 4, // **MOVED UP** (was 12)
  paddingHorizontal: 15,
}

// Style for the new Top Row (Icon + Name)
const TopRowStyle: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  width: '92%', // **MADE WIDER** (was 90%)
  height: 30,
  marginBottom: 2, // **MOVED UP** (was 4)
}

// Empty view to take up the space of the owl icon
const IconSpacerStyle: ViewStyle = {
  width: 30,
  height: 30,
}

// Updated style for the Player Name
const PlayerNameTextStyle: TextStyle = {
  flex: 1, // Take remaining space in the row
  textAlign: 'left',
  color: Color.white,
  fontSize: 16, // **MADE SMALLER** (was 18)
  fontWeight: 'bold',
  marginLeft: 6, // **MOVED LEFT** (was 8)
}

const MiddleRowStyle: ViewStyle = {
  height: 18, // Made bar taller
  width: '95%', // **MADE WIDER** (was 90%)
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
  // Width is now controlled by the binding
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
  fontSize: 12, // Increased font size
  fontWeight: 'bold',
  // Added text shadow for readability
  textShadowColor: '#00000088',
  textShadowRadius: 2,
  textShadowOffset: [1, 1]
}