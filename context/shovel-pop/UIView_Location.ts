/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { AudioBank } from 'AudioBank';
import { GameConstants } from 'Constants';
import { DigZoneManager, ZoneData } from 'DigZoneManager';
import { HUDElementType } from 'Enums';
import { Events } from 'Events';
import * as hz from 'horizon/core';
import * as ui from 'horizon/ui';
import { AnimatedBinding, Binding, Image, ImageSource, Pressable, Text, UINode, View } from 'horizon/ui';
import { HUDAnimations } from 'HUDAnimations';
import { AnimatedHUDElementVisibilityTracker } from 'HUDElementVisibilityTracker';
import { IslandEvents } from 'IslandTeleportManager';
import { ItemContainer } from 'ItemContainer';
import { ItemData } from 'ItemData';
import { ItemUtils } from 'ItemUtils';
import { Logger } from 'Logger';
import { PlayerDataEvents } from 'PlayerDataEvents';
import { PotionBuffType, PotionData, PotionTuning } from 'PotionData';
import { Shovel } from 'Shovel';
import { ShovelData } from 'ShovelData';
import { AnalyticsManager, LogType } from 'TurboAnalytics';
import { UI_Utils } from 'UI_Utils';
import { UIView_InteractionNonBlocking3Base } from 'UIRoot_ChildrenBase';
import { UIRoot_InteractionNonBlocking3 } from 'UIRoot_InteractionNonBlocking3';
import { DIG_RESULT_PRESENTATION_DURATION, ITEM_FLY_TO_PUNCHCARD_DURATION } from 'UIView_DigResultHud';
import { FanfareType, UIView_Fanfare } from 'UIView_Fanfare';

const OUTLINE_SIZE = 2;
const MAX_VISIBLE_ITEMS = 6
const MAX_RECS = 6
const ITEM_DISCOVER_DURATION = 800;
const SHOW_HIDE_SHIFT_DURATION = 150;
const CLAIM_REWARD_DURATION = 1000;
const CLAIM_REWARD_RESET_DURATION = 500; // how long to wait before resetting the claimable state, so it doesn't flicker
const CLAIM_REWARD_AUDIO_DELAY = 150; // how long to wait before playing the claim reward audio
const SHOVEL_LEVEL_NOTIFICATION_DURATION = 10000;
const REGION_COMPLETE_FANFARE_DURATION = 2400;
const REGION_COMPLETE_FANFARE_WIDTH = 567;
const REGION_COMPLETE_FANFARE_HEIGHT = 370;
const REGION_COMPLETE_FANFARE_HEADER_WIDTH = 500;

const log = new Logger('UIView_Location');

class ItemViewModel {
  itemImage: Binding<ImageSource>
  requiredShovelImage: Binding<ImageSource>
  requiredShovelVisible = new Binding(false)
  rarityText = new Binding("")
  rarityTextColor = new Binding("#FFFFFF")
  hasItemScale = new ui.AnimatedBinding(0)
  isVisible = new Binding(true)
  id = ''
  hasItem = false

  constructor(missingImage: ImageSource) {
    this.itemImage = new Binding(missingImage)
    this.requiredShovelImage = new Binding(missingImage)
  }
}

class RecommendationViewModel {
  text = new Binding('')
  isVisible = new Binding(true)
  qualifies = new Binding(false)
}

export const RegionUIEvents = {
  selectedTips: new hz.NetworkEvent<{ player: hz.Player }>('selectedTips'),
  closedPanel: new hz.NetworkEvent<{ player: hz.Player }>('closedPanel')
}

export class UIView_Location extends UIView_InteractionNonBlocking3Base {
  private islandText!: Binding<string>
  private zoneText!: Binding<string>
  private shovelLevelText = new Binding("")
  private levelTextColor = new Binding("#FFFFFF")
  private expRewardText = new Binding("");
  private gemRewardText = new Binding('')
  private itemCountText = new Binding("")
  private recsPanelOpen = new Binding(true)
  private pipValue = new Binding('')
  private openedFirstTime = new Binding(false)
  private zoneCompleted = new Binding(false)
  private rewardClaimed = new Binding(false)
  private showTimer = new AnimatedBinding(0)
  private cooldownTimerText = new Binding("")
  private showZoneItems = new AnimatedBinding(1);
  private panelOpen = new AnimatedBinding(0);
  private rewardClaimable = new Binding(false);
  private rewardsScale = new AnimatedBinding(0);
  private showLevelShovelNotification = new Binding(false);
  private regionCompleteFanfareScale = new AnimatedBinding(0);
  private regionCompleteFanfareOpacity = new AnimatedBinding(0);
  private regionCompleteGemX = new AnimatedBinding(0);
  private regionCompleteGemY = new AnimatedBinding(0);
  private regionCompleteGemScale = new AnimatedBinding(0);
  private regionCompleteGemTextX = new AnimatedBinding(0);
  private regionCompleteGemTextY = new AnimatedBinding(0);
  private regionCompleteGemTextScale = new AnimatedBinding(0);
  private claimButtonDisabled = new Binding(false);

  private punchcardVisibleScale = new ui.AnimatedBinding(0);
  private hudElementVisible!: AnimatedHUDElementVisibilityTracker;
  private itemModels: ItemViewModel[] = []
  private recsViewModels: RecommendationViewModel[] = []

  private activeShovel!: ShovelData
  private activePotions: PotionTuning[] = []
  private activeZoneLevel = 0
  private activeZone!: ZoneData
  private currentCooldownSeconds = 0
  private currentCooldownEndTime = 0

  private newItemSubscription: hz.EventSubscription | undefined

  private isClaimSequenceActive = false;
  private itemCountCache = 0;
  private buttonActive = true;
  private rewardClaimableCache = false;
  private panelOpenCache = false;
  private showTimerCache: boolean = false;
  private zoneCompletedCache: boolean = false;

