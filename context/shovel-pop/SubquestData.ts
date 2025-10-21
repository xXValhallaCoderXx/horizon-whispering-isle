/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { DigZone } from "DigZone";
import { DigZoneManager } from "DigZoneManager";
import { Component, EventSubscription, Player, PropTypes, Vec3 } from "horizon/core";
import { getIslandDisplayName } from "Islands";
import { IslandEvents, IslandTeleportManager } from "IslandTeleportManager";
import { ItemContainer } from "ItemContainer";
import { ItemUtils } from "ItemUtils";
import { Logger } from "Logger";
import { NavigationTarget } from "NavigationArrow";
import { NPC } from "NPC";
import { PotionData } from "PotionData";
import { QuestData } from "QuestData";
import { QuestEvents } from "QuestManager";
import { ShovelProgressionEvents } from "ShovelProgressionEvents";
import { ShovelProgressionManager } from "ShovelProgressionManager";

const log = new Logger("SubquestData");

export class SubquestData<T> extends Component<typeof SubquestData & T> {
  static propsDefinition = {
    id: { type: PropTypes.String, default: "UniqueID" }, // Unique ID - MUST BE UNIQUE - this part is not a meme
    overrideText: { type: PropTypes.String, default: "" },
  };

  public navigationTarget: Vec3 | undefined = undefined;
  public navigationTargets: NavigationTarget[] = [];
  protected displayText!: string;
  protected usingOverrideText: boolean = false;
  public getDisplayText() { return this.displayText; }
  public getDisplayTextWithCount(count: number) { return `${this.getDisplayText()} (${count}/1)`; }

  start() {
    this.displayText = this.props.overrideText;

    if (this.props.overrideText.length > 0) {
      this.usingOverrideText = true;
    }
  }

  // can this quest be assigned to this player
  isValid(player: Player) {
    return true
  }

  setParameters(parameters?: any) {}
}
Component.register(SubquestData);

export class InventorySubquestData extends SubquestData<typeof InventorySubquestData> {
  static propsDefinition = {
    ...SubquestData.propsDefinition,
    itemCategory: { type: PropTypes.String, default: "" },
    itemId: { type: PropTypes.String, default: "" },
    itemAmount: { type: PropTypes.Number, default: 1 },
    pityDigs: { type: PropTypes.Number, default: 10 },
    rarity: { type: PropTypes.Number, default: -1 },
    allowRegression: { type: PropTypes.Boolean, default: true }, // if true, the subquest will lose progress if the player loses any items in their inventory
    location: { type: PropTypes.String, default: "" }, // if set, the subquest will only be completed if the item is in the specified location
  };

  objectiveDisplayText: string = "";
  subscription: EventSubscription | undefined = undefined;

  start() {
    super.start();
    if (this.props.itemCategory.length > 0) {
      this.objectiveDisplayText = `Something ${this.props.itemCategory}`;
    }
    else if (this.props.itemId.length > 0) {
      if (ItemContainer.localInstance && ItemContainer.localInstance.isDataLoaded()) {
        this.setDisplayTextForItemId(ItemContainer.localInstance);
      }
      else {
        this.subscription = this.connectLocalBroadcastEvent(ItemContainer.itemDataLoadComplete, () => {
          this.setDisplayTextForItemId(ItemContainer.localInstance);
          this.subscription?.disconnect();
        });
      }
    }
    else if (this.props.rarity >= 0) {
      this.objectiveDisplayText = `${ItemUtils.RARITY_TEXT[this.props.rarity]}`;
    }
    else {
      this.objectiveDisplayText = `an Item`;
    }
    if (this.props.location.length > 0) {
      if (this.props.location.toLowerCase() === "lte") {
        this.objectiveDisplayText += " from an event"
      }
      else {
        this.objectiveDisplayText += ` from ${getIslandDisplayName(this.props.location)}`
      }
    }

    if (this.displayText === "") {
      this.setDisplayText();
    }
  }

  setDisplayText() {
    if (this.usingOverrideText) {
      return;
    }

    if (this.objectiveDisplayText.length === 0) {
      return;
    }

    this.displayText = `Dig up ${this.objectiveDisplayText}`;
    log.info(`InventorySubquestData: ${this.displayText}`);
  }

  setDisplayTextForItemId(container: ItemContainer) {
    if (this.usingOverrideText) {
      return;
    }

    let itemData = container.getItemDataForId(this.props.itemId);
    if (!itemData) {
      log.error(`InventorySubquestData: ItemData not found for id ${this.props.itemId}`);
      return;
    }
    this.objectiveDisplayText = `${itemData.name}`;
    this.setDisplayText();
  }

