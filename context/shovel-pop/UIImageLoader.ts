/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as hz from 'horizon/core';
import * as ui from 'horizon/ui';
import { Logger } from 'Logger';
import { ItemContainer } from './ItemContainer';
import { LTEManager } from './LTEManager';
import { ShovelProgressionManager } from './ShovelProgressionManager';
import { forEachIsland, getIslandCatalogImageAsset, isShownInCatalog } from 'Islands';

const log = new Logger("UIImageLoader");

class UIImageLoader extends ui.UIComponent<typeof UIImageLoader> {
  static propsDefinition = {};

  start() {
    //this.entity.visible.set(false);
  }

  initializeUI() {
    log.info("[shovel] Image loader");
    let children: ui.UINode[] = []
    ItemContainer.localInstance.allItems.forEach(item => {
      let iconAsset = item.getIconAsset();
      if (iconAsset) {
        children.push(ui.Image({ source: ui.ImageSource.fromTextureAsset(iconAsset!) }));
      }
    })
    ItemContainer.localInstance.allMutations.forEach(mutation => {
      let uiBackground = mutation.getUIBackgroundTexture();
      if (uiBackground) {
        children.push(ui.Image( { source: ui.ImageSource.fromTextureAsset(uiBackground!) }));
      }
      let uiReveal = mutation.getUIRevealTexture();
      if (uiReveal) {
        children.push(ui.Image({ source: ui.ImageSource.fromTextureAsset(uiReveal!) }));
      }
      let prefixTexture = mutation.getUIPrefixTexture();
      if (prefixTexture) {
        children.push(ui.Image({ source: ui.ImageSource.fromTextureAsset(prefixTexture!) }));
      }
    })
    ShovelProgressionManager.instance?.allShovels.forEach((shovel) =>
    {
      let iconAsset = shovel.getIconAsset();
      log.info("[shovel] icon asset: " + shovel.name + " " + iconAsset?.id);
      if (iconAsset) {
        children.push(ui.Image({ source: ui.ImageSource.fromTextureAsset(iconAsset!) }));
      }
      iconAsset = shovel.getAbilityIconAsset()
      if (iconAsset){
        children.push(ui.Image({source: ui.ImageSource.fromTextureAsset(iconAsset!) }));
      }
    })
    if (LTEManager.instance){
      let lteAssets: hz.Asset[] = LTEManager.instance.getAllLTEIcons();
      lteAssets.forEach(asset =>{
        //make sure we load latest version of asset, not referenced version, so the client doesn't have to care about version number
        children.push(ui.Image({ source: ui.ImageSource.fromTextureAsset(new hz.Asset(BigInt(asset.id), BigInt(0)))}));
      })
    }
    forEachIsland(island => {
      if (isShownInCatalog(island)) {
        const islandImage = getIslandCatalogImageAsset(island);
        if (islandImage !== undefined) {
          children.push(ui.Image({ source: ui.ImageSource.fromTextureAsset(islandImage) }));
        }
      }
    })
    return ui.View({
      children: children,
      style: { display: "none" }
    });
  }
}
ui.UIComponent.register(UIImageLoader);
