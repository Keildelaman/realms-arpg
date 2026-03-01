// ============================================================================
// Monster AI System — 5 archetype AI profiles + type modifiers + affix ticks
// ============================================================================

import type {
  MonsterInstance,
  MonsterAIState,
  StatusEffectType,
} from '@/core/types';
import { on, emit } from '@/core/event-bus';
import {
  getState,
  getPlayer,
  getMonsterById,
} from '@/core/game-state';
import { ZONES } from '@/data/zones.data';
import { resolveMovementAgainstMap, isPointWalkable, safeResolvePosition } from './expedition-generation';
import { updateAbilities, cancelAbility } from './monster-abilities';
import {
  SLOW_SPEED_REDUCTION,
  DEATH_ANIMATION_DURATION,
  SWIFT_ESCAPE_THRESHOLD,
  SWIFT_ESCAPE_SPEED_MULT,
  DEFAULT_WINDUP_DURATION,
  REGEN_RATE_DEFAULT,
  RANGED_DEFAULT_PREFERRED_RANGE,
  RANGED_RETREAT_THRESHOLD_RATIO,
  RANGED_DEFAULT_RETREAT_SPEED_RATIO,
  CASTER_DEFAULT_PREFERRED_RANGE,
  CASTER_DEFAULT_RETREAT_SPEED_RATIO,
  CHARGER_DEFAULT_WINDUP,
  CHARGER_DEFAULT_SPEED,
  CHARGER_DEFAULT_DAMAGE_MULT,
  CHARGER_DEFAULT_DISTANCE,
  CHARGER_ACTIVATION_RANGE,
  CHARGER_COOLDOWN,
  CHARGER_RECOVERY_DURATION,
  EXPLODER_DEFAULT_FUSE_TIME,
  EXPLODER_DEFAULT_RADIUS,
  EXPLODER_DEFAULT_DAMAGE_MULT,
  EXPLODER_FUSE_ACTIVATION_RANGE,
  EXPLODER_DEATH_DAMAGE_RATIO,
  AFFIX_TELEPORT_COOLDOWN,
  AFFIX_TELEPORT_RANGE,
  AFFIX_TELEPORT_OFFSET,
  AFFIX_FRENZY_AURA_RADIUS,
  AFFIX_FRENZY_DAMAGE_MULT,
  AFFIX_FRENZY_ATTACK_SPEED_MULT,
  MONSTER_WANDER_RADIUS,
  MONSTER_WANDER_SPEED_RATIO,
  MONSTER_WANDER_PAUSE_MIN,
  MONSTER_WANDER_PAUSE_MAX,
  MONSTER_WANDER_ARRIVAL_DIST,
} from '@/data/constants';
import { getMonsterDefinition } from '@/systems/zones';

// --- Constants ---

const LEASH_MULTIPLIER = 1.5;
const SEPARATION_RADIUS = 24;
const SEPARATION_FORCE = 80;
const FLEE_DURATION = 3.0;

// --- Main AI dispatch ---

/**
 * Update AI for a single monster. Dispatches by archetype.
 */
export function updateMonster(
  monster: MonsterInstance,
  dt: number,
  playerX: number,
  playerY: number,
): void {
  // Dead monsters only tick death timer
  if (monster.isDead) {
    monster.deathTimer -= dt;
    return;
  }

  // Stuck recovery: if monster is somehow in an unwalkable cell, snap to nearest walkable
  const state = getState();
  if (state.activeExpedition) {
    const r = Math.max(10, monster.size * 0.35);
    if (!isPointWalkable(state.activeExpedition.map, monster.x, monster.y, r)) {
      const safe = safeResolvePosition(
        state.activeExpedition.map, monster.x, monster.y, monster.x, monster.y, r,
      );
      monster.x = safe.x;
      monster.y = safe.y;
    }
  }

  // Check status effects
  const isFrozen = hasStatusEffect(monster, 'freeze');
  const isSlowed = hasStatusEffect(monster, 'slow');
  const speedMod = isSlowed ? (1 - SLOW_SPEED_REDUCTION) : 1.0;

  // Frozen monsters are fully stunned
  if (isFrozen && monster.aiState !== 'stunned' && monster.aiState !== 'dead') {
    return;
  }

  // Apply type-specific passives (regen, etc.)
  applyTypePassives(monster, dt);

  // Handle stunned state (shared across all archetypes)
  if (monster.aiState === 'stunned') {
    updateStunned(monster, dt);
    return;
  }

  // Handle recovering state (post-charge vulnerability)
  if (monster.aiState === 'recovering') {
    monster.aiTimer -= dt;
    if (monster.aiTimer <= 0) {
      transitionTo(monster, 'chase');
    }
    return;
  }

  // Update abilities (ticks cooldowns, manages casting)
  const isCasting = updateAbilities(monster, dt, playerX, playerY);

  // If casting and ability says don't move, skip movement AI
  if (isCasting) {
    monster.aiState = 'casting';
    return;
  }

  // If was casting but no longer, go back to chase
  if (monster.aiState === 'casting') {
    transitionTo(monster, 'chase');
  }

  // Dispatch by archetype
  switch (monster.archetype) {
    case 'melee':
      updateMeleeAI(monster, dt, playerX, playerY, speedMod);
      break;
    case 'ranged':
      updateRangedAI(monster, dt, playerX, playerY, speedMod);
      break;
    case 'caster':
      updateCasterAI(monster, dt, playerX, playerY, speedMod);
      break;
    case 'charger':
      updateChargerAI(monster, dt, playerX, playerY, speedMod);
      break;
    case 'exploder':
      updateExploderAI(monster, dt, playerX, playerY, speedMod);
      break;
  }

  // Tick affix effects
  tickAffixEffects(monster, dt, playerX, playerY);
}

