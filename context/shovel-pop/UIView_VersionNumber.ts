/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Text, UINode, View } from 'horizon/ui';
import { CLIENT_VERSION, MARKETING_UI } from 'PVarConsts';
import { UIRoot_ChildrenBase } from 'UIRoot_ChildrenBase';

export class UIView_VersionNumber extends UIRoot_ChildrenBase {
  private readonly versionNumber = `v0.0.${CLIENT_VERSION}`;

  createView(): UINode {
    if (MARKETING_UI) {
      return View({})
    }

    return View({
      children: [
        Text({
          text: this.versionNumber,
          style: {
            fontSize: 20,
            fontFamily: 'Roboto',
            color: '#444444',
            textAlign: 'center',
            fontWeight: '900',
          }
        })
      ],
      style: {
        position: 'absolute',
        bottom: '4%',
        right: '3%',
        justifyContent: 'flex-end',
      }
    })
  }
}
