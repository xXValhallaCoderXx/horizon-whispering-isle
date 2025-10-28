import * as hz from 'horizon/core'
import { SaveGame, createSaveGame } from 'SaveGame'
import * as Globals from 'Globals'
import { Tool } from 'ToolGroups'
import { Pickaxe } from 'Pickaxe'
import { Backpack } from 'Backpack'

/**
 * A custom player class that has references to base hz.Player as well as other custom variables used in other scripts.
 * 
 * @param player - Reference to hz.Player.
 * @param id - Player id of the hz.Player.
 * 
 * @param saveGame - Reference to the saveGame that store player progress across sessions.
 * @param toolMap - Map between a tool stringID and a corresponding Tool class for this player.
 * @param gemMap - Map between a gem stringID and a corresponding GemRecord for this player.
 * 
 * @param equippedGrabbable -  Currently equipped grabbable (pickaxe in this example world).
 * @param equippedAttachable -  Currently equipped attachable (backpack in this example world).
 * 
 * @param healthWrapper -  Reference to the healthbar's empty parent.
 * @param healthBarNumeric - Reference to healthbar numeric gizmo.
 * @param healthBarIcon - Reference to healthBar icon.
 * 
 * 
 * @param extractionProgress -  How much progress did the player complete towards extracting a resource.
 * @param extractionThreshold - How much progress does the player need to complete to extract a resource.
 * @param lastExtractedType - Last extracted resource type stringID.
 * @param inventoryCapacity - Player's inventory capacity (derived from backpack in this example world).
 */
export class SimPlayer {
    player: hz.Player
    id: number
    saveGame: SaveGame | null = null    // Can be null if not allocated

    toolMap: Map<string, Tool>
    gemMap: Map<string, Globals.GemRecord>

    equippedAttachable: Tool | undefined
    equippedGrabbable: Tool | undefined
    
    extractionProgress: number
    extractionThreshold: number
    lastExtractedType: string
    inventoryCapacity: number

    /**
     * A constructor for the custom player class that has references to base hz.Player as well as other custom variables used in other scripts.
     * 
     * @param player - hz.Player reference.
     * @param world - World.
     */
    constructor(player: hz.Player, world: hz.World) {
        this.player = player
        this.id = player.id
        this.saveGame = createSaveGame(player, world)
        this.toolMap = new Map<string, Tool>()
        this.gemMap = new Map<string, Globals.GemRecord>()

        this.extractionProgress = 0
        this.extractionThreshold = 10
        this.lastExtractedType = "NONE"
        this.inventoryCapacity = 0
    }

    /**
     * Equips an attachable to the player. Unequips a currently attached attachable first.
     * 
     * @param toolName - Attachable to attach name stringID.
     */
    public equipAttachable(toolName: string) {
        // Return previous attachable
        this.equippedAttachable?.toolEntity?.as(hz.AttachableEntity).detach()
        this.equippedAttachable?.toolEntity?.visible.set(false)
        this.equippedAttachable?.toolEntity?.getComponents<Backpack>()[0].returnToPool()

        // Attach new attachable
        const newAttachable = this.toolMap.get(toolName)
        this.equippedAttachable = newAttachable
        this.saveGame?.setEquippedAttachable(toolName)
        this.inventoryCapacity = newAttachable?.toolEntity?.getComponents<Backpack>()[0].props.capacity ?? 0
        newAttachable?.toolEntity?.visible.set(true)
        newAttachable?.toolEntity?.as(hz.AttachableEntity).attachToPlayer(this.player, hz.AttachablePlayerAnchor.Torso)
    }

    /**
     * Equips a grabbable to the player. Unequips a currently grabbed grabbable first.
     * 
     * @param toolName - Grabbable to grab name stringID.
     */
    public equipGrabbable(toolName: string) {
        // Return previous grabbable
        this.equippedGrabbable?.toolEntity?.getComponents<Pickaxe>()[0].returnToPool()

        // Attach new grabbable
        const newGrabbable = this.toolMap.get(toolName)
        this.equippedGrabbable = newGrabbable
        this.saveGame?.setEquippedGrabbable(toolName)
        newGrabbable?.toolEntity?.as(hz.GrabbableEntity).forceHold(this.player, hz.Handedness.Right, false)
    }

    /**
     * Unequip all grabbables and attachables from the player and return them to the pool.
     * 
     * @param toolName - Grabbable to grab name stringID.
     */
    public resetTools() {
        // Return all tools to the pool
        this.equippedAttachable?.toolEntity?.as(hz.AttachableEntity).detach()
        this.equippedAttachable?.toolEntity?.visible.set(false)
        this.equippedAttachable?.toolEntity?.getComponents<Backpack>()[0].returnToPool()
        this.equippedGrabbable?.toolEntity?.as(hz.GrabbableEntity).forceRelease()
        this.equippedGrabbable?.toolEntity?.getComponents<Pickaxe>()[0].returnToPool()

        // Set curently equipped to 'undefined'
        this.equippedAttachable = undefined
        this.equippedGrabbable = undefined
        
        this.saveGame?.setEquippedAttachable("")
        this.saveGame?.setEquippedGrabbable("")
        this.inventoryCapacity = 0
    }


