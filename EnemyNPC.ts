import * as hz from "horizon/core";
import { healthData } from "HealthData";
import { EventsService } from "constants";
import { BaseNPC, BaseNPCEmote } from "./BaseNPC";
import { Animation, Easing } from 'horizon/ui';


enum EnemyNPCState {
  Idle,
  Patrolling,
  Taunting,
  Chasing,
  Attacking,
  Hit,
  Returning,
  Dead,
}

export const StartAttackingPlayer: hz.NetworkEvent<{ player: hz.Player }> = new hz.NetworkEvent<{ player: hz.Player }>("StartAttackingPlayer");
export const StopAttackingPlayer: hz.NetworkEvent<{ player: hz.Player }> = new hz.NetworkEvent<{ player: hz.Player }>("StopAttackingPlayer");

class EnemyNPC extends BaseNPC<typeof EnemyNPC> {
  static propsDefinition = {
    ...BaseNPC.propsDefinition,
    // Behavior
    isAggressive: { type: hz.PropTypes.Boolean, default: true },
    // Vision & Range
    maxVisionDistance: { type: hz.PropTypes.Number, default: 10 },
    maxAttackDistance: { type: hz.PropTypes.Number, default: 2.5 },

    // Combat Stats
    maxHitPoints: { type: hz.PropTypes.Number, default: 100 },
    baseDamage: { type: hz.PropTypes.Number, default: 25 },
    attackCooldown: { type: hz.PropTypes.Number, default: 2.0 },

    // Movement (inherits walkSpeed and runSpeed from BaseNPC)
    chaseSpeed: { type: hz.PropTypes.Number, default: 3.0 },
    returnSpeed: { type: hz.PropTypes.Number, default: 2.0 },

    // Animation Durations
    tauntDuration: { type: hz.PropTypes.Number, default: 2.8 },
    attackAnimDuration: { type: hz.PropTypes.Number, default: 1.5 },
    hitAnimDuration: { type: hz.PropTypes.Number, default: 0.5 },
    deathDuration: { type: hz.PropTypes.Number, default: 3.0 },

    // Knockback
    knockbackForce: { type: hz.PropTypes.Number, default: 5 },
    knockbackDuration: { type: hz.PropTypes.Number, default: 0.5 },

    // References
    trigger: { type: hz.PropTypes.Entity },
    hitbox: { type: hz.PropTypes.Entity },
    hitSfx: { type: hz.PropTypes.Entity },
    deathSfx: { type: hz.PropTypes.Entity },
    deathVfx: { type: hz.PropTypes.Entity }
  };


  // Audio/Visual
  hitSfx?: hz.AudioGizmo;
  deathSfx?: hz.AudioGizmo;
  deathVfx?: hz.ParticleGizmo;


  // Combat State
  currentHitPoints: number = 100;
  players: Set<hz.Player> = new Set();
  targetPlayer: hz.Player | undefined = undefined;

  // State Machine
  state: EnemyNPCState = EnemyNPCState.Idle;
  stateTimer: number = 0;
  attackTimer: number = 0;
  lastHitTime: number = 0;

  // Position Tracking
  startLocation!: hz.Vec3;
  aggroLocation?: hz.Vec3;

  // Weapon Detection
  private activeSwings: Set<string> = new Set();
  private lastSwingData: {
    weapon: hz.Entity;
    owner: hz.Player;
    damage: number;
    reach: number;
    timestamp: number;
  } | null = null;

  // Dynamic Stats (can be modified at runtime)
  private currentAttackCooldown: number = 2.0;
  private currentChaseSpeed: number = 3.0;
  private currentDamage: number = 25;
  private isAggressive: boolean = true;

  preStart(): void {
    this.hitSfx = this.props.hitSfx?.as(hz.AudioGizmo);
    this.deathSfx = this.props.deathSfx?.as(hz.AudioGizmo);
    this.deathVfx = this.props.deathVfx?.as(hz.ParticleGizmo);
  }



  start() {
    super.start();

    // Initialize stats
    this.currentHitPoints = this.props.maxHitPoints;
    this.currentAttackCooldown = this.props.attackCooldown;
    this.currentChaseSpeed = this.props.chaseSpeed;
    this.currentDamage = this.props.baseDamage;
    this.isAggressive = this.props.isAggressive;

    this.dead = false;
    this.setState(EnemyNPCState.Idle);
    this.startLocation = this.entity.position.get();

    this.setupTriggers();
    this.setupCombatEvents();

  }


  update(deltaTime: number) {
    super.update(deltaTime);

    if (this.isAggressive) {
      this.updateVisionCheck();
    }

    this.updateStateMachine(deltaTime);
    this.updateLookAt();
  }

