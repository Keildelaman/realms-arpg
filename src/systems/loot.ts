// ============================================================================
// Loot System — Loot drop generation, spawning, pickup, and despawning
// ============================================================================

import type {
  ItemInstance,
  LootDrop,
} from '@/core/types';
import { on, emit } from '@/core/event-bus';
import {
  getPlayer,
  getMonsterById,
  addToInventory,
} from '@/core/game-state';
import {
  LOOT_MAGNET_RANGE,
  LOOT_DESPAWN_TIME,
  LOOT_DROP_SPREAD,
  BOSS_SECOND_DROP_CHANCE,
  INVENTORY_SIZE,
} from '@/data/constants';
import { getRarityScaling } from '@/systems/monster-rarity';

// --- Internal state ---

/** Active loot drops in the world. */
const activeLootDrops: LootDrop[] = [];

/** Next loot drop ID counter. */
let nextLootId = 1;

/** Speed at which loot moves toward the player during magnet pickup (px/s). */
const LOOT_MAGNET_SPEED = 350;

// --- Loot drop generation callback ---

/**
 * Item generator function, set by the scene/orchestrator.
 * This avoids the loot system importing item-gen directly.
 */
type ItemGenerator = (tier: number, forcedRarity?: string) => ItemInstance;
type BossItemGenerator = (tier: number) => ItemInstance;

let itemGenerator: ItemGenerator | null = null;
let bossItemGenerator: BossItemGenerator | null = null;

/**
 * Set the item generation functions. Called once during setup by the
 * scene/orchestrator to inject the item-gen functions.
 */
export function setItemGenerators(
  normalGen: ItemGenerator,
  bossGen: BossItemGenerator,
): void {
  itemGenerator = normalGen;
  bossItemGenerator = bossGen;
}

// --- Loot rolling ---

/**
 * Roll whether a monster drops loot, and if so, generate the item(s).
 *
 * @param monsterId    - ID of the killed monster
 * @param x            - world X position of the kill
 * @param y            - world Y position of the kill
 * @param dropChance   - 0-1 chance of dropping loot
 * @param isBoss       - whether this was a boss kill
 * @param tier         - zone tier for item generation
 */
export function rollDrop(
  monsterId: string,
  x: number,
  y: number,
  dropChance: number,
  isBoss: boolean,
  tier: number,
): void {
  if (!itemGenerator || !bossItemGenerator) return;

  if (isBoss) {
    // Boss: guaranteed rare+ drop
    const bossItem = bossItemGenerator(tier);
    spawnLoot(bossItem, x, y);

    // 40% chance for second drop
    if (Math.random() < BOSS_SECOND_DROP_CHANCE) {
      const bonusItem = bossItemGenerator(tier);
      // Offset second drop slightly
      const offsetX = x + (Math.random() - 0.5) * LOOT_DROP_SPREAD * 2;
      const offsetY = y + (Math.random() - 0.5) * LOOT_DROP_SPREAD * 2;
      spawnLoot(bonusItem, offsetX, offsetY);
    }
  } else {
    // Normal monster: roll drop chance
    if (Math.random() < dropChance) {
      const item = itemGenerator(tier);
      spawnLoot(item, x, y);
    }
  }
}

// --- Loot spawning ---

/**
 * Spawn a loot drop at the given world position.
 * Adds random spread to the position.
 *
 * @param item - the item to drop
 * @param x    - base world X position
 * @param y    - base world Y position
 */
export function spawnLoot(item: ItemInstance, x: number, y: number): void {
  // Add random spread
  const spreadX = (Math.random() - 0.5) * LOOT_DROP_SPREAD;
  const spreadY = (Math.random() - 0.5) * LOOT_DROP_SPREAD;

  const drop: LootDrop = {
    item,
    x: x + spreadX,
    y: y + spreadY,
    createdAt: Date.now(),
    isPickedUp: false,
    magnetTimer: 0,
  };

  activeLootDrops.push(drop);

  emit('loot:spawned', { item, x: drop.x, y: drop.y });
  emit('item:dropped', { item, x: drop.x, y: drop.y });
}

// --- Loot pickup ---

/**
 * Pick up a specific loot drop by index.
 *
 * @param index - index in the active loot drops array
 * @returns true if the loot was successfully picked up
 */
