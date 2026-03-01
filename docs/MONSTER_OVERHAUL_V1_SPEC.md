# Monster Overhaul V1 — Implementation Spec

Status: Draft v1
Owner: Gameplay systems
Last updated: 2026-02-28

---

## 1. Product Intent

Transform monsters from stat-only variations into distinct combat encounters that demand player skill and attention. Every monster should feel mechanically unique — players should learn to read telegraphs, prioritize threats, and adjust tactics based on what's on screen.

Design pillars:
- **Readable danger.** Every monster ability has a clear telegraph. Players die because they misread, not because they didn't know.
- **Archetype diversity.** Fights should involve melee bruisers, ranged snipers, casters, and explosive threats — not just a wall of chasers.
- **Rarity excitement.** Seeing a rare (yellow) monster pack should trigger both fear and greed.
- **Data-driven.** Every monster, ability, and affix is defined in data files. No hardcoded behavior trees.

---

## 2. V1 Scope

### In Scope

- Monster archetype system: `melee`, `ranged`, `caster`, `charger`, `exploder`
- Monster rarity: `normal`, `magic`, `rare` (roll on spawn)
- Monster affix pool: 10 affixes applied to magic/rare monsters
- Monster ability system: per-monster abilities with cooldowns + telegraphs
- Monster projectile support: ranged/caster monsters fire projectiles at the player
- AI behavior profiles: archetype-specific state machines (keep-distance, charge patterns, etc.)
- Telegraph system: ground indicators for incoming attacks
- Visual rarity indicators: colored glow, size scaling, nameplates
- Loot scaling by rarity: drop chance and quality multipliers
- Redesigned Zone 1 (Whisperwood Glen) as proof-of-concept with 7 distinct monsters
- Guidelines and data structure for porting remaining zones

### Out of Scope (post-v1)

- `unique` (orange) rarity with hand-crafted loot tables
- `summoner` archetype (spawns minions)
- Pack leader / coordinated AI / flanking
- Monster status effect application (monsters inflicting bleed/poison on player)
- Animated spritesheets (continue using procedural shapes, but more distinct per archetype)
- Boss rework (bosses keep current system; boss overhaul is a separate spec)
- Environmental interactions (fire patches, poison clouds, etc.)

---

## 3. System Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/data/monster-abilities.data.ts` | All monster ability definitions |
| `src/data/monster-affixes.data.ts` | Monster affix pool (10 affixes) |
| `src/systems/monster-abilities.ts` | Ability execution engine (cooldowns, telegraphs, projectiles) |
| `src/systems/monster-rarity.ts` | Rarity roll on spawn, affix assignment, stat scaling |

### Modified Files

| File | Changes |
|------|---------|
| `src/core/types.ts` | New types: `MonsterArchetype`, `MonsterRarity`, `MonsterAbilityDef`, `MonsterAffixDef`, `MonsterAffixInstance`, extended `MonsterDefinition`, extended `MonsterInstance` |
| `src/data/monsters.data.ts` | Zone 1 monsters redesigned; all monsters gain `archetype` + `abilities` fields |
| `src/data/constants.ts` | Monster rarity constants, affix weights, archetype defaults |
| `src/systems/monster-ai.ts` | Archetype-specific AI profiles: ranged kiting, caster positioning, charger dash, exploder rush |
| `src/systems/combat.ts` | Monster projectile → player hit detection; monster ability damage routing |
| `src/systems/zones.ts` | Rarity roll at spawn time; affix assignment |
| `src/systems/loot.ts` | Rarity-based loot multipliers |
| `src/entities/MonsterEntity.ts` | Rarity visuals (glow, nameplate, size); telegraph rendering; archetype-specific shapes |
| `src/scenes/GameScene.ts` | Monster projectile rendering + collision; telegraph sprite management |

---

## 4. Type Definitions

### 4.1 New Union Types

```ts
export type MonsterArchetype =
  | 'melee'      // walks up, hits you
  | 'ranged'     // keeps distance, fires projectiles
  | 'caster'     // keeps distance, casts AoE/targeted spells
  | 'charger'    // winds up, dashes at player
  | 'exploder';  // rushes player, detonates on contact or death

export type MonsterRarity =
  | 'normal'     // white — base stats, no affixes
  | 'magic'      // blue — 1.5x HP, 1.2x damage, 1 affix
  | 'rare';      // yellow — 3x HP, 1.8x damage, 2-3 affixes, minion pack

export type TelegraphShape =
  | 'circle'     // AoE around point
  | 'cone'       // directional cone
  | 'line'       // narrow line/beam
  | 'ring';      // donut shape

export type MonsterAbilityTargeting =
  | 'player'         // aimed at player position
  | 'self'           // centered on self
  | 'player_predict' // aimed at predicted player position (leads the shot)
  | 'random_near';   // random point near player (±100px)
```

### 4.2 Monster Ability Definition

```ts
export interface MonsterAbilityDef {
  id: string;
  name: string;

  // Timing
  cooldown: number;           // seconds between uses
  castTime: number;           // seconds of telegraph before effect fires
  activationRange: number;    // pixels — ability only considered when player within this range

  // Targeting
  targeting: MonsterAbilityTargeting;

  // Effect
  damageMultiplier: number;   // multiplier of monster's attack stat
  damageType: DamageType;     // 'physical' or 'magic'
  radius?: number;            // AoE radius in pixels (for circle/ring)
  width?: number;             // for line/cone width
  length?: number;            // for line length / cone range

  // Projectile (if ability fires a projectile)
  projectile?: {
    speed: number;            // pixels/sec
    size: number;             // radius in pixels
    color: string;            // hex color
    piercing: boolean;        // passes through player?
    count: number;            // how many projectiles
    spread: number;           // degrees of spread (0 = single shot)
    maxDistance: number;       // pixels before expiring
  };

  // Telegraph
  telegraph: {
    shape: TelegraphShape;
    color: string;            // hex color with alpha
    duration: number;         // same as castTime, but explicit for rendering
    warningFlash: boolean;    // flash 0.2s before firing?
  };

  // On-death ability (for exploders)
  triggerOnDeath?: boolean;

  // Movement during cast
  moveDuringCast: boolean;    // can monster move while casting?
  dashToTarget?: boolean;     // does monster dash to target? (chargers)
  dashSpeed?: number;         // pixels/sec for dash
}
```

