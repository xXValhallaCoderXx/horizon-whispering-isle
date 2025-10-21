/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Debug, DebugMenuGroupResponse as DebugMenuGroupData } from 'Debug';
import * as hz from 'horizon/core';
import { AnimatedBinding, Animation, Binding, Easing, Image, ImageSource, Pressable, Text, UIChildren, UIComponent, UINode, View } from 'horizon/ui';
import { Logger } from 'Logger';

const NUM_ITEMS_PER_PAGE = 10;
const BACKGROUND_COLOR = "#444";
const TEXT_COLOR = "#FFF";
const BUTTON_COLOR_BACK = "#777";
const BUTTON_COLOR_SUBGROUP = "#730";
const BUTTON_COLOR_COMMAND = "#080";
const BUTTON_COLOR_TUNABLE = "#008";

const log = new Logger('UI_DebugMenu');

enum DebugOptionType {
  None,
  Group,
  Command,
  Tunable
}

export class UI_DebugMenu extends UIComponent<typeof UI_DebugMenu> {
  static propsDefinition = {
    arrow: { type: hz.PropTypes.Asset }
  };

  private options: DebugOptionViewModel[] = new Array(NUM_ITEMS_PER_PAGE);
  private pageText = new Binding("");
  private currentPathText = new Binding("");
  private leftArrowShown = new Binding(false);
  private rightArrowShown = new Binding(false);

  private currentPath: string = "";
  private currentPageIndex: number = 0;
  private focusPlayer?: hz.Player;
  private playerPaths = new Map<hz.Player, string>();
  private currentGroupData?: DebugMenuGroupData;
  private backActive = new Binding(false);

  start() {
    this.setFocusPlayer(this.world.getLocalPlayer());
    this.connectNetworkBroadcastEvent(Debug.debugMenuGroupResponse, (data) => this.onDebugMenuGroupResponse(data));
  }

  setFocusPlayer(player: hz.Player) {
    if (this.focusPlayer === player) {
      return;
    }
    if (this.focusPlayer !== undefined) {
      this.playerPaths.set(player, this.currentPath);
    }
    this.focusPlayer = player;
    if (this.focusPlayer !== undefined) {
      this.setCurrentPath(this.playerPaths.get(player) ?? "");
    }
  }

  private setCurrentPath(path: string) {
    this.currentPath = path;
    this.currentPageIndex = 0;
    this.requestDebugMenuGroup();
  }

  private requestDebugMenuGroup() {
    if (!this.focusPlayer) {
      return;
    }
    log.info(`Requesting debug menu group for ${this.currentPath}`);
    this.sendNetworkBroadcastEvent(Debug.requestDebugMenuGroup, { player: this.focusPlayer, path: this.currentPath });
  }

  private onDebugMenuGroupResponse(data: DebugMenuGroupData) {
    if (!this.focusPlayer) {
      return;
    }
    log.info(`Received debug menu group response for ${this.currentPath}`);
    this.currentGroupData = data;
    this.updateUI();
  }

