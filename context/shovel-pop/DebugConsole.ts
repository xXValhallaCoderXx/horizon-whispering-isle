/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Debug } from "Debug";
import { Component, Entity, NetworkEvent, Player, PlayerVisibilityMode, PropTypes, Quaternion, Vec3 } from "horizon/core";
import { Logger } from "Logger";
import { PlayerService } from "PlayerService";
import { UI_DebugMenu } from "UI_DebugMenu";

const devWhitelist = [
  "",
]

const log = new Logger("DebugConsole");
const HIDDEN_POSITION = new Vec3(0, -100, 0);

export class DebugConsole extends Component<typeof DebugConsole> {
  static propsDefinition = {
    isEnabled: { type: PropTypes.Boolean },
    summonOffsetFromPlayer: { type: PropTypes.Vec3 },
    summonRoot: { type: PropTypes.Entity },
    debugMenu: { type: PropTypes.Entity }
  };

  private summonToPlayerMap = new Map<Player, Entity>();
  private summonPool: Array<Entity> = new Array();
  private debugMenu!: UI_DebugMenu;

  static summon = new NetworkEvent<{ player: Player }>("summonDebugConsole");

  start() {
    this.debugMenu = this.props.debugMenu!.getComponents<UI_DebugMenu>()[0];
    this.hide();
    if (!this.props.isEnabled) {
      return;
    }
    this.summonPool = this.props.summonRoot!.children.get();
    PlayerService.connectPlayerEnterWorld(
      this,
      (player: Player) => { this.onPlayerEnterWorld(player); });

    PlayerService.connectPlayerExitWorld(
      this,
      (player: Player) => { this.onPlayerExitWorld(player); });

    this.connectNetworkBroadcastEvent(
      DebugConsole.summon,
      payload => this.onSummonConsole(payload.player));

    Debug.connectServer(this);
  }

  private onPlayerEnterWorld(player: Player) {
    if (!this.isDevWorld() && !this.isDevPlayer(player)) {
      return;
    }
    if (this.summonPool.length == 0) {
      log.error(`No debug console summons available for new player (${player.id}`);
      return;
    }
    const summonInstance = this.summonPool.pop()!;
    this.summonToPlayerMap.set(player, summonInstance);
    summonInstance.owner.set(player);
  }

  private onPlayerExitWorld(player: Player) {
    const summonInstance = this.summonToPlayerMap.get(player);
    if (summonInstance === undefined) {
      return;
    }
    summonInstance.owner.set(this.world.getServerPlayer());
    this.summonToPlayerMap.delete(player);
    this.summonPool.push(summonInstance);
  }

  private onSummonConsole(player: Player) {
    const playerRotation = player.rootRotation.get();
    const adjustedOffset = Quaternion.mulVec3(playerRotation, this.props.summonOffsetFromPlayer);
    let targetPosition = PlayerService.getPlayerPosition(player).add(adjustedOffset);
    if (targetPosition.sub(this.entity.position.get()).magnitude() < 1) {
      this.hide();
    } else {
      this.entity.position.set(targetPosition);
      this.entity.rotation.set(playerRotation);
    }
    this.entity.setVisibilityForPlayers([player], PlayerVisibilityMode.VisibleTo);
    this.debugMenu.entity.owner.set(player);
    this.debugMenu.entity.setVisibilityForPlayers([player], PlayerVisibilityMode.VisibleTo);
  }

  private hide() {
    this.entity.setVisibilityForPlayers([], PlayerVisibilityMode.VisibleTo);
    this.debugMenu.entity.setVisibilityForPlayers([], PlayerVisibilityMode.VisibleTo);
    this.entity.position.set(HIDDEN_POSITION);
  }

  private isDevWorld(): boolean {
    let lowerWorldName = this.world.name.get().toLocaleLowerCase();
    return lowerWorldName.includes("[dev]");
  }

  private isDevPlayer(player: Player): boolean {
    const playerName = PlayerService.getPlayerName(player);
    if (playerName === undefined) {
      return false;
    }
    return devWhitelist.indexOf(playerName) >= 0;
  }
}
Component.register(DebugConsole);
