/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, PropTypes, Vec3, World } from 'horizon/core';

class EntityScalePulse extends Component<typeof EntityScalePulse> {
  static propsDefinition = {
    maxScale: {
      type: PropTypes.Number,
      default: 1.5
    },
    scaleTime: {
      type: PropTypes.Number,
      default: 1
    }
  };

  private originalScale!: Vec3;
  private currentTime: number = 0;
  private isScalingUp: boolean = true;

  start() {
    this.originalScale = this.entity.scale.get();
    this.connectLocalBroadcastEvent(World.onUpdate, (data: { deltaTime: number }) => this.update(data.deltaTime));
  }

  update(deltaTime: number) {
    this.currentTime += deltaTime;
    const scale = this.isScalingUp
      ? this.originalScale.add(Vec3.one.mul(this.props.maxScale! - 1).mul(this.currentTime / this.props.scaleTime!))
      : this.originalScale.add(Vec3.one.mul(this.props.maxScale! - 1).mul((this.props.scaleTime! - this.currentTime) / this.props.scaleTime!));

    this.entity.scale.set(scale);

    if (this.currentTime >= this.props.scaleTime!) {
      this.isScalingUp = !this.isScalingUp;
      this.currentTime = 0;
    }
  }
}

Component.register(EntityScalePulse);
