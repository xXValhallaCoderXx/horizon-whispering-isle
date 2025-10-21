/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { ClientStartupReporter } from "ClientStartupReporter";
import { DialogManager } from "DialogManager";
import { Events } from "Events";
import * as GameUtils from 'GameUtils';
import * as hz from 'horizon/core';
import { Player, PropTypes } from "horizon/core";
import { Image, ImageSource, UIComponent, UINode, View } from "horizon/ui";
import { Logger } from "Logger";
import { UIView_DigAction_HUDButton } from "UIView_DigAction_HUDButton";
import { UIView_ExpBarPersistent } from "UIView_ExpBarPersistent";
import { UIView_Inventory } from "UIView_Inventory";
import { UIView_Quest } from "UIView_Quest";
import { UIView_ShovelWidget } from "UIView_ShovelWidget";
import { UIView_TimedReward } from "UIView_TimedReward";
import { UIView_VersionNumber } from "UIView_VersionNumber";

const log = new Logger('UIRoot_InteractionNonBlocking');

export class UIRoot_InteractionNonBlocking extends UIComponent<typeof UIRoot_InteractionNonBlocking> {
  static propsDefinition = {
    missingTexture: { type: PropTypes.Asset },

    timedReward_bagIcon: { type: PropTypes.Asset },
    timedReward_notificationIcon: { type: PropTypes.Asset },

    dialogGeneric_textColor: { type: PropTypes.Color },
    dialogGeneric_titleTextColor: { type: PropTypes.Color },
    dialogGeneric_titleBgColor: { type: PropTypes.Color },
    dialogGeneric_titleBgOutlineColor: { type: PropTypes.Color },
    dialogGeneric_bgColor: { type: PropTypes.Color },
    dialogGeneric_borderColor: { type: PropTypes.Color },
    dialogGeneric_buttonColor: { type: PropTypes.Color },

    shovelHud_image: { type: PropTypes.Asset },

    inventory_slotSize: { type: hz.PropTypes.Number },
    inventory_slotCount: { type: hz.PropTypes.Number },
    inventory_expandedViewH: { type: hz.PropTypes.Number },
    inventory_expandedViewW: { type: hz.PropTypes.Number },
    inventory_maxSlotCount: { type: hz.PropTypes.Number },
    inventory_expandIcon: { type: hz.PropTypes.Asset },
    inventory_fallbackIcon: { type: hz.PropTypes.Asset },
    inventory_selectedColor: { type: hz.PropTypes.Color },
    inventory_defaultBorderColor: { type: hz.PropTypes.Color },

    digAction_image: { type: PropTypes.Asset },

    dialogShovelPurchase_descriptionArrow: { type: hz.PropTypes.Asset },
    dialogShovelPurchase_star: { type: hz.PropTypes.Asset },
    dialogShovelPurchase_leftMoneySlice: { type: hz.PropTypes.Asset },
    dialogShovelPurchase_centerMoneySlice: { type: hz.PropTypes.Asset },
    dialogShovelPurchase_rightMoneySlice: { type: hz.PropTypes.Asset },
    dialogShovelPurchase_power: { type: PropTypes.Asset },
    dialogShovelPurchase_precision: { type: PropTypes.Asset },
    dialogShovelPurchase_luck: { type: PropTypes.Asset },
    dialogShovelPurchase_weight: { type: PropTypes.Asset },

    inventory_arrowUp: { type: PropTypes.Asset },
    inventory_backpack: { type: PropTypes.Asset },
    inventory_pinned: { type: PropTypes.Asset },
    inventory_pin: { type: PropTypes.Asset },
    inventory_unpin: { type: PropTypes.Asset },
    inventory_crossmark: { type: PropTypes.Asset },

    quest_checkmark: { type: PropTypes.Asset },
    quest_icn_giftBox: { type: PropTypes.Asset },
    quest_icn_arrowRight: { type: PropTypes.Asset },
    quest_icn_arrowLeft: { type: PropTypes.Asset },
    quest_icn_newIndicator: { type: PropTypes.Asset },

    icn_lvlBGL: { type: PropTypes.Asset },
    icn_lvlBGC: { type: PropTypes.Asset },
    icn_lvlBGR: { type: PropTypes.Asset },
    icn_money: { type: PropTypes.Asset },
    icn_gem: { type: PropTypes.Asset },

    icon_check: { type: PropTypes.Asset },
    icn_shovel: { type: PropTypes.Asset },
    icn_star: { type: PropTypes.Asset },
    icn_arrowLevelUp: { type: PropTypes.Asset },

    icn_potionBundle: { type: PropTypes.Asset },
  };

  private timedReward!: UIView_TimedReward;
  private dialogManager!: DialogManager;
  private digActionHudButton!: UIView_DigAction_HUDButton;
  private inventory!: UIView_Inventory;
  private versionNumber!: UIView_VersionNumber;
  private quest!: UIView_Quest;
  private expBarPersistent!: UIView_ExpBarPersistent;
  private shovelWidget!: UIView_ShovelWidget;
  private finishedInitializing: boolean = false;

  private owner!: Player;

