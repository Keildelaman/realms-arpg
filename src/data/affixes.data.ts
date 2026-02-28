// ============================================================================
// Affixes Data — 36 affixes with per-tier scaling
// Adapted from clicker's 63 affixes, consolidated for spatial ARPG.
// Categories: offensive(6), defensive(5), utility(4), statusChance(5),
//             statusPotency(5), skillPower(5), skillLevel(6)
// ============================================================================

import type { AffixDefinition, EquipmentSlot } from '@/core/types';

// ============================================================================
// AFFIX DEFINITIONS
// ============================================================================
// flatValues[0] and percentValues[0] are unused (index 0). Indices 1-7 = tiers.

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
    flatValues:    [0, 4, 8, 15, 26, 44, 72, 120],
    percentValues: [0, 0, 0, 0, 0, 0, 0, 0],
    slotWeights: { weapon: 40, helmet: 5, chest: 5, gloves: 25, boots: 5, accessory: 15 },
  },

  flat_magic_power: {
    id: 'flat_magic_power',
    name: '+X Magic Power',
    description: 'Increases magic attack power.',
    stat: 'magicPower',
    category: 'offensive',
    isPrefix: true,
    flatValues:    [0, 4, 8, 15, 26, 44, 72, 120],
    percentValues: [0, 0, 0, 0, 0, 0, 0, 0],
    slotWeights: { weapon: 40, helmet: 10, chest: 5, gloves: 15, boots: 5, accessory: 20 },
  },

  crit_chance: {
    id: 'crit_chance',
    name: '+X% Crit Chance',
    description: 'Increases critical hit chance.',
    stat: 'critChance',
    category: 'offensive',
    isPrefix: true,
    flatValues:    [0, 0, 0, 0, 0, 0, 0, 0],
    percentValues: [0, 0.015, 0.020, 0.026, 0.033, 0.042, 0.054, 0.068],
    slotWeights: { weapon: 25, helmet: 10, chest: 5, gloves: 30, boots: 5, accessory: 20 },
  },

  crit_damage: {
    id: 'crit_damage',
    name: '+X% Crit Damage',
    description: 'Increases critical hit damage multiplier.',
    stat: 'critDamage',
    category: 'offensive',
    isPrefix: true,
    flatValues:    [0, 0, 0, 0, 0, 0, 0, 0],
    percentValues: [0, 0.045, 0.059, 0.077, 0.099, 0.126, 0.162, 0.203],
    slotWeights: { weapon: 30, helmet: 10, chest: 5, gloves: 25, boots: 5, accessory: 20 },
  },

  attack_speed: {
    id: 'attack_speed',
    name: '+X% Attack Speed',
    description: 'Increases attacks per second.',
    stat: 'attackSpeed',
    category: 'offensive',
    isPrefix: true,
    flatValues:    [0, 0, 0, 0, 0, 0, 0, 0],
    percentValues: [0, 0.03, 0.039, 0.051, 0.066, 0.084, 0.108, 0.135],
    slotWeights: { weapon: 30, helmet: 5, chest: 5, gloves: 35, boots: 10, accessory: 15 },
  },

  armor_penetration: {
    id: 'armor_penetration',
    name: '+X% Armor Penetration',
    description: 'Ignores a portion of enemy defense.',
    stat: 'armorPen',
    category: 'offensive',
    isPrefix: true,
    flatValues:    [0, 0, 0, 0, 0, 0, 0, 0],
    percentValues: [0, 0.020, 0.026, 0.034, 0.044, 0.056, 0.072, 0.090],
    slotWeights: { weapon: 40, helmet: 5, chest: 5, gloves: 20, boots: 5, accessory: 15 },
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
    flatValues:    [0, 14, 28, 53, 91, 154, 252, 420],
    percentValues: [0, 0, 0, 0, 0, 0, 0, 0],
    slotWeights: { weapon: 5, helmet: 20, chest: 35, gloves: 5, boots: 15, accessory: 20 },
  },

  flat_defense: {
    id: 'flat_defense',
    name: '+X Defense',
    description: 'Increases damage reduction.',
    stat: 'defense',
    category: 'defensive',
    isPrefix: false,
    flatValues:    [0, 5, 10, 19, 33, 55, 90, 150],
    percentValues: [0, 0, 0, 0, 0, 0, 0, 0],
    slotWeights: { weapon: 5, helmet: 25, chest: 35, gloves: 10, boots: 20, accessory: 10 },
  },

  hp_regen: {
    id: 'hp_regen',
    name: '+X% HP Regen/sec',
    description: 'Regenerate health per second.',
    stat: 'hpRegen',
    category: 'defensive',
    isPrefix: false,
    flatValues:    [0, 0, 0, 0, 0, 0, 0, 0],
    percentValues: [0, 0.003, 0.004, 0.005, 0.007, 0.008, 0.011, 0.014],
    slotWeights: { weapon: 5, helmet: 15, chest: 30, gloves: 5, boots: 15, accessory: 25 },
  },

  dodge_chance: {
    id: 'dodge_chance',
    name: '+X% Dodge Chance',
    description: 'Chance to avoid attacks entirely.',
    stat: 'dodgeChance',
    category: 'defensive',
    isPrefix: false,
    flatValues:    [0, 0, 0, 0, 0, 0, 0, 0],
    percentValues: [0, 0.010, 0.013, 0.017, 0.022, 0.028, 0.036, 0.045],
    slotWeights: { weapon: 5, helmet: 10, chest: 15, gloves: 10, boots: 35, accessory: 20 },
  },

  damage_reduction: {
    id: 'damage_reduction',
    name: '+X% Damage Reduction',
    description: 'Reduces all incoming damage by a percentage.',
    stat: 'damageReduction',
    category: 'defensive',
    isPrefix: false,
    flatValues:    [0, 0, 0, 0, 0, 0, 0, 0],
    percentValues: [0, 0.010, 0.013, 0.017, 0.022, 0.028, 0.036, 0.045],
    slotWeights: { weapon: 5, helmet: 15, chest: 40, gloves: 5, boots: 15, accessory: 15 },
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
    flatValues:    [0, 0, 0, 0, 0, 0, 0, 0],
    percentValues: [0, 0.03, 0.039, 0.051, 0.066, 0.084, 0.108, 0.135],
    slotWeights: { weapon: 5, helmet: 5, chest: 5, gloves: 5, boots: 50, accessory: 15 },
  },

  energy_regen: {
    id: 'energy_regen',
    name: '+X% Energy Regen',
    description: 'Increases energy regeneration rate.',
    stat: 'energyRegen',
    category: 'utility',
    isPrefix: false,
    flatValues:    [0, 0, 0, 0, 0, 0, 0, 0],
    percentValues: [0, 0.035, 0.046, 0.060, 0.077, 0.098, 0.126, 0.158],
    slotWeights: { weapon: 10, helmet: 20, chest: 10, gloves: 10, boots: 15, accessory: 30 },
  },

  gold_find: {
    id: 'gold_find',
    name: '+X% Gold Find',
    description: 'Increases gold dropped by enemies.',
    stat: 'goldFind',
    category: 'utility',
    isPrefix: false,
    flatValues:    [0, 0, 0, 0, 0, 0, 0, 0],
    percentValues: [0, 0.045, 0.059, 0.077, 0.099, 0.126, 0.162, 0.203],
    slotWeights: { weapon: 10, helmet: 15, chest: 15, gloves: 15, boots: 15, accessory: 30 },
  },

  xp_bonus: {
    id: 'xp_bonus',
    name: '+X% XP Bonus',
    description: 'Increases experience gained from kills.',
    stat: 'xpBonus',
    category: 'utility',
    isPrefix: false,
    flatValues:    [0, 0, 0, 0, 0, 0, 0, 0],
    percentValues: [0, 0.045, 0.059, 0.077, 0.099, 0.126, 0.162, 0.203],
    slotWeights: { weapon: 10, helmet: 25, chest: 10, gloves: 10, boots: 10, accessory: 30 },
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
    flatValues:    [0, 0, 0, 0, 0, 0, 0, 0],
    percentValues: [0, 0.035, 0.046, 0.060, 0.077, 0.098, 0.126, 0.158],
    slotWeights: { weapon: 35, helmet: 5, chest: 5, gloves: 30, boots: 5, accessory: 15 },
  },

  poison_chance: {
    id: 'poison_chance',
    name: '+X% Poison Chance',
    description: 'Chance to apply poison on hit.',
    stat: 'poisonChance',
    category: 'statusChance',
    isPrefix: true,
    flatValues:    [0, 0, 0, 0, 0, 0, 0, 0],
    percentValues: [0, 0.035, 0.046, 0.060, 0.077, 0.098, 0.126, 0.158],
    slotWeights: { weapon: 35, helmet: 5, chest: 5, gloves: 30, boots: 5, accessory: 15 },
  },

  burn_chance: {
    id: 'burn_chance',
    name: '+X% Burn Chance',
    description: 'Chance to apply burn on hit.',
    stat: 'burnChance',
    category: 'statusChance',
    isPrefix: true,
    flatValues:    [0, 0, 0, 0, 0, 0, 0, 0],
    percentValues: [0, 0.035, 0.046, 0.060, 0.077, 0.098, 0.126, 0.158],
    slotWeights: { weapon: 35, helmet: 5, chest: 5, gloves: 25, boots: 5, accessory: 20 },
  },

  slow_chance: {
    id: 'slow_chance',
    name: '+X% Slow Chance',
    description: 'Chance to apply slow on hit.',
    stat: 'slowChance',
    category: 'statusChance',
    isPrefix: true,
    flatValues:    [0, 0, 0, 0, 0, 0, 0, 0],
    percentValues: [0, 0.020, 0.026, 0.034, 0.044, 0.056, 0.072, 0.090],
    slotWeights: { weapon: 30, helmet: 5, chest: 5, gloves: 20, boots: 15, accessory: 20 },
  },

  freeze_chance: {
    id: 'freeze_chance',
    name: '+X% Freeze Chance',
    description: 'Chance to apply freeze on hit.',
    stat: 'freezeChance',
    category: 'statusChance',
    isPrefix: true,
    flatValues:    [0, 0, 0, 0, 0, 0, 0, 0],
    percentValues: [0, 0.012, 0.016, 0.020, 0.026, 0.034, 0.043, 0.054],
    slotWeights: { weapon: 30, helmet: 5, chest: 5, gloves: 20, boots: 10, accessory: 25 },
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
    flatValues:    [0, 0, 0, 0, 0, 0, 0, 0],
    percentValues: [0, 0.050, 0.065, 0.085, 0.110, 0.140, 0.180, 0.225],
    slotWeights: { weapon: 30, helmet: 5, chest: 5, gloves: 30, boots: 5, accessory: 20 },
  },

  poison_potency: {
    id: 'poison_potency',
    name: '+X% Poison Damage',
    description: 'Increases poison damage over time.',
    stat: 'poisonPotency',
    category: 'statusPotency',
    isPrefix: true,
    flatValues:    [0, 0, 0, 0, 0, 0, 0, 0],
    percentValues: [0, 0.050, 0.065, 0.085, 0.110, 0.140, 0.180, 0.225],
    slotWeights: { weapon: 30, helmet: 5, chest: 5, gloves: 30, boots: 5, accessory: 20 },
  },

  burn_potency: {
    id: 'burn_potency',
    name: '+X% Burn Damage',
    description: 'Increases burn damage over time.',
    stat: 'burnPotency',
    category: 'statusPotency',
    isPrefix: true,
    flatValues:    [0, 0, 0, 0, 0, 0, 0, 0],
    percentValues: [0, 0.050, 0.065, 0.085, 0.110, 0.140, 0.180, 0.225],
    slotWeights: { weapon: 30, helmet: 5, chest: 5, gloves: 25, boots: 5, accessory: 25 },
  },

  slow_potency: {
    id: 'slow_potency',
    name: '+X% Slow Effectiveness',
    description: 'Increases slow duration and strength.',
    stat: 'slowPotency',
    category: 'statusPotency',
    isPrefix: true,
    flatValues:    [0, 0, 0, 0, 0, 0, 0, 0],
    percentValues: [0, 0.035, 0.046, 0.060, 0.077, 0.098, 0.126, 0.158],
    slotWeights: { weapon: 25, helmet: 5, chest: 5, gloves: 20, boots: 15, accessory: 25 },
  },

  freeze_potency: {
    id: 'freeze_potency',
    name: '+X% Freeze Duration',
    description: 'Increases freeze duration.',
    stat: 'freezePotency',
    category: 'statusPotency',
    isPrefix: true,
    flatValues:    [0, 0, 0, 0, 0, 0, 0, 0],
    percentValues: [0, 0.035, 0.046, 0.060, 0.077, 0.098, 0.126, 0.158],
    slotWeights: { weapon: 25, helmet: 5, chest: 5, gloves: 20, boots: 10, accessory: 30 },
  },

  // ==========================================================================
  // SKILL POWER (5) — Percentage damage boost per skill category
  // ==========================================================================

  skill_power_boost: {
    id: 'skill_power_boost',
    name: '+X% Power Skill Damage',
    description: 'Increases damage of Power category skills.',
    stat: 'skillPowerDmg',
    category: 'skillPower',
    isPrefix: false,
    flatValues:    [0, 0, 0, 0, 0, 0, 0, 0],
    percentValues: [0, 0.045, 0.059, 0.077, 0.099, 0.126, 0.162, 0.203],
    slotWeights: { weapon: 25, helmet: 15, chest: 10, gloves: 15, boots: 10, accessory: 20 },
  },

  skill_speed_boost: {
    id: 'skill_speed_boost',
    name: '+X% Speed Skill Damage',
    description: 'Increases damage of Speed category skills.',
    stat: 'skillSpeedDmg',
    category: 'skillPower',
    isPrefix: false,
    flatValues:    [0, 0, 0, 0, 0, 0, 0, 0],
    percentValues: [0, 0.045, 0.059, 0.077, 0.099, 0.126, 0.162, 0.203],
    slotWeights: { weapon: 25, helmet: 15, chest: 10, gloves: 15, boots: 10, accessory: 20 },
  },

  skill_crit_boost: {
    id: 'skill_crit_boost',
    name: '+X% Crit Skill Damage',
    description: 'Increases damage of Crit category skills.',
    stat: 'skillCritDmg',
    category: 'skillPower',
    isPrefix: false,
    flatValues:    [0, 0, 0, 0, 0, 0, 0, 0],
    percentValues: [0, 0.045, 0.059, 0.077, 0.099, 0.126, 0.162, 0.203],
    slotWeights: { weapon: 25, helmet: 15, chest: 10, gloves: 15, boots: 10, accessory: 20 },
  },

  skill_mage_boost: {
    id: 'skill_mage_boost',
    name: '+X% Mage Skill Damage',
    description: 'Increases damage of Mage category skills.',
    stat: 'skillMageDmg',
    category: 'skillPower',
    isPrefix: false,
    flatValues:    [0, 0, 0, 0, 0, 0, 0, 0],
    percentValues: [0, 0.045, 0.059, 0.077, 0.099, 0.126, 0.162, 0.203],
    slotWeights: { weapon: 25, helmet: 15, chest: 10, gloves: 15, boots: 10, accessory: 20 },
  },

  skill_utility_boost: {
    id: 'skill_utility_boost',
    name: '+X% Utility Skill Damage',
    description: 'Increases damage of Utility category skills.',
    stat: 'skillUtilityDmg',
    category: 'skillPower',
    isPrefix: false,
    flatValues:    [0, 0, 0, 0, 0, 0, 0, 0],
    percentValues: [0, 0.045, 0.059, 0.077, 0.099, 0.126, 0.162, 0.203],
    slotWeights: { weapon: 25, helmet: 15, chest: 10, gloves: 15, boots: 10, accessory: 20 },
  },

  // ==========================================================================
  // SKILL LEVEL (6) — +level to skill categories (zone-based flat values)
  // ==========================================================================

  skill_power_level: {
    id: 'skill_power_level',
    name: '+X to Power Skills',
    description: 'Increases the level of all Power category skills.',
    stat: 'skillPowerLevel',
    category: 'skillLevel',
    isPrefix: false,
    flatValues:    [0, 1, 1, 1, 1, 2, 2, 3],
    percentValues: [0, 0, 0, 0, 0, 0, 0, 0],
    slotWeights: { weapon: 20, helmet: 15, chest: 15, gloves: 15, boots: 10, accessory: 20 },
  },

  skill_speed_level: {
    id: 'skill_speed_level',
    name: '+X to Speed Skills',
    description: 'Increases the level of all Speed category skills.',
    stat: 'skillSpeedLevel',
    category: 'skillLevel',
    isPrefix: false,
    flatValues:    [0, 1, 1, 1, 1, 2, 2, 3],
    percentValues: [0, 0, 0, 0, 0, 0, 0, 0],
    slotWeights: { weapon: 20, helmet: 15, chest: 15, gloves: 15, boots: 10, accessory: 20 },
  },

  skill_crit_level: {
    id: 'skill_crit_level',
    name: '+X to Crit Skills',
    description: 'Increases the level of all Crit category skills.',
    stat: 'skillCritLevel',
    category: 'skillLevel',
    isPrefix: false,
    flatValues:    [0, 1, 1, 1, 1, 2, 2, 3],
    percentValues: [0, 0, 0, 0, 0, 0, 0, 0],
    slotWeights: { weapon: 20, helmet: 15, chest: 15, gloves: 15, boots: 10, accessory: 20 },
  },

  skill_mage_level: {
    id: 'skill_mage_level',
    name: '+X to Mage Skills',
    description: 'Increases the level of all Mage category skills.',
    stat: 'skillMageLevel',
    category: 'skillLevel',
    isPrefix: false,
    flatValues:    [0, 1, 1, 1, 1, 2, 2, 3],
    percentValues: [0, 0, 0, 0, 0, 0, 0, 0],
    slotWeights: { weapon: 20, helmet: 15, chest: 15, gloves: 15, boots: 10, accessory: 20 },
  },

  skill_utility_level: {
    id: 'skill_utility_level',
    name: '+X to Utility Skills',
    description: 'Increases the level of all Utility category skills.',
    stat: 'skillUtilityLevel',
    category: 'skillLevel',
    isPrefix: false,
    flatValues:    [0, 1, 1, 1, 1, 2, 2, 3],
    percentValues: [0, 0, 0, 0, 0, 0, 0, 0],
    slotWeights: { weapon: 20, helmet: 15, chest: 15, gloves: 15, boots: 10, accessory: 20 },
  },

  skill_all_level: {
    id: 'skill_all_level',
    name: '+X to All Skills',
    description: 'Increases the level of all skills.',
    stat: 'skillAllLevel',
    category: 'skillLevel',
    isPrefix: false,
    flatValues:    [0, 1, 1, 1, 1, 1, 2, 2],
    percentValues: [0, 0, 0, 0, 0, 0, 0, 0],
    slotWeights: { weapon: 15, helmet: 20, chest: 10, gloves: 10, boots: 10, accessory: 30 },
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all affixes that can appear on a given equipment slot at a given tier.
 * Filters to affixes with a non-zero weight for the slot and a non-zero value
 * at the given tier.
 */
export function getAffixesForSlot(
  slot: EquipmentSlot,
  tier: number
): AffixDefinition[] {
  return Object.values(AFFIXES).filter((affix) => {
    // Must have weight on this slot
    if (affix.slotWeights[slot] <= 0) return false;

    // Must have a non-zero value at this tier
    const hasFlatValue = affix.flatValues[tier] !== undefined && affix.flatValues[tier] > 0;
    const hasPercentValue = affix.percentValues[tier] !== undefined && affix.percentValues[tier] > 0;

    return hasFlatValue || hasPercentValue;
  });
}
