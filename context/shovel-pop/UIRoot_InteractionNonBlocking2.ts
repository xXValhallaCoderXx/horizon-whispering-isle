/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { ClientStartupReporter } from "ClientStartupReporter";
import { Events } from "Events";
import * as GameUtils from 'GameUtils';
import * as hz from 'horizon/core';
import { Player, PropTypes } from "horizon/core";
import { Image, ImageSource, UIComponent, UINode, View } from "horizon/ui";
import { Logger } from "Logger";
import { UIView_PotionGatcha } from "UIView_PotionGatcha";
import { UIView_PotionInventory } from "UIView_PotionInventory";
import { UIView_PotionsHud } from "UIView_PotionsHud";

const log = new Logger("UIRoot_InteractionNonBlocking2");

export class UIRoot_InteractionNonBlocking2 extends UIComponent<typeof UIRoot_InteractionNonBlocking2> {

  static propsDefinition = {
    inventory_arrowUp: { type: PropTypes.Asset },
    inventory_backpack: { type: PropTypes.Asset },
    inventory_pinned: { type: PropTypes.Asset },
    inventory_pin: { type: PropTypes.Asset },
    inventory_unpin: { type: PropTypes.Asset },
    inventory_crossmark: { type: PropTypes.Asset },

    icn_smallShovel: { type: PropTypes.Asset },
    icn_potionHUD: { type: PropTypes.Asset },
    icn_potionBundle: { type: PropTypes.Asset },
  };

  private potionInventory!: UIView_PotionInventory;
  private potionsHud!: UIView_PotionsHud;
  private potionGatcha!: UIView_PotionGatcha;

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

    const expectedBindingCount = 297;
    GameUtils.connectUIFixup(this, expectedBindingCount);

    this.sendNetworkBroadcastEvent(Events.poolObjectInitialized, { player: this.owner, id: "UIRoot_InteractionNonBlocking2", entity: this.entity }, [this.world.getServerPlayer()]);
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
      GameUtils.logToServer(this, `[UIRoot_InteractionNonBlocking2] logPlayerUiState() ${JSON.stringify(uiComponentState)}`);
      GameUtils.logUIComponent(this);
    });

    log.info("Start() finished on client");
    ClientStartupReporter.addEntry("UIRoot_InteractionNonBlocking2 start()", this);
  }

  receiveOwnership(_serializableState: hz.SerializableState, _oldOwner: Player, _newOwner: Player): void {
    if (this.world.getLocalPlayer() !== this.world.getServerPlayer()) {
      this.sendNetworkBroadcastEvent(Events.poolObjectReceived, { player: this.owner, id: "UIRoot_InteractionNonBlocking2" }, [this.world.getServerPlayer()]);
      ClientStartupReporter.addEntry("UIRoot_InteractionNonBlocking2 receiveOwnership()");
    }
  }

  private initializeViews() {
    this.potionInventory = new UIView_PotionInventory(this);
    this.potionsHud = new UIView_PotionsHud(this);
    this.potionGatcha = new UIView_PotionGatcha(this);
  }

  initializeUI(): UINode {
    log.info(`InitializeUI()`);
    if (this.world.getLocalPlayer() === this.world.getServerPlayer()) {
      log.info(`skipping InitializeUI() on server`);
      return View({
        children: [
          Image({ source: ImageSource.fromTextureAsset(this.props.inventory_arrowUp!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.inventory_backpack!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.inventory_pinned!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.inventory_pin!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.inventory_unpin!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.inventory_crossmark!), style: { display: "none" } }),

          Image({ source: ImageSource.fromTextureAsset(this.props.icn_smallShovel!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_potionHUD!), style: { display: "none" } }),
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
        this.potionInventory.createView(),
        this.potionsHud.createView(),
        this.potionGatcha.createView(),
      ],
      style: {
        position: "absolute",
        width: "100%",
        height: "100%",
      }
    })
    this.finishedInitializing = true;
    log.info(`InitializeUI() finished on client()`);
    ClientStartupReporter.addEntry("UIRoot_InteractionNonBlocking2 initializeUI()");
    return view;
  }
}
hz.Component.register(UIRoot_InteractionNonBlocking2);
