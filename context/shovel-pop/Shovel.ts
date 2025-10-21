/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { ClientStartupReporter } from "ClientStartupReporter";
import { GameConstants } from "Constants";
import { Events } from "Events";
import { Component, Entity, GrabbableEntity, Handedness, LayerType, LocalEvent, NetworkEvent, Player, PropTypes, RaycastGizmo, RaycastTargetType, SerializableState, Vec3 } from "horizon/core";
import { ItemContainer } from "ItemContainer";
import { Logger } from "Logger";
import { PlayerService } from "PlayerService";
import { ShovelData } from "ShovelData";

const SHOVEL_DIG_POSITION_FRONT_OFFSET = -.2;
const HIDDEN_POSITION = new Vec3(0, -100, 0);

const log = new Logger("Shovel");

export class Shovel extends Component<typeof Shovel> {

  static propsDefinition = {
    swingCooldown: { type: PropTypes.Number, default: 200 },
    digBreakAnim: { type: PropTypes.Asset },
    digCelebrateAnim: { type: PropTypes.Asset },
    digSadAnim: { type: PropTypes.Asset },
    isServerOnly: { type: PropTypes.Boolean, default: false },
  };

  // Singleton
  private static _localInstance: Shovel | null;

  public static get localInstance(): Shovel { return this._localInstance!; }

  public static IsReady() { return this._localInstance && this._localInstance.isReady; }
  private isReady: boolean = false;
  private isEquipped: boolean = false;
  private raycast?: RaycastGizmo;
  private equippedGrabble?: { grabbable: GrabbableEntity, shovelId: string };

  static digAction = new LocalEvent<{ isPressed: boolean }>("requestDigAction")
  static equip = new NetworkEvent<Player>("equipShovel");
  static unequip = new NetworkEvent<Player>("unequipShovel");
  static setRaycastGizmo = new NetworkEvent<RaycastGizmo>("setRaycastGizmo");

  public equippedData!: ShovelData;
  private shovelTuning: Map<string, ShovelData> = new Map();
  private localShovelLevel: Map<string, number> = new Map<string, number>();
  private playerToShovelMap = new Map<Player, Map<string, Entity>>();

  // Config
  private readonly raycastOffset: number = 0.35; // Extra offset down when checking for floor

  private owner!: Player;

  start() {
    this.owner = this.world.getLocalPlayer();

    const isServerInstance = this.owner === this.world.getServerPlayer()
    if (this.props.isServerOnly !== isServerInstance) {
      return;
    }

    if (!Shovel._localInstance) {
      Shovel._localInstance = this;
      this.sendLocalBroadcastEvent(Events.shovelInitialized, {});
      log.info("Shovel local instance initialized")
    }

    if (isServerInstance) {
      this.connectNetworkBroadcastEvent(Events.setPlayerMoveSpeed, (data) => {
        if (this.owner === this.world.getServerPlayer()) {
          return;
        }
        GameConstants.Player.MoveSpeed = data.speed;
        this.world.getLocalPlayer().locomotionSpeed.set(GameConstants.Player.MoveSpeed);
      });
      this.connectNetworkBroadcastEvent(Events.spawnShovel, (data) => this.spawnShovel(data.player, data.shovelId));
      this.connectNetworkBroadcastEvent(Events.despawnShovel, (data) => this.despawnShovel(data.player, data.shovelId));
      PlayerService.connectPlayerExitWorld(this, (player) => {
        const playerShovels = this.playerToShovelMap.get(player);
        if (playerShovels !== undefined) {
          playerShovels.forEach((shovel) => this.world.deleteAsset(shovel, true));
          this.playerToShovelMap.delete(player);
        }
      });
    } else {
      this.connectNetworkBroadcastEvent(Events.playerShovelChanged, (payload) => {
        if (this.owner === payload.player) {
          this.setShovelVisual(payload.shovelId, this.localShovelLevel.get(payload.shovelId) || 0)
        }
      })

      this.sendNetworkBroadcastEvent(Events.requestShovelInit, { player: this.owner }, [this.world.getServerPlayer()])
      this.connectNetworkBroadcastEvent(Shovel.equip, () => this.equip());
      this.connectNetworkBroadcastEvent(Shovel.unequip, () => this.unequip());
      this.connectNetworkBroadcastEvent(Events.shovelSpawned, (data) => this.onShovelSpawned(data.shovelId, data.entity));
      this.connectNetworkBroadcastEvent(Shovel.setRaycastGizmo, (gizmo) => {
        this.raycast = gizmo.as(RaycastGizmo)
      });

      this.connectNetworkBroadcastEvent(Events.shovelSetLevel, (data) => {
        if (this.owner !== data.player) {
          return;
        }
        this.localShovelLevel.set(data.shovel, data.level)
        this.sendLocalBroadcastEvent(Events.localSetShovelLevel, { shovel: data.shovel, level: data.level })

        if (this.equippedData && this.equippedData.getBaseId() === data.shovel) {
          this.setShovelVisual(data.shovel, data.level)
        }
      })
      ClientStartupReporter.addEntry("Shovel start()", this);
    }
  }

