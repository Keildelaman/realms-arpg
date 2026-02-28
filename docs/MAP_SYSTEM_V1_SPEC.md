# Map System V1 Implementation Spec

Status: Draft v1 baseline
Owner: Gameplay systems
Last updated: 2026-02-28

## 1. Product Intent

Build a Hub + Instanced Expedition loop that feels like modern ARPG mapping, but with casual-friendly failure rules.

Design pillars for v1:
- Fast runs (2-5 minutes average).
- Clear objective and readable layouts.
- Meaningful progression without hardcore punishment.
- Tunable data-first balancing so iteration is fast.

## 2. V1 Scope and Non-Goals

In scope (v1):
- Hub scene (Haven) with NPC interaction.
- Map Device launches procedural expeditions.
- One objective type: Extermination.
- Room/corridor procedural generation.
- Room-based monster spawning.
- Checkpoint respawn with limited portal lives.
- Completion and failure outcomes.
- Tier unlock progression (T1-T7).
- Completion reward formulas defined in data.

Out of scope (post-v1):
- Additional objectives (Sweep, Boss Hunt, Survival, Timed).
- Map modifiers.
- Mid-run save/resume.
- Co-op party instancing.
- Endless mode.
- Stash (can land in v1.1 if schedule pressure appears).

## 3. Player Loop (V1)

Hub -> Map Device -> Launch expedition -> Clear all required monsters -> Claim completion rewards -> Return Hub

Failure loop:
Hub -> Launch expedition -> Die until no portal lives -> Return Hub with no completion bonus (keep already-picked inventory loot)

## 4. Scene and System Architecture

New modules:
- `src/scenes/HubScene.ts`
- `src/systems/expeditions.ts`
- `src/systems/expedition-generation.ts`
- `src/data/expeditions.data.ts` (all tuning constants)

Existing modules to integrate:
- `GameScene` remains combat scene.
- `UIScene` reads `gameMode` and expedition runtime state.
- `zones.data.ts` and `monsters.data.ts` remain source of biome and monster definitions.

Replace/route behavior:
- Existing `zones.enterZone(id)` is used only as a compatibility fallback.
- Primary combat entry path becomes `expeditions.launchExpedition(config)`.

## 5. State Model Changes

Add to `GameState`:

```ts
interface ExpeditionProgress {
  requiredKills: number;
  currentKills: number;
  roomsVisited: number;
  roomsCleared: number;
}

interface ExpeditionRunState {
  runId: string;
  seed: number;
  zoneId: string;
  tier: number;
  status: 'active' | 'completed' | 'failed' | 'abandoned';
  portalsRemaining: number;
  maxPortals: number;
  checkpointRoomId: string;
  map: ExpeditionMap;
  progress: ExpeditionProgress;
  startedAtGameTime: number;
}

interface ExpeditionMetaProgress {
  unlockedTiers: number[];                 // starts [1]
  firstClearClaimed: Record<string, boolean>; // key: `${tier}:extermination`
  totalRuns: number;
  totalCompletions: number;
  totalFailures: number;
}

interface GameState {
  gameMode: 'hub' | 'expedition';
  activeExpedition: ExpeditionRunState | null;
  expeditionMeta: ExpeditionMetaProgress;
}
```

Notes:
- Keep `activeZoneId` for compatibility but set it from expedition `zoneId` while run is active.
- If `gameMode === 'hub'`, `activeExpedition` must be `null`.

## 6. Event Contract Additions

Add typed events:

```ts
'expedition:launched': { runId: string; zoneId: string; tier: number; seed: number };
'expedition:roomEntered': { runId: string; roomId: string };
'expedition:roomCleared': { runId: string; roomId: string };
'expedition:progress': { runId: string; currentKills: number; requiredKills: number };
'expedition:checkpointUpdated': { runId: string; roomId: string };
'expedition:portalUsed': { runId: string; portalsRemaining: number };
'expedition:completed': { runId: string; durationSec: number; rewards: ExpeditionRewardBreakdown };
'expedition:failed': { runId: string; reason: 'no_portals' | 'abandoned' };
'expedition:returnHub': { runId: string; outcome: 'completed' | 'failed' | 'abandoned' };
```

## 7. Hub Specification (V1)

Scene:
- New start scene is `HubScene` (game no longer starts directly in combat).
- Haven is hand-authored geometry with static colliders.
- No hostile monsters in Hub.

