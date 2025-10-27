import { EventsService } from "constants";
import { healthData } from "HealthData";
import { Entity } from "horizon/core";
import { UIComponent, View, Text, UINode, Binding, AnimatedBinding, Animation, Easing } from "horizon/ui";

export class HealthBar extends UIComponent<typeof HealthBar> {
  private isVisibleBinding = new Binding<boolean>(false);
  private hpFillBinding = new AnimatedBinding(1.0);
  private hpTextBinding = new Binding('100/100');
  private maxHealth = 100;
  private currentHealth = 100;

  initializeUI() {
    return UINode.if(
      healthData.isVisible,
      View({
        children: [
          // Progress bar container
          View({
            style: {
              width: '100%',
              height: 30,
              backgroundColor: 'white',
              borderColor: 'black',
              borderWidth: 4,
              borderRadius: 10,
              overflow: 'hidden'
            },
            children: [
              // Progress bar fill
              View({
                style: {
                  height: '100%',
                  backgroundColor: 'lightgreen',
                  width: healthData.animationValueBinding.interpolate([0, 1], ['0%', '100%']),
                  borderRadius: 5
                }
              })
            ]
          }),
          // Health text
          View({
            children: [
              Text({
                style: {
                  marginTop: 10,
                  fontSize: 40,
                  color: 'black',
                  fontWeight: 'bold',
                  textAlign: 'center'
                },
                text: healthData.healthValueBinding.derive(v => `${Math.round(v * healthData.maxHealth)}/${healthData.maxHealth}`),
              })
            ],
            style: {
              justifyContent: 'center',
              alignItems: 'center',
            }
          })
        ],
        style: {
          backgroundColor: 'white',
          borderWidth: 4,
          borderRadius: 50,
          padding: 20,
        },
      }),
      View({})
    );
  }

  start() {
    // Listen for health updates from the server
    this.connectNetworkBroadcastEvent(
      EventsService.CombatEvents.MonsterHealthUpdate,
      (payload: { monsterId: string; currentHealth: number; maxHealth: number }) => {
        console.error(`[HealthBar] Received health update for Monster ID ${payload.monsterId}: ${payload.currentHealth}/${payload.maxHealth}`);
        // Check if this update is for our parent entity
        const parentEntity = this.entity.parent.get();
        console.error(`[HealthBar] Parent Entity ID: ${parentEntity ? parentEntity.id.toString() : 'none'}`);
        console.log(`[HealthBar] Payload Monster ID: ${payload.monsterId}`);
        let currentEntity: Entity | null = this.entity;
        let matchFound = false;

        // Check up to 3 levels up in the hierarchy
        for (let i = 0; i < 3 && currentEntity; i++) {
          const entityId = currentEntity.id.toString();
          console.error(`[HealthBar] Checking Entity ID at level ${i}: ${entityId}`);

          if (entityId === payload.monsterId) {
            console.error(`[HealthBar] Match found! Updating health bar for Monster ID ${payload.monsterId}`);
            this.updateHealth(payload.currentHealth, payload.maxHealth);
            matchFound = true;
            break;
          }

          currentEntity = currentEntity.parent.get();
        }

        if (!matchFound) {
          console.log(`[HealthBar] No match found for Monster ID ${payload.monsterId}`);
        }
      });
  }

  /**
 * Updates the health display with smooth animation
 * @param health Current health value
 * @param maxHealth Maximum health value
 */
  private updateHealth(health: number, maxHealth: number) {
    // Clamp values
    this.currentHealth = Math.max(0, health);
    this.maxHealth = Math.max(1, maxHealth);
    const healthPercent = this.currentHealth / this.maxHealth;

    // Update text
    this.hpTextBinding.set(`${Math.round(this.currentHealth)}/${this.maxHealth}`);

    // Animate the fill bar
    this.hpFillBinding.set(
      Animation.timing(healthPercent, {
        duration: 300,
        easing: Easing.out(Easing.cubic),
      })
    );

    // Show the health bar when damage is taken
    if (!this.isVisibleBinding) {
      this.setVisible(true);
    }

    // Hide the health bar after a delay if at full health
    if (healthPercent >= 1) {
      this.async.setTimeout(() => {
        this.setVisible(false);
      }, 2000); // Hide after 2 seconds
    }
  }

  /**
 * Sets the visibility of the health bar
 * @param visible True to show, false to hide
 */
  private setVisible(visible: boolean) {
    this.isVisibleBinding.set(visible);
  }
}
UIComponent.register(HealthBar);