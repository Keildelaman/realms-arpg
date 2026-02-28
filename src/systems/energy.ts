// ============================================================================
// Energy System — Resource management for skill usage
// ============================================================================

import { on, emit } from '@/core/event-bus';
import {
  getPlayer,
  addEnergy as stateAddEnergy,
  spendEnergy as stateSpendEnergy,
} from '@/core/game-state';
import {
  ENERGY_REGEN_PER_SECOND,
  ENERGY_ON_KILL,
  ENERGY_ON_BOSS_KILL,
  ENERGY_ON_CRIT,
} from '@/data/constants';

// --- Internal state ---

/** Accumulated fractional energy from regen (handles sub-1 regen rates). */
let regenAccumulator = 0;

/** Bonus energy regen per second from equipment/buffs. */
let bonusEnergyRegen = 0;

// --- Public API ---

/**
 * Attempt to spend energy. Returns true if the player had enough.
 * Emits 'energy:changed' on success or 'energy:insufficient' on failure.
 */
export function spendEnergy(amount: number, skillId?: string): boolean {
  const player = getPlayer();

  if (player.currentEnergy < amount) {
    if (skillId) {
      emit('energy:insufficient', { skillId, cost: amount });
    }
    return false;
  }

  stateSpendEnergy(amount);
  emitChanged();
  return true;
}

/**
 * Grant energy (clamped to max). Emits 'energy:changed'.
 */
export function grantEnergy(amount: number): void {
  if (amount <= 0) return;
  stateAddEnergy(amount);
  emitChanged();
}

// --- Helpers ---

function emitChanged(): void {
  const player = getPlayer();
  emit('energy:changed', {
    current: player.currentEnergy,
    max: player.maxEnergy,
  });
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
  if (data.isBoss) {
    grantEnergy(ENERGY_ON_BOSS_KILL);
  } else {
    grantEnergy(ENERGY_ON_KILL);
  }
}

function onDamageDealt(data: {
  targetId: string;
  damage: number;
  isCrit: boolean;
  damageType: string;
  x: number;
  y: number;
}): void {
  if (data.isCrit) {
    grantEnergy(ENERGY_ON_CRIT);
  }
}

function onStatsChanged(): void {
  // Recalculate bonus energy regen from equipment
  const player = getPlayer();
  let regenSum = 0;

  const equipment = player.equipment;
  for (const slot of Object.keys(equipment) as Array<keyof typeof equipment>) {
    const item = equipment[slot];
    if (!item) continue;
    for (const affix of item.affixes) {
      if (affix.id.includes('energyRegen')) {
        regenSum += affix.value;
      }
    }
  }
  bonusEnergyRegen = regenSum;
}

function onSkillUsed(data: { skillId: string; x: number; y: number; angle: number }): void {
  // Energy spending for skills is handled by the skill system before emitting skill:used.
  // This handler is here as a hook for potential future effects (e.g., energy refund passives).
}

// --- Lifecycle ---

export function init(): void {
  regenAccumulator = 0;
  bonusEnergyRegen = 0;

  on('monster:died', onMonsterDied);
  on('combat:damageDealt', onDamageDealt);
  on('player:statsChanged', onStatsChanged);
  on('skill:used', onSkillUsed);
}

export function update(dt: number): void {
  const player = getPlayer();

  // Dead players don't regen energy
  if (player.currentHP <= 0) return;

  // Already at max
  if (player.currentEnergy >= player.maxEnergy) {
    regenAccumulator = 0;
    return;
  }

  // Passive energy regen
  const totalRegen = ENERGY_REGEN_PER_SECOND + bonusEnergyRegen;
  regenAccumulator += totalRegen * dt;

  // Grant whole units
  if (regenAccumulator >= 1) {
    const toGrant = Math.floor(regenAccumulator);
    regenAccumulator -= toGrant;
    stateAddEnergy(toGrant);
    emitChanged();
  }
}

/**
 * Get the current total energy regen rate (base + bonuses).
 */
export function getEnergyRegenRate(): number {
  return ENERGY_REGEN_PER_SECOND + bonusEnergyRegen;
}
