import * as hz from "horizon/core";
import { healthData } from "HealthData";
import { EventsService } from "constants";
import { BaseNPC, BaseNPCEmote } from "./BaseNPC";
import { Animation, Easing } from 'horizon/ui';


enum EnemyNPCState {
  Idle,
  Taunting,
  Walking,
  Running,
  Hit,
  Dead,
}

export const StartAttackingPlayer: hz.NetworkEvent<{ player: hz.Player }> = new hz.NetworkEvent<{ player: hz.Player }>("StartAttackingPlayer");
export const StopAttackingPlayer: hz.NetworkEvent<{ player: hz.Player }> = new hz.NetworkEvent<{ player: hz.Player }>("StopAttackingPlayer");

class EnemyNPC extends BaseNPC<typeof EnemyNPC> {
  static propsDefinition = {
    ...BaseNPC.propsDefinition,
    trigger: { type: hz.PropTypes.Entity },
    hitbox: { type: hz.PropTypes.Entity },
    maxVisionDistance: { type: hz.PropTypes.Number, default: 7 },
    maxAttackDistance: { type: hz.PropTypes.Number, default: 5 },
    hitSfx: { type: hz.PropTypes.Entity },
    deathSfx: { type: hz.PropTypes.Entity },
    deathVfx: { type: hz.PropTypes.Entity }
  };
  hitSfx?: hz.AudioGizmo;

  deathSfx?: hz.AudioGizmo;
  deathVfx?: hz.ParticleGizmo;
  static tauntingAnimationDuration: number = 2.8;
  static attackAnimationDuration: number = 2;
  static hitAnimationDuration: number = 0.5;
  static deathDuration: number = 3;
  static maxHitPoints: number = 4;

  players: Set<hz.Player> = new Set();
  hitPoints: number = EnemyNPC.maxHitPoints;
  targetPlayer: hz.Player | undefined = undefined;
  state: EnemyNPCState = EnemyNPCState.Idle;
  stateTimer: number = 0;
  attackTimer: number = 0;
  lastHitTime: number = 0;

  startLocation!: hz.Vec3;

  private activeSwings: Set<string> = new Set();

  private lastSwingData: {
    weapon: hz.Entity;
    owner: hz.Player;
    damage: number;
    reach: number;
    timestamp: number;
  } | null = null;

  preStart(): void {
    this.hitSfx = this.props.hitSfx?.as(hz.AudioGizmo);
    this.deathSfx = this.props.deathSfx?.as(hz.AudioGizmo);
    this.deathVfx = this.props.deathVfx?.as(hz.ParticleGizmo);
  }

  start() {
    super.start();
    this.dead = false;
    this.setState(EnemyNPCState.Idle);
    this.startLocation = this.entity.position.get();
    if (this.props.trigger !== undefined && this.props.trigger !== null) {
      // Acquire target(s) when players enter the aggro trigger
      this.connectCodeBlockEvent(this.props.trigger, hz.CodeBlockEvents.OnPlayerEnterTrigger, (enteredBy) => {
        const player = enteredBy
        if (player && player !== this.world.getServerPlayer()) {
          console.log("Player entered aggro: ", player.name.get());
          this.onStartAttackingPlayer(player);
          this.targetPlayer = this.targetPlayer ?? player;
        }
      });


      // this.connectCodeBlockEvent(this.props.trigger, hz.CodeBlockEvents.OnEntityEnterTrigger, (enteredBy) => {
      //   console.log("Entity entered trigger");
      //   if (enteredBy.owner.get() !== this.world.getServerPlayer()) {
      //     console.log("Starting to attack player");
      //     this.hit();
      //   }
      // });


    }

    if (this.props.hitbox !== undefined && this.props.hitbox !== null) {


      this.connectCodeBlockEvent(this.props.hitbox as hz.Entity, hz.CodeBlockEvents.OnEntityEnterTrigger, (enteredBy) => {

        console.log("Enemy NPC Triggered by Owner: ", enteredBy.owner.get());
        // Check if this is a weapon and if there's an active swing
        if (this.lastSwingData && this.activeSwings.size > 0) {
          const timeSinceSwing = Date.now() - this.lastSwingData.timestamp;

          // Validate hit: weapon matches and within swing duration
          if (enteredBy.id === this.lastSwingData.weapon.id &&
            timeSinceSwing < 250) { // Use durationMs from event

            console.log(`Valid hit! Dealing ${this.lastSwingData.damage} damage`);
            this.takeDamage(this.lastSwingData.damage, this.lastSwingData.owner);

            // Clear swing data to prevent multiple hits from same swing
            this.lastSwingData = null;
            this.activeSwings.clear();
          }
        }
      });

    }

    this.connectNetworkBroadcastEvent(EventsService.CombatEvents.AttackSwingEvent, (payload) => {
      console.log("EnemyNPC Attack Swing Event Recieved:", payload);
      console.log("EnemyNPC Attack Swing Event Recieved Weapon Owner:", payload.weapon.owner.get());


      const swingId = `${payload.weapon.id}_${Date.now()}`;
      this.activeSwings.add(swingId);

      // Remove swing after its duration
      this.async.setTimeout(() => {
        this.activeSwings.delete(swingId);
      }, payload.durationMs);

      // Store the last swing data for hit validation
      this.lastSwingData = {
        weapon: payload.weapon,
        owner: payload.owner,
        damage: payload.damage,
        reach: payload.reach || 2.0,
        timestamp: Date.now()
      };

    });

    this.connectNetworkBroadcastEvent(StartAttackingPlayer, ({ player }) => {
      this.onStartAttackingPlayer(player);
    });
    this.connectNetworkBroadcastEvent(StopAttackingPlayer, ({ player }) => {
      this.onStopAttackingPlayer(player);
    });


    // this.connectNetworkEvent(this.entity, EventsService.CombatEvents.AttackSwingEvent, () => {
    //   console.log("EnemyNPC received AttackSwingEvent");
    //   this.hit();
    // })
  }