  receiveOwnership(_serializableState: SerializableState, _oldOwner: Player, _newOwner: Player): void {
    if (this.world.getLocalPlayer() !== this.world.getServerPlayer()) {
      ClientStartupReporter.addEntry("Shovel receiveOwnership()");
    }
  }

  static initData(shovelData: ShovelData[]) {
    if (this._localInstance) {
      this._localInstance.initTuningData(shovelData);
      this._localInstance.isReady = true;
      log.info("Shovel local instance initialized data")
    }
    else {
      log.info("Shovel local instance not found when initializing data");
    }
  }

  static getData(id: string, level: number) {
    let shovelData = this._localInstance?.shovelTuning.get(id)
    while (shovelData && shovelData.evolutionLevel <= level && shovelData.evolution) {
      let nextData = this._localInstance?.shovelTuning.get(shovelData.evolution)
      if (nextData) {
        shovelData = nextData
      }
      else {
        break;
      }
    }
    return shovelData;
  }

  static getLevel(shovelId: string): number {
    // we only own/level up the base shovel, so if we are checking for an evolution, use the base shovel
    let shovelData = this.localInstance.shovelTuning.get(shovelId)
    if (shovelData && shovelData.baseShovel && shovelData.baseShovel.length > 0) {
      shovelId = shovelData.baseShovel
    }
    return this._localInstance?.localShovelLevel.get(shovelId) || 0;
  }

  static getSurfaceDigPosition() {
    const instance = this._localInstance;
    if (instance == undefined) {
      return undefined;
    }

    const localPlayer = instance.world.getLocalPlayer();
    let headPosition: Vec3 = Vec3.zero;
    let footPosition: Vec3 = Vec3.zero;
    let headForward: Vec3 = Vec3.zero;
    let failed = false;
    try {
      headPosition = localPlayer.head.position.get();
      footPosition = localPlayer.foot.position.get();
      headForward = localPlayer.head.forward.get();
    } catch (e) {
      failed = true;
    }
    if (failed) {
      log.error("Dig failed, couldn't access player properties");
      return;
    }

    if (instance.raycast != null) {
      let origin = new Vec3(
        headPosition.x + headForward.x * SHOVEL_DIG_POSITION_FRONT_OFFSET,
        headPosition.y + headForward.y * SHOVEL_DIG_POSITION_FRONT_OFFSET,
        headPosition.z + headForward.z * SHOVEL_DIG_POSITION_FRONT_OFFSET,
      );
      let direction = Vec3.down;
      let hitData = instance.raycast.raycast(
        origin,
        direction,
        {
          maxDistance: (headPosition.y - footPosition.y) + instance.raycastOffset,
          layerType: LayerType.Objects,

        }
      );

      if (hitData?.targetType === RaycastTargetType.Static) {
        log.info(`Raycast: hit object ${hitData.targetType}`);
        return hitData.hitPoint;
      }
      else {
        log.info(`Raycast: no object hit!`);
      }
    }
    return undefined;
  }

