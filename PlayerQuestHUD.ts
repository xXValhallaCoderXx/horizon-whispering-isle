import { PropTypes } from "horizon/core";
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
          ],
        }),
      ],
    })
    );
  }

  start() {
    const owningPlayer = this.entity.owner.get();
    if (owningPlayer === this.world.getServerPlayer()) {
      console.warn("[PlayerQuestHUD] Script is running on server; aborting network event connection.");
      // If still running on the server
      return;
    }
    // 2. Connect the network listener directly to the owning player
    this.connectNetworkEvent(owningPlayer, EventsService.QuestEvents.DisplayQuestHUD, (payload) => {
      const { title, visible } = payload;
      this.updateUIBindings(title, visible);
    });
  }

  private updateUIBindings(title: string, visible: boolean): void {
    this.titleTextBinding.set(title);
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
  marginTop: 80,
  width: "100%",
  fontSize: 16,
  color: "gray",
  textAlign: "center",
  textAlignVertical: "top",
  fontWeight: "bold",
};
