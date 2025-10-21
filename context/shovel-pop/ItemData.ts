/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Asset } from "horizon/core";
import { Islands } from 'Islands';
import { Logger } from "Logger";

const log = new Logger('ItemData');

/**
 * Data for this artifact/treasure item
 */
export class ItemData {

  id: string = "";
  name: string = "";
  description: string = "";
  category: string = "";
  location: string = Islands.BeachCamp.toString();
  lootZone: string = "";
  health: number = 0;
  rarity: number = 0;
  minWeight: number = 0;
  maxWeight: number = 0;
  minValue: number = 0;
  maxValue: number = 0;
  requiredShovels: string = ""
  iconAsset: string | undefined = undefined;
  grabbableAsset: string | undefined = undefined;
  regionPityDigs: number = 10

  public constructor(init?: Partial<ItemData>) {
    Object.assign(this, init);
    log.debug(`ItemData - name: ${init?.name}`);
  }

  getIconAsset(): Asset | undefined {
    if (this.iconAsset) {
      let asset = new Asset(BigInt(this.iconAsset), BigInt(0));
      return asset;
    }
    return undefined;
  }

  getGrabbableAsset(): Asset | undefined {
    if (this.grabbableAsset) {
      let asset = new Asset(BigInt(this.grabbableAsset), BigInt(0));
      return asset;
    }
    return undefined;
  }

  // A bit hacky way of figuring out if a data is a shovel as all other items have a grabbable asset
  isShovel() {
    return this.grabbableAsset === undefined;
  }
}
