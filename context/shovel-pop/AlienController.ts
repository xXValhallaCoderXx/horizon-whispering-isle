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

const log = new Logger("AlienController");

class AlienController extends hz.Component<typeof AlienController> {
  static propsDefinition = { AlienGreen: { type: PropTypes.Entity }, trigger: { type: PropTypes.Entity } };

  start() {
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
    var abg = this.props.AlienGreen?.as(AssetBundleGizmo);
    if (abg) {
      var root = abg.getRoot();
      if (root) {
        root.setAnimationParameterBool("IsTalking", isGood);
      } else {
        log.error("Could not find root of AlienGreen");
      }
    } else {
      log.error("Could not find AssetBundleGizmo on AlienGreen");
    }
  }
}

hz.Component.register(AlienController);
//Alien Talk Trigger.  Uses the IsTalking Boolean parameter.
