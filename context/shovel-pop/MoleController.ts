/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as hz from 'horizon/core';
import { CodeBlockEvents, PropTypes } from 'horizon/core';
import { AssetBundleGizmo } from 'horizon/unity_asset_bundles';
import { Logger } from 'Logger';

const log = new Logger("MoleController");

class MoleController extends hz.Component<typeof MoleController> {
  static propsDefinition = { DougDig: { type: PropTypes.Entity }, trigger: { type: PropTypes.Entity } };

  start() {
    log.info("MoleController started");

    this.connectCodeBlockEvent(this.props.trigger!, CodeBlockEvents.OnPlayerEnterTrigger, () => {
      log.info("Player entered trigger");
      this.setIsGood(true);
    });

    this.connectCodeBlockEvent(this.props.trigger!, CodeBlockEvents.OnPlayerExitTrigger, () => {
      log.info("Player exited trigger");
      this.setIsGood(false);
    });
  }

  setIsGood(isGood: boolean) {
    //log.info(`Is good: ${isGood}`);

    var abg = this.props.DougDig!.as(AssetBundleGizmo)!;
    if (abg) {
      var root = abg.getRoot();
      if (root) {
        root.setAnimationParameterBool("IsTalking", isGood);
      } else {
        log.error("Could not find root of DougDig");
      }
    } else {
      log.error("Could not find AssetBundleGizmo on DougDig");
    }
  }
}

hz.Component.register(MoleController);
//Mole Talk Trigger.  Uses the IsTalking Boolean parameter.
