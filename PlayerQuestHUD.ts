import { PropTypes, Player } from 'horizon/core'
import { EventsService } from 'constants';
import { UIComponent, View, Text, ViewStyle, ImageStyle, TextStyle, Image, ImageSource, Binding, UINode } from 'horizon/ui'

class PlayerQuestHUD extends UIComponent {
  static propsDefinition = {
    frameTexture: { type: PropTypes.Asset },
  }

  private titleTextBinding = new Binding<string>("");
  private isVisibleBinding = new Binding<boolean>(false); // This controls visibility

  initializeUI() {
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
                text: "Event <3",
                style: TitleTextStyle,
              })
            ]
          })
        ],
      })
    )
  }

  preStart(): void {
    console.error("THIS OWNER: ", this.entity.owner.get());
  }

  start() {

    this.connectNetworkEvent(this.entity.owner.get(), EventsService.QuestEvents.DisplayQuestHUD,
      (data: { player: Player, title: string, visible: boolean }) => {
        console.log("Received DisplayQuestHUD event: ", data.player.id);



        // Critical check: Process updates only if they target this player.
        // if (localPlayer.id === data.player.id) {
        //   this.updateUIBindings(data.title, data.visible);
        // }
      });
  }

  private updateUIBindings(title: string, visible: boolean): void {
    this.titleTextBinding.set(title);
    this.isVisibleBinding.set(visible);
  }
}
UIComponent.register(PlayerQuestHUD);



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