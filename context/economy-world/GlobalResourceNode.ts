
import { refreshBackpack, refreshBar } from 'CUIHUD'
import * as hz from 'horizon/core'
import * as Globals from 'Globals'
import { World } from 'World'
import * as Anim from 'SimpleAnimation'

// Node states
enum NodeState {
    Ready = 0,      // Node is ready to be extracted
    Resetting = 1,  // Node is resetting and cannot be extracted
}

/**
 * Communal Resource Node class;
 * 
 * This is your finite resource supply that players can work together to extract. Enters a resetting period the node is exausted.
 * 
 * Props:
 * @param resourceType - The string nameID of the resource of that node.
 * @param toolType - Required toolType to extract this resource node.
 * 
 * @param workToExtract - How much work do players need to complete to obtain the reward.
 * @param nodeReward - Total reward that is shared once the node is completed.
 * @param nodeResetTime - Time it takes for the node to reset.
 * 
 * @param nodeVisuals -  Reference to the visuals parent object. Has different meshes for the node inside of it.
 * @param healthBar -  Reference to the healthbar of the node.
 * @param healthWrapper -  Reference to the healthbar's empty parent.
 * @param healthBarNumeric - Reference to healthbar numeric gizmo.
 * 
 */

export class GlobalResourceNode extends hz.Component<typeof GlobalResourceNode> {
    static propsDefinition = {
        resourceType: { type: hz.PropTypes.String, default: "RED_ORE" },
        toolType: { type: hz.PropTypes.String, default: "pickaxe" },

        workToExtract: { type: hz.PropTypes.Number, default: 100 },
        nodeReward: { type: hz.PropTypes.Number, default: 20 },
        nodeResetTime: { type: hz.PropTypes.Number, default: 5 },

        nodeVisuals: { type: hz.PropTypes.Entity, default: undefined },
        healthWrapper: { type: hz.PropTypes.Entity },
        healthBar: { type: hz.PropTypes.Entity },
        healthBarNumeric: { type: hz.PropTypes.Entity },
    }

    nodeState: NodeState = NodeState.Ready                                  // Current node state
    progressCompleted: number = 0                                           // Total progress the players have contributed
    playerContributions: Map<string, number> = new Map<string, number>()    // A map of individual player contributions

    visualIndex = 0     // An index of the current visual selected
    numVisuals = 0      // How many visuals are there in total

    // Original healthbar state variables
    originalHealthBarScale = hz.Vec3.zero   
    originalNumericScale = hz.Vec3.zero
    originalWrapperPosition = hz.Vec3.zero

    start(): void {
        // Set healthbar base state variables; Used later for animation
        this.originalHealthBarScale = this.props.healthBar?.scale.get() ?? hz.Vec3.zero
        this.originalNumericScale = this.props.healthBarNumeric?.scale.get() ?? hz.Vec3.zero
        this.originalWrapperPosition = this.props.healthWrapper?.position.get() ?? hz.Vec3.zero
        this.resetHealthBar()

        // Determine the number of visuals in nodeVisuals
        this.numVisuals = this.props.nodeVisuals?.children.get().length ?? 0
        if (this.numVisuals == 0) {
            console.error("Missing visuals for a resource node!")
        }
    }

    /**
     * Function specifying an event happening to the resource node when it is affected by a Tool.
     * 
     * Should be called by the tool that acts on the resource node. (See Pickaxe.ts for example).
     * 
     * @param player - Player that extracts from the node.
     * @param progressAdded - How much progress did the person contribute.
     */
    registerHit(player: hz.Player, progressAdded: number) {
        let nodeCompleted = false
        // Check for node completion
        if (this.props.workToExtract - this.progressCompleted <= progressAdded) {
            nodeCompleted = true
        }
        // Update player's individual contribution in playerContributions map
        const playerContribution = (this.playerContributions.get(player.name.get()) ?? 0) + Math.min(progressAdded, this.props.workToExtract - this.progressCompleted)
        this.playerContributions.set(player.name.get(), playerContribution)
        this.progressCompleted += progressAdded

        // Undate individual player UI variables
        const simPlayer = World.world?.getSimPlayer(player.name.get())
        if (!simPlayer) {
            console.error("SimPlayer not found to register hit!")
            return
        }
        simPlayer.extractionProgress = playerContribution
        simPlayer.lastExtractedType = this.props.resourceType

        // Update node's healthbar based on the new progress
        let pct = this.progressCompleted / this.props.workToExtract
        if (this.props.healthBarNumeric) {
            this.props.healthBarNumeric.as(hz.TextGizmo).text.set(`${Math.round(pct * 100)}%`)
        }
        if (this.props.healthBar) {
            let health: hz.Vec3 = hz.Vec3.one
            health.x = pct
            this.props.healthBar.scale.set(health)
        }

        // If node is completed play appropriate effects and reset the node
        if (nodeCompleted) {

            // Update healthbar
            if (this.props.healthBarNumeric) {
                Anim.animatedScale(this.props.healthBarNumeric, 1.0, 0.08, this.getOriginalNumericScale(), 2.0, null)
            }
            if (this.props.healthBar) {
                this.props.healthBar.scale.set(new hz.Vec3(0, 0, 0))
            }

            // Allocate rewards and reset the node
            this.progressCompleted = 0
            this.resetVisuals()
            this.allocateRewards()
            // Put the node in the Resetting state and let it regrow
            this.resetNode()
        }

        // Update visuals to reflect the new progress
        this.updateVisuals()
    }

