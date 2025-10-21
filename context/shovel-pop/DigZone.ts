/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { DigZoneManager } from 'DigZoneManager';
import * as hz from 'horizon/core';
import { Asset, AssetContentData, Vec3 } from "horizon/core";
import { getIslandFromID } from 'Islands';
import { ItemContainer } from 'ItemContainer';
import { ItemData } from 'ItemData';
import { Logger } from 'Logger';
import { PlayerCatalogManager } from 'PlayerCatalogManager';
import { PlayerIslandData } from 'PlayerIslandData';
import { ShinySpotData } from 'ShinySpotData';

const log = new Logger("DigZone");

export class DigZone extends hz.Component<typeof DigZone> {
  static propsDefinition = {
    id: { type: hz.PropTypes.String, default: 'Object'},
    recommendedLevel: { type: hz.PropTypes.Number, default: 1 },
    displayName: { type: hz.PropTypes.String },
    items: {type: hz.PropTypes.String },
    hiddenItems: {type: hz.PropTypes.String },
    trigger: { type: hz.PropTypes.Entity },
    shinySpotsRoot: { type: hz.PropTypes.Entity },
    shinySpotsData: { type: hz.PropTypes.Asset, default: undefined },
    excludeBaseItems: { type: hz.PropTypes.Boolean, default: false },
    excludeLowerPriority: { type: hz.PropTypes.Boolean, default: false },
    priority: { type: hz.PropTypes.Number, default: 1 },
    experienceReward: { type: hz.PropTypes.Number, default: 100 },
    gemReward: { type: hz.PropTypes.Number, default: 0 },
    locatorLabel: { type: hz.PropTypes.Entity },
    island: { type: hz.PropTypes.String, default: "" },
    difficultyMultiplier: { type: hz.PropTypes.Number, default: 1 },
    renewPinned: { type: hz.PropTypes.String, default: "" },
    renewRarities: { type: hz.PropTypes.String, default: "" },
    renewPoolUncommon: { type: hz.PropTypes.String, default: "" },
    renewPoolRare: { type: hz.PropTypes.String, default: "" },
    renewPoolEpic: { type: hz.PropTypes.String, default: "" },
    renewPoolLegendary: { type: hz.PropTypes.String, default: "" },
    renewPoolMythical: { type: hz.PropTypes.String, default: "" },
    renewGemReward: { type: hz.PropTypes.Number, default: 0 },
    renewExpReward: { type: hz.PropTypes.Number, default: 0 },
    renewCooldown: { type: hz.PropTypes.Number, default: 0 },
  };

  public items: string[] = []
  public hiddenItems: string[] = []
  public renewRarities: number[] = []
  public renewItemsPinned: string[] = []
  public renewItemsUncommon: string[] = []
  public renewItemsRare: string[] = []
  public renewItemsEpic: string[] = []
  public renewItemsLegendary: string[] = []
  public renewItemsMythical: string[] = []
  public shinySpots: hz.Vec3[] = []

  public get isLTEZone(): boolean { return this.props.island === 'LTE' }

  async start() {
    this.connectCodeBlockEvent(this.props.trigger!, hz.CodeBlockEvents.OnPlayerEnterTrigger, (player) => {
      if (this.items.length === 0 && ItemContainer.localInstance !== undefined) {
        // this will happen for spawned loot zones, such as LTEs
        this.sortItems(ItemContainer.localInstance)
      }

      if (DigZoneManager.instance) {
        DigZoneManager.instance.setPlayerInZone(player, this)
      }
    })

    this.connectCodeBlockEvent(this.props.trigger!, hz.CodeBlockEvents.OnPlayerExitTrigger, (player) => {
      if (DigZoneManager.instance) {
        DigZoneManager.instance.removePlayerFromZone(player, this)
      }
    })

    this.props.locatorLabel?.as(hz.TextGizmo).text.set(this.props.displayName)

    if (this.props.shinySpotsData) {
      await this.initCatalogData();
    }
    else
    {
      this.shinySpots = this.props.shinySpotsRoot?.children.get().map(c => c.position.get()) ?? [];
    }

    if (this.isLTEZone) {
      if (DigZoneManager.instance) {
        DigZoneManager.instance.addLTEZone(this);
      } else {
        this.connectLocalBroadcastEvent(DigZoneManager.digZoneManagerReady, (data) => {
          DigZoneManager.instance.addLTEZone(this);
        })
      }
    }
  }

  private async initCatalogData() {
    //load json item data
    if (this.props.shinySpotsData) {
      let asset = new Asset(this.props.shinySpotsData.id, BigInt(0));
      try {
        await asset.fetchAsData().then(
          (output: AssetContentData) => {
            let jsonData: ShinySpotData[] = JSON.parse(output.asText()) as ShinySpotData[];
            jsonData.forEach((rawItem: any) => {
              this.shinySpots.push(new Vec3(rawItem.Position.x, rawItem.Position.y,rawItem.Position.z));
            });
          }
        )
      } catch (error) {
        console.error(`Error loading shiny spot data at locator ${this.entity.name.get()}: ${error}`);
      }
    }
  }

