/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Events } from 'Events';
import { Player } from 'horizon/core';
import { Binding, Pressable, Text, UINode, View } from 'horizon/ui';
import { Logger } from 'Logger';
import { UIRoot_InteractionNonBlocking } from 'UIRoot_InteractionNonBlocking';

export type GenericDialogParams = {
  title: string;
  text: string;
  option1: string;
  option2?: string;
  option3?: string;
  buttonShowDelayMs?: number;
  nextDialogDelayMs?: number;
}

export type GenericDialogCallback = (player: Player, selection: number) => void;
export type ShowingDialogCallback = (player: Player) => void;

const log = new Logger("UIView_DialogGeneric");

export class UIView_DialogGeneric {
  private uiRoot;
  private props;
  private localPlayer;

  private dialogTitle = new Binding("talker");
  private line = new Binding("i am saying a thing");
  private option1 = new Binding("option1");
  private option2 = new Binding("option2");
  private option3 = new Binding("option3");

  private isVisible = new Binding(false);
  private option1Visible = new Binding(true);
  private option2Visible = new Binding(true);
  private option3Visible = new Binding(true);

  private onSelectionCallback: (selection: number) => void;

  constructor(uiRoot: UIRoot_InteractionNonBlocking, onSelectionCallback: (selection: number) => void) {
    this.uiRoot = uiRoot;
    this.props = uiRoot.props;
    this.localPlayer = uiRoot.world.getLocalPlayer();
    this.onSelectionCallback = onSelectionCallback;
  }

  setVisible(isVisible: boolean) {
    this.isVisible.set(isVisible, [this.localPlayer]);
    if (isVisible){
      this.uiRoot.sendLocalBroadcastEvent(Events.localHideHUD, { context: 'dialog' })
    }
    else{
      this.uiRoot.sendLocalBroadcastEvent(Events.localShowHUD, { context: 'dialog' })
    }
  }

  setup(params: GenericDialogParams) {
    const targetPlayers = [this.localPlayer];
    this.dialogTitle.set(params.title, targetPlayers);
    this.line.set(params.text, targetPlayers);
    this.updateOptionButton(this.option1, this.option1Visible, params.option1, params.buttonShowDelayMs, targetPlayers);
    this.updateOptionButton(this.option2, this.option2Visible, params.option2, params.buttonShowDelayMs, targetPlayers);
    this.updateOptionButton(this.option3, this.option3Visible, params.option3, params.buttonShowDelayMs, targetPlayers);
  }

  private updateOptionButton(option: Binding<string>, optionVisible: Binding<boolean>, optionText?: string, buttonShowDelayMs?: number, targetPlayers?: Array<Player>) {
    const isOptionVisible = optionText !== undefined && optionText !== "";
    if (isOptionVisible) {
      option.set(optionText!, targetPlayers);
    }
    if (buttonShowDelayMs === undefined || buttonShowDelayMs <= 0) {
      optionVisible.set(isOptionVisible, targetPlayers);
    } else {
      optionVisible.set(false, targetPlayers);
      if (isOptionVisible) {
        this.uiRoot.async.setTimeout(() => optionVisible.set(true, targetPlayers), buttonShowDelayMs);
      }
    }
  }

