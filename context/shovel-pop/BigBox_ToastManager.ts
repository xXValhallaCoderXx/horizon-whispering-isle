/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Component, Entity, NetworkEvent, Player, PropTypes } from "horizon/core";
import { ColorValue } from "horizon/ui";
import { Logger } from "Logger";

const log = new Logger("BigBox_ToastManager");

export const BigBox_ToastEvents = {
  /**
   * Event that's broadcast on the server and the client. Send it like this:
   * this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
   *   player: owner,
   *   text: "Text message"
   * }, [owner]);
   */
  textToast: new NetworkEvent<{ player: Player, text: string }>('textToast'),
  textToastWithColor: new NetworkEvent<{ text: string, color: ColorValue }>('textToastWithColor'),
};

class BigBox_ToastManager extends Component<typeof BigBox_ToastManager> {
  static propsDefinition = {
    toastPool: { type: PropTypes.Entity }
  };

  private toastToPlayerMap = new Map<Player, Entity>();
  private toastPool: Array<Entity> = new Array();

  start() {
    // this.toastPool = this.props.toastPool!.children.get();
    // PlayerService.connectPlayerEnterWorld(
    //   this,
    //   (player: Player) => {
    //     if (this.toastToPlayerMap.has(player)) {
    //       return;
    //     }
    //     if (this.toastPool.length == 0) {
    //       log.error(`No toast available in pool for new player (${player.id})`);
    //       return;
    //     }
    //     const toastInstance = this.toastPool.pop()!;
    //     this.toastToPlayerMap.set(player, toastInstance);
    //     toastInstance.owner.set(player);
    //   },
    // );

    // PlayerService.connectPlayerExitWorld(
    //   this,
    //   (player: Player) => {
    //     const toastInstance = this.toastToPlayerMap.get(player);
    //     if (toastInstance === undefined) {
    //       return;
    //     }
    //     this.toastToPlayerMap.delete(player);
    //     toastInstance.owner.set(this.world.getServerPlayer());
    //     this.toastPool.push(toastInstance);
    //   },
    // );
  }
}
Component.register(BigBox_ToastManager);
