import * as hz from 'horizon/core';
import { VARIABLE_GROUPS, PlayerInitialState } from 'constants';

export class PlayerStateService extends hz.Component<typeof PlayerStateService> {
  static propsDefinition = {
    playerStorageAsset: { type: hz.PropTypes.Asset },
  };

  start() {

  }

  getPlayerState(player: hz.Player) {
    const stateVarKey = `${VARIABLE_GROUPS.player.group}:${VARIABLE_GROUPS.player.keys.state}`;
    const state = this.world.persistentStorage.getPlayerVariable(player, stateVarKey);
    return state ? state : null;
  }
}
hz.Component.register(PlayerStateService);