import * as hz from 'horizon/core';
import * as ab from 'horizon/unity_asset_bundles';

/**
 * NpcManager: encapsulates NPC animation + attention loop logic.
 * Attach this to an entity and point npcRoot at the parent that contains the UAB child,
 * or leave npcRoot empty to auto-discover a child AssetBundle under this entity.
 */
export class NpcManager extends hz.Component<typeof NpcManager> {
    static propsDefinition = {
        // Optional parent/root to search under for the AssetBundle gizmo
        npcRoot: { type: hz.PropTypes.Entity, default: undefined },
        // Optional: directly reference the AssetBundle Gizmo entity if you know it
        npcAssetBundle: { type: hz.PropTypes.Entity, default: undefined },

        // Attention loop configuration
        attentionLoopEnabled: { type: hz.PropTypes.Boolean, default: true },
        attentionEmotes: { type: hz.PropTypes.StringArray, default: ["EmoteWave", "EmoteTaunt"] },
        attentionEmoteIntervalMsMin: { type: hz.PropTypes.Number, default: 3500 },
        attentionEmoteIntervalMsMax: { type: hz.PropTypes.Number, default: 7000 },
        attentionSounds: { type: hz.PropTypes.Entity }, // Audio Gizmo entity (single)
        attentionRadius: { type: hz.PropTypes.Number, default: 8 },
    };

    private assetRef_?: ab.AssetBundleInstanceReference;
    private targetEntity_?: hz.Entity; // origin for proximity
    private attentionEmoteTimer_: number | undefined;
    private loopActive_ = false;
    private players_: hz.Player[] = [];
    private dialogOpenPlayers_ = new Set<hz.Player>();

    start() {
        this.resolveAssetAndStart();
    }

    // Public API for other scripts (e.g., NPC.ts)
    public startAttentionLoop() {
        if (this.loopActive_) return;
        this.loopActive_ = true;
        this.scheduleNextEmote();
        console.log(`NpcManager: Attention loop started on ${this.entity.name.get()}`);
    }

    public stopAttentionLoop() {
        this.loopActive_ = false;
        if (this.attentionEmoteTimer_ !== undefined) {
            this.async.clearTimeout(this.attentionEmoteTimer_);
            this.attentionEmoteTimer_ = undefined;
        }
        console.log(`NpcManager: Attention loop stopped on ${this.entity.name.get()}`);
    }

    public playEmoteNow(name: string, eligibles?: hz.Player[]) {
        if (!this.assetRef_) return;
        if (!name) return;
        this.assetRef_.setAnimationParameterTrigger(name, false);
        // Play sound in sync if provided
        if (eligibles && eligibles.length > 0) {
            this.playAttentionSoundForPlayers(eligibles);
        }
    }

    // Mark a player's dialog state. When any player has dialog open, we only animate
    // if other non-dialog players are nearby; sounds target only those non-dialog players.
    public setDialogOpen(player: hz.Player, open: boolean) {
        if (open) {
            this.dialogOpenPlayers_.add(player);
        } else {
            this.dialogOpenPlayers_.delete(player);
        }
    }

    // --- Internal loop ---
    private scheduleNextEmote() {
        if (!this.loopActive_) return;
        const min = Math.max(0, this.props.attentionEmoteIntervalMsMin ?? 2000);
        const max = Math.max(min, this.props.attentionEmoteIntervalMsMax ?? 5000);
        const delay = min + Math.random() * (max - min);

        this.attentionEmoteTimer_ = this.async.setTimeout(() => {
            const eligibles = this.getNearbyEligiblePlayers();
            // If any players have dialog open, only service non-dialog eligibles
            const nonDialogEligibles = eligibles.filter(p => !this.dialogOpenPlayers_.has(p));

            if (this.dialogOpenPlayers_.size > 0) {
                // When someone is in dialog, animate only if others are around
                if (nonDialogEligibles.length > 0) {
                    const name = this.chooseRandom(this.props.attentionEmotes ?? []);
                    if (name && this.assetRef_) {
                        try { this.assetRef_.setAnimationParameterTrigger(name, false); } catch (e) { console.warn('NpcManager: Failed to trigger animation', name, e); }
                    }
                    this.playAttentionSoundForPlayers(nonDialogEligibles);
                }
            } else {
                // No one in dialog: always animate; play sound only if eligibles nearby
                const name = this.chooseRandom(this.props.attentionEmotes ?? []);
                if (name && this.assetRef_) {
                    try { this.assetRef_.setAnimationParameterTrigger(name, false); } catch (e) { console.warn('NpcManager: Failed to trigger animation', name, e); }
                }
                if (eligibles.length > 0) {
                    this.playAttentionSoundForPlayers(eligibles);
                }
            }
            this.scheduleNextEmote();
        }, delay);
    }

