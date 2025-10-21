/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_Player_Inventory } from 'BigBox_Player_Inventory';
import { BigBox_ToastEvents } from 'BigBox_ToastManager';
import { DialogManager } from 'DialogManager';
import * as hz from 'horizon/core';
import { getIslandPotionNPCId, Islands } from 'Islands';
import { NavigationTarget } from 'NavigationArrow';
import { NPC } from 'NPC';
import { POTION_BUNDLE_ID, POTION_BUNDLE_PRICE, POTION_BUNDLE_SIZE } from 'PotionData';
import { QuestEvents, QuestManager } from 'QuestManager';
import { SubquestData } from 'SubquestData';
import { Analytics } from 'TurboAnalytics';
import { PotionPurchaseDialogParams } from 'UIView_PotionPurchase';

class NPC_PotionSeller extends hz.Component<typeof NPC_PotionSeller> {
  static propsDefinition = {
    playerInventoryManager: { type: hz.PropTypes.Entity },
    insufficientFundsLine: { type: hz.PropTypes.String },
    npc: { type: hz.PropTypes.Entity },
    purchaseAudio: { type: hz.PropTypes.Entity },
    nudgeSubquest: { type: hz.PropTypes.Entity },
  };

  private inventoryManager!: BigBox_Player_Inventory
  private npc!: NPC

  start() {
    this.inventoryManager = this.props.playerInventoryManager!.getComponents<BigBox_Player_Inventory>()[0]
    this.npc = this.props.npc!.getComponents<NPC>()[0]
    this.npc.setDialogDelegate((player, dialog) => this.showDialog(player, dialog));

    const subquest = this.props.nudgeSubquest?.getComponents<SubquestData<typeof SubquestData>>()[0]

    if (subquest && subquest.navigationTargets.length === 0) {
      if (QuestManager.IsReady()){
        this.setupNavigationTargets(subquest);
      }
      else{
        const sub = this.connectLocalBroadcastEvent(QuestEvents.questManagerInitialized, () => {
          this.setupNavigationTargets(subquest);
          sub.disconnect();
        })
      }
    }
  }

  private showDialog(player: hz.Player, dialog: string[]): bigint {
    const currencyAmount = this.inventoryManager.getPlayerCurrency(player);

    const dialogParams: PotionPurchaseDialogParams = {
      shovelID: POTION_BUNDLE_ID,
      playerMeetsLevelReq: true,
      playerCurrency: currencyAmount,
      playerItemCount1: 0,
      playerItemCount2: 0,
      playerItemCount3: 0,
    }
    return DialogManager.showPotionPurchase(this, player, dialogParams, (multiple, player) => this.onDialogSelection(player, multiple));
  }

  private onDialogSelection(player: hz.Player, multiple: number) {
    this.npc.onExternalDialogComplete(player);
    if (!player || multiple === 0) {
      return
    }

    let currencyAmount = this.inventoryManager.getPlayerCurrency(player)
    let price = POTION_BUNDLE_PRICE * multiple

    if (price > currencyAmount) {
      this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, { player: player, text: 'You do not have enough money for this potion' }, [player])
      return
    }

    this.inventoryManager.changePlayerCurrency(player, -price)
    this.inventoryManager.givePotionBundle(player, POTION_BUNDLE_SIZE * multiple);

    Analytics()?.sendTaskEnd({player, taskKey: 'potionbundle_purchase', taskType: `${POTION_BUNDLE_ID},${POTION_BUNDLE_PRICE}`})
    const subquest = this.props.nudgeSubquest?.getComponents<SubquestData<typeof SubquestData>>()[0]
    if (subquest !== undefined) {
      this.sendLocalBroadcastEvent(QuestEvents.requestFinishSubquestForPlayer, {player: player, questId: subquest.props.id});
    }
    this.props.purchaseAudio?.as(hz.AudioGizmo)?.play()
  }

  checkItem(player: hz.Player, itemID: string, requiredAmount: number): boolean {
    if (itemID === undefined || itemID === '') {
      return true;
    }
    const inventoryItemCount = this.inventoryManager.getPlayerItemCount(player, itemID);
    return inventoryItemCount >= requiredAmount;
  }

  private setupNavigationTargets(subquest: SubquestData<typeof SubquestData>){
    let targets: NavigationTarget[] = []
    for (let i = Islands.BeachCamp; i <= Islands.FairyTaleKingdom; i++) {
      const id = getIslandPotionNPCId(i)
      if (id){
        const npc = NPC.get(id)
        if (npc){
          targets.push({island: i, position: npc.entity.position.get() })
        }
      }
    }

    subquest.navigationTargets = targets;
  }
}
hz.Component.register(NPC_PotionSeller);