  private spawnShovel(player: Player, shovelId: string) {
    let playerShovels = this.playerToShovelMap.get(player);
    if (playerShovels === undefined) {
      playerShovels = new Map<string, Entity>();
      this.playerToShovelMap.set(player, playerShovels);
    }
    const existingShovel = playerShovels.get(shovelId);
    if (existingShovel !== undefined) {
      log.info("Shovel already spawned for " + shovelId);
      this.sendNetworkBroadcastEvent(Events.shovelSpawned, { shovelId, entity: existingShovel }, [player]);
      return;
    }
    const shovelData = Shovel.getData(shovelId, 0);
    if (shovelData === undefined) {
      log.error("Shovel data not found for " + shovelId);
      return;
    }
    const shovelAsset = shovelData.getShovelAsset();
    if (shovelAsset === undefined) {
      log.error("Shovel asset not found for " + shovelId);
      return;
    }
    log.info("Spawning shovel " + shovelId);
    this.world.spawnAsset(shovelAsset, HIDDEN_POSITION).then(spawnedEntities => {
      const shovel = spawnedEntities[0]!;
      if (playerShovels === undefined) {
        return;
      }
      if (playerShovels.has(shovelId)) {
        log.info("Shovel already spawned for " + shovelId + ", deleting dupe...");
        this.world.deleteAsset(shovel, true);
        return;
      }
      log.info("Shovel spawned for " + shovelId);
      playerShovels.set(shovelId, shovel);
      this.sendNetworkBroadcastEvent(Events.shovelSpawned, { shovelId, entity: shovel }, [player]);
    });
  }

  private despawnShovel(player: Player, shovelId: string) {
    const playerShovels = this.playerToShovelMap.get(player);
    if (playerShovels === undefined) {
      return;
    }
    const shovel = playerShovels.get(shovelId);
    if (shovel === undefined) {
      return;
    }
    this.world.deleteAsset(shovel, true);
    playerShovels.delete(shovelId);
  }

  private equip() {
    this.isEquipped = true;
    this.updateEquip();
  }

  private unequip() {
    this.isEquipped = false;
    this.updateEquip();
  }

  private updateEquip() {
    if (this.equippedGrabble === undefined) {
      return;
    }
    if (this.isEquipped) {
      this.equippedGrabble.grabbable.visible.set(true)
      this.equippedGrabble.grabbable.forceHold(this.world.getLocalPlayer(), Handedness.Right, false) // currently does not support Horizon's build-in dropping
    } else {
      this.hideGrabbable(this.equippedGrabble.grabbable)
    }
  }

  private hideGrabbable(grabbable: GrabbableEntity) {
    grabbable.forceRelease()
    grabbable.position.set(HIDDEN_POSITION)
    grabbable.visible.set(false)
  }

  private despawnGrabbable(grabbable: GrabbableEntity, shovelId: string) {
    this.sendNetworkBroadcastEvent(Events.despawnShovel, { player: this.owner, shovelId });
    this.hideGrabbable(grabbable);
  }

  private initTuningData(shovelData: ShovelData[]) {
    shovelData.forEach(shovel => {
      this.shovelTuning.set(shovel.id, shovel);
    });
  }

  private setShovelVisual(shovelId: string, level: number) {
    const shovelData = Shovel.getData(shovelId, level);
    if (shovelData === undefined) {
      const sub = this.connectLocalBroadcastEvent(ItemContainer.itemDataLoadComplete, () => {
        this.setShovelVisual(shovelId, level);
        sub.disconnect();
        this.equip()
      })
      return;
    }

    const shovelAsset = shovelData.getShovelAsset();
    if (shovelAsset === undefined) {
      log.error("Shovel asset not found for " + shovelId);
      return;
    }
    this.equippedData = shovelData;
    this.sendNetworkBroadcastEvent(Events.spawnShovel, { player: this.owner, shovelId: shovelData.id });
    this.sendLocalBroadcastEvent(Events.localPlayerShovelChanged, { shovelData: shovelData! }) // broadcast this shovel's powers locally
  }

  private onShovelSpawned(shovelId: string, entity: Entity) {
    const grabbable = entity.as(GrabbableEntity);
    if (this.equippedData.id !== shovelId) {
      this.sendNetworkBroadcastEvent(Events.despawnShovel, { player: this.owner, shovelId });
      return;
    }
    this.clearStaleEquippedGrabbable();
    this.equippedGrabble = { grabbable: grabbable, shovelId };
    this.updateEquip();
  }

  private clearStaleEquippedGrabbable() {
    if (this.equippedGrabble !== undefined && this.equippedGrabble.shovelId !== this.equippedData.id) {
      this.despawnGrabbable(this.equippedGrabble.grabbable, this.equippedGrabble.shovelId);
      this.equippedGrabble = undefined;
    }
  }
}
Component.register(Shovel);
