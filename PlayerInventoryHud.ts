import { EventsService } from 'constants'
import { PropTypes, Color, Player, PlayerInput, SerializableState, PlayerControls, PlayerInputAction, ButtonIcon, ButtonPlacement } from 'horizon/core'
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
} from 'horizon/ui'

export class PlayerInventoryHud extends UIComponent<typeof PlayerInventoryHud> {
  static propsDefinition = {
    frameTexture: { type: PropTypes.Asset },
  }

  private isVisibleBinding = new Binding<boolean>(false);
  private inventoryTitleBinding = new Binding('Inventory');

  toggleInventory: PlayerInput | undefined = undefined;

  private defaultStats = [
    { label: 'Health', value: new Binding('100') },
    { label: 'Strength', value: new Binding('10') },
    // add more rows as needed
  ]

  private slotTexts = Array.from({ length: SLOT_ROWS * SLOT_COLS }, () => ({
    label: new Binding<string>(''),
    count: new Binding<string>(''),
  }));

  receiveOwnership(_serializableState: SerializableState, _oldOwner: Player, _newOwner: Player): void {
    if (_newOwner !== this.world.getServerPlayer()) {
      this.toggleInventory = PlayerControls.connectLocalInput(PlayerInputAction.RightSecondary, ButtonIcon.Menu, this, { preferredButtonPlacement: ButtonPlacement.Center });
      this.toggleInventory.registerCallback((action, pressed) => {
        if (pressed) {
          this.onTogglePressed();
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
              // Inventory content placeholder
              View({
                style: PlayerStatsContainerStyle,
                children: this.buildStatRows(this.defaultStats),
              }),
              // Right-side inventory grid
              View({
                style: InventoryGridContainerStyle,
                children: this.buildSlotGrid(SLOT_ROWS, SLOT_COLS),
              }),
            ],
          }),
        ],
      })
    )
  }

  private buildStatRows(items: { label: string; value: Binding<string> }[]): UINode[] {
    return items.map(({ label, value }, idx) =>
      View({

        style: StatRowStyle,
        children: [
          Text({ text: label + ':', style: StatLabelText }),
          Text({ text: value, style: StatValueText }),
        ],
      })
    )
  }


  private buildSlotGrid(rows: number, cols: number): UINode[] {
    const slots: UINode[] = []
    const size = SLOT_SIZE
    const gap = SLOT_GAP

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        slots.push(
          View({
            style: {
              position: 'absolute',
              left: c * (size + gap),
              top: r * (size + gap),
              width: size,
              height: size,
              borderWidth: SLOT_BORDER_WIDTH,
              borderColor: SLOT_BORDER_COLOR,
            },
            children: [
              Text({ text: this.slotTexts[idx].label, style: SlotItemCodeText }),
              Text({ text: this.slotTexts[idx].count, style: SlotItemCountText }),
            ],
          })
        )
      }
    }
    return slots
  }

  start() {
    this.connectNetworkEvent(
      this.entity.owner.get(),
      EventsService.PlayerEvents.RefreshInventoryHUD,
      (data: { player: Player; inventory?: Record<string, number>; title?: string; visible?: boolean }) => {
        const localPlayer = this.world.getLocalPlayer();
        if (localPlayer && this.entity.owner.get() === localPlayer) {
          if (data.inventory) this.updateInventoryGrid(data.inventory);
          if (data.title) this.setTitle(data.title);
          if (typeof data.visible === 'boolean') this.setVisible(data.visible);
        }
      }
    );

  }

  private updateInventoryGrid(inv: Record<string, number>) {
    const entries = Object.entries(inv);
    const max = this.slotTexts.length;

    for (let i = 0; i < max; i++) {
      if (i < entries.length) {
        const [name, count] = entries[i];
        this.slotTexts[i].label.set(this.abbr(name));
        this.slotTexts[i].count.set(`x${count}`);
      } else {
        this.slotTexts[i].label.set('');
        this.slotTexts[i].count.set('');
      }
    }
  }

  /**
   * Sets the visibility of the Inventory HUD.
   * @param visible True to show, false to hide.
   */
  private setVisible(visible: boolean) {
    this.isVisibleBinding.set(visible);
    this.entity.visible.set(visible);
  }



  /**
   * Toggles the inventory visibility when RightTertiary button is pressed.
   */
  onTogglePressed() {
    const currentVisibility = this.entity.visible.get()
    this.setVisible(!currentVisibility);
    this.entity.visible.set(!currentVisibility);
  }

  /**
   * Sets the inventory title.
   * @param title The title text.
   */
  public setTitle(title: string) {
    this.inventoryTitleBinding.set(title);
  }

  private abbr(name: string): string {
    return name.slice(0, 3).toUpperCase();
  }
}

