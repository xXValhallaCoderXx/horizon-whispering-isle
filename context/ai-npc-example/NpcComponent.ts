import * as hz from 'horizon/core';
import {NpcEvents, Npc, NpcEngagementPhase, NpcPlayer} from 'horizon/npc';
import * as Globals from 'Globals'


/**
 * NpcManager is built on top of the Incremental Sim reference world.
 * 
 * NpcManager is a central interface for simple management of multiple static NPCs in the small
 * World space of the Incremental Sim world.
 * 
 * This presents a static function based API for simplicity of demonstrating
 * usage of the NPC Conversation API.  More complicated use cases may architecturally 
 * benefit from using Events and State Machines when feedback is desired from NPCs,
 * in order to avoid circular dependencies.
 * 
 * These static functions show the various combinations of conversation calls made,
 * which are specific to underlying World.  Developers should expect to experiment
 * with various strings and combinations depending on the NPC's purpose and the 
 * mechanics of the World, specifically:
 *   * setDynamicContext
 *   * addEventPerception
 *   * ellicitResponse (via NpcManager.ellicitClosestGizmo)
 */
export class NpcManager {

  // Parallel arrays
  static instances : NpcComponent [] = [];        // All the NpcComponents in this world
  static gizmos : Npc[] = [];                     // All the NPC Gizmos in this world

    /**
   * Called when a user changes a grabbale, eg picks up a pickaxe
   * @param player - The user in question
   * @param equipName - The descriptive name of the grabbable
   */
  static onPlayerEquipped(player : hz.Player, equipName : string) {
    const gizmosTouched : Npc[] = [];
    for(let i = 0; i < NpcManager.instances.length; ++i) {
      const instance = NpcManager.instances[i];
      if(instance.props.equipment) {
        const gizmo = NpcManager.gizmos[i];
        gizmo.conversation.setDynamicContext(`${player.name.get()}_grabbable`, `Player ${player.name.get()} equipped the ${equipName.replace('_', ' ').toLowerCase()}`);
        gizmosTouched.push(gizmo);
      }
    }

    NpcManager.ellicitClosestGizmo(player, gizmosTouched, `Comment on Player ${player.name.get()} equipping the the ${equipName.replace('_', ' ').toLowerCase()}`);
  }

    /**
   * Called when a user changes an attachable, eg puts on a backpack
   * @param player - The user in question
   * @param attachName - The descriptive name of the grabbable
   */
  static onPlayerAttached(player : hz.Player, attachName : string) {
    const gizmosTouched : Npc[] = [];
    attachName = attachName.replace('_', ' ').toLowerCase();
    for(let i = 0; i < NpcManager.instances.length; ++i) {
      const instance = NpcManager.instances[i];
      if(instance.props.equipment) {
        const gizmo = NpcManager.gizmos[i];
        gizmo.conversation.setDynamicContext(`${player.name.get()}_attachable`, `Player ${player.name.get()} attached the ${attachName}`);
        gizmosTouched.push(gizmo);
      }
    }

    NpcManager.ellicitClosestGizmo(player, gizmosTouched, `Comment on Player ${player.name.get()} changing attachable to ${attachName}`);
  }

    /**
   * Called when a user swings the axe and misses
   * @param player - The user in question
   */
  static onPlayerAxeMissed(player : hz.Player) {
    for(let i = 0; i < NpcManager.instances.length; ++i) {
      const instance = NpcManager.instances[i];
      if(instance.props.swing) {
        const gizmo = NpcManager.gizmos[i];
        gizmo.conversation.addEventPerception(`Player ${player.name.get()} swung the pickaxe and missed`);
      }
    }
  }

  /**
   * Called when a user swings the axe and hits ore
   * @param player - The user in question
   */
  static onPlayerAxeHitOre(player : hz.Player) {
    for(let i = 0; i < NpcManager.instances.length; ++i) {
      const instance = NpcManager.instances[i];
      if(instance.props.swing) {
        const gizmo = NpcManager.gizmos[i];
        gizmo.conversation.addEventPerception(`Player ${player.name.get()} swung the pickaxe and hit ore`);
      }
    }
  }

