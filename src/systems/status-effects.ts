// ============================================================================
// Status Effects System — DoT, slows, freezes on monsters (and player)
// ============================================================================
//
// Manages the lifecycle of status effects: application, stacking, ticking,
// expiry. Status effects are stored on MonsterInstance.statusEffects and
// ticked each frame. Freeze has a per-target reapply cooldown.
//
// This system never imports other systems. It reads monster/player data from
// game-state and communicates via the event bus.
// ============================================================================

import type {
  StatusEffectType,
  StatusEffectInstance,
  DamageType,
  MonsterInstance,
} from '@/core/types';
import { on, emit } from '@/core/event-bus';
import {
  getState,
  getPlayer,
  getMonsterById,
} from '@/core/game-state';
import {
  MIN_DAMAGE,
  DEFENSE_CONSTANT,

  BLEED_MAX_STACKS,
  BLEED_DURATION,
  BLEED_TICK_INTERVAL,
  BLEED_DAMAGE_PERCENT,

  POISON_MAX_STACKS,
  POISON_DURATION,
  POISON_TICK_INTERVAL,
  POISON_DAMAGE_PERCENT,

  BURN_MAX_STACKS,
  BURN_DURATION,
  BURN_TICK_INTERVAL,
  BURN_DAMAGE_PERCENT,

  SLOW_SPEED_REDUCTION,
  SLOW_DURATION,

  FREEZE_DURATION,
  FREEZE_REAPPLY_COOLDOWN,
} from '@/data/constants';

// --- Status effect configuration ---

interface StatusConfig {
  maxStacks: number;
  baseDuration: number;
  tickInterval: number;
  damagePercent: number;
  damageStat: 'attack' | 'magicPower';
  damageType: DamageType;
  speedReduction: number; // 0 for non-slow
  reapplyCooldown: number; // 0 for non-freeze
}

const STATUS_CONFIG: Record<StatusEffectType, StatusConfig> = {
  bleed: {
    maxStacks: BLEED_MAX_STACKS,
    baseDuration: BLEED_DURATION,
    tickInterval: BLEED_TICK_INTERVAL,
    damagePercent: BLEED_DAMAGE_PERCENT,
    damageStat: 'attack',
    damageType: 'physical',
    speedReduction: 0,
    reapplyCooldown: 0,
  },
  poison: {
    maxStacks: POISON_MAX_STACKS,
    baseDuration: POISON_DURATION,
    tickInterval: POISON_TICK_INTERVAL,
    damagePercent: POISON_DAMAGE_PERCENT,
    damageStat: 'attack',
    damageType: 'physical',
    speedReduction: 0,
    reapplyCooldown: 0,
  },
  burn: {
    maxStacks: BURN_MAX_STACKS,
    baseDuration: BURN_DURATION,
    tickInterval: BURN_TICK_INTERVAL,
    damagePercent: BURN_DAMAGE_PERCENT,
    damageStat: 'magicPower',
    damageType: 'magic',
    speedReduction: 0,
    reapplyCooldown: 0,
  },
  slow: {
    maxStacks: 1,
    baseDuration: SLOW_DURATION,
    tickInterval: 0, // no damage ticks
    damagePercent: 0,
    damageStat: 'attack',
    damageType: 'physical',
    speedReduction: SLOW_SPEED_REDUCTION,
    reapplyCooldown: 0,
  },
  freeze: {
    maxStacks: 1,
    baseDuration: FREEZE_DURATION,
    tickInterval: 0, // no damage ticks
    damagePercent: 0,
    damageStat: 'attack',
    damageType: 'physical',
    speedReduction: 1.0, // complete stop
    reapplyCooldown: FREEZE_REAPPLY_COOLDOWN,
  },
};

// --- Internal state ---

/**
 * Freeze reapply cooldown per monster.
 * Maps monsterId -> remaining cooldown in seconds.
 * After freeze expires, the monster cannot be frozen again for FREEZE_REAPPLY_COOLDOWN seconds.
 */
const freezeCooldowns = new Map<string, number>();

/**
 * Status effects on the player (from monster attacks or environmental hazards).
 * Stored separately since PlayerState doesn't have statusEffects array.
 */
const playerStatusEffects: StatusEffectInstance[] = [];

// ==========================================================================
// Public API
// ==========================================================================

