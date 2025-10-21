/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { LocalEvent } from "horizon/core";
import { AnimatedBinding, Animation, Binding, Easing, UINode, View } from "horizon/ui";
import { UI_Utils } from "UI_Utils";
import { UIView_NoInteractionBase } from "UIRoot_ChildrenBase";
import { UIRoot_NoInteraction } from "UIRoot_NoInteraction";

const SHOW_DURATION = 400;
const HIDE_DURATION = 200;
const CLOSE_LEVEL_RANGE = 1;
const FAR_LEVEL_RANGE = 3;

const DIFFICULY_COLORS = [
  "#EE0000",
  "#EEEE00",
  "#00EE00",
  "#00AA00",
  "#AAAAAA",
]

export class UIView_Minigame extends UIView_NoInteractionBase {

  static showMinigameUI = new LocalEvent<{shovelLevel: number, zoneLevel: number}>("showMinigameUI");
  static hideMinigameUI = new LocalEvent("hideMinigameUI");

  private opacity = new AnimatedBinding(0);
  private zoneLevelText = new Binding("");
  private shovelLevelText = new Binding("");
  private shovelLevelColor = new Binding("#FFFFFF");

  constructor(uiRoot: UIRoot_NoInteraction) {
    super(uiRoot);
    this.uiRoot.connectLocalBroadcastEvent(UIView_Minigame.showMinigameUI, (payload) => this.showUI(payload.shovelLevel, payload.zoneLevel));
    this.uiRoot.connectLocalBroadcastEvent(UIView_Minigame.hideMinigameUI, () => this.hideUI());
  }

  private showUI(shovelLevel: number, zoneLevel: number): void {
    zoneLevel = Math.max(1, zoneLevel);
    this.zoneLevelText.set(`Region Level: ${zoneLevel}`, [this.localPlayer]);
    const delta = zoneLevel - shovelLevel;
    const shovelLevelText = '(' + (delta > 0 ? '+' : '') + delta.toString() + ')';
    this.shovelLevelText.set(shovelLevelText, [this.localPlayer]);
    this.opacity.set(Animation.timing(1, { duration: SHOW_DURATION, easing: Easing.linear }), undefined, [this.localPlayer]);
    if (delta > FAR_LEVEL_RANGE) {
      this.shovelLevelColor.set(DIFFICULY_COLORS[0], [this.localPlayer]);
    } else if (delta > CLOSE_LEVEL_RANGE) {
      this.shovelLevelColor.set(DIFFICULY_COLORS[1], [this.localPlayer]);
    } else if (delta < -FAR_LEVEL_RANGE) {
      this.shovelLevelColor.set(DIFFICULY_COLORS[4], [this.localPlayer]);
    } else if (delta < -CLOSE_LEVEL_RANGE) {
      this.shovelLevelColor.set(DIFFICULY_COLORS[3], [this.localPlayer]);
    } else {
      this.shovelLevelColor.set(DIFFICULY_COLORS[2], [this.localPlayer]);
    }
  }

  private hideUI(): void {
    this.opacity.set(Animation.timing(0, { duration: HIDE_DURATION, easing: Easing.linear }), undefined, [this.localPlayer]);
  }

  createView(): UINode {
    return View({
      children: [
        UI_Utils.outlinedText({
          text: this.zoneLevelText,
          outlineSize: 1,
          style: {
            fontSize: 28,
            fontWeight: "bold",
          }
        }),
        // UI_Utils.outlinedText({
        //   text: this.shovelLevelText,
        //   outlineSize: 1,
        //   style: {
        //     marginLeft: 20,
        //     fontSize: 28,
        //     fontWeight: "bold",
        //     color: this.shovelLevelColor,
        //   }
        // }),
      ],
      style: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        opacity: this.opacity,
        position: "absolute",
        alignSelf: "center",
        top: 280,
      }
    })
  }
}
