/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { HUDElementType, LTEState } from 'Enums';
import { Events } from 'Events';
import * as GameUtils from 'GameUtils';
import * as hz from 'horizon/core';
import { Binding, ColorValue, Image, ImageSource, UINode, View } from 'horizon/ui';
import { HUDAnimations } from 'HUDAnimations';
import { AnimatedHUDElementVisibilityTracker } from 'HUDElementVisibilityTracker';
import { Logger } from 'Logger';
import { UI_Utils } from 'UI_Utils';
import { UIView_NoInteractionBase } from 'UIRoot_ChildrenBase';
import { UIRoot_NoInteraction } from 'UIRoot_NoInteraction';

const log = new Logger("UIView_LTETimer");

export class UIView_LTETimer extends UIView_NoInteractionBase {

  private hudElementVisible!: AnimatedHUDElementVisibilityTracker;
  private visible: Binding<boolean> = new Binding<boolean>(false);
  private textColor: Binding<ColorValue> = new Binding<ColorValue>(hz.Color.white);
  private timerText: Binding<string> = new Binding<string>("Event Time: 1:00");
  private lastShownTime: number = 0
  private eventEndTime: number = 0
  private updateEventSubscription: hz.EventSubscription | null = null;
  private image: Binding<ImageSource>;

  constructor(uiRoot: UIRoot_NoInteraction) {
    super(uiRoot);
    this.hudElementVisible = new AnimatedHUDElementVisibilityTracker(HUDElementType.AboveInventory, HUDAnimations.inventoryHideAnimation);
    this.image = new Binding<ImageSource>(ImageSource.fromTextureAsset(new hz.Asset(BigInt(1304161181004610), BigInt(0))));
    uiRoot.connectNetworkBroadcastEvent(Events.lteTimeRemainingMessage, (data) => {
      log.info("Received lteTimeRemainingMessage: " + data.time)
      if (data.time > 0) {
        this.image.set(ImageSource.fromTextureAsset(new hz.Asset(BigInt(data.imageAsset), BigInt(0))), [this.uiRoot.world.getLocalPlayer()]);
      }
      this.visible.set(data.time > 0)
      this.textColor.set(data.color)
      this.eventEndTime = Date.now() + data.time
      this.timerText.set("Event Time: " + GameUtils.getTimeString(data.time * .001, false))
      if (!this.updateEventSubscription) {
        this.updateEventSubscription = this.uiRoot.connectLocalBroadcastEvent(hz.World.onUpdate, (data: { deltaTime: number }) => {
          const eventTimeRemaining = Math.max(this.eventEndTime - Date.now(), 0);
          if (eventTimeRemaining > 0) {
            if (Math.abs(eventTimeRemaining - this.lastShownTime) > 1000) {
              this.lastShownTime = eventTimeRemaining;
              this.timerText.set("Event Time: " + GameUtils.getTimeString(eventTimeRemaining * .001, false))
            }
          }
          else {
            this.visible.set(false)
            this.updateEventSubscription?.disconnect()
            this.updateEventSubscription = null
          }
        })
      }
    }
    );
    uiRoot.connectNetworkBroadcastEvent(Events.lteNotificationMessage, (data) => {
      if (data.state === LTEState.ENDED) {
        this.visible.set(false)
        this.updateEventSubscription?.disconnect()
        this.updateEventSubscription = null
      }
    });
    this.hudElementVisible.connect(this.uiRoot);
  }

  createView() {
    return UINode.if(this.visible,
      View({ //TimerGroup
        children: [View({ //BG
          style: {
            height: 32,
            flexShrink: 0,
            alignSelf: "stretch",
            borderRadius: 8,
            backgroundColor: "rgb(0, 0, 0)",
            opacity: 0.87
          }
        }),
        View({ //Content
          children: [
            Image({ //icn event
              source: this.image,
              style: {
                width: 40,
                height: 40
              }
            }),
            View({ //Spacer
              style: {
                width: 8,
                height: 8
              }
            }),
            UI_Utils.outlineText(this.timerText, 2, {
              color: "#FFF",
              textAlign: "center",
              fontFamily: "Roboto",
              fontSize: 20,
              fontWeight: "700",
            }
            )],
          style: {
            display: "flex",
            height: 32,
            paddingVertical: 0,
            paddingLeft: 4,
            paddingRight: 8,
            alignItems: "center",
            flexShrink: 0,
            flexDirection: "row",
            marginTop: -32
          }
        })],
        style: {
          display: "flex",
          height: 130,
          flexDirection: "column",
          justifyContent: "flex-start",
          alignItems: "flex-start",
          flexShrink: 0,
          position: "absolute",
          left: "24%",
          bottom: this.hudElementVisible.interpolate(["-50%", "1%"]),
        }
      }))
  }
}
