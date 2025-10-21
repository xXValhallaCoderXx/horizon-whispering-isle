/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as hz from 'horizon/core';
import { RaycastGizmo } from 'horizon/core';

export class RaycastHelper extends hz.Component<typeof RaycastHelper> {
  static propsDefinition = {};

  private static _instance: RaycastGizmo | null;
  public static get instance(): RaycastGizmo { return this._instance!; }

  start() {
    if (!RaycastHelper._instance) {
      RaycastHelper._instance = this.entity.as(RaycastGizmo);
    }
  }
}
hz.Component.register(RaycastHelper);
