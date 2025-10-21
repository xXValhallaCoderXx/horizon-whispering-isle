/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_ExpEvents } from "BigBox_ExpEvents";
import { BigBox_Player_Inventory } from "BigBox_Player_Inventory";
import { BigBox_ToastEvents } from "BigBox_ToastManager";
import { Debug } from "Debug";
import { DigZoneManager } from "DigZoneManager";
import { ItemFlags } from "Enums";
import { DigStartPayload, Events } from "Events";
import { OverTime } from "GameUtils";
import { AudibilityMode, AudioGizmo, Component, Entity, ParticleGizmo, Player, PropTypes, Quaternion, Vec3 } from "horizon/core";
import { ItemContainer } from "ItemContainer";
import { ItemData } from "ItemData";
import { ItemModifiers, ItemUtils } from "ItemUtils";
import { Logger } from "Logger";
import { LootPityManager } from "LootPityManager";
import { clamp01, lerp } from "MathUtils";
import { PlayerCatalogManager } from "PlayerCatalogManager";
import { PlayerData } from "PlayerData";
import { IPlayerEnterExitWorldListener, PlayerService } from "PlayerService";
import { PotionBuffType, PotionData } from "PotionData";
import { ShinySpotWorldData } from "ShinySpotWorldData";
import { Shovel } from "Shovel";
import { ShovelAbilityType, ShovelData, ShovelLevelData } from "ShovelData";
import { ShovelProgressionManager } from "ShovelProgressionManager";
import { ShovelUpDebug } from "ShovelUpDebug";
import { Analytics } from "TurboAnalytics";
import { TutorialProgress } from "TutorialManager";

const log = new Logger("DigManager");
const LUCK_BASE = 0;
const LUCK_MULTIPLIER = 1;
const DIG_COUNT_PER_MUTATION = 10;
const ITEM_MUTATION_CHANCE = .1;
const ITEM_MUTATION_CHANCE_COOLDOWN = 6;
export const DISCOVER_COUNT_PER_GEM = 3;
export const DIGSTREAK_AMOUNT = 5;

// Set to true to get a simulation of a bunch of digs + logging for weights/percentage chance of getting items
const SIMULATE_DIG = false;
const SIMULATE_DIG_AMOUNT = 1000;

const USE_REGION_PITY = false

type DigData = {
  itemMods?: ItemModifiers,
  discoverCount: number,
  mutationDigCount: number,
  gemReward: number,
  xpReward: number,
}

enum MutationRollStyle {
  Periodic,
  Chance,
  ChanceWithCooldown
}

/**
 * Server-Only: 1 exists in the world.
 * Contains info about all the items and decides which item a player should dig.
 */
export class DigManager extends Component<typeof DigManager> implements IPlayerEnterExitWorldListener {
  static propsDefinition = {
    forceRarity: { type: PropTypes.Number, default: ItemUtils.INVALID_INDEX }, // For Testing only
    forceMutation: { type: PropTypes.String, default: "" }, // For Testing only
    forceItemId: { type: PropTypes.String, default: ItemUtils.INVALID_ID }, // For Testing only
    firstItemId: { type: PropTypes.String, default: "boot001" }, // if the player has not finished the tutorial, they will only be able to dig up this item
    groundDustFx: { type: PropTypes.Entity }, // TODO(kaden): Need 1 ground dust per person!!
    serverItemContainer: { type: PropTypes.Entity }, // Reference to the server-side copy of the item container
    digBeginSfx: { type: PropTypes.Entity },
    digProgressSfx: { type: PropTypes.Entity },
    digFailSfx: { type: PropTypes.Entity },
    dirtRumbleSfx: { type: PropTypes.Entity },
    digZoneManager: { type: PropTypes.Entity },
    lootPityManager: { type: PropTypes.Entity },
    minimumRarityForToast: { type: PropTypes.Number, default: 3 },
    moundRoot: { type: PropTypes.Entity },
  };

  // Singleton
  private static _instance: DigManager | null;
  public static get instance(): DigManager { return this._instance!; }

  // Data
  public playerDigData = new Map<Player, DigData>();

  private digZoneManager!: DigZoneManager
  private lootPityManager!: LootPityManager
  private moundStartOffsetY: number = -0.15; // How much it should be offset from the surface as a buffer
  private moundRaiseY: number = 0.45; // Total distance the mound will raise
  private overTime = new OverTime(this);
  private mutationRollStlye = MutationRollStyle.ChanceWithCooldown;
  private forceRarity = -1;
  private forceMutation = "";
  private shouldSkipShinyCheck: Player[] = [];
  private playerMounds = new Map<Player, Entity>();
  private playerToItemImageEntity = new Map<Player, Entity>();
  private playerToShinySpot = new Map<Player, ShinySpotWorldData | undefined>();
  private digMounds: Entity[] = [];

  // Config the mound
  private readonly totalDuration: number = 2;
  private readonly delay: number = 0.2; // Time before starting the mound movement
  private readonly animDuration: number = this.totalDuration - this.delay; // How much of the duration is actual movement
  private readonly shakeCycles = 5; // Total number of rotation "shakes" to occur during the raising animation
  private readonly freq: number = 2 * Math.PI * this.shakeCycles; // Garuntee the number of shakes per sine/cosine cycle
  private readonly amp: number = 3; // Degrees to rotate/shake while rising
  private readonly ampY: number = 10; // Degrees to rotate/shake while rising around the Y axis

  private zoneLevel = 1;

  private playersInShinyZone = new Map<Player, ShinySpotWorldData[]>(); // maps player -> ShinySpot

