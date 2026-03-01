// ============================================================================
// Item Generation System — Procedural item creation
// ============================================================================

import type {
  ItemInstance,
  AffixInstance,
  EquipmentSlot,
  Rarity,
  AffixDefinition,
  AffixCategory,
} from '@/core/types';
import {
  RARITY_WEIGHTS,
  RARITY_AFFIX_COUNTS,
  RARITY_MAX_MINUS_ONE_CHANCE,
  EQUIPMENT_SLOTS,
  TIER_FLAT_MULTIPLIERS,
  TIER_PERCENT_MULTIPLIERS,
  SLOT_CATEGORY_WEIGHTS,
  STATUS_AFFIX_IDS,
  SKILL_LEVEL_AFFIX_IDS,
  MAX_STATUS_AFFIXES_PER_ITEM,
  MAX_SKILL_LEVEL_AFFIXES_PER_ITEM,
  AFFIX_REROLL_MAX_ATTEMPTS,
} from '@/data/constants';
import { AFFIXES, AFFIXES_BY_CATEGORY } from '@/data/affixes.data';
import { LEGENDARIES } from '@/data/legendaries.data';
import { generateItemName } from '@/data/item-names.data';

// --- ID generation ---

let nextItemId = 1;

function generateId(): string {
  return `item_${nextItemId++}_${Date.now().toString(36)}`;
}

// --- Rarity rolling ---

/**
 * Roll a rarity based on the RARITY_WEIGHTS distribution.
 */
function rollRarity(): Rarity {
  const entries = Object.entries(RARITY_WEIGHTS);
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * totalWeight;

  for (const [rarity, weight] of entries) {
    roll -= weight;
    if (roll <= 0) {
      return rarity as Rarity;
    }
  }

  return 'common';
}

/**
 * Roll rarity with a bonus weight shift toward higher rarities.
 */
function rollRarityWithBonus(bonusTier: number): Rarity {
  if (bonusTier <= 0) return rollRarity();

  const adjusted: Record<string, number> = { ...RARITY_WEIGHTS };
  const shift = bonusTier * 10;

  adjusted['common'] = Math.max(5, (adjusted['common'] ?? 55) - shift * 2);
  adjusted['uncommon'] = Math.max(5, (adjusted['uncommon'] ?? 30) - shift);
  adjusted['rare'] = (adjusted['rare'] ?? 12) + shift;
  adjusted['epic'] = (adjusted['epic'] ?? 2.8) + shift * 0.5;
  adjusted['legendary'] = (adjusted['legendary'] ?? 0.2) + shift * 0.1;

  const entries = Object.entries(adjusted);
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * totalWeight;

  for (const [rarity, weight] of entries) {
    roll -= weight;
    if (roll <= 0) {
      return rarity as Rarity;
    }
  }

  return 'common';
}

/**
 * Roll a rarity that is at least 'rare' (for boss drops).
 */
function rollRarityMinRare(): Rarity {
  const guaranteed: Rarity[] = ['rare', 'epic', 'legendary'];
  const weights = [60, 30, 10];
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;

  for (let i = 0; i < guaranteed.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return guaranteed[i];
  }

  return 'rare';
}

// --- Slot rolling ---

function rollSlot(): EquipmentSlot {
  const idx = Math.floor(Math.random() * EQUIPMENT_SLOTS.length);
  return EQUIPMENT_SLOTS[idx] as EquipmentSlot;
}

// --- Weighted random helper ---

/**
 * Pick a key from a weight map using weighted random selection.
 */
function weightedRandom(weights: Record<string, number>): string {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;

  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return key;
  }

  // Fallback to last key
  return entries[entries.length - 1][0];
}

// --- Affix validation ---

/**
 * Validate whether an affix can be added to an item given existing affixes.
 * Rules:
 *   1. No exact duplicate IDs
 *   2. Max 2 status affixes total (chance + potency combined)
 *   3. Max 1 skill level affix
 */
function validateAffix(affixId: string, existing: AffixInstance[]): boolean {
  // Rule 1: no exact duplicate
  if (existing.some(a => a.id === affixId)) return false;

  // Rule 2: max 2 status affixes (chance + potency combined)
  if (STATUS_AFFIX_IDS.has(affixId)) {
    if (existing.filter(a => STATUS_AFFIX_IDS.has(a.id)).length >= MAX_STATUS_AFFIXES_PER_ITEM) {
      return false;
    }
  }

  // Rule 3: max 1 skill level affix
  if (SKILL_LEVEL_AFFIX_IDS.has(affixId)) {
    if (existing.some(a => SKILL_LEVEL_AFFIX_IDS.has(a.id))) {
      return false;
    }
  }

  return true;
}

