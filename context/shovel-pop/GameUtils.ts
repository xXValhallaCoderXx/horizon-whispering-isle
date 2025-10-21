/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Events } from "Events";
import {
  AnimatedEntity,
  AttachableEntity,
  AttachablePlayerAnchor,
  AudioGizmo,
  Color,
  Component,
  Entity,
  GrabbableEntity,
  Handedness,
  HapticSharpness,
  HapticStrength,
  ParticleGizmo,
  PersistentSerializableState,
  PhysicalEntity,
  PhysicsForceMode,
  Player,
  PlayerVisibilityMode,
  ProjectileLauncherGizmo,
  Quaternion,
  RaycastGizmo,
  SpawnPointGizmo,
  TextGizmo,
  TrailGizmo,
  TriggerGizmo,
  Vec3,
  World
} from "horizon/core";
import { UIComponent, UIGizmo } from "horizon/ui";
import { Logger } from "Logger";
import * as MathUtils from 'MathUtils';
import { PlayerService } from "PlayerService";

export const EDIT_MODE = false;

type EntityOrUndefined = Entity | undefined

const log = new Logger("GameUtils");

// General
export function formatString(value: string, ...args: string[]): string {
  return value.replace(/{(\d+)}/g, (match, index) => args[index] !== undefined ? args[index] : match);
}

export function truncateString(value: string, characterLimit: number = 14, richText: boolean = true) {
  if (value.length <= characterLimit) {
    return value;
  }
  if (richText) {
    return value.slice(0, characterLimit) + "<cspace=-.2em>...</cspace>"
  }
  return value.slice(0, characterLimit) + '...'
}

export function logToServer(component: Component, message: string) {
  let playerName = "unknown";
  try {
    playerName = component?.world?.getLocalPlayer()?.name?.get() ?? "unknown";
  } catch (e) {
    console.warn("Failed to get local player name when logging to server: " + e);
  }
  component.sendNetworkBroadcastEvent(Events.logToServer, { playerName, message, timeStamp: Date.now().toString() });
}

export function logUIComponent(component: UIComponent) {
  const anyComponent = component as any;
  const scriptInstanceId = anyComponent.scriptInstanceId as bigint;
  const bindingCount = (anyComponent._bindingSet as Set<any>).size;
  const bindingMapSize = (anyComponent._bindingMap as Map<any, any>).size;
  const callbackMapSize = (anyComponent._callbackMap as Map<any, any>).size;
  const dynamicComponentCallbackMapSize = (anyComponent._dynamicComponentsCallbackMap as Map<any, any>).size;
  const registeredDisposeOperations = anyComponent.__registeredDisposeOperations as number;
  const uiGizmo = component.entity.as(UIGizmo);
  const entityName = uiGizmo.name.get();
  const entityExists = uiGizmo.exists();

  logToServer(component, `UIComponent: ${entityName} ${entityExists ? "exists" : "does NOT exist"} | scriptInstanceId: ${scriptInstanceId} | bindingCount: ${bindingCount} | bindingMapSize: ${bindingMapSize} | callbackMapSize: ${callbackMapSize} | dynamicComponentCallbackMapSize: ${dynamicComponentCallbackMapSize} | registeredDisposeOperations: ${registeredDisposeOperations}`);
}

export const FIX_UI_DELAY = 20000;

export function connectUIFixup(component: Component, resendBindingCount?: number, disableVisbilityPoll?: boolean) {
  const localPlayer = component.world.getLocalPlayer();
  const serverPlayer = component.world.getServerPlayer();
  if (!disableVisbilityPoll) {
    // Ensure UIRoots that should always be visible stay visible.
    // TODO: We're not sure what in horizon is changing the visibility of this component, but this is a hacky workaround.
    component.async.setInterval(() => {
      if (!component.entity.visible.get()) {
        component.entity.visible.set(true);
        log.info(`[${component.entity.name.get()}] Set entity.visible to true`);
      }
      if (!component.entity.isVisibleToPlayer(localPlayer)) {
        component.entity.setVisibilityForPlayers([localPlayer], PlayerVisibilityMode.VisibleTo);
        log.info(`[${component.entity.name.get()}] Set PlayerVisibilityMode to VisibleTo`);
      }
    }, 2000);
  }
  // if (resendBindingCount) {
  //   // Resend UI if initialization fails.
  //   // TODO: This needs to be fixed on the platform side, UI initialization shouldn't fail.
  //   const anyComponent = component as any;
  //   component.async.setTimeout(() => {
  //     const bindingCount = (anyComponent._bindingSet as Set<any>).size;
  //     const bindingMapSize = (anyComponent._bindingMap as Map<any, any>).size;
  //     // Only evaluate binding count if binding map is empty.  There seems to be a lower level issue occuring in
  //     //   UIComponent between prewarmed and non-prewarmed clients.  Prewarmed clients have a non-zero binding count
  //     //   and an empty binding map.  Non-prewarmed clients have a zero binding count and a populated binding map.
  //     if (bindingCount != resendBindingCount && bindingMapSize === 0) {
  //       component.sendNetworkBroadcastEvent(Events.fixUI, localPlayer, [serverPlayer]);
  //       logUIComponent(component as UIComponent);
  //       logToServer(component, `[${component.entity.name.get()}] Resending UI...`);
  //     }
  //   }, FIX_UI_DELAY);
  // }
}

