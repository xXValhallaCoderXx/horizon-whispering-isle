/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_ExpEvents } from 'BigBox_ExpEvents';
import * as hz from 'horizon/core';

class BigBox_ExpTriggerExample extends hz.Component<typeof BigBox_ExpTriggerExample> {
  static propsDefinition = {
    xpGained : { type: hz.PropTypes.Number, default: 10.0 },
    showToast: { type: hz.PropTypes.Boolean, default: false },
  };

  start() {
    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterTrigger, (player: hz.Player) => {
      this.sendNetworkBroadcastEvent(BigBox_ExpEvents.expAddToPlayer, { player: player, exp: this.props.xpGained, showToast: this.props.showToast });
    });
  }
}

hz.Component.register(BigBox_ExpTriggerExample);
