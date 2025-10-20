
import { DialogContainer } from 'Dialog_UI';
import { DialogScript, QuestStage } from 'DialogScript';
import * as hz from 'horizon/core';
import { AudioGizmo, AudibilityMode, } from 'horizon/core';
import { EventsService } from './constants';

export class DialogEvents {
    public static requestDialog = new hz.NetworkEvent<{ player: hz.Player, key: number[] }>('sendDialogTreeKey'); // send the key to the dialog script to get the dialog tree
    public static sendDialogScript = new hz.NetworkEvent<{ container?: DialogContainer }>('sendDialogScript');
    public static onEnterTalkableProximity = new hz.NetworkEvent<{ npc: hz.Entity }>('onEnterNpcTrigger')
}

export class NPC extends hz.Component<typeof NPC> {
    static propsDefinition = {
        name: { type: hz.PropTypes.String }, // the human-readable name of the NPC
        proximityTrigger: { type: hz.PropTypes.Entity }, // trigger player enters to make this the NPC we are interacting with
        dialogScript: { type: hz.PropTypes.Entity }, // first entity in the list of dialog scripts
        questAcceptedSound: { type: hz.PropTypes.Entity },
    };

    private scriptData?: DialogScript;

    start() {
        this.scriptData = this.props.dialogScript?.getComponents<DialogScript>()[0]
        this.connectCodeBlockEvent(this.props.proximityTrigger!, hz.CodeBlockEvents.OnPlayerEnterTrigger, (player: hz.Player) => this.onPlayerEnterTrigger(player))
        this.connectNetworkEvent(this.entity, DialogEvents.requestDialog, (payload) => this.onOptionReceived(payload.player, payload.key))
    }

    private onPlayerEnterTrigger(player: hz.Player) {
        this.sendNetworkBroadcastEvent(DialogEvents.onEnterTalkableProximity, { npc: this.entity }, [player])
    }

    private onOptionReceived(player: hz.Player, key: number[]) {
        // Determine player's quest stage via optional events (fallback to NotStarted)
        let stage: QuestStage | null = null;
        const qsAny: any = EventsService.QuestEvents as any;
        if (qsAny && qsAny.RequestPlayerStage && qsAny.PlayerStageResponse) {
            const sub = this.connectLocalBroadcastEvent(qsAny.PlayerStageResponse, (resp: { player: hz.Player, stage: QuestStage }) => {
                if (resp.player === player) stage = resp.stage;
            });
            this.sendLocalBroadcastEvent(qsAny.RequestPlayerStage, { player });
            sub.disconnect();
        }

        // Widen type to avoid literal-narrowing
        const stageForDialog: QuestStage = ((stage ?? ('NotStarted' as unknown as string)) as unknown) as QuestStage;

        // Use stage-aware dialog if available; fallback to static
        let dialog = this.scriptData?.getDialogFromTreeForStage(stageForDialog, key) ?? this.scriptData?.getDialogFromTree(key)

        // Trigger quest only when player confirms (presses closing option)
        const questOnCloseId = this.scriptData?.getQuestIdOnClose(key);
        if (!dialog) {
            // Dialog closed: perform side-effects depending on stage
            if (questOnCloseId && stageForDialog === 'NotStarted') {
                this.sendLocalBroadcastEvent(EventsService.QuestEvents.QuestStarted, { player, questId: questOnCloseId });

                const soundGizmo = this.props.questAcceptedSound?.as(AudioGizmo);
                const options = {
                    fade: 0,
                    players: [player],
                    audibilityMode: AudibilityMode.AudibleTo,
                };
                soundGizmo && soundGizmo.play(options);
            }

            if (stageForDialog === 'ReturnToNPC') {
                // Complete talk objective by emitting a quest submission with npc token
                const npcName = ((this.props.name as string) || '').toLowerCase();
                this.sendLocalBroadcastEvent(EventsService.QuestEvents.CheckPlayerQuestSubmission, {
                    player,
                    itemType: `npc:${npcName}`,
                    amount: 1,
                });
            }
        }
        if (dialog) {
            dialog.title = this.props.name
        }
        this.sendNetworkBroadcastEvent(DialogEvents.sendDialogScript, { container: dialog }, [player])
    }
}
hz.Component.register(NPC);