// --- Melee AI ---
// Behavior: idle → chase → attack. Checks abilities before basic attack.

function updateMeleeAI(
  monster: MonsterInstance,
  dt: number,
  playerX: number,
  playerY: number,
  speedMod: number,
): void {
  switch (monster.aiState) {
    case 'idle':
      updateIdle(monster, dt, playerX, playerY);
      break;

    case 'chase':
      updateMeleeChase(monster, dt, playerX, playerY, speedMod);
      break;

    case 'attack':
      updateMeleeAttack(monster, dt, playerX, playerY);
      break;

    case 'flee':
      updateFlee(monster, dt, playerX, playerY, speedMod);
      break;

    default:
      // For any unhandled state, go to idle
      if (monster.aiState !== 'casting' && monster.aiState !== 'recovering') {
        transitionTo(monster, 'idle');
      }
      break;
  }
}

function updateMeleeChase(
  monster: MonsterInstance,
  dt: number,
  playerX: number,
  playerY: number,
  speedMod: number,
): void {
  const distToPlayer = dist(monster.x, monster.y, playerX, playerY);

  // Leash check
  const leashRange = monster.aggroRange * LEASH_MULTIPLIER;
  if (distToPlayer > leashRange && !monster.isBoss) {
    transitionTo(monster, 'idle');
    return;
  }

  // Swift flee check
  if (monster.types.includes('swift') && shouldFlee(monster)) {
    transitionTo(monster, 'flee');
    return;
  }

  // In attack range → attack
  if (distToPlayer <= monster.attackRange) {
    transitionTo(monster, 'attack');
    return;
  }

  // Move toward player
  const speed = getEffectiveSpeed(monster, speedMod);
  moveToward(monster, playerX, playerY, speed, dt);
}

function updateMeleeAttack(
  monster: MonsterInstance,
  dt: number,
  playerX: number,
  playerY: number,
): void {
  // Wind-up → execute → cooldown → chase
  if (!monster.isWindingUp) {
    monster.isWindingUp = true;
    monster.windupTimer = monster.types.includes('aggressive')
      ? monster.windupDuration
      : DEFAULT_WINDUP_DURATION;
    return;
  }

  monster.windupTimer -= dt;

  if (monster.windupTimer <= 0) {
    monster.isWindingUp = false;
    executeBasicAttack(monster);
    monster.lastAttackTime = 0;
    monster.aiTimer = monster.attackCooldown;
    transitionTo(monster, 'chase');
    return;
  }

  // Face player during windup
  monster.targetX = playerX;
  monster.targetY = playerY;
}

// --- Ranged AI ---
// Behavior: approach to preferredRange, retreat if too close, fire abilities/basic attack.

function updateRangedAI(
  monster: MonsterInstance,
  dt: number,
  playerX: number,
  playerY: number,
  speedMod: number,
): void {
  const distToPlayer = dist(monster.x, monster.y, playerX, playerY);

  // Idle → aggro
  if (monster.aiState === 'idle') {
    if (distToPlayer <= monster.aggroRange) {
      transitionTo(monster, 'chase');
    } else {
      updateIdle(monster, dt, playerX, playerY);
      return;
    }
  }

  // Leash check
  const leashRange = monster.aggroRange * LEASH_MULTIPLIER;
  if (distToPlayer > leashRange && !monster.isBoss) {
    transitionTo(monster, 'idle');
    monster.isRetreating = false;
    return;
  }

  const def = getMonsterDefinition(monster.definitionId);
  const preferredRange = def?.preferredRange ?? RANGED_DEFAULT_PREFERRED_RANGE;
  const retreatThreshold = preferredRange * RANGED_RETREAT_THRESHOLD_RATIO;

  // Too close — retreat
  if (distToPlayer < retreatThreshold) {
    monster.isRetreating = true;
    const retreatSpeed = monster.moveSpeed * (def?.retreatSpeed ?? RANGED_DEFAULT_RETREAT_SPEED_RATIO) * speedMod;
    moveAway(monster, playerX, playerY, retreatSpeed, dt);
    return;
  }

  monster.isRetreating = false;

  // Too far — approach
  if (distToPlayer > preferredRange * 1.1) {
    const speed = getEffectiveSpeed(monster, speedMod);
    moveToward(monster, playerX, playerY, speed, dt);
    return;
  }

  // In range — strafe slightly (small random movement)
  monster.aiTimer -= dt;
  if (monster.aiTimer <= 0) {
    const strafeAngle = Math.atan2(playerY - monster.y, playerX - monster.x) + (Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2);
    monster.targetX = monster.x + Math.cos(strafeAngle) * 40;
    monster.targetY = monster.y + Math.sin(strafeAngle) * 40;
    monster.aiTimer = 1.0 + Math.random() * 1.5;
  }
  moveToward(monster, monster.targetX, monster.targetY, monster.moveSpeed * 0.3 * speedMod, dt);
}

