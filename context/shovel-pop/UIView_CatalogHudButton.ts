/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { AudioBank } from "AudioBank";
import { HUDElementType } from "Enums";
import { Events } from "Events";
import { HUDElementVisibilityTracker } from "HUDElementVisibilityTracker";
import { IslandEvents } from "IslandTeleportManager";
import { getIslandCollectionRewardAmount, Islands } from "Islands";
import { GetNewItemCount, PlayerCatalogData } from "PlayerCatalogData";
import { PlayerCatalogManager } from "PlayerCatalogManager";
import { UIView_InteractionNonBlocking3Base } from "UIRoot_ChildrenBase";
import { UIRoot_InteractionNonBlocking3 } from "UIRoot_InteractionNonBlocking3";
import { UI_Catalog_Events } from "UI_Catalog_Events";
import { UI_Utils } from "UI_Utils";
import { LocalEvent, Player } from "horizon/core";
import { AnimatedBinding, Animation, Binding, Easing, Image, ImageSource, Pressable, UINode, View } from "horizon/ui";

const NEW_INCREMENT_PULSE_INCREASE_DURATION = 80;
const NEW_INCREMENT_PULSE_DECREASE_DURATION = 100;
const NEW_INCREMENT_PULSE_MAX_SCALE_BADGE = 1.4;
const NEW_INCREMENT_PULSE_MAX_SCALE_CATALOG = 1.1;
const NEW_INCREMENT_PULSE_MAX_SCALE_REMAINING = 1.1;
const NEW_ITEM_CATALOG_OPEN_DELAY = 300;
const OPEN_AFTER_NEW_ITEM = false;

export class UIView_CatalogHudButton extends UIView_InteractionNonBlocking3Base {

  private newItemCountText = new Binding("");
  private newItemCountScale = new AnimatedBinding(1);
  private remainingCountText = new Binding("1");
  private buttonScale = new AnimatedBinding(1);
  private readyToClaim = new Binding(false);
  private remainingCountScale = new AnimatedBinding(1);

  private newItemCount = 0;
  private hudElementVisible!: HUDElementVisibilityTracker;
  private goalCount = 0;
  private collectedCount = 0;

  public static incrementNewItemCount = new LocalEvent("incrementNewItemCount");

  constructor(uiRoot: UIRoot_InteractionNonBlocking3) {
    super(uiRoot);
    this.hudElementVisible = new HUDElementVisibilityTracker(HUDElementType.Catalog);
    this.hudElementVisible.connect(this.uiRoot);

    this.uiRoot.sendNetworkBroadcastEvent(PlayerCatalogManager.requestPlayerCatalog, { player: this.localPlayer }, [this.serverPlayer]);
    this.uiRoot.connectLocalBroadcastEvent(UIView_CatalogHudButton.incrementNewItemCount, () => this.onIncrementNewItemCount());
    this.uiRoot.connectNetworkBroadcastEvent(PlayerCatalogManager.clearNewItems, (payload) => this.onClearNewItems(payload.player));
    this.uiRoot.connectNetworkBroadcastEvent(PlayerCatalogManager.receivePlayerCatalog, (payload) => this.onPlayerCatalogReceived(payload.playerCatalog));
    this.uiRoot.connectNetworkBroadcastEvent(PlayerCatalogManager.receiveCurrentCatalogGoal, (payload) => this.onCurrentCatalogGoalReceived(payload.island, payload.level, payload.collected));
    this.uiRoot.connectNetworkBroadcastEvent(IslandEvents.playerTeleportedToIsland, (payload) => this.updateGoalIfLocalPlayer(payload.player));
    this.uiRoot.connectNetworkBroadcastEvent(PlayerCatalogManager.islandRewardComplete, (payload) => this.updateGoalIfLocalPlayer(payload.player));

    this.uiRoot.connectLocalBroadcastEvent(Events.updateGemUI, (payload) => {
      AudioBank.play('gem');
    });
  }

  private updateGoalIfLocalPlayer(player: Player) {
    if (player !== this.localPlayer) {
      return;
    }
    this.uiRoot.sendNetworkBroadcastEvent(PlayerCatalogManager.requestCurrentCatalogGoal, { player }, [this.serverPlayer]);
  }

  private onPlayerCatalogReceived(playerCatalog: PlayerCatalogData) {
    this.newItemCount = GetNewItemCount(playerCatalog);
    this.newItemCountText.set(this.getNewItemCountText(), [this.localPlayer]);
  }

