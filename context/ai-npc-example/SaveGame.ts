import * as hz from 'horizon/core'
import * as Globals from 'Globals'
import { debuglog } from 'DebugBoard'

/*
 * SaveGame not only manages saving and loading, but it is also the repository for game data.  This makes SaveGame 
 * the source of inventory information; see gameData below.  A SimPlayer owns their SaveGame.
 * 
 * A lot of functionality will be driven from the SimPlayer.ts since they hold the SaveGame object
 *
 */

// Only change version number as needed for:
// Identifying format changes (new/changed data etc)
const schemaVersion: number = 9

export type ResourceRecord = {
  type: string
  amount: number
}
export type ToolRecord = {
  type: string
  level: number
}

//
// Default values for a new save game.
//
const gameData = {
  version: schemaVersion,
  completedFTUE: true,
  leaderboardScore: 0,

  playerStats: [
    10,   // greenConversionPower
    10,   // blueConversionPower
    10,   // purpleConversionPower
    10    // redConversionPower
  ],

  resources: [
    { type: 'GREEN_ORE', amount: 0 },
    { type: 'BLUE_ORE', amount: 0 },
    { type: 'PURPLE_ORE', amount: 0 },
    { type: 'RED_ORE', amount: 0 },

    { type: 'GREEN_CURRENCY', amount: 40 },
    { type: 'BLUE_CURRENCY', amount: 0 },
    { type: 'PURPLE_CURRENCY', amount: 0 },
    { type: 'RED_CURRENCY', amount: 0 },

    { type: 'RED_KEY', amount: 0 },
  ],
  resourceWeight: 0,

  tools: [
    { type: 'GREEN_PICKAXE', level: 1 },
    { type: 'BLUE_PICKAXE', level: Globals.NONE },
    { type: 'PURPLE_PICKAXE', level: Globals.NONE },
    { type: 'RED_PICKAXE', level: Globals.NONE },

    { type: 'SMALL_BACKPACK', level: 1 },
    { type: 'MEDIUM_BACKPACK', level: Globals.NONE },
    { type: 'LARGE_BACKPACK', level: Globals.NONE },
    { type: 'COLOSSAL_BACKPACK', level: Globals.NONE },
  ],
  equippedGrabbable: "GREEN_PICKAXE",
  equippedAttachable: "SMALL_BACKPACK",
}

 /**
  * SaveGame class;
  * 
  * The SaveGame manages the game state and saves when this state changes. 
  * 
  * SaveGame uses the Horizon Persistent Variable (pVars) system to store save data to a server. You can set up Persistent 
  * Variables in the System menu of the Editor; make sure to set them up before you run the game the first time.   The process is documented here:
  * 
  * https://developers.meta.com/horizon-worlds/learn/documentation/desktop-editor/quests-leaderboards-and-variable-groups/variable-groups/using-variable-groups
  * 
  */
export class SaveGame extends hz.Component<typeof SaveGame> {
  static propsDefinition = {}

  // player vars
  pvarsBaseName = "IncrSim:"
  saveGameKey = this.pvarsBaseName + "SaveGame"
  isLoaded: boolean = false
  player: hz.Player | undefined = undefined
  currWorld: hz.World | undefined = undefined    // savegame.world is undefined unless we attach it to an object
  gameData = JSON.parse(JSON.stringify(gameData))

  start() {
    debuglog('SaveGame start ' + (this.gameData ?? "GD=NULL"), 'StatusBoard')
  }

