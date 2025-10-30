# AI NPC Implementation Plan

## Overview
Create a simple AI NPC system that spawns at a specific location, listens for players entering a trigger zone, and greets them with voice conversation capabilities.

## Key Concepts from Examples

### From `NpcComponent.ts` (AI NPC Example)
- Uses `horizon/npc` module with `Npc`, `NpcEvents`, `NpcEngagementPhase`, `NpcPlayer`
- Centralized NPC management through static `NpcManager` class
- Event-driven architecture with conversation API:
  - `conversation.setDynamicContext()` - Set context about game state
  - `conversation.addEventPerception()` - Add events for NPC to react to
  - `conversation.elicitResponse()` - Trigger NPC to speak
  - `conversation.registerParticipant()` - Register player for voice conversation
  - `conversation.unregisterParticipant()` - Unregister player
- Trigger zones for player proximity detection
- NPC rotation to face players with `npcPlayer.rotateTo()`

### From `NPCManager.ts` (Scripted NPC Example)
- Uses `horizon/avatar_ai_agent` module with `AvatarAIAgent`
- NavMesh-based pathfinding and movement
- Spawning NPCs with `spawnAgentPlayer()`
- Complex state machine behaviors
- Locomotion API for movement and animations

## Implementation Plan

### Phase 1: Basic Setup (Simple AI NPC)
Create `simple-ai-npc.ts` component with:

1. **Props Definition**
   - `npcGizmo: Entity` - The NPC entity (must be an Npc gizmo)
   - `spawnLocation: Entity` - Empty entity marking spawn position
   - `triggerZone: Entity` - Trigger zone for player detection
   - `welcomeMessage: String` - Custom greeting (default: "Welcome the player")

2. **Core Functionality**
   ```typescript
   - preStart(): Initialize NPC position at spawn location
   - start(): Set up event listeners
   - onPlayerEnterTrigger(): Handle player entering trigger
   - onPlayerExitTrigger(): Handle player leaving trigger
   ```

3. **Event Handlers**
   - `OnPlayerEnterTrigger` - Player enters trigger zone
     - Welcome player (first time) or comment on recent actions
     - Register player for conversation
     - Add player as attention target
     - Rotate NPC to face player
   - `OnPlayerExitTrigger` - Player leaves trigger zone
     - Unregister player from conversation
     - Remove player as attention target
   - `OnNpcStartedSpeaking` - Track speaking state
   - `OnNpcStoppedSpeaking` - Track when NPC finishes
   - `OnNpcEngagementChanged` - Track conversation phases
   - `OnNpcError` - Log errors for debugging

4. **Conversation Management**
   - Track which players have been greeted (Set<number>)
   - Prevent multiple NPCs talking simultaneously
   - Use `elicitResponse()` with optional instruction strings
   - Maintain engagement phase state

### Phase 2: Testing
1. Create test world with:
   - NPC gizmo entity
   - Spawn location marker
   - Trigger zone around spawn
   - Script component attached

2. Test scenarios:
   - Single player entering/exiting
   - Multiple players
   - Re-entering trigger zone
   - Error handling

### Phase 3: Future Enhancements (Placeholders)
- Add `setDynamicContext()` for game state awareness
- Add `addEventPerception()` for event reactions
- Add custom behaviors based on player actions
- Add NPC idle chatter with timer
- Add device type detection for UI differences
- Integrate with game mechanics (inventory, equipment, etc.)

## File Structure
```
scripts/
├── main-ai-npc.md (this file)
└── simple-ai-npc.ts (to be created)
```

## Key APIs to Use

### Npc Conversation API
```typescript
conversation.registerParticipant(player: hz.Player)
conversation.unregisterParticipant(player: hz.Player)
conversation.elicitResponse(instruction?: string): Promise
conversation.setDynamicContext(key: string, value: string)
conversation.addEventPerception(event: string)
conversation.removeDynamicContext(key: string)
```

### NpcPlayer API
```typescript
npcPlayer.addAttentionTarget(player: hz.Player)
npcPlayer.removeAttentionTarget(player: hz.Player)
npcPlayer.rotateTo(direction: hz.Vec3)
```

### NPC Events
```typescript
NpcEvents.OnNpcStartedSpeaking
NpcEvents.OnNpcStoppedSpeaking
NpcEvents.OnNpcEngagementChanged
NpcEvents.OnNpcError
```

### Engagement Phases
```typescript
NpcEngagementPhase.Idle
NpcEngagementPhase.Listening
NpcEngagementPhase.Reacting
NpcEngagementPhase.Responding
```

## Important Notes
1. **NPC vs AvatarAIAgent**: 
   - Use `Npc` for AI-powered conversations (voice, LLM)
   - Use `AvatarAIAgent` for scripted movement and interactions
   - This implementation uses `Npc` for conversation features

2. **Spawn On Start**: NPC entities should be set to "Spawn On Start" in the editor

3. **Player Filtering**: Always filter out NPC players from human players using `Npc.playerIsNpc(player)`

4. **Conversation Rate Limiting**: Track speaking state to avoid overlapping conversations

5. **Context Management**: Use dynamic context to inform NPC about game state for better responses

## Example Welcome Flow
1. Player enters trigger zone
2. Script detects player entry
3. Check if player has been welcomed before
4. Rotate NPC to face player
5. Call `elicitResponse()` with welcome instruction
6. Register player for voice conversation
7. Add player as attention target
8. NPC greets player with AI-generated speech

## Next Steps
1. Create `simple-ai-npc.ts` component
2. Set up basic NPC entity in world editor
3. Configure trigger zone
4. Test basic greeting functionality
5. Iterate on conversation instructions
