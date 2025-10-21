/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { ClientStartupReporter } from "ClientStartupReporter";
import { Events } from "Events";
import * as GameUtils from 'GameUtils';
import { AssetSpawnLog } from "GlobalLoggers";
import { Component, Entity, LocalEvent, MeshEntity, Player, PropTypes, SerializableState, Vec3 } from "horizon/core";
import { ItemData } from "ItemData";
import { ItemUtils } from "ItemUtils";
import { JSON_ItemData } from "JSON_ItemData";
import { JSON_MutationData } from "JSON_MutationData";
import { JSON_ShovelData } from "JSON_ShovelData";
import { JSON_ShovelLevelData } from "JSON_ShovelLevelData";
import { Logger } from "Logger";
import { MutationData } from "MutationData";
import { Shovel } from "Shovel";
import { ShovelAbility, ShovelAbilityType, ShovelData, ShovelLevelData } from "ShovelData";
import { ShovelProgressionManager } from "ShovelProgressionManager";

const log = new Logger("ItemContainer");
//const loadingService = new LoadingService('ItemContainer', Environment.Server | Environment.Client)

/**
 * Contains an assortment of items underneath this root
 */
export class ItemContainer extends Component<typeof ItemContainer> {
  static propsDefinition = {
    isServerOnly: { type: PropTypes.Boolean, default: false },
    // itemData: { type: PropTypes.Asset, default: undefined },
    // mutationData: { type: PropTypes.Asset, default: undefined },
    // shovelData: { type: PropTypes.Asset, default: undefined },
    // shovelLevelData: { type: PropTypes.Asset, default: undefined },
    itemLoader: { type: PropTypes.Asset, default: undefined }
  };

  // Singleton
  private static _localInstance: ItemContainer | null;
  /** Instance of the ItemContainer on this Client. */
  public static get localInstance(): ItemContainer { return this._localInstance!; }

  static itemDataLoadComplete = new LocalEvent('itemDataLoadComplete');

  static IsReady() {
    return ItemContainer._localInstance && ItemContainer._localInstance.isDataLoadComplete;
  }

  // Config
  private readonly itemStartOffsetY: number = -0.4; // How much it should be offset from the surface as a buffer
  private readonly defaultItemRaiseY: number = 0.5; // How many units this should raise from the ground

  private currentActiveIndex: number = ItemUtils.INVALID_INDEX;
  private riseStartPosition: Vec3 = Vec3.zero;
  private itemRaiseY: number = 0;
  private isDataLoadComplete: boolean = false;

  public allItems: ItemData[] = [];
  public allMutations: MutationData[] = [];
  private idToItemData = new Map<string, ItemData>();
  private idToMutationData = new Map<string, MutationData>();
  private rarityToDataArray = new Map<number, ItemData[]>();
  private categoryToDataArray = new Map<string, ItemData[]>()

  public getItemDataForId(id: string): ItemData | undefined {
    return this.idToItemData.get(id);
  }

  public getMutationDataForId(id: string): MutationData | undefined {
    return this.idToMutationData.get(id);
  }

  public getDataArrayForRarity(rarity: number): ItemData[] | undefined {
    return this.rarityToDataArray.get(rarity)!;
  }

  public isDataLoaded() {
    return this.isDataLoadComplete;
  }

  public getDataArrayForCategory(category: string): ItemData[] {
    const data = this.categoryToDataArray.get(category)
    if (data) {
      return data
    }

    return []
  }

  public randomMutation(): string {
    return GameUtils.getRandom(this.allMutations).id;
  }

  public setItemTextureOnEntity(itemId: string, entity: Entity): void {
    const itemData = this.getItemDataForId(itemId);
    if (!itemData) {
      return;
    }
    const icon = itemData.getIconAsset();
    if (!icon) {
      return;
    }
    entity.as(MeshEntity).setTexture(icon);
  }

  start() {
    const name = this.world.getLocalPlayer()?.name?.get() ?? "SERVER";

    if (!this.props.isServerOnly) {
      if (this.world.getLocalPlayer() === this.world.getServerPlayer()) {
        // Only continue initialization on clients
        return;
      }
    }

    if (!ItemContainer._localInstance) {
      ItemContainer._localInstance = this;
    }

    //loadingService.OnPlayerEnterWorld(this.world.getLocalPlayer());

    // Generate the list of all items
    this.initCatalogData();

    if (!this.props.isServerOnly) {
      ClientStartupReporter.addEntry("ItemContainer start()", this);
    }
  }

