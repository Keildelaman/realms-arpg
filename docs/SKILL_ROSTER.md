# Ashen Grace — Skill Roster & Build Design

> **Status:** Design brainstorm — living document for refinement before implementation.
> **Companion doc:** `SKILL_SYSTEM.md` covers core mechanics (Resonance, States, SP economy, upgrade fork architecture). This document covers the **full skill roster**, **build archetypes**, and **design philosophy for expansion**.

---

## Table of Contents

1. [Design Goals](#1-design-goals)
2. [Slot Layout](#2-slot-layout)
3. [Skill Affinity System](#3-skill-affinity-system)
4. [Existing Skills (Implemented)](#4-existing-skills-implemented)
5. [New Active Skills — Warrior](#5-new-active-skills--warrior)
6. [New Active Skills — Mage](#6-new-active-skills--mage)
7. [New Active Skills — Ranger](#7-new-active-skills--ranger)
8. [New Active Skills — Universal](#8-new-active-skills--universal)
9. [New Passive Skills](#9-new-passive-skills)
10. [Build Archetypes](#10-build-archetypes)
11. [Resonance Placement](#11-resonance-placement)
12. [Balance Philosophy](#12-balance-philosophy)
13. [Implementation Priority](#13-implementation-priority)

---

## 1. Design Goals

### What We Want

- **Build diversity:** Multiple viable ways to play the game. A tank brawler, a glass cannon mage, a fast ranger, and hybrids that mix across archetypes should all feel distinct and rewarding.
- **Meaningful decisions:** Equipping a skill means *not* equipping another. Upgrade paths lock you into a playstyle direction. Every choice should feel like it matters.
- **Emergent combos:** Players should discover synergies organically — "if I Void Rift to group enemies, then Chain Lightning, then Detonate..." — not follow a prescribed rotation.
- **No hard classes:** Skills have *affinities* (Warrior / Mage / Ranger) but any build can equip anything. Identity comes from synergy, not restriction.
- **Utility matters:** Not every skill needs to deal damage. Movement, crowd control, buffs, and positioning tools are first-class citizens that compete for precious slots.

### Inspiration

| Game | Lesson |
|------|--------|
| **Path of Exile** | Modifying *how* a skill works > scaling *how much* damage it does. Build identity from combining many systems. |
| **Last Epoch** | Each skill has its own upgrade tree that transforms its behavior. Skill identity evolves as you invest. |
| **Diablo 4** | Upgrade forks at key tiers. Two players using the same base skill can play completely differently. |
| **Hades** | A small number of abilities that combine in surprising ways. Every run feels different with the same toolkit. |

---

## 2. Slot Layout

### Active Skills: 6 Slots

Expanding from 4 to 6 active skill slots. This opens up builds that include both core damage AND utility/movement/CC.

| Slot | Binding | Role |
|------|---------|------|
| 1 | LMB | Primary attack (often basic attack, but not required) |
| 2 | RMB | Secondary attack |
| 3 | Q | Core skill |
| 4 | E | Core skill |
| 5 | Shift | Utility / Movement |
| 6 | R | Situational / Ultimate |

Players can assign *any* active skill to *any* slot — the table above is just the expected pattern, not enforced.

### Passive Skills: 3 Slots

Expanding from 2 to 3 passive slots. This is where build identity truly lives.

### Basic Attacks

Basic attacks (basic_attack, ranger_shot, arcane_strike) are full skills with upgrade trees. They occupy active slots like any other skill. A player *could* run two basics if they wanted (e.g., ranger_shot on LMB and basic_attack on RMB for melee/ranged flex).

---

## 3. Skill Affinity System

Every skill has an **affinity** tag. This is purely informational — it tells the player which archetype the skill was designed for, but does NOT restrict equipping.

| Affinity | Color | Fantasy |
|----------|-------|---------|
| **Warrior** | Red/Orange | Melee, tanky, physical, crowd control, sustain |
| **Mage** | Blue/Purple | Ranged, AoE, magic damage, status effects, zone control |
| **Ranger** | Green/Yellow | Fast attacks, projectiles, mobility, positioning, DoTs |
| **Universal** | White/Grey | Fits any build, combo enablers, hybrid tools |

Mixing affinities is encouraged. A "Battle Mage" running Heavy Slash + Chain Lightning + Shield Slam is a valid build.

---

## 4. Existing Skills (Implemented)

> Full specs in `SKILL_SYSTEM.md`. Summary here for reference.

### Basic Attacks (3)

| Skill | Type | Affinity | Description |
|-------|------|----------|-------------|
| **basic_attack** | Melee / Physical | Warrior | 80px range, 120° arc. 5 levels (1.0×→1.2× dmg). Upgrade paths: Cleave, Precision, Overwhelm. |
| **ranger_shot** | Projectile / Physical | Ranger | 300px range, 500px/s. 5 levels. Upgrade paths: Piercing Shot, Quick Draw, Marked Shot. |
| **arcane_strike** | Melee / Magic | Mage | 60px range, 100° arc. 5 levels. Upgrade paths: Resonant Strike, Siphon Strike, Destabilize. |

### Active Skills (3)

| Skill | Type | Affinity | Unlock | Description |
|-------|------|----------|--------|-------------|
| **Heavy Slash** | Melee / Physical | Warrior | Lv1, 1SP | 1.8× damage, 100° arc. Applies Sundered. Paths: Ravager (wide AoE + Bleed), Executioner (execute scaling), Sunbreaker (stacking Sunder + detonation). |
| **Arcane Bolt** | Projectile / Magic | Mage | Lv3, 1SP | 1.5× damage, homing, 600px range. Applies Charged. Paths: Seeker (chain bounce), Overload (double Charged + Discharge), Unstable Bolt (pierce + endpoint detonation). |
| **Shadow Step** | Dash / Physical | Universal | Lv5, 1SP | 200px dash, invulnerable during. Applies Stagger. Paths: Assassin (behind-target + stealth), Momentum Dash (distance scaling + knockback), Phase Walk (shadow trail + echo). |

### Passive Skills (5)

| Passive | Affinity | Unlock | Description |
|---------|----------|--------|-------------|
| **Combat Rhythm** | Warrior | Lv3, 1SP | 3+ hits on same target → +5%/hit damage (max +25%). 2s timeout. |
| **Arcane Recursion** | Mage | Lv5, 1SP | Magic skill cast → reduce all other CDs by 0.5s. |
| **Shadow Reflexes** | Ranger | Lv6, 1SP | Post-Shadow Step → 2 empowered hits (+20% dmg, guaranteed status application). Panic dash CDR. |
| **Blood Price** | Warrior | Lv8, 1SP | Damage taken → Ash charges (1 per 5% maxHP). Wrath stacking +5%/hit (cap +35%). <15% HP panic clears Resonance. |
| **Flow State** | Universal | Lv10, 1SP | In Flow: +1 Resonance/hit, release +30% dmg/+20% radius. +8 energy on Flow enter. |

---

## 5. New Active Skills — Warrior

### War Cry

> *Affinity: Warrior | Type: Utility/Buff | Damage: None (base) | Unlock: Lv4, 1SP*

**Fantasy:** You shout, demanding attention. Enemies turn to face you. You steel yourself for the incoming punishment.

**Base Mechanics:**
- AoE shout centered on player (radius ~120px)
- **Taunt:** All enemies in radius aggro onto player for 3s
- **Buff:** +15% damage reduction for 3s
- Cooldown: 8s | Energy: 15
- No damage at base — pure utility

**Upgrade Paths:**

#### Path A: Intimidating Shout
> *The shout itself becomes a weapon.*
- Applies **Slow** (30% speed reduction, 3s) to all taunted enemies
- Taunt radius +30% (156px)
- Enemies taunted by Intimidating Shout deal -10% damage for the duration
- CD: 9s

**Tier 2 Awakening: Demoralizing Roar**
- Taunted enemies that die within 3s cause nearby enemies to **Flee** (new status: move away from player for 1.5s)
- Flee triggers chain fear: fleeing enemies that bump into other enemies also cause Flee (max 2 chains)
- +20% DR during taunt (up from 15%)

#### Path B: Rally
> *Not a taunt — a battle cry that empowers your offense.*
- Removes the Taunt effect entirely
- Instead grants: +20% attack speed, +15% movement speed for 4s
- Generates +2 Ash charges on cast
- CD: 10s

**Tier 2 Awakening: Berserker Fury**
- Duration extends by 1s per enemy killed during Rally (cap 8s total)
- While Rally is active, basic attacks have no cooldown (attack speed becomes the only limiter)
- Below 50% HP: Rally also grants +10% crit chance

#### Path C: Challenger
> *You mark enemies for death.*
- Taunt applies a **Challenge Mark** to all affected enemies
- Challenged enemies take +10% damage **from all sources** (not just you)
- Challenge Mark lasts 5s, refreshes on hit
- You heal for 3% maxHP when a Challenged enemy dies
- CD: 8s

**Tier 2 Awakening: Nemesis**
- Challenge Mark stacks up to 3 times (+10% → +20% → +30% damage taken)
- Stacks are gained by hitting the challenged enemy (1 stack per 2 hits)
- At 3 stacks, target becomes **Marked for Death**: next skill hit deals +50% bonus damage and consumes all stacks
- Killing a Marked for Death target resets War Cry cooldown

---

### Shield Slam

> *Affinity: Warrior | Type: Defense/CC | Damage: Physical | Unlock: Lv7, 1SP*

**Fantasy:** Raise your guard, absorb the hit, then punish. Reactive combat — timing rewards skill.

**Base Mechanics:**
- **Phase 1 — Guard** (0.5s): Raise shield, block the next incoming hit (absorbs 100% damage of one hit)
- **Phase 2 — Slam**: After guard window (whether you blocked or not), slam forward for 1.2× attack damage in a small arc (60px, 90°)
- Slam applies **Knockback** (20px) + **Stagger** (0.4s)
- If you blocked a hit during Guard, slam damage +50% (1.8× total)
- Cooldown: 5s | Energy: 20

**Upgrade Paths:**

#### Path A: Fortress
> *The shield persists. You become the wall.*
- Guard window extends to 2s (can block multiple hits)
- Each hit blocked during Guard adds +25% to slam damage (stacking)
- Slam radius scales with hits blocked: +15px per block (up to 120px at 4 blocks)
- -30% movement speed during Guard
- CD: 7s

**Tier 2 Awakening: Unbreakable**
- During Guard, you reflect 20% of blocked damage back to attacker
- Blocking 3+ hits triggers **Iron Skin**: 3s of 40% DR after slam
- Slam at 3+ blocks also applies Sundered to all hit enemies
- Guard can be held indefinitely but drains 5 energy/s after 2s

#### Path B: Counter Strike
> *Precision parry. High risk, high reward.*
- Guard window reduced to 0.3s (tight timing!)
- **Perfect Parry:** If you block during this window, the slam becomes a guaranteed **Critical Hit** and deals 2.5× damage
- Perfect Parry also reflects the blocked damage as magic damage to the attacker
- Missed parry (no hit during 0.3s): slam still fires but at base 1.0× damage (penalty)
- CD: 4s (shorter to encourage frequent use)

**Tier 2 Awakening: Riposte Master**
- Perfect Parry grants **Primed** state
- Perfect Parry resets the cooldown of your most recently used active skill (not Shield Slam itself)
- 3 consecutive Perfect Parries within 10s triggers **Flawless Form**: +30% all damage for 5s, +50% crit damage
- Visual: afterimage effect on perfect parry

#### Path C: Battering Ram
> *The best defense is charging face-first into danger.*
- Replaces the stationary guard with a **charge** (150px forward dash with shield raised)
- Blocks hits during the charge
- Enemies hit by the charge are pushed along with you (bulldoze effect)
- Slam triggers at the end of the charge (full 360° around landing point, 80px radius)
- Enemies pushed into walls take bonus impact damage (+0.5× per wall collision)
- CD: 6s

**Tier 2 Awakening: Juggernaut**
- Charge distance +50% (225px)
- Charge grants **Unstoppable** (immune to Slow/Freeze/Stagger during charge)
- Enemies pinned against walls are Stunned (1s) instead of just Staggered
- If 3+ enemies are hit by the charge, generates +3 Ash charges
- Charge speed scales with current movement speed bonuses

---

### Ground Slam

> *Affinity: Warrior | Type: AoE/Zone Control | Damage: Physical | Unlock: Lv9, 1SP*

**Fantasy:** Slam the earth so hard it breaks. The ground itself becomes your weapon.

**Base Mechanics:**
- Slam the ground, creating a shockwave in a cone (100° arc, 100px range)
- Deals 2.0× attack damage to all enemies in cone
- Leaves an **Aftershock Zone** at the impact area (2s duration):
  - Enemies in the zone are Slowed (20%)
  - Zone pulses damage every 0.5s (15% attack per pulse)
- Cooldown: 6s | Energy: 25

**Upgrade Paths:**

#### Path A: Fissure
> *The earth cracks open in a line before you.*
- Replaces cone with a **linear fissure** (200px long, 30px wide)
- Enemies standing on the fissure take repeated damage (0.3s intervals, 20% attack each)
- Fissure lasts 3s
- Enemies crossing the fissure are Slowed (30%)
- Fissure direction: toward cursor at time of cast
- CD: 7s

**Tier 2 Awakening: Tectonic Rift**
- Fissure length doubles (400px) and curves toward the nearest enemy cluster (smart targeting)
- At the end of the fissure, a **Sinkhole** opens (2s, 60px radius): pulls enemies toward center
- Enemies in the Sinkhole take +40% damage from all sources
- Standing on your own fissure grants +10% movement speed

#### Path B: Quake
> *Everything around you shakes.*
- Replaces cone with full 360° shockwave (radius 100px)
- Slightly lower damage (1.6×) to compensate for full AoE coverage
- Aftershock Zone covers the full circle
- Each pulse of the Aftershock Zone has a 15% chance to Stagger enemies
- CD: 8s

**Tier 2 Awakening: Seismic Surge**
- Quake radius +40% (140px)
- Quake triggers a second delayed pulse (0.5s later, 80% damage, larger radius 180px)
- Enemies hit by both pulses are Sundered
- While standing in your own Aftershock Zone: +15% DR, attacks generate +1 Ash

#### Path C: Upheaval
> *Tear chunks from the earth and let them rain.*
- Initial slam deals reduced damage (1.2×) but launches **debris** into the air
- After 1s delay, debris rains down in a target area (cursor position, 80px radius)
- Rain damage: 2.5× attack damage, applies Stagger to all hit
- Telegraphed: enemies see the shadow/warning zone (fair for the player AND monsters)
- CD: 7s

**Tier 2 Awakening: Meteor Strike**
- Debris coalesces into a single massive boulder
- Impact radius 120px, deals 4.0× attack damage
- Creates a **Crater Zone** (3s): enemies inside are Slowed 40% and take +20% physical damage
- If the boulder kills an enemy, it fragments and showers nearby enemies (60px, 1.0× each)
- Hold the skill to aim — release to drop (max hold 2s, boulder grows 15% per 0.5s held)

---

## 6. New Active Skills — Mage

### Frost Nova

> *Affinity: Mage | Type: AoE/CC | Damage: Magic | Unlock: Lv4, 1SP*

**Fantasy:** Flash-freeze everything around you. The last resort of a cornered mage — or the opening move of an aggressive one.

**Base Mechanics:**
- Instant burst of ice centered on player (radius 100px)
- Deals 1.2× magic power damage
- Applies **Slow** (30%, 3s) to all hit enemies
- Enemies below 30% HP are **Frozen** instead (1.5s)
- Cooldown: 7s | Energy: 20

**Upgrade Paths:**

#### Path A: Permafrost
> *The cold lingers long after you've moved on.*
- Nova leaves **Frozen Ground** (3s duration, same radius as nova)
- Enemies on Frozen Ground are continuously Slowed (40%, stronger than base)
- Enemies that stay on Frozen Ground for 2s+ are Frozen (regardless of HP)
- Frozen Ground extinguishes Burn effects on enemies (anti-synergy with fire builds — meaningful tradeoff)
- CD: 8s

**Tier 2 Awakening: Absolute Zero**
- Frozen Ground duration 5s, radius grows 20% over its lifetime
- Enemies Frozen by Permafrost shatter when hit, dealing 0.8× magic damage in 40px AoE
- Shatter fragments can chain-freeze adjacent enemies (if below 50% HP)
- You gain +15% movement speed on Frozen Ground

#### Path B: Shatter
> *Frozen enemies are fragile. Exploit it.*
- Nova itself deals +30% damage (1.56×)
- Frozen enemies hit by ANY attack (not just nova) take **Shatter** bonus: +50% damage from that hit
- Shatter consumes the Freeze effect
- Shattered enemies explode in 50px AoE for 30% of the triggering hit's damage
- CD: 6s (shorter — encourages nova → follow-up rhythm)

**Tier 2 Awakening: Crystallize**
- Shatter explosions apply Slow to all enemies hit
- 2+ enemies Shattered within 1s triggers **Crystal Storm**: ice fragments orbit you for 3s, auto-targeting nearby enemies (15% magic power per fragment per second, 4 fragments)
- Frozen enemies can be Shattered by Resonance releases (Ashburst/Overload count as hits)
- Enemies killed by Shatter generate +1 Ember each

#### Path C: Blizzard
> *Not an instant — a sustained storm.*
- Replaces instant nova with a **channeled blizzard** (3s duration)
- Blizzard follows you as you move (100px radius around player)
- Pulses every 0.5s: 0.4× magic power damage + Slow (stacking: 10% → 20% → 30% → 40%)
- Final pulse (at 3s) applies Freeze to all enemies with 3+ slow stacks
- You move at 80% speed while channeling
- Can be cancelled early (no refund)
- CD: 10s | Energy: 8/s drain while channeling

**Tier 2 Awakening: Eye of the Storm**
- Blizzard radius grows from 100px → 160px over duration
- Center of the blizzard (40px around player) deals +50% damage — encourages aggressive positioning
- At channel end: all Frozen enemies are pulled 30px toward you (vortex implosion)
- Generates +1 Ember per pulse (up to 6 Ember over full channel)

---

### Chain Lightning

> *Affinity: Mage | Type: AoE/Damage | Damage: Magic | Unlock: Lv7, 1SP*

**Fantasy:** A bolt of lightning that arcs from enemy to enemy. The more packed they are, the more devastating it gets.

**Base Mechanics:**
- Fire a lightning bolt at target enemy (instant hit, 400px range)
- Bolt chains to up to 3 additional enemies within 120px of each other
- Each chain deals 25% less damage than the previous (100% → 75% → 56% → 42%)
- Each chain applies **Charged** (1 stack)
- Cooldown: 4s | Energy: 18
- Damage: 1.6× magic power (first hit)

**Upgrade Paths:**

#### Path A: Ball Lightning
> *A slow-moving orb of pure destruction.*
- Replaces the instant bolt with a **Ball Lightning** projectile
- Moves slowly (80px/s) in a straight line (max 350px travel)
- Zaps enemies within 80px every 0.3s (0.5× magic power per zap)
- Each zap applies Charged
- Ball persists for up to 4s or until it travels max distance
- Can fire other skills while the ball travels (set and forget)
- CD: 8s

**Tier 2 Awakening: Storm Nexus**
- Ball Lightning pauses for 1s at max range before dissipating, zapping rapidly during pause (0.15s intervals)
- If the ball hits an enemy with 3 Charged stacks, it detonates early: 100px AoE, 2.0× magic power
- Can have 2 balls active at once (casting while one is active fires a second)
- Balls tether to each other — enemies between two balls take continuous damage (0.3×/s)

#### Path B: Conductor
> *Enemies become the conduit.*
- Chain targets increased to 5
- Enemies with **Charged** status create **Lightning Tethers** between them (120px range)
- Tethered enemies take continuous damage (0.2× magic power/s)
- Tethers last 3s or until one of the tethered pair is un-Charged
- New enemies entering the tether zone get pulled in (auto-chain)
- CD: 5s

**Tier 2 Awakening: Superconductor**
- Tethers deal +15% damage per Charged stack on connected enemies
- 3+ enemies tethered together create an **Electromagnetic Field**: all enemies in the field take +20% magic damage from all sources
- Field enemies cannot leave the tether range (rooted while tethered)
- When any tethered enemy dies, remaining tethered enemies each take 0.5× magic burst damage

#### Path C: Thunderstrike
> *Forget chains. All that power, one target.*
- Removes chain mechanic entirely
- Single devastating bolt: 3.0× magic power damage
- Consumes all **Charged** stacks on the target for +40% bonus damage per stack consumed
- At 3 stacks consumed: also applies Stagger (0.6s)
- CD: 5s | Energy: 22

**Tier 2 Awakening: Divine Judgment**
- If Thunderstrike kills the target, a **Lightning Pillar** erupts at their location (3s, 60px radius)
- Pillar deals 0.8× magic power/s and applies Charged to all enemies inside
- Thunderstrike on an already-Staggered enemy deals +100% crit damage (on top of guaranteed crit from Stagger)
- Cooldown reduced by 1s per Charged stack consumed (can reach 2s CD at max)

---

### Void Rift

> *Affinity: Mage | Type: Utility/Zone | Damage: Magic | Unlock: Lv11, 1SP*

**Fantasy:** Tear open a hole in space. Things fall in. You decide what happens next.

**Base Mechanics:**
- Open a rift at target location (cursor, max 300px from player)
- Rift has a **vortex pull** — enemies within 120px are slowly dragged toward center (40px/s pull)
- Enemies inside the rift (30px center) take 0.3× magic power damage per 0.5s tick
- Rift lasts 2.5s
- Cooldown: 10s | Energy: 25

**Upgrade Paths:**

#### Path A: Collapse
> *What goes in doesn't come out.*
- Pull strength increased (60px/s)
- At the end of the rift's duration, it **implodes**:
  - Deals damage based on enemies inside: 0.8× magic power per enemy caught (minimum 1.0×, max cap 5.0×)
  - Implosion radius 80px
  - Applies Stagger to all hit
- CD: 12s

**Tier 2 Awakening: Singularity**
- Implosion damage also scales with total damage enemies took while in the rift (+25% of accumulated rift damage)
- Enemies that die inside the rift are consumed — their remaining HP is added to implosion damage (up to 2.0× bonus)
- Post-implosion: leaves a **Gravity Well** (2s) that Slows enemies by 50%
- Rift can be recast during its duration to trigger implosion early (with proportional damage reduction)

#### Path B: Dimensional Anchor
> *Escapees are punished.*
- Rift duration extended to 4s
- Pull strength reduced (30px/s) but rift applies **Anchored** debuff to enemies that touch it
- **Anchored**: -40% movement speed for 3s after leaving the rift
- Anchored enemies take +15% damage from all sources
- Rift center damage increased (0.5× per tick)
- CD: 10s

**Tier 2 Awakening: Rift Snare**
- Anchored enemies that re-enter the rift are **Rooted** (cannot move for 1.5s)
- Rooted enemies take +30% damage from all sources
- Rift periodically emits tendrils (every 1s) that drag the nearest un-Rooted enemy 40px closer
- Killing an Anchored enemy extends rift duration by 0.5s (max +2s)

#### Path C: Rift Walker
> *The rift isn't just a weapon — it's a door.*
- **Recast** the skill while rift is active to **teleport** to the rift's location
- Teleport arrival deals 1.5× magic power damage in 60px radius
- Teleport applies Charged to all hit enemies
- Rift persists for 1s after teleport (brief window for pull + damage)
- If you don't teleport, rift behaves as base
- CD: 8s (lower CD encourages using it as mobility)

**Tier 2 Awakening: Dimensional Shift**
- Teleporting leaves a **Void Echo** at your origin point (mirror rift, 2s duration, same pull/damage)
- Now have two rifts active simultaneously (origin + destination)
- Can recast again to teleport back to origin rift
- Enemies caught between two rifts are pulled to the midpoint (tug-of-war) and take +25% damage
- Generates +2 Ember on each teleport

---

## 7. New Active Skills — Ranger

### Arrow Barrage

> *Affinity: Ranger | Type: AoE/Damage | Damage: Physical | Unlock: Lv6, 1SP*

**Fantasy:** Fill the sky with arrows. When they land, nothing is left standing.

**Base Mechanics:**
- Fire a volley of 6 arrows in a cone (90°, 250px range)
- Each arrow targets a random enemy in the cone (or a random point if no enemy there)
- Each arrow: 0.6× attack damage
- Arrows that hit apply a minor Slow (10%, 1s) — individually weak, but a full volley stacks it
- Cooldown: 5s | Energy: 20

**Upgrade Paths:**

#### Path A: Rain of Arrows
> *Target an area. Arrows descend from above.*
- Replaces cone with a **targeted area** (cursor position, 100px radius, max range 350px)
- 0.8s windup (arrows arc through the air — visible telegraph for both player and enemies)
- 8 arrows rain down randomly in the area
- Each arrow: 0.5× attack damage
- Arrows leave embedded in the ground for 1.5s — enemies that walk over them take 0.15× damage (area denial)
- CD: 6s

**Tier 2 Awakening: Arrow Hell**
- Arrow count doubles (16 arrows)
- Embedded arrows last 3s and Slow enemies by 20%
- After all arrows land, embedded arrows detonate simultaneously (0.5s delay): 0.3× per arrow in 30px each
- If 5+ arrows hit the same enemy, that enemy is Pinned (rooted 1s)
- Can be aimed while other skills are on cooldown (fire and forget)

#### Path B: Suppressing Fire
> *Sustained volleys that deny space.*
- Replaces single burst with a **3-shot rapid fire** (one volley every 0.3s, 2 arrows per volley)
- Each arrow: 0.45× attack damage
- Enemies hit are Slowed (15%, stacking per hit — max 60%)
- 3rd volley arrows pierce through first target
- Can move at 70% speed while firing
- CD: 6s

**Tier 2 Awakening: Gatling Volley**
- 5 volleys instead of 3 (10 arrows total)
- Movement speed during firing: 90% (nearly full speed)
- Enemies hit by 4+ arrows are Staggered
- Final volley arrows are **explosive** (25px AoE per arrow, 0.6× each)
- Each hit generates +1 Ash (can build significant Resonance from a full volley)

#### Path C: Focused Volley
> *Not a spray — a barrage aimed at one target.*
- All arrows converge on a single target (or cursor point)
- 4 arrows, but each hits the same enemy
- Each arrow: 0.8× attack damage (3.2× total on single target if all hit)
- Arrows arrive in rapid succession (0.1s apart) — triggers hit-count passives quickly
- If all 4 arrows hit the same target, apply **Pinned**: rooted for 0.8s
- CD: 4s | Energy: 15

**Tier 2 Awakening: Heart Seeker**
- Arrow count: 6 (total potential: 4.8× single target)
- 4+ hits on same target: guaranteed Crit on last arrow
- Pinned enemies take +25% damage from all sources for the Pinned duration
- If Focused Volley kills the target, remaining arrows redirect to the nearest enemy
- Kills reset 50% of the cooldown

---

### Grapple Hook

> *Affinity: Ranger | Type: Mobility/Utility | Damage: Physical | Unlock: Lv8, 1SP*

**Fantasy:** A chain with a hook. Pull yourself to them. Pull them to you. The battlefield is your playground.

**Base Mechanics:**
- Fire a hook in target direction (350px range, fast travel 800px/s)
- **If it hits an enemy:** Pull yourself TO them (dash), arriving adjacent. Deal 0.8× attack damage on arrival. Apply Stagger (0.3s).
- **If it hits nothing / terrain:** Pull yourself to that point (repositioning dash). No damage.
- Invulnerable during the pull (brief, ~0.2s)
- Cooldown: 6s | Energy: 15

**Upgrade Paths:**

#### Path A: Chain Pull
> *Why go to them when they can come to you?*
- On enemy hit: **pull the ENEMY to you** instead (reverses the mechanic)
- Pulled enemy takes 1.0× damage on arrival at your position
- Pulled enemy is Staggered (0.5s)
- Works on all non-boss enemies
- Boss enemies: you get pulled to them instead (fallback to base behavior)
- CD: 7s

**Tier 2 Awakening: Death Grip**
- Can pull 2 enemies at once (hook splits on contact, grabs the nearest second enemy within 60px)
- Pulled enemies collide with each other: each takes 0.5× bonus damage from the collision
- If a pulled enemy collides with another (stationary) enemy on the way, both are Staggered
- Killing a pulled enemy within 1s of arrival resets the cooldown

#### Path B: Ricochet
> *The hook bounces between enemies. You follow its path.*
- Hook bounces between up to 3 enemies (80px chain range between them)
- You dash through ALL of them (rapid sequential dashes)
- Each enemy hit: 0.5× attack damage + Stagger (0.2s)
- Total dash is fast (~0.4s for all 3)
- If fewer than 3 enemies, hook still goes to available targets then you stop
- CD: 8s

**Tier 2 Awakening: Slingshot**
- Bounces: up to 5 enemies
- Each successive enemy takes +15% more damage (0.5× → 0.58× → 0.66× → 0.76× → 0.87×)
- Final enemy in the chain is Sundered
- After the final bounce, you launch backward 80px (disengage) and gain +20% attack speed for 3s
- If all 5 bounces connect, generates +3 Ash and resets Shadow Step cooldown

#### Path C: Tether
> *The hook stays connected. The bond is your advantage.*
- On enemy hit: pull yourself to them (like base), but the **hook stays attached** (tether, 3s duration)
- Tethered enemy: you deal +15% damage to them
- Tethered enemy: has -10% defense while tethered
- If the tether breaks (enemy moves beyond 200px, or duration expires): target is yanked 40px toward you
- Can use other skills while tethered
- CD: 7s

**Tier 2 Awakening: Predator's Leash**
- Tether duration 5s
- +15% damage becomes +25% damage to tethered target
- Tether transmits: 30% of damage dealt to tethered enemy is also dealt to other enemies within 60px of them (arc damage)
- If tethered enemy dies: hook automatically fires at nearest enemy (free re-tether)
- While tethered, your movement speed increases by 10% when moving TOWARD the tethered enemy

---

### Blade Flurry

> *Affinity: Ranger | Type: Sustained Damage/Toggle | Damage: Physical | Unlock: Lv10, 1SP*

**Fantasy:** Become a whirlwind of steel. Speed is your armor. Stopping is death.

**Base Mechanics:**
- **Toggle ON:** Begin rapidly slashing all enemies within 50px range (360° around you)
- Hits every 0.25s, dealing 0.4× attack damage per hit
- 50% movement speed while active
- Drains 5 energy/s while active
- Toggle OFF manually or when energy depleted
- Cooldown: 2s (after toggling off, before you can toggle on again)

**Upgrade Paths:**

#### Path A: Whirlwind
> *Spin to win. The classic.*
- Radius increased to 70px
- Movement speed during Whirlwind: 70% (up from 50%)
- Enemies near you are pulled slightly inward (10px/s — they can't easily escape)
- Energy drain: 6/s (slightly higher for the larger radius)
- Hit interval: 0.3s (slightly slower) but damage per hit: 0.5×

**Tier 2 Awakening: Maelstrom**
- Whirlwind accelerates: after 2s, hit interval reduces to 0.2s
- After 3s, generates a visible vortex — pull strength doubles (20px/s)
- After 4s, each hit applies a random status effect (Bleed, Slow, or Stagger — weighted random)
- Movement speed scales up to 90% after 3s of sustained spinning
- Kills during Whirlwind restore 3 energy each (sustain mechanic)

#### Path B: Dance of Blades
> *Alternate between physical and magical slashes. Feed both Resonance types.*
- Alternates damage type each hit: Physical → Magic → Physical → Magic...
- Physical hits: 0.45× attack damage, generate +1 Ash
- Magic hits: 0.40× magic power damage, generate +1 Ember
- Ideal for Duality builds (builds both Resonance types simultaneously)
- Movement speed: 60%
- Energy drain: 5/s

**Tier 2 Awakening: Elemental Cyclone**
- Every 4th hit (completing a full phys-magic-phys-magic cycle) triggers a **Dual Pulse**: small AoE (40px) that deals both physical AND magic damage (0.3× each)
- Dual Pulse triggers Duality if at 3+ of both Resonance types
- While Duality is active during Dance: hit interval 0.15s (blazing fast)
- Resonance releases during Dance deal +20% damage and don't interrupt the channel

#### Path C: Thousand Cuts
> *Start slow. End devastating.*
- Attack speed ramps up over duration:
  - 0-2s: 0.35× per hit, 0.3s interval
  - 2-4s: 0.40× per hit, 0.25s interval
  - 4s+: 0.45× per hit, 0.2s interval
- Each hit has escalating Bleed chance: +3% per hit (starting from base weapon Bleed chance)
- Movement speed: 55%
- Energy drain starts at 4/s, increases to 7/s at full ramp

**Tier 2 Awakening: Death by a Thousand Cuts**
- At max ramp (4s+): every hit applies 1 Bleed stack (guaranteed)
- Bleed ticks from Thousand Cuts deal +50% damage
- At 5 Bleed stacks on an enemy: next hit triggers **Hemorrhagic Burst** (consume all Bleed, deal remaining Bleed damage instantly + 30% bonus)
- Hemorrhagic Burst generates +2 Ash
- Stopping Blade Flurry after 4s+ of sustained use: final burst slash (100px, 1.5× damage)

---

## 8. New Active Skills — Universal

### Detonate

> *Affinity: Universal | Type: Combo Finisher | Damage: Hybrid | Unlock: Lv12, 1SP*

**Fantasy:** Everything you've set up — the Bleeds, the Burns, the Charged stacks — all of it, consumed in one glorious explosion.

**Base Mechanics:**
- Target a single enemy within 200px
- **Consume** all active status effects (Bleed, Poison, Burn, Slow, Freeze) and enemy states (Sundered, Charged, Staggered) on the target
- Deal burst damage: 0.5× attack OR magic power (whichever is higher) **per effect consumed**
- Minimum 1 effect required to cast
- Damage type: hybrid (split equally between physical and magic)
- Cooldown: 8s | Energy: 20

**Upgrade Paths:**

#### Path A: Pandemic
> *Why detonate one when you can detonate them all?*
- Before detonation: **spread** all status effects on the target to enemies within 80px
- Spread effects have 50% reduced duration
- THEN detonate the original target (consuming only the original's effects)
- Spread targets keep their copied effects (they are not consumed)
- Sets up chain detonations — Detonate the next target that now has copied effects
- CD: 10s

**Tier 2 Awakening: Plague Bearer**
- Spread radius 120px (up from 80px)
- Spread effects retain 75% duration (up from 50%)
- If 3+ enemies receive spread effects, all of them are also Slowed (20%, 2s)
- Killing the detonation target triggers a secondary mini-detonation on ALL enemies that received spreads (0.3× per effect they carry)
- Enemies killed by chain-detonation also spread their effects (cascade, max 2 waves)

#### Path B: Catalyze
> *Don't consume. Amplify.*
- Does NOT consume status effects — instead **extends** all effects by 50% of their remaining duration
- Deals reduced burst: 0.3× per effect (but effects stay active — total damage over time is higher)
- Empowers all active effects: +25% damage for the extended duration
- Cooldown: 6s (shorter, since it's a sustain tool not a burst tool)

**Tier 2 Awakening: Critical Mass**
- Extension: 75% of remaining duration (up from 50%)
- Empowerment: +40% damage (up from 25%)
- If target has 4+ active effects: Catalyze also applies **Overwhelmed** (new debuff: -15% all resistances, 3s)
- Catalyze generates +1 Ash and +1 Ember per effect present (massive Resonance fuel)
- Can target self: extends all YOUR active buffs by 50% duration instead

#### Path C: Volatile
> *The explosion doesn't care about armor.*
- Detonation damage ignores 50% of target's defense AND magic resist
- Damage type: **true hybrid** — each effect consumed deals damage as the type it belongs to:
  - Bleed/Sundered/Stagger → physical portion
  - Burn/Charged → magic portion
  - Slow/Freeze/Poison → split 50/50
- +30% detonation damage if target has BOTH physical and magic effects active
- CD: 8s

**Tier 2 Awakening: Annihilate**
- Resistance ignore: 75% (up from 50%)
- +30% hybrid bonus becomes +50%
- If detonation deals more than 20% of target's maxHP: target is Staggered (0.5s)
- If detonation kills the target: **Aftermath** explosion (80px, 50% of detonation damage) hits all nearby enemies
- Aftermath applies 1 random status effect from the consumed set to each enemy hit

---

## 9. New Passive Skills

> Adding 5 more passives to bring the total from 5 → 10. With 3 passive slots, players must choose 3 of 10.

### Iron Will

> *Affinity: Warrior | Unlock: Lv4, 1SP*

**Effect:** Standing still for 0.5s+ grants **Fortified**: +15% damage reduction. Using Shield Slam's Guard or any blocking mechanic extends this to +25% for 3s.

- Fortified is lost immediately when you move
- Visual: subtle stone-texture overlay on player sprite when Fortified
- Synergy: Tank builds that hold ground. Anti-synergy with mobility builds.

---

### Spell Echo

> *Affinity: Mage | Unlock: Lv7, 1SP*

**Effect:** After casting a magic skill, 20% chance to auto-cast a **Spell Echo** of the same skill 0.5s later at 40% damage. Echo costs no energy and doesn't trigger cooldown.

- Echo inherits all upgrade path effects of the original skill
- Echo does NOT generate Resonance charges (prevents infinite loops)
- Echo CAN apply status effects
- Cannot echo another echo (no chain echoes)
- Visual: translucent blue afterimage of the spell

---

### Momentum

> *Affinity: Ranger | Unlock: Lv6, 1SP*

**Effect:** Moving continuously builds **Momentum Stacks** (1 stack per 0.5s of movement, max 5). Each stack: +3% damage dealt, +2% movement speed. All stacks lost when standing still for 0.5s+.

- At 5 stacks: next skill used gains +10% bonus (on top of the 5×3% = 15%)
- Bonus applies to the first hit of the next skill only, then resets to base stack bonus
- Synergy: Kiting rangers, Blade Flurry (you move while it's active), Grapple Hook
- Anti-synergy: Iron Will (they're opposites by design)

---

### Affliction Mastery

> *Affinity: Universal | Unlock: Lv9, 1SP*

**Effect:** All damage-over-time effects (Bleed, Poison, Burn) deal +20% damage and last 1s longer. When an enemy dies with active DoTs, those DoTs spread to 1 nearby enemy (within 80px) at 50% remaining duration.

- Spread effects can chain if the second enemy also dies with DoTs (max 3 chains)
- Synergy: Detonate (Pandemic path), Thousand Cuts (Bleed stacking), status-heavy builds
- Does NOT affect Slow/Freeze (those aren't DoTs)

---

### Combo Artist

> *Affinity: Universal | Unlock: Lv5, 1SP*

**Effect:** Using 2 different active skills within 1.5s grants **Combo** (+10% all damage for 3s). Using 3 different skills within 3s grants **Grand Combo** (+20% instead, 4s duration). Combos refresh on re-trigger.

- Basic attacks count as skills for combo purposes
- Same skill twice doesn't count (must be different skill IDs)
- Visual: combo counter "2x" / "3x" floating text
- Synergy: Builds with varied rotations. Anti-synergy: Blade Flurry toggle (one skill for long periods)

---

### Glass Cannon

> *Affinity: Mage | Unlock: Lv11, 1SP*

**Effect:** +25% all damage dealt. +20% damage taken. When you drop below 50% HP, the next magic skill cast within 3s deals +40% bonus damage (once, then 10s internal cooldown).

- The damage taken increase is multiplicative with armor/resist
- Panic bonus stacks with Wrath if both conditions are met (risky but devastating)
- Synergy: Mage burst builds, Shatter combos, Thunderstrike finishers

---

### Predator's Instinct

> *Affinity: Ranger | Unlock: Lv8, 1SP*

**Effect:** Enemies below 40% HP are **Marked as Prey**. You deal +12% damage to Prey targets and gain +10% movement speed when moving toward them. Killing a Prey target restores 8 energy.

- Mark is automatic and visual (subtle red indicator on low-HP enemies)
- Energy restore helps sustain Blade Flurry and rapid skill rotations
- Synergy: Executioner (Heavy Slash path), Focused Volley, any "finish them off" playstyle

---

### Resonance Attunement

> *Affinity: Universal | Unlock: Lv12, 1SP*

**Effect:** Resonance charges decay 50% slower. Resonance releases deal +20% damage. Gaining a charge while at max (5) of one type immediately triggers the release AND generates 1 charge of the opposite type.

- The "overflow to opposite" mechanic means hybrid builds cycle releases faster
- Pure physical builds would generate Ember charges from Ashburst overflow
- Synergy: Dance of Blades, Flow State, any Resonance-centric build
- This is the "opt-in to making Resonance your thing" passive

---

## 10. Build Archetypes

> These are example builds to illustrate how skills combine. Players should discover their own.

### The Ironclad (Tank Brawler)

**Actives:** basic_attack (Overwhelm) | Heavy Slash (Sunbreaker) | War Cry (Challenger) | Shield Slam (Fortress) | Ground Slam (Quake) | Blade Flurry (Whirlwind)

**Passives:** Iron Will | Combat Rhythm | Blood Price

**Playstyle:** Wade into packs, War Cry to taunt and group, Whirlwind to sustain AoE, Shield Slam when big hits come. Ground Slam for zone control. Sunbreaker detonations handle elites. Blood Price feeds Ash from damage taken; Iron Will reduces that damage when you stop to Slam.

---

### The Arcanist (Glass Cannon Mage)

**Actives:** arcane_strike (Destabilize) | Arcane Bolt (Overload) | Chain Lightning (Conductor) | Frost Nova (Shatter) | Void Rift (Collapse) | Detonate (Volatile)

**Passives:** Glass Cannon | Arcane Recursion | Spell Echo

**Playstyle:** Void Rift pulls enemies together. Chain Lightning tethers them all with Charged. Frost Nova freezes low-HP targets. Shatter them for AoE explosions. Detonate consumes everything for massive burst. Arcane Recursion keeps CDs cycling. Spell Echo procs free extra casts. Glass Cannon makes every spell hit like a truck — but you're paper thin.

---

### The Windrunner (Speed Ranger)

**Actives:** ranger_shot (Quick Draw) | Arrow Barrage (Suppressing Fire) | Grapple Hook (Ricochet) | Shadow Step (Assassin) | Blade Flurry (Thousand Cuts) | War Cry (Rally)

**Passives:** Momentum | Predator's Instinct | Combo Artist

**Playstyle:** Never stop moving. Rally for attack speed, Grapple to engage (bouncing through packs), Blade Flurry to shred while moving, Suppressing Fire to Slow anything chasing you. Shadow Step for escape or assassination. Momentum rewards constant motion. Combo Artist rewards rotating skills. Predator's Instinct finishes low-HP targets with bonus damage + energy recovery.

---

### The Plague Doctor (Status/DoT Hybrid)

**Actives:** basic_attack (Cleave) | Arcane Bolt (Seeker) | Frost Nova (Permafrost) | Chain Lightning (Ball Lightning) | Arrow Barrage (Rain of Arrows) | Detonate (Pandemic)

**Passives:** Affliction Mastery | Flow State | Combo Artist

**Playstyle:** Stack as many effects as possible. Cleave for Bleed, Arcane Bolt for Burn/Charged, Frost Nova for Slow/Freeze. Ball Lightning passively applies Charged while you do other things. Rain of Arrows for area denial. Then Pandemic → Detonate: spread everything, blow it up, watch chain reactions. Affliction Mastery makes DoTs deadlier and spread on death. Flow State fuels Resonance.

---

### The Duelist (Hybrid Resonance)

**Actives:** arcane_strike (Resonant Strike) | Heavy Slash (Ravager) | Arcane Bolt (Overload) | Shadow Step (Phase Walk) | Blade Flurry (Dance of Blades) | Detonate (Catalyze)

**Passives:** Resonance Attunement | Flow State | Combo Artist

**Playstyle:** Alternate physical and magic constantly. Dance of Blades builds both Ash and Ember simultaneously. Resonant Strike doubles Ember generation. Heavy Slash Ravager contributes Ash. Flow State adds +1 per hit. Resonance Attunement makes releases stronger and chains one into the other. Catalyze sustains all your buffs and effects without consuming them. Constant Resonance explosions.

---

## 11. Resonance Placement

With this expanded roster, Resonance becomes **one build path among many** rather than free power:

| Approach | What it means |
|----------|--------------|
| **Ignore Resonance** | Many builds (pure tank, status/DoT) don't need it. Charges build slowly, releases are weak, that's fine. |
| **Passive benefit** | Some builds generate Resonance naturally through normal play. Nice bonus, not the focus. |
| **Lean into it** | Resonance Attunement + Flow State + Dance of Blades = Resonance IS your damage. You build around cycling releases as fast as possible. |

This makes the system feel **earned** when you build for it, not **free** when you don't.

Future consideration: Resonance could be fully gated behind the **Resonance Attunement** passive — without it, charges still build but don't auto-release. This would make it a true opt-in. (Decision deferred — playtest first.)

---

## 12. Balance Philosophy

### Damage Budget

Every skill should have a clear **role** and **damage budget**:

| Role | Example | Expected DPS contribution |
|------|---------|--------------------------|
| Basic attack | basic_attack, ranger_shot | Sustained baseline — 100% of "normal" DPS |
| Core damage | Heavy Slash, Arcane Bolt | 150-200% of basic DPS, gated by CD + energy |
| AoE clear | Ground Slam, Chain Lightning | 80-120% per target, scales with target count |
| Burst finisher | Detonate, Thunderstrike | 250-400% but conditional (setup required) |
| Utility | War Cry, Grapple Hook | 0-50% DPS, value is in the CC/mobility/buff |
| Sustained toggle | Blade Flurry | 100-130% of basic DPS, energy drain is the gate |

### Energy as the Balancing Lever

- Powerful skills cost more energy
- Toggle skills drain continuously
- Energy regeneration is limited (~5/s base)
- This forces rotations: you can't spam your best skill
- Some paths reduce costs or restore energy (Rally, Predator's Instinct, Siphon Strike)

### Cooldown Reduction Limits

- CDR is capped at 50% from all sources combined
- This prevents degenerate loops where skills have no effective downtime
- Specific "reset on kill" effects bypass the cap (but require kills, which is its own gate)

### Status Effect Stacking

- Bleed: max 5 stacks (physical skills)
- Poison: max 10 stacks (future — not currently in skill roster)
- Burn: max 1 instance (magic skills)
- Slow: max 60% speed reduction (diminishing returns)
- Freeze: 1.5s max, 5s reapply cooldown (can't permafrost-lock without Permafrost path)

---

## 13. Implementation Priority

### Wave 1 — Expand Core Options
1. **War Cry** — Gives melee builds their missing utility
2. **Frost Nova** — Gives mage builds their defensive tool
3. **Arrow Barrage** — Gives ranger builds their AoE clear
4. **Detonate** — The combo payoff skill that ties everything together

### Wave 2 — Deepen Each Archetype
5. **Shield Slam** — Completes the tank fantasy
6. **Chain Lightning** — Completes the mage AoE kit
7. **Grapple Hook** — The mobility skill ranger needs

### Wave 3 — Advanced Options
8. **Ground Slam** — Zone control for warrior
9. **Void Rift** — Zone control for mage
10. **Blade Flurry** — Sustained toggle for ranger

### Wave 4 — Passive Expansion
11. All 8 new passives (Iron Will, Spell Echo, Momentum, Affliction Mastery, Combo Artist, Glass Cannon, Predator's Instinct, Resonance Attunement)

### Slot Expansion
- Expand active slots 4 → 6 (UI work — SkillBar.ts)
- Expand passive slots 2 → 3 (UI work — SkillBar.ts)
- Update SkillCodex to handle new equip slots

---

> **This document is a living design reference.** Skills can be added, modified, or removed before implementation. Each skill should be playtested in isolation before its upgrade paths are built.
