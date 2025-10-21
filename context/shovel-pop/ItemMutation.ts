/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Color, Component, Entity, MeshEntity, World } from "horizon/core";
import { MutationData } from "MutationData";

const USE_LOCAL_ROTATION = false;

export class ItemMutation extends Component<typeof ItemMutation> {
  private itemEntity?: Entity;
  private itemMeshEntity?: MeshEntity;
  private mutationData?: MutationData;

  start(): void {
    this.connectLocalBroadcastEvent(World.onUpdate, payload => this.update(payload.deltaTime));
  }

  private update(deltaTime: number) {
    try {
      if (this.itemEntity !== undefined) {
        this.entity.position.set(this.itemEntity.position.get());
        if (USE_LOCAL_ROTATION) {
          this.entity.rotation.set(this.itemEntity.rotation.get());
        }
      }
    } catch (e) {
      console.error("Item Mutation update failed, deleting... " + e);
      this.world.deleteAsset(this.entity);
    }
  }

  setup(itemEntity: Entity, mutationData: MutationData) {
    this.itemEntity = itemEntity;
    this.itemMeshEntity = itemEntity.children.get()[0].as(MeshEntity);
    this.mutationData = mutationData;
    this.applyMutationToEntity();
  }

  private applyMutationToEntity() {
    if (this.mutationData === undefined || this.itemMeshEntity === undefined || this.itemEntity === undefined) {
      return;
    }
    this.itemMeshEntity.style.brightness.set(this.mutationData.itemBrightness);
    this.itemMeshEntity.style.tintColor.set(Color.fromHex(this.mutationData.itemTint));
    this.itemMeshEntity.style.tintStrength.set(this.mutationData.itemTintStrength);
    this.itemEntity.scale.set(this.itemEntity.scale.get().mul(this.mutationData.itemScaleMultiplier));
  }
}

Component.register(ItemMutation);
