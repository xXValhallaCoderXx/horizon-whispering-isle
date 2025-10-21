/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Events } from "Events";
import { Component, NetworkEvent, Player, SerializableState } from "horizon/core";
import { UINode, View } from "horizon/ui";
import { Logger } from "Logger";
import { PlayerInteractionTrigger } from "PlayerInteractionTrigger";
import { UIView_InteractionNonBlockingBase } from "UIRoot_ChildrenBase";
import { UIRoot_InteractionNonBlocking } from "UIRoot_InteractionNonBlocking";
import { BackpackPurchaseDialogParams, UIView_BackpackPurchase } from "UIView_BackpackPurchase";
import { GenericDialogCallback, GenericDialogParams, ShowingDialogCallback, UIView_DialogGeneric } from "UIView_DialogGeneric";
import { ShovelPurchaseDialogCallback, ShovelPurchaseDialogParams, UIView_DialogShovelPurchase } from "UIView_DialogShovelPurchase";
import { PopupDialogCallback, PopupDialogParams, UIView_PopupDialog } from "UIView_PopupDialog";
import { PotionPurchaseDialogCallback, PotionPurchaseDialogParams, UIView_PotionPurchase } from "UIView_PotionPurchase";

const MAX_PLAYERS = BigInt(64);   // using 64 for a bit of future proofing... we space out dialog ids by max player account so
// that each player uses a unique set of ids relative to each other based on the player.id value.
// For example, player ID 1 will use ids 1, 65, 129..... (64 * n) + player.index
const MULTIPLE_DIALOG_DELAY = 200;
const PLAYER_INTERACTION_DELAY_AFTER_HIDE = 700;
const DIALOG_VIEW_HIDE_DELAY = 250;

const log = new Logger("DialogManager");
const hudHideContext = "uiview_dialog_generic";

// Dialog Internal Parameter Types
type GenericDialogParamsInternal = InternalDialogParams & GenericDialogParams;
type ShovelPurchaseDialogParamsInternal = InternalDialogParams & ShovelPurchaseDialogParams;
type PotionPurchaseDialogParamsInternal = InternalDialogParams & PotionPurchaseDialogParams;
type BackpackPurchaseDialogParamsInternal = InternalDialogParams & BackpackPurchaseDialogParams;
type PopupDialogParamsInternal = InternalDialogParams & PopupDialogParams;

// Dialog Type Enum
enum DialogType {
  Generic,
  ShovelPurchase,
  PotionPurchase,
  BackpackPurchase,
  Popup
}

export class DialogManager extends UIView_InteractionNonBlockingBase {

  // Dialog view references
  private genericDialogView: UIView_DialogGeneric;
  private shovelPurchaseDialogView: UIView_DialogShovelPurchase;
  private potionPurchaseDialogView: UIView_PotionPurchase;
  private backpackPurchaseDialogView: UIView_BackpackPurchase;
  private popupDialogView: UIView_PopupDialog

  private dialogId: bigint = BigInt(0);
  private requestingPlayer?: Player;
  private isActive = false;
  private hasMadeSelection = false;
  private nextDialogDelayMs: number = MULTIPLE_DIALOG_DELAY;
  private dialogQueue = new Array<InternalDialogParams>();
  private currentDialogType?: DialogType;
  private isPlayerBlocked: boolean = false;

  // Dialog Network Events
  private static showGenericDialog = new NetworkEvent<GenericDialogParamsInternal>("showGenericDialog");
  private static showGenericDialogResponse = new NetworkEvent<{ selection: number, player: Player, id: bigint }>("showGenericDialogResponse");
  private static showShovelPurchaseDialog = new NetworkEvent<ShovelPurchaseDialogParamsInternal>("showShovelPurchaseDialog");
  private static showShovelPurchaseDialogResponse = new NetworkEvent<{ purchase: boolean, player: Player, id: bigint }>("showShovelPurchaseDialogResponse");
  private static showPotionPurchaseDialog = new NetworkEvent<PotionPurchaseDialogParamsInternal>("showPotionPurchaseDialog");
  private static showPotionPurchaseDialogResponse = new NetworkEvent<{ multiple: number, player: Player, id: bigint }>("showPotionPurchaseDialogResponse");
  private static showBackpackPurchaseDialog = new NetworkEvent<BackpackPurchaseDialogParamsInternal>("showBackpackPurchaseDialog");
  private static showBackpackPurchaseDialogResponse = new NetworkEvent<{ purchase: boolean, player: Player, id: bigint }>("showBackpackPurchaseDialogResponse");
  private static showPopupDialog = new NetworkEvent<PopupDialogParamsInternal>("showPopupDialog");
  private static showPopupDialogResponse = new NetworkEvent<{ selection: number, player: Player, id: bigint }>("showPopupDialogResponse");
  private static cancelDialog = new NetworkEvent<{ id: bigint }>("cancelDialog");
  private static showingDialog = new NetworkEvent<{ player: Player, id: bigint }>("showingGenericDialog");


