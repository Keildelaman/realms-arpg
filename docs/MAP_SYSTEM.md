# Map System — Hub & Expeditions

## Overview

The game uses a **Hub + Instanced Maps** model (inspired by Path of Exile / Diablo 3). Players spend downtime in a persistent safe zone (the Hub) managing gear, crafting, and shopping. They enter combat through procedurally generated maps called **Expeditions** launched from the Hub's portal device.

There is **no open world**. All combat happens inside self-contained Expedition maps with clear objectives and compact layouts that minimize backtracking.

---

## The Hub — "Haven"

A persistent, combat-free safe zone. The player spawns here on game start, and returns here after completing or abandoning an Expedition.

### Layout

A single hand-designed map (not procedural). Small enough to traverse in a few seconds. Contains NPC stations arranged around a central plaza.

```
┌──────────────────────────────────────────┐
│                  Haven                   │
│                                          │
│   [Stash]              [Blacksmith]      │
│      │                      │            │
│      └──── Central Plaza ───┘            │
│            /     |     \                 │
│      [Merchant]  |  [Training Dummy]     │
│                  |                       │
│            [Map Device]                  │
│            (Portal Pad)                  │
│                                          │
└──────────────────────────────────────────┘
```

### NPCs & Stations

| Station | Function | System |
|---------|----------|--------|
| **Map Device** | Select expedition tier/zone, apply map modifiers, launch portal | `zones.ts` / new `expeditions.ts` |
| **Merchant** | Buy/sell items, refresh shop | `economy.ts` (already implemented) |
| **Blacksmith** | Reforge, imbue, temper equipment | `item-crafting.ts` (already implemented) |
| **Stash** | Shared storage across runs. Separate from inventory | new `stash.ts` |
| **Training Dummy** | Stationary target to test DPS, skill combos | Uses existing `combat.ts` |

### Interaction

- Player walks up to an NPC and presses `E` (or clicks)
- Opens the relevant UI panel (similar to current inventory panel)
- Player can walk away or press `Escape` to close

### Stretch Goals (later)

- Skill shrine (skill tree / unlock UI)
- Enchanter (socket system for items)
- Bestiary (monster encyclopedia)
- Leaderboard board
- Cosmetic wardrobe

---

## Expeditions — Procedural Combat Maps

### Core Loop

```
Hub → Map Device → Select Expedition → Portal opens →
  Enter map → Clear objective → Loot rewards → Portal back to Hub
```

### Map Properties

Each Expedition has:

| Property | Description |
|----------|-------------|
| **Zone** | Biome theme (Whisperwood, Dusthaven, etc.) — determines tileset, monsters, colors |
| **Tier** | Difficulty level (1-7). Affects monster levels, item drop tiers, affix tiers |
| **Objective** | What the player must do to "complete" the map (see below) |
| **Modifiers** | Optional difficulty/reward multipliers (see below) |
| **Seed** | Random seed for deterministic procedural generation |

### Objectives

One objective per map, shown in the HUD. Completion opens an exit portal.

| Objective | Description | When to Use |
|-----------|-------------|-------------|
| **Extermination** | Kill 100% of monsters | Small, dense maps |
| **Sweep** | Kill 75% of monsters | Medium maps with some optional areas |
| **Boss Hunt** | Find and defeat the zone boss | Larger maps, boss at the end |
| **Survival** | Survive X waves of spawning enemies | Arena-style single room |
| **Timed Clear** | Kill X% before timer expires | Speed-focused challenge |

### Map Modifiers (stretch — implement after base system)

Modifiers add difficulty for better rewards. Applied at the Map Device before launch.

| Modifier | Effect | Reward Bonus |
|----------|--------|-------------|
| **Dense** | +50% monster count | +30% item quantity |
| **Lethal** | +40% monster damage | +25% item rarity |
| **Haste** | +30% monster speed | +20% XP bonus |
| **Armored Horde** | All monsters gain armor type | +35% gold |
| **Boss Empowered** | Boss has 2x HP and new attack | Guaranteed rare+ drop |

---

## Procedural Map Generation

### Philosophy

