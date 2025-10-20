import * as hz from "horizon/core";
import * as ab from "horizon/unity_asset_bundles";

class TutorialNPC extends hz.Component<typeof TutorialNPC> {
  static propsDefinition = {
    // Optional: NPC entity containing the AssetBundle/Animator. If not provided, use this entity.
    npc: { type: hz.PropTypes.Entity, default: undefined },
    // Initial animation to play once on load (optional). Leave empty to skip.
    animation: { type: hz.PropTypes.String, default: "EmoteCelebration" },
    // Optional small delay (ms) before first animation/loop
    delayMs: { type: hz.PropTypes.Number, default: 0 },

    // Attention loop configuration
    attentionLoopEnabled: { type: hz.PropTypes.Boolean, default: true },
    attentionEmotes: { type: hz.PropTypes.StringArray, default: ["EmoteWave", "EmoteTaunt", "EmoteCheer"] },
    attentionEmoteIntervalMsMin: { type: hz.PropTypes.Number, default: 3500 },
    attentionEmoteIntervalMsMax: { type: hz.PropTypes.Number, default: 7000 },

    // Optional sound to play during attention emotes (single Audio Gizmo entity)
    attentionSounds: { type: hz.PropTypes.Entity },

    // Player proximity for attention
    attentionRadius: { type: hz.PropTypes.Number, default: 8 },

    // Optional: stop attention loop when player interacts with this trigger
    interactionTrigger: { type: hz.PropTypes.Entity, default: undefined },
  };

  private assetRef_?: ab.AssetBundleInstanceReference;
  private attentionEmoteTimer_: number | undefined;
  private loopActive_: boolean = false;
  private players_: hz.Player[] = [];
  private targetEntity_?: hz.Entity;

