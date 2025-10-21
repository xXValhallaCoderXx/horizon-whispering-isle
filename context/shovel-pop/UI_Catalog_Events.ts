/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { LocalEvent, NetworkEvent, Player } from "horizon/core";
import { Islands } from "Islands";
import { ItemData } from "ItemData";

export namespace UI_Catalog_Events {
    export const requestToggleCatalog = new LocalEvent<{}>("requestToggleCatalog");
    export const openCatalog = new NetworkEvent<OpeningSequenceModifiers>("openCatalog");
    export const forceCloseCatalog = new NetworkEvent<{}>("forceCloseCatalog");
    export const catalogVisibilityChanged = new LocalEvent<{ isShown: boolean }>("catalogVisibilityChanged");
    export const modifyNextOpenSequence = new NetworkEvent<OpeningSequenceModifiers>("modifyNextOpenSequence");
    export const autoSelectItem = new NetworkEvent<{ itemId: string }>("ui_catalog_autoSelectItem");
    export const openingSequenceComplete = new NetworkEvent<Player>("openingSequenceComplete");
    export const showItemDetails = new LocalEvent<{ item: ItemData | undefined, hideDiscovery: boolean }>("catalog_showItemDetails");
    export const islandSelected = new LocalEvent<{ island: Islands, isOpenSequence: boolean }>('catalog_islandSelected');
    export const requestSelectedIsland = new LocalEvent('catalog_requestSelectedIsland');
    export const revealItemDetails = new LocalEvent("catalog_revealItemDetails");
}

export type OpeningSequenceModifiers = {
  disable?: boolean,
  delay?: number,
  closeAfterFinish?: boolean,
}
