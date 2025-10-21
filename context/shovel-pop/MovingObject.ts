/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as hz from 'horizon/core';
import { PropTypes, Quaternion, Vec3, World } from 'horizon/core';

class MovingObject extends hz.Component<typeof MovingObject> {
  // Define the properties of this component.
  static propsDefinition = {
    CanSpin: {type: PropTypes.Boolean, default: false},
    SpinSpeed: {type: PropTypes.Number, default: 1},
    SpinAxis: {type: PropTypes.Vec3, default: new Vec3 (0,1,0)},
    SpinSmoothing: {type: PropTypes.Number, default: 0.1},

    CanTranslate: {type: PropTypes.Boolean, default: false},
    TranslateDistance: {type: PropTypes.Number, default: 1},
    TranslateSpeed: {type: PropTypes.Number, default: 1},
    TranslateSmoothing: {type: PropTypes.Number, default: 0.1},
    TranslateDirection: {type: PropTypes.Vec3, default: new Vec3 (0,0,0)},

    StopAtEnd: {type: PropTypes.Boolean, default: false},
  };

  private startPosition!: Vec3;
  private endPosition!: Vec3;
  private isMovingForward: boolean = true;
  private progress: number = 0;

  // Called when the component is started.
  start() {
    this.startPosition = this.entity.position.get();
    this.endPosition = this.startPosition.add(this.props.TranslateDirection!.mul(this.props.TranslateDistance!));

    // Listen for the onPrePhysicsUpdate event to update the entity's rotation
    this.connectLocalBroadcastEvent(World.onPrePhysicsUpdate, (data) =>{
      if(this.props.CanSpin!){
        this.rotate(data.deltaTime);
      }
      if(this.props.CanTranslate!){
        this.move(data.deltaTime);
      }
    });
  }

  rotate(deltaTime: number) {
    const spinAngle = this.props.SpinSpeed * deltaTime;
    const spinRotation = Quaternion.fromAxisAngle(this.props.SpinAxis, spinAngle);
    const currentRotation = this.entity.rotation.get();

    const targetRotation = Quaternion.mul(currentRotation, spinRotation);
    const lerpAmount = this.props.SpinSmoothing; // adjust this value to control the smoothness of the rotation
    const newRotation = Quaternion.slerp(currentRotation, targetRotation, lerpAmount);

    this.entity.rotation.set(newRotation);
  }

  move(deltaTime: number) {
    const duration: number = this.props.TranslateDistance! / this.props.TranslateSpeed!;
    this.progress += deltaTime / duration;
    if (this.progress > 1) {
      this.progress = 1;
    }
    const targetPosition: Vec3 = this.isMovingForward ?
      this.startPosition.add(this.endPosition.sub(this.startPosition).mul(this.progress)) :
      this.endPosition.add(this.startPosition.sub(this.endPosition).mul(this.progress));
    const currentPosition: Vec3 = this.entity.position.get();
    const lerpAmount: number = this.props.TranslateSmoothing; // adjust this value to control the smoothness of the movement
    const newPosition: Vec3 = currentPosition.add(targetPosition.sub(currentPosition).mul(lerpAmount));
    this.entity.position.set(newPosition);
    if (this.progress >= 1) {
      if (this.isMovingForward && this.props.StopAtEnd!) {
        this.entity.simulated.set(false);
      } else {
        this.isMovingForward = !this.isMovingForward;
        this.progress = 0;
      }
    }
  }
}
hz.Component.register(MovingObject);
