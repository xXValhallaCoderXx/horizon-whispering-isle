/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_ExpEvents } from 'BigBox_ExpEvents';
import { BigBox_Player_Inventory } from 'BigBox_Player_Inventory';
import { Debug } from 'Debug';
import { DialogManager } from 'DialogManager';
import { DigZone } from 'DigZone';
import { DigZone_UI } from 'DigZone_UI';
import { Events } from 'Events';
import { getRandom } from 'GameUtils';
import * as hz from 'horizon/core';
import { Player } from 'horizon/core';
import { getIslandDisplayName, getIslandFromID, Islands } from 'Islands';
import { ItemContainer } from 'ItemContainer';
import { ItemData } from 'ItemData';
import { ItemUtils } from 'ItemUtils';
import { Logger } from 'Logger';
import { PlayerCatalogManager } from 'PlayerCatalogManager';
import { PlayerData } from 'PlayerData';
import { PlayerIslandData, ZoneRenewData } from 'PlayerIslandData';
import { IPlayerEnterExitWorldListener, PlayerService } from 'PlayerService';
import { ITEM_AUDIT_LOG } from 'PVarConsts';
import { QuestEvents, QuestManager } from 'QuestManager';
import { ShovelUpDebug } from 'ShovelUpDebug';
import { Analytics } from 'TurboAnalytics';
import { PopupDialogParams } from 'UIView_PopupDialog';

const RENEW_COOLDOWN_CONVERSION = 1000 * 60; // minutes to ms

const log = new Logger("DigZoneManager");

export type ZoneData = {
  id: string,
  displayName: string,
  level: number,
  items: { itemId: string, isFound: boolean }[],
  expReward: number,
  gemReward: number,
  completed: boolean,
  difficultyMultiplier: number,
  renewCooldownTime: number,
}

type ZoneCooldown = {
  zoneId: string,
  cooldownEndTime: number
}

export type ZoneItemsData = {
  isLTE: boolean;
  zoneId: string;
  levelReq: number;
  zoneDisplayName: string,
  island: Islands,
  itemIds: string[],
  gemReward: number,
}

export class DigZoneManager extends hz.Component<typeof DigZoneManager> implements IPlayerEnterExitWorldListener {
  static propsDefinition = {
    beachcampZonesRoot: { type: hz.PropTypes.Entity },
    pirateCoveZonesRoot: { type: hz.PropTypes.Entity },
    iceTundraZonesRoot: { type: hz.PropTypes.Entity },
    fairyTaleZonesRoot: { type: hz.PropTypes.Entity },
    itemDataRoot: { type: hz.PropTypes.Entity }
  };

  public static sendZoneId = new hz.NetworkEvent<{ player: hz.Player, data: ZoneData }>('sendZoneId');
  public static digZoneManagerReady = new hz.LocalEvent('digZoneManagerReady');
  public static requestZoneComplete = new hz.NetworkEvent<{ player: hz.Player, id: string }>('requestZoneComplete')
  public static zoneComplete = new hz.NetworkEvent<{ player: hz.Player, id: string, isRenew: boolean }>('regionComplete')
  public static sendZoneItems = new hz.NetworkEvent<{ zoneItemsDatas: ZoneItemsData[] }>('sendZoneItems');
  public static requestZoneItems = new hz.NetworkEvent<{ player: hz.Player }>('requestZoneItems');

  private digZones: DigZone[] = []
  private lteZones: DigZone[] = []
  private playerToZone = new Map<hz.Player, DigZone[]>()
  private playerToZoneRenewTime = new Map<hz.Player, ZoneCooldown[]>();
  private playersShowingDialog: Player[] = [];

  private idToZone = new Map<string, DigZone>();

  private zoneItemsDatas: ZoneItemsData[] = [];

  // Singleton
  private static _instance: DigZoneManager | null;
  public static get instance(): DigZoneManager { return this._instance!; }

  public static IsReady(): boolean {
    return DigZoneManager.instance && DigZoneManager.instance.isReady;
  }

  private isReady = false;

  private mapIdToDefaultDropTable = new Map<Islands, ItemData[]>();
  private mapIdToZones = new Map<Islands, DigZone[]>();

