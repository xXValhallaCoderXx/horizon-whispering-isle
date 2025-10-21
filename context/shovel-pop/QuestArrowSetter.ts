/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { DigZone } from 'DigZone';
import * as hz from 'horizon/core';
import { getIslandFromID } from 'Islands';
import { QuestEvents } from 'QuestManager';
import { SubquestData } from 'SubquestData';
/**
 * Sets the navigation target for the referenced quest.
 */
class QuestArrowSetter extends hz.Component<typeof QuestArrowSetter> {
  static propsDefinition = {
    subquest: {type: hz.PropTypes.Entity},
    trigger: {type: hz.PropTypes.Entity},
  };

  start() {
    const subquestData = this.props.subquest!.getComponents(SubquestData)[0]
    const pos = this.entity.position.get()
    subquestData.navigationTarget = pos

    const region = this.props.trigger?.getComponents<DigZone>()[0]
    if (region) {
      const target = { island: getIslandFromID(region.props.island)!, position: pos , region: region.props.id }
      subquestData.navigationTargets = [target]
      this.sendNetworkBroadcastEvent(QuestEvents.navigationTargetsUpdatedForQuest, {questId: subquestData.props.id, positions: subquestData.navigationTargets}, [this.world.getServerPlayer()])
    }
    else{
      this.sendNetworkBroadcastEvent(QuestEvents.navigationTargetUpdatedForQuest, {questId: subquestData.props.id, position: pos}, [this.world.getServerPlayer()])
    }
  }
}
hz.Component.register(QuestArrowSetter);
