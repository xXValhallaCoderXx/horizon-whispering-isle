/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_Player_Inventory } from 'BigBox_Player_Inventory';
import { DialogManager } from 'DialogManager';
import { DialogScript } from 'DialogScript';
import * as hz from 'horizon/core';
import { Logger } from 'Logger';
import { NPC } from 'NPC';
import { NPC_DialogVariables } from 'NPC_DialogVariables';
import { PlayerService } from 'PlayerService';
import { QuestData } from 'QuestData';
import { QuestEvents, QuestManager } from 'QuestManager';
import { ShovelProgressionManager } from 'ShovelProgressionManager';
import { InventorySubquestData, RetrievalSubquestData, ShovelSubquestData } from 'SubquestData';

const log = new Logger("NPC_CollectionQuest");

export class NPC_CollectionQuest extends hz.Component<typeof NPC_CollectionQuest> {
  static propsDefinition = {
    npc: { type: hz.PropTypes.Entity },
    questDialog: { type: hz.PropTypes.Entity }, // the dialog tree we switch to that asks if we have our quest item
    preQuestDialog: { type: hz.PropTypes.Entity }, // the dialog tree we use before the player qualifies for the quest
    postQuestDialog: { type: hz.PropTypes.Entity }, // the dialog tree we use when the quest is complete
    yesItemDialogId: { type: hz.PropTypes.Entity },
    itemNotFoundResponse: { type: hz.PropTypes.String, default: "You don't have any " + NPC_DialogVariables.ITEM_CATEGORY + " items..." },
    itemDeliveredDialog: { type: hz.PropTypes.Entity },
    playerInventoryManager: { type: hz.PropTypes.Entity },
    retrievalQuest: { type: hz.PropTypes.Entity }, // retrieval quest that will be completed when the player gives the npc the item
    prerequisiteQuest: { type: hz.PropTypes.Entity }, // quest that once started will change the dialog tree to the default
  };

  private inventoryManager!: BigBox_Player_Inventory
  private startedQuestDialog!: DialogScript
  private npc!: NPC
  private inventorySubquestData!: InventorySubquestData
  private requestedSubquestDatas: (InventorySubquestData | ShovelSubquestData)[] = []
  private retrievalSubquestData!: RetrievalSubquestData
  private retrievalQuest!: QuestData

  public static playerDismissFinalDialog = new hz.NetworkEvent<{ player: hz.Player }>('playerDismissFinalDialog');

  start() {
    this.initializeData();

    PlayerService.connectPlayerEnterWorld(this, (player) => {
      if (QuestManager.IsReady()) {
        this.initializeDialogForPlayer(player);
      }
      else {
        this.connectLocalBroadcastEvent(QuestEvents.questManagerInitialized, (data) => {
          this.initializeDialogForPlayer(player);
        })
      }
    })

    this.connectLocalEvent(this.props.npc!, NPC.LocalSendDialogScript, (payload) => this.onDialogChosen(payload.player, payload.scriptId))
    this.connectNetworkBroadcastEvent(QuestEvents.startQuestForPlayer, (payload) => this.onQuestStarted(payload.player, payload.questId))
  }

  initializeDialogForPlayer(player: hz.Player) {
    const prerequisiteQuest = this.props.prerequisiteQuest?.getComponents<QuestData>()[0]

    if (QuestManager.instance.hasCompletedQuest(player, this.retrievalQuest.props.id)) {
      const completedDialog = this.props.postQuestDialog!.getComponents<DialogScript>()[0]
      this.npc.switchDialogForPlayer(player, completedDialog)
    }
    else if (QuestManager.instance.hasActiveQuest(player, this.retrievalQuest.props.id)) {
      this.npc.switchDialogForPlayer(player, this.startedQuestDialog)
    }
    else if (prerequisiteQuest && !QuestManager.instance.hasCompletedQuest(player, prerequisiteQuest.props.id)
    && !QuestManager.instance.hasActiveQuest(player, prerequisiteQuest.props.id)) {
      const preReqDialog = this.props.preQuestDialog?.getComponents<DialogScript>()[0]
      this.npc.switchDialogForPlayer(player, preReqDialog)
    }
  }

  initializeData() {
    this.npc = this.props.npc!.getComponents<NPC>()[0]
    this.retrievalQuest = this.props.retrievalQuest!.getComponents<QuestData>()[0]

    this.inventoryManager = this.props.playerInventoryManager!.getComponents<BigBox_Player_Inventory>()[0]
    this.startedQuestDialog = this.props.questDialog!.getComponents<DialogScript>()[0]

    if (this.retrievalQuest.IsReady()) {
      this.onQuestDataReady();
    } else {
      let onQuestInitializedSubscription = this.connectLocalBroadcastEvent(QuestEvents.questInitialized, (data) => {
        if (data.questData === this.retrievalQuest) {
          this.onQuestDataReady();
          onQuestInitializedSubscription?.disconnect();
        }
      });
    }
  }

