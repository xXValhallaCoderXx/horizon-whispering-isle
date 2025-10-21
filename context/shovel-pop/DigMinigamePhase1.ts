/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
// import { DigMinigame } from "DigMinigame";
// import { DigMinigameBase } from "DigMinigameBase";
// import { DigMinigameTarget } from "DigMinigameTarget";
// import { HUDElementType } from "Enums";
// import { Events } from "Events";
// import { AnimationCallbackReason, AnimationCallbackReasons, Asset, AudioGizmo, Color, Entity, InteractionInfo, LayerType, Vec3 } from "horizon/core";
// import { ItemUtils } from "ItemUtils";
// import { clamp01, lerp } from "MathUtils";

// const hudHideContext = "minigame";

// /**
//  * Phase 1: Break those targets!!
//  */
// export class DigMinigamePhase1 extends DigMinigameBase {
//   // Target area constraints: How larget the spawn area is for targets
//   private readonly areaCenterOffset = 4; // Void in the center of the screen too far from thumbs
//   private readonly areaMaxHorizontal = 10;
//   private readonly areaMinY = -4;
//   private readonly areaMaxY = 0.5;

//   // Config
//   private readonly minigameTimeMs = 16.5 * 1000;
//   private readonly targetTimeReductionMs = 2 * 1000;
//   private readonly lastTapBuffer = .3 * 1000;
//   private readonly timeBetweenSpawnsMs = 0.3 * 1000;
//   private readonly exitTime = 1;
//   private readonly idleFadeOnDuration = .7;
//   private readonly useWaves = false;

//   // Text color config
//   private readonly textStartColor = "#E4AB00";
//   private readonly textEndColor = "#00DF13";

//   // Refs
//   private targets: DigMinigameTarget[];

//   // State
//   private minigameRunning: boolean = false;
//   private startTimeMs = 0;
//   private rocksTapped = 0;
//   private targetSpawnCounter = 0;
//   private nextSpawnTimestampMs = 0;
//   private moveOutElapsed = this.exitTime;
//   private playedLastTap = false;

//   constructor(digMinigame: DigMinigame, root: Entity) {
//     super(digMinigame, root);

//     this.targets = [ // :)
//       this.props.target0!.getComponents<DigMinigameTarget>()[0],
//       this.props.target1!.getComponents<DigMinigameTarget>()[0],
//       this.props.target2!.getComponents<DigMinigameTarget>()[0],
//       //this.props.target3!.getComponents<DigMinigameTarget>()[0],
//       //this.props.target4!.getComponents<DigMinigameTarget>()[0],
//       //this.props.target5!.getComponents<DigMinigameTarget>()[0],
//       //this.props.target6!.getComponents<DigMinigameTarget>()[0],
//     ];

//     for (let i = 0; i < this.targets.length; ++i) {
//       this.targets[i].setup(() => {
//         // Make this phase go faster when a target is broken
//         this.startTimeMs -= this.targetTimeReductionMs;
//         if (!this.useWaves) {
//           this.targetSpawnCounter--;
//         }
//       });
//     }

//     this.onFocusInteractionCallback = this.onFocusInteraction;
//   }

//   public init() {
//     super.init();

//     this.minigameRunning = true;
//     this.rocksTapped = 0;
//     this.startTimeMs = Date.now();
//     this.playedLastTap = false;

//     // this.digMinigame.sendLocalBroadcastEvent(Events.localHideHUD, { context: hudHideContext, exclude: HUDElementType.DigMinigameUsefulWidget });
//     this.async.setTimeout(() => {
//       this.owner.playAvatarAnimation(this.props.anim_attack_fast_idle!, { looping: true, fadeInDuration: this.idleFadeOnDuration, fadeOutDuration: .2 });
//     }, 800);
//   }

//   public cancel() {
//     this.minigameRunning = false;
//   }

//   public set visible(value: boolean) {
//     if (!value && this.movingOut) {
//       // Let this get disabled naturally after move out finishes
//     }
//     else {
//       this.root.visible.set(value);
//       this.root.collidable.set(value);
//     }
//   }

//   private onFocusInteraction(payload: { interactionInfo: InteractionInfo[]; }): boolean {
//     let inputEaten = false;
//     for (let i = 0; i < payload.interactionInfo.length; i++) {
//       const interactionInfo = payload.interactionInfo[i];
//       const raycastHitInfo = this.digMinigame.raycast.raycast(interactionInfo.worldRayOrigin, interactionInfo.worldRayDirection, { layerType: LayerType.Objects, maxDistance: 100, }) as any;
//       if (!raycastHitInfo) {
//         continue;
//       }

//       let hitEntity: Entity = raycastHitInfo.target as Entity;
//       if (hitEntity) {
//         let targetScripts = hitEntity.parent.get()!.getComponents<DigMinigameTarget>();
//         if (targetScripts.length > 0) {
//           // Rock detected!! Smash it
//           let targetScript = targetScripts[0];
//           this.props.breakRockSfx!.as(AudioGizmo).play({ fade: 0, players: this.digMinigame.sfxPlayer });
//           this.rocksTapped++;
//           const lastTap = this.isLastTap();

