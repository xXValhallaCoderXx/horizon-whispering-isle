import { refreshBackpack } from 'CUIHUD'
import * as hz from 'horizon/core'
import { NpcManager } from 'NpcComponent'
import * as Globals from 'Globals'
import { World } from 'World'


/**
 * Base ResourceNode class;
 * 
 * This is your infinite resource supply that a player can extract.
 * 
 * Props:
 * @param resourceType - The string nameID of the resource of that node.
 * @param toolType - Required toolType to extract this resource node.
 * @param workToExtract - How much work does a player need to complete to obtain the reward.
 * @param vfxEntity - Reference to the vfx entity.
 * @param vfxColor - Vfx color.
 * 
 */

export class ResourceNode extends hz.Component<typeof ResourceNode> {
    static propsDefinition = {
        resourceType: { type: hz.PropTypes.String, default: "GREEN" },
        toolType: { type: hz.PropTypes.String, default: "pickaxe" },
        workToExtract: { type: hz.PropTypes.Number, default: 10 },
        vfxEntity: { type: hz.PropTypes.Entity, },
        vfxColor: { type: hz.PropTypes.Color },
    }

    // Internal vfx params
    originalGemVfxScale = hz.Vec3.zero
    originalGemVfxPosition = hz.Vec3.zero


    // Setting return to pool position
    start(): void { 
        this.originalGemVfxScale = this.props.vfxEntity?.scale.get() ?? hz.Vec3.zero
        this.originalGemVfxPosition = this.props.vfxEntity?.position.get() ?? hz.Vec3.zero
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
        const simPlayer = World.world?.getSimPlayer(player.name.get())
        if (simPlayer == null || simPlayer == undefined) {
            console.error("SimPlayer not found to register hit!")
            return
        }

        // Check resource type, reset progress if new resource
        if (simPlayer.lastExtractedType == this.props.resourceType) {
            simPlayer.extractionProgress += progressAdded
        } else {
            simPlayer.lastExtractedType = this.props.resourceType
            simPlayer.extractionProgress = progressAdded
        }

        // If enough progress is made, give reward to player
        if (this.props.workToExtract <= (simPlayer?.extractionProgress ?? 0)) {
            this.allocateRewards(player)
        }
    }

    /**
     * Give player the reward.
     * @param player - Player to give the reward to.
     */
    allocateRewards(player: hz.Player) {
        const simPlayer = World.world?.getSimPlayer(player.name.get())
        if (simPlayer == null || simPlayer == undefined) {
            console.error("SimPlayer not found to allocate resources!")
            return
        }

        // Calculate player backpack capacity limit
        const capLimit = Math.floor(((simPlayer.inventoryCapacity) - simPlayer?.getResourcesWeight()) / (Globals.RESOURCE_WEIGHT_MAP.get(this.props.resourceType) ?? 1))
        let playerReward = 1 * Math.floor(simPlayer.extractionProgress / this.props.workToExtract)

        if (playerReward > capLimit) {
            // Play capacity reached sfx
            World.world?.playSoundAt("SFX_MaxInventory", player.position.get())
            this.async.setTimeout(() => {
                World.world?.playSoundAt("SFX_MaxInventory", player.position.get())
            }, 100)      
            NpcManager.onPlayerInventoryFull(player);
        } else {
            // Play reward vfx
            if (this.props.vfxEntity) {
                World.world?.playGemVfx(player, this.props.vfxEntity, this.props.vfxColor, this.originalGemVfxScale, this.originalGemVfxPosition)
            }
            // Play reward sfx
            this.async.setTimeout(() => {
                World.world?.playSoundAt("SFX_ObtainItem_Alt", player.position.get())
            }, 100)
        }

        // Give player the reward
        playerReward = Math.min(playerReward, capLimit)
        simPlayer.addPlayerResource(this.props.resourceType, playerReward)
        if(playerReward >= 1.0) {
            NpcManager.onPlayerCollectedResource(player, `${playerReward} ${this.props.resourceType}`);
        }
            
        // Refresh player's individual progress bar if it's tracking this active resource
        if (simPlayer.lastExtractedType == this.props.resourceType) {
            simPlayer.extractionProgress = (simPlayer.extractionProgress - this.props.workToExtract) % this.props.workToExtract
        }

        // Refresh backpack UI bar
        refreshBackpack(player)
    }
}
hz.Component.register(ResourceNode)