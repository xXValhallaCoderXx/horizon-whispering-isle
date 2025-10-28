import * as hz from 'horizon/core'
import * as hzui from 'horizon/ui'
import { World } from 'World'
import * as Globals from 'Globals'
import { cleanNumberDisplay } from 'Utils'

const barMaxWidth: number = 600
const barMaxHeight: number = 60

const growBarAnimDur = 1000

const hideBarDelay = 10000

const barColor: hzui.Binding<string> = new hzui.Binding<string>('#FFF')
const nextFillColor: hzui.Binding<string> = new hzui.Binding<string>('#FFF')

const backpackBarWidth: hzui.Binding<number> = new hzui.Binding<number>(0)
const backpackBarHeight: number = 100

const currencyGreen: hzui.Binding<number> = new hzui.Binding<number>(0)
const currencyBlue: hzui.Binding<number> = new hzui.Binding<number>(0)
const currencyPurple: hzui.Binding<number> = new hzui.Binding<number>(0)
const currencyRed: hzui.Binding<number> = new hzui.Binding<number>(0)

const deltaGreen: hzui.Binding<number> = new hzui.Binding<number>(0)
const deltaBlue: hzui.Binding<number> = new hzui.Binding<number>(0)
const deltaPurple: hzui.Binding<number> = new hzui.Binding<number>(0)
const deltaRed: hzui.Binding<number> = new hzui.Binding<number>(0)

const progressText: hzui.Binding<string> = new hzui.Binding<string>('')
const PROGRESS_BAR_ANIMATION_LEAD: hzui.AnimatedBinding = new hzui.AnimatedBinding(0)
const CAPACITY_BAR_ANIMATION_LEAD: hzui.AnimatedBinding = new hzui.AnimatedBinding(0)
const NEXT_FILL: hzui.Binding<number> = new hzui.Binding<number>(0)
const capacityText: hzui.Binding<string> = new hzui.Binding<string>('')

const isBarHidden: hzui.Binding<boolean> = new hzui.Binding<boolean>(true)
const debugFlagBinding: hzui.Binding<boolean> = new hzui.Binding<boolean>(World.isDebug)
// ====================================================================================================================
// THE HIDE BAR TIMER
const HIDE_BAR_ANIMATION_LEAD: hzui.AnimatedBinding = new hzui.AnimatedBinding(0)

const HIDE_BAR_SEQUENCE = hzui.Animation.sequence(
    hzui.Animation.delay(0,
        hzui.Animation.timing(1, {
            duration: hideBarDelay,
            easing: hzui.Easing.inOut(hzui.Easing.linear),
        })
    ),
)

const QUICK_HIDE_SEQUENCE = hzui.Animation.sequence(
    hzui.Animation.delay(0,
        hzui.Animation.timing(1, {
            duration: 0,
            easing: hzui.Easing.inOut(hzui.Easing.linear),
        })
    ),
)

// ====================================================================================================================
// THE CURRENCY DELTA
const CURRENCY_DELTA_ANIMATION_LEAD: hzui.AnimatedBinding = new hzui.AnimatedBinding(0)

const CURRENCY_DELTA_SEQUENCE = hzui.Animation.sequence(
    hzui.Animation.delay(0,
        hzui.Animation.timing(1, {
            duration: 500,
            easing: hzui.Easing.inOut(hzui.Easing.linear),
        })
    ),
)

// ====================================================================================================================
// THE FADE LOOP DELTA
const FADE_LOOP_ANIMATION_LEAD: hzui.AnimatedBinding = new hzui.AnimatedBinding(0)

const FADE_LOOP_SEQUENCE = hzui.Animation.sequence(
    hzui.Animation.repeat(
        hzui.Animation.delay(0,
            hzui.Animation.timing(1, {
                duration: 2000,
                easing: hzui.Easing.inOut(hzui.Easing.linear),
            })
        )
    )
)

/**
 *  CUIHUD class;
 * 
 *  A HUD implementation using the 'Custom UI' API
 * 
 * @param greenGem - The texture asset for the green gem display. 
 * @param blueGem - The texture asset for the blue gem display.
 * @param violetGem - The texture asset for the violet gem display.
 * @param redGem - The texture asset for the red gem display.
 */
