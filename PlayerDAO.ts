import * as hz from "horizon/core";
import { PlayerStateUtils } from "PlayerStateService";

export class PlayerDao {
    constructor(private player: hz.Player, private world: hz.World) { }

    // --- PUBLIC API ---
    // getInventoryEnabled(): boolean {
    //     return PlayerStateUtils.getNestedValue(
    //         this.player,
    //         this.world,
    //         (state) => state.inventory.hasStorageBag
    //     );
    // }

    setInventoryEnabled(enabled: boolean): void {
        // PlayerStateUtils.updatePlayerState(
        //     this.player,
        //     this.world,
        //     (state) => {
        //         state.inventory.hasStorageBag = enabled;
        //     }
        // );
    }
}