  /**
   * Called when a user swings the axe but the axe is dull
   * @param player - The user in question
   */
  static onPlayerAxeDull(player : hz.Player) {
    const gizmosTouched : Npc[] = [];
    for(let i = 0; i < NpcManager.instances.length; ++i) {
      const instance = NpcManager.instances[i];
      if(instance.props.equipment) {
        const gizmo = NpcManager.gizmos[i];
        gizmo.conversation.setDynamicContext(`${player.name.get()}_axe`, `Player ${player.name.get()} pickaxe is now dull which impedes quarrying`);
        gizmosTouched.push(gizmo);
      }
    }
    NpcManager.ellicitClosestGizmo(player, gizmosTouched, `Mock Player ${player.name.get()} for using a dull axe`);
  }

  /**
   * Called when a user collects a resource, typically ore
   * @param player - The user in question
   * @param resourceType - Descriptive string of the resource
   */
  static onPlayerCollectedResource(player : hz.Player, resourceType : string) {
    const gizmosTouched : Npc[] = [];
    resourceType = resourceType.replace('_', ' ').toLocaleLowerCase();
    for(let i = 0; i < NpcManager.instances.length; ++i) {
      const instance = NpcManager.instances[i];
      if(instance.props.inventory) {
        const gizmo = NpcManager.gizmos[i];
        gizmo.conversation.addEventPerception(`Player ${player.name.get()} collected ${resourceType} resource from quarrying and put it in their inventory`);
        gizmosTouched.push(gizmo);
      }
    }
    NpcManager.ellicitClosestGizmo(player, gizmosTouched);
  }

  /**
   * Called when a user's Incremental Sim inventory is full
   * @param player - The user in question
   */
  static onPlayerInventoryFull(player : hz.Player) {
    const gizmosTouched : Npc[] = [];

    for(let i = 0; i < NpcManager.instances.length; ++i) {
      const instance = NpcManager.instances[i];
      if(instance.props.inventory) {
        const gizmo = NpcManager.gizmos[i];
        gizmo.conversation.setDynamicContext(`${player.name.get()}_inventory_full`, `Player ${player.name.get()} has a full inventory and cannot collect any more ore`);
        gizmosTouched.push(gizmo);
      }
    }

    NpcManager.ellicitClosestGizmo(player, gizmosTouched, `Comment on the full inventory of player ${player.name.get()}`);
  }

  /**
   * Called when a user teleports, most often from falling off the platform
   * @param player - The user in question
   * @param target - A descriptive string of the teleportation target
   */
  static onPlayerTeleport(player : hz.Player, target : string) {
    const gizmosTouched : Npc[] = [];
    for(let i = 0; i < NpcManager.instances.length; ++i) {
      const gizmo = NpcManager.gizmos[i];
      gizmo.conversation.addEventPerception(`Player ${player.name.get()} teleported to ${target}`);
      gizmosTouched.push(gizmo);
    }
    NpcManager.ellicitClosestGizmo(player, gizmosTouched, `Teleportation is not for me`);
  }

  /**
   * Called when a user steps on the resource converter
   * @param player - The user in question
   * @param from - Descriptive string of the original resource
   * @param to - Descriptive string of the converted resource
   */
  static onPlayerResourceConvert(player : hz.Player, from : string, to : string) {
    const gizmosTouched : Npc[] = [];
    for(let i = 0; i < NpcManager.instances.length; ++i) {
      const gizmo = NpcManager.gizmos[i];
      gizmo.conversation.addEventPerception(`Player ${player.name.get()} converted resource from ${from} to ${to}`);
      gizmo.conversation.removeDynamicContext(`${player.name.get()}_inventory_full`);
      gizmosTouched.push(gizmo);
    }
    NpcManager.ellicitClosestGizmo(player, gizmosTouched);
  }

