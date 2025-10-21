/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { ClientStartupReporter } from "ClientStartupReporter";
import { Events } from "Events";
import { AudibilityMode, AudioGizmo, Component, LocalEvent, NetworkEvent, ParticleGizmo, Player, PropTypes, SerializableState } from "horizon/core";
import { PlayerService } from "PlayerService";

export const PlayerEffects = {
  sellEffect: new NetworkEvent("playSellEffect"),
  questCompleteEffect: new NetworkEvent("playQuestCompleteEffect"),
  levelUpEffect: new NetworkEvent("playLevelUpEffect"),
  sellEffectLocal: new LocalEvent("playSellEffectLocal"),
  completionEffect: new NetworkEvent("playCompletionEffect"),
}

export class PlayerEffectsController extends Component<typeof PlayerEffectsController> {
  static propsDefinition = {
    sellParticleEffect: { type: PropTypes.Entity },
    sellAudioEffect: { type: PropTypes.Entity },
    questCompleteParticleEffect: { type: PropTypes.Entity },
    levelUpParticleEffect: { type: PropTypes.Entity },
    completionAudioEffect: { type: PropTypes.Entity },
  };

  private sellParticleEffect!: ParticleGizmo
  private sellAudioEffect!: AudioGizmo
  private questCompleteParticleEffect!: ParticleGizmo
  private levelUpParticleEffect!: ParticleGizmo
  private completionAudioEffect!: AudioGizmo

  private shouldDelayQuestCompleteEffect = false;
  private isDelayingQuestCompleteEffect = false;

  start() {
    // Only run on clients.
    if (this.world.getLocalPlayer() == this.world.getServerPlayer()) {
      return;
    }
    this.sellParticleEffect = this.props.sellParticleEffect!.as(ParticleGizmo)
    this.sellAudioEffect = this.props.sellAudioEffect!.as(AudioGizmo)
    this.connectNetworkBroadcastEvent(PlayerEffects.sellEffect, payload => this.onPlaySellEffect());
    this.connectLocalBroadcastEvent(PlayerEffects.sellEffectLocal, payload => this.onPlaySellEffect());

    this.questCompleteParticleEffect = this.props.questCompleteParticleEffect!.as(ParticleGizmo)
    this.connectNetworkBroadcastEvent(PlayerEffects.questCompleteEffect, payload => this.onPlayQuestCompleteEffect());

    this.levelUpParticleEffect = this.props.levelUpParticleEffect!.as(ParticleGizmo)
    this.connectNetworkBroadcastEvent(PlayerEffects.levelUpEffect, payload => this.onPlayLevelUpEffect());

    this.completionAudioEffect = this.props.completionAudioEffect!.as(AudioGizmo)
    this.connectNetworkBroadcastEvent(PlayerEffects.completionEffect, payload => this.onPlayCompletionEffect());

    this.connectLocalBroadcastEvent(Events.digResultHUDOpen, () => {
      this.shouldDelayQuestCompleteEffect = true;
    })

    this.connectLocalBroadcastEvent(Events.digResultHUDClose, () => {
      this.shouldDelayQuestCompleteEffect = false;
      if (this.isDelayingQuestCompleteEffect) {
        this.onPlayQuestCompleteEffect();
      }
    })
    ClientStartupReporter.addEntry("PlayerEffectsController start()", this);
  }

  receiveOwnership(_serializableState: SerializableState, _oldOwner: Player, _newOwner: Player): void {
    if (this.world.getLocalPlayer() !== this.world.getServerPlayer()) {
      ClientStartupReporter.addEntry("PlayerEffectsController receiveOwnership()");
    }
  }

  private onPlaySellEffect() {
    const position = PlayerService.getPlayerPosition(this.world.getLocalPlayer())
    this.sellParticleEffect.position.set(position)
    this.sellParticleEffect.play()
    this.sellAudioEffect.position.set(position)
    this.sellAudioEffect.play()
  }

  private onPlayQuestCompleteEffect() {
    if (this.shouldDelayQuestCompleteEffect) {
      this.isDelayingQuestCompleteEffect = true;
      return;
    }

    this.isDelayingQuestCompleteEffect = false;

    const position = PlayerService.getPlayerPosition(this.world.getLocalPlayer())
    this.questCompleteParticleEffect.position.set(position)
    this.questCompleteParticleEffect.play()
  }

  private onPlayLevelUpEffect() {
    const position = PlayerService.getPlayerPosition(this.world.getLocalPlayer())
    this.levelUpParticleEffect.position.set(position)
    this.levelUpParticleEffect.play()
  }

  private onPlayCompletionEffect() {
    this.completionAudioEffect.play({ players: [this.world.getLocalPlayer()], fade: 0, audibilityMode: AudibilityMode.AudibleTo })
  }
}
Component.register(PlayerEffectsController);
