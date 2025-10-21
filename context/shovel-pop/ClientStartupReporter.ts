/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Component, NetworkEvent, Player } from "horizon/core";

type Entry = {
  id: string,
  relativeTimestamp: number
}

const ENTRIES_PER_MESSAGE = 24;

export const requestClientStartupReport = new NetworkEvent("requestClientStartupReport");
export const sendClientStartupReport = new NetworkEvent<string>("sendClientStartupReport");

export class ClientStartupReporter {

  private static instance?: ClientStartupReporter;

  private entries: Entry[] = [];
  private startTime: number = 0;
  private component?: Component;

  static addEntry(id: string, component?: Component) {
    this.ensureInstance().addEntry(id);
    if (component !== undefined) {
      this.setComponent(component);
    }
  }

  static setComponent(component: Component) {
    const instance = this.ensureInstance();
    if (instance.component !== undefined) {
      return;
    }
    instance.component = component;
    instance.component.connectNetworkBroadcastEvent(requestClientStartupReport, (player: Player) => {
      instance.sendReport();
    });
  }

  private static ensureInstance(): ClientStartupReporter {
    return this.instance ??= new ClientStartupReporter();
  }

  private addEntry(id: string) {
    const now = Date.now();
    if (this.startTime === 0) {
      this.startTime = now;
    }
    this.entries.push({ id, relativeTimestamp: now - this.startTime });
  }

  private sendReport() {
    if (this.component === undefined || this.entries.length === 0) {
      return;
    }
    const player = this.component.world.getLocalPlayer();
    const serverPlayer = this.component.world.getServerPlayer();
    const numMessages = Math.floor((this.entries.length - 1) / ENTRIES_PER_MESSAGE) + 1;
    for (let i = 0; i < numMessages; i++) {
      let report = `Client Startup Report for ${player.name.get()} (${i + 1}/${numMessages}):\n`;
      for (let j = 0; j < ENTRIES_PER_MESSAGE; j++) {
        const index = i * ENTRIES_PER_MESSAGE + j;
        if (index >= this.entries.length) {
          break;
        }
        const entry = this.entries[index];
        report += `Step: ${entry.id.padEnd(54, ' ')}  Timestamp: ${entry.relativeTimestamp / 1000}\n`;
      }
      this.component.sendNetworkBroadcastEvent(sendClientStartupReport, report, [serverPlayer]);
    }
  }
}
