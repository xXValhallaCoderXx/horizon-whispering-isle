/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as hz from 'horizon/core';
import { QuestData } from 'QuestData';
import { QuestEvents } from 'QuestManager';
import { SubquestData } from 'SubquestData';

class QuestIndicatorIcon extends hz.Component<typeof QuestIndicatorIcon> {
  static propsDefinition = {
    icon: { type: hz.PropTypes.Entity },
    inProgressIcon: { type: hz.PropTypes.Entity },
    targetQuest: { type: hz.PropTypes.Entity },
  };

  private availableIconVisibleToPlayers = new Set<hz.Player>()
  private inProgressIconVisibleToPlayers = new Set<hz.Player>()
  private onUpdateSub: hz.EventSubscription | undefined

  private static OSC_TIME = 3 * 1000
  private static OSC_DIST = 0.5 / 2 // divide in half so we oscillate between 0 and dist

  start() {
    this.props.icon?.setVisibilityForPlayers([], hz.PlayerVisibilityMode.VisibleTo)
    this.props.inProgressIcon?.setVisibilityForPlayers([], hz.PlayerVisibilityMode.VisibleTo)

    if (this.props.targetQuest === undefined) {
      return;
    }

    const targetQuest: QuestData | SubquestData<typeof SubquestData> = this.props.targetQuest!.getComponents<QuestData>()[0] ?? this.props.targetQuest!.getComponents<SubquestData<typeof SubquestData>>()[0]

    this.connectLocalBroadcastEvent(QuestEvents.newQuestsAvailableForPlayer, (payload) => {
      if (payload.newQuestIds.includes(targetQuest.props.id)){
        this.availableIconVisibleToPlayers.add(payload.player)
        this.props.icon?.visible.set(this.availableIconVisibleToPlayers.size > 0)
        this.props.icon?.setVisibilityForPlayers(Array.from(this.availableIconVisibleToPlayers), hz.PlayerVisibilityMode.VisibleTo)

        this.checkOnUpdateSub();
      }
    });

    this.connectNetworkBroadcastEvent(QuestEvents.startQuestForPlayer, (payload) =>{
      if (payload.questId === targetQuest.props.id){
        this.availableIconVisibleToPlayers.delete(payload.player)
        this.props.icon?.visible.set(this.availableIconVisibleToPlayers.size > 0)
        this.props.icon?.setVisibilityForPlayers(Array.from(this.availableIconVisibleToPlayers), hz.PlayerVisibilityMode.VisibleTo)

        this.inProgressIconVisibleToPlayers.add(payload.player)
        this.props.inProgressIcon?.visible.set(this.inProgressIconVisibleToPlayers.size > 0)
        this.props.inProgressIcon?.setVisibilityForPlayers(Array.from(this.inProgressIconVisibleToPlayers), hz.PlayerVisibilityMode.VisibleTo)

        this.checkOnUpdateSub();
      }
    })

    this.connectNetworkBroadcastEvent(QuestEvents.finishQuestForPlayer, (payload) =>{
      if (payload.questId === targetQuest.props.id){
        this.inProgressIconVisibleToPlayers.delete(payload.player)
        this.props.inProgressIcon?.visible.set(this.inProgressIconVisibleToPlayers.size > 0)
        this.props.inProgressIcon?.setVisibilityForPlayers(Array.from(this.inProgressIconVisibleToPlayers), hz.PlayerVisibilityMode.VisibleTo)

        this.checkOnUpdateSub();
      }
    })
  }

  checkOnUpdateSub(){
    if (this.availableIconVisibleToPlayers.size > 0 || this.inProgressIconVisibleToPlayers.size > 0){
      if (this.onUpdateSub === undefined){
        this.onUpdateSub = this.connectLocalBroadcastEvent(hz.World.onUpdate, () => this.oscillate())
      }
    }
    else {
      this.onUpdateSub?.disconnect()
      this.onUpdateSub = undefined
    }
  }

  oscillate(){
    let rootPos = this.entity.position.get()
    const timeSeconds = Date.now() / QuestIndicatorIcon.OSC_TIME
    rootPos.y += Math.sin(2 * Math.PI * timeSeconds) * QuestIndicatorIcon.OSC_DIST + QuestIndicatorIcon.OSC_DIST

    this.props.icon?.position.set(rootPos)
    this.props.inProgressIcon?.position.set(rootPos)
  }
}
hz.Component.register(QuestIndicatorIcon);
