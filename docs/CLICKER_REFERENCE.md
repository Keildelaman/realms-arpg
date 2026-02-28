# Clicker Codebase Reference

> Source repo: `../clicker_02_26/`
> This documents what exists in the clicker and how it maps to the ARPG.

---

## Architecture Overview

The clicker uses an **event-driven, decoupled architecture** that maps almost directly to an ARPG:

- **EventBus** (pub/sub) — All cross-system communication via events. Systems never import each other.
- **Dependency Injection** — Cross-system function calls wired in main.js via `init(deps)`.
- **Central State** — Single `state` object. Only `state.player` persisted to localStorage.
- **Delta-time Game Loop** — rAF-based tick loop. All time-dependent mechanics use `dt`.
- **Systems own their domain** — Each system mutates only its own slice of state.

### What carries over directly:
- EventBus pattern (Phaser has its own event emitter, or we port ours)
- State management pattern
- DI wiring pattern
- All game math and balance formulas

### What gets replaced:
- `game-loop.js` → Phaser's scene update loop
- All `ui/` files → Phaser scenes + game objects
- DOM-based rendering → Canvas/WebGL via Phaser

---

## Systems Inventory (18 files, ~6,700 lines)

### Direct Port (minimal changes)

| System | Lines | ARPG Changes |
|--------|-------|-------------|
| **player.js** | 424 | Add movement speed stat. Stat computation, equipment bonuses, buff aggregation all carry over. |
| **skills.js** | 749 | Core engine (cooldowns, energy, buffs, slots) carries over. Replace click triggers with attack animation triggers. Add targeting (single/AoE/projectile). |
| **status-effects.js** | 552 | Nearly 100% reusable. Burn, poison, bleed, slow, freeze — these ARE ARPG mechanics. Just add spatial AoE spread. |
| **items.js** | 694 | Equipment slots, affixes, scrapping all carry over. No spatial component. |
| **item-gen.js** | 350 | Pure functions generating items. 100% reusable. |
| **item-crafting.js** | 328 | Reforge, imbue, temper. 100% reusable. |
| **item-effects.js** | 296 | Legendary unique effects. 95% reusable (some reference click events → change to attack events). |
| **economy.js** | 220 | Gold, shop, pricing. 100% reusable. |
| **progression.js** | 115 | XP, leveling, milestones. 100% reusable. |
| **energy.js** | 138 | Energy gain/spend/regen. Change: energy per click → energy per attack. |
| **health.js** | 247 | HP regen, damage taken, shields. Add: dodge/block spatial mechanics. |
| **loot.js** | 148 | Drop rolls, boss loot. 100% reusable. |
| **zones.js** | 204 | Zone travel, unlock, boss access. Add: tilemap loading, zone transitions. |

### Significant Adaptation

| System | Lines | ARPG Changes |
|--------|-------|-------------|
| **combat.js** | 743 | `applyDamageToMonster()` math carries over (armor pen, magic resist, crit, damage types). Replace `handleClick()` with attack animation + hitbox system. Add projectiles, AoE shapes, attack ranges. |
| **skill-effects.js** | 588 | 31 effect handlers. Logic carries over but needs spatial targeting: barrage → projectile spread, chain_lightning → nearest-enemy chaining, frost_nova → AoE circle, etc. |
| **skill-passives.js** | 334 | 15 passive handlers. Mostly event-based, carry over. Change click_mastery → attack_mastery. |
| **monster.js** | 244 | Spawning logic carries over. Add: spatial placement, patrol paths, aggro ranges. |

### New Systems Needed

| System | Purpose |
|--------|---------|
| **movement.ts** | Player + monster movement, collision response, knockback |
| **monster-ai.ts** | Behavior trees/state machines (idle → patrol → chase → attack → flee) |
| **spatial-combat.ts** | ✅ Merged into `combat.ts` — hitbox arcs, circles, range checks |
| **pathfinding.ts** | ⏳ Not yet needed — monsters use direct movement toward player |
| **tilemap.ts** | ⏳ Planned — see `docs/MAP_SYSTEM.md` for procedural map design |

---

## Data Layer (9 files, ~5,000 lines)

All data files are pure objects/functions — they port to TypeScript with type annotations added.

### Skills (46 total)

