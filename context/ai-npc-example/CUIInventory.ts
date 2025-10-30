
import * as hz from 'horizon/core'
import * as hzui from 'horizon/ui'
import { World } from 'World'
import * as Globals from 'Globals'
import { Npc } from 'horizon/npc'

export const inventoryBinding: hzui.Binding<string> = new hzui.Binding<string>('')

/**
 * A debug panel that outputs player's current inventory contents.
 */
export class CUIInventory extends hzui.UIComponent<typeof CUIInventory> {
  static propsDefinition = {}

  // Panel Dimensions
  panelWidth = 1920
  panelHeight = 1080

  // Style definitions
  initializeUI() {
    return hzui.View({
      style: {
        height: '100%',
        width: '100%',
        justifyContent: 'center',
        alignContent: 'center',
        backgroundColor: '#000',
        flexDirection: 'row'
      },
      children: [
        // Inventory Text
        hzui.Text({
          text: inventoryBinding,
          style: {
            fontSize: 48,
            color: '#0F0',
            width: '90%',
            height: '90%',
            justifyContent: 'center',
            alignContent: 'center',
            textAlign: 'left',
            textAlignVertical: 'center',
            position: 'absolute',

          }
        }),
        // Refresh Button
        hzui.Pressable({
          children: [
            hzui.Text({
              text: 'Refresh',
              style: {
                fontSize: 48,
                width: '90%',
                height: '90%',
                justifyContent: 'center',
                alignContent: 'center',
                textAlign: 'center',
                textAlignVertical: 'center',
                color: '#0F0',
              }
            }),
          ],
          style: {
            width: '10%',
            height: '10%',
            bottom: 0,
            right: 0,
            position: 'absolute',
            borderWidth: 4,
            borderColor: '#0F0'
          },
          // Connect Button press to refresh function
          onRelease: (player: hz.Player) => {
            this.refresh(player)
          }
        })
      ]
    })
  }


  start() {
    // Connect refresh panel on player enter world
    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterWorld, (player: hz.Player) => {
      if(Npc.playerIsNpc(player)) {
        return;
      }

      this.refresh(player)
    })
  }

  /**
   * Refresh inventory text for player.
   * @param player - Player.
   */
  refresh(player: hz.Player) {
    console.log('Refreshing Display')
    let newDisp: string = ``

    // Get player
    let p = World.world?.getSimPlayer(player.name.get())
    if (!p) {
      console.error("Cheat: No player for inventory display")
      return
    }

    // Play sfx
    World.world?.playSound("SFX_UI_ClickV2")

    // Look through player tools
    let bid: string = ''
    newDisp = newDisp.concat(`Tools:\n`)
    let tools = p.saveGame?.getTools();
    if (tools) {
      tools.forEach((tool) => { if (tool.level != Globals.NONE) { bid += tool.type + ' ' + tool.level + '\n' } })
    }
    if (bid == '') {
      bid = " None\n"
    }
    newDisp += bid;

    // Look through player resources
    newDisp += '\nResources: \n'
    let resources = p.saveGame?.getResources();
    if (resources) {
      resources.forEach((res) => { newDisp += res.amount + ' ' + res.type + '\n' })
    }
    console.log(newDisp)

    inventoryBinding.set(newDisp, [player])
  }
}
hzui.UIComponent.register(CUIInventory)