// --- Caster AI ---
// Like ranged but prioritizes abilities, doesn't move during casts, longer standoff.

function updateCasterAI(
  monster: MonsterInstance,
  dt: number,
  playerX: number,
  playerY: number,
  speedMod: number,
): void {
  const distToPlayer = dist(monster.x, monster.y, playerX, playerY);

  // Idle → aggro
  if (monster.aiState === 'idle') {
    if (distToPlayer <= monster.aggroRange) {
      transitionTo(monster, 'chase');
    } else {
      updateIdle(monster, dt, playerX, playerY);
      return;
    }
  }

  // Leash check
  const leashRange = monster.aggroRange * LEASH_MULTIPLIER;
  if (distToPlayer > leashRange && !monster.isBoss) {
    transitionTo(monster, 'idle');
    monster.isRetreating = false;
    return;
  }

  const def = getMonsterDefinition(monster.definitionId);
  const preferredRange = def?.preferredRange ?? CASTER_DEFAULT_PREFERRED_RANGE;
  const retreatThreshold = preferredRange * 0.4;

  // Too close — retreat
  if (distToPlayer < retreatThreshold) {
    monster.isRetreating = true;
    const retreatSpeed = monster.moveSpeed * (def?.retreatSpeed ?? CASTER_DEFAULT_RETREAT_SPEED_RATIO) * speedMod;
    moveAway(monster, playerX, playerY, retreatSpeed, dt);
    return;
  }

  monster.isRetreating = false;

  // Too far — approach
  if (distToPlayer > preferredRange * 1.1) {
    const speed = getEffectiveSpeed(monster, speedMod);
    moveToward(monster, playerX, playerY, speed, dt);
    return;
  }

  // In range — hold position, let abilities fire (handled by updateAbilities above)
}

// --- Charger AI ---
// Chase normally. When in activation range + charge off cooldown → windup → dash → recovery.

function updateChargerAI(
  monster: MonsterInstance,
  dt: number,
  playerX: number,
  playerY: number,
  speedMod: number,
): void {
  // Handle active charge
  if (monster.isCharging) {
    updateCharging(monster, dt);
    return;
  }

  // Handle fusing state (used for charge windup visual)
  if (monster.aiState === 'fusing') {
    updateChargeWindup(monster, dt, playerX, playerY);
    return;
  }

  // Idle → aggro
  if (monster.aiState === 'idle') {
    const distToPlayer = dist(monster.x, monster.y, playerX, playerY);
    if (distToPlayer <= monster.aggroRange) {
      transitionTo(monster, 'chase');
    } else {
      updateIdle(monster, dt, playerX, playerY);
      return;
    }
  }

  // Chase state
  if (monster.aiState === 'chase' || monster.aiState === 'attack') {
    const distToPlayer = dist(monster.x, monster.y, playerX, playerY);

    // Leash check
    const leashRange = monster.aggroRange * LEASH_MULTIPLIER;
    if (distToPlayer > leashRange && !monster.isBoss) {
      transitionTo(monster, 'idle');
      return;
    }

    const def = getMonsterDefinition(monster.definitionId);
    const activationRange = CHARGER_ACTIVATION_RANGE;

    // Check if we can start a charge
    if (distToPlayer <= activationRange && (monster.abilityCooldowns['_charge'] ?? 0) <= 0) {
      // Start charge windup
      monster.aiState = 'fusing';
      monster.aiTimer = def?.chargeWindup ?? CHARGER_DEFAULT_WINDUP;
      // Snapshot target position
      monster.chargeTargetX = playerX;
      monster.chargeTargetY = playerY;

      emit('monster:chargeStart', {
        monsterId: monster.id,
        fromX: monster.x,
        fromY: monster.y,
        toX: playerX,
        toY: playerY,
        speed: def?.chargeSpeed ?? CHARGER_DEFAULT_SPEED,
      });
      return;
    }

    // Normal melee behavior when charge is on cooldown
    if (distToPlayer <= monster.attackRange) {
      if (monster.aiState !== 'attack') {
        transitionTo(monster, 'attack');
      }
      updateMeleeAttack(monster, dt, playerX, playerY);
      return;
    }

    // Chase
    const speed = getEffectiveSpeed(monster, speedMod);
    moveToward(monster, playerX, playerY, speed, dt);
  }
}

