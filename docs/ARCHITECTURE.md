# Architecture — Realms of Clickoria ARPG

## Scene Structure

Phaser uses **Scenes** as the top-level organizational unit. Our game runs multiple scenes in parallel:

```
┌─────────────────────────────────────────┐
│  UIScene (overlay)                      │ ← HUD: HP/energy bars, skill bar,
│  ┌───────────────────────────────────┐  │   minimap, floating damage numbers
│  │                                   │  │
│  │         GameScene                 │  │ ← World: tilemap, player, monsters,
│  │                                   │  │   projectiles, effects, camera
│  │                                   │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
         ↑ loaded by BootScene
```

| Scene | Responsibility |
|-------|---------------|
| **BootScene** | Load all assets (sprites, tilemaps, audio), show loading bar, then start GameScene |
| **GameScene** | World rendering, entity management, physics, camera. Owns the game loop (`update()`). |
| **UIScene** | Overlay HUD rendered on top of GameScene. Reads state, listens to events. Never touches world objects. |
| **HubScene** | *(planned)* Safe zone with NPCs — merchant, blacksmith, stash, map device. See `docs/MAP_SYSTEM.md`. |

## System Integration Pattern

Game systems from the clicker port live in `src/systems/`. They are **not** Phaser objects — they're plain TypeScript modules that:
1. Subscribe to events (via EventBus or Phaser events)
2. Get called from GameScene's `update(dt)` for tick-based logic
3. Mutate game state
4. Emit events for UI to react to

```
GameScene.update(time, delta)
  ├── movement.update(dt)       # Player + monster movement
  ├── monsterAI.update(dt)      # AI state machines
  ├── combat.update(dt)         # Attack cooldowns, projectiles
  ├── statusEffects.update(dt)  # DoT ticks, duration tracking
  ├── skills.update(dt)         # Cooldown timers, buff durations
  ├── health.update(dt)         # HP regen, shield regen
  ├── energy.update(dt)         # Energy regen
  └── loot.update(dt)           # Drop processing
```

## Entity Model

Entities are Phaser game objects (sprites with physics bodies) wrapped with game logic:

```typescript
// Player entity — Phaser sprite + our game state
class PlayerEntity {
  sprite: Phaser.Physics.Arcade.Sprite;  // Phaser handles rendering + physics
  // Game logic reads/writes state.player (same as clicker)
}

// Monster entity — Phaser sprite + monster instance data
class MonsterEntity {
  sprite: Phaser.Physics.Arcade.Sprite;
  data: MonsterInstance;  // Same monster instance object as clicker
  ai: AIStateMachine;     // NEW — behavioral AI
  healthBar: FloatingBar; // NEW — world-space HP bar above sprite
}
```

## Communication Patterns

Same as clicker — adapted for Phaser:

### Player Input → System
```
Keyboard/Touch input
  → GameScene detects input
  → Calls system function (e.g., combat.attack(), movement.move())
  → System mutates state + emits events
```

### System → UI
```
System emits event (e.g., 'combat:hit')
  → UIScene listens
  → Updates HUD element (HP bar, damage number, etc.)
```

### System → System
```
Option A: DI (synchronous) — system.init({ getComputedStats })
Option B: Events (async) — emit('combat:monsterKilled') → loot.js listens
```

### System → World
```
System emits event (e.g., 'monster:spawned')
  → GameScene listens
  → Creates Phaser sprite + physics body
  → MonsterEntity wraps it
```

## Folder Structure

```
src/
├── main.ts                 # Phaser game config, scene registration
│
├── scenes/
│   ├── BootScene.ts        # Asset loading
│   ├── GameScene.ts        # World, entities, physics, camera, system ticks
│   ├── UIScene.ts          # HUD overlay
│   └── HubScene.ts         # (planned) Safe zone with NPCs, map device
│
├── entities/
│   ├── PlayerEntity.ts     # Player sprite + movement + attack animations
│   ├── MonsterEntity.ts    # Monster sprite + AI + floating HP bar
│   └── Projectile.ts       # Projectile sprite + velocity + hit detection
│
├── systems/                # Game logic (ported from clicker, adapted)
│   ├── combat.ts           # Damage calc, attack execution, hit detection
│   ├── player.ts           # Stat computation, derived stats, equipment
│   ├── skills.ts           # Skill engine (cooldowns, energy, buffs, slots)
│   ├── skill-effects.ts    # 31 active skill effect handlers
│   ├── skill-passives.ts   # 15 passive skill handlers
│   ├── status-effects.ts   # Burn, poison, bleed, slow, freeze
│   ├── items.ts            # Equipment, inventory, affixes
│   ├── item-gen.ts         # Procedural item generation
│   ├── item-crafting.ts    # Reforge, imbue, temper
│   ├── item-effects.ts     # Legendary unique effects
│   ├── monster.ts          # Monster spawning, instance creation
│   ├── monster-ai.ts       # NEW — behavior trees, pathfinding
│   ├── health.ts           # HP regen, damage, shields, death
│   ├── energy.ts           # Energy gain/spend/regen
│   ├── economy.ts          # Gold, shop, pricing
│   ├── progression.ts      # XP, leveling, milestones
│   ├── loot.ts             # Drop rolls, item granting
│   ├── zones.ts            # Zone management, transitions
│   └── movement.ts         # NEW — player/monster movement, collision
│
├── data/                   # Static game data (ported from clicker → TypeScript)
│   ├── constants.ts        # All magic numbers
│   ├── balance.ts          # Scaling formulas
│   ├── skills.data.ts      # 46 skill definitions
│   ├── monsters.data.ts    # 54 monster definitions
│   ├── zones.data.ts       # 7 zone definitions
│   ├── affixes.data.ts     # 61 affix definitions
│   ├── legendaries.data.ts # 15 legendary definitions
│   └── item-names.data.ts  # Weapon naming templates
│
├── core/
│   ├── event-bus.ts        # Pub/sub (port from clicker or use Phaser.Events)
│   └── game-state.ts       # Central state store
│
└── ui/                     # Phaser-based UI components
    ├── HealthBar.ts        # Floating HP bar (world-space, above entities)
    ├── HUDBar.ts           # Screen-space bars (player HP, energy, XP)
    ├── SkillBar.ts         # Bottom skill bar with cooldown overlays
    ├── DamageNumber.ts     # Floating damage text that fades up
    ├── Minimap.ts          # Corner minimap showing nearby entities
    └── StatusIcons.ts      # Buff/debuff icons on entities
```

## Physics Setup

Using Phaser's **Arcade Physics** (simple, fast, sufficient for 2D ARPG):

```typescript
physics: {
  default: 'arcade',
  arcade: {
    gravity: { x: 0, y: 0 },  // Top-down, no gravity
    debug: false,               // Toggle for hitbox visualization
  },
}
```

- Player: circular collider, moves via velocity
- Monsters: circular colliders, pathfinding sets velocity
- Projectiles: small colliders, velocity-based, overlap detection for hits
- Walls/obstacles: static bodies from tilemap collision layer

## Tilemap Integration

Maps created in **Tiled** (or generated in code), loaded as JSON:

```
Layers:
  1. Ground        — Visual only (grass, stone, dirt)
  2. Decoration    — Visual only (flowers, rocks, bones)
  3. Collision     — Invisible, Phaser creates static bodies from this
  4. Objects       — Spawn points (player start, monster zones, portals)
```

## Camera

- GameScene camera follows the player with smooth lerp
- World bounds set per zone (from tilemap dimensions)
- Screen shake on big hits / boss attacks
- UIScene camera is fixed (never moves)
