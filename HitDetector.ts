import * as hz from 'horizon/core';
import { BaseWeapon } from 'BaseWeapon';
import { AttackStartPayload, EventsService } from 'constants';

class HitDetector extends hz.Component<typeof HitDetector> {
  static propsDefinition = {
    npcId: { type: hz.PropTypes.String, default: "npc-1" },
    enemyType: { type: hz.PropTypes.String, default: "generic" },
  };

  private acceptHitsUntil: number = 0;
  private lastProcessedAttackIds: Record<string, boolean> = {};
  private currentActiveAttack: AttackStartPayload | null = null;


  preStart(): void {
    // Listen to global attack start and end to know when hits are valid
    this.connectNetworkBroadcastEvent(
      EventsService.CombatEvents.AttackStart,
      (payload: AttackStartPayload) => {
        this.currentActiveAttack = payload;
        this.acceptHitsUntil = Date.now() + 400;
      }
    );

    this.connectNetworkBroadcastEvent(
      EventsService.CombatEvents.AttackEnd,
      () => {
        this.acceptHitsUntil = 0;
        this.currentActiveAttack = null;
      }
    );

    // Detect collisions with weapons on this entity and all children
    this.connectCollisionHandlersRecursive(this.entity);
  }

  start() {

  }

  private connectCollisionHandlersRecursive(entity: hz.Entity) {
    this.connectCodeBlockEvent(
      entity,
      hz.CodeBlockEvents.OnEntityCollision,
      (otherEntity: hz.Entity) => this.onEntityCollision(otherEntity)
    );
    try {
      const kids = entity.children.get();
      for (const k of kids) this.connectCollisionHandlersRecursive(k);
    } catch {}
  }

  private onEntityCollision(otherEntity: hz.Entity) {
    console.log(`[HitDetector] onEntityCollision with ${otherEntity.name.get()}`);
    const now = Date.now();
    if (now > this.acceptHitsUntil || !this.currentActiveAttack) return;

    // Check if the colliding entity is a weapon
    const weapon = this.resolveWeaponFromEntity(otherEntity);
    if (!weapon) return;

    const attackId = this.currentActiveAttack.attackId;
    if (this.lastProcessedAttackIds[attackId]) return;
    this.lastProcessedAttackIds[attackId] = true;

    const hitPayload = {
      attackId,
      attackerPlayer: this.currentActiveAttack.attackerPlayer,
      targetNpcId: this.props.npcId,
      weaponId: this.currentActiveAttack.weaponId,
      hitPos: this.entity.position.get(),
      timestamp: now,
    };

    // For Phase 1, only log and broadcast hit event
    console.log(
      `[HitDetector] HIT detected on ${this.props.npcId}`,
      hitPayload
    );
    this.sendNetworkBroadcastEvent(EventsService.CombatEvents.Hit, hitPayload);
  }

  private resolveWeaponFromEntity(entity: hz.Entity): any {
    // Check entity and parents for BaseWeapon
    let cur: hz.Entity | null = entity;
    for (let i = 0; i < 8 && cur; i++) {
      try {
        const comps = cur.getComponents(BaseWeapon);
        if (comps && comps.length > 0) return comps[0];
      } catch {}
      try {
        cur = cur.parent.get();
      } catch { cur = null; }
    }
    return null;
  }
}
hz.Component.register(HitDetector);