function updateChargeWindup(
  monster: MonsterInstance,
  dt: number,
  playerX: number,
  playerY: number,
): void {
  monster.aiTimer -= dt;

  // Face target during windup
  monster.targetX = monster.chargeTargetX;
  monster.targetY = monster.chargeTargetY;

  if (monster.aiTimer <= 0) {
    // Start the actual charge dash
    const def = getMonsterDefinition(monster.definitionId);
    monster.isCharging = true;

    // Calculate charge direction and distance
    const dx = monster.chargeTargetX - monster.x;
    const dy = monster.chargeTargetY - monster.y;
    const distToTarget = Math.sqrt(dx * dx + dy * dy);
    const maxDist = def?.chargeDistance ?? CHARGER_DEFAULT_DISTANCE;
    const chargeDist = Math.min(distToTarget, maxDist);
    const chargeSpeed = def?.chargeSpeed ?? CHARGER_DEFAULT_SPEED;

    monster.chargeTimer = chargeDist / chargeSpeed;

    // Set charge target to exact endpoint
    if (distToTarget > 0) {
      const normX = dx / distToTarget;
      const normY = dy / distToTarget;
      monster.chargeTargetX = monster.x + normX * chargeDist;
      monster.chargeTargetY = monster.y + normY * chargeDist;
    }
  }
}

function updateCharging(monster: MonsterInstance, dt: number): void {
  const def = getMonsterDefinition(monster.definitionId);
  const chargeSpeed = def?.chargeSpeed ?? CHARGER_DEFAULT_SPEED;

  // Move toward charge target at charge speed
  const dx = monster.chargeTargetX - monster.x;
  const dy = monster.chargeTargetY - monster.y;
  const distRemaining = Math.sqrt(dx * dx + dy * dy);

  if (distRemaining < 5 || monster.chargeTimer <= 0) {
    // Charge complete
    monster.isCharging = false;
    monster.abilityCooldowns['_charge'] = CHARGER_COOLDOWN;

    // Check if we hit the player
    const player = getPlayer();
    const distToPlayer = dist(monster.x, monster.y, player.x, player.y);
    const hitRadius = monster.size * 0.5 + 14; // monster half-size + player body radius
    const hitPlayer = distToPlayer <= hitRadius;

    if (hitPlayer) {
      const damageMult = def?.chargeDamageMultiplier ?? CHARGER_DEFAULT_DAMAGE_MULT;
      const damage = Math.floor(monster.attack * damageMult);
      emit('combat:monsterAttack', {
        monsterId: monster.id,
        damage,
      });
    }

    emit('monster:chargeEnd', {
      monsterId: monster.id,
      hitPlayer,
    });

    // Enter recovery (vulnerable)
    transitionTo(monster, 'recovering');
    monster.aiTimer = CHARGER_RECOVERY_DURATION;
    return;
  }

  // Dash movement
  monster.chargeTimer -= dt;
  const normX = dx / distRemaining;
  const normY = dy / distRemaining;
  const step = chargeSpeed * dt;

  const nextX = monster.x + normX * step;
  const nextY = monster.y + normY * step;

  // Resolve against map walls if in expedition
  const state = getState();
  if (state.activeExpedition) {
    const resolved = resolveMovementAgainstMap(
      state.activeExpedition.map,
      monster.x,
      monster.y,
      nextX,
      nextY,
      Math.max(10, monster.size * 0.35),
    );
    monster.x = resolved.x;
    monster.y = resolved.y;

    // If we hit a wall, end charge early
    if (Math.abs(resolved.x - nextX) > 2 || Math.abs(resolved.y - nextY) > 2) {
      monster.isCharging = false;
      monster.abilityCooldowns['_charge'] = CHARGER_COOLDOWN;
      emit('monster:chargeEnd', { monsterId: monster.id, hitPlayer: false });
      transitionTo(monster, 'recovering');
      monster.aiTimer = CHARGER_RECOVERY_DURATION;
    }
  } else {
    monster.x = nextX;
    monster.y = nextY;
  }
}

// --- Exploder AI ---
// Chase at full speed. Close range → fuse countdown → detonate AoE → die.