**31 Active Skills** across 9 categories:
- **Power:** power_strike, charge_up, life_tap
- **Speed:** barrage, flurry, momentum
- **Crit:** precision, execute, shatter
- **Utility:** shield_bash, energy_surge, adrenaline_rush
- **Mage:** arcane_bolt, chain_lightning, overcharge
- **Status (Bleed):** lacerate, rupture
- **Status (Poison):** envenom, venomous_surge, noxious_burst
- **Status (Burn):** immolate, inferno, combustion
- **Status (Cold):** frostbolt, permafrost, deep_chill, frost_nova, glacial_shatter
- **Status (Cross):** plague_touch, pandemic, cataclysm

**15 Passive Skills:**
click_mastery, vampiric_strikes, critical_flow, heavy_handed, combo_artist, berserker, efficient_casting, spell_weaver, residual_energy, focused_mind, affliction_mastery, toxic_resilience, venom_efficiency, frostbite_passive, plague_doctor

**Per-skill data:** unlockLevel, unlockCost (SP), upgradeCost, maxLevel (5), per-level scaling (damage%, cooldown, energyCost), mechanic type, statusEffect, conditions.

**ARPG adaptation:** Each skill needs a targeting mode (self, melee, ranged, AoE) and visual effect. The balance numbers and effect logic carry over.

### Monsters (54 total)

**6 types** (can combine, e.g. `"aggressive+armored"`):

| Type | ARPG Mapping |
|------|-------------|
| **Normal** | Standard melee/ranged enemy |
| **Swift** | Fast movement speed, hit-and-run AI |
| **Aggressive** | Charges player, telegraphed attacks |
| **Regenerating** | Heals over time, prioritize burst damage |
| **Armored** | Flat damage reduction, slow but tanky |
| **Shielded** | Shield bar absorbs first N damage, immune to status while shielded |

**7 Bosses** with escalating difficulty (60s → 300s time limits).

**Per-monster data:** id, name, zone, type, levelRange, baseHealth, healthPerLevel, goldReward, xpReward, spawnWeight, type-specific mechanics, statusImmunities.

### Items

- **6 equipment slots:** weapon, helmet, chest, gloves, boots, accessory
- **5 rarities:** Common (1 affix) → Legendary (4 affixes + unique effect)
- **61 affixes:** offensive (6), defensive (5), utility (4), status chance (5), status potency (5), skill category (38)
- **7 tiers:** T1-T7 matching zones, with flat multipliers 1x→30x
- **15 legendaries:** 2-3 per zone, boss-only drops, unique mechanics
- **3 modification systems:** Reforge (re-roll affixes), Imbue (add status affix), Temper (12-level enhancement)
- **Procedural generation** via `generateItem()` — pure function, fully reusable

### Zones (7)

| # | Zone | Levels | Theme |
|---|------|--------|-------|
| 1 | Whisperwood | 1-10 | Forest (green) |
| 2 | Dustwind | 10-20 | Desert (tan) |
| 3 | Shadowmire | 20-30 | Swamp (purple) |
| 4 | Ironhold | 30-45 | Mountain/forge (gray) |
| 5 | Emberfell | 45-60 | Volcanic (red/orange) |
| 6 | Frostpeak | 60-75 | Ice/snow (blue) |
| 7 | Voidrift | 75-100 | Void/cosmic (dark purple) |

Each zone needs: tileset, background music, ambient sounds, unique environmental hazards.

### Balance Formulas (key ones)

```
XP curve:       xpToNextLevel(level) = floor(600 × 1.09^(level-1))
Max HP:         maxHPAtLevel(level) = 100 + 10×(level-1)
Base attack:    baseAttackAtLevel(level) = 5 + (level-1)
Defense:        damageReduction = defense / (defense + 100)
Boss HP:        bossScaledHP = baseHP × (1 + 0.12 × effectiveLevel)
Material decay: effectiveRate = baseRate × 0.7^zonesAbove
Skill beyond max: multiplier = 1 + 0.20 × max(0, level - maxLevel)
```

---

## Status Effects (5 implemented)

| Effect | Stacks | Duration | Tick | Damage | Notes |
|--------|--------|----------|------|--------|-------|
| **Bleed** | 5 max | 4s | 1s | 5% atk × stacks/tick | Physical DoT |
| **Poison** | 10 max | 5s | 1s | 3% atk × stacks/tick | Physical DoT |
| **Burn** | 1 | 3.5s | 0.5s | 10% magicPower/tick | Magic DoT, fast ticks |
| **Slow** | 1 | 4s | — | — | 30% action speed reduction |
| **Freeze** | 1 | 1.5s | — | — | Complete stun, 5s reapply cooldown |

