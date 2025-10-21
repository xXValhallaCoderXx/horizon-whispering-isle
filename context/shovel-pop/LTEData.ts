/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { AssetSpawnLog } from 'GlobalLoggers';
import * as hz from 'horizon/core';
import { LTEShinySpotLocator } from 'LTEShinySpotLocator';
import { DigZone } from './DigZone';
import { DigZoneManager } from './DigZoneManager';
import { Events } from './Events';

export class LTEData extends hz.Component<typeof LTEData> {
  static propsDefinition = {
    mainAsset: {type: hz.PropTypes.Asset},
    spawnEffect: {type: hz.PropTypes.Asset},
    despawnEffect: {type: hz.PropTypes.Asset},
    despawnSeconds: {type: hz.PropTypes.Number},
    minCooldownSeconds: {type: hz.PropTypes.Number},
    maxCooldownSeconds: {type: hz.PropTypes.Number},
    durationSeconds: {type: hz.PropTypes.Number},
    selectionWeight: {type: hz.PropTypes.Number},
    previewMessage: {type: hz.PropTypes.String},
    previewImage: {type: hz.PropTypes.Asset},
    previewSound: {type: hz.PropTypes.Asset},
    activateMessage: {type: hz.PropTypes.String},
    activateImage: {type: hz.PropTypes.Asset},
    activateSound: {type: hz.PropTypes.Asset},
    endingSoonMessage: {type: hz.PropTypes.String},
    endingSoonImage: {type: hz.PropTypes.Asset},
    endingSoonSound: {type: hz.PropTypes.Asset},
    endedMessage: {type: hz.PropTypes.String},
    endedImage: {type: hz.PropTypes.Asset},
    endedSound: {type: hz.PropTypes.Asset},
    messageColor: {type: hz.PropTypes.Color},
    borderColor: {type: hz.PropTypes.Color},
    islandId: {type: hz.PropTypes.String},
  };

  spawnedEntities: hz.Entity[] = [];
  digZones: DigZone[] = [];

  start() {

  }

  playSound(sound: hz.Asset | undefined) {
    if (sound) {
      this.world.spawnAsset(sound, this.entity.position.get(), this.entity.rotation.get()).then((ent) => {
        this.spawnedEntities = this.spawnedEntities.concat(ent);
      })
    }
  }

  async startEvent(onSpawn: ()=>void) {
    let spawnPoint = this.entity;
    if (this.entity.children.get().length > 0) {
      let idx = Math.floor(Math.random() * this.entity.children.get().length);
      spawnPoint = this.entity.children.get()[idx];
    }
    if (this.props.spawnEffect) {
      AssetSpawnLog.info("Spawn Asset (LTE Spawn Effect): " + this.props.islandId);
      await this.world.spawnAsset(this.props.spawnEffect, spawnPoint.position.get(), spawnPoint.rotation.get()).then((ent) =>{
        this.spawnedEntities = this.spawnedEntities.concat(ent);
      })
    }
    this.digZones = []
    AssetSpawnLog.info("Spawn Asset (LTE Main Asset): " + this.props.islandId);
    await this.world.spawnAsset(new hz.Asset(this.props.mainAsset!.id), spawnPoint.position.get(), spawnPoint.rotation.get()).then((ent) =>{
      this.spawnedEntities = this.spawnedEntities.concat(ent);
      ent.forEach((e) =>{
        if (e.children.get().length > 0) {
          e.children.get().forEach((child) => {
            if (child.name.get() !== "Trigger") {
              return;
            }
            let zones = child.getComponents<DigZone>();
            if (zones.length > 0) {
              let zone = zones[0];

              let locator = spawnPoint.getComponents<LTEShinySpotLocator>();

                if (locator.length > 0) {
                  try {
                    if (!locator[0].shinySpotsLoaded){
                      console.error("Shiny Spot Data not loaded yet!!! This LTE will have NO shiny spots!!");
                    }
                    let spots = locator[0].shinySpots;
                    spots.forEach((spot) => {
                      zone.shinySpots.push(spot);
                    });
                  } catch (error) {
                    console.error("Error loading shiny spots: ", error);
                  }
                } else {
                  console.error("LTEData: No LTEShinySpotLocator found for " + zone.props.id);
                }

              this.digZones.push(zone)
            }
          });
        }
      });

      this.digZones.forEach((zone) => {
        this.sendLocalBroadcastEvent(Events.onLteZoneStart, {zone: zone})
      })
      onSpawn();
    });
  }

  endEvent() {
    this.digZones.forEach((zone) => {
      DigZoneManager.instance.clearPlayers(zone);
      this.sendLocalBroadcastEvent(Events.onLteZoneEnd, {zone: zone})
    })
    this.digZones = [];

    if (this.props.despawnEffect) {
      AssetSpawnLog.info("Spawn Asset (LTE Despawn Effect): " + this.props.islandId);
      this.world.spawnAsset(this.props.despawnEffect, this.entity.position.get(), this.entity.rotation.get()).then((despawnEnt) =>{
        //despawn main assets after spawning despawn effect
        this.spawnedEntities.forEach((ent) => {
          this.world.deleteAsset(ent);
        });
        this.spawnedEntities = despawnEnt;
      })
    }
    else {
      this.spawnedEntities.forEach((ent) => {
        this.async.setTimeout(() => {
          this.world.deleteAsset(ent);
        }, 500);
      });
      this.spawnedEntities = [];
    }
  }

  despawn() {
    this.spawnedEntities.forEach((ent) => {
      this.world.deleteAsset(ent);
    });
    this.spawnedEntities = [];
  }

  getCooldown(): number{
    if (this.props.maxCooldownSeconds > this.props.minCooldownSeconds) {
      return (this.props.minCooldownSeconds + Math.random() * (this.props.maxCooldownSeconds - this.props.minCooldownSeconds)) * 1000;
    }
    return this.props.minCooldownSeconds * 1000;
  }
}
hz.Component.register(LTEData);