  /**
   * Called when a user purchases an item from the store
   * @param player - The user in question
   * @param item - The descriptive string of the purchased item in question
   */
  static onPlayerPurchase(player : hz.Player, item : string) {
    const gizmosTouched : Npc[] = [];
    for(let i = 0; i < NpcManager.instances.length; ++i) {
      const instance = NpcManager.instances[i];
      if(instance.props.store) {
        const gizmo = NpcManager.gizmos[i];
        gizmo.conversation.addEventPerception(`Player ${player.name.get()} purchased ${item}`);
        gizmosTouched.push(gizmo);
      }
    }
    NpcManager.ellicitClosestGizmo(player, gizmosTouched);
  }

  /**
   * Call when in-game store prices change
   * @param storeId - Unique ID for a store
   * @param itemList - The items available in this particular store
   * @param player - the user in question
   */
  static setStoreData(
    storeId: number
    , itemList: Array<{name : string, description : string, level : number, price : [number, number, number, number] }>
    , player: hz.Player) {

    let stringArray : string[] = [];
    const priceCurrencies = ['green', `blue`, `purple`, `red`];
    for(const item of itemList) {
      const currency = item.price.find((val) => val != 0);
      let priceStr = 'free';
      if(currency != undefined) {
        priceStr = `${currency} ${priceCurrencies[item.price.indexOf(currency)]} currency`;
      }
      const newItemStr = `Item name: ${item.name}; level: ${item.level}; cost ${priceStr}; description: ${item.description}`;
      stringArray.push(newItemStr);
      
      for(let i = 0; i < NpcManager.instances.length; ++i) {
        const gizmo = NpcManager.gizmos[i];
        gizmo.conversation.setDynamicContext(`store_${storeId}_${player.name.get()}_${item.name}`, newItemStr);
      }
    }
  }

  /**
   * Call when the player's funds change
   * @param type - type of currency
   * @param value - numerical amount
   * @param player - user in question
   */
  static setPlayerResource( type : string, value : number, player : hz.Player ) {
    for(let i = 0; i < NpcManager.instances.length; ++i) {
        const gizmo = NpcManager.gizmos[i];
        gizmo.conversation.setDynamicContext(`${player.name.get()}_${type}_resource`, value.toString());
    }
  }

  static updateActive = false;            // Track whether the static update is active
  static lastUpdatedGizmo = -1;           // Track the last NPC updated to avoid the uncanny valley and other undesirable user experiences
  static npcSpeaking = false;             // Track whether an NPC is speaking to avoid too much simultaneous chatter with only a single player (not intended to be 100%)
  static npcLastStoppedSpeakingMS = 0;    // Track the last time an NPC spoke to avoid too much chatter

  /**
   *  Static update loop for centralized conversation management
   */ 
  static update() {
    
    // Regularly say something, one at a time
    NpcManager.lastUpdatedGizmo = (NpcManager.lastUpdatedGizmo + 1) % NpcManager.gizmos.length;

    // Let NPCs chatter in the background on a timer
    const gizmo = NpcManager.gizmos[NpcManager.lastUpdatedGizmo];
    const instance = NpcManager.instances[NpcManager.lastUpdatedGizmo];
    if(!NpcManager.npcSpeaking && 
      (Date.now() - NpcManager.npcLastStoppedSpeakingMS > 20 * 1000) &&   // Every 20 seconds is the magic number for the right feel
      instance.engagementPhase != NpcEngagementPhase.Listening &&         // Don't get in the way of users speaking to the NPC
      instance.engagementPhase != NpcEngagementPhase.Reacting &&          // Don't get in the way of users speaking to the NPC
      instance.engagementPhase != NpcEngagementPhase.Responding) {        // Don't get in the way of users speaking to the NPC
      NpcComponent.elicitResponse(gizmo);      // Have an NPC talk about their latest "thoughts"
    }

    // Regularly rotate the NPC to face the player
    const player = instance.findClosestPlayer();
    if(player) {
      instance.npcPlayer?.rotateTo(player.position.get().sub(instance.npcPlayer.position.get()));
    }
  }

  
  /**
   * Find an NPC gizmo closest to the player from the given array
   * @param player - User to check against
   * @param gizmosToCheck - Which NPC gizmos are elligible
   * @returns The closest Gizmo from gizmosToCheck to the player
   */
  public static getGizmoClosestToPlayer(player : hz.Player, gizmosToCheck : Npc[]) : Npc | undefined {

    if(gizmosToCheck.length == 0) {
      return undefined;
    }
    if(gizmosToCheck.length == 1) {
      return gizmosToCheck[0];
    }

    const playerPosition = player.position.get();
    let closestGizmo: Npc | undefined = undefined;
    let minDistanceSq = Infinity;

    for(const gizmo of gizmosToCheck) {
      const gizmoPos = gizmo.position.get();
      const distanceSq = playerPosition.distanceSquared(gizmoPos);
      if (distanceSq < minDistanceSq) {
        minDistanceSq = distanceSq;
        closestGizmo = gizmo;
      }
    }

    return closestGizmo;
  }

