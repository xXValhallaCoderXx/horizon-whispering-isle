import * as hz from "horizon/core";
import { BaseNPC, BaseNPCEmote } from "./BaseNPC";

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

      console.log("Setting up aggro trigger for EnemyNPC");
      // Acquire target(s) when players enter the aggro trigger
      this.connectCodeBlockEvent(this.props.trigger, hz.CodeBlockEvents.OnPlayerEnterTrigger, (enteredBy) => {
        const player = enteredBy
        console.log("Entity entered aggro trigger", player?.name.get());
        if (player && player !== this.world.getServerPlayer()) {
          console.log("Player entered aggro");
          this.onStartAttackingPlayer(player);
          // Ensure we immediately have a target
          this.targetPlayer = this.targetPlayer ?? player;
        }
      });


      this.connectCodeBlockEvent(this.props.trigger, hz.CodeBlockEvents.OnEntityEnterTrigger, (enteredBy) => {
        console.log("Entity entered trigger");
        if (enteredBy.owner.get() !== this.world.getServerPlayer()) {
          console.log("Starting to attack player");
          this.hit();
        }
      });

      // Note: We don't use OnPlayerExitTrigger because the trigger is just for initial detection.
      // The NPC should continue chasing based on maxVisionDistance, which is handled by
      // the distance-based cleanup in updateTarget().
    }

    this.connectNetworkBroadcastEvent(StartAttackingPlayer, ({ player }) => {
      this.onStartAttackingPlayer(player);
    });
    this.connectNetworkBroadcastEvent(StopAttackingPlayer, ({ player }) => {
      this.onStopAttackingPlayer(player);
    });
  }

  update(deltaTime: number) {
    super.update(deltaTime);

    this.updateTarget();
    this.updateStateMachine(deltaTime);
    this.updateLookAt();
  }

  hit() {
    console.log("EnemyNPC hit received");
    const now = Date.now() / 1000.0;
    if (now >= this.lastHitTime + EnemyNPC.hitAnimationDuration) {
      this.hitPoints--;
      this.lastHitTime = now;
      this.triggerHitAnimation();
      if (this.hitPoints <= 0) {
        this.setState(EnemyNPCState.Dead);
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
}
hz.Component.register(EnemyNPC);


