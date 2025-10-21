/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Quaternion, Vec3 } from "horizon/core";

export const TwoPi = Math.PI * 2;

export function getWorldPosFromLocal(localPos: Vec3, center: Vec3, forward: Vec3, up: Vec3, optIsRight: boolean = true) {
  const right = Vec3.mul(Vec3.cross(up, forward), optIsRight ? 1 : -1);
  return Vec3.add(Vec3.add(Vec3.add(center, Vec3.mul(right, localPos.x)), Vec3.mul(up, localPos.y)), Vec3.mul(forward, localPos.z));
}

export function randomInRange(minInclusive: number, max: number) {
  return minInclusive + Math.random() * (max - minInclusive);
}

/**
 * The max value is exclusive; To get an equal weighting selection of [1, 2, 3] use randomRangeInt(1, 4)
 */
export function randomIntInRange(minInclusive: number, maxExclusive: number) {
  return Math.floor(randomInRange(minInclusive, maxExclusive));
}

export function clamp(value: number, min: number, max: number) {
  if (value < min) {
    return min;
  }
  else if (value > max) {
    return max;
  }
  return value;
}

export function clamp01(value: number) {
  return clamp(value, 0.0, 1.0);
}

export function min(a: number, b: number) {
  return a < b ? a : b;
}

export function max(a: number, b: number) {
  return a > b ? a : b;
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function threePointLerp(a: Vec3, b: Vec3, c: Vec3, t: number): Vec3 {
  const aEnd = Vec3.add(a, Vec3.mul(Vec3.sub(b, a), 2.0));
  const bEnd = Vec3.add(c, Vec3.mul(Vec3.sub(b, c), 2.0));
  return Vec3.lerp(Vec3.lerp(a, aEnd, t), Vec3.lerp(bEnd, b, t), t);
}

export function sqrDist(a: Vec3, b: Vec3) {
  return Vec3.sub(a, b).magnitudeSquared();
}

export function dist(a: Vec3, b: Vec3) {
  return Vec3.sub(a, b).magnitude();
}

export function randomVec3(min: Vec3, max: Vec3) {
  return new Vec3(randomInRange(min.x, max.x), randomInRange(min.y, max.y), randomInRange(min.z, max.z));
}

export function isInRange(a: Vec3, b: Vec3, distThreshold: number) {
  return sqrDist(a, b) <= (distThreshold * distThreshold);
}

export const DEGREES_TO_RADIANS: number = Math.PI / 180;
export const RADIANS_TO_DEGREES: number = 180 / Math.PI;

export function angleBetweenVecsRadians(a: Vec3, b: Vec3) {
  return Math.acos(a.dot(b));
}

export function angleOfConeRadians(baseRadius: number, length: number) {
  return Math.atan(baseRadius / length)
}

export function isInView(pos: Vec3, viewOrigin: Vec3, viewDir: Vec3, viewAngleRadians: number) {
  const dirToPos = Vec3.sub(pos, viewOrigin).normalizeInPlace();
  return angleBetweenVecsRadians(viewDir, dirToPos) <= viewAngleRadians;
}

export function isInCone(pos: Vec3, coneOrigin: Vec3, coneDir: Vec3, radius: number, length: number) {
  const dirToPos = Vec3.sub(coneOrigin, pos);
  if (dirToPos.magnitudeSquared() > length * length) { // not a flat cone
    return false;
  }

  return isInView(pos, coneOrigin, coneDir, angleOfConeRadians(radius, length));
}

export function calculatePositionOverTime(origin: Vec3, velocity: Vec3, gravity: number, t: number) {
  let pos = origin.clone();
  pos.addInPlace(Vec3.mul(velocity, t));
  pos.y -= 0.5 * gravity * t * t;
  return pos;
}

export function relativeWorldPosToLocalSpace(parentRot: Quaternion, relativePositionWorld: Vec3) {
  const relativePositionLocal = {
    x: relativePositionWorld.x * Math.cos(parentRot.y) - relativePositionWorld.z * Math.sin(parentRot.y),
    y: relativePositionWorld.y,
    z: relativePositionWorld.x * Math.sin(parentRot.y) + relativePositionWorld.z * Math.cos(parentRot.y),
  }
  return relativePositionLocal as Vec3;
}

export function midpointOfTwoVectors(a: Vec3, b: Vec3) {
  return Vec3.div(Vec3.add(a, b), 2);
}

export function getForward(rotation: Quaternion) {
  return Quaternion.mulVec3(rotation, Vec3.forward).normalize();
}

export function getBiasedNumber(min: number, max: number): number {
  // Generate a random number between 0 and 1
  const random = Math.random();

  // Apply a bias using exponential decay (squared to increase the bias)
  const biased = Math.pow(random, 2); // Adjust this exponent to tweak the bias

  // Scale the biased value to the desired range
  return Math.floor(min + (max - min) * biased);
}

export function twoPiRotate(angle: number, rotation: number) : number {
  return (angle + rotation) % TwoPi;
}

export function lerpVec3(v0: Vec3, v1: Vec3, t: number): Vec3 {
  return new Vec3(lerp(v0.x, v1.x, t), lerp(v0.y, v1.y, t), lerp(v0.z, v1.z, t));
}

export function easeInOutQuad(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}
