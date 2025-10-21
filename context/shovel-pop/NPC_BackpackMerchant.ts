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
import { NPC } from 'NPC';
import { PlayerData } from 'PlayerData';
import { PlayerDataEvents } from 'PlayerDataEvents';
import { Analytics } from 'TurboAnalytics';
import { BackpackPurchaseDialogParams } from 'UIView_BackpackPurchase';

class NPC_BackpackMerchant extends hz.Component<typeof NPC_BackpackMerchant> {
  static propsDefinition = {
    npc: { type: hz.PropTypes.Entity },
    insufficientFundsLine: { type: hz.PropTypes.String },
    purchaseAudio: { type: hz.PropTypes.Entity },
  };

  private npc!: NPC;

  start() {
    this.npc = this.props.npc!.getComponents<NPC>()[0];
    this.npc.setDialogDelegate((player, dialog) => this.showDialog(player, dialog));
  }

  private showDialog(player: hz.Player, dialog: string[]): bigint {
    const inventoryManager = BigBox_Player_Inventory.instance;

    let currencyAmount = inventoryManager.getPlayerCurrency(player);
    let currentBackpackLevel = PlayerData.getBackpackLevel(player);
    let nextBackpackLevel = currentBackpackLevel + 1;
    if (nextBackpackLevel >= BigBox_Player_Inventory.backpackLevelPrices.length) {
      return DialogManager.show(this, player, {
        title: this.npc.props.name,
        text: "Your backpack is fully upgraded!",
        option1: "Okay",
        buttonShowDelayMs: 700,
      })
    }
    let price = BigBox_Player_Inventory.backpackLevelPrices[nextBackpackLevel];
    let xp = PlayerData.getExperience(player);
    let playerLevel = BigBox_ExpCurve.instance.ExpToCurrentLevel(xp);
    let levelRequirement = BigBox_Player_Inventory.backpackPlayerLevelRequirements[nextBackpackLevel];

    const dialogParams: BackpackPurchaseDialogParams = {
      currentBackpackLevel: currentBackpackLevel,
      nextBackpackLevel: nextBackpackLevel,
      playerMeetsLevelReq: playerLevel >= levelRequirement,
      playerHasEnoughMoney: currencyAmount >= price,
      price: price,
      currentInventorySize: BigBox_Player_Inventory.inventorySizePerLevel[currentBackpackLevel],
      newInventorySize: BigBox_Player_Inventory.inventorySizePerLevel[nextBackpackLevel],
    }
    return DialogManager.showBackpackPurchase(this, player, dialogParams, (purchase, player) => this.onDialogChosen(player, purchase));
  }

  onDialogChosen(player: hz.Player, purchase: boolean){
    this.npc.onExternalDialogComplete(player);
    if (!player || !purchase) {
      return
    }

    const inventoryManager = BigBox_Player_Inventory.instance;

    let nextBackpackLevel = PlayerData.getBackpackLevel(player) + 1;
    let levelRequirement = BigBox_Player_Inventory.backpackPlayerLevelRequirements[nextBackpackLevel];
    let xp = BigBox_ExpManager.instance.GetPlayerExp(player);
    let playerLevel = BigBox_ExpCurve.instance.ExpToCurrentLevel(xp);

    if (playerLevel < levelRequirement) {
      // not high enough level
      this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, { player: player, text: `You must be level ${levelRequirement} to buy this upgrade` }, [player]);
      Analytics()?.sendFrictionHit({player, frictionItemKey: 'backpack_purchase_denied_level'});
      return;
    }

    let currencyAmount = inventoryManager.getPlayerCurrency(player);
    let price = BigBox_Player_Inventory.backpackLevelPrices[nextBackpackLevel];

    if (price > currencyAmount) {
      this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, { player: player, text: this.props.insufficientFundsLine }, [player]);
      Analytics()?.sendFrictionHit({player, frictionItemKey: 'backpack_purchase_denied_price'});
      return;
    }

    inventoryManager.changePlayerCurrency(player, -price);
    this.sendNetworkBroadcastEvent(PlayerDataEvents.incrementBackpackLevel, {player: player}, [this.world.getServerPlayer()]);
    this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, { player: player, text: `Purchased Backpack Level ${nextBackpackLevel}` }, [player]);
    Analytics()?.sendTaskEnd({player, taskKey: 'backpack_purchase', taskType: `${nextBackpackLevel + 1},${price}`});
    this.props.purchaseAudio?.as(hz.AudioGizmo)?.play();
  }
}
hz.Component.register(NPC_BackpackMerchant);