  update(deltaTime: number) {
    super.update(deltaTime);

    this.updateTarget();
    this.updateStateMachine(deltaTime);
    this.updateLookAt();
  }

  hit() {
    const now = Date.now() / 1000.0;
    if (now >= this.lastHitTime + EnemyNPC.hitAnimationDuration) {
      this.hitPoints--;
      this.lastHitTime = now;
      this.hitSfx?.play();
      this.triggerHitAnimation();
      this.recieveDamage(25);
      if (this.hitPoints <= 0) {
        this.handleDeath();


      } else {
        this.setState(EnemyNPCState.Hit);
      }
    }
  }

  private onStartAttackingPlayer(player: hz.Player) {
    this.players.add(player);
  }

  private onStopAttackingPlayer(player: hz.Player) {
    // Remove from the players set
    this.players.delete(player);

    if (player === this.targetPlayer) {
      this.targetPlayer = undefined;
    }
  }

  private takeDamage(amount: number, attacker: hz.Player) {
    if (this.dead) return;

    const now = Date.now() / 1000.0;
    if (now >= this.lastHitTime + EnemyNPC.hitAnimationDuration) {
      this.hitPoints -= Math.ceil(amount / 25); // Convert damage to hit points
      this.lastHitTime = now;
      this.hitSfx?.play();
      this.triggerHitAnimation();

      console.log(`NPC took ${amount} damage. Hit points remaining: ${this.hitPoints}`);

      if (this.hitPoints <= 0) {
        this.handleDeath();
      } else {
        this.setState(EnemyNPCState.Hit);
      }
    }
  }

  private updateTarget() {
    const monsterPosition = this.entity.position.get();
    const maxVisionDistanceSq = this.props.maxVisionDistance * this.props.maxVisionDistance;

    // Remove players that are too far away (cleanup for edge cases like teleporting)
    const playersToRemove: hz.Player[] = [];
    this.players.forEach((player) => {
      const playerPosition = player.position.get();
      const distanceSq = monsterPosition.distanceSquared(playerPosition);
      if (distanceSq > maxVisionDistanceSq) {
        playersToRemove.push(player);
      }
    });
    playersToRemove.forEach(player => this.onStopAttackingPlayer(player));

    // Always find the closest player within range (allows switching targets)
    let closestDistanceSq = maxVisionDistanceSq;
    let closestPlayer: hz.Player | undefined = undefined;

    this.players.forEach((player) => {
      const playerPosition = player.position.get();
      const distanceSq = monsterPosition.distanceSquared(playerPosition);
      if (distanceSq < closestDistanceSq) {
        closestDistanceSq = distanceSq;
        closestPlayer = player;
      }
    });

    this.targetPlayer = closestPlayer;
  }

  private updateLookAt() {
    if (this.targetPlayer !== undefined) {
      this.lookAt = this.targetPlayer.position.get();
    }
  }