  private setupTriggers() {
    // Aggro trigger - only if aggressive
    if (this.props.trigger && this.isAggressive) {
      this.connectCodeBlockEvent(
        this.props.trigger,
        hz.CodeBlockEvents.OnPlayerEnterTrigger,
        (player) => {
          if (player && player !== this.world.getServerPlayer()) {
            console.log(`[EnemyNPC] Player ${player.name.get()} entered aggro range`);
            this.onPlayerEnterAggroRange(player);
          }
        }
      );

      // this.connectCodeBlockEvent(
      //   this.props.trigger,
      //   hz.CodeBlockEvents.OnPlayerExitTrigger,
      //   (player) => {
      //     if (player && player !== this.world.getServerPlayer()) {
      //       console.log(`[EnemyNPC] Player ${player.name.get()} left aggro range`);
      //       this.onPlayerLeaveAggroRange(player);
      //     }
      //   }
      // );
    }

    // Hitbox for weapon collision
    if (this.props.hitbox) {
      this.connectCodeBlockEvent(
        this.props.hitbox as hz.Entity,
        hz.CodeBlockEvents.OnEntityEnterTrigger,
        (weapon) => {
          this.onWeaponCollision(weapon);
        }
      );
    }
  }

  private setupCombatEvents() {
    // Listen for weapon swings
    this.connectNetworkBroadcastEvent(
      EventsService.CombatEvents.AttackSwingEvent,
      (payload) => {
        this.onWeaponSwing(payload);
      }
    );

    this.connectNetworkBroadcastEvent(StartAttackingPlayer, ({ player }) => {
      this.onPlayerEnterAggroRange(player);
    });

    this.connectNetworkBroadcastEvent(StopAttackingPlayer, ({ player }) => {
      this.onPlayerLeaveAggroRange(player);
    });
  }


  // ============== PUBLIC API FOR RUNTIME MODIFICATIONS ==============

  /**
   * Modify attack speed at runtime
   */
  public setAttackSpeed(cooldown: number) {
    this.currentAttackCooldown = Math.max(0.5, cooldown);
    console.log(`[EnemyNPC] Attack cooldown set to ${this.currentAttackCooldown}s`);
  }

  /**
   * Modify movement speed at runtime
   */
  public setChaseSpeed(speed: number) {
    this.currentChaseSpeed = Math.max(0.5, speed);
    if (this.state === EnemyNPCState.Chasing) {
      this.navMeshAgent?.maxSpeed.set(this.currentChaseSpeed);
    }
    console.log(`[EnemyNPC] Chase speed set to ${this.currentChaseSpeed}`);
  }

  /**
   * Modify damage at runtime
   */
  public setDamage(damage: number) {
    this.currentDamage = Math.max(1, damage);
    console.log(`[EnemyNPC] Damage set to ${this.currentDamage}`);
  }

  /**
   * Toggle aggressive behavior
   */
  public setAggressive(aggressive: boolean) {
    this.isAggressive = aggressive;
    if (!aggressive && this.targetPlayer) {
      this.setState(EnemyNPCState.Returning);
    }
    console.log(`[EnemyNPC] Aggressive mode: ${aggressive}`);
  }


  /**
   * Heal the NPC
   */
  public heal(amount: number) {
    this.currentHitPoints = Math.min(
      this.currentHitPoints + amount,
      this.props.maxHitPoints
    );
    console.log(`[EnemyNPC] Healed ${amount}. HP: ${this.currentHitPoints}/${this.props.maxHitPoints}`);
  }


  // ============== AGGRO SYSTEM ==============

  private onPlayerEnterAggroRange(player: hz.Player) {
    if (!this.isAggressive || this.dead) return;

    this.players.add(player);

    // If not already engaged, start combat
    if (!this.targetPlayer && this.state === EnemyNPCState.Idle) {
      this.targetPlayer = player;
      this.aggroLocation = this.entity.position.get();
      this.setState(EnemyNPCState.Taunting);
    }
  }

  private onPlayerLeaveAggroRange(player: hz.Player) {
    this.players.delete(player);

    if (player === this.targetPlayer) {
      this.targetPlayer = undefined;

      // If no other players in range, return home
      if (this.players.size === 0 && this.state !== EnemyNPCState.Dead) {
        this.setState(EnemyNPCState.Returning);
      }
    }
  }

  private updateVisionCheck() {
    if (this.dead || !this.isAggressive) return;

    const myPos = this.entity.position.get();
    const maxVisionDistSq = this.props.maxVisionDistance * this.props.maxVisionDistance;

    // Check if target player is still in range
    if (this.targetPlayer) {
      const targetPos = this.targetPlayer.position.get();
      const distSq = myPos.distanceSquared(targetPos);

      if (distSq > maxVisionDistSq) {
        console.log(`[EnemyNPC] Target player left vision range, returning home`);
        this.onPlayerLeaveAggroRange(this.targetPlayer);
      }
    }

    // Find closest player if we don't have a target
    if (!this.targetPlayer && this.players.size > 0) {
      let closestDist = maxVisionDistSq;
      let closest: hz.Player | undefined;

      this.players.forEach(player => {
        const dist = myPos.distanceSquared(player.position.get());
        if (dist < closestDist) {
          closestDist = dist;
          closest = player;
        }
      });

      this.targetPlayer = closest;
    }
  }