  getDisplayText() {
    log.error("InventorySubquestData: Use getDisplayText() is not supported, use GetDisplayTextWithCount() instead")
    return this.displayText;
  }

  getDisplayTextWithCount(count: number) {
    return `${this.displayText} (${count}/${this.props.itemAmount})`;
  }
}
Component.register(InventorySubquestData);

export class LocationSubquestData extends SubquestData<typeof LocationSubquestData> {
  static propsDefinition = {
    ...SubquestData.propsDefinition,
    zoneId: { type: PropTypes.String, default: "" },
    islandId: { type: PropTypes.String, default: "" },
  };

  start() {
    super.start();

    if (this.usingOverrideText) {
      return;
    }

    if (this.props.zoneId !== "") {
      if (DigZoneManager.instance) {
        this.setDisplayTextForZone();
      }
      else {
        this.connectLocalBroadcastEvent(DigZoneManager.digZoneManagerReady, () => {
          this.setDisplayTextForZone();
        });
      }
    }
    else if (this.props.islandId !== "") {
      if (IslandTeleportManager.instance) {
        this.setDisplayTextForIsland();
      }
      else {
        this.connectLocalBroadcastEvent(IslandEvents.islandTeleportManagerReady, () => {
          this.setDisplayTextForIsland();
        });
      }
    }
  }

  setDisplayTextForZone() {
    if (this.usingOverrideText) {
      return;
    }

    let zoneName = DigZoneManager.instance.getDigZoneFromZoneId(this.props.zoneId)?.props.displayName ?? "Unknown";
    this.displayText = `Go to ${zoneName}`;
  }

  setDisplayTextForIsland() {
    if (this.usingOverrideText) {
      return;
    }

    let islandName = IslandTeleportManager.instance.getIslandDisplayNameFromIslandId(this.props.islandId);
    this.displayText = `Travel to ${islandName}`;
  }
}
Component.register(LocationSubquestData);

export class RegionCompletionSubquestData extends SubquestData<typeof RegionCompletionSubquestData> {
  static propsDefinition = {
    ...SubquestData.propsDefinition,
    zoneId: { type: PropTypes.String, default: "" },
    firstTimeOnly: { type: PropTypes.Boolean, default: true }, // if true, the subquest will only be completed once per region
  };

  start() {
    super.start();

    if (this.usingOverrideText) {
      return;
    }

    if (this.props.zoneId !== "") {
      if (DigZoneManager.instance) {
        this.setDisplayTextForZone();
      }
      else {
        this.connectLocalBroadcastEvent(DigZoneManager.digZoneManagerReady, () => {
          this.setDisplayTextForZone();
        });
      }
    }
  }

  setDisplayTextForZone() {
    let zoneName = DigZoneManager.instance.getDigZoneFromZoneId(this.props.zoneId)?.props.displayName ?? "Unknown";
    this.displayText = `Collect all items in ${zoneName}`;
  }
}
Component.register(RegionCompletionSubquestData);

export type NPCTalkSubquestParameters = {
  npcId: string,
}

export class NPCTalkSubquestData extends SubquestData<typeof NPCTalkSubquestData> {
  static propsDefinition = {
    ...SubquestData.propsDefinition,
    pleaseIgnore: {type: PropTypes.String }
  };

  setNpcName(name: string) {
    if (this.usingOverrideText) {
      return;
    }

    this.displayText = `Talk to ${name}`;
  }

  setParameters(parameters?: any) {
    if (!parameters) {
      return;
    }
    const subquestParameters = parameters as NPCTalkSubquestParameters;
    const npcId = subquestParameters.npcId;
    if (npcId) {
      const npc = NPC.get(npcId);
      if (npc) {
        this.setNpcName(npc.props.name);
        this.navigationTarget = npc.entity.position.get();
      }
    }
  }
}
Component.register(NPCTalkSubquestData);

export class RetrievalSubquestData extends SubquestData<typeof RetrievalSubquestData> {
  static propsDefinition = {
    ...SubquestData.propsDefinition,
    requirementQuest: { type: PropTypes.Entity }, // Put the quest that has the InventorySubquestDatas
  };

  private inventorySubquestItemDatas: InventorySubquestData[] = [];
  private requirementQuestData!: QuestData;

  // NPC name should be set by NPC_CollectionQuest
  private npcName!: string;

