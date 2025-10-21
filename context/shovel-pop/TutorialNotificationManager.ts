/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { HUDElementType } from 'Enums';
import * as hz from 'horizon/core';
import { Player } from 'horizon/core';
import { Logger } from 'Logger';
import { PlayerService } from 'PlayerService';

const log = new Logger("TutorialNotificationManager");

type NotificationContainer = {
  recipient: Player
  context: string
  message: string
  minimumTime: number
  overlayId: number,
  showHUDElement: HUDElementType,
  onCleared?: (player: Player) => void
}

export enum NotificationControlValues {
  UNSKIPPABLE = -1, // forces a notification to stay on the player's screen until FORCE_CLEAR is passed
  FORCE_CLEAR = -2
}

export class TutorialNotificationManager extends hz.Component<typeof TutorialNotificationManager> {
  static propsDefinition = {
    poolRoot: { type: hz.PropTypes.Entity }
  };

  // Events for managing server side notifications
  public static broadcastNotification = new hz.LocalEvent<{ player: Player, context: string, message: string, minimumTime: number, overlayId: number, showHUDElement: HUDElementType, onCleared?: (player: Player) => void }>("broadcastNotification")
  public static forceClearNotification = new hz.LocalEvent<{ player: Player }>("forceClearNotification")

  // Events for managing ui related notifications
  public static sendDataToUi = new hz.NetworkEvent<{ context: string, message: string, minimumTime: number, overlayId: number, showHUDElement: HUDElementType }>('sendDataToUi')
  public static notificationCleared = new hz.NetworkEvent<{ player: Player }>('notificationCleared')

  private playerToUi = new Map<number, hz.Entity | undefined>()
  private pool: hz.Entity[] = []
  private notificationQueues = new Map<number, NotificationContainer[]>()
  private subscriptions = new Map<hz.Player, hz.EventSubscription>()

  start() {
    this.pool = this.props.poolRoot!.children.get()

    PlayerService.connectPlayerEnterWorld(this, (player) => {
      if (!this.playerToUi.has(player.id)) {
        const entity = this.pool.pop()
        if (!entity) {
          return
        }

        entity.owner.set(player)
        this.playerToUi.set(player.id, entity)
        this.notificationQueues.set(player.id, [])
        const sub = this.connectNetworkEvent(entity, TutorialNotificationManager.notificationCleared, (payload) => this.onNotificationCleared(payload.player))
        this.subscriptions.set(player, sub)
      }
    })

    PlayerService.connectPlayerExitWorld(this, (player) => {
      const entity = this.playerToUi.get(player.id)
      if (entity) {
        entity.owner.set(this.world.getServerPlayer())
        this.subscriptions.get(player)?.disconnect()
        this.subscriptions.delete(player)
        this.playerToUi.delete(player.id)
        this.pool.push(entity)
      }
    })

    this.connectLocalBroadcastEvent(TutorialNotificationManager.broadcastNotification, (payload) => {
      this.sendNotification(payload.player, payload.context, payload.message, payload.minimumTime, payload.overlayId, payload.showHUDElement, payload.onCleared)
    })

    this.connectLocalBroadcastEvent(TutorialNotificationManager.forceClearNotification, (payload) => {
      this.forceClearNotification(payload.player)
    })
  }

  private sendNotification(player: Player, context: string, message: string, minimumTime: number, overlayId: number, showHUDElement: HUDElementType, callback?: (player: Player) => void) {
    const ui = this.playerToUi.get(player.id)!
    const queue = this.notificationQueues.get(player.id)!
    if (ui === undefined || queue === undefined) {
      return;
    }

    if (queue.length === 0) {
      this.sendNetworkEvent(ui, TutorialNotificationManager.sendDataToUi, { context: context, message: message, minimumTime: minimumTime, overlayId: overlayId, showHUDElement: showHUDElement })
    }

    const container: NotificationContainer = {
      recipient: player,
      context: context,
      message: message,
      minimumTime: minimumTime,
      overlayId: overlayId,
      showHUDElement: showHUDElement,
      onCleared: callback
    }

    queue.push(container)
    this.notificationQueues.set(player.id, queue)
  }

  private forceClearNotification(player: Player) {
    const ui = this.playerToUi.get(player.id)!

    this.sendNetworkEvent(ui, TutorialNotificationManager.sendDataToUi, { context: '', message: '', minimumTime: NotificationControlValues.FORCE_CLEAR, overlayId: -1, showHUDElement: HUDElementType.None })
  }

  private onNotificationCleared(player: Player) {
    const queue = this.notificationQueues.get(player.id)!
    const old = queue.shift() // remove the previous message that we just dismissed

    old?.onCleared?.(player)

    if (queue.length > 0) { // if there are any other queued messages, display them
      const next = queue[0]
      const ui = this.playerToUi.get(player.id)!
      this.sendNetworkEvent(ui, TutorialNotificationManager.sendDataToUi, { context: next.context, message: next.message, minimumTime: next.minimumTime, overlayId: next.overlayId, showHUDElement: next.showHUDElement })
    }
  }
}
hz.Component.register(TutorialNotificationManager);
