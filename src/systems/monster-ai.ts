// ============================================================================
// Monster AI System — State machine for all 6 monster types + boss behavior
// ============================================================================

import type {
  MonsterInstance,
  MonsterType,
  MonsterAIState,
  StatusEffectType,
} from '@/core/types';
import { on, emit } from '@/core/event-bus';
import {
  getState,
  getPlayer,
  getMonsterById,
} from '@/core/game-state';
import {
  SLOW_SPEED_REDUCTION,
  DEATH_ANIMATION_DURATION,
  SWIFT_ESCAPE_THRESHOLD,
  SWIFT_ESCAPE_SPEED_MULT,
  AGGRESSIVE_WINDUP_DEFAULT,
  DEFAULT_WINDUP_DURATION,
  REGEN_RATE_DEFAULT,
} from '@/data/constants';

// --- Constants ---

/** Multiplier applied to aggroRange for leash distance (return to idle). */
const LEASH_MULTIPLIER = 1.5;

/** Minimum time between idle random movements (seconds). */
const IDLE_WANDER_MIN = 2.0;
const IDLE_WANDER_MAX = 5.0;

/** Distance for idle wander movement (pixels). */
const IDLE_WANDER_DISTANCE = 60;

/** Separation force between monsters to prevent stacking (pixels). */
const SEPARATION_RADIUS = 24;
const SEPARATION_FORCE = 80;

/** Flee timer for swift monsters (seconds). */
const FLEE_DURATION = 3.0;

// --- Internal state ---

/** Per-monster wander timers, indexed by monster ID. */
const wanderTimers: Map<string, number> = new Map();

// --- AI State Machine ---

/**
 * Update AI for a single monster.
 * Handles state transitions and per-type behaviors.
 *
 * @param monster - the monster instance to update
 * @param dt      - delta time in seconds
 * @param playerX - player's current X position
 * @param playerY - player's current Y position
 */
export function updateMonster(
  monster: MonsterInstance,
  dt: number,
  playerX: number,
  playerY: number,
): void {
  // Dead monsters only tick their death animation timer
  if (monster.isDead) {
    monster.deathTimer -= dt;
    return;
  }

  // Check status effects that affect movement
  const isFrozen = hasStatusEffect(monster, 'freeze');
  const isSlowed = hasStatusEffect(monster, 'slow');

  // Compute speed modifier from status effects
  const speedMod = isSlowed ? (1 - SLOW_SPEED_REDUCTION) : 1.0;

  // Apply type-specific passive behaviors (regen, etc.)
  applyTypePassives(monster, dt);

  // State machine
  switch (monster.aiState) {
    case 'idle':
      updateIdle(monster, dt, playerX, playerY);
      break;

    case 'chase':
      updateChase(monster, dt, playerX, playerY, isFrozen, speedMod);
      break;

    case 'attack':
      updateAttack(monster, dt, playerX, playerY, isFrozen);
      break;

    case 'flee':
      updateFlee(monster, dt, playerX, playerY, isFrozen, speedMod);
      break;

    case 'stunned':
      updateStunned(monster, dt);
      break;

    case 'patrol':
      // Patrol behaves like idle with movement
      updateIdle(monster, dt, playerX, playerY);
      break;

    case 'dead':
      // Already handled above
      break;
  }
}

// --- State: IDLE ---

function updateIdle(
  monster: MonsterInstance,
  dt: number,
  playerX: number,
  playerY: number,
): void {
  // Check if player is within aggro range
  const distToPlayer = distance(monster.x, monster.y, playerX, playerY);

  if (distToPlayer <= monster.aggroRange) {
    transitionTo(monster, 'chase');
    return;
  }

  // Occasional random movement (wander)
  let timer = wanderTimers.get(monster.id) ?? randomRange(IDLE_WANDER_MIN, IDLE_WANDER_MAX);
  timer -= dt;

  if (timer <= 0) {
    // Pick a random nearby target
    const angle = Math.random() * Math.PI * 2;
    monster.targetX = monster.x + Math.cos(angle) * IDLE_WANDER_DISTANCE;
    monster.targetY = monster.y + Math.sin(angle) * IDLE_WANDER_DISTANCE;

    // Move toward target briefly
    moveToward(monster, monster.targetX, monster.targetY, monster.moveSpeed * 0.3, dt);

    // Reset timer
    timer = randomRange(IDLE_WANDER_MIN, IDLE_WANDER_MAX);
  }

  wanderTimers.set(monster.id, timer);
}

// --- State: CHASE ---