/**
 * Apply a status effect to a target (monster or player).
 *
 * @param targetId     - monster ID or 'player'
 * @param type         - which status effect to apply
 * @param sourceAttack - snapshot of the source's attack/magicPower at application time
 * @param sourcePotency - multiplier on damage and duration (usually player.statusPotency)
 */
export function applyStatus(
  targetId: string,
  type: StatusEffectType,
  sourceAttack: number,
  sourcePotency: number = 1.0,
): boolean {
  const config = STATUS_CONFIG[type];

  // Freeze reapply cooldown check
  if (type === 'freeze') {
    const cooldown = freezeCooldowns.get(targetId);
    if (cooldown !== undefined && cooldown > 0) {
      return false; // Cannot reapply freeze yet
    }
  }

  // Get the target's status effects array
  const statusEffects = getStatusEffects(targetId);
  if (!statusEffects) return false;

  // Find existing status of this type
  const existing = statusEffects.find(se => se.type === type);

  if (existing) {
    // Refresh duration
    existing.duration = config.baseDuration * sourcePotency;
    existing.tickTimer = Math.min(existing.tickTimer, config.tickInterval);

    // Add stacks (up to max)
    if (existing.stacks < config.maxStacks) {
      existing.stacks++;
    }

    // Update source attack if the new application is stronger
    // (each stack uses the sourceAttack at time of application for independent damage)
    // For simplicity, we track the latest sourceAttack and scale per stack
    existing.sourceAttack = Math.max(existing.sourceAttack, sourceAttack);
    existing.sourcePotency = sourcePotency;

    emit('status:applied', {
      targetId,
      type,
      stacks: existing.stacks,
    });
  } else {
    // Create new status effect
    const newEffect: StatusEffectInstance = {
      type,
      stacks: 1,
      duration: config.baseDuration * sourcePotency,
      tickTimer: config.tickInterval, // first tick after interval
      sourceAttack,
      sourcePotency,
    };

    statusEffects.push(newEffect);

    // For freeze, set the monster AI state to stunned
    if (type === 'freeze' && targetId !== 'player') {
      const monster = getMonsterById(targetId);
      if (monster) {
        monster.aiState = 'stunned';
      }
    }

    emit('status:applied', {
      targetId,
      type,
      stacks: 1,
    });
  }

  return true;
}

/**
 * Remove a specific status effect from a target.
 */
export function removeStatus(targetId: string, type: StatusEffectType): void {
  const statusEffects = getStatusEffects(targetId);
  if (!statusEffects) return;

  const idx = statusEffects.findIndex(se => se.type === type);
  if (idx === -1) return;

  const effect = statusEffects[idx];

  // If removing freeze, start the reapply cooldown
  if (type === 'freeze') {
    freezeCooldowns.set(targetId, FREEZE_REAPPLY_COOLDOWN);

    // Restore monster AI from stunned
    if (targetId !== 'player') {
      const monster = getMonsterById(targetId);
      if (monster && monster.aiState === 'stunned') {
        monster.aiState = 'idle';
      }
    }
  }

  statusEffects.splice(idx, 1);
  emit('status:expired', { targetId, type });
}

/**
 * Remove all status effects from a target.
 */
export function clearAllStatus(targetId: string): void {
  const statusEffects = getStatusEffects(targetId);
  if (!statusEffects) return;

  // Process each removal so we emit proper events
  while (statusEffects.length > 0) {
    const effect = statusEffects[0];
    removeStatus(targetId, effect.type);
  }
}

/**
 * Check if a target has a specific status effect.
 */
export function hasStatus(targetId: string, type: StatusEffectType): boolean {
  const statusEffects = getStatusEffects(targetId);
  if (!statusEffects) return false;

  return statusEffects.some(se => se.type === type);
}

/**
 * Get the number of stacks of a status effect on a target.
 */
export function getStacks(targetId: string, type: StatusEffectType): number {
  const statusEffects = getStatusEffects(targetId);
  if (!statusEffects) return 0;

  const effect = statusEffects.find(se => se.type === type);
  return effect ? effect.stacks : 0;
}

/**
 * Returns the speed multiplier for a target based on active slow/freeze effects.
 * 1.0 = normal speed, 0.7 = slowed (30% reduction), 0.0 = frozen (complete stop).
 */
