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
import { AudibilityMode, AudioGizmo, Color, Component, Entity, LocalEvent, NetworkEvent, Player, PropTypes, SpawnPointGizmo } from "horizon/core";
import { getIslandFromID, Islands } from "Islands";
import { Logger } from "Logger";
import { PlayerData, MigrationStatus } from "PlayerData";
import { QuestData } from "QuestData";
import { QuestEvents } from "QuestManager";
import { Events } from "Events";

const DEFAULT_TELEPORT_DELAY = 500;

const log = new Logger("IslandTeleportManager");

export const IslandEvents = {
  playerTeleportedToIsland: new NetworkEvent<{ player: Player, islandName: string, island: Islands }>('playerTeleportedToIsland'),
  islandTeleportManagerReady: new LocalEvent('islandTeleportManagerReady'),
};

export class IslandTeleportManager extends Component<typeof IslandTeleportManager> {
  static propsDefinition = {
    beachcampSpawnPoint: { type: PropTypes.Entity },
    beachcampName: { type: PropTypes.String },
    beachcampCost: { type: PropTypes.Number },
    beachcampLevelReq: { type: PropTypes.Number },
    beachcampEnabled: { type: PropTypes.Boolean },
    beachcampStartingQuest: { type: PropTypes.Entity },
    piratecoveSpawnPoint: { type: PropTypes.Entity },
    piratecoveName: { type: PropTypes.String },
    piratecoveCost: { type: PropTypes.Number },
    piratecoveLevelReq: { type: PropTypes.Number },
    piratecoveEnabled: { type: PropTypes.Boolean },
    privatecoveStartingQuest: { type: PropTypes.Entity },
    icetundraSpawnPoint: { type: PropTypes.Entity },
    icetundraName: { type: PropTypes.String },
    icetundraCost: { type: PropTypes.Number },
    icetundraLevelReq: { type: PropTypes.Number },
    icetundraEnabled: { type: PropTypes.Boolean },
    icetundraStartingQuest: { type: PropTypes.Entity },
    ftkSpawnPoint: { type: PropTypes.Entity },
    ftkName: { type: PropTypes.String },
    ftkCost: { type: PropTypes.Number },
    ftkLevelReq: { type: PropTypes.Number },
    ftkEnabled: { type: PropTypes.Boolean },
    ftkStartingQuest: { type: PropTypes.Entity },
    moonSpawnPoint: { type: PropTypes.Entity },
    moonName: { type: PropTypes.String },
    moonCost: { type: PropTypes.Number },
    moonLevelReq: { type: PropTypes.Number },
    moonEnabled: { type: PropTypes.Boolean },
    moonStartingQuest: { type: PropTypes.Entity },
    inventoryManager: { type: PropTypes.Entity },
    expManager: { type: PropTypes.Entity },
    expCurve: { type: PropTypes.Entity },
    purchaseAudio: { type: PropTypes.Entity },
  };

  // Singleton
  private static _instance: IslandTeleportManager | null;
  public static get instance(): IslandTeleportManager { return this._instance!; }

  private beachcampSpawnPoint?: SpawnPointGizmo;
  private piratecoveSpawnPoint?: SpawnPointGizmo;
  private icetundraSpawnPoint?: SpawnPointGizmo;
  private ftkSpawnPoint?: SpawnPointGizmo;
  private moonSpawnPoint?: SpawnPointGizmo;

  private inventoryManager!: BigBox_Player_Inventory;
  private expManager!: BigBox_ExpManager;
  private expCurve!: BigBox_ExpCurve;
  private purchaseAudio?: AudioGizmo;

  private allStartingQuests: (Entity | undefined)[] = [];

