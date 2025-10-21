/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Events } from 'Events';
import * as hz from 'horizon/core';

class Rotator extends hz.Component<typeof Rotator> {
  static propsDefinition = {
    speed: { type: hz.PropTypes.Number, default: 1 },
    isLTE: { type: hz.PropTypes.Boolean, default: false }
  };

  start() {
    const subscription = this.connectLocalBroadcastEvent(hz.World.onUpdate, data => {
      const rotation = this.entity.rotation.get();
      const newRotation = rotation.mul(hz.Quaternion.fromAxisAngle(new hz.Vec3(0, 1, 0), this.props.speed! * data.deltaTime * .625)); // Converts from previous tuning
      this.entity.rotation.set(newRotation);
    });
    if (this.props.isLTE) {
      this.connectLocalBroadcastEvent(Events.onLteZoneEnd, () => {
        subscription.disconnect();
      })
    }
  }
}

hz.Component.register(Rotator);
