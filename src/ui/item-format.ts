// ============================================================================
// Item Format — Shared formatting utilities for items and affixes
// Pure functions, no Phaser dependency.
// ============================================================================

/**
 * Affix IDs that use flat (integer) values rather than percentages.
 * These are affixes backed by flatValues[] in affixes.data.ts.
 */
const FLAT_AFFIX_IDS = new Set([
  'flat_attack',
  'flat_magic_power',
  'flat_max_hp',
  'flat_defense',
  'skill_power_level',
  'skill_speed_level',
  'skill_crit_level',
  'skill_mage_level',
  'skill_utility_level',
  'skill_all_level',
]);

/** Human-readable display names for all 36 affix IDs. */
const AFFIX_NAMES: Record<string, string> = {
  // Offensive
  flat_attack:       'Attack',
  flat_magic_power:  'Magic Power',
  crit_chance:       'Crit Chance',
  crit_damage:       'Crit Damage',
  attack_speed:      'Attack Speed',
  armor_penetration: 'Armor Pen',
  // Defensive
  flat_max_hp:       'Max HP',
  flat_defense:      'Defense',
  hp_regen:          'HP Regen',
  dodge_chance:      'Dodge Chance',
  damage_reduction:  'Dmg Reduction',
  // Utility
  move_speed:        'Move Speed',
  energy_regen:      'Energy Regen',
  gold_find:         'Gold Find',
  xp_bonus:          'XP Bonus',
  // Status Chance
  bleed_chance:      'Bleed Chance',
  poison_chance:     'Poison Chance',
  burn_chance:       'Burn Chance',
  slow_chance:       'Slow Chance',
  freeze_chance:     'Freeze Chance',
  // Status Potency
  bleed_potency:     'Bleed Damage',
  poison_potency:    'Poison Damage',
  burn_potency:      'Burn Damage',
  slow_potency:      'Slow Strength',
  freeze_potency:    'Freeze Duration',
  // Skill Power
  skill_power_boost:   'Power Skill Dmg',
  skill_speed_boost:   'Speed Skill Dmg',
  skill_crit_boost:    'Crit Skill Dmg',
  skill_mage_boost:    'Mage Skill Dmg',
  skill_utility_boost: 'Utility Skill Dmg',
  // Skill Level
  skill_power_level:   'Power Skills',
  skill_speed_level:   'Speed Skills',
  skill_crit_level:    'Crit Skills',
  skill_mage_level:    'Mage Skills',
  skill_utility_level: 'Utility Skills',
  skill_all_level:     'All Skills',
};

/**
 * Format an affix value for display.
 * - Flat affixes: "+26" (integer)
 * - Percent affixes: "+3.4%" (× 100, 1 decimal)
 * Works for both positive (pickup/tooltip) and negative (comparison diff) values.
 */
export function formatAffixValue(affixId: string, value: number): string {
  const sign = value >= 0 ? '+' : '';
  if (FLAT_AFFIX_IDS.has(affixId)) {
    return `${sign}${Math.round(value)}`;
  }
  return `${sign}${(value * 100).toFixed(1)}%`;
}

/**
 * Return a human-readable display name for an affix ID.
 * Falls back to generic Title Case conversion if ID is unknown.
 */
export function formatAffixName(affixId: string): string {
  if (AFFIX_NAMES[affixId]) return AFFIX_NAMES[affixId];
  // Generic fallback: snake_case → Title Case
  return affixId
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Format a player stat value for display in the stats panel.
 * - Flat stats (attack, defense, magicPower, maxHP, moveSpeed): integer
 * - critChance, critDamage: percentage string (×100)
 * - attackSpeed: 2 decimal places
 */
export function formatStatValue(statKey: string, value: number): string {
  switch (statKey) {
    case 'attack':
    case 'defense':
    case 'magicPower':
    case 'maxHP':
    case 'moveSpeed':
      return String(Math.round(value));
    case 'critChance':
      return `${(value * 100).toFixed(1)}%`;
    case 'critDamage':
      return `${(value * 100).toFixed(0)}%`;
    case 'attackSpeed':
      return value.toFixed(2);
    default:
      return String(Math.round(value));
  }
}