  private static nextDialogID: bigint = BigInt(0);

  constructor(uiRoot: UIRoot_InteractionNonBlocking) {
    super(uiRoot);
    log.info("Start");
    DialogManager.nextDialogID = BigInt(this.localPlayer.index.get());

    // Dialog View Construction
    this.genericDialogView = new UIView_DialogGeneric(uiRoot, selection => this.onGenericDialogSelection(selection));
    this.shovelPurchaseDialogView = new UIView_DialogShovelPurchase(uiRoot, purchase => this.onShovelPurchaseDialogSelection(purchase));
    this.potionPurchaseDialogView = new UIView_PotionPurchase(uiRoot, purchase => this.onPotionPurchaseDialogSelection(purchase));
    this.backpackPurchaseDialogView = new UIView_BackpackPurchase(uiRoot, purchase => this.onBackpackPurchaseDialogSelection(purchase));
    this.popupDialogView = new UIView_PopupDialog(uiRoot, selection => this.onPopupDialogSelection(selection));

    // Dialog Network Event Connections
    this.uiRoot.connectNetworkBroadcastEvent(DialogManager.cancelDialog, payload => this.onCancelDialog(payload.id));
    this.uiRoot.connectNetworkBroadcastEvent(DialogManager.showGenericDialog, params => this.onShowDialog(params));
    this.uiRoot.connectNetworkBroadcastEvent(DialogManager.showShovelPurchaseDialog, params => this.onShowDialog(params));
    this.uiRoot.connectNetworkBroadcastEvent(DialogManager.showPotionPurchaseDialog, params => this.onShowDialog(params));
    this.uiRoot.connectNetworkBroadcastEvent(DialogManager.showBackpackPurchaseDialog, params => this.onShowDialog(params));
    this.uiRoot.connectNetworkBroadcastEvent(DialogManager.showPopupDialog, params => this.onShowDialog(params));
  }

  // --------  Static Dialog API  --------

  public static show(component: Component, targetPlayer: Player, params: GenericDialogParams, callback?: GenericDialogCallback, showingCallback?: ShowingDialogCallback): bigint {
    const id = this.getNextDialogID();
    const player = component.world.getLocalPlayer();
    log.info(`Requesting dialog (title: ${params.title} id: ${id}) for player (${targetPlayer.id})`);
    const event = component.connectNetworkBroadcastEvent(DialogManager.showGenericDialogResponse, payload => {
      if (payload.id === id) {
        event.disconnect();
        log.info(`Received dialog response (title: ${params.title} id: ${id}) from player (${payload.player.id})`);
        if (callback !== undefined) {
          callback(payload.player, payload.selection);
        }
      }
    });
    DialogManager.setupShowingDialogCallback(component, targetPlayer, id, showingCallback);
    const internalParams: GenericDialogParamsInternal = {
      ...params,
      id,
      requestingPlayer: player,
      dialogType: DialogType.Generic,
      blockPlayer: true
    };
    component.sendNetworkBroadcastEvent(DialogManager.showGenericDialog, internalParams, [targetPlayer]);
    return id;
  }

  public static showShovelPurchase(component: Component, targetPlayer: Player, params: ShovelPurchaseDialogParams, callback?: ShovelPurchaseDialogCallback, showingCallback?: ShowingDialogCallback): bigint {
    const id = this.getNextDialogID();
    const player = component.world.getLocalPlayer();
    log.info(`Requesting shovel purchase dialog (shovel: ${params.shovelID} id: ${id}) for player (${targetPlayer.id})`);
    const event = component.connectNetworkBroadcastEvent(DialogManager.showShovelPurchaseDialogResponse, payload => {
      if (payload.id === id) {
        event.disconnect();
        log.info(`Received dialog response (shovel: ${params.shovelID} id: ${id}) from player (${payload.player.id})`);
        if (callback != undefined) {
          callback(payload.purchase, payload.player);
        }
      }
    });
    DialogManager.setupShowingDialogCallback(component, targetPlayer, id, showingCallback);
    const internalParams: ShovelPurchaseDialogParamsInternal = {
      ...params,
      id,
      requestingPlayer: player,
      dialogType: DialogType.ShovelPurchase,
      blockPlayer: true
    };
    component.sendNetworkBroadcastEvent(DialogManager.showShovelPurchaseDialog, internalParams, [targetPlayer]);
    return id;
  }

