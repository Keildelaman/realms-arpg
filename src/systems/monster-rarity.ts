// ============================================================================
// Monster Rarity System — Rarity rolls, stat scaling, affix assignment
// Pure logic module (no event subscriptions, no Phaser).
// ============================================================================

import type {
  MonsterArchetype,
  MonsterRarity,
  MonsterInstance,
  MonsterAffixInstance,
} from '@/core/types';
import {
  MONSTER_MAGIC_BASE_CHANCE,
  MONSTER_RARE_BASE_CHANCE,
  MONSTER_RARITY_TIER_SCALING,
  MAGIC_HP_MULT,
  MAGIC_DAMAGE_MULT,
  MAGIC_DEFENSE_MULT,
  MAGIC_XP_MULT,
  MAGIC_GOLD_MULT,
  MAGIC_DROP_CHANCE_MULT,
  MAGIC_DROP_RARITY_BOOST,
  MAGIC_AFFIX_COUNT,
  RARE_HP_MULT,
  RARE_DAMAGE_MULT,
  RARE_DEFENSE_MULT,
  RARE_XP_MULT,
  RARE_GOLD_MULT,
  RARE_DROP_CHANCE_MULT,
  RARE_DROP_RARITY_BOOST,
  RARE_AFFIX_COUNT_MIN,
  RARE_AFFIX_COUNT_MAX,
  RARE_MINION_COUNT_MIN,
  RARE_MINION_COUNT_MAX,
} from '@/data/constants';
import { getAllAffixIds, getMonsterAffix } from '@/data/monster-affixes.data';

// --- Rarity Scaling Record ---

export interface RarityScaling {
  hpMult: number;
  damageMult: number;
  defenseMult: number;
  speedMult: number;
  xpMult: number;
  goldMult: number;
  dropChanceMult: number;
  dropRarityBoost: number;
  affixCount: number;
  minionCount: number;
}

// --- Public API ---

/**
 * Roll a rarity for a spawning monster.
 * Bosses and exploders always return 'normal'.
 */
export function rollMonsterRarity(
  zoneTier: number,
  isBoss: boolean,
  archetype: MonsterArchetype,
): MonsterRarity {
  if (isBoss || archetype === 'exploder') return 'normal';

  const tierBonus = (zoneTier - 1) * MONSTER_RARITY_TIER_SCALING;
  const rareChance = MONSTER_RARE_BASE_CHANCE + tierBonus;
  const magicChance = MONSTER_MAGIC_BASE_CHANCE + tierBonus * 2;

  const roll = Math.random();
  if (roll < rareChance) return 'rare';
  if (roll < rareChance + magicChance) return 'magic';
  return 'normal';
}

/**
 * Get the stat scaling multipliers for a given rarity.
 */
export function getRarityScaling(rarity: MonsterRarity): RarityScaling {
  switch (rarity) {
    case 'magic':
      return {
        hpMult: MAGIC_HP_MULT,
        damageMult: MAGIC_DAMAGE_MULT,
        defenseMult: MAGIC_DEFENSE_MULT,
        speedMult: 1.0,
        xpMult: MAGIC_XP_MULT,
        goldMult: MAGIC_GOLD_MULT,
        dropChanceMult: MAGIC_DROP_CHANCE_MULT,
        dropRarityBoost: MAGIC_DROP_RARITY_BOOST,
        affixCount: MAGIC_AFFIX_COUNT,
        minionCount: 0,
      };
    case 'rare':
      return {
        hpMult: RARE_HP_MULT,
        damageMult: RARE_DAMAGE_MULT,
        defenseMult: RARE_DEFENSE_MULT,
        speedMult: 1.05,
        xpMult: RARE_XP_MULT,
        goldMult: RARE_GOLD_MULT,
        dropChanceMult: RARE_DROP_CHANCE_MULT,
        dropRarityBoost: RARE_DROP_RARITY_BOOST,
        affixCount: RARE_AFFIX_COUNT_MIN + Math.floor(Math.random() * (RARE_AFFIX_COUNT_MAX - RARE_AFFIX_COUNT_MIN + 1)),
        minionCount: RARE_MINION_COUNT_MIN + Math.floor(Math.random() * (RARE_MINION_COUNT_MAX - RARE_MINION_COUNT_MIN + 1)),
      };
    default:
      return {
        hpMult: 1.0,
        damageMult: 1.0,
        defenseMult: 1.0,
        speedMult: 1.0,
        xpMult: 1.0,
        goldMult: 1.0,
        dropChanceMult: 1.0,
        dropRarityBoost: 0,
        affixCount: 0,
        minionCount: 0,
      };
  }
}

