/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Events, ItemSelectedPayload } from 'Events';
import { AssetSpawnLog } from 'GlobalLoggers';
import * as hz from 'horizon/core';
import { Entity, Player, Quaternion, SpawnController, Vec3 } from 'horizon/core';
import { ItemContainer } from 'ItemContainer';
import { ItemData } from 'ItemData';
import { ItemMutation } from 'ItemMutation';
import { ItemModifiers } from 'ItemUtils';
import { Logger } from 'Logger';
import { clamp01, lerp } from 'MathUtils';
import { MutationData } from 'MutationData';
import { PlayerService } from 'PlayerService';

const log = new Logger("ItemSpawnManager");

const ASSET_COUNT_MAX: number = 500; // This value is used here as a safeguard for the maximum number of permitted assets to be loaded in SpawnControllers. You can change it to another value if preferred.

const BOUNCE_ITEMS = true;
const BOUNCE_TIME = 3000;
const SCALE_DECREASE_SPEED = 1;
const BOUNCE_VELOCITY_RANGE = [7, 10];
const BOUNCE_ANGULAR_VELOCITY_RANGE = [1, 20];
const ITEM_PLUCK_ANGLE_RANGE = 20;
const PLUCK_HEIGHT = .5;
const COLLISION_DELAY = 800;

const USE_SPAWN_CONTROLLERS = false;

type BouncingItem = {
  entity: Entity,
  scale: number,
  initialScale: Vec3,
  finishTime: number,
  poolData: SpawnControllerPoolData,
  player: Player,
}

export class SpawnControllerPoolData {
  itemSpawnController?: SpawnController;
  itemData: ItemData;
  playerToItemMap: Map<Player, Entity> = new Map<Player, Entity>();
  playerToMutationMap: Map<Player, Entity> = new Map<Player, Entity>();
  asset?: hz.Asset;

  private manager: ItemSpawnManager;

  // Configs for minigame
  private readonly itemStartOffsetY: number = 0; // How much it should be offset from the surface as a buffer

  constructor(itemData: ItemData, manager: ItemSpawnManager) {
    this.itemData = itemData;
    this.asset = itemData.getGrabbableAsset();
    if (this.asset !== undefined && USE_SPAWN_CONTROLLERS) {
      const controller = new SpawnController(this.asset, Vec3.zero, Quaternion.zero, Vec3.one);
      controller.load().then(() => this.itemSpawnController = controller);
    }
    this.manager = manager;
  }

  async despawn(player: Player) {
    this.despawnMutation(player);
    const entity = this.playerToItemMap.get(player);
    if (entity === undefined) {
      return;
    }
    log.info(`SpawnController: despawning ${this.itemData.id} - player ${player.id}`);
    this.playerToItemMap.delete(player);
    this.manager.world.deleteAsset(entity);
  }

  private async despawnMutation(player: hz.Player) {
    const entity = this.playerToMutationMap.get(player);
    if (entity === undefined) {
      return;
    }
    log.info(`SpawnController: despawning mutation - player ${player.id}`);
    this.playerToMutationMap.delete(player);
    this.manager.world.deleteAsset(entity);
  }

  spawnForDigging(payload: ItemSelectedPayload) {
    const player = payload.player;
    const position = payload.location;
    const rotation = Quaternion.lookRotation(Vec3.forward, Vec3.up);
    const weight = payload.weight;
    const mutation = payload.mutation;

    this.spawn(player, mutation, (obj) => this.placeAfterSpawning(player, position, rotation, weight));
  }

