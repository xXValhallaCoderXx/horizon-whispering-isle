import * as hz from 'horizon/core'
import * as hzui from 'horizon/ui'
import { World } from 'World'
import * as Globals from 'Globals'
import * as HUD from 'CUIHUD'
import { refreshStore, resetStorePlayerData } from 'StoreManager'

type CheatEntry = {
    name: string
    functionCall: (player: hz.Player) => void
}

// A list of all the cheats available.
//
const CheatsList: CheatEntry[] = [
    {
        name: 'Give Items',                           // Give player all items (backpacks and tools).
        functionCall: (player: hz.Player) => {
            console.log("CHEAT: [Give Items]")
            let p = World.world?.getSimPlayer(player.name.get())
            if (!p) {
                console.error("CHEAT: No player for [Give Items]")
                return
            }

            p.setPlayerTool('GREEN_PICKAXE', 1)
            p.setPlayerTool('BLUE_PICKAXE', 1)
            p.setPlayerTool('PURPLE_PICKAXE', 1)
            p.setPlayerTool('RED_PICKAXE', 1)
            p.setPlayerTool('MEDIUM_BACKPACK', 1)
            p.setPlayerTool('LARGE_BACKPACK', 1)
            p.setPlayerTool('COLOSSAL_BACKPACK', 1)


            p.equipGrabbable('RED_PICKAXE')
            p.equipAttachable('COLOSSAL_BACKPACK')

            HUD.refreshBackpack(player)
        }
    },
    {
        name: 'Reset all Progress',                   // Reset all currency, ore, items, FTUE, achievements, score etc for the player.
        functionCall: (player: hz.Player) => {        // Player gets 30 green currency so they can start rebuilding!
            console.log("reset")
            let p = World.world?.getSimPlayer(player.name.get())
            if (!p) {
                console.error("Cheat: No player for [reset all]")
                return
            }

            // TODO: support this better; .ForEach      
            p.setPlayerResource('GREEN_ORE', 0)
            p.setPlayerResource('BLUE_ORE', 0)
            p.setPlayerResource('PURPLE_ORE', 0)
            p.setPlayerResource('RED_ORE', 0)

            p.setPlayerResource('GREEN_CURRENCY', 0)
            p.setPlayerResource('BLUE_CURRENCY', 0)
            p.setPlayerResource('PURPLE_CURRENCY', 0)
            p.setPlayerResource('RED_CURRENCY', 0)
            p.setPlayerResource('RED_KEY', 0)
            p.saveGame?.setResourcesWeight(0)

            p.addPlayerResource('GREEN_CURRENCY', 30)      // 30 green so you can buy a new pick & backpack!

            p.setPlayerTool('GREEN_PICKAXE', Globals.NONE)
            p.setPlayerTool('BLUE_PICKAXE', Globals.NONE)
            p.setPlayerTool('PURPLE_PICKAXE', Globals.NONE)
            p.setPlayerTool('RED_PICKAXE', Globals.NONE)
            p.setPlayerTool('SMALL_BACKPACK', 1)
            p.setPlayerTool('MEDIUM_BACKPACK', Globals.NONE)
            p.setPlayerTool('LARGE_BACKPACK', Globals.NONE)
            p.setPlayerTool('COLOSSAL_BACKPACK', Globals.NONE)

            p.setPlayerStats([10, 10, 10, 10])

            p.resetTools()
            p.equipAttachable('SMALL_BACKPACK')
            p.setCompletedFTUE(false)

            p.player.setAchievementComplete("Extra Space", false)
            p.player.setAchievementComplete("Getting Started", false)
            p.player.setAchievementComplete("Into the Pile", false)
            p.player.setAchievementComplete("Teamwork!", false)
            p.player.setAchievementComplete("Tool Upgrade", false)
            p.setPlayerScore(0)
            World.world?.world.leaderboards.setScoreForPlayer("Leaderboard", p.player, p.getPlayerScore(), true)

            HUD.refreshCurrency(player)
            HUD.refreshBackpack(player)

            resetStorePlayerData(player)
        }
    },
    {
        name: '+ 1000 GREEN_ORE',                     // Give the player 1000 Green Ore
        functionCall: (player: hz.Player) => {
            console.log("add 10 GREEN_ORE")
            let p = World.world?.getSimPlayer(player.name.get())
            if (!p) {
                console.error("Cheat: No player for [+10 green ore]")
                return
            }
            let val = p.getPlayerResource('GREEN_ORE')
            p.addPlayerResource('GREEN_ORE', 1000)
            HUD.refreshBackpack(player)
            refreshStore(player)
        }
    },
    {
        name: '+ 1000 BLUE_ORE',                      // Give the player 1000 Blue Ore
        functionCall: (player: hz.Player) => {
            console.log("add 10 BLUE_ORE")
            let p = World.world?.getSimPlayer(player.name.get())
            if (!p) {
                console.error("Cheat: No player for [+10 blue ore]")
                return
            }
            let val = p.getPlayerResource('BLUE_ORE')
            p.addPlayerResource('BLUE_ORE', 1000)
            HUD.refreshBackpack(player)
            refreshStore(player)
        }
    },
    {
        name: '+ 1000 PURPLE_ORE',                    // Give the player 1000 Purple Ore
        functionCall: (player: hz.Player) => {
            console.log("add 10 PURPLE_ORE")
            let p = World.world?.getSimPlayer(player.name.get())
            if (!p) {
                console.error("Cheat: No player for [+10 purple ore]")
                return
            }
            let val = p.getPlayerResource('PURPLE_ORE')
            p.addPlayerResource('PURPLE_ORE', 1000)
            HUD.refreshBackpack(player)
            refreshStore(player)
        }
    },
    {
        name: '+ 1000 RED_ORE',                       // Give the player 1000 Red Ore
        functionCall: (player: hz.Player) => {
            console.log("add 10 RED_ORE")
            let p = World.world?.getSimPlayer(player.name.get())
            if (!p) {
                console.error("Cheat: No player for [+10 red ore]")
                return
            }
            let val = p.getPlayerResource('RED_ORE')
            p.addPlayerResource('RED_ORE', 1000)
            HUD.refreshBackpack(player)
            refreshStore(player)
        }
    },
    {
        name: '+ 1000 GREEN',                         // Give the player 1000 Green Currency
        functionCall: (player: hz.Player) => {
            console.log("add 10 GREEN")
            let p = World.world?.getSimPlayer(player.name.get())
            if (!p) {
                console.error("Cheat: No player for [+10 green currency]")
                return
            }
            let val = p.getPlayerResource('GREEN_CURRENCY')
            p.addPlayerResource('GREEN_CURRENCY', 1000)
            HUD.refreshCurrency(player)
            refreshStore(player)
        }
    },
    {
        name: '+ 1000 BLUE',                          // Give the player 1000 Blue Currency
        functionCall: (player: hz.Player) => {
            console.log("add 10 BLUE")
            let p = World.world?.getSimPlayer(player.name.get())
            if (!p) {
                console.error("Cheat: No player for [+10 red currency]")
                return
            }
            let val = p.getPlayerResource('BLUE_CURRENCY')
            p.addPlayerResource('BLUE_CURRENCY', 1000)
            HUD.refreshCurrency(player)
            refreshStore(player)
        }
    },
    {
        name: '+ 1000 PURPLE',                        // Give the player 1000 Purple Currency
        functionCall: (player: hz.Player) => {
            console.log("add 10 PURPLE")
            let p = World.world?.getSimPlayer(player.name.get())
            if (!p) {
                console.error("Cheat: No player for [+10 purple currency]")
                return
            }
            let val = p.getPlayerResource('PURPLE_CURRENCY')
            p.addPlayerResource('PURPLE_CURRENCY', 1000)
            HUD.refreshCurrency(player)
            refreshStore(player)
        }
    },
    {
        name: '+ 1000 RED',                           // Give the player 1000 Red Currency
        functionCall: (player: hz.Player) => {
            console.log("add 10 RED")
            let p = World.world?.getSimPlayer(player.name.get())
            if (!p) {
                console.error("Cheat: No player for [+10 red currency]")
                return
            }
            let val = p.getPlayerResource('RED_CURRENCY')
            p.addPlayerResource('RED_CURRENCY', 1000)
            HUD.refreshCurrency(player)
            refreshStore(player)
        }
    }
]