/**
 * Roll random affixes for a monster. No duplicates.
 */
export function rollAffixes(rarity: MonsterRarity): string[] {
  const scaling = getRarityScaling(rarity);
  if (scaling.affixCount === 0) return [];

  const allIds = getAllAffixIds();
  const selected: string[] = [];

  for (let i = 0; i < scaling.affixCount && allIds.length > 0; i++) {
    const idx = Math.floor(Math.random() * allIds.length);
    selected.push(allIds[idx]);
    allIds.splice(idx, 1);
  }

  return selected;
}

/**
 * Roll minion count for a rare monster.
 */
export function rollMinionCount(rarity: MonsterRarity): number {
  if (rarity !== 'rare') return 0;
  return RARE_MINION_COUNT_MIN + Math.floor(
    Math.random() * (RARE_MINION_COUNT_MAX - RARE_MINION_COUNT_MIN + 1),
  );
}

/**
 * Apply rarity scaling to a monster instance's stats.
 * Mutates the instance in place.
 */
export function applyRarityScaling(
  instance: MonsterInstance,
  rarity: MonsterRarity,
  affixIds: string[],
): void {
  const scaling = getRarityScaling(rarity);

  // Apply rarity multipliers
  instance.maxHP = Math.floor(instance.maxHP * scaling.hpMult);
  instance.currentHP = instance.maxHP;
  instance.attack = Math.floor(instance.attack * scaling.damageMult);
  instance.defense = Math.floor(instance.defense * scaling.defenseMult);
  instance.moveSpeed = Math.floor(instance.moveSpeed * scaling.speedMult);
  instance.xp = Math.floor(instance.xp * scaling.xpMult);
  instance.gold = Math.floor(instance.gold * scaling.goldMult);

  // Apply affix modifiers
  for (const affixId of affixIds) {
    const affix = getMonsterAffix(affixId);
    if (!affix) continue;

    if (affix.hpMultiplier) {
      instance.maxHP = Math.floor(instance.maxHP * affix.hpMultiplier);
      instance.currentHP = instance.maxHP;
    }
    if (affix.damageMultiplier) {
      instance.attack = Math.floor(instance.attack * affix.damageMultiplier);
    }
    if (affix.speedMultiplier) {
      instance.moveSpeed = Math.floor(instance.moveSpeed * affix.speedMultiplier);
    }
    if (affix.armorBonus) {
      instance.armor += affix.armorBonus;
    }
    if (affix.attackCooldownMultiplier) {
      instance.attackCooldown *= affix.attackCooldownMultiplier;
    }
  }

  // Handle shielded affix: add shield
  if (affixIds.includes('shielded')) {
    const shieldAmount = Math.floor(instance.maxHP * 0.3);
    instance.currentShield = shieldAmount;
    instance.maxShield = shieldAmount;
    instance.shieldDamageReduction = 0.5;
  }

  // Set affix instances
  instance.affixes = affixIds.map(id => ({
    id,
    auraCooldown: 0,
    lastTriggerTime: 0,
  }));
}

/**
 * Build a display name based on rarity and affixes.
 */
export function buildRarityName(
  baseName: string,
  rarity: MonsterRarity,
  affixIds: string[],
): string {
  if (rarity === 'normal') return baseName;
  if (rarity === 'magic') return `Magic ${baseName}`;

  // Rare: "<Affix1> <Affix2> <Name>"
  const affixNames = affixIds
    .map(id => getMonsterAffix(id)?.name)
    .filter(Boolean);
  return affixNames.length > 0
    ? `${affixNames.join(' ')} ${baseName}`
    : `Rare ${baseName}`;
}
