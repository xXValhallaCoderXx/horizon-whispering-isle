/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_ToastEvents } from "BigBox_ToastManager";
import { Component, NetworkEvent, Player } from "horizon/core";
import { Logger } from "Logger";

const log = new Logger("Debug");

type DebugTunable = {
  value: number,
  increment: number,
  min?: number,
  max?: number,
  action: (player: Player, newValue: number) => void,
}

type DebugGroup = {
  subGroups: { name: string, group: DebugGroup }[];
  commands: { name: string, action: (player: Player) => void }[];
  tunables: { name: string, tunable: DebugTunable }[];
}

export type DebugMenuGroupResponse = {
  path: string,
  subGroups: string[],
  commands: string[],
  tunables: { name: string, value: number }[],
}

export class Debug {
  public static requestDebugMenuGroup = new NetworkEvent<{ player: Player, path: string }>("requestDebugMenuGroup");
  public static debugMenuGroupResponse = new NetworkEvent<DebugMenuGroupResponse>("debugMenuGroupResponse");
  public static executeDebugCommand = new NetworkEvent<{ player: Player, path: string }>("executeDebugCommand");
  public static incrementDebugTunable = new NetworkEvent<{ player: Player, path: string }>("incrementDebugTunable");
  public static decrementDebugTunable = new NetworkEvent<{ player: Player, path: string }>("decrementDebugTunable");

  private static rootGroup: DebugGroup = this.createDebugGroup();

  public static addCommand(path: string, action: (player: Player) => void) {
    const pathInfo = this.getGroupAndName(path, true)!;
    const name = pathInfo.name;
    pathInfo.group.commands.push({ name, action });
  }

  public static addTunable(
    path: string,
    action: (player: Player, newValue: number) => void,
    initialValue: number,
    increment: number,
    min?: number,
    max?: number) {
    const pathInfo = this.getGroupAndName(path, true)!;
    const name = pathInfo.name;
    if (pathInfo.group.tunables.some(t => t.name === name)) {
      log.error(`Tunable already exists at path ${path}`);
    }
    pathInfo.group.tunables.push({ name, tunable: { value: initialValue, increment, min, max, action } });
  }

  public static deletePath(path: string) {
    const pathInfo = this.getGroupAndName(path, false);
    if (pathInfo === undefined) {
      log.error(`Path not found at path ${path}`);
      return;
    }
    const name = pathInfo.name;
    const group = pathInfo.group;
    if (group.subGroups.some(g => g.name === name)) {
      group.subGroups = group.subGroups.filter(g => g.name !== name);
    } else if (group.commands.some(c => c.name === name)) {
      group.commands = group.commands.filter(c => c.name !== name);
    } else if (group.tunables.some(t => t.name === name)) {
      group.tunables = group.tunables.filter(t => t.name !== name);
    }
  }

  private static getGroup(pathParts: string[], createIfMissing: boolean): DebugGroup | undefined {
    let group = this.rootGroup;
    for (let i = 0; i < pathParts.length; i++) {
      const name = pathParts[i];
      let subGroup = group.subGroups.find(g => g.name === name);
      if (subGroup === undefined) {
        if (createIfMissing) {
          subGroup = { name, group: this.createDebugGroup() };
          group.subGroups.push(subGroup);
        } else {
          return undefined;
        }
      }
      group = subGroup.group;
    }
    return group;
  }

  private static onExecuteCommand(player: Player, path: string) : boolean {
    const pathInfo = this.getGroupAndName(path, false);
        if (pathInfo === undefined) {
      log.error(`Tunable not found at path ${path}`);
      return false;
    }
    const group = pathInfo.group
    const name = pathInfo.name;
    const debugOption = group.commands.find(c => c.name === name);
    if (debugOption === undefined) {
      log.error(`Command not found at path (${path})`);
      return false;
    } else {
      debugOption.action(player);
    }

    return true;
  }

