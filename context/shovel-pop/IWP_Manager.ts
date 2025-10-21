/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_Player_Inventory } from 'BigBox_Player_Inventory';
import * as hz from 'horizon/core';
import { CodeBlockEvents, Player } from 'horizon/core';
import { Logger } from 'Logger';
//import { IWP } from 'horizon/experimental';

const log = new Logger("IWP_Manager");

export class IWP_Manager extends hz.Component<typeof IWP_Manager> {
  static propsDefinition = {
    playerInventoryManager: { type: hz.PropTypes.Entity },
  };

  public static readonly currencySmallId = 'currency_small_22acabe1';
  public static readonly currencyMediumId = 'currency_medium_a33830e2';
  public static readonly currencyLargeId = 'currency_large_238a0558';
  public static readonly currencyXLargeId = 'currency_xlarge_ab6fb696';
  public static readonly sellAnywhereId = 'sell_anywhere_3f6a35b7';

  private sellAnywhere: boolean = false;

  private inventoryManager!: BigBox_Player_Inventory;

  start() {
    this.inventoryManager = this.props.playerInventoryManager!.getComponents<BigBox_Player_Inventory>()[0];

    //IWP.getWorldItemsBySKU

    this.connectCodeBlockEvent(this.entity, CodeBlockEvents.OnItemPurchaseComplete, (player, item, success) => { this.purchase(player, item, success); });
  }

  purchase(player: Player, item: string, success: boolean) {
    switch (item) {
      case IWP_Manager.currencySmallId:
        this.playerPurchaseEffects(player, item, success, 100);
        break;
      case IWP_Manager.currencyMediumId:
        this.playerPurchaseEffects(player, item, success, 700);
        break;
      case IWP_Manager.currencyLargeId:
        this.playerPurchaseEffects(player, item, success, 1700);
        break;
      case IWP_Manager.currencyXLargeId:
        this.playerPurchaseEffects(player, item, success, 5000);
        break;
        case IWP_Manager.sellAnywhereId:
          this.sellAnywhere = true;
          break;
      default:
        log.error('Purchase item not found: ' + item);
        break;
    }
  }

  playerPurchaseEffects(player: Player, item: string, success: boolean, amount: number) {
    if (success) {
      // Increment the player's currency
      this.inventoryManager.changePlayerCurrency(player, amount);
    }
  }
}
hz.Component.register(IWP_Manager);