    /**
     * Gives players who have contributed to the node extraction a corresponding reward.
     */
    allocateRewards() {
        // Iterate through every player who contributed
        this.playerContributions.forEach((contribution: number, playerName: string) => {

            const simPlayer = World.world?.getSimPlayer(playerName)
            // Skip players that left the world at that point
            if (simPlayer == null || simPlayer == undefined) {
                console.log(`SimPlayer ${playerName} not found in world; failing to allocate resources!`)
            } else {
                // Calculate player backpack capacity limit
                const capLimit = Math.floor((simPlayer.inventoryCapacity - simPlayer?.getResourcesWeight()) / (Globals.RESOURCE_WEIGHT_MAP.get(this.props.resourceType) ?? 1))
                let playerReward = Math.ceil(this.props.nodeReward * (contribution / this.props.workToExtract))
    
                // Play sfx
                if (playerReward > capLimit) {
                    // Play capacity reached sfx
                    World.world?.playSoundAt("SFX_MaxInventory", simPlayer.player.position.get())
                    this.async.setTimeout(() => {
                        World.world?.playSoundAt("SFX_MaxInventory", simPlayer.player.position.get())
    
                    }, 100) // Plays wah sound twice, wah-wah         
                } else {
                    // Play reward sfx
                    this.async.setTimeout(() => {
                        World.world?.playSoundAt("SFX_ObtainItem_Alt", simPlayer.player.position.get())
                    }, 100) // delay obtain sound to not overlap with the potential hit sound
                }
    
                // Give player the reward
                playerReward = Math.min(playerReward, capLimit)
                simPlayer.addPlayerResource(this.props.resourceType, playerReward)
                simPlayer.player.setAchievementComplete("Teamwork!", true)
                console.log(`Allocating ${playerReward} ${this.props.resourceType} to ${playerName} from the global node`)
    
                // Refresh player's individual progress bar if it's tracking this active resource
                if (simPlayer.lastExtractedType == this.props.resourceType) {
                    simPlayer.extractionProgress = 0
                }
    
                // Refresh node healthbar
                this.resetHealthBar()

                // Refresh player HUD
                refreshBar(simPlayer.player,0)
                refreshBackpack(simPlayer.player)
            }
        })
        // Clear the individual progress map
        this.playerContributions.clear()
    }

    /**
     * Cycle towards the next visual if the progress threshold is reached.
     */
    updateVisuals() {
        // Check if  progress threshold is reached
        if (this.progressCompleted / this.props.workToExtract > this.visualIndex / this.numVisuals) {
            // Calculate the new visual index
            const newVisIndex = Math.floor(this.progressCompleted / this.props.workToExtract * this.numVisuals)
            this.props.nodeVisuals?.children.get()[this.visualIndex].visible.set(false)
            // Play visual change vfx
            if (this.visualIndex != newVisIndex) {
                World.world?.playVfxAt("VFX_NodeDestroy", this.entity.position.get().add(new hz.Vec3(0, 0.5, 0)))
            }
            this.visualIndex = newVisIndex
            // Toggle the new visual on
            this.props.nodeVisuals?.children.get()[this.visualIndex].visible.set(true)
        }
    }

    /**
     * Resets the node visual to default: the first child in nodeVisuals.
     */
    resetVisuals() {
        this.props.nodeVisuals?.children.get()[this.visualIndex].visible.set(false)
        this.visualIndex = 0
        this.props.nodeVisuals?.children.get()[this.visualIndex].visible.set(true)
    }

    /**
     * Resets healthbar to 0.
     */
    resetHealthBar() {
        if (this.props.healthBar) {
            let health: hz.Vec3 = hz.Vec3.one
            health.x = 0
            this.props.healthBar.scale.set(health)
        }
        if (this.props.healthBarNumeric) {
            this.props.healthBarNumeric.as(hz.TextGizmo).text.set(`0%`)
        }
    }

    /**
     * Puts in node in the NodeState.Resetting state and visually regrows it.
     */
    public resetNode() {
        this.nodeState = NodeState.Resetting
        // Disable collision while resetting
        this.entity.tags.clear()
        let t = 0
        // Start regrowing vfx
        World.world?.playVfxAt("VFX_NodeDestroy", this.entity.position.get().add(new hz.Vec3(0, 0.5, 0)))
        World.world?.playVfxAt("VFX_NodeReset", this.entity.position.get().add(new hz.Vec3(0, 1.5, 0)))
        // Start regrowing animation
        const oldPos = this.props.nodeVisuals?.position.get().clone() ?? hz.Vec3.zero
        const anim = this.async.setInterval(() => {
            t += 16
            const newPos = hz.Vec3.lerp(oldPos?.add(new hz.Vec3(0, -11, 0)), oldPos.clone(), t / (this.props.nodeResetTime * 1000))
            this.props.nodeVisuals?.position.set(newPos)
        }, 16)

        // Finish regrowing once the nodeResetTime has elapsed
        this.async.setTimeout(() => {
            // Stop regrowing vfx
            World.world?.stopVfx("VFX_NodeReset")
            // Stop regrowing animation
            this.async.clearInterval(anim)
            this.props.nodeVisuals?.position.set(oldPos)
            // Reenable collision
            this.entity.tags.add("RESOURCE")
            this.nodeState = NodeState.Ready
        }, this.props.nodeResetTime * 1000 + 500)
    }

    /**
     * Returns healthbar scale value.
     * @returns Healthbar scale.
     */
    public getOriginalHealthBarScale(): hz.Vec3 {
        return this.originalHealthBarScale.clone();
    }

    /**
     * Returns healthbar numeric gizmo scale value.
     * @returns Healthbar numeric gizmo scale.
     */
    public getOriginalNumericScale(): hz.Vec3 {
        return this.originalNumericScale.clone();
    }

    /**
     * Returns healthbar parent position value.
     * @returns Healthbar parent position.
     */
    public getOriginalWrapperPosition(): hz.Vec3 {
        return this.originalWrapperPosition.clone();
    }
}
hz.Component.register(GlobalResourceNode)