  start() {
    log.info("Start");
    IslandTeleportManager._instance = this;
    this.beachcampSpawnPoint = this.props.beachcampSpawnPoint?.as(SpawnPointGizmo);
    this.piratecoveSpawnPoint = this.props.piratecoveSpawnPoint?.as(SpawnPointGizmo);
    this.icetundraSpawnPoint = this.props.icetundraSpawnPoint?.as(SpawnPointGizmo);
    this.ftkSpawnPoint = this.props.ftkSpawnPoint?.as(SpawnPointGizmo);
    this.moonSpawnPoint = this.props.moonSpawnPoint?.as(SpawnPointGizmo);

    this.inventoryManager = this.props.inventoryManager!.getComponents<BigBox_Player_Inventory>()[0]!;
    this.expManager = this.props.expManager!.getComponents<BigBox_ExpManager>()[0]!;
    this.expCurve = this.props.expCurve!.getComponents<BigBox_ExpCurve>()[0]!;
    this.purchaseAudio = this.props.purchaseAudio?.as(AudioGizmo);
    PlayerData.init(this.world);

    this.allStartingQuests = [
      this.props.beachcampStartingQuest,
      this.props.privatecoveStartingQuest,
      this.props.icetundraStartingQuest,
      this.props.ftkStartingQuest,
      this.props.moonStartingQuest
    ]

    this.sendLocalBroadcastEvent(IslandEvents.islandTeleportManagerReady, {});

    Debug.addCommand("Teleport/Beachcamp", (player) => this.teleportPlayer(player, Islands.BeachCamp, 0));
    Debug.addCommand("Teleport/Pirate Cove", (player) => this.teleportPlayer(player, Islands.PirateCove, 0));
    Debug.addCommand("Teleport/Ice Tundra", (player) => this.teleportPlayer(player, Islands.IceTundra, 0));
    Debug.addCommand("Teleport/Fairy Tale Kingdom", (player) => this.teleportPlayer(player, Islands.FairyTaleKingdom, 0));
    Debug.addCommand("Teleport/The Moon", (player) => this.teleportPlayer(player, Islands.Moon, 0));
  }

  showTeleportDialog(player: Player, island: Islands) {
    log.info(`Showing teleport dialog for player (${player.id}) to travel to (${island})`);
    const isEnabled = this.getIsIslandEnabled(island);
    if (!isEnabled) {
      this.handleIslandDisabled(player, island);
      return;
    }
    const levelReq = this.getIslandLevelReq(island);
    const playerLevel = this.getPlayerLevel(player);
    if (playerLevel < levelReq) {
      this.handlePlayerFailLevelReq(player, playerLevel, levelReq, island);
      return;
    }
    const cost = this.getIslandCost(island);
    const playerCurrency = this.inventoryManager.getPlayerCurrency(player);
    if (playerCurrency < cost) {
      this.handlePlayerCantAfford(player, playerCurrency, cost, island);
      return;
    }
    this.handleTeleportDialog(player, cost, island);
  }

  teleportPlayer(player: Player, island: Islands, delayBeforeTeleport: number = DEFAULT_TELEPORT_DELAY) {
    log.info(`Teleporting player (${player.id} to island (${island}))`);
    PlayerData.setLastIslandVisited(player, island);
    this.async.setTimeout(() => {
      const spawnPoint = this.getSpawnPoint(island);
      if (spawnPoint === undefined) {
        log.warn(`Cannot teleport, invalid island (${island})`);
        return;
      }
      spawnPoint?.teleportPlayer(player);
      this.sendNetworkBroadcastEvent(IslandEvents.playerTeleportedToIsland, { player: player, islandName: this.getIslandDisplayName(island), island: island }, [player, this.world.getServerPlayer()]);
      this.tryStartQuest(player, island - 1);
    }, delayBeforeTeleport);
  }

  teleportPlayerToLastIsland(player: Player, delayBeforeTeleport: number = DEFAULT_TELEPORT_DELAY) {
    const lastIsland = PlayerData.getLastIslandVisited(player);
    log.info(`Teleporting player (${player.id} to last island (${lastIsland})`);
    this.teleportPlayer(player, lastIsland, delayBeforeTeleport)
  }

  private handleIslandDisabled(player: Player, island: Islands) {
    const islandDisplayName = this.getIslandDisplayName(island);
    DialogManager.show(this, player, {
      title: `Destination: ${islandDisplayName}`,
      text: `Travel to ${islandDisplayName} is coming soon!`,
      option1: "OK!",
    });
  }