  private static onIncrementTunable(player: Player, path: string) {
    const pathInfo = this.getGroupAndName(path, false);
    if (pathInfo === undefined) {
      log.error(`Tunable not found at path ${path}`);
      return;
    }
    const group = pathInfo.group;
    const name = pathInfo.name;
    const debugOption = group.tunables.find(t => t.name === name);
    if (debugOption === undefined) {
      log.error(`Tunable not found at path ${path}`);
    } else {
      let newValue = debugOption.tunable.value + debugOption.tunable.increment;
      if (debugOption.tunable.min !== undefined && newValue < debugOption.tunable.min) {
        newValue = debugOption.tunable.min;
      }
      if (debugOption.tunable.max !== undefined && newValue > debugOption.tunable.max) {
        newValue = debugOption.tunable.max;
      }
      if (debugOption.tunable.value !== newValue) {
        debugOption.tunable.value = newValue
        debugOption.tunable.action(player, newValue);
      }
    }
  }

  private static onDecrementTunable(player: Player, path: string) {
    const pathInfo = this.getGroupAndName(path, false);
    if (pathInfo === undefined) {
      log.error(`Tunable not found at path ${path}`);
      return;
    }
    const group = pathInfo.group;
    const name = pathInfo.name;
    const debugOption = group.tunables.find(t => t.name === name);
    if (debugOption === undefined) {
      log.error(`Tunable not found at path ${path}`);
    } else {
      let newValue = debugOption.tunable.value - debugOption.tunable.increment;
      if (debugOption.tunable.min !== undefined && newValue < debugOption.tunable.min) {
        newValue = debugOption.tunable.min;
      }
      if (debugOption.tunable.max !== undefined && newValue > debugOption.tunable.max) {
        newValue = debugOption.tunable.max;
      }
      if (debugOption.tunable.value !== newValue) {
        debugOption.tunable.value = newValue
        debugOption.tunable.action(player, newValue);
      }
    }
  }

  private static getGroupAndName(path: string, createIfMissing: boolean): { name: string, group: DebugGroup } | undefined {
    const pathParts = this.getPathParts(path);
    const group = this.getGroup(pathParts.slice(0, pathParts.length - 1), createIfMissing);
    if (group === undefined) {
      log.error(`Group not found at path ${path}`);
      return undefined;
    }
    const name = pathParts[pathParts.length - 1];
    return { name, group }
  }

  private static getPathParts(path: string): string[] {
    if (path === "") {
      return [];
    }
    path = path.replace('\\', '/');
    return path.split('/');
  }

  private static createDebugGroup(): DebugGroup {
    return { subGroups: [], commands: [], tunables: [] }
  }

  public static connectServer(component: Component) {
    component.connectNetworkBroadcastEvent(this.requestDebugMenuGroup, (payload) => {
      const player = payload.player;
      let path = payload.path;
      let group = this.getGroup(this.getPathParts(path), false);
      if (group === undefined) {
        path = "";
        group = this.getGroup(this.getPathParts(path), true)!;
      }
      const response: DebugMenuGroupResponse = {
        path,
        subGroups: group.subGroups.map(g => g.name),
        commands: group.commands.map(c => c.name),
        tunables: group.tunables.map(t => ({ name: t.name, value: t.tunable.value })),
      }
      component.sendNetworkBroadcastEvent(this.debugMenuGroupResponse, response, [player]);
    });

    component.connectNetworkBroadcastEvent(this.executeDebugCommand, (payload) => {
      const success = this.onExecuteCommand(payload.player, payload.path);

      component.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
        player: payload.player,
        text: `${payload.path} ${success ? "executed" : "failed"}`
      }, [payload.player]);
    });

    component.connectNetworkBroadcastEvent(this.incrementDebugTunable, (payload) => this.onIncrementTunable(payload.player, payload.path));
    component.connectNetworkBroadcastEvent(this.decrementDebugTunable, (payload) => this.onDecrementTunable(payload.player, payload.path));
  }
}