  onQuestDataReady() {
    for (const subquest of this.retrievalQuest.subquestDatas) {
      if (subquest instanceof RetrievalSubquestData) {
        this.retrievalSubquestData = subquest
        subquest.setNpcName(this.npc.props.name)
      } else if (subquest instanceof InventorySubquestData) {
        this.inventorySubquestData = subquest
        this.requestedSubquestDatas.push(subquest)
      } else if (subquest instanceof ShovelSubquestData) {
        this.requestedSubquestDatas.push(subquest)
      }
    }

    if (this.retrievalSubquestData?.props.requirementQuest && this.inventorySubquestData === undefined){
      const requirementQuest = this.retrievalSubquestData.props.requirementQuest.getComponents<QuestData>()[0]
      for (const subquest of requirementQuest.subquestDatas) {
        if (subquest instanceof InventorySubquestData) {
          this.requestedSubquestDatas.push(subquest)
          this.inventorySubquestData = subquest
        } else if (subquest instanceof ShovelSubquestData) {
          this.requestedSubquestDatas.push(subquest)
        }
      }
    }

    if (!this.retrievalSubquestData) {
      log.error("NPC_CollectionQuest: Retrieval subquest data not found for quest " + this.retrievalQuest.props.id)
      return
    }

    if (this.requestedSubquestDatas.length === 0) {
      log.info("NPC_CollectionQuest: Inventory or shovel subquest data not found for quest " + this.retrievalQuest.props.id)
    }

    const npcPosition = this.npc.entity.position.get();
    this.retrievalSubquestData.navigationTarget = npcPosition;
    this.sendNetworkBroadcastEvent(QuestEvents.navigationTargetUpdatedForQuest, { questId: this.retrievalSubquestData.props.id, position: this.npc.entity.position.get() }, [this.world.getServerPlayer()]);
  }

  onQuestStarted(player: hz.Player, questId: string) {
    if (QuestManager.instance.hasActiveQuest(player, this.retrievalQuest.props.id) || this.retrievalQuest.props.id === questId) {
      this.npc.switchDialogForPlayer(player, this.startedQuestDialog)
      return
    }

    const prerequisiteQuest = this.props.prerequisiteQuest?.getComponents<QuestData>()[0]
    if (prerequisiteQuest && (QuestManager.instance.hasActiveQuest(player, prerequisiteQuest.props.id) || prerequisiteQuest.props.id === questId)) {
      this.npc.switchDialogForPlayer(player, undefined)
    }
  }

  onDialogChosen(player: hz.Player, scriptId: hz.Entity) {
    if (scriptId !== this.props.yesItemDialogId) {
      return
    }

    // player has answered "yes" to having the quest item
    // have real pandoran patriots fact check that assertion

    const inventory = this.inventoryManager.getPlayerInventory(player)!

    let foundAllItems = true
    let lockedItems = new Set<string>()
    for (let i = 0; i < this.requestedSubquestDatas.length; i++) {
      const subquestData = this.requestedSubquestDatas[i]
      if (subquestData instanceof InventorySubquestData) {
        let itemIndices = this.getItemIndices(player, subquestData);
        itemIndices.forEach((itemIndex) => {
          let item = inventory[itemIndex]
          if (item && item.isLocked) {
            lockedItems.add(item.info.name)
          }
        })

        foundAllItems = foundAllItems && itemIndices.length >= subquestData.props.itemAmount

      } else if (subquestData instanceof ShovelSubquestData) {
        foundAllItems = foundAllItems && this.checkShovel(player, subquestData)
      }
    }

    if (!foundAllItems) {
      const response = this.props.itemNotFoundResponse.replace(NPC_DialogVariables.ITEM_CATEGORY, this.inventorySubquestData.props.itemCategory)
      DialogManager.show(this, player, {
        title: this.npc.props.name,
        text: response,
        option1: "Okay",
        buttonShowDelayMs: 700,
      })

      return
    }

    if (lockedItems.size === 0) {
      this.finishCollection(player) // no items are locked, so we can just finish the quest
      return
    }

    // some items are locked, so we need to ask the player if they want to collect them anyways
    DialogManager.show(this, player, {
      title: this.npc.props.name,
      text: this.getLockedItemsReponse(lockedItems),
      option1: "Yes",
      option2: "No",
      buttonShowDelayMs: 700,
    }, (player, selection) => {
      if (selection === 0) {
        this.finishCollection(player)
      }
    })
  }

