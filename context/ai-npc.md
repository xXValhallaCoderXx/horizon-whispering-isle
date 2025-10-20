Here is a technical document based on the provided transcript, detailing the LLM AI NPC systems in Meta Horizon Worlds.

---

## Technical Document: LLM AI NPCs in Horizon Worlds

### 1\. API Migration: `AvatarAIAgent` to `Npc`

The legacy **`AvatarAIAgent`** API has been deprecated. All functionality has been migrated to the new **`Npc`**, **`NpcPlayer`**, and **`NpcConversation`** APIs. All new development must use these new APIs, as the old one may be removed and does not support LLM features.

**Key Changes:**

- **`Npc` API (from Gizmo):**
  - Obtained from the NPC Gizmo using `as Npc`.
  - Primarily controls the **spawning** of the NPC (`spawnPlayer()`).
- **`NpcPlayer` API (from `Npc`):**
  - This is a special class that extends `player`.
  - It includes a built-in method, `isNpcPlayer()`, to easily distinguish NPCs from real players.
  - Controls all physical interactions: **locomotion**, **grabbing**, **gaze direction**, and **attention targets**.
- **`NpcConversation` API (from `NpcPlayer`):**
  - This is the centralized controller for all AI-driven interactions.
  - Controls **speaking**, **listening**, and **memory** (LLM context).

**Migration Call Map:**

| Old API (`AvatarAIAgent`)              | New API (`Npc` / `NpcPlayer`)      | Notes                                        |
| :------------------------------------- | :--------------------------------- | :------------------------------------------- |
| `spawnAgentPlayer()`                   | `spawnPlayer()` (on `Npc`)         |                                              |
| `agentPlayer` / `getGizmoFromPlayer()` | `tryGetPlayer()` (on `Npc`)        | **This call is now asynchronous (`async`).** |
| `locomotion` APIs                      | `locomotion` APIs (on `NpcPlayer`) | Moved to the `NpcPlayer` class.              |
| `grabbing` APIs                        | `grabbing` APIs (on `NpcPlayer`)   | Moved to the `NpcPlayer` class.              |

**Critical Migration Points:**

1.  Code must be updated to handle the **asynchronous** nature of `tryGetPlayer()`.
2.  Scripts controlling locomotion or grabbing must now get a reference to the `NpcPlayer` object, not the `Npc` (gizmo) object.

---

### 2\. Creating an LLM NPC

Configuration is handled through the standard **NPC Gizmo**'s properties panel.

#### 2.1. Gizmo Setup

1.  Place an **NPC Gizmo** in the world.
2.  Set the **Conversation Mode** property to **AI**. This enables all LLM-related features.
3.  **Speech Bubble**: It is recommended to leave the speech bubble **enabled** for accessibility (e.g., for the hearing impaired), though it can be disabled.

#### 2.2. Avatar Generation

- The **Character Builder** now uses an LLM prompt to generate an avatar.
- **Avatar Types**: You can choose "Human" (Meta Avatar) or "Fantastical."
- **Prompting**: Use a descriptive prompt (e.g., "spice merchant from the Silk Road") to generate the appearance.
- **Fine-Tuning**: After generating a "Human" (Meta) avatar, you can click the **Edit** button to use the **web wardrobe** for further customization.
- **Troubleshooting**: If the avatar generation fails or settings don't save, **try leaving the world and returning**.

#### 2.3. Conversation Settings (Backstory & Guidance)

This section defines the NPC's personality and knowledge.

- **Name**: The NPC's display name.
- **Backstory**: A description of _who the NPC is_, their history, and their knowledge.
- **Guidance (Guardrails)**: A "system prompt" defining _how the NPC should behave_.
  - **Pro-Tip**: Use an external tool like ChatGPT to generate the Backstory and Guidance prompts.
  - **Best Practice**: Use **positive guidance** (e.g., "You are a friendly merchant") rather than negative guidance (e.g., "Do not be mean"). The AI can fixate on negative prompts and behave erratically.
- **In-Editor Testing**: Use the test input field directly within the Conversation Settings panel to test your prompts _before_ entering the world.

#### 2.4. Voice Configuration