  async spawn(player: Player, mutation: string, onSpawn?: (entity: hz.Entity) => void): Promise<hz.Entity | undefined> {
    if (this.playerToItemMap.has(player)) {
      log.info('SpawnController: player already has an asset spawned');
      return;
    }
    this.spawnMutation(player, mutation);

    /*
      Following call spawns in the entity obj, which has already been loaded into memory.
      spawnError and spawnState are enums. You can check the different enums in the code:
        hz.SpawnError.None,
        hz.SpawnError.ExceedsCapacity,
        hz.SpawnError.Cancelled,
        hz.SpawnError.InvalidAsset,
        hz.SpawnError.UnauthorizedContent,
        hz.SpawnError.InvalidParams,
        hz.SpawnError.Unknown
      then/catch blocks are used to gate actions on success (then) and to log spawn errors (catch).
    */
    log.info(`Spawning item: ${this.itemData.name}`);
    let spawnedObject: hz.Entity | undefined = undefined;
    if (USE_SPAWN_CONTROLLERS) {
      await this.itemSpawnController!.spawn().catch(() => {
        log.error("SpawnController: Error spawning object " + this.itemData.id + "! Error code: " + hz.SpawnError[this.itemSpawnController?.spawnError.get() ?? hz.SpawnError.Unknown]);
        return;
      });
      log.info("SpawnController: object " + this.itemData.id + " spawned with state: " + hz.SpawnState[this.itemSpawnController!.currentState.get()]);
      const rootEntities = this.itemSpawnController!.rootEntities.get();
      spawnedObject = rootEntities[rootEntities.length - 1];
    } else if (this.asset) {
      AssetSpawnLog.info("Spawn Asset: " + this.itemData.name);
      spawnedObject = (await this.manager.world.spawnAsset(this.asset, new Vec3(0, -50, 0)))[0];
    }
    if (spawnedObject === undefined) {
      log.error(`SpawnController: Error spawning object ${this.itemData.id}!`);
      return;
    }
    const existingItem = this.playerToItemMap.get(player);
    if (existingItem) {
      this.manager.world.deleteAsset(existingItem);
    }
    this.playerToItemMap.set(player, spawnedObject); // Keep track of player to item entity
    this.setupMutation(player, mutation);
    onSpawn?.(spawnedObject);
    return spawnedObject;
  }

  async spawnMutation(player: Player, mutation: string) {
    if (mutation === "") {
      return;
    }
    let spawnedMutation: hz.Entity | undefined = undefined;
    if (USE_SPAWN_CONTROLLERS) {
      const controller = this.manager.mutationSpawnControllerMap?.get(mutation);
      if (controller === undefined) {
        log.warn(`SpawnController: Couldn't find mutation controller for ${mutation}`);
        return;
      }
      log.info(`Spawning mutation: ${mutation}`);
      await controller?.spawn().catch(() => {
        if (controller != null) {
          log.error("SpawnController: Error spawning mutation effect " + mutation + "! Error code: " + hz.SpawnError[controller.spawnError.get()]);
        }
      });
      log.info("SpawnController: mutation effect " + mutation + " spawned with state: " + hz.SpawnState[controller.currentState.get()]);
      const rootEntities = controller?.rootEntities.get();
      spawnedMutation = rootEntities[rootEntities.length - 1];
    } else if (this.asset) {
      const mutationEffect = ItemContainer.localInstance?.getMutationDataForId(mutation)?.getEffectAsset();
      if (mutationEffect !== undefined) {
        AssetSpawnLog.info("Spawn Asset (mutation): " + mutation);
        spawnedMutation = (await this.manager.world.spawnAsset(mutationEffect, Vec3.zero))[0];
      }
    }
    if (spawnedMutation === undefined) {
      log.error(`SpawnController: Error spawning mutation effect ${mutation}!`);
      return;
    }
    const existingMutation = this.playerToMutationMap.get(player);
    if (existingMutation !== undefined) {
      this.manager.world.deleteAsset(existingMutation);
    }
    this.playerToMutationMap.set(player, spawnedMutation); // Keep track of player to spawn controller
    this.setupMutation(player, mutation);
  }

  placeAfterSpawning(player: Player, position: hz.Vec3, rotation: hz.Quaternion, weight: number) {
    let itemEntity = this.playerToItemMap.get(player);
    if (itemEntity === undefined) {
      log.info('SpawnController: player has no asset to place');
      return;
    }
    log.info(`ItemContainer: Placing ${this.itemData.name} item for player ${player.id}.`);
    const height = this.getHeight(itemEntity, weight);
    const y = position.y + this.itemStartOffsetY - height * .5;
    let newPos = new Vec3(position.x, y, position.z);
    itemEntity.position.set(newPos);
    itemEntity.rotation.set(Quaternion.lookRotation(Vec3.forward, Vec3.up)); // TODO(kaden): Face to the player for optimal reveal

    itemEntity.visible.set(false);

    let modifiers: ItemModifiers = new ItemModifiers();
    modifiers.weight = weight;

    // Scale the item based on the weight
    let weightMult = ItemSpawnManager.getWeightBasedScaleMultiplier(weight);
    log.info(`ItemContainer: Weight of ${this.itemData.name}: ${weight} Scale Mult: ${weightMult}.`);
    itemEntity.scale.set(new Vec3(weightMult, weightMult, weightMult));
  }