export function getSlowMultiplier(targetId: string): number {
  const statusEffects = getStatusEffects(targetId);
  if (!statusEffects) return 1.0;

  // Freeze takes priority — complete stop
  if (statusEffects.some(se => se.type === 'freeze')) {
    return 0.0;
  }

  // Slow
  if (statusEffects.some(se => se.type === 'slow')) {
    return 1.0 - SLOW_SPEED_REDUCTION;
  }

  return 1.0;
}

/**
 * Returns true if the target is frozen (complete stun).
 */
export function isFrozen(targetId: string): boolean {
  const statusEffects = getStatusEffects(targetId);
  if (!statusEffects) return false;

  return statusEffects.some(se => se.type === 'freeze');
}

/**
 * Get all active status effects on a target.
 */
export function getActiveStatuses(targetId: string): ReadonlyArray<StatusEffectInstance> {
  const effects = getStatusEffects(targetId);
  return effects ?? [];
}

/**
 * Get remaining freeze cooldown for a target.
 */
export function getFreezeCooldown(targetId: string): number {
  return freezeCooldowns.get(targetId) ?? 0;
}

// ==========================================================================
// Internal helpers
// ==========================================================================

/**
 * Get the mutable status effects array for a target.
 */
function getStatusEffects(targetId: string): StatusEffectInstance[] | null {
  if (targetId === 'player') {
    return playerStatusEffects;
  }

  const monster = getMonsterById(targetId);
  if (!monster) return null;
  return monster.statusEffects;
}

/**
 * Tick a single damaging status effect (bleed, poison, burn).
 * Returns the damage dealt this tick (or 0 if no tick occurred).
 */
function tickDamageEffect(
  targetId: string,
  effect: StatusEffectInstance,
  config: StatusConfig,
  dt: number,
): number {
  if (config.tickInterval <= 0) return 0;

  effect.tickTimer -= dt;

  if (effect.tickTimer <= 0) {
    // Reset tick timer
    effect.tickTimer += config.tickInterval;

    // Calculate tick damage: damagePercent * sourceAttack * stacks * potency
    const tickDamage = Math.max(
      MIN_DAMAGE,
      Math.floor(
        config.damagePercent * effect.sourceAttack * effect.stacks * effect.sourcePotency,
      ),
    );

    // Apply damage to target
    if (targetId === 'player') {
      applyStatusDamageToPlayer(tickDamage, config.damageType, effect.type);
    } else {
      applyStatusDamageToMonster(targetId, tickDamage, config.damageType, effect.type);
    }

    return tickDamage;
  }

  return 0;
}

/**
 * Apply status effect damage to a monster.
 */
function applyStatusDamageToMonster(
  monsterId: string,
  damage: number,
  damageType: DamageType,
  statusType: StatusEffectType,
): void {
  const monster = getMonsterById(monsterId);
  if (!monster || monster.isDead) return;

  // Status damage bypasses armor but not defense
  const reduction = monster.defense / (monster.defense + DEFENSE_CONSTANT);
  const finalDamage = Math.max(MIN_DAMAGE, Math.floor(damage * (1 - reduction)));

  monster.currentHP = Math.max(0, monster.currentHP - finalDamage);

  // Track player stats (status damage counts as player damage)
  const player = getPlayer();
  player.totalDamageDealt += finalDamage;

  emit('status:ticked', {
    targetId: monsterId,
    type: statusType,
    damage: finalDamage,
  });

  emit('combat:damageDealt', {
    targetId: monsterId,
    damage: finalDamage,
    isCrit: false,
    damageType,
    x: monster.x,
    y: monster.y,
  });

  emit('ui:damageNumber', {
    x: monster.x,
    y: monster.y,
    amount: finalDamage,
    isCrit: false,
    damageType,
  });

  // Check death
  if (monster.currentHP <= 0) {
    monster.isDead = true;
    monster.aiState = 'dead';

    emit('monster:died', {
      monsterId,
      x: monster.x,
      y: monster.y,
      xp: monster.xp,
      gold: monster.gold,
      isBoss: monster.isBoss,
    });
  }
}

/**
 * Apply status effect damage to the player.
 */
