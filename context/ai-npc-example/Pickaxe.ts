import * as hz from 'horizon/core'
import { ResourceNode } from 'ResourceNode'

import { World } from 'World'

import { refreshBar, refreshBackpack } from 'CUIHUD'
import { GlobalResourceNode } from 'GlobalResourceNode'
import { NpcManager } from 'NpcComponent'
import * as Anim from 'SimpleAnimation'
import { GRABBABLE_NAMES } from 'Globals'

// Pickaxe states
enum MiningState {
    NotMining = 0,
    Backswing = 1,
    Mineswing = 2,
}

/**
 * Pickaxe class;
 * 
 * This is your pickaxe - a tool type that is able to interact with resource nodes.
 * 
 * Props:
 * @param name - The string nameID of the tool
 * @param toolType - toolType signature of the tool, resource nodes require a particular type to extact resources
 * @param primaryResource - the string nameID of the resource that this tool extracts best
 * @param primaryMult - the multiplier on the power of the pickaxe when extracting the CORRECT resource
 * @param secondaryMult - the multiplier on the power of the pickaxe whem extracting the INCORRECT resource
 * 
 */
export class Pickaxe extends hz.Component<typeof Pickaxe> {
    static propsDefinition = {
        name: { type: hz.PropTypes.String, default: "PICKAXE" },
        toolType: { type: hz.PropTypes.String, default: "pickaxe" },
        primaryResource: { type: hz.PropTypes.String, default: "GREEN_ORE" },
        primaryMult: { type: hz.PropTypes.Number, default: 2 },
        secondaryMult: { type: hz.PropTypes.Number, default: 0.5 },
    }

    isMining: MiningState = MiningState.NotMining   // current state
    startingPosition: hz.Vec3 = hz.Vec3.zero        // pooling position
    prevTimeoutID: number = 0
    prevCollisionMS: number = 0

    start(): void {
        this.startingPosition = this.entity.position.get().clone()
        
        // Setup tool state machine
        this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnIndexTriggerDown, (player: hz.Player) => {
            // dont swing if I am already swinging
            if (this.isMining != MiningState.NotMining) {
                return
            }

            // Exercise: Implement full axe swings for VR
            const owner = this.entity.owner.get()
            if(owner.deviceType.get() == hz.PlayerDeviceType.VR) {
                return
            }
            
            // play swinging animation
            player.playAvatarGripPoseAnimationByName('Fire')
            this.isMining = MiningState.Backswing
            
            // play sfx
            World.world?.playSoundAt("SFX_Pickaxe_Miss", player.position.get())
            NpcManager.onPlayerAxeMissed(player);
            this.async.clearTimeout(this.prevTimeoutID)
            
            
            this.prevTimeoutID = this.async.setTimeout(() => {
                this.isMining = MiningState.Mineswing
                // play sfx again
                World.world?.playSoundAt("SFX_Pickaxe_Miss", player.position.get())
                
                this.prevTimeoutID = this.async.setTimeout(() => {
                    this.isMining = MiningState.NotMining
                }, 400)   // available to swing again at 900+400ms, matches animation
            }, 900)
        })

