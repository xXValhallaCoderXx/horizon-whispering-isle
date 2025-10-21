/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_ItemState } from "BigBox_ItemState";
import { ItemFlags } from "Enums";
import { Events } from "Events";
import { Component, Player, Vec3 } from "horizon/core";
import { Islands } from "Islands";
import { ItemData } from "ItemData";
import { ItemModifiers } from "ItemUtils";
import { PlayerCatalogManager } from "PlayerCatalogManager";

export namespace ShovelUpDebug {
  export function giveItem(component: Component, player: Player, itemId: string, mutation?: string, shovelId?: string, forceGem?: boolean) {
    mutation ??= "";
    component.sendNetworkBroadcastEvent(Events.itemSelected, {
      player: player,
      itemId,
      location: Vec3.zero,
      weight: 1,
      weightBonus: 1,
      gems: 1,
      gemBonus: 1,
      xp: 10,
      xpBonus: 10,
      itemFlags: ItemFlags.IsNew,
      discoverCount: forceGem ? 2 : PlayerCatalogManager.getItemDiscoverCount(player, itemId),
      island: Islands.BeachCamp,
      mutation: mutation ?? "",
      shovelId: shovelId ?? "",
    }, [player]);

    const modifiers = new ItemModifiers;
    modifiers.mutation = mutation;
    component.async.setTimeout(() => {
      component.sendNetworkBroadcastEvent(Events.playerDigComplete, { player, isSuccess: true, itemId }, [player, component.world.getServerPlayer()]);
      const itemState = new BigBox_ItemState(
        new ItemData({
          id: itemId,
        }),
        modifiers,
        player,
        null);
      //this.sendLocalBroadcastEvent(Events.localItemReceived, { itemState });
    }, 500);
    return true;
  }
}