//           if (lastTap) {
//             this.playLastTap();
//           } else {
//             this.owner.playAvatarAnimation(this.props.anim_attack_dig!, { playRate: 1.5, fadeOutDuration: .2 });
//             if (this.groundDustFx !== null) {
//               this.groundDustFx.position.set(this.digPosition);
//               this.groundDustFx.play();
//             }
//             const rocksTapped = this.rocksTapped;
//             this.async.setTimeout(() => {
//               if (this.rocksTapped === rocksTapped && this.minigameRunning) {
//                 this.owner.playAvatarAnimation(this.props.anim_attack_fast_idle!, { looping: true, fadeInDuration: this.idleFadeOnDuration, fadeOutDuration: .2 });
//               }
//             }, 800);
//           }
//           this.digMinigame.incrementStrength(`x${this.rocksTapped + 1}`);
//           targetScript.getHit();
//           this.props.digBeginSfx?.as(AudioGizmo).play({ fade: 0, players: this.digMinigame.sfxPlayer });
//         }
//       }
//     }

//     return inputEaten;
//   }

//   private playLastTap() {
//     this.playedLastTap = true;
//     this.owner.playAvatarAnimation(this.props.anim_strike_gold!, { playRate: 1 });
//     this.async.setTimeout(() => {
//       this.owner.playAvatarAnimation(this.props.anim_prying_loop!, { looping: true, playRate: 1, fadeInDuration: .3 });
//     }, 400);
//     this.props.strikeGoldSfx?.as(AudioGizmo).play({ fade: 0, players: this.digMinigame.sfxPlayer });
//   }

//   private isLastTap(): boolean {
//     return this.targetTimeReductionMs + Date.now() + this.lastTapBuffer - this.startTimeMs > this.minigameTimeMs;
//   }

//   public update(deltaTime: number) {
//     super.update(deltaTime);

//     this.updateMinigameLocation();

//     if (!this.minigameRunning) {
//       return;
//     }

//     const currentTimeMs = Date.now();

//     // Update the targets
//     let inProgress = false;
//     for (let i = 0; i < this.targets.length; ++i) {
//       this.targets[i].update(deltaTime);

//       if (!inProgress && !this.targets[i].isBroken) {
//         inProgress = true; // This set of targets are still doing work
//       }
//     }

//     if (!inProgress) {
//       // Prepare for the next wave
//       this.targetSpawnCounter = 0;
//     }

//     const targetsToSpawn = 2;// this.targets.length;
//     if (currentTimeMs > this.nextSpawnTimestampMs) {
//       // Spawn the next available target
//       for (let i = 0; i < this.targets.length && this.targetSpawnCounter < targetsToSpawn; ++i) {
//         if (!this.targets[i].isInUse) {
//           // Arbitrary offset from center X since it's uncomfortable for thumb press
//           let x = lerp(this.areaCenterOffset, this.areaMaxHorizontal, Math.random()) * (Math.random() > 0.5 ? -1 : 1);
//           let y = lerp(this.areaMinY, this.areaMaxY, Math.random());
//           this.targets[i].init(new Vec3(x, y, 0));
//           this.nextSpawnTimestampMs = currentTimeMs + this.timeBetweenSpawnsMs;
//           this.targetSpawnCounter++;
//           if (!this.useWaves) {
//             break;
//           }
//         }
//       }
//     }

//     const progressBarMaxLength = 12.371318;
//     let progress01 = clamp01((currentTimeMs - this.startTimeMs) / this.minigameTimeMs);
//     let color: Color = ItemUtils.hexToColor(ItemUtils.interpolateHexColors(this.textStartColor, this.textEndColor, progress01));
//     this.props.phase1Fill!.scale.set(new Vec3(progress01 * progressBarMaxLength, 1, 1));
//     this.props.phase1Fill!.color.set(color);

//     if (progress01 >= 1) {
//       this.minigameRunning = false;

//       //this.digMinigame.flyStrength(`x${this.rocksTapped + 1}`);
//       if (!this.playedLastTap) {
//         this.playLastTap();
//       }

//       // Eh, targets aren't that cool. NEXT!!
//       this.moveOutMinigame();
//     }
//   }

//   private wait(ms: number) {
//     return new Promise(resolve => {
//       this.async.setTimeout(() => resolve(true), ms);
//     });
//   }

//   // Returns true if the total move out time has reached/surpased the exit time
//   private get movingOut() {
//     return this.moveOutElapsed < this.exitTime;
//   }

//   private async moveOutMinigame() {
//     this.moveOutElapsed = 0;

//     const startTime = Date.now();
//     let i = 0;
//     this.digMinigame.alert();
//     while (this.movingOut) {
//       // Break any remaining, unbroken targets
//       while (i < this.targets.length && this.targets[i].isBroken) {
//         i++;
//       }

//       if (i < this.targets.length) {
//         this.targets[i].getHit();
//         i++;
//       }

//       // Wait
//       await this.wait(16); // wait 16ms (approximately 60fps)
//       this.moveOutElapsed = (Date.now() - startTime) * 0.001; // Converted to Seconds
//     }

//     // Briefly pause to let everything settle
//     await this.wait(0.55 * 1000);

//     this.digMinigame.onComplete(true);
//     this.visible = false;
//   }
// }