  private handlePlayerFailLevelReq(player: Player, playerLevel: number, levelReq: number, island: Islands) {
    const islandDisplayName = this.getIslandDisplayName(island);
    this.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToastWithColor, {
      text: `Must be level ${levelReq} to travel to ${islandDisplayName}`,
      color: Color.red
    }, [player]);
  }

  private handlePlayerCantAfford(player: Player, playerCurrency: number, cost: number, island: Islands) {
    const islandDisplayName = this.getIslandDisplayName(island);
    DialogManager.show(this, player, {
      title: `Destination: ${islandDisplayName}`,
      text: `Sorry, it costs $${cost} to travel to ${islandDisplayName}.`,
      option1: "I'll be right back!",
    });
  }

  private handleTeleportDialog(player: Player, cost: number, island: Islands) {
    const islandDisplayName = this.getIslandDisplayName(island);
    let message = 'Would you like to travel to ' + islandDisplayName + '?';
    if (cost > 0) {
      message += `\nCost: $${cost}`;
    }

    DialogManager.show(this, player, {
      title: `Destination: ${islandDisplayName}`,
      text: message,
      option1: "Let's go!",
      option2: "Maybe later..."
    },
      (player, selection) => this.onDialogSelected(selection === 0, player, cost, island)
    );
  }

  private onDialogSelected(accepted: boolean, player: Player, cost: number, island: Islands): void {
    if (!accepted) {
      return;
    }
    if (PlayerData.getMigrationStatus(player) != MigrationStatus.Complete && island == Islands.PirateCove) {
        this.sendNetworkBroadcastEvent(Events.migratePlayerEvent, {player: player, isPirate: true}, [player])
    }
    this.inventoryManager.changePlayerCurrency(player, -cost);
    this.teleportPlayer(player, island);
    // probably going to set something up in PlayerEffectsController instead, this might not play if multiple people teleport at the same time.
    this.purchaseAudio?.play({ fade: 0, audibilityMode: AudibilityMode.AudibleTo, players: [player] });
  }

  private getPlayerLevel(player: Player) {
    const xp = this.expManager.GetPlayerExp(player)
    return this.expCurve.ExpToCurrentLevel(xp)
  }

  private getSpawnPoint(island: Islands) {
    switch (island) {
      case Islands.BeachCamp:
        return this.beachcampSpawnPoint;
      case Islands.PirateCove:
        return this.piratecoveSpawnPoint;
      case Islands.IceTundra:
        return this.icetundraSpawnPoint;
      case Islands.FairyTaleKingdom:
        return this.ftkSpawnPoint;
      case Islands.Moon:
        return this.moonSpawnPoint;
    }
    log.warn(`Cannot find spawnpoint for island (${island})`);
    return undefined;
  }

  private getIslandDisplayName(island: Islands | undefined) {
    switch (island) {
      case Islands.BeachCamp:
        return this.props.beachcampName;
      case Islands.PirateCove:
        return this.props.piratecoveName;
      case Islands.IceTundra:
        return this.props.icetundraName;
      case Islands.FairyTaleKingdom:
        return this.props.ftkName;
      case Islands.Moon:
        return this.props.moonName;
    }
    log.warn(`Cannot find display name for island (${island})`);
    return "<MISSING>";
  }

  public getIslandDisplayNameFromIslandId(islandId: string) : string {
    return this.getIslandDisplayName(getIslandFromID(islandId));
  }

  private getIslandCost(island: Islands) {
    switch (island) {
      case Islands.BeachCamp:
        return this.props.beachcampCost;
      case Islands.PirateCove:
        return this.props.piratecoveCost;
      case Islands.IceTundra:
        return this.props.icetundraCost;
      case Islands.FairyTaleKingdom:
        return this.props.ftkCost;
      case Islands.Moon:
        return this.props.moonCost;
    }
    log.warn(`Cannot find cost for island (${island})`);
    return 0;
  }

  private getIslandLevelReq(island: Islands) {
    switch (island) {
      case Islands.BeachCamp:
        return this.props.beachcampLevelReq;
      case Islands.PirateCove:
        return this.props.piratecoveLevelReq;
      case Islands.IceTundra:
        return this.props.icetundraLevelReq;
      case Islands.FairyTaleKingdom:
        return this.props.ftkLevelReq;
      case Islands.Moon:
        return this.props.moonLevelReq;
    }
    log.warn(`Cannot find level requirement for island (${island})`);
    return 0;
  }

  private getIsIslandEnabled(island: Islands) {
    switch (island) {
      case Islands.BeachCamp:
        return this.props.beachcampEnabled;
      case Islands.PirateCove:
        return this.props.piratecoveEnabled;
      case Islands.IceTundra:
        return this.props.icetundraEnabled;
      case Islands.FairyTaleKingdom:
        return this.props.ftkEnabled;
      case Islands.Moon:
        return this.props.moonEnabled;
    }
    log.warn(`Cannot find enabled flag for island (${island})`);
    return 0;
  }

  private tryStartQuest(player: Player, islandId: number) {
    const quest = this.allStartingQuests[islandId]?.getComponents<QuestData>()[0];
    if (quest){
      log.info("Starting quest: " + quest.props.id);
      this.sendNetworkBroadcastEvent(QuestEvents.requestStartQuestForPlayer, { player: player, questId: quest.props.id }, [this.world.getServerPlayer()])
    }
  }
}
Component.register(IslandTeleportManager);
