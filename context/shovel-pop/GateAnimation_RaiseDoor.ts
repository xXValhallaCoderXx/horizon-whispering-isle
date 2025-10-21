/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { GateAnimation } from "GateAnimation";
import { Component, PropTypes, Vec3 } from "horizon/core";
import { clamp, lerp } from "MathUtils";

export class GateAnimation_RaiseDoor extends GateAnimation<typeof GateAnimation_RaiseDoor> {
  static propsDefinition = {
    height: { type: PropTypes.Number },
    duration: { type: PropTypes.Number }
  };

  private currentYPosition = 0;
  private initialPosition = Vec3.zero;

  start() {
    this.initialPosition = this.entity.transform.localPosition.get();
    this.currentYPosition = this.initialPosition.y;
  }

  async setOpen(isOpen: boolean): Promise<void> {
    const initialYPosition = this.initialPosition.y;
    const targetYPosition = this.initialPosition.y + (isOpen ? this.props.height : 0);
    const startTime = Date.now();
    const duration = this.props.duration * 1000;
    while (targetYPosition != this.currentYPosition) {
      await this.wait(16);
      const t = clamp((Date.now() - startTime) / duration, 0, 1);
      this.currentYPosition = lerp(initialYPosition, targetYPosition, t);
      this.entity.transform.localPosition.set(new Vec3(this.initialPosition.x, this.currentYPosition, this.initialPosition.z));
    }
  }

  reset() {
    this.currentYPosition = this.initialPosition.y;
    this.entity.transform.localPosition.set(this.initialPosition);
  }
}
Component.register(GateAnimation_RaiseDoor);
