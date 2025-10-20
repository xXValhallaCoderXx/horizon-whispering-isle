import * as hz from "horizon/core";
import * as ab from "horizon/unity_asset_bundles";

class TutorialNPC extends hz.Component<typeof TutorialNPC> {
  static propsDefinition = {
    // Optional: NPC entity containing the AssetBundle/Animator. If not provided, use this entity.
    npc: { type: hz.PropTypes.Entity, default: undefined },
    // Animator trigger or param to play on load (e.g., EmoteWave, EmoteCelebration, Attack, Hit, Death)
    animation: { type: hz.PropTypes.String, default: "EmoteCelebration" },
    // Optional small delay (ms) to ensure animator/asset is ready
    delayMs: { type: hz.PropTypes.Number, default: 0 },
  };

  private assetRef_?: ab.AssetBundleInstanceReference;

  start() {
    const targetEntity = (this.props.npc ?? this.entity);
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
      if (!anim) return;

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
  }
}
hz.Component.register(TutorialNPC);