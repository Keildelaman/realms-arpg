// ============================================================================
// Items System — Equipment and inventory management
// ============================================================================

import type {
  ItemInstance,
  EquipmentSlot,
  Rarity,
  AffixInstance,
} from '@/core/types';
import { emit } from '@/core/event-bus';
import {
  getPlayer,
  addToInventory,
  removeFromInventory,
  equipItem as stateEquipItem,
  unequipItem as stateUnequipItem,
  addGold,
} from '@/core/game-state';
import {
  SELL_PRICE_RATIO,
  INVENTORY_SIZE,
} from '@/data/constants';
import { itemBasePrice } from '@/data/balance';

// --- Rarity index for price calculation ---

const RARITY_INDEX: Record<Rarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

// --- Item value calculation ---

/**
 * Calculate the gold value of an item based on its rarity, tier, and affix count.
 * Higher-tier items with more affixes are worth more.
 */
export function getItemValue(item: ItemInstance): number {
  const rarityIdx = RARITY_INDEX[item.rarity];
  const basePrice = itemBasePrice(item.tier, rarityIdx);

  // Bonus for extra affixes beyond the minimum for the rarity
  const affixBonus = 1 + item.affixes.length * 0.08;

  // Temper bonus
  const temperBonus = 1 + item.temperLevel * 0.05;

  // Imbue bonus
  const imbueBonus = item.isImbued ? 1.25 : 1.0;

  return Math.floor(basePrice * affixBonus * temperBonus * imbueBonus);
}

// --- Item comparison ---

/**
 * Compare two items and return the stat differences.
 * Positive values mean item `a` is better than item `b` for that stat.
 * Negative values mean item `b` is better.
 */
export function compareItems(
  a: ItemInstance,
  b: ItemInstance,
): Record<string, number> {
  const diffs: Record<string, number> = {};

  // Aggregate affix values for each item
  const statsA = aggregateAffixes(a.affixes);
  const statsB = aggregateAffixes(b.affixes);

  // Collect all stat keys
  const allStats = new Set([...Object.keys(statsA), ...Object.keys(statsB)]);

  for (const stat of allStats) {
    const valA = statsA[stat] ?? 0;
    const valB = statsB[stat] ?? 0;
    const diff = valA - valB;
    if (diff !== 0) {
      diffs[stat] = diff;
    }
  }

  return diffs;
}

/**
 * Sum affix values by stat ID for an item's affixes.
 */
function aggregateAffixes(affixes: AffixInstance[]): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const affix of affixes) {
    stats[affix.id] = (stats[affix.id] ?? 0) + affix.value;
  }
  return stats;
}

// --- Equipment management ---

/**
 * Equip an item from the inventory to its appropriate equipment slot.
 * If the slot is already occupied, the existing item is swapped back to inventory.
 *
 * @param itemId - ID of the item in inventory to equip
 * @returns true if the item was successfully equipped
 */
export function equipItem(itemId: string): boolean {
  const player = getPlayer();

  // Find item in inventory
  const item = player.inventory.find(i => i.id === itemId);
  if (!item) return false;

  const slot = item.slot;

  // Check if slot is already occupied
  const existingItem = player.equipment[slot];

  // Remove the item from inventory
  const removed = removeFromInventory(itemId);
  if (!removed) return false;

  // If there's an existing item, move it to inventory
  if (existingItem) {
    // We need space in inventory (we just freed one slot by removing)
    addToInventory(existingItem);
    emit('item:unequipped', { item: existingItem, slot });
  }

  // Equip the new item
  stateEquipItem(removed);

  // Emit events
  emit('item:equipped', { item: removed, slot });
  emit('player:statsChanged');

  return true;
}

/**
 * Unequip an item from an equipment slot back to inventory.
 *
 * @param slot - the equipment slot to unequip
 * @returns true if the item was successfully unequipped
 */
export function unequipItem(slot: EquipmentSlot): boolean {
  const player = getPlayer();

  // Check if slot has an item
  const item = player.equipment[slot];
  if (!item) return false;

  // Check if inventory has space
  if (player.inventory.length >= INVENTORY_SIZE) return false;

  // Remove from equipment
  const removed = stateUnequipItem(slot);
  if (!removed) return false;

  // Add to inventory
  addToInventory(removed);

  // Emit events
  emit('item:unequipped', { item: removed, slot });
  emit('player:statsChanged');

  return true;
}

/**
 * Sell an item from inventory for gold.
 *
 * @param itemId - ID of the item to sell
 * @returns the gold earned, or 0 if the item was not found
 */
export function sellItem(itemId: string): number {
  const player = getPlayer();

  // Find and remove the item from inventory
  const item = player.inventory.find(i => i.id === itemId);
  if (!item) return 0;

  const goldValue = Math.floor(getItemValue(item) * SELL_PRICE_RATIO);

  const removed = removeFromInventory(itemId);
  if (!removed) return 0;

  // Grant gold
  addGold(goldValue);

  // Emit events
  emit('item:sold', { item: removed, gold: goldValue });
  emit('economy:goldChanged', { amount: goldValue, total: player.gold });

  return goldValue;
}

// --- Lifecycle ---

export function init(): void {
  // The items system primarily responds to direct function calls from
  // the UI/scene layer, but we also listen for item events for logging/tracking.
}

export function update(_dt: number): void {
  // Items system is event-driven, no per-frame updates needed.
}