  createView(): UINode<any> {
    const root = View({ //UIDialog
      children: [
          View({ //Content
          children: [
            View({ //BG
              children: [],
              style: {
                width: 472,
                flexShrink: 0,
                alignSelf: "stretch",
                borderRadius: 12,
                borderWidth: 4,
                borderColor: "#F9D470",
                backgroundColor: "#FAECD3"
              }
          }),
              View({ //Text Group
                children: [
                  Text({ // Content Text
                    text: this.line,
                    style: {
                      width: 424,
                      color: "#5A3715",
                      textAlign: "center",
                      textAlignVertical: "center",
                      fontFamily: "Roboto",
                      fontSize: 24,
                      fontWeight: "700",
                      minHeight: 84
                    }
                  })],
                style: {
                  display: "flex",
                  paddingTop: 24,
                  paddingRight: 24,
                  paddingBottom: 16,
                  paddingLeft: 24,
                  justifyContent: "center",
                  alignItems: "center",
                  flexDirection: "row",
                  marginLeft: -472
                }
              }),
          View({ //Dialog Title Group
             children: [
              View({ //Dialog Title
              children: [
              Text({ // Text Title
                text: this.dialogTitle,
                style: {
                  color: "#5A3715",
                  textAlign: "center",
                  fontFamily: "Roboto",
                  fontSize: 28,
                  fontWeight: "900"
                }
              })],
              style: {
                  display: "flex",
                  height: 36,
                  paddingVertical: 0,
                  paddingHorizontal: 24,
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: "center",
                  borderRadius: 18,
                  backgroundColor: "#F9D470"
              }
            })],
          style: {
                display: "flex",
                width: "100%",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                position: "absolute",
                top: -17
            }
          })
          ],
            style: {
              display: "flex",
              width: 472,
              justifyContent: "center",
              alignItems: "flex-end",
              borderRadius: 12,
              flexDirection: "row"
            }
          }),

      View({ //Answers Group
        children: [
          UINode.if(this.option1Visible, Pressable({ //Btn Main
            children: [View({
              children: [Text({ // Is everything ok?
                text: this.option1,
                style: {
                  color: "#61470B",
                  textAlign: "center",
                  textAlignVertical: "center",
                  fontFamily: "Roboto",
                  fontSize: 24,
                  fontWeight: "700"
                },
              })],
              style: {
                display: "flex",
                paddingVertical: 12,
                paddingHorizontal: 24,
                justifyContent: "center",
                alignItems: "center",
                borderRadius: 20,
                borderBottomWidth: 4,
                backgroundColor: "#FFD98B",
                borderColor: "#E8BC57",
                flexDirection: "row",
                minWidth: 328
              },
            })],
            onClick: () => this.onSelectionCallback(0),
          })),
          UINode.if(this.option2Visible, Pressable({ //Btn Main
            children: [View({
              children: [Text({ // I can help!
                text: this.option2,
                style: {
                  color: "#61470B",
                  textAlign: "center",
                  textAlignVertical: "center",
                  fontFamily: "Roboto",
                  fontSize: 24,
                  fontWeight: "700"
                }
              })],
              style: {
                display: "flex",
                paddingVertical: 12,
                paddingHorizontal: 24,
                justifyContent: "center",
                alignItems: "center",
                borderRadius: 20,
                borderBottomWidth: 4,
                backgroundColor: "#FFD98B",
                borderColor: "#E8BC57",
                marginTop: 10,
                flexDirection: "row",
                minWidth: 328
              },
            })],
            onClick: () => this.onSelectionCallback(1),
          })),
          UINode.if(this.option3Visible, Pressable({ //Btn Main
            children: [View({
              children: [Text({ // Nevermind...
                text: this.option3,
                style: {
                  color: "#61470B",
                  textAlign: "center",
                  textAlignVertical: "center",
                  fontFamily: "Roboto",
                  fontSize: 24,
                  fontWeight: "700"
                }
              })],
              style: {
                display: "flex",
                paddingVertical: 12,
                paddingHorizontal: 24,
                justifyContent: "center",
                alignItems: "center",
                borderRadius: 20,
                borderBottomWidth: 4,
                backgroundColor: "#FFD98B",
                borderColor: "#E8BC57",
                marginTop: 10,
                flexDirection: "row",
                minWidth: 328
              },
            })],
            onClick: () => this.onSelectionCallback(2),
          }))
        ],
        style: {
          display: "flex",
          width: 812,
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-end",
          borderRadius: 12,
          marginTop: 13
        }
      })],
      style: {
        display: "flex",
        width: "100%",
        height: "100%",
        paddingVertical: 108,
        paddingHorizontal: 32,
        flexDirection: "column",
        alignItems: "center",
        flexShrink: 0,
        position: "relative"
      }
    })

    return UINode.if(this.isVisible, root);
  }
}
