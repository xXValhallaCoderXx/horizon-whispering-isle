/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Debug } from 'Debug';
import { Events } from 'Events';
import { AssetSpawnLog } from 'GlobalLoggers';
import * as hz from 'horizon/core';
import { forEachIsland, getIslandDisplayName, getIslandID } from 'Islands';
import { Logger } from 'Logger';
import { PlayerService } from 'PlayerService';
import { LTEState } from './Enums';
import { LTEData } from './LTEData';
import { QuestManager } from './QuestManager';

const log = new Logger('LTEManager');

export class LTEManager extends hz.Component<typeof LTEManager> {
  static propsDefinition = {
    noEventWeight: { type: hz.PropTypes.Number },
    defaultEventCooldownMin: { type: hz.PropTypes.Number },
    defaultEventCooldownMax: { type: hz.PropTypes.Number },
    eventPreviewTime: { type: hz.PropTypes.Number },
    eventEndingSoonTime: { type: hz.PropTypes.Number },
    overrideLTELength: { type: hz.PropTypes.Number, default: 0 }, // Use to override how long the lte lasts for
    overrideCooldown: { type: hz.PropTypes.Boolean, default: false }, // Use to use the default event cooldown instead of the one set on the lte
    overrideLTEIslandId: { type: hz.PropTypes.String, default: "" } // Use to override which lte is used
  };

  static instance: LTEManager;

  nextEventTime: number = 0;
  eventState: LTEState = LTEState.NONE;
  private availableEvents: LTEData[] = [];
  private currentEvent: LTEData | undefined = undefined;
  private overrideLTEIslandId = "";
  private overrideDuration: number = 0;
  private overrideCooldown: number = 0;
  private overridePreviewTime: number = 0;
  private overrideEndTime: number = 0;
  private isSpawning: boolean = false;

  start() {
    LTEManager.instance = this;
    this.overrideLTEIslandId = this.props.overrideLTEIslandId;
    this.overrideDuration = this.props.overrideLTELength;
    this.setDefaultCooldown();
    this.connectLocalBroadcastEvent(hz.World.onUpdate, (payload) => this.onUpdate(payload.deltaTime));
    this.entity.children.get().forEach(child => {
      let eventData = child.getComponents<LTEData>();
      if (eventData.length > 0 && eventData[0].props.selectionWeight > 0) {
        this.availableEvents.push(eventData[0]);
      }
    })
    // This is to update the timer for a player who joins during an event
     this.connectNetworkBroadcastEvent(Events.PlayerRewardsReady, (data: { player: hz.Player }) => {
       if (this.currentEvent && this.eventState === LTEState.STARTED && this.shouldNotifyPlayer(data.player)) {
         this.sendNetworkBroadcastEvent(Events.lteTimeRemainingMessage, { time: this.nextEventTime + this.getEndingSoonTime() - Date.now(), color: this.currentEvent.props.messageColor, imageAsset: this.currentEvent.props.activateImage!.id.toString() }, [data.player])
       }
     })
    Debug.addCommand(`LTE/Force Island/Clear`, _ => { this.overrideLTEIslandId = "" });
    forEachIsland(island => {
      if (this.availableEvents.some(event => event.props.islandId === getIslandID(island))) {
        Debug.addCommand(`LTE/Force Island/${getIslandDisplayName(island)}`, _ => { this.overrideLTEIslandId = getIslandID(island)! });
      }
    })
    Debug.addCommand(`LTE/Override Duration/Clear`, _ => { this.overrideDuration = 0 });
    Debug.addCommand(`LTE/Override Duration/15 seconds`, _ => { this.overrideDuration = 15 });
    Debug.addCommand(`LTE/Override Duration/60 seconds`, _ => { this.overrideDuration = 60 });
    Debug.addCommand(`LTE/Override Duration/120 seconds`, _ => { this.overrideDuration = 120 });
    Debug.addCommand(`LTE/Override Duration/180 seconds`, _ => { this.overrideDuration = 180 });
    Debug.addCommand(`LTE/Override Duration/240 seconds`, _ => { this.overrideDuration = 240 });
    Debug.addCommand(`LTE/Override Cooldown/Clear`, _ => { this.overrideCooldown = 0 });
    Debug.addCommand(`LTE/Override Cooldown/5 seconds`, _ => { this.overrideCooldown = 5 });
    Debug.addCommand(`LTE/Override Cooldown/15 seconds`, _ => { this.overrideCooldown = 15 });
    Debug.addCommand(`LTE/Override Cooldown/60 seconds`, _ => { this.overrideCooldown = 60 });
    Debug.addCommand(`LTE/Override Cooldown/120 seconds`, _ => { this.overrideCooldown = 120 });
    Debug.addCommand(`LTE/Override Cooldown/180 seconds`, _ => { this.overrideCooldown = 180 });
    Debug.addCommand(`LTE/Override Cooldown/240 seconds`, _ => { this.overrideCooldown = 240 });
    Debug.addCommand(`LTE/Override Preview Time/Clear`, _ => { this.overridePreviewTime = 0 });
    Debug.addCommand(`LTE/Override Preview Time/5 seconds`, _ => { this.overridePreviewTime = 5 });
    Debug.addCommand(`LTE/Override Preview Time/15 seconds`, _ => { this.overridePreviewTime = 15 });
    Debug.addCommand(`LTE/Override End Time/Clear`, _ => { this.overrideEndTime = 0 });
    Debug.addCommand(`LTE/Override End Time/5 seconds`, _ => { this.overrideEndTime = 5 });
    Debug.addCommand(`LTE/Override End Time/15 seconds`, _ => { this.overrideEndTime = 15 });
    Debug.addCommand("LTE/Start Next Phase", (player) => {
      this.nextEventTime = Date.now();
    });
  }

