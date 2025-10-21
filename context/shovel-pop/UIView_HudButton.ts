/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { HUDElementType } from "Enums";
import { Timer } from "GameUtils";
import { AnimatedBinding, Binding, Image, ImageSource, Pressable, UINode, View, ViewStyle } from "horizon/ui";
import { HUDElementVisibilityTracker } from "HUDElementVisibilityTracker";
import { UI_Utils } from "UI_Utils";
import { UIView_InteractionNonBlockingBase } from "UIRoot_ChildrenBase";
import { UIRoot_InteractionNonBlocking } from "UIRoot_InteractionNonBlocking";

export abstract class UIView_HudButton extends UIView_InteractionNonBlockingBase {
  private timer: Timer = new Timer(0);
  protected buttonScale!: AnimatedBinding;
  private buttonImage!: Binding<ImageSource>;
  private isButtonVisible!: Binding<boolean>;
  private hudElementVisible!: HUDElementVisibilityTracker;

  constructor(uiRoot: UIRoot_InteractionNonBlocking) {
    super(uiRoot);
    this.buttonScale = new AnimatedBinding(1);
    this.buttonImage = new Binding<ImageSource>(this.getInitialImage());
    this.isButtonVisible = new Binding<boolean>(true);
    this.hudElementVisible = new HUDElementVisibilityTracker(this.getHUDElementType());
    this.hudElementVisible.connect(this.uiRoot);
    this.initialize();
  }

  abstract initialize(): void;
  abstract getHUDElementType(): HUDElementType;
  abstract getStyle(): ViewStyle;
  abstract getInitialImage(): ImageSource;

  protected onButtonClicked(): void { }
  protected onPress(): void { }
  protected onRelease(): void { }

  private click() {
    if (this.timer.Complete()) {
      this.buttonScale.set(UI_Utils.buttonAnimation(), () => this.onButtonClicked(), [this.localPlayer]);
      this.timer.SetTime(0.1);
    }
  }

  protected setButtonVisible(isVisible: boolean) {
    this.isButtonVisible.set(isVisible, [this.localPlayer]);
  }

  protected setImage(image: ImageSource) {
    this.buttonImage.set(image, [this.localPlayer]);
  }

  protected getAdditionalViewsTop(): UINode[] {
    return [];
  }

  protected getAdditionalViewsBottom(): UINode[] {
    return [];
  }

  createView(): UINode<any> {
    const buttonImageNode = Image({
      source: this.buttonImage,
      style: {
        width: "100%",
        height: "100%",
        transform: [{ scale: this.buttonScale }]
      }
    });

    const buttonPressableNode = Pressable({
      style: {
        width: "100%",
        height: "100%",
        position: "absolute",
      },
      onClick: () => this.click(),
      onPress: () => this.onPress(),
      onRelease: () => this.onRelease(),
    })

    const button = UINode.if(this.isButtonVisible, View({
      children: [
        buttonImageNode,
        buttonPressableNode
      ],
      style: {
        width: "100%",
        height: "100%",
      }
    }));

    const style = this.getStyle();

    // Right side of the screen has a button to open the shovel
    const buttonView = View({
      children: [
        ...this.getAdditionalViewsBottom(),
        button,
        ...this.getAdditionalViewsTop()
      ],
      style: {
        position: 'absolute',
        alignContent: 'flex-end',
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
        ...style,
      }
    });

    return View({
      children: [
        UINode.if(this.hudElementVisible.isVisible(), UINode.if(this.isButtonVisible, buttonView)),
      ],
      style: {
        position: 'absolute',
        height: '100%',
        width: '100%',
      }
    })
  }
}
