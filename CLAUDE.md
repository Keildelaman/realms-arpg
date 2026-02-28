# CLAUDE.md — Realms of Clickoria ARPG

## Project Overview

**Realms of Clickoria: ARPG Edition** — A 2D action RPG built with Phaser 3 and TypeScript. Evolved from the clicker game of the same name, reusing its deep RPG backend (46 skills, 54 monsters, 61 affixes, 15 legendaries, 5 status effects) with new spatial gameplay.

**Clicker repo:** `../clicker_02_26/` — Reference for systems, data, balance, and design docs.

---

## Tech Stack

| Tech | Purpose |
|------|---------|
| **Phaser 3** | Game framework (rendering, physics, tilemaps, input, audio) |
| **TypeScript** | Language (strict mode) |
| **Vite** | Dev server + bundler |

```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build to dist/
npx tsc --noEmit # Type-check only
```

---

## Project Structure

```
src/
├── main.ts           # Phaser game config + scene registration
├── scenes/           # Phaser scenes (BootScene, GameScene, UIScene)
├── systems/          # Game logic (combat, skills, items, status-effects, etc.)
├── entities/         # Game objects with spatial presence (Player, Monster, Projectile)
├── data/             # Static game data (constants, balance, skill/monster/item defs)
├── core/             # Event bus, game state
└── ui/               # Phaser-based UI components (bars, skill bar, damage numbers)

assets/
├── sprites/          # Spritesheets
├── tilemaps/         # Tiled JSON maps
└── audio/            # Sound effects + music

tests/
├── fixtures/         # Playwright test fixtures
├── helpers/          # Game state query helpers
└── specs/            # Test specs (ui, combat, skills)

docs/
├── TECH_STACK.md     # Technology choices and rationale
├── CLICKER_REFERENCE.md  # Detailed reference of clicker systems to port
├── ARCHITECTURE.md   # System design, scene structure, entity model
└── MAP_SYSTEM.md     # Hub + Expedition procedural map design
```

---

## Coding Standards

### TypeScript
```typescript
// Strict mode enabled. No `any` unless absolutely necessary.
// Use interfaces for data shapes, types for unions.

interface MonsterInstance {
  id: string;
  name: string;
  currentHP: number;
  maxHP: number;
  type: MonsterType;
}

type DamageType = 'physical' | 'magic';
type MonsterType = 'normal' | 'swift' | 'aggressive' | 'regenerating' | 'armored' | 'shielded';
```

### Naming
```typescript
// Variables/functions: camelCase
const playerSpeed = 200;
function calculateDamage() {}

// Constants: UPPER_SNAKE_CASE
const BASE_PLAYER_ATTACK = 5;
const MAX_ENERGY = 100;

// Classes: PascalCase
class MonsterEntity {}

// Files: PascalCase for classes, camelCase for modules
// PlayerEntity.ts, combat.ts, constants.ts
```

### Architecture Rules (carried from clicker — still apply)

1. **Systems never import other systems.** Use DI via init() or events.
2. **Systems never touch the DOM/Phaser objects directly.** They emit events; scenes/entities react.
3. **Scenes never contain business logic.** They delegate to systems.
4. **Data modules are pure.** Static objects and pure functions only.
5. **Events for cross-system communication.** Intent events from UI, result events from systems.

### Phaser-Specific Patterns

```typescript
// Scenes access systems, not the other way around
class GameScene extends Phaser.Scene {
  update(time: number, delta: number) {
    const dt = delta / 1000; // Phaser gives ms, systems expect seconds
    combat.update(dt);
    skills.update(dt);
  }
}

// Entities are Phaser sprites with game logic attached
class MonsterEntity {
  sprite: Phaser.Physics.Arcade.Sprite;
  data: MonsterInstance; // Pure data, no Phaser dependency
}

// UI components extend Phaser.GameObjects, read from state
class HealthBar extends Phaser.GameObjects.Container {
  update() {
    const ratio = state.player.currentHP / state.player.maxHP;
    this.setBarWidth(ratio);
  }
}
```

---

## Key Reference (from clicker)

### Combat Math
```
damage = isCrit ? floor(attack × critMultiplier) : attack
damageReduction = defense / (defense + 100)
finalDamage = max(1, damage × (1 - damageReduction))
```

### Status Effects
- **Bleed:** 5 stacks max, 4s, 5% atk/stack/tick (1s ticks)
- **Poison:** 10 stacks max, 5s, 3% atk/stack/tick (1s ticks)
- **Burn:** 1 stack, 3.5s, 10% magicPower/tick (0.5s ticks)
- **Slow:** 30% action speed reduction, 4s
- **Freeze:** Complete stun, 1.5s, 5s reapply cooldown

### Skills
- 4 active + 3 passive slots
- 31 active skills, 15 passive skills
- SP (Skill Points) earned every 3 levels
- Max skill level: 5 (items can push beyond)

### Items
- 6 equipment slots (weapon, helmet, chest, gloves, boots, accessory)
- 5 rarities (Common → Legendary)
- 61 affixes, 7 tiers matching zones
- Procedural generation via generateItem()

---

## Common Tasks

### Add New Monster
1. Add definition to `src/data/monsters.data.ts`
2. Add AI behavior in `src/systems/monster-ai.ts`
3. Add to zone's monster list in `src/data/zones.data.ts`
4. Create sprite/animations in BootScene

### Add New Skill
1. Add definition to `src/data/skills.data.ts`
2. Add effect handler in `src/systems/skill-effects.ts`
3. Define targeting mode (melee/ranged/AoE) and visual effect
4. Skill bar auto-generates from data

### Add New Zone
1. Create tilemap (Tiled or code-generated)
2. Add zone definition to `src/data/zones.data.ts`
3. Add zone transition logic in `src/systems/zones.ts`
4. Add tileset assets + ambient audio

---

## Documentation

| Doc | Purpose |
|-----|---------|
| `docs/TECH_STACK.md` | Why Phaser + TypeScript + Vite |
| `docs/CLICKER_REFERENCE.md` | Complete inventory of clicker systems to port/adapt |
| `docs/ARCHITECTURE.md` | Scene structure, entity model, system integration |
| `docs/MAP_SYSTEM.md` | Hub ("Haven") + Expedition procedural map system design |
| `../clicker_02_26/docs/` | Original 25+ game design spec documents |