// CUI Bindings for the cheat menu; the cheat list, a display confirmation popup and the last cheat name.
const CheatBindings: hzui.Binding<CheatEntry[]> = new hzui.Binding<CheatEntry[]>(CheatsList)
const DisplayConfirmationPopUp: hzui.Binding<boolean> = new hzui.Binding<boolean>(false)
const LastCheatName: hzui.Binding<string> = new hzui.Binding<string>('')

/**
 * CUICheatMenu class;
 * 
 * A manager for the debug cheat menu.
 * 
 */
export class CUICheatMenu extends hzui.UIComponent<typeof CUICheatMenu> {
    static propsDefinition = {}

    panelWidth = 1920
    panelHeight = 1080

    /**
     * (CUI) Initialize the layout of the Cheat UI
     * 
     * @returns A UINode containing the formatted cheat UI; all the items in the cheat list above.
     */
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
                hzui.ScrollView({
                    style: {
                        height: '85%',
                        width: '100%',
                        bottom: 0,
                        right: 0,
                        position: 'absolute',
                        backgroundColor: '#000000'
                    },
                    children: [
                        hzui.DynamicList({
                            style: {
                                height: '100%',
                                width: '100%',
                                flexDirection: 'column',
                            },
                            data: CheatBindings,
                            renderItem: (data: CheatEntry) => {
                                return hzui.Pressable({
                                    style: {
                                        height: 64,
                                        width: '100%',
                                        borderColor: '#00FF00',
                                        borderWidth: 4,
                                        backgroundColor: '#000000'
                                    },
                                    children: [
                                        hzui.Text({
                                            text: `${data.name}`,
                                            style: {
                                                left: 20,
                                                fontSize: 48,
                                                color: '#00FF00'
                                            }
                                        }),
                                    ],
                                    // On click end, call the selected cheat function, setup the confirmation and play a sound. 
                                    onRelease: (player: hz.Player) => {
                                        data.functionCall(player)
                                        LastCheatName.set(data.name)
                                        DisplayConfirmationPopUp.set(true)
                                        World.world?.playSoundAt("SFX_ObtainItem_UI", player.head.position.get())
                                    }
                                })
                            }
                        }),
                    ]
                }),
                hzui.Pressable({ // Quick and dirty ConfirmationPopup, to visually confirm which button we pressed.
                    children: [
                        hzui.Text({
                            text: hzui.Binding.derive([LastCheatName], (name: string) => {
                                return `Pressed:\n${name}`
                            }),
                            style: {
                                fontSize: 64,
                                color: '#00FF00'
                            }
                        })
                    ],
                    // On click end, close the confirmation popup and play a done sound.
                    onRelease: (player: hz.Player) => {
                        DisplayConfirmationPopUp.set(false)
                        World.world?.playSound("SFX_ObtainItem_UI")
                    },
                    style: {
                        display: hzui.Binding.derive([DisplayConfirmationPopUp], (popupDisplay: boolean) => {
                            if (popupDisplay)
                                return 'flex'
                            else
                                return 'none'
                        }),
                        width: '100%',
                        height: '100%',
                        justifyContent: "center",
                        alignItems: "center",
                        flexShrink: 0,
                        backgroundColor: "#111",
                        position: "absolute",
                        left: 0,
                        top: 0
                    }
                }),
            ]
        })
    }

    start() {

    }
}
hzui.UIComponent.register(CUICheatMenu)