  /**
   * Finds the closest NPC to a user and call ellicitResponse.
   * @param player - the user 
   * @param gizmosToCheck - which NPCs are elligible
   * @param instruction - optional instruction string to pass to ellicitResponse
   * @returns The ellicitResponse Promise
   */
  static ellicitClosestGizmo(player : hz.Player, gizmosToCheck : Npc[], instruction? : string) {
    const gizmo = NpcManager.getGizmoClosestToPlayer(player, gizmosToCheck);
    if(gizmo) {
      return NpcComponent.elicitResponse(gizmo, instruction);
    }
  }
}

/**
 * NpcComponent is built on top of the Incremental Sim reference world.
 * @param talkTrigger - Trigger zone for Players to start a voice conversation with the NPC
 * @param pickaxe - Toggle for whether this NPC responds to the player changing equipment
 * @param swing - Toggle for whether this NPC responds to swing events
 * @param inventory - Toggle for whether this NPC responds to inventory events
 * @param store - Toggle for whether this NPC responds to in-game player purchases
 * @param welcome - Special instruction string to the LLM for the first time a player enters the NPC trigger zone
 */
export class NpcComponent extends hz.Component<typeof NpcComponent> {
  static propsDefinition = {
    talkTrigger: { type : hz.PropTypes.Entity },
    equipment: { type : hz.PropTypes.Boolean },
    swing: { type : hz.PropTypes.Boolean },
    inventory: { type : hz.PropTypes.Boolean },
    store: { type : hz.PropTypes.Boolean },
    welcome: { type : hz.PropTypes.String },
  };


  playedWelcomeFor = new Set<number>();         // Track who has already heard the welcome
  engagementPhase = NpcEngagementPhase.Idle;    // Track whether the NpcEngagementPhase
  npcPlayer? : NpcPlayer;



  /**
   * @returns The closes player to this NPC instance
   */
  public findClosestPlayer(): hz.Player | undefined {
    const players = this.world.getPlayers();
    if (players.length === 0) {
      return undefined;
    }

    const entityPosition = this.entity.position.get();
    let closestPlayer: hz.Player | undefined = undefined;
    let minDistanceSq = Infinity;

    const thisEntityOwner = this.entity.owner.get();
    for (const player of players) {
      if(player.id == thisEntityOwner.id || Npc.playerIsNpc(player) || player.id == this.world.getServerPlayer().id) {
        continue;
      }
      const playerPosition = player.position.get();
      const distanceSq = entityPosition.distanceSquared(playerPosition);

      if (distanceSq < minDistanceSq) {
        minDistanceSq = distanceSq;
        closestPlayer = player;
      }
    }

    return closestPlayer;
  }

