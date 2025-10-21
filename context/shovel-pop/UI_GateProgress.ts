/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as hz from 'horizon/core';
import { Binding, Text, UIComponent, UINode, View } from 'horizon/ui';

export class UI_GateProgress extends UIComponent<typeof UI_GateProgress> {
  static propsDefinition = {
    inProgressColor: { type: hz.PropTypes.Color, default: hz.Color.red },
    completeColor: { type: hz.PropTypes.Color, default: hz.Color.green },
    inProgressMessage: { type: hz.PropTypes.String, default: 'Regions Complete: ' },
    inProgressItems: { type: hz.PropTypes.String, default: 'Items Discovered: ' },
    readyMessage: { type: hz.PropTypes.String, default: 'Ready to Open!' }
  };

  private text = new Binding('UH OIH')
  private textColor = new Binding(hz.Color.red)

  public setProgress(player: hz.Player, countRegions: boolean, meetsReqs: boolean, progress: string) {
    if (meetsReqs) {
      this.text.set(this.props.readyMessage, [player]);
      this.textColor.set(this.props.completeColor, [player]);
      return;
    }

    const context = countRegions ? this.props.inProgressMessage : this.props.inProgressItems;
    this.text.set(context + progress, [player]);
    this.textColor.set(this.props.inProgressColor, [player]);
  }

  initializeUI(): UINode {
    return View({
      children: [
        View({
          style:{
            height: '100%',
            width: '100%',
            position: 'absolute',
            backgroundColor: 'black',
            opacity: 0.8,
            borderRadius: 10,
            justifyContent: 'center',
            alignItems: 'center',
          }
        }),
        Text({
          text: this.text,
          style:{
            fontSize: 45,
            fontWeight: '900',
            textAlign: 'center',
            textAlignVertical: 'center',
            alignSelf: 'center',
            paddingVertical: 16,
            color: this.textColor,
            position: 'relative',
            flexGrow: 1,
          }
        }),
      ],
      style:{
        minHeight: 125,
        minWidth: 500,
        display: 'flex',
      }
    })
  }
}
hz.Component.register(UI_GateProgress);
