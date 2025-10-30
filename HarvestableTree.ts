import { EventsService } from "constants";
import { Component, PropTypes } from "horizon/core";

class HarvestableTree extends Component<typeof HarvestableTree> {
  static propsDefinition = {
    itemId: { type: PropTypes.String },
  };

  preStart(): void {
    // Server-authoritative feedback
    this.connectNetworkBroadcastEvent(
      EventsService.HarvestEvents.TreeHit,
      (payload: any) => this.onTreeHitConfirmed(payload)
    );
    this.connectNetworkBroadcastEvent(
      EventsService.HarvestEvents.TreeDepleted,
      (payload: any) => this.onTreeDepleted(payload)
    );
  }

  start() { }

  private onTreeHitConfirmed(payload: any) {
    // Optional: light feedback per hit (e.g., tiny VFX pulse or quiet chop)
    // Keep minimal to avoid double-playing when multiple players hit.
  }

  private onTreeDepleted(payload: any) {
    // Play a random chop SFX and a small leaf burst VFX at the tree’s position
  }
}
Component.register(HarvestableTree);
