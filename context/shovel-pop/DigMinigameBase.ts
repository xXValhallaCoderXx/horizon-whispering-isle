/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { DigMinigame, OnFocusInteractionCallback } from "DigMinigame";
import LocalCamera from "horizon/camera";
import { Entity } from "horizon/core";

export abstract class DigMinigameBase {
  public onFocusInteractionCallback: OnFocusInteractionCallback;

  protected root: Entity;
  protected digMinigame: DigMinigame;
  protected props;
  protected minigameOffsetY: number = 0;

  protected get owner() {
    return this.digMinigame.owner;
  }

  protected get world() {
    return this.digMinigame.world;
  }

  protected get async() {
    return this.digMinigame.async;
  }

  protected get equippedShovelData() {
    return this.digMinigame.equippedShovelData;
  }

  protected get clickDown() {
    return this.digMinigame.clickDown;
  }

  protected get inFocusMode() {
    return this.digMinigame.inFocusMode;
  }

  protected get groundDustFx() {
    return this.digMinigame.groundDustFx;
  }

  protected get itemData() {
    return this.digMinigame.itemData;
  }

  protected get itemRarity() {
    return this.digMinigame.itemRarity;
  }

  protected get digPosition() {
    return this.digMinigame.digPosition;
  }

  constructor(digMinigame: DigMinigame, root: Entity) {
    this.root = root;
    this.digMinigame = digMinigame;
    this.props = digMinigame.props;
    this.onFocusInteractionCallback = () => { return false };
  }

  public set visible(value: boolean) {
    this.root.visible.set(value);
    this.root.collidable.set(value);
  }

  public init() { }

  public deinit() { }

  public update(deltaTime: number) { }

  public onClickDown(value: boolean) { }

  public cancel() { }

  public reset() { }

  protected updateMinigameLocation() {
    let cameraOffsetY = LocalCamera.up.get().mul(this.minigameOffsetY);
    let cameraOffsetZ = LocalCamera.forward.get().mul(0.3);
    this.props.minigameRoot!.rotation.set(LocalCamera.rotation.get());
    this.props.minigameRoot!.position.set(LocalCamera.position.get().add(cameraOffsetY).add(cameraOffsetZ));
  }
}
