/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { ClientStartupReporter } from "ClientStartupReporter";
import { DailyRewardsUI } from "daily_rewards_ui";
import { Events } from "Events";
import * as GameUtils from 'GameUtils';
import * as hz from 'horizon/core';
import { Player, PropTypes } from "horizon/core";
import { Image, ImageSource, UIComponent, UINode, View } from "horizon/ui";
import { Logger } from "Logger";
import { PanelEvents } from "ui_toggle_button";
import { UIView_Fanfare } from "UIView_Fanfare";
import { UIView_ShovelInventory } from "UIView_ShovelInventory";
import { UIView_Shovelution } from "UIView_Shovelution";
import { UIView_MigrationPrompt } from "UIView_MigrationPrompt";
import { UIView_MigrationRewards } from "UIView_MigrationRewards";

const log = new Logger("UIRoot_InteractionBlocking");

export class UIRoot_InteractionBlocking extends UIComponent<typeof UIRoot_InteractionBlocking> {
  static propsDefinition = {
    shovelInventory_power: { type: PropTypes.Asset },
    shovelInventory_precision: { type: PropTypes.Asset },
    shovelInventory_luck: { type: PropTypes.Asset },
    shovelInventory_weight: { type: PropTypes.Asset },
    shovelInventory_fullstar: { type: PropTypes.Asset },
    shovelInventory_emptyStar: { type: PropTypes.Asset },
    shovelInventory_arrow: { type: PropTypes.Asset },
    shovelInventory_missingShovel: { type: PropTypes.Asset },
    shovelInventory_gems: { type: PropTypes.Asset },
    shovelInventory_star: { type: PropTypes.Asset },
    icn_arrowLevelUp: { type: PropTypes.Asset },
    icn_arrowRight: { type: PropTypes.Asset },

    tutorialNotification_textColor: { type: hz.PropTypes.Color },
    tutorialNotification_titleTextColor: { type: hz.PropTypes.Color },
    tutorialNotification_titleBgColor: { type: hz.PropTypes.Color },
    tutorialNotification_titleBgOutlineColor: { type: hz.PropTypes.Color },
    tutorialNotification_bgColor: { type: hz.PropTypes.Color },
    tutorialNotification_borderColor: { type: hz.PropTypes.Color },
    tutorialNotification_buttonColor: { type: hz.PropTypes.Color },
    tutorialNotification_questOverlayAsset: { type: hz.PropTypes.Asset },
    tutorialNotification_shovelOverlayAsset: { type: hz.PropTypes.Asset },
    tutorialNotification_actionOverlayAsset: { type: hz.PropTypes.Asset },
    tutorialNotification_arrowOverlayAsset: { type: hz.PropTypes.Asset },
    tutorialNotification_zoneOverlayAsset: { type: hz.PropTypes.Asset },
    tutorialNotification_regionOverlayAsset: { type: hz.PropTypes.Asset },
    tutorialNotification_catalogOverlayAsset: { type: hz.PropTypes.Asset },
    tutorialNotification_shovelInventoryOverlayAsset: { type: hz.PropTypes.Asset },

    fanfare_image: { type: PropTypes.Asset },
    fanfare_particleFx: { type: PropTypes.Entity },
    fanfare_confettiFx: { type: PropTypes.Entity },
    fanfare_sound: { type: PropTypes.Entity },
    fanfare_regionComplete: { type: PropTypes.Asset },
    fanfare_sunburst: { type: PropTypes.Asset },
    shovelution_sfx: { type: PropTypes.Entity },

    icn_Doug: {type: PropTypes.Asset},
    icn_Fred: {type: PropTypes.Asset},
    moneyBagSmall3: {type: PropTypes.Asset},
    potionCyan: {type: PropTypes.Asset},
    icn_Horizon: {type: PropTypes.Asset},

    icn_notification: { type: PropTypes.Asset },
  };

  private shovelInventory!: UIView_ShovelInventory;
  private fanfare!: UIView_Fanfare
  private shovelution!: UIView_Shovelution
  private migrationPrompt!: UIView_MigrationPrompt
  private migrationRewards!: UIView_MigrationRewards

  private visibleRefCount = 0;
  private finishedInitializing: boolean = false;
  private owner!: Player;

  setVisibility(visible: boolean) {
    if (visible) {
      if (this.visibleRefCount === 0) {
        this.entity.visible.set(true);
      }

      this.visibleRefCount++;
    }
    else {
      this.visibleRefCount--;
      this.visibleRefCount = Math.max(0, this.visibleRefCount);
      if (this.visibleRefCount === 0) {
        this.entity.visible.set(false);
      }
    }
  }

