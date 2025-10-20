import { EventsService } from 'constants';
import * as hz from 'horizon/core';

class WieldableItem extends hz.Component<typeof WieldableItem> {
  static propsDefinition = {
    type: { type: hz.PropTypes.String, default: "" },
    label: { type: hz.PropTypes.String, default: "" },
  };
  preStart(): void {
    // console.log("[CollectibleStorage] preStart", this.props.triggerZone);
    // const resolvedOwner = (this.entity as any)?.owner?.get?.() as hz.Player | null;
    // if (resolvedOwner) {
    //   this.currentPlayer = resolvedOwner;
    //   console.log(`[CollectibleStorage] Owner resolved at start: ${resolvedOwner.name.get()}`);
    // }

    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnGrabStart,
      (isRightHand: boolean, player: hz.Player) => this.onGrabStart(isRightHand, player)
    );
    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnIndexTriggerDown,
      (player: hz.Player) => this.onTriggerDown(player)
    );

    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnEntityCollision,
      (otherEntity: hz.Entity) => this.onEntityCollision(otherEntity)
    );



  }
  start() {

  }

  private onGrabStart(isRightHand: boolean, player: hz.Player) {

    console.log(`[WieldableItem] onGrabStart by player ${player.name.get()} for item type ${this.props.type}`);

  }

  private onTriggerDown(player: hz.Player) {
    console.log(`[WieldableItem] onTriggerDown by player ${player.name.get()} for item type ${this.props.type}`);
    player.playAvatarGripPoseAnimationByName(
      hz.AvatarGripPoseAnimationNames.Fire
    );

  }

  private onEntityCollision(otherEntity: hz.Entity) {
    const owner = otherEntity.owner.get();
    console.log(`[WieldableItem] collided with entity owned by player: ${owner?.name.get()}`);
  }
}
hz.Component.register(WieldableItem);