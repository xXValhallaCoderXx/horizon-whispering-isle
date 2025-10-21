/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_ExpCurve } from "BigBox_ExpCurve";
import { BigBox_ExpManager } from "BigBox_ExpManager";
import { BigBox_Player_Inventory } from "BigBox_Player_Inventory";
import { BigBox_ToastEvents } from "BigBox_ToastManager";
import { Debug } from "Debug";
import { DialogManager } from "DialogManager";
import { DigZoneManager } from "DigZoneManager";
import { allHudElementTypes } from "Enums";
import { IGateAnimation } from "GateAnimation";
import { Component, Entity, LocalEvent, Player, PlayerVisibilityMode, PropTypes, SpawnPointGizmo, Vec3, World } from "horizon/core";
import { getIslandDisplayName, getIslandFromID, getIslandsUnlockedByGate, Islands } from "Islands";
import { IslandTeleportManager } from "IslandTeleportManager";
import { Logger } from "Logger";
import { NPC_Guide } from "NPC_Guide";
import { PlayerCatalogManager } from "PlayerCatalogManager";
import { PlayerData } from "PlayerData";
import { PlayerEffects } from "PlayerEffectsController";
import { IPlayerInteractionListener } from "PlayerInteractionController";
import { PlayerIslandData } from "PlayerIslandData";
import { IPlayerProximityListener } from "PlayerProximityController";
import { IPlayerEnterExitWorldListener, PlayerService } from "PlayerService";
import { QuestEvents, QuestManager } from "QuestManager";
import { UI_GateProgress } from "UI_GateProgress";
import { PopupDialogParams } from "UIView_PopupDialog";

const PLAYER_RADIUS = .5;
const PROXIMITY_BUFFER = 1;
const BARRIER_PUSH_EXTENSION = .1;

const log = new Logger('GateComponent');

enum GateVisualState {
  Open,
  Closed,
  Animating
}

export class GateComponent extends Component<typeof GateComponent> implements IPlayerEnterExitWorldListener, IPlayerInteractionListener, IPlayerProximityListener {
  static propsDefinition = {
    gateID: { type: PropTypes.String },
    island: { type: PropTypes.String },
    teleportZoneLength: { type: PropTypes.Number, default: 5 },
    openRoot: { type: PropTypes.Entity },
    closedRoot: { type: PropTypes.Entity },
    animatedRoot: { type: PropTypes.Entity },
    interactionTarget: { type: PropTypes.Entity },
    gateLeftSide: { type: PropTypes.Entity },
    gateRightSide: { type: PropTypes.Entity },
    requiredCatalogItems: { type: PropTypes.Number },
    requiredPlayerLevel: { type: PropTypes.Number },
    moneyCostToOpen: { type: PropTypes.Number },
    gemCostToOpen: { type: PropTypes.Number },
    completedRegionsToOpen: { type: PropTypes.Number },
    itemCostToOpen1ID: { type: PropTypes.String },
    itemCostToOpen1Count: { type: PropTypes.Number },
    itemCostToOpen2ID: { type: PropTypes.String },
    itemCostToOpen2Count: { type: PropTypes.Number },
    itemCostToOpen3ID: { type: PropTypes.String },
    itemCostToOpen3Count: { type: PropTypes.Number },
    gateProgressUi: { type: PropTypes.Entity },
    teleportPoint: { type: PropTypes.Entity },
  };

  private openEntities: Entity[] = [];
  private closedEntities: Entity[] = [];
  private animatedEntities: IGateAnimation[] = [];

  private island: Islands = Islands.BeachCamp;
  private gateNormal: Vec3 = new Vec3(0, 0, 0);
  private visualStateMap: Map<Player, { gateState: GateVisualState, meetsReqs: boolean, progress: string }> = new Map();
  private gateLength: number = 0;
  private playersInRange: Player[] = [];
  private gateVector: Vec3 = new Vec3(0, 0, 0);
  private leftSide: Vec3 = new Vec3(0, 0, 0);
  private rightSide: Vec3 = new Vec3(0, 0, 0);

  private progressUi!: UI_GateProgress

  static gateOpened = new LocalEvent<{ player: Player, gateID: string, island: Islands }>("gateOpened");

