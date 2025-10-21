/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { HUDElementType } from 'Enums';
import { Events } from 'Events';
import LocalCamera from 'horizon/camera';
import * as hz from 'horizon/core';
import { AnimatedBinding, Animation, Binding, Easing, Image, ImageSource, UINode } from 'horizon/ui';
import { PlayerInteractionTrigger } from 'PlayerInteractionTrigger';
import { UIView_InteractionBlockingBase } from 'UIRoot_ChildrenBase';
import { UIRoot_InteractionBlocking } from 'UIRoot_InteractionBlocking';

const ANIMATION_DURATION = 1 * 1000;
const ANIMATION_PAUSE = 2 * 1000;

const disableContext = "uiview_fanfare";

enum FanfareFlags {
  None = 0,
  UI = 1 << 0,
  Confetti = 1 << 1,
  Particle = 1 << 2,
  Sound = 1 << 3,

  All = UI | Confetti | Particle | Sound
}

export enum FanfareType {
  TUTORIAL_COMPLETE,
  REGION_COMPLETE,
}

export class UIView_Fanfare extends UIView_InteractionBlockingBase {
  private scale: AnimatedBinding = new AnimatedBinding(0)
  private opacity: AnimatedBinding = new AnimatedBinding(0)
  private image: Binding<ImageSource> = new Binding<ImageSource>(ImageSource.fromTextureAsset(this.uiRootBlocking.props.shovelInventory_missingShovel!))

  static playFanfare = new hz.NetworkEvent<{ id: FanfareType, player: hz.Player, excludeHud: HUDElementType }>('playFanfare')

  constructor(uiRoot: UIRoot_InteractionBlocking) {
    super(uiRoot)
    this.uiRootBlocking.connectNetworkBroadcastEvent(UIView_Fanfare.playFanfare, (payload) => this.play(payload.id, payload.excludeHud))
  }

  createView(): UINode {
    return Image({
      source: this.image,
      style: {
        position: "absolute",
        alignContent: "center",
        height: 512,
        width: 512,
        alignSelf: "center",
        transform: [{ scale: this.scale }],
        opacity: this.opacity
      }
    })
  }

  play(id: FanfareType, excludeHud: HUDElementType) {
    let fanfareFlags = FanfareFlags.None;
    if (id === FanfareType.REGION_COMPLETE) {
      this.image.set(ImageSource.fromTextureAsset(this.uiRootBlocking.props.fanfare_regionComplete!), [this.localPlayer])
      fanfareFlags = FanfareFlags.Confetti | FanfareFlags.Sound;
    }
    else {
      this.image.set(ImageSource.fromTextureAsset(this.uiRootBlocking.props.fanfare_image!), [this.localPlayer])
      fanfareFlags = FanfareFlags.All;
    }

    this.uiRootBlocking.setVisibility(true)
    this.uiRoot.sendNetworkBroadcastEvent(PlayerInteractionTrigger.addDisableContext, { context: disableContext }, [this.localPlayer]);
    this.uiRoot.sendLocalBroadcastEvent(Events.localHideHUD, { context: disableContext, exclude: excludeHud });

    this.scale.set(0, undefined, [this.localPlayer])
    this.opacity.set(0, undefined, [this.localPlayer])
    if ((fanfareFlags & FanfareFlags.UI) != 0) {
      this.scale.set(Animation.timing(1, { duration: ANIMATION_DURATION, easing: Easing.out(Easing.cubic) }), undefined, [this.localPlayer])
      this.opacity.set(Animation.timing(1, { duration: ANIMATION_DURATION }), undefined, [this.localPlayer])
    }

    this.uiRootBlocking.async.setTimeout(() => {
      let pos = LocalCamera.position.get()
      let rot = LocalCamera.forward.get()
      pos = pos.add(rot.mul(3))

      if ((fanfareFlags & FanfareFlags.Particle) != 0) {
        this.uiRootBlocking.props.fanfare_particleFx?.position.set(pos)
        this.uiRootBlocking.props.fanfare_particleFx?.as(hz.ParticleGizmo).play({
          fromStart: true,
          players: [this.localPlayer],
        })
      }
      if ((fanfareFlags & FanfareFlags.Confetti) != 0) {
        this.uiRootBlocking.props.fanfare_confettiFx?.position.set(pos)
        this.uiRootBlocking.props.fanfare_confettiFx?.as(hz.ParticleGizmo).play({
          fromStart: true,
          players: [this.localPlayer],
        })
      }
      if ((fanfareFlags & FanfareFlags.Sound) != 0) {
        this.uiRootBlocking.props.fanfare_sound?.as(hz.AudioGizmo).play({
          fade: 0,
          players: [this.localPlayer],
        })
      }
    }, 500)

    this.uiRootBlocking.async.setTimeout(() => {
      this.scale.set(Animation.timing(0.66, { duration: ANIMATION_DURATION, easing: Easing.in(Easing.cubic) }), undefined, [this.localPlayer])
      this.opacity.set(Animation.timing(0, { duration: ANIMATION_DURATION }), undefined, [this.localPlayer])

      this.uiRootBlocking.async.setTimeout(() => {
        this.uiRootBlocking.setVisibility(false)
        this.uiRoot.sendNetworkBroadcastEvent(PlayerInteractionTrigger.removeDisableContext, { context: disableContext }, [this.localPlayer])
        this.uiRoot.sendLocalBroadcastEvent(Events.localShowHUD, { context: disableContext, exclude: excludeHud })
      }, ANIMATION_DURATION)

    }, ANIMATION_DURATION + ANIMATION_PAUSE)
  }
}
