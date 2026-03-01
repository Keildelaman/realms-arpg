// ============================================================================
// Monster Ability System — Ability cooldowns, casting, firing, projectiles
// Pure logic module: no Phaser imports. Emits events for visuals.
// ============================================================================

import type {
  MonsterInstance,
  MonsterAbilityDef,
  ProjectileInstance,
} from '@/core/types';
import { on, emit } from '@/core/event-bus';
import { getState, getPlayer, getMonsterById } from '@/core/game-state';
import { getMonsterAbility } from '@/data/monster-abilities.data';
import { getMonsterDefinition } from '@/systems/zones';
import { safeResolvePosition } from './expedition-generation';

// --- Internal state ---

let nextTelegraphId = 0;
let nextProjectileId = 0;

// --- Public API ---

/**
 * Initialize the ability system. Subscribe to events.
 */
export function init(): void {
  nextTelegraphId = 0;
  nextProjectileId = 0;

  on('monster:died', onMonsterDied);
}

/**
 * Update abilities for a single monster each frame.
 * Ticks cooldowns, manages casting, fires abilities on completion.
 *
 * @returns true if the monster is currently casting (caller should skip normal AI movement)
 */
export function updateAbilities(
  monster: MonsterInstance,
  dt: number,
  playerX: number,
  playerY: number,
): boolean {
  // Tick all cooldowns
  for (const abilityId of Object.keys(monster.abilityCooldowns)) {
    if (monster.abilityCooldowns[abilityId] > 0) {
      monster.abilityCooldowns[abilityId] -= dt;
    }
  }

  // Currently casting an ability
  if (monster.currentAbility) {
    const ability = getMonsterAbility(monster.currentAbility);
    if (!ability) {
      monster.currentAbility = null;
      return false;
    }

    monster.abilityCastTimer -= dt;

    if (monster.abilityCastTimer <= 0) {
      // Cast complete — fire the ability
      fireAbility(monster, ability);
      monster.currentAbility = null;
      return false;
    }

    // Still casting — caller should respect moveDuringCast
    return !ability.moveDuringCast;
  }

  // Not casting — check if we can start a new ability
  const def = getMonsterDefinition(monster.definitionId);
  if (!def || def.abilities.length === 0) return false;

  const distToPlayer = distance(monster.x, monster.y, playerX, playerY);

  // Try each ability (prioritize higher cooldown abilities = stronger ones first)
  for (const abilityId of def.abilities) {
    const ability = getMonsterAbility(abilityId);
    if (!ability) continue;

    // Check cooldown
    if ((monster.abilityCooldowns[abilityId] ?? 0) > 0) continue;

    // Check activation range
    if (distToPlayer > ability.activationRange) continue;

    // Start casting
    startAbilityCast(monster, ability, playerX, playerY);
    return !ability.moveDuringCast;
  }

  return false;
}

/**
 * Cancel the current ability cast (e.g., on stun or knockback).
 */
export function cancelAbility(monsterId: string): void {
  const monster = getMonsterById(monsterId);
  if (!monster || !monster.currentAbility) return;

  const abilityId = monster.currentAbility;
  monster.currentAbility = null;
  monster.abilityCastTimer = 0;

  emit('monster:abilityCancelled', { monsterId, abilityId });
}

// --- Internal ---

function startAbilityCast(
  monster: MonsterInstance,
  ability: MonsterAbilityDef,
  playerX: number,
  playerY: number,
): void {
  monster.currentAbility = ability.id;
  monster.abilityCastTimer = ability.castTime;

  // Determine target position based on targeting mode
  const target = resolveTarget(monster, ability, playerX, playerY);
  monster.abilityTargetX = target.x;
  monster.abilityTargetY = target.y;

  // Emit cast start event
  emit('monster:abilityCastStart', {
    monsterId: monster.id,
    abilityId: ability.id,
    targetX: target.x,
    targetY: target.y,
    castTime: ability.castTime,
  });

  // Create telegraph
  const telegraphId = `telegraph_${nextTelegraphId++}`;
  emit('telegraph:created', {
    id: telegraphId,
    monsterId: monster.id,
    shape: ability.telegraph.shape,
    x: ability.targeting === 'self' ? monster.x : target.x,
    y: ability.targeting === 'self' ? monster.y : target.y,
    radius: ability.radius,
    color: ability.telegraph.color,
    duration: ability.castTime,
  });
}

