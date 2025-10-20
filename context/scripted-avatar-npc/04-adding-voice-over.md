---
title: "Module 4 - Adding Voice-Over to NPCs"
source_urls:
  - "https://developers.meta.com/horizon-worlds/learn/documentation/tutorial-worlds/scripted-avatar-npc-tutorial/module-4-adding-voice-over"
last_updated: "2025-09-26T00:00:00Z"
tags: ["horizon_worlds", "voice_over", "audio_assets", "npc_dialogue", "audio_integration"]
summary: "Voice-over integration for Scripted Avatar NPCs including audio asset management, playback triggers, and character personality development."
tutorial: "scripted-avatar-npc"
---

# Module 4 - Adding Voice-Over to NPCs

## What & Why

Voice-over integration adds **character personality and engagement** to Scripted Avatar NPCs by providing **contextual audio playback** triggered by game events and NPC actions. The system manages audio assets and coordinates playback timing with NPC behaviors to create immersive character interactions that guide players and enhance storytelling.

## Key APIs / Concepts

- **Audio Assets** - Voice-over files imported and managed in Desktop Editor
- **Audio Playback Triggers** - Event-based audio activation tied to NPC actions
- **NPCManager Audio Integration** - Centralized audio management within NPC behavior system
- **Character Voice Design** - Audio matching visual character appearance and behavior
- **Contextual Audio** - Situation-specific dialogue triggered by game state

## How-To (Recipe)

1. **Import Audio Assets**: Add voice-over files to world asset library
2. **Design Character Voices**: Match audio personality to visual NPC design
3. **Integrate Audio Triggers**: Connect audio playback to NPC behavior events
4. **Coordinate Timing**: Sync audio with NPC actions and game state changes
5. **Test Audio Experience**: Verify appropriate audio triggers and clarity
6. **Iterate Voice Design**: Adjust audio to match NPC personality and actions

## Voice-Over Implementation

### Audio Asset Management
- Import voice-over audio files through Desktop Editor asset system
- Organize audio files by character and context (Village Elder, Traveling Merchant)
- Link audio assets to NPCManager.ts for centralized playback control

### Character Voice Integration
- **Village Elder**: Provides guidance, call-to-action, and gratitude expressions
- **Traveling Merchant**: Commentary on trading, interference dialogue, game progression
- **Contextual Triggers**: Audio playback based on actions tracked in NPCManager.ts

### Audio Playback Coordination
- Audio triggers coordinated with NPC state machine transitions
- Voice-over timing synchronized with visual NPC actions
- Character-specific audio personality matching visual design

## Limits & Constraints

- **Audio Asset Limits** - World memory constraints apply to voice-over file sizes
- **Character Voice Matching** - Audio personality must align with visual character design
- **Timing Coordination** - Audio playback must sync appropriately with NPC actions
- **Iteration Requirements** - Voice design may require multiple iterations for character fit

## Gotchas / Debugging

- **Voice-Visual Mismatch** - Easier to adjust visual design than force poor audio performance
- **Audio Trigger Timing** - Ensure proper synchronization with NPC behavior events
- **Character Consistency** - Maintain consistent voice personality across all NPC interactions
- **Asset Management** - Organize audio files clearly for easy modification and updates

## See Also

- [Module 3 - NPC Manager](./03-npc-manager.md) - NPC behavior system for audio integration
- [Module 5 - Quest Manager](./05-quest-manager.md) - Quest system integration with audio feedback
- [Audio APIs](../../typescript-development-overview.md#audio) - Audio system documentation
- [Desktop Editor Audio](../../desktop-editor-overview.md#audio) - Audio asset management

## Sources

- Tutorial page: https://developers.meta.com/horizon-worlds/learn/documentation/tutorial-worlds/scripted-avatar-npc-tutorial/module-4-adding-voice-over (accessed 2025-09-26)