  getAllLTEIcons(): hz.Asset[] {
    let assets: hz.Asset[] = [];
    this.availableEvents.forEach(event => {
      if (event.props.previewImage) {
        assets.push(event.props.previewImage);
      }
      if (event.props.activateImage) {
        assets.push(event.props.activateImage);
      }
      if (event.props.endingSoonImage) {
        assets.push(event.props.endingSoonImage);
      }
      if (event.props.endedImage) {
        assets.push(event.props.endedImage);
      }
    });
    return assets;
  }

  private setCooldown(event?: LTEData) {
    if (this.overrideCooldown > 0) {
      this.nextEventTime = Date.now() + this.overrideCooldown * 1000;
    } else if (this.props.overrideCooldown) {
      this.setDefaultCooldown();
    } else if (event !== undefined) {
      this.nextEventTime = Date.now() + event.getCooldown();
    } else {
      this.setDefaultCooldown();
    }
    log.info(`Setting next event time to ${this.nextEventTime}`);
  }

  private setDefaultCooldown() {
    if (this.props.defaultEventCooldownMax > this.props.defaultEventCooldownMin) {
      this.nextEventTime = Date.now() + (Math.random() * (this.props.defaultEventCooldownMax - this.props.defaultEventCooldownMin) + this.props.defaultEventCooldownMin) * 1000;
    }
    else {
      this.nextEventTime = Date.now() + this.props.defaultEventCooldownMin * 1000;
    }
  }

  private onUpdate(deltaTime: number) {
    if (this.nextEventTime <= Date.now()) {
      if (this.eventState == LTEState.NONE) {
        this.maybeStartEvent();
        if (this.eventState != LTEState.NONE) {
          this.sendEventNotification();
        }
      }
      else if (this.eventState == LTEState.SELECTED) {
        if (this.currentEvent && !this.isSpawning) {
          this.isSpawning = true;
          log.info(`Starting event for island ${this.currentEvent.props.islandId}`);
          this.currentEvent.startEvent(() => {
            this.isSpawning = false;
            this.nextEventTime = Date.now() + this.getLTEDuration() - this.getEndingSoonTime()
            log.info(`Setting next event time to ${this.nextEventTime}`);
            this.eventState = LTEState.STARTED;
            this.sendEventNotification();
          });
        }
      }
      else if (this.eventState == LTEState.STARTED) {
        log.info(`Event ending soon for island ${this.currentEvent!.props.islandId}`);
        this.eventState = LTEState.ENDING_SOON;
        this.nextEventTime = Date.now() + this.getEndingSoonTime();
        log.info(`Setting next event time to ${this.nextEventTime}`);
        this.sendEventNotification();
      }
      else if (this.eventState == LTEState.ENDING_SOON) {
        log.info(`Ending event for island ${this.currentEvent!.props.islandId}`);
        if (this.currentEvent) {
          this.currentEvent.endEvent();
          this.nextEventTime = Date.now() + this.currentEvent.props.despawnSeconds * 1000;
          log.info(`Setting next event time to ${this.nextEventTime}`);
        }
        this.eventState = LTEState.ENDED;
        this.sendEventNotification();
      }
      else if (this.eventState == LTEState.ENDED) {
        log.info(`Despawning event for island ${this.currentEvent!.props.islandId} and resetting cooldown`);
        if (this.currentEvent) {
          this.currentEvent.despawn();
          this.setCooldown(this.currentEvent);
        }
        this.eventState = LTEState.NONE;
      }
    }
  }

  private getEndingSoonTime() {
    return (this.overrideEndTime > 0 ? this.overrideEndTime : this.props.eventEndingSoonTime) * 1000;
  }

  private getLTEDuration() {
    return (this.overrideDuration > 0 ? this.props.overrideLTELength : this.currentEvent!.props.durationSeconds) * 1000;
  }

