---
title: "Module 5 - Quest Manager System"
source_urls:
  - "https://developers.meta.com/horizon-worlds/learn/documentation/tutorial-worlds/scripted-avatar-npc-tutorial/module-5-quest-manager"
last_updated: "2025-09-26T00:00:00Z"
tags: ["horizon_worlds", "quest_manager", "quest_system", "player_objectives", "quest_gizmo"]
summary: "Quest system implementation including quest data entities, progress tracking, and integration with NPCs for player objective management."
tutorial: "scripted-avatar-npc"
---

# Module 5 - Quest Manager System

## What & Why

The **Quest Manager system** provides **structured player objectives** that encourage exploration, engagement, and replay value through **world-based goals** tied to player activities. The system manages quest progression, completion tracking, and integration with NPC interactions to create guided gameplay experiences with clear objectives and rewards.

## Key APIs / Concepts

- **QuestManager.ts** - Core script handling quest activities and progression logic
- **Quest Data Entities** - World-defined objectives configured in Desktop Manager
- **Quests Gizmo** - UI component for players to track quest progress
- **Individual Quest Status** - Per-player quest completion and progress tracking
- **Quest Integration** - Coordination between quests, NPCs, and game events

## How-To (Recipe)

1. **Define Quest Data**: Create quest entities in Desktop Manager with objectives
2. **Deploy Quests Gizmo**: Add quest tracking UI component for player visibility
3. **Implement QuestManager**: Create script to handle quest activities and progression
4. **Integrate with NPCs**: Connect quest completion to NPC behaviors and audio
5. **Track Player Progress**: Monitor individual player quest status and completion
6. **Coordinate Rewards**: Link quest completion to game progression and benefits

## Quest System Architecture

### Quest Types in Tutorial World
- **Gem Collection Quests** - Multiple objectives for collecting different numbers of gems
- **Coin Collection Quest** - Trading objective requiring exploration and UI interaction
- **Progressive Difficulty** - Escalating objectives to maintain engagement
- **Exploration Encouragement** - Quests guide players to discover world features

### Quest Management Features
- **Desktop Manager Integration** - Quest configuration through editor interface
- **Individual Tracking** - Per-player progress and completion status
- **Event Coordination** - Quest updates triggered by game events and actions
- **NPC Integration** - Quest completion affects NPC behaviors and dialogue

## Quest Implementation

### Quest Data Definition
- Quests configured as data entities in Desktop Manager
- World-based objectives tied to specific player activities
- Individual player tracking for progress and completion

### Progress Tracking
- QuestManager.ts monitors player actions and quest-relevant events
- Real-time progress updates and completion detection
- Integration with game state management and NPC coordination

### Player Experience
- Quests Gizmo provides visible progress tracking for players
- Clear objectives encourage exploration and engagement
- Completion rewards and progression create replay value

## Limits & Constraints

- **Individual Status Only** - Quest completion tracked per player, not shared
- **World Configuration** - Quests must be properly configured in Desktop Manager
- **Event Integration** - Quest progress depends on proper game event coordination
- **UI Dependencies** - Requires Quests Gizmo deployment for player visibility

## Gotchas / Debugging

- **Desktop Manager Setup** - Ensure quest data entities are properly configured
- **Event Coordination** - Verify quest progress triggers are properly connected
- **Player State Sync** - Confirm individual player tracking accuracy
- **Gizmo Deployment** - Check Quests Gizmo placement and functionality
- **NPC Integration** - Ensure quest completion properly affects NPC behaviors

## See Also

- [Module 3 - NPC Manager](./03-npc-manager.md) - NPC behavior integration with quest system
- [Module 1 - Setup](./01-setup.md) - Overview of quest features in tutorial world
- [Desktop Editor Quests](../../desktop-editor-overview.md#quests) - Comprehensive quest system documentation
- [Custom UI Overview](../../custom-ui-overview.md) - Quest UI component reference

## Sources

- Tutorial page: https://developers.meta.com/horizon-worlds/learn/documentation/tutorial-worlds/scripted-avatar-npc-tutorial/module-5-quest-manager (accessed 2025-09-26)