export class CUIHUD extends hzui.UIComponent<typeof CUIHUD> {
    static propsDefinition = {
        greenGem: { type: hz.PropTypes.Asset },
        blueGem: { type: hz.PropTypes.Asset },
        violetGem: { type: hz.PropTypes.Asset },
        redGem: { type: hz.PropTypes.Asset },
    }

    // values are thrown away when used in 
    panelWidth = 1400
    panelHeight = 600
    fontFamily: hzui.FontFamily = 'Roboto'

    /**
     * (CUI) Initialize the layout of the HUD UI
     * 
     * @returns A UINode containing a formatted HUD; a progress bar, ore collection stats, a backpack bar etc.
     */
    initializeUI() {
        return hzui.View({
            style: {
                height: '100%',
                width: '100%',
                display: Globals.HUD_DISPLAY.derive((show: boolean) => {
                    if (show)
                        return 'flex'
                    else
                        return 'none'
                })
            },
            children: [
                // Progress Bar Backing
                hzui.View({
                    style: {
                        width: barMaxWidth + 20,
                        height: barMaxHeight + 20,
                        backgroundColor: '#000',
                        alignSelf: 'center',
                        top: 50,
                        borderRadius: 5,
                        position: 'absolute',
                        opacity: HIDE_BAR_ANIMATION_LEAD.interpolate([0, 0.99, 1], [0.75, 0.75, 0])
                    }
                }),
                // Progress Bar
                hzui.View({
                    style: {
                        width: barMaxWidth,
                        height: barMaxHeight,
                        alignSelf: 'center',
                        top: 60,
                        borderRadius: 5,
                        position: 'absolute',
                        opacity: HIDE_BAR_ANIMATION_LEAD.interpolate([0, 0.99, 1], [1, 1, 0])
                    },
                    children: [
                        hzui.View({
                            style: {
                                width: PROGRESS_BAR_ANIMATION_LEAD.interpolate([0, 1], [0, barMaxWidth]),
                                height: barMaxHeight,
                                backgroundColor: barColor,
                                alignSelf: 'flex-start',
                                borderRadius: 5,
                                position: 'absolute'
                            },
                        })
                    ]
                }),
                // Progress Bar Text
                hzui.Text({
                    text: progressText,
                    style: {
                        fontSize: 24,
                        fontFamily: this.fontFamily,
                        textShadowColor: '#FFF',
                        color: '#FFF',
                        textAlign: 'center',
                        textAlignVertical: 'center',
                        zIndex: 3,
                        width: barMaxWidth + 20,
                        height: barMaxHeight + 20,
                        alignSelf: 'center',
                        top: 50,
                        borderRadius: 5,
                        position: 'absolute',
                        opacity: HIDE_BAR_ANIMATION_LEAD.interpolate([0, 0.99, 1], [1, 1, 0])
                    }
                }),

                // Backpack Display
                hzui.View({
                    style: {
                        width: backpackBarWidth.derive((value) => {
                            return (value * 2) + 10
                        }),
                        height: backpackBarHeight + 10 + 35,
                        bottom: 175 - 5,
                        left: 600 - 5,
                        position: 'absolute',
                        zIndex: 0
                    },
                    children: [
                        // Backpack Backing
                        hzui.View({
                            style: {
                                width: backpackBarWidth.derive((value) => {
                                    return (value * 2) + 10
                                }),
                                height: backpackBarHeight + 10,
                                backgroundColor: '#000',
                                top: 0,
                                alignSelf: 'center',
                                borderTopLeftRadius: 5,
                                borderTopRightRadius: 5,
                                borderBottomLeftRadius: debugFlagBinding.derive((isDebugMode: boolean) => {
                                    if (isDebugMode)
                                        return 0
                                    else
                                        return 5
                                }),
                                borderBottomRightRadius: debugFlagBinding.derive((isDebugMode: boolean) => {
                                    if (isDebugMode)
                                        return 0
                                    else
                                        return 5
                                }),
                                position: 'absolute',
                                opacity: 0.75,
                                zIndex: 0
                            }
                        }),
                        // Backpack Bar
                        hzui.View({
                            style: {
                                width: backpackBarWidth.derive((value) => {
                                    return (value * 2)
                                }),
                                height: backpackBarHeight,
                                top: 0 + 5,
                                alignSelf: 'center',
                                borderRadius: 5,
                                position: 'absolute',
                                flexDirection: 'column',
                                alignContent: "flex-end",
                                alignItems: 'flex-end',
                                zIndex: 2

                            },
                            children: [
                                hzui.View({
                                    style: {
                                        bottom: 0,
                                        width: backpackBarWidth.derive((value) => {
                                            return (value * 2)
                                        }),
                                        height: CAPACITY_BAR_ANIMATION_LEAD.interpolate([0, 1], [0, backpackBarHeight]),
                                        backgroundColor: '#FF0',
                                        borderRadius: 5,
                                        position: 'absolute'
                                    },
                                })
                            ]
                        }),
                        // Next Fill Bar
                        hzui.View({
                            style: {
                                width: backpackBarWidth.derive((value) => {
                                    return (value * 2)
                                }),
                                height: backpackBarHeight,
                                top: 0 + 5,
                                alignSelf: 'center',
                                borderRadius: 5,
                                position: 'absolute',
                                flexDirection: 'column',
                                alignContent: "flex-end",
                                alignItems: 'flex-end',
                                zIndex: 1

                            },
                            children: [
                                hzui.View({
                                    style: {
                                        bottom: 0,
                                        width: backpackBarWidth.derive((value) => {
                                            return (value * 2)
                                        }),
                                        height: NEXT_FILL.derive((val: number) => {
                                            return val * backpackBarHeight
                                        }),
                                        backgroundColor: nextFillColor,
                                        borderRadius: 5,
                                        position: 'absolute',
                                        opacity: FADE_LOOP_ANIMATION_LEAD.interpolate([0, 0.5, 1], [0.5, 0.75, 0.5])
                                    },
                                })
                            ]
                        }),
                        // Backpack text
                        hzui.Text({
                            text: capacityText,
                            style: {
                                fontSize: 24,
                                fontFamily: this.fontFamily,
                                textShadowColor: '#FFF',
                                color: '#FFF',
                                textAlign: 'center',
                                textAlignVertical: 'center',
                                bottom: 0,
                                alignSelf: 'center',
                                height: 35,
                                width: 100,
                                position: 'absolute',
                                zIndex: 2,
                                display: debugFlagBinding.derive((isDebugMode: boolean) => {
                                    if (isDebugMode)
                                        return 'flex'
                                    else
                                        return 'none'
                                })
                            }
                        }),
                        // Backpack text backing
                        hzui.View({
                            style: {
                                bottom: 0,
                                alignSelf: 'center',
                                borderRadius: 5,
                                backgroundColor: '#000',
                                opacity: 0.75,
                                height: 35,
                                width: 100,
                                position: 'absolute',
                                zIndex: 0,
                                display: debugFlagBinding.derive((isDebugMode: boolean) => {
                                    if (isDebugMode)
                                        return 'flex'
                                    else
                                        return 'none'
                                })
                            }
                        }),
                    ]
                }),


                // currency display
                hzui.View({
                    children: hzui.View({
                        style: {
                            left: '5%',
                            width: '90%',
                            height: '100%',
                            flexDirection: 'column',
                            justifyContent: 'space-evenly',
                        },
                        children: [
                            this.currencyElement(currencyGreen, this.props.greenGem),
                            this.currencyElement(currencyBlue, this.props.blueGem),
                            this.currencyElement(currencyPurple, this.props.violetGem),
                            this.currencyElement(currencyRed, this.props.redGem),
                            hzui.View({
                                style: {
                                    backgroundColor: '#000',
                                    opacity: 0.75,
                                    height: '100%',
                                    width: '100%',
                                    zIndex: -1,
                                    borderRadius: 5,
                                    position: 'absolute'
                                }
                            })
                        ],
                    }),
                    style: {
                        width: '15%',
                        height: '32%',
                        right: '5%',
                        top: '13%',
                        justifyContent: 'center',
                        position: 'absolute'
                    },
                }),
                // Positive currency deltas
                hzui.View({
                    children: hzui.View({
                        style: {
                            left: '5%',
                            width: '90%',
                            height: '100%',
                            flexDirection: 'column',
                            justifyContent: 'space-evenly',
                        },
                        children: [
                            this.deltaElement(deltaGreen),
                            this.deltaElement(deltaBlue),
                            this.deltaElement(deltaPurple),
                            this.deltaElement(deltaRed),
                        ],
                    }),
                    style: {
                        width: '15%',
                        height: '32%',
                        right: CURRENCY_DELTA_ANIMATION_LEAD.interpolate([0, 1], ['20%', '5%']),
                        top: '13%',
                        justifyContent: 'center',
                        position: 'absolute',
                        opacity: CURRENCY_DELTA_ANIMATION_LEAD.interpolate([0, 0.75, 1], [1, 1, 0]),
                    },
                })

            ]
        })
    }

