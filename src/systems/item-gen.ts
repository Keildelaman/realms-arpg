// ============================================================================
// Item Generation System — Procedural item creation
// ============================================================================

import type {
  ItemInstance,
  AffixInstance,
  EquipmentSlot,
  Rarity,
  AffixDefinition,
} from '@/core/types';
import {
  RARITY_WEIGHTS,
  RARITY_AFFIX_COUNTS,
  EQUIPMENT_SLOTS,
} from '@/data/constants';
import { AFFIXES } from '@/data/affixes.data';
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
 * Uses weighted random selection.
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

  // Fallback (should never reach here)
  return 'common';
}

/**
 * Roll rarity with a bonus weight shift toward higher rarities.
 * Used for shop items and boss drops.
 *
 * @param bonusTier - 0 for normal, 1+ shifts weights toward rare+
 */
function rollRarityWithBonus(bonusTier: number): Rarity {
  if (bonusTier <= 0) return rollRarity();

  // Shift weights: reduce common/uncommon, increase rare+
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

// --- Affix selection ---

/**
 * Select affixes for an item, weighted by slot preference.
 * Ensures no duplicate affixes on the same item.
 *
 * @param count   - number of affixes to pick
 * @param slot    - equipment slot (affects affix weighting)
 * @param exclude - affix IDs to exclude (for preventing duplicates)
 * @returns selected affix definitions
 */
function selectAffixes(
  count: number,
  slot: EquipmentSlot,
  exclude: Set<string> = new Set(),
): AffixDefinition[] {
  const selected: AffixDefinition[] = [];
  const used = new Set(exclude);

  for (let i = 0; i < count; i++) {
    // Build weighted pool of available affixes
    const available = Object.values(AFFIXES).filter(a => !used.has(a.id));
    if (available.length === 0) break;

    // Weight by slot preference
    const weights = available.map(a => a.slotWeights[slot] || 1);
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    if (totalWeight <= 0) break;

    let roll = Math.random() * totalWeight;
    let picked: AffixDefinition | null = null;

    for (let j = 0; j < available.length; j++) {
      roll -= weights[j];
      if (roll <= 0) {
        picked = available[j];
        break;
      }
    }

    if (!picked) picked = available[available.length - 1];

    selected.push(picked);
    used.add(picked.id);
  }

  return selected;
}

/**
 * Roll an affix value within the tier range, with +/-15% variance.
 * Uses whichever value source (flatValues or percentValues) is non-zero.
 *
 * @param affix - the affix definition
 * @param tier  - item tier (1-7)
 * @returns the rolled value
 */
function rollAffixValue(affix: AffixDefinition, tier: number): number {
  const clampedTier = Math.max(1, Math.min(7, tier));

  // Check which value source to use (flat or percent)
  const flatVal = affix.flatValues[clampedTier] ?? 0;
  const pctVal = affix.percentValues[clampedTier] ?? 0;
  const isFlat = flatVal > 0;
  const baseValue = isFlat ? flatVal : pctVal;

  if (baseValue === 0) return 0;

  // Apply +/-15% variance
  const variance = 0.15;
  const minVal = baseValue * (1 - variance);
  const maxVal = baseValue * (1 + variance);
  const rolled = minVal + Math.random() * (maxVal - minVal);

  // For integer flat stats (attack, defense, maxHP, etc.), round to integer
  // For fractional/percent stats, keep 4 decimal precision
  if (isFlat && baseValue >= 1) {
    return Math.max(1, Math.round(rolled));
  }

  return +rolled.toFixed(4);
}

/**
 * Determine how many affixes an item should have based on its rarity.
 * Rolls between the min and max for the rarity.
 */
function rollAffixCount(rarity: Rarity): number {
  const range = RARITY_AFFIX_COUNTS[rarity];
  if (!range) return 1;
  const [min, max] = range;
  return min + Math.floor(Math.random() * (max - min + 1));
}

// --- Item generation ---

/**
 * Generate a random item of the given tier.
 *
 * @param tier         - item tier (1-7), affects stat values and price
 * @param forcedRarity - force a specific rarity instead of rolling
 * @param forcedSlot   - force a specific equipment slot instead of rolling
 * @returns a new ItemInstance
 */
export function generateItem(
  tier: number,
  forcedRarity?: Rarity,
  forcedSlot?: EquipmentSlot,
): ItemInstance {
  const clampedTier = Math.max(1, Math.min(7, tier));

  // 1. Pick slot
  const slot = forcedSlot ?? rollSlot();

  // 2. Roll rarity
  const rarity = forcedRarity ?? rollRarity();

  // 3. Determine affix count
  const affixCount = rollAffixCount(rarity);

  // 4. Select affixes
  const affixDefs = selectAffixes(affixCount, slot);

  // 5. Roll affix values
  const affixes: AffixInstance[] = affixDefs.map(def => ({
    id: def.id,
    value: rollAffixValue(def, clampedTier),
    isPrefix: def.isPrefix,
  }));

  // 6. Generate name
  const name = generateItemName(slot, rarity);

  // 7. Build the item
  const item: ItemInstance = {
    id: generateId(),
    name,
    slot,
    rarity,
    itemLevel: clampedTier * 10, // approximate item level from tier
    tier: clampedTier,
    affixes,
    isImbued: false,
    temperLevel: 0,
    temperCycle: 0,
    reforgeCount: 0,
  };

  return item;
}

/**
 * Generate a specific legendary item.
 *
 * @param legendaryId - the ID of the legendary definition
 * @returns a new legendary ItemInstance, or null if the legendaryId is unknown
 */
export function generateLegendary(legendaryId: string): ItemInstance | null {
  const def = LEGENDARIES[legendaryId];
  if (!def) return null;

  // Use tier 7 for legendaries (highest tier values)
  const tier = 7;

  // Build affixes from the legendary's base affix list
  const affixes: AffixInstance[] = [];
  for (const affixId of def.baseAffixes) {
    const affixDef = AFFIXES[affixId];
    if (!affixDef) continue;

    affixes.push({
      id: affixDef.id,
      value: rollAffixValue(affixDef, tier),
      isPrefix: affixDef.isPrefix,
    });
  }

  // May add 1 random extra affix for legendary items
  const extraAffixDefs = selectAffixes(
    1,
    def.slot,
    new Set(def.baseAffixes),
  );

  for (const extraDef of extraAffixDefs) {
    affixes.push({
      id: extraDef.id,
      value: rollAffixValue(extraDef, tier),
      isPrefix: extraDef.isPrefix,
    });
  }

  const item: ItemInstance = {
    id: generateId(),
    name: def.name,
    slot: def.slot,
    rarity: 'legendary',
    itemLevel: 70,
    tier,
    affixes,
    legendaryId: def.id,
    legendaryEffect: def.effectId,
    isImbued: false,
    temperLevel: 0,
    temperCycle: 0,
    reforgeCount: 0,
  };

  return item;
}

/**
 * Generate an item for the shop. Shop items have slightly better average
 * stats (rolls biased toward higher values within the variance range).
 *
 * @param tier - item tier for the shop's zone
 * @returns a new ItemInstance
 */
export function generateShopItem(tier: number): ItemInstance {
  const clampedTier = Math.max(1, Math.min(7, tier));

  // Shop items use bonus rarity weights (shift toward better rarities)
  const slot = rollSlot();
  const rarity = rollRarityWithBonus(1);
  const affixCount = rollAffixCount(rarity);
  const affixDefs = selectAffixes(affixCount, slot);

  // Roll affix values with higher floor (shop items are slightly better)
  const affixes: AffixInstance[] = affixDefs.map(def => {
    const flatVal = def.flatValues[clampedTier] ?? 0;
    const pctVal = def.percentValues[clampedTier] ?? 0;
    const isFlat = flatVal > 0;
    const baseValue = isFlat ? flatVal : pctVal;

    if (baseValue === 0) {
      return { id: def.id, value: 0, isPrefix: def.isPrefix };
    }

    // Shop variance: -5% to +20% (biased higher than normal -15% to +15%)
    const minVal = baseValue * 0.95;
    const maxVal = baseValue * 1.20;
    let rolled = minVal + Math.random() * (maxVal - minVal);

    // Round appropriately
    if (isFlat && baseValue >= 1) {
      rolled = Math.max(1, Math.round(rolled));
    } else {
      rolled = +rolled.toFixed(4);
    }

    return { id: def.id, value: rolled, isPrefix: def.isPrefix };
  });

  const name = generateItemName(slot, rarity);

  return {
    id: generateId(),
    name,
    slot,
    rarity,
    itemLevel: clampedTier * 10,
    tier: clampedTier,
    affixes,
    isImbued: false,
    temperLevel: 0,
    temperCycle: 0,
    reforgeCount: 0,
  };
}

/**
 * Generate an item for a boss drop (guaranteed rare or better).
 *
 * @param tier - item tier matching the zone
 * @returns a new ItemInstance
 */
export function generateBossItem(tier: number): ItemInstance {
  const rarity = rollRarityMinRare();
  return generateItem(tier, rarity);
}

// --- Lifecycle ---

export function init(): void {
  // Reset the item ID counter
  nextItemId = 1;
}

export function update(_dt: number): void {
  // Item generation is on-demand, no per-frame updates needed.
}
