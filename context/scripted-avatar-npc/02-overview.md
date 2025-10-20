---
title: "Module 2 - Overview of Scripted Avatar NPCs"
source_urls:
  - "https://developers.meta.com/horizon-worlds/learn/documentation/tutorial-worlds/scripted-avatar-npc-tutorial/module-2-scripted-avatar-npcs-overview"
last_updated: "2025-09-26T00:00:00Z"
tags: ["horizon_worlds", "scripted_avatar_npcs", "visual_design", "typescript_behaviors", "navmesh_pathfinding"]
summary: "Comprehensive overview of Scripted Avatar NPC visual design, TypeScript behavioral programming, and core NPC capabilities including detection, spawning, and NavMesh navigation."
tutorial: "scripted-avatar-npc"
---

# Module 2 - Overview of Scripted Avatar NPCs

## What & Why

**Scripted Avatar NPCs** provide **humanoid character functionality** combining **web-based visual customization** with **TypeScript behavioral programming**, enabling developers to create interactive characters with personality, pathfinding, and complex behaviors that enhance world engagement and provide guided player experiences.

## Key APIs / Concepts

- **Web Design Interface** - Browser-based NPC appearance customization
- **AvatarAIAgent API** - TypeScript interface for NPC behavioral programming
- **NavMesh Pathfinding** - Navigation system for NPC locomotion
- **NPC Detection Utilities** - Helper functions to differentiate NPCs from human players
- **Spawning/Despawning** - Dynamic NPC presence management
- **Entity Interaction** - NPCs can grab, drop, and manipulate world objects

## How-To (Recipe)

1. **Design NPC Appearance**: Use web interface for visual character customization
2. **Configure NPC Gizmo**: Place and configure NPC in world with proper settings
3. **Implement TypeScript Behaviors**: Program NPC actions and responses
4. **Setup NavMesh Navigation**: Configure pathfinding for NPC movement
5. **Add Entity Interactions**: Enable NPCs to manipulate world objects
6. **Test and Iterate**: Validate NPC behaviors and performance

## Visual Design System

### Web-Based Customization
- **Character Appearance**: Full humanoid customization through browser interface
- **Design Iteration**: Easy modification and refinement of NPC appearance
- **Asset Integration**: NPCs designed to fit world aesthetic and theme
- **Character Personality**: Visual design should align with behavioral programming

### NPC Gizmo Configuration
- **World Placement**: NPCs positioned strategically for optimal player interaction
- **Settings Management**: Configure NPC properties and behavioral parameters
- **Asset Linking**: Connect visual design to TypeScript behavioral scripts

## TypeScript Behavioral Programming

### Core NPC Capabilities
- **Movement and Navigation**: NavMesh-based pathfinding and locomotion
- **Object Interaction**: Grabbing, dropping, and manipulating entities
- **State Management**: Complex behaviors driven by game events and conditions
- **Player Interaction**: Responses to player actions and proximity

### NPC Detection Utility
```typescript
// Essential utility for differentiating NPCs from human players
export function isNPC(player: hz.Player): player is AvatarAIAgent {
    return player.entity.getComponentType() === "avataraiagent";
}
```

### Spawning Pattern
```typescript
// Async NPC spawning with proper error handling
if (this.props.npcGizmo) {
    const npc: AvatarAIAgent = this.props.npcGizmo.as(AvatarAIAgent);
    npc.spawnAgentPlayer().then((result) => this.handleSpawnResult(result, npc));
}
```

## NavMesh Pathfinding System

### Navigation Setup
- **NavMesh Volumes**: Define navigable areas for NPC movement
- **Pathfinding Baking**: Process navigation mesh before NPC activation
- **Route Planning**: NPCs calculate paths between world positions
- **Dynamic Movement**: Real-time navigation around obstacles and players

### Core Navigation APIs
- **GetPathTo()**: Calculate waypoint path between Vec3 positions
- **moveToPosition()**: Execute movement along calculated path
- **rotateTo()**: Orient NPC toward target direction
- **Navigation Events**: Handle pathfinding completion and failure states

## Advanced NPC Features

### Entity Manipulation
- **Grabbing Objects**: NPCs can pick up and carry world entities
- **Dropping Items**: Strategic placement of objects in world
- **Object Transportation**: Moving items between locations
- **Interaction Coordination**: NPCs work with or against player objectives

### Event-Driven Behaviors
- **Game State Response**: NPCs react to world events and conditions
- **Player Action Triggers**: Behaviors activated by player interactions
- **Timed Behaviors**: Actions executed on schedules or intervals
- **Conditional Logic**: Complex decision-making based on world state

## Implementation Best Practices

### Performance Considerations
- **Spawning Management**: Spawn NPCs only when needed to conserve resources
- **Pathfinding Optimization**: Efficient NavMesh setup and route calculation
- **Behavior Complexity**: Balance rich interactions with performance requirements
- **Resource Monitoring**: NPCs share resource pool with human players

### Development Workflow
- **Visual-First Design**: Create NPC appearance before behavioral programming
- **Iterative Testing**: Continuous validation of NPC behaviors and interactions
- **NavMesh Validation**: Ensure proper navigation setup before complex behaviors
- **Debug Logging**: Use console output for behavior troubleshooting

## Limits & Constraints

- **Physics Immutability** - Cannot modify NPC movement characteristics or physics
- **Resource Sharing** - NPCs consume same resource pool as human players
- **Conversation Limitations** - No current LLM integration for dynamic dialogue
- **NavMesh Dependencies** - Movement requires proper navigation mesh setup
- **Spawning Delays** - NPCs take several seconds to appear and initialize

## Gotchas / Debugging

- **NPC Detection Critical** - Always use isNPC() to filter player vs NPC events
- **NavMesh Baking Required** - Must bake navigation mesh before movement
- **Async Spawning** - Handle spawn delays and potential failures gracefully
- **Visual-Audio Alignment** - Character design should match voice personality
- **Resource Limits** - Monitor NPC count vs human player capacity

## See Also

- [Module 3 - NPC Manager](./03-npc-manager.md) - Implementation of NPC behavior coordination
- [Module 1 - Setup](./01-setup.md) - Tutorial overview and character introduction
- [Setting up NPCs with Navigation](../../desktop-editor-overview.md#npc-navigation) - NavMesh configuration details
- [NPCs Overview](../../objects-components-overview.md#npcs) - Comprehensive NPC system documentation

## Sources

- Tutorial page: https://developers.meta.com/horizon-worlds/learn/documentation/tutorial-worlds/scripted-avatar-npc-tutorial/module-2-scripted-avatar-npcs-overview (accessed 2025-09-26)