  start() {
    this.openEntities = this.props.openRoot!.children.get();
    this.closedEntities = this.props.closedRoot!.children.get();
    this.props.animatedRoot!.children.get().forEach(e => e.getComponents<IGateAnimation>().forEach(e => this.animatedEntities.push(e)));
    this.island = getIslandFromID(this.props.island)!;
    this.progressUi = this.props.gateProgressUi!.getComponents<UI_GateProgress>()[0]
    this.connectNetworkBroadcastEvent(PlayerCatalogManager.newItemDiscovered, (payload) => this.updateReqText(payload.player));
    this.connectNetworkBroadcastEvent(DigZoneManager.zoneComplete, (payload) => !payload.isRenew ? this.updateReqText(payload.player) : null);
    this.connectLocalBroadcastEvent(World.onUpdate, (payload) => this.update(payload.deltaTime));
    if (this.props.interactionTarget !== undefined) {
      PlayerService.interaction()?.connectListener(this.props.interactionTarget.position.get(), this);
    }
    PlayerService.connectPlayerEnterWorldListener(this);
    PlayerIslandData.init(this.world);
    this.setupBarrier();

    Debug.addCommand(`Gates/${getIslandDisplayName(this.props.island)}/${this.props.gateID}/Open`, (player) => {
      this.tryOpenGate(player, true);
    });
    Debug.addCommand(`Gates/${getIslandDisplayName(this.props.island)}/${this.props.gateID}/Close`, (player) => {
      PlayerIslandData.setGateClosed(player, this.island, this.props.gateID);
      this.setGateVisualState(player, GateVisualState.Closed);
    });
  }

  private update(deltaTime: number): void {
    for (const player of this.playersInRange) {
      const playerPosition = PlayerService.getPlayerPosition(player);
      const leftSideToPlayer = playerPosition.sub(this.leftSide);

      // Flatten all vectors to the XZ plane
      leftSideToPlayer.y = 0;

      // Project vector from left side to gate to the player onto the gateVector.
      const t = leftSideToPlayer.dot(this.gateVector) / (this.gateLength * this.gateLength);

      // If the projected vector endpoint is not along the gate, then the player is not colliding.
      if (t < 0 || t > 1) {
        continue;
      }

      const tNormal = leftSideToPlayer.dot(this.gateNormal);
      // push players that are within the player radius of the front of the gate and the teleport zone length behind the gate.
      if (tNormal < -this.props.teleportZoneLength || tNormal >= PLAYER_RADIUS) {
        continue;
      }

      this.movePlayer(player);
      this.playersInRange = this.playersInRange.filter(p => p !== player);

      // Calculate distince to closest point on the gate (in XZ plane)
      //const closestPoint = this.leftSide.add(this.gateVector.mul(t));
      //closestPoint.y = playerPosition.y;

      // push away from the closest point on the gate.
      //player.position.set(closestPoint.add(this.gateNormal.mul(PLAYER_RADIUS + BARRIER_PUSH_EXTENSION)));

      log.info(`PUSHING ${player.id}`);
    }
  }

  onPlayerInteract(player: Player) {
    // TODO: Interact-based dialog
  }

  onPlayerEnterProximity(player: Player) {
    if (this.playersInRange.includes(player)) {
      return
    }
    if (PlayerIslandData.isGateOpen(player, this.island, this.props.gateID)) {
      return;
    }

    this.playersInRange.push(player);
  }

  onPlayerExitProximity(player: Player) {
    const index = this.playersInRange.indexOf(player);
    if (index === -1) {
      return;
    }
    this.playersInRange.splice(index, 1);
  }

  onPlayerEnterWorld(player: Player): void {
    if (this.island === undefined) {
      return;
    }
    const isOpen = PlayerIslandData.isGateOpen(player, this.island, this.props.gateID);
    this.setGateVisualState(player, isOpen ? GateVisualState.Open : GateVisualState.Closed);
    this.updateReqText(player);
  }

  onPlayerExitWorld(player: Player): void {
    this.visualStateMap.delete(player);
  }

  async tryOpenGate(player: Player, force?: boolean) {
    if (this.island === undefined) {
      return;
    }
    if (PlayerIslandData.isGateOpen(player, this.island, this.props.gateID)) {
      return;
    }
    if (!force) {
      if (!this.meetsRequirements(player)) {
        return;
      }
      this.chargeCost(player)
    }
    PlayerIslandData.setGateOpen(player, this.island, this.props.gateID);
    this.playersInRange = this.playersInRange.filter(p => p !== player);
    this.sendLocalBroadcastEvent(GateComponent.gateOpened, { player: player, gateID: this.props.gateID, island: this.island });
    this.setGateVisualState(player, GateVisualState.Animating);
    await Promise.all(this.animatedEntities.map(e => {
      e.reset();
      return e.open();
    }));
    this.setGateVisualState(player, GateVisualState.Open);
  }