  private onCurrentCatalogGoalReceived(island: Islands, level: number, collected: number) {
    const currentGoalAmount = getIslandCollectionRewardAmount(island, level);
    const prevGoalAmount = (level > 0) ? getIslandCollectionRewardAmount(island, level - 1) : 0;
    this.goalCount = currentGoalAmount! - prevGoalAmount!;
    this.collectedCount = collected - prevGoalAmount!;
    this.readyToClaim.set(this.collectedCount >= this.goalCount, [this.localPlayer]);
    this.remainingCountText.set((this.goalCount - this.collectedCount).toString(), [this.localPlayer]);
  }

  protected onIncrementNewItemCount() {
    this.newItemCount++;
    this.newItemCountText.set(this.getNewItemCountText(), [this.localPlayer]);
    this.uiRoot.sendNetworkBroadcastEvent(PlayerCatalogManager.requestCurrentCatalogGoal, { player: this.localPlayer }, [this.serverPlayer]);
    this.newItemCountScale.set(Animation.sequence(
      Animation.timing(NEW_INCREMENT_PULSE_MAX_SCALE_BADGE, { duration: NEW_INCREMENT_PULSE_INCREASE_DURATION, easing: Easing.linear }),
      Animation.timing(1, { duration: NEW_INCREMENT_PULSE_DECREASE_DURATION, easing: Easing.linear })
    ), undefined, [this.localPlayer]);
    this.buttonScale.set(Animation.sequence(
      Animation.timing(NEW_INCREMENT_PULSE_MAX_SCALE_CATALOG, { duration: NEW_INCREMENT_PULSE_INCREASE_DURATION, easing: Easing.linear }),
      Animation.timing(1, { duration: NEW_INCREMENT_PULSE_DECREASE_DURATION, easing: Easing.linear })
    ), undefined, [this.localPlayer]);
    this.remainingCountScale.set(Animation.sequence(
      Animation.timing(NEW_INCREMENT_PULSE_MAX_SCALE_REMAINING, { duration: NEW_INCREMENT_PULSE_INCREASE_DURATION, easing: Easing.linear }),
      Animation.timing(1, { duration: NEW_INCREMENT_PULSE_DECREASE_DURATION, easing: Easing.linear })
    ), undefined, [this.localPlayer]);
    AudioBank.play('notification');
    if (OPEN_AFTER_NEW_ITEM) {
      this.uiRoot.async.setTimeout(() => {
        this.uiRoot.sendNetworkBroadcastEvent(UI_Catalog_Events.openCatalog, {}, [this.localPlayer]);
      }, NEW_INCREMENT_PULSE_INCREASE_DURATION + NEW_INCREMENT_PULSE_DECREASE_DURATION + NEW_ITEM_CATALOG_OPEN_DELAY);
    }
  }

  private getNewItemCountText() {
    return this.newItemCount <= 0 ? "" : this.newItemCount > 9 ? "9+" : this.newItemCount.toString();
  }

  private onClearNewItems(player: Player) {
    if (player !== this.localPlayer) {
      return;
    }
    this.newItemCount = 0;
    this.newItemCountText.set("", [this.localPlayer]);
  }

  onButtonClicked() {
    //this.uiRoot.sendLocalBroadcastEvent(UIView_CatalogGoal.toggleCatalogGoal, {});
    this.uiRoot.sendLocalBroadcastEvent(UI_Catalog_Events.requestToggleCatalog, {});
  }

  createView() {
    return UINode.if(this.hudElementVisible.isVisible(),
      View({ //UIHUDCatalogButton
        children: [
          Pressable({ //Catalog Widget
            children: [
              Image({ //icn_CatalogNew
                source: ImageSource.fromTextureAsset(this.props.catalogHud_image!),
                style: {
                  width: 70,
                  height: 70,
                  flexShrink: 0,
                  resizeMode: "cover",
                  position: "absolute",
                  right: 0,
                  top: 0,
                  transform: [{ scale: this.buttonScale }]
                }
              }),
              View({ //Pip
                children: [
                  UINode.if(this.newItemCountText.derive(text => text !== ""), UI_Utils.makeNewBadge(this.newItemCountText, -2, 0))
                ],
                style: {
                  transform: [{ scale: this.newItemCountScale }]
                }
              })
            ],
            style: {
              width: 70,
              height: 70,
              flexShrink: 0,
              position: "absolute",
              right: 25,
              top: 164
            },
            onClick: () => this.onButtonClicked()
          })],
        style: {
          width: "100%",
          height: "100%",
          justifyContent: "flex-end",
          alignItems: "center",
          flexShrink: 0,
          position: "absolute",
        }
      }));
  }
}