  start() {
    this.owner = this.world.getLocalPlayer();
    log.info(`Start()`);

    if (this.owner === this.world.getServerPlayer()) {
      log.info(`skipping Start() on server.`);
      this.entity.visible.set(false);
      return;
    }
    log.info("Start() on client");
    this.entity.visible.set(true);

    const expectedBindingCount = 393;
    GameUtils.connectUIFixup(this, expectedBindingCount);

    this.sendNetworkBroadcastEvent(Events.poolObjectInitialized, { player: this.owner, id: "UIRoot_InteractionNonBlocking", entity: this.entity }, [this.world.getServerPlayer()]);
    // Dump some info to the console about the state of this UI.
    this.connectLocalBroadcastEvent(Events.checkPlayerUiState, (payload) => {
      const player = payload.player;
      const uiComponentState = {
        localPlayerId: player.id,
        ownerId: this.entity.owner?.get()?.id,
        visible: this.entity.visible.get(),
        isVisibleToPlayer: this.entity.isVisibleToPlayer(player),
        finishedInitializing: this.finishedInitializing,
        position: this.entity.position.get(),
        panelWidth: this.panelWidth,
        panelHeight: this.panelHeight,
      }
      GameUtils.logToServer(this, `[UIRoot_InteractionNonBlocking] logPlayerUiState() ${JSON.stringify(uiComponentState)}`);
      GameUtils.logUIComponent(this);
    });

    log.info("Start() finished on client");
    ClientStartupReporter.addEntry("UIRoot_InteractionNonBlocking start()", this);
  }

  receiveOwnership(_serializableState: hz.SerializableState, _oldOwner: Player, _newOwner: Player): void {
    if (this.world.getLocalPlayer() !== this.world.getServerPlayer()) {
      this.sendNetworkBroadcastEvent(Events.poolObjectReceived, { player: this.owner, id: "UIRoot_InteractionNonBlocking" }, [this.world.getServerPlayer()]);
      ClientStartupReporter.addEntry("UIRoot_InteractionNonBlocking receiveOwnership()");
    }
  }

  private initializeViews() {
    this.timedReward = new UIView_TimedReward(this);
    this.dialogManager = new DialogManager(this);
    this.digActionHudButton = new UIView_DigAction_HUDButton(this);
    this.inventory = new UIView_Inventory(this);
    this.versionNumber = new UIView_VersionNumber(this);
    this.quest = new UIView_Quest(this);
    this.expBarPersistent = new UIView_ExpBarPersistent(this);
    this.shovelWidget = new UIView_ShovelWidget(this);
  }

  initializeUI(): UINode {
    log.info(`InitializeUI()`);
    if (this.world.getLocalPlayer() === this.world.getServerPlayer()) {
      log.info(`skipping InitializeUI() on server`);
      return View({
        children: [
          Image({ source: ImageSource.fromTextureAsset(this.props.missingTexture!), style: { display: "none" } }),

          Image({ source: ImageSource.fromTextureAsset(this.props.timedReward_bagIcon!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.timedReward_notificationIcon!), style: { display: "none" } }),

          Image({ source: ImageSource.fromTextureAsset(this.props.shovelHud_image!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.digAction_image!), style: { display: "none" } }),

          Image({ source: ImageSource.fromTextureAsset(this.props.inventory_expandIcon!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.inventory_fallbackIcon!), style: { display: "none" } }),

          Image({ source: ImageSource.fromTextureAsset(this.props.dialogShovelPurchase_descriptionArrow!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.dialogShovelPurchase_star!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.dialogShovelPurchase_leftMoneySlice!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.dialogShovelPurchase_centerMoneySlice!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.dialogShovelPurchase_rightMoneySlice!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.dialogShovelPurchase_power!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.dialogShovelPurchase_precision!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.dialogShovelPurchase_luck!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.dialogShovelPurchase_weight!), style: { display: "none" } }),

          Image({ source: ImageSource.fromTextureAsset(this.props.inventory_arrowUp!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.inventory_backpack!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.inventory_pinned!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.inventory_pin!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.inventory_unpin!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.inventory_crossmark!), style: { display: "none" } }),

          Image({ source: ImageSource.fromTextureAsset(this.props.quest_checkmark!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.quest_icn_giftBox!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.quest_icn_arrowRight!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.quest_icn_arrowLeft!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.quest_icn_newIndicator!), style: { display: "none" } }),

          Image({ source: ImageSource.fromTextureAsset(this.props.icn_lvlBGL!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_lvlBGC!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_lvlBGR!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_money!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_gem!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icon_check!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_shovel!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_star!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_arrowLevelUp!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_potionBundle!), style: { display: "none" } }),
        ],
        style: { display: "none" }
      });
    }
    log.info(`InitializeUI() on client`);
    this.initializeViews();
    log.info(`InitializeUI() building view hierarchy on client()`);
    const view = View({
      children: [
        this.timedReward.createView(),
        this.dialogManager.createView(),
        this.digActionHudButton.createView(),
        this.versionNumber.createView(),
        this.quest.createView(),
        this.expBarPersistent.createView(),
        this.inventory.createView(),
        this.shovelWidget.createView(),
      ],
      style: {
        position: "absolute",
        width: "100%",
        height: "100%",
      }
    })
    this.finishedInitializing = true;
    log.info(`InitializeUI() finished on client()`);
    ClientStartupReporter.addEntry("UIRoot_InteractionNonBlocking initializeUI()");
    return view
  }
}
hz.Component.register(UIRoot_InteractionNonBlocking);
