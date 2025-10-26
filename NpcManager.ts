import * as hz from 'horizon/core';
import * as ab from 'horizon/unity_asset_bundles';
import { EventsService, QuestPayload } from './constants';

/**
 * NpcManager: encapsulates NPC animation + attention loop logic.
 * Attach this to an entity and point npcRoot at the parent that contains the UAB child,
 * or leave npcRoot empty to auto-discover a child AssetBundle under this entity.
 */
export class NpcManager extends hz.Component<typeof NpcManager> {
    static propsDefinition = {
        npcAssetBundle: { type: hz.PropTypes.Entity, default: undefined },
        questIdToDisableAttention: { type: hz.PropTypes.String, default: 'tutorial_survival' },
        attentionLoopEnabled: { type: hz.PropTypes.Boolean, default: true },
        attentionEmotes: { type: hz.PropTypes.StringArray, default: ["EmoteWave", "EmoteTaunt"] },
        attentionEmoteIntervalMsMin: { type: hz.PropTypes.Number, default: 3500 },
        attentionEmoteIntervalMsMax: { type: hz.PropTypes.Number, default: 7000 },
        attentionSounds: { type: hz.PropTypes.Entity }, // Audio Gizmo entity (single)
        attentionRadius: { type: hz.PropTypes.Number, default: 8 },
    };

    private assetRef_?: ab.AssetBundleInstanceReference;
    private attentionEmoteTimer_: number | undefined;
    private loopActive_ = false;
    private players_: hz.Player[] = [];
    private dialogOpenPlayers_ = new Set<hz.Player>();
    private acceptedPlayers_ = new Set<hz.Player>();

    start() {
        // Listen for quest lifecycle to gate attention per-player
        this.connectLocalBroadcastEvent(EventsService.QuestEvents.QuestStarted, (payload: QuestPayload) => this.onQuestStarted(payload));
        this.connectLocalBroadcastEvent(EventsService.QuestEvents.QuestCompleted, (payload: QuestPayload) => this.onQuestCompleted(payload));

        // Get asset bundle reference directly
        if (this.props.npcAssetBundle) {
            const abg = this.props.npcAssetBundle.as(ab.AssetBundleGizmo);
            this.assetRef_ = abg?.getRoot?.();
        }

        if (!this.assetRef_) {
            console.warn('NpcManager: No AssetBundle configured on', this.entity.name.get());
            return;
        }

        // Track players
        this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterWorld, (player: hz.Player) => {
            this.players_.push(player);
            this.recomputeLoopActivity();
        });

        this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerExitWorld, (player: hz.Player) => {
            const idx = this.players_.indexOf(player);
            if (idx >= 0) this.players_.splice(idx, 1);
            this.dialogOpenPlayers_.delete(player);
            this.acceptedPlayers_.delete(player);
            this.recomputeLoopActivity();
        });

        // Start loop if enabled
        if (this.props.attentionLoopEnabled) {
            this.async.setTimeout(() => this.recomputeLoopActivity(), 100);
        }
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

    // Optional: allow direct notification from NPC when quest accepted
    public setQuestAccepted(player: hz.Player, questId: string) {
        if (this.isQuestOfInterest(questId)) {
            this.acceptedPlayers_.add(player);
            this.recomputeLoopActivity();
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
                // No one in dialog: animate only if there are eligible players nearby
                if (eligibles.length > 0) {
                    const name = this.chooseRandom(this.props.attentionEmotes ?? []);
                    if (name && this.assetRef_) {
                        try { this.assetRef_.setAnimationParameterTrigger(name, false); } catch (e) { console.warn('NpcManager: Failed to trigger animation', name, e); }
                    }
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
        const origin = this.entity.position.get();
        const radius = Math.max(0, this.props.attentionRadius ?? 8);
        const result: hz.Player[] = [];
        for (const p of this.players_) {
            try {
                const dist = p.position.get().sub(origin).magnitude();
                if (dist <= radius && !this.acceptedPlayers_.has(p)) {
                    result.push(p);
                }
            } catch (_e) {
                // ignore if player position not available
            }
        }
        return result;
    }



    private chooseRandom<T>(arr: ReadonlyArray<T>): T | undefined {
        if (!arr || arr.length === 0) return undefined;
        const idx = Math.floor(Math.random() * arr.length);
        return arr[idx];
    }





    // --- Quest gating helpers ---
    private isQuestOfInterest(questId: string | undefined): boolean {
        const target = (this.props.questIdToDisableAttention ?? '').trim();
        if (!target) return false;
        return (questId ?? '').trim() === target;
    }

    private onQuestStarted(payload: QuestPayload) {
        if (!payload?.player) return;
        if (this.isQuestOfInterest(payload.questId)) {
            this.acceptedPlayers_.add(payload.player);
            this.recomputeLoopActivity();
        }
    }

    private onQuestCompleted(payload: QuestPayload) {
        if (!payload?.player) return;
        if (this.isQuestOfInterest(payload.questId)) {
            // When quest completes, attention could be re-enabled; adjust to design needs
            this.acceptedPlayers_.delete(payload.player);
            this.recomputeLoopActivity();
        }
    }




    private recomputeLoopActivity() {
        if (!this.props.attentionLoopEnabled) {
            if (this.loopActive_) this.stopAttentionLoop();
            return;
        }

        // Check if any player in world needs attention
        const shouldRun = this.players_.some(p => !this.acceptedPlayers_.has(p));

        if (shouldRun && !this.loopActive_) {
            this.startAttentionLoop();
        } else if (!shouldRun && this.loopActive_) {
            this.stopAttentionLoop();
        }
    }
}

hz.Component.register(NpcManager);