export function logPlayersInWorld(name: string, world: World) {
  log.warn(`${name}  playersInWorld: ${world.getPlayers().map(player => {
    let name: string = "undefined";
    try {
      name = player?.name.get();
    } catch (e) { }
    return name;
  }).join(',')}`);
}

export function getTimeString(timeInSeconds: number, showMilliseconds: boolean = false) {

  let minutes = Math.max(0, Math.floor(timeInSeconds / 60));
  let seconds = Math.max(0, Math.floor(timeInSeconds % 60));

  let str = minutes.toString() + ":";
  if (seconds < 10) {
    str += "0";
  }
  str += seconds.toString();

  if (showMilliseconds) {
    let millisecond = Math.max(0, Math.floor((timeInSeconds * 1000) % 1000));
    str += ".";
    if (millisecond < 100) {
      str += "0";
    }
    if (millisecond < 10) {
      str += "0";
    }
    str += millisecond.toString();
  }
  return str;
}

export function getHexFrom01(value: number) {
  const mappedValue = Math.floor(255 * MathUtils.clamp01(value));
  return (mappedValue > 15 ? '' : '0') + mappedValue.toString(16);
}

export function getRGBHex(color: Color) {
  return '#' + getHexFrom01(color.r) + getHexFrom01(color.g) + getHexFrom01(color.b);
}

export function getRGBAHex(color: Color, alpha: number = 1.0) {
  return getRGBHex(color) + getHexFrom01(alpha);
}

export function ColorLerp(a: Color, b: Color, t: number) {
  return new Color(MathUtils.lerp(a.r, b.r, t), MathUtils.lerp(a.g, b.g, t), MathUtils.lerp(a.b, b.b, t));
}

export function raycast(rayGizmo: Entity, origin: Vec3, dir: Vec3, dist: number) {
  return rayGizmo.as(RaycastGizmo).raycast(origin, dir, { maxDistance: dist });
}

// Player Helpers
export function isServerPlayer(player: Player, world: World) {
  return player.id === world.getServerPlayer().id;
}

export function isRealPlayer(player: Player, world: World) {
  return !isServerPlayer(player, world);
}

export function playSFXForPlayer(player: Player, sfx: EntityOrUndefined, fade: number = 0) {
  playSFXForPlayers([player], sfx, fade);
}

export function pauseSFXForPlayer(player: Player, sfx: EntityOrUndefined, fade: number = 0) {
  pauseSFXForPlayers([player], sfx, fade);
}

export function stopSFXForPlayer(player: Player, sfx: EntityOrUndefined, fade: number = 0) {
  stopSFXForPlayers([player], sfx, fade);
}

export function playSFXForPlayers(players: Player[], sfx: EntityOrUndefined, fade: number = 0) {
  if (exists(sfx)) {
    sfx!.as(AudioGizmo).play({ fade: fade, players: players })
  }
}

export function pauseSFXForPlayers(players: Player[], sfx: EntityOrUndefined, fade: number = 0) {
  if (exists(sfx)) {
    sfx!.as(AudioGizmo).pause({ fade: fade, players: players })
  }
}

export function stopSFXForPlayers(players: Player[], sfx: EntityOrUndefined, fade: number = 0) {
  if (exists(sfx)) {
    sfx!.as(AudioGizmo).stop({ fade: fade, players: players })
  }
}