  private updateUI() {
    if (!this.focusPlayer || !this.currentGroupData) {
      return;
    }
    const subGroups = this.currentGroupData.subGroups;
    const commands = this.currentGroupData.commands
    const tunables = this.currentGroupData.tunables;
    log.info(`Updating UI for ${this.currentPath} with ${subGroups.length} subgroups, ${commands.length} commands, and ${tunables.length} tunables.`);
    const maxPageCount = this.getPageCount(subGroups, commands, tunables);
    this.pageText.set(`${this.currentPageIndex + 1} / ${maxPageCount}`, [this.focusPlayer]);
    this.currentPathText.set(`Path: ${this.currentPath}`, [this.focusPlayer]);
    this.leftArrowShown.set(this.currentPageIndex > 0, [this.focusPlayer]);
    this.rightArrowShown.set(this.currentPageIndex < maxPageCount - 1, [this.focusPlayer]);
    let uiIndex = 0;
    let index = this.currentPageIndex * NUM_ITEMS_PER_PAGE;
    this.backActive.set(this.currentPath !== "", [this.focusPlayer]);
    // if (this.currentPath !== "") {
    //   if (index === 0) {
    //     const option = this.options[uiIndex];
    //     option.isShown.set(true, [this.focusPlayer]);
    //     option.name.set("<BACK>", [this.focusPlayer]);
    //     option.buttonColor.set(BUTTON_COLOR_BACK, [this.focusPlayer]);
    //     option.showValue.set(false, [this.focusPlayer]);
    //     option.showArrows.set(false, [this.focusPlayer]);
    //     option.actionOnPress.set(true, [this.focusPlayer]);
    //     option.action = () => this.goBack();
    //     index++;
    //     uiIndex++;
    //   }
    //   index--;
    // }

    while (uiIndex < NUM_ITEMS_PER_PAGE && index < subGroups.length) {
      const option = this.options[uiIndex];
      const subGroup = subGroups[index];
      option.type = DebugOptionType.Group;
      option.isShown.set(true, [this.focusPlayer]);
      option.name.set(subGroup, [this.focusPlayer]);
      option.buttonColor.set(BUTTON_COLOR_SUBGROUP, [this.focusPlayer]);
      option.showValue.set(false, [this.focusPlayer]);
      option.showArrows.set(false, [this.focusPlayer]);
      option.actionOnPress.set(true, [this.focusPlayer]);
      option.action = () => this.goToSubGroup(subGroup);
      index++;
      uiIndex++;
    }
    index -= subGroups.length;

    while (uiIndex < NUM_ITEMS_PER_PAGE && index < commands.length) {
      const option = this.options[uiIndex];
      const command = commands[index];
      option.type = DebugOptionType.Command;
      option.isShown.set(true, [this.focusPlayer]);
      option.name.set(command, [this.focusPlayer]);
      option.buttonColor.set(BUTTON_COLOR_COMMAND, [this.focusPlayer]);
      option.showValue.set(false, [this.focusPlayer]);
      option.showArrows.set(false, [this.focusPlayer]);
      option.actionOnPress.set(true, [this.focusPlayer]);
      option.action = () => this.execute(`${this.currentPath}/${command}`);
      index++;
      uiIndex++;
    }
    index -= commands.length;

    while (uiIndex < NUM_ITEMS_PER_PAGE && index < tunables.length) {
      const option = this.options[uiIndex];
      const tunable = tunables[index];
      option.type = DebugOptionType.Tunable;
      option.isShown.set(true, [this.focusPlayer]);
      option.name.set(tunable.name, [this.focusPlayer]);
      option.buttonColor.set(BUTTON_COLOR_TUNABLE, [this.focusPlayer]);
      option.showValue.set(true, [this.focusPlayer]);
      option.showArrows.set(true, [this.focusPlayer]);
      option.value.set(tunable.value.toString(), [this.focusPlayer]);
      option.actionOnPress.set(false, [this.focusPlayer]);
      option.decrement = () => this.decrement(`${this.currentPath}/${tunable.name}`);
      option.increment = () => this.increment(`${this.currentPath}/${tunable.name}`);
      index++;
      uiIndex++;
    }

    while (uiIndex < NUM_ITEMS_PER_PAGE) {
      const option = this.options[uiIndex];
      option.type = DebugOptionType.None;
      option.isShown.set(false, [this.focusPlayer]);
      option.actionOnPress.set(false, [this.focusPlayer]);
      option.showArrows.set(false, [this.focusPlayer]);
      uiIndex++;
    }
  }

  private getPageCount(subGroups?: string[], commands?: string[], tunables?: { name: string; value: number; }[]) {
    subGroups ??= this.currentGroupData?.subGroups ?? [];
    commands ??= this.currentGroupData?.commands ?? [];
    tunables ??= this.currentGroupData?.tunables ?? [];
    return Math.max(0, Math.floor((subGroups.length + commands.length + tunables.length - 1) / NUM_ITEMS_PER_PAGE)) + 1;
  }

