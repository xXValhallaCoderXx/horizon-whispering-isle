/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { HUDElementType } from "Enums";
import { Events } from "Events";
import { Binding, Image, ImageSource, UINode, View, ViewStyle } from "horizon/ui";
import { ShovelProgressionEvents } from "ShovelProgressionEvents";
import { UIView_HudButton } from "UIView_HudButton";

/// DEPRECATED
export class UIView_ShovelHudButton extends UIView_HudButton {
  canUpgradeAny = new Binding(false);

  initialize() {
    this.uiRoot.connectLocalBroadcastEvent(ShovelProgressionEvents.shovelInventoryVisibilityChanged, payload => this.setButtonVisible(!payload.isShown));
    this.uiRoot.connectLocalBroadcastEvent(Events.canUpgradeAnyShovelUpdated, payload => this.canUpgradeAny.set(payload.canUpgradeAny, [this.localPlayer]));
  }

  getHUDElementType() { return HUDElementType.ShovelInventory }

  onButtonClicked() {
    this.uiRoot.sendLocalBroadcastEvent(ShovelProgressionEvents.requestToggleShovelInventory, {});
  }

  getStyle(): ViewStyle {
    return {
      height: 80,
      width: 80,
      left: "16%",
      bottom: 18,
    }
  }

  getInitialImage() {
    return ImageSource.fromTextureAsset(this.props.shovelHud_image!);
  }

  protected getAdditionalViews(): UINode[] {
    return [
      UINode.if(this.canUpgradeAny, View({
        children: [
          Image({ //icn_notification
            source: ImageSource.fromTextureAsset(this.props.timedReward_notificationIcon!),
            style: {
              width: 30,
              height: 30,
            }
          }),
        ],
        style: {
          position: "absolute",
          top: -3,
          right: 0,
        }
      })),
    ]
  }
}
