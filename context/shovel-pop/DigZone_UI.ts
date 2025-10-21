/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { DigZoneManager } from 'DigZoneManager';
import { HUDElementType } from 'Enums';
import * as hz from 'horizon/core';
import { Binding, Text, UIComponent, UINode, View } from 'horizon/ui';
import { HUDElementVisibilityTracker } from 'HUDElementVisibilityTracker';

export class DigZone_UI extends UIComponent<typeof DigZone_UI> {
  static propsDefinition = {
    textColor: { type: hz.PropTypes.Color },
    bgColor: { type: hz.PropTypes.Color },
    borderColor: { type: hz.PropTypes.Color },
  };

  panelHeight = 10;
  panelWidth = 10;

  public static DefaultZoneName = "Generic"

  private line!: Binding<string>;
  private hudElementVisible!: HUDElementVisibilityTracker;
  private subscription: hz.EventSubscription | undefined

  start() {
    const localPlayer = this.world.getLocalPlayer();
    if (localPlayer === this.world.getServerPlayer()) {
      this.entity.visible.set(false)
      this.subscription?.disconnect()
      return
    }

    this.entity.visible.set(true)

    this.subscription = this.connectNetworkBroadcastEvent(DigZoneManager.sendZoneId, (payload) => {
      this.line.set('Zone: ' + payload.data.id, [localPlayer])
    })

    // this.connectNetworkBroadcastEvent(Events.itemSelected, (data: { player: Player, childIndex: number, itemId: string, location: hz.Vec3, weight: number }) => {
    //   if (data.player === this.world.getLocalPlayer()) {
    //     this.entity.visible.set(false)
    //   }
    // })

    // this.connectLocalBroadcastEvent(Events.localPlayerDigAnimationComplete, () => {
    //   this.entity.visible.set(true)
    // })

    this.hudElementVisible.connect(this);
  }

  initializeUI() {
    if (this.world.getLocalPlayer() === this.world.getServerPlayer()) {
      return new UINode();
    }

    this.line = new Binding<string>("Zone: " + DigZone_UI.DefaultZoneName);
    this.hudElementVisible = new HUDElementVisibilityTracker(HUDElementType.Quest);

    const dialogLayout = View({
      children: [
        Text({
          text: this.line,
          style: {
            fontSize: 20,
            fontFamily: 'Roboto',
            color: this.props.textColor,
            paddingVertical: 4,
            paddingHorizontal: 8,
            textAlign: 'right',
            fontWeight: '900',
          }
        }),
      ],
      style: {
        alignItems: 'center',
        backgroundColor: this.props.bgColor,
        borderColor: this.props.borderColor,
        borderWidth: 2,
        borderRadius: 12,
        minWidth: 36,
        flexDirection: 'column',
        alignSelf: 'center',
      },
    })

    return UINode.if(this.hudElementVisible.isVisible(), View({
      children: [
        dialogLayout
      ],
      style: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'flex-end',
        top: '75%',
        right: '20%',
        opacity: 0.95
      }
    }))
  }
}
UIComponent.register(DigZone_UI);