// --- Affix rolling ---

/**
 * Roll one affix for the given slot using 2-tier weighted selection.
 * Tier 1: pick category by SLOT_CATEGORY_WEIGHTS[slot]
 * Tier 2: pick specific affix by within-category weight
 * Retries up to AFFIX_REROLL_MAX_ATTEMPTS times to satisfy validation rules.
 *
 * @returns the selected AffixDefinition, or null if all retries exhausted
 */
function rollAffix(slot: EquipmentSlot, existing: AffixInstance[]): AffixDefinition | null {
  for (let attempt = 0; attempt < AFFIX_REROLL_MAX_ATTEMPTS; attempt++) {
    // Tier 1: pick category
    const categoryWeights = SLOT_CATEGORY_WEIGHTS[slot] as Record<string, number>;
    const category = weightedRandom(categoryWeights) as AffixCategory;
    const pool = AFFIXES_BY_CATEGORY[category];
    if (!pool || pool.length === 0) continue;

    // Tier 2: pick specific affix by within-category weight
    const affixWeightMap: Record<string, number> = {};
    for (const a of pool) {
      affixWeightMap[a.id] = a.weight;
    }
    const affixId = weightedRandom(affixWeightMap);

    if (validateAffix(affixId, existing)) {
      return AFFIXES[affixId];
    }
  }

  return null; // all retries exhausted
}

// --- Skill level value table ---

/**
 * Zone-range weighted roll for skill_level affixes.
 * Tiers 1-2: always +1; tiers 3-6: chance of +2; tier 7: chance of +3.
 */
const SKILL_LEVEL_ZONE_RANGES: Record<number, Record<number, number>> = {
  1: { 1: 1.0 },
  2: { 1: 1.0 },
  3: { 1: 0.80, 2: 0.20 },
  4: { 1: 0.80, 2: 0.20 },
  5: { 1: 0.60, 2: 0.40 },
  6: { 1: 0.60, 2: 0.40 },
  7: { 1: 0.50, 2: 0.35, 3: 0.15 },
};

function rollSkillLevelForTier(tier: number): number {
  const table = SKILL_LEVEL_ZONE_RANGES[Math.max(1, Math.min(7, tier))];
  if (!table) return 1;
  return Number(weightedRandom(Object.fromEntries(
    Object.entries(table).map(([k, v]) => [k, v]),
  )));
}

// --- Affix value rolling ---

/**
 * Roll an affix value for the given tier.
 * Flat affixes scale via TIER_FLAT_MULTIPLIERS, percentage via TIER_PERCENT_MULTIPLIERS.
 * Skill level affixes use a separate zone-based weighted table.
 */
function rollAffixValue(affix: AffixDefinition, tier: number): number {
  const clampedTier = Math.max(1, Math.min(7, tier));

  if (SKILL_LEVEL_AFFIX_IDS.has(affix.id)) {
    return rollSkillLevelForTier(clampedTier);
  }

  if (affix.scaleType === 'flat') {
    const mult = TIER_FLAT_MULTIPLIERS[clampedTier];
    const min = Math.floor(affix.t1Min * mult);
    const max = Math.floor(affix.t1Max * mult);
    return Math.max(1, Math.floor(Math.random() * (max - min + 1)) + min);
  }

  // percentage
  const mult = TIER_PERCENT_MULTIPLIERS[clampedTier];
  const min = affix.t1Min * mult;
  const max = affix.t1Max * mult;
  const rolled = min + Math.random() * (max - min);
  return Math.round(rolled * 10000) / 10000;
}

// --- Affix count rolling ---

/**
 * Determine how many affixes an item should have based on rarity.
 * Uses RARITY_MAX_MINUS_ONE_CHANCE to sometimes roll (max - 1).
 */
function rollAffixCount(rarity: Rarity): number {
  const max = RARITY_AFFIX_COUNTS[rarity];
  const downgradeChance = RARITY_MAX_MINUS_ONE_CHANCE[rarity] ?? 0;
  return Math.random() < downgradeChance ? Math.max(0, max - 1) : max;
}

// --- Item generation ---

/**
 * Generate a random item of the given tier.
 */
