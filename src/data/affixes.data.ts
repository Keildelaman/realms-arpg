// ============================================================================
// Affixes Data — 36 affixes with range-based tier 1 values + scale type
// 2-tier selection: category (from SLOT_CATEGORY_WEIGHTS) → affix (by weight).
// Categories: offensive(6), defensive(5), utility(4), statusChance(5),
//             statusPotency(5), skillPower(5), skillLevel(6)
// ============================================================================

import type { AffixDefinition, AffixCategory } from '@/core/types';

// ============================================================================
// AFFIX DEFINITIONS
// ============================================================================
// t1Min/t1Max define the value range at tier 1.
// Higher tiers scale via TIER_FLAT_MULTIPLIERS or TIER_PERCENT_MULTIPLIERS.
// weight = selection weight within its category.

export const AFFIXES: Record<string, AffixDefinition> = {

  // ==========================================================================
  // OFFENSIVE (6)
  // ==========================================================================

  flat_attack: {
    id: 'flat_attack',
    name: '+X Attack',
    description: 'Increases physical attack power.',
    stat: 'attack',
    category: 'offensive',
    isPrefix: true,
    t1Min: 2, t1Max: 6, scaleType: 'flat', weight: 25,
  },

  flat_magic_power: {
    id: 'flat_magic_power',
    name: '+X Magic Power',
    description: 'Increases magic attack power.',
    stat: 'magicPower',
    category: 'offensive',
    isPrefix: true,
    t1Min: 2, t1Max: 6, scaleType: 'flat', weight: 25,
  },

  crit_chance: {
    id: 'crit_chance',
    name: '+X% Crit Chance',
    description: 'Increases critical hit chance.',
    stat: 'critChance',
    category: 'offensive',
    isPrefix: true,
    t1Min: 0.01, t1Max: 0.02, scaleType: 'percentage', weight: 18,
  },

  crit_damage: {
    id: 'crit_damage',
    name: '+X% Crit Damage',
    description: 'Increases critical hit damage multiplier.',
    stat: 'critDamage',
    category: 'offensive',
    isPrefix: true,
    t1Min: 0.04, t1Max: 0.08, scaleType: 'percentage', weight: 18,
  },

  attack_speed: {
    id: 'attack_speed',
    name: '+X% Attack Speed',
    description: 'Increases attacks per second.',
    stat: 'attackSpeed',
    category: 'offensive',
    isPrefix: true,
    t1Min: 0.03, t1Max: 0.07, scaleType: 'percentage', weight: 15,
  },

  armor_penetration: {
    id: 'armor_penetration',
    name: '+X% Armor Penetration',
    description: 'Ignores a portion of enemy defense.',
    stat: 'armorPen',
    category: 'offensive',
    isPrefix: true,
    t1Min: 0.03, t1Max: 0.07, scaleType: 'percentage', weight: 14,
  },

  // ==========================================================================
  // DEFENSIVE (5)
  // ==========================================================================

  flat_max_hp: {
    id: 'flat_max_hp',
    name: '+X Max HP',
    description: 'Increases maximum health points.',
    stat: 'maxHP',
    category: 'defensive',
    isPrefix: false,
    t1Min: 12, t1Max: 28, scaleType: 'flat', weight: 30,
  },

  flat_defense: {
    id: 'flat_defense',
    name: '+X Defense',
    description: 'Increases damage reduction.',
    stat: 'defense',
    category: 'defensive',
    isPrefix: false,
    t1Min: 2, t1Max: 5, scaleType: 'flat', weight: 25,
  },

  hp_regen: {
    id: 'hp_regen',
    name: '+X% HP Regen/sec',
    description: 'Regenerate health per second.',
    stat: 'hpRegen',
    category: 'defensive',
    isPrefix: false,
    t1Min: 0.003, t1Max: 0.008, scaleType: 'percentage', weight: 15,
  },

  dodge_chance: {
    id: 'dodge_chance',
    name: '+X% Dodge Chance',
    description: 'Chance to avoid attacks entirely.',
    stat: 'dodgeChance',
    category: 'defensive',
    isPrefix: false,
    t1Min: 0.02, t1Max: 0.04, scaleType: 'percentage', weight: 15,
  },

  damage_reduction: {
    id: 'damage_reduction',
    name: '+X% Damage Reduction',
    description: 'Reduces all incoming damage by a percentage.',
    stat: 'damageReduction',
    category: 'defensive',
    isPrefix: false,
    t1Min: 0.01, t1Max: 0.03, scaleType: 'percentage', weight: 12,
  },

  // ==========================================================================
  // UTILITY (4)
  // ==========================================================================

  move_speed: {
    id: 'move_speed',
    name: '+X% Move Speed',
    description: 'Increases movement speed.',
    stat: 'moveSpeed',
    category: 'utility',
    isPrefix: false,
    t1Min: 0.02, t1Max: 0.06, scaleType: 'percentage', weight: 20,
  },

  energy_regen: {
    id: 'energy_regen',
    name: '+X% Energy Regen',
    description: 'Increases energy regeneration rate.',
    stat: 'energyRegen',
    category: 'utility',
    isPrefix: false,
    t1Min: 0.01, t1Max: 0.03, scaleType: 'percentage', weight: 20,
  },

  gold_find: {
    id: 'gold_find',
    name: '+X% Gold Find',
    description: 'Increases gold dropped by enemies.',
    stat: 'goldFind',
    category: 'utility',
    isPrefix: false,
    t1Min: 0.03, t1Max: 0.08, scaleType: 'percentage', weight: 20,
  },

  xp_bonus: {
    id: 'xp_bonus',
    name: '+X% XP Bonus',
    description: 'Increases experience gained from kills.',
    stat: 'xpBonus',
    category: 'utility',
    isPrefix: false,
    t1Min: 0.03, t1Max: 0.06, scaleType: 'percentage', weight: 20,
  },

  // ==========================================================================
  // STATUS CHANCE (5)
  // ==========================================================================

  bleed_chance: {
    id: 'bleed_chance',
    name: '+X% Bleed Chance',
    description: 'Chance to apply bleed on hit.',
    stat: 'bleedChance',
    category: 'statusChance',
    isPrefix: true,
    t1Min: 0.03, t1Max: 0.07, scaleType: 'percentage', weight: 20,
  },

  poison_chance: {
    id: 'poison_chance',
    name: '+X% Poison Chance',
    description: 'Chance to apply poison on hit.',
    stat: 'poisonChance',
    category: 'statusChance',
    isPrefix: true,
    t1Min: 0.03, t1Max: 0.07, scaleType: 'percentage', weight: 20,
  },

  burn_chance: {
    id: 'burn_chance',
    name: '+X% Burn Chance',
    description: 'Chance to apply burn on hit.',
    stat: 'burnChance',
    category: 'statusChance',
    isPrefix: true,
    t1Min: 0.03, t1Max: 0.07, scaleType: 'percentage', weight: 20,
  },

  slow_chance: {
    id: 'slow_chance',
    name: '+X% Slow Chance',
    description: 'Chance to apply slow on hit.',
    stat: 'slowChance',
    category: 'statusChance',
    isPrefix: true,
    t1Min: 0.03, t1Max: 0.07, scaleType: 'percentage', weight: 20,
  },

  freeze_chance: {
    id: 'freeze_chance',
    name: '+X% Freeze Chance',
    description: 'Chance to apply freeze on hit.',
    stat: 'freezeChance',
    category: 'statusChance',
    isPrefix: true,
    t1Min: 0.02, t1Max: 0.05, scaleType: 'percentage', weight: 15,
  },

  // ==========================================================================
  // STATUS POTENCY (5)
  // ==========================================================================

  bleed_potency: {
    id: 'bleed_potency',
    name: '+X% Bleed Damage',
    description: 'Increases bleed damage over time.',
    stat: 'bleedPotency',
    category: 'statusPotency',
    isPrefix: true,
    t1Min: 0.06, t1Max: 0.14, scaleType: 'percentage', weight: 20,
  },

  poison_potency: {
    id: 'poison_potency',
    name: '+X% Poison Damage',
    description: 'Increases poison damage over time.',
    stat: 'poisonPotency',
    category: 'statusPotency',
    isPrefix: true,
    t1Min: 0.06, t1Max: 0.14, scaleType: 'percentage', weight: 20,
  },

  burn_potency: {
    id: 'burn_potency',
    name: '+X% Burn Damage',
    description: 'Increases burn damage over time.',
    stat: 'burnPotency',
    category: 'statusPotency',
    isPrefix: true,
    t1Min: 0.06, t1Max: 0.14, scaleType: 'percentage', weight: 20,
  },

  slow_potency: {
    id: 'slow_potency',
    name: '+X% Slow Effectiveness',
    description: 'Increases slow duration and strength.',
    stat: 'slowPotency',
    category: 'statusPotency',
    isPrefix: true,
    t1Min: 0.06, t1Max: 0.14, scaleType: 'percentage', weight: 20,
  },

  freeze_potency: {
    id: 'freeze_potency',
    name: '+X% Freeze Duration',
    description: 'Increases freeze duration.',
    stat: 'freezePotency',
    category: 'statusPotency',
    isPrefix: true,
    t1Min: 0.05, t1Max: 0.11, scaleType: 'percentage', weight: 15,
  },

  // ==========================================================================
  // SKILL POWER (5) — Percentage damage boost per skill category
  // ==========================================================================

  skill_power_boost: {
    id: 'skill_power_boost',
    name: '+X% Power Skill Damage',
    description: 'Increases damage of Power category skills.',
    stat: 'skillPowerBoost',
    category: 'skillPower',
    isPrefix: false,
    t1Min: 0.03, t1Max: 0.07, scaleType: 'percentage', weight: 20,
  },

  skill_speed_boost: {
    id: 'skill_speed_boost',
    name: '+X% Speed Skill Damage',
    description: 'Increases damage of Speed category skills.',
    stat: 'skillSpeedBoost',
    category: 'skillPower',
    isPrefix: false,
    t1Min: 0.03, t1Max: 0.07, scaleType: 'percentage', weight: 20,
  },

  skill_crit_boost: {
    id: 'skill_crit_boost',
    name: '+X% Crit Skill Damage',
    description: 'Increases damage of Crit category skills.',
    stat: 'skillCritBoost',
    category: 'skillPower',
    isPrefix: false,
    t1Min: 0.03, t1Max: 0.07, scaleType: 'percentage', weight: 20,
  },

  skill_mage_boost: {
    id: 'skill_mage_boost',
    name: '+X% Mage Skill Damage',
    description: 'Increases damage of Mage category skills.',
    stat: 'skillMageBoost',
    category: 'skillPower',
    isPrefix: false,
    t1Min: 0.03, t1Max: 0.07, scaleType: 'percentage', weight: 20,
  },

  skill_utility_boost: {
    id: 'skill_utility_boost',
    name: '+X% Utility Skill Damage',
    description: 'Increases damage of Utility category skills.',
    stat: 'skillUtilityBoost',
    category: 'skillPower',
    isPrefix: false,
    t1Min: 0.03, t1Max: 0.07, scaleType: 'percentage', weight: 20,
  },

  // ==========================================================================
  // SKILL LEVEL (6) — +level to skill categories (zone-range weighted)
  // ==========================================================================

  skill_power_level: {
    id: 'skill_power_level',
    name: '+X to Power Skills',
    description: 'Increases the level of all Power category skills.',
    stat: 'skillPowerLevel',
    category: 'skillLevel',
    isPrefix: false,
    t1Min: 1, t1Max: 1, scaleType: 'flat', weight: 17,
  },

  skill_speed_level: {
    id: 'skill_speed_level',
    name: '+X to Speed Skills',
    description: 'Increases the level of all Speed category skills.',
    stat: 'skillSpeedLevel',
    category: 'skillLevel',
    isPrefix: false,
    t1Min: 1, t1Max: 1, scaleType: 'flat', weight: 17,
  },

  skill_crit_level: {
    id: 'skill_crit_level',
    name: '+X to Crit Skills',
    description: 'Increases the level of all Crit category skills.',
    stat: 'skillCritLevel',
    category: 'skillLevel',
    isPrefix: false,
    t1Min: 1, t1Max: 1, scaleType: 'flat', weight: 17,
  },

  skill_mage_level: {
    id: 'skill_mage_level',
    name: '+X to Mage Skills',
    description: 'Increases the level of all Mage category skills.',
    stat: 'skillMageLevel',
    category: 'skillLevel',
    isPrefix: false,
    t1Min: 1, t1Max: 1, scaleType: 'flat', weight: 17,
  },

  skill_utility_level: {
    id: 'skill_utility_level',
    name: '+X to Utility Skills',
    description: 'Increases the level of all Utility category skills.',
    stat: 'skillUtilityLevel',
    category: 'skillLevel',
    isPrefix: false,
    t1Min: 1, t1Max: 1, scaleType: 'flat', weight: 17,
  },

  skill_all_level: {
    id: 'skill_all_level',
    name: '+X to All Skills',
    description: 'Increases the level of all skills.',
    stat: 'skillAllLevel',
    category: 'skillLevel',
    isPrefix: false,
    t1Min: 1, t1Max: 1, scaleType: 'flat', weight: 5,
  },
};

// ============================================================================
// AFFIXES_BY_CATEGORY — Pre-grouped for O(1) lookup during 2-tier selection
// ============================================================================

export const AFFIXES_BY_CATEGORY: Record<AffixCategory, AffixDefinition[]> = (() => {
  const result: Record<AffixCategory, AffixDefinition[]> = {
    offensive: [],
    defensive: [],
    utility: [],
    statusChance: [],
    statusPotency: [],
    skillPower: [],
    skillLevel: [],
  };

  for (const affix of Object.values(AFFIXES)) {
    result[affix.category].push(affix);
  }

  return result;
})();