  dispose(): void {
    if (DigZoneManager.instance && this.isLTEZone) {
      DigZoneManager.instance.removeLTEZone(this);
    }
  }

  public maybeSetupItems() {
    if (this.items.length === 0 && ItemContainer.localInstance !== undefined) {
      // this will happen for spawned loot zones, such as LTEs
      this.sortItems(ItemContainer.localInstance)
    }
  }

  /**
   * Sorts the item IDs in the zone by their rarity.
   *
   * This method takes an ItemContainer as input, retrieves item data for each item ID
   * specified in the zone's properties, and sorts these items by their rarity in descending order.
   * The sorted item IDs are then stored back in the `items` property of the zone.
   *
   * @param container - The ItemContainer from which item data is retrieved.
   */
  public sortItems(container: ItemContainer) {
    if (this.props.items.length === 0){
      log.info(`No items in zone ${this.props.displayName}`)
      this.props.trigger?.as(hz.TriggerGizmo).enabled.set(false)
      return
    }

    this.items = this.split(this.props.items);
    this.renewRarities = this.split(this.props.renewRarities).map(rarity => parseInt(rarity));
    this.renewItemsPinned = this.split(this.props.renewPinned);
    this.renewItemsUncommon = this.split(this.props.renewPoolUncommon);
    this.renewItemsRare = this.split(this.props.renewPoolRare);
    this.renewItemsEpic = this.split(this.props.renewPoolEpic);
    this.renewItemsLegendary = this.split(this.props.renewPoolLegendary);
    this.renewItemsMythical = this.split(this.props.renewPoolMythical);

    const itemDatas: ItemData[] = []

    this.items.forEach(itemId => {
      let foundItem = container.getItemDataForId(itemId)
      if (foundItem) {
        itemDatas.push(foundItem)
      } else {
        log.error(`Item ${itemId} in zone ${this.props.displayName} not found in container`)
      }
    });

    itemDatas.sort((a, b) => a.rarity < b.rarity ? -1 : 1)
    this.items = itemDatas.map(i => i.id)

    // Hidden items don't need to be sorted for now since they aren't user facing
    this.hiddenItems = this.props.hiddenItems ? this.props.hiddenItems.split(',') : []
  }

  getCurrentZoneItems(player: hz.Player): { itemId: string, isFound: boolean }[] {
    let result: { itemId: string, isFound: boolean }[] = [];
    const island = getIslandFromID(this.props.island);
    if (!island) {
      return result;
    }
    const renewData = island ? PlayerIslandData.getZoneRenewData(player, island, this.props.id) : undefined;
    if (renewData && renewData.items.length > 0) {
      for (let i = 0; i < renewData.items.length; ++i) {
        result.push({ itemId: renewData.items[i], isFound: renewData.found[i] });
      }
    } else {
      this.items.forEach(itemId => {
        const isFound = PlayerCatalogManager.getItemDiscoverCount(player, itemId) !== 0;
        result.push({ itemId, isFound })
      });
    }
    // if (!PlayerIslandData.getDigZoneRewardAccepted(player, island, this.props.id)) {
    //   let allDiscovered = true;
    //   this.items.forEach(itemId => {
    //     const isFound = PlayerCatalogManager.getItemDiscoverCount(player, itemId) !== 0;
    //     allDiscovered &&= isFound
    //     result.push({ itemId, isFound })
    // });
    //   if (allDiscovered) {
    //     result = [];
    //   }
    // } else {
    //   const renewData = PlayerIslandData.getZoneRenewData(player, island, this.props.id);
    //   if (renewData && renewData.cooldownEndTime === 0) {
    //     for (let i = 0; i < renewData.items.length; ++i) {
    //       result.push({ itemId: renewData.items[i], isFound: renewData.found[i] });
    //     }
    //   }
    // }
    return result;
  }

  split(csv: string): string[] {
    if (csv === "") {
      return [];
    }
    return csv.split(',');
  }

  public getRenewRarityItemPool(rarity: number) {
    switch (rarity) {
      case 1:
        return this.renewItemsUncommon;
      case 2:
        return this.renewItemsRare;
      case 3:
        return this.renewItemsEpic;
      case 4:
        return this.renewItemsLegendary;
      case 5:
        return this.renewItemsMythical;
    }
    return undefined;
  }

  private wait(ms: number) {
    return new Promise(resolve => {
      this.async.setTimeout(() => resolve(true), ms);
    });
  }
}
hz.Component.register(DigZone);
