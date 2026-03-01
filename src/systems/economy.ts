// ============================================================================
// Economy System — Gold management, shop, and purchasing
// ============================================================================

import type { ItemInstance } from '@/core/types';
import { on, emit } from '@/core/event-bus';
import {
  getState,
  getPlayer,
  addGold,
  spendGold,
} from '@/core/game-state';
import {
  SHOP_SIZE,
  SHOP_REFRESH_BASE_COST,
  SHOP_REFRESH_COST_MULTIPLIER,
} from '@/data/constants';
import { itemBasePrice } from '@/data/balance';

// --- Internal state ---

/** Number of times the shop has been refreshed (drives escalating cost). */
let shopRefreshCount = 0;

// --- Gold management ---

/**
 * Grant gold to the player, applying ascension bonuses.
 *
 * @param amount - base gold amount before bonuses
 */
export function grantGold(amount: number): void {
  const player = getPlayer();

  // Apply ascension gold bonus: +5% per ascension level
  const ascensionMultiplier = 1 + player.ascensionLevel * 0.05;
  // Apply gold find bonus from equipment
  const goldFindMultiplier = 1 + player.goldFind;
  const finalGold = Math.floor(amount * ascensionMultiplier * goldFindMultiplier);

  addGold(finalGold);

  emit('economy:goldChanged', { amount: finalGold, total: player.gold });
}

/**
 * Attempt to spend gold for a purchase.
 *
 * @param cost - the gold cost
 * @returns true if the player had enough gold and it was spent
 */
export function purchase(cost: number): boolean {
  const player = getPlayer();

  if (player.gold < cost) return false;

  const success = spendGold(cost);
  if (success) {
    emit('economy:goldChanged', { amount: -cost, total: player.gold });
  }
  return success;
}

/**
 * Get the current gold balance.
 */
export function getGold(): number {
  return getPlayer().gold;
}

// --- Shop management ---

/**
 * Generate a fresh shop inventory for the given tier.
 * Uses the item-gen system indirectly — the scene/caller is responsible
 * for passing generated items. This avoids system-to-system imports.
 *
 * Instead, we provide a callback-based approach: the caller provides
 * a generator function that creates shop items.
 *
 * @param shopItems - pre-generated array of shop items
 */
export function setShopItems(shopItems: ItemInstance[]): void {
  const state = getState();
  state.shopItems = shopItems;
}

/**
 * Generate shop with a provided item generator function.
 * This allows the scene to pass in the item-gen function without
 * the economy system importing item-gen directly.
 *
 * @param tier      - zone tier for item generation
 * @param generator - function that creates a shop item for a given tier
 */
export function generateShop(
  tier: number,
  generator: (tier: number) => ItemInstance,
): void {
  const state = getState();
  const items: ItemInstance[] = [];

  for (let i = 0; i < SHOP_SIZE; i++) {
    items.push(generator(tier));
  }

  state.shopItems = items;
  shopRefreshCount = 0;
  state.shopRefreshCost = SHOP_REFRESH_BASE_COST;
}

/**
 * Refresh the shop with new items. Cost escalates with each refresh.
 *
 * @param tier      - zone tier for item generation
 * @param generator - function that creates a shop item for a given tier
 * @returns true if the refresh was successful (player could afford it)
 */
export function refreshShop(
  tier: number,
  generator: (tier: number) => ItemInstance,
): boolean {
  const state = getState();
  const cost = getRefreshCost();

  // Attempt to spend gold
  if (!purchase(cost)) return false;

  // Generate new shop items
  const items: ItemInstance[] = [];
  for (let i = 0; i < SHOP_SIZE; i++) {
    items.push(generator(tier));
  }

  state.shopItems = items;

  // Escalate refresh cost
  shopRefreshCount += 1;
  state.shopRefreshCost = getRefreshCost();

  return true;
}

/**
 * Get the current shop refresh cost.
 */
export function getRefreshCost(): number {
  return Math.floor(
    SHOP_REFRESH_BASE_COST * Math.pow(SHOP_REFRESH_COST_MULTIPLIER, shopRefreshCount),
  );
}

/**
 * Purchase a specific item from the shop.
 *
 * @param itemIndex - index of the item in the shop array
 * @returns the purchased item, or null if purchase failed
 */
export function purchaseShopItem(itemIndex: number): ItemInstance | null {
  const state = getState();
  const player = getPlayer();

  if (itemIndex < 0 || itemIndex >= state.shopItems.length) return null;

  const item = state.shopItems[itemIndex];
  if (!item) return null;

  // Calculate shop price (full item value, not sell price)
  const rarityIndex = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 }[item.rarity] ?? 0;
  const price = itemBasePrice(item.tier, rarityIndex);

  // Attempt purchase
  if (!purchase(price)) return null;

  // Remove from shop
  state.shopItems.splice(itemIndex, 1);

  // Emit purchase event
  emit('economy:purchase', { cost: price, itemName: item.name });

  return item;
}

/**
 * Get the current shop items.
 */
export function getShopItems(): ItemInstance[] {
  return getState().shopItems;
}

/**
 * Get the price for a shop item at the given index.
 */
export function getShopItemPrice(itemIndex: number): number {
  const state = getState();
  if (itemIndex < 0 || itemIndex >= state.shopItems.length) return 0;

  const item = state.shopItems[itemIndex];
  if (!item) return 0;

  const rarityIndex = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 }[item.rarity] ?? 0;
  return itemBasePrice(item.tier, rarityIndex);
}

/** Returns the current shop refresh count (for save serialization). */
export function getShopRefreshCount(): number {
  return shopRefreshCount;
}

/** Restores shopRefreshCount from a save file. */
export function restoreShopRefreshCount(count: number): void {
  shopRefreshCount = Math.max(0, Math.floor(count));
  // Sync derived cost into state
  getState().shopRefreshCost = getRefreshCost();
}

// --- Event handlers ---

function onMonsterDied(data: {
  monsterId: string;
  x: number;
  y: number;
  xp: number;
  gold: number;
  isBoss: boolean;
}): void {
  grantGold(data.gold);
}

// --- Lifecycle ---

export function init(): void {
  shopRefreshCount = 0;

  on('monster:died', onMonsterDied);
}

export function update(_dt: number): void {
  // Economy is event-driven. No per-frame updates needed.
}