  private getHeight(itemEntity: hz.Entity, weight: number): number {
    let mesh = itemEntity.children.get()[0]; // items have their mesh as a child
    if (!mesh){
      mesh = itemEntity // default to the item itself if there's no child
    }
    const weightMult = ItemSpawnManager.getWeightBasedScaleMultiplier(weight);
    return mesh.getRenderBounds().size().y * weightMult;
  }

  private setupMutation(player: hz.Player, mutation: string) {
    const itemEntity = this.playerToItemMap.get(player);
    if (itemEntity === undefined) {
      return;
    }
    const mutationEntity = this.playerToMutationMap.get(player);
    if (mutationEntity === undefined) {
      return;
    }
    const mutationData = ItemContainer.localInstance?.getMutationDataForId(mutation);
    if (mutationData === undefined) {
      return;
    }
    const itemMutation = mutationEntity.getComponents<ItemMutation>()[0];
    if (itemMutation === undefined) {
      log.error("Couldn't find ItemMutation component on entity " + mutationEntity.name.get());
      return;
    }
    itemMutation.setup(itemEntity, mutationData);
  }

  async equip(player: Player, weight: number, mutation: string) {
    log.info(`SpawnController: equipping item `)
    let entity: hz.Entity | undefined;
    entity = this.playerToItemMap.get(player);
    if (entity === undefined) {
      entity = await this.spawn(player, mutation);
    }
    log.info(`SpawnController: equipping item entity : ${entity}`)

    if (entity === undefined) {
      return;
    }

    const weightMult = ItemSpawnManager.getWeightBasedScaleMultiplier(weight);
    entity.scale.set(new hz.Vec3(1 * weightMult, 1 * weightMult, 1 * weightMult));

    entity.visible.set(true);

    let grabbable = entity.as(hz.GrabbableEntity);

    log.info(`SpawnController: equipping item grabbable : ${grabbable}`)
    grabbable?.forceHold(player!, hz.Handedness.Right, false)
  }
}

class ItemSpawnManager extends hz.Component<typeof ItemSpawnManager> {
  static propsDefinition = {};

  itemIdToSpawnControllerPool: Map<string, SpawnControllerPoolData> = new Map<string, SpawnControllerPoolData>(); // Array of SpawnControllerPoolData objects
  mutationSpawnControllerMap?: Map<string, hz.SpawnController> = new Map<string, hz.SpawnController>();
  mutationAssetMap?: Map<string, hz.Asset> = new Map<string, hz.Asset>();

  private bouncingItems: BouncingItem[] = [];
  private playerToEquipIdMap = new Map<Player, string>();