  start() {
    DigZoneManager._instance = this;
    PlayerIslandData.init(this.world);
    this.loadZones(this.props.beachcampZonesRoot!);
    this.loadZones(this.props.pirateCoveZonesRoot!);
    //disabled to reduce world size
    //this.loadZones(this.props.iceTundraZonesRoot!);
    //this.loadZones(this.props.fairyTaleZonesRoot!);

    if (ItemContainer.localInstance && ItemContainer.localInstance.isDataLoaded()) {
      this.initData();
    }
    else {
      // Set up island drop tables
      this.connectLocalBroadcastEvent(ItemContainer.itemDataLoadComplete, () => {
        this.initData();
      })
    }

    PlayerService.connectPlayerEnterExitWorldListener(this);

    this.connectNetworkBroadcastEvent(DigZoneManager.requestZoneItems, (payload) => {
      this.sendNetworkBroadcastEvent(DigZoneManager.sendZoneItems, { zoneItemsDatas: this.zoneItemsDatas }, [payload.player]);
    });

    this.connectNetworkBroadcastEvent(DigZoneManager.requestZoneComplete, (payload) => this.onZoneRewardAccepted(payload.player, payload.id))
    this.connectNetworkBroadcastEvent(Events.playerDigComplete, (payload) => {
      if (payload.isSuccess) {
        this.onPlayerDigComplete(payload.player, payload.itemId);
      }
    });

    Debug.addCommand("DigZone/Give Next Current Zone Item", (player) => this.debug_giveNextCurrentZoneItem(player));
    Debug.addCommand("DigZone/Complete Current Zone(s)", (player) => this.debug_completeCurrentZones(player));
    Debug.addCommand("DigZone/Skip Potion Nudge Cooldown", (player) => this.debug_skipZonePotionNudge(player));
    this.digZones.forEach(zone => {
      Debug.addCommand(`DigZone/Zones/${getIslandDisplayName(zone.props.island)}/${zone.props.displayName}/Next Item`, (player) => this.debug_giveNextZoneItem(player, zone));
      Debug.addCommand(`DigZone/Zones/${getIslandDisplayName(zone.props.island)}/${zone.props.displayName}/Complete`, (player) => this.debug_completeZone(player, zone.props.id));
      Debug.addCommand(`DigZone/Zones/${getIslandDisplayName(zone.props.island)}/${zone.props.displayName}/Reset (TODO)`, (player) => {});
    });
  }

  private loadZones(parent: hz.Entity) {
    parent.children.get().forEach((entity) => {
      const zone = entity.getComponents<DigZone>()[0] // if this is undefined then someone added a bad object
      if (zone) {
        this.digZones.push(zone)
        this.idToZone.set(zone.props.id, zone)
      }
      else {
        log.error('Bad object in zones root ' + entity.id)
      }
    })
  }

  private onPlayerDigComplete(player: hz.Player, itemId: string) {
    const zones = this.playerToZone.get(player);
    //let isDirty = false;
    PlayerIslandData.forEachZoneData(player, (zoneData, island) => {
      if (!zones?.some(zone => zone.props.id === zoneData.id)) {
        return false;
      }
      const index = zoneData.renewItems.indexOf(itemId);
      if (index < 0) {
        return false;
      }
      zoneData.renewItemsFound[index] = true;
      //isDirty = true;
      return true;
    });
    // if (isDirty) {
    //   this.updatePlayerZone(player);
    // }
  }

  private onZoneRewardAccepted(player: hz.Player, id: string, updateHUD: boolean = false): void {
    const zone = this.idToZone.get(id)
    if (!zone) {
      log.error(`No zone found for id ${id}`);
      return;
    }
    const island = getIslandFromID(zone.props.island);
    if (!island) {
      log.error(`No island found for zone ${zone.props.displayName}`);
      return;
    }
    const isRenew = PlayerIslandData.getDigZoneRewardAccepted(player, island, id);
    const cooldown = zone.props.renewCooldown * RENEW_COOLDOWN_CONVERSION;
    if (isRenew) {
      PlayerData.addGems(player, zone.props.renewGemReward, true);
      PlayerIslandData.startZoneRenewCooldown(player, island, id, cooldown);
      this.sendLocalBroadcastEvent(BigBox_ExpEvents.addExpToPlayer, { player, exp: zone.props.renewExpReward, showToast: true });
    } else {
      PlayerIslandData.markDigZoneRewardAccepted(player, island, id);
      PlayerIslandData.renewZone(player, island, id, [...zone.items]);
      PlayerIslandData.startZoneRenewCooldown(player, island, id, cooldown);
      PlayerData.addGems(player, zone.props.gemReward, updateHUD);
      this.sendLocalBroadcastEvent(BigBox_ExpEvents.addExpToPlayer, { player, exp: zone.props.experienceReward, showToast: true });
    }

    this.sendNetworkBroadcastEvent(DigZoneManager.zoneComplete, { player, id, isRenew }, [this.world.getServerPlayer(), player]);
    this.playerToZoneRenewTime.get(player)?.push({ zoneId: id, cooldownEndTime: Date.now() + cooldown });
    this.updatePlayerZone(player);
  }

