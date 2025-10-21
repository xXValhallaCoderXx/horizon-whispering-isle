/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as hz from 'horizon/core';

/**
 * AudioContainer manages a collection of audio components attached to child entities.
 * It provides functionality to play audio sequentially or randomly from the collection.
 *
 * This component should be attached to a parent entity that has AudioGizmo components
 * as children. It will automatically collect all AudioGizmo components during initialization.
 */
export class AudioContainer extends hz.Component<typeof AudioContainer> {
  /**
   * Component properties definition
   * @property {boolean} randomize - When true, audio will play in random order. When false, audio will play sequentially.
   */
  static propsDefinition = {
    randomize: {type: hz.PropTypes.Boolean, default: false},
  };

  private audioComponents: hz.AudioGizmo[] = [];
  private currentIndex = 0;

  start() {
    this.entity.children.get().forEach((child) => {
      const audio = child.as(hz.AudioGizmo);
      if (audio){
        this.audioComponents.push(audio);
      }
      else{
        console.error(`AudioContainer: child ${child.name.get()} is not an audio gizmo`);
      }
    });
  }

  /**
   * Plays an audio clip from the collection.
   * If randomize is true, plays a random audio clip.
   * If randomize is false, plays audio clips sequentially.
   *
   * @param player - Optional player to restrict audio playback to. If undefined, audio plays for all players.
   */
  public play(player: hz.Player | undefined = undefined) {
    const audio = this.props.randomize ? this.getRandom() : this.getSequential();

    if (player){
      audio.play({
        fade: 0,
        players: [player],
        audibilityMode: hz.AudibilityMode.AudibleTo,
      })
    }
    else{
      audio.play()
    }
  }

  /**
   * Selects a random AudioGizmo from the collection.
   * Ensures the same audio is not played twice in a row.
   *
   * @returns A randomly selected AudioGizmo
   * @private
   */
  private getRandom() : hz.AudioGizmo{
    let randomIndex
    do{
      randomIndex = Math.floor(Math.random() * this.audioComponents.length);
    } while (randomIndex === this.currentIndex);

    this.currentIndex = randomIndex;
    return this.audioComponents[randomIndex];
  }

  /**
   * Selects the next AudioGizmo in sequence from the collection.
   * Cycles through the collection in order, returning to the beginning after reaching the end.
   *
   * @returns The next AudioGizmo in the sequence
   * @private
   */
  private getSequential() : hz.AudioGizmo{
    return this.audioComponents[this.currentIndex++ % this.audioComponents.length];
  }
}
hz.Component.register(AudioContainer);
