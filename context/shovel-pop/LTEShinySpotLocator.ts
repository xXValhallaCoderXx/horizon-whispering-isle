/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as hz from 'horizon/core';
import { ShinySpotData } from 'ShinySpotData';
import { JSON_LteShinySpots } from "JSON_LTEShinySpots";


export class LTEShinySpotLocator extends hz.Component<typeof LTEShinySpotLocator> {
  static propsDefinition = {
    shinySpotsRoot: { type: hz.PropTypes.Entity },
    shinySpotsData: { type: hz.PropTypes.Asset, default: undefined },
    shinySpotJsonIndex: { type: hz.PropTypes.Number, default: -1 },
  };

  public shinySpots: hz.Vec3[] = []
  public shinySpotsLoaded: boolean = false;

  async start() {
    if (this.props.shinySpotsData) {
      await this.initShinySpotData();
    } else {
      console.error("No shiny spot data provided");
    }
  }

  // This isn't used currently, but keeping it in case we need to check + wait if data is loaded before starting an LTE
  public async loadShinySpots(): Promise<hz.Vec3[]> {
    if (!this.shinySpotsLoaded) {
     await this.initShinySpotData();
    }
    return this.shinySpots;
  }

  private async initShinySpotData() {
    //load json item data
    if (this.props.shinySpotJsonIndex >= 0) {
      let jsonData: ShinySpotData[] = JSON.parse(JSON_LteShinySpots.raw[this.props.shinySpotJsonIndex]) as ShinySpotData[];
      jsonData.forEach((rawItem: any) => {
        this.shinySpots.push(new hz.Vec3(rawItem.Position.x, rawItem.Position.y, rawItem.Position.z));
      });
      this.shinySpotsLoaded = true;
    }
    else if (this.props.shinySpotsData) {
      let asset = new hz.Asset(this.props.shinySpotsData.id, BigInt(0));
      try {
        await asset.fetchAsData().then(
          (output: hz.AssetContentData) => {
            let jsonData: ShinySpotData[] = JSON.parse(output.asText()) as ShinySpotData[];
            jsonData.forEach((rawItem: any) => {
              this.shinySpots.push(new hz.Vec3(rawItem.Position.x, rawItem.Position.y, rawItem.Position.z));
            });
            this.shinySpotsLoaded = true;
            // console.log(`Loaded ${this.shinySpots.length} shiny spots for ${this.entity.name.get()}`);
          }
        )
      } catch (error) {
        console.error(`Error loading shiny spot data at locator ${this.entity.name.get()}: ${error}`);
      }
    }
  }

}
hz.Component.register(LTEShinySpotLocator);
