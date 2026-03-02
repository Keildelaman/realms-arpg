// ============================================================================
// Skills Data — 3 active + 5 passive skills (Phase 1 — Skill System Redesign)
// ============================================================================

import type { SkillDefinition, SkillUpgradeTree } from '@/core/types';

// ============================================================================
// SKILL DEFINITIONS
// ============================================================================

export const SKILLS: Record<string, SkillDefinition> = {

  // ==========================================================================
  // BASIC ATTACK (always equipped, slot 0)
  // ==========================================================================

  basic_attack: {
    id: 'basic_attack',
    name: 'Attack',
    description: 'A basic melee swing.',
    category: 'power',
    type: 'active',
    mechanic: 'melee',
    targeting: 'directional',
    damageType: 'physical',
    levels: [
      { damage: 1.0, cooldown: 0.45, energyCost: 0 },
    ],
    unlockLevel: 1,
    unlockCost: 0,
    color: '#4488ff',
    range: 80,
    arcWidth: 120,
  },

  // ==========================================================================
  // ACTIVE SKILLS (3)
  // ==========================================================================

  heavy_slash: {
    id: 'heavy_slash',
    name: 'Heavy Slash',
    description: 'A brutal melee arc. Applies Sundered (-20% defense for 4s).',
    category: 'power',
    type: 'active',
    mechanic: 'melee',
    targeting: 'directional',
    damageType: 'physical',
    levels: [
      { damage: 1.8, cooldown: 3.0, energyCost: 18 },
      { damage: 2.0, cooldown: 2.8, energyCost: 18 },
      { damage: 2.2, cooldown: 2.6, energyCost: 16 },
      { damage: 2.5, cooldown: 2.4, energyCost: 16 },
      { damage: 2.8, cooldown: 2.2, energyCost: 14 },
    ],
    unlockLevel: 1,
    unlockCost: 1,
    color: '#cc4444',
    range: 56,
    arcWidth: 100,
    statusEffect: 'bleed',
    unlockCondition: { type: 'level', value: 1 },
    upgradeTree: {
      tier1: {
        A: {
          id: 'heavy_slash_ravager', name: 'Ravager', path: 'A', tier: 1, spCost: 1,
          description: '"The arc becomes a wave."',
          detailedDescription: 'Arc 180° (from 100°), range 90px (from 56px). Applies 2 Bleed stacks instead of Sundered. CD 4.5s. +20% move speed during cast.',
          flags: { arcWidth: 180, range: 90, bleedStacks: 2, removeSundered: true, cooldownOverride: 4.5, castMoveSpeedBonus: 0.20 },
        },
        B: {
          id: 'heavy_slash_executioner', name: 'Executioner', path: 'B', tier: 1, spCost: 1,
          description: '"Mercy is wasted on the dying."',
          detailedDescription: 'Sundered lasts 10s (from 4s). +30% damage to enemies <50% HP. +60% to enemies <25% HP. +8% crit chance.',
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
          detailedDescription: 'Sundered Detonation chains: applies 1 Sunder Stack to all enemies hit. Detonation grows +30% per Ash charge held (max +150% at 5, consumes all).',
          flags: { chainDetonation: true, detonationAshScaling: 0.30, detonationAshCap: 5 },
        },
      },
    },
  },

  arcane_bolt: {
    id: 'arcane_bolt',
    name: 'Arcane Bolt',
    description: 'Fires a homing magic bolt. Applies Charged (-20% magic resist per stack, max 3).',
    category: 'mage',
    type: 'active',
    mechanic: 'projectile',
    targeting: 'directional',
    damageType: 'magic',
    levels: [
      { damage: 1.5, cooldown: 1.8, energyCost: 12 },
      { damage: 1.7, cooldown: 1.6, energyCost: 12 },
      { damage: 1.9, cooldown: 1.5, energyCost: 10 },
      { damage: 2.1, cooldown: 1.4, energyCost: 10 },
      { damage: 2.4, cooldown: 1.2, energyCost: 8 },
    ],
    unlockLevel: 3,
    unlockCost: 1,
    color: '#6644cc',
    projectileSpeed: 400,
    range: 600,
    statusEffect: 'burn',
    unlockCondition: { type: 'level', value: 3 },
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
          detailedDescription: 'Bolt is now piercing. Speed 600px/s. Applies Charged to each target. 3+ enemies in one shot triggers explosion at 3rd enemy (60px, 50% bonus magic).',
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
          detailedDescription: 'Discharge radius 130px (from 80px). Applies Charged (1 stack) to all hit by explosion. 3+ enemies hit grants Primed. Generates 3 Ember charges.',
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
  },

  shadow_step: {
    id: 'shadow_step',
    name: 'Shadow Step',
    description: 'Dash through enemies. Applies Staggered (0.4s guaranteed crits).',
    category: 'speed',
    type: 'active',
    mechanic: 'dash',
    targeting: 'directional',
    damageType: 'physical',
    levels: [
      { damage: 0.8, cooldown: 4.0, energyCost: 15 },
      { damage: 0.9, cooldown: 3.5, energyCost: 15 },
      { damage: 1.0, cooldown: 3.0, energyCost: 12 },
      { damage: 1.1, cooldown: 2.5, energyCost: 12 },
      { damage: 1.3, cooldown: 2.0, energyCost: 10 },
    ],
    unlockLevel: 5,
    unlockCost: 1,
    color: '#333366',
    range: 200,
    unlockCondition: { type: 'level', value: 5 },
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
          detailedDescription: 'Dash distance 240px (from 200px). Arrival damage scales +15% per 40px traveled. AoE radius 70px. Knockback 30px (from 15px). CD 5.0s.',
          flags: { dashDistance: 240, distanceDamageScaling: 0.15, distanceDamageInterval: 40, arrivalRadius: 70, knockbackDistance: 30, cooldownOverride: 5.0 },
        },
        C: {
          id: 'shadow_step_phase_walk', name: 'Phase Walk', path: 'C', tier: 1, spCost: 1,
          description: '"The shadow lingers where you left."',
          detailedDescription: 'Leaves Shadow Trail at origin (2s, 16px wide, full dash length). Trail deals 20% attack/sec. Dashing through enemy auto-Staggers. CD 4.5s.',
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
  },

  // ==========================================================================
  // PASSIVE SKILLS (5)
  // ==========================================================================

  combat_rhythm: {
    id: 'combat_rhythm',
    name: 'Combat Rhythm',
    description: 'After 3 hits on the same target, each additional hit deals +5% damage, stacking to +25%. Resets on target switch or 2s timeout.',
    category: 'power',
    type: 'passive',
    levels: [
      { damage: 0, cooldown: 0, energyCost: 0 },
      { damage: 0, cooldown: 0, energyCost: 0 },
      { damage: 0, cooldown: 0, energyCost: 0 },
      { damage: 0, cooldown: 0, energyCost: 0 },
      { damage: 0, cooldown: 0, energyCost: 0 },
    ],
    unlockLevel: 3,
    unlockCost: 1,
    color: '#44cc88',
    passiveEffect: 'combat_rhythm',
    unlockCondition: { type: 'level', value: 3 },
  },

  arcane_recursion: {
    id: 'arcane_recursion',
    name: 'Arcane Recursion',
    description: 'Casting a magic skill reduces all other skill cooldowns by 0.5s.',
    category: 'mage',
    type: 'passive',
    levels: [
      { damage: 0, cooldown: 0, energyCost: 0 },
      { damage: 0, cooldown: 0, energyCost: 0 },
      { damage: 0, cooldown: 0, energyCost: 0 },
      { damage: 0, cooldown: 0, energyCost: 0 },
      { damage: 0, cooldown: 0, energyCost: 0 },
    ],
    unlockLevel: 5,
    unlockCost: 1,
    color: '#4466cc',
    passiveEffect: 'arcane_recursion',
    unlockCondition: { type: 'level', value: 5 },
  },

  shadow_reflexes: {
    id: 'shadow_reflexes',
    name: 'Shadow Reflexes',
    description: 'After Shadow Step, the next 2 hits deal +20% damage and guarantee enemy state application. Panic dash reduces Shadow Step CD by 2s.',
    category: 'speed',
    type: 'passive',
    levels: [
      { damage: 0, cooldown: 0, energyCost: 0 },
      { damage: 0, cooldown: 0, energyCost: 0 },
      { damage: 0, cooldown: 0, energyCost: 0 },
      { damage: 0, cooldown: 0, energyCost: 0 },
      { damage: 0, cooldown: 0, energyCost: 0 },
    ],
    unlockLevel: 6,
    unlockCost: 1,
    color: '#666699',
    passiveEffect: 'shadow_reflexes',
    unlockCondition: { type: 'level', value: 6 },
  },

  blood_price: {
    id: 'blood_price',
    name: 'Blood Price',
    description: 'Taking damage generates 1 Ash charge per 5% max HP received. In Wrath, gain +5% damage per hit taken (max +35%). Below 15% HP, all Resonance is lost.',
    category: 'power',
    type: 'passive',
    levels: [
      { damage: 0, cooldown: 0, energyCost: 0 },
      { damage: 0, cooldown: 0, energyCost: 0 },
      { damage: 0, cooldown: 0, energyCost: 0 },
      { damage: 0, cooldown: 0, energyCost: 0 },
      { damage: 0, cooldown: 0, energyCost: 0 },
    ],
    unlockLevel: 8,
    unlockCost: 1,
    color: '#cc2222',
    passiveEffect: 'blood_price',
    unlockCondition: { type: 'level', value: 8 },
  },

  flow_state: {
    id: 'flow_state',
    name: 'Flow State',
    description: 'In Flow: +1 Resonance charge per hit. Resonance Release deals +30% damage with +20% radius. Entering Flow restores 8 energy.',
    category: 'utility',
    type: 'passive',
    levels: [
      { damage: 0, cooldown: 0, energyCost: 0 },
      { damage: 0, cooldown: 0, energyCost: 0 },
      { damage: 0, cooldown: 0, energyCost: 0 },
      { damage: 0, cooldown: 0, energyCost: 0 },
      { damage: 0, cooldown: 0, energyCost: 0 },
    ],
    unlockLevel: 10,
    unlockCost: 1,
    color: '#44aa44',
    passiveEffect: 'flow_state',
    unlockCondition: { type: 'level', value: 10 },
  },
};

// ============================================================================
// FILTERED EXPORTS
// ============================================================================

export const ACTIVE_SKILLS: SkillDefinition[] = Object.values(SKILLS).filter(
  (s) => s.type === 'active'
);

export const PASSIVE_SKILLS: SkillDefinition[] = Object.values(SKILLS).filter(
  (s) => s.type === 'passive'
);