function updateExploderAI(
  monster: MonsterInstance,
  dt: number,
  playerX: number,
  playerY: number,
  speedMod: number,
): void {
  // Handle active fuse
  if (monster.isFused) {
    updateFuse(monster, dt);
    return;
  }

  // Idle → aggro
  if (monster.aiState === 'idle') {
    const distToPlayer = dist(monster.x, monster.y, playerX, playerY);
    if (distToPlayer <= monster.aggroRange) {
      transitionTo(monster, 'chase');
    } else {
      updateIdle(monster, dt, playerX, playerY);
      return;
    }
  }

  // Chase — full speed toward player
  const distToPlayer = dist(monster.x, monster.y, playerX, playerY);

  // Check if close enough to start fusing
  const def = getMonsterDefinition(monster.definitionId);
  const fuseRange = EXPLODER_FUSE_ACTIVATION_RANGE;

  if (distToPlayer <= fuseRange) {
    // Start fusing
    monster.isFused = true;
    monster.fuseTimer = def?.fuseTime ?? EXPLODER_DEFAULT_FUSE_TIME;
    monster.aiState = 'fusing';

    emit('monster:fuseStart', {
      monsterId: monster.id,
      fuseTime: monster.fuseTimer,
      radius: def?.explosionRadius ?? EXPLODER_DEFAULT_RADIUS,
    });
    return;
  }

  // Chase at full speed
  const speed = monster.moveSpeed * speedMod;
  moveToward(monster, playerX, playerY, speed, dt);
}

function updateFuse(monster: MonsterInstance, dt: number): void {
  monster.fuseTimer -= dt;

  if (monster.fuseTimer <= 0) {
    // Detonate
    detonate(monster, 1.0);
  }
}

function detonate(monster: MonsterInstance, damageRatio: number): void {
  const def = getMonsterDefinition(monster.definitionId);
  const radius = def?.explosionRadius ?? EXPLODER_DEFAULT_RADIUS;
  const baseDamage = def?.explosionDamage ?? Math.floor(monster.attack * EXPLODER_DEFAULT_DAMAGE_MULT);
  const damage = Math.floor(baseDamage * damageRatio);

  const player = getPlayer();
  const distToPlayer = dist(monster.x, monster.y, player.x, player.y);
  const hitPlayer = distToPlayer <= radius;

  if (hitPlayer) {
    emit('combat:monsterAttack', {
      monsterId: monster.id,
      damage,
    });
  }

  emit('monster:detonated', {
    monsterId: monster.id,
    x: monster.x,
    y: monster.y,
    radius,
    damage,
    hitPlayer,
  });

  // Kill self
  monster.isDead = true;
  monster.aiState = 'dead';
  monster.deathTimer = DEATH_ANIMATION_DURATION;
  monster.isFused = false;

  emit('monster:died', {
    monsterId: monster.id,
    x: monster.x,
    y: monster.y,
    xp: monster.xp,
    gold: monster.gold,
    isBoss: false,
  });
}

// --- Shared states ---

function updateIdle(
  monster: MonsterInstance,
  dt: number,
  playerX: number,
  playerY: number,
): void {
  const distToPlayer = dist(monster.x, monster.y, playerX, playerY);

  if (distToPlayer <= monster.aggroRange) {
    // Clear wander state on aggro
    monster.wanderTargetX = undefined;
    monster.wanderTargetY = undefined;
    transitionTo(monster, 'chase');
    return;
  }

  // Pausing between wander movements
  if (monster.wanderPauseTimer > 0) {
    monster.wanderPauseTimer -= dt;
    return;
  }

  // Pick a new wander target if we don't have one
  if (monster.wanderTargetX === undefined || monster.wanderTargetY === undefined) {
    pickNewWanderTarget(monster);
    return;
  }

  // Move toward current wander target
  const wanderDist = dist(monster.x, monster.y, monster.wanderTargetX, monster.wanderTargetY);

  if (wanderDist <= MONSTER_WANDER_ARRIVAL_DIST) {
    // Arrived — pause then pick another target
    monster.wanderTargetX = undefined;
    monster.wanderTargetY = undefined;
    monster.wanderPauseTimer = randomRange(MONSTER_WANDER_PAUSE_MIN, MONSTER_WANDER_PAUSE_MAX);
    return;
  }

  const wanderSpeed = monster.moveSpeed * MONSTER_WANDER_SPEED_RATIO;
  moveToward(monster, monster.wanderTargetX, monster.wanderTargetY, wanderSpeed, dt);
}

