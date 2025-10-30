import * as hz from 'horizon/core'
import * as Globals from 'Globals'

//-------------------------------------------------------------------------------------------------------------------------------
//-                                                     VFX API                                                                 -
//-------------------------------------------------------------------------------------------------------------------------------

var queuedFx: Globals.VfxItem[] = []

/** 
* Get an item to play from the VFX queue, if any.
* 
* @returns VfxItem - The item to be played
*/
export function vfxQueueReadOne(): Globals.VfxItem | undefined {
    return queuedFx.pop()
}

/** 
* Add an item to play to the VFX queue.
* 
* @param item - The item to be queued
*/
export function vfxQueueAdd(item: Globals.VfxItem) {
    queuedFx.push(item)
}

/** 
* Utility - Make a quick estimate of where a gem should launch from.  (Exported)
* 
* @param player - The Horizon player who's backpack we are calculating
*/
export function calculateBackpackPosition(player: hz.Player): hz.Vec3 {
    let fwdOffset = player.forward.get()
    let upOffset = player.up.get().mul(0.15)
    return player.position.get().add(fwdOffset.mul(-0.35).add(upOffset))
}

/** 
* Internal - The gem floats up from the backpack to over the players head, then launches.   This is the "floated" position.
* 
* @param player - The Horizon player who's launch position we are calculating
*/
function calculateLaunchPosition(player: hz.Player): hz.Vec3 {
    let fwdOffset = player.forward.get()
    let upOffset = player.up.get()
    return player.position.get().add(fwdOffset.mul(-0.35).add(upOffset))
}

//-------------------------------------------------------------------------------------------------------------------------------
//-                                              GEM LAUNCHER EFFECT                                                            -
//-------------------------------------------------------------------------------------------------------------------------------

/** 
* Utility - Solve the gravity acceleration equation based on the launch velocity increased per vertical distance.
* 
* NOTE: Returns 0 if not solvable.
* 
* @param startPos -  The launch start position
* @param endPos - The final target position
* @param velocity - The launch velocity
*/
function calculateTimeToImpact(startPos: hz.Vec3, endPos: hz.Vec3, velocity: hz.Vec3): number {
    let vertical = endPos.y - startPos.y
    velocity.y += Math.max(0.5 * vertical, 0.0)      // goose launch velocity a little if we need to go farther
    let temp = velocity.y * velocity.y + 2.0 * Globals.GRAVITY * vertical
    if (temp >= 0.0) {
        temp = Math.sqrt(temp)
        let solution1 = (-velocity.y + temp) / Globals.GRAVITY
        let solution2 = (-velocity.y - temp) / Globals.GRAVITY
        //console.log("LAUNCH: ABOVE: sln=( "+ solution1 + ", " + solution2 + " ) d="+vertical+ " V2="+velocity.y*velocity.y+" 4ac="+2.0*Globals.GRAVITY*vertical)
        return Math.max(solution1, solution2)
    } else {
        console.log("LAUNCH: ERR impossible" + vertical + " S=" + startPos.toString() + "  E=" + endPos.toString() + "\n" +
            " V2=" + velocity.y * velocity.y + " 4ac=" + 2.0 * Globals.GRAVITY * vertical)
    }

    return 0
}

 /**
 * GemLauncher class;
 * 
 * A wrapper for all the functionality around the effect for launching gems from a platform into the converter, with a public facing API.
 * 
 */

export class GemLauncher {

    static trailEntities: hz.Entity[] = []
    static nextTrail: number = 0

    constructor() { }

    /** 
    * Parse the child entities of the trailGroup parent entity and store them as our trails.  Do this once on world startup.
    * 
    * @param trailGroup - The trailGroup entity, a parent of all the trail entities
    */
    public initializeTrails(trailGroup: hz.Entity | undefined) {
        console.log("Trail construct")
        const trailEntities = trailGroup?.children.get()
        if (!trailEntities) {
            console.error("Missing trailGroup object/hierarchy during loading")
            return
        }
        console.log("Trail items=" + trailEntities.length)
        for (var trailEnt of trailEntities) {
            GemLauncher.trailEntities.push(trailEnt)
        }
        GemLauncher.nextTrail = 0
    }

