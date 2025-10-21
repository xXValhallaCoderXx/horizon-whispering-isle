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
import { UIView_DigResultHud } from "UIView_DigResultHud";
import { UIView_DigStreak } from "UIView_DigStreak";
import { UIView_ExpBarPopup } from 'UIView_ExpBarPopup';
import { UIView_LTENotification } from "UIView_LTENotification";
import { UIView_LTETimer } from "UIView_LTETimer";
import { UIView_Minigame } from "UIView_Minigame";
import { UIView_QuestComplete_Reward } from "UIView_QuestComplete_Reward";
import { UIView_ToastHud } from "UIView_ToastHud";

const log = new Logger('UIRoot_NoInteraction');

export class UIRoot_NoInteraction extends UIComponent<typeof UIRoot_NoInteraction> {
  static propsDefinition = {
    digResultHud_fallbackIcon: { type: PropTypes.Asset },
    digResultHud_SunburstJunkTextureAsset: { type: PropTypes.Asset },
    digResultHud_SunburstOrdinaryTextureAsset: { type: PropTypes.Asset },
    digResultHud_SunburstRareTextureAsset: { type: PropTypes.Asset },
    digResultHud_SunburstEpicTextureAsset: { type: PropTypes.Asset },
    digResultHud_SunburstLegendaryTextureAsset: { type: PropTypes.Asset },
    digResultHud_SunburstMythicalTextureAsset: { type: PropTypes.Asset },
    digResultHud_ShadowTextureAsset: { type: PropTypes.Asset },
    digResultHud_NewItemTextureAsset: { type: PropTypes.Asset },
    digResultHud_NewHeaviestItemTextureAsset: { type: PropTypes.Asset },
    digResultHud_GemTextureAsset: { type: PropTypes.Asset },

    icn_lvlBGL: {type: PropTypes.Asset},
    icn_lvlBGC: {type: PropTypes.Asset},
    icn_lvlBGR: {type: PropTypes.Asset},

    icn_smallShovel: {type: PropTypes.Asset},
    icn_gem: {type: PropTypes.Asset},
  };

  private expBarPopup!: UIView_ExpBarPopup;
  private toastHud!: UIView_ToastHud;
  private digResultHud!: UIView_DigResultHud;
  private lteNotification!: UIView_LTENotification;
  private lteTimer!: UIView_LTETimer;
  private minigame!: UIView_Minigame;
  private digStreak!: UIView_DigStreak;
  private questReward!: UIView_QuestComplete_Reward;
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
    log.info(`Start() on client.`);
    this.entity.visible.set(true);

    const expectedBindingCount = 153;
    GameUtils.connectUIFixup(this, expectedBindingCount);

    this.sendNetworkBroadcastEvent(Events.poolObjectInitialized, { player: this.owner, id: "UIRoot_NoInteraction", entity: this.entity }, [this.world.getServerPlayer()]);

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
      GameUtils.logToServer(this, `[UIRoot_NoInteraction] logPlayerUiState() ${JSON.stringify(uiComponentState)}`);
      GameUtils.logUIComponent(this);
    });

    log.info("Start() finished on client");
    ClientStartupReporter.addEntry("UIRoot_NoInteraction start()", this);
  }

  receiveOwnership(_serializableState: hz.SerializableState, _oldOwner: Player, _newOwner: Player): void {
    if (this.world.getLocalPlayer() !== this.world.getServerPlayer()) {
      this.sendNetworkBroadcastEvent(Events.poolObjectReceived, { player: this.owner, id: "UIRoot_NoInteraction" }, [this.world.getServerPlayer()]);
      ClientStartupReporter.addEntry("UIRoot_NoInteraction receiveOwnership()");
    }
  }

  private initializeViews() {
    this.expBarPopup = new UIView_ExpBarPopup(this);
    this.toastHud = new UIView_ToastHud(this);
    this.digResultHud = new UIView_DigResultHud(this);
    this.lteNotification = new UIView_LTENotification(this);
    this.lteTimer = new UIView_LTETimer(this);
    this.minigame = new UIView_Minigame(this);
    this.digStreak = new UIView_DigStreak(this);
    this.questReward = new UIView_QuestComplete_Reward(this);
  }

  initializeUI(): UINode {
    log.info(`InitializeUI()`);
    if (this.world.getLocalPlayer() === this.world.getServerPlayer()) {
      log.info(`skipping InitializeUI() on server`);
      return View({
        children: [
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_lvlBGL!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_lvlBGC!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_lvlBGR!), style: { display: "none" } }),

          Image({ source: ImageSource.fromTextureAsset(this.props.digResultHud_fallbackIcon!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.digResultHud_SunburstJunkTextureAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.digResultHud_SunburstOrdinaryTextureAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.digResultHud_SunburstRareTextureAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.digResultHud_SunburstEpicTextureAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.digResultHud_SunburstLegendaryTextureAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.digResultHud_SunburstMythicalTextureAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.digResultHud_ShadowTextureAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.digResultHud_NewItemTextureAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.digResultHud_NewHeaviestItemTextureAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.digResultHud_GemTextureAsset!), style: { display: "none" } }),

          Image({ source: ImageSource.fromTextureAsset(this.props.icn_smallShovel!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_gem!), style: { display: "none" } }),
        ],
        style: { display: "none" }
      });
    }
    log.info(`InitializeUI() on client`);
    this.initializeViews();
    log.info(`InitializeUI() building view hierarchy on client()`);
    const view = View({
      children: [
        this.expBarPopup.createView(),
        this.toastHud.createView(),
        this.digResultHud.createView(),
        this.lteNotification.createView(),
        this.minigame.createView(),
        this.lteTimer.createView(),
        this.digStreak.createView(),
        this.questReward.createView(),
      ],
      style: {
        position: "absolute",
        width: "100%",
        height: "100%",
      }
    })
    this.finishedInitializing = true;
    log.info(`InitializeUI() finished on client()`);
    ClientStartupReporter.addEntry("UIRoot_NoInteraction initializeUI()");
    return view;
  }
}
hz.Component.register(UIRoot_NoInteraction);