  preStart() {
    DigManager._instance = this;
  }

  start() {
    this.digZoneManager = this.props.digZoneManager?.getComponents(DigZoneManager)[0]!
    this.lootPityManager = this.props.lootPityManager?.getComponents(LootPityManager)[0]!
    this.forceRarity = this.props.forceRarity;
    this.forceMutation = this.props.forceMutation;
    this.digMounds = this.props.moundRoot?.children.get() ?? [];

    // Connect event for player started digging
    this.connectNetworkBroadcastEvent(Events.playerStartDig, (data) => {
      const player = data.player;
      if (player) {
        log.info(`[${player.id}] Start Dig`);

        const digData = this.playerDigData.get(player);
        let mound = this.getPlayerMound(player);
        if (digData !== undefined && mound !== undefined) {
          // Check their equipped shovel to decide their reward
          log.info(`[${player.id}] Move mound to ${data.digPosition}`);
          let footPos = PlayerService.getPlayerFootPosition(player);

          mound.visible.set(true);
          mound.collidable.set(true);

          let moundStartPos = new Vec3(data.digPosition.x, footPos.y + this.moundStartOffsetY, data.digPosition.z);
          let moundEndPos = new Vec3(moundStartPos.x, moundStartPos.y + this.moundRaiseY, moundStartPos.z);

          let shovelData: ShovelData | undefined = ShovelProgressionManager.instance.getShovelDataForPlayer(player);
          let shovelLevelData: ShovelLevelData | undefined = ShovelProgressionManager.instance.getShovelLevelDataForPlayer(player);

          let lowerConstraint = 0;
          if (SIMULATE_DIG) {
            data.minigameChanceScale = 1;
            let simulatedItemIds: string[] = [];
            let simulatedRarities: number[] = [];
            for (let i = 0; i < SIMULATE_DIG_AMOUNT; i++) {
              let simulatedItem = this.getItem(data, shovelData, shovelLevelData, i === 0);
              simulatedItemIds.push(simulatedItem.id);
              simulatedRarities.push(simulatedItem.rarity);
            }
            // !! Leave as console.log so that we only need to change SIMULATE_DIG variable to see results !!
            console.log(`DIG SIMULATION RESULTS: Luck: ${data.minigameChanceScale}\n${simulatedItemIds}\n${simulatedRarities}`);
          }

          const chosenItem = this.getItem(data, shovelData, shovelLevelData);
          if (!chosenItem) {
            return;
          }
          const itemId = chosenItem.id;
          let weight: number = this.getConstrainedBiasedNumber(chosenItem.minWeight, chosenItem.maxWeight, lowerConstraint, 1); // TODO(kaden): Better logic for determining item weight?
          let weightBonus = 0;
          shovelData?.abilities.forEach((ability) => {
            if (ability.type === ShovelAbilityType.WeightMod && ability.checkForApplication()) {
              weightBonus = Math.round(weight * ability.rollAbilityMod()) - weight;
            }
          })
          let xp: number = ItemUtils.RARITY_XP[chosenItem.rarity]
          let xpBonus = 0;
          shovelData?.abilities.forEach((ability) => {
            if (ability.type === ShovelAbilityType.XPMod && ability.checkForApplication()) {
              xpBonus = Math.round(xp * ability.rollAbilityMod()) - xp;
            }
          })

          digData.xpReward = xp + xpBonus;
          let gems = this.getPlayerGemReward(player, itemId);
          let gemBonus = 0;
          if (gems > 0) {
            gemBonus = this.getPlayerGemBonus(player, gems);
            if (gemBonus > 0) {
              gems = gemBonus
            }
          }
          digData.gemReward = gems;
          // store the modifiers
          let modifiers = new ItemModifiers()
          digData.itemMods = modifiers;
          modifiers.weight = weight + weightBonus;
          const discoverCount = digData.discoverCount = PlayerCatalogManager.getItemDiscoverCount(player, itemId);
          let mutation = modifiers.mutation = this.forceMutation.length > 0 ? this.forceMutation : this.shouldMutate(player) ? this.getMutation() : "";
          if (mutation === "") {
            shovelData?.abilities.forEach((ability) => {
              if (ability.type === ShovelAbilityType.MutationChance && ability.checkForApplication()) {
                mutation = ability.abilityKey
                return
              }
            })
          }

          let itemFlags = this.getItemFlags(player, itemId, weight);

          const location = moundStartPos;
          const island = PlayerData.getLastIslandVisited(player);
          const shovelId = shovelData?.id ?? "";
          this.sendNetworkBroadcastEvent(Events.itemSelected, { // On the server broadcasting down to the specific player to tell them what they're about to dig up
            player,
            itemId,
            location,
            weight,
            weightBonus,
            xp,
            xpBonus,
            gems,
            gemBonus,
            mutation,
            itemFlags,
            discoverCount,
            island,
            shovelId,
          }, [this.world.getServerPlayer(), player]);

          // Use up potions
          const selectedPotions = PlayerData.getSelectedPotions(player);
          selectedPotions.forEach(potion => {
            BigBox_Player_Inventory.instance.usePotion(player, potion.id);
          });

          // Position mound start
          const weightMult = lerp(0.5, 3, clamp01(weight * 0.001));
          mound.scale.set(new Vec3(weightMult, weightMult, weightMult));
          mound.position.set(moundStartPos);

          moundEndPos.y += 0.01 * weightMult; // Larger mounds need to start higher up

          this.props.dirtRumbleSfx?.position.set(moundStartPos)
          this.props.dirtRumbleSfx?.as(AudioGizmo).play();

          // Note: You need at least some delay for some reason, otherwise it flickers like crazy
          this.async.setTimeout(() => {
            // Rise up over time
            this.overTime.moveTo(
              mound!,
              moundEndPos,
              this.animDuration,
              {
                onComplete: (info: { wasCanceled: boolean }) => {
                  this.props.groundDustFx!.position.set(moundStartPos);
                  this.props.groundDustFx!.as(ParticleGizmo).play();
                },
                onTick: (t: number) => {
                  mound?.rotation.set(Quaternion.fromEuler(new Vec3(
                    Math.cos(t * this.freq) * this.amp,
                    Math.sin(t * this.freq) * this.ampY,
                    Math.sin(t * this.freq) * this.amp
                  )));
                }
              }
            );
          }, this.delay * 1000);
        }
      }
      else {
        log.warn(`DigManager: Player not found`);
      }
    });

    this.connectNetworkBroadcastEvent(Events.playerDigProgress, (data: { player: Player, progress01: number, itemId: string }) => {
      const player = data.player;
      if (player && data.progress01 < 1) { // Don't run this if finished, dig complete will handle that
        log.info(`DigManager: Player ${player.id} Dig Progress`);

        let mound = this.playerMounds.get(player);
        if (mound) {
          // You dusty
          const moundPos = mound.position.get()
          this.props.groundDustFx!.position.set(moundPos);
          this.props.groundDustFx!.as(ParticleGizmo).play();
          this.props.digProgressSfx?.position.set(moundPos)
          this.props.digProgressSfx?.as(AudioGizmo).play();

          const shakeReduction = 0.25; // Shake less as intensely for dig progress

          // Rise up over time
          this.overTime.moveTo(
            mound,
            mound.position.get(), // TODO(kaden): TEMP hack to make a lerp over time
            this.animDuration * shakeReduction,
            {
              onComplete: (info: { wasCanceled: boolean }) => {
                // shake complete
              },
              onTick: (t: number) => {
                mound?.rotation.set(Quaternion.fromEuler(new Vec3(
                  Math.cos(t * this.freq * shakeReduction) * this.amp * shakeReduction,
                  Math.sin(t * this.freq * shakeReduction) * this.ampY * shakeReduction,
                  Math.sin(t * this.freq * shakeReduction) * this.amp * shakeReduction
                )));
              }
            }
          );
        }
      }
    });

    this.connectNetworkBroadcastEvent(Events.playerDigComplete, (data: { player: Player, isSuccess: boolean, itemId: string }) => {
      const player = data.player;
      if (player) {
        log.info(`DigManager: Player ${player.id} Dig Complete`);

        // Send toast to all players that we dug up something rare!
        let itemData = ItemContainer.localInstance.getItemDataForId(data.itemId)!;
        if (itemData === undefined) {
          return;
        }
        let rarity = itemData.rarity;
        const digData = this.playerDigData.get(player);
        if (data.isSuccess) {
          switch (this.mutationRollStlye) {
            case MutationRollStyle.Periodic:
            case MutationRollStyle.ChanceWithCooldown:
              if (digData) {
                digData.mutationDigCount++;
              }
              break;
          }
          this.incrementDigStreak(player);
          let itemGems = digData?.gemReward ?? 0;
          let itemXp = digData?.xpReward ?? 0;
          if (itemGems > 0) {
            PlayerData.addGems(player, itemGems, false);
          }
          if (itemXp > 0) {
            this.sendLocalBroadcastEvent(BigBox_ExpEvents.addExpToPlayer, { player, exp: itemXp, showToast: false, updateUI: false });
          }
          const itemWeight = digData?.itemMods?.weight;
          Analytics()?.sendRewardsEarned({ player, rewardsType: `item,${data.itemId}`, rewardsEarned: itemWeight || -1 });
          if (this.props.minimumRarityForToast <= rarity) {
            let players = this.world.getPlayers();

            let color = ItemUtils.RARITY_HEX_COLORS[rarity];

            this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToastWithColor, {
              text: `${PlayerService.getPlayerName(player)} has dug up a ${itemData.name}!`,
              color: color
            }, players)
          }
        }
        else {
          PlayerData.resetDigStreak(player);
        }

        let mound = this.playerMounds.get(player);
        if (mound !== undefined) {
          if (data.isSuccess) {
            this.props.digProgressSfx?.position.set(PlayerService.getPlayerPosition(player))
            this.props.digProgressSfx?.as(AudioGizmo).play();
          } else {
            this.props.digFailSfx?.as(AudioGizmo).play({ players: [player], fade: 0, audibilityMode: AudibilityMode.AudibleTo });
          }

          // Put that thing back where it came from
          const moundPosition = mound.position.get();
          let moundEndPos = new Vec3(moundPosition.x, moundPosition.y - this.moundRaiseY, moundPosition.z);

          // You dusty
          this.props.groundDustFx!.position.set(moundPosition);
          this.props.groundDustFx!.as(ParticleGizmo).play();
          this.props.dirtRumbleSfx?.position.set(moundPosition)
          this.props.dirtRumbleSfx?.as(AudioGizmo).play();

          // Note: You need at least some delay for some reason, otherwise it flickers like crazy
          this.async.setTimeout(() => {
            // Rise up over time
            this.overTime.moveTo(
              mound!,
              moundEndPos,
              0.5,
              {
                onComplete: (info: { wasCanceled: boolean }) => {
                  // he has fallen
                  if (!info.wasCanceled) {
                    mound!.visible.set(false);
                    mound!.collidable.set(false);
                  }
                },
                onTick: (t: number) => {
                  mound!.rotation.set(Quaternion.fromEuler(new Vec3(
                    Math.cos(t * this.freq) * this.amp,
                    Math.sin(t * this.freq) * this.ampY,
                    Math.sin(t * this.freq) * this.amp
                  )));
                }
              }
            );
          }, 10);
        }
      }
      else {
        log.warn(`DigManager: Player not found`);
      }
    });