### 4.3 Monster Affix Definition

```ts
export interface MonsterAffixDef {
  id: string;
  name: string;
  description: string;        // short player-readable description

  // Stat modifications (multiplicative with base)
  hpMultiplier?: number;      // e.g. 1.4 = +40% HP
  damageMultiplier?: number;
  speedMultiplier?: number;
  armorBonus?: number;        // flat armor addition
  sizeMultiplier?: number;    // visual + hitbox scaling

  // Special behavior flags
  onHitEffect?: string;       // effect ID triggered when this monster hits player
  onDeathEffect?: string;     // effect ID triggered on death
  auraEffect?: string;        // effect ID for persistent aura around monster

  // Aura properties (if auraEffect set)
  auraRadius?: number;        // pixels
  auraStatBuff?: {
    stat: 'damage' | 'speed' | 'defense';
    multiplier: number;
  };

  // Visual
  color: string;              // tint/glow color for this affix
  particleEffect?: string;    // particle type name
}
```

### 4.4 Monster Affix Instance (runtime)

```ts
export interface MonsterAffixInstance {
  id: string;                 // affix definition ID
  // runtime state for auras, on-hit cooldowns, etc.
  auraCooldown?: number;
  lastTriggerTime?: number;
}
```

### 4.5 Extended MonsterDefinition

Add to existing `MonsterDefinition`:

```ts
// --- NEW FIELDS (add to existing interface) ---

  // Archetype — determines AI profile + base behavior
  archetype: MonsterArchetype;

  // Abilities this monster can use (by ID, looked up from monster-abilities.data.ts)
  abilities: string[];

  // Ranged/caster specific
  preferredRange?: number;    // pixels — ideal distance to maintain from player
  retreatSpeed?: number;      // pixels/sec when backing away (defaults to moveSpeed * 0.7)

  // Charger specific
  chargeWindup?: number;      // seconds before charge starts
  chargeSpeed?: number;       // pixels/sec during charge
  chargeDamageMultiplier?: number;
  chargeDistance?: number;    // max charge distance in pixels

  // Exploder specific
  explosionRadius?: number;   // AoE radius on detonation
  explosionDamage?: number;   // flat damage or multiplier
  fuseTime?: number;          // seconds before detonation (once in range)
  detonateOnDeath?: boolean;  // also explode when killed?

  // Shape override (for archetype visual differentiation)
  shape?: 'circle' | 'diamond' | 'triangle' | 'square' | 'hexagon';
```

### 4.6 Extended MonsterInstance

Add to existing `MonsterInstance`:

```ts
// --- NEW FIELDS (add to existing interface) ---

  // Archetype
  archetype: MonsterArchetype;

  // Rarity
  rarity: MonsterRarity;
  affixes: MonsterAffixInstance[];

  // Ability cooldowns (keyed by ability ID)
  abilityCooldowns: Record<string, number>;  // remaining cooldown per ability
  currentAbility: string | null;             // ability ID currently casting
  abilityCastTimer: number;                  // time remaining on current cast
  abilityTargetX: number;                    // where current ability is aimed
  abilityTargetY: number;

  // Charger state
  isCharging: boolean;
  chargeTargetX: number;
  chargeTargetY: number;
  chargeTimer: number;

  // Exploder state
  isFused: boolean;       // has entered detonation countdown
  fuseTimer: number;

  // Ranged/caster state
  isRetreating: boolean;  // backing away from player

  // Visual
  shape: 'circle' | 'diamond' | 'triangle' | 'square' | 'hexagon';
```

---

## 5. Monster Archetypes — AI Profiles

Each archetype gets a distinct AI state machine layered on top of the base system.

### 5.1 Melee (existing behavior, refined)

**Identity:** Frontline brawlers. Walk up, hit hard.

**State machine:**
```
idle → chase → (in attackRange) → windup → attack → chase
                                    ↓
                            (ability off cooldown + in range)
                                    ↓
                              castAbility → chase
```

**Behavior:**
- Move directly toward player at `moveSpeed`
- Attack when within `attackRange` (25-50px)
- Use ability when off cooldown and within `activationRange`
- Ability examples: ground slam (AoE circle at self), cleave (wide arc)
- No special positioning logic

**Constants:**
```
defaultAttackRange: 40px
defaultMoveSpeed: 80-120 px/sec
```

### 5.2 Ranged

**Identity:** Backline damage. Keeps distance, fires projectiles.

**State machine:**
```
idle → approach → (within preferredRange) → attack/useAbility
                                               ↓
                                    (player too close: < preferredRange * 0.5)
                                               ↓
                                           retreat → (safe distance) → attack
```

**Behavior:**
- Move toward player until within `preferredRange` (200-300px)
- When in range: stop, face player, fire projectile on attack cooldown
- If player closes to within `preferredRange * 0.5`: retreat away at `retreatSpeed`
- Retreat direction: directly away from player
- Resume attacking once at safe distance
- Use abilities between basic attacks