UIComponent.register(PlayerInventoryHud);


// --- STYLES ---
const STAT_ROW_HEIGHT = 28;
const STAT_ROW_GAP = 10;

const StatRowStyle: ViewStyle = {
  width: '100%',
  height: STAT_ROW_HEIGHT,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between', // label on left, value on right
  marginBottom: STAT_ROW_GAP,
}
const StatLabelText: TextStyle = {
  color: Color.black,          // good contrast on beige
  fontSize: 16,
}

const StatValueText: TextStyle = {
  color: Color.black,
  fontSize: 16,
  fontWeight: 'bold',
}

// Approximate the right panel area inside your frame image.
// Adjust these numbers with trial-and-error to align with the art.
const RIGHT_PANEL_LEFT = 195;   // was 170
const RIGHT_PANEL_TOP = 115;    // was 80
const RIGHT_PANEL_WIDTH = 260;  // was 300
const RIGHT_PANEL_HEIGHT = 300; // was 360
const LEFT_PANEL_LEFT = 40;
const LEFT_PANEL_TOP = 115;
const LEFT_PANEL_WIDTH = 125;
const LEFT_PANEL_HEIGHT = 300;

// Grid configuration
const SLOT_ROWS = 4;  // as requested
const SLOT_COLS = 5;  // change if you want more/less per row
const SLOT_GAP = 8;   // gap between slots

const SLOT_BORDER_WIDTH = 3;
const SLOT_BORDER_COLOR = Color.black;

// Compute slot size to fit the area
const SLOT_SIZE = Math.floor(
  (RIGHT_PANEL_WIDTH - (SLOT_COLS - 1) * SLOT_GAP) / SLOT_COLS
);

const HUD_WIDTH = 500;
const HUD_HEIGHT = 500;

const RootStyle: ViewStyle = {
  position: 'absolute',
  // Center horizontally: (assuming screen width ~1920)
  left: '50%',
  marginLeft: -(HUD_WIDTH / 2), // Offset by half width to center
  // Center vertically: (assuming screen height ~1080)
  top: '50%',
  marginTop: -(HUD_HEIGHT / 2), // Offset by half height to center
  width: HUD_WIDTH,
  height: HUD_HEIGHT,
}

const PlayerStatsContainerStyle: ViewStyle = {
  position: 'absolute',
  left: LEFT_PANEL_LEFT,
  top: LEFT_PANEL_TOP,
  width: LEFT_PANEL_WIDTH,
  height: LEFT_PANEL_HEIGHT,
  // vertical flow
}
const InventoryGridContainerStyle: ViewStyle = {
  position: 'absolute',
  left: RIGHT_PANEL_LEFT,
  top: RIGHT_PANEL_TOP,
  width: RIGHT_PANEL_WIDTH,
  height: RIGHT_PANEL_HEIGHT,
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
  justifyContent: 'flex-start',
  alignItems: 'center',
  paddingTop: 20,
  paddingHorizontal: 20,
  paddingBottom: 20,
}

const SlotItemCodeText: TextStyle = {
  position: 'absolute',
  left: 4,
  top: 4,
  color: Color.black,
  fontSize: 12,
  fontWeight: 'bold',
}

const SlotItemCountText: TextStyle = {
  position: 'absolute',
  right: 4,
  bottom: 4,
  color: Color.black,
  fontSize: 12,
}