  private movePlayer(player: Player) {
    let msg = 'You have not unlocked this gate yet'
    if (!this.visualStateMap.get(player)?.meetsReqs) {
      const total = this.getProgressDenominator();
      if (this.props.requiredCatalogItems > 0){
        const discovered = PlayerCatalogManager.getUniqueItemDiscoverCount(player);
        msg = 'Discover ' + (total - discovered) + ' more unique items to open this gate';
      }
      else if (this.props.completedRegionsToOpen > 0){
        const completed = PlayerIslandData.getCompletedRegionCount(player);
        msg = 'Complete ' + (total - completed) + ' more regions to open this gate';
      }
    }

    this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
      player: player,
      text: msg,
    }, [player])

    if (this.props.teleportPoint){
      this.props.teleportPoint?.as(SpawnPointGizmo)!.teleportPlayer(player);
    }
    else{
      let island = PlayerData.getLastIslandVisited(player)
      IslandTeleportManager.instance.teleportPlayer(player, island)
    }
  }

  private meetsRequirements(player: Player) {
    const catalogItemCount = PlayerCatalogManager.getUniqueItemDiscoverCount(player);
    if (this.props.requiredCatalogItems > catalogItemCount) {
      this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, { player: player, text: `You must collect ${this.props.requiredCatalogItems} unique items to open gate` }, [player]);
      return false;
    }

    const completedRegionCount = PlayerIslandData.getCompletedRegionCount(player);
    log.info(`completedRegionCount: ${completedRegionCount} completedRegionsToOpen: ${this.props.completedRegionsToOpen}`);
    if (this.props.completedRegionsToOpen > completedRegionCount) {
      this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, { player: player, text: `You must complete ${this.props.completedRegionsToOpen} regions to open gate` }, [player]);
      return false;
    }

    const xp = BigBox_ExpManager.instance.GetPlayerExp(player)
    const level = BigBox_ExpCurve.instance.ExpToCurrentLevel(xp)

    const requiredLevel = this.props.requiredPlayerLevel;
    if (requiredLevel > level) {
      this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, { player: player, text: `You must be level ${requiredLevel} to open gate` }, [player]);
      return false;
    }
    return true;
  }

  private chargeCost(player: Player) {
    if (!this.hasCost(player)) {
      return;
    }
    const inventoryManager = BigBox_Player_Inventory.instance;
    inventoryManager.changePlayerCurrency(player, -this.props.moneyCostToOpen);
    PlayerData.addGems(player, -this.props.gemCostToOpen);
    inventoryManager.removeItems(player, [
      { itemId: this.props.itemCostToOpen1ID, amount: this.props.itemCostToOpen1Count },
      { itemId: this.props.itemCostToOpen2ID, amount: this.props.itemCostToOpen2Count },
      { itemId: this.props.itemCostToOpen3ID, amount: this.props.itemCostToOpen3Count },
    ]);
  }

  private hasCost(player: Player): boolean {
    const inventoryManager = BigBox_Player_Inventory.instance;
    const currencyAmount = inventoryManager.getPlayerCurrency(player)

    if (this.props.moneyCostToOpen > currencyAmount) {
      this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, { player: player, text: 'You do not have enough money to open gate' }, [player]);
      return false;
    }

    const gemAmount = PlayerData.getGems(player);
    if (this.props.gemCostToOpen > gemAmount) {
      this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, { player: player, text: 'You do not have enough gems to open gate' }, [player]);
      return false;
    }

    let hasItems = true;
    hasItems &&= inventoryManager.checkItem(player, this.props.itemCostToOpen1ID, this.props.itemCostToOpen1Count);
    hasItems &&= inventoryManager.checkItem(player, this.props.itemCostToOpen2ID, this.props.itemCostToOpen2Count);
    hasItems &&= inventoryManager.checkItem(player, this.props.itemCostToOpen3ID, this.props.itemCostToOpen3Count);
    if (!hasItems) {
      this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, { player: player, text: 'You do not have enough items to open gate' }, [player])
      return false;
    }
    return true;
  }

  private setupBarrier() {
    this.leftSide = this.props.gateLeftSide!.position.get();
    this.rightSide = this.props.gateRightSide!.position.get();

    // Gate vector is a vector pointing in the direction of the gate barrier with a magnitude equal to the length of the barrier.
    this.gateVector = this.rightSide.sub(this.leftSide);

    // Proximity position is the center point on the gate
    const proximityPosition = this.gateVector.mul(.5).addInPlace(this.leftSide);

    // Flatten all vectors to the XZ plane
    this.gateVector.y = 0;

    // Rotate gateVector 90 degrees around the Y axis and normalize to get the normal of the gate
    this.gateNormal = this.gateVector.normalize();
    const rotate = this.gateNormal.x;
    this.gateNormal.x = this.gateNormal.z;
    this.gateNormal.z = -rotate;

    // Proximity position is center of the gate, so we want the radius to be approximately half the length of the gate + the players radius.
    // Add a buffer to help prevent edge cases on the.... edges of the gate.
    this.gateLength = this.gateVector.magnitude();
    const proximityRadius = (this.gateLength / 2) + PLAYER_RADIUS + PROXIMITY_BUFFER

    PlayerService.proximity()?.connectListener(proximityPosition, proximityRadius, this);
  }

  private setGateVisualState(player: Player, state: GateVisualState) {
    let playerState = this.visualStateMap.get(player);
    if (playerState === undefined) {
      playerState = { gateState: state, meetsReqs: false, progress: '0/' + this.getProgressDenominator() };
      this.visualStateMap.set(player, playerState);
    } else {
      if (playerState.gateState === state) {
        return;
      }
      playerState.gateState = state;
    }
    this.updateGateVisualStateForPlayers();
    this.progressUi.setProgress(player, this.props.completedRegionsToOpen > 0, playerState.meetsReqs, playerState.progress);
  }

  private updateGateVisualStateForPlayers() {
    const openPlayers: Player[] = [];
    const closedPlayers: Player[] = [];
    const animatingPlayers: Player[] = [];
    this.visualStateMap.forEach((state, player) => {
      switch (state.gateState) {
        case GateVisualState.Open:
          openPlayers.push(player);
          break;
        case GateVisualState.Closed:
          closedPlayers.push(player);
          break;
        case GateVisualState.Animating:
          animatingPlayers.push(player);
          break;
      }
    })
    this.setEntities(openPlayers, this.openEntities, true);
    this.setEntities(closedPlayers, this.closedEntities, true);
    for (const animatedEntity of this.animatedEntities) {
      animatedEntity.entity.setVisibilityForPlayers(animatingPlayers, PlayerVisibilityMode.VisibleTo);
    }
  }

  private updateReqText(player: Player) {
    if ((this.visualStateMap.get(player)?.gateState ?? GateVisualState.Closed) !== GateVisualState.Closed) {
      return;
    }
    const catalogItemCount = PlayerCatalogManager.getUniqueItemDiscoverCount(player);
    const completedRegionCount = PlayerIslandData.getCompletedRegionCount(player);
    const completeRegions = this.props.completedRegionsToOpen > 0
    const meetsReqs = this.props.requiredCatalogItems <= catalogItemCount && this.props.completedRegionsToOpen <= completedRegionCount;

    let progress = `${completeRegions ? completedRegionCount : catalogItemCount}/${this.getProgressDenominator()}`;
    this.progressUi.setProgress(player, completeRegions, meetsReqs, progress);

    let playerState = this.visualStateMap.get(player);
    if (playerState === undefined) { // First time player enters world
      playerState = { gateState: GateVisualState.Closed, meetsReqs: meetsReqs, progress: progress };
      this.visualStateMap.set(player, playerState);
    } else {
      if (playerState.meetsReqs === meetsReqs) {
        return;
      }
      playerState.meetsReqs = meetsReqs;
      if (meetsReqs) {
        this.onMeetRequirements(player, progress);
      }
    }
  }

  private onMeetRequirements(player: Player, progress: string) {
    let nextIsland = getIslandsUnlockedByGate(this.props.gateID);
    if (nextIsland === Islands.None) {
      return;
    }

    // Don't show quest if player hasn't delivered letter to Alen
    let showNavigateQuest = QuestManager.IsReady() && QuestManager.instance.hasCompletedQuest(player, "purchase_ufo_shovel");

    this.async.setTimeout(() => {
      const params: PopupDialogParams = {
        title: "New Island Unlocked",
        text: `${progress} Regions completed.\n${getIslandDisplayName(nextIsland)} is now unlocked!`,
        titleTextColor: "#510000",
        textColor: "#290101",
        bgColor: "#F8F6E5",
        borderColor: "#FFC800",
        option1: showNavigateQuest ? "Navigate" : "Continue",
        option1TextColor: "#FFF",
        option1BGColor: "#70C04E",
        option1BorderColor: "#49A24C",
        blockPlayerMovement: false,
        excludeUI: allHudElementTypes,
      };

      DialogManager.showPopup(this, player, params, (player, selection) => {
        if (showNavigateQuest) {
          this.sendNetworkBroadcastEvent(QuestEvents.requestStartQuestForPlayer, {
            player,
            questId: 'visit_gate',
            overwriteExisting: true,
            questParameters: { npcId: NPC_Guide.gateIdToNPCIdMap.get(this.props.gateID)! },
          })
        }
        },
        (player: Player) => {
          this.sendNetworkBroadcastEvent(PlayerEffects.questCompleteEffect, {}, [player]);
          this.sendNetworkBroadcastEvent(PlayerEffects.completionEffect, {}, [player]);
        }
      )
    }, 3200);
  }

  private setEntities(players: Player[], entities: Entity[], isVisible: boolean) {
    for (const entity of entities) {
      entity.setVisibilityForPlayers(players, isVisible ? PlayerVisibilityMode.VisibleTo : PlayerVisibilityMode.HiddenFrom);
    }
  }

  private getProgressDenominator(): number {
    return Math.max(this.props.requiredCatalogItems, this.props.completedRegionsToOpen);
  }
}
Component.register(GateComponent);
