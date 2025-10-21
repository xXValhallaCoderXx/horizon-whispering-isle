/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as hz from 'horizon/core';
import { Entity, Vec3 } from 'horizon/core';
import { Islands } from 'Islands';
import { Logger } from 'Logger';
import { ShinySpotLocator } from 'ShinySpotLocator';

const log = new Logger("IslandShinySpotLocators");

export class IslandShinySpotLocators extends hz.Component<typeof IslandShinySpotLocators> {
  static propsDefinition = {
    beachcampLocatorRoot: { type: hz.PropTypes.Entity },
    pirateCoveLocatorRoot: { type: hz.PropTypes.Entity },
  };

  // Singleton
  private static _instance: IslandShinySpotLocators | null;
  public static get instance(): IslandShinySpotLocators { return this._instance! };

  public static getLocators(island: Islands): Vec3[] {
    if (!this._instance) {
      log.error("IslandShinySpotLocators not initialized");
      return [];
    }

    return this._instance.islandToLocators.get(island)!;
  }

  private islandToLocators: Map<Islands, Vec3[]> = new Map();

  start() {
    this.loadLocators(Islands.BeachCamp, this.props.beachcampLocatorRoot);
    this.loadLocators(Islands.PirateCove, this.props.pirateCoveLocatorRoot);

    IslandShinySpotLocators._instance = this;
  }

  loadLocators(island: Islands, root?: Entity) {
    if (!root){
      console.error("No root entity provided for " + island);
      return;
    }
    const locator = root.getComponents<ShinySpotLocator>()[0] // if this is undefined then someone added a bad object
    if (locator) {
      this.islandToLocators.set(island, locator.shinySpots);
    }
    else {
      log.error('Bad object in IslandShinySpotLocators ' + root.name)
    }
  }
}
hz.Component.register(IslandShinySpotLocators);
