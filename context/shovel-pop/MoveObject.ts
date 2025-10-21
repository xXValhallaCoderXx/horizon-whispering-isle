/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Component, PropTypes, Entity, Vec3 } from 'horizon/core';

class MoveObject extends Component<typeof MoveObject> {
  static propsDefinition = {
    objectToMove: { type: PropTypes.Entity, default: null },
    position1: { type: PropTypes.Vec3, default: new Vec3(0, 0, 0) },
    time1: { type: PropTypes.Number, default: 5 },
    position2: { type: PropTypes.Vec3, default: new Vec3(0, 0, 0) },
    time2: { type: PropTypes.Number, default: 10 },
  };

  private timeElapsed: boolean = false;

  start() {
    this.async.setTimeout(() => {
      this.moveToPosition1();
    }, this.props.time1! * 1000);

    this.async.setTimeout(() => {
      this.moveToPosition2();
    }, this.props.time2! * 1000);
  }

  moveToPosition1() {
    const objectToMove = this.props.objectToMove! as Entity | null;
    if (objectToMove) {
      objectToMove.position.set(this.props.position1!);
    }
  }

  moveToPosition2() {
    const objectToMove = this.props.objectToMove! as Entity | null;
    if (objectToMove) {
      objectToMove.position.set(this.props.position2!);
    }
  }
}

Component.register(MoveObject);
