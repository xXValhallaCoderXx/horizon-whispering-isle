/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { ClientStartupReporter } from "ClientStartupReporter";
import { Events } from "Events";
import { FollowPlayerUI } from "FollowPlayerUI";
import * as GameUtils from 'GameUtils';
import * as hz from 'horizon/core';
import { Player, PropTypes } from "horizon/core";
import { Image, ImageSource, UIComponent, UINode, View } from "horizon/ui";
import { Logger } from "Logger";
import { UIView_CatalogGoal } from "UIView_CatalogGoal";
import { UIView_CatalogHudButton } from "UIView_CatalogHudButton";
import { UIView_FollowBonus } from 'UIView_FollowBonus';
import { UIView_Location } from "UIView_Location";
import { UIView_ShopButton } from 'UIView_ShopButton';

const log = new Logger("UIRoot_InteractionNonBlocking3");

export class UIRoot_InteractionNonBlocking3 extends UIComponent<typeof UIRoot_InteractionNonBlocking3> {

  static propsDefinition = {
    catalogHud_image: { type: hz.PropTypes.Asset },

    icn_money: { type: PropTypes.Asset },
    icn_giftbox: { type: PropTypes.Asset },
    icn_gem: { type: PropTypes.Asset },
    icn_cartoonishRay: { type: PropTypes.Asset },

    quest_checkmark: { type: PropTypes.Asset },
    timedReward_notificationIcon: { type: PropTypes.Asset },
    icn_heavycheck: { type: PropTypes.Asset },
    icn_marker: { type: PropTypes.Asset },
    icn_triangleDown: { type: PropTypes.Asset },
    icn_location: { type: PropTypes.Asset },
    icn_star: { type: PropTypes.Asset },
    icn_shop: { type: PropTypes.Asset },

    fanfare_regionComplete: { type: PropTypes.Asset },
  };

  private catalogHudButton!: UIView_CatalogHudButton;
  private catalogGoal!: UIView_CatalogGoal;
  private locationPunchcard!: UIView_Location
  private followBonusUI!: UIView_FollowBonus
  private followPlayerUI!: FollowPlayerUI
  private shopButton!: UIView_ShopButton
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

    const expectedBindingCount = 160;
    GameUtils.connectUIFixup(this, expectedBindingCount);

    this.sendNetworkBroadcastEvent(Events.poolObjectInitialized, { player: this.owner, id: "UIRoot_InteractionNonBlocking3", entity: this.entity }, [this.world.getServerPlayer()]);
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
      GameUtils.logToServer(this, `[UIRoot_InteractionNonBlocking3] logPlayerUiState() ${JSON.stringify(uiComponentState)}`);
      GameUtils.logUIComponent(this);
    });

    log.info("Start() finished on client");
    ClientStartupReporter.addEntry("UIRoot_InteractionNonBlocking3 start()", this);
  }

  receiveOwnership(_serializableState: hz.SerializableState, _oldOwner: Player, _newOwner: Player): void {
    if (this.world.getLocalPlayer() !== this.world.getServerPlayer()) {
      this.sendNetworkBroadcastEvent(Events.poolObjectReceived, { player: this.owner, id: "UIRoot_InteractionNonBlocking3" }, [this.world.getServerPlayer()]);
      ClientStartupReporter.addEntry("UIRoot_InteractionNonBlocking3 receiveOwnership()");
    }
  }

  private initializeViews() {
    this.catalogHudButton = new UIView_CatalogHudButton(this);
    this.catalogGoal = new UIView_CatalogGoal(this);
    this.locationPunchcard = new UIView_Location(this);
    this.followBonusUI = new UIView_FollowBonus(this)
    this.followPlayerUI = new FollowPlayerUI(this)
    this.shopButton = new UIView_ShopButton(this);
  }

  initializeUI(): UINode {
    log.info(`InitializeUI()`);
    if (this.world.getLocalPlayer() === this.world.getServerPlayer()) {
      log.info(`skipping InitializeUI() on server`);
      return View({
        children: [
          Image({ source: ImageSource.fromTextureAsset(this.props.catalogHud_image!), style: { display: "none" } }),

          Image({ source: ImageSource.fromTextureAsset(this.props.icn_giftbox!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_money!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_gem!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_cartoonishRay!), style: { display: "none" } }),

          Image({ source: ImageSource.fromTextureAsset(this.props.quest_checkmark!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.timedReward_notificationIcon!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_heavycheck!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_marker!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_triangleDown!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_location!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_star!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.fanfare_regionComplete!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_shop!), style: { display: "none" } }),
        ],
        style: { display: "none" }
      });
    }
    log.info(`InitializeUI() on client`);
    this.initializeViews();
    log.info(`InitializeUI() building view hierarchy on client()`);
    const view = View({
      children: [
        this.catalogHudButton.createView(),
        this.catalogGoal.createView(),
        this.locationPunchcard.createView(),
        this.followBonusUI.createView(),
        this.followPlayerUI.createView(),
        this.shopButton.createView(),
      ],
      style: {
        position: "absolute",
        width: "100%",
        height: "100%",
      }
    })
    this.finishedInitializing = true;
    log.info(`InitializeUI() finished on client()`);
    ClientStartupReporter.addEntry("UIRoot_InteractionNonBlocking3 initializeUI()");
    return view;
  }
}
hz.Component.register(UIRoot_InteractionNonBlocking3);