  start() {

    // Would prefer to do all of this in preStart (as it's recommended in the tutorial) but
    // cannot call getComponent in preStart.
    if (ItemContainer.localInstance === undefined) {
      this.connectLocalBroadcastEvent(ItemContainer.itemDataLoadComplete, (payload) => {
        this.initCatalogData();
      });
    } else {
      this.initCatalogData();
    }

    // listener for the trigger event sent when the player enters the spawning trigger volume. When triggered, spawn assets.
    this.connectNetworkBroadcastEvent(Events.itemSelected, (payload) => {
      // Do we need to despawn other items? Currently no because you will only have the shovel
      log.info(`SpawnController: itemSelected event received for ${payload.itemId} for player ${payload.player.id}`);
      this.itemIdToSpawnControllerPool.get(payload.itemId)!.spawnForDigging(payload);
    });

    this.connectNetworkBroadcastEvent(Events.playerDigProgress, (data: { player: Player, progress01: number, itemId: string }) => {
      log.info(`SpawnController: playerDigProgress event received for ${data.itemId}`);
    });

    this.connectNetworkBroadcastEvent(Events.playerDigComplete, (data: { player: Player, isSuccess: boolean, itemId: string }) => {
      this.onDigComplete(data.player, data.isSuccess, data.itemId);
    });

    this.connectLocalBroadcastEvent(Events.itemSelectedForEquip, (data: { player: Player, itemId: string, weight: number, mutation: string }) => {
      const equippedId = this.playerToEquipIdMap.get(data.player);
      if (equippedId !== undefined && equippedId !== "") {
        this.itemIdToSpawnControllerPool.get(equippedId)?.despawn(data.player);
      }
      this.itemIdToSpawnControllerPool.get(data.itemId)?.equip(data.player, data.weight, data.mutation);
      this.playerToEquipIdMap.set(data.player, data.itemId);
    });

    this.connectLocalBroadcastEvent(Events.itemUnequip, (data: { player: Player, itemId: string }) => {
      this.itemIdToSpawnControllerPool.get(data.itemId)!.despawn(data.player);
      const equippedId = this.playerToEquipIdMap.get(data.player);
      if (equippedId === data.itemId) {
        this.playerToEquipIdMap.delete(data.player);
      }
    });

    PlayerService.connectPlayerExitWorld(
      this,
      (player: Player) => {
        if (player) {
          const equippedId = this.playerToEquipIdMap.get(player) ?? "";
          if (equippedId !== "") {
            this.itemIdToSpawnControllerPool.get(equippedId)?.despawn(player);
          }
        }
      }
    );

    this.connectLocalBroadcastEvent(hz.World.onUpdate, payload => this.update(payload.deltaTime));

    // this.connectNetworkBroadcastEvent(Events.debugAction1, player => {
    //   const itemID = "binoculars001";
    //   const up = .5;
    //   const forward = .5;
    //   const spawnPosition = PlayerService.GetPlayerFootPosition(player).add(Vec3.up.mul(up));
    //   spawnPosition.addInPlace(player.forward.get().mul(forward));
    //   this.itemIdToSpawnControllerPool.get(itemID)!.spawnForDigging(player.id, spawnPosition, Quaternion.lookRotation(Vec3.forward, Vec3.up), 1, false);
    //   this.async.setTimeout(() => {
    //     this.onDigComplete(player, true, itemID);
    //   }, 1000);
    // });
  }

  private update(deltaTime: number) {
    for (let i = 0; i < this.bouncingItems.length;) {
      const bouncingItem = this.bouncingItems[i];
      const isFinished = this.updateBouncingItem(bouncingItem, deltaTime);
      if (isFinished) {
        bouncingItem.poolData.despawn(bouncingItem.player);
        this.bouncingItems.splice(i, 1);
        log.info(`Finished bouncing item ${bouncingItem.entity.name.get()}`);
      } else {
        ++i;
      }
    }
  }

  private onDigComplete(player: hz.Player, isSuccess: boolean, itemId: string) {
    log.info(`Dig complete for player ${player.id}.`);
    const item = this.itemIdToSpawnControllerPool.get(itemId);
    if (item === undefined) {
      return;
    }

    if (BOUNCE_ITEMS && isSuccess) {
      const playerItem = item.playerToItemMap.get(player);
      if (playerItem !== undefined) {
        this.bounceItem(item, playerItem, player);
        log.info(`Bouncing item ${item.itemData.name} for player ${player.id}.`);
        return;
      }
    }
    log.info(`NO BOUNCE - Despawning item for player ${player.id}.`);
    item.despawn(player);
  }

