/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Component, Entity } from "horizon/core";

export abstract class GateAnimation<T> extends Component<T> implements IGateAnimation {
  abstract setOpen(isOpen: boolean): Promise<void>;
  abstract reset(): void;

  open() {
    return this.setOpen(true);
  }

  close() {
    return this.setOpen(false);
  }

  protected wait(ms: number): Promise<void> {
    return new Promise(resolve => {
      this.async.setTimeout(() => resolve(), ms);
    });
  }
}

export interface IGateAnimation extends Component<any> {
  setOpen(isOpen: boolean): Promise<void>;
  reset(): void;
  open(): Promise<void>;
  close(): Promise<void>;
  get entity(): Entity;
}
