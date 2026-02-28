// ============================================================================
// Skills Data — 26 skills (16 active + 10 passive) for spatial ARPG
// Adapted from clicker's 46 skills, reinterpreted for spatial gameplay.
// ============================================================================

import type {
  SkillDefinition,
  SkillCategory,
  SkillLevelData,
} from '@/core/types';

// ============================================================================
// SKILL DEFINITIONS
// ============================================================================

export const SKILLS: Record<string, SkillDefinition> = {

  // ==========================================================================
  // ACTIVE SKILLS (16)
  // ==========================================================================

  // --- Power Category (3) ---

  heavy_slash: {
    id: 'heavy_slash',
    name: 'Heavy Slash',
    description: 'A powerful melee arc dealing high single-target damage.',
    category: 'power',
    type: 'active',
    mechanic: 'melee',
    targeting: 'directional',
    damageType: 'physical',
    levels: [
      { damage: 250, cooldown: 5.0, energyCost: 20, statusChance: 0.30 },
      { damage: 310, cooldown: 4.8, energyCost: 20, statusChance: 0.35 },
      { damage: 380, cooldown: 4.5, energyCost: 18, statusChance: 0.40 },
      { damage: 460, cooldown: 4.2, energyCost: 18, statusChance: 0.45 },
      { damage: 550, cooldown: 4.0, energyCost: 15, statusChance: 0.50 },
    ],
    unlockLevel: 1,
    unlockCost: 0,
    color: '#ef4444',
    range: 60,
    arcWidth: 120,
    statusEffect: 'bleed',
  },

  charged_burst: {
    id: 'charged_burst',
    name: 'Charged Burst',
    description: 'Channel energy then release an AoE explosion around yourself.',
    category: 'power',
    type: 'active',
    mechanic: 'channel',
    targeting: 'self',
    damageType: 'physical',
    levels: [
      { damage: 300, cooldown: 8.0, energyCost: 30, duration: 1.5 },
      { damage: 380, cooldown: 7.5, energyCost: 30, duration: 1.4 },
      { damage: 480, cooldown: 7.0, energyCost: 28, duration: 1.3 },
      { damage: 600, cooldown: 6.5, energyCost: 26, duration: 1.2 },
      { damage: 750, cooldown: 6.0, energyCost: 24, duration: 1.0 },
    ],
    unlockLevel: 12,
    unlockCost: 1,
    color: '#f97316',
    radius: 100,
  },

  ground_slam: {
    id: 'ground_slam',
    name: 'Ground Slam',
    description: 'Slam the ground dealing AoE physical damage. Breaks armor.',
    category: 'power',
    type: 'active',
    mechanic: 'melee',
    targeting: 'self',
    damageType: 'physical',
    levels: [
      { damage: 200, cooldown: 6.0, energyCost: 25 },
      { damage: 260, cooldown: 5.7, energyCost: 25 },
      { damage: 330, cooldown: 5.3, energyCost: 23 },
      { damage: 420, cooldown: 5.0, energyCost: 21 },
      { damage: 520, cooldown: 4.5, energyCost: 18 },
    ],
    unlockLevel: 20,
    unlockCost: 1,
    color: '#a16207',
    radius: 80,
  },

  // --- Speed Category (3) ---

  arrow_barrage: {
    id: 'arrow_barrage',
    name: 'Arrow Barrage',
    description: 'Fire a rapid burst of projectiles in a cone.',
    category: 'speed',
    type: 'active',
    mechanic: 'projectile',
    targeting: 'directional',
    damageType: 'physical',
    levels: [
      { damage: 60, cooldown: 5.0, energyCost: 22, hits: 5 },
      { damage: 65, cooldown: 4.8, energyCost: 22, hits: 6 },
      { damage: 70, cooldown: 4.5, energyCost: 20, hits: 7 },
      { damage: 75, cooldown: 4.2, energyCost: 20, hits: 8 },
      { damage: 80, cooldown: 4.0, energyCost: 18, hits: 10 },
    ],
    unlockLevel: 3,
    unlockCost: 1,
    color: '#84cc16',
    range: 300,
    projectileSpeed: 500,
    projectileCount: 5,
    arcWidth: 30,
    statusEffect: 'poison',
  },

  flurry: {
    id: 'flurry',
    name: 'Flurry',
    description: 'Greatly increase your attack speed for a duration.',
    category: 'speed',
    type: 'active',
    mechanic: 'buff',
    targeting: 'self',
    levels: [
      { damage: 0, cooldown: 14.0, energyCost: 30, duration: 4.0, attackSpeedBonus: 0.50 },
      { damage: 0, cooldown: 13.0, energyCost: 30, duration: 5.0, attackSpeedBonus: 0.60 },
      { damage: 0, cooldown: 12.0, energyCost: 28, duration: 5.0, attackSpeedBonus: 0.70 },
      { damage: 0, cooldown: 11.0, energyCost: 26, duration: 6.0, attackSpeedBonus: 0.80 },
      { damage: 0, cooldown: 10.0, energyCost: 24, duration: 7.0, attackSpeedBonus: 1.00 },
    ],
    unlockLevel: 15,
    unlockCost: 1,
    color: '#22d3ee',
  },

  momentum: {
    id: 'momentum',
    name: 'Momentum',
    description: 'Toggle: gain move speed and attack speed, but drain energy over time.',
    category: 'speed',
    type: 'active',
    mechanic: 'toggle',
    targeting: 'self',
    levels: [
      { damage: 0, cooldown: 0, energyCost: 3, moveSpeedBonus: 0.20, attackSpeedBonus: 0.15 },
      { damage: 0, cooldown: 0, energyCost: 3, moveSpeedBonus: 0.25, attackSpeedBonus: 0.20 },
      { damage: 0, cooldown: 0, energyCost: 2.5, moveSpeedBonus: 0.30, attackSpeedBonus: 0.25 },
      { damage: 0, cooldown: 0, energyCost: 2, moveSpeedBonus: 0.35, attackSpeedBonus: 0.30 },
      { damage: 0, cooldown: 0, energyCost: 1.5, moveSpeedBonus: 0.40, attackSpeedBonus: 0.35 },
    ],
    unlockLevel: 30,
    unlockCost: 1,
    color: '#facc15',
  },

  // --- Crit Category (3) ---

  precision: {
    id: 'precision',
    name: 'Precision',
    description: 'Your next N attacks are guaranteed critical hits.',
    category: 'crit',
    type: 'active',
    mechanic: 'buff',
    targeting: 'self',
    levels: [
      { damage: 0, cooldown: 12.0, energyCost: 25, hits: 3 },
      { damage: 0, cooldown: 12.0, energyCost: 25, hits: 4 },
      { damage: 0, cooldown: 11.0, energyCost: 23, hits: 5 },
      { damage: 0, cooldown: 10.0, energyCost: 21, hits: 6 },
      { damage: 0, cooldown: 9.0, energyCost: 18, hits: 8 },
    ],
    unlockLevel: 8,
    unlockCost: 1,
    color: '#eab308',
  },

  execution_strike: {
    id: 'execution_strike',
    name: 'Execution Strike',
    description: 'Thrust forward dealing bonus damage to targets below 30% HP.',
    category: 'crit',
    type: 'active',
    mechanic: 'melee',
    targeting: 'directional',
    damageType: 'physical',
    levels: [
      { damage: 180, cooldown: 8.0, energyCost: 20, damageBonus: 200, statusChance: 0.50 },
      { damage: 220, cooldown: 7.5, energyCost: 20, damageBonus: 250, statusChance: 0.55 },
      { damage: 270, cooldown: 7.0, energyCost: 18, damageBonus: 300, statusChance: 0.60 },
      { damage: 330, cooldown: 6.5, energyCost: 18, damageBonus: 380, statusChance: 0.65 },
      { damage: 400, cooldown: 6.0, energyCost: 15, damageBonus: 500, statusChance: 0.70 },
    ],
    unlockLevel: 18,
    unlockCost: 1,
    color: '#dc2626',
    range: 70,
    arcWidth: 60,
    statusEffect: 'bleed',
  },

  adrenaline_rush: {
    id: 'adrenaline_rush',
    name: 'Adrenaline Rush',
    description: 'Temporarily gain increased crit chance and move speed.',
    category: 'crit',
    type: 'active',
    mechanic: 'buff',
    targeting: 'self',
    levels: [
      { damage: 0, cooldown: 20.0, energyCost: 30, duration: 5.0, critChanceBonus: 0.25, moveSpeedBonus: 0.15 },
      { damage: 0, cooldown: 19.0, energyCost: 30, duration: 5.5, critChanceBonus: 0.30, moveSpeedBonus: 0.18 },
      { damage: 0, cooldown: 18.0, energyCost: 28, duration: 6.0, critChanceBonus: 0.35, moveSpeedBonus: 0.20 },
      { damage: 0, cooldown: 17.0, energyCost: 26, duration: 6.5, critChanceBonus: 0.40, moveSpeedBonus: 0.23 },
      { damage: 0, cooldown: 15.0, energyCost: 24, duration: 7.0, critChanceBonus: 0.50, moveSpeedBonus: 0.25 },
    ],
    unlockLevel: 25,
    unlockCost: 1,
    color: '#f59e0b',
  },

  // --- Mage Category (3) ---

  arcane_bolt: {
    id: 'arcane_bolt',
    name: 'Arcane Bolt',
    description: 'Fire a homing magic projectile at the nearest enemy.',
    category: 'mage',
    type: 'active',
    mechanic: 'projectile',
    targeting: 'nearest',
    damageType: 'magic',
    levels: [
      { damage: 150, cooldown: 3.0, energyCost: 15, statusChance: 0.20 },
      { damage: 190, cooldown: 2.8, energyCost: 15, statusChance: 0.22 },
      { damage: 240, cooldown: 2.5, energyCost: 14, statusChance: 0.25 },
      { damage: 300, cooldown: 2.3, energyCost: 13, statusChance: 0.28 },
      { damage: 380, cooldown: 2.0, energyCost: 12, statusChance: 0.30 },
    ],
    unlockLevel: 5,
    unlockCost: 1,
    color: '#a855f7',
    range: 350,
    projectileSpeed: 400,
    projectileCount: 1,
    statusEffect: 'burn',
  },

  chain_lightning: {
    id: 'chain_lightning',
    name: 'Chain Lightning',
    description: 'Launch a bolt that bounces between nearby enemies.',
    category: 'mage',
    type: 'active',
    mechanic: 'projectile',
    targeting: 'nearest',
    damageType: 'magic',
    levels: [
      { damage: 120, cooldown: 7.0, energyCost: 25, bounces: 3, statusChance: 0.25 },
      { damage: 150, cooldown: 6.5, energyCost: 25, bounces: 4, statusChance: 0.28 },
      { damage: 190, cooldown: 6.0, energyCost: 23, bounces: 5, statusChance: 0.30 },
      { damage: 240, cooldown: 5.5, energyCost: 21, bounces: 6, statusChance: 0.33 },
      { damage: 300, cooldown: 5.0, energyCost: 18, bounces: 7, statusChance: 0.35 },
    ],
    unlockLevel: 22,
    unlockCost: 1,
    color: '#38bdf8',
    range: 300,
    projectileSpeed: 600,
    projectileCount: 1,
    statusEffect: 'slow',
  },

  overcharge: {
    id: 'overcharge',
    name: 'Overcharge',
    description: 'Buff that enhances your next skill with bonus damage.',
    category: 'mage',
    type: 'active',
    mechanic: 'buff',
    targeting: 'self',
    levels: [
      { damage: 0, cooldown: 14.0, energyCost: 20, duration: 8.0, damageBonus: 50 },
      { damage: 0, cooldown: 13.0, energyCost: 20, duration: 8.5, damageBonus: 65 },
      { damage: 0, cooldown: 12.0, energyCost: 18, duration: 9.0, damageBonus: 80 },
      { damage: 0, cooldown: 11.0, energyCost: 16, duration: 9.5, damageBonus: 100 },
      { damage: 0, cooldown: 10.0, energyCost: 15, duration: 10.0, damageBonus: 125 },
    ],
    unlockLevel: 35,
    unlockCost: 1,
    color: '#c084fc',
  },

  // --- Utility Category (4) ---

  energy_surge: {
    id: 'energy_surge',
    name: 'Energy Surge',
    description: 'Instantly restore a large amount of energy.',
    category: 'utility',
    type: 'active',
    mechanic: 'instant',
    targeting: 'self',
    levels: [
      { damage: 0, cooldown: 22.0, energyCost: 0 },
      { damage: 0, cooldown: 20.0, energyCost: 0 },
      { damage: 0, cooldown: 18.0, energyCost: 0 },
      { damage: 0, cooldown: 16.0, energyCost: 0 },
      { damage: 0, cooldown: 14.0, energyCost: 0 },
    ],
    unlockLevel: 10,
    unlockCost: 1,
    color: '#60a5fa',
    passiveEffect: 'energy_restore',
  },

  shield_bash: {
    id: 'shield_bash',
    name: 'Shield Bash',
    description: 'Bash enemies in front, dealing damage with knockback and stun.',
    category: 'utility',
    type: 'active',
    mechanic: 'melee',
    targeting: 'directional',
    damageType: 'physical',
    levels: [
      { damage: 120, cooldown: 10.0, energyCost: 25, duration: 1.0 },
      { damage: 150, cooldown: 9.5, energyCost: 25, duration: 1.2 },
      { damage: 185, cooldown: 9.0, energyCost: 23, duration: 1.4 },
      { damage: 225, cooldown: 8.5, energyCost: 21, duration: 1.6 },
      { damage: 280, cooldown: 8.0, energyCost: 18, duration: 2.0 },
    ],
    unlockLevel: 14,
    unlockCost: 1,
    color: '#94a3b8',
    range: 55,
    arcWidth: 90,
  },

  life_tap: {
    id: 'life_tap',
    name: 'Life Tap',
    description: 'Sacrifice HP to restore energy.',
    category: 'utility',
    type: 'active',
    mechanic: 'instant',
    targeting: 'self',
    levels: [
      { damage: 0, cooldown: 12.0, energyCost: 0 },
      { damage: 0, cooldown: 11.0, energyCost: 0 },
      { damage: 0, cooldown: 10.0, energyCost: 0 },
      { damage: 0, cooldown: 9.0, energyCost: 0 },
      { damage: 0, cooldown: 8.0, energyCost: 0 },
    ],
    unlockLevel: 40,
    unlockCost: 1,
    color: '#be123c',
    passiveEffect: 'life_to_energy',
  },

  shadow_step: {
    id: 'shadow_step',
    name: 'Shadow Step',
    description: 'Dash in the aimed direction with brief invincibility frames.',
    category: 'utility',
    type: 'active',
    mechanic: 'dash',
    targeting: 'directional',
    levels: [
      { damage: 0, cooldown: 6.0, energyCost: 18, duration: 0.20 },
      { damage: 0, cooldown: 5.5, energyCost: 17, duration: 0.22 },
      { damage: 0, cooldown: 5.0, energyCost: 16, duration: 0.24 },
      { damage: 0, cooldown: 4.5, energyCost: 15, duration: 0.26 },
      { damage: 0, cooldown: 4.0, energyCost: 12, duration: 0.30 },
    ],
    unlockLevel: 1,
    unlockCost: 0,
    color: '#6366f1',
    range: 150,
  },

  // ==========================================================================
  // PASSIVE SKILLS (10)
  // ==========================================================================

  combat_mastery: {
    id: 'combat_mastery',
    name: 'Combat Mastery',
    description: 'Consecutive hits build stacking damage bonus.',
    category: 'speed',
    type: 'passive',
    levels: [
      { damage: 4, cooldown: 0, energyCost: 0, hits: 8 },
      { damage: 5, cooldown: 0, energyCost: 0, hits: 9 },
      { damage: 6, cooldown: 0, energyCost: 0, hits: 10 },
      { damage: 7, cooldown: 0, energyCost: 0, hits: 11 },
      { damage: 8, cooldown: 0, energyCost: 0, hits: 12 },
    ],
    unlockLevel: 5,
    unlockCost: 1,
    color: '#22d3ee',
    passiveEffect: 'combat_mastery',
  },

  vampiric_strikes: {
    id: 'vampiric_strikes',
    name: 'Vampiric Strikes',
    description: 'Attacks heal for a percentage of damage dealt.',
    category: 'utility',
    type: 'passive',
    levels: [
      { damage: 3, cooldown: 0, energyCost: 0 },
      { damage: 4, cooldown: 0, energyCost: 0 },
      { damage: 5, cooldown: 0, energyCost: 0 },
      { damage: 7, cooldown: 0, energyCost: 0 },
      { damage: 10, cooldown: 0, energyCost: 0 },
    ],
    unlockLevel: 10,
    unlockCost: 1,
    color: '#dc2626',
    passiveEffect: 'vampiric_strikes',
  },

  critical_flow: {
    id: 'critical_flow',
    name: 'Critical Flow',
    description: 'Critical hits restore energy.',
    category: 'crit',
    type: 'passive',
    levels: [
      { damage: 5, cooldown: 0, energyCost: 0 },
      { damage: 7, cooldown: 0, energyCost: 0 },
      { damage: 9, cooldown: 0, energyCost: 0 },
      { damage: 12, cooldown: 0, energyCost: 0 },
      { damage: 15, cooldown: 0, energyCost: 0 },
    ],
    unlockLevel: 18,
    unlockCost: 1,
    color: '#eab308',
    passiveEffect: 'critical_flow',
  },

  heavy_handed: {
    id: 'heavy_handed',
    name: 'Heavy Handed',
    description: 'Increased damage but reduced attack speed.',
    category: 'power',
    type: 'passive',
    levels: [
      { damage: 40, cooldown: 0, energyCost: 0, attackSpeedBonus: -0.15 },
      { damage: 50, cooldown: 0, energyCost: 0, attackSpeedBonus: -0.13 },
      { damage: 60, cooldown: 0, energyCost: 0, attackSpeedBonus: -0.11 },
      { damage: 70, cooldown: 0, energyCost: 0, attackSpeedBonus: -0.09 },
      { damage: 80, cooldown: 0, energyCost: 0, attackSpeedBonus: -0.07 },
    ],
    unlockLevel: 24,
    unlockCost: 1,
    color: '#ef4444',
    passiveEffect: 'heavy_handed',
  },

  combo_artist: {
    id: 'combo_artist',
    name: 'Combo Artist',
    description: 'Using two skills within a short window grants bonus damage.',
    category: 'speed',
    type: 'passive',
    levels: [
      { damage: 30, cooldown: 0, energyCost: 0, duration: 4.0 },
      { damage: 35, cooldown: 0, energyCost: 0, duration: 4.5 },
      { damage: 40, cooldown: 0, energyCost: 0, duration: 5.0 },
      { damage: 45, cooldown: 0, energyCost: 0, duration: 5.5 },
      { damage: 50, cooldown: 0, energyCost: 0, duration: 6.0 },
    ],
    unlockLevel: 26,
    unlockCost: 1,
    color: '#14b8a6',
    passiveEffect: 'combo_artist',
  },

  berserker: {
    id: 'berserker',
    name: 'Berserker',
    description: 'Below 50% HP: gain bonus damage and crit chance.',
    category: 'power',
    type: 'passive',
    levels: [
      { damage: 20, cooldown: 0, energyCost: 0, critChanceBonus: 0.10 },
      { damage: 25, cooldown: 0, energyCost: 0, critChanceBonus: 0.12 },
      { damage: 30, cooldown: 0, energyCost: 0, critChanceBonus: 0.15 },
      { damage: 35, cooldown: 0, energyCost: 0, critChanceBonus: 0.18 },
      { damage: 40, cooldown: 0, energyCost: 0, critChanceBonus: 0.20 },
    ],
    unlockLevel: 28,
    unlockCost: 1,
    color: '#b91c1c',
    passiveEffect: 'berserker',
  },

  efficient_casting: {
    id: 'efficient_casting',
    name: 'Efficient Casting',
    description: 'Reduce all skill energy costs by a percentage.',
    category: 'mage',
    type: 'passive',
    levels: [
      { damage: 15, cooldown: 0, energyCost: 0 },
      { damage: 20, cooldown: 0, energyCost: 0 },
      { damage: 25, cooldown: 0, energyCost: 0 },
      { damage: 30, cooldown: 0, energyCost: 0 },
      { damage: 35, cooldown: 0, energyCost: 0 },
    ],
    unlockLevel: 33,
    unlockCost: 1,
    color: '#7c3aed',
    passiveEffect: 'efficient_casting',
  },

  spell_weaver: {
    id: 'spell_weaver',
    name: 'Spell Weaver',
    description: 'Using any skill reduces all other cooldowns.',
    category: 'mage',
    type: 'passive',
    levels: [
      { damage: 0, cooldown: 0.8, energyCost: 0 },
      { damage: 0, cooldown: 1.0, energyCost: 0 },
      { damage: 0, cooldown: 1.2, energyCost: 0 },
      { damage: 0, cooldown: 1.4, energyCost: 0 },
      { damage: 0, cooldown: 1.5, energyCost: 0 },
    ],
    unlockLevel: 42,
    unlockCost: 1,
    color: '#8b5cf6',
    passiveEffect: 'spell_weaver',
  },

  residual_energy: {
    id: 'residual_energy',
    name: 'Residual Energy',
    description: 'When a skill buff expires, gain energy.',
    category: 'utility',
    type: 'passive',
    levels: [
      { damage: 8, cooldown: 0, energyCost: 0 },
      { damage: 10, cooldown: 0, energyCost: 0 },
      { damage: 12, cooldown: 0, energyCost: 0 },
      { damage: 15, cooldown: 0, energyCost: 0 },
      { damage: 18, cooldown: 0, energyCost: 0 },
    ],
    unlockLevel: 48,
    unlockCost: 1,
    color: '#0ea5e9',
    passiveEffect: 'residual_energy',
  },

  focused_mind: {
    id: 'focused_mind',
    name: 'Focused Mind',
    description: 'While not attacking, gain bonus energy regen per second.',
    category: 'utility',
    type: 'passive',
    levels: [
      { damage: 3, cooldown: 0, energyCost: 0 },
      { damage: 4, cooldown: 0, energyCost: 0 },
      { damage: 5, cooldown: 0, energyCost: 0 },
      { damage: 6, cooldown: 0, energyCost: 0 },
      { damage: 8, cooldown: 0, energyCost: 0 },
    ],
    unlockLevel: 52,
    unlockCost: 1,
    color: '#2563eb',
    passiveEffect: 'focused_mind',
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
