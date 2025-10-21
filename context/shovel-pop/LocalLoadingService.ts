/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as hz from 'horizon/core';
import { Logger } from 'Logger';
import { PlayerService } from 'PlayerService';

const log = new Logger('LocalLoadingService')

export enum Environment {
  Client = 1 << 0,
  Server = 1 << 1,
}

export class LoadingService {
  public static ClientServices = new Set<string>();
  public static ServerServices = new Set<string>();

  private name

  constructor(name: string, environment: Environment) {
    this.name = name;
    if ((environment & Environment.Client) !== 0){
      LoadingService.ClientServices.add(name);
    }
    if ((environment & Environment.Server) !== 0){
      LoadingService.ServerServices.add(name);
    }
  }

  public CompleteClient(component: hz.Component, context: hz.Player){
    LoadingService.ClientServices.delete(this.name);
    log.info('Completed ' + this.name + ' for ' + context.id + ' Remaining services: ' + Array.from(LoadingService.ClientServices))
    if (LoadingService.ClientServices.size === 0) {
      component.sendNetworkBroadcastEvent(LocalLoadingService.localServicesComplete, {player: context}, [component.world.getServerPlayer()])
    }
  }

  public CompleteServer(component: hz.Component){
    LoadingService.ServerServices.delete(this.name);
    log.info('Completed ' + this.name + ' Remaining services: ' + Array.from(LoadingService.ServerServices))
    if (LoadingService.ServerServices.size === 0) {
      const server = component.world.getServerPlayer();
      component.sendNetworkBroadcastEvent(LocalLoadingService.localServicesComplete, {player: server}, [server])
    }
  }
}

/**
 * Tracks loading of services on all different contexts. Stores a set of contexts (individual clients or server) that have finished loading
 * all of their locally registered services. When all services are loaded, the localServicesComplete event is fired from that context to the server.
 * Users can poll this service to determine if all services are loaded for a given context.
 */
export class LocalLoadingService extends hz.Component<typeof LocalLoadingService> {
  static localServicesComplete = new hz.NetworkEvent<{player: hz.Player}>("localServicesComplete");

  private static _instance: LocalLoadingService | null;
  public static get instance(): LocalLoadingService { return this._instance!; }

  private loadedContexts = new Set<hz.Player>();

  preStart() {
    LocalLoadingService._instance = this;
  }

  start() {
    this.connectNetworkBroadcastEvent(LocalLoadingService.localServicesComplete, (data) => {
      this.loadedContexts.add(data.player);
      if (data.player === this.world.getServerPlayer()){
        log.info('[Server] All server services complete')
      }
      else{
        log.info(`[Client] All client services for ${PlayerService.getPlayerName(data.player)} complete`)
      }
    })

    PlayerService.connectPlayerExitWorld(this, (player) => {
      this.loadedContexts.delete(player);
    })
  }

  public playerServicesLoaded(player: hz.Player) : boolean {
    return this.loadedContexts.has(player);
  }
}
hz.Component.register(LocalLoadingService);