  public static showPotionPurchase(component: Component, targetPlayer: Player, params: PotionPurchaseDialogParams, callback?: PotionPurchaseDialogCallback, showingCallback?: ShowingDialogCallback): bigint {
    const id = this.getNextDialogID();
    const player = component.world.getLocalPlayer();
    log.info(`Requesting shovel purchase dialog (shovel: ${params.shovelID} id: ${id}) for player (${targetPlayer.id})`);
    const event = component.connectNetworkBroadcastEvent(DialogManager.showPotionPurchaseDialogResponse, payload => {
      if (payload.id === id) {
        event.disconnect();
        log.info(`Received dialog response (shovel: ${params.shovelID} id: ${id}) from player (${payload.player.id})`);
        if (callback !== undefined) {
          callback(payload.multiple, payload.player);
        }
      }
    });
    DialogManager.setupShowingDialogCallback(component, targetPlayer, id, showingCallback);
    const internalParams: PotionPurchaseDialogParamsInternal = {
      ...params,
      id,
      requestingPlayer: player,
      dialogType: DialogType.PotionPurchase,
      blockPlayer: true
    };
    component.sendNetworkBroadcastEvent(DialogManager.showPotionPurchaseDialog, internalParams, [targetPlayer]);
    return id;
  }

  public static showBackpackPurchase(component: Component, targetPlayer: Player, params: BackpackPurchaseDialogParams, callback?: ShovelPurchaseDialogCallback, showingCallback?: ShowingDialogCallback): bigint {
    const id = this.getNextDialogID();
    const player = component.world.getLocalPlayer();
    log.info(`Requesting backpack purchase dialog (level: ${params.nextBackpackLevel} id: ${id}) for player (${targetPlayer.id})`);
    const event = component.connectNetworkBroadcastEvent(DialogManager.showBackpackPurchaseDialogResponse, payload => {
      if (payload.id === id) {
        event.disconnect();
        log.info(`Received dialog response (level: ${params.nextBackpackLevel} id: ${id}) from player (${payload.player.id})`);
        if (callback !== undefined) {
          callback(payload.purchase, payload.player);
        }
      }
    });
    DialogManager.setupShowingDialogCallback(component, targetPlayer, id, showingCallback);
    const internalParams: BackpackPurchaseDialogParamsInternal = {
      ...params,
      id,
      requestingPlayer: player,
      dialogType: DialogType.BackpackPurchase,
      blockPlayer: true
    };
    component.sendNetworkBroadcastEvent(DialogManager.showBackpackPurchaseDialog, internalParams, [targetPlayer]);
    return id;
  }

  public static showPopup(component: Component, targetPlayer: Player, params: PopupDialogParams, callback?: PopupDialogCallback, showingCallback?: ShowingDialogCallback): bigint {
    const id = this.getNextDialogID();
    const player = component.world.getLocalPlayer();
    log.info(`Requesting popup dialog (title: ${params.title} id: ${id}) for player (${targetPlayer.id})`);
    const event = component.connectNetworkBroadcastEvent(DialogManager.showPopupDialogResponse, payload => {
      if (payload.id === id) {
        event.disconnect();
        log.info(`Received popup dialog response (title: ${params.title} id: ${id}) from player (${payload.player.id})`);
        if (callback != undefined) {
          callback(payload.player, payload.selection);
        }
      }
    });
    DialogManager.setupShowingDialogCallback(component, targetPlayer, id, showingCallback);
    const internalParams: PopupDialogParamsInternal = {
      ...params,
      id,
      requestingPlayer: player,
      dialogType: DialogType.Popup,
      blockPlayer: params.blockPlayerMovement ?? true
    };
    component.sendNetworkBroadcastEvent(DialogManager.showPopupDialog, internalParams, [targetPlayer]);
    return id;
  }

  public static setupShowingDialogCallback(component: Component, targetPlayer: Player, id: bigint, callback?: ShowingDialogCallback) {
    if (callback != undefined) {
      const event = component.connectNetworkBroadcastEvent(DialogManager.showingDialog, payload => {
        if (payload.id === id) {
          event.disconnect();
          log.info(`Showing dialog (id: ${id}) from player (${payload.player.id})`);
          callback(targetPlayer);
        }
      });
    }
  }

