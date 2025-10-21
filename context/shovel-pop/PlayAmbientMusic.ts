/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { LTEState } from 'Enums';
import { Events } from 'Events';
import { AudibilityMode, AudioGizmo, Component, Entity, Player, PropTypes } from 'horizon/core';
import { getIslandFromID, Islands } from 'Islands';
import { IslandEvents } from 'IslandTeleportManager';

class PlayAmbientMusic extends Component<typeof PlayAmbientMusic> {
  static propsDefinition = {
    musBasecamp: { type: PropTypes.Entity },
    musPirate: { type: PropTypes.Entity },
    musIce: { type: PropTypes.Entity },
    musFairytale: { type: PropTypes.Entity },
    musMoon: { type: PropTypes.Entity },
  };

  private islandToMusic = new Map<Islands, Entity>()
  private currentIsland: Map<Player, Islands> = new Map<Player, Islands>()
  private lteSoundPlaying: boolean = false
  private lteIsland: Islands = Islands.BeachCamp

  start() {
    if (this.props.musBasecamp) {
      this.islandToMusic.set(Islands.BeachCamp, this.props.musBasecamp)
    }
    if (this.props.musPirate) {
      this.islandToMusic.set(Islands.PirateCove, this.props.musPirate)
    }
    if (this.props.musIce) {
      this.islandToMusic.set(Islands.IceTundra, this.props.musIce)
    }
    if (this.props.musFairytale) {
      this.islandToMusic.set(Islands.FairyTaleKingdom, this.props.musFairytale)
    }
    if (this.props.musMoon) {
      this.islandToMusic.set(Islands.Moon, this.props.musMoon)
    }

    this.connectNetworkBroadcastEvent(IslandEvents.playerTeleportedToIsland, (payload) => {
      if (!this.islandToMusic.has(payload.island)){
        return
      }
      this.currentIsland.set(payload.player, payload.island)
      // stop all music
      this.islandToMusic.forEach((sound, island) => {
        sound.as(AudioGizmo).stop({
          fade: 2,
          players: [payload.player],
          audibilityMode: AudibilityMode.AudibleTo
        })
      })
      if (!this.lteSoundPlaying || payload.island !== this.lteIsland) {
        // play new music
        const sound = this.islandToMusic.get(payload.island)
        if (sound) {
          sound.as(AudioGizmo).play({
            fade: 2,
            players: [payload.player],
            audibilityMode: AudibilityMode.AudibleTo
          })
        }
      }
    })

    this.connectLocalBroadcastEvent(Events.lteStateChangeMessage, (payload) => {
      const island = getIslandFromID(payload.islandId)!

      if (payload.state == LTEState.STARTED) {
        this.lteSoundPlaying = true
        this.lteIsland = island
        this.world.getPlayers().forEach(player => {
          let playerIsland = this.currentIsland.get(player) ?? Islands.BeachCamp
          // stop all music for island
          if (playerIsland == island) {
            this.islandToMusic.get(island)?.as(AudioGizmo).stop({
              fade: 2,
              players: [player],
              audibilityMode: AudibilityMode.AudibleTo
            })
          }
        })
      }
      else if (payload.state == LTEState.ENDED) {
        this.lteSoundPlaying = false
        // restart current music
        this.world.getPlayers().forEach(player => {
          let playerIsland = this.currentIsland.get(player) ?? Islands.BeachCamp
          if (playerIsland == island) {
            const sound = this.islandToMusic.get(playerIsland)
            if (sound) {
              sound.as(AudioGizmo).play({
                fade: 2,
                players: [player],
                audibilityMode: AudibilityMode.AudibleTo
              })
            }
          }
        })
      }
    })
  }
}

Component.register(PlayAmbientMusic);
