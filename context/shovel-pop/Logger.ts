/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
export enum LogLevel {
  debug = 0,
  info = 1,
  warn = 2,
  error = 3
}

type LogOverride = {
  context: string,
  minLevel: LogLevel
}

// ============ SETTINGS ====================

const HIDE_ALL_LOGS = false;
const DEFAULT_MIN_LOG_LEVEL = LogLevel.warn;

const LOG_OVERRIDES: LogOverride[] = [
  //{ context: "BigBox_ExpManager", minLevel: LogLevel.info },
  //{ context: "BigBox_ItemState", minLevel: LogLevel.info },
  //{ context: "BigBox_Player_Inventory", minLevel: LogLevel.info },
  //{ context: "BigBox_UI_Inventory", minLevel: LogLevel.info },
  //{ context: "DialogManager", minLevel: LogLevel.info },
  //{ context: "DigManager", minLevel: LogLevel.info },
  //{ context: "DigMinigame", minLevel: LogLevel.info },
  //{ context: "DigSpotUI", minLevel: LogLevel.info },
  //{ context: "GameUtils", minLevel: LogLevel.info },
  //{ context: "IslandTeleportManager", minLevel: LogLevel.info },
  //{ context: "ItemContainer", minLevel: LogLevel.info },
  //{ context: "ItemData", minLevel: LogLevel.debug },
  //{ context: "ItemSpawnManager", minLevel: LogLevel.info },
  //{ context: "LootPityManager", minLevel: LogLevel.info },
  //{ context: "LTEManager", minLevel: LogLevel.info },
  //{ context: "LTEData", minLevel: LogLevel.info },
  //{ context: "NavigationArrow", minLevel: LogLevel.info },
  //{ context: "NavigationArrowManager", minLevel: LogLevel.info },
  //{ context: "NPC", minLevel: LogLevel.info },
  //{ context: "NPC_Shop", minLevel: LogLevel.info },
  //{ context: "PlayerCatalogManager", minLevel: LogLevel.info },
  //{ context: "PlayerData", minLevel: LogLevel.info },
  //{ context: "PlayerInteractionController", minLevel: LogLevel.info },
  //{ context: "PlayerInteractionTrigger", minLevel: LogLevel.info },
  //{ context: "PlayerInventoryManager", minLevel: LogLevel.info },
  //{ context: "PlayerProximityController", minLevel: LogLevel.info },
  //{ context: "PlayerService", minLevel: LogLevel.info },
  //{ context: "PoolObjectAssigner", minLevel: LogLevel.info },
  //{ context: "PlayerStartupReporter", minLevel: LogLevel.info },
  //{ context: "PlayerWorldUI", minLevel: LogLevel.info },
  //{ context: "QuestManager", minLevel: LogLevel.info },
  //{ context: "SelectShovelTutorialPopup", minLevel: LogLevel.info },
  //{ context: "ShinySpot", minLevel: LogLevel.info },
  //{ context: "ShinySpotManager", minLevel: LogLevel.info },
  //{ context: "ShinySpotWorldData", minLevel: LogLevel.info },
  //{ context: "Shovel", minLevel: LogLevel.info },
  //{ context: "ShovelProgressionManager", minLevel: LogLevel.info },
  //{ context: "TurboAnalytics", minLevel: LogLevel.info },
  //{ context: "UI_Catalog", minLevel: LogLevel.info },
  //{ context: "UI_Catalog_IslandPanel", minLevel: LogLevel.info },
  //{ context: "UI_Catalog_ItemCollection", minLevel: LogLevel.info },
  //{ context: "UI_ShovelInventory", minLevel: LogLevel.info },
  //{ context: "UIView_Inventory", minLevel: LogLevel.info },
  //{ context: "Shovel", minLevel: LogLevel.info },
  //{ context: "UI_ShovelProgressionHud", minLevel: LogLevel.info },
  //{ context: "AssetSpawn", minLevel: LogLevel.info },
  //{ context: MissingUIPrefix, minLevel: LogLevel.info },
];

// ===========================================

export class Logger {
  static propsDefinition = {};

  private context: string;
  private static playerName?: string;
  private static globalLogger: Logger = new Logger("");

  public static setPlayerName(playerName: string) { this.playerName = '[' + playerName + ']'; }

  constructor(context: string) {
    this.context = context;
  }

  debug(message: string) {
    if (!this.canLog(LogLevel.debug)) {
      return;
    }
    console.log(`[${this.context}]${this.playerName()}[D] ${message}`);
  }

  info(message: string) {
    if (!this.canLog(LogLevel.info)) {
      return;
    }
    console.log(`[${this.context}]${this.playerName()}[I] ${message}`);
  }

  warn(message: string) {
    if (!this.canLog(LogLevel.warn)) {
      return;
    }
    console.warn(`[${this.context}]${this.playerName()}[W] ${message}`);
  }

  error(message: string) {
    if (!this.canLog(LogLevel.error)) {
      return;
    }
    console.error(`[${this.context}]${this.playerName()}[E] ${message}`);
  }

  private playerName(): string {
    if (!Logger.playerName) {
      return "";
    }
    return Logger.playerName;
  }

  private canLog(logLevel: LogLevel): boolean {
    if (HIDE_ALL_LOGS) {
      return false;
    }
    for (let i = 0; i < LOG_OVERRIDES.length; ++i) {
      if (LOG_OVERRIDES[i].context === this.context) {
        return logLevel >= LOG_OVERRIDES[i].minLevel;
      }
    }
    return logLevel >= DEFAULT_MIN_LOG_LEVEL;
  }

  public static log(logLevel: LogLevel, context: string, message: string) {
    Logger.globalLogger.context = context;
    switch (logLevel) {
      case LogLevel.debug:
        Logger.globalLogger.debug(message);
        break;
      case LogLevel.info:
        Logger.globalLogger.info(message);
        break;
      case LogLevel.warn:
        Logger.globalLogger.warn(message);
        break;
      case LogLevel.error:
        Logger.globalLogger.error(message);
        break;
    }
  }
}
