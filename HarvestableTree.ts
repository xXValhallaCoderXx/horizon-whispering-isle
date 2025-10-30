import { EventsService } from 'constants';
import { Component, PropTypes, Player, AudioGizmo, ParticleGizmo } from 'horizon/core';

class HarvestableTree extends Component<typeof HarvestableTree> {
  static propsDefinition = {
    treeChopSfx1: { type: PropTypes.Entity },
    treeChopSfx2: { type: PropTypes.Entity },
    treeChopSfx3: { type: PropTypes.Entity },
    // chopVfx: { type: PropTypes.Entity },
  };

  private lastHitTime = 0;
  private hitCooldownMs = 500;

  private chopSfxs: (AudioGizmo | undefined)[] = [];
  private chopVfx?: ParticleGizmo;

  preStart(): void {
    // Local weapon swing (client input)
    this.connectNetworkBroadcastEvent(
      EventsService.CombatEvents.AttackSwingEvent,
      (payload: any) => this.onLocalWeaponSwing(payload)
    );

    // Server-authoritative feedback
    this.connectNetworkBroadcastEvent(
      EventsService.HarvestEvents.TreeHit,
      (payload: any) => this.onTreeHitConfirmed(payload)
    );
    this.connectNetworkBroadcastEvent(
      EventsService.HarvestEvents.TreeDepleted,
      (payload: any) => this.onTreeDepleted(payload)
    );
  }

  start() {
    this.chopSfxs = [
      this.props.treeChopSfx1,
      this.props.treeChopSfx2,
      this.props.treeChopSfx3,
    ].map(e => e?.as(AudioGizmo));
    // this.chopVfx = this.props.chopVfx?.as(ParticleGizmo);
  }

  private onLocalWeaponSwing(payload: any) {
    const { owner, reach, type } = payload || {};
    if (type !== 'axe') return;

    const now = Date.now();
    if (now - this.lastHitTime < this.hitCooldownMs) return;

    if (!this.isPlayerInRange(owner as Player, reach || 1.0)) return;

    this.lastHitTime = now;

    // Ask server to validate the hit on this tree
    this.sendNetworkBroadcastEvent(EventsService.HarvestEvents.RequestTreeHit, {
      player: owner,
      treeEntity: this.entity,
      toolType: type,
      hitPosition: this.entity.position.get(),
    });
  }

  private onTreeHitConfirmed(payload: any) {
    // Optional: light feedback per hit (e.g., tiny VFX pulse or quiet chop)
    // Keep minimal to avoid double-playing when multiple players hit.
  }

  private onTreeDepleted(payload: any) {
    // Play a random chop SFX and a small leaf burst VFX at the tree’s position
    const sfxList = this.chopSfxs.filter(Boolean) as AudioGizmo[];
    const pos = this.entity.position.get();

    this.async.setTimeout(() => {
      try { this.chopVfx?.position.set(pos); } catch { }
      try { this.chopVfx?.play({ oneShot: true }); } catch { }

      if (sfxList.length > 0) {
        const i = Math.floor(Math.random() * sfxList.length);
        try { sfxList[i].play(); } catch { }
      }
    }, 300);
  }

  private isPlayerInRange(player: Player, reach: number): boolean {
    if (!player) return false;
    const p = player.position.get();
    const t = this.entity.position.get();
    const d = Math.hypot(p.x - t.x, p.y - t.y, p.z - t.z);
    // Trees are larger; allow a slightly bigger buffer
    return d <= reach + 2.0;
  }
}
Component.register(HarvestableTree);