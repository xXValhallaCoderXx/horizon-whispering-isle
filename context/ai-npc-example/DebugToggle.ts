import * as hz from 'horizon/core'
import { World } from 'World';

/**
 * Debug Toggle responsible for hiding/revealing debug panels in the world.
 * 
 * Props:
 * @param debugPanelsEntity - Parent entity object containing all debug panels.
 * @param debugText - Debug TextGizmo showing debug state.
 */
class DebugToggle extends hz.Component<typeof DebugToggle>{
  static propsDefinition = {
    debugPanelsEntity: { type: hz.PropTypes.Entity },
    debugText: { type: hz.PropTypes.Entity}
  };
  
  offset: hz.Vec3 = new hz.Vec3(0, 10, 0)   // Offset to move debug panels


  start() {
    // Set up the on trigger event
    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterTrigger, this.OnPlayerEnterTrigger.bind(this));
  }

  OnPlayerEnterTrigger(player: hz.Player) {
    // Play sfx
    World.world?.playSound("SFX_UI_ClickV2")
    // Set debug to true
    World.isDebug = !World.isDebug

    // Move the panels
    if (World.isDebug) {
      this.props.debugPanelsEntity?.position.set(this.props.debugPanelsEntity?.position.get().add(this.offset))
      this.props.debugText?.as(hz.TextGizmo).text.set("DEBUG: \n ON")
      this.props.debugText?.as(hz.TextGizmo).color.set(hz.Color.green)
    } else {
      this.props.debugPanelsEntity?.position.set(this.props.debugPanelsEntity?.position.get().sub(this.offset))
      this.props.debugText?.as(hz.TextGizmo).text.set("DEBUG: \n OFF")
      this.props.debugText?.as(hz.TextGizmo).color.set(hz.Color.red)
    }

    // Set all panels' visibility
    this.props.debugPanelsEntity?.children.get().forEach((child: hz.Entity) => {
      child.visible.set(World.isDebug)
    })
  }
}
hz.Component.register(DebugToggle);