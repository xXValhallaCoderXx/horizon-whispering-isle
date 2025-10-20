---
title: "Module 1 - Setup and Feature Overview"
source_urls:
  - "https://developers.meta.com/horizon-worlds/learn/documentation/tutorial-worlds/scripted-avatar-npc-tutorial/module-1-setup"
last_updated: "2025-09-26T00:00:00Z"
tags: ["horizon_worlds", "scripted_avatar_npcs", "tutorial_setup", "quest_system", "voice_over"]
summary: "Tutorial setup covering Scripted Avatar NPCs, quest implementation, and voice-over integration with Village Elder and Traveling Merchant characters."
tutorial: "scripted-avatar-npc"
---

# Module 1 - Setup and Feature Overview

## What & Why

**Scripted Avatar NPCs** are **humanoid NPCs** that combine **web-based visual design** with **TypeScript behavioral programming**, enabling rich character interactions through NavMesh pathfinding, quest integration, and voice-over personality systems. This tutorial implements a gem collection game with two NPCs demonstrating helper/antagonist dynamics.

## Key APIs / Concepts

- **Scripted Avatar NPCs** - Humanoid NPCs with TypeScript behaviors and web design tools
- **Quest System** - World-based objectives with individual player tracking
- **Voice-over Integration** - Character personality through contextual audio
- **NavMesh Pathfinding** - NPC locomotion and navigation systems
- **NPCManager.ts** - Central script coordinating NPC behaviors and game state
- **QuestManager.ts** - Quest progression and completion tracking

## How-To (Recipe)

1. **Download Tutorial World**: Access pre-built world with NPCs and assets
2. **Explore NPC Characters**: Interact with Village Elder and Traveling Merchant
3. **Examine Scripts**: Review NPCManager.ts and QuestManager.ts implementations
4. **Test Quest System**: Complete gem collection objectives and track progress
5. **Experience Voice-over**: Listen to character dialogue and personality audio
6. **Analyze Behaviors**: Observe NPC pathfinding and state-driven actions

## NPC Character Overview

| Character | Role | Key Behaviors |
|-----------|------|---------------|
| **Village Elder** | Helper/Guide | • Delivers call-to-action voice-over<br>• Assists with gem collection<br>• Expresses gratitude when objectives completed<br>• Jumps with joy at game completion |
| **Traveling Merchant** | Antagonist/Reset Manager | • Grabs collected gems and returns to locations<br>• Runs to Reset button when all gems collected<br>• Provides trading commentary at kiosk<br>• Triggers new game when player trades items |

## Tutorial Features Demonstrated

### Core NPC Systems
- **Visual Design**: Web-based NPC appearance customization
- **TypeScript Integration**: Complete behavioral programming for NPCs
- **NavMesh Pathfinding**: Navigation and locomotion implementation
- **State Management**: NPCs respond to game events and player actions

### Advanced Integration
- **Quest Data Entities**: World-defined objectives configured in Desktop Manager
- **Quests Gizmo**: UI component for players to track quest progress
- **Voice-over Assets**: Character personality through contextual audio playback
- **Event Coordination**: NPCs react to game state changes and player interactions

## Implementation Architecture

### Script Structure
- **NPCManager.ts**: Central coordination for NPC behaviors, player tracking, event handling
- **QuestManager.ts**: Quest progression logic and completion tracking
- **Utils.ts**: Helper functions including isNPC() player/NPC differentiation

### Asset Requirements
- **NPC Gizmos**: Character placement and configuration in world
- **NavMesh Volumes**: Navigation setup for NPC pathfinding
- **Audio Assets**: Voice-over files for character personality
- **Quest Data Entities**: Objective definitions in Desktop Manager

## Game Flow Example

1. **Game Start**: Village Elder provides call-to-action voice-over
2. **Gem Collection**: Player collects gems while Elder assists
3. **Merchant Interference**: Traveling Merchant grabs gems and returns them
4. **Objective Completion**: All 5 gems collected triggers completion behaviors
5. **Reset Coordination**: Merchant runs to Reset button for new game
6. **Trading System**: Player trades gems for coins at kiosk with audio commentary

## Limits & Constraints

- **Single-player focus** - Tutorial designed for individual player experience
- **Resource sharing** - NPCs consume same resource pool as human players
- **NavMesh dependency** - Pathfinding requires proper NavMesh setup
- **Asset memory limits** - Voice-over files constrained by world memory

## Gotchas / Debugging

- **NPC spawning delays** - Allow several seconds for NPCs to appear in world
- **NavMesh baking** - Must bake NavMesh before NPC movement functionality
- **Audio-visual matching** - Character voice should align with visual design
- **Event coordination** - Ensure proper event listener setup for NPC behaviors

## See Also

- [Module 2 - Overview of Scripted Avatar NPCs](./02-overview.md) - NPC fundamentals and API overview
- [Module 3 - NPC Manager](./03-npc-manager.md) - State machine implementation and pathfinding
- [NPCs Overview](../../desktop-editor-overview.md#npcs) - Comprehensive NPC system documentation
- [Quest System](../../multiplayer-lobby-systems.md#quests) - Quest implementation patterns

## Sources

- Tutorial page: https://developers.meta.com/horizon-worlds/learn/documentation/tutorial-worlds/scripted-avatar-npc-tutorial/module-1-setup (accessed 2025-09-26)