/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as hz from 'horizon/core';

export class ItemID extends hz.Component<typeof ItemID> {
  static propsDefinition = {
    id: {type: hz.PropTypes.String},
  };

  start() {

  }
}
hz.Component.register(ItemID);