  // ============== COMBAT SYSTEM ==============

  private onWeaponSwing(payload: any) {
    const swingId = `${payload.weapon.id}_${Date.now()}`;
    this.activeSwings.add(swingId);

    this.async.setTimeout(() => {
      this.activeSwings.delete(swingId);
    }, payload.durationMs);

    this.lastSwingData = {
      weapon: payload.weapon,
      owner: payload.owner,
      damage: payload.damage,
      reach: payload.reach || 2.0,
      timestamp: Date.now()
    };
  }

  private onWeaponCollision(weapon: hz.Entity) {
    if (!this.lastSwingData || this.activeSwings.size === 0 || this.dead) return;

    const timeSinceSwing = Date.now() - this.lastSwingData.timestamp;

    if (weapon.id === this.lastSwingData.weapon.id && timeSinceSwing < 250) {
      console.log(`[EnemyNPC] Valid hit! Dealing ${this.lastSwingData.damage} damage`);
      this.takeDamage(this.lastSwingData.damage, this.lastSwingData.owner);

      this.lastSwingData = null;
      this.activeSwings.clear();
    }
  }

  private takeDamage(amount: number, attacker: hz.Player) {
    if (this.dead) return;

    const now = Date.now() / 1000.0;
    if (now < this.lastHitTime + this.props.hitAnimDuration) return;

    this.currentHitPoints -= amount;
    this.lastHitTime = now;

    this.hitSfx?.play();
    this.triggerHitAnimation();
    this.applyKnockback(attacker, this.props.knockbackForce);

    console.log(`[EnemyNPC] Took ${amount} damage. HP: ${this.currentHitPoints}/${this.props.maxHitPoints}`);

    if (this.currentHitPoints <= 0) {
      this.handleDeath();
    } else {
      this.setState(EnemyNPCState.Hit);

      // Aggro the attacker if not already aggressive towards them
      if (!this.players.has(attacker)) {
        this.onPlayerEnterAggroRange(attacker);
      }
    }
  }

  private applyKnockback(attacker: hz.Player, force: number) {
    const attackerPos = attacker.position.get();
    const enemyPos = this.entity.position.get();

    const knockbackDir = new hz.Vec3(
      enemyPos.x - attackerPos.x,
      0,
      enemyPos.z - attackerPos.z
    ).normalize();

    const targetPos = new hz.Vec3(
      enemyPos.x + knockbackDir.x * force,
      enemyPos.y,
      enemyPos.z + knockbackDir.z * force
    );

    const startTime = Date.now();
    const duration = this.props.knockbackDuration * 1000;
    const startPos = this.entity.position.get();

    const knockbackInterval = this.async.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);

      const newPos = new hz.Vec3(
        startPos.x + (targetPos.x - startPos.x) * easeProgress,
        startPos.y,
        startPos.z + (targetPos.z - startPos.z) * easeProgress
      );

      this.entity.position.set(newPos);

