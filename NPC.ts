
import { DialogContainer } from 'Dialog_UI';
import { DialogScript, QuestStage } from 'DialogScript';
import * as hz from 'horizon/core';
import { AudioGizmo, AudibilityMode, } from 'horizon/core';
import { EventsService } from './constants';
import { NpcManager } from './NpcManager';

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
    // Optional: link to an entity that has NpcManager attached (e.g., your UAB entity)
    npcManager: { type: hz.PropTypes.Entity, default: undefined },
  };

  private scriptData?: DialogScript;
  private stageByPlayer = new Map<hz.Player, QuestStage>();

  start() {
    this.scriptData = this.props.dialogScript?.getComponents<DialogScript>()[0]
    this.connectCodeBlockEvent(this.props.proximityTrigger!, hz.CodeBlockEvents.OnPlayerEnterTrigger, (player: hz.Player) => this.onPlayerEnterTrigger(player))
    this.connectCodeBlockEvent(this.props.proximityTrigger!, hz.CodeBlockEvents.OnPlayerExitTrigger, (player: hz.Player) => { this.onPlayerExitTrigger(player) })
    this.connectNetworkEvent(this.entity, DialogEvents.requestDialog, (payload) => this.onOptionReceived(payload.player, payload.key))

    // Track quest progress per player to gate dialog tree
    this.connectLocalBroadcastEvent(EventsService.QuestEvents.QuestProgressUpdated, (p) => {
      try {
        if (!p?.player) return;
        const stage = (p.stage as QuestStage) ?? 'NotStarted';
        this.stageByPlayer.set(p.player, stage);
      } catch { }
    });

  }

  private onPlayerEnterTrigger(player: hz.Player) {
    console.log(`NPC: Player ${player.name.get()} entered proximity of NPC ${this.entity.name.get()}`);
    this.sendNetworkBroadcastEvent(DialogEvents.onEnterTalkableProximity, { npc: this.entity }, [player])
    // Do not hard-stop loop here; NpcManager gates by dialog and quest state
  }

  private onPlayerExitTrigger(player: hz.Player) {
    console.log(`NPC: Player ${player.name.get()} exited proximity of NPC ${this.entity.name.get()}`);
    // No explicit start; NpcManager recomputes based on eligible players
  }



  private onOptionReceived(player: hz.Player, key: number[]) {
    // Determine stage for this player; fallback to NotStarted
    const stage = this.stageByPlayer.get(player) ?? 'NotStarted';
    const dialog = this.scriptData?.getDialogFromTreeForStage(stage, key)

    // Trigger quest only when player confirms (presses closing option)
    const questOnCloseId = this.scriptData?.getQuestIdOnClose(key);
    if (!dialog) {
      // Dialog closed: perform side-effects depending on stage
      if (questOnCloseId) {
        this.sendLocalBroadcastEvent(EventsService.QuestEvents.QuestStarted, { player, questId: questOnCloseId });

        // Inform NpcManager immediately for per-player gating
        const mgrOnAccept = this.getNpcManager();
        if (mgrOnAccept && (mgrOnAccept as any)['setQuestAccepted']) {
          try { (mgrOnAccept as any).setQuestAccepted(player, questOnCloseId); } catch { /* ignore */ }
        }

        const soundGizmo = this.props.questAcceptedSound?.as(AudioGizmo);
        const options = {
          fade: 0,
          players: [player],
          audibilityMode: AudibilityMode.AudibleTo,
        };
        soundGizmo && soundGizmo.play(options);
      }

      // If your dialog step implies talking to NPC completes an objective,
      // emit a CheckPlayerQuestSubmission using npc token.
      const npcName = ((this.props.name as string) || '').toLowerCase();
      this.sendLocalBroadcastEvent(EventsService.QuestEvents.CheckPlayerQuestSubmission, {
        player,
        itemType: `npc:${npcName}`,
        amount: 1,
      });
    }
    if (dialog) {
      dialog.title = this.props.name
    }
    // Inform NpcManager about dialog state for gating animations/sounds
    const mgr = this.getNpcManager();
    if (mgr && (mgr as any)['setDialogOpen']) {
      try { (mgr as any).setDialogOpen(player, !!dialog); } catch { /* ignore */ }
    }
    this.sendNetworkBroadcastEvent(DialogEvents.sendDialogScript, { container: dialog }, [player])
  }

  // Resolve NpcManager from prop or nearby entities (parent subtree)
  private getNpcManager(): NpcManager | undefined {
    // Direct link via prop
    const linked = this.props.npcManager?.getComponents<NpcManager>(NpcManager)[0];
    if (linked) return linked;
    // Same entity
    const same = this.entity.getComponents<NpcManager>(NpcManager)[0];
    if (same) return same;
    // Search parent subtree for a manager (siblings/children) with small depth limit
    const parent = this.entity.parent.get();
    if (!parent) return undefined;
    return this.findNpcManagerInTree(parent, 2);
  }

  private findNpcManagerInTree(node: hz.Entity, depth: number): NpcManager | undefined {
    if (depth < 0) return undefined;
    try {
      // Check on this node
      const mgrHere = node.getComponents<NpcManager>(NpcManager)[0];
      if (mgrHere) return mgrHere;
      // Recurse children
      const kids = node.children.get() || [];
      for (const child of kids) {
        const found = this.findNpcManagerInTree(child, depth - 1);
        if (found) return found;
      }
    } catch { }
    return undefined;
  }

}
hz.Component.register(NPC);
