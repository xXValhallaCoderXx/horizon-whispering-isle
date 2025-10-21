import { Component, PropTypes, Player, CodeBlockEvents, Entity, AvatarGripPoseAnimationNames } from 'horizon/core';
import { WieldableItem } from "./WieldableItem";
import { EventsService, WeaponStats } from "./constants";

export class BaseWeapon extends WieldableItem {
  static propsDefinition = {
    ...WieldableItem.propsDefinition,
    weaponId: { type: PropTypes.String, default: "weapon-1" },
    damage: { type: PropTypes.Number, default: 10 },
    attackCooldown: { type: PropTypes.Number, default: 0.6 },
    attackRange: { type: PropTypes.Number, default: 2.0 },
    weaponType: { type: PropTypes.String, default: "melee" },
  };

  private lastAttackTime: number = 0;
  private attackInProgress: boolean = false;
  private currentAttackId: string | null = null;


  preStart(): void {
    // Ensure WieldableItem wiring (grab/attach/holster) is set up
    super.preStart();

    // Weapon-specific input
    this.connectCodeBlockEvent(
      this.entity,
      CodeBlockEvents.OnIndexTriggerDown,
      (player: Player) => this.onTriggerDown(player)
    );

    // this.connectCodeBlockEvent(
    //   this.entity,
    //   CodeBlockEvents.OnEntityCollision,
    //   (otherEntity: Entity) => this.onEntityCollision(otherEntity)
    // );
  }

  start() {

  }

  private onTriggerDown(player: Player) {
    // Only the current owner (set by WieldableItem on grab) can attack
    const owner = this.entity.owner.get();
    if (!owner || owner.id !== player.id) return;
    console.log(`[BaseWeapon] onTriggerDown by player: ${player.name.get()}`);
    this.tryAttack(player);
  }


  // Narrowed view on props to include weapon fields defined in this component
  private get wp() {
    return this.props as unknown as {
      weaponId: string;
      damage: number;
      attackCooldown: number;
      attackRange: number;
      weaponType: string;
    };
  }

  private tryAttack(attackerPlayer: Player) {
    const now = Date.now();
    if (now - this.lastAttackTime < this.wp.attackCooldown * 1000) {
      return;
    }

    this.lastAttackTime = now;
    const attackId = `${attackerPlayer.id}-${now}`;
    this.currentAttackId = attackId;
    this.attackInProgress = true;

    // Trigger local animation
    this.playAttackAnimation(attackerPlayer);

    // Broadcast start so NPC hit detectors accept hits for this window
    const stats: WeaponStats = {
      damage: this.wp.damage,
      attackCooldown: this.wp.attackCooldown,
      attackRange: this.wp.attackRange,
      weaponType: this.wp.weaponType as "melee" | "ranged",
    };

    this.sendNetworkBroadcastEvent(EventsService.CombatEvents.AttackStart, {
      weaponId: this.wp.weaponId,
      attackerPlayer,
      attackId,
      stats,
      timestamp: now,
    });

    // End window after swing animation
    this.async.setTimeout(() => {
      this.endAttack(attackerPlayer);
    }, this.estimatedSwingWindowMs());
  }


  private endAttack(attackerPlayer: Player) {
    if (!this.attackInProgress || !this.currentAttackId) return;
    const now = Date.now();

    this.sendNetworkBroadcastEvent(EventsService.CombatEvents.AttackEnd, {
      weaponId: this.wp.weaponId,
      attackerPlayer,
      attackId: this.currentAttackId,
      timestamp: now,
    });

    this.attackInProgress = false;
    this.currentAttackId = null;
  }

  private playAttackAnimation(player: Player) {
    player.playAvatarGripPoseAnimationByName(
      AvatarGripPoseAnimationNames.Fire
    );
  }

  private estimatedSwingWindowMs(): number {
    return 350; // Fixed window for Phase 1
  }

  // Expose for hit detector to check
  public getAttackState() {
    return {
      attackInProgress: this.attackInProgress,
      currentAttackId: this.currentAttackId,
      owner: this.entity.owner.get?.() ?? null,
    };
  }

  private onEntityCollision(otherEntity: Entity) {
    console.log(`[BaseWeapon] onEntityCollision with entity: ${otherEntity.name.get()}`);
  }
}
Component.register(BaseWeapon);