  private update(deltaTime: number) {
    const now = Date.now();
    this.playerToZoneRenewTime.forEach((cooldowns, player) => {
      for (let i = 0; i < cooldowns.length;) {
        const cooldown = cooldowns[i];
        if (cooldown.cooldownEndTime <= now && this.renewZoneById(player, cooldown.zoneId)) {
          cooldowns.splice(i, 1);
        } else {
          i++;
        }
      }
    })
  }

  public addLTEZone(zone: DigZone) {
    this.lteZones.push(zone);
    this.idToZone.set(zone.props.id, zone);
    this.world.getPlayers().forEach(player => {
      this.renewZone(player, zone)
    })
  }

  public removeLTEZone(zone: DigZone) {
    const index = this.lteZones.indexOf(zone);
    if (index < 0) {
      return;
    }
    this.lteZones.splice(index, 1);
    this.idToZone.delete(zone.props.id);
  }

  public areAllZoneItemsDiscovered(player: hz.Player, id: string) {
    const zone = this.getDigZoneFromZoneId(id);
    if (!zone) {
      return false;
    }
    const items = zone.items.length > 0 ? zone.items : zone.props.items.split(',') // unfortunately this data may not be set by the time this is called
    for (const item of items) {
      if (PlayerCatalogManager.getItemDiscoverCount(player, item) === 0) {
        return false;
      }
    }
    return true;
  }

  private renewZoneById(player: hz.Player, zoneId: string): boolean {
    const digZone = this.getDigZoneFromZoneId(zoneId);
    if (digZone === undefined) {
      return false;
    }
    return this.renewZone(player, digZone)
  }

  private renewZone(player: hz.Player, digZone: DigZone): boolean {
    const island = getIslandFromID(digZone.props.island);
    if (island === undefined) {
      return false;
    }
    digZone.maybeSetupItems()
    const items: string[] = [];
    digZone.renewItemsPinned.forEach(item => items.push(item));
    const zoneRenewData = PlayerIslandData.getZoneRenewData(player, island, digZone.props.id);
    this.addDigZoneRandomItems(player, items, digZone, island, zoneRenewData);
    PlayerIslandData.renewZone(player, island, digZone.props.id, items);
    if (this.playerToZone.get(player)?.some(zone => zone === digZone)) {
      this.updatePlayerZone(player);
    }
    return true;
  }

  private addDigZoneRandomItems(
    player: hz.Player,
    items: string[],
    digZone: DigZone,
    island: Islands,
    zoneRenewData?: ZoneRenewData) {

    const pools: (string)[][] = new Array(6).fill(undefined);

    for (const rarity of digZone.renewRarities) {
      const pool = this.getRenewPool(player, rarity, digZone, zoneRenewData, pools);
      if (pool.length === 0) {
        log.error(`No items in pool to pick from in zone ${digZone.props.displayName}`);
        continue;
      }
      const excludeDupes = pool.filter((pooledItem) => !items.some(item => item === pooledItem)) // Don't pick items that have already been selected
      const excludeDupesAndLastPicks = excludeDupes.filter((pooledItem) => zoneRenewData === undefined || !zoneRenewData.items.some(item => item === pooledItem));
      const filteredPool = excludeDupesAndLastPicks.length > 0 ? excludeDupesAndLastPicks : excludeDupes;
      const item = getRandom(filteredPool);
      const itemIndex = pool.indexOf(item);
      log.info(`addDigZoneRandomItems: adding item of rarity ${ItemUtils.RARITY_TEXT[rarity]}  pick: ${item}  itemIndex: ${itemIndex}  pool: ${pool.join(',')}  excludeDupes: ${excludeDupes.join(',')} excludeDupesAndLastPicks: ${excludeDupesAndLastPicks.join(',')}`);
      items.push(pool.splice(itemIndex, 1)[0]);
    }
    PlayerIslandData.saveZoneRenewPools(player, island, digZone.props.id, pools);
  }

