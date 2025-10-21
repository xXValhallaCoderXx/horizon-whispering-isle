import * as hz from "horizon/core";
import * as ab from "horizon/unity_asset_bundles";

export const LookAtPlayer: hz.LocalEvent<{ player: hz.Player }> = new hz.LocalEvent<{ player: hz.Player }>('LookAtPlayer');
export const StopLookingAtPlayer: hz.LocalEvent<{ player: hz.Player }> = new hz.LocalEvent<{ player: hz.Player }>('StopLookingAtPlayer');
export const PlayAnimation: hz.LocalEvent<{ animation: string, player: hz.Player | undefined }> = new hz.LocalEvent<{ animation: string, player: hz.Player | undefined }>('PlayAnimation');

export class NPCStandAndLook extends hz.Component<typeof NPCStandAndLook> {
  static propsDefinition = {
    headHeight: { type: hz.PropTypes.Number, default: 1.8 },
    lookAtAllPlayers: { type: hz.PropTypes.Boolean, default: true },
    changeTargetDelayMin: { type: hz.PropTypes.Number, default: 1 },
    changeTargetDelayMax: { type: hz.PropTypes.Number, default: 5 },
  };

  private assetRef_?: ab.AssetBundleInstanceReference;
  private lookAt_: hz.Vec3 | undefined;
  private animLookX_: number = 0.0;
  private animLookY_: number = 0.0;

  players: hz.Player[] = [];
  playerToLookAt: hz.Player | undefined;
  previousPlayerToLookAt: hz.Player | undefined;
  reevaluateTimer: number = 0;

  start() {
    this.assetRef_ = this.entity.as(ab.AssetBundleGizmo)?.getRoot();

    if (this.props.lookAtAllPlayers) {
      this.connectCodeBlockEvent(
        this.entity,
        hz.CodeBlockEvents.OnPlayerEnterWorld,
        (player: hz.Player) => {
          this.onLookAtPlayer(player);
        }
      );

      this.connectCodeBlockEvent(
        this.entity,
        hz.CodeBlockEvents.OnPlayerExitWorld,
        (player: hz.Player) => {
          this.onStopLookingAtPlayer(player);
        }
      );
    }

    this.connectLocalEvent(this.entity, LookAtPlayer, ({ player }) => {
      this.onLookAtPlayer(player);
    });

    this.connectLocalEvent(this.entity, StopLookingAtPlayer, ({ player }) => {
      this.onStopLookingAtPlayer(player);
    });

    this.connectLocalEvent(this.entity, PlayAnimation, ({ animation, player }) => {
      if (player !== undefined) {
        this.playerToLookAt = player;
        this.reevaluateTimer = this.getReevaluateDelay();
      }
      this.triggerAnimation(animation);
    });

    this.connectLocalBroadcastEvent(hz.World.onUpdate, (data) => {
      this.update(data.deltaTime);
    });
  }

  onLookAtPlayer(player: hz.Player) {
    this.players.push(player);
  }

  onStopLookingAtPlayer(player: hz.Player) {
    const index = this.players.indexOf(player, 0);
    if (index > -1) {
      this.players.splice(index, 1);
    }

    if (player == this.playerToLookAt) {
      this.playerToLookAt = undefined;
    }
  }

  update(deltaTime: number): void {
    this.reevaluateTimer -= deltaTime;
    if (this.reevaluateTimer <= 0 || this.playerToLookAt == undefined) {
      this.playerToLookAt = this.selectRandomPlayerToLookAt();
      this.reevaluateTimer = this.getReevaluateDelay();
    }

    if (this.playerToLookAt !== this.previousPlayerToLookAt) {
      this.previousPlayerToLookAt = this.playerToLookAt;
      if (this.playerToLookAt) {
        this.lookAt_ = this.playerToLookAt.head.position.get();
      } else {
        this.lookAt_ = undefined;
      }
    } else if (this.playerToLookAt) {
      this.lookAt_ = this.playerToLookAt.head.position.get();
    }

    this.updateLookAtAnimationParameters(deltaTime);
  }

  selectRandomPlayerToLookAt(): hz.Player | undefined {
    const candidates: hz.Player[] = [];
    const forward = this.entity.forward.get();
    this.players.forEach((player) => {
      if (hz.Vec3.dot(forward, player.position.get().sub(this.entity.position.get())) > 0) {
        candidates.push(player);
      }
    });

    if (candidates.length == 0) {
      return undefined;
    } else {
      const index = Math.floor(Math.random() * candidates.length);
      return candidates[index];
    }
  }

  getReevaluateDelay(): number {
    return this.props.changeTargetDelayMin + Math.random() * (this.props.changeTargetDelayMax - this.props.changeTargetDelayMin);
  }

  triggerAnimation(animationName: string) {
    this.assetRef_?.setAnimationParameterTrigger(animationName, false);
    console.log(`Triggered animation for ${this.entity.name.get()}: ${animationName}`);
  }

  private updateLookAtAnimationParameters(deltaTime: number) {
    let desiredLookX = 0.0;
    let desiredLookY = 0.0;

    if (this.lookAt_ != undefined) {
      const headPosition = this.entity.position.get();
      headPosition.y += this.props.headHeight;
      const delta = this.lookAt_.sub(headPosition);
      const dotForward = hz.Vec3.dot(this.entity.forward.get(), delta);
      if (dotForward > 0) {
        const dotRight = hz.Vec3.dot(this.entity.right.get(), delta);
        const dotUp = hz.Vec3.dot(this.entity.up.get(), delta);
        const angleRight = Math.atan2(dotRight, dotForward);
        const angleUp = Math.atan2(dotUp, dotForward);
        desiredLookX = angleRight / (Math.PI * 0.5);
        desiredLookY = angleUp / (Math.PI * 0.5);
      }
    }

    desiredLookX = (4 * this.animLookX_ + desiredLookX) * 0.2;
    desiredLookY = (4 * this.animLookY_ + desiredLookY) * 0.2;

    if (Math.abs(desiredLookX - this.animLookX_) > 0.01) {
      this.animLookX_ = desiredLookX;
      this.assetRef_?.setAnimationParameterFloat("LookX", desiredLookX);
    }

    if (Math.abs(desiredLookY - this.animLookY_) > 0.01) {
      this.animLookY_ = desiredLookY;
      this.assetRef_?.setAnimationParameterFloat("LookY", desiredLookY);
    }
  }
}
hz.Component.register(NPCStandAndLook);