function updateChase(
  monster: MonsterInstance,
  dt: number,
  playerX: number,
  playerY: number,
  isFrozen: boolean,
  speedMod: number,
): void {
  // Frozen monsters don't move
  if (isFrozen) return;

  const distToPlayer = distance(monster.x, monster.y, playerX, playerY);

  // Check leash range — if player is too far, return to idle
  const leashRange = monster.aggroRange * LEASH_MULTIPLIER;
  if (distToPlayer > leashRange && !monster.isBoss) {
    transitionTo(monster, 'idle');
    return;
  }

  // Swift type: check if should flee
  if (monster.types.includes('swift') && shouldFlee(monster)) {
    transitionTo(monster, 'flee');
    return;
  }

  // Check if within attack range
  if (distToPlayer <= monster.attackRange) {
    transitionTo(monster, 'attack');
    return;
  }

  // Move toward player
  const speed = getEffectiveSpeed(monster, speedMod);
  moveToward(monster, playerX, playerY, speed, dt);
}

// --- State: ATTACK ---

function updateAttack(
  monster: MonsterInstance,
  dt: number,
  playerX: number,
  playerY: number,
  isFrozen: boolean,
): void {
  // Frozen monsters can't attack
  if (isFrozen) return;

  const distToPlayer = distance(monster.x, monster.y, playerX, playerY);

  // All monsters wind up before attacking
  if (!monster.isWindingUp) {
    monster.isWindingUp = true;
    // Aggressive monsters use their custom (longer) windup; others use default
    monster.windupTimer = monster.types.includes('aggressive')
      ? monster.windupDuration
      : DEFAULT_WINDUP_DURATION;
    return;
  }

  monster.windupTimer -= dt;

  if (monster.windupTimer <= 0) {
    // Windup complete — execute attack
    monster.isWindingUp = false;
    executeAttack(monster);

    // After attack, cooldown then back to chase
    monster.lastAttackTime = 0;
    monster.aiTimer = monster.attackCooldown;
    transitionTo(monster, 'chase');
    return;
  }

  // During windup, face the player but don't move
  monster.targetX = playerX;
  monster.targetY = playerY;
}

// --- State: FLEE (swift type) ---

function updateFlee(
  monster: MonsterInstance,
  dt: number,
  playerX: number,
  playerY: number,
  isFrozen: boolean,
  speedMod: number,
): void {
  if (isFrozen) return;

  // Decrement flee timer
  monster.aiTimer -= dt;

  // Check if should stop fleeing
  if (monster.aiTimer <= 0 || !shouldFlee(monster)) {
    monster.isFleeing = false;
    transitionTo(monster, 'chase');
    return;
  }

  // Move AWAY from player
  const dx = monster.x - playerX;
  const dy = monster.y - playerY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 0) {
    const escapeSpeed = monster.moveSpeed * SWIFT_ESCAPE_SPEED_MULT * speedMod;
    const normX = dx / dist;
    const normY = dy / dist;

    monster.x += normX * escapeSpeed * dt;
    monster.y += normY * escapeSpeed * dt;
  }
}

// --- State: STUNNED ---

function updateStunned(
  monster: MonsterInstance,
  dt: number,
): void {
  monster.aiTimer -= dt;

  if (monster.aiTimer <= 0) {
    transitionTo(monster, 'chase');
  }
}

// --- Attack execution ---

/**
 * Execute a monster's attack against the player.
 * Emits 'combat:monsterAttack' for the combat system to process.
 */
function executeAttack(monster: MonsterInstance): void {
  const player = getPlayer();
  const distToPlayer = distance(monster.x, monster.y, player.x, player.y);

  // Only deal damage if still in range
  if (distToPlayer > monster.attackRange * 1.2) return;

  emit('combat:monsterAttack', {
    monsterId: monster.id,
    damage: monster.attack,
  });
}

// --- Type-specific passives ---

/**
 * Apply passive effects for monster types every frame.
 */
function applyTypePassives(monster: MonsterInstance, dt: number): void {
  // Regenerating type: heal over time
  if (monster.types.includes('regenerating')) {
    const regenRate = REGEN_RATE_DEFAULT;
    const regenAmount = monster.maxHP * regenRate * dt;
    monster.currentHP = Math.min(monster.maxHP, monster.currentHP + regenAmount);
  }
}

// --- State transitions ---