  constructor(uiRoot: UIRoot_InteractionNonBlocking3) {
    super(uiRoot);

    this.islandText = new Binding("");
    this.zoneText = new Binding("");
    this.hudElementVisible = new AnimatedHUDElementVisibilityTracker(HUDElementType.Location, HUDAnimations.locationAnimation);

    this.uiRoot.connectNetworkBroadcastEvent(DigZoneManager.sendZoneId, (payload) => {
      this.onReceiveZoneData(payload.data)
    })

    this.uiRoot.connectNetworkBroadcastEvent(IslandEvents.playerTeleportedToIsland, (payload) => {
      if (payload.player.id === this.uiRoot.world.getLocalPlayer().id) {
        this.islandText.set(payload.islandName, [this.localPlayer])
      }
    });

    this.uiRoot.connectNetworkBroadcastEvent(PlayerDataEvents.updateSelectedPotions, (payload) => {
      this.activePotions = []

      payload.selectedPotionsData.forEach((potion) => {
        const potionTuning = PotionData.getPotionTuning(potion.id);
        if (potionTuning) {
          this.activePotions.push(potionTuning);
        }
      });

      this.refreshData()
    });

    this.uiRoot.connectLocalBroadcastEvent(Events.localPlayerShovelChanged, (payload) => {
      this.activeShovel = payload.shovelData
      this.setRequiredShovelOverlay(this.activeShovel)
      this.refreshData()
    })

    this.uiRoot.connectLocalBroadcastEvent(Events.localPlayerShovelChanged, (payload) => {
      this.setZoneLevelAndColor()
      this.refreshData()
    })

    this.uiRoot.connectLocalBroadcastEvent(Events.localSetShovelLevel, () => {
      this.setZoneLevelAndColor()
      this.refreshData()
    })

    this.uiRoot.connectLocalBroadcastEvent(Events.requestPunchcardInfo, (payload) => this.onRequestPunchcardInfo(payload.itemId));

    this.uiRoot.connectLocalBroadcastEvent(Events.localPlayerDigComplete, (payload) => {
      this.uiRoot.async.setTimeout(() => {
        this.showZoneItems.set(ui.Animation.timing(1, { duration: 150, easing: ui.Easing.linear }), undefined, [this.localPlayer]);
      }, DIG_RESULT_PRESENTATION_DURATION);

      // if (this.isActive() && !this.isOnCooldown()) {
      //   this.setPanelOpen(false);
      // }
    })

    this.uiRoot.connectLocalBroadcastEvent(Events.digMinigamePhaseChanged, (payload) => {
      const hideZoneItemsPhase = 0;
      if (payload.phase !== hideZoneItemsPhase) {
        return;
      }
      this.showZoneItems.set(ui.Animation.timing(0, { duration: 150, easing: ui.Easing.linear }), undefined, [this.localPlayer]);
    });

    this.hudElementVisible.connect(this.uiRoot);
    this.uiRoot.connectLocalBroadcastEvent(hz.World.onUpdate, payload => this.update(payload.deltaTime));

    // this.uiRoot.connectNetworkBroadcastEvent(Events.debugAction2, (player) => {
    //   this.playRegionCompleteFanfare();
    //   this.uiRoot.async.setTimeout(() => {
    //     this.regionCompleteFanfareScale.set(0, undefined, [this.localPlayer]);
    //   }, REGION_COMPLETE_FANFARE_DURATION + 500);
    // })
  }

  private update(deltaTime: number) {
    if (!this.isOnCooldown()) {
      return;
    }
    const secondsToEndTime = Math.floor(Math.max(0, this.currentCooldownEndTime - Date.now()) / 1000);
    if (secondsToEndTime !== this.currentCooldownSeconds) {
      this.currentCooldownSeconds = secondsToEndTime;
      const text = this.formatTime(this.currentCooldownSeconds);
      this.cooldownTimerText.set(text, [this.localPlayer]);
    }
  }

  private formatTime(totalSeconds: number): string {
    const seconds = Math.floor(totalSeconds % 60);
    let minutes = Math.floor(totalSeconds / 60);
    const hours = Math.floor(minutes / 60);
    minutes -= hours * 60;
    const minutesText = minutes === 0 ? "00" : minutes < 10 ? '0' + minutes.toString() : minutes.toString();
    const secondsText = seconds === 0 ? "00" : seconds < 10 ? '0' + seconds.toString() : seconds.toString();

    const prefix = "";
    if (hours === 0) {
      return `${prefix}${minutesText}:${secondsText}`;
    }
    return `${prefix}${hours}:${minutesText}:${secondsText}`;
  }

  private onDigComplete(success: boolean, itemId: string) {
    if (success) {
      let allDiscovered = true;
      let foundItem: ItemViewModel | undefined = undefined;
      let viewModel = this.itemModels[0]

      for (let i = 0; i < MAX_VISIBLE_ITEMS; i++) {
        viewModel = this.itemModels[i];
        if (viewModel.id.length === 0) {
          break
        }

        if (viewModel.hasItem) {
          continue;
        }

        if (!viewModel.hasItem && viewModel.id === itemId) {
          foundItem = viewModel;
          viewModel.hasItem = true;
          continue;
        }
        allDiscovered = false;
      }
      if (!foundItem) {
        return;
      }

      const zoneItem = this.activeZone.items.find(item => item.itemId == foundItem!.id);
      if (zoneItem) {
        zoneItem.isFound = true;
      }
      this.playItemFoundAnimation(foundItem, allDiscovered);
      if (allDiscovered) {
        this.uiRoot.sendNetworkBroadcastEvent(AnalyticsManager.clientLogToServer, { player: this.localPlayer, log_type: LogType.TASK_END, taskKey: 'punchcard_complete', taskType: this.activeZone.id }, [this.serverPlayer])
      }
    }
    else {
      const shovel = Shovel.localInstance?.equippedData;
      if (shovel === undefined) {
        return
      }

      const shovelLevel = Shovel.getLevel(shovel.id) + 1

      if (this.activeZoneLevel > shovelLevel) {
        this.showLevelShovelNotification.set(true, [this.localPlayer]);

        this.uiRoot.async.setTimeout(() => {
          this.showLevelShovelNotification.set(false, [this.localPlayer]);
        }, SHOVEL_LEVEL_NOTIFICATION_DURATION);
      }
    }
  }

  private playItemFoundAnimation(viewModel: ItemViewModel, zoneComplete: boolean) {
    const startDelay = 240;
    const zoneLootShowDuration = 2000;
    const initialSpeed = GameConstants.Player.MoveSpeed;
    if (zoneComplete){
      this.localPlayer.locomotionSpeed.set(0);
    }

    this.uiRoot.async.setTimeout(() => {
      viewModel.hasItemScale.set(ui.Animation.timing(1, { duration: ITEM_DISCOVER_DURATION, easing: ui.Easing.linear }), undefined, [this.localPlayer]);
      this.uiRoot.async.setTimeout(() => {
        this.itemCountCache++;
        this.itemCountText.set(`Items (${this.itemCountCache}/${this.activeZone.items.length}) `, [this.localPlayer]);
        const pipValue = Math.max(0, this.activeZone.items.length - this.itemCountCache);
        this.pipValue.set(`${pipValue > 0 ? pipValue.toString() : ""}`, [this.localPlayer]);
        if (zoneComplete) {
          // Rec panel close when zone is complete
          this.recsPanelOpen.set(false, [this.localPlayer]);

          this.uiRoot.async.setTimeout(() => {
            this.playRegionCompleteFanfare();
            this.localPlayer.locomotionSpeed.set(initialSpeed);
          }, ITEM_DISCOVER_DURATION)
        }
      }, ITEM_DISCOVER_DURATION);
    }, DIG_RESULT_PRESENTATION_DURATION + ITEM_FLY_TO_PUNCHCARD_DURATION + startDelay);

    if (!this.panelOpenCache) {
      this.uiRoot.async.setTimeout(() => {
        this.setPanelOpen(true);
        // Don't hide the panel if zone is complete so it stays open during claimable state
        if (!zoneComplete) {
          this.uiRoot.async.setTimeout(() => {
            this.setPanelOpen(false);
          }, zoneLootShowDuration);
        }
      }, DIG_RESULT_PRESENTATION_DURATION);
    }
  }