export function playHapticsPulse(player: Player, rightHand: boolean, script: Component, pulses: number = 3, interval: number = .1, duration: number = 500, strength: HapticStrength = HapticStrength.Strong, sharpness: HapticSharpness = HapticSharpness.Coarse) {
  let pulseIndex = 0;
  const id = script.async.setInterval(() => {
    pulseIndex++;
    playHaptics(player, rightHand, duration, strength, sharpness);

    if (pulseIndex >= pulses) {
      script.async.clearTimeout(id);
    }
  }, interval * 1000)
  return id;
}

export function playHaptics(player: Player, rightHand: boolean, duration: number = 500, strength: HapticStrength = HapticStrength.Strong, sharpness: HapticSharpness = HapticSharpness.Coarse) {
  (rightHand ? player.rightHand : player.leftHand).playHaptics(duration, strength, sharpness);
}

export function getRightOfPlayer(player: Player) {
  const forward = player.forward.get();
  const up = player.up.get();
  return Vec3.cross(up, forward);
}

export function playersEqual(a: Player, b: Player): boolean {
  return a.id == b.id;
}

// Gizmo helpers
export function playFX(vfx: Entity, sfx: Entity) {
  playVFX(vfx);
  playSFX(sfx);
}

export function stopFX(vfx: Entity, sfx: Entity) {
  stopVFX(vfx);
  stopSFX(sfx);
}

export function playVFX(vfx: Entity) {
  if (exists(vfx)) {
    vfx.as(ParticleGizmo).play();
  }
}

export function playVFXForPlayer(vfx: Entity, player: Player) {
  if (exists(vfx)) {
    vfx.as(ParticleGizmo).play({ players: [player] });
  }
}

export function stopVFX(vfx: Entity) {
  if (exists(vfx)) {
    vfx.as(ParticleGizmo).stop();
  }
}

export function stopVFXForPlayer(vfx: Entity, player: Player) {
  if (exists(vfx)) {
    vfx.as(ParticleGizmo).stop({ players: [player] });
  }
}

export function playTrailVFX(trailVFX: Entity) {
  if (exists(trailVFX)) {
    trailVFX.as(TrailGizmo).play();
  }
}

export function stopTrailVFX(trailVFX: Entity) {
  if (exists(trailVFX)) {
    trailVFX.as(TrailGizmo).stop();
  }
}

export function playSFX(sfx: Entity, fade: number = 0) {
  if (exists(sfx)) {
    sfx.as(AudioGizmo).play();//{fade:fade});
  }
}

export function stopSFX(sfx: Entity, fade: number = 0) {
  if (exists(sfx)) {
    sfx.as(AudioGizmo).stop();//fade:fade});
  }
}

export function playFXAt(vfx: Entity, sfx: Entity, pos: Vec3, script: any) {
  playVFXAt(vfx, pos);
  playSFXAt(sfx, pos, script);
}

export function playVFXAt(vfx: EntityOrUndefined, pos: Vec3) {
  if (exists(vfx)) {
    vfx!.position.set(pos);
    vfx!.as(ParticleGizmo).play();
  }
}

export function playSFXAt(sfx: Entity, pos: Vec3, script: Component) {
  if (exists(sfx)) {
    sfx.position.set(pos);
    script.async.setTimeout(() => {
      sfx.as(AudioGizmo).play();
    }, 10);
  }
}

export function setPitch(sfx: Entity, pitch: number) {
  if (exists(sfx)) {
    sfx.as(AudioGizmo).pitch.set(pitch);
  }
}

export function setVolume(sfx: Entity, volume: number) {
  if (exists(sfx)) {
    sfx.as(AudioGizmo).volume.set(volume);
  }
}

export function setText(text: Entity, str: string) {
  if (exists(text)) {
    text.as(TextGizmo).text.set(str);
  }
}


export function launchProjectile(projectile: Entity, speed?: number) {
  if (exists(projectile)) {
    projectile.as(ProjectileLauncherGizmo).launchProjectile(speed);
  }
}

export function setTriggerEnabled(trigger: Entity, enabled: boolean) {
  if (exists(trigger)) {
    trigger.as(TriggerGizmo).enabled.set(enabled);
  }
}

// Entity Actions Helpers
export function getEntityName(obj: Entity) {
  if (exists(obj)) {
    return obj.name.get();
  }
  return 'invalid object';
}

