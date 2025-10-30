import { EventsService } from 'constants'
import { PropTypes, Color, Player, PlayerInput, SerializableState, PlayerControls, PlayerInputAction, ButtonIcon, ButtonPlacement, PlayerDeviceType } from 'horizon/core'
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
  Animation,
  Easing,
  AnimatedBinding,
} from 'horizon/ui'

const HP_BAR_BG_COLOR = '#8B0000' // Dark Red (Damage)
const HP_BAR_FILL_COLOR = '#008000' // Green (Health)

export class PlayerHealthHUD extends UIComponent<typeof PlayerHealthHUD> {
  static propsDefinition = {
    // --- Textures ---
    frameTexture: { type: PropTypes.Asset },
  }
  private hpFillBinding = new AnimatedBinding(1.0)
  private hpTextBinding = new Binding('0')
  private playerNameBinding = new Binding('')
  private isVisibleBinding = new Binding<boolean>(false);

  toggleDebugEconomy: PlayerInput | undefined = undefined;
  deviceType: PlayerDeviceType | null = null;


  receiveOwnership(_serializableState: SerializableState, _oldOwner: Player, _newOwner: Player): void {
    if (_newOwner !== this.world.getServerPlayer()) {
      this.toggleDebugEconomy = PlayerControls.connectLocalInput(PlayerInputAction.LeftTertiary, ButtonIcon.Menu, this, { preferredButtonPlacement: ButtonPlacement.Center });
      this.toggleDebugEconomy.registerCallback((action, pressed) => {
        if (pressed) {
          this.onDebugTogglePressed();
        }
      });
    }
  }

  initializeUI(): UINode {



   return UINode.if(
     this.isVisibleBinding,
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

  start() {
    this.connectNetworkEvent(this.entity.owner.get(), EventsService.PlayerEvents.DisplayHealthHUD,
      (data: { player: Player, currentHealth: number, maxHealth: number, visible: boolean, name: string }) => {
        const localPlayer = this.world.getLocalPlayer();
        if (localPlayer && this.entity.owner.get() === localPlayer) {
          this.setPlayerName(data?.name)
          this.updateHealth(data.currentHealth, data.maxHealth);
          this.setVisible(true);
        }
      });

    this.connectNetworkEvent(this.entity.owner.get(), EventsService.UIEvents.TogglePlayerUI,
      (data: { player: Player, visible: boolean }) => {
        const localPlayer = this.world.getLocalPlayer();
        if (localPlayer && this.entity.owner.get() === localPlayer) {
          this.setVisible(data.visible);
        }
      });

  }


  /**
    * Sets the visibility of the Quest HUD.
    * @param visible True to show, false to hide.
    */
  private setVisible(visible: boolean) {
    this.isVisibleBinding.set(visible);
  }

  onDebugTogglePressed() {
    this.entity.visible.set(!this.entity.visible.get());
  }

  /**
    * Sets The player's health display.
    * @param health Current health value.
    * @param maxHealth Maximum health value.
    */
  private updateHealth(health: number, maxHealth: number) {
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
  private setPlayerName(name: string) {
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
  left: 160,
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