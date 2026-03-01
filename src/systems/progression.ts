// ============================================================================
// Progression System — XP, leveling, and skill points
// ============================================================================

import { on, emit } from '@/core/event-bus';
import {
  getPlayer,
  addXP,
} from '@/core/game-state';
import {
  SP_EVERY_N_LEVELS,
  MAX_LEVEL,
} from '@/data/constants';
import {
  xpForLevel,
  maxHPAtLevel,
  baseAttackAtLevel,
  baseDefenseAtLevel,
  baseMagicPowerAtLevel,
  skillPointsGainedAtLevel,
} from '@/data/balance';

// --- XP granting ---

/**
 * Grant XP to the player, applying ascension bonuses.
 * Automatically checks for level-ups (including multi-level-ups).
 *
 * @param amount - base XP amount before bonuses
 */
export function grantXP(amount: number): void {
  const player = getPlayer();

  // Don't grant XP at max level
  if (player.level >= MAX_LEVEL) return;

  // Apply ascension XP bonus: +5% per ascension level
  const ascensionMultiplier = 1 + player.ascensionLevel * 0.05;
  // Apply XP bonus from equipment
  const xpBonusMultiplier = 1 + player.xpBonus;
  const finalXP = Math.floor(amount * ascensionMultiplier * xpBonusMultiplier);

  // Add XP to player state
  addXP(finalXP);

  // Emit XP gained event
  emit('player:xpGained', { amount: finalXP, source: 'monster' });

  // Check for level-ups (handle multi-level-ups from big XP drops)
  checkLevelUp();
}

/**
 * Check if the player has enough XP to level up, and process
 * all pending level-ups sequentially.
 */
function checkLevelUp(): void {
  const player = getPlayer();

  while (player.xp >= player.xpToNext && player.level < MAX_LEVEL) {
    // Consume XP for this level
    player.xp -= player.xpToNext;

    // Increment level
    player.level += 1;

    // Recalculate base stats for new level
    const prevMaxHP = player.maxHP;
    player.baseAttack = baseAttackAtLevel(player.level);
    player.baseDefense = baseDefenseAtLevel(player.level);
    player.baseMagicPower = baseMagicPowerAtLevel(player.level);

    // Calculate new max HP
    const newMaxHP = maxHPAtLevel(player.level);
    const hpGain = newMaxHP - prevMaxHP;

    // Update XP requirement for next level
    player.xpToNext = xpForLevel(player.level);

    // Grant skill point if level is a multiple of SP_EVERY_N_LEVELS
    const spGained = skillPointsGainedAtLevel(player.level);
    if (spGained > 0) {
      player.skillPoints += spGained;
    }

    // Full heal on level up
    player.maxHP = newMaxHP;
    player.currentHP = player.maxHP;

    // Emit level-up event
    emit('player:levelUp', {
      level: player.level,
      hpGain,
    });

    // Trigger stat recalculation (equipment + skills + buffs)
    emit('player:statsChanged');
  }

  // Handle max level: clamp XP
  if (player.level >= MAX_LEVEL) {
    player.xp = 0;
    player.xpToNext = 0;
  }
}

/**
 * Get the total SP earned across all levels.
 */
export function getTotalSPEarned(): number {
  const player = getPlayer();
  return Math.floor(player.level / SP_EVERY_N_LEVELS);
}

/**
 * Get the SP that have been spent on skills.
 */
export function getSPSpent(): number {
  const player = getPlayer();
  let spent = 0;

  for (const skillId of player.unlockedSkills) {
    const level = player.skillLevels[skillId] ?? 0;
    // Each skill costs unlockCost to unlock, then 1 SP per additional level
    // Since skills start at level 1 when unlocked, additional levels = level - 1
    // Total SP for a skill = unlockCost + (level - 1)
    // But we don't have access to skill data here (no system imports),
    // so we just count the unlock cost as 1 plus level-ups
    spent += level; // Each level costs 1 SP (including the first unlock)
  }

  return spent;
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
  grantXP(data.xp);

  // Track kills
  const player = getPlayer();
  player.monstersKilled += 1;
}

// --- Lifecycle ---

export function init(): void {
  on('monster:died', onMonsterDied);
}

export function update(_dt: number): void {
  // Progression is event-driven. No per-frame updates needed.
  // XP is granted via events, level-ups are checked immediately.
}