export function playOneShotAnim(obj: Entity, doStop: boolean = true) {
  if (exists(obj)) {
    stopAnim(obj);
    playAnim(obj);
  }
}

export function playAnim(obj: Entity) {
  if (exists(obj)) {
    obj.as(AnimatedEntity).play();
  }
}

export function stopAnim(obj: Entity) {
  if (exists(obj)) {
    obj.as(AnimatedEntity).stop();
  }
}

export function attach(obj: Entity, player: Player, anchor: AttachablePlayerAnchor, posOffset?: Vec3, rotOffset?: Quaternion) {
  if (exists(obj)) {
    obj.as(AttachableEntity).detach();
    if (posOffset) {
      obj.as(AttachableEntity).socketAttachmentPosition.set(posOffset);
    }
    if (rotOffset) {
      obj.as(AttachableEntity).socketAttachmentRotation.set(rotOffset);
    }

    obj.as(AttachableEntity).attachToPlayer(player, anchor);
  }
}

export function detach(obj: Entity) {
  if (exists(obj)) {
    obj.as(AttachableEntity).detach();
  }
}

export function respawnPlayer(spawnPoint: Entity, player: Player) {
  if (exists(spawnPoint)) {
    spawnPoint.as(SpawnPointGizmo).teleportPlayer(player);
  }
}

export function forceGrab(obj: Entity, player: Player, hand: Handedness, allowRelease: boolean = true) {
  if (exists(obj)) {
    obj.as(GrabbableEntity).forceHold(player, hand, allowRelease);
  }
}

export function forceRelease(obj: Entity) {
  if (exists(obj)) {
    obj.as(GrabbableEntity).forceRelease();
  }
}

export function setPhysicsEnabled(obj: Entity, enabled: boolean) {
  if (exists(obj)) {
    obj.as(PhysicalEntity).locked.set(!enabled);
  }
}

export function applyForce(obj: Entity, force: Vec3, forceMode: PhysicsForceMode = PhysicsForceMode.Force) {
  if (exists(obj)) {
    obj.as(PhysicalEntity).applyForce(force, forceMode);
  }
}

export function zeroVelocity(obj: Entity) {
  if (exists(obj)) {
    obj.as(PhysicalEntity).zeroVelocity();
  }
}

// Entity state helpers
export function setVisible(obj: Entity, visible: boolean) {
  if (exists(obj)) {
    obj.visible.set(visible);
  }
}

export function setVisibilityForPlayers(obj: Entity, players: Player[], visibleTo: boolean = true) {
  if (exists(obj)) {
    obj.setVisibilityForPlayers(players, visibleTo ? PlayerVisibilityMode.VisibleTo : PlayerVisibilityMode.HiddenFrom);
  }
}

export function setCollidable(obj: Entity, collision: boolean) {
  if (exists(obj)) {
    obj.collidable.set(collision);
    // log.info("GU:", obj.name.get(), collision)
  }
}

export function setVisibilityAndCollidable(obj: Entity, bool: boolean) {
  setVisible(obj, bool);
  setCollidable(obj, bool);
}

export function setLocalPos(obj: Entity, localPos: Vec3) {
  if (exists(obj)) {
    obj.transform.localPosition.set(localPos);
  }
}

export function setLocalRot(obj: Entity, localRot: Quaternion) {
  if (exists(obj)) {
    obj.transform.localRotation.set(localRot);
  }
}

export function setLocalScale(obj: Entity, localScale: Vec3) {
  if (exists(obj)) {
    obj.transform.localScale.set(localScale);
  }
}

export function setLocalPosRot(obj: Entity, localPos: Vec3, localRot: Quaternion) {
  if (exists(obj)) {
    obj.transform.localPosition.set(localPos);
    obj.transform.localRotation.set(localRot);
  }
}

export function setLocalPosRotScale(obj: Entity, localPos: Vec3, localRot: Quaternion, localScale: Vec3) {
  if (exists(obj)) {
    obj.transform.localPosition.set(localPos);
    obj.transform.localRotation.set(localRot);
    obj.transform.localScale.set(localScale);
  }
}

/*
export function exists(obj:Entity):boolean {
  return obj && obj.exists();
}
*/

const cachedExistStates = new Map<bigint, boolean>();

