import * as hz from 'horizon/core';


/*                                              Simple Animation
*
* Self contained animations to perform simple effects like spin, scale, color or shake.
* These animations are designed for simplicity and independence rather than performance or flexibility
*
* Requires: A world object with this script attached.
*
*/

/**
* 
* A function to scale an object up or down in size
* 
* @param ent - The Horizon entity to be spun.
* @param curr - The current scale.
* @param dt - The increment to advance the scale.
* @param original - The original scale.
* @param endBound - The target scale.
* @param completionCB - Optional.  A function to be executed when the scale finishes.
* @param overrideReset - Optional. The size normally resets to the original when the scale is complete.  Override this with overrideReset.  
*/

export function animatedScale(ent: hz.Entity, curr: number, dt: number, original: hz.Vec3, endBound: number = 0.1, completionCB: (() => void) | null, overrideReset: boolean = false): boolean {
    if (!SimpleAnimation.anim) {
        console.error("ANIM: no anim system found")
        return false
    }
    
    let scalerTimerId = SimpleAnimation.anim.async.setInterval(() => {
        curr += dt
        if ((curr <= endBound && dt > 0) || (curr >= endBound && dt < 0)) {                 // If we are scaling up or down
            ent.scale.set(original.mul(curr))                                               //  scale the object
        }
        else {                                                                              // If we are done scaling
            SimpleAnimation.anim?.async.clearInterval(scalerTimerId)
            if (overrideReset == false) {
                ent.scale.set(original)                                                     // We can reset to the original size
            }
            if (completionCB) {                                                             // Notify that we are done
                completionCB()
            }
        }
    }, 16.67)

    return true
}

/**
* 
* A function to spin an object
* 
* @param ent - The Horizon entity to be spun.
* @param curr - The current rotation.
* @param dt - The increment to advance the rotation.
* @param original - The original rotation to restore to on end.
* @param endBound - The target rotation.
* @param completionCB - Optional.  A function to be executed when the spin finishes.
* @param overrideReset - Optional. The rotation normally resets to the original when the spin is complete.  Override this with overrideReset.  
*/
export function animatedSpin(ent: hz.Entity, curr: number, dt: number, original: hz.Quaternion, endBound: number = 0.1, completionCB: (() => void) | null, overrideReset: boolean = false ) : boolean {
    if (!SimpleAnimation.anim) {
        console.error("ANIM: no anim system found")
        return false
    }

    let spinnerTimerId = SimpleAnimation.anim.async.setInterval(() => {
        curr += dt
        if ((curr <= endBound && dt > 0) || (curr >= endBound && dt < 0)) {                 // If we are spinning CW or CCW
            let eulerSpin = hz.Vec3.zero
            eulerSpin.z = curr                                                              // Set the rotation amount
            let q: hz.Quaternion = hz.Quaternion.fromEuler(eulerSpin).mul(original)         // Multiply the quaternion
            ent.rotation.set(q) 
        }
        else {                                                                              // If we are done scaling
            SimpleAnimation.anim?.async.clearInterval(spinnerTimerId)
            if (overrideReset == false) {
                ent.rotation.set(original)                                                  // We can reset to the original spin
            }
            if (completionCB) {                                                             // Notify that we are done
                completionCB()
            }
        }
    }, 16.67)

    return true
}

/**
* 
* A function to shake an object randomly
* 
* @param ent - The Horizon entity to be shaken.
* @param original - The original position of the object
* @param completionCB - Optional.  A function to be executed when the shake finishes.
* @param max - Optional. The number of iterations requested, default is 8 ( 8/60 = 0.13 seconds )  
*/
export function animatedShake(ent: hz.Entity, original: hz.Vec3, completionCB: (() => void) | null, max: number = 8) : boolean {
    if (!SimpleAnimation.anim) {
        console.error("ANIM: no anim system found")
        return false
    }

    let currentIteration = 0
    const shakeTable = [{ x: 0.02, y: 0.02 },
                        { x: -0.02, y: -0.02 },
                        { x: 0.02, y: -0.02 },
                        { x: -0.02, y: 0.02 }]
    let shakeTimerId = SimpleAnimation.anim.async.setInterval(() => {
        currentIteration++
        if (currentIteration >= max) {
            SimpleAnimation.anim?.async.clearInterval(shakeTimerId)
            ent.position.set(original)                                                  // Put object back when we are done
            if (completionCB) {                                                         // Notify completion
                completionCB()
            }            
        }
        else {
            const idx : number = Math.floor(Math.random() * shakeTable.length)          // Generate a random index into the shakeTable
            let shakePos: hz.Vec3 = original.clone()                                    // Make a new position
            shakePos.x += shakeTable[idx].x
            shakePos.y += shakeTable[idx].y
            ent.position.set(shakePos)                                                  // Move object to new position            
        }
    }, 16.67)

    return true
}

/**
* 
* A function to gradually tint an object to color over a certain number of iterations
* 
* @param ent - The Horizon entity to be tinted.
* @param target - The final tint color.
* @param iterations - The number of iteratation to reach the final tint color.
* @param completionCB - Optional.  A function to be executed when the tint finishes.
* @param overrideReset - Optional. The tint normally turns off when the iterations complete.  Override this with overrideReset.  
*/
export function animatedColor(ent: hz.Entity, target: hz.Color, iterations: number, completionCB: (() => void) | null, overrideReset: boolean = false) : boolean {
    if (!SimpleAnimation.anim) {
        console.error("ANIM: no anim system found")
        return false
    }

    ent.as(hz.MeshEntity).style.tintColor.set(target)                                       // One time setup, set the target color

    let currentIteration = 0
    let colorTimerId = SimpleAnimation.anim.async.setInterval(() => {
        currentIteration++
        ent.as(hz.MeshEntity).style.tintStrength.set(currentIteration / iterations)         // Increment the tintStrength
        if (currentIteration >= iterations) {                                               // If we finished
            SimpleAnimation.anim?.async.clearInterval(colorTimerId)                         // Shut ourselves down
            if (overrideReset == false) {                                                         // Maybe reset to 0 tint
                ent.as(hz.MeshEntity).style.tintStrength.set(0.0)                           // 
            }                                                                               //
            if (completionCB) {                                                             // Notify that we are done
                completionCB()
            }
        }
    }, 16.67)

    return true
}

 /**
 * SimpleAnimation class;
 * 
 * SimpleAnimation supports the various exported animation functions (by providing async timing)
 */

class SimpleAnimation extends hz.Component<typeof SimpleAnimation> {
    static propsDefinition = {
    }

    static anim: SimpleAnimation | null = null                                              // A single script to manage simple animations

    start() {
        SimpleAnimation.anim = this
    }
}
hz.Component.register(SimpleAnimation)