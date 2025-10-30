import * as hz from "horizon/core";
import { AssignArrowEvent } from "ArrowFollower";
import { AssignObjectiveSequence, AssignNewTarget } from "ObjectiveSequence";

/**
 * ArrowAssignManager.ts
 *
 * Summary:
 * Manages the assignment of arrows to players in the game.
 *
 * Works with:
 * - ArrowFollower.ts - Handles the behavior of the arrow once assigned.
 * - ObjectiveSequence.ts - Manages the sequence of objectives related to the arrow.
 * - TargetBroadcaster.ts - Provides the target entity that the arrow points to.
 * - QuestWaypoint.ts - Integrates with quest waypoints for arrow assignment.
 *
 * Setup:
 *  - Move the StartArrowTrigger and RemoveArrowTrigger where you want.
 *  - Create as many trigger parameters as you wish. Right now there are three created.
 *  - In the world, duplicate the objectives, place them where you want and assign their first child to the trigger parameter you have created.
 */


export const ArrowDeleteEvent = new hz.NetworkEvent<{ player: hz.Player; }>("ArrowDeleteEvent");

class ArrowAssignManager extends hz.Component<typeof ArrowAssignManager> {
  static propsDefinition = {
    startArrowTrigger: { type: hz.PropTypes.Entity },    // The trigger entity that starts the arrow assignment
    removeArrowTrigger: { type: hz.PropTypes.Entity },   // The trigger entity that removes the arrow
    NUXArrow: { type: hz.PropTypes.Asset },              // The asset representing the arrow to be assigned
    trigger_1: { type: hz.PropTypes.Entity }, // Trigger for the first objective
    trigger_2: { type: hz.PropTypes.Entity }, // Trigger for the second objective
    trigger_3: { type: hz.PropTypes.Entity }, // Trigger for the third objective
  };

  private startArrowTrigger: hz.Entity | null = null;
  private playersWithArrow = new Set<hz.Player>();
  private playerArrowMap = new Map<hz.Player, hz.Entity>();
  private removeArrowTrigger: hz.Entity = hz.Entity.prototype;
  private triggers: hz.Entity[] = [];

  /**
   * Lifecycle method called before the start when the ArrowAssignManager component is initialized. 
   * Initializes properties and subscribes to events.
   */

  preStart(): void {
    if (this.props.startArrowTrigger) {
      this.startArrowTrigger = this.props.startArrowTrigger;
    }

    this.connectNetworkBroadcastEvent(ArrowDeleteEvent, ({ player }) => {
      this.removeArrowFromPlayer(player);
      this.startArrowTrigger?.as(hz.TriggerGizmo).enabled.set(false);
    });

    if (this.startArrowTrigger) {
      this.connectCodeBlockEvent(
        this.startArrowTrigger, hz.CodeBlockEvents.OnPlayerEnterTrigger, async (player: hz.Player) => {
          this.assignArrowToPlayer(player);
        });
    }

    this.triggers = [
      this.props.trigger_1!,
      this.props.trigger_2!,
      this.props.trigger_3!,
    ].filter(Boolean);
  }

  /**
   * Lifecycle method called when the ArrowAssignManager component is initialized. 
   * Initializes properties and subscribes to events.
   */
  start() {
    this.initializeProps();
    this.subscribeEvents();
  }

  /**
   *  Initializes component properties based on the provided props.
   */
  initializeProps() {
    if (this.props.removeArrowTrigger) {
      this.removeArrowTrigger = this.props.removeArrowTrigger;
    } else {
      console.warn("Remove arrow trigger prop is not defined.");
    }
  }

  /**
   * Subscribes to events related to arrow removal.
   */
  subscribeEvents() {
    this.connectCodeBlockEvent(this.removeArrowTrigger, hz.CodeBlockEvents.OnPlayerEnterTrigger, (player: hz.Player) => {
      this.removeArrowFromPlayer(player);
    });

    this.connectNetworkEvent(this.entity, AssignArrowEvent, (data) => {
      this.assignArrowToPlayer(data.player);
    });

    this.triggers.forEach((trigger, index) => {
      this.connectCodeBlockEvent(trigger, hz.CodeBlockEvents.OnPlayerEnterTrigger, (player: hz.Player) => {
        // send event to ObjectiveSequence.ts
        this.sendNetworkEvent(player, AssignNewTarget, {newIndex: index});
      });
    });
  }

  /**
   * Assigns an arrow to the specified player.
   * @param player The player to whom the arrow will be assigned.
   */
  async assignArrowToPlayer(player: hz.Player): Promise<void> {
    if (this.playersWithArrow.has(player)) {
      return;
    }

    if (!this.props.NUXArrow) {
      console.warn("NUXArrow asset is not defined.");
      return;
    }

    // try to spawn the arrow asset
    try {
      const spawnedEntities = await this.world.spawnAsset(this.props.NUXArrow, hz.Vec3.zero, hz.Quaternion.zero, hz.Vec3.one);

      if (spawnedEntities.length === 0) {
        console.warn("Asset spawned, but no root entities found.");
        return;
      }

      const mainEntity = spawnedEntities[0];
      let objectiveSequence: hz.Entity | null = null;
      let targetEntity: hz.Entity | null = null;
      let arrowEntity: hz.Entity | null = null;

      // Set ownership and visibility for spawned arrows
      spawnedEntities.forEach((entity) => {
        entity.owner.set(player);
        entity.setVisibilityForPlayers([player], hz.PlayerVisibilityMode.VisibleTo);

        // Iterate through children to find specific entities
        for (const child of entity.children.get()) {
          child.owner.set(player);
          child.setVisibilityForPlayers([player], hz.PlayerVisibilityMode.VisibleTo);

          if (child.name.get().includes("Objective")) {
            objectiveSequence = child;
          }
          if (child.name.get().includes("Target")) {
            targetEntity = child;
          }
          if (child.name.get().includes("Arrow")) {
            arrowEntity = child;
          }
        }
      });

      if (!objectiveSequence || !targetEntity || !arrowEntity) {
        console.warn("Failed to find ObjectiveSequence / Target / Arrow in spawned asset.");
        return;
      }

      // Save the player and arrow association
      this.playersWithArrow.add(player);
      this.playerArrowMap.set(player, mainEntity);

      this.sendNetworkEvent(mainEntity, AssignArrowEvent, { player });

      // send async to ensure the objective is assigned after the asset is fully spawned
      this.async.setTimeout(() => {
        if (objectiveSequence && targetEntity && arrowEntity) {
          this.sendNetworkEvent(objectiveSequence, AssignObjectiveSequence, { player, target: targetEntity, arrowMesh: arrowEntity, });
        } else {
          console.warn("ObjectiveSequence, Target, or Arrow not found in spawned asset.");
        }

        // Clean up
        objectiveSequence = null;
        targetEntity = null;
        arrowEntity = null;
      }, 500);
    } catch (err) {
      console.error("Failed to spawn asset:", err);
    }
  }

  /**
   * Removes the arrow entity from the specified player.
   * @param player The player from whom to remove the arrow.
   */
  removeArrowFromPlayer(player: hz.Player): void {
    const arrowEntity = this.playerArrowMap.get(player);
    if (!arrowEntity) {
      console.warn(`No arrow found for player ${player.name.get()}`);
      return;
    }

    this.world.deleteAsset(arrowEntity, true);
    // Remove player from tracking sets
    this.playersWithArrow.delete(player);
    this.playerArrowMap.delete(player);
  }
}
// Register the component with Horizon
hz.Component.register(ArrowAssignManager);