    /**
     * Setup event handlers
     */
    start() {
        this.connectNetworkBroadcastEvent(Globals.DisplayHUDEvent, (payload: { player: hz.Player, show: boolean }) => {
            Globals.HUD_DISPLAY.set(payload.show, [payload.player])
        })

        this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterWorld, (player: hz.Player) => {
            this.async.setTimeout(() => {
                refreshBackpack(player)
                refreshCurrency(player)
                hideBar(player)
                FADE_LOOP_ANIMATION_LEAD.set(FADE_LOOP_SEQUENCE)
            }, 500)
        })
    }

    /**
     * 
     * Helper function to layout the currency display; a gem image and the amount text.
     * 
     * @param amount - The amount of a specific currency.
     * @param icon - The texture icon for a currency.
     * @param top - Optional. The top style.
     */
    currencyElement(amount: hzui.Binding<number>, icon: hz.Asset | undefined, top: string | undefined = undefined) {
        return hzui.View({
            children: [
                hzui.Text({
                    text: amount.derive((value: number) => {
                        return cleanNumberDisplay(value)
                    }),
                    style: {
                        fontSize: 30,
                        fontFamily: this.fontFamily,
                        textShadowColor: '#FFF',
                        textAlign: 'right',
                        paddingRight: 5,
                    }
                }),
                hzui.Image({
                    source: hzui.ImageSource.fromTextureAsset(icon!),
                    style: {
                        width: 40, height: 40,
                        paddingLeft: 5,
                    }
                }),
            ],
            style: {
                flexDirection: 'row',
                alignSelf: 'flex-end',
                padding: 5,
                top: top,
            },
        })
    }

    /**
     * Helper function to layout a text element showing the amount of a currency gained (+150 etc)
     * 
     * @param amount - The amount the currency has changed.
     */
    deltaElement(amount: hzui.Binding<number>) {
        return hzui.View({
            children: [
                hzui.Text({
                    text: amount.derive((value: number) => {
                        return cleanNumberDisplay(value, true)
                    }),
                    style: {
                        fontSize: 30,
                        fontFamily: this.fontFamily,
                        textShadowColor: '#FFF',
                        textAlign: 'right',
                        paddingRight: 5,
                    }
                }),
            ],
            style: {
                flexDirection: 'row',
                alignSelf: 'flex-end',
                padding: 5,
                opacity: amount.derive((value: number) => {
                    if (value == 0)
                        return 0
                    else
                        return 1
                })
            },
        })
    }
}
hzui.UIComponent.register(CUIHUD)

