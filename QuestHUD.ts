import { PropTypes, Player } from 'horizon/core'
import { EventsService } from 'constants';
import { UIComponent, View, Image, UINode, ImageSource, ViewStyle, ImageStyle, Text, Binding, TextStyle, } from 'horizon/ui'


export class QuestHUD extends UIComponent<typeof QuestHUD> {

  static propsDefinition = {
    frameTexture: { type: PropTypes.Asset },

  }
  private titleTextBinding = new Binding<string>("");
  private isVisibleBinding = new Binding<boolean>(true); // This controls visibility

  initializeUI(): UINode {
    return UINode.if(this.isVisibleBinding,
      View({
        style: RootStyle,
        children: [
          Image({
            source: ImageSource.fromTextureAsset(this.props.frameTexture!),
            style: FrameStyle,
          }),
          View({
            style: ContentContainerStyle,
            children: [
              Text({
                text: this.titleTextBinding,
                style: TitleTextStyle,
              })
            ]
          })
        ],
      })
  )
  }

  start() {
    this.connectNetworkBroadcastEvent(EventsService.QuestEvents.DisplayQuestHUD,
      (data: { player: Player, title: string, visible: boolean }) => {
        const localPlayer = this.world.getLocalPlayer();
        console.log(`[QuestHUD] Received DisplayQuestHUD event for player: ${data.player.name.get()}`);
        // Critical check: Process updates only if they target this player.
        // Since this script is Local, it should be owned by the player it serves.
        if (localPlayer && this.entity.owner.get() === localPlayer) {
          // Now apply the updates using the private internal method
          this.updateUIBindings(data.title, data.visible);
        }
      });
  }

  private updateUIBindings(title: string, visible: boolean): void {
    this.titleTextBinding.set(title);
    this.isVisibleBinding.set(visible);

    // OPTIMIZATION: Toggle the entity's visible property, not just the UINode.if(),
    // to potentially release textures to GC if hidden [16-18].
    this.entity.visible.set(visible);
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