  private playRegionCompleteFanfare() {
    this.regionCompleteGemX.set(0, undefined, [this.localPlayer]);
    this.regionCompleteGemY.set(-84, undefined, [this.localPlayer]);
    this.regionCompleteGemScale.set(4, undefined, [this.localPlayer]);
    this.regionCompleteGemTextX.set(0, undefined, [this.localPlayer]);
    this.regionCompleteGemTextY.set(30, undefined, [this.localPlayer]);
    this.regionCompleteGemTextScale.set(1.5, undefined, [this.localPlayer]);

    this.regionCompleteFanfareScale.set(0, undefined, [this.localPlayer]);
    this.regionCompleteFanfareOpacity.set(1, undefined, [this.localPlayer]);
    this.uiRoot.sendNetworkBroadcastEvent(UIView_Fanfare.playFanfare, { player: this.localPlayer, id: FanfareType.REGION_COMPLETE, excludeHud: ~HUDElementType.None }, [this.localPlayer, this.serverPlayer]);
    this.regionCompleteFanfareScale.set(ui.Animation.timing(1, { duration: REGION_COMPLETE_FANFARE_DURATION, easing: ui.Easing.linear }), () => {
      this.setClaimable(true);
      this.claimButtonDisabled.set(false, [this.localPlayer]);
    }, [this.localPlayer]);
  }

  private onReceiveZoneData(data: ZoneData) {
    log.info(`onReceiveZoneData  name: ${data.displayName}  completed: ${data.completed}  cooldown: ${data.renewCooldownTime}\nitems: ${data.items.map(x => `${x.itemId}:${x.isFound}`).join(", ")}`);
    const displayName = data.displayName;
    const targetPlayer = [this.localPlayer]
    const level = data.level;
    const items = data.items;

    this.activeZoneLevel = level
    this.activeZone = data;
    this.currentCooldownSeconds = 0;
    this.openedFirstTime.set(false, targetPlayer);

    const isActive = this.isActive();
    this.punchcardVisibleScale.set(ui.Animation.timing(isActive ? 1 : 0, { duration: SHOW_HIDE_SHIFT_DURATION, easing: ui.Easing.linear }), undefined, targetPlayer);
    if (isActive) {
      this.zoneText.set(displayName + " - ", targetPlayer);

      this.newItemSubscription?.disconnect();
      this.newItemSubscription = this.uiRoot.connectNetworkBroadcastEvent(Events.playerDigComplete, (payload) => this.onDigComplete(payload.isSuccess, payload.itemId));
      this.setZoneLevelAndColor()
      let allDiscovered = true;
      this.itemCountCache = 0;
      for (let i = 0; i < MAX_VISIBLE_ITEMS; i++) {
        let viewModel = this.itemModels[i];
        if (i < items.length) {
          let item = ItemContainer.localInstance.getItemDataForId(items[i].itemId);
          if (item === undefined) {
            log.error(`onReceiveZoneData  item (${items[i].itemId}) not found`);
            continue;
          }
          viewModel.isVisible.set(true, targetPlayer);
          viewModel.itemImage.set(ImageSource.fromTextureAsset(item.getIconAsset()!));

          // If zone is on cooldown, item is discovered from before
          const isDiscovered = items[i].isFound || data.renewCooldownTime > 0;
          viewModel.hasItem = isDiscovered;
          this.itemCountCache += isDiscovered ? 1 : 0;
          allDiscovered &&= isDiscovered;
          viewModel.hasItemScale.set(isDiscovered ? 1 : 0, undefined, targetPlayer);

          let hasRequiredShovel = isDiscovered || item.requiredShovels.length === 0;
          if (!hasRequiredShovel) {
            const requiredShovel = Shovel.getData(item.requiredShovels, 0)!
            viewModel.requiredShovelImage.set(ImageSource.fromTextureAsset(requiredShovel.getIconAsset()!), targetPlayer);
            if (this.activeShovel.id === requiredShovel.id) {
              hasRequiredShovel = true
            }
          }
          viewModel.requiredShovelVisible.set(!hasRequiredShovel, targetPlayer);

          this.setLabelForItem(item, viewModel);
          viewModel.id = item.id;
        } else {
          viewModel.id = "";
          viewModel.isVisible.set(false, targetPlayer);
        }
      }

      this.setZoneCompleted(allDiscovered);

      // Show recs if we haven't discovered all items
      this.recsPanelOpen.set(!allDiscovered, targetPlayer);

      let isClaimable = allDiscovered;

      if (allDiscovered) {
        //this.setRecPanelOpen(true);
        this.setClaimed(false);
      }

      this.currentCooldownEndTime = data.renewCooldownTime;
      if (data.renewCooldownTime !== 0) {
        this.expRewardText.set('Claimed', targetPlayer)
        this.setShowTimer(true);
        this.setClaimed(true);
        isClaimable = false;
      }
      else {
        this.refreshData()

        if (data.expReward > 0) {
          this.expRewardText.set('+' + data.expReward + "XP", targetPlayer)
        } else {
          this.expRewardText.set('', targetPlayer)
        }
        if (data.gemReward > 0) {
          this.gemRewardText.set('x ' + data.gemReward, targetPlayer)
        } else {
          this.gemRewardText.set('', targetPlayer)
        }

        this.setShowTimer(false);
        this.setClaimed(false);
      }

      this.itemCountText.set(`Items (${this.itemCountCache}/${items.length}) `, targetPlayer);
      this.pipValue.set(`${items.length - this.itemCountCache}`, targetPlayer);

      this.setClaimable(isClaimable);
    }
    else {
      this.setPanelOpen(false)
      this.newItemSubscription?.disconnect();
      this.newItemSubscription = undefined;
      this.currentCooldownEndTime = 0;
      this.setShowTimer(false);
      this.setClaimed(false);
      this.setClaimable(false);
    }
  }

  setShowTimer(active: boolean) {
    if (this.showTimerCache === active) {
      return;
    }
    this.showTimerCache = active;
    this.showTimer.set(ui.Animation.timing(active ? 1 : 0, { duration: 400, easing: ui.Easing.linear }), undefined, [this.localPlayer]);
  }

  private setClaimed(show: boolean) {
    if (this.isClaimSequenceActive) {
      // We will st claimable when the sequence is done
      return;
    }

    this.rewardClaimed.set(show, [this.localPlayer]);
  }

  private setClaimable(show: boolean) {
    log.info("setClaimable " + show)
    if (this.isClaimSequenceActive) {
      // We will st claimable when the sequence is done
      return;
    }

    this.rewardClaimable.set(show, [this.localPlayer]);
    this.rewardClaimableCache = show;

    // Force panel to be open if claimable
    if (show) {
      this.setPanelOpen(true);
    }
  }

  private setZoneCompleted(isComplete: boolean) {
    this.zoneCompletedCache = isComplete;
    this.zoneCompleted.set(isComplete, [this.localPlayer]);
  }

  private isActive() {
    return this.activeZone && this.activeZone.displayName.length > 0;
  }

  private onRequestPunchcardInfo(itemId: string) {
    let isFound = false;
    let x = 0;
    let isOnPunchcard = false;
    if (this.isActive()) {
      for (let i = 0; i < this.activeZone.items.length; ++i) {
        const zoneItem = this.activeZone.items[i];
        if (zoneItem.itemId === itemId) {
          isOnPunchcard = true;
          isFound = zoneItem.isFound;
          x = this.getX(i, this.activeZone.items.length);
          break;
        }
      }
    }
    this.uiRoot.sendLocalBroadcastEvent(Events.punchcardInfoResponse, { isOnPunchcard, isFound, x });
  }