export function generateItem(
  tier: number,
  forcedRarity?: Rarity,
  forcedSlot?: EquipmentSlot,
): ItemInstance {
  const clampedTier = Math.max(1, Math.min(7, tier));

  const slot = forcedSlot ?? rollSlot();
  const rarity = forcedRarity ?? rollRarity();
  const affixCount = rollAffixCount(rarity);

  // Roll affixes one at a time with validation
  const affixList: AffixInstance[] = [];
  for (let i = 0; i < affixCount; i++) {
    const def = rollAffix(slot, affixList);
    if (!def) continue;
    affixList.push({
      id: def.id,
      value: rollAffixValue(def, clampedTier),
      isPrefix: def.isPrefix,
    });
  }

  const name = generateItemName(slot, rarity);

  return {
    id: generateId(),
    name,
    slot,
    rarity,
    itemLevel: clampedTier * 10,
    tier: clampedTier,
    affixes: affixList,
    isImbued: false,
    temperLevel: 0,
    temperCycle: 0,
    reforgeCount: 0,
  };
}

/**
 * Generate a specific legendary item.
 */
export function generateLegendary(legendaryId: string): ItemInstance | null {
  const def = LEGENDARIES[legendaryId];
  if (!def) return null;

  const tier = 7;

  const affixList: AffixInstance[] = [];
  for (const affixId of def.baseAffixes) {
    const affixDef = AFFIXES[affixId];
    if (!affixDef) continue;
    affixList.push({
      id: affixDef.id,
      value: rollAffixValue(affixDef, tier),
      isPrefix: affixDef.isPrefix,
    });
  }

  // One random extra affix for legendary items
  const extraDef = rollAffix(def.slot, affixList);
  if (extraDef) {
    affixList.push({
      id: extraDef.id,
      value: rollAffixValue(extraDef, tier),
      isPrefix: extraDef.isPrefix,
    });
  }

  return {
    id: generateId(),
    name: def.name,
    slot: def.slot,
    rarity: 'legendary',
    itemLevel: 70,
    tier,
    affixes: affixList,
    legendaryId: def.id,
    legendaryEffect: def.effectId,
    isImbued: false,
    temperLevel: 0,
    temperCycle: 0,
    reforgeCount: 0,
  };
}

/**
 * Generate an item for the shop. Shop items bias rolled values toward the
 * top of the range (lower 30% excluded).
 */
export function generateShopItem(tier: number): ItemInstance {
  const clampedTier = Math.max(1, Math.min(7, tier));

  const slot = rollSlot();
  const rarity = rollRarityWithBonus(1);
  const affixCount = rollAffixCount(rarity);

  const affixList: AffixInstance[] = [];
  for (let i = 0; i < affixCount; i++) {
    const def = rollAffix(slot, affixList);
    if (!def) continue;

    // Shop bias: roll in top 70% of range
    let value: number;
    if (SKILL_LEVEL_AFFIX_IDS.has(def.id)) {
      value = rollSkillLevelForTier(clampedTier);
    } else if (def.scaleType === 'flat') {
      const mult = TIER_FLAT_MULTIPLIERS[clampedTier];
      const min = Math.floor(def.t1Min * mult);
      const max = Math.floor(def.t1Max * mult);
      const shopMin = min + Math.floor((max - min) * 0.3);
      value = Math.max(1, Math.floor(Math.random() * (max - shopMin + 1)) + shopMin);
    } else {
      const mult = TIER_PERCENT_MULTIPLIERS[clampedTier];
      const min = def.t1Min * mult;
      const max = def.t1Max * mult;
      const shopMin = min + (max - min) * 0.3;
      value = Math.round((shopMin + Math.random() * (max - shopMin)) * 10000) / 10000;
    }

    affixList.push({ id: def.id, value, isPrefix: def.isPrefix });
  }

  const name = generateItemName(slot, rarity);

  return {
    id: generateId(),
    name,
    slot,
    rarity,
    itemLevel: clampedTier * 10,
    tier: clampedTier,
    affixes: affixList,
    isImbued: false,
    temperLevel: 0,
    temperCycle: 0,
    reforgeCount: 0,
  };
}

/**
 * Generate an item for a boss drop (guaranteed rare or better).
 */
export function generateBossItem(tier: number): ItemInstance {
  const rarity = rollRarityMinRare();
  return generateItem(tier, rarity);
}

// --- Lifecycle ---

export function init(): void {
  nextItemId = 1;
}

export function update(_dt: number): void {
  // Item generation is on-demand, no per-frame updates needed.
}
