/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { formatString } from "GameUtils";
import { Component, Entity, Player, PropTypes } from "horizon/core";
import { ActiveQuestData, QuestEvents, SubquestState } from "QuestManager";
import { InventorySubquestData, RetrievalSubquestData, SubquestData } from "SubquestData";

/**
 * Data for this artifact/treasure item
 */
export class QuestData extends Component<typeof QuestData> {
  static propsDefinition = {
    id: { type: PropTypes.String, default: "UniqueID" }, // Unique ID - MUST BE UNIQUE - this part is not a meme
    name: { type: PropTypes.String, default: "Item" }, // Human readable name
    currencyReward: { type: PropTypes.Number, default: 0 },
    gemReward: { type: PropTypes.Number, default: 0 },
    xpReward: { type: PropTypes.Number, default: 0 },
    repeatable: { type: PropTypes.Boolean, default: true },
    randomObjective: { type: PropTypes.Boolean, default: false },
    prerequisiteQuest: { type: PropTypes.Entity },
    nextQuest: { type: PropTypes.Entity },
    startSfx: { type: PropTypes.Entity },
    completionSfx: { type: PropTypes.Entity },
  };

  public prerequisiteQuestData: QuestData | undefined = undefined;
  public nextQuestData: QuestData | undefined = undefined;

  public subquestDatas: SubquestData<typeof SubquestData>[] = [];

  public IsReady() {
    return this.isReady;
  }

  private isReady = false;

  start() {
    if (this.props.prerequisiteQuest) {
      this.prerequisiteQuestData = this.props.prerequisiteQuest.getComponents(QuestData)[0];
    }

    if (this.props.nextQuest) {
      this.nextQuestData = this.props.nextQuest.getComponents(QuestData)[0];
    }

    let inventorySubquestDatas: InventorySubquestData[] = [];
    let retrievalSubquestData: RetrievalSubquestData | undefined;

    this.entity.children.get().forEach((child: Entity, childIndex: number) => {
      let subquestData = child.getComponents(SubquestData)[0];
      this.subquestDatas.push(subquestData);
      if (subquestData instanceof InventorySubquestData) {
        inventorySubquestDatas.push(subquestData);
      }
      if (subquestData instanceof RetrievalSubquestData) {
        retrievalSubquestData = subquestData;
      }
    });

    if (retrievalSubquestData) {
      retrievalSubquestData.setInventorySubquestDatas(inventorySubquestDatas);
    }

    this.isReady = true;
    this.sendLocalBroadcastEvent(QuestEvents.questInitialized, { questData: this });
  }

  isValid(player: Player): boolean {
    for (let i = 0; i < this.subquestDatas.length; i++) {
      if (!this.subquestDatas[i].isValid(player)) {
        return false;
      }
    }
    return true;
  }

  createActiveQuest(parameters?: string[]): ActiveQuestData {
    const questId = parameters ? formatString(this.props.id, ...parameters) : this.props.id;
    const questName = this.props.name;
    const currencyReward = this.props.currencyReward;
    const xpReward = this.props.xpReward;
    const gemReward = this.props.gemReward;
    const subquestStates: SubquestState[] = [];
    return { questId, questName, currencyReward, xpReward, gemReward, subquestStates };
  }

}
Component.register(QuestData);