    private playAttentionSoundForPlayers(eligibles: hz.Player[]) {
        if (!this.loopActive_) return;
        const entity = this.props.attentionSounds;
        if (!entity) return;
        const audio = entity.as(hz.AudioGizmo);
        if (!audio) {
            console.warn('NpcManager: attentionSounds is not an AudioGizmo', entity.name.get());
            return;
        }
        try {
            audio.play({ fade: 0, players: eligibles });
        } catch (e) {
            console.warn('NpcManager: AudioGizmo.play failed', e);
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

    // Replace with your real per-player logic
    private playerNeedsAttention(_player: hz.Player): boolean { return true; }

    private chooseRandom<T>(arr: ReadonlyArray<T>): T | undefined {
        if (!arr || arr.length === 0) return undefined;
        const idx = Math.floor(Math.random() * arr.length);
        return arr[idx];
    }

    private resolveAssetAndStart() {
        // Resolve explicit asset first if provided
        let abg: ab.AssetBundleGizmo | undefined;
        let ref: ab.AssetBundleInstanceReference | undefined;
        if (this.props.npcAssetBundle) {
            const explicit = this.props.npcAssetBundle.as(ab.AssetBundleGizmo);
            const r = explicit?.getRoot?.();
            if (explicit && r) {
                abg = explicit; ref = r;
            }
        }

        // Else, search under npcRoot or this.entity
        if (!ref) {
            const searchRoot = this.props.npcRoot ?? this.entity;
            const found = this.findAssetBundle(searchRoot, 12);
            if (found) { abg = found.abg; ref = found.root; }
            if (!abg || !ref) {
                console.warn('NpcManager: No AssetBundle found under', searchRoot.name.get());
                return;
            }
        }

        this.assetRef_ = ref;
        this.targetEntity_ = abg;

        // Track players for proximity eligibility
        this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterWorld, (player: hz.Player) => {
            this.players_.push(player);
        });
        this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerExitWorld, (player: hz.Player) => {
            const idx = this.players_.indexOf(player);
            if (idx >= 0) this.players_.splice(idx, 1);
        });

        // Wait for UAB + root ready before starting (best-effort)
        const tryStartWhenReady = (attempts: number) => {
            const ready = (abg?.isLoaded?.() ?? true) && (ref?.isLoaded?.() ?? true);
            if (ready) {
                if (this.props.attentionLoopEnabled) this.async.setTimeout(() => this.startAttentionLoop(), 50);
                // Optional: log available animator parameters once on first start
                try { const params = this.assetRef_?.getAnimationParameters?.(); params && console.log('NpcManager: Animator params', params); } catch { }
                return;
            }
            if (attempts <= 0) {
                console.warn('NpcManager: Asset not reported ready; starting loop anyway');
                if (this.props.attentionLoopEnabled) this.async.setTimeout(() => this.startAttentionLoop(), 50);
                return;
            }
            this.async.setTimeout(() => tryStartWhenReady(attempts - 1), 100);
        };
        tryStartWhenReady(30); // ~3s
    }

    private findAssetBundle(root: hz.Entity, depth: number = 8): { abg: ab.AssetBundleGizmo, root: ab.AssetBundleInstanceReference } | undefined {
        // Try root as gizmo
        let abg = root.as(ab.AssetBundleGizmo);
        let ref = abg?.getRoot?.();
        if (ref) return { abg, root: ref } as any;
        // DFS children
        const found = this.findChildAssetBundleGizmo(root, depth);
        if (found) {
            return { abg: found, root: found.getRoot() };
        }
        return undefined;
    }

    private findChildAssetBundleGizmo(parent: hz.Entity, maxDepth: number = 6): ab.AssetBundleGizmo | undefined {
        if (maxDepth < 0) return undefined;
        try {
            const kids = parent.children.get() || [];
            for (const child of kids) {
                const abg = child.as(ab.AssetBundleGizmo);
                const root = abg?.getRoot?.();
                if (root) return abg;
                const nested = this.findChildAssetBundleGizmo(child, maxDepth - 1);
                if (nested) return nested;
            }
        } catch { /* ignore */ }
        return undefined;
    }
}

hz.Component.register(NpcManager);