    /**
     * Adds some amount of resource to player's inventory. Make sure that player has enough inventory capacity first.
     * 
     * @param type - Resource type stringID.
     * @param value - The amount of resource to add.
     */
    public addPlayerResource(type: string, value: number) {
        const curr = this.getPlayerResource(type)
        // Add resource
        this.setPlayerResource(type, curr + value)
        // Update inventory capacity
        this.saveGame?.setResourcesWeight((this.saveGame?.getResourcesWeight() ?? 0) + value * (Globals.RESOURCE_WEIGHT_MAP.get(type) ?? 0))
    }

    /**
     * Removes some amount of resource from player's inventory.
     * 
     * @param type - Resource type stringID.
     * @param value - The amount of resource to remove.
     */
    public subtractPlayerResource(type: string, value: number) {
        const curr = this.getPlayerResource(type)
        // Remove resource
        this.setPlayerResource(type, curr - value)
        // Update inventory capacity
        this.saveGame?.setResourcesWeight(this.saveGame.getResourcesWeight() - value * (Globals.RESOURCE_WEIGHT_MAP.get(type) ?? 0))
    }

    /**
     * Returns player's total resource weight.
     */
    public getResourcesWeight() {
        return this.saveGame?.getResourcesWeight() ?? 0
    }

    /**
     * Returns an amount of a particular resource in player's inventory.
     * @param type - Resource type stringID.
     */
    public getPlayerResource(type: string): number {
        return this.saveGame?.getResource(type) ?? 0
    }

    /**
     * Manually sets the number of a particular resource. Does NOT update the inventory capacity.
     * @param type - Resource type stringID.
     * @param value - A new resource amount.
     */
    public setPlayerResource(type: string, value: number) {
        this.saveGame?.setResource(type, value)
    }

    /**
     * Returns player tool's level. -1 if tool is not in player's inventory.
     * @param toolName - Tool name stringID.
     */
    public getPlayerTool(toolName: string): number {
        return this.saveGame?.getTool(toolName) ?? Globals.NONE
    }
    /**
     * Set a level for a player tool.
     * @param toolName - Tool name stringID.
     * @param level - A new tool level.
     */
    public setPlayerTool(toolName: string, level: number) {
        this.saveGame?.setTool(toolName, level)
    }

    /**
     * Returns a currently equipped grabbable.
     */
    public getEquippedGrabbable() {
        return this.equippedGrabbable
    }
    /**
     * Returns a currently equipped attachable.
     */
    public getEquippedAttachable() {
        return this.equippedAttachable
    }

    /**
     * Returns an array of player stats (in this example world stats are resource conversion ratios used in ResourceConverter.ts).
     */
    public getPlayerStats(): readonly number[] {
        return this.saveGame?.getPlayerStats() ?? []
    }
    /**
     * Sets player stats to a passed in array.
     * @param newStats - A new stat array.
     */
    public setPlayerStats(newStats: number[]) {
        this.saveGame?.setPlayerStats(newStats)
    }

    /**
     * Returns player's leaderboard score.
     */
    public getPlayerScore(): number {
        return this.saveGame?.getLeaderboardScore() ?? 0
    }
    /**
     * Sets player's leaderboard score.
     * @param newStats - A new score.
     */
    public setPlayerScore(newScore: number) {
        this.saveGame?.setLeaderboardScore(newScore)
    }

    /**
     * Returns true if player has completed First Time User Experience(FTUE); false otherwise.
     */
    public hasCompletedFTUE(): boolean {
        return this.saveGame?.hasCompletedFTUE() ?? false
    }
    /**
     * Set a new status for FTUE Completion.
     * @param status - A new status.
     */
    public setCompletedFTUE(status: boolean) {
        this.saveGame?.setCompletedFTUE(status)
    }

    /**
     * Performs cleanup operations for the player when they are about to exit the world.
     */
    public onSimPlayerExit() {
        // Return player's equipped tools.
        this.equippedAttachable?.toolEntity?.as(hz.AttachableEntity).detach()
        this.equippedAttachable?.toolEntity?.getComponents<Backpack>()[0].returnToPoolDelayed()
        this.equippedGrabbable?.toolEntity?.getComponents<Pickaxe>()[0].returnToPoolDelayed()
    }

    /**
     * Starts animation on equipped attachable.
     */
    public startAnimateBackpack() : boolean {
        if ((this.equippedAttachable?.toolEntity?.getComponents<Backpack>()[0])?.getAnimationState() == false) {
            (this.equippedAttachable?.toolEntity?.getComponents<Backpack>()[0])?.setAnimationState(true)
            return true
        }
        return false
    }

    /**
     * Stops animation on equipped attachable.
     */
    public stopAnimateBackpack() {
        (this.equippedAttachable?.toolEntity?.getComponents<Backpack>()[0])?.setAnimationState(false)
    }

    /**
     * Returns true if equipped attachable is animating; false othersise.
     */
    public isBackpackAnimating() : boolean {
        return (this.equippedAttachable?.toolEntity?.getComponents<Backpack>()[0])?.getAnimationState() ?? false
    }
}