NPC stations in v1:
- Map Device (new).
- Merchant (existing economy/shop UI).
- Blacksmith (existing crafting UI).
- Training Dummy (optional in v1; can be included if low cost).

Interaction:
- Trigger radius: 80 px.
- Prompt: `Press E` when inside trigger.
- Press `E` opens station panel.
- Leaving trigger or `Esc` closes panel.

Map Device v1 UI:
- Inputs: zone (unlocked only), tier (1-7, unlocked only).
- Objective fixed to `Extermination`.
- Launch button.
- Preview panel: expected monster level range, reward multipliers, portals.

## 8. Expedition Generation (V1)

Generation is deterministic by seed.

### 8.1 RNG and determinism

- Use one seeded RNG helper in `expedition-generation.ts`.
- Do not call `Math.random()` after seed initialization in generation path.
- Runtime combat randomness can remain non-seeded.

### 8.2 Layout rules (Extermination only)

Default parameters (store in `expeditions.data.ts`):

```ts
ROOM_COUNT_BY_TIER = {
  1: [4, 5],
  2: [5, 6],
  3: [5, 6],
  4: [6, 7],
  5: [6, 7],
  6: [7, 8],
  7: [7, 8],
};

BRANCH_COUNT_BY_TIER = {
  1: [0, 1],
  2: [1, 1],
  3: [1, 2],
  4: [1, 2],
  5: [2, 2],
  6: [2, 3],
  7: [2, 3],
};
```

Room dimensions:
- Small: 320-420 px
- Medium: 420-600 px
- Large: 600-760 px

Corridors:
- Width: 96 px
- Length target: 220-360 px

Placement constraints:
- Main spine is mostly forward (left to right).
- Side branch depth max: 2.
- Minimum room gap: 80 px.
- No overlapping room rectangles.

### 8.3 Room typing weights (v1)

- Combat room: 82%
- Elite room: 13%
- Treasure room: 5% (branch-only)

No dedicated boss room in v1 Extermination.

## 9. Monster Spawn and Objective Rules

Objective in v1:
- Extermination only.
- Completion condition: kill `requiredKills` monsters.
- `requiredKills` formula: `ceil(totalSpawned * 0.95)`.
- Anti-straggler rule: once `currentKills >= requiredKills`, map completes immediately.

Spawn model:
- Room-based spawning only (spawn on first room entry).
- Spawn delay after room entry: 0.25 seconds.
- First room spawns immediately on run start.
- Cleared room never respawns during same run.

Spawn counts:
- `baseSpawnsPerCombatRoom = 4`
- `baseSpawnsPerEliteRoom = 6`
- Tier scalar: `1 + (tier - 1) * 0.12`
- Final spawn count per room: `round(base * scalar)` (minimum 3)

Elite room rules:
- At least one elite-marked monster in room.
- Elite kill guarantees one drop roll with +1 rarity step floor to `uncommon`.

Performance guardrails:
- Max alive monsters at once in expedition: 45.
- If cap is hit, defer remaining room spawns in 0.5s batches.

## 10. Checkpoint, Death, and Portals

Casual-friendly failure model:
- No level rollback.
- No gold-loss death penalty while in expedition.
- Penalty is portal consumption and potential run loss.

Portal rules:
- `maxPortals = 3` (v1 default, tunable).
- On player death in expedition:
  - consume 1 portal.
  - if portals remain, respawn at checkpoint room center.
  - full HP and full Energy on respawn.
  - 2.0s invulnerability after respawn.
- If portals reach 0, run fails and player returns Hub.

Checkpoint rules:
- Checkpoint updates when a room is fully cleared.
- Initial checkpoint is spawn room.
- On respawn, uncleared current-room monsters reset to initial spawn state.

## 11. Instance Lifecycle and Persistence

Lifecycle states:
- `idle` (in Hub, no run)
- `active`
- terminal: `completed`, `failed`, or `abandoned`

Abandon behavior:
- `Esc` in expedition opens confirm dialog: `Leave Expedition?`
- Confirming leaves run immediately as `abandoned` and returns Hub.

Persistence policy (v1):
- Active expedition is not saved to disk.
- App reload always resumes in Hub with no active run.
- Meta progression is saved:
  - unlocked tiers
  - first-clear rewards claimed
  - aggregate run stats
- Picked-up inventory items are already in player inventory and remain.
- Uncollected floor loot is lost on completion/fail/abandon.

## 12. Reward System (Data-Driven)

Kill rewards:
- Keep existing per-monster XP/gold/drop logic unchanged.