  private getEventPreviewTime(): number {
    return (this.overridePreviewTime > 0 ? this.overridePreviewTime : this.props.eventPreviewTime) * 1000;
  }

  private sendEventNotification() {
    if (this.currentEvent) {
      let msg = this.currentEvent.props.previewMessage;
      let imgAsset = this.currentEvent.props.previewImage;
      let soundAsset = this.currentEvent.props.previewSound;
      if (this.eventState == LTEState.ENDING_SOON) {
        msg = this.currentEvent.props.endingSoonMessage;
        imgAsset = this.currentEvent.props.endingSoonImage;
        soundAsset = this.currentEvent.props.endingSoonSound;
      }
      else if (this.eventState == LTEState.STARTED) {
        msg = this.currentEvent.props.activateMessage;
        imgAsset = this.currentEvent.props.activateImage;
        soundAsset = this.currentEvent.props.activateSound;
        this.sendNetworkBroadcastEvent(Events.lteTimeRemainingMessage, { time: this.getLTEDuration(), color: this.currentEvent.props.messageColor, imageAsset: this.currentEvent.props.activateImage!.id.toString() }, this.getPlayersToNotify())
      }
      else if (this.eventState == LTEState.ENDED) {
        msg = this.currentEvent.props.endedMessage;
        imgAsset = this.currentEvent.props.endedImage;
        soundAsset = this.currentEvent.props.endedSound;
      }
      let imgAssetId = imgAsset?.id.toString() ?? '';
      AssetSpawnLog.info(`Spawn Asset (lte sound): ${this.currentEvent.props.islandId} ${this.getLTEStateString(this.eventState)}`);
      this.currentEvent.playSound(soundAsset);
      this.sendLocalBroadcastEvent(Events.lteStateChangeMessage, { state: this.eventState, islandId: this.currentEvent.props.islandId })
      this.sendNetworkBroadcastEvent(Events.lteNotificationMessage, {
        state: this.eventState,
        text: msg,
        imageAsset: imgAssetId,
        color: this.currentEvent.props.messageColor,
        borderColor: this.currentEvent.props.borderColor,
      }, this.getPlayersToNotify());
    }
  }

  private getLTEStateString(eventState: LTEState) {
    switch (eventState) {
      case LTEState.NONE:
        return "NONE";
      case LTEState.SELECTED:
        return "SELECTED";
      case LTEState.STARTED:
        return "STARTED";
      case LTEState.ENDING_SOON:
        return "ENDING_SOON";
      case LTEState.ENDED:
        return "ENDED";
    }
  }

  private shouldNotifyPlayer(player: hz.Player): boolean {
    return QuestManager.instance.hasCompletedQuest(player, "talk_to_fredrick")
  }

  private getPlayersToNotify(): hz.Player[] {
    let players = PlayerService.getConnectedPlayers();
    players = players.filter(player => this.shouldNotifyPlayer(player));
    players.push(this.world.getServerPlayer())
    return players
  }

  private maybeStartEvent() {
    if (this.availableEvents.length == 0 && this.currentEvent) {
      //if we only have one event, keep using it
      this.availableEvents.push(this.currentEvent);
      this.currentEvent = undefined;
    }
    let totalWeight = this.props.noEventWeight;
    this.availableEvents.forEach(event => {
      totalWeight += event.props.selectionWeight;
    });
    let roll = Math.random() * totalWeight;
    let nextEvent: LTEData | undefined = undefined;
    if (this.overrideLTEIslandId != "") {
      nextEvent = (this.currentEvent && this.currentEvent.props.islandId === this.overrideLTEIslandId)
        ? this.currentEvent
        : this.availableEvents.find(event => event.props.islandId === this.overrideLTEIslandId);
    } else {
      this.availableEvents.forEach(event => {
        if (nextEvent !== undefined) {
          return;
        }
        roll -= event.props.selectionWeight;
        if (roll <= 0) {
          nextEvent = event;
        }
      });
    }

    if (nextEvent !== undefined) {
      let oldEvent = this.currentEvent;
      this.currentEvent = nextEvent;
      this.availableEvents = this.availableEvents.filter(e => e != nextEvent);
      if (oldEvent && this.availableEvents.indexOf(oldEvent) < 0) {
        this.availableEvents.push(oldEvent);
      }
      this.eventState = LTEState.SELECTED;
      this.nextEventTime = Date.now() + this.getEventPreviewTime();
    }

    if (this.eventState == LTEState.NONE) {
      log.info("No event selected, setting default cooldown");
      //if no event, use default timer
      this.setCooldown();
    } else if (this.currentEvent === undefined) {
      log.warn("No event selected, current state: " + this.getLTEStateString(this.eventState));
    }
  }
}
hz.Component.register(LTEManager);