  private execute(path: string): void {
    if (!this.focusPlayer) return;
    this.sendNetworkBroadcastEvent(Debug.executeDebugCommand, { player: this.focusPlayer, path: path });
  }

  private decrement(path: string): void {
    if (!this.focusPlayer) return;
    this.sendNetworkBroadcastEvent(Debug.decrementDebugTunable, { player: this.focusPlayer, path: path });
    this.sendNetworkBroadcastEvent(Debug.requestDebugMenuGroup, { player: this.focusPlayer, path: this.currentPath });
  }

  private increment(path: string): void {
    if (!this.focusPlayer) return;
    this.sendNetworkBroadcastEvent(Debug.incrementDebugTunable, { player: this.focusPlayer, path: path });
    this.sendNetworkBroadcastEvent(Debug.requestDebugMenuGroup, { player: this.focusPlayer, path: this.currentPath });
  }

  private goBack() {
    if (this.currentPath === "") {
      return;
    }
    const index = this.currentPath.lastIndexOf("/");
    this.setCurrentPath(index < 0 ? "" : this.currentPath.substring(0, index))
  }

  private goToSubGroup(subGroup: string) {
    this.setCurrentPath(this.currentPath === "" ? subGroup : `${this.currentPath}/${subGroup}`);
  }

  private previousPage() {
    this.currentPageIndex = Math.max(0, this.currentPageIndex - 1);
    this.updateUI();
  }

  private nextPage() {
    this.currentPageIndex = Math.min(this.getPageCount() - 1, this.currentPageIndex + 1);
    this.updateUI();
  }

  private click(player: hz.Player, option: DebugOptionViewModel): void {
    option.action(player);
    if (option.type === DebugOptionType.Command) {
      option.opacity.set(Animation.sequence(
        Animation.timing(.5, { duration: 60, easing: Easing.linear }),
        Animation.timing(1, { duration: 60, easing: Easing.linear }),
      ), undefined, [player]);
    }
  }