function applyStatusDamageToPlayer(
  damage: number,
  damageType: DamageType,
  statusType: StatusEffectType,
): void {
  const player = getPlayer();

  // Defense reduction
  const reduction = player.defense / (player.defense + DEFENSE_CONSTANT);
  const finalDamage = Math.max(MIN_DAMAGE, Math.floor(damage * (1 - reduction)));

  const actualDamage = Math.min(player.currentHP, finalDamage);
  player.currentHP -= actualDamage;

  emit('status:ticked', {
    targetId: 'player',
    type: statusType,
    damage: actualDamage,
  });

  emit('ui:damageNumber', {
    x: player.x,
    y: player.y,
    amount: actualDamage,
    isCrit: false,
    damageType,
  });

  // Player death from status damage
  if (player.currentHP <= 0) {
    player.currentHP = 0;
    emit('player:died');
  }
}

// ==========================================================================
// Event handlers
// ==========================================================================

function onStatusApplied(data: {
  targetId: string;
  type: StatusEffectType;
  stacks: number;
}): void {
  // This event is emitted by other systems (skill effects, combat) to request
  // a status application. We delegate to applyStatus with player stats.
  // However, since we also emit 'status:applied' inside applyStatus,
  // we need to avoid infinite recursion. This handler is for EXTERNAL requests.
  // We distinguish by checking if the status is already applied with the given stacks.

  // The external trigger is via the skill-effects system or combat system.
  // They emit 'status:applied' directly. We handle the actual application
  // via a separate event: 'status:requestApply'.
}

function onStatusRequestApply(data: {
  targetId: string;
  type: StatusEffectType;
  sourceAttack: number;
  sourcePotency: number;
}): void {
  applyStatus(data.targetId, data.type, data.sourceAttack, data.sourcePotency);
}

function onMonsterDied(data: {
  monsterId: string;
  x: number;
  y: number;
  xp: number;
  gold: number;
  isBoss: boolean;
}): void {
  // Clean up status effects and freeze cooldowns for dead monster
  const monster = getMonsterById(data.monsterId);
  if (monster) {
    monster.statusEffects.length = 0;
  }
  freezeCooldowns.delete(data.monsterId);
}

// ==========================================================================
// Lifecycle
// ==========================================================================

export function init(): void {
  // Clear all internal state
  freezeCooldowns.clear();
  playerStatusEffects.length = 0;

  // Note: We don't subscribe to 'status:applied' to avoid recursion.
  // Instead, other systems call applyStatus() directly or via a request event.
  on('monster:died', onMonsterDied);
}

export function update(dt: number): void {
  const state = getState();

  // --- Tick freeze reapply cooldowns ---
  for (const [monsterId, cooldown] of freezeCooldowns) {
    const newCooldown = cooldown - dt;
    if (newCooldown <= 0) {
      freezeCooldowns.delete(monsterId);
    } else {
      freezeCooldowns.set(monsterId, newCooldown);
    }
  }

  // --- Tick status effects on all alive monsters ---
  for (const monster of state.monsters) {
    if (monster.isDead) continue;
    tickStatusEffects(monster.id, monster.statusEffects, dt);
  }

  // --- Tick status effects on player ---
  tickStatusEffects('player', playerStatusEffects, dt);
}

/**
 * Tick all status effects on a given target.
 * Handles duration expiry, damage ticks, and cleanup.
 */
function tickStatusEffects(
  targetId: string,
  effects: StatusEffectInstance[],
  dt: number,
): void {
  // Iterate in reverse for safe removal
  for (let i = effects.length - 1; i >= 0; i--) {
    const effect = effects[i];
    const config = STATUS_CONFIG[effect.type];

    // Tick duration
    effect.duration -= dt;

    // Tick damage for DoT effects (bleed, poison, burn)
    if (config.tickInterval > 0) {
      tickDamageEffect(targetId, effect, config, dt);
    }

    // Check expiry
    if (effect.duration <= 0) {
      // If it was a freeze, set the reapply cooldown
      if (effect.type === 'freeze') {
        freezeCooldowns.set(targetId, FREEZE_REAPPLY_COOLDOWN);

        // Restore monster AI from stunned
        if (targetId !== 'player') {
          const monster = getMonsterById(targetId);
          if (monster && monster.aiState === 'stunned') {
            monster.aiState = 'idle';
          }
        }
      }

      effects.splice(i, 1);
      emit('status:expired', { targetId, type: effect.type });
    }
  }
}