export function exists(obj: Entity | undefined): boolean {
  if (!obj) return false

  if (cachedExistStates.has(obj.id)) {
    return cachedExistStates.get(obj.id)!;
  }
  const exists = obj.exists();
  cachedExistStates.set(obj.id, exists);
  return exists;
}

export function entitiesEqual(a: Entity, b: Entity): boolean {
  const aExists = exists(a);
  const bExists = exists(b);

  if (aExists != bExists) {
    return false; // one exists and the other doesn't
  }

  if (!aExists && !bExists) {
    return true; // both don't exist
  }

  return a.id == b.id; // both exist so compare ids
}

export function isOwnedByServerPlayer(component: Component) {
  return playersEqual(component.entity.owner.get(), component.world.getServerPlayer());
}

export function isOwnedByPlayer(component: Component) {
  return !isOwnedByServerPlayer(component);
}

// Common Helpers
export function getRandom<T>(array: T[]) {
  return array[MathUtils.clamp(Math.floor(Math.random() * array.length), 0, array.length - 1)];
}

/**
 * Retrieves a random element from an array, excluding specified indices.
 *
 * @template T - The type of elements in the array.
 * @param {T[]} array - The array from which to retrieve a random element.
 * @param {number[]} exclude - An array of indices to exclude from selection.
 * @returns {{ index: number, value: T } | undefined} An object containing the index and value of the randomly selected element, or undefined if no valid element is found.
 *
 * This function first creates a list of available indices by filtering out the indices specified in the `exclude` array.
 * If there are any available indices, it selects a random index from this list and returns the corresponding element from the array along with its index.
 * If no indices are available, it returns undefined.
 */
export function getRandomExcludingIndices<T>(array: T[], exclude: number[]): { index: number, value: T } | undefined {
  const availableIndices = array
    .map((_, index) => index)
    .filter(index => !exclude.includes(index));

  if (availableIndices.length > 0) {
    const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    return {
      index: randomIndex,
      value: array[randomIndex]
    };
  } else {
    // None available
    return undefined;
  }
}

export function wait(component: Component, ms: number) {
  return new Promise(resolve => {
    component.async.setTimeout(() => resolve(true), ms);
  });
}

const CATCH_PLAYER_VARIABLE_EXCEPTIONS = true;

export function getPlayerVariableSafe<T extends PersistentSerializableState = number>(world: World, player: Player, key: string): T extends number ? T : T | null {
  if (!PlayerService.isConnected(player)) {
    log.info(`Player ${player.id} is not connected, returning null for player variable ${key}`);
    return null as T extends number ? T : T | null
  }
  if (!CATCH_PLAYER_VARIABLE_EXCEPTIONS) {
    return world.persistentStorage.getPlayerVariable(player, key);
  }
  let result: any = null;
  try {
    result = world.persistentStorage.getPlayerVariable(player, key);
  } catch (e) {
    log.error(`Error retrieving player variable ${key} for player ${player.id}: ${e}`);
  }
  return result as T extends number ? T : T | null;
}

export function setPlayerVariableSafe<T extends PersistentSerializableState>(world: World, player: Player, key: string, value: T): void {
  if (!PlayerService.isConnected(player)) {
    log.info(`Player ${player.id} is not connected, cannot set player variable ${key}`);
    return;
  }
  if (!CATCH_PLAYER_VARIABLE_EXCEPTIONS) {
    world.persistentStorage.setPlayerVariable(player, key, value);
  }
  try {
    world.persistentStorage.setPlayerVariable(player, key, value);
  } catch (e) {
    log.error(`Error setting player variable ${key} for player ${player.id}: ${e}`);
  }
}

// Entity List
export class EntityList {
  list: Entity[] = [];

  addIfExists(e: Entity) {
    if (exists(e)) {
      this.add(e);
    }
  }

  add(e: Entity) {
    if (!this.includes(e)) {
      this.list.push(e);
    }
  }

  includes(e: Entity) {
    return this.indexOf(e) >= 0;
  }

  indexOf(e: Entity) {
    for (let i = 0; i < this.list.length; ++i) {
      if (entitiesEqual(this.list[i], e)) {
        return i;
      }
    }
    return -1;
  }

  remove(e: Entity) {
    const i = this.indexOf(e);
    //log.info(i.toString());
    if (i >= 0) {
      this.list.splice(i, 1);
    }
  }
}

// Player List
export class PlayerList {
  list: Player[] = [];

  add(p: Player) {
    if (!this.includes(p)) {
      this.list.push(p);
    }
  }

