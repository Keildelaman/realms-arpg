// ============================================================================
// Combat System — Damage calculation, spatial hit detection, attack processing
// ============================================================================

import type { DamageType, DamageResult } from '@/core/types';
import { on, emit } from '@/core/event-bus';
import {
  getState,
  getPlayer,
  getMonsterById,
} from '@/core/game-state';
import {
  BASIC_ATTACK_ARC,
  BASIC_ATTACK_RANGE,
  BASIC_ATTACK_DAMAGE,
  BASIC_ATTACK_COOLDOWN,
  MIN_DAMAGE,
  DEFENSE_CONSTANT,
  KNOCKBACK_DISTANCE,
  INVULNERABILITY_AFTER_HIT,
  DEATH_GOLD_LOSS_PERCENT,
} from '@/data/constants';
import { calculateDamage, deathMilestoneLevel } from '@/data/balance';

// --- Internal state ---

let attackCooldownTimer = 0;
let invulnerabilityTimer = 0;

// --- Spatial hit detection ---

/**
 * Check if targets fall within an arc centered on (px, py) facing `angle`.
 * Returns IDs of targets hit.
 *
 * @param px       - source X
 * @param py       - source Y
 * @param angle    - center angle of the arc in radians (0 = right)
 * @param arcWidth - total arc width in degrees
 * @param range    - max distance in pixels
 * @param targets  - list of objects with id, x, y to test
 */
export function checkHitArc(
  px: number,
  py: number,
  angle: number,
  arcWidth: number,
  range: number,
  targets: ReadonlyArray<{ id: string; x: number; y: number }>,
): string[] {
  const halfArcRad = (arcWidth / 2) * (Math.PI / 180);
  const rangeSq = range * range;
  const hitIds: string[] = [];

  for (const target of targets) {
    const dx = target.x - px;
    const dy = target.y - py;
    const distSq = dx * dx + dy * dy;

    // Distance check
    if (distSq > rangeSq) continue;

    // Angle check — compute angle to target and compare with arc
    const angleToTarget = Math.atan2(dy, dx);
    let angleDiff = angleToTarget - angle;

    // Normalize to [-PI, PI]
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    if (Math.abs(angleDiff) <= halfArcRad) {
      hitIds.push(target.id);
    }
  }

  return hitIds;
}

/**
 * Check if targets fall within a circle centered on (x, y) with given radius.
 * Returns IDs of targets hit.
 */
export function checkHitCircle(
  x: number,
  y: number,
  radius: number,
  targets: ReadonlyArray<{ id: string; x: number; y: number }>,
): string[] {
  const radiusSq = radius * radius;
  const hitIds: string[] = [];

  for (const target of targets) {
    const dx = target.x - x;
    const dy = target.y - y;
    if (dx * dx + dy * dy <= radiusSq) {
      hitIds.push(target.id);
    }
  }

  return hitIds;
}

// --- Attack execution ---

/**
 * Perform a basic melee attack in an arc in front of the player.
 * Checks all alive monsters in the current zone for overlap.
 */
export function performBasicAttack(angle: number): void {
  const player = getPlayer();
  const state = getState();

  // Check cooldown
  if (attackCooldownTimer > 0) return;

  // Set attack state
  player.isAttacking = true;
  attackCooldownTimer = BASIC_ATTACK_COOLDOWN / player.attackSpeed;

  // Build target list from alive monsters
  const aliveMonsters = state.monsters.filter(m => !m.isDead);

  // Check arc hit
  const hitIds = checkHitArc(
    player.x,
    player.y,
    angle,
    BASIC_ATTACK_ARC,
    BASIC_ATTACK_RANGE,
    aliveMonsters,
  );

  // Calculate and apply damage to each hit target
  const baseDmg = Math.floor(player.attack * BASIC_ATTACK_DAMAGE);

  for (const monsterId of hitIds) {
    const monster = getMonsterById(monsterId);
    if (!monster || monster.isDead) continue;

    damageMonster(monsterId, baseDmg, player.critChance, player.critDamage, 'physical');
  }

  // If nothing was hit, we can emit a miss/whiff for audio feedback
  if (hitIds.length === 0) {
    const missX = player.x + Math.cos(angle) * BASIC_ATTACK_RANGE * 0.7;
    const missY = player.y + Math.sin(angle) * BASIC_ATTACK_RANGE * 0.7;
    emit('combat:miss', { targetId: 'none', x: missX, y: missY });
  }
}

/**
 * Apply damage to a monster, handling shield and armor mechanics.
 *
 * @param monsterId  - target monster ID
 * @param rawDamage  - base damage before armor/defense
 * @param critChance - attacker's crit chance
 * @param critDmgMul - attacker's crit damage multiplier
 * @param damageType - physical or magic
 */
