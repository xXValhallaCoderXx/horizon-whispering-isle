import { GameConstants } from "Constants";
import { DigManager } from "DigManager";
import { DigZone } from "DigZone";
import { DigSpotParams, Events } from "Events";
import { Component, EventSubscription, Player, Vec3 } from "horizon/core";
import { getIslandID, Islands } from "Islands";
import { ItemContainer } from "ItemContainer";
import { ItemUtils } from "ItemUtils";
import { Logger } from "Logger";
import { PlayerData } from "PlayerData";
import { IPlayerProximityListener } from "PlayerProximityController";
import { PlayerService } from "PlayerService";
import { PotionData } from "PotionData";
import { ShinySpot } from "ShinySpot";
import { ShovelData } from "ShovelData";
import { ShovelProgressionManager } from "ShovelProgressionManager";
import { TutorialProgress } from "TutorialManager";

const NUX_PROXIMITY_RADIUS = 1;
const PROXIMITY_RADIUS = 2;

const log = new Logger("ShinySpotWorldData");

type ZoneSettings = { id: string; shinySpotIndex: number };

export class ShinySpotWorldData implements IPlayerProximityListener {
  static nextShinySpotId = 0;

  public id: number = -1;
  public itemId: string = "";
  public rarity: number = 0;
  public starRequirement: number = 1;
  public digsAttempted: number = 0;
  public autoRespawn: boolean = false;
  public lteSpot: boolean = false;
  public timeToRespawn: number = 0;
  public digZone: DigZone | undefined
  public zoneSettings: ZoneSettings = { id: "", shinySpotIndex: -1 };
  public position: Vec3 = Vec3.zero;
  public shinySpotEffect: ShinySpot | undefined;

  private isUsed: boolean = false;
  private isPlayerInZone: boolean = false;
  private isDigging: boolean = false;
  private proximityListenerId?: bigint;

  private eventSubscriptions: EventSubscription[] = [];

  public get isPlayerDigging() { return this.isDigging; }

  constructor(public player: Player, private component: Component, isLteSpot: boolean) {
    this.id = ShinySpotWorldData.nextShinySpotId++;
    this.lteSpot = isLteSpot;
    this.resetOff(true);
  }

  onPlayerDigComplete(itemId: string) {
    if (!this.isPlayerInZone) {
      return;
    }
    if (this.itemId !== "" && this.itemId !== itemId) {
      this.digsAttempted++;
      this.refreshUI();
      return;
    }
    this.isUsed = true
    this.component.sendNetworkBroadcastEvent(Events.removeDigSpotUI, { id: this.id }, [this.player])
    this.component.sendLocalBroadcastEvent(Events.shinySpotUsed, this);
    log.info("player " + this.player.id + " used shiny spot " + this.id)
    this.digsAttempted = 0;
  }

  setup(itemId: string, position: Vec3, isNuxShinySpot = false) {
    this.clearShinySpotItem();
    this.itemId = itemId;
    const item = ItemContainer.localInstance.getItemDataForId(itemId);
    this.rarity = item?.rarity ?? 0; // default is common
    this.setPosition(position, isNuxShinySpot);
    if (itemId !== "") {
      const target = [this.player]
      const percentage = this.getPercentage(false);
      const params: DigSpotParams = { position: position.add(new Vec3(0, 2, 0)), itemId, percentage, starRequirement: this.starRequirement, digsAttempted: this.digsAttempted };
      this.component.sendNetworkBroadcastEvent(Events.addDigSpotUI, { id: this.id, params }, target)
      this.component.sendNetworkBroadcastEvent(Events.updateDigSpotUI, { id: this.id, percentage: percentage, digsAttempted: this.digsAttempted, delayUpdatePercentage: false }, target);
      log.info(`added shiny spot ${this.id} for player ${this.player.id} with item ${itemId} at ${position}`)
    } else {
      log.info(`added shiny spot ${this.id} for player ${this.player.id} with no item at ${position}`)
    }
  }

  setPosition(position: Vec3, isNuxShinySpot = false) {
    this.position = position;
    if (this.proximityListenerId !== undefined) {
      PlayerService.proximity()?.disconnect(this.proximityListenerId);
    }
    this.proximityListenerId = PlayerService.proximity()?.connectListener(position, isNuxShinySpot ? NUX_PROXIMITY_RADIUS : PROXIMITY_RADIUS, this, [this.player]);
  }

  setDigZone(digZone: DigZone) {
    this.digZone = digZone;
    this.zoneSettings = { id: digZone.props.id, shinySpotIndex: -1 };
    this.starRequirement = digZone.props.recommendedLevel;
  }

  setPlayerDigging(value: boolean) {
    this.isDigging = value;
  }

  clearSettings() {
    this.digZone = undefined;
    this.starRequirement = 1;
    this.zoneSettings = { id: "", shinySpotIndex: -1 };
    this.rarity = 0;
  }

  setIsland(island: Islands) {
    this.zoneSettings = { id: getIslandID(island)!, shinySpotIndex: -1 };
    this.starRequirement = 1;
  }