**Constants:**
```
defaultPreferredRange: 250px
defaultRetreatSpeed: moveSpeed * 0.7
retreatThreshold: preferredRange * 0.5
```

**Projectile behavior:**
- Fires toward player position (or predicted position for `player_predict`)
- Uses standard `ProjectileInstance` system already in the codebase
- Monster projectiles set `ownerId` to monster's ID
- Player hit detection added to combat system (arc-based for player hitbox)

### 5.3 Caster

**Identity:** Spell-wielders. Similar to ranged but with AoE abilities instead of projectiles for basic attack.

**State machine:**
```
idle → approach → (within preferredRange) → castAbility
                                               ↓
                                    (player too close)
                                               ↓
                                           retreat → castAbility
```

**Behavior:**
- Same positioning as ranged (maintain distance)
- Primary damage comes from abilities, not basic attacks
- Basic attack is a single slow projectile (fallback when all abilities on cooldown)
- Prioritizes abilities over basic attacks
- Longer cast times but higher impact
- Stops moving during cast (unless `moveDuringCast` is true)

**Constants:**
```
defaultPreferredRange: 280px
defaultRetreatSpeed: moveSpeed * 0.6
castMovementLockout: true (default)
```

### 5.4 Charger

**Identity:** Burst engagers. Telegraph a charge, then dash at the player.

**State machine:**
```
idle → chase → (within chargeActivationRange) → chargeWindup → charge → recovery → chase
                                                    ↓
                                             (telegraph shown)
```

**Behavior:**
- Chase player normally until within charge activation range (300-400px)
- Begin charge windup: monster stops, telegraph line appears from monster toward player
- During windup: monster locks onto player's current position (snapshot, does NOT track)
- After windup: dash in straight line at `chargeSpeed` toward locked position
- Charge deals `chargeDamageMultiplier × attack` on contact
- After charge completes (hit player OR traveled `chargeDistance`): enter 1s recovery (vulnerable, no movement)
- Recovery → return to chase
- Between charges: behave as melee (chase + basic attack)

**Constants:**
```
defaultChargeWindup: 0.8s
defaultChargeSpeed: 500 px/sec
defaultChargeDamage: 2.0x attack
defaultChargeDistance: 350px
chargeActivationRange: 350px
chargeCooldown: 4.0s
recoveryDuration: 1.0s
```

**Telegraph:**
- Line from monster to locked target position
- Color: red, builds intensity during windup
- 0.2s before charge fires: flash warning

### 5.5 Exploder

**Identity:** Suicide bombers. Rush the player and detonate.

**State machine:**
```
idle → chase → (within fuseRange) → fusing → BOOM (dead + AoE damage)
                                                ↑
                                     (killed while alive) → BOOM (if detonateOnDeath)
```

**Behavior:**
- Chase player at `moveSpeed` (usually fast: 140-180 px/sec)
- When within fuse range (60px): begin fuse countdown, monster glows/pulses
- Player can kill the exploder during fuse time to prevent detonation (unless `detonateOnDeath`)
- On detonation: AoE damage in `explosionRadius`, monster dies
- If `detonateOnDeath`: also detonates when killed at any range (reduced damage: 50%)
- Exploders do NOT use basic attack — their only damage is the explosion

**Constants:**
```
defaultFuseTime: 1.2s
defaultExplosionRadius: 80px
defaultExplosionDamage: 2.5x attack
fuseActivationRange: 60px
deathExplosionDamageMultiplier: 0.5 (half damage if killed)
```

**Telegraph:**
- Pulsing red glow during fuse (increasing frequency)
- Circle indicator showing explosion radius appears during fuse
- Final 0.3s: rapid flash

---

## 6. Monster Rarity System

### 6.1 Rarity Roll

When a monster spawns, roll rarity:

```ts
function rollMonsterRarity(zoneTier: number): MonsterRarity {
  const rareMagicBase = MONSTER_RARE_BASE_CHANCE;    // 0.03 (3%)
  const magicBase = MONSTER_MAGIC_BASE_CHANCE;       // 0.12 (12%)

  // Scale with zone tier: higher tiers = more elites
  const tierBonus = (zoneTier - 1) * MONSTER_RARITY_TIER_SCALING; // 0.015 per tier

  const rareChance = rareMagicBase + tierBonus;
  const magicChance = magicBase + tierBonus * 2;

  const roll = Math.random();
  if (roll < rareChance) return 'rare';
  if (roll < rareChance + magicChance) return 'rare' <= roll ? 'magic' : 'magic';
  return 'normal';
}
```

Concrete chances per tier:

| Tier | Normal | Magic | Rare |
|------|--------|-------|------|
| T1   | 85%    | 12%   | 3%   |
| T2   | 82.5%  | 14%   | 4.5% |
| T3   | 80%    | 15%   | 6%   |
| T4   | 76.5%  | 16%   | 7.5% |
| T5   | 73%    | 18%   | 9%   |
| T6   | 69.5%  | 20%   | 10.5%|
| T7   | 66%    | 22%   | 12%  |