export function damageMonster(
  monsterId: string,
  rawDamage: number,
  critChance: number,
  critDmgMul: number,
  damageType: DamageType,
): DamageResult | null {
  const monster = getMonsterById(monsterId);
  if (!monster || monster.isDead) return null;

  // Armor flat reduction (armored monster type)
  const armorReduction = monster.armor;

  // Calculate damage with crit, armor, and defense
  const { damage: calculatedDamage, isCrit } = calculateDamage(
    rawDamage,
    monster.defense,
    critChance,
    critDmgMul,
    armorReduction,
  );

  let finalDamage = calculatedDamage;

  // Shield mechanics — shield absorbs damage first with reduction
  if (monster.currentShield > 0) {
    const shieldedDamage = Math.floor(finalDamage * (1 - monster.shieldDamageReduction));
    const absorbedByShield = Math.min(monster.currentShield, shieldedDamage);
    monster.currentShield -= absorbedByShield;

    // Remaining damage passes through to HP
    // Proportion of damage that got past the shield
    const remainingRatio = shieldedDamage > 0
      ? (shieldedDamage - absorbedByShield) / shieldedDamage
      : 0;
    finalDamage = Math.floor(finalDamage * remainingRatio);

    // Shield broken event
    if (monster.currentShield <= 0) {
      monster.currentShield = 0;
      emit('monster:shieldBroken', { monsterId });
    }
  }

  // Apply HP damage
  finalDamage = Math.max(MIN_DAMAGE, finalDamage);
  monster.currentHP = Math.max(0, monster.currentHP - finalDamage);

  // Knockback: push monster away from player
  const player = getPlayer();
  const kbDx = monster.x - player.x;
  const kbDy = monster.y - player.y;
  const kbDist = Math.sqrt(kbDx * kbDx + kbDy * kbDy);
  if (kbDist > 0) {
    monster.x += (kbDx / kbDist) * KNOCKBACK_DISTANCE;
    monster.y += (kbDy / kbDist) * KNOCKBACK_DISTANCE;
  }

  // Track player stats
  player.totalDamageDealt += finalDamage;

  // Emit damage dealt event (for UI damage numbers, etc.)
  emit('combat:damageDealt', {
    targetId: monsterId,
    damage: finalDamage,
    isCrit,
    damageType,
    x: monster.x,
    y: monster.y,
  });

  emit('monster:damaged', {
    monsterId,
    damage: finalDamage,
    isCrit,
    remainingHP: monster.currentHP,
  });

  // Emit UI damage number
  emit('ui:damageNumber', {
    x: monster.x,
    y: monster.y,
    amount: finalDamage,
    isCrit,
    damageType,
  });

  // Check death
  const killed = monster.currentHP <= 0;
  if (killed) {
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

  return {
    damage: finalDamage,
    isCrit,
    damageType,
    killed,
  };
}

/**
 * Apply damage to the player from a monster or other source.
 * Respects invulnerability frames and dash iframes.
 *
 * @param amount - raw damage amount
 * @param source - identifier for the damage source (monster ID, 'status', etc.)
 */
export function damagePlayer(amount: number, source: string): number {
  const player = getPlayer();

  // Invulnerability check — dashing or recently hit
  if (player.isInvulnerable || player.isDashing) return 0;

  // Apply defense reduction
  const reduction = player.defense / (player.defense + DEFENSE_CONSTANT);
  const finalDamage = Math.max(MIN_DAMAGE, Math.floor(amount * (1 - reduction)));

  // Apply damage
  const actualDamage = Math.min(player.currentHP, finalDamage);
  player.currentHP -= actualDamage;

  // Start invulnerability frames
  player.isInvulnerable = true;
  invulnerabilityTimer = INVULNERABILITY_AFTER_HIT;

  emit('player:damaged', { amount: actualDamage, source });

  // Emit UI damage number for player
  emit('ui:damageNumber', {
    x: player.x,
    y: player.y,
    amount: actualDamage,
    isCrit: false,
    damageType: 'physical',
  });

  // Check for player death
  if (player.currentHP <= 0) {
    player.currentHP = 0;
    handlePlayerDeath();
  }

  return actualDamage;
}

// --- Player death ---

function handlePlayerDeath(): void {
  const player = getPlayer();

  // Apply death penalty: lose 50% gold
  const goldLost = Math.floor(player.gold * DEATH_GOLD_LOSS_PERCENT);
  player.gold -= goldLost;

  // Reset to milestone level (nearest multiple of MILESTONE_INTERVAL below current)
  const milestoneLevel = deathMilestoneLevel(player.level);
  // Note: actual level/stat reset logic is handled by listeners of 'player:died'
  // We just record the milestone for reference

  emit('player:died');
}

// --- Event handlers ---

function onPlayerAttack(data: { angle: number; skillId?: string }): void {
  // Only handle basic attacks here (no skillId)
  if (!data.skillId) {
    performBasicAttack(data.angle);
  }
}

function onMonsterAttack(data: { monsterId: string; damage: number }): void {
  damagePlayer(data.damage, data.monsterId);
}

// --- Lifecycle ---

export function init(): void {
  attackCooldownTimer = 0;
  invulnerabilityTimer = 0;

  on('combat:playerAttack', onPlayerAttack);
  on('combat:monsterAttack', onMonsterAttack);
}

export function update(dt: number): void {
  // Tick attack cooldown
  if (attackCooldownTimer > 0) {
    attackCooldownTimer -= dt;
    if (attackCooldownTimer <= 0) {
      attackCooldownTimer = 0;
      const player = getPlayer();
      player.isAttacking = false;
    }
  }

  // Tick invulnerability
  if (invulnerabilityTimer > 0) {
    invulnerabilityTimer -= dt;
    if (invulnerabilityTimer <= 0) {
      invulnerabilityTimer = 0;
      const player = getPlayer();
      player.isInvulnerable = false;
    }
  }
}
