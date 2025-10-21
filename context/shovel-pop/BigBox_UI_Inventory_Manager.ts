/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_Player_Inventory } from 'BigBox_Player_Inventory';
import { Events } from 'Events';
import * as hz from 'horizon/core';
import { Logger } from 'Logger';
import { SlotData, UIView_Inventory } from 'UIView_Inventory';

const log = new Logger("BigBox_UI_Inventory_Manager");

//
// Controls the item inventory UI on the server for each player
//
export class BigBox_UI_Inventory_Manager extends hz.Component<typeof BigBox_UI_Inventory_Manager> {
  static propsDefinition = {
    uiAsset: { type: hz.PropTypes.Asset },
    playerInventory: { type: hz.PropTypes.Entity },
  };

  // Singleton
  private static _instance: BigBox_UI_Inventory_Manager | null;
  public static get instance(): BigBox_UI_Inventory_Manager { return this._instance!; }

  /**
   * Returns true if the player's UI inventory has been created & set
   */
  public isPlayerInventoryReady(player: hz.Player): boolean {
    return this.playerToUiEntity.get(player) != undefined;
  }

  private playerToUiEntity: Map<hz.Player, hz.Entity | undefined> = new Map<hz.Player, hz.Entity | undefined>()
  private subscriptions: Map<hz.Player, hz.EventSubscription> = new Map<hz.Player, hz.EventSubscription>()
  private playerInventory!: BigBox_Player_Inventory

  preStart() {
    BigBox_UI_Inventory_Manager._instance = this;
  }

  start() {
    this.connectNetworkBroadcastEvent(Events.poolObjectInitialized, (data) => {
      if (data.id !== "UIRoot_InteractionNonBlocking") {
        return;
      }
      if (this.playerToUiEntity.has(data.player)) {
        // Player already has a UI assigned
        return;
      }

      this.playerToUiEntity.set(data.player, data.entity);
      const sub = this.connectNetworkEvent(data.entity, UIView_Inventory.onSlotEquipSelected, (payload) => {
        this.onSlotSelected(payload.owner, payload.index, payload.selected)
      })
      this.subscriptions.set(data.player, sub)
    });

    this.playerInventory = this.props.playerInventory!.getComponents<BigBox_Player_Inventory>()[0]
  }

  public onSlotDataChanged(player: hz.Player, data: SlotData) {
    let ui = this.playerToUiEntity.get(player)
    if (ui) {
      this.sendNetworkEvent(ui, UIView_Inventory.changeSlot, data);
    }
    else {
      log.error("Need to wait for interactionnonblocking to be assigned")
    }
  }

  onSlotSelected(player: hz.Player, slotId: number, selected: boolean) {
    if (selected) {
      this.async.setTimeout(() => this.playerInventory.onSlotSelected(player, slotId, selected), 250) // HACK: must introduce small delay for item equip or else it can break ;(
    }
    else {
      this.playerInventory.onSlotSelected(player, slotId, selected)
    }
  }
}
hz.Component.register(BigBox_UI_Inventory_Manager);