  /**
   * Tries to ensure not too many NPCs are chattering at once.  Would require
   * a more robust implementation as the NPC count increases.
   * @param gizmo - specific NPC in question
   * @param instruction - optional instruction string to pass to ellicitResponse
   * @returns The ellicitResponse Promise
   */
  static elicitResponse(gizmo : Npc, instruction?: string) {
    if(!NpcManager.npcSpeaking) {
      const retVal = gizmo.conversation.elicitResponse(instruction);
      NpcManager.lastUpdatedGizmo = NpcManager.gizmos.indexOf(gizmo);
      return retVal;
    }
  }

  /**
   * NPCMananger.preStart is used to keep global track of this World's NPCs,
   * which are all expected to Spawn On Start.
   */
  preStart() {
    NpcManager.instances.push(this);
    NpcManager.gizmos.push(this.entity.as(Npc));
  }

  /**
   * NpcManager.start sets up event handlers and the update loop.
   */
  async start() {

    // init update loop
    if(!NpcManager.updateActive) {
      NpcManager.updateActive = true;
      this.async.setInterval( NpcManager.update, 5 * 1000 );
    } 

    this.connectNetworkEvent(this.entity, NpcEvents.OnNpcStartedSpeaking, (npc) => {
      NpcManager.npcSpeaking = true;
    })
    this.connectNetworkEvent(this.entity, NpcEvents.OnNpcStoppedSpeaking, (npc) => {
      NpcManager.npcSpeaking = false;
      NpcManager.npcLastStoppedSpeakingMS = Date.now();
    })
    this.connectNetworkEvent(this.entity, NpcEvents.OnNpcEngagementChanged, (payload) => 
      this.engagementPhase = payload.phase 
    );
    
    this.connectNetworkEvent(this.entity, NpcEvents.OnNpcError, (payload) => {
      console.error(`OnNpcError ${payload.category} / ${payload.errorCode} / ${payload.playerId} / ${this.entity.name.get()} / ${payload.errorMessage}`);
    })

    // Listen to the player when they're close
    if(this.props.talkTrigger) {
      this.connectCodeBlockEvent(this.props.talkTrigger, hz.CodeBlockEvents.OnPlayerEnterTrigger, (player) => this.onPlayerEnterTalkTrigger(player));
      this.connectCodeBlockEvent(this.props.talkTrigger, hz.CodeBlockEvents.OnPlayerExitTrigger, (player) => this.onPlayerExitTalkTrigger(player));
    }

    this.npcPlayer = await this.entity.as(Npc).tryGetPlayer();
  }

  /**
   * Handle the user entering the talk trigger, including elliciting a response
   * @param player - user in question
   */
  protected onPlayerEnterTalkTrigger(player : hz.Player) {
    if(Npc.playerIsNpc(player)) {
      return;
    }
    const gizmo = this.entity.as(Npc);
    this.npcPlayer?.rotateTo(player.position.get().sub(this.npcPlayer.position.get()));

    // First time welcome
    if(!NpcManager.npcSpeaking) {
      if(this.playedWelcomeFor.has(player.id)) {
        NpcComponent.elicitResponse(gizmo, `Comment on recent actions by player ${player.name.get()}`);
      }
      else {
        if(this.props.welcome && this.props.welcome.length > 0) {
          NpcComponent.elicitResponse(gizmo, this.props.welcome);
        }
        else {
          NpcComponent.elicitResponse(gizmo, "Welcome the player");
        }
        this.playedWelcomeFor.add(player.id);
      }
    }

    this.npcPlayer?.addAttentionTarget(player);
    gizmo.conversation.registerParticipant(player);
  }

  /**
   * Handle the user exiting the talk trigger
   * @param player - user in question
   */
  protected onPlayerExitTalkTrigger(player : hz.Player) {
    if(player && Npc.playerIsNpc(player)) {
      return;
    }
    const gizmo = this.entity.as(Npc);
    this.npcPlayer?.removeAttentionTarget(player);
    gizmo.conversation.unregisterParticipant(player);
  }
}

hz.Component.register(NpcComponent);