  /**
   * Populates the save game with values stored in pVars, or resets to default if the pVars are invalid or a version mismatch occurs. 
   * @returns - False if unsuccessful.
   */
  load(): boolean {

    let success: boolean = false

    // Attempt to get the pVars (from HW backend).
    if (this.player && this.currWorld) {
      const pVars = this.currWorld.persistentStorage.getPlayerVariable(this.player, this.saveGameKey)
      if ((pVars != undefined) && (Object.keys(pVars).length > 0) && (JSON.stringify(pVars) != '{}')) {

        const jsonObject: any = JSON.parse(JSON.stringify(pVars))
        if (jsonObject.hasOwnProperty('version')) {
          if (jsonObject.version == schemaVersion) {
            if (jsonObject.hasOwnProperty('resources')) {
              this.gameData.resources = jsonObject.resources
              debuglog('SaveGame: resources -> R0=' + this.gameData.resources[0] + ' R5=' + this.gameData.resources[5], 'StatusBoard')
            }

            if (jsonObject.hasOwnProperty('tools')) {
              this.gameData.tools = jsonObject.tools
              debuglog('SaveGame: tools -> T1=' + this.gameData.tools[1])
            }

            if (jsonObject.hasOwnProperty('resourceWeight')) {
              this.gameData.resourceWeight = jsonObject.resourceWeight
              debuglog('SaveGame: resourceWeight =' + this.gameData.resourceWeight)
            }

            if (jsonObject.hasOwnProperty('equippedGrabbable')) {
              this.gameData.equippedGrabbable = jsonObject.equippedGrabbable
              debuglog('SaveGame: equippedGrabbable =' + this.gameData.equippedGrabbable)
            }

            if (jsonObject.hasOwnProperty('equippedAttachable')) {
              this.gameData.equippedAttachable = jsonObject.equippedAttachable
              debuglog('SaveGame: equippedAttachable =' + this.gameData.equippedAttachable)
            }

            if (jsonObject.hasOwnProperty('playerStats')) {
              this.gameData.playerStats = jsonObject.playerStats
              debuglog('SaveGame: playerStats =' + this.gameData.playerStats)
            }

            if (jsonObject.hasOwnProperty('completedFTUE')) {
              this.gameData.completedFTUE = jsonObject.completedFTUE
              debuglog('SaveGame: completedFTUE =' + this.gameData.completedFTUE)
            }

            if (jsonObject.hasOwnProperty('leaderboardScore')) {
              this.gameData.leaderboardScore = jsonObject.leaderboardScore
              debuglog('SaveGame: leaderboardScore =' + this.gameData.leaderboardScore)
            }

            success = true
          }
          else {
            debuglog('SaveGame: Load fails, version mismatch. Expected ' + schemaVersion + " got " + jsonObject.version + ". Reset to defaults.", 'ErrorBoard')
            this.save()
          }
        }
        else {
          debuglog('SaveGame: Load fails, no version. Expected ' + schemaVersion + ". Reset to defaults.", 'ErrorBoard')
          this.save()
        }
      }
      else {
        debuglog('SaveGame: No previous save. Set to defaults.', 'ErrorBoard')
        this.save()
      }

      this.isLoaded = true
    }
    else {
      debuglog('SaveGame: Load fails, no player/world set', 'ErrorBoard')
    }

    return success
  }

  /**
   * Saves game state to pvars.
   * @returns - False if unsuccessful.
   */
  save(): boolean {
    let success: boolean = false

    if (this.player && this.currWorld) {
      this.currWorld.persistentStorage.setPlayerVariable(this.player, this.saveGameKey, this.gameData)
      this.isLoaded = true
      success = true
    }
    else {
      debuglog('SaveGame: Save fails, no player/world set', 'ErrorBoard')
    }

    return success
  }

  /**
   * Resets game data to default and saves.
   */
  reset() {
    // Deep copy.
    this.gameData = JSON.parse(JSON.stringify(gameData))
    this.save()
  }

  /**
   * Return the version number.
   */
  getVersion(): number {
    if (this.gameData) {
      return this.gameData.version
    }
    return Globals.NONE
  }

  /**
   * Whether the player has completed the First Time User Experience (intro room).
   * @returns True if they have completed the FTUE.
   */
  hasCompletedFTUE(): boolean {
    return this.gameData.completedFTUE
  }

  /**
   * Mark the First Time User Experience (intro room) as completed (or not completed).  This causes a save.
   * @params status - Whether the intro is completed.
   */  
  setCompletedFTUE(status: boolean) {
    this.gameData.completedFTUE = status
    this.save()
  }

  /**
   * Get all of the resources a player owns.  This is mostly for debug, normally you should get a specific resource.
   * @returns A readonly array of all resources owned
   */  
  getResources(): readonly ResourceRecord[] {
    return this.gameData.resources;
  }

  /**
   * Get total number of resources owned.  Mostly for debug.
   * @returns The number of resources owned
   */  
  getNumResources(): number {
    return this.gameData.resources.length
  }

  /**
   * The total weight of resources in the backpack.  Different resources could weigh different amounts and take up 
   * different amounts of backpack space. (But, for gameplay reasons, in this example world all our resources weigh the same.)
   * @returns The weight of resources in the backpack.
   */  
  getResourcesWeight(): number {
    return this.gameData.resourceWeight
  }

  /**
   * Set the weight of resources in the backpack.  This causes a save.
   * @param value - The total weight of resources in the backpack.
   */ 
  setResourcesWeight(value: number) {
    this.gameData.resourceWeight = value
    this.save()
  }

  /**
   * Get the amount of a given resource.
   * @param type - The string name of the resource, like 'GREEN_ORE'.
   * @returns - The amount of the resource.
   */ 
  getResource(type: string): number {
    if (!this.isLoaded) {
      debuglog('SaveGame: GetResource error, set before load.', 'ErrorBoard')
    }
    if (!this.gameData || !this.gameData.resources) {
      debuglog('SaveGame: GetResource error, bad gamedata.', 'ErrorBoard')
    }
    let idx: number = this.gameData.resources.findIndex((entry: { type: string, amount: number }) => { return ((entry.type == type)) })
    if (idx != Globals.NONE) {
      return this.gameData.resources[idx].amount
    }
    return 0
  }