  start() {
    super.start();

    // Used for single line quests
    if (this.props.requirementQuest) {
      this.requirementQuestData = this.props.requirementQuest.getComponents(QuestData)[0];
      if (this.requirementQuestData.IsReady()) {
        this.setupInventorySubquestItemDatas();
      }
      else {
        this.connectLocalBroadcastEvent(QuestEvents.questInitialized, (data) => {
          if (data.questData === this.requirementQuestData) {
            this.setupInventorySubquestItemDatas();
          }
        });
      }
    }
  }

  setupInventorySubquestItemDatas() {
    for (let i = 0; i < this.requirementQuestData.subquestDatas.length; i++) {
      let subquestData = this.requirementQuestData.subquestDatas[i];
      if (subquestData instanceof InventorySubquestData) {
        this.inventorySubquestItemDatas.push(subquestData);
      }
    }
  }

  setNpcName(name: string) {
    this.npcName = name;
  }

  // Used for multiple subquests
  setInventorySubquestDatas(inventorySubquestDatas: InventorySubquestData[]) {
    this.inventorySubquestItemDatas = inventorySubquestDatas;
  }

  getDisplayText() {
    if (this.usingOverrideText) {
      return this.displayText;
    }

    let allItemsDisplayText = "";
    if (this.inventorySubquestItemDatas.length > 1) {
      allItemsDisplayText = "items"
    } else if (this.inventorySubquestItemDatas.length === 1){
      allItemsDisplayText = `${this.inventorySubquestItemDatas[0].objectiveDisplayText}`;
    }

    this.displayText = `Return ${allItemsDisplayText} to ${this.npcName}`;

    return this.displayText;
  }

  getAllItemsDisplayText() {
    let allItemsDisplayText = "";
    for (let i = 0; i < this.inventorySubquestItemDatas.length; i++) {
      allItemsDisplayText += `${this.inventorySubquestItemDatas[i].objectiveDisplayText}`;
      if (i < this.inventorySubquestItemDatas.length - 1) {
        allItemsDisplayText += " and ";
      }
    }

    return allItemsDisplayText;
  }

  getAllRequiredItemIds() {
    let allItemIds: string[] = [];
    for (let i = 0; i < this.inventorySubquestItemDatas.length; i++) {
      if (this.inventorySubquestItemDatas[i].props.itemId !== "") {
        allItemIds.push(this.inventorySubquestItemDatas[i].props.itemId);
      }
    }

    return allItemIds;
  }

  getAllRequiredItemCategories() {
    let allItemCategories: string[] = [];
    for (let i = 0; i < this.inventorySubquestItemDatas.length; i++) {
      if (this.inventorySubquestItemDatas[i].props.itemCategory !== "") {
        allItemCategories.push(this.inventorySubquestItemDatas[i].props.itemCategory);
      }
    }

    return allItemCategories;
  }
}
Component.register(RetrievalSubquestData);

export class ShovelSubquestData extends SubquestData<typeof ShovelSubquestData> {
  static propsDefinition = {
    ...SubquestData.propsDefinition,
    shovelId: { type: PropTypes.String },
  };

  subscription: EventSubscription | undefined = undefined;

  start() {
    super.start();

    if (this.usingOverrideText) {
      return;
    }

    if (ShovelProgressionManager.IsReady()) {
      this.setDisplayTextForShovelId();
    }
    else {
      this.subscription = this.connectLocalBroadcastEvent(ShovelProgressionEvents.shovelProgressionManagerReady, () => {
        this.setDisplayTextForShovelId();
        this.subscription?.disconnect();
      });
    }
  }

  setDisplayTextForShovelId() {
    if (this.usingOverrideText) {
      return;
    }

    let shovelName = ShovelProgressionManager.instance.getShovelDataForId(this.props.shovelId)?.name;
    this.displayText = `Purchase the ${shovelName} Shovel`;
  }
}
Component.register(ShovelSubquestData);

export class CatalogEntriesSubquestData extends SubquestData<typeof CatalogEntriesSubquestData> {
  static propsDefinition = {
    ...SubquestData.propsDefinition,
    count: { type: PropTypes.Number },
  };

  subscription: EventSubscription | undefined = undefined;

  start() {
    super.start();
    if (this.usingOverrideText) {
      return;
    }

    this.setDisplayText();

  }

  setDisplayText() {
    if (this.usingOverrideText) {
      return;
    }

    this.displayText = `Discover ${this.props.count} new items`;
  }