  finishCollection(player: hz.Player) {
    // TODO: This is pretty flaky - order matters for quest manager to be able to
    // know to complete the quest before the item is removed from the player's inventory
    this.sendLocalBroadcastEvent(QuestEvents.requestFinishSubquestForPlayer, { player: player, questId: this.retrievalSubquestData.props.id })

    const completedDialog = this.props.postQuestDialog!.getComponents<DialogScript>()[0]
    this.npc.switchDialogForPlayer(player, completedDialog)

    let itemDisplayText = "";

    this.inventoryManager.startBatchChange(player);
    for (let i = 0; i < this.requestedSubquestDatas.length; i++) {
      const subquestData = this.requestedSubquestDatas[i]
      if (subquestData instanceof InventorySubquestData) {
        let itemIndices = this.getItemIndices(player, subquestData);
        for (let j = 0; j < itemIndices.length; j++) {
          let itemIndex = itemIndices[j];
          const itemState = this.inventoryManager.getItem(player, itemIndex)!
          itemDisplayText = itemState.info.name
          this.inventoryManager.removeItem(player, itemIndex)
        }
      }
    }
    this.inventoryManager.endBatchChange(player);

    const deliveredDialog = this.props.itemDeliveredDialog!.getComponents<DialogScript>()[0]
    const response = NPC_DialogVariables.replaceDialogVar(deliveredDialog.props.response, itemDisplayText, NPC_DialogVariables.ITEM_ID)

    DialogManager.show(this, player, {
      title: this.npc.props.name,
      text: response,
      option1: deliveredDialog.props.option1,
      option2: deliveredDialog.props.option2,
      option3: deliveredDialog.props.option3,
      buttonShowDelayMs: 700
    },
      (player, selection) => {
        const next = this.selectionToDialog(selection, deliveredDialog)
        this.processDialog(player, next)
      }
    );
  }

  getItemIndices(player: hz.Player, subquestData: InventorySubquestData): number[] {
    const inventory = this.inventoryManager.getPlayerInventory(player)
    if (!inventory) {
      return [] // player doesnt have an inventory for some reason???
    }

    let itemIndices = []
    for (let i = 0; i < inventory.length && itemIndices.length < subquestData.props.itemAmount; i++) {
      const item = inventory[i]
      if (item) {
        if (item.info.id === this.inventorySubquestData.props.itemId || item.info.category === this.inventorySubquestData.props.itemCategory) {
          itemIndices.push(i);
        }
      }
    }

    return itemIndices;
  }

  checkShovel(player: hz.Player, shovelSubquestData: ShovelSubquestData): boolean {
    return ShovelProgressionManager.instance.hasShovel(player, shovelSubquestData.props.shovelId);
  }

  processDialog(player: hz.Player, dialog: DialogScript | undefined) {
    if (dialog) {
      const response = NPC_DialogVariables.replaceDialogVar(dialog.props.response, this.npc.props.name, NPC_DialogVariables.ITEM_ID)
      DialogManager.show(this, player, {
        title: this.npc.props.name,
        text: response,
        option1: dialog.props.option1,
        option2: dialog.props.option2,
        option3: dialog.props.option3,
        buttonShowDelayMs: 700
      },
        (player, selection) => {
          const next = this.selectionToDialog(selection, dialog)
          this.processDialog(player, next)
        }
      );
    }
    else {
      this.sendNetworkEvent(this.props.npc!, NPC_CollectionQuest.playerDismissFinalDialog, { player: player }, [this.world.getServerPlayer()])
    }
  }

  getLockedItemsReponse(lockedItems: Set<string>): string {
    let response = 'Your '
    if (lockedItems.size === 1) {
      return response + lockedItems.values().next().value + ' is locked. Do you want me to collect it anyways?'
    }

    let i = 0
    lockedItems.forEach((itemName) => {
      if (i === lockedItems.size - 1) {
        response += ' and '
      }
      else if (i > 0){
        response += ', '
      }

      response += itemName
      i++
    })

    return response + ' are locked. Do you want me to collect them anyways?'
  }

  selectionToDialog(selection: number, dialog: DialogScript | undefined): DialogScript | undefined {
    switch (selection) {
      case 0:
        return dialog?.props.nextDialog1?.getComponents<DialogScript>()[0]
      case 1:
        return dialog?.props.nextDialog2?.getComponents<DialogScript>()[0]
      case 2:
        return dialog?.props.nextDialog3?.getComponents<DialogScript>()[0]
    }

    return undefined
  }
}
hz.Component.register(NPC_CollectionQuest);
