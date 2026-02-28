// ============================================================================
// Balance — Formulas, curves, and scaling functions
// ============================================================================

import {
  BASE_XP_REQUIREMENT,
  XP_GROWTH_RATE,
  BASE_PLAYER_HP,
  HP_PER_LEVEL,
  BASE_PLAYER_ATTACK,
  ATTACK_PER_LEVEL,
  BASE_PLAYER_DEFENSE,
  DEFENSE_PER_LEVEL,
  BASE_PLAYER_MAGIC_POWER,
  MAGIC_POWER_PER_LEVEL,
  DEFENSE_CONSTANT,
  MIN_DAMAGE,
  SP_EVERY_N_LEVELS,
  TIER_FLAT_MULTIPLIERS,
  TIER_PERCENT_MULTIPLIERS,
} from './constants';

// --- XP Curve ---

export function xpForLevel(level: number): number {
  return Math.floor(BASE_XP_REQUIREMENT * Math.pow(XP_GROWTH_RATE, level - 1));
}

/** Cumulative XP needed to reach a level from level 1 */
export function totalXPForLevel(level: number): number {
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += xpForLevel(i);
  }
  return total;
}

// --- Player Stat Scaling ---

export function maxHPAtLevel(level: number): number {
  return BASE_PLAYER_HP + (level - 1) * HP_PER_LEVEL;
}

export function baseAttackAtLevel(level: number): number {
  return BASE_PLAYER_ATTACK + (level - 1) * ATTACK_PER_LEVEL;
}

export function baseDefenseAtLevel(level: number): number {
  return Math.floor(BASE_PLAYER_DEFENSE + (level - 1) * DEFENSE_PER_LEVEL);
}

export function baseMagicPowerAtLevel(level: number): number {
  return Math.floor(BASE_PLAYER_MAGIC_POWER + (level - 1) * MAGIC_POWER_PER_LEVEL);
}

// --- Combat Math ---

export function calculateDamageReduction(defense: number): number {
  return defense / (defense + DEFENSE_CONSTANT);
}

export function calculateDamage(
  attack: number,
  defense: number,
  critChance: number,
  critDamage: number,
  armorReduction: number = 0,
): { damage: number; isCrit: boolean } {
  const isCrit = Math.random() < critChance;
  let baseDmg = isCrit ? Math.floor(attack * critDamage) : attack;

  // Apply armor flat reduction
  baseDmg = Math.max(0, baseDmg - armorReduction);

  // Apply defense % reduction
  const reduction = calculateDamageReduction(defense);
  const finalDamage = Math.max(MIN_DAMAGE, Math.floor(baseDmg * (1 - reduction)));

  return { damage: finalDamage, isCrit };
}

// --- Skill Points ---

export function skillPointsAtLevel(level: number): number {
  return Math.floor(level / SP_EVERY_N_LEVELS);
}

export function skillPointsGainedAtLevel(level: number): number {
  return level % SP_EVERY_N_LEVELS === 0 ? 1 : 0;
}

// --- Monster Scaling ---

export function monsterHP(baseHP: number, hpPerLevel: number, level: number): number {
  return Math.floor(baseHP + hpPerLevel * (level - 1));
}

export function monsterXPReward(baseXP: number, level: number): number {
  return Math.floor(baseXP * (1 + (level - 1) * 0.1));
}

export function monsterGoldReward(baseGold: number, level: number): number {
  return Math.floor(baseGold * (1 + (level - 1) * 0.12));
}

// --- Item Scaling ---

export function affixFlatValue(baseValue: number, tier: number): number {
  const mult = TIER_FLAT_MULTIPLIERS[tier] ?? 1;
  return Math.floor(baseValue * mult);
}

export function affixPercentValue(baseValue: number, tier: number): number {
  const mult = TIER_PERCENT_MULTIPLIERS[tier] ?? 1;
  return +(baseValue * mult).toFixed(2);
}

/** Gold cost of an item based on tier and rarity */
export function itemBasePrice(tier: number, rarityIndex: number): number {
  const tierBase = [0, 150, 500, 1200, 3000, 8000, 20000, 75000];
  const rarityMult = [1, 1.5, 2.5, 4.0, 8.0];
  return Math.floor((tierBase[tier] ?? 150) * (rarityMult[rarityIndex] ?? 1));
}

/** Reforge cost that escalates with count */
export function reforgeCost(baseGold: number, reforgeCount: number): number {
  return Math.floor(baseGold * Math.pow(2.2, reforgeCount));
}

// --- Zone ---

export function zoneMonsterLevel(zoneTier: number, progress: number): number {
  // progress is 0-1 within the zone
  const ranges: [number, number][] = [
    [0, 0], // unused
    [1, 10],
    [10, 20],
    [20, 30],
    [30, 45],
    [45, 60],
    [60, 75],
    [75, 100],
  ];
  const [min, max] = ranges[zoneTier] ?? [1, 10];
  return Math.floor(min + (max - min) * progress);
}

// --- Death ---

export function deathMilestoneLevel(level: number): number {
  return Math.max(1, Math.floor(level / 10) * 10);
}

// --- Ascension ---

export function ascensionBonus(ascensionLevel: number): number {
  return ascensionLevel * 0.05; // 5% per ascension
}