  public getDisplayTextWithCount(count: number) { return `${this.getDisplayText()} (${count}/${this.props.count})`; }
}
Component.register(CatalogEntriesSubquestData);

export class UpgradeShovelSubquestData extends SubquestData<typeof UpgradeShovelSubquestData> {
  static propsDefinition = {
    ...SubquestData.propsDefinition,
    count: { type: PropTypes.Number },
  };

  subscription: EventSubscription | undefined = undefined;

  start() {
    super.start();
    if (this.usingOverrideText) {
      return;
    }

    this.setDisplayText();

  }

  setDisplayText() {
    if (this.usingOverrideText) {
      return;
    }

    this.displayText = `Upgrade shovels ${this.props.count} times`;
  }

  public getDisplayTextWithCount(count: number) { return `${this.getDisplayText()} (${count}/${this.props.count})`; }
}
Component.register(UpgradeShovelSubquestData);

export class UsePotionSubquestData extends SubquestData<typeof UsePotionSubquestData> {
  static propsDefinition = {
    ...SubquestData.propsDefinition,
    count: { type: PropTypes.Number },
    potionId: { type: PropTypes.String, default: "" },
  };

  subscription: EventSubscription | undefined = undefined;

  start() {
    super.start();
    if (this.usingOverrideText) {
      return;
    }

    this.setDisplayText();

  }

  setDisplayText() {
    if (this.usingOverrideText) {
      return;
    }
    else if (this.props.potionId.length >= 0) {
      const potionData = PotionData.getPotionTuning(this.props.potionId);
      if (potionData) {
        this.displayText = `Use a ${potionData.displayName} ${this.props.count} times`;
      }
    }
    this.displayText = `Use ${this.props.count} potions`;
  }

  public getDisplayTextWithCount(count: number) { return `${this.getDisplayText()} (${count}/${this.props.count})`; }
}
Component.register(UsePotionSubquestData);

export class DigLuckSubquestData extends SubquestData<typeof DigLuckSubquestData> {
  static propsDefinition = {
    ...SubquestData.propsDefinition,
    count: { type: PropTypes.Number },
    minCompliment: { type: PropTypes.Number },
    streak: { type: PropTypes.Boolean },
    description: { type: PropTypes.String },
  };

  subscription: EventSubscription | undefined = undefined;

  start() {
    super.start();
    if (this.usingOverrideText) {
      return;
    }

    this.setDisplayText();

  }

  setDisplayText() {
    if (this.usingOverrideText) {
      return;
    }
    this.displayText = "Get "
    if (this.props.count > 1) {
      this.displayText += `${this.props.count} `
    }
    this.displayText += this.props.description
    if (this.props.streak) {
      this.displayText += " in a row"
    }
  }

  public getDisplayTextWithCount(count: number) { return `${this.getDisplayText()} (${count}/${this.props.count})`; }
}
Component.register(DigLuckSubquestData);

export class SocialDigSubquestData extends SubquestData<typeof SocialDigSubquestData> {
  static propsDefinition = {
    ...SubquestData.propsDefinition,
    count: { type: PropTypes.Number },
  };

  subscription: EventSubscription | undefined = undefined;

  start() {
    super.start();
    if (this.usingOverrideText) {
      return;
    }

    this.setDisplayText();

  }

  setDisplayText() {
    if (this.usingOverrideText) {
      return;
    }
    this.displayText = `Get ${this.props.count} Dig Dollas from social digging`
  }

  public getDisplayTextWithCount(count: number) { return `${this.getDisplayText()} (${count}/${this.props.count})`; }
}
Component.register(SocialDigSubquestData);

export type GoToDigZoneSubquestParameters = {
  zoneId: string,
}

export class GoToDigZoneSubquestData extends SubquestData<typeof GoToDigZoneSubquestData> {
  static propsDefinition = {
    ...SubquestData.propsDefinition,
    pleaseIgnore: {type: PropTypes.String }
  };

  setDigZone(digZone: DigZone) {
    if (!this.usingOverrideText) {
      this.displayText = `Go to ${digZone.props.displayName}`;
    }
    this.navigationTarget = digZone.entity.position.get();
  }

  setParameters(parameters?: any): void {
    if (!parameters) {
      return;
    }
    const subquestParameters = parameters as GoToDigZoneSubquestParameters;
    const zoneId = subquestParameters.zoneId;
    if (zoneId) {
      const digZone = DigZoneManager.instance.getDigZoneFromZoneId(zoneId)!;
      this.setDigZone(digZone);
    }
  }
}
Component.register(GoToDigZoneSubquestData);