  private bounceItem(poolData: SpawnControllerPoolData, item: hz.Entity, player: hz.Player) {
    log.info(`Bouncing item ${poolData.itemData.name} for player ${player.id}.`);
    const position = item.position.get();
    item.visible.set(true);
    item.position.set(position.add(new Vec3(0, PLUCK_HEIGHT, 0)));
    const initialScale = item.scale.get();
    let velocity: Vec3 = Vec3.zero;
    let angularVelocityEuler: Vec3 = Vec3.zero;
    const finishTime = Date.now() + BOUNCE_TIME;
    this.getBounceVelocities(velocity, angularVelocityEuler);
    item.interactionMode.set(hz.EntityInteractionMode.Physics);
    item.collidable.set(false);
    this.async.setTimeout(() => {
      item.collidable.set(true);
    }, COLLISION_DELAY);
    this.async.setTimeout(() => {
      const physicalItem = item.as(hz.PhysicalEntity);
      physicalItem.applyForce(velocity, hz.PhysicsForceMode.VelocityChange);
      physicalItem.applyTorque(angularVelocityEuler);
      log.info(`Applying velocity ${velocity} to ${item.name.get()}`);
    }, 50);
    this.bouncingItems.push({
      entity: item,
      scale: 1,
      initialScale,
      finishTime,
      poolData,
      player
    });
  }

  private getBounceVelocities(velocity: Vec3, angularVelocity: Vec3) {
    const velocityMagnitude = BOUNCE_VELOCITY_RANGE[0] + Math.random() * (BOUNCE_VELOCITY_RANGE[1] - BOUNCE_VELOCITY_RANGE[0]);
    const velocityAngle = Math.random() * ITEM_PLUCK_ANGLE_RANGE;
    const randomYaw = Math.random() * 360;
    const velocityDirection = Quaternion.mulVec3(Quaternion.fromEuler(new Vec3(velocityAngle, randomYaw, 0), hz.EulerOrder.ZXY), Vec3.up);
    velocity.copy(velocityDirection.mulInPlace(velocityMagnitude));
    angularVelocity.copy(new Vec3(
      this.getRandomAngularVelocityMagniturde(),
      this.getRandomAngularVelocityMagniturde(),
      this.getRandomAngularVelocityMagniturde()
    ));
  }

  private getRandomAngularVelocityMagniturde(): number {
    const sign = Math.random() < 0.5 ? -1 : 1;
    return sign * (BOUNCE_ANGULAR_VELOCITY_RANGE[0] + Math.random() * (BOUNCE_ANGULAR_VELOCITY_RANGE[1] - BOUNCE_ANGULAR_VELOCITY_RANGE[0]));
  }

  private updateBouncingItem(item: BouncingItem, deltaTime: number) {
    if (item.finishTime <= Date.now()) {
      item.scale = Math.max(0, item.scale - SCALE_DECREASE_SPEED * deltaTime);
      item.entity.scale.set(item.initialScale.mul(item.scale));
      if (item.scale <= 0) {
        return true;
      }
    }
    return false;
  }

  static getWeightBasedScaleMultiplier(weight: number): number {
    return lerp(1, 5, clamp01(weight * 0.001))
  }

  private initCatalogData() {
    if (this.itemIdToSpawnControllerPool.size > 0) {
      //already initialized
      return;
    }

    if (USE_SPAWN_CONTROLLERS) {
      this.mutationSpawnControllerMap = new Map<string, hz.SpawnController>();
    } else {
      this.mutationAssetMap = new Map<string, hz.Asset>();
    }
    ItemContainer.localInstance.allMutations.forEach((mutationData: MutationData) => {
      const asset = mutationData.getEffectAsset()!;
      if (USE_SPAWN_CONTROLLERS) {
        const controller = new hz.SpawnController(asset, Vec3.zero, Quaternion.zero, Vec3.one);
        controller.load().then(() => this.mutationSpawnControllerMap!.set(mutationData.id, controller));
      } else {
        this.mutationAssetMap!.set(mutationData.id, asset);
      }
    });

    ItemContainer.localInstance.allItems.forEach((itemData: ItemData) => {
      if (itemData !== undefined) {
        const key: string = itemData.id;
        if (this.itemIdToSpawnControllerPool.has(key)) {
          log.error(`SpawnController: Duplicate Unique ID found for ${key} on ${itemData.name}.`);
        } else {
          this.itemIdToSpawnControllerPool.set(key, new SpawnControllerPoolData(itemData, this));
          log.info(`SpawnController: Creating pool for ${key}.`);
        }
      }
    });
  }
}
hz.Component.register(ItemSpawnManager);