  private getX(index: number, itemCount: number): number {
    const offset = 40//34;
    const itemWidth = 78.8;
    const spacing = 8;
    const width = itemCount * itemWidth + (itemCount - 1) * spacing;
    const halfWidth = width / 2;
    const x = index * itemWidth + index * spacing;
    return offset + x - halfWidth;
  }

  private onClick(open: boolean) {
    if (this.rewardClaimableCache) {
      this.onClaim();
    }
    else if (!this.zoneCompletedCache) {
      this.setPanelOpen(open);

      if (open) {
        this.refreshData();
      }
    }
  }

  private onClaim() {
    log.info("onClaim")
    if (!this.buttonActive) {
      return;
    }
    this.isClaimSequenceActive = true;
    this.claimButtonDisabled.set(true, [this.localPlayer]);
    this.setPanelOpen(false);
    const player = this.localPlayer;
    this.buttonActive = false;
    this.rewardsScale.set(ui.Animation.timing(1, { duration: CLAIM_REWARD_DURATION, easing: ui.Easing.linear }), undefined, [this.localPlayer]);
    this.regionCompleteFanfareOpacity.set(ui.Animation.timing(0, { duration: 300, easing: ui.Easing.linear }), undefined, [this.localPlayer]);
    this.uiRootNonBlocking.sendNetworkBroadcastEvent(DigZoneManager.requestZoneComplete, { player: player, id: this.activeZone.id }, [this.serverPlayer])
    this.setZoneCompleted(true);
    HUDAnimations.flyGem(
      this.uiRoot,
      this.regionCompleteGemX,
      this.regionCompleteGemY,
      this.regionCompleteGemScale,
      this.regionCompleteGemTextX,
      this.regionCompleteGemTextY,
      this.regionCompleteGemTextScale);

    this.uiRoot.async.setTimeout(() => {
      AudioBank.play('gem');
    }, CLAIM_REWARD_AUDIO_DELAY);

    this.uiRoot.async.setTimeout(() => {

      // Delay so it doesn't flicker for a frame while we get xp from zone complete
      this.uiRoot.async.setTimeout(() => {
        this.isClaimSequenceActive = false;
        this.setClaimable(false);

        // Show timer instead of rewards
        this.setClaimed(true);

        // Reset rewards and claim button even though we cannot see them now so
        // they are ready to go later
        this.buttonActive = true;
        this.rewardsScale.set(0, undefined, [this.localPlayer])
      }, CLAIM_REWARD_RESET_DURATION);
    }, CLAIM_REWARD_DURATION);
  }

  private refreshData() {
    const messageSet = new Set<string>() // so we dont repeat messages
    const shovel = Shovel.localInstance?.equippedData;
    if (shovel === undefined) {
      return
    }
    const shovelLevel = Shovel.getLevel(shovel.id) + 1
    const targetPlayer = [this.localPlayer]

    let j = 0
    let unmetRecs = 0

    if (this.activeZoneLevel >= 1) { // shovel level requirement
      if (shovelLevel >= this.activeZoneLevel) {
        this.recsViewModels[j].qualifies.set(true, targetPlayer);
      } else {
        this.recsViewModels[j].qualifies.set(false, targetPlayer);
        unmetRecs++;
      }
      this.recsViewModels[j].text.set(`Upgrade shovel to ${this.activeZoneLevel}+ Stars`, targetPlayer);
      this.recsViewModels[j].isVisible.set(true, targetPlayer);
      j++;
    }

    for (let i = 0; i < MAX_VISIBLE_ITEMS && j < MAX_RECS; i++) {
      const item = this.itemModels[i].isVisible ? ItemContainer.localInstance.getItemDataForId(this.itemModels[i].id) : undefined
      if (!item) {
        break
      }

      if (this.itemModels[i].hasItem) {
        continue // we already have this one skip
      }

      let requiredShovel = Shovel.getData(item.requiredShovels, 0)
      if (requiredShovel) {
        let text = requiredShovel.name
        if (!messageSet.has(text)) {
          messageSet.add(text)

          this.recsViewModels[j].text.set('Some items need ' + requiredShovel.name + ' Shovel', targetPlayer)
          if (shovel.id === requiredShovel.id) {
            this.recsViewModels[j].qualifies.set(true, targetPlayer);
          } else {
            this.recsViewModels[j].qualifies.set(false, targetPlayer);
            unmetRecs++;
          }
          this.recsViewModels[j].isVisible.set(true, targetPlayer);
          j++;
        }
      }

      if (item.rarity > 1) {
        const hasPotion = this.activePotions.some(x => x.buffType === PotionBuffType.Rarity)
        let text = 'potion';
        if (!messageSet.has(text)) {
          messageSet.add(text);

          if (hasPotion) {
            this.recsViewModels[j].qualifies.set(true, targetPlayer);
          } else {
            this.recsViewModels[j].qualifies.set(false, targetPlayer);
            unmetRecs++;
          }
          this.recsViewModels[j].text.set('Chance Potion', targetPlayer);
          this.recsViewModels[j].isVisible.set(true, targetPlayer);
          j++;
        }
      }
    }

    for (; j < MAX_RECS; j++) {
      this.recsViewModels[j].isVisible.set(false, targetPlayer)
    }
  }

  private setZoneLevelAndColor() {
    const targetPlayer = [this.localPlayer]
    if (this.activeZoneLevel === 0) {
      this.shovelLevelText.set('', targetPlayer)
      return
    }

    if (Shovel.localInstance === undefined) {
      log.error("Shovel not initialized!")
    }
    const shovel = Shovel.localInstance?.equippedData;
    const shovelLevel = shovel !== undefined ? Shovel.getLevel(shovel.id) + 1 : 1;

    if (shovelLevel >= this.activeZoneLevel) {
      this.levelTextColor.set("#3DE262", targetPlayer);
    }
    else {
      this.levelTextColor.set("#FF7474", targetPlayer);
    }

    this.shovelLevelText.set(this.activeZoneLevel.toString(), targetPlayer);
  }

  private setLabelForItem(item: ItemData, viewModel: ItemViewModel) {
    if (!item) {
      return
    }

    viewModel.rarityText.set(ItemUtils.RARITY_TEXT[item.rarity], [this.localPlayer])
    viewModel.rarityTextColor.set(ItemUtils.RARITY_HEX_COLORS[item.rarity], [this.localPlayer])
  }

  private setRequiredShovelOverlay(shovel: ShovelData) {
    for (let i = 0; i < MAX_VISIBLE_ITEMS; i++) {
      let viewModel = this.itemModels[i]
      if (viewModel.id.length === 0) {
        break
      }

      if (viewModel.hasItem) {
        continue
      }

      let item = ItemContainer.localInstance.getItemDataForId(viewModel.id)
      if (!item) {
        continue
      }

      if (item.requiredShovels.length === 0) {
        continue
      }

      const requiredShovel = Shovel.getData(item.requiredShovels, 0)!
      viewModel.requiredShovelVisible.set(requiredShovel.id !== shovel.id, [this.localPlayer]);
    }
  }

