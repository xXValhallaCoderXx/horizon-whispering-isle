import * as hz from 'horizon/core'
import { World } from 'World'
import * as Globals from 'Globals'

import { refreshBackpack, refreshCurrency } from 'CUIHUD'
import { refreshStoreCurrency } from 'StoreManager'


/**
 * Converts the ore resource that player has mined into currency.
 * 
 * @param player - Player.
 * @param rcData - Resource conversion data; used later to play a proper vfx.
 * 
 */
function convertOre(player: hz.Player, rcData: Globals.ResourceConverterRecord) {
    console.log(`converting ${player.name.get()}'s ORE to CURRENCY`)
    // Get player
    let simPlayer = World.world?.getSimPlayer(player.name.get())
    if (!simPlayer) {
        console.error("Cheat: No player for [convert ore]")
        return
    }

    const playerStats = simPlayer.getPlayerStats()
    let runningTotal = 0

    // Convert 'GREEN_ORE' to 'GREEN_CURRENCY' based on player inventory and player stats
    let amountOre = simPlayer.getPlayerResource('GREEN_ORE')
    let amountCurrency = simPlayer.getPlayerResource('GREEN_CURRENCY')
    simPlayer.subtractPlayerResource('GREEN_ORE', amountOre)
    simPlayer.addPlayerResource('GREEN_CURRENCY', amountOre * playerStats[0])
    runningTotal += amountOre * playerStats[0]
    rcData.green.amount = amountOre * playerStats[0]

    // Convert 'BLUE_ORE' to 'BLUE_CURRENCY' based on player inventory and player stats
    amountOre = simPlayer.getPlayerResource('BLUE_ORE')
    amountCurrency = simPlayer.getPlayerResource('BLUE_CURRENCY')
    simPlayer.subtractPlayerResource('BLUE_ORE', amountOre)
    simPlayer.addPlayerResource('BLUE_CURRENCY', amountOre * playerStats[1])
    runningTotal += amountOre * playerStats[1]
    rcData.blue.amount = amountOre * playerStats[1]

    // Convert 'PURPLE_ORE' to 'PURPLE_CURRENCY' based on player inventory and player stats
    amountOre = simPlayer.getPlayerResource('PURPLE_ORE')
    amountCurrency = simPlayer.getPlayerResource('PURPLE_CURRENCY')
    simPlayer.subtractPlayerResource('PURPLE_ORE', amountOre)
    simPlayer.addPlayerResource('PURPLE_CURRENCY', amountOre * playerStats[2])
    runningTotal += amountOre * playerStats[2]
    rcData.purple.amount = amountOre * playerStats[2]

    // Convert 'RED_ORE' to 'RED_CURRENCY' based on player inventory and player stats
    amountOre = simPlayer.getPlayerResource('RED_ORE')
    amountCurrency = simPlayer.getPlayerResource('RED_CURRENCY')
    simPlayer.subtractPlayerResource('RED_ORE', amountOre)
    simPlayer.addPlayerResource('RED_CURRENCY', amountOre * playerStats[3])
    runningTotal += amountOre * playerStats[3]
    rcData.red.amount = amountOre * playerStats[3]

    // Update player leaderboard score
    simPlayer.setPlayerScore(simPlayer.getPlayerScore() + runningTotal)
    World.world?.world.leaderboards.setScoreForPlayer("Leaderboard", simPlayer.player, simPlayer.getPlayerScore(), true)

    // Refresh player HUD
    refreshCurrency(player)
    refreshBackpack(player)
    refreshStoreCurrency(player)

    // Calculate and play appropriate sfx and vfx:
    // Take a fourth root of the running total and play sfx that many times.
    // 1    1
    // 16   2
    // 81   3
    // 256  4
    // 625  5
    runningTotal = Math.sqrt(runningTotal)
    runningTotal = Math.sqrt(runningTotal)
    runningTotal = Math.min(5, runningTotal)
    if (runningTotal >= 1) {
        player.setAchievementComplete("Into the Pile", true)
        World.world?.playResourceConverterVfx(player, rcData)
        World.world?.playSound("SFX_ConvertItem", runningTotal)
    }
    else {
        World.world?.playResourceConverterFail(player, "SFX_UI_Reject")
    }
}

/**
 * Resource Converter converting player's ore into currency.
 * 
 * Props:
 * @param targetVfxEntity - Target point to land conversion vfx in.
 * 
 */
export class OreToCurrencyTrigger extends hz.Component<typeof OreToCurrencyTrigger> {
    static propsDefinition = {
        targetVfxEntity: { type: hz.PropTypes.Entity }
    }

    start(): void {
        this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterTrigger, (player: hz.Player) => {
            let rcData = new Globals.ResourceConverterRecord()
            if (this.props.targetVfxEntity) {                       // We fill in the target and later the coin amounts
                rcData.targetEntity = this.props.targetVfxEntity    // The VFX fills in objects and positions
            }
            convertOre(player, rcData)
        })
    }
}
hz.Component.register(OreToCurrencyTrigger)