- **Forward-flowing** — player moves in one general direction, minimal backtracking
- **Compact** — maps take 2-5 minutes to clear, not sprawling open fields
- **Readable** — player can understand the layout at a glance from the minimap
- **Varied** — room shapes, connections, and monster placement change each run

### Algorithm: Linear Branch Generation

Maps are a sequence of **rooms** connected by **corridors**, forming a mostly-linear path with optional side branches.

```
Step 1: Generate the spine (main path)
  ┌────┐    ┌────┐    ┌────┐    ┌────┐    ┌──────┐
  │Start├───►Room ├───►Room ├───►Room ├───►│ Boss │
  └────┘    └──┬─┘    └────┘    └──┬─┘    └──────┘
               │                    │
Step 2: Add side branches (1-3 per map)
               │                    │
            ┌──▼──┐              ┌──▼──┐
            │Bonus│              │Bonus│
            └─────┘              └─────┘
```

#### Generation Steps

1. **Pick room count** — Based on map tier and objective:
   - Extermination: 4-6 rooms
   - Sweep: 6-8 rooms
   - Boss Hunt: 7-10 rooms
   - Survival: 1 arena room
   - Timed Clear: 5-7 rooms

2. **Generate spine** — Place rooms left-to-right (or following a general direction), connected by corridors. Each room is offset randomly in the perpendicular axis to create organic flow.

3. **Vary room shapes** — Rooms are rectangular with randomized dimensions:
   - Small combat room: 300-400px
   - Medium room: 400-600px
   - Large arena: 600-800px
   - Corridor: 80-120px wide, 200-400px long

4. **Add branches** — Roll 1-3 side branches from random spine rooms. Branches are 1-2 rooms deep. Side rooms often contain bonus loot or a mini-boss.

5. **Place spawn points** — Each combat room gets monster spawn markers based on room size. Monsters spawn when the player enters the room or on a short delay.

6. **Place boss** — For Boss Hunt maps, the boss spawns in the final room. Other objectives don't have a guaranteed boss.

7. **Place entrance/exit** — Entrance portal in the first room. Exit portal appears in the last room after objective completion.

### Room Types

| Type | Content | Frequency |
|------|---------|-----------|
| **Combat Room** | Monster spawns, triggered on entry | 70% |
| **Elite Room** | Tougher monsters, guaranteed item drop | 15% |
| **Treasure Room** | Loot chest, no/few enemies | 10% (side branches only) |
| **Boss Room** | Zone boss + arena space | 1 per Boss Hunt map |
| **Arena** | Open area for wave survival | Survival maps only |

### Data Structure

```typescript
interface ExpeditionMap {
  seed: number;
  zoneId: string;
  tier: number;
  objective: ObjectiveType;
  modifiers: MapModifier[];
  rooms: Room[];
  corridors: Corridor[];
  spawnRoom: string;        // room ID where player starts
  objectiveRoom: string;    // room ID for boss/exit
}

interface Room {
  id: string;
  type: RoomType;
  x: number;                // world position
  y: number;
  width: number;
  height: number;
  connections: string[];    // IDs of connected rooms/corridors
  monsterSpawns: SpawnPoint[];
  cleared: boolean;
  visited: boolean;
}

interface Corridor {
  id: string;
  fromRoom: string;
  toRoom: string;
  points: { x: number; y: number }[];   // waypoints defining the corridor path
  width: number;
}

interface SpawnPoint {
  x: number;               // relative to room origin
  y: number;
  monsterId: string;       // from zone's monster list
  isBoss: boolean;
  isElite: boolean;
}
```

---

## Rendering (Phased Approach)

### Phase 1: Colored Geometry (current art level)

Rooms and corridors rendered with simple filled rectangles and borders. Matches the current placeholder art style.

```
- Room floor:    Filled rectangle, zone-themed color (e.g., green for Whisperwood)
- Room walls:    Dark border rectangle, acts as visual boundary
- Corridors:     Thin filled rectangles connecting rooms
- Minimap:       Shows room outlines, visited/unvisited state, player position
```

Wall collision via Arcade physics static bodies placed at room edges and corridor walls.

### Phase 2: Tilemap Rendering (future)

