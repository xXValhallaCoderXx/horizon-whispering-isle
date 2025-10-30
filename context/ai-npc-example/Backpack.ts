import * as hz from 'horizon/core'

/**
 * Backpack class;
 * 
 * This is your backpack - an attachable tool type that is used to store resources.
 * 
 * Props:
 * @param name - The string nameID of the backpack.
 * @param capacity - Backpack weight capacity.
 * 
 */
export class Backpack extends hz.Component<typeof Backpack> {
    static propsDefinition = {
        name: { type: hz.PropTypes.String, default: "BACKPACK" },
        capacity: { type: hz.PropTypes.Number, default: 5 },
    }

    startingPosition: hz.Vec3 = hz.Vec3.zero        // Starting pooled position
    isAnimating: boolean = false                    // Backpack animation state

    /**
     * Record starting position.
     */
    start() {
        this.startingPosition = this.entity.position.get().clone()
    }

    /**
     * Return to starting/pool position immediately.
     */
    public returnToPool() {
        this.entity.position.set(this.startingPosition.clone())
    }

    /**
     * Return to starting/pool position after a 1 sec delay.
     */
    public returnToPoolDelayed() {
        this.async.setTimeout(() => {
            this.entity.position.set(this.startingPosition.clone())
        }, 1000)
    }

    /**
     * Returns current animation state.
     */
    public getAnimationState(): boolean {
        return this.isAnimating 
    }

    /**
     * Set current animation state.
     * @param isAnimating - Animation state.
     */
    public setAnimationState(isAnimating: boolean) {
        this.isAnimating = isAnimating
    }
}
hz.Component.register(Backpack)