Completion rewards (new):
- Grant completion XP and gold on run complete.
- Spawn one completion chest item.
- If first clear for `(tier, extermination)`, grant first-clear bonus.

All values in `expeditions.data.ts`:

```ts
COMPLETION_XP_BY_TIER = [0, 80, 170, 320, 560, 900, 1350, 2000];
COMPLETION_GOLD_BY_TIER = [0, 120, 260, 470, 760, 1150, 1650, 2400];

FIRST_CLEAR_XP_MULT = 0.5;      // +50% of completion XP
FIRST_CLEAR_GOLD_MULT = 0.5;    // +50% of completion gold

COMPLETION_CHEST_COUNT_BY_TIER = [0, 1, 1, 1, 1, 2, 2, 2];
```

Formula:
- `completionXP = COMPLETION_XP_BY_TIER[tier]`
- `completionGold = COMPLETION_GOLD_BY_TIER[tier]`
- If first clear, add multipliers above.

Chest generation (v1):
- Use `itemGen.generateShopItem(tier)` for each completion chest.
- Reason: slightly better-than-normal quality without guaranteed rare+ power spikes.

Tier unlock rules:
- Completing any tier `N` expedition unlocks tier `N+1`.
- Tier 7 has no next unlock.

## 13. UI and HUD Requirements

Hub HUD:
- Show `Hub: Haven` label.
- No objective tracker.
- Minimap shows Hub footprint and NPC markers.

Expedition HUD:
- Objective tracker text: `Extermination: currentKills / requiredKills`.
- Zone and tier label: `Whisperwood (T1)`.
- Portals text: `Portals: 3/3`.
- Minimap: visited rooms dimmed, current room highlighted.
- ESC action: open leave-run confirmation (not inventory close only).

Result toast on terminal state:
- Completed: show duration and bonus rewards.
- Failed: show `No portals remaining`.
- Abandoned: show `Expedition abandoned`.

## 14. Integration Changes to Existing Systems

Combat system:
- Add expedition-aware death handling branch.
- Existing global death penalty remains for non-expedition contexts.

Zones system:
- Keep as compatibility module for now.
- Move spawn authority in expeditions to `expeditions.ts`.

Loot system:
- Add optional source tags for drops (`normal`, `elite`, `completionChest`).
- No mandatory behavior change required for v1 baseline.

## 15. Tunables File Contract

Create `src/data/expeditions.data.ts` and keep all expedition tuning there.

Must include:
- Room count ranges.
- Branch count ranges.
- Spawn count baselines and tier scalar.
- Portal defaults.
- Completion reward arrays and first-clear multipliers.
- Alive cap.
- Checkpoint and respawn constants.

Rule: no expedition balance numbers hardcoded in scenes/systems.

## 16. Telemetry and Debug Hooks (V1)

Track in memory for debug UI/logging:
- Run seed, duration, tier, zone.
- Kills, deaths, portals used.
- Completion/failure reason.
- Reward breakdown.

Optional debug commands:
- Force complete current run.
- Force fail current run.
- Print generated room graph to console.

## 17. Acceptance Criteria

Functional:
- Game starts in Hub.
- Player can launch expedition from Map Device.
- Generated map has deterministic layout for same seed.
- Monsters spawn per room entry.
- Extermination objective completes and opens return portal.
- Death consumes portals and respawns at checkpoint.
- Third death fails run and returns Hub.
- Completion grants configured XP/gold/chest rewards.
- Tier unlock progression works from T1 to T7.

Technical:
- All expedition constants come from `expeditions.data.ts`.
- No TypeScript `any` added for expedition state/events.
- Existing systems continue to work in non-expedition mode.

Performance:
- Stable 60 FPS target on desktop during T1-T3 runs.
- No runaway monster accumulation beyond alive cap.

## 18. Test Plan (Minimum)

Automated (Playwright + unit where practical):
- Launch expedition from Hub and verify state transition.
- Deterministic generation snapshot for fixed seed.
- Portal decrement and respawn behavior for repeated deaths.
- Run failure at zero portals.
- Completion reward grant and first-clear one-time bonus logic.
- Tier unlock after completion.

Manual smoke:
- 3 consecutive runs in T1 without soft-lock.
- Abandon flow from ESC confirm.
- Inventory persists picked items after fail/abandon.

## 19. V1.1 Backlog (Already Planned)

- Add Boss Hunt objective.
- Add modifier system.
- Add stash UI/system.
- Add run history panel in Hub.
