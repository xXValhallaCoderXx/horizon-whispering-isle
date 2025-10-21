/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_ToastEvents } from 'BigBox_ToastManager';
import { CodeBlockEvents, Component, Player, PropTypes } from 'horizon/core';

class BigBox_ToastTriggerExample extends Component<typeof BigBox_ToastTriggerExample> {
  static propsDefinition = {
    message: { type: PropTypes.String, default: "Hello Horizon World" },
  };

  start() {
    this.connectCodeBlockEvent(this.entity, CodeBlockEvents.OnPlayerEnterTrigger, (player: Player) => {
      this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
        player: player,
        text: this.props.message // This message can be anything you want!
      }, [player]);
    });
  }
}

Component.register(BigBox_ToastTriggerExample);
