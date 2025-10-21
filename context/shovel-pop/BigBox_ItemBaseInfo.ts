/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as hz from 'horizon/core';

/**
 * Immutable information about an item
 */
export class ItemBaseInfo extends hz.Component<typeof ItemBaseInfo> {
  static propsDefinition = {
    id: { type: hz.PropTypes.String },
    name: { type: hz.PropTypes.String },
    model: { type: hz.PropTypes.Asset }
  };

  start() {
  }
}
hz.Component.register(ItemBaseInfo);
