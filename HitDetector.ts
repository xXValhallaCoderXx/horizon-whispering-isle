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

    // Detect collisions with weapons
    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnEntityCollision,
      (otherEntity: hz.Entity) => this.onEntityCollision(otherEntity)
    );
  }

  start() {

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
    // Check if entity has BaseWeapon component
    const weaponComponents = entity.getComponents(BaseWeapon);
    return weaponComponents.length > 0 ? weaponComponents[0] : null;
  }
}
hz.Component.register(HitDetector);