  receiveOwnership(_serializableState: SerializableState, _oldOwner: Player, _newOwner: Player): void {
    if (this.world.getLocalPlayer() !== this.world.getServerPlayer()) {
      ClientStartupReporter.addEntry("ItemContainer receiveOwnership()");
    }
  }

  private initCatalogData() {
    //load json item data
    this.allItems = [];

    let itemJsonData: ItemData[] = JSON.parse(JSON_ItemData.raw) as ItemData[];
    itemJsonData.forEach((rawItem: any) => {
      const newItem = new ItemData();
      newItem.id = rawItem.id;
      newItem.name = rawItem.name;
      newItem.description = rawItem.description;
      newItem.lootZone = rawItem.lootZone;
      newItem.location = rawItem.location;
      newItem.category = rawItem.category;
      newItem.grabbableAsset = rawItem.grabbableAsset;
      newItem.iconAsset = rawItem.iconAsset;
      newItem.requiredShovels = rawItem.requiredShovels;
      newItem.rarity = parseInt(rawItem.rarity);
      newItem.health = parseInt(rawItem.health);
      newItem.minValue = parseInt(rawItem.minValue);
      newItem.maxValue = parseInt(rawItem.maxValue);
      newItem.minWeight = parseInt(rawItem.minWeight);
      newItem.maxWeight = parseInt(rawItem.maxWeight);
      newItem.regionPityDigs = parseInt(rawItem.regionPityDigs);
      this.allItems.push(newItem);
    });

    this.allItems.forEach((itemData: ItemData, childIndex: number) => {
      if (itemData !== undefined) {
        const key: string = itemData.id;

        if (this.idToItemData.has(key)) {
          log.error(`ItemContainer: Duplicate Unique ID found for ${key} on ${itemData.name}.`);
        }
        else {
          this.idToItemData.set(key, itemData);
          log.debug(`Adding item (${itemData.name})`);

          const rarity = itemData.rarity;
          let rarityDataArray = this.rarityToDataArray.get(rarity);
          if (rarityDataArray) {
            rarityDataArray.push(itemData);
            this.rarityToDataArray.set(rarity, rarityDataArray); // Update the Map
          }
          else {
            // No data of this rarity exists yet, create a new array for it
            this.rarityToDataArray.set(rarity, [itemData]);
          }

          const category = itemData.category
          let categoryArray = this.categoryToDataArray.get(category)
          if (categoryArray) {
            categoryArray.push(itemData)
            this.categoryToDataArray.set(category, categoryArray)
          }
          else {
            this.categoryToDataArray.set(category, [itemData])
          }
        }
      }
    });

    this.allMutations = [];

    let mutationJsonData: MutationData[] = JSON.parse(JSON_MutationData.raw) as MutationData[];
    mutationJsonData.forEach((rawMutation: any) => {
      const newMutation = new MutationData();
      newMutation.id = rawMutation.id;
      newMutation.name = rawMutation.name;
      newMutation.description = rawMutation.description;
      newMutation.itemTint = rawMutation.itemTint;
      newMutation.itemTintStrength = parseFloat(rawMutation.itemTintStrength);
      newMutation.itemScaleMultiplier = parseFloat(rawMutation.itemScaleMultiplier);
      newMutation.itemBrightness = parseFloat(rawMutation.itemBrightness)
      newMutation.effectAsset = rawMutation.effectAsset;
      newMutation.uiBackgroundTexture = rawMutation.uiBackgroundTexture;
      newMutation.uiRevealTexture = rawMutation.uiRevealTexture;
      newMutation.uiRevealAnimationStyle = rawMutation.uiRevealAnimationStyle;
      newMutation.uiPrefixTexture = rawMutation.uiPrefixTexture;
      this.allMutations.push(newMutation);
    });

    this.allMutations.forEach((mutationData: MutationData) => {
      if (mutationData !== undefined) {
        const key: string = mutationData.id;
        if (this.idToMutationData.has(key)) {
          log.error(`ItemContainer: Duplicate Unique ID found for ${key} on ${mutationData.name}.`);
        }
        else {
          this.idToMutationData.set(key, mutationData);
          log.debug(`Adding mutation (${mutationData.name})`);
        }
      }
    });

    let shovelData: ShovelData[] = [];

    let shovelJsonData: ShovelData[] = JSON.parse(JSON_ShovelData.raw) as ShovelData[];
    shovelJsonData.forEach((rawItem: any) => {
      const newItem = new ShovelData();
      newItem.id = rawItem.id;
      newItem.name = rawItem.name;
      newItem.index = rawItem.index;
      newItem.description = rawItem.description;
      newItem.icon = rawItem.icon;
      newItem.price = rawItem.price;
      newItem.levelRequirement = rawItem.levelRequirement;
      newItem.strength = rawItem.strength;
      newItem.staminaLoss = rawItem.staminaLoss;
      newItem.rarity = parseInt(rawItem.rarity);
      newItem.defaultLevel = parseInt(rawItem.defaultLevel)
      if (isNaN(newItem.defaultLevel)) {
        newItem.defaultLevel = 1;
      }
      newItem.defaultLevel-- // Subtract 1 to account for the fact that the default level is 1-indexed
      newItem.luck = parseInt(rawItem.luck);
      newItem.precision = parseInt(rawItem.precision);
      newItem.control = parseInt(rawItem.control);
      newItem.stability = parseInt(rawItem.stability);
      newItem.maxKg = parseInt(rawItem.maxKg);
      newItem.categoryToBias = rawItem.categoryToBias;
      newItem.itemToBias = rawItem.itemToBias;
      newItem.biasWeight = parseInt(rawItem.biasWeight);
      newItem.description = rawItem.description;
      newItem.itemCost1ID = rawItem.itemCost1ID;
      newItem.itemCost1Amount = parseInt(rawItem.itemCost1Amount);
      newItem.itemCost2ID = rawItem.itemCost2ID;
      newItem.itemCost2Amount = parseInt(rawItem.itemCost2Amount);
      newItem.itemCost3ID = rawItem.itemCost3ID;
      newItem.itemCost3Amount = parseInt(rawItem.itemCost3Amount);
      newItem.abilityDetails = rawItem.ability1Description
      newItem.abilityIconAsset = rawItem.ability1AssetId
      newItem.evolution = rawItem.evolution
      newItem.evolutionLevel = parseInt(rawItem.evolutionLevel) || 0;
      newItem.baseShovel = rawItem.baseShovel
      newItem.shovelAsset = rawItem.shovelAsset
      let abilityType = rawItem.ability1Type as ShovelAbilityType
      if (abilityType !== undefined && abilityType !== ShovelAbilityType.None) {
        let ability = new ShovelAbility()
        Object.assign(ability, {
          type: rawItem.ability1Type,
          minValue: parseFloat(rawItem.ability1MinValue),
          maxValue: parseFloat(rawItem.ability1MaxValue),
          abilityChance: parseFloat(rawItem.ability1Chance),
          abilityKey: rawItem.ability1Key,
        })
        newItem.abilities.push(ability)
      }
      shovelData.push(newItem);
    });

    if (ShovelProgressionManager.instance) {
      ShovelProgressionManager.instance.catalogData(shovelData);
    }
    if (Shovel.localInstance) {
      log.info("itemcontainer initdata shovel")
      this.initShovelData(shovelData);
    }
    else {
      this.connectLocalBroadcastEvent(Events.shovelInitialized, (data) => {
        this.initShovelData(shovelData);
      })
      log.info("itemcontainer initdata shovel not ready")
    }

    if (this.props.isServerOnly && this.props.itemLoader) {
      AssetSpawnLog.info("Spawn Asset: ItemLoader");
      this.world.spawnAsset(this.props.itemLoader, new Vec3(0, -1000, 0)).then((entities) => {
        log.info("Item data catalog complete");
        this.isDataLoadComplete = true;
        this.sendLocalBroadcastEvent(ItemContainer.itemDataLoadComplete, {});
        //loadingService.CompleteServer(this)
      });
    }
    else {
      log.info("Item data catalog complete");
      this.isDataLoadComplete = true;
      this.sendLocalBroadcastEvent(ItemContainer.itemDataLoadComplete, {});
      //loadingService.CompleteClient(this, this.world.getLocalPlayer())
    }
  }

  private initShovelData(shovelData: ShovelData[]) {
    Shovel.initData(shovelData);

    let shovelLevelJsonData: any[] = JSON.parse(JSON_ShovelLevelData.raw) as any[];
    shovelLevelJsonData.forEach((rawItem: any) => {
      const levelData = new ShovelLevelData();
      Object.assign(levelData, rawItem as ShovelLevelData)
      const shovelId = rawItem.ShovelID
      const level: number = parseInt(rawItem.Level)
      let shovel = Shovel.getData(shovelId, 0)
      if (shovel) {
        shovel.setLevelData(level, levelData)
      }
      if (ShovelProgressionManager.instance) {
        shovel = ShovelProgressionManager.instance.getShovelDataForId(shovelId);
        if (shovel) {
          shovel.setLevelData(level, levelData)
        }
      }
    })
  }
}
Component.register(ItemContainer);
