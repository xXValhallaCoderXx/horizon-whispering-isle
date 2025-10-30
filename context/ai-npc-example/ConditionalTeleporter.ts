import * as hz from 'horizon/core'
import { World } from 'World'
import * as Globals from 'Globals'
import { Teleporter } from 'Teleporter'
import { refreshCurrency } from 'CUIHUD'

/**
 * ConditionalTeleporter class extending the base Teleporter;
 * 
 * Teleports a player to a destination (SpawnPointGizmo) if certain conditions are satisfied.
 * 
 * Note: MUST BE attached to a trigger as it uses onTriggerEvent for teleporter logic.
 * 
 * Props:
 * @param requiredTool - Required tool to teleport.
 * @param requiredResourceType - Required resource type to teleport.
 * @param requiredResourceNumber - Required amount of resource to teleport.
 * @param chargePlayer - Whether the player is charged the required amount on teleport.
 * 
 */

class ConditionalTeleporter extends Teleporter<typeof ConditionalTeleporter> {
  static propsDefinition = {
    ...Teleporter.propsDefinition,
    requiredTool: { type: hz.PropTypes.String, default: "" },
    requiredResourceType: { type: hz.PropTypes.String, default: "" },
    requiredResourceNumber: { type: hz.PropTypes.Number, default: 0 },
    chargePlayer: { type: hz.PropTypes.Boolean, default: false },
  }

  start() {
    super.start()
  }

  /**
   * Extends base Teleporter.canTeleport() to include more conditions to check. Checks for player tools and resources.
   * @param player - Player.
   */
  protected canTeleport(player: hz.Player): boolean {
    // Get player
    let simPlayer = World.world?.getSimPlayer(player.name.get())
    if (!simPlayer) {
      console.error("No simPlayer found to teleport!")
      return false
    }

    // Check required tool
    if (this.props.requiredTool != "" && simPlayer.getPlayerTool(this.props.requiredTool) == Globals.NONE) {
      return false
    }

    // Check that player has enough of a required resource
    if (this.props.requiredResourceType != "" && simPlayer.getPlayerResource(this.props.requiredResourceType) < this.props.requiredResourceNumber) {
      return false
    }
    return super.canTeleport(player)
  }

  /**
   * Extends base Teleporter.teleport() to update player's currency on teleport.
   * @param player - Player.
   */
  protected teleport(player: hz.Player): void {
    if (this.props.chargePlayer) {
      let simPlayer = World.world?.getSimPlayer(player.name.get())
      if (!simPlayer) {
        console.error("No simPlayer found to teleport!")
        return
      }

      // Subtract player currency and refresh UI
      simPlayer.subtractPlayerResource(this.props.requiredResourceType, this.props.requiredResourceNumber)
      refreshCurrency(player)
    }
    super.teleport(player)
  }
}
hz.Component.register(ConditionalTeleporter)