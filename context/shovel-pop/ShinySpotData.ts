/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Logger } from "Logger";

const log = new Logger('ItemData');

/**
 * Data for this artifact/treasure item
 */
export class VectorObject {
  x: number = 0;
  y: number = 0;
  z: number = 0;
}

export class QuaternionObject {
  x: number = 0;
  y: number = 0;
  z: number = 0;
  w: number = 0;
}

export class ShinySpotData {
  Name: string = "";
  EntityId: string = "";
  Position: VectorObject = { x: 0, y: 0, z: 0 };
  Rotation: QuaternionObject = { x: 0, y: 0, z: 0, w: 1 };
  Scale: VectorObject = { x: 1, y: 1, z: 1 };

  public constructor(init?: Partial<ShinySpotData>) {
    Object.assign(this, init);
    log.debug(`ItemData - name: ${init?.Name}`);
  }
}