    /** 
    * Set up VFX data for launch.   (Initial velocities, entities to use)
    * 
    * @param gemMap - The gem set owned by the launching player
    * @param data - The game objects involved in this launch. Gems, trails, VFX flash, text etc.
    * @param flightData - Physical information about the launch.  Velocities, positions, times etc.
    */
    public initializeLaunchVfx(gemMap: Map<string, Globals.GemRecord> | undefined, data: Globals.ResourceConverterRecord, flightData: Globals.GemVfxPhysicsRecord) {
        // initialize velocities which will get us into the hopper from the bottom level
        const launchVelocity = 5.0
        flightData.green.vel1 = hz.Vec3.zero
        flightData.green.vel1.y = launchVelocity
        flightData.blue.vel1 = hz.Vec3.zero
        flightData.blue.vel1.y = launchVelocity
        flightData.purple.vel1 = hz.Vec3.zero
        flightData.purple.vel1.y = launchVelocity
        flightData.red.vel1 = hz.Vec3.zero
        flightData.red.vel1.y = launchVelocity

        gemMap?.forEach((gemRec, name) => {
            if (name.search(/TextParent/i) != Globals.NONE) {
                data.textVfxParent = gemRec
            }
            else if (name.search(/Green/i) != Globals.NONE) {
                data.green.gem = gemRec
            }
            else if (name.search(/Purple/i) != Globals.NONE) {
                data.purple.gem = gemRec
            }
            else if (name.search(/blue/i) != Globals.NONE) {
                data.blue.gem = gemRec
            }
            else if (name.search(/Red/i) != Globals.NONE) {
                data.red.gem = gemRec
            }
        })

        if (!data.green.gem || !data.blue.gem || !data.purple.gem || !data.red.gem || !data.textVfxParent) {
            console.warn("GEM: VFX ERROR: failed to resolve all gems")
        }
    }

    /** 
    * Utility - Increment the next index for the trail pool
    */
    private incrementTrailIndex() {
        GemLauncher.nextTrail++
        if (GemLauncher.nextTrail >= GemLauncher.trailEntities.length) {
            GemLauncher.nextTrail = 0
        }
    }

    /** 
    * Check for the next gem to launch out of the backpack; start it in flight.  Return false if no more gems can be launched.
    * 
    * @param player - The Horizon player, for calculating backpack position.
    * @param gemMap - The gem set owned by the launching player.
    * @param data - The game objects involved in this launch. Gems, trails, VFX flash, text etc.
    * @param flightData - Physical information about the launch.  Velocities, positions, times etc.
    * @returns - True if we launched something, false if we dont have anything to launch.
    */
    public launchGems(player: hz.Player, gemMap: Map<string, Globals.GemRecord> | undefined, data: Globals.ResourceConverterRecord, flightData: Globals.GemVfxPhysicsRecord): boolean {

        if (data.green.amount > 0 && flightData.green.lerp <= 0.0) {
            flightData.green.pos1 = calculateBackpackPosition(player)
            flightData.green.lerp = 0.0001
            data.green.trailEntity = GemLauncher.trailEntities[GemLauncher.nextTrail] ?? null
            this.incrementTrailIndex()
            console.log("LAUNCH green: " + flightData.green.pos1.toString() + " <-> " + flightData.green.pos2.toString())
            return true
        }
        else if (data.blue.amount > 0 && flightData.blue.lerp <= 0.0) {
            flightData.blue.pos1 = calculateBackpackPosition(player)
            flightData.blue.lerp = 0.0001
            data.blue.trailEntity = GemLauncher.trailEntities[GemLauncher.nextTrail] ?? null
            this.incrementTrailIndex()
            console.log("LAUNCH blue: " + data.blue.gem?.entity.name.get())
            return true
        }
        else if (data.purple.amount > 0 && flightData.purple.lerp <= 0.0) {
            flightData.purple.pos1 = calculateBackpackPosition(player)
            flightData.purple.lerp = 0.0001
            data.purple.trailEntity = GemLauncher.trailEntities[GemLauncher.nextTrail] ?? null
            this.incrementTrailIndex()
            console.log("LAUNCH purple: " + flightData.purple.pos1.toString() + " <-> " + flightData.purple.pos2.toString())
            return true
        }
        else if (data.red.amount > 0 && flightData.red.lerp <= 0.0) {
            flightData.red.pos1 = calculateBackpackPosition(player)
            flightData.red.lerp = 0.0001
            data.red.trailEntity = GemLauncher.trailEntities[GemLauncher.nextTrail] ?? null
            this.incrementTrailIndex()
            console.log("LAUNCH red: " + flightData.red.pos1.toString() + " <-> " + flightData.red.pos2.toString())
            return true
        }
        return false
    }

