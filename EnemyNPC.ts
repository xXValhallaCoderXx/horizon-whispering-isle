import * as hz from "horizon/core";

class EnemyNPC extends hz.Component<typeof EnemyNPC> {
  // static propsDefinition = {};

  // preStart(): void {
  //   this.connectCodeBlockEvent(
  //     this.entity as hz.Entity,
  //     hz.CodeBlockEvents.OnEntityCollision,
  //     (otherEntity: hz.Entity) => this.handleEntityCollision(otherEntity)
  //   );
  // }

  // start() { }

  // private handleEntityCollision(otherEntity: hz.Entity) {
  //   const owner = otherEntity.owner.get();
  //   console.log(
  //     `EnemyNPC collided with entity owned by player: ${owner?.name.get()}`
  //   );
  //   // if (otherEntity.getComponents(EnemyNPC).length > 0) {
  //   //   console.log("Collided with another EnemyNPC, ignoring.");
  //   //   return;
  //   // }
  // }
  static propsDefinition = {
    npcId: { type: hz.PropTypes.String, default: "npc-1" },
    enemyType: { type: hz.PropTypes.String, default: "generic" },
  };

  preStart(): void {
    console.log(
      `[EnemyNPC] Initialized: ${this.props.npcId} of type ${this.props.enemyType}`
    );
  }

  start() { }
}
hz.Component.register(EnemyNPC);
