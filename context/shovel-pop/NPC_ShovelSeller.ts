/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_ExpCurve } from 'BigBox_ExpCurve';
import { BigBox_ExpManager } from 'BigBox_ExpManager';
import { BigBox_Player_Inventory } from 'BigBox_Player_Inventory';
import { BigBox_ToastEvents } from 'BigBox_ToastManager';
import { DialogManager } from 'DialogManager';
import * as hz from 'horizon/core';
import { PropTypes } from 'horizon/core';
import { ItemContainer } from 'ItemContainer';
import { Logger } from 'Logger';
import { NPC } from 'NPC';
import { getPlayerInventoryData } from 'PlayerInventoryData';
import { PlayerService } from 'PlayerService';
import { QuestEvents } from 'QuestManager';
import { ShovelData } from 'ShovelData';
import { ShovelProgressionManager } from 'ShovelProgressionManager';
import { SubquestData } from 'SubquestData';
import { Analytics } from 'TurboAnalytics';
import { ShovelPurchaseDialogParams } from 'UIView_DialogShovelPurchase';

const log = new Logger("NPC_ShovelSeller");

class NPC_ShovelSeller extends hz.Component<typeof NPC_ShovelSeller> {
  static propsDefinition = {
    playerInventoryManager: { type: hz.PropTypes.Entity },
    shovelProgressionManager: { type: hz.PropTypes.Entity },
    expManager: { type: PropTypes.Entity },
    expCurve: { type: PropTypes.Entity },
    shovelId: { type: PropTypes.String }, // data of the shovel we are selling
    insufficientFundsLine: { type: hz.PropTypes.String },
    insufficientLevelLine: { type: hz.PropTypes.String },
    afterPurchaseDialog: { type: hz.PropTypes.Entity },
    npc: { type: hz.PropTypes.Entity },
    sellSubquest: { type: PropTypes.Entity },
    purchaseAudio: { type: hz.PropTypes.Entity },
    textTitle: { type: hz.PropTypes.Entity },
    textRequirements: { type: hz.PropTypes.Entity },
    vfx: { type: hz.PropTypes.Entity },
  };

  private inventoryManager!: BigBox_Player_Inventory
  private shovelManager!: ShovelProgressionManager
  private npc!: NPC
  private sellSubquest: SubquestData<typeof SubquestData> | undefined

  private shovelData?: ShovelData;
  private expManager!: BigBox_ExpManager;
  private expCurve!: BigBox_ExpCurve;

  start() {
    this.inventoryManager = this.props.playerInventoryManager!.getComponents<BigBox_Player_Inventory>()[0]
    this.npc = this.props.npc!.getComponents<NPC>()[0]
    this.npc.setDialogDelegate((player, dialog) => this.showDialog(player, dialog));
    this.shovelManager = this.props.shovelProgressionManager!.getComponents<ShovelProgressionManager>()[0]
    const serverPlayer = this.world.getServerPlayer();
    this.expManager = this.props.expManager!.getComponents<BigBox_ExpManager>()[0]!
    this.expCurve = this.props.expCurve!.getComponents<BigBox_ExpCurve>()[0]!
    this.sellSubquest = this.props.sellSubquest?.getComponents<SubquestData<typeof SubquestData>>()[0]
    if (this.sellSubquest) {
      const npcPosition = this.npc.entity.position.get();
      this.sellSubquest.navigationTarget = npcPosition
      this.sendNetworkBroadcastEvent(QuestEvents.navigationTargetUpdatedForQuest, { questId: this.sellSubquest.props.id, position: npcPosition }, [serverPlayer]);
    }
    const sub = this.connectLocalBroadcastEvent(ItemContainer.itemDataLoadComplete, () =>{
      this.shovelData = ShovelProgressionManager.instance.getShovelDataForId(this.props.shovelId);
      if (!this.shovelData) {
        console.error('No data for shovel id: ' + this.props.shovelId);
        return;
      }
      else{
        this.props.textTitle?.as(hz.TextGizmo).text.set(this.shovelData.name);
        this.props.textRequirements?.as(hz.TextGizmo).text.set('Requires Lv. ' + this.shovelData.levelRequirement);
      }
      sub.disconnect()
    })

    PlayerService.connectPlayerEnterWorld(this, (player) => {
      const inventoryData = getPlayerInventoryData(this.world, player)
      if (inventoryData && inventoryData.shovels.includes(this.props.shovelId)){
        this.hideFromPlayer(player)
      }
    })
  }