  start() {
    this.owner = this.world.getLocalPlayer();
    log.info(`Start()`);
    if (this.owner === this.world.getServerPlayer()) {
      log.info(`skipping Start() on server.`);
      this.entity.visible.set(false);
      return;
    }
    log.info("Start() on client");
    this.entity.visible.set(false);

    const expectedBindingCount = 178;
    GameUtils.connectUIFixup(this, expectedBindingCount, true);

    this.connectLocalBroadcastEvent(Events.setPlayerBlocking, (data) => {
      this.setVisibility(data.isBlocking);
    });

    this.connectNetworkBroadcastEvent(Events.ShowDailyRewardEvent, (data) => {
      DailyRewardsUI.InitialShow = true
      this.sendLocalBroadcastEvent(PanelEvents.ShowPanel, { player: this.owner, id: "main_daily_rewards" });
    })

    this.sendNetworkBroadcastEvent(Events.poolObjectInitialized, { player: this.owner, id: "UIRoot_InteractionBlocking", entity: this.entity }, [this.world.getServerPlayer()]);
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
      GameUtils.logToServer(this, `[UIRoot_InteractionBlocking] logPlayerUiState() ${JSON.stringify(uiComponentState)}`);
      GameUtils.logUIComponent(this);
    });

    log.info("Start() finished on client");
    ClientStartupReporter.addEntry("UIRoot_InteractionBlocking start()", this);
  }

  receiveOwnership(_serializableState: hz.SerializableState, _oldOwner: Player, _newOwner: Player): void {
    if (this.world.getLocalPlayer() !== this.world.getServerPlayer()) {
      this.sendNetworkBroadcastEvent(Events.poolObjectReceived, { player: this.owner, id: "UIRoot_InteractionBlocking" }, [this.world.getServerPlayer()]);
      ClientStartupReporter.addEntry("UIRoot_InteractionBlocking receiveOwnership()");
    }
  }

  private initializeViews() {
    this.shovelInventory = new UIView_ShovelInventory(this);
    this.fanfare = new UIView_Fanfare(this);
    this.shovelution = new UIView_Shovelution(this);
    this.migrationPrompt = new UIView_MigrationPrompt(this)
    this.migrationRewards = new UIView_MigrationRewards(this)
  }

  initializeUI(): UINode {
    log.info(`InitializeUI()`);
    if (this.world.getLocalPlayer() === this.world.getServerPlayer()) {
      log.info(`skipping InitializeUI() on server`);
      return View({
        children: [
          Image({ source: ImageSource.fromTextureAsset(this.props.shovelInventory_power!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.shovelInventory_precision!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.shovelInventory_luck!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.shovelInventory_weight!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.shovelInventory_fullstar!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.shovelInventory_emptyStar!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.shovelInventory_arrow!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.shovelInventory_missingShovel!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.shovelInventory_gems!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.shovelInventory_star!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_arrowLevelUp!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_arrowRight!), style: { display: "none" } }),

          Image({ source: ImageSource.fromTextureAsset(this.props.tutorialNotification_questOverlayAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.tutorialNotification_shovelOverlayAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.tutorialNotification_actionOverlayAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.tutorialNotification_arrowOverlayAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.tutorialNotification_zoneOverlayAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.tutorialNotification_regionOverlayAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.tutorialNotification_catalogOverlayAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.tutorialNotification_shovelInventoryOverlayAsset!), style: { display: "none" } }),

          Image({ source: ImageSource.fromTextureAsset(this.props.fanfare_image!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.fanfare_regionComplete!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.fanfare_sunburst!), style: { display: "none" } }),

          Image({ source: ImageSource.fromTextureAsset(this.props.icn_Doug!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_Fred!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.moneyBagSmall3!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.potionCyan!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_Horizon!), style: { display: "none" } }),

          Image({ source: ImageSource.fromTextureAsset(this.props.icn_notification!), style: { display: "none" } }),
        ],
        style: { display: "none" }
      });
    }
    log.info(`InitializeUI() on client`);
    this.initializeViews();
    log.info(`InitializeUI() building view hierarchy on client()`);
    const view = View({
      children: [
        this.shovelInventory.createView(),
        this.fanfare.createView(),
        this.shovelution.createView(),
        this.migrationPrompt.createView(),
        this.migrationRewards.createView(),
      ],
      style: {
        position: "absolute",
        width: "100%",
        height: "100%",
      }
    })
    this.finishedInitializing = true;
    log.info(`InitializeUI() finished on client()`);
    ClientStartupReporter.addEntry("UIRoot_InteractionBlocking initializeUI()");
    return view;
  }
}
hz.Component.register(UIRoot_InteractionBlocking);
