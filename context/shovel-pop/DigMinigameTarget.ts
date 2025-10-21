/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
// import { Color, Component, ParticleGizmo, PropTypes, Quaternion, TextGizmo, Vec3 } from "horizon/core";
// import { clamp01, lerp } from "MathUtils";

// type TargetHitCallback = () => void;

// export class DigMinigameTarget extends Component<typeof DigMinigameTarget> {
//   static propsDefinition = {
//     collider: { type: PropTypes.Entity },
//     visualRoot: { type: PropTypes.Entity },

//     // Text refs
//     complimentRoot: { type: PropTypes.Entity },

//     // Particles
//     breakPfx: { type: PropTypes.Entity },
//   };

//   // Config
//   private readonly lifetimeMs: number = 5 * 1000;
//   private readonly startScale: Vec3 = Vec3.one.mul(0.02);
//   private readonly defaultScale: Vec3 = Vec3.one.mul(0.75); // This is hardcoded because weird things happened when I set it from the entity itself
//   private readonly pingPongTimeMs = 1.5 * 1000; // Number of milliseconds for a full ping-pong (counting up, then down)
//   private readonly randomRotMax = 15;

//   // Refs
//   private breakPfx!: ParticleGizmo;
//   private callback!: TargetHitCallback;

//   // State
//   private broken: boolean = false;
//   private inUse: boolean = false;
//   private spawnTimestampMs: number = 0;
//   private randomRotZ: number = 0;

//   public get isBroken() {
//     return this.broken;
//   }

//   public get isInUse() {
//     return this.inUse;
//   }

//   start() {
//     this.breakPfx = this.props.breakPfx!.as(ParticleGizmo);
//     this.props.complimentRoot!.visible.set(false);
//     this.deinit(); // Hide this object to start

//     this.randomRotZ = (Math.random() > 0.5 ? -1 : 1) * this.randomRotMax;
//   }

//   public setup(callback: TargetHitCallback): void {
//     this.callback = callback;
//   }

//   public init(position: Vec3) {
//     this.inUse = true;
//     this.broken = false;
//     this.ratio = 0;
//     this.spawnTimestampMs = Date.now();

//     this.props.complimentRoot!.visible.set(false);
//     this.props.collider!.collidable.set(true);
//     //this.props.visualRoot!.visible.set(true);

//     this.entity.transform.localPosition.set(position);
//   }

//   public deinit() {
//     this.inUse = false;
//     this.broken = true;
//     this.props.collider!.collidable.set(false);
//     //this.props.visualRoot!.visible.set(false);
//   }

//   private ratio = 0;

//   public update(deltaTime: number) {
//     if (this.broken) {
//       return;
//     }

//     const currentTimeMs = Date.now();
//     const elapsedMs = currentTimeMs - this.spawnTimestampMs;
//     const progress01 = clamp01(elapsedMs / this.lifetimeMs);

//     if (this.ratio < 1) {
//       this.ratio += deltaTime;//= Math.sin(progress01 * Math.PI);

//       const x = this.startScale.x + (this.defaultScale.x - this.startScale.x) * this.ratio;
//       const y = this.startScale.y + (this.defaultScale.y - this.startScale.y) * this.ratio;
//       const z = this.startScale.z + (this.defaultScale.z - this.startScale.z) * this.ratio;

//       this.entity.transform.localScale.set(new Vec3(x, y, z));
//     }

//     // Rotate back and forth to get the users attention
//     const t = (elapsedMs % this.pingPongTimeMs) / this.pingPongTimeMs; // Normalized time
//     const pingPong01 = 1 - Math.abs(1 - 2 * t);
//     let euler: Vec3 = new Vec3(0, 0, pingPong01 * this.randomRotZ);
//     this.entity.transform.localRotation.set(Quaternion.fromEuler(euler));

//     if (progress01 >= 1) {
//       // User failed to click this in time
//       //this.deinit();
//     }
//   }

//   /**
//    * Smash that target
//    */
//   public getHit(): void {
//     this.broken = true;
//     this.props.collider!.collidable.set(false);
//     //this.props.visualRoot!.visible.set(false);
//     this.entity.transform.localScale.set(this.defaultScale);
//     this.breakPfx.play();

//     this.flyCompliment();

//     this.callback();
//   }

//   private async flyCompliment() {
//     const startTime = Date.now();
//     const randomZRot = (Math.random() > 0.5 ? -1 : 1) * (Math.random() + 1) * 10;
//     const flyTime = 1.2;
//     const flyY = 3;
//     const scaleMax = 2;
//     const scaleMin = 0.1;
//     const scaleTime = 0.1;

//     let elapsed = 0;
//     let currentScalar = scaleMin;

//     this.props.complimentRoot!.visible.set(true);

//     while (elapsed < flyTime) {
//       // Calculate scale
//       if (elapsed < scaleTime) {
//         currentScalar = lerp(scaleMin, scaleMax, elapsed / scaleTime);
//       }
//       else if (elapsed > flyTime - scaleTime) {
//         currentScalar = lerp(scaleMax, scaleMin, (elapsed - (flyTime - scaleTime)) / scaleTime);
//       }
//       else {
//         currentScalar = scaleMax;
//       }

//       this.props.complimentRoot!.transform.localScale.set(Vec3.one.mul(currentScalar));

//       // Rotation
//       let eulerRot = this.props.complimentRoot!.transform.localRotation.get().toEuler();
//       eulerRot.z = elapsed * 10 * Math.sign(randomZRot);
//       this.props.complimentRoot!.transform.localRotation.set(Quaternion.fromEuler(eulerRot));

//       // Position
//       let complimentPosition = this.props.complimentRoot!.transform.localPosition.get();
//       complimentPosition.y = flyY * elapsed;
//       this.props.complimentRoot!.transform.localPosition.set(complimentPosition);

//       // Wait
//       await this.wait(16); // wait 16ms (approximately 60fps)
//       elapsed = (Date.now() - startTime) * 0.001; // Converted to Seconds
//     }

//     this.props.complimentRoot!.visible.set(false);
//     this.inUse = false;
//   }

//   private wait(ms: number) {
//     return new Promise(resolve => {
//       this.async.setTimeout(() => resolve(true), ms);
//     });
//   }
// }
// Component.register(DigMinigameTarget);