function resolveTarget(
  monster: MonsterInstance,
  ability: MonsterAbilityDef,
  playerX: number,
  playerY: number,
): { x: number; y: number } {
  switch (ability.targeting) {
    case 'self':
      return { x: monster.x, y: monster.y };

    case 'player':
      return { x: playerX, y: playerY };

    case 'player_predict': {
      // Lead the shot based on player velocity
      const player = getPlayer();
      const dx = playerX - monster.x;
      const dy = playerY - monster.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const projSpeed = ability.projectile?.speed ?? 250;
      const timeToHit = dist / projSpeed;

      return {
        x: playerX + player.velocityX * timeToHit * 0.7,
        y: playerY + player.velocityY * timeToHit * 0.7,
      };
    }

    case 'random_near': {
      const angle = Math.random() * Math.PI * 2;
      const range = 50 + Math.random() * 100;
      return {
        x: playerX + Math.cos(angle) * range,
        y: playerY + Math.sin(angle) * range,
      };
    }

    default:
      return { x: playerX, y: playerY };
  }
}

function fireAbility(monster: MonsterInstance, ability: MonsterAbilityDef): void {
  const player = getPlayer();

  // Set cooldown
  monster.abilityCooldowns[ability.id] = ability.cooldown;

  // Dash to target if applicable (e.g., leaping_strike)
  if (ability.dashToTarget) {
    const state = getState();
    if (state.activeExpedition) {
      const resolved = safeResolvePosition(
        state.activeExpedition.map, monster.x, monster.y,
        monster.abilityTargetX, monster.abilityTargetY,
        Math.max(10, monster.size * 0.35),
      );
      monster.x = resolved.x;
      monster.y = resolved.y;
    } else {
      monster.x = monster.abilityTargetX;
      monster.y = monster.abilityTargetY;
    }
  }

  // Projectile abilities
  if (ability.projectile) {
    spawnMonsterProjectiles(monster, ability, monster.abilityTargetX, monster.abilityTargetY);
  }

  // AoE abilities (non-projectile)
  if (ability.radius && !ability.projectile) {
    const aoeX = ability.targeting === 'self' ? monster.x : monster.abilityTargetX;
    const aoeY = ability.targeting === 'self' ? monster.y : monster.abilityTargetY;
    const distToPlayer = distance(aoeX, aoeY, player.x, player.y);

    if (distToPlayer <= ability.radius) {
      const damage = Math.floor(monster.attack * ability.damageMultiplier);
      emit('combat:monsterAttack', {
        monsterId: monster.id,
        damage,
      });
    }
  }

  // Cone abilities (cleave)
  if (ability.width && ability.length && !ability.projectile && !ability.radius) {
    const angleToPlayer = Math.atan2(
      player.y - monster.y,
      player.x - monster.x,
    );
    const distToPlayer = distance(monster.x, monster.y, player.x, player.y);

    if (distToPlayer <= ability.length) {
      // Check if player is within the cone arc
      const angleToTarget = Math.atan2(
        monster.abilityTargetY - monster.y,
        monster.abilityTargetX - monster.x,
      );
      let angleDiff = Math.abs(angleToPlayer - angleToTarget);
      if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
      const halfArc = (ability.width / 2) * (Math.PI / 180);

      if (angleDiff <= halfArc) {
        const damage = Math.floor(monster.attack * ability.damageMultiplier);
        emit('combat:monsterAttack', {
          monsterId: monster.id,
          damage,
        });
      }
    }
  }

  emit('monster:abilityCastComplete', {
    monsterId: monster.id,
    abilityId: ability.id,
  });
}

function spawnMonsterProjectiles(
  monster: MonsterInstance,
  ability: MonsterAbilityDef,
  targetX: number,
  targetY: number,
): void {
  const proj = ability.projectile!;
  const count = proj.count;

  const dx = targetX - monster.x;
  const dy = targetY - monster.y;
  const baseAngle = Math.atan2(dy, dx);

  const spreadRad = (proj.spread / 2) * (Math.PI / 180);

  for (let i = 0; i < count; i++) {
    let angle: number;
    if (count === 1) {
      angle = baseAngle;
    } else {
      // Distribute evenly across spread
      const t = i / (count - 1);
      angle = baseAngle - spreadRad + t * spreadRad * 2;
    }

    const vx = Math.cos(angle) * proj.speed;
    const vy = Math.sin(angle) * proj.speed;

    const projectile: ProjectileInstance = {
      id: `mproj_${nextProjectileId++}`,
      ownerId: monster.id,
      x: monster.x,
      y: monster.y,
      velocityX: vx,
      velocityY: vy,
      speed: proj.speed,
      damage: Math.floor(monster.attack * ability.damageMultiplier),
      damageType: ability.damageType,
      piercing: proj.piercing,
      hitTargets: [],
      maxDistance: proj.maxDistance,
      distanceTraveled: 0,
      isExpired: false,
      color: proj.color,
      size: proj.size,
    };

    getState().projectiles.push(projectile);
    emit('projectile:spawned', { projectile });
  }
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
  // Cancel any active ability cast
  const monster = getMonsterById(data.monsterId);
  if (monster && monster.currentAbility) {
    const abilityId = monster.currentAbility;
    monster.currentAbility = null;
    monster.abilityCastTimer = 0;
    emit('monster:abilityCancelled', { monsterId: data.monsterId, abilityId });
  }
}

// --- Helpers ---

function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}