  private getRenewPool(player: hz.Player, rarity: number, digZone: DigZone, zoneRenewData: ZoneRenewData | undefined, pools: string[][]): string[] {
    let pool = pools[rarity];

    if (pool === undefined) {
      const island = getIslandFromID(digZone.props.island);
      if (island) {
        const zoneRenewPool = PlayerIslandData.getZoneRenewPool(player, island, digZone.props.id, rarity);
        if (zoneRenewPool) {
          pool = [...zoneRenewPool];
        }
      }
      if (pool === undefined) {
        pool = [];
      }
      pools[rarity] = pool;
    }

    if (pool.length === 0) {
      const rarityPool = digZone.getRenewRarityItemPool(rarity);
      if (rarityPool === undefined) {
        console.error(`Error parsing rarity ${rarity} in zone ${digZone.props.displayName}`);
        return [];
      }
      pool = [...rarityPool];
      pools[rarity] = pool;
    }
    return pool;
  }

  onPlayerEnterWorld(player: hz.Player): void {
    const cooldowns = new Array<ZoneCooldown>();
    PlayerIslandData.forEachZoneData(player, (zoneData, island) => {
      if (zoneData.renewTime !== 0) {
        cooldowns.push({ zoneId: zoneData.id, cooldownEndTime: zoneData.renewTime });
      }
      return false;
    })
    this.playerToZoneRenewTime.set(player, cooldowns);

    this.lteZones.forEach(zone => {
      this.renewZone(player, zone)
    })

    this.sendNetworkBroadcastEvent(DigZoneManager.sendZoneItems, { zoneItemsDatas: this.zoneItemsDatas }, [player]);
  }

  onPlayerExitWorld(player: hz.Player): void {
    this.playerToZone.delete(player);
    this.playerToZoneRenewTime.delete(player);
  }

  public setPlayerInZone(player: hz.Player, zone: DigZone) {
    if (zone) {
      let zones = this.playerToZone.get(player)
      if (!zones) {
        zones = []
      }
      if (!zones.find(x => x == zone)) {
        zones.push(zone)
        this.playerToZone.set(player, zones)
        this.sendLocalBroadcastEvent(Events.digZoneEnter, { player, zoneId: zone.props.id });
      }
      this.updatePlayerZone(player)
    }
  }

  public removePlayerFromZone(player: hz.Player, zone: DigZone) {
    let zones = this.playerToZone.get(player)
    if (zones && zones.find(x => x == zone)) {
      zones = zones.filter(x => x != zone)
      this.playerToZone.set(player, zones)
      this.updatePlayerZone(player)
      this.sendLocalBroadcastEvent(Events.digZoneExit, { player, zoneId: zone.props.id });
    }
    Analytics()?.sendAreaExit({ player, actionArea: zone.props.displayName, actionAreaIsLobbySection: false, actionAreaIsPlayerReadyZone: false })
  }