function transitionTo(monster: MonsterInstance, newState: MonsterAIState): void {
  const oldState = monster.aiState;
  monster.aiState = newState;

  // Initialize state-specific values
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
      // Set initial cooldown timer
      monster.aiTimer = 0; // Ready to attack immediately
      break;

    case 'flee':
      monster.isFleeing = true;
      monster.aiTimer = FLEE_DURATION;
      break;

    case 'stunned':
      monster.isWindingUp = false;
      // aiTimer set by the caller (stun duration)
      break;

    case 'dead':
      monster.isDead = true;
      monster.deathTimer = DEATH_ANIMATION_DURATION;
      break;
  }

  // Emit aggro change event
  if (oldState !== newState) {
    emit('monster:aggroChanged', { monsterId: monster.id, state: newState });
  }
}

// --- Monster separation ---

/**
 * Apply separation forces to prevent monsters from stacking on top of each other.
 * Called after all individual AI updates.
 *
 * @param monsters - all alive monsters to separate
 * @param dt       - delta time
 */
function applySeparation(monsters: MonsterInstance[], dt: number): void {
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
        const dist = Math.sqrt(distSq);
        const overlap = minDist - dist;
        const normX = dx / dist;
        const normY = dy / dist;

        // Push both apart proportionally
        const push = overlap * SEPARATION_FORCE * dt;
        sepX += normX * push * 0.5;
        sepY += normY * push * 0.5;

        b.x -= normX * push * 0.5;
        b.y -= normY * push * 0.5;
      }
    }

    a.x += sepX;
    a.y += sepY;
  }
}

// --- World bounds clamping ---

/**
 * Keep a monster within the world bounds.
 * Uses the current zone's dimensions from game state.
 */
function clampToWorldBounds(monster: MonsterInstance): void {
  const halfSize = monster.size * 0.5;

  // Use reasonable defaults for world bounds
  // The actual zone dimensions come from the zone data,
  // but we use the physics world bounds (2400x2400 from GameScene)
  const worldWidth = 2400;
  const worldHeight = 2400;

  monster.x = Math.max(halfSize, Math.min(worldWidth - halfSize, monster.x));
  monster.y = Math.max(halfSize, Math.min(worldHeight - halfSize, monster.y));
}

// --- Helpers ---

/**
 * Move a monster toward a target position.
 */
function moveToward(
  monster: MonsterInstance,
  targetX: number,
  targetY: number,
  speed: number,
  dt: number,
): void {
  const dx = targetX - monster.x;
  const dy = targetY - monster.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 2) return; // Close enough, don't jitter

  const normX = dx / dist;
  const normY = dy / dist;

  monster.x += normX * speed * dt;
  monster.y += normY * speed * dt;
}

/**
 * Calculate distance between two points.
 */
function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Get the effective movement speed for a monster, accounting for type and modifiers.
 */
function getEffectiveSpeed(monster: MonsterInstance, speedMod: number): number {
  let speed = monster.moveSpeed * speedMod;

  // Armored monsters are naturally slower (handled by their base moveSpeed)
  // Aggressive monsters charge faster when in chase state
  if (monster.types.includes('aggressive') && monster.aiState === 'chase') {
    speed *= 1.15;
  }

  return speed;
}

/**
 * Check if a swift monster should start fleeing.
 */
function shouldFlee(monster: MonsterInstance): boolean {
  if (!monster.types.includes('swift')) return false;
  const threshold = SWIFT_ESCAPE_THRESHOLD;
  return monster.currentHP < monster.maxHP * threshold;
}

/**
 * Check if a monster has a specific active status effect.
 */
function hasStatusEffect(monster: MonsterInstance, type: StatusEffectType): boolean {
  return monster.statusEffects.some(
    se => se.type === type && se.duration > 0,
  );
}

/**
 * Random float in range [min, max].
 */
function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// --- Stun API ---

/**
 * Stun a monster for a given duration.
 * Called from external systems (e.g., skill-effects).
 *
 * @param monsterId - ID of the monster to stun
 * @param duration  - stun duration in seconds
 */
export function stunMonster(monsterId: string, duration: number): void {
  const monster = getMonsterById(monsterId);
  if (!monster || monster.isDead) return;

  monster.aiTimer = duration;
  transitionTo(monster, 'stunned');
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

  // Clean up wander timer
  wanderTimers.delete(data.monsterId);
}

// --- Lifecycle ---

export function init(): void {
  wanderTimers.clear();

  on('monster:died', onMonsterDied);
}

export function update(dt: number): void {
  const state = getState();
  const player = getPlayer();

  // Get all alive monsters
  const aliveMonsters = state.monsters.filter(m => !m.isDead);

  // Update AI for each monster
  for (const monster of aliveMonsters) {
    updateMonster(monster, dt, player.x, player.y);
    clampToWorldBounds(monster);
  }

  // Apply separation forces to prevent stacking
  applySeparation(aliveMonsters, dt);
}