  isPlayerOnSpot() {
    return this.isPlayerInZone;
  }

  refreshUI() {
    if (this.itemId !== "") {
      this.component.sendNetworkBroadcastEvent(Events.updateDigSpotUI, { id: this.id, percentage: this.getPercentage(false), digsAttempted: this.digsAttempted, delayUpdatePercentage: false }, [this.player]);
    }
  }

  clearShinySpotItem() {
    if (this.itemId !== "") {
      this.component.sendNetworkBroadcastEvent(Events.removeDigSpotUI, { id: this.id }, [this.player])
      this.itemId = "";
    }
  }

  /**
   * Call when shiny spot should be at its default state and off
   */
  resetOff(clearSettings: boolean) {
    log.info(`Reset off for shiny spot ${this.id}`);
    this.resetCommon();
    if (clearSettings) {
      this.clearShinySpotItem();
      this.clearSettings();
    } else {
      this.component.sendNetworkBroadcastEvent(Events.removeDigSpotUI, { id: this.id }, [this.player])
    }
    if (this.shinySpotEffect !== undefined) {
      this.shinySpotEffect.stopVFX();
      this.shinySpotEffect.clearData();
    }

    this.disconnectProximityListener();
  }

  resetOn() {
    log.info(`Reset on for shiny spot ${this.id}`);
    this.resetCommon();
    this.shinySpotEffect?.playVFX();
  }

  resetCommon() {
    this.isUsed = false;
    this.isPlayerInZone = false;
    this.isDigging = false;
    this.digsAttempted = 0;
  }

  rollForItem(minigameChanceScale: number): boolean {
    const item = ItemContainer.localInstance.getItemDataForId(this.itemId);
    if (!item) {
      // Common spot, no item
      return false;
    }

    const percentage = this.getPercentage(true) + minigameChanceScale * (GameConstants.Minigame.Phase0ChanceBonus * .01);
    log.info("roll for item " + this.itemId + " " + percentage)
    return Math.random() < percentage;
  }

  getPercentage(includePotion: boolean): number {
    let percentage = ItemUtils.RARITY_BASE_PERCENTAGE[this.rarity] + this.digsAttempted * ItemUtils.RARITY_PERCENTAGE_INCREMENT[this.rarity];
    const item = ItemContainer.localInstance.getItemDataForId(this.itemId);

    if (includePotion) {
      const activePotions = PlayerData.getSelectedPotions(this.player);
      const basePercentage = percentage;
      for (let i = 0; i < activePotions.length; i++) {
        const activePotionTuning = PotionData.getPotionTuning(activePotions[i].id);
        const chanceBoost = activePotionTuning?.minigameBoost ?? 0;
        log.info("potion chance boost: " + chanceBoost)
        percentage += basePercentage * chanceBoost;
      }
    }

    // Shovel boost
    let shovelData: ShovelData | undefined = ShovelProgressionManager.instance.getShovelDataForPlayer(this.player);
    if (shovelData && item && shovelData.categoryToBias === item.category && !isNaN(shovelData.biasWeight) && shovelData.biasWeight > 0) {
      percentage += (shovelData.biasWeight / 100);
      log.info("shovel boost " + percentage + " " + shovelData.biasWeight + " " + item.category + " " + shovelData.categoryToBias);
    }
    else {
      //console.log(`shovel data ${shovelData} item ${item}`);
      if (shovelData && item) {
        //console.log(`item: ${this.itemId} shovel data ${shovelData.id} ${shovelData.categoryToBias} item ${item.category} biasweight ${shovelData.biasWeight}`);
      }
    }

    return percentage;
  }


  onPlayerEnterProximity(player: Player) {
    if (player !== this.player) {
      return;
    }

    if (PlayerData.getTutorialComplete(this.player) < TutorialProgress.COMPLETED_MINIGAME) {
      log.info("player entered proximity to shiny spot " + this.id + " but tutorial not complete")
      this.component.sendNetworkBroadcastEvent(Events.shinySpotTriggerEnter, { player: this.player }, [this.component.world.getServerPlayer()]);
    }

    log.info("player entered proximity to shiny spot " + this.id)
    this.isPlayerInZone = true;
    if (DigManager.instance && !this.isUsed) {
      DigManager.instance.setShinySpot(player, this, true)
    }
  }

  onPlayerExitProximity(player: Player) {
    if (player !== this.player) {
      return;
    }

    log.info("player exited proximity to shiny spot " + this.id)
    this.isPlayerInZone = false;
    if (DigManager.instance) {
      DigManager.instance.setShinySpot(player, this, false)
    }
  }

  private disconnectProximityListener() {
    if (this.proximityListenerId !== undefined) {
      PlayerService.proximity()?.disconnect(this.proximityListenerId);
      this.proximityListenerId = undefined;
    }
  }

  dispose() {
    this.eventSubscriptions.forEach((subscription) => subscription.disconnect());
    this.resetOff(true);
    this.lteSpot = false;
  }
}
