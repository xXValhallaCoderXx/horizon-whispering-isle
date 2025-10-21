/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { DigManager } from 'DigManager';
import * as hz from 'horizon/core';
import { ItemData } from 'ItemData';
import { ItemModifiers } from 'ItemUtils';
import { Logger } from 'Logger';
import { Analytics } from 'TurboAnalytics';

const log = new Logger("BigBox_ItemState");

/**
 * Stores the state of an instance of an item
 */
export class BigBox_ItemState {
  public info: ItemData;
  public player: hz.Player
  public equipped: boolean = false
  public isLocked: boolean = false;
  public modifiers: ItemModifiers;

  private grabbable: hz.GrabbableEntity | null = null

  constructor (info: ItemData, modifiers: ItemModifiers, player: hz.Player, grabbable: hz.GrabbableEntity | null, isLocked: boolean = false){
    this.info = info
    this.player = player
    this.modifiers = modifiers
    this.isLocked = isLocked

    if (grabbable){
      this.grabbable = grabbable
    }
  }

  public equip(){
    let g: hz.GrabbableEntity | undefined

    if (this.grabbable){
      this.grabbable.visible.set(true)
      g = this.grabbable

      g?.forceHold(this.player, hz.Handedness.Right, false) // currently does not support Horizon's build-in dropping
    }
    else {
      log.info("BigBox_ItemState: equipping item new " + this.info.id)
      Analytics()?.sendWeaponEquip({ player: this.player, weaponKey: `item,${this.info.id}` });
      DigManager.instance.setItemForEquip(this.player, this.info.id, this.modifiers.weight, this.modifiers.mutation);
    }

    this.equipped = true
  }

  public unequip(){
    if (this.grabbable){ // note: if we call this before item spawn, the item will be orphaned
      this.grabbable.forceRelease()
      this.grabbable.position.set(new hz.Vec3(0, -100, 0))
      this.grabbable.visible.set(false)
    }
    else {
      DigManager.instance.setItemForUnequip(this.player, this.info.id);
    }

    this.equipped = false
  }

  public dispose(){
    this.unequip()
    this.equipped = false
  }
}

/**
 * Componentize this script so it can be imported via an asset
 */
class ItemStateComponent extends hz.Component<typeof ItemStateComponent> {
  start(){
  }

}hz.Component.register(ItemStateComponent);
