/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */


// TURBO USAGE: KEEP & CUSTOMIZE BASED ON YOUR NEEDS

import { DiscoveryMadePayload } from 'horizon/analytics';
import * as hz from 'horizon/core';
import { Analytics } from 'TurboAnalytics';

/* Turbo Analytics: Discovery Made Simple Trigger */
class TurboDiscoveryMadeTrigger extends hz.Component<typeof TurboDiscoveryMadeTrigger> {
  turboData!: Partial<DiscoveryMadePayload>;
  static propsDefinition = {
    discoveryItemKey: { type: hz.PropTypes.String },
    discoveryIsImplied: { type: hz.PropTypes.Boolean, default: false },
    discoveryNumTimes: { type: hz.PropTypes.Number, default: 1 },
    discoveryAmount: { type: hz.PropTypes.Number, default: 1 },
    firstTimeOnly: { type: hz.PropTypes.Boolean, default: false }
  };

  firstTimeOnly: boolean = false;

  start() {
    this.firstTimeOnly = this.props.firstTimeOnly ?? false;

    this.turboData = {
      discoveryItemKey: this.props.discoveryItemKey,
      discoveryAmount: this.props.discoveryAmount,
      discoveryIsImplied: this.props.discoveryIsImplied,
      discoveryNumTimes: this.props.discoveryNumTimes
    };

      this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterTrigger, (player: hz.Player) => {
        Analytics()?.sendDiscoveryMade({ player, ...this.turboData } as DiscoveryMadePayload, this.firstTimeOnly);
      });
    }
  }
hz.Component.register(TurboDiscoveryMadeTrigger);
