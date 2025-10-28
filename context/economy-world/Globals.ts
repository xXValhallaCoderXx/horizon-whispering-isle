import * as hz from 'horizon/core'
import * as hzui from 'horizon/ui'

// Constant values
export const NONE: number = -1

export const GRAVITY: number = -9.8 * 0.5           // a fake gravity for the gem flying VFX
export const FIXED_INTERVAL = 16.67 / 1000.0        // 60fps fixed interval

// HUD Display functionality; the UI binding and the toggle display event
export const HUD_DISPLAY: hzui.Binding<boolean> = new hzui.Binding<boolean>(true)
export const DisplayHUDEvent = new hz.NetworkEvent<{player: hz.Player, show:boolean}>('DisplayHUDEvent')

export const GRABBABLE_NAMES = ["GREEN_PICKAXE", "BLUE_PICKAXE", "PURPLE_PICKAXE", "RED_PICKAXE"]
export const RESOURCE_WEIGHT_MAP = new Map<string, number>([
    ["GREEN_ORE", 1],
    ["BLUE_ORE", 1],
    ["PURPLE_ORE", 1],
    ["RED_ORE", 1],
])

/**
 * Information about one gem object that is being thrown into the converter.
 */
export class GemRecord {
    entity: hz.Entity
    startPos: hz.Vec3
    startScale: hz.Vec3

    constructor(ent: hz.Entity) {
        this.entity = ent
        this.startPos = ent.position.get()
        this.startScale = ent.scale.get()
    }
}

/**
 * Information to support a gem object being thrown into the converter.
 */
export class ConverterRecord {
    gem: GemRecord | null
    amount: number
    trailEntity: hz.Entity | null

    constructor(gemRec: GemRecord | null, amt: number) {
        this.gem = gemRec
        this.amount = amt
        this.trailEntity = null
    }
}

/**
 * Information for all gems and effects when launching gems into the converter.
 */
export class ResourceConverterRecord {
    green: ConverterRecord
    blue: ConverterRecord
    purple: ConverterRecord
    red: ConverterRecord
    targetEntity : hz.Entity | null
    textVfxParent: GemRecord | null

    constructor() {
        this.green = new ConverterRecord(null, 0)
        this.blue = new ConverterRecord(null, 0)
        this.purple = new ConverterRecord(null, 0)
        this.red = new ConverterRecord(null, 0)
        this.targetEntity = null
        this.textVfxParent = null
    }
}

/**
 * The physics information for a gem and textbox.
 */
export class PhysicsRecord {
    vel1: hz.Vec3               // Generic velocity storage.  In this example game, stores the current gem velocity.
    vel2: hz.Vec3               // Generic velocity storage.  In this example game, stores the current text box velocity.
    pos1: hz.Vec3               // Generic position storage.  In this example game, stores the current gem position.
    pos2: hz.Vec3               // Generic position storage.  In this example game, stores the current text box position.
    t: number                   // Generic time storage.  In this example game, the time until impact for a gem.
    lerp: number                // Generic interpolation.  In this example game, this is the status of the gem rise out of the backpack.

    constructor(v1: hz.Vec3, v2: hz.Vec3, p1: hz.Vec3, p2: hz.Vec3, t: number, l: number) { 
        this.vel1 = v1 
        this.vel2 = v2
        this.pos1 = p1
        this.pos2 = p2
        this.t = t
        this.lerp = l
    }
}

/**
 * The physics information for all gems and textboxes.
 */
export class GemVfxPhysicsRecord {
    green: PhysicsRecord
    blue: PhysicsRecord
    purple: PhysicsRecord
    red: PhysicsRecord

    constructor() {
        this.green = new PhysicsRecord(new hz.Vec3(0,0,0), new hz.Vec3(0,0,0), new hz.Vec3(0,0,0), new hz.Vec3(0,0,0), -1, 0.0)
        this.blue = new PhysicsRecord(new hz.Vec3(0,0,0), new hz.Vec3(0,0,0), new hz.Vec3(0,0,0), new hz.Vec3(0,0,0), -1, 0.0)
        this.purple = new PhysicsRecord(new hz.Vec3(0,0,0), new hz.Vec3(0,0,0), new hz.Vec3(0,0,0), new hz.Vec3(0,0,0), -1, 0.0)
        this.red = new PhysicsRecord(new hz.Vec3(0,0,0), new hz.Vec3(0,0,0), new hz.Vec3(0,0,0), new hz.Vec3(0,0,0), -1, 0.0)
    }
}

/**
 * A Vfx Item type for the Vfx Queue.  This Vfx should be played at the indicated position.
 */
export type VfxItem = {
    name: string,
    pos: hz.Vec3,
}