    /** 
    * Internal - Set the horizontal component of the launch velocity so we are at the target at the impact time.
    * 
    * @param flightData - Physical information about the launch.  Velocities, positions, times etc.
    * @param targetEntity - An entity at the position we launch the gem to.
    */
    private setPhysicsLaunch(flightData: Globals.PhysicsRecord, targetEntity: hz.Entity | null) {
        flightData.t = 0.0
        if (targetEntity) {
            let t = calculateTimeToImpact(flightData.pos1, targetEntity.position.get(), flightData.vel1)
            if (t > 0) {
                let diff = targetEntity.position.get().sub(flightData.pos1)
                diff.x += Math.random() - 0.5                                   // a little variance in where we hit
                diff.z += Math.random() - 0.5
                flightData.vel1.x = diff.x * (1.0 / t)
                flightData.vel1.z = diff.z * (1.0 / t)

                flightData.t = t
            }
        }
        else {
            console.warn("GEM: no target for launch")
        }
    }

    /** 
    * Internal - Launch the conversion text box across the screen
    * 
    * @param flightData - Physical information about the launch.  Velocities, positions, times etc.
    * @param amount - The amount converted; ie +200
    * @param textVfxParentEntity - The text game object we are using
    */
    private setTextLaunch(flightData: Globals.PhysicsRecord, amount: number, textVfxParentEntity: hz.Entity | null) {
        if (flightData.t > 0 && textVfxParentEntity) {
            let textEnt = textVfxParentEntity.children.get()[0]             // The text box is the only child
            textEnt?.as(hz.TextGizmo).text.set("+" + amount.toString())     // Draw the +X coin conversion effect
            let text3dPos = flightData.pos1.clone()
            text3dPos.y += 0.25
            textVfxParentEntity.position.set(text3dPos)

            flightData.pos2 = text3dPos
            flightData.vel2.x = flightData.vel1.z * -0.25                   // Swap x,z, gives velocity to the left
            flightData.vel2.y = flightData.vel1.y * 0.25
            flightData.vel2.z = flightData.vel1.x * 0.25
        }
    }

    /** 
    * Internal - Update physics. Move gems and text boxes forward one tick.
    * 
    * @param flightData - Physical information about the launch.  Velocities, positions, times etc.
    * @param flightEntity - The game object for the gem entity
    * @param textVfxParentEntity - The game object for the text box
    */
    private updateVelAndPos(flightData: Globals.PhysicsRecord, flightEntity: hz.Entity | null, textVfxParentRec: Globals.GemRecord | null): boolean {
        if (flightData.t > 0.0) {
            flightData.vel1.y += Globals.GRAVITY * Globals.FIXED_INTERVAL               // Move the gem
            flightData.pos1.addInPlace(flightData.vel1.mul(Globals.FIXED_INTERVAL))
            flightEntity?.position.set(flightData.pos1)

            flightData.vel2.y += Globals.GRAVITY * Globals.FIXED_INTERVAL               // Move the text
            flightData.pos2.addInPlace(flightData.vel2.mul(Globals.FIXED_INTERVAL))
            textVfxParentRec?.entity.position.set(flightData.pos2)

            flightData.t -= Globals.FIXED_INTERVAL                                      // When we reach the impact time
            if (flightData.t < 0) {                                                     //   shut off the movement and
                flightData.lerp = 0                                                     //   play the impact VFX
                vfxQueueAdd({ name: "VFX_FireImpactD", pos: flightData.pos1 })
                return true
            }
        }
        return false
    }

