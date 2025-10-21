/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { HUDElementType } from 'Enums';
import { Events } from 'Events';
import { Asset, Player } from 'horizon/core';
import { Binding, Image, ImageSource, Pressable, Text, UINode, View } from 'horizon/ui';
import { Logger } from 'Logger';
import { UIRoot_InteractionNonBlocking } from 'UIRoot_InteractionNonBlocking';

const MAX_BUTTONS = 3;

// TODO: pretty sure we can send arrays over network, maybe make option params an array.
export type PopupDialogParams = {
  title: string;
  text: string;
  titleTextColor?: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  option1: string;
  option2?: string;
  option3?: string;
  option1TextColor?: string;
  option2TextColor?: string;
  option3TextColor?: string;
  option1BGColor?: string;
  option2BGColor?: string;
  option3BGColor?: string;
  option1BorderColor?: string;
  option2BorderColor?: string;
  option3BorderColor?: string;
  buttonShowDelayMs?: number;
  nextDialogDelayMs?: number;
  imageId?: bigint;
  imageVersionId?: bigint;
  blockPlayerMovement?: boolean;
  excludeUI?: HUDElementType;
}

export type PopupDialogCallback = (player: Player, selection: number) => void;

const log = new Logger("UIView_PopupDialog");

export class UIView_PopupDialog {
  private uiRoot;
  private props;
  private localPlayer;

  private dialogTitle = new Binding("talker");
  private line = new Binding("i am saying a thing");
  private textColor = new Binding("#FFF");
  private bgColor = new Binding("#FFF");
  private borderColor = new Binding("#FFF");
  private isVisible = new Binding(false);
  private dialogImage!: Binding<ImageSource>;
  private showImage = new Binding(false);
  private buttons = Array<ButtonViewModel>(MAX_BUTTONS);

  private onSelectionCallback: (selection: number) => void;
  private titleTextColor = new Binding("#FFF");

  private excludeUI?: HUDElementType;

  constructor(uiRoot: UIRoot_InteractionNonBlocking, onSelectionCallback: (selection: number) => void) {
    this.uiRoot = uiRoot;
    this.props = uiRoot.props;
    this.localPlayer = uiRoot.world.getLocalPlayer();
    this.onSelectionCallback = onSelectionCallback;

    this.dialogImage = new Binding<ImageSource>(ImageSource.fromTextureAsset(this.props.missingTexture!));

    for (let i = 0; i < MAX_BUTTONS; i++) {
      this.buttons[i] = new ButtonViewModel(i);
    }
  }

  setVisible(isVisible: boolean) {
    this.isVisible.set(isVisible, [this.localPlayer]);
    if (isVisible) {
      this.uiRoot.sendLocalBroadcastEvent(Events.localHideHUD, { context: 'dialog-popup', exclude: this.excludeUI })
    }
    else {
      this.uiRoot.sendLocalBroadcastEvent(Events.localShowHUD, { context: 'dialog-popup', exclude: this.excludeUI })
    }
  }

  setup(params: PopupDialogParams) {
    const targetPlayers = [this.localPlayer];
    this.excludeUI = params.excludeUI;
    this.dialogTitle.set(params.title, targetPlayers);
    this.line.set(params.text, targetPlayers);
    this.titleTextColor.set(params.titleTextColor ?? "#FFF3F4", targetPlayers);
    this.textColor.set(params.textColor ?? "#290101", targetPlayers);
    this.bgColor.set(params.bgColor ?? "#FFE4E5", targetPlayers);
    this.borderColor.set(params.borderColor ?? "#F02849", targetPlayers);
    const hasImage = params.imageId !== undefined;
    this.showImage.set(hasImage, targetPlayers);
    if (hasImage) {
      const image = new Asset(params.imageId!, params.imageVersionId);
      this.dialogImage.set(ImageSource.fromTextureAsset(image), targetPlayers);
    }
    this.updateOptionButton(this.buttons[0], params.option1, params.option1TextColor ?? params.textColor, params.option1BGColor ?? params.borderColor, params.option1BorderColor ?? params.option1BGColor ?? params.borderColor, params.buttonShowDelayMs, targetPlayers);
    this.updateOptionButton(this.buttons[1], params.option2, params.option2TextColor ?? params.textColor, params.option2BGColor ?? params.borderColor, params.option2BorderColor ?? params.option2BGColor ?? params.borderColor, params.buttonShowDelayMs, targetPlayers);
    this.updateOptionButton(this.buttons[2], params.option3, params.option3TextColor ?? params.textColor, params.option3BGColor ?? params.borderColor, params.option3BorderColor ?? params.option3BGColor ?? params.borderColor, params.buttonShowDelayMs, targetPlayers);
  }