  private setPanelOpen(open: boolean) {
    this.panelOpenCache = open
    this.panelOpen.set(ui.Animation.timing(open ? 1 : 0, { duration: 150, easing: ui.Easing.linear }), undefined, [this.localPlayer])
    //this.showZoneItems.set(open, [this.localPlayer])
    if (open) {
      // Opening up the panel should dismiss the notification
      this.showLevelShovelNotification.set(false, [this.localPlayer])
      this.openedFirstTime.set(true, [this.localPlayer])
    }
    log.info(`setPanelOpen ${open}`)
  }

  private isOnCooldown() {
    return this.currentCooldownEndTime !== 0;
  }

  getRecommendationsView(): ui.UINode {
    const recommendationViews = [];
    for (let i = 0; i < MAX_RECS; i++) {
      const viewModel = new RecommendationViewModel()
      this.recsViewModels.push(viewModel)

      recommendationViews.push
        (ui.UINode.if(viewModel.isVisible, ui.View({
          children: [
            ui.View({
              children: [
                ui.UINode.if(viewModel.qualifies, ui.Image({
                  source: ImageSource.fromTextureAsset(this.uiRootNonBlocking.props.quest_checkmark!),
                  style: {
                    height: 12,
                    width: 12,
                    alignSelf: 'center',
                    position: 'absolute'
                  }
                }))
              ],
              style: {
                height: 16,
                width: 16,
                backgroundColor: viewModel.qualifies.derive(x => x ? '#45AAFF' : '#FFFFFF'),
                borderColor: '#2197FA',
                borderRadius: 4,
                borderWidth: 2,
                marginTop: 4,
                //alignSelf: 'center',
                marginRight: 8,
              }
            }),
            ui.Text({
              text: viewModel.text,
              style: {
                textAlign: 'left',
                textAlignVertical: "top",
                fontFamily: "Roboto",
                fontSize: 20,
                fontWeight: "700",
                color: '#415369'
              }
            }),
          ],
          style: {
            flexDirection: 'row'
          }
        })));
    }

    const recommendationList = ui.View({
      children: recommendationViews,
      style: {
        flexDirection: 'column',
        marginRight: 12,
        marginLeft: 12,
        marginTop: 4,
        marginBottom: 4,
        width: '60%'
      },
    })

    return UINode.if(this.recsPanelOpen, ui.View({
      children: [recommendationList],
      style: {
        borderRadius: 12,
        backgroundColor: '#E8F4FF',
        flexDirection: 'row',
        alignItems: 'center',
        minWidth: 310,
        maxWidth: 400,
        minHeight: 80,
        marginTop: 4,
        borderColor: '#B0D1ED',
        borderWidth: 4,
        paddingVertical: 4,
        opacity: this.panelOpen
      },
    }))
  }

  getPunchcardView(): ui.UINode {
    const children = []
    for (let i = 0; i < MAX_VISIBLE_ITEMS; i++) {
      let viewModel = new ItemViewModel(ImageSource.fromTextureAsset(this.uiRootNonBlocking.props.quest_checkmark!))
      this.itemModels.push(viewModel)
      children.push(this.getItemView(viewModel))
    }

    return ui.View({
      children: [
        // View({ //RewardBG
        //   children: [],
        //   style: {
        //     width: 138,
        //     height: "100%",
        //     position: "absolute",
        //     right: 0,
        //     top: 0,
        //     borderTopLeftRadius: 0,
        //     borderTopRightRadius: 8,
        //     borderBottomLeftRadius: 0,
        //     borderBottomRightRadius: 8,
        //     backgroundColor: "#C9E6FF"
        //   }
        // }),
        ...children,
        View({
          style: {
            width: this.showTimer.interpolate([0, .5, 1], [0, 120, 120])
          }
        }),
        this.getTimerView(),
        //this.getRewardView()
      ],
      style: { // Punch card BG style
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        //padding: 4,
        marginTop: 4,
        backgroundColor: "#E8F4FF",
        borderColor: "#B0D1ED",
        borderWidth: 4,
        paddingHorizontal: 4,
        paddingVertical: 6,
        opacity: this.panelOpen,
      },
    })
  }

  getItemView(viewModel: ItemViewModel): ui.UINode {
    const itemImage = ui.Image({
      source: viewModel.itemImage,
      style: {
        position: "absolute",
        width: "100%",
        height: "100%",
        tintColor: viewModel.hasItemScale.interpolate([0, 0.01, 1], ["#444", "#FFF", "#FFF"]),
      }
    })

    const hasItemIcon = ui.Image({
      source: ImageSource.fromTextureAsset(this.uiRootNonBlocking.props.icn_heavycheck!),
      style: {
        position: "absolute",
        width: 45,
        height: 45,
        alignSelf: "center",
        top: 20,
        opacity: viewModel.hasItemScale.interpolate([0, .1, 1], [0, 1, 1]),
        transform: [{ scale: viewModel.hasItemScale.interpolate([0, .3, .4, .6, 1], [.5, 2, 2.5, 2, 1]) }]
      }
    })

    const marker = ui.Image({
      source: ImageSource.fromTextureAsset(this.uiRootNonBlocking.props.icn_marker!),
      style: {
        position: "absolute",
        width: "87%",
        height: "87%",
        right: -1,
        bottom: -1,
        tintColor: viewModel.rarityTextColor,
        alignSelf: 'center'
      }
    })

    const requiredShovel = ui.Image({
      source: viewModel.requiredShovelImage,
      style: {
        position: "absolute",
        width: "85%",
        height: "85%",
        alignSelf: "center",
        transform: [{ rotate: '33deg' }],
        bottom: -10,
        right: -8
      }
    })

    return ui.UINode.if(viewModel.isVisible, ui.View({
      children: [
        itemImage,
        ui.UINode.if(viewModel.requiredShovelVisible, marker, undefined),
        ui.UINode.if(viewModel.requiredShovelVisible, requiredShovel, undefined),
        hasItemIcon,
      ],
      style: {
        width: 82,
        height: 82,
        borderRadius: 5,
        backgroundColor: '#555555',
        marginHorizontal: 2,
        opacity: 0.95,
        alignContent: "center",
        borderColor: viewModel.rarityTextColor,
        borderWidth: 4,
      },
    }))
  }

  getTimerView() {
    const root = View({ //Reset Timer Group
      children: [Text({ // New Items In
        text: "New items in ",
        style: {
          color: "#415369",
          textAlign: "center",
          fontFamily: "Roboto",
          fontSize: 16,
          fontWeight: "700"
        }
      }),
      Text({ // Reset Timer
        text: this.cooldownTimerText,
        style: {
          color: "#415369",
          textAlign: "center",
          fontFamily: "Roboto",
          fontSize: 24,
          fontWeight: "900"
        }
      })],
      style: {
        display: "flex",
        padding: 8,
        height: 40,
        width: 133,
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        borderRadius: 12,
        //backgroundColor: "#E8F4FF",
        position: "absolute",
        opacity: this.showTimer.interpolate([0, .5, 1], [0, 0, 1]),
        transform: [{ scale: this.showTimer.interpolate([0, .5, 1], [0, 1, 1]) }],
        right: 0,
      }
    })
    return root; // this.showTimer?
  }