- Select a voice from the available options (e.g., "Seer").
- Use the "Test" button to hear the voice.
- Fine-tune the **Speed** and **Pitch** to match the character's personality.

---

### 3\. Interacting with the NPC

Interaction logic is split between the `NpcPlayer` (physical) and `NpcConversation` (verbal/memory).

#### 3.1. `NpcPlayer`: Gaze and Attention

This controls what the NPC's avatar is physically looking at.

- **Attention Targets**:
  - A list of entities and players the NPC _can_ look at. The NPC uses an internal algorithm to decide which target to focus on.
  - Use `addAttentionTarget()` and `removeAttentionTarget()`.
- **Look At Override**:
  - `setLookAtTarget(position: vec3)`: Forces the NPC to look at a specific 3D coordinate.
  - `clearLookAtTarget()`: Returns the NPC to its default attention target algorithm.
  - `getLookAtTarget()`: Returns the `vec3` position the NPC is currently looking at. **Warning**: This API may return `undefined`, so check the return value.
- **`NpcAutoTurner` Script**:
  - This helper script (available in the "Talk Pirate" sample) is highly recommended.
  - It automatically turns the NPC's _body_ to face its current attention target, preventing unnatural neck-craning.

#### 3.2. `NpcConversation`: Listening

This controls who the LLM will listen to.

- **Default State**: The NPC listens to no one.
- **Registered Participants**:
  - Use `registerConversationParticipants(player)` to add a player to the "listeners" list.
  - Use `unregisterConversationParticipants(player)` to remove them.
  - **Condition**: The NPC will only listen to a registered participant if that **player is actively looking at the NPC**.
- **Forced Listening**:
  - `startListeningTo(player)`: Forces the NPC to listen to a specific player for a single utterance, even if they aren't registered. This is a one-shot action.
- **Implementation Example**: Use a large **Trigger** volume.
  - On `onPlayerEnterTrigger`, call `registerConversationParticipants()` and `addAttentionTarget()`.
  - On `onPlayerLeaveTrigger`, call `unregisterConversationParticipants()` and `removeAttentionTarget()`.
- **Multiplayer**: The NPC can only listen to **one player at a time**.
- **NPC-to-NPC Conversation**: This is **not** supported natively. You cannot register an NPC as a participant for another NPC. This requires a complex manual script to "shuttle" responses between two NPCs.

---

### 4\. Managing the NPC's Memory

You can provide the LLM with context about world events and states. **All memory inputs should use natural, human-readable language.**

#### 4.1. `addEventPerception(fact: string)`

- **Use Case**: For "facts" or events that _happened_. These are immutable.
- **Example**: `"The magic genie lamp has teleported back to the table."`
- **Persistence**: Event perceptions **cannot be removed individually**. They are only cleared by a full memory reset.

#### 4.2. `setDynamicContext(key: string, state: string)`

- **Use Case**: For **transient state** (information that can change).
- **Key**: A unique string key to identify this piece of information.
- **State**: The natural language string describing the state.
- **Example**:
  - On grab: `setDynamicContext("lampStatus", "The player is holding the magic genie lamp.")`
  - On release: `setDynamicContext("lampStatus", "The player is not holding the genie lamp.")`
- **Updating**: Call `setDynamicContext()` again with the same `key` to update the state.
- **Removal**: Use `removeDynamicContext(key)` or `clearAllDynamicContext()`.

#### 4.3. `resetMemory()`

- **Action**: Completely wipes **all** event perceptions and dynamic context from the NPC's memory.
- **Recommendation**: Consider calling this periodically in long-running worlds to prevent response degradation as the context window fills.

---

### 5\. Making the NPC Speak

#### 5.1. Audio Controls

- You can adjust the NPC's audio **volume** and **spatialization** either globally or on a per-player basis. This is useful for preventing cross-talk in crowded areas.

#### 5.2. `speak(message: string)`

- **Use Case**: For **scripted dialogue**.
- **Action**: The NPC says the _exact_ string provided. The LLM is not involved.

#### 5.3. `elicitResponse(instructions?: string)`