function pickNewWanderTarget(monster: MonsterInstance): void {
  const state = getState();
  const maxAttempts = 5;

  for (let i = 0; i < maxAttempts; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = MONSTER_WANDER_RADIUS * (0.3 + Math.random() * 0.7);
    const tx = monster.spawnX + Math.cos(angle) * radius;
    const ty = monster.spawnY + Math.sin(angle) * radius;

    // In expedition mode, validate the target is walkable
    if (state.activeExpedition) {
      if (!isPointWalkable(state.activeExpedition.map, tx, ty, Math.max(10, monster.size * 0.35))) {
        continue;
      }
    }

    monster.wanderTargetX = tx;
    monster.wanderTargetY = ty;
    return;
  }

  // If all attempts failed, just pause and try again later
  monster.wanderPauseTimer = randomRange(MONSTER_WANDER_PAUSE_MIN, MONSTER_WANDER_PAUSE_MAX);
}

function updateFlee(
  monster: MonsterInstance,
  dt: number,
  playerX: number,
  playerY: number,
  speedMod: number,
): void {
  monster.aiTimer -= dt;

  if (monster.aiTimer <= 0 || !shouldFlee(monster)) {
    monster.isFleeing = false;
    transitionTo(monster, 'chase');
    return;
  }

  const escapeSpeed = monster.moveSpeed * SWIFT_ESCAPE_SPEED_MULT * speedMod;
  moveAway(monster, playerX, playerY, escapeSpeed, dt);
}

function updateStunned(monster: MonsterInstance, dt: number): void {
  monster.aiTimer -= dt;

  if (monster.aiTimer <= 0) {
    transitionTo(monster, 'chase');
  }
}

// --- Basic attack execution ---

function executeBasicAttack(monster: MonsterInstance): void {
  const player = getPlayer();
  const distToPlayer = dist(monster.x, monster.y, player.x, player.y);

  if (distToPlayer > monster.attackRange * 1.2) return;

  emit('combat:monsterAttack', {
    monsterId: monster.id,
    damage: monster.attack,
  });
}

// --- Type passives ---

function applyTypePassives(monster: MonsterInstance, dt: number): void {
  // Regenerating type: heal over time
  if (monster.types.includes('regenerating')) {
    const regenAmount = monster.maxHP * REGEN_RATE_DEFAULT * dt;
    monster.currentHP = Math.min(monster.maxHP, monster.currentHP + regenAmount);
  }
}

// --- Affix tick effects ---

function tickAffixEffects(
  monster: MonsterInstance,
  dt: number,
  playerX: number,
  playerY: number,
): void {
  if (monster.affixes.length === 0) return;

  for (const affix of monster.affixes) {
    switch (affix.id) {
      case 'teleporting':
        tickTeleport(monster, affix, dt, playerX, playerY);
        break;

      case 'frenzy_aura':
        tickFrenzyAura(monster, dt);
        break;

      case 'regenerating':
        tickRegeneratingAffix(monster, dt);
        break;
    }
  }
}

function tickTeleport(
  monster: MonsterInstance,
  affix: { auraCooldown?: number; lastTriggerTime?: number },
  dt: number,
  playerX: number,
  playerY: number,
): void {
  affix.auraCooldown = (affix.auraCooldown ?? AFFIX_TELEPORT_COOLDOWN) - dt;

  if (affix.auraCooldown <= 0) {
    affix.auraCooldown = AFFIX_TELEPORT_COOLDOWN;

    const distToPlayer = dist(monster.x, monster.y, playerX, playerY);
    if (distToPlayer > AFFIX_TELEPORT_RANGE) return;

    // Teleport to a random position near the player
    const fromX = monster.x;
    const fromY = monster.y;
    const state = getState();
    const monsterRadius = Math.max(10, monster.size * 0.35);
    let teleportX: number | null = null;
    let teleportY: number | null = null;

    // Try up to 5 positions, validate walkability in expeditions
    for (let attempt = 0; attempt < 5; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const offset = AFFIX_TELEPORT_OFFSET * (1 - attempt * 0.15);
      const tx = playerX + Math.cos(angle) * offset;
      const ty = playerY + Math.sin(angle) * offset;

      if (state.activeExpedition) {
        if (isPointWalkable(state.activeExpedition.map, tx, ty, monsterRadius)) {
          teleportX = tx;
          teleportY = ty;
          break;
        }
      } else {
        teleportX = tx;
        teleportY = ty;
        break;
      }
    }

    if (teleportX === null || teleportY === null) return; // skip if no valid position

    monster.x = teleportX;
    monster.y = teleportY;

    emit('affix:teleport', {
      monsterId: monster.id,
      fromX,
      fromY,
      toX: monster.x,
      toY: monster.y,
    });
  }
}

function tickFrenzyAura(monster: MonsterInstance, dt: number): void {
  // Buff nearby allies (other monsters within radius)
  const state = getState();
  for (const other of state.monsters) {
    if (other.id === monster.id || other.isDead) continue;

    const d = dist(monster.x, monster.y, other.x, other.y);
    if (d <= AFFIX_FRENZY_AURA_RADIUS) {
      // Temporarily boost attack (applied per-frame, doesn't stack permanently)
      // The frenzy aura effect is handled by checking proximity during combat
      // We don't permanently mutate stats — combat system checks for nearby frenzy aura
    }
  }
}

