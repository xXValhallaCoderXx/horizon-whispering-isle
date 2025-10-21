/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Events } from 'Events';
import * as hz from 'horizon/core';
import { AnimatedBinding, Animation, Binding, ColorValue, Easing, Image, ImageSource, Text, View } from 'horizon/ui';
import { UIView_NoInteractionBase } from 'UIRoot_ChildrenBase';
import { UIRoot_NoInteraction } from 'UIRoot_NoInteraction';

export class UIView_LTENotification extends UIView_NoInteractionBase {

  // Values for adjusting speed of animation and message duration
  private static readonly MsgDisplayTime: number = 4.5
  private static readonly MsgFadeTime: number = 0.5

  private isVisible!: Binding<boolean>;
  private message: Binding<string>;
  private color: Binding<ColorValue>;
  private borderColor: Binding<ColorValue>;
  private image: Binding<ImageSource>;
  private topOffset: AnimatedBinding;
  private updateEvent?: hz.EventSubscription;
  private messageTimer: number = 0;
  private step: number = 0;

  constructor(uiRoot: UIRoot_NoInteraction) {
    super(uiRoot);
    this.message = new Binding<string>("");
    this.color = new Binding<ColorValue>(hz.Color.white);
    this.borderColor = new Binding<ColorValue>(hz.Color.black);
    this.image = new Binding<ImageSource>(ImageSource.fromTextureAsset(new hz.Asset(BigInt(1304161181004610), BigInt(0))));
    this.topOffset = new AnimatedBinding(0);
    this.isVisible = new Binding<boolean>(false);
    uiRoot.connectNetworkBroadcastEvent(Events.lteNotificationMessage, (data) => {
      this.message.set(data.text);
      this.color.set(data.color);
      this.borderColor.set(data.borderColor);
      this.step = 0;
      this.image.set(ImageSource.fromTextureAsset(new hz.Asset(BigInt(data.imageAsset), BigInt(0))), [this.uiRoot.world.getLocalPlayer()]);
      this.messageTimer = UIView_LTENotification.MsgFadeTime;
      this.topOffset.set((Animation.timing(1, { duration: this.messageTimer * 1000, easing: Easing.inOut(Easing.ease) })), undefined, [this.uiRoot.world.getLocalPlayer()]);
      if (!this.updateEvent) {
        this.updateEvent = this.uiRoot.connectLocalBroadcastEvent(hz.World.onUpdate, (data) => {
          this.messageTimer -= data.deltaTime;
          if (this.messageTimer <= 0) {
            ++this.step;
            if (this.step >= 3) {
              this.isVisible.set(false);
              this.updateEvent!.disconnect();
              this.updateEvent = undefined;
            }
            else if (this.step == 1) {
              this.messageTimer = UIView_LTENotification.MsgDisplayTime;
            }
            else if (this.step == 2) {
              this.messageTimer = UIView_LTENotification.MsgFadeTime;
              this.topOffset.set((Animation.timing(0, { duration: this.messageTimer * 1000, easing: Easing.inOut(Easing.ease) })), undefined, [this.uiRoot.world.getLocalPlayer()]);
            }
          }
        });
      }
    });
  }

  createView() {
    const locationTextView = View({
      children: [
        Image({
          source: this.image,
          style: {
            height: 54,
            width: 54,
          }
        }),
        Text({
          text: this.message,
          style: {
            color: "#400E12",
            textAlign: "center",
            textAlignVertical: "center",
            fontFamily: "Roboto",
            fontSize: 18,
            fontWeight: "700",
            width: "85%",
            height: "100%"
          }
        }),
      ],
      style: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        alignSelf: "center",
        width: "95%",
        height: "100%",
      }
    })
    return View({//Root Panel + Panel Background Image
      children: [
        locationTextView
      ],
      style: {
        width: "40%",
        height: "9%",
        position: "absolute",
        alignContent: "center",
        alignSelf: "center",
        alignItems: "center", // Align horizontal to the middle
        backgroundColor: this.color,
        borderColor: this.borderColor,
        borderWidth: 4,
        borderRadius: 12,
        top: this.topOffset.interpolate([0, 1], ["-20%", "2.8%"]),
      }
    })
  }
}
