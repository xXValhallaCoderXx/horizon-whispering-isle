import * as hz from 'horizon/core'
import { SimPlayer } from 'SimPlayer'
import { debuglog } from 'DebugBoard'
import { ToolGroups, Tool } from 'ToolGroups'
import * as Vfx from 'Vfx'
import * as Anim from 'SimpleAnimation'
import * as Globals from 'Globals'
import { Npc } from 'horizon/npc'

type PlayerRecord = {
    id: number, player: SimPlayer | null
}

export const playerAddedEvent = new hz.NetworkEvent<{ player: hz.Player }>("playerAddedEvent")
export const playerRemovedEvent = new hz.NetworkEvent<{ player: hz.Player }>("playerRemovedEvent")

/*
 * The world is a container for everything which happens on the scale of the entire game.
 *
 * It contains a list of all the players in the world, and lists of the game objects for the various tools (pickaxes, backpack).
 *   When the world loads, it initializes a bunch of these lists.
 *   When players enter/exit the world they are managed by addPlayer()/removePlayer(). These functions include things
 *   like assigning a set of tool objects to a player, notifying the Store, and reading the savegame to restore the
 *   correct gamestate.
 *   You can get game info for a player with getSimPlayer(playerName).
 * 
 * World also contains global things that any function might need access to, like sound or VFX.
 *   Functions like playSoundAt(soundname, location) and playVfxAt(vfxname, location) are part of the World class.
 *   Assemblies of game objects and Vfx called Vfx Packages also are part of the World class.
 *   These Packages handle specific effects in the game, like when a gem is launched into the converter.
 */

 /**
 * World class;
 * 
 * The world manages the players and all of the objects in the game (tools, gems, sounds, etc). 
 * 
 * Props:
 * @param toolGroups - The parent object that holds a group of tools.  The world will try to load any objects in this group into the unassignedToolMaps. 
 * @param fxGroups - A parent object that holds SFX and VFX.  Objects in this group are loaded into the fxMap to be available for use.
 * @param trailGroups - A parent object holding trails for the gem throw into the converter.
 * @param gemGroups - A parent object holding gems which could be launched into the converter.
 * @param ftueSpawnPoint - If you are a First Time User, the world teleports you to this spawn point to start your intro Experience.
 * 
 */

export class World extends hz.Component<typeof World> {
    static propsDefinition = {
        toolGroups: { type: hz.PropTypes.Entity, default: undefined },
        fxGroups: { type: hz.PropTypes.Entity, default: undefined },
        trailGroups: { type: hz.PropTypes.Entity, default: undefined },
        gemGroups: { type: hz.PropTypes.Entity, default: undefined },
        ftueSpawnPoint: { type: hz.PropTypes.Entity, default: undefined },
    }


    static playerMap: Map<string, PlayerRecord> = new Map<string, PlayerRecord>()       // All the players in the game 
    static unassignedToolMaps: Map<string, Tool>[] = []                                 // The tool objects which could be assigned to players
    static unassignedGemMaps: Map<string, Globals.GemRecord>[] = []                     // The gem objects which could be assigned. For launching 
    static fxMap: Map<string, hz.Entity> | null = null                                  // All the FX loaded, both SFX and VFX
    static launcherWrapper: Vfx.GemLauncher = new Vfx.GemLauncher                       // The world manages the gem launcher (for packaged VFX)
    static maxPlayers: number = 8
    static isDebug: boolean = false

    static world: World | null = null