function tickRegeneratingAffix(monster: MonsterInstance, dt: number): void {
  // 2% maxHP/sec regen (stacks with type passive if both present)
  const regenAmount = monster.maxHP * 0.02 * dt;
  monster.currentHP = Math.min(monster.maxHP, monster.currentHP + regenAmount);
}

// --- State transitions ---

function transitionTo(monster: MonsterInstance, newState: MonsterAIState): void {
  const oldState = monster.aiState;
  monster.aiState = newState;

  switch (newState) {
    case 'idle':
      monster.isWindingUp = false;
      monster.isFleeing = false;
      break;

    case 'chase':
      monster.isWindingUp = false;
      monster.isFleeing = false;
      break;

    case 'attack':
      monster.aiTimer = 0;
      break;

    case 'flee':
      monster.isFleeing = true;
      monster.aiTimer = FLEE_DURATION;
      break;

    case 'stunned':
      monster.isWindingUp = false;
      cancelAbility(monster.id);
      break;

    case 'dead':
      monster.isDead = true;
      monster.deathTimer = DEATH_ANIMATION_DURATION;
      break;
  }

  if (oldState !== newState) {
    emit('monster:aggroChanged', { monsterId: monster.id, state: newState });
  }
}

// --- Monster separation ---

function applySeparation(monsters: MonsterInstance[], dt: number): void {
  const st = getState();
  const map = st.activeExpedition?.map ?? null;

  for (let i = 0; i < monsters.length; i++) {
    const a = monsters[i];
    if (a.isDead) continue;

    let sepX = 0;
    let sepY = 0;

    for (let j = i + 1; j < monsters.length; j++) {
      const b = monsters[j];
      if (b.isDead) continue;

      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distSq = dx * dx + dy * dy;
      const minDist = SEPARATION_RADIUS + (a.size + b.size) * 0.25;
      const minDistSq = minDist * minDist;

      if (distSq < minDistSq && distSq > 0.01) {
        const d = Math.sqrt(distSq);
        const overlap = minDist - d;
        const normX = dx / d;
        const normY = dy / d;

        const push = overlap * SEPARATION_FORCE * dt;
        sepX += normX * push * 0.5;
        sepY += normY * push * 0.5;

        // Push monster b, revert if it lands in a wall
        const prevBx = b.x;
        const prevBy = b.y;
        b.x -= normX * push * 0.5;
        b.y -= normY * push * 0.5;
        if (map && !isPointWalkable(map, b.x, b.y, Math.max(10, b.size * 0.35))) {
          b.x = prevBx;
          b.y = prevBy;
        }
      }
    }

    // Push monster a, revert if it lands in a wall
    const prevAx = a.x;
    const prevAy = a.y;
    a.x += sepX;
    a.y += sepY;
    if (map && !isPointWalkable(map, a.x, a.y, Math.max(10, a.size * 0.35))) {
      a.x = prevAx;
      a.y = prevAy;
    }
  }
}

// --- World bounds clamping ---

function clampToWorldBounds(monster: MonsterInstance): void {
  const halfSize = monster.size * 0.5;
  const state = getState();

  let worldX = 0;
  let worldY = 0;
  let worldWidth = 2400;
  let worldHeight = 2400;

  if (state.activeExpedition) {
    worldX = state.activeExpedition.map.bounds.x;
    worldY = state.activeExpedition.map.bounds.y;
    worldWidth = state.activeExpedition.map.bounds.width;
    worldHeight = state.activeExpedition.map.bounds.height;
  } else {
    const zone = ZONES[state.activeZoneId];
    if (zone) {
      worldX = 0;
      worldY = 0;
      worldWidth = zone.width;
      worldHeight = zone.height;
    }
  }

  monster.x = Math.max(worldX + halfSize, Math.min(worldX + worldWidth - halfSize, monster.x));
  monster.y = Math.max(worldY + halfSize, Math.min(worldY + worldHeight - halfSize, monster.y));
}

// --- Movement helpers ---

function moveToward(
  monster: MonsterInstance,
  targetX: number,
  targetY: number,
  speed: number,
  dt: number,
): void {
  const dx = targetX - monster.x;
  const dy = targetY - monster.y;
  const d = Math.sqrt(dx * dx + dy * dy);

  if (d < 2) return;

  const normX = dx / d;
  const normY = dy / d;
  const nextX = monster.x + normX * speed * dt;
  const nextY = monster.y + normY * speed * dt;
  const state = getState();

  if (state.activeExpedition) {
    const resolved = resolveMovementAgainstMap(
      state.activeExpedition.map,
      monster.x,
      monster.y,
      nextX,
      nextY,
      Math.max(10, monster.size * 0.35),
    );
    monster.x = resolved.x;
    monster.y = resolved.y;
  } else {
    monster.x = nextX;
    monster.y = nextY;
  }
}