  private showDialog(player: hz.Player, dialog: string[]): bigint {
    if (this.shovelData === undefined) {
      throw new Error("Shovel data is not defined");
    }
    const xp = this.expManager.GetPlayerExp(player);
    const level = this.expCurve.ExpToCurrentLevel(xp);
    const currencyAmount = this.inventoryManager.getPlayerCurrency(player);
    const playerItemCount1 = this.inventoryManager.getPlayerItemCount(player, this.shovelData.itemCost1ID);
    const playerItemCount2 = this.inventoryManager.getPlayerItemCount(player, this.shovelData.itemCost2ID);
    const playerItemCount3 = this.inventoryManager.getPlayerItemCount(player, this.shovelData.itemCost3ID);
    const playerItemCount4 = this.inventoryManager.getPlayerItemCount(player, this.shovelData.itemCost4ID);
    const dialogParams: ShovelPurchaseDialogParams = {
      shovelID: this.shovelData.id,
      playerMeetsLevelReq: level >= this.shovelData.levelRequirement,
      playerHasEnoughMoney: currencyAmount >= this.shovelData.price,
      playerItemCount1,
      playerItemCount2,
      playerItemCount3,
      playerItemCount4,
    }
    return DialogManager.showShovelPurchase(this, player, dialogParams, (purchase, player) => this.onDialogSelection(player, purchase));
  }

  private onDialogSelection(player: hz.Player, purchase: boolean) {
    this.npc.onExternalDialogComplete(player);
    if (!player || !purchase || this.shovelData === undefined) {
      return
    }

    const inventoryData = getPlayerInventoryData(this.world, player)
    if (inventoryData && inventoryData.shovels.includes(this.shovelData.id)) {
      // already have this shovel
      this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, { player: player, text: `You already own this shovel` }, [player])
      return
    }

    const xp = this.expManager.GetPlayerExp(player)
    const level = this.expCurve.ExpToCurrentLevel(xp)

    if (this.shovelData.levelRequirement > level) {
      this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, { player: player, text: `You must be level ${this.shovelData.levelRequirement} to buy this shovel` }, [player])
      Analytics()?.sendFrictionHit({player, frictionItemKey: 'shovel_purchase_denied_level'})
      return
    }

    let currencyAmount = this.inventoryManager.getPlayerCurrency(player)

    if (this.shovelData.price > currencyAmount) {
      this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, { player: player, text: 'You do not have enough money for this shovel' }, [player])
      Analytics()?.sendFrictionHit({player, frictionItemKey: 'shovel_purchase_denied_price'})
      return
    }

    let hasItems = true;
    hasItems &&= this.inventoryManager.checkItem(player, this.shovelData.itemCost1ID, this.shovelData.itemCost1Amount);
    hasItems &&= this.inventoryManager.checkItem(player, this.shovelData.itemCost2ID, this.shovelData.itemCost2Amount);
    hasItems &&= this.inventoryManager.checkItem(player, this.shovelData.itemCost3ID, this.shovelData.itemCost3Amount);
    if (!hasItems) {
      this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, { player: player, text: 'You do not have the required items for this shovel' }, [player])
      Analytics()?.sendFrictionHit({player, frictionItemKey: 'shovel_purchase_denied_item'})
      return
    }

    this.inventoryManager.changePlayerCurrency(player, -this.shovelData.price)
    this.inventoryManager.removeItems(player, [
      { itemId: this.shovelData.itemCost1ID, amount: this.shovelData.itemCost1Amount },
      { itemId: this.shovelData.itemCost2ID, amount: this.shovelData.itemCost2Amount },
      { itemId: this.shovelData.itemCost3ID, amount: this.shovelData.itemCost3Amount },
    ]);
    this.shovelManager.giveShovel(player, this.shovelData.id, true)

    this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, { player: player, text: `Purchased ${this.shovelData.name} Shovel` }, [player]);
    Analytics()?.sendTaskEnd({player, taskKey: 'shovel_purchase', taskType: `${this.shovelData.id},${this.shovelData.price}`});

    this.props.purchaseAudio?.as(hz.AudioGizmo)?.play()
    this.hideFromPlayer(player)

    if (this.sellSubquest) {
      this.sendLocalBroadcastEvent(QuestEvents.requestFinishSubquestForPlayer, { player: player, questId: this.sellSubquest.props.id });
    }
  }

  private hideFromPlayer(player: hz.Player) {
    this.npc.hideFromPlayer(player);
    this.props.vfx?.as(hz.ParticleGizmo).stop({ players: this.npc.getHiddenFromPlayers() });
  }
}
hz.Component.register(NPC_ShovelSeller);