  getRegionLabelView() {
    const root = View({ //UILocationPunchcard
      children: [View({ //Location Widget
        children: [View({ //Region Group
          children: [
            Pressable({ //BG
              style: {
                height: 36,
                flexShrink: 0,
                alignSelf: "stretch",
                borderTopLeftRadius: 8,
                borderTopRightRadius: 16,
                borderBottomLeftRadius: 8,
                borderBottomRightRadius: 16,
                backgroundColor: "rgb(0, 0, 0)",
                opacity: 0.87
              },
              onClick: () => this.onClick(!this.panelOpenCache),
              disabled: this.hudElementVisible.disableInput(),
            }),
            View({ //Contents
              children: [View({ //Spacer
                style: {
                  width: 28,
                  height: 8
                }
              }),
              Text({ // Workshop Lake
                text: this.zoneText,
                style: {
                  color: "#FFF",
                  textAlign: "center",
                  textAlignVertical: "center",
                  fontFamily: "Roboto",
                  fontSize: 20,
                  fontWeight: "700"
                }
              }),
              View({ //Spacer
                style: {
                  width: 8,
                  height: 8
                }
              }),
              Text({ // Level Number
                text: this.shovelLevelText,
                style: {
                  color: this.levelTextColor, // Red: #FF5050, Green: #3DE262
                  textAlign: "center",
                  textAlignVertical: "center",
                  fontFamily: "Roboto",
                  fontSize: 20,
                  fontWeight: "900"
                }
              }),
              Image({ //icn_star
                source: ImageSource.fromTextureAsset(this.props.icn_star!),
                style: {
                  width: 24,
                  height: 24,
                  resizeMode: "cover",
                  tintColor: this.levelTextColor // // Red: #FF5050, Green: #3DE262
                }
              }),
              View({ //Spacer
                style: {
                  width: 8,
                  height: 8
                }
              }),
              View({ //button_expand or button_collapse
                children: [
                  Text({ // Items (4/5)
                    text: this.itemCountText,
                    style: {
                      color: "#61470B",
                      fontFamily: "Roboto",
                      textAlign: "center",
                      textAlignVertical: "center",
                      fontSize: 20,
                      fontWeight: "900"
                    }
                  }),
                  UINode.if(this.rewardClaimed,



                    Image({ //icn_smallGreenCheckmark
                      source: ImageSource.fromTextureAsset(this.props.icn_heavycheck!),
                      style: {
                        width: 24,
                        height: 24,
                        resizeMode: "cover",
                        marginLeft: 8
                      }
                    }),



                    View({ //Reward Group Small
                      children: [View({ //Reward Content
                        children: [Text({ // +320
                          text: this.gemRewardText,
                          style: {
                            color: "#3B1F68",
                            textAlign: "center",
                            textAlignVertical: "center",
                            fontFamily: "Roboto",
                            fontSize: 24,
                            fontWeight: "900"
                          }
                        }),
                        Image({ //icn_gem
                          source: ImageSource.fromTextureAsset(this.props.icn_gem!),
                          style: {
                            width: 36,
                            height: 36,
                            resizeMode: "cover",
                            marginLeft: 2
                          }
                        })],
                        style: {
                          display: "flex",
                          height: 28,
                          paddingTop: 0,
                          paddingRight: 8,
                          paddingBottom: 0,
                          paddingLeft: 12,
                          justifyContent: "center",
                          alignItems: "center",
                          borderRadius: 20,
                          backgroundColor: "#FFF8E7",
                          flexDirection: "row"
                        }
                      })],
                      style: {
                        display: "flex",
                        alignItems: "center",
                        marginLeft: 8,
                        flexDirection: "row"
                      }
                    })


                  ),
                    // UINode.if(this.panelOpen,
                    // Image({ //icn_brownTriangleT
                    //   source: ImageSource.fromTextureAsset(this.props.icn_triangleUp!),
                    //   style: {
                    //     width: 28,
                    //     height: 28,
                    //     position: "absolute",
                    //     right: 10,
                    //     top: 5,
                    //     resizeMode: "cover",
                    //     tintColor: "#61470B",
                    //     marginLeft: 8
                    //   }
                    // }),
                  UINode.if(this.zoneCompleted, undefined, Image({ //icn_brownTriangleD
                    source: ImageSource.fromTextureAsset(this.props.icn_triangleDown!),
                    style: {
                      width: 28,
                      height: 28,
                      //position: "absolute",
                      //right: 10,
                      //top: 5,
                      resizeMode: "cover",
                      tintColor: "#61470B",
                      marginLeft: 8,
                      transform: [{ rotate: this.panelOpen.interpolate([0, 1], ['360deg', '180deg']) }]
                    }
                  })),
                  UINode.if(this.zoneCompleted, undefined, UINode.if(this.openedFirstTime, undefined, UI_Utils.makeNewBadge(this.pipValue, -8, -8))),
                  // View({ //Pip
                  //   children: [Text({ // 5
                  //     text: "5",
                  //     style: {
                  //       color: "#FFF",
                  //       textAlign: "center",
                  //       fontFamily: "Roboto",
                  //       fontSize: 17,
                  //       fontWeight: "700"
                  //     }
                  //   })],
                  //   style: {
                  //     display: "flex",
                  //     width: 24,
                  //     height: 24,
                  //     justifyContent: "center",
                  //     backgroundColor: "#E90005",
                  //     borderRadius: 12,
                  //     alignItems: "center",
                  //     position: "absolute",
                  //     right: -7.5,
                  //     top: -8.5,
                  //     flexDirection: "row",
                  //   }
                  // })
                ],
                style: {
                  display: "flex",
                  height: 40,
                  paddingTop: 0,
                  paddingRight: 24,//45,
                  paddingBottom: 0,
                  paddingLeft: 24,
                  justifyContent: "center",
                  alignItems: "center",
                  borderRadius: 15,
                  borderBottomWidth: 4,
                  borderColor: "#CCA855",
                  backgroundColor: "#FFC90C",
                  flexDirection: "row"
                }
              }),

              Image({ //icn_location
                source: ImageSource.fromTextureAsset(this.props.icn_location!),

                style: {
                  width: 40,
                  height: 40,
                  position: "absolute",
                  left: -16,
                  top: -2
                }
              })],
              style: {
                display: "flex",
                height: 36,
                alignItems: "center",
                flexShrink: 0,
                marginTop: -36,
                flexDirection: "row"
              }
            })],
          style: {
            display: "flex",
            height: 36,
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center"
          }
        })],
        style: {
          display: "flex",
          alignItems: "center",
          flexDirection: "row"
        }
      })
      ],
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        flexShrink: 0,
        position: "relative"
      }
    });
    return root;
  }

  // getRewardView() {
  //   const root = View({ //RewardGroup
  //     children: [

  //       View({ //Reward
  //         children: [
  //           UINode.if(this.expRewardText.derive(x => x.length > 0), View({ //RewardContent
  //             children: [Text({ // +320
  //               text: this.expRewardText,
  //               style: {
  //                 color: "#7B5B3D",
  //                 textAlign: "center",
  //                 fontFamily: "Roboto",
  //                 fontSize: 16,
  //                 fontWeight: "700"
  //               }
  //             })],
  //             style: {
  //               display: "flex",
  //               height: 28,
  //               paddingTop: 0,
  //               paddingRight: 8,
  //               paddingBottom: 0,
  //               paddingLeft: 23,
  //               justifyContent: "center",
  //               alignItems: "center",
  //               borderRadius: 14,
  //               borderWidth: 3,
  //               borderColor: "#FFB330",
  //               backgroundColor: "#FFF",
  //               marginTop: 2,
  //               flexDirection: "row"
  //             }
  //           })),
  //           UINode.if(this.gemRewardText.derive(x => x.length > 0), View({ //RewardContent
  //             children: [Text({ // +320
  //               text: this.gemRewardText,
  //               style: {
  //                 color: "#7B5B3D",
  //                 textAlign: "center",
  //                 fontFamily: "Roboto",
  //                 fontSize: 16,
  //                 fontWeight: "700"
  //               }
  //             }),
  //             Image({ //icn_gem
  //               source: ImageSource.fromTextureAsset(this.props.icn_gem!),
  //               style: {
  //                 width: 20,
  //                 height: 20,
  //                 resizeMode: "cover",
  //                 marginLeft: 2
  //               }
  //             })],
  //             style: {
  //               display: "flex",
  //               height: 28,
  //               paddingTop: 0,
  //               paddingRight: 8,
  //               paddingBottom: 0,
  //               paddingLeft: 23,
  //               justifyContent: "center",
  //               alignItems: "center",
  //               borderRadius: 14,
  //               borderWidth: 3,
  //               borderColor: "#FFB330",
  //               backgroundColor: "#FFF",
  //               marginTop: 2,
  //               flexDirection: "row"
  //             }
  //           }))],
  //         style: {
  //           display: "flex",
  //           flexDirection: "column",
  //           alignItems: "center",
  //           marginLeft: -24
  //         }
  //       }),
  //       Image({ //icn_giftBox
  //         source: ImageSource.fromTextureAsset(this.props.icn_giftBox!),
  //         style: {
  //           width: 48,
  //           height: 48,
  //           flexShrink: 0,
  //           resizeMode: "cover"
  //         }
  //       }),
  //     ],

  //     style: {
  //       display: "flex",
  //       width: 133,
  //       height: 100,
  //       marginLeft: 16,
  //       paddingVertical: 15,
  //       paddingHorizontal: 4,
  //       justifyContent: "center",
  //       alignItems: "center",
  //       borderRadius: 0,
  //       flexDirection: "row-reverse",
  //       position: "relative",
  //       transform: [{ scale: this.rewardsScale.interpolate([0, 0.6, 1], [1, 2, 0]) }]
  //     }
  //   })

  //   return ui.UINode.if(this.rewardClaimed, undefined, root);
  // }

  getShovelLevelNotificationView() {
    const root = View({ //UIGemRegionToast
      children: [View({ //Gem Region Toast
        children: [View({ //BG
          children: [],
          style: {
            height: 96,
            alignSelf: "stretch",
            borderRadius: 16,
            borderWidth: 4,
            borderColor: "#F02849",
            backgroundColor: "#FFE4E5"
          }
        }),
        View({ //Content Group
          children: [Image({ //icn_gem
            source: ImageSource.fromTextureAsset(this.props.icn_gem!),
            style: {
              width: 61.484,
              height: 61.484,
              resizeMode: "cover"
            }
          }),
          View({ //Spacer
            style: {
              width: 8,
              height: 20
            }
          }),
          Text({ // Complete Regions, get more Gems, and upgrade your Shovel!
            text: "Complete Regions, get more Gems, and upgrade your Shovel!",
            style: {
              width: 380,
              color: "#290101",
              textAlign: "center",
              fontFamily: "Roboto",
              fontSize: 20,
              fontWeight: "700"
            }
          })],
          style: {
            display: "flex",
            height: 96,
            paddingTop: 8,
            paddingRight: 12,
            paddingBottom: 0,
            paddingLeft: 12,
            alignItems: "center",
            alignSelf: "stretch",
            flexDirection: "row",
            marginTop: -96
          }
        }),
        View({ //Title
          children: [Text({ // Not Enough Shovel Stars
            text: "Not Enough Shovel Stars",
            style: {
              color: "#FFF3F4",
              textAlign: "center",
              textAlignVertical: "center",
              fontFamily: "Roboto",
              fontSize: 24,
              fontWeight: "700"
            }
          })],
          style: {
            display: "flex",
            height: 32,
            paddingVertical: 0,
            paddingHorizontal: 32,
            justifyContent: "center",
            alignItems: "center",
            position: "absolute",
            alignSelf: "center",
            top: -16,
            borderRadius: 30,
            backgroundColor: "#F02849",
            flexDirection: "row"
          }
        })],
        style: {
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          borderRadius: 16
        }
      })],
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
        paddingTop: 35
      }
    })

    return UINode.if(this.showLevelShovelNotification, root);
  }

  private regionCompleteFanfare(): ui.UINode<any> {
    const root = View({ //UIRegionCompleteModal
      children: [View({ //Modal
        children: [View({ //Content
          children: [View({ //Reward Group


            // RAY
            children: [Image({ //icn_cartoonishRay
              source: ImageSource.fromTextureAsset(this.props.icn_cartoonishRay!),
              style: {
                display: "flex",
                width: 274,
                height: 274,
                justifyContent: "center",
                alignItems: "center",
                alignSelf: "center",
                tintColor: "#C250E6",
                top: -144,
                opacity: .33,
                transform: [{ rotate: this.regionCompleteFanfareScale.interpolate([0, .6, .9, 1], ["0deg", "0deg", "180deg", "180deg"]) }],
                position: "absolute",
              }
            })],
            style: {
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              opacity: this.regionCompleteFanfareScale.interpolate([0, .6, .8, 1], [0, 0, 1, 1]),
            }
          }),



          // CLAIM BUTTON
          View({
            children: [
              Pressable({ //button_Claim
                children: [Text({ // Claim!
                  text: "Claim!",
                  style: {
                    color: "#FFF",
                    fontFamily: "Roboto",
                    fontSize: 36,
                    fontWeight: "700"
                  }
                })],
                style: {
                  display: "flex",
                  paddingHorizontal: 49,
                  justifyContent: "center",
                  alignItems: "center",
                  borderRadius: 15,
                  borderBottomWidth: 4,
                  borderColor: "#49A24C",
                  backgroundColor: "#70C04E",
                  flexDirection: "row",
                  //position: "absolute",
                },
                onClick: () => this.onClaim(),
                disabled: this.claimButtonDisabled
              })],
            style: {
              opacity: this.regionCompleteFanfareScale.interpolate([0, .9, 1], [0, 0, 1]),
              marginTop: 16,
              top: 140,
            }
          })],




          style: {
            display: "flex",
            // paddingTop: 72,
            // paddingRight: 12,
            // paddingBottom: 16,
            // paddingLeft: 12,
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            alignSelf: "center",
            borderRadius: 16,
            backgroundColor: "#ECFAFF",
            width: REGION_COMPLETE_FANFARE_WIDTH,
            transform: [{ scaleY: this.regionCompleteFanfareScale.interpolate([0, .4, .44, 1], [0, 0, 1, 1]) }],
            height: this.regionCompleteFanfareScale.interpolate([0, .4, .6, 1], [0, 0, REGION_COMPLETE_FANFARE_HEIGHT, REGION_COMPLETE_FANFARE_HEIGHT]),
            position: "absolute",
            top: 24,
          }
        }),







        // REGION COMPLETE GREEN BACKGROUND
        View({ //Title
          children: [
            //   Text({ // Region Complete!
            //     text: "Region Complete!",
            //     style: {
            //         color: "#FFF",
            //         textAlign: "center",
            //         fontFamily: "Roboto",
            //         fontSize: 48,
            //         fontWeight: "900"
            //     }
            // }),
          ],
          style: {
            display: "flex",
            paddingVertical: 0,
            paddingHorizontal: 57,
            justifyContent: "center",
            alignItems: "center",
            position: "absolute",
            alignSelf: "center",
            borderRadius: 39,
            backgroundColor: "#70C04E",
            flexDirection: "row",
            //top: -28,
            width: this.regionCompleteFanfareScale.interpolate([0, .2, 1], [0, REGION_COMPLETE_FANFARE_HEADER_WIDTH, REGION_COMPLETE_FANFARE_HEADER_WIDTH]),
            transform: [{ scaleX: this.regionCompleteFanfareScale.interpolate([0, .01, 1], [0, 1, 1]) }],
            //width: "100%",
            height: 50,
          }
        }),


        // REGION COMPLETE IMAGE TEXT
        Image({ //icn_regionComplete
          source: ImageSource.fromTextureAsset(this.props.fanfare_regionComplete!),
          style: {
            width: 400,
            height: 48,
            resizeMode: "cover",
            opacity: this.regionCompleteFanfareScale.interpolate([0, .2, .4, 1], [0, 0, 1, 1]),
          }
        })],




        style: {
          display: "flex",
          //width: 567,
          width: "100%",
          flexDirection: "column",
          alignItems: "center",
          //flexShrink: 0,
          position: "absolute",
          top: this.regionCompleteFanfareScale.interpolate([0, .4, .6, 1], [240, 240, 45, 45]),
          alignSelf: "center",
          opacity: this.regionCompleteFanfareOpacity,
          //height: this.regionCompleteFanfareScale.interpolate([0, .2, .3, 1], [0, 0, REGION_COMPLETE_FANFARE_HEIGHT, REGION_COMPLETE_FANFARE_HEIGHT]),
        }
      }),

      //   GEM
      View({
        children: [
          Image({ //icn_gem
            source: ImageSource.fromTextureAsset(this.props.icn_gem!),
            style: {
              width: 32,
              height: 32,
              resizeMode: "cover",
              opacity: this.regionCompleteFanfareScale.interpolate([0, .6, .7, 1], [0, 0, 1, 1]),
              transform: [
                { translateX: this.regionCompleteGemX },
                { translateY: this.regionCompleteGemY },
                { scale: this.regionCompleteGemScale}
              ]
            }
          })],
          style: {
            position: "absolute",
            //top: 160,
          }
      }),



      // View({ //Spacer
      //   style: {
      //     width: 8,
      //     height: 20
      //   }
      // }),




      //   GEM REWARD TEXT
      View({
        children: [
          Text({ // reward text
            text: this.gemRewardText,
            style: {
              color: "#631F74",
              textAlign: "right",
              fontFamily: "Roboto",
              fontSize: 48,
              fontWeight: "900",
              opacity: this.regionCompleteFanfareScale.interpolate([0, .6, .8, 1], [0, 0, 1, 1]),
              transform: [
                { translateX: this.regionCompleteGemTextX },
                { translateY: this.regionCompleteGemTextY },
                { scale: this.regionCompleteGemTextScale}
              ]
            }
          })],
          style: {
            position: "absolute",
            //top: 300,
          }
      }),




      ],
      style: {
        display: "flex",
        width: "100%",
        height: 600,
        justifyContent: "center",
        alignItems: "center",
        position: "absolute"
      }
    })
    return root;
  }

  createView() {
    // const claimRewardButton = ui.Pressable({
    //   children: [
    //     ui.Text({
    //       text: 'Claim Rewards!',
    //       style: {
    //         fontSize: 20,
    //         fontFamily: 'Roboto',
    //         color: '#FFFFFF',
    //         textAlign: 'center',
    //         fontWeight: '900',
    //         alignSelf: 'center',
    //         left: 2,
    //         paddingHorizontal: 20
    //       }
    //     }),
    //   ],
    //   style: {
    //     backgroundColor: '#70C04E',
    //     borderRadius: 14,
    //     height: 28,
    //     alignSelf: 'center',
    //     top: -8,
    //   },
    //   onClick: () => this.onClaim(),
    //   disabled: this.hudElementVisible.disableInput()
    // })

    // const cooldownTimer = ui.View({
    //   children: [
    //     ui.Image({
    //       source: ImageSource.fromTextureAsset(this.props.icn_clock!),
    //       style: {
    //         width: 40,
    //         height: 40,
    //         marginLeft: 20,
    //       }
    //     }),
    //     ui.Text({
    //       text: this.cooldownTimerText,
    //       style: {
    //         fontSize: 28,
    //         fontFamily: 'Roboto',
    //         color: '#415369',
    //         textAlign: 'center',
    //         fontWeight: '700',
    //         width: 310
    //       }
    //     }),
    //   ],
    //   style: {
    //     flexDirection: 'row',
    //     alignItems: 'center',
    //     justifyContent: 'center',
    //     borderRadius: 12,
    //     backgroundColor: '#E8F4FF',
    //     marginTop: 4,
    //     borderColor: '#B0D1ED',
    //     borderWidth: 4
    //   }
    // })

    return ui.View({//Root Panel + Panel Background Image
      children: [
        this.getRegionLabelView(),
        //locationTextView,
        View({
          children: [
            this.getPunchcardView(),
            this.getRecommendationsView(),
          ],
          style: {
            opacity: this.showZoneItems,
            flexShrink: 0,
            alignItems: "center",
            alignContent: "center",
            alignSelf: "center",
          }
        }),
        //ui.UINode.if(this.showZoneItems, ui.UINode.if(this.showTimer, cooldownTimer, undefined)),
        this.getShovelLevelNotificationView(),
        this.regionCompleteFanfare(),
        //ui.UINode.if(this.showZoneItems, ui.UINode.if(this.panelOpen, openCloseButton)),
        //ui.UINode.if(this.showZoneItems, ui.UINode.if(this.zoneCompleted, ui.UINode.if(this.rewardClaimed, undefined, claimRewardButton))),
      ],
      style: {
        position: "absolute",
        justifyContent: "flex-start", // Align vertical to the bottom
        alignContent: "center",
        alignSelf: "center",
        alignItems: "center", // Align horizontal to the middle
        opacity: this.punchcardVisibleScale.interpolate([0, 1], [0, 1]),
        top: this.hudElementVisible.interpolate(["-100%", "4%"]),
      }
    })
  }
}