Replace colored rectangles with proper tilesets per zone. Rooms and corridors stamp tile patterns from a tileset. Walls become proper tile colliders.

### Phase 3: Visual Polish (future)

Decorations, environmental props, lighting, particle effects, animated tiles.

---

## Progression & Unlocking

### Map Tier Unlocking

| Tier | Zone | Unlock Condition |
|------|------|-----------------|
| T1 | Whisperwood | Available from start |
| T2 | Dusthaven | Complete any T1 Boss Hunt |
| T3 | Frosthollow | Complete any T2 Boss Hunt |
| T4 | Emberpeak | Complete any T3 Boss Hunt |
| T5 | Shadowmere | Complete any T4 Boss Hunt |
| T6 | Crystalspire | Complete any T5 Boss Hunt |
| T7 | Void Rift | Complete any T6 Boss Hunt |

### Rewards

- **On map completion:** Bonus XP + gold based on tier and objective
- **Completion bonus:** Extra loot chest spawns at exit portal
- **Map modifiers:** Multiply rewards (more risk = more loot)
- **First clear bonus:** Extra rewards for first completion of each tier+objective combo

---

## HUD Changes for Expeditions

When inside an Expedition:

```
┌─────────────────────────────────────────────┐
│  [HP Bar]  [Energy Bar]                     │
│  Objective: Kill 12/16 monsters  [Minimap]  │
│  Zone: Whisperwood T1                       │
│                                             │
│                                             │
│                                             │
│           (gameplay area)                   │
│                                             │
│                                             │
│  [Skill Bar]         [Return to Hub: ESC]   │
└─────────────────────────────────────────────┘
```

- **Objective tracker** — Shows current objective progress (kills, boss HP, timer)
- **Return to Hub button** — ESC key opens a "Leave Expedition?" confirmation
- **Minimap** — Shows room layout, visited rooms dimmer, current room highlighted

When in the Hub:

- No objective tracker
- Minimap shows Haven layout with NPC labels
- No return button (player is already home)

---

## Migration from Current Zone System

The current `zones.ts` system (monster spawning, boss unlock, kill tracking) gets refactored:

| Current | New |
|---------|-----|
| `zones.enterZone(id)` | `expeditions.launchExpedition(config)` |
| Zone is a 2400x2400 flat area | Map is generated rooms + corridors |
| Monsters spawn randomly around player | Monsters spawn per-room on entry |
| Boss unlocks after X kills | Boss is placed in final room |
| Zone transitions at edges | Portal back to Hub on completion |
| `zones.data.ts` zone definitions | Still used — provides biome theme, monster lists, tier data |

The zone data files (`zones.data.ts`, `monsters.data.ts`) remain unchanged — they define *what* spawns, not *where*. The new expedition system handles the *where*.

---

## Implementation Order

### Phase 1: Hub Foundation
1. Create Haven scene (hand-designed small map with collision)
2. Add NPC interaction system (walk up + press E)
3. Wire existing merchant/crafting UI panels to NPCs
4. Add Map Device UI (tier/zone selector, launch button)
5. Transition: game starts in Hub, not directly in combat

### Phase 2: Basic Expedition Generation
1. Implement room + corridor generation algorithm
2. Render rooms as colored rectangles with wall collision
3. Room-based monster spawning (spawn on entry)
4. Basic objective tracking (extermination first)
5. Exit portal on objective completion → return to Hub

### Phase 3: Expedition Polish
1. Add remaining objective types (sweep, boss hunt, survival, timed)
2. Add side branches with treasure/elite rooms
3. Minimap room visualization
4. Completion rewards and first-clear bonuses

### Phase 4: Map Modifiers & Progression
1. Map modifier system
2. Tier unlock progression
3. Stash system in Hub
4. Run statistics and history

---

## Open Questions

- **Map keys/items?** — Should higher-tier maps require consumable keys (like PoE maps)?
- **Death penalty in expeditions?** — Respawn in Hub and lose map progress? Or respawn at last cleared room?
- **Multiplayer future?** — If co-op is ever added, Hub would be shared, expeditions instanced per party
- **Endless mode?** — A special map type with infinite scaling difficulty for leaderboard pushing?