Bosses are always `normal` rarity (boss rework is a separate spec).
Exploders are always `normal` rarity (they're already dangerous enough).

### 6.2 Stat Scaling by Rarity

Applied multiplicatively on top of level-scaled base stats:

```ts
const RARITY_SCALING: Record<MonsterRarity, RarityScaling> = {
  normal: {
    hpMult: 1.0,
    damageMult: 1.0,
    defenseMult: 1.0,
    speedMult: 1.0,
    xpMult: 1.0,
    goldMult: 1.0,
    dropChanceMult: 1.0,
    dropRarityBoost: 0,   // tiers added to item roll
    affixCount: 0,
    minionCount: 0,
  },
  magic: {
    hpMult: 1.5,
    damageMult: 1.2,
    defenseMult: 1.2,
    speedMult: 1.0,
    xpMult: 2.0,
    goldMult: 2.0,
    dropChanceMult: 2.0,
    dropRarityBoost: 1,
    affixCount: 1,         // gets 1 random affix
    minionCount: 0,
  },
  rare: {
    hpMult: 3.0,
    damageMult: 1.8,
    defenseMult: 1.5,
    speedMult: 1.05,
    xpMult: 5.0,
    goldMult: 5.0,
    dropChanceMult: 4.0,
    dropRarityBoost: 2,
    affixCount: [2, 3],    // 2-3 random affixes (roll)
    minionCount: [2, 4],   // spawns 2-4 normal minions of same type
  },
};
```

### 6.3 Rare Minion Pack

When a `rare` monster spawns, it brings a pack:
- 2-4 `normal` rarity copies of the same monster definition
- Minions spawn in a cluster around the rare (80px radius)
- Minions have standard stats (no rarity bonus)
- Killing the rare does NOT kill minions (they fight independently)
- Minion count does NOT count toward `MAX_MONSTERS_PER_ZONE` (allow temporary overflow by up to 4)

### 6.4 Visual Rarity Indicators

| Rarity | Name Color | Glow | Size Scale | Nameplate |
|--------|-----------|------|------------|-----------|
| Normal | none | none | 1.0x | none |
| Magic | `#60a5fa` (blue) | soft blue pulse | 1.15x | blue name above HP bar |
| Rare | `#fbbf24` (yellow) | bright yellow pulse | 1.3x | yellow name + affix names below |

Glow implementation: Phaser tween on sprite alpha between 0.85–1.0, period 0.8s for magic, 0.5s for rare.

Nameplate shows:
- **Magic:** `"Magic <MonsterName>"` in blue
- **Rare:** `"<Affix1> <Affix2> <MonsterName>"` in yellow (e.g., "Vampiric Hasted Forest Wolf")

---

## 7. Monster Affix Pool (V1: 10 Affixes)

Each affix is a modifier applied to magic/rare monsters. Affixes stack multiplicatively with rarity scaling.

### 7.1 Offensive Affixes

**1. Berserker**
- `damageMultiplier: 1.35` (+35% damage)
- `speedMultiplier: 1.15` (+15% speed)
- `hpMultiplier: 0.85` (-15% HP — glass cannon)
- Visual: red tint, leaves red trail particles

**2. Hasted**
- `speedMultiplier: 1.4` (+40% move speed)
- `damageMultiplier: 1.0`
- Attack cooldown reduced by 25% (`attackCooldownMultiplier: 0.75`)
- Visual: blue streak particles when moving

**3. Deadly**
- `damageMultiplier: 1.5` (+50% damage)
- No other changes
- Visual: dark red glow

### 7.2 Defensive Affixes

**4. Fortified**
- `hpMultiplier: 1.7` (+70% HP)
- `armorBonus: 20` (flat)
- `speedMultiplier: 0.9` (-10% speed)
- Visual: rocky texture overlay, grey particles

**5. Regenerating**
- Monster gains `regenRate: 0.02` (2% maxHP/sec) — stacks with innate regen if any
- Visual: green heal particles periodically

**6. Shielded**
- Monster gains a shield equal to 30% of its (rarity-scaled) maxHP
- Shield absorbs 50% of incoming damage
- Visual: blue shield bar (uses existing shield system)

### 7.3 Utility Affixes

**7. Vampiric**
- Monster heals for 15% of damage dealt to player
- Visual: health numbers float toward monster on hit (green)

**8. Teleporting**
- Every 5 seconds, if player is within 400px, monster blinks to a random position within 150px of player
- 0.3s fade-out, instant reposition, 0.3s fade-in
- Cannot teleport during ability casts
- Visual: purple flash on teleport

**9. Frenzy Aura**
- `auraRadius: 150px`
- All monsters within aura gain +20% damage and +15% attack speed
- Does NOT affect self (only allies)
- Visual: orange pulsing circle on ground around monster

**10. Frost Nova (on death)**
- `onDeathEffect: 'frost_nova'`
- On death: emits a 100px radius frost nova
- Applies 2s slow to player if hit (30% slow, uses existing slow system)
- Deals `0.5 × monster.attack` magic damage
- Visual: expanding blue ring on death, ice particles

---

## 8. Monster Abilities (V1 Pool)

Concrete ability definitions. Monsters reference these by ID.

### 8.1 Melee Abilities

**`ground_slam`**
- Cooldown: 5s | Cast time: 0.8s | Range: 60px
- Targeting: `self`
- Damage: 1.8x attack, physical
- AoE radius: 70px circle around self
- Telegraph: red circle expanding under monster
- Monster stops moving during cast
- Used by: heavy melee monsters

**`cleave`**
- Cooldown: 3.5s | Cast time: 0.5s | Range: 50px
- Targeting: `player`
- Damage: 1.3x attack, physical
- 120° arc, 60px range (wider than basic attack)
- Telegraph: red cone indicator
- Monster stops moving during cast
- Used by: medium melee monsters

**`leaping_strike`**
- Cooldown: 6s | Cast time: 0.6s | Range: 200px (activation), min range: 80px
- Targeting: `player`
- Damage: 2.0x attack, physical
- Monster leaps to player position (snapshot at cast start)
- AoE radius: 50px at landing point
- Telegraph: shadow circle at target, line from monster to target
- Used by: agile melee monsters

### 8.2 Ranged Abilities

**`arrow_shot`**
- Cooldown: 0s (basic attack replacement) | Cast time: 0.3s | Range: 300px
- Targeting: `player`
- Damage: 0.8x attack, physical
- Single projectile: speed 350px/s, size 4px, color `#d4a574`
- No telegraph (fast, low damage — basic attack equivalent)
- Monster stops briefly during shot
- Used by: archer-type monsters

**`arrow_volley`**
- Cooldown: 4s | Cast time: 0.7s | Range: 300px
- Targeting: `player`
- Damage: 0.6x attack per arrow, physical
- 3 projectiles, 20° spread, speed 300px/s
- Telegraph: brief glow on monster + aim line
- Used by: archer-type monsters

**`poison_spit`**
- Cooldown: 3s | Cast time: 0.4s | Range: 250px
- Targeting: `player_predict`
- Damage: 0.5x attack, magic
- Single projectile: speed 250px/s, size 6px, color `#16a34a`, piercing: false
- Leaves a 40px poison pool at impact point for 3s (deals 0.3x attack/sec magic to player standing in it)
- Telegraph: monster rears back
- Used by: poison-themed monsters

### 8.3 Caster Abilities

**`fireball`**
- Cooldown: 3.5s | Cast time: 0.6s | Range: 350px
- Targeting: `player`
- Damage: 1.5x attack, magic
- Single projectile: speed 220px/s, size 8px, color `#f97316`
- Explodes on impact in 50px radius AoE
- Telegraph: monster glows orange during cast
- Used by: fire casters

**`frost_bolt`**
- Cooldown: 2.5s | Cast time: 0.4s | Range: 300px
- Targeting: `player_predict`
- Damage: 0.8x attack, magic
- Single projectile: speed 280px/s, size 5px, color `#93c5fd`
- On hit: applies 2s slow to player (30%)
- Telegraph: brief blue flash
- Used by: frost casters

**`void_zone`**
- Cooldown: 7s | Cast time: 1.0s | Range: 300px
- Targeting: `player` (snapshot)
- Damage: 0.4x attack per tick, magic, ticks every 0.5s
- Places 60px radius zone at player's position, lasts 4s
- Telegraph: dark purple circle grows at target position during cast time
- Monster stops moving during cast
- Used by: dark/void casters

### 8.4 Charger Abilities

**`charge`**
- Cooldown: 4s | Cast time: 0.8s (windup) | Range: 350px activation
- Targeting: `player` (snapshot at cast start)
- Damage: 2.0x attack, physical
- Dash speed: 500px/s, max distance: 350px
- Telegraph: line from monster to target, monster braces, ground line builds red
- 1s recovery after charge (stunned, vulnerable)
- Used by: all charger archetype monsters (innate — not defined separately)

### 8.5 Exploder Abilities

**`detonate`**
- Cooldown: N/A (one-time) | Fuse time: 1.2s | Range: 60px activation
- Targeting: `self`
- Damage: 2.5x attack, physical (0.5x if killed before detonation + detonateOnDeath)
- AoE radius: 80px
- Telegraph: pulsing red glow, accelerating pulse rate, red circle shows blast radius
- Monster dies after detonation
- Used by: all exploder archetype monsters (innate — not defined separately)

---

## 9. Zone 1 Redesign — Whisperwood Glen

Zone 1 serves as the tutorial zone. Monsters introduce archetypes gradually. 7 monsters total (down from 9 — tighter, more distinct roster).

### 9.1 Monster Roster

**1. Forest Wolf** — `melee`
- Role: Bread-and-butter melee enemy. Simple, predictable.
- Stats: HP 60, hpPerLevel 8, attack 5, defense 2, moveSpeed 110, attackRange 35, attackCooldown 1.4
- Abilities: none (pure basic attack, teaches melee dodge timing)
- Shape: `circle` (round body)
- Color: `#8B7355` (brown)
- Size: 28
- SpawnWeight: 30

**2. Thorn Sprite** — `ranged`
- Role: First ranged enemy. Teaches "close the gap" or "dodge projectiles."
- Stats: HP 35, hpPerLevel 5, attack 4, defense 1, moveSpeed 90, preferredRange 220, attackRange 220, attackCooldown 1.8
- Abilities: `arrow_shot` (basic ranged attack)
- Shape: `diamond` (pointy, distinctive from melee)
- Color: `#7BC86C` (green)
- Size: 22
- SpawnWeight: 25

**3. Mushroom Brute** — `melee`
- Role: Slow, tanky melee. Teaches "hit and move" — punishes standing still.
- Stats: HP 120, hpPerLevel 14, attack 8, defense 5, moveSpeed 55, attackRange 40, attackCooldown 2.0
- Types: `['armored']` (armor: 5)
- Abilities: `ground_slam`
- Shape: `square` (blocky, tanky feel)
- Color: `#C08050` (earthy brown-orange)
- Size: 36
- SpawnWeight: 18

**4. Spitting Toad** — `ranged`
- Role: Introduces projectile + ground hazard. Teaches area denial.
- Stats: HP 45, hpPerLevel 6, attack 5, defense 2, moveSpeed 70, preferredRange 200, attackRange 200, attackCooldown 2.2
- Abilities: `poison_spit`
- Shape: `circle` (fat round body)
- Color: `#4A7C59` (dark green)
- Size: 30
- SpawnWeight: 15

**5. Bramble Stag** — `charger`
- Role: First charger. Teaches telegraph reading + dodge timing. Exciting encounter.
- Stats: HP 80, hpPerLevel 10, attack 7, defense 3, moveSpeed 90, attackRange 35, attackCooldown 1.6
- chargeWindup: 0.9s, chargeSpeed: 420, chargeDamageMultiplier: 1.8, chargeDistance: 280
- Abilities: (charge is innate to archetype)
- Shape: `triangle` (arrow-like, conveys speed/aggression)
- Color: `#6B4226` (dark brown)
- Size: 34
- SpawnWeight: 12

**6. Will-o-Wisp** — `caster`
- Role: First caster. Introduces magic damage and "don't stand in fire."
- Stats: HP 30, hpPerLevel 4, attack 6 (magic-flavored), defense 1, moveSpeed 85, preferredRange 250, attackRange 250, attackCooldown 2.5
- Abilities: `fireball`
- Shape: `hexagon` (mystical)
- Color: `#FFD700` (gold/flame)
- Size: 20
- SpawnWeight: 10

**7. Blightpuff** — `exploder`
- Role: First exploder. Teaches threat prioritization (kill these first!). Spawn in groups of 2-3.
- Stats: HP 25, hpPerLevel 3, attack 10, defense 0, moveSpeed 150, attackRange: N/A (uses fuse)
- fuseTime: 1.0s, explosionRadius: 70, explosionDamage: 12 (2.5x attack at base), detonateOnDeath: false
- Abilities: (detonate is innate to archetype)
- Shape: `circle` (puffball)
- Color: `#90EE90` (light green — sickly, spore-like)
- Size: 20
- SpawnWeight: 10

### 9.2 Zone 1 Boss — Old Mossback

No changes for V1. Boss rework is a separate spec. Current aggressive + regenerating behavior stays.

### 9.3 Spawn Balance

Total spawnWeight: 120. Percentages:
- Forest Wolf: 25% (common, always present)
- Thorn Sprite: 21% (frequent ranged)
- Mushroom Brute: 15% (occasional tank)
- Spitting Toad: 12.5% (moderate)
- Bramble Stag: 10% (uncommon, exciting)
- Will-o-Wisp: 8.3% (rare, dangerous)
- Blightpuff: 8.3% (rare, threatening)

This ensures most encounters are simple (wolf + sprite) with occasional dangerous spawns that force the player to adapt.

---

## 10. Monster Projectile System

### 10.1 Reuse Existing ProjectileInstance

Monster projectiles use the existing `ProjectileInstance` type. The `ownerId` field distinguishes them:
- Player projectiles: `ownerId === 'player'`
- Monster projectiles: `ownerId === monsterId`

### 10.2 Monster Projectile → Player Hit Detection

Add to `combat.ts`:

```ts
function checkMonsterProjectileHits(projectiles: ProjectileInstance[], player: PlayerState): string[] {
  const hitProjectileIds: string[] = [];
  const playerRadius = PLAYER_BODY_RADIUS; // 14px

  for (const proj of projectiles) {
    if (proj.ownerId === 'player') continue;
    if (proj.isExpired) continue;
    if (proj.hitTargets.includes('player')) continue;

    const dist = Math.hypot(proj.x - player.x, proj.y - player.y);
    if (dist <= playerRadius + proj.size) {
      hitProjectileIds.push(proj.id);
    }
  }
  return hitProjectileIds;
}
```

When a monster projectile hits the player:
1. Look up the ability that spawned it (or use projectile's `damage` directly)
2. Apply damage through existing `player:damaged` event pipeline
3. Respect player invulnerability and dash iframes
4. Apply knockback to player (small: 8px in projectile's travel direction)
5. Mark projectile as expired (unless piercing)

### 10.3 Projectile Spawning from Abilities

When `monster-abilities.ts` fires a projectile ability:

```ts
function spawnMonsterProjectile(monster: MonsterInstance, ability: MonsterAbilityDef, targetX: number, targetY: number) {
  const angle = Math.atan2(targetY - monster.y, targetX - monster.x);
  const proj = ability.projectile!;

  for (let i = 0; i < proj.count; i++) {
    const spreadAngle = proj.count === 1 ? 0 :
      ((i / (proj.count - 1)) - 0.5) * (proj.spread * Math.PI / 180);
    const finalAngle = angle + spreadAngle;

    const projectile: ProjectileInstance = {
      id: generateId(),
      ownerId: monster.id,
      x: monster.x,
      y: monster.y,
      velocityX: Math.cos(finalAngle) * proj.speed,
      velocityY: Math.sin(finalAngle) * proj.speed,
      speed: proj.speed,
      damage: Math.floor(monster.attack * ability.damageMultiplier),
      damageType: ability.damageType,
      piercing: proj.piercing,
      hitTargets: [],
      maxDistance: proj.maxDistance,
      distanceTraveled: 0,
      isExpired: false,
      color: proj.color,
      size: proj.size,
    };

    state.projectiles.push(projectile);
    events.emit('projectile:spawned', { projectile });
  }
}
```

---

## 11. Telegraph Rendering

### 11.1 Telegraph Lifecycle

1. Monster begins casting ability → telegraph spawned
2. Telegraph renders for `castTime` duration, growing/filling
3. At 80% through cast: warning flash (brief bright pulse)
4. At 100%: ability fires, telegraph removed

### 11.2 Telegraph Visuals

All telegraphs are rendered as Phaser graphics objects in the GameScene, **below** monster sprites.

| Shape | Rendering |
|-------|-----------|
| `circle` | Filled circle, starts transparent, fills to `0.3` alpha over cast time. Color from ability telegraph definition. |
| `cone` | Pie slice arc, same fill behavior. Direction faces target. |
| `line` | Rectangle from monster toward target. Width builds from thin to full over cast time. |
| `ring` | Two concentric circles (donut). Inner radius is 50% of outer. |

Warning flash: at `castTime * 0.8`, briefly set alpha to `0.6` for 0.1s, then return to normal fill.

### 11.3 Implementation

```ts
interface ActiveTelegraph {
  id: string;
  monsterId: string;
  abilityId: string;
  shape: TelegraphShape;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  radius?: number;
  width?: number;
  length?: number;
  color: string;
  duration: number;
  elapsed: number;
  graphics: Phaser.GameObjects.Graphics; // Phaser graphics object
}
```

Managed by `GameScene`. Array of active telegraphs updated each frame. Graphics destroyed when telegraph expires.

---

## 12. Loot Scaling by Rarity

### 12.1 Drop Chance

```ts
effectiveDropChance = monster.dropChance * rarityScaling.dropChanceMult;
```

| Rarity | Base Drop (Zone 1 avg) | Effective |
|--------|----------------------|-----------|
| Normal | 15% | 15% |
| Magic  | 15% | 30% |
| Rare   | 15% | 60% |

### 12.2 Drop Quality

When a magic/rare monster drops an item, boost the item rarity roll:

```ts
// In loot.ts, when generating item for monster drop:
const rarityBoost = rarityScaling.dropRarityBoost; // 0, 1, or 2
// Shift the rarity weight table: treat "common" weight as "uncommon" etc.
// Effectively: magic monsters drop uncommon+, rare monsters drop rare+
```

Concrete: `dropRarityBoost` shifts the minimum rarity floor:
- Normal: any rarity (existing behavior)
- Magic: minimum uncommon
- Rare: minimum rare

### 12.3 XP and Gold

```ts
effectiveXP = baseXP * rarityScaling.xpMult;
effectiveGold = baseGold * rarityScaling.goldMult;
```

| Rarity | XP Mult | Gold Mult |
|--------|---------|-----------|
| Normal | 1x | 1x |
| Magic  | 2x | 2x |
| Rare   | 5x | 5x |

---

## 13. Constants (add to constants.ts)

```ts
// --- Monster Rarity ---
export const MONSTER_MAGIC_BASE_CHANCE = 0.12;
export const MONSTER_RARE_BASE_CHANCE = 0.03;
export const MONSTER_RARITY_TIER_SCALING = 0.015; // per tier above 1

// --- Monster Rarity Stat Scaling ---
export const MAGIC_HP_MULT = 1.5;
export const MAGIC_DAMAGE_MULT = 1.2;
export const MAGIC_DEFENSE_MULT = 1.2;
export const MAGIC_XP_MULT = 2.0;
export const MAGIC_GOLD_MULT = 2.0;
export const MAGIC_DROP_CHANCE_MULT = 2.0;
export const MAGIC_DROP_RARITY_BOOST = 1;
export const MAGIC_AFFIX_COUNT = 1;

export const RARE_HP_MULT = 3.0;
export const RARE_DAMAGE_MULT = 1.8;
export const RARE_DEFENSE_MULT = 1.5;
export const RARE_XP_MULT = 5.0;
export const RARE_GOLD_MULT = 5.0;
export const RARE_DROP_CHANCE_MULT = 4.0;
export const RARE_DROP_RARITY_BOOST = 2;
export const RARE_AFFIX_COUNT_MIN = 2;
export const RARE_AFFIX_COUNT_MAX = 3;
export const RARE_MINION_COUNT_MIN = 2;
export const RARE_MINION_COUNT_MAX = 4;
export const RARE_MINION_SPAWN_RADIUS = 80; // pixels around rare monster

// --- Archetype Defaults ---
export const RANGED_DEFAULT_PREFERRED_RANGE = 250;
export const RANGED_RETREAT_THRESHOLD_RATIO = 0.5;  // flee if player closer than preferredRange * this
export const RANGED_DEFAULT_RETREAT_SPEED_RATIO = 0.7;

export const CASTER_DEFAULT_PREFERRED_RANGE = 280;
export const CASTER_DEFAULT_RETREAT_SPEED_RATIO = 0.6;

export const CHARGER_DEFAULT_WINDUP = 0.8;
export const CHARGER_DEFAULT_SPEED = 500;
export const CHARGER_DEFAULT_DAMAGE_MULT = 2.0;
export const CHARGER_DEFAULT_DISTANCE = 350;
export const CHARGER_ACTIVATION_RANGE = 350;
export const CHARGER_COOLDOWN = 4.0;
export const CHARGER_RECOVERY_DURATION = 1.0;

export const EXPLODER_DEFAULT_FUSE_TIME = 1.2;
export const EXPLODER_DEFAULT_RADIUS = 80;
export const EXPLODER_DEFAULT_DAMAGE_MULT = 2.5;
export const EXPLODER_FUSE_ACTIVATION_RANGE = 60;
export const EXPLODER_DEATH_DAMAGE_RATIO = 0.5;

// --- Affix Constants ---
export const AFFIX_TELEPORT_COOLDOWN = 5.0;
export const AFFIX_TELEPORT_RANGE = 400;
export const AFFIX_TELEPORT_OFFSET = 150;
export const AFFIX_VAMPIRIC_LEECH = 0.15;
export const AFFIX_FRENZY_AURA_RADIUS = 150;
export const AFFIX_FRENZY_DAMAGE_MULT = 1.2;
export const AFFIX_FRENZY_ATTACK_SPEED_MULT = 1.15;
export const AFFIX_FROST_NOVA_RADIUS = 100;
export const AFFIX_FROST_NOVA_SLOW_DURATION = 2.0;
export const AFFIX_FROST_NOVA_DAMAGE_MULT = 0.5;

// --- Monster Projectile ---
export const MONSTER_PROJECTILE_PLAYER_KNOCKBACK = 8; // pixels
```

---

## 14. Events (add to GameEventMap)

```ts
// Monster ability events
'monster:abilityCastStart': {
  monsterId: string;
  abilityId: string;
  targetX: number;
  targetY: number;
  castTime: number;
};
'monster:abilityCastComplete': {
  monsterId: string;
  abilityId: string;
};
'monster:abilityCancelled': {
  monsterId: string;
  abilityId: string;
};

// Charger events
'monster:chargeStart': {
  monsterId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  speed: number;
};
'monster:chargeEnd': {
  monsterId: string;
  hitPlayer: boolean;
};

// Exploder events
'monster:fuseStart': {
  monsterId: string;
  fuseTime: number;
  radius: number;
};
'monster:detonated': {
  monsterId: string;
  x: number;
  y: number;
  radius: number;
  damage: number;
  hitPlayer: boolean;
};

// Rarity events
'monster:raritySpawned': {
  monsterId: string;
  rarity: MonsterRarity;
  affixes: string[];  // affix IDs
};

// Telegraph events
'telegraph:created': {
  id: string;
  monsterId: string;
  shape: TelegraphShape;
  x: number;
  y: number;
  radius?: number;
  color: string;
  duration: number;
};
'telegraph:expired': { id: string };

// Affix events
'affix:teleport': { monsterId: string; fromX: number; fromY: number; toX: number; toY: number };
'affix:frostNova': { x: number; y: number; radius: number };
'affix:vampiricHeal': { monsterId: string; amount: number };
```

---

## 15. AI Update Priority

Each frame in `monster-ai.ts`, monsters update in this order:

1. **Dead check** — skip if dead
2. **Stunned check** — decrement timer, skip if stunned (includes charger recovery)
3. **Status effects** — apply slow, check freeze
4. **Ability check** — if currently casting, tick castTimer; if complete, fire ability
5. **Archetype behavior** — run archetype-specific state machine:
   - Melee: chase → attack / ability
   - Ranged: approach / retreat → shoot / ability
   - Caster: approach / retreat → cast ability (fallback: basic projectile)
   - Charger: chase → charge cycle (windup → dash → recovery)
   - Exploder: chase → fuse → detonate
6. **Ability cooldown tick** — decrement all ability cooldowns by dt
7. **Ability selection** — if no ability active and one is off cooldown + in range, start casting
8. **Affix updates** — tick auras, teleport timers, etc.
9. **Type passives** — regeneration, shield (existing behavior)
10. **Separation** — push apart from other monsters (existing behavior)

---

## 16. Migration Strategy (Zones 2-7)

### Guidelines for Porting Remaining Zones

After Zone 1 is complete and validated:

1. **Per zone:** Redesign monster roster to include archetype diversity:
   - Minimum: 2 melee, 1 ranged, 1 caster or charger, 1 wildcard (exploder/charger/second caster)
   - Maximum: 8 monsters per zone (trim redundant entries)

2. **Ability progression:** Later zones introduce harder abilities:
   - Zone 1-2: Single projectiles, simple AoEs
   - Zone 3-4: Multi-projectiles, ground hazards, status effects
   - Zone 5-6: Predicted targeting, faster casts, combo abilities
   - Zone 7: Everything + shorter telegraphs

3. **Rarity scaling:** Higher tiers naturally produce more magic/rare monsters (see rarity table in §6.1)

4. **New abilities per zone:** Each zone should add 1-2 new ability definitions to the pool, thematically appropriate (fire abilities for Emberpeak, ice for Crystalspire, etc.)

5. **Archetype stat guidelines by zone tier:**

| Tier | Melee HP | Ranged HP | Caster HP | Charger HP | Exploder HP |
|------|----------|-----------|-----------|------------|-------------|
| T1   | 60-120   | 30-50     | 25-40     | 70-100     | 20-30       |
| T2   | 120-250  | 60-100    | 50-80     | 100-200    | 40-60       |
| T3   | 250-500  | 100-200   | 80-160    | 200-400    | 60-120      |
| ...  | scales   | scales    | scales    | scales     | scales      |

Ranged/casters should always have ~40-60% the HP of melee equivalents. Exploders should be the squishiest.

---

## 17. Implementation Order

Recommended build sequence (each step is independently testable):

1. **Types first** — Add all new types to `types.ts`. Compile-check.
2. **Constants** — Add all new constants to `constants.ts`.
3. **Monster ability data** — Create `monster-abilities.data.ts` with all ability definitions.
4. **Monster affix data** — Create `monster-affixes.data.ts` with all 10 affix definitions.
5. **Extended MonsterDefinition** — Add new fields, update Zone 1 monsters in `monsters.data.ts`.
6. **Monster rarity system** — Create `monster-rarity.ts`: rarity roll, stat scaling, affix assignment.
7. **Monster ability system** — Create `monster-abilities.ts`: cooldown management, ability firing, projectile spawning.
8. **AI overhaul** — Rewrite `monster-ai.ts` with archetype-specific profiles. Keep existing states as fallback.
9. **Combat integration** — Add monster projectile → player hit detection to `combat.ts`.
10. **Spawn integration** — Wire rarity roll + minion packs into `zones.ts` spawning.
11. **Loot integration** — Wire rarity multipliers into `loot.ts`.
12. **Visual layer** — Update `MonsterEntity.ts` with rarity visuals, archetype shapes, telegraph rendering.
13. **Telegraph system** — Add telegraph lifecycle management to `GameScene.ts`.
14. **Affix runtime** — Implement affix behaviors (teleport, vampiric, auras, frost nova) in `monster-ai.ts` or dedicated handler.
15. **Playtest and tune** — Adjust all numbers based on gameplay feel.