  includes(p: Player) {
    return this.indexOf(p) >= 0;
  }

  indexOf(p: Player) {
    for (let i = 0; i < this.list.length; ++i) {
      if (playersEqual(this.list[i], p)) {
        return i;
      }
    }

    return -1;
  }

  remove(p: Player) {
    const i = this.indexOf(p);
    if (i >= 0) {
      this.list.splice(i, 1);
    }
  }
}

export function componentArrayIndexOf<T extends Component>(list: T[], item: T) {
  for (let i = 0; i < list.length; ++i) {
    if (list[i].entity.id == item.entity.id) {
      return i;
    }
  }
  return -1;
}

export class Pool<T> {
  all: T[] = [];
  available: T[] = [];
  active: T[] = [];

  hasAvailable(): boolean {
    return this.available.length > 0;
  }
  hasActive(): boolean {
    return this.active.length > 0;
  }

  isAvailable(t: T): boolean {
    return this.available.includes(t);
  }

  getNextAvailable(): T | null {
    if (this.hasAvailable()) {
      const available = this.available.shift()!;
      if (!this.active.includes(available)) {
        this.active.push(available);
      }
      return available;
    } else {
      return null;
    }
  }

  getRandomAvailable(): T | null {
    if (this.hasAvailable()) {
      const rand = Math.floor(Math.random() * this.available.length);
      const available = this.available.splice(rand, 1)[0]!;
      if (!this.active.includes(available)) {
        this.active.push(available);
      }
      return available;
    } else {
      return null;
    }
  }

  getRandomActive(): T | null {
    if (this.hasActive()) {
      const rand = Math.floor(Math.random() * this.active.length);
      const active = this.active.splice(rand, 1)[0]!;
      return active;
    } else {
      return null;
    }
  }

  addToPool(t: T): void {
    if (!this.all.includes(t)) {
      this.all.push(t);
    }

    if (!this.available.includes(t)) {
      this.available.push(t);
    }

    if (this.active.includes(t)) {
      this.active.splice(this.active.indexOf(t), 1);
    }
  }

  removeFromPool(t: T): void {
    if (this.active.includes(t)) {
      this.active.splice(this.active.indexOf(t), 1);
    }

    if (this.available.includes(t)) {
      this.available.splice(this.available.indexOf(t), 1);
    }

    if (this.all.includes(t)) {
      this.all.splice(this.all.indexOf(t), 1);
    }
  }

  resetAvailability(): void {
    this.available = this.all.slice();
  }
}

// Pool Class
export class ComponentPool<T extends Component> {
  all: T[] = [];
  available: T[] = [];
  active: T[] = [];

  hasAvailable() {
    return this.available.length > 0;
  }

  getNextAvailable() {
    if (this.hasAvailable()) {
      const available = this.available.shift()!;
      if (!this.active.includes(available)) {
        this.active.push(available);
      }
      return available;
    }
  }

  getRandomAvailable() {
    if (this.hasAvailable()) {
      const rand = Math.floor(Math.random() * this.available.length);
      const available = this.available.splice(rand, 1)[0]!;
      if (!this.active.includes(available)) {
        this.active.push(available);
      }
      return available;
    }
  }

  addToPool(t: T) {
    // if (!this.all.includes(t)) {
    //   this.all.push(t);
    // }
    if (componentArrayIndexOf<T>(this.all, t) < 0) {
      this.all.push(t);
    }

    // if (!this.available.includes(t)) {
    //   this.available.push(t);
    // }
    if (componentArrayIndexOf<T>(this.available, t) < 0) {
      this.available.push(t);
    }

    // if (this.active.includes(t)) {
    //   this.active.splice(this.active.indexOf(t), 1);
    // }
    let activeIndex = componentArrayIndexOf<T>(this.active, t);
    if (activeIndex >= 0) {
      this.active.splice(activeIndex, 1);
    }
  }

  resetAvailability(t?: T) {
    if (t) {
      this.available.push(t);
      return;
    }
    this.available = this.all.slice();
  }
}

// PlayerObjPool Class
export interface IPlayerOwnedObj {
  owner: Player;
  ownerIsPlayer: boolean;

  setOwner(player: Player): void;
}

export function PlayerObjShouldAcceptBroadcast(obj: IPlayerOwnedObj, broadcastTarget: Player) {
  return obj.ownerIsPlayer && obj.owner === broadcastTarget;
}

