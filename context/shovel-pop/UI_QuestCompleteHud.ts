/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { PropTypes, TextureAsset } from 'horizon/core';
import { AnimatedBinding, Animation, Binding, Easing, Image, ImageSource, UIComponent, UINode, View } from 'horizon/ui';

const IMAGE_SIZE_HUGE = 10000
const IMAGE_SIZE_NORMAL = 400
const BOTTOM_OFFSET = 180

export class UI_QuestCompleteHud extends UIComponent<typeof UI_QuestCompleteHud> {
  static propsDefinition = {
    image: { type: PropTypes.Asset },
    bottomOffset: { type: PropTypes.Number, default: BOTTOM_OFFSET },
  };

  static DISPLAY_TIME = 2000

  private imageSizeIncreaseScale!: AnimatedBinding;
  private opacity!: AnimatedBinding;
  private isShown!: Binding<boolean>;

  start() {
    this.entity.visible.set(this.world.getLocalPlayer() !== this.world.getServerPlayer());
  }

  initializeUI() {
    if (this.world.getLocalPlayer() === this.world.getServerPlayer()) {
      return View({
        children: [
          Image({ source: ImageSource.fromTextureAsset(this.props.image!), style: { display: "none" } })
        ],
        style: { display: "none" }
      });
    }

    this.imageSizeIncreaseScale = new AnimatedBinding(1);
    this.opacity = new AnimatedBinding(1);
    this.isShown = new Binding(false);

    const bottomValue = this.imageSizeIncreaseScale.interpolate([0, 1], [this.props.bottomOffset - IMAGE_SIZE_NORMAL * .5, BOTTOM_OFFSET - IMAGE_SIZE_HUGE * .5])
    return UINode.if(this.isShown, Image({
      source: ImageSource.fromTextureAsset(this.props.image?.as(TextureAsset)!),
      style: {
        position: "absolute",
        alignContent: "center",
        height: this.imageSizeIncreaseScale.interpolate([0, 1], [IMAGE_SIZE_NORMAL, IMAGE_SIZE_HUGE]),
        width: this.imageSizeIncreaseScale.interpolate([0, 1], [IMAGE_SIZE_NORMAL, IMAGE_SIZE_HUGE]),
        bottom: bottomValue,
        alignSelf: "center",
        opacity: this.opacity
      }
    }));
  }

  play() {
    const localPlayer = this.world.getLocalPlayer();
    const targetPlayer = [localPlayer];
    this.isShown.set(true, targetPlayer);
    this.imageSizeIncreaseScale.set(1, undefined, targetPlayer);
    this.imageSizeIncreaseScale.set(
      Animation.timing(0, { duration: 300, easing: Easing.linear }),
      undefined,
      targetPlayer);

    this.opacity.set(1, undefined, targetPlayer);
    this.opacity.set(
      Animation.delay(UI_QuestCompleteHud.DISPLAY_TIME,
        Animation.timing(0, { duration: 400, easing: Easing.linear })),
      (finished, player) => this.isShown.set(false, targetPlayer),
      targetPlayer);
  }
}
UIComponent.register(UI_QuestCompleteHud);