/**
 * Helper function calculate when to hide the progress bar if we are not mining.
 * 
 * @param player - The Horizon player who owns this progress bar.
 */
function startHideBarTimer(player: hz.Player) {
    HIDE_BAR_ANIMATION_LEAD.reset([player])
    isBarHidden.set(false, [player])
    HIDE_BAR_ANIMATION_LEAD.set(HIDE_BAR_SEQUENCE, (finished: boolean, player: hz.Player) => {
        if (finished) {
            isBarHidden.set(true, [player])
            console.log('Bar hidden')

            refreshNextFill(player)
        }
    }, [player])
}

/**
 * Helper function to hide the progress bar if we are not mining.
 * 
 * @param player - The Horizon player who owns this progress bar.
 */
function hideBar(player: hz.Player) {
    HIDE_BAR_ANIMATION_LEAD.reset([player])
    HIDE_BAR_ANIMATION_LEAD.set(QUICK_HIDE_SEQUENCE, undefined, [player])
    isBarHidden.set(true, [player])
}

/**
 * Updates the progress bar.
 * 
 * @param player - The Horizon player updating the bar.
 * @param toolPower - The power level of the tool used.  For calculating progression.
 */
export function refreshBar(player: hz.Player, toolPower: number) {
    let simPlayer = World.world?.getSimPlayer(player.name.get())

    if (!simPlayer) {
        console.error("HUD: No player for progress bar")
        return
    }

    const toolName = simPlayer.getEquippedGrabbable()?.toolName!
    const lastType = simPlayer.lastExtractedType

    let color = '#000'
    switch (lastType) {
        case 'GREEN_ORE':
            color = '#0F0'
            break
        case 'BLUE_ORE':
            color = '#0026FA'
            break
        case 'PURPLE_ORE':
            color = '#F0F'
            break
        case 'RED_ORE':
            color = '#F00'
            break
    }

    const endpoint = simPlayer.extractionProgress
    const threshold = simPlayer.extractionThreshold

    let completions = Math.floor(toolPower / threshold)
    const modProgressGain = toolPower % threshold
    if (endpoint < modProgressGain) {
        completions += 1
    }

    let visProgress = simPlayer.extractionProgress / simPlayer.extractionThreshold

    barColor.set((prev: string) => {
        if (prev != color) {
            PROGRESS_BAR_ANIMATION_LEAD.reset([player])
        }
        return color
    }, [player])

    progressText.set(`${simPlayer.extractionProgress}/${simPlayer.extractionThreshold}`, [player])

    const animSequence: hzui.Animation[] = []
    if (completions == 1) {
        animSequence.push(
            hzui.Animation.sequence(...[
                hzui.Animation.timing(1, {
                    duration: growBarAnimDur / (completions + 1),
                    easing: hzui.Easing.inOut(hzui.Easing.linear),
                }),
                hzui.Animation.timing(0, {
                    duration: 0,
                    easing: hzui.Easing.inOut(hzui.Easing.linear),
                }),
            ]),
        )
    }
    if (completions > 1) {
        animSequence.push(
            hzui.Animation.repeat(
                hzui.Animation.sequence(...[
                    hzui.Animation.timing(1, {
                        duration: growBarAnimDur / (completions + 1),
                        easing: hzui.Easing.inOut(hzui.Easing.linear),
                    }),
                    hzui.Animation.timing(0, {
                        duration: 0,
                        easing: hzui.Easing.inOut(hzui.Easing.linear),
                    }),
                ]),
                completions - 1
            )
        )
    }
    animSequence.push(
        hzui.Animation.timing(visProgress, {
            duration: growBarAnimDur / (completions + 1),
            easing: hzui.Easing.inOut(hzui.Easing.linear),
        })
    )

    let GROW_BAR_SEQUENCE = hzui.Animation.sequence(...animSequence)


    PROGRESS_BAR_ANIMATION_LEAD.set(GROW_BAR_SEQUENCE, (f: boolean, p: hz.Player) => {
        let sP = World.world?.getSimPlayer(player.name.get())

        if (!sP) {
            console.error("HUD: No player for progress bar reset")
            return
        }
    }, [player])

    refreshNextFill(player)

    startHideBarTimer(player)
}