function moveAway(
  monster: MonsterInstance,
  fromX: number,
  fromY: number,
  speed: number,
  dt: number,
): void {
  const dx = monster.x - fromX;
  const dy = monster.y - fromY;
  const d = Math.sqrt(dx * dx + dy * dy);

  if (d < 0.1) return;

  const normX = dx / d;
  const normY = dy / d;
  const nextX = monster.x + normX * speed * dt;
  const nextY = monster.y + normY * speed * dt;
  const state = getState();

  if (state.activeExpedition) {
    const resolved = resolveMovementAgainstMap(
      state.activeExpedition.map,
      monster.x,
      monster.y,
      nextX,
      nextY,
      Math.max(10, monster.size * 0.35),
    );
    monster.x = resolved.x;
    monster.y = resolved.y;
  } else {
    monster.x = nextX;
    monster.y = nextY;
  }
}

// --- Utility helpers ---

function dist(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

function getEffectiveSpeed(monster: MonsterInstance, speedMod: number): number {
  let speed = monster.moveSpeed * speedMod;

  if (monster.types.includes('aggressive') && monster.aiState === 'chase') {
    speed *= 1.15;
  }

  return speed;
}

function shouldFlee(monster: MonsterInstance): boolean {
  if (!monster.types.includes('swift')) return false;
  return monster.currentHP < monster.maxHP * SWIFT_ESCAPE_THRESHOLD;
}

function hasStatusEffect(monster: MonsterInstance, type: StatusEffectType): boolean {
  return monster.statusEffects.some(
    se => se.type === type && se.duration > 0,
  );
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// --- Stun API ---

/**
 * Stun a monster for a given duration.
 */
export function stunMonster(monsterId: string, duration: number): void {
  const monster = getMonsterById(monsterId);
  if (!monster || monster.isDead) return;

  monster.aiTimer = duration;
  transitionTo(monster, 'stunned');
}

/**
 * Check if a monster has the frenzy_aura affix active nearby.
 * Used by combat system to apply damage/speed buffs.
 */
export function hasFrenzyAuraNearby(monster: MonsterInstance): boolean {
  const state = getState();
  for (const other of state.monsters) {
    if (other.id === monster.id || other.isDead) continue;
    if (!other.affixes.some(a => a.id === 'frenzy_aura')) continue;

    const d = dist(monster.x, monster.y, other.x, other.y);
    if (d <= AFFIX_FRENZY_AURA_RADIUS) return true;
  }
  return false;
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
  const monster = getMonsterById(data.monsterId);
  if (!monster) return;

  monster.isDead = true;
  monster.aiState = 'dead';
  monster.deathTimer = DEATH_ANIMATION_DURATION;
  monster.isWindingUp = false;
  monster.isFleeing = false;
  monster.isCharging = false;
  monster.isFused = false;

  // Exploder detonateOnDeath: half-damage AoE without re-emitting monster:died
  if (monster.archetype === 'exploder') {
    const def = getMonsterDefinition(monster.definitionId);
    if (def?.detonateOnDeath) {
      const radius = def.explosionRadius ?? EXPLODER_DEFAULT_RADIUS;
      const baseDamage = def.explosionDamage ?? Math.floor(monster.attack * EXPLODER_DEFAULT_DAMAGE_MULT);
      const damage = Math.floor(baseDamage * EXPLODER_DEATH_DAMAGE_RATIO);

      const player = getPlayer();
      const distToPlayer = dist(monster.x, monster.y, player.x, player.y);
      const hitPlayer = distToPlayer <= radius;

      if (hitPlayer) {
        emit('combat:monsterAttack', {
          monsterId: monster.id,
          damage,
        });
      }

      emit('monster:detonated', {
        monsterId: monster.id,
        x: monster.x,
        y: monster.y,
        radius,
        damage,
        hitPlayer,
      });
    }
  }
}

// --- Lifecycle ---

export function init(): void {
  on('monster:died', onMonsterDied);
}

export function update(dt: number): void {
  const state = getState();
  const player = getPlayer();

  const aliveMonsters = state.monsters.filter(m => !m.isDead);

  // Tick charge cooldowns for chargers (stored in abilityCooldowns._charge)
  for (const monster of aliveMonsters) {
    if (monster.archetype === 'charger' && (monster.abilityCooldowns['_charge'] ?? 0) > 0) {
      monster.abilityCooldowns['_charge'] -= dt;
    }
  }

  // Update AI for each monster
  for (const monster of aliveMonsters) {
    updateMonster(monster, dt, player.x, player.y);
    clampToWorldBounds(monster);
  }

  // Apply separation forces
  applySeparation(aliveMonsters, dt);
}
