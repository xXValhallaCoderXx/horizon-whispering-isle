import * as hz from 'horizon/core';	// Imports core functionalities from the Horizon engine.
import * as ui from 'horizon/ui';   // Imports Horizon UI functionalities, including base UI components and styles.
import { CUILibText, CUILibViewContainer } from 'CUILib'
import { cuiButton } from 'cuiButton'
import { cuiCustomFlexPanelConfig, cuiSetupCustomFlexPanel, cuiThemeStyle, defaultcuiThemeStyle, cuiGetPanelStyle } from 'cuiFlexPanel'

export const buttonPressEvent = new hz.CodeBlockEvent<[player: hz.Player, ID: string]>('buttonPress', [hz.PropTypes.Player, hz.PropTypes.String])


 /**
 * BasicButton class;
 * 
 * A simple UI button
 * 
 * @param targetEntity - The game object which should receive the button event.
 * @param ID - A unique identifier for this button event.
 * @param title - Text in the dialog box.
 * @param buttonText - Text on the actual button.
 * @param pressSound - Optional. The sound played when the button is released. This sound is provided here, it is not managed by the world.
 * @param releaseSound - Optional. The sound played when the button is released. This sound is provided here, it is not managed by the world.
 */
export class BasicButton extends ui.UIComponent {
    static propsDefinition = {
        targetEntity: { type: hz.PropTypes.Entity },
        ID: { type: hz.PropTypes.String, default: 'Button1' },
        title: { type: hz.PropTypes.String, default: 'What does this button do?' },
        buttonText: { type: hz.PropTypes.String, default: 'Press Here' },
        pressSound: { type: hz.PropTypes.Entity, default: undefined },
        releaseSound: { type: hz.PropTypes.Entity, default: undefined },
    };

    panelHeight = 260;
    panelWidth = 800;

    titleBinding: ui.Binding<string> = new ui.Binding('');
    buttonTextBinding: ui.Binding<string> = new ui.Binding('');

    private targetEntity: hz.Entity | undefined = undefined;

    // sounds:
    pressSound: hz.Entity | undefined = undefined
    releaseSound: hz.Entity | undefined = undefined

    private flexConfig: cuiCustomFlexPanelConfig = {
        type: 'column',
        children: [
            {
                nodeIdx: 0,
                type: 'row',
                children: [],
            },
        ]
    };

    /**
     * Format and return a dialog box with a single button in it, based on the properties passed in.
     * 
     * @param props - Parent for the rest of the parameters:
     * @param themeStyle - The CUI theme to use for this button.
     * @param titleBinding  - A link to the title to display above the button.
     * @param buttonTextBinding - A link to the text to display on the button.
     * @returns - A CUI button.
     */
    getFormattedUiNode(props: {
        themeStyle: cuiThemeStyle,
        titleBinding: ui.Binding<string>,
        buttonTextBinding: ui.Binding<string>
    }): ui.UINode {
        let viewChildren: ui.UINode[] = []
        viewChildren.push(
            CUILibViewContainer({
                children: [
                    CUILibText({
                        text: props.titleBinding,
                        textStyle: {
                            ...props.themeStyle.textStyle,
                            fontSize: 48,
                        }
                    })
                ],
                style: {
                    alignItems: 'center',
                    marginBottom: 32,
                }
            })
        )
        viewChildren.push(
            cuiButton({
                label: props.buttonTextBinding,
                color: 'green',
                style: {
                    width: 600,
                    height: 100,
                    borderRadius: 50,
                },
                textStyle: {
                    fontSize: 64,
                },
                onPress: this.onPress.bind(this),
                onRelease: this.onRelease.bind(this),
            })
        )
        return CUILibViewContainer({
            children: viewChildren,
            style: {
                ...cuiGetPanelStyle({ themeStyle: props.themeStyle, topLeft: true, bottomLeft: true, topRight: true, bottomRight: true }),
                width: 800,   // width= button width + 2*padding = 600 + 2*16 = 632+168
                height: 260,  // height=1button*(height+marginBottom) + 2*padding = 1*(100+16) + 2*16 = 148 + text (48+32) + 32
                alignItems: 'center',
            }
        })
    }

    /**
     * Format a simple button as a UINode
     * 
     * @returns - A UINode formatted as a dialog box with a button.
     */
    initializeUI() {
        this.titleBinding.set(this.props.title);
        this.buttonTextBinding.set(this.props.buttonText);
        const childPanels: ui.UINode[] = [];
        childPanels.push(this.getFormattedUiNode({ themeStyle: defaultcuiThemeStyle, titleBinding: this.titleBinding, buttonTextBinding: this.buttonTextBinding }))
        return cuiSetupCustomFlexPanel(this.flexConfig, childPanels)
    }

    /**
     * On start, initialize sound and target data from properties.
     */
    start() {
        this.pressSound = this.props.pressSound
        this.releaseSound = this.props.releaseSound
        this.targetEntity = this.props.targetEntity
    }

    /**
     * On button press, play the press sound.
     */
    onPress(player: hz.Player) {
        if (this.pressSound) {
            this.pressSound.as(hz.AudioGizmo).play({ fade: 0, players: [player] })
        }
    }

    /**
     * On button release, send the press event and a sound.
     */
    onRelease(player: hz.Player) {
        if (this.releaseSound) {
            this.releaseSound.as(hz.AudioGizmo).play({ fade: 0, players: [player] })
        }
        if (this.targetEntity != undefined) {
            this.sendCodeBlockEvent(this.targetEntity, buttonPressEvent, player, this.props.ID)
        }
    }
}
ui.UIComponent.register(BasicButton);