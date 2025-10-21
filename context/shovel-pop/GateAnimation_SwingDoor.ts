/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { GateAnimation } from "GateAnimation";
import { Component, PropTypes, Quaternion, Vec3 } from "horizon/core";
import { clamp, lerp } from "MathUtils";

export class GateAnimation_SwingDoor extends GateAnimation<typeof GateAnimation_SwingDoor> {
  static propsDefinition = {
    rotation: { type: PropTypes.Number },
    duration: { type: PropTypes.Number }
  };

  private currentYRotation = 0;
  private initialRotation = Vec3.zero;

  start() {
    this.initialRotation = this.entity.transform.localRotation.get().toEuler();
    this.currentYRotation = this.initialRotation.y;
  }

  async setOpen(isOpen: boolean): Promise<void> {
    const initialYRotation = this.initialRotation.y;
    const targetRotation = this.initialRotation.y + (isOpen ? this.props.rotation : 0);
    const startTime = Date.now();
    const duration = this.props.duration * 1000;
    while (targetRotation != this.currentYRotation) {
      await this.wait(16);
      const t = clamp((Date.now() - startTime) / duration, 0, 1);
      this.currentYRotation = lerp(initialYRotation, targetRotation, t);
      const rotation = new Vec3(this.initialRotation.x, this.currentYRotation, this.initialRotation.z);
      this.entity.transform.localRotation.set(Quaternion.fromEuler(rotation));
    }
  }

  reset() {
    this.currentYRotation = this.initialRotation.y;
    this.entity.transform.localRotation.set(Quaternion.fromEuler(this.initialRotation));
  }
}
Component.register(GateAnimation_SwingDoor);