export interface IState {
  onEnterState(): void;

  onExitState(): void;

  onUpdateState(deltaTime: number): IState
}

// ConditionalVisibilityEntity

export class ConditionalVisibilityObj {
  parent: Component;
  target!: Entity;
  condition?: (p: Player) => boolean;


  constructor(parent: Component) {
    this.parent = parent;
  }

  init(target: Entity, condition: (p: Player) => boolean) {
    this.target = target;
    this.condition = condition;
  }

  updateVisuals() {
    if (!exists(this.target)) {
      return;
    }
    this.parent.async.setTimeout(() => {
      const players = this.parent.world.getPlayers();
      if (players.length <= 0) {
        return;
      }

      const visibleToList: Player[] = [];


      players.forEach((player) => {
        if (this.condition && this.condition(player)) {
          visibleToList.push(player);
        }
      });

      setVisibilityForPlayers(this.target, visibleToList);
    }, 500);
  }
}

export class Timer {
  private endTime: number = 0;

  constructor(duration: number) {
    this.SetTime(duration);
  }

  public SetTime(duration: number) {
    this.endTime = Date.now() + duration * 1000;
  }

  public Complete(): boolean {
    return this.endTime < Date.now();
  }

  public TimeRemaining(): number {
    return Math.max(0, (this.endTime - Date.now()) * 0.001)
  }
}

export class ProprtionalTimer {
  private timer: Timer = new Timer(0);
  private reciprocal: number = 1;

  constructor(duration: number) {
    this.SetTime(duration);
  }

  public SetTime(duration: number) {
    this.timer.SetTime(duration);
    this.reciprocal = (duration != 0) ? 1 / duration : 0;
  }

  public Complete(): boolean {
    return this.timer.Complete();
  }

  public TimeRemaining(): number {
    return this.timer.TimeRemaining();
  }

  /**
  * 0-1 value synced to the timer's set time that starts at 1 and ends at 0
  */
  public TimeRemaining01(): number {
    return this.timer.TimeRemaining() * this.reciprocal;
  }
}

export class OverTime {
  constructor(private readonly owner: Component) { }

  readonly moveTo = this.fn('position', 'to');
  readonly moveBy = this.fn('position', 'by');
  readonly rotateTo = this.fn('rotation', 'to');
  readonly rotateBy = this.fn('rotation', 'by');
  readonly scaleTo = this.fn('scale', 'to');
  readonly scaleBy = this.fn('scale', 'by');
  // TODO: Add generic lerp option for lerping between [x, y] over time

  readonly moveToAsync = this.fnPromise('position', 'to');
  readonly moveByAsync = this.fnPromise('position', 'by');
  readonly rotateToAsync = this.fnPromise('rotation', 'to');
  readonly rotateByAsync = this.fnPromise('rotation', 'by');
  readonly scaleToAsync = this.fnPromise('scale', 'to');
  readonly scaleByAsync = this.fnPromise('scale', 'by');

  cancelMovement(entity: Entity, options?: { applyTargetValues: boolean }) {
    const data = this.interpolations.get(entity)
    if (data) {
      for (const key of ['position', 'scale', 'rotation'] as const) {
        const entry = data.targets[key]
        if (entry) {
          entry.callbacks?.onComplete?.({ wasCanceled: true })
          if (options?.applyTargetValues) {
            if (key === 'rotation') {
              entity[key].set(entry.value as Quaternion)
            } else {
              entity[key].set(entry.value as Vec3)
            }
          }
          delete data.targets[key]
        }
      }
      if (Object.keys(data.targets).length === 0) {
        data.unsubscribe()
        this.interpolations.delete(entity)
      }
    }
  }

  private computeTarget<K extends keyof TransformTargets>(k: K, entity: Entity, value: NonNullable<TransformTargets[K]>['value'], mode: 'to' | 'by') {
    if (mode === 'to') {
      return value
    } else {
      const current = entity[k].get()
      if (k === 'rotation') {
        return (current as Quaternion).mul(value as Quaternion)
      } else {
        return (current as Vec3).add(value as Vec3)
      }
    }
  }

