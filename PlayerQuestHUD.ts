import { PropTypes, Player } from "horizon/core";
import { EventsService } from "constants";
import {
  UIComponent,
  View,
  Text,
  ViewStyle,
  ImageStyle,
  TextStyle,
  Image,
  ImageSource,
  Binding,
  UINode,
} from "horizon/ui";

class PlayerQuestHUD extends UIComponent {
  static propsDefinition = {
    frameTexture: { type: PropTypes.Asset },
  };

  private titleTextBinding = new Binding<string>("");
  private isVisibleBinding = new Binding<boolean>(false); // This controls visibility
  private objectiveTextBinding = new Binding<string>("");


  initializeUI() {
    const frameNode = this.props.frameTexture
      ? Image({
        source: ImageSource.fromTextureAsset(this.props.frameTexture),
        style: FrameStyle,
      })
      : undefined;

    return UINode.if(this.isVisibleBinding, View({
      style: RootStyle,
      children: [
        frameNode,
        View({
          style: ContentContainerStyle,
          children: [
            Text({
              text: this.titleTextBinding,
              style: TitleTextStyle,
            }),
            Text({ // <-- ADDED
              text: this.objectiveTextBinding,
              style: ObjectiveTextStyle,
            })
          ],
        }),
      ],
    })
    );
  }

  start() {

    // 2. Connect the network listener directly to the owning player
    this.connectNetworkEvent(this.entity.owner.get(), EventsService.QuestEvents.DisplayQuestHUD, (payload) => {
      const localPlayer = this.world.getLocalPlayer();
      if (localPlayer && this.entity.owner.get() === localPlayer) {
        const { title, visible, objective } = payload;
        this.updateUIBindings(title, objective, visible);
      }

    });

    this.connectNetworkEvent(this.entity.owner.get(), EventsService.UIEvents.TogglePlayerUI,
      (data: { player: Player, visible: boolean }) => {
        const localPlayer = this.world.getLocalPlayer();
        if (localPlayer && this.entity.owner.get() === localPlayer) {
          this.isVisibleBinding.set(data.visible);
        }
       });
  }

  private updateUIBindings(title: string, objective: string, visible: boolean): void {
    this.titleTextBinding.set(title);
    this.objectiveTextBinding.set(objective);
    this.isVisibleBinding.set(visible);

  }
}
UIComponent.register(PlayerQuestHUD);

const HUD_WIDTH = 180;
const HUD_HEIGHT = 240;

const RootStyle: ViewStyle = {
  position: "absolute",
  top: 120,
  left: 20,
  width: HUD_WIDTH,
  height: HUD_HEIGHT,
};

const FrameStyle: ImageStyle = {
  position: "absolute",
  width: "100%",
  height: "100%",
  resizeMode: "stretch",
};

// This container holds the content *inside* the frame
const ContentContainerStyle: ViewStyle = {
  position: "absolute",
  width: "100%",
  height: "100%",
  padding: 10, // Adjust padding to fit your frame's border
  flexDirection: "column",
  alignItems: "center",
};

// Style for the quest title
const TitleTextStyle: TextStyle = {
  marginTop: 70, // <-- REDUCED (was 80) to make more room
  width: '90%', // Added width to ensure centering and wrapping
  fontSize: 14, // <-- REDUCED (was 16)
  color: '#4a4a4a', // Used a specific dark gray instead of 'gray'
  textAlign: 'center',
  textAlignVertical: 'top',
  fontWeight: 'bold',
}


// Style for the objective text
const ObjectiveTextStyle: TextStyle = { // <-- ADDED
  marginTop: 8, // Adds a small space below the title
  width: '90%', // Keeps text within the scroll bounds
  fontSize: 12, // Smaller than the title
  color: '#5c5c5c', // Dark gray
  textAlign: 'center',
  textAlignVertical: 'top',
}