        // Connect onCollision event
        this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnEntityCollision, (entity, collisionPoint) => {
            const owner = this.entity.owner.get()
            const deviceType = owner.deviceType.get()
            const now = Date.now()
            // VR players don't swing by animation timing rules so this is a basic rate limit
            if(deviceType == hz.PlayerDeviceType.VR && (now - this.prevCollisionMS < 500)) {
                return
            }
            if ((this.isMining == MiningState.Mineswing || deviceType == hz.PlayerDeviceType.VR)
                && entity.getComponents<ResourceNode>() ) {
                this.prevCollisionMS = now;
                this.onCollision(entity, collisionPoint)
            }
        })
        
        // Connect grabbable swap to button press
        this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnButton1Down, (player: hz.Player) => {
            this.swapGrabbable(player)
        })
    }

    public onCollision(targetEntity: hz.Entity, collisionPoint: hz.Vec3) {
        let simPlayer = World.world?.getSimPlayer(this.entity.owner.get().name.get())
        if (!simPlayer) {
            console.error("No simPlayer found for mining")
            return
        }
        
        this.isMining = MiningState.NotMining
        const resource = targetEntity.getComponents<GlobalResourceNode>()[0]

        // shake the red node bar if it exists
        if (resource.props.healthWrapper) {
            Anim.animatedShake(resource.props.healthWrapper, resource.getOriginalWrapperPosition(), null, 8)
        }

        // play a VFX at the collision pos
        // move VFX slightly out of rock, towards player for better clipping
        let movedOut = hz.Vec3.lerp(collisionPoint, simPlayer.player.position.get(), 0.15)
        World.world?.playVfxAt("VFX_ImpactA", movedOut)


        // calculate the amount of progress the hit generated
        let progress = 1
        progress *= simPlayer.getPlayerTool(this.props.name)
        NpcManager.onPlayerAxeHitOre(simPlayer.player);
        // check if we are hitting a matching resource
        if (this.props.primaryResource == resource.props.resourceType) {
            progress *= this.props.primaryMult
            // play 'matching resource' sfx
            World.world?.playSoundAt("SFX_Pickaxe_Hit", collisionPoint)
        }
        else {
            progress *= this.props.secondaryMult
            // play 'non-matching resource' sfx
            World.world?.playSoundAt("SFX_DullPickaxe", collisionPoint)
            NpcManager.onPlayerAxeDull(simPlayer.player);
        }
        progress = Math.ceil(progress)

        // check if the tool is of a correct type
        if (resource.props.toolType == this.props.toolType) {
            // send a register hit event to the resource node to handle
            resource.registerHit(this.entity.owner.get(), progress)
            
            // update UI
            simPlayer.extractionThreshold = resource.props.workToExtract
            refreshBar(this.entity.owner.get(), progress)
            refreshBackpack(this.entity.owner.get())
        }
        else {
            console.log(`Player ${simPlayer.player.name} ${this.props.toolType} cannot extract ${resource.props.resourceType}`)
        }
    }
    
    /**
     * Swaps to the next grabbable that the player owns
     * @param player 
     * @returns 
     */
    public swapGrabbable(player: hz.Player) {
        let grabbableLevels: number[] = []
        let currentGrabbable: number = -1
        
        let simPlayer = World.world?.getSimPlayer(player.name.get())
        if (!simPlayer) {
            console.error("No player found to swap equipped grabbables")
            return
        }
        
        // calculate grabbable levels
        for (let i = 0; i < GRABBABLE_NAMES.length; i++) {
            grabbableLevels.push(simPlayer.getPlayerTool(GRABBABLE_NAMES[i]))
            
            if (simPlayer.saveGame?.getEquippedGrabbable() == GRABBABLE_NAMES[i]) {
                currentGrabbable = i;
            }
        }
        
        // didn't find an equipped grabbable
        if (currentGrabbable == -1) {
            console.error("Missing grabbable in the record")
            return
        }
        
        // cycle through grabbables to find next one
        for (let i = 1; i < GRABBABLE_NAMES.length; i++) {
            let nextGrabbable: number = (currentGrabbable + i) % GRABBABLE_NAMES.length
            
            if (grabbableLevels[nextGrabbable] != -1) {
                
                if (!simPlayer.toolMap.has(GRABBABLE_NAMES[nextGrabbable])) {
                    console.error(`No ${GRABBABLE_NAMES[nextGrabbable]} found in ToolMap for player ${player.name}`)
                }
                simPlayer.equipGrabbable(GRABBABLE_NAMES[nextGrabbable])
                
                // play sfx
                World.world?.playSoundAt("SFX_ToolSwap", player.position.get())
                
                // next grabbable found, return
                return
            }
        }
    }

    public returnToPool() {
        this.entity.position.set(this.startingPosition.clone())
    }
    
    public returnToPoolDelayed() {
        this.async.setTimeout(() => {
            this.entity.position.set(this.startingPosition.clone())
        }, 1000)
    }

}
hz.Component.register(Pickaxe)