      if (progress >= 1) {
        this.async.clearInterval(knockbackInterval);
      }
    }, 16);
  }

  private handleDeath() {
    this.setState(EnemyNPCState.Dead);
    this.deathSfx?.play();
    this.deathVfx?.play();

    this.sendNetworkBroadcastEvent(EventsService.CombatEvents.NPCDeath, {
      targetNpcId: this.entity.id.toString(),
      enemyType: this.entity.name.get(),
      killerPlayer: this.targetPlayer as hz.Player,
    });

    this.async.setTimeout(() => {
      this.world.deleteAsset(this.entity);
    }, this.props.deathDuration * 1000);
  }


  // ============== STATE MACHINE ==============

  private updateStateMachine(deltaTime: number) {
    switch (this.state) {
      case EnemyNPCState.Idle:
        // Handled by vision check
        break;

      case EnemyNPCState.Taunting:
        this.stateTimer -= deltaTime;
        if (this.stateTimer <= 0) {
          this.setState(EnemyNPCState.Chasing);
        }
        break;

      case EnemyNPCState.Chasing:
        this.updateChasing(deltaTime);
        break;

      case EnemyNPCState.Attacking:
        this.updateAttacking(deltaTime);
        break;

      case EnemyNPCState.Hit:
        this.stateTimer -= deltaTime;
        if (this.stateTimer <= 0) {
          if (this.targetPlayer) {
            this.setState(EnemyNPCState.Chasing);
          } else {
            this.setState(EnemyNPCState.Returning);
          }
        }
        break;

      case EnemyNPCState.Returning:
        this.updateReturning();
        break;

      case EnemyNPCState.Dead:
        this.stateTimer -= deltaTime;
        break;
    }
  }

  private updateChasing(deltaTime: number) {
    if (!this.targetPlayer) {
      this.setState(EnemyNPCState.Returning);
      return;
    }

    const targetPos = this.targetPlayer.position.get();
    this.navMeshAgent?.destination.set(targetPos);

    const distSq = this.entity.position.get().distanceSquared(targetPos);
    const attackDistSq = this.props.maxAttackDistance * this.props.maxAttackDistance;

    if (distSq <= attackDistSq) {
      this.setState(EnemyNPCState.Attacking);
    }
  }

  private updateAttacking(deltaTime: number) {
    if (!this.targetPlayer) {
      this.setState(EnemyNPCState.Returning);
      return;
    }

    // Stop moving while attacking
    this.navMeshAgent?.destination.set(this.entity.position.get());

    const targetPos = this.targetPlayer.position.get();
    const distSq = this.entity.position.get().distanceSquared(targetPos);
    const attackDistSq = this.props.maxAttackDistance * this.props.maxAttackDistance;

    // If player moved out of range, chase again
    if (distSq > attackDistSq * 1.5) {
      this.setState(EnemyNPCState.Chasing);
      return;
    }

    this.attackTimer -= deltaTime;
    if (this.attackTimer <= 0) {
      this.attackTimer = this.currentAttackCooldown;
      this.triggerAttackAnimation();
      this.dealDamageToPlayer();
    }
  }

  private updateReturning() {
    const homePos = this.aggroLocation || this.startLocation;
    this.navMeshAgent?.destination.set(homePos);

    const distSq = this.entity.position.get().distanceSquared(homePos);

    if (distSq < 1.0) {
      this.setState(EnemyNPCState.Idle);
    }
  }

  private dealDamageToPlayer() {
    if (!this.targetPlayer) return;

    // This would integrate with your player health system
    console.log(`[EnemyNPC] Dealing ${this.currentDamage} damage to player`);

    // Example: You'd broadcast a damage event here
    // this.sendNetworkBroadcastEvent(EventsService.CombatEvents.DealDamage, {
    //   target: this.targetPlayer,
    //   amount: this.currentDamage
    // });
  }

  private updateLookAt() {
    if (this.targetPlayer && this.state !== EnemyNPCState.Returning) {
      this.lookAt = this.targetPlayer.position.get();
    } else {
      this.lookAt = undefined;
    }
  }

  // ============== STATE TRANSITIONS ==============

  private onEnterState(state: EnemyNPCState) {
    console.log(`[EnemyNPC] Entering state: ${EnemyNPCState[state]}`);

    switch (state) {
      case EnemyNPCState.Idle:
        this.navMeshAgent?.isImmobile.set(true);
        this.navMeshAgent?.destination.set(this.entity.position.get());
        this.aggroLocation = undefined;
        break;

      case EnemyNPCState.Taunting:
        this.stateTimer = this.props.tauntDuration;
        this.navMeshAgent?.isImmobile.set(true);
        this.triggerEmoteAnimation(BaseNPCEmote.Taunt);
        break;

      case EnemyNPCState.Chasing:
        this.navMeshAgent?.isImmobile.set(false);
        this.navMeshAgent?.maxSpeed.set(this.currentChaseSpeed);
        break;

      case EnemyNPCState.Attacking:
        this.attackTimer = 0; // Attack immediately when entering state
        this.navMeshAgent?.maxSpeed.set(0);
        break;

      case EnemyNPCState.Hit:
        this.stateTimer = this.props.hitAnimDuration;
        this.navMeshAgent?.isImmobile.set(true);
        break;

      case EnemyNPCState.Returning:
        this.navMeshAgent?.isImmobile.set(false);
        this.navMeshAgent?.maxSpeed.set(this.props.returnSpeed);
        this.targetPlayer = undefined;
        break;

      case EnemyNPCState.Dead:
        this.stateTimer = this.props.deathDuration;
        this.dead = true;
        this.navMeshAgent?.isImmobile.set(true);
        break;
    }
  }

  private onLeaveState(state: EnemyNPCState) {
    switch (state) {
      case EnemyNPCState.Dead:
        // Reset on respawn
        this.dead = false;
        this.targetPlayer = undefined;
        this.lookAt = undefined;
        this.players.clear();
        this.entity.position.set(this.startLocation);
        this.currentHitPoints = this.props.maxHitPoints;
        this.lastSwingData = null;
        this.activeSwings.clear();
        break;
    }
  }

  private setState(state: EnemyNPCState) {
    if (this.state !== state) {
      this.onLeaveState(this.state);
      this.state = state;
      this.onEnterState(this.state);
    }
  }



}
hz.Component.register(EnemyNPC);