  start() {
    const targetEntity = (this.props.npc ?? this.entity);
    this.targetEntity_ = targetEntity;
    const gizmo = targetEntity.as(ab.AssetBundleGizmo);
    this.assetRef_ = gizmo?.getRoot();
    if (!this.assetRef_) {
      console.warn(
        "TutorialNPC: No AssetBundle root found on",
        targetEntity.name.get()
      );
      return;
    }

    const play = () => {
      const anim = this.props.animation ?? "";
      if (!anim) return; // skip if empty

      if (anim === "Death") {
        // Death is a bool param in this project; briefly set then reset
        this.assetRef_?.setAnimationParameterBool("Death", true);
        this.async.setTimeout(() => {
          this.assetRef_?.setAnimationParameterBool("Death", false);
        }, 4000);
      } else {
        // One-shot/emote animations use triggers
        this.assetRef_?.setAnimationParameterTrigger(anim, false);
      }

      console.log(
        `TutorialNPC: Played "${anim}" on ${this.entity.name.get()}`
      );
    };

    const delay = Math.max(0, this.props.delayMs ?? 0);

    // Ensure the asset is loaded before triggering, retry briefly if needed
    const tryPlayWhenReady = (attemptsLeft: number) => {
      const ready = (gizmo?.isLoaded?.() ?? true) && (this.assetRef_?.isLoaded?.() ?? true);
      if (ready) {
        if (delay > 0) this.async.setTimeout(play, delay); else play();
        return;
      }
      if (attemptsLeft <= 0) {
        // Fallback: attempt to play anyway after delay
        if (delay > 0) this.async.setTimeout(play, delay); else play();
        return;
      }
      this.async.setTimeout(() => tryPlayWhenReady(attemptsLeft - 1), 100);
    };

    tryPlayWhenReady(20); // try for ~2s total

    // Wire optional interaction trigger to stop the attention loop
    if (this.props.interactionTrigger) {
      this.connectCodeBlockEvent(this.props.interactionTrigger, hz.CodeBlockEvents.OnPlayerEnterTrigger, (player: hz.Player) => {
        this.stopAttentionLoop();
      });
    }

    // Begin attention loop after initial animation (if enabled)
    const startLoop = () => {
      if (this.props.attentionLoopEnabled) {
        this.startAttentionLoop();
      }
    };
    if (delay > 0) {
      this.async.setTimeout(startLoop, delay + 50);
    } else {
      this.async.setTimeout(startLoop, 50);
    }

    // Track players in world for eligibility checks
    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterWorld, (player: hz.Player) => {
      this.players_.push(player);
    });
    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerExitWorld, (player: hz.Player) => {
      const idx = this.players_.indexOf(player);
      if (idx >= 0) this.players_.splice(idx, 1);
    });
  }

  // --- Attention loop implementation ---
  private startAttentionLoop() {
    if (this.loopActive_) return;
    this.loopActive_ = true;
    this.scheduleNextEmote();
    console.log(`TutorialNPC: Attention loop started on ${this.entity.name.get()}`);
  }

  private stopAttentionLoop() {
    this.loopActive_ = false;
    if (this.attentionEmoteTimer_ !== undefined) {
      this.async.clearTimeout(this.attentionEmoteTimer_);
      this.attentionEmoteTimer_ = undefined;
    }
    console.log(`TutorialNPC: Attention loop stopped on ${this.entity.name.get()}`);
  }

  private scheduleNextEmote() {
    if (!this.loopActive_) return;
    const min = Math.max(0, this.props.attentionEmoteIntervalMsMin ?? 2000);
    const max = Math.max(min, this.props.attentionEmoteIntervalMsMax ?? 5000);
    const delay = min + Math.random() * (max - min);

    this.attentionEmoteTimer_ = this.async.setTimeout(() => {
      const eligibles = this.getNearbyEligiblePlayers();
      if (eligibles.length > 0) {
        this.playRandomAttentionEmote(eligibles);
      }
      this.scheduleNextEmote();
    }, delay);
  }

  private playRandomAttentionEmote(eligibles: hz.Player[]) {
    if (!this.loopActive_) return;
    const emotes = this.props.attentionEmotes ?? [];
    if (!emotes || emotes.length === 0) return;
    const name = this.chooseRandom(emotes);
    if (!name) return;
    this.assetRef_?.setAnimationParameterTrigger(name, false);
    // No special-case for Death here; attention loop should avoid it
    // Play sound in sync (for now, single sound entity)
    this.playAttentionSoundForPlayers(eligibles);
  }

  private playAttentionSoundForPlayers(eligibles: hz.Player[]) {
    if (!this.loopActive_) return;
    if (!this.props.attentionSounds) return;
    const entity = this.props.attentionSounds;
    if (!entity) return;
    const audio = entity.as(hz.AudioGizmo);
    if (!audio) {
      console.warn("TutorialNPC: Provided sound entity is not an AudioGizmo", entity.name.get());
      return;
    }
    try {
      audio.play({ fade: 0, players: eligibles });
    } catch (e) {
      console.warn("TutorialNPC: AudioGizmo.play failed", e);
    }
  }

  private getNearbyEligiblePlayers(): hz.Player[] {
    const origin = (this.targetEntity_ ?? this.entity).position.get();
    const radius = Math.max(0, this.props.attentionRadius ?? 8);
    const result: hz.Player[] = [];
    for (const p of this.players_) {
      try {
        const dist = p.position.get().sub(origin).magnitude();
        if (dist <= radius && this.playerNeedsAttention(p)) {
          result.push(p);
        }
      } catch (_e) {
        // ignore if player position not available
      }
    }
    return result;
  }

  // Hard-coded for now; replace with your real condition (e.g., quest state per player)
  private playerNeedsAttention(_player: hz.Player): boolean {
    return true;
  }

  private chooseRandom<T>(arr: ReadonlyArray<T>): T | undefined {
    if (!arr || arr.length === 0) return undefined;
    const idx = Math.floor(Math.random() * arr.length);
    return arr[idx];
  }
}
hz.Component.register(TutorialNPC);