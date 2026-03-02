# Ashen Grace — Skill System Implementation Plan

> **Reference:** `docs/SKILL_SYSTEM.md` (the design spec)
> **Phase 1 Status:** COMPLETE (base skills, resonance, player/enemy states, skill bar)
> **Phase 2 Status:** COMPLETE (2026-03-01) — state polish + all 5 passives reconciled to spec
> **Phase 3 Status:** COMPLETE (2026-03-01) — upgrade fork data architecture (types, 18 paths, API, save/load)
> **Phase 4A Status:** COMPLETE (2026-03-01) — Heavy Slash fork effects (Ravager, Executioner, Sunbreaker + awakenings)
> **Phase 4B Status:** COMPLETE (2026-03-01) — Arcane Bolt fork effects (Seeker, Overload, Unstable Bolt + awakenings) + player projectile collision detection
> **Phase 4C Status:** COMPLETE (2026-03-01) — Shadow Step fork effects (Assassin, Momentum Dash, Phase Walk + awakenings: Death's Shadow, Impact Wave, Echo Step)
> **Phase 5 Status:** COMPLETE (2026-03-02) — SP economy (level-up emit, boss first-kill +2 SP), unlock condition checking, passive unlockConditions, skillUsageCounts persistence
> **Phase 7 Status:** COMPLETE (2026-03-02) — 4-Layer Feedback + VFX + Resonance Visuals (impact/knockback pipeline for skills, slash/spark/shockwave VFX, death burst, resonance motes, player state visuals, enemy state overlays, camera effects)
> **Phase 8 Status:** COMPLETE (2026-03-02) — Environmental States (Shadow Trail rendering, Echo Step ghost visual, Aftershock Zone infrastructure + VFX)
> **Remaining:** Phase 6 described below

---

## Phase 1 Recap — What's Already Built

| System | Status | Files |
|---|---|---|
| 3 active skills (heavy_slash, arcane_bolt, shadow_step) + basic_attack | Base versions working | `skills.data.ts`, `skill-effects.ts` |
| 5 passives (blood_price, arcane_recursion, combat_rhythm, shadow_reflexes, endurance) | Working but **don't match spec** | `skills.data.ts`, `skill-passives.ts` |
| Resonance (Ash/Ember charges, Ashburst/Overload, Duality) | Working | `resonance.ts` |
| Player States (Flow, Wrath, Primed) | Basic — missing spec details | `player-states.ts` |
| Enemy States (Sundered, Charged, Staggered) | Working | `skill-effects.ts` (local helper) |
| SkillBar (4 active slots) | Working | `SkillBar.ts` |
| Stack overflow fix (resonance loop guard) | Fixed | `skill-effects.ts`, `resonance.ts`, `player-states.ts` |

### Known Discrepancies Between Code and Spec

The 5 passives implemented in Phase 1 **do not match** `SKILL_SYSTEM.md` § 7. They were interim implementations. The spec defines completely different mechanics for each passive. Phase 2 reconciles these.

| Passive | Current Code | Spec (SKILL_SYSTEM.md § 7) |
|---|---|---|
| `combat_rhythm` | Alternate phys/magic → +12% damage 4s | 3 hits same target → +5%/hit, stacking to +25% |
| `arcane_recursion` | 20% chance refund 50% energy | Magic cast → reduce ALL other skill CDs by 0.5s |
| `blood_price` | Every 5th hit → +30% dmg, cost 3% HP | Take damage → gain Ash charges (1 per 5% HP taken), Wrath bonus stacks |
| `shadow_reflexes` | Dodge → +15% crit + 10% dmg 3s | Post-Shadow Step → +20% dmg for next 2 hits; panic dash CD reduction |
| `endurance` | >70% HP → energy; <30% → regen | **Should be `flow_state`**: In Flow → +1 Resonance/hit, release +30% dmg, +8 energy on entering |

Player state gaps:
- **Wrath** should double Ash generation and halve Ember generation (spec § 3.2) — not implemented
- **Flow** should boost Resonance charge rate by +1 per other hit (spec § 3.2) — not implemented
- **Primed** should have 8s timeout (spec § 3.2) — currently only consumed on next hit, no expiry

---

## Phase Overview

| Phase | Name | Estimated Size | Dependencies |
|---|---|---|---|
| **2** | State System Polish + Passive Reconciliation | **COMPLETE** | None |
| **3** | Upgrade Fork Data Architecture | **COMPLETE** (2026-03-01) | None |
| **4A** | Fork Effects — Heavy Slash | **COMPLETE** | Phase 3 |
| **4B** | Fork Effects — Arcane Bolt | **COMPLETE** | Phase 3 |
| **4C** | Fork Effects — Shadow Step | **COMPLETE** (2026-03-01) | Phase 3 |
| **5** | SP Economy + Unlock Conditions | Medium (~200 lines) → **UP NEXT** | Phase 3 |
| **6** | Codex UI | Large (~600 lines) | Phases 3, 5 |
| **7** | 4-Layer Feedback + VFX + Resonance Visuals | Large (~500 lines) | Phase 1 |
| **8** | Environmental States | Small (~150 lines) | Phase 4C |

Phases 2, 3, and 7 have no inter-dependencies and can be done in any order. Phases 4A/B/C require Phase 3. Phase 6 requires Phases 3 + 5. Phase 8 requires Phase 4C (Shadow Trail is a Phase Walk upgrade).

---

## Phase 2: State System Polish + Passive Reconciliation

> **Ref:** SKILL_SYSTEM.md § 3.2 (Player States), § 7 (Passives)
> **Goal:** Fix state system gaps and rewrite all 5 passives to match the design spec exactly.

### 2.1 — Player State Fixes

#### `src/systems/player-states.ts`

**Fix Primed timeout (8s expiry):**
- Add `primedTimer: number` to module state (not PlayerState — it's transient)
- In `onBuffApplied()`: set `primedTimer = 8.0`
- In `update()`: tick `primedTimer -= dt`; if reaches 0 and `cs.primed`, clear Primed
- On `onDamageDealtPrimed()`: clear Primed immediately (existing behavior, keep)

**Fix Flow Resonance boost:**
- In `onDamageDealtFlow()`, after incrementing `flowHitCount`:
  - If `cs.flow` is true, emit `resonance:requestCharge` with the damage type (+1 extra)
  - This gives 1.5x effective rate (1 from resonance.ts + 0.5 extra every other hit)
  - Track with `flowExtraChargeToggle: boolean` — alternates each hit

#### `src/systems/resonance.ts`

**Fix Wrath Resonance modifiers:**
- In `onDamageDealt()`, check `getPlayer().combatStates.wrath`
- If Wrath active AND `damageType === 'physical'`: call `addCharge('ash', 2)` instead of 1
- If Wrath active AND `damageType === 'magic'`: skip charge (halved → 0 for single hits)
- This matches spec: "Ash generation doubles, Ember generation HALVED"

#### New constant in `src/data/constants.ts`

```typescript
export const PRIMED_DURATION = 8.0; // seconds before Primed expires
```

### 2.2 — Passive Skill Rewrite

#### `src/data/skills.data.ts` — Update passive definitions

Rename `endurance` → `flow_state` everywhere. Update all 5 passive descriptions, level data, and categories to match spec.

| ID | Name | Category | Spec Mechanic |
|---|---|---|---|
| `combat_rhythm` | Combat Rhythm | power | 3 hits same target → Rhythm state; +5% per hit, max +25% at 8 hits |
| `arcane_recursion` | Arcane Recursion | mage | Magic cast → reduce all OTHER skill CDs by 0.5s (cap: no CD below 50% base) |
| `blood_price` | Blood Price | power | On damage taken → gain 1 Ash per 5% maxHP received; Wrath bonus +5% per hit taken (cap +35%) |
| `shadow_reflexes` | Shadow Reflexes | speed | After Shadow Step → next 2 hits +20% dmg + guaranteed state apply; panic dash (within 0.5s of taking dmg) → CD -2s |
| `flow_state` | Flow State | utility | In Flow → +1 Resonance/hit; Release +30% dmg + 20% radius; entering Flow restores 8 energy |

#### `src/systems/skill-passives.ts` — Full rewrite of all 5 handlers

**combat_rhythm:**
```
State: { targetId: string | null, hitCount: number, rhythmBonus: number, rhythmTimer: number }
Listen: combat:damageDealt
Logic:
  - Same targetId as last hit? hitCount++, reset timer to 2s
  - Different target or timer expired? Reset hitCount to 1, set new targetId
  - At hitCount >= 3: enter Rhythm. Bonus = min(0.25, (hitCount - 2) * 0.05)
  - Apply bonus: multiply player.attack and player.magicPower by (1 + bonus)
  - On target switch or 2s no-hit: remove bonus, reset
```

**arcane_recursion:**
```
Listen: skill:used
Logic:
  - Check if used skill has damageType === 'magic'
  - If yes: call skills.reduceAllCooldowns(0.5, data.skillId) [already exists!]
  - That's it — the existing reduceAllCooldowns() handles the 50% floor
```

**blood_price:**
```
State: { wrathStackBonus: number } (cap at 0.35)
Listen: player:damaged
Logic:
  - Calculate chunks = floor(data.amount / (player.maxHP * 0.05))
  - Emit resonance:requestCharge { type: 'ash', amount: min(5, chunks) }
  - If player.combatStates.wrath: wrathStackBonus = min(0.35, wrathStackBonus + 0.05)
  - Apply bonus: wrath effective bonus = WRATH_DAMAGE_BONUS + wrathStackBonus
  - On Wrath exit: reset wrathStackBonus to 0
  - Counterweight: if HP < 15% maxHP, emit resonance:requestCharge to CLEAR (ash: -all, ember: -all)
```

**shadow_reflexes:**
```
State: { empoweredHitsRemaining: number, empoweredTimer: number, lastDamagedTime: number }
Listen: skill:used (for shadow_step detection), combat:damageDealt (consume empowered hits), player:damaged (track damage timing)
Logic:
  - On skill:used where skillId === 'shadow_step':
    - empoweredHitsRemaining = 2, empoweredTimer = 3.0
    - Apply +20% damage buff to player.attack
    - Check if (gameTime - lastDamagedTime) <= 0.5: if so, emit reduceCooldown('shadow_step', 2.0) [panic dash]
  - On combat:damageDealt (if empoweredHitsRemaining > 0):
    - Decrement empoweredHitsRemaining
    - The hit's status effect application is guaranteed (need to emit flag? Or just force-apply enemy state)
    - At 0 remaining: remove +20% buff
  - On player:damaged: update lastDamagedTime = gameTime
  - Timer expiry in update(): if empoweredTimer <= 0, remove buff and reset
```

**flow_state:**
```
State: { releaseBoostActive: boolean }
Listen: resonance:release, playerState:flowEntered, combat:damageDealt
Logic:
  - On playerState:flowEntered: restore 8 energy via addEnergy(8)
  - On combat:damageDealt while player is in Flow:
    - Emit resonance:requestCharge { type: matching damageType, amount: 1 }
    - This gives +1 extra charge per hit while in Flow
  - On resonance:release while player is in Flow:
    - The release damage should be +30% and radius +20%
    - Approach: emit a custom event or set a flag that skill-effects reads
    - Add `flowReleaseBoost` flag on resonance state: checked in onResonanceRelease()
    - When Flow breaks: clear the flag
```

#### New constants in `src/data/constants.ts`

```typescript
export const RHYTHM_HIT_THRESHOLD = 3;       // hits before Rhythm activates
export const RHYTHM_MAX_BONUS = 0.25;         // +25% max damage bonus
export const RHYTHM_BONUS_PER_HIT = 0.05;     // +5% per hit after threshold
export const RHYTHM_TIMEOUT = 2.0;            // seconds between hits before reset
export const SHADOW_REFLEXES_HITS = 2;         // empowered hits after dash
export const SHADOW_REFLEXES_DAMAGE_BONUS = 0.20;
export const SHADOW_REFLEXES_DURATION = 3.0;   // seconds
export const SHADOW_REFLEXES_PANIC_WINDOW = 0.5;
export const SHADOW_REFLEXES_PANIC_CDR = 2.0;  // seconds off shadow_step CD
export const BLOOD_PRICE_HP_CHUNK = 0.05;      // 5% maxHP per Ash charge
export const BLOOD_PRICE_WRATH_STACK = 0.05;   // +5% per damage taken in Wrath
export const BLOOD_PRICE_WRATH_CAP = 0.35;     // max extra Wrath bonus
export const BLOOD_PRICE_PANIC_THRESHOLD = 0.15; // below 15% HP → lose all Resonance
export const FLOW_STATE_ENERGY_RESTORE = 8;
export const FLOW_STATE_RELEASE_DAMAGE_BONUS = 0.30;
export const FLOW_STATE_RELEASE_RADIUS_BONUS = 0.20;
export const ARCANE_RECURSION_CDR = 0.5;       // seconds reduced per magic cast
```

#### `src/core/types.ts` — Add to ResonanceState

```typescript
export interface ResonanceState {
  ash: number;
  ember: number;
  decayTimer: number;
  dualityActive: boolean;
  flowReleaseBoost: boolean;  // NEW — set by flow_state passive
}
```

### 2.3 — Files Changed

| File | Change |
|---|---|
| `src/systems/player-states.ts` | Add Primed 8s timeout, Flow resonance toggle |
| `src/systems/resonance.ts` | Wrath modifier (double Ash, zero Ember) |
| `src/systems/skill-passives.ts` | Full rewrite — all 5 passives to match spec |
| `src/systems/skill-effects.ts` | Read `flowReleaseBoost` in `onResonanceRelease()` |
| `src/data/skills.data.ts` | Rename endurance → flow_state, update descriptions/levels |
| `src/data/constants.ts` | ~15 new passive constants + PRIMED_DURATION |
| `src/core/types.ts` | Add `flowReleaseBoost` to ResonanceState |
| `src/core/game-state.ts` | Update `createDefaultPlayer()` — flowReleaseBoost: false |

### 2.4 — Acceptance Criteria

1. `npx tsc --noEmit` — zero errors
2. Primed auto-expires after 8s if no hit dealt
3. In Wrath state: physical hits generate 2 Ash charges; magic hits generate 0 Ember
4. Combat Rhythm: hitting same monster 3+ times shows +5%/hit damage increase
5. Arcane Recursion: casting Arcane Bolt reduces Heavy Slash and Shadow Step CDs by 0.5s
6. Blood Price: taking 20% HP damage gives 4 Ash charges
7. Shadow Reflexes: after Shadow Step, next 2 hits deal +20% damage
8. Flow State: entering Flow restores 8 energy; Ashburst/Overload deal +30% in Flow

---

## Phase 3: Upgrade Fork Data Architecture

> **Ref:** SKILL_SYSTEM.md § 4 (Slots/SP/Unlocks), § 5 (Fork Architecture), § 11 (Technical Notes)
> **Goal:** Define the complete data layer for all 18 upgrade variants. Pure types + data — no gameplay effects yet.

### 3.1 — New Types

#### `src/core/types.ts` — Add upgrade fork types

```typescript
/** A single upgrade path option (tier 1 or tier 2) */
export interface SkillUpgradePathDef {
  id: string;                    // e.g. 'heavy_slash_ravager'
  name: string;                  // e.g. 'Ravager'
  description: string;           // flavor text
  detailedDescription: string;   // mechanical description (shown in Codex)
  tier: 1 | 2;                  // 1 = fork choice, 2 = awakening
  spCost: number;                // 1 for tier 1, 2 for tier 2
  path: 'A' | 'B' | 'C';

  // Stat overrides (applied on top of base skill)
  statOverrides?: Partial<SkillLevelData>;

  // Mechanical flags (read by effect handlers)
  flags?: Record<string, number | boolean | string>;
}

/** Full upgrade tree for an active skill */
export interface SkillUpgradeTree {
  tier1: {
    A: SkillUpgradePathDef;
    B: SkillUpgradePathDef;
    C: SkillUpgradePathDef;
  };
  tier2: {
    A: SkillUpgradePathDef;
    B: SkillUpgradePathDef;
    C: SkillUpgradePathDef;
  };
}
```

#### Extend `SkillDefinition`

```typescript
export interface SkillDefinition {
  // ... existing fields ...
  upgradeTree?: SkillUpgradeTree;  // NEW — only for active skills with fork paths
}
```

#### Extend `SkillUpgradeState` (already exists but unused)

```typescript
export interface SkillUpgradeState {
  pathChoice: 'A' | 'B' | 'C' | null;  // which fork was chosen
  tier: 0 | 1 | 2;                     // 0 = base, 1 = fork chosen, 2 = awakening
}
```

No change needed — it's already correct.

### 3.2 — Skill Data: Define All 18 Upgrade Paths

#### `src/data/skills.data.ts` — Add `upgradeTree` to each active skill

**heavy_slash.upgradeTree:**

```typescript
upgradeTree: {
  tier1: {
    A: {
      id: 'heavy_slash_ravager', name: 'Ravager', path: 'A', tier: 1, spCost: 1,
      description: '"The arc becomes a wave."',
      detailedDescription: 'Arc 180° (from 120°), range 90px (from 70px). Applies 2 Bleed stacks instead of Sundered. CD 4.5s. +20% move speed during cast.',
      flags: { arcWidth: 180, range: 90, bleedStacks: 2, removeSundered: true, cooldownOverride: 4.5, castMoveSpeedBonus: 0.20 },
    },
    B: {
      id: 'heavy_slash_executioner', name: 'Executioner', path: 'B', tier: 1, spCost: 1,
      description: '"Mercy is wasted on the dying."',
      detailedDescription: 'Sundered lasts 10s (from 6s). +30% damage to enemies <50% HP. +60% to enemies <25% HP. +8% crit chance.',
      flags: { sunderedDuration: 10, execute50Bonus: 0.30, execute25Bonus: 0.60, critBonus: 0.08 },
    },
    C: {
      id: 'heavy_slash_sunbreaker', name: 'Sunbreaker', path: 'C', tier: 1, spCost: 1,
      description: '"Shatter their defense, then shatter everything."',
      detailedDescription: 'Applies Sunder Stacks (max 3) instead of Sundered. 1 stack: -10% def, 2: -20%, 3: -30% + fully Sundered. Re-hitting fully Sundered enemy triggers Sundered Detonation (70px AoE). CD 4.0s.',
      flags: { sunderStacks: true, maxSunderStacks: 3, detonationRadius: 70, detonationDamageMult: 0.6, cooldownOverride: 4.0 },
    },
  },
  tier2: {
    A: {
      id: 'heavy_slash_hemorrhage', name: 'Hemorrhage', path: 'A', tier: 2, spCost: 2,
      description: '"The slash opens wounds that refuse to close."',
      detailedDescription: 'Double hit with 0.2s delay. Second hit does 60% damage. Both apply Bleed. +2 Ash per enemy (first hit), +1 (second hit).',
      flags: { doubleHit: true, secondHitDamageMult: 0.60, secondHitDelay: 0.2 },
    },
    B: {
      id: 'heavy_slash_coup_de_grace', name: 'Coup de Grâce', path: 'B', tier: 2, spCost: 2,
      description: '"One hit. One death."',
      detailedDescription: 'Killing blow triggers Execution Burst: 60px physical AoE (1.0× attack). Generates +2 Ash. If target was Sundered, burst radius +50% (90px).',
      flags: { executionBurst: true, burstRadius: 60, burstDamageMult: 1.0, burstAshCharges: 2, sunderedBurstRadiusMult: 1.5 },
    },
    C: {
      id: 'heavy_slash_cataclysm', name: 'Cataclysm', path: 'C', tier: 2, spCost: 2,
      description: '"When the wall falls, everything behind it falls too."',
      detailedDescription: 'Sundered Detonation chains: applies 1 Sunder Stack to all enemies hit. Detonation grows +30% per Ash charge held (max +40% at 5, consumes all).',
      flags: { chainDetonation: true, detonationAshScaling: 0.30, detonationAshCap: 5 },
    },
  },
},
```

**arcane_bolt.upgradeTree:**

```typescript
upgradeTree: {
  tier1: {
    A: {
      id: 'arcane_bolt_seeker', name: 'Seeker', path: 'A', tier: 1, spCost: 1,
      description: '"The bolt doesn\'t miss. It finds."',
      detailedDescription: 'Persistent homing (tracks full flight). On impact, chains to nearest enemy within 200px for 50% damage. Chain applies Charged. CD 2.5s.',
      flags: { persistentHoming: true, chainRange: 200, chainDamageMult: 0.50, cooldownOverride: 2.5 },
    },
    B: {
      id: 'arcane_bolt_overload', name: 'Overload', path: 'B', tier: 1, spCost: 1,
      description: '"Charge them up. Then watch them pop."',
      detailedDescription: 'Applies 2 Charged stacks per hit (max stacks in 2 hits). At 3 Charged stacks, next magic hit triggers Discharge: 80px AoE, 1.4× magicPower. Clears all Charged.',
      flags: { doubleCharged: true, dischargeRadius: 80, dischargeDamageMult: 1.4 },
    },
    C: {
      id: 'arcane_bolt_unstable', name: 'Unstable Bolt', path: 'C', tier: 1, spCost: 1,
      description: '"It wasn\'t designed to be controlled."',
      detailedDescription: 'Bolt is now piercing. Speed 600px/s. Applies Charged to each target. 3+ enemies in one shot → bolt explodes at 3rd enemy (60px, 50% bonus magic).',
      flags: { piercing: true, speedOverride: 600, explosionThreshold: 3, explosionRadius: 60, explosionBonusMult: 0.50 },
    },
  },
  tier2: {
    A: {
      id: 'arcane_bolt_thunderchain', name: 'Thunderchain', path: 'A', tier: 2, spCost: 2,
      description: '"One bolt. Four deaths."',
      detailedDescription: 'Chain bounces 3 times total (50% damage each). Each chain applies Charged. Hitting max-Charged (3) enemy triggers Overload Burst (50px AoE).',
      flags: { chainBounces: 3, chainDamageFalloff: 0.50, overloadBurstOnMaxCharged: true, overloadBurstRadius: 50 },
    },
    B: {
      id: 'arcane_bolt_critical_mass', name: 'Critical Mass', path: 'B', tier: 2, spCost: 2,
      description: '"When it blows, everything in the room knows."',
      detailedDescription: 'Discharge radius 130px (from 80px). Applies Charged (1 stack) to all hit by explosion. 3+ enemies hit → grants Primed. Generates 3 Ember charges.',
      flags: { dischargeRadiusOverride: 130, dischargeAppliesCharged: true, dischargePrimedThreshold: 3, dischargeEmberCharges: 3 },
    },
    C: {
      id: 'arcane_bolt_chain_reaction', name: 'Chain Reaction', path: 'C', tier: 2, spCost: 2,
      description: '"Once it starts, there\'s no stopping it."',
      detailedDescription: 'Each piercing hit adds +15% damage (multiplicative). Bolt detonates at endpoint: AoE scales with piercing hits (cap 140px at 5+). Sundered targets make detonation deal hybrid damage.',
      flags: { piercingDamageScaling: 0.15, endpointDetonation: true, maxDetonationRadius: 140, sunderedHybridDamage: true },
    },
  },
},
```

**shadow_step.upgradeTree:**

```typescript
upgradeTree: {
  tier1: {
    A: {
      id: 'shadow_step_assassin', name: 'Assassin', path: 'A', tier: 1, spCost: 1,
      description: '"Strike before they know you\'re there."',
      detailedDescription: 'Auto-positions behind nearest enemy (within 120px of cursor). Arriving behind grants +40% crit on next attack. Arrival damage 0.8× attack. Stagger extended to 0.6s.',
      flags: { behindTarget: true, behindRange: 120, nextAttackCritBonus: 0.40, arrivalDamageMult: 0.8, staggerDurationOverride: 0.6 },
    },
    B: {
      id: 'shadow_step_momentum', name: 'Momentum Dash', path: 'B', tier: 1, spCost: 1,
      description: '"The destination is the weapon."',
      detailedDescription: 'Dash distance 240px (from 160px). Arrival damage scales +15% per 40px traveled. AoE radius 70px (from 40px). Knockback 30px (from 12px). CD 5.0s.',
      flags: { dashDistance: 240, distanceDamageScaling: 0.15, distanceDamageInterval: 40, arrivalRadius: 70, knockbackDistance: 30, cooldownOverride: 5.0 },
    },
    C: {
      id: 'shadow_step_phase_walk', name: 'Phase Walk', path: 'C', tier: 1, spCost: 1,
      description: '"The shadow lingers where you left."',
      detailedDescription: 'Leaves Shadow Trail at origin (2s, 16px wide, full dash length). Trail deals 20% attack/sec. Dashing through enemy → auto-Stagger. CD 4.5s.',
      flags: { shadowTrail: true, trailDuration: 2.0, trailWidth: 16, trailDamagePercent: 0.20, throughDashStagger: true, cooldownOverride: 4.5 },
    },
  },
  tier2: {
    A: {
      id: 'shadow_step_deaths_shadow', name: "Death's Shadow", path: 'A', tier: 2, spCost: 2,
      description: '"You vanish. They never see it coming."',
      detailedDescription: '2s semi-stealth post-dash (enemies deaggro). Next hit in stealth: guaranteed crit + all on-hit status effects applied. Stealth breaks on damage dealt/received.',
      flags: { stealth: true, stealthDuration: 2.0, guaranteedCrit: true, guaranteedStatus: true },
    },
    B: {
      id: 'shadow_step_impact_wave', name: 'Impact Wave', path: 'B', tier: 2, spCost: 2,
      description: '"You don\'t just land. You erupt."',
      detailedDescription: 'Arrival pulses twice: initial 70px, then 100px at 50% damage after 0.3s. Stagger applies to ALL hit enemies. Generates +2 Ash per enemy hit.',
      flags: { doublePulse: true, secondPulseRadius: 100, secondPulseDamageMult: 0.50, secondPulseDelay: 0.3, ashPerHit: 2 },
    },
    C: {
      id: 'shadow_step_echo_step', name: 'Echo Step', path: 'C', tier: 2, spCost: 2,
      description: '"Some shadows refuse to fade."',
      detailedDescription: '1.5s after dash, Shadow Echo replays the dash path for 60% of arrival damage. Echo triggers all on-arrival effects (Stagger, Trail, knockback). CD 4.0s.',
      flags: { shadowEcho: true, echoDelay: 1.5, echoDamageMult: 0.60, cooldownOverride: 4.0 },
    },
  },
},
```

### 3.3 — Skills System API Extensions

#### `src/systems/skills.ts` — Add fork management

```typescript
/**
 * Choose an upgrade path for a skill (tier 1 fork).
 * Locks out the other two paths.
 * Returns true if successful.
 */
export function chooseUpgradePath(skillId: string, path: 'A' | 'B' | 'C'): boolean {
  const def = getSkillDef(skillId);
  if (!def?.upgradeTree) return false;

  const player = getPlayer();
  if (!player.unlockedSkills.includes(skillId)) return false;

  const upgrade = player.skillUpgrades[skillId];
  // Must be at tier 0 (no path chosen yet)
  if (upgrade && upgrade.tier >= 1) return false;

  // Check SP cost
  const pathDef = def.upgradeTree.tier1[path];
  if (player.skillPoints < pathDef.spCost) return false;

  player.skillPoints -= pathDef.spCost;
  player.skillUpgrades[skillId] = { pathChoice: path, tier: 1 };

  emit('skill:upgraded', { skillId, path, tier: 1 });
  return true;
}

/**
 * Unlock the tier 2 Awakening for a skill.
 * Requires tier 1 already chosen.
 */
export function unlockAwakening(skillId: string): boolean {
  const def = getSkillDef(skillId);
  if (!def?.upgradeTree) return false;

  const player = getPlayer();
  const upgrade = player.skillUpgrades[skillId];
  if (!upgrade || upgrade.tier !== 1 || !upgrade.pathChoice) return false;

  const pathDef = def.upgradeTree.tier2[upgrade.pathChoice];
  if (player.skillPoints < pathDef.spCost) return false;

  player.skillPoints -= pathDef.spCost;
  upgrade.tier = 2;

  emit('skill:upgraded', { skillId, path: upgrade.pathChoice, tier: 2 });
  return true;
}

/**
 * Get the current upgrade state for a skill.
 */
export function getUpgradeState(skillId: string): SkillUpgradeState {
  const player = getPlayer();
  return player.skillUpgrades[skillId] ?? { pathChoice: null, tier: 0 };
}

/**
 * Get the flags for the currently active upgrade path.
 * Returns empty object if no path chosen.
 */
export function getUpgradeFlags(skillId: string): Record<string, number | boolean | string> {
  const def = getSkillDef(skillId);
  if (!def?.upgradeTree) return {};

  const player = getPlayer();
  const upgrade = player.skillUpgrades[skillId];
  if (!upgrade || !upgrade.pathChoice) return {};

  const flags: Record<string, number | boolean | string> = {};

  // Merge tier 1 flags
  const t1 = def.upgradeTree.tier1[upgrade.pathChoice];
  if (t1.flags) Object.assign(flags, t1.flags);

  // Merge tier 2 flags (if awakening unlocked)
  if (upgrade.tier >= 2) {
    const t2 = def.upgradeTree.tier2[upgrade.pathChoice];
    if (t2.flags) Object.assign(flags, t2.flags);
  }

  return flags;
}

/**
 * Respec a skill's upgrade path. Refunds SP.
 * Limited to 3 respecs per session (tracked in module state).
 */
export function respecSkillUpgrade(skillId: string): boolean {
  const player = getPlayer();
  const upgrade = player.skillUpgrades[skillId];
  if (!upgrade || upgrade.tier === 0) return false;

  if (respecsUsed >= MAX_RESPECS_PER_SESSION) return false;

  // Refund SP
  const def = getSkillDef(skillId);
  if (!def?.upgradeTree || !upgrade.pathChoice) return false;

  let refund = def.upgradeTree.tier1[upgrade.pathChoice].spCost;
  if (upgrade.tier >= 2) {
    refund += def.upgradeTree.tier2[upgrade.pathChoice].spCost;
  }

  player.skillPoints += refund;
  player.skillUpgrades[skillId] = { pathChoice: null, tier: 0 };
  respecsUsed++;

  emit('skill:respecced', { skillId, spRefunded: refund });
  return true;
}
```

#### New module state in `skills.ts`

```typescript
let respecsUsed = 0;
const MAX_RESPECS_PER_SESSION = 3;
```

Reset `respecsUsed = 0` in `init()`.

### 3.4 — New Events

#### `src/core/types.ts` — Add to GameEventMap

```typescript
'skill:upgraded': { skillId: string; path: 'A' | 'B' | 'C'; tier: 1 | 2 };
'skill:respecced': { skillId: string; spRefunded: number };
```

### 3.5 — Files Changed

| File | Change |
|---|---|
| `src/core/types.ts` | Add `SkillUpgradePathDef`, `SkillUpgradeTree`, extend `SkillDefinition`, new events |
| `src/data/skills.data.ts` | Add `upgradeTree` to heavy_slash, arcane_bolt, shadow_step (all 18 paths defined) |
| `src/systems/skills.ts` | Add `chooseUpgradePath()`, `unlockAwakening()`, `getUpgradeState()`, `getUpgradeFlags()`, `respecSkillUpgrade()` |
| `src/data/constants.ts` | Add `MAX_RESPECS_PER_SESSION = 3` |

### 3.6 — Acceptance Criteria

1. `npx tsc --noEmit` — zero errors
2. All 18 `SkillUpgradePathDef` objects defined with complete descriptions and flags
3. `chooseUpgradePath('heavy_slash', 'A')` succeeds, deducts 1 SP, sets tier to 1
4. `unlockAwakening('heavy_slash')` after path A chosen: deducts 2 SP, sets tier to 2
5. `getUpgradeFlags('heavy_slash')` returns merged tier1 + tier2 flags
6. `respecSkillUpgrade()` refunds SP, resets to tier 0, increments respec counter
7. 4th respec attempt fails (MAX_RESPECS_PER_SESSION = 3)

---

## Phase 4A: Fork Effects — Heavy Slash ✓ COMPLETE (2026-03-01)

> **Ref:** SKILL_SYSTEM.md § 6.1
> **Goal:** Implement all 3 tier-1 paths + 3 tier-2 awakenings for Heavy Slash
> **Depends on:** Phase 3 (data layer must exist)
> **Status:** COMPLETE — dispatcher + 4 variant handlers, delayed hit queue, physDefenseMultOverride, cooldown override

### 4A.1 — Effect Handler Refactor

#### `src/systems/skill-effects.ts` — Refactor `handleHeavySlash()`

Replace the single `handleHeavySlash()` with a dispatcher:

```typescript
function handleHeavySlash(data: SkillUsedData): void {
  const flags = skills.getUpgradeFlags('heavy_slash');

  if (flags.sunderStacks) {
    handleHeavySlashSunbreaker(data, flags);
  } else if (flags.execute50Bonus) {
    handleHeavySlashExecutioner(data, flags);
  } else if (flags.bleedStacks) {
    handleHeavySlashRavager(data, flags);
  } else {
    handleHeavySlashBase(data);
  }
}
```

Import `getUpgradeFlags` from skills.ts (allowed — skill-effects reads from skills, no circular dep).

### 4A.2 — Path A: Ravager → Hemorrhage

**Tier 1 — Ravager:**
```
handleHeavySlashRavager(data, flags):
  - arcWidth = flags.arcWidth (180°)
  - range = flags.range (90px)
  - Find monsters in arc (wider + longer)
  - For each: applyDamageToMonster(monsterId, baseDamage, 'physical')
  - Apply 2 Bleed stacks via status:requestApply (NOT Sundered)
  - If flags.castMoveSpeedBonus: briefly boost player move speed (handled via buff timer)
  - Emit resonance:requestCharge { type: 'ash', amount: 1 } (capped +2 per cast)
  - CD override handled in skills.ts via getEffectiveCooldown reading flags
```

**Tier 2 — Hemorrhage (on top of Ravager):**
```
If flags.doubleHit:
  - After first hit resolves, schedule second hit at +0.2s delay
  - Second hit uses same arc/monsters, deals baseDamage * 0.60
  - Both hits apply Bleed stacks
  - First hit: +2 Ash per enemy. Second hit: +1 Ash per enemy.
  - Use scheduleBuffExpiry pattern (already exists) for delayed second hit
```

### 4A.3 — Path B: Executioner → Coup de Grâce

**Tier 1 — Executioner:**
```
handleHeavySlashExecutioner(data, flags):
  - Standard arc (120°, 70px)
  - Sundered duration = flags.sunderedDuration (10s instead of 6s)
  - For each monster:
    - Calculate HP ratio
    - bonusMult = 1.0
    - if hpRatio < 0.25: bonusMult += flags.execute25Bonus (0.60)
    - if hpRatio < 0.50: bonusMult += flags.execute50Bonus (0.30)
    - Crit chance temporarily boosted by flags.critBonus (0.08)
    - applyDamageToMonster(monsterId, baseDamage, 'physical', bonusMult)
    - Apply Sundered with extended duration
```

**Tier 2 — Coup de Grâce:**
```
If flags.executionBurst:
  - After applyDamageToMonster, check if monster.isDead
  - If kill: trigger Execution Burst at (monster.x, monster.y)
    - radius = flags.burstRadius (60px)
    - If monster had Sundered: radius *= flags.sunderedBurstRadiusMult (1.5 → 90px)
    - Find monsters in circle, deal player.attack * flags.burstDamageMult (1.0×) physical
    - Generate flags.burstAshCharges (2) Ash
    - Emit VFX event for shockwave ring
```

### 4A.4 — Path C: Sunbreaker → Cataclysm

**Tier 1 — Sunbreaker:**
```
handleHeavySlashSunbreaker(data, flags):
  - Standard arc (120°, 70px), CD 4.0s
  - For each monster:
    - Get/create Sunder Stack count on monster (custom enemy state)
    - Add 1 Sunder Stack (max flags.maxSunderStacks = 3)
    - At 1 stack: -10% def. 2: -20%. 3: -30% + fully Sundered
    - If monster was already fully Sundered (3 stacks) when hit again:
      - Trigger Sundered Detonation: AoE (flags.detonationRadius = 70px)
      - Damage: player.attack * flags.detonationDamageMult (0.6×)
      - Clear all Sunder Stacks on detonated monster
```

**Sunder Stacks implementation:**
- Use existing `monster.enemyStates` array with type `'sundered'` and `stacks` field
- Stacks 1-2 reduce defense proportionally; at 3 it matches full Sundered effect
- This requires minor adjustment to defense calc in `applyDamageToMonster()`:
  - Read sunder stacks and apply graduated reduction instead of flat 20%

**Tier 2 — Cataclysm:**
```
If flags.chainDetonation:
  - On Sundered Detonation: apply 1 Sunder Stack to all enemies hit by shockwave
  - Shockwave radius grows: baseRadius * (1 + ashCharges * flags.detonationAshScaling)
    - Max at 5 Ash: 70 * (1 + 5 * 0.06) = 91px (consumes all Ash)
    - Wait — spec says +30% per charge, max +40% at 5. That's inconsistent.
    - Correct: radius * (1 + min(0.40, ashCharges * 0.08)) — cap at 40% growth
    - Consume all Ash charges on detonation
```

### 4A.5 — Cooldown Override Integration

#### `src/systems/skills.ts` — `getEffectiveCooldown()`

Modify to check upgrade flags for `cooldownOverride`:

```typescript
export function getEffectiveCooldown(skillId: string): number {
  const def = getSkillDef(skillId);
  if (!def) return 0;

  // ... existing level lookup ...

  // Check upgrade path cooldown override
  const flags = getUpgradeFlags(skillId);
  const baseCooldown = (flags.cooldownOverride as number) ?? levelData.cooldown;

  // ... rest of CDR calculation ...
}
```

### 4A.6 — Files Changed

| File | Change |
|---|---|
| `src/systems/skill-effects.ts` | Refactor `handleHeavySlash()` into dispatcher + 4 variant handlers |
| `src/systems/skills.ts` | Import check for cooldownOverride in `getEffectiveCooldown()` |
| `src/data/constants.ts` | Add Sunder Stack reduction values if not using flags directly |

### 4A.7 — Acceptance Criteria

1. `npx tsc --noEmit` — zero errors
2. Base Heavy Slash (no upgrade): unchanged behavior
3. Ravager: 180° arc, longer range, applies Bleed, no Sundered
4. Hemorrhage: double hit visible (two damage numbers with 0.2s gap), both apply Bleed
5. Executioner: enemies below 50% HP take visibly more damage
6. Coup de Grâce: killing blow triggers AoE burst (visible damage to nearby enemies)
7. Sunbreaker: hitting same enemy 3 times shows escalating defense reduction
8. Cataclysm: Sundered Detonation hits chain to apply Sunder Stacks on nearby enemies

---

## Phase 4B: Fork Effects — Arcane Bolt → UP NEXT

> **Ref:** SKILL_SYSTEM.md § 6.2
> **Goal:** Implement all 3 tier-1 paths + 3 tier-2 awakenings for Arcane Bolt
> **Depends on:** Phase 3

### 4B.1 — Effect Handler Refactor

#### `src/systems/skill-effects.ts` — Refactor `handleArcaneBolt()`

```typescript
function handleArcaneBolt(data: SkillUsedData): void {
  const flags = skills.getUpgradeFlags('arcane_bolt');

  if (flags.piercing) {
    handleArcaneBoltUnstable(data, flags);
  } else if (flags.doubleCharged) {
    handleArcaneBoltOverload(data, flags);
  } else if (flags.persistentHoming) {
    handleArcaneBoltSeeker(data, flags);
  } else {
    handleArcaneBoltBase(data);
  }
}
```

### 4B.2 — Path A: Seeker → Thunderchain

**Tier 1 — Seeker:**
```
handleArcaneBoltSeeker(data, flags):
  - Create projectile with persistentHoming flag (needs new field on ProjectileInstance)
  - Set projectile.bounces = 1, bounceRange = flags.chainRange (200px)
  - Bounced hit does flags.chainDamageMult (50%) of original damage
  - Bounced hit applies Charged
  - CD override: 2.5s
```

**ProjectileInstance extension (types.ts):**
```typescript
  persistentHoming?: boolean;   // tracks target in real-time (not just initial direction)
  homingTargetId?: string;      // the monster being tracked
```

**Projectile update logic (combat.ts or wherever projectile movement is):**
- If `persistentHoming && homingTargetId`: steer velocity toward target each frame
- On hit: if bounces > 0, find nearest other monster within bounceRange, spawn chained projectile

**Tier 2 — Thunderchain:**
```
If flags.chainBounces:
  - bounces = 3 (instead of 1)
  - Each bounce: damage *= flags.chainDamageFalloff (0.50)
  - If a chained target has 3 Charged stacks: trigger Overload Burst (50px AoE)
```

### 4B.3 — Path B: Overload → Critical Mass

**Tier 1 — Overload:**
```
handleArcaneBoltOverload(data, flags):
  - Standard projectile (same as base)
  - On projectile:hit → apply 2 Charged stacks (instead of 1)
  - Discharge system: new event listener or check in onProjectileHit:
    - After applying Charged, check if monster has 3 stacks
    - If yes → Discharge: findMonstersInCircle(monster.x, monster.y, flags.dischargeRadius)
    - Damage = player.magicPower * flags.dischargeDamageMult (1.4×)
    - Clear all Charged stacks on the trigger target
    - Emit VFX event
```

**Tier 2 — Critical Mass:**
```
If flags.dischargeRadiusOverride:
  - Discharge radius = 130px (instead of 80px)
  - If flags.dischargeAppliesCharged: apply 1 Charged to all enemies hit by Discharge AoE
  - If enemies hit >= flags.dischargePrimedThreshold (3): grant Primed to player
  - Generate flags.dischargeEmberCharges (3) Ember charges
```

### 4B.4 — Path C: Unstable Bolt → Chain Reaction

**Tier 1 — Unstable Bolt:**
```
handleArcaneBoltUnstable(data, flags):
  - Create projectile with piercing = true (already supported!)
  - Speed override: flags.speedOverride (600)
  - Apply Charged to each pierced target
  - Track piercingHitCount on projectile (new field)
  - If piercingHitCount >= flags.explosionThreshold (3):
    - Explode at 3rd enemy position
    - AoE radius = flags.explosionRadius (60px)
    - Bonus damage = baseDamage * flags.explosionBonusMult (0.50)
```

**ProjectileInstance extension:**
```typescript
  piercingHitCount?: number;    // tracks how many targets pierced
```

**Tier 2 — Chain Reaction:**
```
If flags.piercingDamageScaling:
  - Each hit: damage *= (1 + flags.piercingDamageScaling) per previous hit
    - 1st: 100%, 2nd: 115%, 3rd: 132%, 4th: 152%, 5th: 174%
  - On projectile expiry (or wall hit): endpoint detonation
    - Radius = min(flags.maxDetonationRadius, 40 + piercingHitCount * 20)
    - If any pierced enemy was Sundered: damage type = hybrid (50% phys + 50% magic)
    - Apply both armorPen and magicPen reductions
```

### 4B.5 — Files Changed

| File | Change |
|---|---|
| `src/systems/skill-effects.ts` | Refactor `handleArcaneBolt()` + 4 variants + Discharge system |
| `src/core/types.ts` | Add `persistentHoming`, `homingTargetId`, `piercingHitCount` to ProjectileInstance |
| `src/systems/combat.ts` | Add persistent homing steering in projectile update |

### 4B.6 — Acceptance Criteria

1. Seeker: bolt visibly tracks moving enemy; chains to second target on hit
2. Thunderchain: bolt chains 3 times; hitting max-Charged enemy triggers visible AoE
3. Overload: 2 Charged stacks per hit; 3rd stack triggers Discharge explosion
4. Critical Mass: Discharge hits 3+ enemies → player gains Primed
5. Unstable Bolt: bolt passes through enemies, hitting multiple
6. Chain Reaction: each pierced enemy takes escalating damage; endpoint detonation fires

---

## Phase 4C: Fork Effects — Shadow Step

> **Ref:** SKILL_SYSTEM.md § 6.3
> **Goal:** Implement all 3 tier-1 paths + 3 tier-2 awakenings for Shadow Step
> **Depends on:** Phase 3

### 4C.1 — Effect Handler Refactor

#### `src/systems/skill-effects.ts` — Refactor `handleShadowStep()`

```typescript
function handleShadowStep(data: SkillUsedData): void {
  const flags = skills.getUpgradeFlags('shadow_step');

  if (flags.shadowTrail) {
    handleShadowStepPhaseWalk(data, flags);
  } else if (flags.distanceDamageScaling) {
    handleShadowStepMomentum(data, flags);
  } else if (flags.behindTarget) {
    handleShadowStepAssassin(data, flags);
  } else {
    handleShadowStepBase(data);
  }
}
```

### 4C.2 — Path A: Assassin → Death's Shadow

**Tier 1 — Assassin:**
```
handleShadowStepAssassin(data, flags):
  - Find nearest monster within flags.behindRange (120px) of cursor position
  - If found: calculate position BEHIND that monster (opposite side from player)
    - behindX = monster.x + (monster.x - player.x) / dist * 30
    - behindY = monster.y + (monster.y - player.y) / dist * 30
  - Override dash target to behindX/Y
  - Set arrival damage = player.attack * flags.arrivalDamageMult (0.8×)
  - On arrival: apply Stagger with flags.staggerDurationOverride (0.6s)
  - Set player.nextAttackCritBonus = flags.nextAttackCritBonus (0.40)
    - Consumed on next combat:damageDealt (one-shot flag on PlayerState)
```

**New PlayerState field:**
```typescript
nextAttackCritBonus: number;  // consumed on next hit (Assassin path)
```

**Tier 2 — Death's Shadow:**
```
If flags.stealth:
  - After dash arrival: set player.isStealthed = true, stealthTimer = flags.stealthDuration (2s)
  - Stealthed: enemies deaggro (monster AI checks player.isStealthed before chasing)
  - Next damaging skill in stealth: guaranteed crit + all on-hit statuses auto-apply
  - Stealth breaks on: damage dealt, damage received, timer expiry
```

**New PlayerState fields:**
```typescript
isStealthed: boolean;
stealthTimer: number;
```

### 4C.3 — Path B: Momentum Dash → Impact Wave

**Tier 1 — Momentum Dash:**
```
handleShadowStepMomentum(data, flags):
  - Override dash distance to flags.dashDistance (240px)
  - On arrival:
    - Calculate actual distance traveled
    - bonusMult = 1 + floor(distanceTraveled / flags.distanceDamageInterval) * flags.distanceDamageScaling
    - arrivalDamage = player.attack * 0.5 * bonusMult
    - arrivalRadius = flags.arrivalRadius (70px)
    - knockback = flags.knockbackDistance (30px) — apply to each hit monster
  - CD override: 5.0s
```

**Tier 2 — Impact Wave:**
```
If flags.doublePulse:
  - First pulse: standard arrival damage (70px)
  - Schedule second pulse at +0.3s:
    - Radius = flags.secondPulseRadius (100px)
    - Damage = arrivalDamage * flags.secondPulseDamageMult (50%)
    - Stagger ALL enemies in second pulse
  - Each enemy hit generates flags.ashPerHit (2) Ash charges
```

### 4C.4 — Path C: Phase Walk → Echo Step

**Tier 1 — Phase Walk:**
```
handleShadowStepPhaseWalk(data, flags):
  - Standard dash (160px)
  - On departure: create Shadow Trail zone
    - origin = player start position, endpoint = arrival position
    - Duration = flags.trailDuration (2s)
    - Width = flags.trailWidth (16px)
    - DPS = player.attack * flags.trailDamagePercent (20%/sec)
  - If player dashes THROUGH an enemy (enemy within dash path): auto-Stagger
  - CD override: 4.5s
```

**Shadow Trail implementation (environmental state — see also Phase 8):**
- New `EnvironmentalZone` interface:
```typescript
interface EnvironmentalZone {
  id: string;
  type: 'shadow_trail' | 'aftershock';
  startX: number; startY: number;
  endX: number; endY: number;
  width: number;
  duration: number;
  elapsed: number;
  damagePerSecond: number;
  damageType: DamageType;
  tickTimer: number;
}
```
- Stored in game state or module-level array
- `skill-effects.update()` ticks zones, applies damage to monsters inside
- Phase 8 adds rendering — for now the damage is invisible but functional

**Tier 2 — Echo Step:**
```
If flags.shadowEcho:
  - 1.5s after dash: spawn Shadow Echo
  - Echo replays the exact dash path (same start → end)
  - Echo deals flags.echoDamageMult (60%) of original arrival damage
  - Echo triggers: Stagger, Shadow Trail (if Phase Walk), knockback
  - Visual: translucent player sprite copy following the path (GameScene renders it)
  - CD override: 4.0s
```

**Echo state:**
```typescript
interface EchoState {
  active: boolean;
  delayTimer: number;
  startX: number; startY: number;
  endX: number; endY: number;
  damage: number;
  flags: Record<string, number | boolean | string>;
}
```

### 4C.5 — Files Changed

| File | Change |
|---|---|
| `src/systems/skill-effects.ts` | Refactor `handleShadowStep()` + 4 variants + Shadow Trail + Echo |
| `src/core/types.ts` | Add `nextAttackCritBonus`, `isStealthed`, `stealthTimer` to PlayerState; add `EnvironmentalZone` |
| `src/systems/monster-ai.ts` | Check `player.isStealthed` before chase/attack transitions |
| `src/core/game-state.ts` | Init new PlayerState fields |

### 4C.6 — Acceptance Criteria

1. Assassin: dash repositions behind nearest enemy; next attack has +40% crit
2. Death's Shadow: 2s stealth — enemies stop chasing; next hit is guaranteed crit
3. Momentum Dash: 240px dash; landing on enemies deals huge damage + knockback
4. Impact Wave: double pulse visible (two waves of damage numbers)
5. Phase Walk: Shadow Trail damages enemies walking through dash path
6. Echo Step: delayed second dash replays 1.5s later (damage numbers appear)

---

## Phase 5: SP Economy + Unlock Conditions

> **Ref:** SKILL_SYSTEM.md § 4 (SP Economy, Unlock Conditions)
> **Goal:** Wire SP earning from levels/bosses and implement unlock condition checking

### 5.1 — SP Earning

#### `src/systems/progression.ts` — SP on level-up

In the level-up handler (already exists for XP → level):
```typescript
// Every SP_EVERY_N_LEVELS (3) levels, grant 1 SP
if (newLevel % SP_EVERY_N_LEVELS === 0) {
  player.skillPoints += 1;
  emit('skill:spGained', { amount: 1, source: 'level' });
}
```

#### `src/systems/progression.ts` — SP on boss first-kill

In the boss-kill handler:
```typescript
// First boss kill grants 2 SP
if (!player.bossesKilled.includes(bossId)) {
  player.skillPoints += 2;
  emit('skill:spGained', { amount: 2, source: 'boss' });
}
```

#### New event:
```typescript
'skill:spGained': { amount: number; source: 'level' | 'boss' | 'codex_drop' };
```

### 5.2 — Unlock Condition Checking

#### `src/systems/skills.ts` — Add `checkUnlockCondition()`

```typescript
/**
 * Check if a skill's unlock condition is met (beyond SP cost).
 * Returns { met: boolean, reason?: string }
 */
export function checkUnlockCondition(skillId: string): { met: boolean; reason?: string } {
  const def = getSkillDef(skillId);
  if (!def) return { met: false, reason: 'Unknown skill' };

  const condition = def.unlockCondition;
  if (!condition) return { met: true }; // no condition = always available

  const player = getPlayer();

  switch (condition.type) {
    case 'level':
      if (player.level < (condition.value as number)) {
        return { met: false, reason: `Requires Level ${condition.value}` };
      }
      return { met: true };

    case 'boss':
      if (!player.bossesKilled.includes(condition.value as string)) {
        return { met: false, reason: `Requires defeating ${condition.value}` };
      }
      return { met: true };

    case 'usageCount': {
      // Format: "arcane_bolt:50" (skill:count)
      const [targetSkill, countStr] = (condition.value as string).split(':');
      const required = parseInt(countStr, 10);
      const current = player.skillUsageCounts[targetSkill] ?? 0;
      if (current < required) {
        return { met: false, reason: `Cast ${targetSkill} ${required} times (${current}/${required})` };
      }
      return { met: true };
    }

    case 'stat': {
      // Format: "magicPower:50" (stat:threshold)
      const [stat, thresholdStr] = (condition.value as string).split(':');
      const threshold = parseInt(thresholdStr, 10);
      const current = (player as Record<string, unknown>)[stat] as number ?? 0;
      if (current < threshold) {
        return { met: false, reason: `Requires ${threshold} ${stat} (${current}/${threshold})` };
      }
      return { met: true };
    }

    default:
      return { met: true };
  }
}
```

#### Update `unlockSkill()` to call `checkUnlockCondition()`

```typescript
export function unlockSkill(skillId: string): boolean {
  // ... existing checks ...

  // Check unlock condition
  const condition = checkUnlockCondition(skillId);
  if (!condition.met) return false;

  // ... rest of unlock logic ...
}
```

### 5.3 — Add `unlockCondition` to skill definitions

#### `src/data/skills.data.ts`

```typescript
// heavy_slash — starter, no condition
unlockCondition: undefined,

// arcane_bolt
unlockCondition: { type: 'level', value: 4 },

// shadow_step
unlockCondition: { type: 'usageCount', value: 'heavy_slash:10' },
// "Cast heavy_slash or arcane_bolt 10 times" — simplified to heavy_slash for now

// Passives:
// combat_rhythm: { type: 'level', value: 3 }
// arcane_recursion: { type: 'level', value: 5 }
// shadow_reflexes: { type: 'level', value: 6 }
// blood_price: { type: 'level', value: 8 }
// flow_state: { type: 'level', value: 10 }
```

### 5.4 — Files Changed

| File | Change |
|---|---|
| `src/systems/progression.ts` | SP on level-up (every 3 levels) + SP on first boss kill |
| `src/systems/skills.ts` | `checkUnlockCondition()`, update `unlockSkill()` to gate on conditions |
| `src/data/skills.data.ts` | Add `unlockCondition` to all skill definitions |
| `src/core/types.ts` | Add `skill:spGained` event |

### 5.5 — Acceptance Criteria

1. Level up from 2 → 3: +1 SP gained
2. Level up from 3 → 4: no SP (only every 3 levels)
3. Kill first boss: +2 SP
4. Kill same boss again: no SP
5. Cannot unlock arcane_bolt before level 4
6. Cannot unlock shadow_step without 10 heavy_slash casts
7. Codex (when built) shows lock reason for each gated skill

---

## Phase 6: Codex UI — COMPLETE

> **Ref:** SKILL_SYSTEM.md § 8
> **Goal:** Full skill management overlay — browse, unlock, upgrade, equip skills
> **Depends on:** Phases 3, 5
> **Status:** COMPLETE

### 6.1 — File: `src/ui/SkillCodex.ts` (NEW)

**Architecture:**
- Extends `Phaser.GameObjects.Container`
- Depth 200 (same as inventory/merchant panels)
- ScrollFactor 0 (screen-fixed)
- Toggle via `C` key (added to GameScene/UIScene input)
- Only opens when no enemies in aggro range (check `getState().monsters`)
- Pauses game time when open (`state.isPaused = true`)

**Layout (3 sections):**

```
╔══════════════════════════════════════════════════════╗
║  SKILL CODEX                    SP: [4]   [ESC]     ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  ┌─ ACTIVE SKILLS ─────────────────────────────────┐ ║
║  │ [HEAVY SLASH ★★]  [ARCANE BOLT ★☆]             │ ║
║  │ [SHADOW STEP ★☆]  [??? LVL 12]                 │ ║
║  └─────────────────────────────────────────────────┘ ║
║                                                      ║
║  ┌─ PASSIVES ──────────────────────────────────────┐ ║
║  │ [COMBAT RHYTHM ✓]  [ARCANE RECURSION]           │ ║
║  │ [SHADOW REFLEXES]  [BLOOD PRICE ✗ LVL8]        │ ║
║  │ [FLOW STATE ✗ LVL10]                           │ ║
║  └─────────────────────────────────────────────────┘ ║
║                                                      ║
║  ┌─ SELECTED: HEAVY SLASH ─────────────────────────┐ ║
║  │  Slot: [RMB]     [Equip to Q]  [Equip to E]    │ ║
║  │                                                  │ ║
║  │  [BASE] ──→ PATH A: Ravager        [1 SP]      │ ║
║  │             PATH B: Executioner     [1 SP]      │ ║
║  │             PATH C: Sunbreaker      [1 SP]      │ ║
║  │                                                  │ ║
║  │  (Select a path to see details)                  │ ║
║  │                                                  │ ║
║  │  ┌─ PATH A: RAVAGER ──────────────────────────┐ │ ║
║  │  │ "The arc becomes a wave."                   │ │ ║
║  │  │ Arc 180°, range 90px, applies 2 Bleed...   │ │ ║
║  │  │                                             │ │ ║
║  │  │          [UNLOCK — 1 SP]                    │ │ ║
║  │  └─────────────────────────────────────────────┘ │ ║
║  └──────────────────────────────────────────────────┘ ║
╚══════════════════════════════════════════════════════╝
```

### 6.2 — Interaction Flow

**Skill Card Click:**
1. Click a skill card → it becomes "selected" in the detail panel below
2. Detail panel shows: current equipped slot, upgrade tree, description
3. If skill is locked: show unlock condition + SP cost + [UNLOCK] button
4. If unlocked but no path chosen: show 3 path previews with descriptions
5. Clicking a path preview: shows detailed description + [CHOOSE] button
6. [CHOOSE] deducts SP, locks path, updates UI
7. If tier 1 chosen: show Awakening option (tier 2) below with [UNLOCK] button (2 SP)

**Equip Flow:**
1. Selected skill shows equip buttons: [RMB] [Q] [E]
2. Click an equip button → calls `skills.equipSkill(skillId, slot)`
3. Previous skill in that slot is unequipped
4. Slot 0 (LMB) is never changeable (basic_attack permanent)

**Passive Equip:**
1. Passive cards show [EQUIP] if unlocked, [UNLOCK — 1 SP] if locked
2. Equipping passive: choose slot 0 or 1
3. If both slots full: show "Swap with [Passive 1] or [Passive 2]?"

### 6.3 — Unlock Animation

When unlocking via [UNLOCK] button:
1. SP counter decrements with red flash
2. Skill card "ignites" — brief particle burst (gold sparks)
3. Chime sound (via `this.scene.sound.play('unlock_chime')`)
4. Skill name appears large for 1s, then fades

### 6.4 — First Use Celebration

On first activation of a newly unlocked skill (in GameScene, not Codex):
1. Time scale briefly reduces to 30% for 0.3s
2. Skill name appears center-screen in large gold text for 1.0s
3. First hit's damage number rendered in gold
4. Track `firstUseShown: Record<string, boolean>` in PlayerState

### 6.5 — HUD Indicator

In `src/ui/SkillBar.ts`:
- If player has unspent SP AND any skill meets unlock conditions → pulse a small diamond icon on the skill bar
- The diamond uses gold color with sine-wave alpha pulse

### 6.6 — Passive Slots Display

Add to SkillBar (below the 4 active slots):
- 2 small passive slot indicators showing equipped passive names/icons
- No cooldown overlay (passives are always-on)
- Hover shows passive description tooltip

### 6.7 — UIScene Integration

#### `src/scenes/UIScene.ts`

```typescript
// In create():
this.skillCodex = new SkillCodex(this);
this.add.existing(this.skillCodex);

// Toggle key: C
this.keyC = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.C);

// In update():
if (Phaser.Input.Keyboard.JustDown(this.keyC)) {
  this.skillCodex.toggle();
}
this.skillCodex.update(dt);
```

### 6.8 — Files Changed

| File | Change |
|---|---|
| `src/ui/SkillCodex.ts` | **NEW** — Full Codex panel (~500 lines) |
| `src/ui/SkillBar.ts` | Add SP indicator pulse, passive slot display |
| `src/scenes/UIScene.ts` | Create + toggle SkillCodex, add C key |
| `src/core/types.ts` | Add `firstUseShown: Record<string, boolean>` to PlayerState |
| `src/core/game-state.ts` | Init `firstUseShown: {}` |
| `src/scenes/GameScene.ts` | First-use celebration (time scale + gold text) |

### 6.9 — Acceptance Criteria

1. Press C → Codex opens (game pauses)
2. Codex shows all skills with locked/unlocked/upgrade status
3. Click skill → detail panel shows description + upgrade tree
4. [UNLOCK] deducts SP, plays animation
5. Path selection shows 3 options with full descriptions
6. Choosing a path locks out the other 2 (visually dimmed)
7. Equip buttons work — skill appears in correct slot on SkillBar
8. Passive equip/swap works
9. SP indicator pulses when skills are available to unlock
10. First use of a new skill triggers celebration effect

---

## Phase 7: 4-Layer Feedback + VFX + Resonance Visuals

> **Ref:** SKILL_SYSTEM.md § 2 (Resonance Display), § 9 (4-Layer Feedback Rule)
> **Goal:** Make every hit feel impactful. Add resonance motes.

### 7.1 — Layer 1: Player Animation

#### `src/entities/PlayerEntity.ts`

Add per-skill body animations:
- **Heavy Slash:** `stepForward(8px, 0.1s)` → `snapBack(0.05s)` during skill:used
- **Arcane Bolt:** `armRaise(0.1s)` → `leanBack(3px, 0.08s)` — subtle recoil
- **Shadow Step:** Speed lines / blur during dash (already partially handled)
- **Taking damage:** Stagger in direction of impact + red flash (existing `flashHit` — extend with directional knockback visual)

Implementation: Listen to `skill:used` and `player:damaged`, play tweens on player sprite.

### 7.2 — Layer 2: VFX at Impact

#### `src/entities/VFXManager.ts` — Extend

Add impact VFX methods:

```typescript
// Physical hit: slash mark at impact point
showSlashMark(x, y, angle, isCrit): void
  - Draw arc line using Graphics object
  - Fade over 0.3–0.5s
  - Crit: 50% larger, secondary ring expands outward

// Magic hit: spark burst at impact point
showSparkBurst(x, y, isCrit): void
  - Blue particles spray outward (8–12 particles)
  - Fade over 0.2s
  - Crit: larger burst, secondary ring

// Resonance release: shockwave ring
showAshburst(x, y, radius): void
  - Red ring expands from center to radius over 0.3s
  - Fades as it expands

showOverload(x, y, radius): void
  - Blue-white nova expanding from center
  - Brighter, more electric feel

// Enemy death: particle burst in enemy color
showDeathBurst(x, y, color): void
  - 15–20 particles spray outward
  - Enemy-colored
  - Rapid fade (0.3s)
```

#### Hook into events

```typescript
on('combat:damageDealt', (data) => {
  // Show impact VFX at damage location
  if (data.damageType === 'physical') {
    vfxManager.showSlashMark(data.x, data.y, player.facingAngle, data.isCrit);
  } else {
    vfxManager.showSparkBurst(data.x, data.y, data.isCrit);
  }
});

on('resonance:release', (data) => {
  if (data.type === 'ashburst') vfxManager.showAshburst(data.x, data.y, ASHBURST_RADIUS);
  else vfxManager.showOverload(data.x, data.y, OVERLOAD_RADIUS);
});

on('monster:died', (data) => {
  const monster = getMonsterById(data.monsterId);
  if (monster) vfxManager.showDeathBurst(data.x, data.y, monster.color);
});
```

### 7.3 — Layer 3: Enemy Reaction

#### `src/entities/MonsterEntity.ts` — Extend

```typescript
// On hit: push back in direction from player
knockback(fromX, fromY, distance, duration):
  - Calculate angle from (fromX, fromY) to monster
  - Tween monster position by distance in that direction over duration

// On crit: larger knockback + tilt animation
critReaction(fromX, fromY):
  - knockback(fromX, fromY, 25, 0.15)
  - Brief sprite rotation tween (tilt 10° then back)

// On stagger: stumble backward
staggerReaction(fromX, fromY):
  - knockback(fromX, fromY, 20, 0.2)
  - Brief crouch tween (scaleY: 0.85 → 1.0 over 0.2s)
```

Hook: In GameScene `on('combat:impact')` or `on('monster:damaged')`.

### 7.4 — Layer 4: Camera Response

#### `src/scenes/GameScene.ts` — Extend damage handlers

```typescript
on('combat:damageDealt', (data) => {
  if (data.damageType === 'physical' && data.isCrit) {
    this.cameras.main.shake(300, 0.005);  // strong crit shake
  }
});

on('resonance:release', (data) => {
  // Brief zoom-out then back
  this.cameras.main.zoomTo(0.95, 300, 'Sine.easeOut');
  this.time.delayedCall(300, () => {
    this.cameras.main.zoomTo(1.0, 200, 'Sine.easeIn');
  });
});

// Shadow Step arrival: camera snap (already has brief lag from follow)
// Enhance: briefly reduce camera lerp to 0 (instant snap) on dash end
```

### 7.5 — Resonance Visual Motes

#### `src/scenes/GameScene.ts` — Particle system

Create orbiting mote particles around player sprite:

```typescript
// Mote rendering (in update loop or dedicated component):
private ashMotes: Phaser.GameObjects.Graphics[] = [];
private emberMotes: Phaser.GameObjects.Graphics[] = [];

updateResonanceMotes(dt):
  const res = getPlayer().resonance;
  const px = playerEntity.sprite.x;
  const py = playerEntity.sprite.y;
  const orbitRadius = 18;

  // Ash motes (red/orange, orbit clockwise)
  for (let i = 0; i < res.ash; i++) {
    const angle = (gameTime * 2.5) + (i / res.ash) * Math.PI * 2;
    const mx = px + Math.cos(angle) * orbitRadius;
    const my = py + Math.sin(angle) * orbitRadius;
    // Draw small glowing circle (4px, crimson)
  }

  // Ember motes (blue/violet, orbit counterclockwise)
  for (let i = 0; i < res.ember; i++) {
    const angle = -(gameTime * 2.5) + (i / res.ember) * Math.PI * 2;
    const mx = px + Math.cos(angle) * orbitRadius;
    const my = py + Math.sin(angle) * orbitRadius;
    // Draw small glowing circle (4px, electric blue)
  }

  // Duality: synchronized pulse (alpha oscillation)
  if (res.dualityActive) {
    const pulse = 0.6 + 0.4 * Math.sin(gameTime * 6);
    // Apply pulse alpha to all motes
  }

  // At max (5): motes spin faster (multiply speed by 1.5)
  // Motes fly toward target on release (tween motes to release point, then destroy)
```

### 7.6 — Files Changed

| File | Change |
|---|---|
| `src/entities/VFXManager.ts` | Add impact VFX methods (slash, spark, shockwave, death burst) |
| `src/entities/MonsterEntity.ts` | Add knockback, critReaction, staggerReaction |
| `src/entities/PlayerEntity.ts` | Add per-skill body animations |
| `src/scenes/GameScene.ts` | Camera effects, resonance motes, VFX event hooks |

### 7.7 — Acceptance Criteria

1. Every physical hit shows a white/orange slash mark at impact point
2. Every magic hit shows blue spark burst
3. Crits are visibly larger with secondary ring
4. Enemies visibly pushed back on hit (stronger on crit)
5. Camera shakes on physical crits, zooms on Resonance release
6. Red motes orbit player matching Ash charge count (1–5)
7. Blue motes orbit player matching Ember charge count (1–5)
8. Motes pulse when Duality is active
9. Motes fly to target on Ashburst/Overload release

---

## Phase 8: Environmental States

> **Ref:** SKILL_SYSTEM.md § 3.3
> **Goal:** Ground zones that persist and affect enemies
> **Depends on:** Phase 4C (Shadow Trail is a Phase Walk upgrade)

### 8.1 — Environmental Zone System

#### `src/systems/skill-effects.ts` — Zone management

```typescript
// Module-level array
const environmentalZones: EnvironmentalZone[] = [];

function createZone(zone: EnvironmentalZone): void {
  environmentalZones.push(zone);
  emit('environment:zoneCreated', { id: zone.id, type: zone.type, ... });
}

// In update():
function updateEnvironmentalZones(dt: number): void {
  for (let i = environmentalZones.length - 1; i >= 0; i--) {
    const zone = environmentalZones[i];
    zone.elapsed += dt;

    if (zone.elapsed >= zone.duration) {
      environmentalZones.splice(i, 1);
      emit('environment:zoneExpired', { id: zone.id });
      continue;
    }

    // Tick damage
    zone.tickTimer -= dt;
    if (zone.tickTimer <= 0) {
      zone.tickTimer = 1.0; // 1s tick

      // Find monsters inside zone
      const monsters = findMonstersInZone(zone);
      for (const monster of monsters) {
        applyDamageToMonster(monster.id, zone.damagePerSecond, zone.damageType, 1.0, { source: 'environment' });

        // Aftershock Zone: apply Sundered + slow
        if (zone.type === 'aftershock') {
          applyEnemyStateLocal(monster.id, 'sundered', 1.0, 1); // refreshes while inside
        }
      }
    }
  }
}

function findMonstersInZone(zone: EnvironmentalZone): MonsterInstance[] {
  if (zone.type === 'shadow_trail') {
    // Line collision: check if monster is within zone.width of the line from start to end
    return findMonstersNearLine(zone.startX, zone.startY, zone.endX, zone.endY, zone.width);
  } else {
    // Circle: centered on (startX, startY) with radius
    return findMonstersInCircle(zone.startX, zone.startY, zone.radius ?? 80);
  }
}
```

### 8.2 — Rendering

#### `src/scenes/GameScene.ts`

```typescript
on('environment:zoneCreated', (data) => {
  // Create visual for zone
  if (data.type === 'shadow_trail') {
    // Dark wispy line from start to end, fading over duration
  } else if (data.type === 'aftershock') {
    // Cracked ground circle, occasional tremor particles
  }
});

on('environment:zoneExpired', (data) => {
  // Destroy zone visual
});
```

### 8.3 — New Events

```typescript
'environment:zoneCreated': { id: string; type: string; x: number; y: number; duration: number };
'environment:zoneExpired': { id: string };
```

### 8.4 — Files Changed

| File | Change |
|---|---|
| `src/systems/skill-effects.ts` | Zone management (create, tick, expire, damage) |
| `src/core/types.ts` | `EnvironmentalZone` interface, new events |
| `src/scenes/GameScene.ts` | Zone rendering (trail line, aftershock circle) |

### 8.5 — Acceptance Criteria

1. Shadow Step (Phase Walk) leaves visible dark trail behind
2. Trail damages enemies walking through it (visible damage numbers)
3. Trail fades after 2 seconds
4. Overlapping trails stack damage
5. Aftershock Zone (when Ground Slam is added) applies Sundered + slow to enemies inside

---

## Cross-Phase Dependencies Graph

```
Phase 1 (DONE)
    │
    ├── Phase 2 (State Polish + Passives) ─── standalone
    │
    ├── Phase 3 (Fork Data Architecture) ─── standalone
    │       │
    │       ├── Phase 4A (Heavy Slash Forks)
    │       ├── Phase 4B (Arcane Bolt Forks)
    │       └── Phase 4C (Shadow Step Forks) ──→ Phase 8 (Environmental States)
    │       │
    │       └── Phase 5 (SP Economy + Unlock Conditions)
    │               │
    │               └── Phase 6 (Codex UI)
    │
    └── Phase 7 (4-Layer Feedback + VFX + Motes) ─── standalone
```

Recommended session order: **2 → 3 → 4A → 4B → 4C → 5 → 6 → 7 → 8**

Phase 7 can be done at any point after Phase 1 (it only depends on the events already emitted). Phase 2 is also independent. If you want visual impact early, do 7 before the fork phases.
