import { EventsService } from "constants";
import { Component } from "horizon/core";

class HarvestableOre extends Component<typeof HarvestableOre> {
  static propsDefinition = {};

  preStart(): void {
    this.connectNetworkBroadcastEvent(
      EventsService.HarvestEvents.OreHit,
      (payload) => this.onOreHitConfirmed(payload)
    );

    // Listen to ore depletion
    this.connectNetworkBroadcastEvent(
      EventsService.HarvestEvents.OreDepleted,
      (payload) => this.onOreDepleted(payload)
    );
  }

  start() { }

  private onOreHitConfirmed(payload: any) {
    console.log("[ORE]  - onOreHitConfirmed invoked", payload);
  }

  private onOreDepleted(payload: any) {
    console.error("[ORE]  - onOreDepleted invoked", payload);
  }
}
Component.register(HarvestableOre);
