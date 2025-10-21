/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as hz from 'horizon/core';
import { Logger } from 'Logger';
import { ShinySpotData } from 'ShinySpotData';

const log = new Logger('ShinySpotLocator');

export class ShinySpotLocator extends hz.Component<typeof ShinySpotLocator> {
  static propsDefinition = {
    shinySpotsRoot: { type: hz.PropTypes.Entity },
    shinySpotsData: { type: hz.PropTypes.Asset, default: undefined },
  };

  public shinySpots: hz.Vec3[] = []
  public shinySpotsLoaded: boolean = false;

  async start() {
    if (this.props.shinySpotsData) {
      await this.initShinySpotData();
    } else {
      log.error("No shiny spot data provided");
    }
  }

  public async loadShinySpots(): Promise<hz.Vec3[]> {
    if (!this.shinySpotsLoaded) {
     await this.initShinySpotData();
    }

    return this.shinySpots;
  }

  private async initShinySpotData() {
    //load json item data
    if (this.props.shinySpotsData) {
      let asset = new hz.Asset(this.props.shinySpotsData.id, BigInt(0));
      try {
        await asset.fetchAsData().then(
          (output: hz.AssetContentData) => {
            let jsonData: ShinySpotData[] = JSON.parse(output.asText()) as ShinySpotData[];
            jsonData.forEach((rawItem: any) => {
              this.shinySpots.push(new hz.Vec3(rawItem.Position.x, rawItem.Position.y, rawItem.Position.z));
            });
            this.shinySpotsLoaded = true;
            log.info(`Loaded ${this.shinySpots.length} shiny spots for ${this.entity.name.get()}`);
          }
        )
      } catch (error) {
        log.error(`Error loading shiny spot data at locator ${this.entity.name.get()}: ${error}`);
      }
    }
  }

}
hz.Component.register(ShinySpotLocator);