  private updateStateMachine(deltaTime: number) {
    switch (this.state) {
      case EnemyNPCState.Idle:
        if (this.targetPlayer !== undefined) {
          // Taunt when a target is acquired

          this.setState(EnemyNPCState.Taunting);
        }
        break;
      case EnemyNPCState.Taunting:
        this.stateTimer -= deltaTime;
        if (this.stateTimer <= 0) {
          // 20% chances to run, 80% chances to run
          if (Math.random() <= 0.8) {
            this.setState(EnemyNPCState.Walking);
          } else {
            this.setState(EnemyNPCState.Running);
          }
        }
        break;
      case EnemyNPCState.Walking:
        this.updateWalkAndRunStates(deltaTime);
        break;
      case EnemyNPCState.Running:
        this.updateWalkAndRunStates(deltaTime);
        break;
      case EnemyNPCState.Hit:
        this.stateTimer -= deltaTime;
        if (this.stateTimer <= 0) {
          if (Math.random() <= 0.8) {
            this.setState(EnemyNPCState.Walking);
          } else {
            this.setState(EnemyNPCState.Running);
          }
        }
      case EnemyNPCState.Dead:
        this.stateTimer -= deltaTime;
        if (this.stateTimer <= 0) {
          this.setState(EnemyNPCState.Idle);
        }
        break;
    }
  }

  private onEnterState(state: EnemyNPCState) {
    switch (state) {
      case EnemyNPCState.Idle:
        this.navMeshAgent?.isImmobile.set(true);
        this.navMeshAgent?.destination.set(this.entity.position.get());
        break;
      case EnemyNPCState.Taunting:
        this.stateTimer = EnemyNPC.tauntingAnimationDuration;
        this.navMeshAgent?.isImmobile.set(true);
        this.triggerEmoteAnimation(BaseNPCEmote.Taunt);
        break;
      case EnemyNPCState.Walking:
        this.navMeshAgent?.isImmobile.set(false);
        this.setMaxSpeedToWalkSpeed();
        break;
      case EnemyNPCState.Running:
        this.navMeshAgent?.isImmobile.set(false);
        this.setMaxSpeedToRunSpeed();
        break;
      case EnemyNPCState.Hit:
        this.stateTimer = EnemyNPC.hitAnimationDuration;
        this.navMeshAgent?.destination.set(this.entity.position.get());
        this.navMeshAgent?.isImmobile.set(true);
        break;
      case EnemyNPCState.Dead:
        this.stateTimer = EnemyNPC.deathDuration;
        this.dead = true;
        break;
    }
  }

  private onLeaveState(state: EnemyNPCState) {
    switch (state) {
      case EnemyNPCState.Idle:
        break;
      case EnemyNPCState.Taunting:
        break;
      case EnemyNPCState.Walking:
        break;
      case EnemyNPCState.Running:
        break;
      case EnemyNPCState.Hit:
        break;
      case EnemyNPCState.Dead:
        this.dead = false;
        this.targetPlayer = undefined;
        this.lookAt = undefined;
        this.entity.position.set(this.startLocation);
        this.hitPoints = EnemyNPC.maxHitPoints;
        this.lastSwingData = null;
        this.activeSwings.clear();
        break;
    }
  }

  private setState(state: EnemyNPCState) {
    if (this.state != state) {
      this.onLeaveState(this.state);
      this.state = state;
      this.onEnterState(this.state);
    }
  }

  private updateWalkAndRunStates(deltaTime: number) {
    if (this.targetPlayer === undefined) {
      this.setState(EnemyNPCState.Idle);
    } else {
      this.navMeshAgent?.destination.set(this.targetPlayer.position.get());
      const distanceToPlayer = this.targetPlayer.position.get().distanceSquared(this.entity.position.get());
      if (distanceToPlayer < this.props.maxAttackDistance * this.props.maxAttackDistance) {
        this.attackTimer -= deltaTime;
        if (this.attackTimer <= 0) {
          this.attackTimer = EnemyNPC.attackAnimationDuration;
          console.log("Trigger attack animation");
          this.triggerAttackAnimation();
        }
      }
    }
  }

  private recieveDamage(amount: number) {
    if (healthData.currentHealth <= 0) return;
    healthData.currentHealth -= amount;
    if (healthData.currentHealth < 0) healthData.currentHealth = 0;
    const healthRatio = healthData.currentHealth / healthData.maxHealth;
    healthData.healthValueBinding.set(healthRatio);
    healthData.animationValueBinding.set(
      Animation.timing(healthRatio, {
        duration: 500,
        easing: Easing.inOut(Easing.ease)
      })
    );
  }

  private handleDeath() {
    // Destroy the Asset

    this.setState(EnemyNPCState.Dead);
    this.deathSfx?.play();
    this.deathVfx?.play();


    this.sendNetworkBroadcastEvent(EventsService.CombatEvents.NPCDeath, {
      targetNpcId: this.entity.id.toString(),
      enemyType: this.entity.name.get(),
      killerPlayer: null,
    });


    this.async.setTimeout(() => {
      this.world.deleteAsset(this.entity);
    }, EnemyNPC.deathDuration * 1000);
  }
}
hz.Component.register(EnemyNPC);