export function pickupLootByIndex(index: number): boolean {
  if (index < 0 || index >= activeLootDrops.length) return false;

  const drop = activeLootDrops[index];
  if (drop.isPickedUp) return false;

  const player = getPlayer();

  // Check inventory space
  if (player.inventory.length >= INVENTORY_SIZE) return false;

  // Add to inventory
  const added = addToInventory(drop.item);
  if (!added) return false;

  // Mark as picked up
  drop.isPickedUp = true;

  // Emit pickup event
  emit('item:pickedUp', { item: drop.item });

  return true;
}

/**
 * Pick up a loot drop by item ID.
 *
 * @param itemId - ID of the item to pick up
 * @returns true if the loot was successfully picked up
 */
export function pickupLoot(itemId: string): boolean {
  const index = activeLootDrops.findIndex(
    d => d.item.id === itemId && !d.isPickedUp,
  );
  if (index === -1) return false;

  return pickupLootByIndex(index);
}

// --- Query ---

/**
 * Get all active (not picked up, not despawned) loot drops.
 * Used by the scene to render loot sprites.
 */
export function getActiveLootDrops(): LootDrop[] {
  return activeLootDrops.filter(d => !d.isPickedUp);
}

/**
 * Get the count of active loot drops.
 */
export function getActiveLootCount(): number {
  return activeLootDrops.filter(d => !d.isPickedUp).length;
}

/**
 * Remove all active loot drops from the world.
 * Used when transitioning between hub and expeditions.
 */
export function clearAllLootDrops(): void {
  activeLootDrops.length = 0;
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
  // Look up the monster to get its drop chance and zone tier
  const monster = getMonsterById(data.monsterId);

  // Monster may already be removed by the time this fires, so use defaults
  let dropChance = monster?.dropChance ?? 0.15;
  const isBoss = data.isBoss;

  // Apply rarity-based drop chance multiplier
  if (monster) {
    const rarityScaling = getRarityScaling(monster.rarity);
    dropChance *= rarityScaling.dropChanceMult;
  }

  // Determine tier from zone
  const tier = monster ? getTierFromZone(monster.zone) : 1;

  rollDrop(data.monsterId, data.x, data.y, dropChance, isBoss, tier);
}

/**
 * Simple tier lookup from zone ID.
 * In a full implementation this would query the zone data,
 * but to avoid importing zone data (which may not exist yet),
 * we use a basic mapping.
 */
function getTierFromZone(zoneId: string): number {
  const tierMap: Record<string, number> = {
    whisperwood: 1,
    dusthaven: 2,
    frosthollow: 3,
    emberpeak: 4,
    shadowmere: 5,
    crystalspire: 6,
    void_rift: 7,
  };
  return tierMap[zoneId] ?? 1;
}

// --- Lifecycle ---

export function init(): void {
  // Clear all active loot drops
  activeLootDrops.length = 0;
  nextLootId = 1;

  on('monster:died', onMonsterDied);
}

export function update(dt: number): void {
  const player = getPlayer();
  const now = Date.now();

  // Process loot drops in reverse order so we can safely remove
  for (let i = activeLootDrops.length - 1; i >= 0; i--) {
    const drop = activeLootDrops[i];

    // Skip already picked up drops
    if (drop.isPickedUp) {
      activeLootDrops.splice(i, 1);
      continue;
    }

    // Check despawn timer
    const ageSeconds = (now - drop.createdAt) / 1000;
    if (ageSeconds >= LOOT_DESPAWN_TIME) {
      activeLootDrops.splice(i, 1);
      continue;
    }

    // Check player proximity for auto-pickup (loot magnet)
    const dx = player.x - drop.x;
    const dy = player.y - drop.y;
    const distSq = dx * dx + dy * dy;
    const magnetRangeSq = LOOT_MAGNET_RANGE * LOOT_MAGNET_RANGE;

    if (distSq <= magnetRangeSq) {
      // Move loot toward player
      const dist = Math.sqrt(distSq);

      if (dist < 8) {
        // Close enough — pick up
        if (player.inventory.length < INVENTORY_SIZE) {
          const added = addToInventory(drop.item);
          if (added) {
            drop.isPickedUp = true;
            emit('item:pickedUp', { item: drop.item });
            activeLootDrops.splice(i, 1);
          }
        }
      } else {
        // Move toward player
        const moveX = (dx / dist) * LOOT_MAGNET_SPEED * dt;
        const moveY = (dy / dist) * LOOT_MAGNET_SPEED * dt;
        drop.x += moveX;
        drop.y += moveY;
      }
    }
  }
}