**ARPG adaptation:** These map perfectly. Add spatial AoE variants (poison cloud, fire patch on ground, frost AoE slow). The tick-based damage system works identically.

---

## Event Bus Events (key ones for ARPG)

### Combat Events (adapt triggers)
```
combat:click        → combat:attack (from animation hit frame)
combat:hit          → stays (system doesn't care about source)
combat:monsterKilled → stays
combat:bossFight    → stays
```

### Skill Events (mostly stay)
```
skill:used, skill:cooldownReady, skill:toggleOn/Off
skill:channelStarted/Release/Cancelled, skill:effectEnded
```

### Status Events (stay as-is)
```
statusEffect:tryApply, statusEffect:applied, statusEffect:immune
statusEffect:tick, statusEffect:damageMonster
statusEffect:frozen/unfrozen, statusEffect:slowed/slowEnded
```

### New Events Needed
```
movement:started, movement:stopped, movement:directionChanged
entity:spawned, entity:destroyed
ai:aggro, ai:deaggro, ai:stateChanged
projectile:fired, projectile:hit, projectile:expired
zone:entered, zone:transitionStarted
```

---

## Constants (key groups to port)

```typescript
// Combat
BASE_PLAYER_ATTACK = 5
BASE_CRIT_CHANCE = 0.05
BASE_CRIT_MULTIPLIER = 2.0
DAMAGE_TYPES = { PHYSICAL, MAGIC }
DEFENSE_SCALING_FACTOR = 100

// Health
BASE_PLAYER_HP = 100
HP_PER_LEVEL = 10
BASE_HP_REGEN = 0.015

// Energy
MAX_ENERGY = 100
ENERGY_PER_ATTACK = 3  // was ENERGY_PER_CLICK
ENERGY_ON_KILL = 10
ENERGY_REGEN_PER_SECOND = 1

// Skills
ACTIVE_SKILL_SLOTS = 4
PASSIVE_SKILL_SLOTS = 3
BASE_SKILL_MAX_LEVEL = 5
SP_PER_LEVEL_INTERVAL = 3

// Status Effects
BLEED_MAX_STACKS = 5, POISON_MAX_STACKS = 10
BURN_DURATION = 3.5, SLOW_STRENGTH = 0.30, FREEZE_DURATION = 1.5

// Items
EQUIPMENT_SLOTS = ['weapon','helmet','chest','gloves','boots','accessory']
RARITY_AFFIX_COUNTS = { common:1, uncommon:2, rare:3, epic:4, legendary:4 }
FLAT_TIER_MULTIPLIERS = [1.0, 2.0, 3.8, 6.5, 11.0, 18.0, 30.0]

// New for ARPG
PLAYER_MOVE_SPEED = 200
MONSTER_AGGRO_RANGE = 200
MONSTER_LEASH_RANGE = 400
ATTACK_RANGE_MELEE = 48
ATTACK_RANGE_RANGED = 300
```

---

## File Locations Quick Reference

All paths relative to `../clicker_02_26/`:

| What | Where |
|------|-------|
| Event bus | `js/core/event-bus.js` |
| Game state | `js/core/game-state.js` |
| All constants | `js/data/constants.js` |
| Balance formulas | `js/data/balance.js` |
| Skill definitions | `js/data/skills.data.js` |
| Monster definitions | `js/data/monsters.data.js` |
| Zone definitions | `js/data/zones.data.js` |
| Affix definitions | `js/data/affixes.data.js` |
| Legendary definitions | `js/data/legendaries.data.js` |
| Combat math | `js/systems/combat.js` (applyDamageToMonster) |
| Skill engine | `js/systems/skills.js` |
| Skill effect handlers | `js/systems/skill-effects.js` (EFFECT_HANDLERS) |
| Passive handlers | `js/systems/skill-passives.js` (PASSIVE_HANDLERS) |
| Status effect engine | `js/systems/status-effects.js` |
| Item generation | `js/systems/item-gen.js` (generateItem) |
| Item crafting | `js/systems/item-crafting.js` |
| Legendary effects | `js/systems/item-effects.js` (LEGENDARY_EFFECT_HANDLERS) |
| Design specs | `docs/` (25+ specification documents) |
| ARPG map design | `docs/MAP_SYSTEM.md` (hub + expedition system) |
