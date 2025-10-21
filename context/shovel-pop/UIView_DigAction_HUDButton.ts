/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { HUDElementType } from 'Enums';
import { ImageSource, ViewStyle } from 'horizon/ui';
import { Shovel } from 'Shovel';
import { UIView_HudButton } from 'UIView_HudButton';

export class UIView_DigAction_HUDButton extends UIView_HudButton {
  private isShovelEquipped = false;
  private isPressed = false;

  initialize(): void {
    this.setButtonVisible(true)
    this.uiRoot.connectNetworkBroadcastEvent(Shovel.equip, () => {
      this.isShovelEquipped = true;
      this.setButtonVisible(true)
    });
    this.uiRoot.connectNetworkBroadcastEvent(Shovel.unequip, () => {
      this.isShovelEquipped = false;
    });
  }

  getHUDElementType(): HUDElementType {
    return HUDElementType.DigAction
  }

  onPress(): void {
    if (!this.isShovelEquipped) {
      this.uiRoot.sendNetworkBroadcastEvent(Shovel.equip, this.localPlayer, [this.localPlayer]);
    }
    this.isPressed = true;

    // Don't let player move while we evaluate if they can dig
    this.localPlayer.locomotionSpeed.set(0);

    this.uiRoot.sendLocalBroadcastEvent(Shovel.digAction, { isPressed: true })
  }

  onRelease(): void {
    if (!this.isPressed) {
      return;
    }
    this.isPressed = false;
    this.uiRoot.sendLocalBroadcastEvent(Shovel.digAction, { isPressed: false })
  }

  getStyle(): ViewStyle {
    return {
      height: 128,
      width: 128,
      right: 132,
      bottom: '19%',
    }
  }

  getInitialImage(): ImageSource {
    return ImageSource.fromTextureAsset(this.props.digAction_image!);
  }
}
