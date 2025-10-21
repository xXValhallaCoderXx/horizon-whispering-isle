/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as hz from 'horizon/core';
import { Bounds } from 'horizon/core';
import { getIslandFromID, Islands } from 'Islands';

export class IslandBounds extends hz.Component<typeof IslandBounds> {
  static propsDefinition = {
    island: {type: hz.PropTypes.String},
  };

  static islandBounds: Map<Islands, Bounds> = new Map();

  start() {
    const island = getIslandFromID(this.props.island);
    if (island == undefined) {
      throw new Error(`Invalid island name: ${this.props.island}`);
    }

    const bounds = this.entity.getPhysicsBounds();
    IslandBounds.islandBounds.set(island, bounds);
  }
}
hz.Component.register(IslandBounds);
