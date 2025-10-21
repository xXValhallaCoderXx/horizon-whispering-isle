/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { PropTypes } from "horizon/core";
import { Image, ImageSource, UIComponent, UINode, View, ViewStyle } from "horizon/ui";

export class IslandData extends UIComponent<typeof IslandData> {
  static propsDefinition = {
    image: { type: PropTypes.Asset },
    displayName: { type: PropTypes.String },
    locationID: { type: PropTypes.String },
  };

  fillStyle: ViewStyle = {
    width: "100%",
    height: "100%"
  };
  rootPanelStyle: ViewStyle = {
    width: "100%",
    height: "100%",
    position: "absolute",
    display: "none",
  };

  // Terrible hack to force the icons to load for use by other UI
  initializeUI() {
    if (this.props.image === undefined) {
      return new UINode();
    }
    return View({
      children: [
        Image({ source: ImageSource.fromTextureAsset(this.props.image!), style: { display: "none" } })
      ],
      style: { display: "none" }
    });
  }
}
UIComponent.register(IslandData);