  public static cancel(component: Component, targetPlayer: Player, id: bigint) {
    component.sendNetworkBroadcastEvent(DialogManager.cancelDialog, { id }, [targetPlayer]);
  }

  // -------- Dialog Selection Handlers --------

  private onGenericDialogSelection(option: number) {
    this.onDialogSelection(DialogManager.showGenericDialogResponse,
      { selection: option, player: this.uiRoot.world.getLocalPlayer(), id: this.dialogId });
  }

  private onShovelPurchaseDialogSelection(purchase: boolean) {
    this.onDialogSelection(DialogManager.showShovelPurchaseDialogResponse,
      { purchase: purchase, player: this.uiRoot.world.getLocalPlayer(), id: this.dialogId });
  }

  private onPotionPurchaseDialogSelection(multiple: number) {
    this.onDialogSelection(DialogManager.showPotionPurchaseDialogResponse,
      { multiple: multiple, player: this.uiRoot.world.getLocalPlayer(), id: this.dialogId });
  }

  private onBackpackPurchaseDialogSelection(purchase: boolean) {
    this.onDialogSelection(DialogManager.showBackpackPurchaseDialogResponse,
      { purchase: purchase, player: this.uiRoot.world.getLocalPlayer(), id: this.dialogId });
  }

  private onPopupDialogSelection(option: number) {
    this.onDialogSelection(DialogManager.showPopupDialogResponse,
      { selection: option, player: this.uiRoot.world.getLocalPlayer(), id: this.dialogId });
  }

  // --------  Dialog View Methods  --------

  private setupCurrentDialog(params: InternalDialogParams) {
    switch (params.dialogType) {
      case DialogType.Generic:
        this.genericDialogView.setup(params as GenericDialogParamsInternal);
        break;
      case DialogType.ShovelPurchase:
        this.shovelPurchaseDialogView.setup(params as ShovelPurchaseDialogParamsInternal);
        break;
      case DialogType.PotionPurchase:
      this.potionPurchaseDialogView.setup(params as PotionPurchaseDialogParamsInternal);
        break;
      case DialogType.BackpackPurchase:
        this.backpackPurchaseDialogView.setup(params as BackpackPurchaseDialogParamsInternal);
        break;
      case DialogType.Popup:
        this.popupDialogView.setup(params as PopupDialogParamsInternal);
        break;
    }
  }

  private setDialogVisible(dialogType: DialogType | undefined, isVisible: boolean) {
    if (dialogType === undefined) {
      return;
    }
    switch (dialogType) {
      case DialogType.Generic:
        this.genericDialogView.setVisible(isVisible);
        break;
      case DialogType.ShovelPurchase:
        this.shovelPurchaseDialogView.setVisible(isVisible);
        break;
      case DialogType.PotionPurchase:
        this.potionPurchaseDialogView.setVisible(isVisible);
        break;
      case DialogType.BackpackPurchase:
        this.backpackPurchaseDialogView.setVisible(isVisible);
        break;
      case DialogType.Popup:
        this.popupDialogView.setVisible(isVisible);
        break;
    }
  }

  // --------------------------------------------------

  private onShowDialog(params: InternalDialogParams): void {
    const wasAlreadyShowing = this.dialogQueue.length > 0 || this.isActive;
    this.dialogQueue.push(params);
    if (!wasAlreadyShowing) {
      this.onDialogQueueStart();
    }
    this.showNextDialog();
  }

  private onCancelDialog(id: bigint): void {
    log.info(`Cancelling dialog (${id})`);
    if (this.isActive && this.dialogId == id) {
      this.clearAndShowNext();
    } else {
      for (let i = 0; i < this.dialogQueue.length; ++i) {
        if (this.dialogQueue[i].id == id) {
          this.dialogQueue.splice(i, 1);
          break;
        }
      }
    }
  }

  private onDialogSelection<TPayload extends SerializableState>(networkEvent: NetworkEvent<TPayload>, data: TPayload) {
    if (this.hasMadeSelection) {
      return;
    }
    log.info(`Selection choosen for dialog id (${this.dialogId})`);
    if (this.requestingPlayer !== undefined) {
      this.uiRoot.sendNetworkBroadcastEvent(networkEvent, data, [this.requestingPlayer]);
    }
    this.hasMadeSelection = true;
    this.uiRoot.async.setTimeout(() => this.clearAndShowNext(), DIALOG_VIEW_HIDE_DELAY);
  }