    /**
    * On world startup find all the game objects and set up the lists for managing them.
    */
    start(): void {
        World.world = this

        // Parse all the game objects into lists we can manage
        this.constructToolMaps()
        this.constructFxMaps()
        this.constructGemMaps()
        World.launcherWrapper.initializeTrails(this.props.trailGroups)

        // Check if players entered before this component started
        let playerList = this.world.getPlayers()
        debuglog("WORLD: start P=" + playerList.length, "StatusBoard")
        for (let player of playerList) {
            this.addPlayer(player)
        }

        // Events
        this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterWorld, (player: hz.Player) => {
            if(Npc.playerIsNpc(player)) {
                return;
            }

            this.addPlayer(player)
        })
        this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerExitWorld, (player: hz.Player) => {
            this.removePlayer(player)
        })
    }

    /**
    * Set up the game info for a new player; get tools and gems from the world, give items like pick and backpack
    * @param player - The horizon representation of the player
    */
    private addPlayer(player: hz.Player): void {
        // Safety checks
        if(Npc.playerIsNpc(player)) {
            return;
        }
        
        if (World.playerMap.has(player.name.get())) {
            debuglog(`Player ${player.name.get()} already exists in player map.`)
            return
        }
        if (World.playerMap.size >= World.maxPlayers) {
            debuglog(`Cannot add player ${player.name.get()}: maximum player limit reached (${World.maxPlayers})`)
            return
        }
        debuglog("WORLD: add player " + player.name.get())

        // Give new player a toolMap and a gemMap
        const simPlayer = new SimPlayer(player, this.world)
        const toolMap = World.unassignedToolMaps.pop()
        if (toolMap) {
            simPlayer.toolMap = toolMap
            console.log(`Added toolMap of size: ${toolMap.size} to player ${player.id}`)
        }
        else {
            console.warn("Missing tool map for a new player!")
        }
        const gemMap = World.unassignedGemMaps.pop()
        if (gemMap) {
            simPlayer.gemMap = gemMap
        }
        else {
            console.warn("Missing gem map for new player!")
        }

        // Put new player into the playerMap
        World.playerMap.set(player.name.get(), { id: player.id, player: simPlayer })

        // Give player their current backpack and pick (from saveGame)
        if (simPlayer.saveGame?.getEquippedAttachable() != "") {
            simPlayer.equipAttachable(simPlayer.saveGame?.getEquippedAttachable())
        }

        if (simPlayer.saveGame?.getEquippedGrabbable() != "") {
            this.async.setTimeout(() => {
                simPlayer.equipGrabbable(simPlayer.saveGame?.getEquippedGrabbable())
            }, 350)
        }

        // If we are First Time Users, port to the intro space
        if (!simPlayer.saveGame?.hasCompletedFTUE() && this.props.ftueSpawnPoint) {
            this.props.ftueSpawnPoint.as(hz.SpawnPointGizmo).teleportPlayer(simPlayer.player)
        }

        // Notify that the player is done setting up; mostly for Store
        this.sendNetworkBroadcastEvent(playerAddedEvent, { player })
    }

    /**
    * Give the world back all the tools and gems we borrowed; remove self from playerMap
    * @param player - The horizon representation of the player
    */
    private removePlayer(player: hz.Player): void {

        if(Npc.playerIsNpc(player)) {
            return;
        }
        
        // Return toolMap to the pool, we're leaving so someone else can have it. Same with gems.
        const simPlayer = this.getSimPlayer(player.name.get())
        if (simPlayer != null && simPlayer.toolMap.size > 0) {
            World.unassignedToolMaps.push(simPlayer.toolMap)
        } else {
            console.warn("Could not read a tool map to the pool")
        }
        if (simPlayer != null && simPlayer.gemMap.size > 0) {
            World.unassignedGemMaps.push(simPlayer.gemMap)
        } else {
            console.warn("Could not return player gem map to the pool")
        }

        // Shut down the game representation of this player
        simPlayer?.onSimPlayerExit()

        // Try to delete player from the playerMap
        if (!World.playerMap.has(player.name.get())) {
            debuglog(`Player ${player.name.get()} not in playerMap.`)
            return
        }
        if (!World.playerMap.delete(player.name.get())) {
            debuglog(`Player ${player.name.get()} remove FAILS.`)
            return
        }

        // Notify the game we are done, mostly for Store
        this.sendNetworkBroadcastEvent(playerRemovedEvent, { player })

        debuglog("WORLD: remove player " + player.name.get())
    }

    /**
    * Read all the tool objects from the world.
    * 
    * NOTE: These objects must be in the toolGroup and they must have a tool script component (like backpack.ts or pickaxe.ts)
    */
    private constructToolMaps(): void {
        // Find the tool groups, there should be eight (for eight players) for this game.
        const unassignedGroups = this.props.toolGroups?.children.get()
        if (!unassignedGroups) {
            console.error("Mission toolGroup reference")
            return
        }

        // Extract all the children from the groups, these should be the tools.  Put each group into the map as a set of tools.
        for (var group of unassignedGroups) {
            const toolEntities = group.children.get()
            const toolMap = new Map<string, Tool>()

            for (var toolEnt of toolEntities) {
                const toolScript = toolEnt.getComponents<hz.Component>()[0]
                toolMap.set(toolScript.props.name, new Tool(toolScript.props.name, toolEnt))
            }

            World.unassignedToolMaps.push(toolMap)
        }
    }

    /**
    * Read the SFX and VFX objects from the world; put them in the fxMap so we can use them
    */
    private constructFxMaps(): void {
        const fxEntities = this.props.fxGroups?.children.get()
        if (!fxEntities) {
            console.error("Missing fxGroup object/hierarchy during loading")
            return
        }
        console.log("FX items=" + fxEntities.length)

        // Find the all the SFX and VFX in the group, these are the FX we can use
        const fxMap = new Map<string, hz.Entity>()
        for (var fxEnt of fxEntities) {
            fxMap.set(fxEnt.name.get(), fxEnt)
        }

        World.fxMap = fxMap
    }

    /**
    * Read gem objects from the world.
    * 
    * NOTE: Eight players means eight maps of each of the four gems. All players could launch all gems at the same time, so we need to have one of each for everyone.
    */
    private constructGemMaps(): void {
        const unassignedGroups = this.props.gemGroups?.children.get()
        if (!unassignedGroups) {
            console.error("GEM ERR: Missing gem group object")
            return
        }

        // Extract all the gem objects from each group, add them to the map.  (Each group should contain a complete set; a green, blue, purple and red gem object) 
        for (var group of unassignedGroups) {
            const gemEntities = group.children.get()
            const gemMap = new Map<string, Globals.GemRecord>()

            for (var gemEnt of gemEntities) {
                gemMap.set(gemEnt.name.get(), new Globals.GemRecord(gemEnt))
            }

            World.unassignedGemMaps.push(gemMap)
        }
    }

    //-------------------------------------------------------------------------------------------------------------------------------
    //-                                                     PUBLIC API                                                          -
    //-------------------------------------------------------------------------------------------------------------------------------

    /**
    * Return the SimPlayer object for a given playerName.
    *  
    * NOTE: SimPlayer contains the game state info on a player; which backpacks do they own, how much ore do they have etc.
    * 
    * @param playerName - the player name string 
    */
    public getSimPlayer(playerName: string): SimPlayer | null {
        let record = World.playerMap.get(playerName)
        return record?.player ?? null
    }

    /**
    * Move a sound gizmo to a location and play the sound there. 
    * @param soundName - The sound we are playing.  If it's not in the fxMap it wont get played
    * @param pos - The world coordinates where we play the sound
    */
    public playSoundAt(soundName: string, pos: hz.Vec3): boolean {
        let entity = World.fxMap?.get(soundName)
        let gizmo = entity?.as(hz.AudioGizmo)
        if (!gizmo) {
            console.log("FX: ERR cannot find AudioGizmo for " + soundName)
            return false
        }

        gizmo?.position.set(pos)
        this.async.setTimeout(() => {
            gizmo?.play()      // A delay to move the gizmo to the right place
        }, 50)

        return true
    }

    /**
    * Play a sound out of an fixed location, like the ding-ding-ding when you convert a gem in the resource converter
    * @param soundName - The sound we are playing.  if it's not in the fxMap it wont get played
    * @param repeat - Optional.  Number of times to repeat the sound.
    */
    public playSound(soundName: string, repeat?: number) {
        let entity = World.fxMap?.get(soundName)
        let gizmo = entity?.as(hz.AudioGizmo)
        if (!gizmo) {
            console.log("FX: ERR cannot find AudioGizmo for " + soundName)
            return false
        }

        gizmo?.play()          // No delay, assuming this gizmo is already in the right place
        if ((repeat ?? 0) - 1 > 0) {
            this.async.setTimeout(() => {
                this.playSound(soundName, (repeat ?? 0) - 1)
            }, 100)
        }
    }

    /**
    * Stop playing a sound.
    * @param soundName - The sound we are stopping.  
    */
    public stopSound(soundName: string) {
        let entity = World.fxMap?.get(soundName)
        let gizmo = entity?.as(hz.AudioGizmo)
        if (!gizmo) {
            console.log("FX: ERR cannot find AudioGizmo for " + soundName)
            return false
        }

        gizmo?.stop()
    }

    /**
    * Move a particle gizmo to a location and play it there. 
    * 
    * NOTE: 50ms delay allows the gizmo to "arrive" before playing
    * 
    * @param vfxName - The vfx we are going to play.  Must be in the fxMap.
    * @param pos - The world coordinates where we play the vfx
    */    
    public playVfxAt(vfxName: string, pos: hz.Vec3): boolean {
        let entity = World.fxMap?.get(vfxName)
        let gizmo = entity?.as(hz.ParticleGizmo)
        if (!gizmo) {
            console.log("FX: ERR cannot find ParticleGizmo for " + vfxName)
            return false
        }

        gizmo?.position.set(pos)
        this.async.setTimeout(() => {
            gizmo?.play()      // A delay to move the gizmo to the right place
        }, 50)

        return true
    }

    /**
    * Stop any given vfx.
    * @param vfxName - The vfx we are stopping.  
    */
    public stopVfx(vfxName: string) {
        let entity = World.fxMap?.get(vfxName)
        let gizmo = entity?.as(hz.ParticleGizmo)
        if (!gizmo) {
            console.log("FX: ERR cannot find ParticleGizmo for " + vfxName)
            return false
        }

        gizmo?.stop()
    }

    //-------------------------------------------------------------------------------------------------------------------------------
    //-                                                     PACKAGED VFX                                                            -
    //-------------------------------------------------------------------------------------------------------------------------------

    /**
    * A set of effects to indicate that there was no resource to convert (the backpack was empty when converting)
    * 
    * NOTE: This pulses the players backpack, tints it red and plays a wah-wah sound to indicate failure
    * 
    * @param player - The horizon player affected
    * @param sfxName - The failure sound to use
    */
    public playResourceConverterFail(player: hz.Player, sfxName: string) {
        const simPlayer = World.world?.getSimPlayer(player.name.get())

        // Animate the size and color of the backpack, if we aren't in the middle of an animation already
        if (simPlayer?.startAnimateBackpack() == true && simPlayer?.equippedAttachable?.toolEntity) {
            const colorIterations = 32
            Anim.animatedScale(simPlayer?.equippedAttachable?.toolEntity,
                1.0, 0.5 / colorIterations, simPlayer?.equippedAttachable?.toolEntity?.scale.get(),
                1.5, null)
            Anim.animatedColor(simPlayer?.equippedAttachable?.toolEntity, hz.Color.fromHex("#FF0000"),
                colorIterations, () => {
                    simPlayer?.stopAnimateBackpack()
                    this.playSound(sfxName)
                })

        }
    }

    /**
    * A set of effects which launch gems out of the backpack into the converter.
    * 
    * NOTE: This calcuates a velocity so that gems hit the converter.  It's possible for this equation to 
    *       be unsolvable, though it's tuned to always work in this game.
    * 
    * @param player - The horizon player affected.
    * @param data - A lot of data about each gem, so we can do fake physics on it, give it a trail etc.
    */
    public playResourceConverterVfx(player: hz.Player, data: Globals.ResourceConverterRecord) {
        const simPlayer = World.world?.getSimPlayer(player.name.get())
        console.log("GEM: playResourceConverterVfx " + player.name.get())

        // Allocate a new set of data for a new gem launch
        let flightData = new Globals.GemVfxPhysicsRecord()
        World.launcherWrapper.initializeLaunchVfx(simPlayer?.gemMap, data, flightData)
        World.launcherWrapper.launchGems(player, simPlayer?.gemMap, data, flightData)

        // Fire off any available gems out of the backpack every half second; shut down this part when all gems are airborne
        let launcherTimerId = this.async.setInterval(() => {
            // Sequence gem launches here, one gem every 1/2 second if there are more than one.  Delete self when done
            if (World.launcherWrapper.launchGems(player, simPlayer?.gemMap, data, flightData) == false) {
                console.log("LAUNCH: del launcher")
                this.async.clearInterval(launcherTimerId)
            }
        }, 500)

        // Fly any gems to their target, check the Vfx queue for anything we need to play along the way
        let updateTimerId = this.async.setInterval(() => {
            // Update all flying gems and text here, put gems back in parking lot when done
            if (!World.launcherWrapper.updateGemFlight(player, data, flightData)) {
                this.async.clearInterval(updateTimerId)
                console.log("LAUNCH: cleared when gem flight ends")
            }
            // pump the vfx queue for vfx to play
            const item = Vfx.vfxQueueReadOne()
            if (item) {
                this.playVfxAt(item.name, item.pos)
            }
        }, 16)

    }

    /**
    * A set of effects for a mined resource (ore/gem) dropping into the backpack.
    * 
    * NOTE: These gems are not managed by the world; they are provided by outside sources (like the mined resource).
    * 
    * @param player - The horizon player affected.
    * @param gemVfxEnt - The game object (entity) to use when dropping into the backpack.
    * @param gemColor - The color of the flash when the resource (ore/gem) hits the backpack.
    * @param originalScale - To restore the object to its starting state.
    * @param originalPosition - To return the object offscreen when done.
    */
    public playGemVfx(player: hz.Player, gemVfxEnt: hz.Entity, gemColor: hz.Color, originalScale: hz.Vec3, originalPosition: hz.Vec3) {
        const simPlayer = World.world?.getSimPlayer(player.name.get())
        console.log(`GEM: try spawn ${gemVfxEnt}`)

        let gemStartPos = player.position.get().clone()

        // Offset the gem spawn position to be behind the player
        let offsetPos = player.forward.get().clone()
        offsetPos.y += 1.5                          // Raise the gem up a bit
        offsetPos.z = offsetPos.z * -0.5            // Flip .forward so the gem spawns behind
        offsetPos.x = offsetPos.x * -0.5
        gemStartPos = gemStartPos.add(offsetPos)    // Offset the gem spawn position

        gemVfxEnt.position.set(gemStartPos)
        gemVfxEnt.scale.set(originalScale)

        // Spawn the game above the player backpack, scale it up to 2x size
        Anim.animatedScale(gemVfxEnt, 1.0, 0.16, originalScale.clone(), 2.0, () => {
            // When the scale to 2x finishes, start the gem drop.
            // First, start tinting the backpack to the gemColor (if we aren't already doing an animation)        
            if (simPlayer?.isBackpackAnimating() == false && simPlayer?.equippedAttachable?.toolEntity) {
                const colorIterations = 30
                Anim.animatedColor(simPlayer?.equippedAttachable?.toolEntity, gemColor, colorIterations, null)
            }

            const dt = 1.0 / 20.0 // 350ms/16ms = 22 frames
            let lerp = 0
            // Second, start scaling down to half-size as it falls into the backpack.
            Anim.animatedScale(gemVfxEnt, 2.0, -0.08, originalScale.clone(), 0.5, null, true)

            // Third, generate the gem drop movement; keep recalculating the positions in case the player is moving while mining
            let timerId = this.async.setInterval(() => {
                lerp += dt
                let backpackPos = Vfx.calculateBackpackPosition(player)
                let currPos = hz.Vec3.lerp(gemStartPos, backpackPos, lerp)
                gemVfxEnt.position.set(currPos)
                if (lerp >= 1.0) {
                    // Shut down and reset everything when we hit the backpack
                    this.async.clearInterval(timerId)
                    gemVfxEnt.position.set(originalPosition)
                    simPlayer?.stopAnimateBackpack()
                    return
                }
                else if (lerp >= 0.5) {
                    // Halfway through the drop, start popping the backpack size to 1.5x.  Play an impact FX when we hit.
                    if (simPlayer?.startAnimateBackpack() == true && simPlayer?.equippedAttachable?.toolEntity) {
                        Anim.animatedScale(simPlayer?.equippedAttachable?.toolEntity,
                            1.0, 0.08, simPlayer?.equippedAttachable?.toolEntity?.scale.get(), 1.5, () => {
                                World.world?.playVfxAt("VFX_FireImpactD", backpackPos)
                            })
                    }
                }
            }, 16)
        }, true)
    }
}
hz.Component.register(World)