    this.connectNetworkBroadcastEvent(DigZoneManager.sendZoneId, (payload) => {
      this.zoneLevel = payload.data.level;
      log.info(`Zone Level for ${payload.data.id}: ${this.zoneLevel}`)
    });

    this.connectNetworkBroadcastEvent(Events.canDig, (player) => {
      let canDig = true;

      if (canDig && BigBox_Player_Inventory.instance!.isInventoryFull(player)) {
        canDig = false;
        this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
          player,
          text: 'You cannot dig because your backpack is full.'
        }, [player])
        Analytics()?.sendFrictionHit({ player, frictionItemKey: 'dig_blocked_backpack_full' });
        this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
          player,
          text: 'Sell your items to Rufus to make room!'
        }, [player])
      }

      const shinySpot = this.getClosestShinySpot(player);
      if (canDig && !this.shouldPlayerSkipShinyCheck(player)) {
        const { meetsRequirements, message } = this.doesPlayerMeetRequirementsForShinySpot(player, shinySpot);
        if (!meetsRequirements) {
          canDig = false;
          this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
            player,
            text: message
          }, [player]);
        }
      }

      this.playerToShinySpot.set(player, shinySpot);
      if (shinySpot !== undefined) {
        shinySpot.setPlayerDigging(true);
      }
      const shinySpotItem = shinySpot?.itemId ?? "";
      const suggestedPotionId = this.getSuggestedPotionId(player, shinySpot);
      const starRequirement = shinySpot ? shinySpot.starRequirement : 1;
      this.setShinySpotItemImageForPlayer(player, shinySpotItem);
      const baseChance = shinySpot ? shinySpot.getPercentage(false) : 0;
      this.sendNetworkBroadcastEvent(Events.canDigResponse, { canDig, suggestedPotionId, starRequirement, shinySpotItem, baseChance }, [player]);
    });

    this.connectNetworkBroadcastEvent(Events.setMinigameItemIconEntity, (data) => this.playerToItemImageEntity.set(data.player, data.entity));

    PlayerService.connectPlayerEnterExitWorldListener(this);

    if (ItemContainer.localInstance) {
      this.addDebugCommands();
    } else {
      this.connectLocalBroadcastEvent(ItemContainer.itemDataLoadComplete, () => this.addDebugCommands());
    }
  }

  private incrementDigStreak(player: Player) {
    PlayerData.startBatch();
    const streakCount = PlayerData.incrementDigStreak(player);
    if ((streakCount % DIGSTREAK_AMOUNT) === 0) {
      let streakGems = 1
      let shovelData = ShovelProgressionManager.instance.getShovelDataForPlayer(player)
      if (shovelData) {
        shovelData.abilities.forEach((ability) => {
          if (ability.type === ShovelAbilityType.GemMod && ability.checkForApplication()) {
            let roll = ability.rollAbilityMod()
            streakGems = Math.floor(roll * streakGems)
          }
        })
      }
      PlayerData.addGems(player, streakGems, false);
    }
    PlayerData.endBatch();
  }

  private setShinySpotItemImageForPlayer(player: Player, shinySpotItem: string) {
    if (!shinySpotItem) {
      return;
    }
    const itemImage = this.playerToItemImageEntity.get(player)!
    if (!itemImage) {
      return;
    }
    ItemContainer.localInstance.setItemTextureOnEntity(shinySpotItem, itemImage);
  }

  private addDebugCommands() {
    Debug.addCommand(`Dig/Force Rarity/CLEAR`, (player) => this.forceRarity = -1);
    for (let rarity = 0; rarity < 6; ++rarity) {
      Debug.addCommand(`Dig/Force Rarity/${ItemUtils.RARITY_TEXT[rarity]}`, (player) => this.forceRarity = rarity);
    }
    Debug.addCommand(`Dig/Force Mutation/CLEAR`, (player) => this.forceMutation = "");
    ItemContainer.localInstance.allMutations.forEach((mutation) => {
      Debug.addCommand(`Dig/Force Mutation/${mutation.name}`, (player) => this.forceMutation = mutation.id);
    });
    Debug.addCommand("Dig/Dig Results/Standard", (player) => ShovelUpDebug.giveItem(this, player, "boot001"));
    Debug.addCommand("Dig/Dig Results/Crit Bonuses/Gem Bonus", (player) => ShovelUpDebug.giveItem(this, player, "boot001", undefined, "shovel_trusty", true));
    Debug.addCommand("Dig/Dig Results/Crit Bonuses/XP Bonus", (player) => ShovelUpDebug.giveItem(this, player, "boot001", undefined, "shovel_wisdom"));
    Debug.addCommand("Dig/Dig Results/Crit Bonuses/Weight Bonus", (player) => ShovelUpDebug.giveItem(this, player, "boot001", undefined, "shovel_inflate"));
    Debug.addCommand("Dig/Dig Results/Crit Bonuses/Category Bonus", (player) => ShovelUpDebug.giveItem(this, player, "pizza001", undefined, "shovel_pizza"));
    Debug.addCommand("Dig/Dig Results/Mutations/Hot", (player) => ShovelUpDebug.giveItem(this, player, "boot001", "hot"));
    Debug.addCommand("Dig/Dig Results/Mutations/Spooky", (player) => ShovelUpDebug.giveItem(this, player, "boot001", "spooky"));
    Debug.addCommand("Dig/Dig Results/Mutations/Evil", (player) => ShovelUpDebug.giveItem(this, player, "boot001", "evil"));
    Debug.addCommand("Dig/Dig Results/Mutations/Sparkly", (player) => ShovelUpDebug.giveItem(this, player, "boot001", "sparkly"));
    Debug.addCommand("Dig/Dig Results/Mutations/Frosty", (player) => ShovelUpDebug.giveItem(this, player, "boot001", "frosty"));
  }

  private getSuggestedPotionId(player: Player, shinySpot: ShinySpotWorldData | undefined): string {
    if (!(BigBox_Player_Inventory.instance?.hasPotions(player) ?? false)) {
      return "";
    }
    if (PlayerData.getSelectedPotions(player).length > 0) {
      return "";
    }
    if (shinySpot === undefined) {
      return "";
    }
    const itemId = shinySpot.itemId;
    const item = ItemContainer.localInstance.getItemDataForId(itemId);
    if (item === undefined) {
      return "";
    }
    if (!PlayerData.canSuggestionPotion(player)) {
      return "";
    }
    let result = "";
    let resultMinigameBoost = 0;
    const availablePotions = BigBox_Player_Inventory.instance?.getPlayerPotions(player) ?? [];
    availablePotions.forEach((potion) => {
      const potionTuning = PotionData.getPotionTuning(potion);
      const minigameBoost = potionTuning?.minigameBoost ?? 0;
      if (minigameBoost > resultMinigameBoost) {
        result = potion;
        resultMinigameBoost = minigameBoost
      }
    });
    log.info(`suggested potion: ${result}`);
    PlayerData.resetPotionSuggestionCooldown(player);
    return result;
  }

  private shouldMutate(player: Player) {
    const digData = this.playerDigData.get(player);

    switch (this.mutationRollStlye) {
      case MutationRollStyle.Chance:
        return Math.random() <= ITEM_MUTATION_CHANCE;
      case MutationRollStyle.Periodic:
        if (digData && digData.mutationDigCount === DIG_COUNT_PER_MUTATION) {
          digData.mutationDigCount = 0;
          return true;
        }
        break;
      case MutationRollStyle.ChanceWithCooldown:
        if (digData && digData.mutationDigCount >= ITEM_MUTATION_CHANCE_COOLDOWN && Math.random() <= ITEM_MUTATION_CHANCE) {
          digData.mutationDigCount = 0;
          return true;
        }
    }

    if (PlayerData.getLifetimeDigs(player) === 2) {
      return true; // always mutate third item player has ever dug up
    }

    return false;
  }

  private getMutation(): string {
    return ItemContainer.localInstance.randomMutation() ?? "";
  }

  private getPlayerGemReward(player: Player, itemId: string): number {
    const discoverCount = PlayerCatalogManager.getItemDiscoverCount(player, itemId);
    const earnedGem = discoverCount > 0 && (discoverCount + 1) % DISCOVER_COUNT_PER_GEM === 0;
    let gemCount = 0
    if (earnedGem) {
      gemCount = 1
      log.info(`Player ${player.id} earned a gem for discovering ${itemId} ${discoverCount} times!`)
    } else {
      log.info(`Player ${player.id} DID NOT earned a gem for discovering ${itemId} ${discoverCount} times!`)
    }
    return gemCount
  }

  private getPlayerGemBonus(player: Player, initial: number): number {
    let gemCount = 0;
    let shovelData = ShovelProgressionManager.instance.getShovelDataForPlayer(player)
    if (shovelData) {
      shovelData.abilities.forEach((ability) => {
        if (ability.type === ShovelAbilityType.GemMod && ability.checkForApplication()) {
          let roll = ability.rollAbilityMod()
          gemCount = Math.floor(roll * initial)
        }
      })
    }
    return gemCount;
  }

  onPlayerEnterWorld(player: Player): void {
    this.playerDigData.set(player, { discoverCount: 0, mutationDigCount: 0, gemReward: 0, xpReward: 0 });
    const mound = this.digMounds.shift();
    if (mound === undefined) {
      log.error(`No more mounds to give to player ${PlayerService.getPlayerName(player)}`);
      return;
    }
    this.playerMounds.set(player, mound);
  }

  onPlayerExitWorld(player: Player): void {
    this.playerDigData.delete(player);
    const mound = this.playerMounds.get(player);
    if (mound !== undefined) {
      this.digMounds.push(mound);
    }
    this.playerMounds.delete(player);
  }

  private getItemFlags(player: Player, id: string, weight: number): ItemFlags {
    return PlayerCatalogManager.getItemFlags(player, id, weight);
  }

  private getItem(digData: DigStartPayload, shovelData: ShovelData | undefined, shovelLevelData: ShovelLevelData | undefined, logWeights: boolean = false): ItemData {
    if (this.props.forceItemId !== ItemUtils.INVALID_ID) {
      // force item id and early escape
      return ItemContainer.localInstance.getItemDataForId(this.props.forceItemId)!
    }

    const player = digData.player;
    if (PlayerData.getTutorialComplete(player) < TutorialProgress.COMPLETED_MINIGAME) {
      PlayerData.setTutorialComplete(player, TutorialProgress.COMPLETED_MINIGAME)
      // force first dig to always be this item
      return ItemContainer.localInstance.getItemDataForId(this.props.firstItemId!)!;
    }

    let dropTable = this.digZoneManager.getIslandDropTable(PlayerData.getLastIslandVisited(player))

    // Get categories and items we're forming the table from
    if (this.digZoneManager.excludeBaseItems(player)) {
      dropTable = [];

      // // Get categories and items we're forming the table from
      const zoneSpecificItemIds = this.digZoneManager.getZoneCategoriesAndItemsForPlayer(player)

      zoneSpecificItemIds.forEach((itemId) => { // add any zone unique items to the drop table if player is in that zone
        const item = ItemContainer.localInstance.getItemDataForId(itemId)
        if (item) {
          dropTable.push(item)
        }
        else {
          log.error('No item with id ' + itemId)
        }
      })
    }

    let shovelId = shovelData ? shovelData.id : ItemUtils.INVALID_ID
    let baseShovelId = shovelData?.baseShovel && shovelData?.baseShovel.length > 0 ? shovelData.baseShovel : shovelId;

    const shinySpot = this.playerToShinySpot.get(player);
    if (shinySpot !== undefined && shinySpot.player === player && shinySpot.isPlayerOnSpot()) {
      const shinySpotItemId = shinySpot.itemId;
      const shinySpotItem = ItemContainer.localInstance.getItemDataForId(shinySpotItemId)
      if (shinySpotItem) {
        // Check if shovel requirement is met - technically this should always be true
        // because we don't allow the player to dig if they don't have the right shovel
        if (!shinySpotItem.requiredShovels || shinySpotItem.requiredShovels.length === 0 || shinySpotItem.requiredShovels.includes(baseShovelId)) {
          const filterForItem = shinySpot.rollForItem(digData.minigameChanceScale);

          // Either we get the item that the shiny spot is for, or we get a random item from the generic loot table
          if (filterForItem) {
            const item = ItemContainer.localInstance.getItemDataForId(shinySpotItemId)
            if (item) {
              dropTable = [item];
            }
            else {
              log.error('No item with id ' + shinySpotItemId)
            }
          }
        }
        else {
          log.error('Shiny spot item ' + shinySpotItemId + ' requires shovel ' + shinySpotItem.requiredShovels + ' but player has ' + baseShovelId);
        }
      }
    }
    // Filter out items with shovel requirements that are not met
    dropTable = dropTable.filter((item) => !item.requiredShovels || item.requiredShovels.length === 0 || item.requiredShovels.includes(baseShovelId))

    dropTable = this.fliterForQuestPity(player, dropTable);

    let shovelLevel = 1;
    if (shovelData) {
      // shovel level currently is 0 indexed while region level is 1 indexed
      shovelLevel = ShovelProgressionManager.instance.getShovelLevel(player, shovelData.id) + 1;
    }

    // Calculate present rarities
    let baseWeighting = ItemUtils.getWeightedRarityWithLuck(0, 0, 0)//shovelLevel, this.zoneLevel);
    if (this.forceRarity !== -1) {
      for (let i = 0; i < 6; ++i) {
        baseWeighting[i] = i === this.forceRarity ? 1 : 0;
      }
    }

    if (logWeights) {
      this.logRarityWeights(`Base ${shovelLevel} Shovel ${this.zoneLevel} Zone`, baseWeighting);
    }

    // Calculate present rarities
    let rarityWeighting = ItemUtils.getWeightedRarityWithLuck(digData.minigameChanceScale, 0, 0)//shovelLevel, this.zoneLevel);

    if (logWeights) {
      this.logRarityWeights(`${digData.minigameChanceScale} Luck`, rarityWeighting);
    }

    const activePotions = PlayerData.getSelectedPotions(player);
    let categoryBonuses = new Map<string, number>(); // map from category to buffValue
    for (let i = 0; i < activePotions.length; i++) {
      const activePotionTuning = PotionData.getPotionTuning(activePotions[i].id);
      let rarityToBoost = undefined;

      if (activePotionTuning?.buffType === PotionBuffType.Category) {
        categoryBonuses.set(activePotionTuning.buffId, activePotionTuning.buffValue[0]);
      }
      else if (activePotionTuning?.buffType === PotionBuffType.Rarity) {
        rarityToBoost = parseFloat(activePotionTuning.buffId);
      }

      // Rarity targeting potion boost
      if (rarityToBoost) {
        rarityWeighting = this.increaseWeightsByPercent(rarityWeighting, activePotionTuning!.buffValue);
      }
    }

    if (logWeights) {
      this.logRarityWeights("Potion/Final", rarityWeighting);
    }

    let itemWeights = this.getItemWeightingFromRarity(dropTable, rarityWeighting);

    if (logWeights) {
      this.logItemWeights("Initial ItemData", itemWeights, dropTable);
    }

    // for (let i = 0; i < dropTable.length; i++) {
    //   // TODO: none of these are adjusted with new weightings, please tune
    //   let item = dropTable[i]
    //   let bias = itemWeights[i]
    //   // if (item.category === shovelData!.categoryToBias) {
    //   //   bias += shovelData!.biasWeight
    //   // }
    //   // if (item.id === shovelData!.itemToBias) {
    //   //   bias += shovelData!.biasWeight
    //   // }

    //   // bias += this.lootPityManager.getPlayerPityWeight(player, item.category) // get additional pity weights for category + id
    //   // bias += this.lootPityManager.getPlayerPityWeight(player, item.id)

    //   if (categoryBonuses.has(item.category)) {
    //     bias *= categoryBonuses.get(item.category)!; // if category bonus is defined, activePotionTuning will also be defined
    //   }

    //   itemWeights[i] = bias
    // }

    if (shovelData!.categoryToBias !== "") {
      let filteredCategory = this.filterAndRollForCategory(itemWeights, dropTable, rarityWeighting, shovelData!.categoryToBias, shovelData!.biasWeight, logWeights);
      itemWeights = filteredCategory.weights;
      dropTable = filteredCategory.items;
    }
    else if (logWeights) {
      console.log("No category to bias for " + shovelData?.id)
    }

    if (logWeights) {
      this.logItemWeights("Final ItemData", itemWeights, dropTable);
    }

    const randomIndex = ItemUtils.getWeightedRandomIndex(itemWeights);

    let chosenItem = dropTable[randomIndex]

    if (USE_REGION_PITY) {
      chosenItem = this.lootPityManager.getItemFromRegionPity(player, chosenItem, dropTable) ?? chosenItem
    }

    return chosenItem
  }

  private fliterForQuestPity(player: Player, items: ItemData[]): ItemData[] {
    if (this.lootPityManager.isMaxPity(player)) {
      let objective = this.lootPityManager.getPlayerObjective(player)
      let tempItem = ItemContainer.localInstance.getItemDataForId(objective)
      if (tempItem) {
        // Only filter if the item is in the table
        if (items.includes(tempItem)) {
          return [tempItem];
        } else {
          return items;
        }
      }
      else {
        // Only filter if category exists in the table
        let itemCategoryFilter = items.filter(item => item.category === objective);
        return itemCategoryFilter.length > 0
          ? itemCategoryFilter
          : items;
      }
    }
    else {
      return items;
    }
  }

  private logRarityWeights(title: string, rarityWeights: number[]) {
    // Logging for weights
    const loggingWeights = rarityWeights.map((rarity, index) => `${index}: ${rarityWeights[index]}`).join(', ');
    // !! Leave as console.log so that we only need to change SIMULATE_DIG variable to see results !!
    console.log(`${title} Rarity Weight: ${loggingWeights}`);
    // Calculate and print the percentage chance of each rarity in one line
    const totalWeight = rarityWeights.reduce((acc, weight) => acc + weight, 0);
    const rarityPercentages = rarityWeights.map(weight => (weight / totalWeight) * 100);
    const loggingPercentages = rarityWeights.map((_, index) => `${index}: ${rarityPercentages[index].toFixed(2)}%`).join(', ');
    // !! Leave as console.log so that we only need to change SIMULATE_DIG variable to see results !!
    console.log(`${title} Rarity Chance: ${loggingPercentages}`);

  }

  private logItemWeights(title: string, itemWeights: number[], items: ItemData[]) {
    // Logging for weights
    const loggingWeights = items.map((item, index) => `${item.name}: ${itemWeights[index]}`).join(', ');
    // !! Leave as console.log so that we only need to change SIMULATE_DIG variable to see results !!
    console.log(`${title} Item Weight: ${loggingWeights}`);
    // Calculate and print the percentage chance of getting each item in one line
    const totalWeight = itemWeights.reduce((acc, weight) => acc + weight, 0);
    const itemPercentages = itemWeights.map(weight => (weight / totalWeight) * 100);
    const loggingPercentages = items.map((item, index) => `${item.name}: ${itemPercentages[index].toFixed(2)}%`).join(', ');
    // !! Leave as console.log so that we only need to change SIMULATE_DIG variable to see results !!
    console.log(`${title} Item Chance: ${loggingPercentages}`);
  }

  private getConstrainedBiasedNumber(min: number, max: number, lowerConstraint: number, upperConstraint: number): number {
    // Generate a random number between 0 and 1
    const random = Math.random();

    // Apply a bias using exponential decay (squared to increase the bias)
    const biased = Math.pow(random, 2); // Adjust this exponent to tweak the bias

    // Apply constraints
    const constrained = lowerConstraint + (upperConstraint - lowerConstraint) * biased;

    // Scale the biased value to the desired range
    return Math.floor(min + (max - min) * constrained);
  }

  public setItemForEquip(player: Player, itemId: string, weight: number, mutation: string) {
    this.sendLocalBroadcastEvent(Events.itemSelectedForEquip, { player, itemId, weight, mutation });
  }

  public setItemForUnequip(player: Player, itemId: string) {
    this.sendLocalBroadcastEvent(Events.itemUnequip, { player, itemId });
  }

  private increaseWeightsByPercent(weights: number[], percent: number[]): number[] {
    const totalWeight = weights.reduce((acc, weight) => acc + weight, 0);
    for (let i = 0; i < weights.length; i++) {
      weights[i] += totalWeight * percent[i];
    }

    return weights;
  }

  private getItemWeightingFromRarity(items: ItemData[], rarityWeights: number[]): number[] {
    let itemWeighting = new Array(items.length).fill(0);

    // Calculate total weight for each rarity
    const rarityCount = rarityWeights.length;
    const rarityTotals = new Array(rarityCount).fill(0);
    items.forEach(item => {
      if (item === undefined) {
        return;
      }
      if (item.rarity < rarityCount) {
        rarityTotals[item.rarity]++;
      }
    });

    // Calculate weight for each item based on rarityWeights
    items.forEach((item, index) => {
      if (item === undefined) {
        return;
      }
      if (item.rarity < rarityCount && rarityTotals[item.rarity] > 0) {
        itemWeighting[index] = rarityWeights[item.rarity] / rarityTotals[item.rarity];
      }
    });

    return itemWeighting;
  }

  private filterAndRollForCategory(weights: number[], items: ItemData[], rarityWeights: number[], category: string, biasPercentage: number, logWeights: boolean): { weights: number[], items: ItemData[] } {
    // NOTE: Shovels actually only boost mythical items for a category and
    // not the whole category itself.
    const totalWeight = weights.reduce((acc, weight) => acc + weight, 0);
    const totalCategoryWeight = items.reduce((total, item, index) => {
      return (item.category === category && item.rarity === 5) ? total + weights[index] : total;
    }, 0);

    if (totalCategoryWeight <= 0) {
      return { weights: weights, items: items };
    }

    let percentage = Math.min(Math.max(totalCategoryWeight / totalWeight + biasPercentage / 100, 0), 1);
    const rolledCategory = Math.random() < percentage;
    let filteredItems = items;
    let filteredWeights = weights;
    if (rolledCategory) {
      filteredItems = items.filter(item => item.category === category && item.rarity === 5);
      filteredWeights = weights.filter((_, index) => items[index].category === category && items[index].rarity === 5);
    }
    else {
      filteredItems = items.filter(item => item.category !== category || item.rarity !== 5);
      filteredWeights = weights.filter((_, index) => items[index].category !== category || items[index].rarity !== 5);
    }

    // Recalculate weights based on rarity
    //const filteredWeights = this.getItemWeightingFromRarity(filteredItems, rarityWeights);

    if (logWeights) {
      console.log(`rolledCategory: ${rolledCategory} percentage: ${percentage} totalWeight: ${totalWeight} category: ${category} totalCategoryWeight: ${totalCategoryWeight} filteredItems: ${filteredItems.length} filteredWeights: ${filteredWeights.length}`);

    }
    // Implementation goes here
    return { weights: filteredWeights, items: filteredItems };
  }

  public setShinySpot(player: Player, shinySpot: ShinySpotWorldData, inside: boolean) {
    const shinySpots = this.playersInShinyZone.get(player) || [];
    const index = shinySpots.indexOf(shinySpot);

    if (inside) {
      if (index === -1) {
        shinySpots.push(shinySpot);
      }
    } else {
      if (index > -1) {
        shinySpots.splice(index, 1);
      }
    }

    this.playersInShinyZone.set(player, shinySpots);
  }

  public isPlayerInShinyZone(player: Player) {
    return this.playersInShinyZone.has(player);
  }

  public skipShinyCheck(player: Player, shouldSkip: boolean) {
    const index = this.shouldSkipShinyCheck.indexOf(player);
    const isSkipping = (index >= 0);
    log.info(`skip shiny check: ${shouldSkip} isSkipping: ${isSkipping}`);
    if (isSkipping === shouldSkip) {
      return;
    }
    if (shouldSkip) {
      this.shouldSkipShinyCheck.push(player);
      log.info("added player to skip shiny check");
    } else {
      log.info("removed player from skip shiny check");
      this.shouldSkipShinyCheck.splice(index, 1);
    }
  }

  private shouldPlayerSkipShinyCheck(player: Player) {
    const result = this.shouldSkipShinyCheck.indexOf(player) >= 0;
    //log.info("should player skip shiny check: " + result);
    return result;
  }

  private getClosestShinySpot(player: Player): ShinySpotWorldData | undefined {
    const shinySpots = this.playersInShinyZone.get(player) || [];
    if (shinySpots.length === 0) {
      return undefined;
    }

    let closestSpot: ShinySpotWorldData | undefined = undefined;
    let minDistance = Infinity;
    const playerPosition = PlayerService.getPlayerPosition(player);

    for (const spot of shinySpots) {
      const distance = playerPosition.distance(spot.position);
      if (distance < minDistance) {
        minDistance = distance;
        closestSpot = spot;
      }
    }
    return closestSpot;
  }

  private doesPlayerMeetRequirementsForShinySpot(player: Player, shinySpot: ShinySpotWorldData | undefined): { meetsRequirements: boolean, message: string } {
    if (!shinySpot) {
      Analytics()?.sendFrictionHit({ player, frictionItemKey: 'dig_blocked_no_shiny_spot' });
      return { meetsRequirements: false, message: "Stand on a shiny spot to dig!" };
    }

    log.info("shiny spot found: " + shinySpot?.id);

    const shinySpotItem = ItemContainer.localInstance.getItemDataForId(shinySpot.itemId);

    if (!shinySpotItem) {
      // Generic shiny spot
      return { meetsRequirements: true, message: "" };
    }

    let shovelData: ShovelData | undefined = ShovelProgressionManager.instance.getBaseShovelDataForPlayer(player);
    let shovelId = shovelData ? shovelData.id : ItemUtils.INVALID_ID;
    let meetsRequirements = !shinySpotItem.requiredShovels || shinySpotItem.requiredShovels.length === 0 || shinySpotItem.requiredShovels.includes(shovelId);
    let message = meetsRequirements ? "" : `Equip the ${Shovel.getData(shinySpotItem.requiredShovels, 0)!.name} Shovel to dig!`;

    if (meetsRequirements) {
      if (shinySpot.starRequirement > (ShovelProgressionManager.instance.getShovelLevel(player, shovelId) + 1)) {
        meetsRequirements = false;
        Analytics()?.sendFrictionHit({ player, frictionItemKey: 'dig_blocked_unqualified_shovel' });
        message = `Upgrade your shovel to ${shinySpot.starRequirement} stars to dig this item!`;
      }
    }
    return { meetsRequirements, message };
  }

  private getPlayerMound(player: Player): Entity | undefined {
    return this.playerMounds.get(player);
  }
}
Component.register(DigManager);
