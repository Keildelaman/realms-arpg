// ============================================================================
// Health System — HP management, regen, death handling
// ============================================================================

import { on, emit } from '@/core/event-bus';
import {
  getPlayer,
  healPlayer,
} from '@/core/game-state';
import {
  maxHPAtLevel,
} from '@/data/balance';

// --- Internal state ---

/** Accumulated time for HP regen ticks (ticks every 1 second). */
let regenTickTimer = 0;
const REGEN_TICK_INTERVAL = 1.0; // seconds

/**
 * Bonus HP regen per second from equipment.
 * This is recalculated when 'player:statsChanged' fires.
 */
let equipmentHPRegen = 0;

// --- Event handlers ---

function onPlayerDamaged(data: { amount: number; source: string }): void {
  // HP is already reduced by the combat system before this event fires.
  // We just ensure HP is clamped.
  const player = getPlayer();
  player.currentHP = Math.max(0, Math.min(player.currentHP, player.maxHP));
}

function onPlayerHealed(data: { amount: number; source: string }): void {
  const player = getPlayer();
  const actualHeal = healPlayer(data.amount);

  if (actualHeal > 0) {
    emit('ui:damageNumber', {
      x: player.x,
      y: player.y,
      amount: actualHeal,
      isCrit: false,
      damageType: 'physical',
      isHeal: true,
    });
  }
}

function onStatsChanged(): void {
  const player = getPlayer();

  // Recalculate max HP from level
  const newMaxHP = maxHPAtLevel(player.level);

  // If max HP increased, scale current HP proportionally
  if (newMaxHP > player.maxHP) {
    const ratio = player.currentHP / player.maxHP;
    player.maxHP = newMaxHP;
    player.currentHP = Math.max(1, Math.floor(newMaxHP * ratio));
  } else {
    player.maxHP = newMaxHP;
    player.currentHP = Math.min(player.currentHP, player.maxHP);
  }

  // Read HP regen from equipment (future: sum from item affixes)
  // For now, equipmentHPRegen is set by the player system via statsChanged
  // We scan equipment for hpRegen affixes
  let regenSum = 0;
  const equipment = player.equipment;
  for (const slot of Object.keys(equipment) as Array<keyof typeof equipment>) {
    const item = equipment[slot];
    if (!item) continue;
    for (const affix of item.affixes) {
      // Convention: affixes with id containing 'hpRegen' contribute to HP regen
      if (affix.id.includes('hpRegen')) {
        regenSum += affix.value;
      }
    }
  }
  equipmentHPRegen = regenSum;
}

function onLevelUp(data: { level: number; hpGain: number }): void {
  const player = getPlayer();

  // Update max HP for new level
  player.maxHP = maxHPAtLevel(data.level);

  // Heal the HP gained from leveling
  player.currentHP = Math.min(player.currentHP + data.hpGain, player.maxHP);
}

// --- Lifecycle ---

export function init(): void {
  regenTickTimer = 0;
  equipmentHPRegen = 0;

  on('player:damaged', onPlayerDamaged);
  on('player:healed', onPlayerHealed);
  on('player:statsChanged', onStatsChanged);
  on('player:levelUp', onLevelUp);
}

export function update(dt: number): void {
  const player = getPlayer();

  // Dead players don't regen
  if (player.currentHP <= 0) return;

  // HP regen tick (base 0 + equipment bonuses)
  const totalRegen = equipmentHPRegen; // base regen is 0

  if (totalRegen > 0) {
    regenTickTimer += dt;

    while (regenTickTimer >= REGEN_TICK_INTERVAL) {
      regenTickTimer -= REGEN_TICK_INTERVAL;

      const regenAmount = Math.floor(totalRegen);
      if (regenAmount > 0 && player.currentHP < player.maxHP) {
        const healed = healPlayer(regenAmount);

        if (healed > 0) {
          emit('player:healed', { amount: healed, source: 'regen' });
        }
      }
    }
  } else {
    // Reset timer when no regen to avoid accumulating
    regenTickTimer = 0;
  }

  // Clamp HP
  player.currentHP = Math.max(0, Math.min(player.currentHP, player.maxHP));
}

/**
 * Get the current equipment-based HP regen per second.
 */
export function getHPRegenRate(): number {
  return equipmentHPRegen;
}
