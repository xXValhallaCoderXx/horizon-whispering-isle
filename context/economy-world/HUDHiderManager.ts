import * as hz from 'horizon/core'

 /**
 * HUDHiderManager class;
 * 
 * The HUDHiderManager sets up 8 Hider objects, one for each player.  When a player joins the world, they get a Hider from the pool.
 * 
 * @param hider0 - A Hider object for the first player.
 * @param hider1 - A Hider object for the second player.
 * @param hider2 - A Hider object for the third player.
 * @param hider3 - A Hider object for the fourth player.
 * @param hider4 - A Hider object for the fifth player.
 * @param hider5 - A Hider object for the sixth player.
 * @param hider6 - A Hider object for the seventh player.
 * @param hider7 - A Hider object for the eighth player.
 */
export class HUDHiderManager extends hz.Component<typeof HUDHiderManager> {
  static propsDefinition = {
    hider0: { type: hz.PropTypes.Entity },
    hider1: { type: hz.PropTypes.Entity },
    hider2: { type: hz.PropTypes.Entity },
    hider3: { type: hz.PropTypes.Entity },
    hider4: { type: hz.PropTypes.Entity },
    hider5: { type: hz.PropTypes.Entity },
    hider6: { type: hz.PropTypes.Entity },
    hider7: { type: hz.PropTypes.Entity },
  }

  Hiders: hz.Entity[] = []

  /**
   * Set up events to manage players joining (and getting a Hider) and leaving (and giving back a Hider).
   */
  start() {
    this.Hiders = [
      this.props.hider0!,
      this.props.hider1!,
      this.props.hider2!,
      this.props.hider3!,
      this.props.hider4!,
      this.props.hider5!,
      this.props.hider6!,
      this.props.hider7!
    ]

    // Find a free Hider to give to a new player.
    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterWorld, (player: hz.Player) => {
      for (let i = 0; i < this.Hiders.length; i++) {
        if (this.Hiders[i].owner.get() == this.world.getServerPlayer()) {
          this.Hiders[i].owner.set(player)
          console.log(`${this.Hiders[i].id} to ${this.Hiders[i].owner.get().name.get()}`)
          break
        }
      }
    })

    // Players give back their Hiders when they leave.
    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerExitWorld, (player: hz.Player) => {
      for (let i = 0; i < this.Hiders.length; i++) {
        if (this.Hiders[i].owner.get() == player) {
          this.Hiders[i].owner.set(this.world.getServerPlayer())
          console.log(`${this.Hiders[i].id} to ${this.Hiders[i].owner.get().name.get()}`)
          break
        }
      }
    })
  }

}
hz.Component.register(HUDHiderManager)