  private showNextDialog() {
    if (this.isActive) {
      return;
    }
    if (this.dialogQueue.length === 0) {
      this.onDialogQueueComplete();
      return;
    }
    this.isActive = true;
    this.hasMadeSelection = false;
    const params = this.dialogQueue.splice(0, 1)[0];
    log.info(`Showing dialog (id: ${params.id}  requestingPlayer: ${params.requestingPlayer.id}, type: ${params.dialogType})`);
    this.dialogId = params.id;
    this.requestingPlayer = params.requestingPlayer;
    this.nextDialogDelayMs = params.nextDialogDelayMs ?? MULTIPLE_DIALOG_DELAY;
    this.setPlayerBlocked(params.blockPlayer);
    this.setupCurrentDialog(params);
    this.setCurrentDialog(params);
    this.uiRoot.sendNetworkBroadcastEvent(DialogManager.showingDialog, { player: params.requestingPlayer, id: params.id }, [this.requestingPlayer]);
  }

  private setPlayerBlocked(isBlocking: boolean) {
    if (this.isPlayerBlocked === isBlocking) {
      return;
    }
    this.isPlayerBlocked = isBlocking;
    this.uiRoot.sendLocalBroadcastEvent(Events.setPlayerBlocking, { isBlocking });
  }

  private onDialogQueueStart() {
    //this.uiRoot.sendLocalBroadcastEvent(Events.localHideHUD, { context: hudHideContext, exclude: allHudElementTypes & ~(HUDElementType.Location | HUDElementType.Inventory | HUDElementType.ShovelInventory | HUDElementType.DigAction | HUDElementType.PotionInventory | HUDElementType.AboveInventory ) })
    this.uiRoot.sendNetworkBroadcastEvent(PlayerInteractionTrigger.addDisableContext, { context: hudHideContext }, [this.localPlayer]);
    this.uiRoot.sendLocalBroadcastEvent(Events.dialogPurchaseOpen, { open: true });
  }

  private onDialogQueueComplete() {
    this.setPlayerBlocked(false);
    //this.uiRoot.sendLocalBroadcastEvent(Events.localShowHUD, { context: hudHideContext });
    this.uiRoot.sendLocalBroadcastEvent(Events.dialogPurchaseOpen, { open: false });
    this.uiRoot.async.setTimeout(() => {
      if (!this.hasDialogs()) {
        this.uiRoot.sendNetworkBroadcastEvent(PlayerInteractionTrigger.removeDisableContext, { context: hudHideContext }, [this.localPlayer]);
        this.uiRoot.sendNetworkBroadcastEvent(Events.PlayerDialogComplete, { player: this.localPlayer }, [this.uiRoot.world.getServerPlayer()])
      }
    }, PLAYER_INTERACTION_DELAY_AFTER_HIDE)
    this.hideCurrentDialog();
  }

  private clearAndShowNext() {
    this.isActive = false;
    if (this.nextDialogDelayMs > 0) {
      this.hideCurrentDialog();
      this.uiRoot.async.setTimeout(() => this.showNextDialog(), this.nextDialogDelayMs);
    } else {
      this.showNextDialog();
    }
  }

  private setCurrentDialog(params: InternalDialogParams) {
    let dialogType = params.dialogType;
    if (this.currentDialogType === dialogType) {
      return;
    }
    this.setDialogVisible(this.currentDialogType, false);
    this.currentDialogType = dialogType;
    this.setDialogVisible(this.currentDialogType, true);
  }

  private hideCurrentDialog() {
    this.setDialogVisible(this.currentDialogType, false);
    this.currentDialogType = undefined;
  }

  private hasDialogs(): boolean {
    return this.isActive || this.dialogQueue.length > 0;
  }

  private static getNextDialogID() {
    const result = this.nextDialogID;
    this.nextDialogID += MAX_PLAYERS
    return result;
  }

  createView(): UINode {
    return View({
      children: [
        this.genericDialogView.createView(),
        this.shovelPurchaseDialogView.createView(),
        this.potionPurchaseDialogView.createView(),
        this.backpackPurchaseDialogView.createView(),
        this.popupDialogView.createView()
      ],
      style: {
        position: 'absolute',
        width: '100%',
        height: '100%',
      }
    })
  }
}

type InternalDialogParams = {
  nextDialogDelayMs?: number;
  id: bigint;
  blockPlayer: boolean;
  requestingPlayer: Player;
  dialogType: DialogType;
}
