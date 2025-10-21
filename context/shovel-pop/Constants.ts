/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
export namespace GameConstants {

  export namespace Minigame {
    export const PotionActivationDelay = 800;
    export const Phase0ChanceBonus = 5;   // Percentage  5 = 5%
  }

  export namespace Player {
    export let MoveSpeed = 4.5;
  }

  export namespace Potion {
    export const POTION_SUGGESTION_COOLDOWN_DURATION = 15 * 60 * 1000;
  }
}
