/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { HUDElementType } from "Enums";
import { Player } from "horizon/core";
import { Image, ImageSource, ImageStyle, Pressable, UINode, View, ViewStyle } from 'horizon/ui';
import { HUDElementVisibilityTracker } from "HUDElementVisibilityTracker";
import { Logger } from "Logger";
import { PanelEvents } from 'shop_ui';
import { UIView_InteractionNonBlocking3Base } from "UIRoot_ChildrenBase";
import { UIRoot_InteractionNonBlocking3 } from "UIRoot_InteractionNonBlocking3";

const log = new Logger("UIView_TimedReward");

export class UIView_ShopButton extends UIView_InteractionNonBlocking3Base {
  hudElementVisible!: HUDElementVisibilityTracker;

  constructor(uiRoot: UIRoot_InteractionNonBlocking3) {
    super(uiRoot);
    this.hudElementVisible = new HUDElementVisibilityTracker(HUDElementType.Salary);
    this.hudElementVisible.connect(this.uiRoot);
  }

  openShop() {
    this.uiRoot.sendLocalBroadcastEvent(PanelEvents.ShowPanel, { player: this.uiRoot.world.getLocalPlayer(), id: "main_shop"});
  }

  createView(): UINode<any> {
    let shopImage = new ImageSource();
    let notificationImage = new ImageSource();
    let buttonStyle: ViewStyle = {
      alignItems: 'center',
      backgroundColor: 'clear',
      borderRadius: 0,
      height: 80,
      justifyContent: 'center',
      marginTop: 12,
      marginBottom: 12,
      width: 80,
    };

    let imageStyle: ImageStyle = {
      height: 80,
      width: 80,
      resizeMode: "contain",
    };

    if (this.props.icn_shop) {
      shopImage = ImageSource.fromTextureAsset(this.props.icn_shop!);
    }
    if (this.props.timedReward_notificationIcon) {
      notificationImage = ImageSource.fromTextureAsset(this.props.timedReward_notificationIcon);
    }


    return UINode.if(this.hudElementVisible.isVisible(), View({
      children: [

        Pressable({
          children: [
            Image({
              source: shopImage,
              style: imageStyle,
            }),


          ],
          onClick: (player: Player) => {
            this.openShop()
          },
          style: buttonStyle,
          propagateClick: false,
        }),
      ],
      style: {
        position: 'absolute',
        height: '14%',
        width: '6%',
        right: 95,
        top: 72,
        alignContent: 'flex-end',
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
      },
    }));
  }
}
