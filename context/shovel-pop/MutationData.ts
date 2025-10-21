/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Asset } from "horizon/core";
import { Logger } from "Logger";

const log = new Logger('MutationData');

export class MutationData {
  id: string = "";
  name: string = "";
  description: string = "";
  itemTint: string = "";
  itemTintStrength: number = 0;
  itemScaleMultiplier: number = 1;
  itemBrightness: number = 1;
  effectAsset: string | undefined = undefined;
  uiBackgroundTexture: string | undefined = undefined;
  uiRevealTexture: string | undefined = undefined;
  uiPrefixTexture: string | undefined = undefined;
  uiRevealAnimationStyle: string = "";

  public constructor(init?: Partial<MutationData>) {
    Object.assign(this, init);
    log.debug(`ItemData - name: ${init?.name}`);
  }

  getEffectAsset(): Asset | undefined {
    if (this.effectAsset) {
      let asset = new Asset(BigInt(this.effectAsset), BigInt(0));
      return asset;
    }
    return undefined;
  }

  getUIBackgroundTexture(): Asset | undefined {
    if (this.uiBackgroundTexture) {
      let asset = new Asset(BigInt(this.uiBackgroundTexture), BigInt(0));
      return asset;
    }
    return undefined;
  }

  getUIRevealTexture(): Asset | undefined {
    if (this.uiRevealTexture) {
      let asset = new Asset(BigInt(this.uiRevealTexture), BigInt(0));
      return asset;
    }
    return undefined;
  }

  getUIPrefixTexture(): Asset | undefined {
    if (this.uiPrefixTexture) {
      let asset = new Asset(BigInt(this.uiPrefixTexture), BigInt(0));
      return asset;
    }
    return undefined;
  }
}