    /** 
    * Internal - Manage flying one gem.  Float it out of the backpack and then launch it into the converter.
    * 
    * @param player - The Horizon player; used for launch start positions.
    * @param metaData - All the game objects involved in this launch. Need the target entity and the text entity from here.
    * @param flightData - Physical information about the launch.  Velocities, positions, times etc.
    * @param data - The particular objects for one gem; the gem & trail.
    */
    private updateOneGemFlight(player: hz.Player, metaData: Globals.ResourceConverterRecord, flightData: Globals.PhysicsRecord, data: Globals.ConverterRecord) {
        if (!data.gem) {
            return
        }

        if (flightData.t < 0) {
            if (data.amount > 0 && flightData.lerp > 0) {
                // Push the gem up from the backpack to a safe position above the player, scale it to full size
                flightData.lerp += 1.0 / 20.0
                flightData.pos1 = hz.Vec3.lerp(calculateBackpackPosition(player), calculateLaunchPosition(player), flightData.lerp)
                data.gem.entity?.position.set(flightData.pos1)
                data.trailEntity?.position.set(flightData.pos1)
                let currScale = hz.Vec3.lerp(hz.Vec3.zero, data.gem.startScale, flightData.lerp)
                data.gem.entity?.scale.set(currScale)
                if (flightData.lerp >= 1.0) {
                    this.setPhysicsLaunch(flightData, metaData.targetEntity)
                    this.setTextLaunch(flightData, data.amount, metaData.textVfxParent?.entity ?? null)
                } else if (flightData.lerp > 0.5) {
                    data.trailEntity?.as(hz.TrailGizmo).play()
                    console.log("TRAIL: play " + (data.trailEntity?.name.get() ?? "NULL") + " " + (data.gem.entity?.name.get() ?? "NULL"))
                }
            }
        }
        else {
            // Fly the gem in an arc to the target, fly the +X text to the side. Hide the gem & text when we are done
            if (this.updateVelAndPos(flightData, data.gem.entity, metaData.textVfxParent)) {
                data.amount = 0
                data.gem.entity?.position.set(data.gem.startPos)
                data.gem.entity?.scale.set(data.gem.startScale)
                metaData.textVfxParent?.entity.scale.set(metaData.textVfxParent.startScale)
                metaData.textVfxParent?.entity.position.set(metaData.textVfxParent.startPos)
                data.trailEntity?.as(hz.TrailGizmo).stop()
                data.trailEntity = null
            }
            // make sure the trail follows 
            if (data.trailEntity) {
                data.trailEntity.position.set(flightData.pos1)
            }
        }
    }

    /** 
    * Manage flight for all gems.
    * 
    * @param player - The Horizon player; used for launch start positions.
    * @param data - All the game objects involved in this launch.
    * @param flightData - Physical information about the launch.  Velocities, positions, times etc.
    * @returns True while gems are in flight, False when flight has ended. 
    */
    public updateGemFlight(player: hz.Player, data: Globals.ResourceConverterRecord, flightData: Globals.GemVfxPhysicsRecord): boolean {
        if (data.green.gem?.entity) {
            this.updateOneGemFlight(player, data, flightData.green, data.green)
        }
        if (data.blue.gem?.entity) {
            this.updateOneGemFlight(player, data, flightData.blue, data.blue)
        }
        if (data.purple.gem?.entity) {
            this.updateOneGemFlight(player, data, flightData.purple, data.purple)
        }
        if (data.red.gem?.entity) {
            this.updateOneGemFlight(player, data, flightData.red, data.red)
        }
        return (data.green.amount + data.blue.amount + data.purple.amount + data.red.amount > 0)    // return false when no gems are flying
    }

}