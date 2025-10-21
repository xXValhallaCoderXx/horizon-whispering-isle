/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { LocalEvent, NetworkEvent, Player } from "horizon/core";
import { NavigationTarget } from "NavigationArrow";

export const NavigationArrowEvents = {
  navigationArrowInitializedEvent: new NetworkEvent<{player: Player}>('navigationArrowInitializedEvent'),
  updateNavigationArrowEvent: new NetworkEvent<{player: Player, positions: NavigationTarget[], questId: string}>('updateNavigationArrowEvent'),
  toggleArrowVisibilityEvent: new LocalEvent<{player: Player, visible: boolean}>('toggleArrowVisibilityEvent'),
}
