# Ashen Grace — Skill System Design Document

> **Status:** Design spec — approved for implementation.
> **Scope:** Complete replacement of the interim skill/passive data. Start clean with 3 fully realized skills and the full mechanical foundation.

---

## Table of Contents

1. [Vision & Philosophy](#1-vision--philosophy)
2. [The Resonance System](#2-the-resonance-system)
3. [The State System](#3-the-state-system)
4. [Skill Architecture — Slots, SP, Unlocks](#4-skill-architecture--slots-sp-unlocks)
5. [Skill Upgrade Forks](#5-skill-upgrade-forks)
6. [The Three Base Skills — Full Specs](#6-the-three-base-skills--full-specs)
7. [Passive Skills — Design Philosophy & Roster](#7-passive-skills--design-philosophy--roster)
8. [The Codex — Skill Management UI](#8-the-codex--skill-management-ui)
9. [The 4-Layer Feedback Rule](#9-the-4-layer-feedback-rule)
10. [Future Skill Roadmap](#10-future-skill-roadmap)
11. [Technical Implementation Notes](#11-technical-implementation-notes)
12. [What Gets Deleted & What Gets Kept](#12-what-gets-deleted--what-gets-kept)

---

## 1. Vision & Philosophy

### The Core Principle

> **Skills define how you fight, not how hard you hit.**

The number on a damage skill matters far less than:
- *When* it creates an opening for your next action
- *What state* it leaves the enemy in
- *How it feels* when it lands

Every skill in Ashen Grace should answer the question: **"What does this change about the fight?"** If the answer is only "it does damage," the skill needs a redesign.

### Industry Lessons Applied

**From Diablo 4:** Upgrade forks. The same skill, at upgrade tier 2, forks into meaningfully different behavioral paths. A player using Path A and a player using Path B of the same skill should feel like they're playing different characters. The base skill is the chassis; the upgrade path is the engine.

**From Path of Exile:** Modifying *how* a skill works is more interesting than scaling *how much* damage it deals. We won't be adding Support Gems (too opaque), but the upgrade fork system achieves the same behavioral transformation in a far more readable way.

**From Last Epoch:** Skills grow alongside you. The skill tree for a single skill reveals itself over time — a player at level 1 shouldn't be able to immediately see every node of their tier-3 awakening. Unlocking new upgrade tiers should feel like the skill itself is evolving, not just getting a stat boost.

**From Ashen Grace itself:** We are a **spatial 2D top-down action game**. This means:
- Position matters: flanking, AoE grouping, maintaining range all affect outcomes
- Movement is a skill vector: the dash isn't just escape — it's the setup for the next strike
- Combos are spatial: you position yourself to create multi-hit situations, not just press a sequence

### The Three Design Pillars

**1. Readable Momentum**
At any moment, a player should be able to glance at their character and understand their combat state: How much Resonance is built? Is the player in Flow? Are enemies Sundered? This information must be *visible in the world*, not hidden in a status list.

**2. Reactive Combos, Not Scripted Chains**
We will never force the player to press A → B → C in sequence. Instead, we create *states* (on enemies, on the player, on the environment) and let skills interact with those states for bonuses. The combo emerges from the player's own discovery: "I noticed that when I slash first and then bolt, it crits." That's a better discovery than "the tutorial told me to press Q then E."

**3. Build Identity is Visible**
Two different players watching each other should be able to recognize different builds just from the VFX patterns. The Resonance motes orbiting the player, the color of skill impacts, the timing patterns — all of this communicates "this person is playing a physical brawler" or "this is a chaos mage."

---

## 2. The Resonance System

### What It Is

Resonance is the momentum engine of Ashen Grace combat. It is the primary *visual* indicator of how the player is performing in a fight, and the primary *mechanical* payoff for sustained aggression.

There are two types of Resonance:

| Type | Source | Visual | Max Charges | Color |
|---|---|---|---|---|
| **Ash** | Physical damage dealt | Red motes orbiting player | 5 | Crimson / ember orange |
| **Ember** | Magic damage dealt | Blue motes orbiting player | 5 | Electric blue / violet |

### Building Charges

- Every **hit** that deals physical damage generates +1 Ash charge
- Every **hit** that deals magic damage generates +1 Ember charge
- Multi-hit skills (e.g., Arrow Barrage in future) can generate +1 per projectile, but capped at +2 per skill cast to prevent instant maxing
- Status effect *ticks* do **NOT** generate Resonance — only direct hits
- Charges **decay** 5 seconds after the last hit that generated them (a combat lull resets the stack)

### Releasing Charges — The "Release" mechanic

When a charge reaches maximum (5), the **next cast of any skill in that element** automatically triggers a **Resonance Release**:

| Element | Release Name | Effect | Cost |
|---|---|---|---|
| **5× Ash** | **Ashburst** | Shockwave centered on impact point — 80px radius, deals 30% of hit damage as bonus physical AoE, applies Knockback to all hit enemies | Consumes all 5 Ash charges |
| **5× Ember** | **Overload** | Impact point explodes in a 70px magic nova — deals 40% of hit damage as magic AoE, applies Charged state to all hit enemies | Consumes all 5 Ember charges |

- The Release fires **automatically** — the player doesn't press anything extra
- The visual is distinct: the orbiting motes fly toward the target and detonate on impact
- The audio is distinct: a satisfying crack/burst sound layered on top of the normal hit sound

### Hybrid Resonance — "Duality"

A player who deals both physical and magic damage can maintain **both** Ash and Ember simultaneously. If you reach 3 Ash + 3 Ember at the same time, the character enters a **Duality** state:

- Duality state persists as long as both Ash ≥ 3 and Ember ≥ 3
- In Duality: all damage dealt is increased by **+15%**
- In Duality: the orbiting motes blend in color (red-blue swirl effect)
- Breaking either stack below 3 exits Duality
- Duality does NOT trigger Ashburst/Overload — those require hitting 5 of one type

This rewards hybrid builds with a sustained bonus rather than a burst one. Hybrid builds don't spike as hard as pure builds (which can chain releases), but they maintain their bonus longer.

### Resonance Display

- Motes orbit the player sprite in a tight circle (radius ~18px)
- Each mote is a small glowing particle (about 4px)
- At 1 charge: 1 mote. At 5 charges: 5 motes evenly spaced.
- The motes pulse gently when Duality is active (synchronized pulse)
- At max charge (ready to release): motes spin faster and glow brighter
- Death resets all Resonance charges to 0

---

## 3. The State System

States are temporary conditions that exist on enemies, on the player, or on the environment. They are the "language" of the combo system. No state requires the player to do anything special — they arise naturally from playing well.

### 3.1 Enemy States

Enemy states are applied by your skills and create windows of vulnerability.

---

#### `Sundered`
- **Applied by:** Heavy Slash (base) and future physical melee skills
- **Visual:** Cracked-stone pattern overlay on enemy sprite; small dust particles fall from enemy
- **Duration:** 6 seconds
- **Effect:** Enemy's effective defense is reduced by **20%** while Sundered
- **Stack behavior:** Re-applying Sundered refreshes the duration (does not stack to deeper reduction)
- **Interaction:** Certain upgrade paths (Sunbreaker) can deepen this further or cause explosions on re-Sunder
- **Decay visual:** Cracks fade out as duration expires

---

#### `Charged`
- **Applied by:** Arcane Bolt (base) and future magic projectile skills
- **Visual:** Crackling electricity arcs around the enemy; small blue sparks orbit them
- **Duration:** 5 seconds
- **Effect:** Enemy's effective magic resist is reduced by **20%** while Charged
- **Stack behavior:** Each additional Charged application adds +5% magic resist reduction (max 3 stacks = 30% total). Duration refreshes on each stack.
- **Interaction:** Overload release (5 Ember) applies Charged to ALL nearby enemies, setting up mass chain combos
- **Decay visual:** Sparks slow and disappear as duration expires

---

#### `Staggered`
- **Applied by:** Certain upgrade paths, Shield Bash (future), high-damage crits (optional passive)
- **Visual:** Enemy sprite tilts/staggers — brief stumble animation (0.4s)
- **Duration:** 0.4 seconds (very brief — it's a window, not a debuff)
- **Effect:** The next attack during Stagger is a **guaranteed critical hit**
- **Stack behavior:** Does not stack. If already Staggered, a new application refreshes the window.
- **Design note:** Stagger is the "moment of power" — it's brief enough to require reaction from the player. Slowing the game down or giving a strong audio cue when Stagger is applied is important.

---

#### `Burning` / `Bleeding` / `Poisoned` / `Slowed` / `Frozen`
These are the existing status effects from the status-effects system. They are separate from the State system above, but can interact with it:
- A Sundered enemy that is also Bleeding: the Bleed ticks do NOT benefit from Sundered (only direct hits do)
- A Charged enemy that is also Burning: magic damage against them benefits from both Charged AND the Burn stacks (Burn's magic damage benefits from Charged mitigation reduction)
- Future passive skills can be built around these cross-state interactions

---

### 3.2 Player States

Player states are triggered by conditions during combat and provide short windows of empowerment.

---

#### `Flow`
- **Trigger:** Land 4 consecutive hits without taking damage
- **Visual:** Player sprite gets a subtle warm glow (amber pulse); "FLOW" text briefly appears above player (small, not intrusive)
- **Duration:** Persists as long as the player doesn't take a hit. Resets on any damage taken.
- **Effect:**
  - Move speed +8%
  - Attack speed +8%
  - Resonance charge generation +1 on every other hit (effectively 1.5x charge rate)
- **Design note:** Flow should feel like "getting into the rhythm." The visual is intentionally subtle — it shouldn't be a big flashing screen effect. Players discover they're in Flow because their character moves a little smoother, not because a UI element shouts at them.

---

#### `Wrath`
- **Trigger:** Player HP drops below 35%
- **Visual:** Screen edges pulse red briefly; player sprite briefly flashes red; the orbiting Ash motes (if any) glow brighter
- **Duration:** Lasts until player is healed above 35% HP
- **Effect:**
  - All damage dealt +20%
  - Ash Resonance generation rate doubles (every physical hit gives +2 Ash)
  - Ember Resonance generation is HALVED (the rage suppresses magic focus)
- **Design note:** Wrath pushes players toward desperate aggression when low on health. It creates interesting tension: do you heal out of Wrath and lose the damage bonus, or stay in the danger zone? Naturally pairs with passive skills that reward low-HP play.

---

#### `Primed`
- **Trigger:** Successfully casting any buff-type skill (flurry, overcharge, etc.)
- **Visual:** Player briefly pulses with a white highlight on cast; no persistent visual (it's meant to be subtle)
- **Duration:** 8 seconds or until the next damaging skill cast
- **Effect:** The next damaging skill cast deals +25% damage and generates double Resonance charges from that one hit
- **Design note:** Primed is the "set up your combo" state. It encourages a natural buff → attack rotation. It doesn't help you if you only use damage skills back-to-back.

---

### 3.3 Environmental States

Applied to the ground/area, not entities.

---

#### `Aftershock Zone`
- **Applied by:** Ground Slam (future), heavy AoE landings
- **Visual:** Cracked ground texture radiating outward from impact point, with occasional small tremors
- **Duration:** 4 seconds
- **Effect:** Enemies standing in the zone have their movement speed reduced by 20% and are afflicted with Sundered as long as they remain in the zone
- **Size:** 80px radius (matches Ground Slam AoE)

---

#### `Shadow Trail`
- **Applied by:** Shadow Step (upgrade path C)
- **Visual:** A dark wispy trail left at the start of the dash, fading after 2 seconds
- **Duration:** 2 seconds
- **Effect:** Enemies that walk through the trail take 15% of the player's attack as physical damage per second while inside it
- **Size:** Line shape, 16px wide, full dash length

---

## 4. Skill Architecture — Slots, SP, Unlocks

### Slot Layout

```
Active Skills:   [LMB] [RMB] [Q] [E]       ← 4 active skill slots
Passive Skills:  [passive 1] [passive 2]     ← 2 passive slots
```

- `basic_attack` occupies LMB permanently — it cannot be swapped out
- RMB, Q, E are free slots for player-chosen active skills
- Passive slots accept any unlocked passive skill
- Swapping skills is allowed freely **outside of combat** (no enemies in aggro range)
- Swapping during combat is not allowed (the Codex UI closes if an enemy is within aggro range)

### Skill Points (SP) Economy

| Source | SP Gained |
|---|---|
| Every 3 levels | +1 SP |
| Defeating a zone boss (first time only) | +2 SP |
| Finding a rare "Ashen Codex" item drop | +1 SP |

At level 50: ~17 SP from levels + 6 from bosses = **~23 SP** available
At level 100: ~33 SP from levels + 10 from bosses = **~43 SP** available

**SP Costs:**

| Action | Cost |
|---|---|
| Unlock a skill | 1 SP |
| Unlock Tier 1 upgrade (+ choose fork path) | 1 SP |
| Unlock Tier 2 awakening (major transformation) | 2 SP |

**Total to fully invest in ONE skill:** 1 (unlock) + 1 (tier 1) + 2 (tier 2) = **4 SP**

With ~23 SP at mid-game:
- You can fully invest in 3 skills (12 SP) and have 11 SP left for 4 more half-invested skills
- Or: fully invest in 5 skills (20 SP) with 3 SP for two more unlocks
- Or: max 2 skills (8 SP), half-invest 8 more (8 SP), plus 7 spare

This creates meaningful choices. You cannot max everything.

**Respec:** Free outside of combat, but limited to **3 full respecs per game session**. This encourages experimentation but discourages mindlessly swapping builds mid-run.

### Unlock Conditions

Skills are not just SP-gated. Each skill has an **unlock condition** in addition to the SP cost. This makes the unlock feel *earned* rather than purchased.

| Condition Type | Example | Design Intent |
|---|---|---|
| **Level gate** | "Requires Level 5" | Pacing — complexity introduced gradually |
| **Boss kill** | "Requires defeating the Iron Wraith" | Progression milestone reward |
| **Usage count** | "Cast Arcane Bolt 50 times" | Mastery of a prerequisite |
| **Stat threshold** | "Requires 50 total Magic Power" | Build commitment gate |
| **Discovery** | "Found in the Verdant Ruins chest" | World exploration reward |

The **three base skills** have simple level gates. More exotic future skills use boss kills and discovery conditions.

---

## 5. Skill Upgrade Forks

### Fork Architecture

Every active skill follows this upgrade tree:

```
[Base Skill] — 1 SP to unlock
      |
      ├── Path A: [Name] — 1 SP (choose one, locked out of B/C)
      |      └── [Awakening A] — 2 SP
      |
      ├── Path B: [Name] — 1 SP
      |      └── [Awakening B] — 2 SP
      |
      └── Path C: [Name] — 1 SP
             └── [Awakening C] — 2 SP
```

**Rules:**
- Choosing a Path locks out the other two Paths permanently (unless you respec)
- Path choice is visible in the Codex before committing — full description and stat preview available
- The Awakening is the most transformative upgrade — it changes the skill's visual, sound, or fundamental behavior
- You can use the base skill without any upgrades indefinitely

### What Good Fork Choices Look Like

A fork is **good** if:
1. Both options are clearly better than the base (not traps)
2. Both options serve a different kind of player (a fan of the same skill can feel torn)
3. The two options are mutually exclusive in build logic (a build that takes Path A wouldn't want Path B anyway)

A fork is **bad** if:
1. One option is obviously stronger than others (noob trap)
2. Both options just increase the same damage number by different amounts
3. A player could use both simultaneously with no downside

---

## 6. The Three Base Skills — Full Specs

### 6.1 `heavy_slash`

**Identity:** Physical melee opener. The fundamental act of committed aggression. It rewards players who get close, time their position, and commit to an arc.

**Unlock:** Level 1 (starting skill) — free, no SP required

**Base Stats (no upgrades):**

| Stat | Value |
|---|---|
| Damage | 1.8× player.attack |
| Damage Type | Physical |
| Cooldown | 5.0s |
| Energy Cost | 18 |
| Hit Shape | Arc — 120° wide, 70px range |
| Ash Resonance generated | +1 per enemy hit (max +2 per cast) |
| Enemy State Applied | Sundered (6s) on every hit |

**Feel & Animation:**
- Player takes a sharp step forward during the swing (brief translation forward, ~8px over 0.1s)
- Arc VFX: a white/orange slash mark that lingers 0.3s on the ground at the impact zone
- Hit enemies flash white briefly and get pushed back 15px
- Screen: 200ms of mild camera shake (magnitude 2px) on each hit, stronger (magnitude 4px) on crit
- Sound: a heavy thud/crack — not metallic, more like a heavy impact — with a brief "whoosh" in the windup

**Upgrade Fork:**

---

**PATH A — RAVAGER** (1 SP)
> *"The arc becomes a wave. You don't fight one enemy — you fight the whole room."*

- Arc width increased to **180°** (from 120°)
- Range increased to **90px** (from 70px)
- Each hit now applies **2 Bleed stacks** instead of triggering Sundered
- Cooldown reduced to **4.5s**
- Move speed during cast animation increased by 20% (player feels more fluid while slashing)

**Awakening A — HEMORRHAGE** (2 SP)
> *"The slash opens wounds that refuse to close."*

- Heavy Slash now hits enemies **twice** with a 0.2s delay between impacts (same arc, second hit does 60% of normal damage)
- Both hits apply Bleed stacks — the second impact can proc Bleed on top of the first's stack
- Ash Resonance: now generates +2 per enemy hit (first hit) and +1 per enemy hit (second hit)
- Visual: second hit VFX is a deeper red, leaving a blood-red ground mark that persists 0.6s
- This path is for: **DoT/Bleed specialists, AoE clear builds, aggressive frontliners**

---

**PATH B — EXECUTIONER** (1 SP)
> *"Mercy is wasted on the dying."*

- Sundered now applies for **10 seconds** (from 6s) — gives more time to exploit the vulnerability
- Damage against enemies **below 50% HP** is increased by **+30%**
- Damage against enemies **below 25% HP** is increased by **+60%** (stacks with the 50% bonus)
- Critical strike chance increased by **+8%** on this skill specifically
- The arc visual changes color: orange-red tint at 50%, deep crimson at 25%

**Awakening B — COUP DE GRÂCE** (2 SP)
> *"One hit. One death."*

- If the killing blow on any enemy is from Heavy Slash, it triggers an **Execution Burst**: a physical AoE explosion at the kill point (60px radius, deals 1.0× player.attack to all enemies in range)
- The Execution Burst generates **2 Ash charges** regardless of how many enemies it hits
- Execution Burst has a distinct visual: a shockwave ring radiating outward from the fallen enemy, same crimson color
- Killing with Heavy Slash while Sundered is active causes the burst to be 50% larger (90px radius)
- This path is for: **Boss killers, burst damage, assassination builds, players who want satisfying kills**

---

**PATH C — SUNBREAKER** (1 SP)
> *"Shatter their defense, then shatter everything."*

- Heavy Slash now applies **Sunder Stacks** instead of Sundered (each hit adds 1 Sunder Stack, max 3)
- 1 Sunder Stack: -10% defense. 2 Stacks: -20%. 3 Stacks: -30% + enemy is fully Sundered
- When a FULLY SUNDERED enemy is struck by Heavy Slash again: **Sundered Detonation** — triggers an AoE shockwave (70px radius) dealing 0.6× player.attack physical damage to all nearby enemies. Clears all Sunder Stacks.
- Cooldown reduced to **4.0s** to enable faster Sunder stack buildup
- Visual: each Sunder Stack appears as a deeper crack on the enemy sprite. At 3 stacks, enemy visibly radiates yellow fracture light before detonation.

**Awakening C — CATACLYSM** (2 SP)
> *"When the wall falls, everything behind it falls too."*

- Sundered Detonation now **chains**: the shockwave applies 1 Sunder Stack to all enemies it hits
- This means a Sundered Detonation in a group can immediately begin Sunder Stack buildup on surrounding enemies
- Detonation shockwave grows by 30% for each Ash Resonance charge held when it fires (max 40% larger at 5 charges, consuming all charges)
- The chain detonation has a distinct visual: shockwave rings ripple outward in sequence, each one slightly delayed (0.1s) for a cascade feel
- This path is for: **AoE setup specialists, pack-clearing builds, Resonance-focused builds**

---

### 6.2 `arcane_bolt`

**Identity:** Magic ranged finisher. Fast, homing, and punishing on vulnerable enemies. Rewards players who understand range and enemy states. The magic complement to Heavy Slash — together they define the core combo language.

**Unlock:** Level 4 (first unlock choice). Cost: 1 SP. Condition: Reach Level 4.

**Base Stats (no upgrades):**

| Stat | Value |
|---|---|
| Damage | 1.6× player.magicPower |
| Damage Type | Magic |
| Cooldown | 3.0s |
| Energy Cost | 15 |
| Projectile Speed | 420px/s |
| Max Range | 600px |
| Hit Shape | Projectile — single target |
| Ember Resonance generated | +1 on hit |
| Enemy State Applied | Charged (one stack) on hit |
| Homing | Finds nearest enemy in 600px at cast, homes on cast-time target |

**Feel & Animation:**
- Cast animation: brief hand-raise (0.1s windup) — player sprite arm extends toward cursor
- Projectile: glowing electric-blue sphere, 8px, trailing light sparks
- Impact: small burst explosion (25px radius flash) at hit point, lasts 0.2s
- Hit enemy: blue electric flash, slight stagger backward (10px)
- Screen: no shake on base Arcane Bolt (it's a precise skill — screen shake would feel wrong)
- Sound: high-pitched "crack" on impact — more like a sharp zap than a heavy blow. Very satisfying and light.

**Combo Interaction (without upgrades):**
- Arcane Bolt on a **Sundered** enemy: the bolt crackles differently (visual only) — no mechanical bonus at base level (that comes from upgrades)
- Arcane Bolt on a **Charged** enemy (already hit once by Arcane Bolt): deals +15% magic damage (the Charged state benefits all magic hits including its own refreshes)
- This creates a natural loop: hit once → Charged → hit again for +15% — the skill combos with *itself* at no upgrade cost

**Upgrade Fork:**

---

**PATH A — SEEKER** (1 SP)
> *"The bolt doesn't miss. It finds."*

- Homing now persists for the full flight duration (real-time tracking, not just initial direction lock)
- On impact, the bolt **chains** to the nearest other enemy within 200px for 50% of the damage
- The chained hit also applies Charged to the secondary target
- Cooldown reduced to **2.5s**
- Visual: the secondary chain shows as a lightning arc connecting the two targets

**Awakening A — THUNDERCHAIN** (2 SP)
> *"One bolt. Four deaths."*

- Chain now bounces up to **3 times total** (primary hit + 3 chains), each chain doing 50% of the previous hit's damage
- Each chained target gets the Charged state applied
- If a chain hits a target that is already at maximum Charged stacks (3), it triggers an **Overload Burst**: small magic AoE (50px radius) centered on that target
- The visual becomes increasingly dramatic: first chain is a thin arc, second is wider with sparks, third is a full lightning crack
- This path is for: **Magic AoE builds, multi-target specialists, chain-reaction gameplay**

---

**PATH B — OVERLOAD** (1 SP)
> *"Charge them up. Then watch them pop."*

- Arcane Bolt now applies Charged stacks **twice** per hit (instead of once), reaching max stack (3) in 2 hits instead of 3
- At **3 Charged stacks** on an enemy, the next magic hit (from ANY source) triggers **Discharge**: an AoE magic explosion (80px radius) centered on the target — deals 1.4× player.magicPower damage, clears all Charged stacks
- Discharge is an **automatic trigger** — the player doesn't have to do anything special; once Charged is maxed, the next hit fires it
- Visual: enemy at 3 Charged stacks crackles violently and radiates blue light — a clear visual cue that Discharge is ready
- Sound: a distinctive "charging up" tone as stacks build, a sharp crack-boom on Discharge

**Awakening B — CRITICAL MASS** (2 SP)
> *"When it blows, everything in the room knows."*

- Discharge radius increased to **130px** (from 80px)
- Discharge now applies Charged (1 stack) to all enemies hit by the explosion — immediately setting up follow-up chains
- If the explosion hits 3 or more enemies, the player gains a **Primed** state immediately
- Ember Resonance: Discharge generates **3 Ember charges** instantly (regardless of how many enemies it hits)
- Visual: Discharge explosion now has a secondary ring pulse after the initial burst (like a shockwave ring 0.3s after the initial flash)
- This path is for: **Setup/combo specialists, Resonance-focused magic builds, players who love chain explosions**

---

**PATH C — UNSTABLE BOLT** (1 SP)
> *"It wasn't designed to be controlled."*

- Arcane Bolt is now **piercing** — it passes through enemies, potentially hitting multiple in a line
- Piercing hits still apply Charged to each enemy hit
- Projectile speed increased to **600px/s** (faster, harder to track visually — feels reckless)
- On a piercing hit of **3+ enemies in one shot**, the bolt **explodes** at the 3rd enemy: AoE burst (60px radius) for 50% bonus magic damage
- The projectile changes visual: it's now jagged, less perfect — a crackling unstable arc rather than a clean sphere

**Awakening C — CHAIN REACTION** (2 SP)
> *"Once it starts, there's no stopping it."*

- Every piercing hit adds 15% damage to subsequent hits by the same bolt (stacks multiplicatively: 1st hit 100%, 2nd 115%, 3rd 132%, etc.)
- When the bolt expires (travels full distance or hits a wall), it **detonates at the endpoint**: AoE based on accumulated momentum (more piercing hits = larger explosion, capped at 140px for 5+ hits)
- If any of the pierced enemies were Sundered, the detonation deals **hybrid damage** (50% physical + 50% magic), benefiting from both the Sundered and the player's armorPen
- This path is for: **AoE line specialists, hybrid damage builds, physics-style "setup the shot" gameplay**

---

### 6.3 `shadow_step`

**Identity:** The movement skill. It is NOT a damage skill with movement attached — it is a movement skill with damage attached. Its primary value is repositioning; the damage is a bonus for positioning well.

**Unlock:** Level 7. Cost: 1 SP. Condition: Reach Level 7 AND cast at least one of `heavy_slash` or `arcane_bolt` 10 times.
> *Design intent: The player should have committed to a combat identity before unlocking movement. Shadow Step amplifies an existing style.*

**Base Stats (no upgrades):**

| Stat | Value |
|---|---|
| Dash Distance | 160px |
| Invulnerability Window | 0.25s during dash |
| Cooldown | 6.0s |
| Energy Cost | 16 |
| Arrival Damage | 0.5× player.attack, physical, 40px radius circle at landing point |
| Resonance generated | +1 Ash from arrival damage (only if at least one enemy is hit) |
| Enemy State Applied | Staggered (0.4s window) on any enemy hit by arrival damage |

**Feel & Animation:**
- Departure: player sprite briefly trails a dark blur (afterimage at origin, fades in 0.5s)
- Travel: player moves rapidly in direction — not teleport, but very fast movement (~900px/s implied by dash distance and duration)
- Arrival: brief explosion of dark particles at landing point
- Arrival damage: enemies nearby get pushed back 12px + Staggered
- Sound: departure is a soft "whoosh" + brief silence during travel + a sharp "thud" on arrival
- Screen: very brief camera "snap" toward landing point on arrival (not a shake — more like a quick camera reset to feel grounded)

**Design note on cooldown:** 6s feels right for a movement skill. Long enough that it's a decision, short enough that the player can chain it into their rotation every other "round" of combat. The invulnerability window is what makes this precious — it's not just travel, it's a brief "can't be hurt" moment.

**Upgrade Fork:**

---

**PATH A — ASSASSIN** (1 SP)
> *"Strike before they know you're there."*

- Shadow Step now **places the player behind the target** rather than at the cursor position (if an enemy is within 120px of cursor position, the dash endpoint is auto-adjusted to the enemy's rear)
- Arriving behind an enemy grants +40% critical strike chance on the **very next attack** (any skill, not just Shadow Step's arrival damage)
- Arrival damage increased to **0.8× player.attack**
- The Stagger window extended to **0.6s** when arriving from behind
- Visual: arrival from behind has a different VFX — the shadow burst trails behind the enemy, framing the arrival dramatically

**Awakening A — DEATH'S SHADOW** (2 SP)
> *"You vanish. They never see it coming."*

- For 2 seconds after the dash, the player is **semi-invisible** to enemies (enemies deaggro, ranged enemies stop firing) — a brief stealth window
- During stealth, the player's next damaging skill is treated as a guaranteed crit AND applies all on-hit status effects (even if % chance would normally miss)
- Stealth breaks on any damage dealt or received
- If Shadow Step is used again before the cooldown ends (impossible at base, but possible with CDR), this activates instantly without the 2s stealth window
- Visual: player sprite is at 40% opacity during stealth; enemies briefly show a "?" above their heads
- This path is for: **Crit burst builds, assassination gameplay, burst-and-reposition specialists**

---

**PATH B — MOMENTUM DASH** (1 SP)
> *"The destination is the weapon."*

- Dash distance increased to **240px** (from 160px)
- Arrival damage increases with dash distance traveled: every 40px of dash = +15% arrival damage (base 160px = 1.6x bonus on top of 0.5x base = up to 0.8x at 160px)
- Arrival AoE radius increased to **70px** (from 40px)
- The knockback on arrival is significantly stronger: enemies hit are launched **30px** (from 12px) — enough to separate groups
- Cooldown reduced to **5.0s**

**Awakening B — IMPACT WAVE** (2 SP)
> *"You don't just land. You erupt."*

- On arrival, the shockwave **bounces enemies** upward in physics terms — they are considered airborne for 0.5s (cannot be hit by ground-level AoE, but can be hit by any skill — purely visual/flavor)
- Arrival AoE now pulses **twice**: initial shockwave (70px), then a follow-up ripple 0.3s later (100px) at 50% damage
- Stagger now applies to ALL enemies hit by the initial wave (not just 1)
- Ash Resonance: arrival generates +2 Ash (from +1) per hit enemy
- Visual: dual-ring shockwave, first ring white/gray, second ring deep red
- This path is for: **Physical AoE builds, knockback specialists, Resonance builders**

---

**PATH C — PHASE WALK** (1 SP)
> *"The shadow lingers where you left."*

- Shadow Step now leaves a **Shadow Trail** at the origin point — a persistent zone (2s duration, 16px wide, full dash length) that deals 20% of player.attack per second to enemies walking through it
- Cooldown reduced to **4.5s** (rewarding utility use)
- If the player dashes through an enemy (target in path of dash): that enemy is automatically **Staggered**
- Shadow Trail stacks: if you dash twice (via CDR), a second trail overlaps and the damage field stacks (40% per second in the overlap zone)

**Awakening C — ECHO STEP** (2 SP)
> *"Some shadows refuse to fade."*

- 1.5 seconds after the dash, a **Shadow Echo** appears at the origin point and dashes through the same path again, dealing 60% of the original arrival damage
- The Echo triggers all on-arrival effects (Stagger, Shadow Trail, knockback) independently
- The Echo cannot be controlled — it always follows the exact original dash path
- If the player is still alive when the Echo arrives, the Echo's damage is added to the player's combo meter (for combo_artist passive purposes)
- Cooldown reduced to **4.0s**
- Visual: the Echo is a translucent dark version of the player sprite, slightly delayed, visible for the full dash animation
- This path is for: **Sustained DPS builds, combo artists, players who love ability interactions**

---

## 7. Passive Skills — Design Philosophy & Roster

### Design Philosophy

Each passive skill should answer a single question: **"What kind of fighter are you?"** A passive is not a flat bonus — it's a declaration of playstyle.

**Rules for passives:**
1. Each passive must be clearly intended for a specific archetype (not universally good for everyone)
2. Each passive should interact with at least one of the 3 base skills naturally
3. Passives should be reactive (trigger on events) not static (always-on % bonus) where possible
4. A passive that is "always on" and gives flat stats should be a candidate for removal — that belongs in items

**Slot Layout:** 2 passive slots. You can equip any 2 unlocked passives.

**Unlock:** All passives are unlocked with SP (same fork-free 1 SP unlock). Passives do NOT have upgrade tiers (they are binary — equipped or not). Future expansion could add passive upgrades.

### Passive Roster (Initial — 5 passives for the clean start)

---

#### `Combat Rhythm`
*"Power compounds with focus."*

- **For:** Physical melee brawlers, single-target fighters
- **Unlock:** Level 3, 1 SP
- **Effect:**
  - After landing 3 consecutive hits on the same target without switching targets: enter a **Rhythm** state (persists until you switch targets or miss)
  - In Rhythm: each additional hit on that target deals +5% more damage, stacking up to +25% (at 8 hits)
  - Rhythm resets if you switch targets, miss, or go 2 seconds without hitting that target
  - Visual: a subtle beat indicator above the target (3 small dots that fill with color as Rhythm builds)
- **Synergy:** Pairs with Heavy Slash (Executioner path) — get Rhythm going, then execute with the HP-scaling bonus layered on top

---

#### `Arcane Recursion`
*"Every spell you cast makes the next one easier."*

- **For:** Magic-focused builds, skill rotation specialists
- **Unlock:** Level 5, 1 SP
- **Effect:**
  - Every magic skill cast reduces the cooldown of all OTHER currently cooling-down skills by **0.5 seconds**
  - This means casting Arcane Bolt reduces Shadow Step's cooldown by 0.5s, and vice versa
  - The reduction applies only once per cast (not per projectile in multi-hit future skills)
  - Cap: no single skill's cooldown can be reduced below 50% of its base cooldown by this effect
- **Synergy:** Enables magic-heavy builds to feel "flowing" — one skill unlocks the next. Pairs with Arcane Bolt (Seeker path's chain lightning also triggers the reduction per cast, not per chain)

---

#### `Blood Price`
*"Pay in pain. Deal in fury."*

- **For:** Aggressive fighters, glass cannon builds, Wrath-state exploiters
- **Unlock:** Level 8, 1 SP (also requires being in Wrath state at least once — i.e., drop below 35% HP once)
- **Effect:**
  - When you receive damage, you gain **1 Ash charge** (physical) for every 5% of your max HP received as a single hit
  - Example: if hit for 30% max HP in one blow, gain 6 Ash charges (capped by Ash max of 5, so excess is wasted)
  - Additionally: taking damage while in Wrath state causes the Wrath damage bonus to increase by an additional +5% (stacking, max +35% additional = +55% total in Wrath with this passive)
  - Counterweight: if you fall below 15% HP, ALL Resonance charges are lost (panic breaks focus)
- **Synergy:** Pairs with Heavy Slash (Ravager path) — take a hit, get Ash charges, immediately release Ashburst on the next slash. Rewards the player for surviving big hits and retaliating.

---

#### `Shadow Reflexes`
*"Danger sharpens the senses."*

- **For:** Movement-focused builds, players who use Shadow Step aggressively
- **Unlock:** Level 6, 1 SP
- **Effect:**
  - After using Shadow Step, the next 2 hits within 3 seconds deal +20% damage and are guaranteed to apply their on-hit state (Sundered, Charged, or Stagger — whichever is relevant)
  - Additionally: if Shadow Step is used within 0.5 seconds of receiving damage (a "panic dash"), the cooldown is reduced by 2 seconds
- **Synergy:** Encourages committing to aggressive repositioning. Using Shadow Step as an **opener** (dash in, guaranteed Sunder, then heavy slash) is rewarded. The panic dash reward means good reflexes are mechanically recognized.

---

#### `Flow State`
*"The fight becomes the dance."*

- **For:** Builds with short cooldowns, hybrid builds that mix multiple skills
- **Unlock:** Level 10, 1 SP. Condition: Cast 3 different skills within a single 5-second window (achieve this once).
- **Effect:**
  - When the player is in the **Flow** combat state (4+ consecutive hits without damage), all Resonance charge generation is increased by +1 per hit (both Ash and Ember)
  - When Flow is active and the player uses a skill that triggers a Resonance Release (Ashburst or Overload), the Release's damage is increased by **30%** and its AoE radius by **20%**
  - Additionally: entering Flow fully restores 8 energy
- **Synergy:** The ultimate hybrid passive. Works with any build that can maintain hit streaks. Especially powerful with Arcane Bolt (fast cooldown) + Shadow Step combo, or with Ravager Heavy Slash (wide arc, can hit multiple enemies to build streak).

---

## 8. The Codex — Skill Management UI

The Codex is the in-game skill management screen. It replaces the old invisible `unlockSkill()` / `equipSkill()` debug-style calls.

### Accessing the Codex

- Opened with a dedicated key (default: **C** or **Tab**) only when outside combat (no enemies in aggro range)
- A subtle pulse animation plays on the Codex HUD icon when a new skill is available to unlock (player has SP and meets conditions)
- Opening the Codex briefly slows game time to 0 (pause) — this is not a pause menu, it's a dedicated UI overlay

### Visual Layout

```
╔═══════════════════════════════════════════╗
║  SKILL CODEX          [SP: 4] [ESC: Close] ║
╠═══════════════════════════════════════════╣
║                                           ║
║   [HEAVY SLASH ★★★]  [ARCANE BOLT ★★☆]   ║
║   [SHADOW STEP ★☆☆]  [??? LVL 12 GATE]   ║
║   [??? LVL 18]        [??? BOSS GATE]     ║
║                                           ║
║   PASSIVES:                               ║
║   [COMBAT RHYTHM ✓]  [BLOOD PRICE ✓]     ║
║   [ARCANE RECURSION] [SHADOW REFLEXES]    ║
║   [FLOW STATE ✗ LVL10]                   ║
║                                           ║
╠═════════ SELECTED: HEAVY SLASH ═══════════╣
║  Path C — SUNBREAKER (equipped)           ║
║  ┌──────────────────────────────────────┐ ║
║  │ [Base] → [C: Sunbreaker] → [CATACLYSM│ ║
║  │  ✓ owned    ✓ equipped  2SP → unlock] ║
║  └──────────────────────────────────────┘ ║
║  [Slot: Q] [Equip to RMB] [Equip to E]   ║
╚═══════════════════════════════════════════╝
```

### Unlock Animation

When you unlock a skill or upgrade:
1. SP counter decrements (animated — number drops with a brief red flash)
2. The skill node on the Codex "ignites" — a brief particle burst plays at the node
3. A sound plays: a distinct unlock chime (different from item pickup sounds)
4. A small popup appears: the skill name in large text + one-line description
5. If it's a new skill (not an upgrade), the skill automatically appears in the Codex with its base visual

### First Use of a Newly Unlocked Skill

The first time you use a skill after unlocking it (first activation in the world):
1. Very brief (0.3s) time scale reduction (not a freeze — world slows to 30%)
2. The skill name appears in large, centered text on screen for 1.0s
3. The damage number for that first hit is displayed in **gold** color instead of white
4. After the text fades, normal gameplay resumes
5. This effect happens **once per skill** for the lifetime of the player's save

### Equipped Skills Display

The HUD (always visible) shows the 4 skill slots with:
- Skill icon (or abbreviated name at MVP phase)
- Cooldown overlay (sweeping clock effect)
- Energy cost displayed below when the player is hovering/holding the activation key
- If a skill is in an upgradeable state (has upgrade paths available): a small blinking diamond on the icon

---

## 9. The 4-Layer Feedback Rule

Every hit — basic attack or skill — must simultaneously trigger exactly **4 feedback layers**. This is not optional. If any layer is missing, the hit feels less impactful.

### Layer 1: Player Animation
The player's body must respond to what they're doing.
- **Basic attack:** A forward lean + arm extension during swing phase
- **Heavy Slash:** Player steps forward 8px over 0.1s, snapping back 0.05s later
- **Arcane Bolt:** Brief arm-raise, a slight backward lean on cast (recoil feel)
- **Shadow Step:** Body accelerates toward destination (speed lines / blur during transit)
- **On taking a hit:** Player sprite flashes red and staggers slightly in the direction of impact

### Layer 2: VFX at Impact
Something must appear in the world at the point of impact.
- **Physical hits:** A slash mark / impact scar at the exact hit location. Persists 0.3–0.5s then fades.
- **Magic hits:** A burst of blue sparks / electric flash at the impact point. Fades in 0.2s.
- **Critical hit:** Impact VFX is 50% larger, a secondary ring expands outward from center
- **Resonance Release (Ashburst):** Red shockwave ring radiating from impact center. Very visible.
- **Resonance Release (Overload):** Blue-white nova expanding from impact center.
- **Enemy death:** A brief particle burst in the enemy's color tone + the enemy sprite fades over 0.3s

### Layer 3: Enemy Reaction
Enemies must visibly react to being hit.
- **Normal hit:** Enemy sprite flashes white for 1 frame + pushed back 12–15px
- **Critical hit:** Enemy pushed back 25px + brief stagger animation (sprite tilts)
- **Staggered state applied:** Enemy stumbles backward 20px + brief crouch animation
- **Killed:** Enemy sprite rapidly fades (0.3s) + particle burst
- **Bosses:** All of the above, plus a brief "impact ripple" on the boss's own VFX/aura

### Layer 4: Camera / Screen Response
The screen itself must acknowledge the hit.
- **Basic attack hit:** No shake (normal hits should feel precise, not shaky)
- **Heavy Slash hit:** Mild camera shake — magnitude 2px, duration 200ms
- **Heavy Slash CRIT:** Strong camera shake — magnitude 5px, duration 300ms
- **Arcane Bolt hit:** No shake (it's precise — should feel surgical)
- **Shadow Step arrival:** A quick camera "snap" toward landing point (camera follows position, brief lag + catch)
- **Taking damage (>15% max HP in one hit):** Camera shakes toward damage source direction — magnitude 4px, 250ms
- **Ashburst / Overload release:** Camera zoom-out by 5% for 0.3s then back — the explosion "pushes" the camera slightly

### The "Feel Audit"
Before shipping any skill, it must pass the feel audit:
- Does the player know they hit something without looking at the HP bar? ✓/✗
- Does hitting 3 enemies simultaneously feel 3× as impactful as hitting 1? ✓/✗
- Does a crit feel meaningfully different from a normal hit? ✓/✗
- Does killing an enemy feel like a finish, not a fadeout? ✓/✗

---

## 10. Future Skill Roadmap

These skills are NOT implemented in the initial scope. They are listed here to inform architecture decisions — the system must be able to support them without fundamental changes.

### Future Active Skills (Not Implemented Now)

| ID | Name | Category | Description | New Mechanic |
|---|---|---|---|---|
| `ground_slam` | Ground Slam | Physical Melee | Slam that creates Aftershock Zone | Environmental state |
| `arrow_barrage` | Arrow Barrage | Physical Ranged | Cone of arrows | Multi-hit projectile |
| `chain_lightning` | Chain Lightning | Magic | Bouncing lightning | Chain/bounce |
| `shield_bash` | Shield Bash | Physical | Knockback + stun | Crowd control |
| `charged_burst` | Charged Burst | Hybrid | Channel + release | Channel mechanic |
| `venom_strike` | Venom Strike | Physical | Heavy poison application | Status specialist |
| `frost_lance` | Frost Lance | Magic | Slow + freeze on hit | CC magic |
| `void_bolt` | Void Bolt | Magic | Bypasses shields entirely | Shield counter |
| `whirlwind` | Whirlwind | Physical | Continuous spin AoE | Toggle/sustained |
| `teleport` | Blink | Magic | Instant reposition (no damage) | Pure movement |

### Future Passive Skills (Not Implemented Now)

| ID | Name | Description |
|---|---|---|
| `vampiric_strikes` | Vampiric Strikes | Heal 3% of physical damage dealt |
| `critical_flow` | Critical Flow | Crits restore 5 energy |
| `berserker` | Berserker | <40% HP: +30% damage, +15% crit |
| `combo_artist` | Combo Artist | 2 different skills in 3s: +25% damage for 4s |
| `efficient_casting` | Efficient Casting | -15% energy cost on all skills |
| `residual_energy` | Residual Energy | Buff expiry: +8 energy |
| `spell_weaver` | Spell Weaver | Using magic skill reduces all CDs by 0.5s |
| `heavy_handed` | Heavy Handed | +30% damage, -15% attack speed |
| `focused_mind` | Focused Mind | 2s out of combat: +4 energy/sec |
| `shadow_hunter` | Shadow Hunter | After Shadow Step, +25% damage to next 2 attacks |

### Future Skill Families (Higher Level Concepts)

As the roster grows, skills will naturally cluster into **build families** — recognizable archetypes with names:

- **The Ashwalker** — Physical brawler: Heavy Slash (Ravager) + Whirlwind + Blood Price + Combat Rhythm
- **The Arcane Duelist** — Fast hybrid: Arcane Bolt (Seeker) + Shadow Step (Assassin) + Arcane Recursion + Shadow Reflexes
- **The Breaker** — AoE specialist: Heavy Slash (Cataclysm) + Ground Slam + Chain Lightning + Combo Artist
- **The Glass Cannon** — Max burst, fragile: Heavy Slash (Executioner) + Arcane Bolt (Overload) + Berserker + Blood Price

---

## 11. Technical Implementation Notes

### What Changes in the Architecture

**Skills Data (`src/data/skills.data.ts`):**
- Remove all 26 current skill definitions
- Replace with exactly 3 active skills + 5 passives (as specified above)
- Add `upgradePathChoices` field per skill: `{ tier1: { pathA: {...}, pathB: {...}, pathC: {...} }, tier2: { pathA: {...}, pathB: {...}, pathC: {...} } }`
- Add `unlockCondition` field: `{ type: 'level' | 'boss' | 'usageCount' | 'stat', value: string | number }`
- Keep `levels` array for base stats (at tiers 0/1/2)

**PlayerState (`src/core/types.ts`):**
- Add `skillUpgrades: Record<string, { pathChoice: 'A' | 'B' | 'C' | null, tier: 0 | 1 | 2 }>` — tracks which path and tier each skill is on
- Add `ashCharges: number` and `emberCharges: number` (0–5)
- Add `playerState: { flow: boolean, wrath: boolean, primed: boolean }` — current player combat states
- Add `skillUsageCounts: Record<string, number>` — for usage-based unlock conditions
- Adjust `activeSkills` to exactly 4 slots (not 6)
- Adjust `passiveSkills` to exactly 2 slots

**Resonance System (`src/systems/resonance.ts` — NEW FILE):**
- Manages Ash/Ember charges
- Listens to `combat:damageDealt` (checks `damageType`)
- Exposes `getAshCharges()`, `getEmberCharges()`
- Emits `resonance:chargeGained`, `resonance:release`, `resonance:duality`
- Handles decay timer (5s after last hit)
- Executes Ashburst / Overload release effects when hitting 5 charges

**Player State System (`src/systems/player-states.ts` — NEW FILE):**
- Manages Flow, Wrath, Primed states
- Listens to: `player:damaged`, `combat:damageDealt`, `skill:buffApplied`
- Emits `playerState:flowEntered`, `playerState:flowBroken`, `playerState:wrathEntered`, etc.
- The update loop tracks consecutive hit count (for Flow) and HP ratio (for Wrath)

**Skills System (`src/systems/skills.ts`):**
- Add `applyUpgradePath(skillId, tier, path)` — applies a fork choice
- Add `getUpgradePath(skillId)` — returns current path/tier
- `activateSkill()` reads upgrade path to determine which effect handler to call
- `checkUnlockCondition(skillId)` — evaluates unlock conditions against current state

**Skill Effects (`src/systems/skill-effects.ts`):**
- Remove all 13 existing effect handlers
- Add handlers for: `heavy_slash`, `arcane_bolt`, `shadow_step` — each with path-variant branches
- Handlers check `getUpgradePath(skillId)` to determine which variant to execute
- Each upgrade path variant is a separate internal function (`handleHeavySlashBase`, `handleHeavySlashRavager`, etc.)

**Skill Passives (`src/systems/skill-passives.ts`):**
- Remove all 10 existing passive handlers
- Add handlers for the 5 new passives

**Codex UI (`src/ui/SkillCodex.ts` — NEW FILE):**
- New full-screen overlay (Phaser scene layer or GameObject container)
- Shows all skills in a grid/hex layout
- Handles unlock/upgrade interactions via SP
- Triggers unlock animations

**SkillBar UI (`src/ui/SkillBar.ts`):**
- Update to show exactly 4 active slots
- Add Resonance display (orbiting motes around player — rendered in GameScene, not UIScene)
- Add state indicators (Flow glow, Wrath red pulse)
- The Resonance motes are world-space (follow player) — rendered as Phaser particles attached to player sprite

### Implementation Order

1. **Data layer first:** New `skills.data.ts` with 3 skills + 5 passives. New types in `types.ts`.
2. **Resonance system:** `resonance.ts` — standalone, emits events, no dependencies except event bus and game-state
3. **Player states:** `player-states.ts` — standalone, listens to events, emits state change events
4. **Skill effects (base):** Three base skill handlers, no upgrade branching yet
5. **Skill effects (upgrades):** Fork path variants for all 3 skills (9 upgrade branches + 3 awakenings)
6. **Passives:** Five passive handlers
7. **Skills.ts updates:** Unlock conditions, fork tracking, SP management updates
8. **Feedback:** VFX, camera shake, enemy flash, ground marks — this is the GameScene work
9. **Codex UI:** Last — the full unlock/management screen
10. **Skill bar updates:** Resonance motes particle system, state indicators

### Key Invariants to Preserve

- Systems never import each other — use event bus
- Resonance system does not import skills.ts and vice versa — they communicate via events
- `damageMonster()` in combat.ts remains the canonical damage application function — skill-effects.ts calls it, not the other way around
- All damage calculations stay in skill-effects.ts / combat.ts — not in the UI layer

---

## 12. What Gets Deleted & What Gets Kept

### Delete

| File | Action |
|---|---|
| `src/data/skills.data.ts` | Full rewrite — remove all 26 skill definitions |
| `src/systems/skill-effects.ts` | Remove all 13 effect handlers, keep the `applyDamageToMonster` core function |
| `src/systems/skill-passives.ts` | Remove all 10 passive handlers, keep the activation/deactivation infrastructure |

### Keep (Unchanged)

| File | Reason |
|---|---|
| `src/systems/skills.ts` | Core unlock/equip/activate logic is solid — extend, don't rewrite |
| `src/ui/SkillBar.ts` | Extend for new slot layout and Resonance display |
| `src/core/types.ts` | Extend with new fields — don't remove existing ones |
| `src/core/game-state.ts` | Add new fields to `createDefaultPlayer()` |
| `src/systems/player.ts` | Keep as is — no skill-specific logic here |
| `src/systems/combat.ts` | Keep as is — the `damageMonster()` function is the backbone |
| `src/systems/status-effects.ts` | Keep as is — status effects are independent of skills |

### New Files Required

| File | Purpose |
|---|---|
| `src/systems/resonance.ts` | Ash/Ember charge management, release effects |
| `src/systems/player-states.ts` | Flow/Wrath/Primed state tracking |
| `src/ui/SkillCodex.ts` | Full Codex UI overlay |

---

*This document represents the complete vision for Ashen Grace's skill system. Every decision described here was made to serve the three design pillars: Readable Momentum, Reactive Combos, and Visible Build Identity. Implementation should reference this document at every step — if a proposed implementation violates one of the pillars, the implementation should be revised, not the pillar.*