  private updateOptionButton(option: ButtonViewModel, optionText?: string, textColor?: string, bgColor?: string, borderColor?: string, buttonShowDelayMs?: number, targetPlayers?: Array<Player>) {
    const isOptionVisible = optionText !== undefined && optionText !== "";
    if (!isOptionVisible) {
      option.visible.set(false, targetPlayers);
      return;
    }
    option.text.set(optionText!, targetPlayers);
    option.textColor.set(textColor ?? "#61470B", targetPlayers);
    option.bgColor.set(bgColor ?? "#FFCB5C", targetPlayers);
    option.borderColor.set(borderColor ?? "#CCA855", targetPlayers);
    if (buttonShowDelayMs === undefined || buttonShowDelayMs <= 0) {
      option.visible.set(true, targetPlayers);
    } else {
      option.visible.set(false, targetPlayers);
      this.uiRoot.async.setTimeout(() => option.visible.set(true, targetPlayers), buttonShowDelayMs);
    }
  }

  createView(): UINode<any> {
    const buttons = this.buttons.map(b => this.dialogButton(b));
    const root = View({ //UIPotionReminderToast
      children: [View({ //Gem Region Toast
        children: [View({ //Content Group
          children: [
            View({ //Horizontal Layout
              children: [
                UINode.if(this.showImage, Image({ //icn_gem
                  source: this.dialogImage,
                  style: {
                    width: 42,
                    height: 42,
                    resizeMode: "cover",
                    marginRight: 4
                  }
                })),
                Text({ // Buy Potions from Lucky to boost chance of higher rarity items!
                  text: this.line,
                  style: {
                    maxWidth: 400,
                    color: this.textColor,
                    textAlign: "center",
                    fontFamily: "Roboto",
                    fontSize: 20,
                    fontWeight: "700"
                  }
                })],
              style: {
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                flexDirection: "row",
                position: "relative"
              }
            }),
            View({ //Btn Group
              children: buttons,
              style: {
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                alignSelf: "stretch",
                marginTop: 16,
                flexDirection: "row"
              }
            })],
          style: {
            display: "flex",
            paddingTop: 32,
            paddingRight: 32,
            paddingBottom: 8,
            paddingLeft: 32,
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            alignSelf: "stretch",
            borderRadius: 16,
            borderWidth: 4,
            borderColor: this.borderColor,
            backgroundColor: this.bgColor,
            minWidth: 420
          }
        }),
        View({ //Title
          children: [Text({ // Potions Recommended!
            text: this.dialogTitle,
            style: {
              color: this.titleTextColor,
              textAlign: "center",
              fontFamily: "Roboto",
              fontSize: 24,
              fontWeight: "700"
            }
          })],
          style: {
            display: "flex",
            height: 32,
            paddingVertical: 0,
            paddingHorizontal: 32,
            justifyContent: "center",
            alignItems: "center",
            position: "absolute",
            top: -16,
            borderRadius: 30,
            backgroundColor: this.borderColor,
            flexDirection: "row",
            alignSelf: "center"
          }
        })],
        style: {
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          borderRadius: 16
        }
      })],
      style: {
        display: "flex",
        width: "100%",
        height: "100%",
        paddingTop: 90,
        flexDirection: "column",
        alignItems: "center",
        position: "relative"
      }
    })
    return UINode.if(this.isVisible, root);
  }

  private dialogButton(viewModel: ButtonViewModel) {
    return UINode.if(viewModel.visible, Pressable({ //button_Navigate
      children: [Text({ // Navigate
        text: viewModel.text,
        style: {
          color: viewModel.textColor,
          fontFamily: "Roboto",
          textAlign: "center",
          textAlignVertical: "center",
          fontSize: 20,
          fontWeight: "700"
        }
      })],
      style: {
        display: "flex",
        width: 160,
        height: 42,
        paddingHorizontal: 12,
        justifyContent: "center",
        alignItems: "center",
        flexShrink: 0,
        borderRadius: 12,
        borderBottomWidth: 4,
        borderColor: viewModel.borderColor,
        backgroundColor: viewModel.bgColor,
        marginLeft: 8,
        flexDirection: "row"
      },
      onClick: () => this.onSelectionCallback(viewModel.buttonIndex),
    }));
  }
}

class ButtonViewModel {
  text = new Binding("");
  textColor = new Binding("#FFF");
  bgColor = new Binding("#FFF");
  borderColor = new Binding("#FFF");
  visible = new Binding(false);
  buttonIndex;

  constructor(buttonIndex: number) {
    this.buttonIndex = buttonIndex;
  }
}