  private updatePlayerZone(player: hz.Player) {
    let zones = this.playerToZone.get(player);
    let id = DigZone_UI.DefaultZoneName
    let displayName = ''
    let items: { itemId: string, isFound: boolean }[] = [];
    let level = 1
    let expReward = 100
    let gemReward = 0
    let completed = false
    let difficultyMultiplier = 1;
    let renewCooldownTime = 0;
    if (zones && zones.length > 0) {
      let pri = -1;
      let highestPriorityZone = zones[0];
      zones.forEach((zone: DigZone) => {
        if (zone.props.priority >= pri) {
          pri = zone.props.priority;
          highestPriorityZone = zone;
        }
      });
      id = highestPriorityZone.props.id
      displayName = highestPriorityZone.props.displayName
      const island = getIslandFromID(highestPriorityZone.props.island);
      completed = island ? PlayerIslandData.getDigZoneRewardAccepted(player, island, highestPriorityZone.props.id) : false;
      items = highestPriorityZone.getCurrentZoneItems(player)
      if (completed) {
        const zoneRenewData = PlayerIslandData.getZoneRenewData(player, island!, id);
        if (zoneRenewData) {
          renewCooldownTime = zoneRenewData.cooldownEndTime;
        }
      }

      level = highestPriorityZone.props.recommendedLevel
      expReward = completed ? highestPriorityZone.props.renewExpReward : highestPriorityZone.props.experienceReward
      gemReward = completed ? highestPriorityZone.props.renewGemReward : highestPriorityZone.props.gemReward
      difficultyMultiplier = highestPriorityZone.props.difficultyMultiplier;
    }
    log.info(`updatePlayerZone: ${displayName} id: ${id} level: ${level} length: ${items.length}`);

    this.sendNetworkBroadcastEvent(
      DigZoneManager.sendZoneId, {
      player: player,
      data: {
        id,
        displayName,
        level,
        items,
        expReward,
        gemReward,
        difficultyMultiplier,
        completed,
        renewCooldownTime,
      }
    },
      [player, this.world.getServerPlayer()]
    )

    const hasDialog = this.playersShowingDialog.indexOf(player) >= 0;
    const hasPotions = BigBox_Player_Inventory.instance?.hasPotions(player) ?? false;
    const isEnteringZone = id !== '';
    const canSuggestPotion = PlayerData.canSuggestionPotion(player);
    const VISIT_POTION_SELLER_QUEST_ID = "visit_potion_seller";

    if (!hasDialog && !hasPotions && isEnteringZone && canSuggestPotion) {
      if (!QuestManager.instance?.hasActiveQuest(player, VISIT_POTION_SELLER_QUEST_ID)) {
        const DELAY_BEFORE_SHOWING_DIALOG = 1000;
        this.async.setTimeout(() => {
          if (this.playerToZone.get(player)?.length === 0) {
            const index = this.playersShowingDialog.indexOf(player);
            this.playersShowingDialog.splice(index, 1);
            return;
          }
          const params: PopupDialogParams = {
            title: "Lucky",
            text: "Need a little extra luck finding rare items? That's where my potions come in!",
            option1: "Dismiss",
            option2: "Navigate",
            option2TextColor: "#FFF",
            option2BGColor: "#70C04E",
            option2BorderColor: "#49A24C",
            blockPlayerMovement: false,
          };
          DialogManager.showPopup(this, player, params, (player, selection) => {
            const index = this.playersShowingDialog.indexOf(player);
            this.playersShowingDialog.splice(index, 1);
            if (selection === 1) {
              log.info(`Navigating to potion vendor for player ${PlayerService.getPlayerName(player)}`);
              this.sendNetworkBroadcastEvent(QuestEvents.requestStartQuestForPlayer, {
                player,
                questId: VISIT_POTION_SELLER_QUEST_ID,
                overwriteExisting: true, })
            }
            PlayerData.resetPotionSuggestionCooldown(player);
          });
        }, DELAY_BEFORE_SHOWING_DIALOG);
        this.playersShowingDialog.push(player);
      }
    }

    if (displayName != '') {
      Analytics()?.sendAreaEnter({ player, actionArea: displayName, actionAreaIsLobbySection: false, actionAreaIsPlayerReadyZone: false })
    }
  }

  private addZoneRenewItems(
    player: hz.Player,
    zoneRenewData: ZoneRenewData,
    items: { id: string; discovered: boolean; }[]) {
    for (let i = 0; i < zoneRenewData.items.length; ++i) {
      items.push({ id: zoneRenewData.items[i], discovered: zoneRenewData.found[i] });
    }
  }

  private addZoneItems(player: hz.Player, zone: DigZone, items: { id: string; discovered: boolean; }[]) {
    zone.items.forEach((item) => {
      items.push({ id: item, discovered: PlayerCatalogManager.getItemDiscoverCount(player, item) > 0 })
    })
  }

  public clearPlayers(zone: DigZone) {
    this.world.getPlayers().forEach((player) => {
      this.removePlayerFromZone(player, zone);
    })
  }

  public getIslandDropTable(island: Islands): ItemData[] {
    if (!this.mapIdToDefaultDropTable.get(island)) {
      log.error('No drop table found for island ' + island.toString());
      return [];
    }
    return Array.from(this.mapIdToDefaultDropTable.get(island)!)
  }

  public getIslandRegions(island: Islands): DigZone[] {
    return Array.from(this.mapIdToZones.get(island)!)
  }

  public getDigZoneFromZoneId(zoneId: string): DigZone | undefined {
    return this.idToZone.get(zoneId);
  }

  public excludeBaseItems(player: hz.Player): boolean {
    const zones = this.playerToZone.get(player)
    let exclude = false
    if (zones) {
      zones.forEach((zone) => {
        if (zone.props.excludeBaseItems) {
          exclude = true
          return
        }
      })
    }
    return exclude
  }

