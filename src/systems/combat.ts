// ============================================================================
// Combat System — Damage calculation, spatial hit detection, attack processing
// ============================================================================

import type { DamageType, EnemyStateType } from '@/core/types';
import { on, emit } from '@/core/event-bus';
import {
  getState,
  getPlayer,
  getMonsterById,
} from '@/core/game-state';
import {
  MIN_DAMAGE,
  DEFENSE_CONSTANT,
  INVULNERABILITY_AFTER_HIT,
  DEATH_GOLD_LOSS_PERCENT,
  PLAYER_BODY_RADIUS,
  MONSTER_PROJECTILE_PLAYER_KNOCKBACK,
  AFFIX_VAMPIRIC_LEECH,
  AFFIX_FROST_NOVA_RADIUS,
  AFFIX_FROST_NOVA_DAMAGE_MULT,
} from '@/data/constants';
import { deathMilestoneLevel } from '@/data/balance';
import { safeResolvePosition } from './expedition-generation';

// --- Internal state ---

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

/**
 * Apply damage to the player from a monster or other source.
 * Respects invulnerability frames and dash iframes.
 *
 * @param amount - raw damage amount
 * @param source - identifier for the damage source (monster ID, 'status', etc.)
 */
export function damagePlayer(amount: number, source: string, damageType: DamageType = 'physical'): number {
  const player = getPlayer();

  // Invulnerability check — dashing or recently hit
  if (player.isInvulnerable || player.isDashing) return 0;

  // Dodge check — chance to avoid damage entirely
  if (player.dodgeChance > 0 && Math.random() < player.dodgeChance) {
    emit('combat:miss', { targetId: 'player', x: player.x, y: player.y });
    return 0;
  }

  // Type-split defense reduction
  const resistStat = damageType === 'physical' ? player.defense : player.magicResist;
  const reduction = resistStat / (resistStat + DEFENSE_CONSTANT);
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
    damageType,
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

/**
 * Check player projectiles against monsters.
 * Called each frame from update().
 * combat.ts detects collision + emits events; skill-effects.ts handles damage + upgrade logic.
 */
function checkPlayerProjectileHits(): void {
  const state = getState();

  for (const proj of state.projectiles) {
    if (proj.isExpired) continue;
    if (proj.ownerId !== 'player') continue;

    for (const monster of state.monsters) {
      if (monster.isDead) continue;
      if (proj.hitTargets.includes(monster.id)) continue;

      const dx = proj.x - monster.x;
      const dy = proj.y - monster.y;
      const distSq = dx * dx + dy * dy;
      const hitRadius = (monster.size / 2) + proj.size;

      if (distSq <= hitRadius * hitRadius) {
        proj.hitTargets.push(monster.id);

        // Emit hit event — skill-effects.ts handles damage + state application
        emit('projectile:hit', {
          projectileId: proj.id,
          targetId: monster.id,
          x: monster.x,
          y: monster.y,
        });

        if (proj.piercing) {
          if (proj.piercingHitCount !== undefined) {
            proj.piercingHitCount++;
          }
          // Ranger shot pierce: enforce max pierce targets + apply damage falloff
          if (proj.maxPierceTargets != null && proj.hitTargets.length >= proj.maxPierceTargets) {
            proj.isExpired = true;
            emit('projectile:expired', { projectileId: proj.id });
            break;
          }
          // Apply pierce damage falloff to projectile for next hit
          if (proj.pierceDamageFalloff != null) {
            proj.damage = Math.floor(proj.damage * (1 - proj.pierceDamageFalloff));
          }
          // Continue checking other monsters
        } else {
          proj.isExpired = true;
          emit('projectile:expired', { projectileId: proj.id });
          break; // Stop checking for this projectile
        }
      }
    }
  }
}

// --- Enemy State Management ---

/**
 * Apply or refresh an enemy state on a monster.
 * For stackable states (charged), increments stacks up to max.
 * For non-stackable states (sundered, staggered), refreshes duration.
 */
export function applyEnemyState(
  monsterId: string,
  type: EnemyStateType,
  duration: number,
  maxStacks: number = 1,
): void {
  const monster = getMonsterById(monsterId);
  if (!monster || monster.isDead) return;

  if (!monster.enemyStates) monster.enemyStates = [];

  const existing = monster.enemyStates.find(s => s.type === type);
  if (existing) {
    // Refresh duration and increment stacks
    existing.duration = duration;
    existing.stacks = Math.min(maxStacks, existing.stacks + 1);
  } else {
    monster.enemyStates.push({ type, stacks: 1, duration });
  }

  emit('enemyState:applied', {
    monsterId,
    type,
    stacks: existing ? existing.stacks : 1,
    duration,
  });
}

/**
 * Tick all enemy states on all alive monsters. Called from update().
 */
function tickEnemyStates(dt: number): void {
  const state = getState();

  for (const monster of state.monsters) {
    if (monster.isDead || !monster.enemyStates) continue;

    for (let i = monster.enemyStates.length - 1; i >= 0; i--) {
      const es = monster.enemyStates[i];
      es.duration -= dt;

      if (es.duration <= 0) {
        const expiredType = es.type;
        monster.enemyStates.splice(i, 1);
        emit('enemyState:expired', { monsterId: monster.id, type: expiredType });
      }
    }
  }
}

// --- Lifecycle ---

export function init(): void {
  invulnerabilityTimer = 0;

  on('combat:monsterAttack', onMonsterAttack);
  on('monster:died', onMonsterDiedCombat);
}

export function update(dt: number): void {
  const player = getPlayer();

  // --- Tick invulnerability ---
  if (invulnerabilityTimer > 0) {
    invulnerabilityTimer -= dt;
    if (invulnerabilityTimer <= 0) {
      invulnerabilityTimer = 0;
      player.isInvulnerable = false;
    }
  }

  // --- Tick enemy states ---
  tickEnemyStates(dt);

  // --- Check projectile hits ---
  checkMonsterProjectileHits();
  checkPlayerProjectileHits();
}