  private fn<K extends keyof TransformTargets>(key: K, mode: 'to' | 'by') {
    return (
      entity: Entity,
      value: NonNullable<TransformTargets[K]>['value'],
      durationSec: number,
      callbacks?: {
        onComplete?: (info: { wasCanceled: boolean }) => void,
        /**
         * Time Fraction is the [0, 1] progress of the function
         */
        onTick?: (timeFrac: number) => void,
      }
    ) => {
      const endTime = Date.now() + durationSec * 1000
      const entry = { value, mode, endTime, appliedFrac: 0, callbacks, canTick: false } as NonNullable<
        TransformTargets[K]
      >
      return this.registerOverTimeAction<K>(entity, key, entry)
    }
  }

  private fnPromise<K extends keyof TransformTargets>(key: K, mode: 'to' | 'by') {
    const f = this.fn(key, mode)
    return (
      entity: Entity,
      value: NonNullable<TransformTargets[K]>['value'],
      durationSec: number,
      callbacks?: {
        onTick?: (timeFrac: number) => void,
      }
    ) => {
      return new Promise<{ wasCanceled: boolean }>((resolve) => {
        f(entity, value, durationSec, {
          ...callbacks,
          onComplete: resolve,
        })
      })
    }
  }

  private interpolations = new WeakMap<
    Entity,
    { targets: TransformTargets; unsubscribe: () => void }
  >();

  private registerOverTimeAction<K extends keyof TransformTargets>(
    entity: Entity,
    key: K,
    entry: NonNullable<TransformTargets[K]>,
  ) {
    let data = this.interpolations.get(entity)
    if (!data) {
      data = {
        targets: {},
        unsubscribe: this.owner.connectLocalBroadcastEvent(
          World.onUpdate,
          ({ deltaTime }) => this.tick(entity, deltaTime),
        ).disconnect,
      }
      this.interpolations.set(entity, data)
    } else {
      data.targets[key]?.callbacks?.onComplete?.({ wasCanceled: true })
    }
    data.targets[key] = entry
  }

  private tick(entity: Entity, deltaTime: number) {
    const data = this.interpolations.get(entity)
    if (data) {
      const now = Date.now()

      for (const key of ['position', 'scale', 'rotation'] as const) {
        const entry = data.targets[key]

        if (!entity.exists()) {
          data.targets[key]?.callbacks?.onComplete?.({ wasCanceled: true })
          delete data.targets[key]
        } else if (entry) {
          if (entry.canTick) {
            const { value, endTime, mode, appliedFrac } = entry
            const current = entity[key].get()

            const fracOfRemainingTime = now >= endTime ? 1 : Math.min(1, (deltaTime * 1000) / (endTime - now))
            const dt = fracOfRemainingTime * (1 - appliedFrac)
            entry.appliedFrac = now >= endTime ? 1 : Math.min(1, Math.max(0, appliedFrac + dt))

            if (key === 'rotation') {
              if (mode === 'to') {
                entity[key].set(
                  Quaternion.slerp(
                    current as Quaternion,
                    value as Quaternion,
                    fracOfRemainingTime
                  )
                )
              } else {
                const step = Quaternion.slerp(
                  Quaternion.one,
                  value as Quaternion,
                  dt
                )
                entity[key].set(step.mul(current as Quaternion))
              }
            } else {
              if (mode === 'to') {
                entity[key].set(
                  Vec3.lerp(current as Vec3, value as Vec3, fracOfRemainingTime)
                )
              } else {
                const step = (value as Vec3).mul(dt)
                entity[key].set((current as Vec3).add(step))
              }
            }

            data.targets[key]?.callbacks?.onTick?.(entry.appliedFrac)

            if (fracOfRemainingTime >= 1 || entry.appliedFrac >= 1) {
              data.targets[key]?.callbacks?.onComplete?.({ wasCanceled: false })
              delete data.targets[key]
            }
          } else {
            entry.canTick = true
          }
        }
      }

      if (Object.keys(data.targets).length === 0) {
        data.unsubscribe()
        this.interpolations.delete(entity)
      }
    }
  }
}

type TransformTarget<T> = {
  value: T
  endTime: number
  appliedFrac: number
  mode: 'to' | 'by'
  callbacks?: {
    onComplete?: (info: { wasCanceled: boolean }) => void,
    onTick?: (timeFrac: number) => void,
  },
  canTick: boolean,
}

type TransformTargets = {
  position?: TransformTarget<Vec3>
  scale?: TransformTarget<Vec3>
  rotation?: TransformTarget<Quaternion>
}
