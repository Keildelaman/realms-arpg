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
  KNOCKBACK_DISTANCE_BASE,
  KNOCKBACK_CRIT_MULTIPLIER,
  KNOCKBACK_TWEEN_DURATION,
  INVULNERABILITY_AFTER_HIT,
  DEATH_GOLD_LOSS_PERCENT,
  ATTACK_WINDUP_DURATION,
  ATTACK_SWING_DURATION,
  ATTACK_FOLLOW_THROUGH_DURATION,
  PLAYER_BODY_RADIUS,
  MONSTER_PROJECTILE_PLAYER_KNOCKBACK,
  AFFIX_VAMPIRIC_LEECH,
  AFFIX_FROST_NOVA_RADIUS,
  AFFIX_FROST_NOVA_SLOW_DURATION,
  AFFIX_FROST_NOVA_DAMAGE_MULT,
} from '@/data/constants';
import { calculateDamage, deathMilestoneLevel } from '@/data/balance';
import { safeResolvePosition } from './expedition-generation';

// --- Internal state ---

let attackCooldownTimer = 0;
let invulnerabilityTimer = 0;
let pendingAttackAngle = 0;

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
  targets: ReadonlyArray<{ id: string; x: number; y: number; size?: number }>,
): string[] {
  const halfArcRad = (arcWidth / 2) * (Math.PI / 180);
  const hitIds: string[] = [];

  for (const target of targets) {
    const dx = target.x - px;
    const dy = target.y - py;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const radius = (target.size ?? 0) / 2;

    // Distance check — monster edge within range
    if (dist - radius > range) continue;

    // Angle check — widen arc by the angle the monster radius subtends
    const angleToTarget = Math.atan2(dy, dx);
    let angleDiff = angleToTarget - angle;

    // Normalize to [-PI, PI]
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    const sizeArc = dist > 0 ? Math.atan2(radius, dist) : halfArcRad;
    if (Math.abs(angleDiff) <= halfArcRad + sizeArc) {
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
  targets: ReadonlyArray<{ id: string; x: number; y: number; size?: number }>,
): string[] {
  const hitIds: string[] = [];

  for (const target of targets) {
    const dx = target.x - x;
    const dy = target.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const monsterRadius = (target.size ?? 0) / 2;
    if (dist <= radius + monsterRadius) {
      hitIds.push(target.id);
    }
  }

  return hitIds;
}

// --- Attack execution ---

/**
 * Perform a basic melee attack — enters windup phase.
 * Hit detection happens during the swing phase (in update()).
 */
export function performBasicAttack(angle: number): void {
  const player = getPlayer();

  // Check cooldown or already attacking
  if (attackCooldownTimer > 0) return;
  if (player.attackPhase !== 'none') return;

  // Start cooldown from click time
  player.isAttacking = true;
  attackCooldownTimer = BASIC_ATTACK_COOLDOWN / player.attackSpeed;

  // Enter windup phase
  pendingAttackAngle = angle;
  player.attackPhase = 'windup';
  player.attackPhaseTimer = ATTACK_WINDUP_DURATION;
  player.attackAngle = angle;

  emit('combat:attackWindup', { angle, duration: ATTACK_WINDUP_DURATION });
}

/**
 * Resolve basic attack hits — called when swing phase begins.
 */
function resolveBasicAttackHits(angle: number): void {
  const player = getPlayer();
  const state = getState();

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

  // If nothing was hit, emit a whiff
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

  // Armor penetration: reduce effective defense by player's armorPen fraction
  const player = getPlayer();
  const effectiveDefense = Math.max(0, monster.defense * (1 - player.armorPen));

  // Calculate damage with crit, armor, and (penetrated) defense
  const { damage: calculatedDamage, isCrit } = calculateDamage(
    rawDamage,
    effectiveDefense,
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
  const kbDx = monster.x - player.x;
  const kbDy = monster.y - player.y;
  const kbDist = Math.sqrt(kbDx * kbDx + kbDy * kbDy);
  const knockbackDist = KNOCKBACK_DISTANCE_BASE * (isCrit ? KNOCKBACK_CRIT_MULTIPLIER : 1);
  const fromX = monster.x;
  const fromY = monster.y;
  if (kbDist > 0) {
    const kbTargetX = monster.x + (kbDx / kbDist) * knockbackDist;
    const kbTargetY = monster.y + (kbDy / kbDist) * knockbackDist;
    const state = getState();
    if (state.activeExpedition) {
      const resolved = safeResolvePosition(
        state.activeExpedition.map, monster.x, monster.y,
        kbTargetX, kbTargetY, Math.max(10, monster.size * 0.35),
      );
      monster.x = resolved.x;
      monster.y = resolved.y;
    } else {
      monster.x = kbTargetX;
      monster.y = kbTargetY;
    }
  }

  // Track player stats
  player.totalDamageDealt += finalDamage;

  // Compute impact angle from player to monster
  const impactAngle = Math.atan2(kbDy, kbDx);

  // Emit damage dealt event (for UI damage numbers, etc.)
  emit('combat:damageDealt', {
    targetId: monsterId,
    damage: finalDamage,
    isCrit,
    damageType,
    x: fromX,
    y: fromY,
  });

  // Emit enriched impact event for VFX
  emit('combat:impact', {
    x: fromX,
    y: fromY,
    angle: impactAngle,
    damage: finalDamage,
    isCrit,
    damageType,
    targetId: monsterId,
  });

  // Emit knockback event for smooth visual tween
  if (kbDist > 0) {
    emit('combat:knockback', {
      targetId: monsterId,
      fromX,
      fromY,
      toX: monster.x,
      toY: monster.y,
      duration: KNOCKBACK_TWEEN_DURATION,
    });
  }

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

  // Dodge check — chance to avoid damage entirely
  if (player.dodgeChance > 0 && Math.random() < player.dodgeChance) {
    emit('combat:miss', { targetId: 'player', x: player.x, y: player.y });
    return 0;
  }

  // Apply defense reduction
  const reduction = player.defense / (player.defense + DEFENSE_CONSTANT);
  // Apply flat damage reduction from equipment (capped at 0.75 by player.ts)
  const finalDamage = Math.max(MIN_DAMAGE, Math.floor(amount * (1 - reduction) * (1 - player.damageReduction)));

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
  const state = getState();
  const player = getPlayer();

  // Expedition deaths are handled by the expeditions system.
  if (state.gameMode !== 'expedition') {
    // Apply death penalty: lose 50% gold
    const goldLost = Math.floor(player.gold * DEATH_GOLD_LOSS_PERCENT);
    player.gold -= goldLost;

    // Reset to milestone level (nearest multiple of MILESTONE_INTERVAL below current)
    const milestoneLevel = deathMilestoneLevel(player.level);
    // Note: actual level/stat reset logic is handled by listeners of 'player:died'
    // We just record the milestone for reference
    void milestoneLevel;
  }

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
  const monster = getMonsterById(data.monsterId);

  // Vampiric affix: heal monster for 15% of damage dealt
  if (monster && !monster.isDead && monster.affixes.some(a => a.id === 'vampiric')) {
    const healAmount = Math.floor(data.damage * AFFIX_VAMPIRIC_LEECH);
    if (healAmount > 0) {
      monster.currentHP = Math.min(monster.maxHP, monster.currentHP + healAmount);
      emit('affix:vampiricHeal', { monsterId: data.monsterId, amount: healAmount });
    }
  }

  damagePlayer(data.damage, data.monsterId);
}

function onMonsterDiedCombat(data: {
  monsterId: string;
  x: number;
  y: number;
  xp: number;
  gold: number;
  isBoss: boolean;
}): void {
  const monster = getMonsterById(data.monsterId);
  if (!monster) return;

  // Frost nova affix: on-death AoE damage + slow
  if (monster.affixes.some(a => a.id === 'frost_nova')) {
    const player = getPlayer();
    const dx = player.x - data.x;
    const dy = player.y - data.y;
    const distToPlayer = Math.sqrt(dx * dx + dy * dy);

    if (distToPlayer <= AFFIX_FROST_NOVA_RADIUS) {
      const damage = Math.floor(monster.attack * AFFIX_FROST_NOVA_DAMAGE_MULT);
      damagePlayer(damage, `frost_nova_${data.monsterId}`);

      // Apply slow status to player (handled by status effect system via event)
      emit('affix:frostNova', {
        x: data.x,
        y: data.y,
        radius: AFFIX_FROST_NOVA_RADIUS,
      });
    }
  }

}

/**
 * Check monster projectiles against the player.
 * Called each frame from update().
 */
function checkMonsterProjectileHits(): void {
  const state = getState();
  const player = getPlayer();

  for (const proj of state.projectiles) {
    if (proj.isExpired) continue;
    if (proj.ownerId === 'player') continue;

    // Distance check: projectile vs player
    const dx = proj.x - player.x;
    const dy = proj.y - player.y;
    const distSq = dx * dx + dy * dy;
    const hitRadius = PLAYER_BODY_RADIUS + proj.size;

    if (distSq <= hitRadius * hitRadius) {
      // Hit the player
      const actualDamage = damagePlayer(proj.damage, proj.ownerId);

      // Apply knockback in projectile direction
      if (actualDamage > 0) {
        const projDist = Math.sqrt(proj.velocityX * proj.velocityX + proj.velocityY * proj.velocityY);
        if (projDist > 0) {
          const kbX = player.x + (proj.velocityX / projDist) * MONSTER_PROJECTILE_PLAYER_KNOCKBACK;
          const kbY = player.y + (proj.velocityY / projDist) * MONSTER_PROJECTILE_PLAYER_KNOCKBACK;
          const state = getState();
          if (state.activeExpedition) {
            const resolved = safeResolvePosition(
              state.activeExpedition.map, player.x, player.y,
              kbX, kbY, PLAYER_BODY_RADIUS,
            );
            player.x = resolved.x;
            player.y = resolved.y;
          } else {
            player.x = kbX;
            player.y = kbY;
          }
        }
      }

      // Vampiric affix on projectile owner
      const ownerMonster = getMonsterById(proj.ownerId);
      if (ownerMonster && !ownerMonster.isDead && ownerMonster.affixes.some(a => a.id === 'vampiric')) {
        const healAmount = Math.floor(proj.damage * AFFIX_VAMPIRIC_LEECH);
        if (healAmount > 0) {
          ownerMonster.currentHP = Math.min(ownerMonster.maxHP, ownerMonster.currentHP + healAmount);
          emit('affix:vampiricHeal', { monsterId: proj.ownerId, amount: healAmount });
        }
      }

      // Mark projectile as hit
      if (!proj.piercing) {
        proj.isExpired = true;
        emit('projectile:expired', { projectileId: proj.id });
      }
      proj.hitTargets.push('player');
    }
  }
}

// --- Lifecycle ---

export function init(): void {
  attackCooldownTimer = 0;
  invulnerabilityTimer = 0;
  pendingAttackAngle = 0;

  on('combat:playerAttack', onPlayerAttack);
  on('combat:monsterAttack', onMonsterAttack);
  on('monster:died', onMonsterDiedCombat);
}

export function update(dt: number): void {
  const player = getPlayer();

  // --- Attack phase pipeline ---
  if (player.attackPhase !== 'none') {
    player.attackPhaseTimer -= dt;

    if (player.attackPhaseTimer <= 0) {
      // Phase transition
      if (player.attackPhase === 'windup') {
        // Windup → Swing: resolve hits
        player.attackPhase = 'swing';
        player.attackPhaseTimer = ATTACK_SWING_DURATION;
        emit('combat:attackSwing', { angle: pendingAttackAngle, duration: ATTACK_SWING_DURATION });
        resolveBasicAttackHits(pendingAttackAngle);
      } else if (player.attackPhase === 'swing') {
        // Swing → Follow-through
        player.attackPhase = 'followthrough';
        player.attackPhaseTimer = ATTACK_FOLLOW_THROUGH_DURATION;
        emit('combat:attackFollowThrough', { angle: pendingAttackAngle, duration: ATTACK_FOLLOW_THROUGH_DURATION });
      } else if (player.attackPhase === 'followthrough') {
        // Follow-through → Complete
        player.attackPhase = 'none';
        player.attackPhaseTimer = 0;
        emit('combat:attackComplete');
      }
    }
  }

  // --- Tick attack cooldown ---
  if (attackCooldownTimer > 0) {
    attackCooldownTimer -= dt;
    if (attackCooldownTimer <= 0) {
      attackCooldownTimer = 0;
      player.isAttacking = false;
    }
  }

  // --- Sync cooldown to basic_attack skill state for UI display ---
  const state = getState();
  if (state.skillStates['basic_attack']) {
    state.skillStates['basic_attack'].cooldownRemaining = attackCooldownTimer;
  }

  // --- Tick invulnerability ---
  if (invulnerabilityTimer > 0) {
    invulnerabilityTimer -= dt;
    if (invulnerabilityTimer <= 0) {
      invulnerabilityTimer = 0;
      player.isInvulnerable = false;
    }
  }

  // --- Check monster projectile hits ---
  checkMonsterProjectileHits();
}