  initializeUI() {
    // if (this.world.getLocalPlayer() === this.world.getServerPlayer()) {
    //   return new UINode();
    // }
    for (let i = 0; i < this.options.length; ++i) {
      this.options[i] = new DebugOptionViewModel();
    }
    const children = this.options.map((option) => this.debugOption(option));

    return View({
      children: [
        View({
          children: [
            UINode.if(this.leftArrowShown, Pressable({
              children: [
                Image({
                  source: ImageSource.fromTextureAsset(this.props.arrow!),
                  style: {
                    width: 32,
                    height: 32,
                  }
                })],
              onClick: (player) => this.previousPage()
            }),
              View({
                style: {
                  width: 24,
                }
              })),
            Text({
              text: "Debug Menu",
              style: { // header
                fontSize: 24,
                fontFamily: 'Roboto',
                color: "white",
                textShadowOffset: [0, 1],
                textShadowColor: 'black',
                textShadowRadius: 4,
                textAlign: 'center',
              }
            }),
            UINode.if(this.rightArrowShown, Pressable({
              children: [
                Image({
                  source: ImageSource.fromTextureAsset(this.props.arrow!),
                  style: {
                    width: 32,
                    height: 32,
                    transform: [{ rotate: "180deg" }]
                  }
                })],
              onClick: (player) => this.nextPage()
            }),
              View({
                style: {
                  width: 24,
                }
              }))
          ],
          style: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 50
          }
        }),
        View({
          children: [
            View({
              children: [
                Pressable({
                  children: [
                    Text({
                      text: "<",
                      style: {
                        color: "#FFF",
                        textAlign: 'center',
                        alignSelf: 'center',
                        fontSize: 20,
                        fontWeight: '900'
                      }
                    })
                  ],
                  style: {
                    backgroundColor: "#888",
                    borderRadius: 4,
                    opacity: this.backActive.derive(x => x ? 1 : .4),
                    width: 28,
                    height: 28,
                    marginRight: 4,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row'
                  },
                  onClick: (player) => this.goBack()
                }),
                Text({
                  text: this.currentPathText,
                  style: {
                    color: TEXT_COLOR,
                    textAlign: 'left',
                    fontSize: 20,
                    fontFamily: 'Roboto',
                    textShadowOffset: [0, 1],
                    textShadowColor: 'black',
                    textShadowRadius: 4,
                  }
                }),
              ],
              style: {
                flexDirection: 'row',
                alignItems: 'center',
              }
            }),
            Text({
              text: this.pageText,
              style: {
                color: TEXT_COLOR,
                textAlign: 'left',
                fontSize: 20,
                fontFamily: 'Roboto',
                textShadowOffset: [0, 1],
                textShadowColor: 'black',
                textShadowRadius: 4,
              }
            }),
          ],
          style: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            width: '100%'
          }
        }),
        ...children,
      ],
      style: {
        alignItems: 'center',
        backgroundColor: BACKGROUND_COLOR,
        borderRadius: 24,
        flexDirection: 'column',
        padding: 15,
        width: 500,
        height: 500,
        alignSelf: 'center',
        justifyContent: 'center',
        position: 'absolute',
        //top: "20%",
        opacity: 0.9
      },
    });
  }

  private debugOption(option: DebugOptionViewModel): UIChildren {
    return UINode.if(option.isShown, Pressable({
      children: [
        Text({
          text: option.name,
          style: {
            marginLeft: 8,
            color: TEXT_COLOR,
            textAlign: 'left',
            fontSize: 20,
            fontFamily: 'Roboto',
            textShadowOffset: [0, 1],
            textShadowColor: 'black',
            textShadowRadius: 4,
          }
        }),
        View({
          children: [
            UINode.if(option.showArrows, Pressable({
              children: [
                Image({
                  source: ImageSource.fromTextureAsset(this.props.arrow!),
                  style: {
                    width: 28,
                    height: 28,
                  }
                })],
              onClick: (player) => option.decrement(player)
            }),
              View({
                style: {
                  width: 20,
                }
              })),
            UINode.if(option.showValue, Text({
              text: option.value,
              style: { // header
                fontSize: 20,
                fontFamily: 'Roboto',
                color: "white",
                textShadowOffset: [0, 1],
                textShadowColor: 'black',
                textShadowRadius: 4,
                textAlign: 'center',
              }
            })),
            UINode.if(option.showArrows, Pressable({
              children: [
                Image({
                  source: ImageSource.fromTextureAsset(this.props.arrow!),
                  style: {
                    width: 28,
                    height: 28,
                    transform: [{ rotate: "180deg" }]
                  }
                })],
              onClick: (player) => option.increment(player)
            }),
              View({
                style: {
                  width: 20,
                }
              }))
          ],
          style: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 8
          }
        })
      ],
      style: {
        alignItems: 'center',
        backgroundColor: option.buttonColor,
        borderRadius: 8,
        height: 36,
        marginTop: 5,
        width: 450,
        alignSelf: 'flex-start',
        justifyContent: 'space-between',
        flexDirection: 'row',
        opacity: option.opacity,
      },
      onClick: (player) => this.click(player, option),
      disabled: option.actionOnPress.derive(x => !x)
    }),
      View({
        style: {
          height: 36,
          marginTop: 5,
          borderRadius: 8,
        }
      }));
  }
}

class DebugOptionViewModel {
  type = DebugOptionType.Group;
  isShown = new Binding(false);
  name = new Binding("");
  buttonColor = new Binding("");
  value = new Binding("");
  showArrows = new Binding(false);
  showValue = new Binding(false);
  actionOnPress = new Binding(false);
  action = (player: hz.Player) => { };
  decrement = (player: hz.Player) => { };
  increment = (player: hz.Player) => { };
  opacity = new AnimatedBinding(1);
}

hz.Component.register(UI_DebugMenu);