/**
 * Updates the backpack bar as we fill it with resources.
 * 
 * @param player - The Horizon player who owns this backpack bar.
 */
export function refreshBackpack(player: hz.Player) {
    console.log('Refreshing Display')

    let simPlayer = World.world?.getSimPlayer(player.name.get())
    if (!simPlayer) {
        console.error("HUD: No player for backpack display")
        return
    }

    let capacity = simPlayer.getResourcesWeight() / simPlayer.inventoryCapacity

    capacityText.set(`${simPlayer.getResourcesWeight()}/${simPlayer.inventoryCapacity}`, [player])

    const CAPACITY_BAR_SEQUENCE = hzui.Animation.sequence(
        hzui.Animation.delay(0,
            hzui.Animation.timing(capacity, {
                duration: 200,
                easing: hzui.Easing.inOut(hzui.Easing.linear),
            })
        ),
    )
    CAPACITY_BAR_ANIMATION_LEAD.set(CAPACITY_BAR_SEQUENCE, undefined, [player])

    refreshNextFill(player)

    refreshBackpackWidth(player)
}

/**
 * Updates the currency display.
 * 
 * @param player - The Horizon player who owns this HUD currency display.
 */
export function refreshCurrency(player: hz.Player) {
    console.log('Refreshing Display')

    let p = World.world?.getSimPlayer(player.name.get())
    if (!p) {
        console.error("HUD: No player for currency display")
        return
    }

    const newGreen = p.getPlayerResource('GREEN_CURRENCY')
    const newBlue = p.getPlayerResource('BLUE_CURRENCY')
    const newPurple = p.getPlayerResource('PURPLE_CURRENCY')
    const newRed = p.getPlayerResource('RED_CURRENCY')

    let oldGreen = 0
    let oldBlue = 0
    let oldPurple = 0
    let oldRed = 0

    currencyGreen.set((prev: number) => {
        oldGreen = prev
        return prev
    }, [player])
    currencyBlue.set((prev: number) => {
        oldBlue = prev
        return prev
    }, [player])
    currencyPurple.set((prev: number) => {
        oldPurple = prev
        return prev
    }, [player])
    currencyRed.set((prev: number) => {
        oldRed = prev
        return prev
    }, [player])

    const deltaG = newGreen - oldGreen
    const deltaB = newBlue - oldBlue
    const deltaP = newPurple - oldPurple
    const deltaR = newRed - oldRed
    deltaGreen.set(deltaG, [player])
    deltaBlue.set(deltaB, [player])
    deltaPurple.set(deltaP, [player])
    deltaRed.set(deltaR, [player])

    // animate
    CURRENCY_DELTA_ANIMATION_LEAD.reset([player])
    CURRENCY_DELTA_ANIMATION_LEAD.set(CURRENCY_DELTA_SEQUENCE, (finished: boolean, player: hz.Player) => {
        // callback to update values
        currencyGreen.set(newGreen, [player])
        currencyBlue.set(newBlue, [player])
        currencyPurple.set(newPurple, [player])
        currencyRed.set(newRed, [player])
    }, [player])
}