  public getHighestPriorityZone(player: hz.Player): DigZone | null {
    const zones = this.playerToZone.get(player);
    if (zones) {
      let highestPriorityZone: DigZone | null = null;
      let highestPriority = -1;
      zones.forEach((zone) => {
        if (zone.props.priority > highestPriority) {
          highestPriority = zone.props.priority;
          highestPriorityZone = zone;
        }
      });
      return highestPriorityZone;
    }
    return null;
  }

  public getZoneCategoriesAndItemsForZone(player: Player, zone: DigZone): string[] {
    let items: string[] = [];
    log.info(`Adding items for zone ${zone.props.displayName} with priority ${zone.props.priority} - zone item: ${zone.items} - hidden items: ${zone.hiddenItems}`)
    const island = getIslandFromID(zone.props.island);
    const renewData = island ? PlayerIslandData.getZoneRenewData(player, island, zone.props.id) : undefined;
    if (renewData && renewData.items.length > 0) {
      if (renewData.found.some(x => !x)) {
        items = items.concat(renewData.items);
      }
    } else {
      if (zone.items.some(item => PlayerCatalogManager.getItemDiscoverCount(player, item) === 0)) {
        items = items.concat(zone.items);
      }
    }
    items = items.concat(zone.hiddenItems);

    return items;
  }

  public getZoneCategoriesAndItemsForPlayer(player: hz.Player): string[] {
    const zones = this.playerToZone.get(player);
    if (zones) {
      let items: string[] = [];
      let highestPriorityZone = this.getHighestPriorityZone(player);
      if (highestPriorityZone) {
        let priority = highestPriorityZone.props.priority;
        let cont: boolean = true;
        while (priority >= 0 && cont) {
          zones.forEach((zone) => {
            if (zone.props.priority == priority) {
              log.info(`Adding items for zone ${zone.props.displayName} with priority ${zone.props.priority} - zone item: ${zone.items} - hidden items: ${zone.hiddenItems}`)
              // DISABLED to prevent shiny spot items from being in standard loot tables.
              // const island = getIslandFromID(zone.props.island);
              // const renewData = island ? PlayerIslandData.getZoneRenewData(player, island, zone.props.id) : undefined;
              // if (renewData && renewData.items.length > 0) {
              //   items = items.concat(renewData.items);
              // } else {
              //   items = items.concat(zone.items);
              // }
              items = items.concat(zone.hiddenItems);
              if (zone.props.excludeLowerPriority) {
                cont = false;
              }
            }
          });
          priority--;
        }

      }
      return items;
    }
    return [];
  }

  public getHiddenItemsInZoneForPlayer(player: hz.Player): string[] {
    const zones = this.playerToZone.get(player);
    if (zones) {
      let items: string[] = [];
      let highestPriorityZone = this.getHighestPriorityZone(player);
      if (highestPriorityZone) {
        let priority = highestPriorityZone.props.priority;
        let cont: boolean = true;
        while (priority >= 0 && cont) {
          zones.forEach((zone) => {
            if (zone.props.priority == priority) {
              items = items.concat(zone.hiddenItems);
              if (zone.props.excludeLowerPriority) {
                cont = false;
              }
            }
          });
          priority--;
        }

      }
      return items;
    }
    return [];
  }