  /**
   * Set the amount of a given resource.  If successful, this causes a save.
   * @param type - The string name of the resource, like 'GREEN_ORE'.
   * @param value - The amount of that resource.
   * @returns - False if unsuccessful.
   */ 
  setResource(type: string, value: number): boolean {
    if (!this.isLoaded) {
      debuglog('SaveGame: SetResource error, set before load.', 'ErrorBoard')
    }
    if (!this.gameData || !this.gameData.resources) {
      debuglog('SaveGame: SetResource error, bad gamedata.', 'ErrorBoard')
    }
    let idx: number = this.gameData.resources.findIndex((entry: { type: string, amount: number }) => { return ((entry.type == type)) })
    if (idx != Globals.NONE) {
      this.gameData.resources[idx].amount = value
      this.save()
      return true
    }
    return false
  }

  /**
   * Get the string name of the current backpack.  Like 'MEDIUM_BACKPACK'
   * @returns - The string name of the current backpack.
   */
  getEquippedAttachable() {
    return this.gameData.equippedAttachable
  }
  
  /**
   * Set the name of the current backpack. This causes a save.
   * @returns - The string name of the current backpack.
   */
  setEquippedAttachable(toolType: string) {
    this.gameData.equippedAttachable = toolType
    this.save()
  }

  /**
   * Get the string name of the current pickaxe.  Like 'GREEN_PICKAXE'
   * @returns - The string name of the current pickaxe.
   */
  getEquippedGrabbable() {
    return this.gameData.equippedGrabbable
  }

  /**
   * Set the name of the current pickaxe.   This causes a save.
   * @returns - The string name of the current pickaxe.
   */
  setEquippedGrabbable(toolType: string) {
    this.gameData.equippedGrabbable = toolType
    this.save()
  }

  /**
   * Get stats about the player.  In this case, it's the conversion factors for each resource.
   * @returns - An array of statistics about the player.
   */
  getPlayerStats(): readonly number[] {
    return this.gameData.playerStats
  }

  /**
   * Set player stats (which are the conversion factors for each resource).   This causes a save.
   * @param newStats - An array of statistics about the player.
   */
  setPlayerStats(newStats: number[]): void {
    this.gameData.playerStats = newStats
    this.save()
  }

  /**
   * Gets a "score" for the leaderboard. In this case, it's the total amount of resources mined.
   * @returns - The score.
   */
  getLeaderboardScore(): number {
    return this.gameData.leaderboardScore
  }

  /**
   * Sets a "score" for the leaderboard. In this case, it's the total amount of resources mined. If successful, this causes a save.
   * @param newScore - The score.
   */
  setLeaderboardScore(newScore: number) {
    this.gameData.leaderboardScore = newScore
    this.save()
  }

  /**
   * Gets the entire array of tools for this player.  Mostly for debug.
   * @returns - The array of tools for this player.
   */
  getTools(): readonly ToolRecord[] {
    return this.gameData.tools;
  }

  /**
   * Gets the number of tools for this player.  Mostly for debug.
   * @returns - How many tools in the tool array.
   */
  getNumTools(): number {
    return this.gameData.tools.length
  }

  /**
   * Gets the level of a specific tool.  If the tool has not been purchased, it returns Globals.NONE.
   * @param type - The tool name, like "GREEN_PICKAXE" 
   * @returns - The level of this tool.
   */
  getTool(type: string): number {
    if (!this.isLoaded) {
      debuglog('SaveGame: getTool error, set before load.', 'ErrorBoard')
    }
    if (!this.gameData || !this.gameData.tools) {
      debuglog('SaveGame: getTool error, bad gamedata.', 'ErrorBoard')
    }
    let idx: number = this.gameData.tools.findIndex((entry: { type: string, level: number }) => { return ((entry.type == type)) })
    if (idx != Globals.NONE) {
      return this.gameData.tools[idx].level
    }
    return Globals.NONE
  }

  /**
   * Sets the level of a specific tool.  If successful, this causes a save.
   * @param type - The tool name, like "GREEN_PICKAXE"
   * @param value - The tool level. 
   * @returns - True if the operation was successful.
   */
  setTool(type: string, value: number): boolean {
    if (!this.isLoaded) {
      debuglog('SaveGame: setTool error, set before load.', 'ErrorBoard')
    }
    if (!this.gameData || !this.gameData.tools) {
      debuglog('SaveGame: setTool error, bad gamedata.', 'ErrorBoard')
    }
    let idx: number = this.gameData.tools.findIndex((entry: { type: string, level: number }) => { return ((entry.type == type)) })
    if (idx != Globals.NONE) {
      this.gameData.tools[idx].level = value
      this.save()
      return true
    }
    debuglog('SaveGame: setTool error, did not find tool ' + type + value)
    return false
  }
}
hz.Component.register(SaveGame)


// ----------------------   SAVEGAME API ------------------------------------

  /**
   * Constructor to create a new SaveGame instance for a player in his world
   * @param player - The Horizon player
   * @param world - The Horizon world
   * @returns - A new SaveGame object.
   */
export function createSaveGame(player: hz.Player, world: hz.World): SaveGame {
  const saveGame = new SaveGame()
  saveGame.player = player
  saveGame.currWorld = world
  saveGame.load() // Load the save game data
  return saveGame
}
