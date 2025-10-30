import * as hz from 'horizon/core'
import { World } from 'World'
import * as Globals from 'Globals'
import { refreshBackpack, refreshCurrency } from 'CUIHUD'
import { refreshStoreCurrency } from 'StoreManager'
import { buttonPressEvent } from 'BasicButton'
import { Npc } from 'horizon/npc'

const redKeyCost = 10
const redKeyCurrency = 'PURPLE_CURRENCY'
const redKey = 'RED_KEY'

 /**
 * RedKeyStore class;
 * 
 * Manages the popup button on the Red Teleporter.  If you haven't bought a redKey, RedKeyStore offers you functionality to
 * buy a key so you can use the teleporter to the red zone.
 * 
 */
export class RedKeyStore extends hz.Component<typeof RedKeyStore> {
  static propsDefinition = {}

  visibilityMap: Map<hz.Player, boolean> = new Map<hz.Player, boolean>()

  panelWidth = 960
  panelHeight = 270

  /**
   * Set the visibility for all players based on whether they own the Red Key.  
   */
  hideCheck(player: hz.Player) {
    let simPlayer = World.world?.getSimPlayer(player.name.get())
    if (!simPlayer) {
      console.error("RedKeyGizmo: No player for check trigger")
      return
    }

    const keyCount = simPlayer.getPlayerResource(redKey)
    if (keyCount >= 1) {
      this.visibilityMap.set(player, false)
    }
    else {
      this.visibilityMap.set(player, true)
    }

    const showTo: hz.Player[] = []
    const hideFrom: hz.Player[] = []
    this.visibilityMap.forEach((show: boolean, player: hz.Player) => {
      if (show)
        showTo.push(player)
      else
        hideFrom.push(player)
    })

    this.entity.setVisibilityForPlayers(showTo, hz.PlayerVisibilityMode.VisibleTo)
    this.entity.setVisibilityForPlayers(hideFrom, hz.PlayerVisibilityMode.HiddenFrom)
  }

  /**
   * Try to buy a Red Key.   Update HUD, Backpack and Store if we do.
   */
  purchase(player: hz.Player) {
    let simPlayer = World.world?.getSimPlayer(player.name.get())
    if (!simPlayer) {
      console.error("RedKeyGizmo: No player for check trigger")
      return
    }

    const pCurCount = simPlayer.getPlayerResource(redKeyCurrency)
    if (pCurCount >= redKeyCost) {
      simPlayer.subtractPlayerResource(redKeyCurrency, redKeyCost)
      simPlayer.addPlayerResource(redKey, 1)
    }

    refreshCurrency(player)
    refreshBackpack(player)
    refreshStoreCurrency(player)
  }

  /**
   * Initialize the event handlers
   */
  start() {
    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterWorld, (player: hz.Player) => {
      if(Npc.playerIsNpc(player)) {
          return;
      }
      this.async.setTimeout(() => {
        this.hideCheck(player)
      }, 500)
    })

    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerExitWorld, (player: hz.Player) => {
      if(Npc.playerIsNpc(player)) {
        return;
      }
      const p = this.visibilityMap.get(player)
      if (p != undefined) {
        this.visibilityMap.delete(player)
      }
    })

    this.connectCodeBlockEvent(this.entity, buttonPressEvent, (player: hz.Player, ID: string) => {
      if (ID == 'RedKeyPurchase') {
        this.purchase(player)
        this.hideCheck(player)
      }
    })
  }
}
hz.Component.register(RedKeyStore)