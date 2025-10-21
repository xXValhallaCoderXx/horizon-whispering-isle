/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Events } from "Events";
import { World } from "horizon/core";
import { AnimatedBinding, Animation, Binding, Easing, Image, ImageSource, UINode, View } from "horizon/ui";
import { PlayerDataEvents } from "PlayerDataEvents";
import { PotionData } from "PotionData";
import { UI_Utils } from "UI_Utils";
import { UIView_NoInteractionBase } from "UIRoot_ChildrenBase";
import { UIRoot_NoInteraction } from "UIRoot_NoInteraction";

const ICON_IMAGE_WIDTH = 40;
const BUFF_FONT_SIZE = 18;
const ICON_PULSE_MAX_SCALE = 1.3;
const BUFF_FADE_IN_TIME = 100;
const BUFF_FADE_OUT_TIME = 200;

export class UIView_BuffBar extends UIView_NoInteractionBase {

  private isShowing = new Binding(false);
  private activePotionImage!: Binding<ImageSource>;
  private activePotionTimer = new Binding("");
  private activePotionScale = new AnimatedBinding(1);
  private activePotionOpacity = new AnimatedBinding(0);

  private activePotion?: string;
  private activePotionEndTime = 0;
  private activePotionTimerSeconds = 0;
  private missingTexture: ImageSource;

  // private TEST_Index = 0;

  constructor(uiRoot: UIRoot_NoInteraction) {
    super(uiRoot);
    this.missingTexture = ImageSource.fromTextureAsset(this.props.digResultHud_fallbackIcon!);
    this.activePotionImage = new Binding<ImageSource>(this.missingTexture);
    this.uiRoot.sendNetworkBroadcastEvent(PlayerDataEvents.requestSelectedPotions, { player: this.localPlayer }, [this.serverPlayer]);
    this.uiRoot.connectLocalBroadcastEvent(World.onUpdate, payload => this.update(payload.deltaTime));

    // this.uiRoot.connectNetworkBroadcastEvent(Events.debugAction1, player => {
    //   if (player === this.localPlayer) {
    //     this.TEST_Index++;
    //     if (this.TEST_Index >= 3) this.TEST_Index = 0;
    //     switch (this.TEST_Index) {
    //       case 0:
    //         this.updateActivePotion("", 0);
    //         break;
    //       case 1:
    //         this.updateActivePotion("category_cat1", Date.now() + 2 * 1000 * 60);
    //         break;
    //       case 2:
    //         this.updateActivePotion("category_cat2", Date.now() + 5 * 1000);
    //         break;
    //     }
    //   }
    // })
  }

  private update(deltaTime: number) {
    this.updateActivePotionTime();
  }

  private updateActivePotion(potionId: string, endTime: number): void {
    const isActivePotion = potionId !== "";
    const hasActivePotion = this.activePotion !== undefined;
    if (isActivePotion !== hasActivePotion) {
      if (isActivePotion) {
        this.showPotion();
      } else {
        this.hidePotion();
      }
    }
    if (!isActivePotion) {
      this.expireActivePotion();
      return;
    }
    if (this.activePotion !== potionId) {
      this.expireActivePotion();
      this.activePotion = potionId;
      this.pulse();
    }
    this.activePotionEndTime = endTime;
    this.activePotionImage.set(this.getPotionImage(potionId), [this.localPlayer]);
    this.updateActivePotionTime();
  }

  private updateActivePotionTime() {
    if (this.activePotion === undefined) {
      return;
    }
    const seconds = Math.ceil((this.activePotionEndTime - Date.now()) / 1000);
    if (this.activePotionTimerSeconds !== seconds) {
      this.activePotionTimerSeconds = seconds;
      this.activePotionTimer.set(this.formatTime(seconds), [this.localPlayer]);
      if (seconds <= 0) {
        this.expireActivePotion();
        this.hidePotion();
      }
    }
  }

  private expireActivePotion() {
    if (this.activePotion === undefined) {
      return;
    }
    this.uiRoot.sendLocalBroadcastEvent(Events.potionExpired, { potionID: this.activePotion })
    this.activePotion = undefined;
  }

  private showPotion() {
    this.isShowing.set(true, [this.localPlayer]);
    this.activePotionOpacity.set(Animation.timing(1, { duration: BUFF_FADE_IN_TIME, easing: Easing.linear }), () => {
      this.pulse();
    }, [this.localPlayer]);
  }

  private pulse() {
    this.activePotionScale.set(Animation.sequence(
      Animation.timing(ICON_PULSE_MAX_SCALE, { duration: BUFF_FADE_IN_TIME, easing: Easing.linear }),
      Animation.timing(1, { duration: BUFF_FADE_IN_TIME, easing: Easing.linear }),
    ), undefined, [this.localPlayer]);
  }

  private hidePotion() {
    this.activePotionOpacity.set(Animation.timing(0, { duration: BUFF_FADE_OUT_TIME, easing: Easing.linear }), () => {
      this.isShowing.set(false, [this.localPlayer]);
    }, [this.localPlayer]);
  }

  private formatTime(timeInSeconds: number): string {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    const leadingZero = seconds < 10 ? "0" : "";
    if (minutes > 0) {
      return `${minutes}:${leadingZero}${seconds}`
    }
    return `${seconds}s`;
  }

  private getPotionImage(potionId: string): ImageSource {
    return PotionData.getPotionImage(potionId) ?? this.missingTexture;
  }

  createView(): UINode {
    return UINode.if(this.isShowing, View({
      children: [
        Image({
          source: this.activePotionImage,
          style: {
            width: ICON_IMAGE_WIDTH,
            height: ICON_IMAGE_WIDTH,
          }
        }),
        UI_Utils.outlinedText({
          text: this.activePotionTimer,
          outlineSize: 1,
          style: {
            fontSize: BUFF_FONT_SIZE,
            color: "#FFFFFF",
          }
        })
      ],
      style: {
        position: "absolute",
        left: 85,
        bottom: 20,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        transform: [{ scale: this.activePotionScale }],
        opacity: this.activePotionOpacity,
      }
    }));
  }
}