  private initData() {
    let auditLog = '';

    // Do dig zones first so it is initialized first
    this.digZones.forEach((zone) => {
      zone.sortItems(ItemContainer.localInstance)

      let itemIds: string[] = [];
      itemIds = itemIds.concat(
        zone.items,
        zone.hiddenItems,
        // zone.renewItemsUncommon,
        // zone.renewItemsRare,
        // zone.renewItemsEpic,
        // zone.renewItemsLegendary,
        // zone.renewItemsMythical,
        // zone.renewItemsPinned,
      );

      itemIds = Array.from(new Set(itemIds));

      this.zoneItemsDatas.push({
        zoneDisplayName: zone.props.displayName,
        island: getIslandFromID(zone.props.island) ?? Islands.None,
        itemIds: itemIds,
        zoneId: zone.props.id,
        levelReq: zone.props.recommendedLevel,
        isLTE: zone.isLTEZone,
        gemReward: zone.props.gemReward,
      });
    })

    // Set up island drop tables
    ItemContainer.localInstance.allItems.forEach((itemData) => {
      const itemMapId = itemData.location;
      const island = getIslandFromID(itemMapId);

      if (island == undefined) {
        log.error(`No island found for item ${itemData.id} with map id ${itemMapId}`);
        return;
      }

      if (!this.mapIdToDefaultDropTable.has(island)) {
        this.mapIdToDefaultDropTable.set(island, [])
      }

      // Do not include zone specific items in default table
      if (!this.digZones.some(zone =>
        zone.items.includes(itemData.id) ||
        zone.hiddenItems.includes(itemData.id) ||
        zone.renewItemsUncommon.includes(itemData.id) ||
        zone.renewItemsRare.includes(itemData.id) ||
        zone.renewItemsEpic.includes(itemData.id) ||
        zone.renewItemsLegendary.includes(itemData.id) ||
        zone.renewItemsMythical.includes(itemData.id) ||
        zone.renewItemsPinned.includes(itemData.id)
      )) {
        this.mapIdToDefaultDropTable.get(island)!.push(itemData);
      }

      if (ITEM_AUDIT_LOG) {
        const digZoneWithItem = this.digZones.find(zone =>
          zone.items.includes(itemData.id) ||
          zone.hiddenItems.includes(itemData.id) ||
          zone.renewItemsUncommon.includes(itemData.id) ||
          zone.renewItemsRare.includes(itemData.id) ||
          zone.renewItemsEpic.includes(itemData.id) ||
          zone.renewItemsLegendary.includes(itemData.id) ||
          zone.renewItemsMythical.includes(itemData.id) ||
          zone.renewItemsPinned.includes(itemData.id)
        );

        let digZoneText = digZoneWithItem ? digZoneWithItem.props.id : 'No Zone';


        let category = "N/A";
        if (digZoneWithItem) {
          if (digZoneWithItem.items.includes(itemData.id)) {
            category = "Punchcard";
          } else if (digZoneWithItem.hiddenItems.includes(itemData.id)) {
            category = "Hidden";
          } else {
            category = "Renew";
          }
        }

        let shovelRequiredText = itemData.requiredShovels !== "" ? itemData.requiredShovels : "N/A";

        auditLog += `${itemData.id}, ${itemData.location}, ${digZoneText}, ${category}, ${itemData.rarity}, ${shovelRequiredText}\n`;
      }
    })

    if (ITEM_AUDIT_LOG) {
      // !! Leave as console.log so that we only need to change ITEM_AUDIT_LOG variable to see results !!
      console.log(auditLog);
    }

    this.digZones.forEach((zone) => {
      const island = getIslandFromID(zone.props.island)!

      if (!this.mapIdToZones.has(island)) {
        this.mapIdToZones.set(island, []);
      }

      this.mapIdToZones.get(island)!.push(zone);
    })

    // The moon is a special case, it has no DigZones but does have common spots.
    this.mapIdToZones.set(Islands.Moon, []);

    this.isReady = true;
    this.sendLocalBroadcastEvent(DigZoneManager.digZoneManagerReady, {});

    // Send to all players
    this.sendNetworkBroadcastEvent(DigZoneManager.sendZoneItems, { zoneItemsDatas: this.zoneItemsDatas });

    this.connectLocalBroadcastEvent(hz.World.onUpdate, payload => this.update(payload.deltaTime));
  }

  private debug_completeCurrentZones(player: hz.Player) {
    const zones = this.playerToZone.get(player);
    if (zones) {
      for (const zone of zones) {
        this.debug_completeZone(player, zone.props.id);
      }
    }
  }

  private debug_completeZone(player: hz.Player, zoneId: string) {
    this.onZoneRewardAccepted(player, zoneId);
  }

  private debug_giveNextCurrentZoneItem(player: hz.Player) {
    const zones = this.playerToZone.get(player);
    if (zones) {
      for (const zone of zones) {
        if (this.debug_giveNextZoneItem(player, zone)) {
          break;
        }
      }
    }
  }

  private debug_skipZonePotionNudge(player: hz.Player) {
    PlayerData.skipPotionSuggestionCooldown(player);
  }

  private debug_giveNextZoneItem(player: hz.Player, zone: DigZone): boolean {
    let itemId = "";
    for (const item of zone.getCurrentZoneItems(player)) {
      if (!item.isFound) {
        itemId = item.itemId;
        break;
      }
    }
    if (itemId === "") {
      return false;
    }
    ShovelUpDebug.giveItem(this, player, itemId);
    return true;
  }
}
hz.Component.register(DigZoneManager);