/**
 * Helper function to fill in the bar as we mine.
 * 
 * @param player - The Horizon player who owns this HUD.
 */

function refreshNextFill(player: hz.Player) {
    let simPlayer = World.world?.getSimPlayer(player.name.get())

    if (!simPlayer) {
        console.error("HUD: No player for progress bar")
        return
    }

    let hidden = false

    isBarHidden.set((val: boolean) => {
        hidden = val
        return val
    }, [player])

    if (simPlayer.extractionProgress != 0 && !hidden) {
        NEXT_FILL.set((simPlayer.getResourcesWeight() + Globals.RESOURCE_WEIGHT_MAP.get(simPlayer.lastExtractedType)!) / simPlayer.inventoryCapacity, [player])
        if ((simPlayer.getResourcesWeight() + Globals.RESOURCE_WEIGHT_MAP.get(simPlayer.lastExtractedType)!) / simPlayer.inventoryCapacity > 1) {
            nextFillColor.set('#F00', [player])
        }
        else {
            nextFillColor.set('#FFF', [player])
        }
    }
    else {
        NEXT_FILL.set(0, [player])
    }
}

/**
 * Set the backpack bar width based on capacity.   Bigger backpacks have fatter bars.
 * 
 * @param player - The Horizon player who owns this backpack bar.
 */
export function refreshBackpackWidth(player: hz.Player) {
    let p = World.world?.getSimPlayer(player.name.get())
    if (!p) {
        console.error("HUD: No player for currency display")
        return
    }

    backpackBarWidth.set(p.inventoryCapacity, [player])
}

