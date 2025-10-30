
import * as hz from 'horizon/core'
import { NpcManager } from 'NpcComponent'
import { World } from 'World'
import * as Globals from 'Globals'
import { Npc } from 'horizon/npc'


let defaultSpawnPoint : hz.SpawnPointGizmo | undefined;
/**
 * Simple component for the LLM World to override Incremental Sim's spawn points.  Simply remove
 * this component from the spawn point it's on to revert to base game behavior.
 */
export class DefaultTeleporterDestination<T> extends hz.Component<typeof DefaultTeleporterDestination & T> {

  preStart(): void {
    defaultSpawnPoint = this.entity.as(hz.SpawnPointGizmo);
  }

  start(): void {
  }
}
hz.Component.register(DefaultTeleporterDestination)


/**
 * Base Teleporter class;
 * 
 * Teleports a player to a destination (SpawnPointGizmo).
 * 
 * Note: MUST BE attached to a trigger as it uses onTriggerEvent for teleporter logic.
 * 
 * Props:
 * @param destination - SpawnPointGizmo teleporter destination.
 * @param teleporterSfx - Teleporter sfx name.
 * @param teleporterVfx - Teleporter vfx name.
 * 
 */

export class Teleporter<T> extends hz.Component<typeof Teleporter & T> {
  static propsDefinition = {
    destination: { type: hz.PropTypes.Entity },     // Spawnpoint Gizmo
    teleporterSfx: { type: hz.PropTypes.String, default: "" },
    teleporterVfx: { type: hz.PropTypes.String, default: "" },
  }

  /**
   * Sets up onTriggerEvent that goes through the teleportation logic.
   */
  start() {
    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterTrigger, (player: hz.Player) => {
        if(Npc.playerIsNpc(player)) {
            return;
        }
        if (this.canTeleport(player)) {
          // Play sfx
          if (this.props.teleporterSfx.length > 0) {
            World.world?.playSoundAt(this.props.teleporterSfx, this.entity.position.get())
          }
          // Play vfx
          if (this.props.teleporterVfx.length > 0) {
            World.world?.playVfxAt(this.props.teleporterVfx, this.entity.position.get())
          }
          // Teleport
          this.teleport(player)
        } else {
          console.log(`${player.name} teleport denied`)
        }
    })
  }

  /**
   * Returns true if the player can teleport, false othewise.
   * @param player - Player.
   */
  protected canTeleport(player: hz.Player): boolean {
    if (this.props.destination == undefined) {
      console.error("Cannot teleport to a location that is undefined")
      return false
    }
    return true
  }

  /**
   * Teleports a given player to the set destination.
   * @param player - Player.
   */
  protected teleport(player: hz.Player) {
    (defaultSpawnPoint ?? this.props.destination?.as(hz.SpawnPointGizmo))?.teleportPlayer(player)
    NpcManager.onPlayerTeleport(player, this.props.destination?.name.get() ?? "the unknown");
  }
}
hz.Component.register(Teleporter)