- **Use Case**: For **dynamic, AI-generated responses**. This is the "magic" of the LLM.
- **Action**: The NPC generates a response based on its backstory, guidance, memory (events/context), and any optional _runtime instructions_ provided.
- **Instructions (Prompt Engineering)**: You can pass a string of instructions to guide the _specific_ response (e.g., `"If the player is holding the lamp, tell them the magic carpet story. If not, scold them for having dirty shoes."`).

#### 5.4. `stopSpeaking()` / `stop()`

- `stopSpeaking()`: Cancels the current speech.
- `stop()`: Halts all conversation activity (speaking, listening, etc.).

---

### 6\. Important API Technical Notes

1.  **Asynchronous Calls**: Nearly all `NpcConversation` APIs (e.g., `elicitResponse`, `setDynamicContext`) are **asynchronous**. You **must** use `await` when calling them to ensure they execute in the correct order.
2.  **Exceptions**: Some LLM-related APIs will **throw exceptions** if the feature is unavailable (see Fallbacks, section 8).
3.  **Player ID vs. Player Object**: Several `NpcConversation` events and APIs strangely use the `player.id` (string/number) instead of the `player` object. You may need to manually reconstruct the player reference.

---

### 7\. Testing Your NPC

#### 7.1. Play Testing

- Enter preview mode and interact with the NPC. Talk to it and perform actions to test its reactions.

#### 7.2. The NPC Debugger

- This is a **critical tool** for development.
- In the desktop editor, open the **NPC Debugger** tab and select your NPC.
- When the NPC generates a response, the debugger shows you its "brain":
  - The **directions** (instructions) it received.
  - The **dynamic context** it was aware of.
  - The **event perceptions** in its memory.
  - The final **response** text.

#### 7.3. Simulated Testing (Test Rig)

You can create a script to "regression test" your NPC's logic without manually playing.

1.  **Simulate Player Speech**: Use `addResponse(message: string)` to feed a _synthetic_ player utterance into the NPC's memory.
2.  **Get NPC Reply**: Immediately call `elicitResponse()` to make the NPC respond to the synthetic input.
3.  **Verify Output**: Use the `onNpcFullResponse` event to capture the NPC's text reply and check if it's correct.
4.  **Sequence**: You can chain these calls (`resetMemory`, `setDynamicContext`, `addResponse`, `elicitResponse`) to create a full, automated test script.

---

### 8\. Publishing with Fallbacks

**LLM features are not available to all users** (e.g., based on region (USA/Canada only) or age (14+)).

- **Default Behavior**: `Deny World Entry`. Players without LLM access **will be blocked** from joining your world.
- **Recommended Setting**: Go to your world's **Player Settings** and set the **NPC Fallback** option to **Scripted Dialogue Only**.

**When in Fallback Mode:**

- `NpcConversation.isAIAvailable()` will return **`false`**.
- All LLM-specific APIs (like `elicitResponse`) will **throw exceptions**.
- You can _only_ use the `speak()` API to make the NPC talk.
- `NpcPlayer` APIs (locomotion, gaze) will **still function**.

**Implementation:**

```typescript
// Example of fallback logic
if (myNpcConversation.isAIAvailable()) {
  await myNpcConversation.elicitResponse("Welcome the player.");
} else {
  await myNpcConversation.speak("Welcome, traveler!");
}
```

**Testing Fallbacks**:

- Open the **NPC Debugger** tab.
- Toggle the **"AI Speech"** option **OFF**.
- This simulates the world for a user without LLM access, allowing you to test your `speak()`-based fallback logic.

---

### 9\. Advanced Events

The API provides numerous events for advanced interactions:

- `onEmoteGesture`: Fired when the NPC performs an emote.
- `onStartSpeaking` / `onStopSpeaking`: Fired when the NPC begins or ends talking.
- `onNpcPartialResponse`: Fired as each sentence of a response is generated.
- `onNpcFullResponse`: Fired when the complete response text is ready.
- `onNpcEngagementChanged`: Fired when the NPC's state changes (e.g., idle, listening, responding) or _which_ player it's engaging with.
- `onVisemeReceived`: Provides mouth-shape data for lip-syncing. This is an advanced topic for custom-animated (non-Meta Avatar) NPCs.
- `onNpcError`: Fired when an error occurs.
