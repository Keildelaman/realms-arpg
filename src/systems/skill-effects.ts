// ============================================================================
// Skill Effects — Handles spatial effects when skills are activated
// ============================================================================
//
// Each active skill has an effect handler that creates hitboxes, projectiles,
// buffs, or movement effects. This system listens to 'skill:used' and
// dispatches to the appropriate handler based on skill mechanic and ID.
//
// Damage is calculated here but applied via combat events. This system
// never imports combat.ts — it emits events that combat/monsters react to.
// ============================================================================

import type {
  SkillDefinition,
  SkillLevelData,
  DamageType,
  ProjectileInstance,
  MonsterInstance,
  StatusEffectType,
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
  DASH_SPEED,
  DASH_DURATION,
} from '@/data/constants';
import { SKILLS } from '@/data/skills.data';

// --- Internal types ---

interface SkillUsedData {
  skillId: string;
  x: number;
  y: number;
  angle: number;
}

// --- ID generation ---

let nextProjectileId = 0;

function generateProjectileId(): string {
  return `proj_${nextProjectileId++}`;
}

// --- Helpers ---

function getSkillDef(skillId: string): SkillDefinition | undefined {
  return SKILLS[skillId];
}

function getSkillLevelData(skillId: string): SkillLevelData | undefined {
  const def = getSkillDef(skillId);
  if (!def) return undefined;

  const player = getPlayer();
  const level = player.skillLevels[skillId] ?? 0;
  if (level <= 0) return undefined;

  return def.levels[level - 1];
}

/**
 * Calculate raw base damage for a skill hit.
 * baseDamage = skill.levels[level-1].damage * (physical ? player.attack : player.magicPower)
 */
function calculateSkillBaseDamage(skillId: string): number {
  const def = getSkillDef(skillId);
  if (!def) return 0;

  const levelData = getSkillLevelData(skillId);
  if (!levelData) return 0;

  const player = getPlayer();
  const statValue = def.damageType === 'magic' ? player.magicPower : player.attack;
  return Math.floor(levelData.damage * statValue);
}

/**
 * Apply damage to a monster via combat events.
 * Handles crit calculation and damage reduction.
 * Returns the final damage dealt.
 */
function applyDamageToMonster(
  monsterId: string,
  rawDamage: number,
  damageType: DamageType,
  bonusMultiplier: number = 1.0,
): number {
  const monster = getMonsterById(monsterId);
  if (!monster || monster.isDead) return 0;

  const player = getPlayer();

  // Apply bonus multiplier (from overcharge, execution bonus, etc.)
  let baseDmg = Math.floor(rawDamage * bonusMultiplier);

  // Crit calculation
  const isCrit = Math.random() < player.critChance;
  if (isCrit) {
    baseDmg = Math.floor(baseDmg * player.critDamage);
  }

  // Armor flat reduction
  baseDmg = Math.max(0, baseDmg - monster.armor);

  // Defense % reduction
  const reduction = monster.defense / (monster.defense + DEFENSE_CONSTANT);
  let finalDamage = Math.max(MIN_DAMAGE, Math.floor(baseDmg * (1 - reduction)));

  // Shield mechanics
  if (monster.currentShield > 0) {
    const shieldedDamage = Math.floor(finalDamage * (1 - monster.shieldDamageReduction));
    const absorbedByShield = Math.min(monster.currentShield, shieldedDamage);
    monster.currentShield -= absorbedByShield;

    const remainingRatio = shieldedDamage > 0
      ? (shieldedDamage - absorbedByShield) / shieldedDamage
      : 0;
    finalDamage = Math.floor(finalDamage * remainingRatio);

    if (monster.currentShield <= 0) {
      monster.currentShield = 0;
      emit('monster:shieldBroken', { monsterId });
    }
  }

  // Apply HP damage
  finalDamage = Math.max(MIN_DAMAGE, finalDamage);
  monster.currentHP = Math.max(0, monster.currentHP - finalDamage);

  // Track player stats
  player.totalDamageDealt += finalDamage;

  // Emit events
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

  emit('ui:damageNumber', {
    x: monster.x,
    y: monster.y,
    amount: finalDamage,
    isCrit,
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

  return finalDamage;
}

/**
 * Check which monsters fall within an arc from a point.
 */
function findMonstersInArc(
  px: number,
  py: number,
  angle: number,
  arcWidthDegrees: number,
  range: number,
): MonsterInstance[] {
  const state = getState();
  const halfArcRad = (arcWidthDegrees / 2) * (Math.PI / 180);
  const rangeSq = range * range;
  const hits: MonsterInstance[] = [];

  for (const monster of state.monsters) {
    if (monster.isDead) continue;

    const dx = monster.x - px;
    const dy = monster.y - py;
    const distSq = dx * dx + dy * dy;

    if (distSq > rangeSq) continue;

    const angleToTarget = Math.atan2(dy, dx);
    let angleDiff = angleToTarget - angle;

    // Normalize to [-PI, PI]
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    if (Math.abs(angleDiff) <= halfArcRad) {
      hits.push(monster);
    }
  }

  return hits;
}

/**
 * Check which monsters fall within a circle centered on a point.
 */
function findMonstersInCircle(
  x: number,
  y: number,
  radius: number,
): MonsterInstance[] {
  const state = getState();
  const radiusSq = radius * radius;
  const hits: MonsterInstance[] = [];

  for (const monster of state.monsters) {
    if (monster.isDead) continue;

    const dx = monster.x - x;
    const dy = monster.y - y;
    if (dx * dx + dy * dy <= radiusSq) {
      hits.push(monster);
    }
  }

  return hits;
}

/**
 * Find the nearest alive monster to a point within a given range.
 */
function findNearestMonster(
  x: number,
  y: number,
  maxRange: number,
  excludeIds: string[] = [],
): MonsterInstance | null {
  const state = getState();
  const maxRangeSq = maxRange * maxRange;
  let nearest: MonsterInstance | null = null;
  let nearestDistSq = Infinity;

  for (const monster of state.monsters) {
    if (monster.isDead) continue;
    if (excludeIds.includes(monster.id)) continue;

    const dx = monster.x - x;
    const dy = monster.y - y;
    const distSq = dx * dx + dy * dy;

    if (distSq <= maxRangeSq && distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearest = monster;
    }
  }

  return nearest;
}

/**
 * Apply status effect from a skill hit, checking the skill's statusChance.
 */
function tryApplySkillStatus(
  skillId: string,
  targetId: string,
): void {
  const def = getSkillDef(skillId);
  if (!def || !def.statusEffect) return;

  const levelData = getSkillLevelData(skillId);
  if (!levelData) return;

  const statusChance = levelData.statusChance ?? 0;
  if (Math.random() >= statusChance) return;

  const player = getPlayer();

  emit('status:applied', {
    targetId,
    type: def.statusEffect,
    stacks: 1,
  });
}

// ==========================================================================
// MELEE SKILL HANDLERS
// ==========================================================================

function handleHeavySlash(data: SkillUsedData): void {
  const baseDamage = calculateSkillBaseDamage(data.skillId);
  const hits = findMonstersInArc(data.x, data.y, data.angle, 100, 56);

  for (const monster of hits) {
    applyDamageToMonster(monster.id, baseDamage, 'physical');
    tryApplySkillStatus(data.skillId, monster.id);
  }
}

function handleExecutionStrike(data: SkillUsedData): void {
  const baseDamage = calculateSkillBaseDamage(data.skillId);
  const hits = findMonstersInArc(data.x, data.y, data.angle, 60, 64);

  for (const monster of hits) {
    // +50% damage if target is below 30% HP
    const hpRatio = monster.currentHP / monster.maxHP;
    const bonusMult = hpRatio < 0.3 ? 1.5 : 1.0;

    applyDamageToMonster(monster.id, baseDamage, 'physical', bonusMult);
    tryApplySkillStatus(data.skillId, monster.id);
  }
}

function handleGroundSlam(data: SkillUsedData): void {
  const baseDamage = calculateSkillBaseDamage(data.skillId);
  const hits = findMonstersInCircle(data.x, data.y, 80);

  for (const monster of hits) {
    applyDamageToMonster(monster.id, baseDamage, 'physical');

    // Reduce target armor by 30% for 3s
    // We emit a status-like event; the scene/entity layer can handle the debuff visual
    const originalArmor = monster.armor;
    const armorReduction = Math.floor(originalArmor * 0.3);
    monster.armor -= armorReduction;

    // Schedule armor restoration via a timer tracked internally
    scheduleArmorRestore(monster.id, armorReduction, 3.0);

    tryApplySkillStatus(data.skillId, monster.id);
  }
}

function handleShieldBash(data: SkillUsedData): void {
  const baseDamage = calculateSkillBaseDamage(data.skillId);
  const hits = findMonstersInArc(data.x, data.y, data.angle, 90, 48);

  for (const monster of hits) {
    applyDamageToMonster(monster.id, baseDamage, 'physical');

    // Knockback: push target away from player
    const dx = monster.x - data.x;
    const dy = monster.y - data.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0) {
      const knockbackDist = 60;
      monster.x += (dx / dist) * knockbackDist;
      monster.y += (dy / dist) * knockbackDist;
    }

    // 1s stun: set monster AI to stunned
    monster.aiState = 'stunned';
    monster.aiTimer = 1.0;

    tryApplySkillStatus(data.skillId, monster.id);
  }
}

// ==========================================================================
// PROJECTILE SKILL HANDLERS
// ==========================================================================

function handleArcaneBolt(data: SkillUsedData): void {
  const baseDamage = calculateSkillBaseDamage(data.skillId);
  const def = getSkillDef(data.skillId);
  if (!def) return;

  const speed = def.projectileSpeed ?? 400;
  const vx = Math.cos(data.angle) * speed;
  const vy = Math.sin(data.angle) * speed;

  // Find nearest monster for homing
  const nearestTarget = findNearestMonster(data.x, data.y, 600);

  const projectile: ProjectileInstance = {
    id: generateProjectileId(),
    ownerId: 'player',
    skillId: data.skillId,
    x: data.x,
    y: data.y,
    velocityX: vx,
    velocityY: vy,
    speed,
    damage: baseDamage,
    damageType: 'magic',
    piercing: false,
    hitTargets: [],
    maxDistance: 600,
    distanceTraveled: 0,
    isExpired: false,
    color: def.color,
    size: 8,
    statusEffect: def.statusEffect,
    statusChance: getSkillLevelData(data.skillId)?.statusChance,
  };

  getState().projectiles.push(projectile);
  emit('projectile:spawned', { projectile });
}

function handleChainLightning(data: SkillUsedData): void {
  const baseDamage = calculateSkillBaseDamage(data.skillId);
  const def = getSkillDef(data.skillId);
  if (!def) return;

  const levelData = getSkillLevelData(data.skillId);
  if (!levelData) return;

  // Bounces: 3-5 based on level
  const bounces = levelData.bounces ?? 3;

  // Find initial target — nearest monster in facing direction
  const searchRange = 400;
  let currentTarget = findNearestMonster(data.x, data.y, searchRange);
  if (!currentTarget) return;

  const hitIds: string[] = [];
  let currentX = data.x;
  let currentY = data.y;

  // Apply damage to each bounce target
  for (let i = 0; i <= bounces && currentTarget; i++) {
    applyDamageToMonster(currentTarget.id, baseDamage, 'magic');
    tryApplySkillStatus(data.skillId, currentTarget.id);

    hitIds.push(currentTarget.id);
    currentX = currentTarget.x;
    currentY = currentTarget.y;

    // Find next target for bounce (excluding already hit)
    const bounceRange = 200;
    currentTarget = findNearestMonster(currentX, currentY, bounceRange, hitIds);
  }

  // Emit a projectile for the visual chain effect
  const speed = def.projectileSpeed ?? 600;
  const vx = Math.cos(data.angle) * speed;
  const vy = Math.sin(data.angle) * speed;

  const projectile: ProjectileInstance = {
    id: generateProjectileId(),
    ownerId: 'player',
    skillId: data.skillId,
    x: data.x,
    y: data.y,
    velocityX: vx,
    velocityY: vy,
    speed,
    damage: baseDamage,
    damageType: 'magic',
    piercing: true,
    hitTargets: hitIds,
    bounces,
    bounceRange: 200,
    maxDistance: 600,
    distanceTraveled: 0,
    isExpired: true, // Already resolved damage; this is visual only
    color: def.color,
    size: 6,
  };

  getState().projectiles.push(projectile);
  emit('projectile:spawned', { projectile });
}

function handleArrowBarrage(data: SkillUsedData): void {
  const baseDamage = calculateSkillBaseDamage(data.skillId);
  const def = getSkillDef(data.skillId);
  if (!def) return;

  const levelData = getSkillLevelData(data.skillId);
  if (!levelData) return;

  // 5-8 projectiles based on level
  const projectileCount = def.projectileCount ?? (levelData.hits ?? 5);
  const coneAngle = 30 * (Math.PI / 180); // 30 degree cone total
  const halfCone = coneAngle / 2;
  const speed = def.projectileSpeed ?? 350;

  // Per-projectile damage is reduced
  const perProjectileDamage = Math.floor(baseDamage / Math.max(1, Math.floor(projectileCount * 0.6)));

  for (let i = 0; i < projectileCount; i++) {
    // Distribute projectiles evenly across the cone with slight randomness
    const t = projectileCount > 1 ? i / (projectileCount - 1) : 0.5;
    const spreadAngle = data.angle - halfCone + t * coneAngle;
    const jitter = (Math.random() - 0.5) * 0.05; // small random jitter
    const finalAngle = spreadAngle + jitter;

    const vx = Math.cos(finalAngle) * speed;
    const vy = Math.sin(finalAngle) * speed;

    const projectile: ProjectileInstance = {
      id: generateProjectileId(),
      ownerId: 'player',
      skillId: data.skillId,
      x: data.x,
      y: data.y,
      velocityX: vx,
      velocityY: vy,
      speed,
      damage: perProjectileDamage,
      damageType: 'physical',
      piercing: def.piercing ?? false,
      hitTargets: [],
      maxDistance: 500,
      distanceTraveled: 0,
      isExpired: false,
      color: def.color,
      size: 5,
      statusEffect: def.statusEffect,
      statusChance: getSkillLevelData(data.skillId)?.statusChance,
    };

    getState().projectiles.push(projectile);
    emit('projectile:spawned', { projectile });
  }
}

// ==========================================================================
// AOE SKILL HANDLERS
// ==========================================================================

function handleChargedBurst(data: SkillUsedData): void {
  const baseDamage = calculateSkillBaseDamage(data.skillId);
  const def = getSkillDef(data.skillId);
  if (!def) return;

  // Get charge time from skill state (accumulated during channel)
  const skillState = getState().skillStates[data.skillId];
  const chargeTime = skillState ? skillState.chargeTime : 0;

  // Radius scales with charge time: 100px at 0 charge, up to 160px at ~2s charge
  const minRadius = 100;
  const maxRadius = 160;
  const chargeRatio = Math.min(1.0, chargeTime / 2.0);
  const radius = minRadius + (maxRadius - minRadius) * chargeRatio;

  // Damage scales with charge: 1.0x at 0 charge, up to 2.0x at full charge
  const chargeDamageMultiplier = 1.0 + chargeRatio;

  const hits = findMonstersInCircle(data.x, data.y, radius);

  for (const monster of hits) {
    // Split damage between physical and magic
    const physDamage = Math.floor(baseDamage * 0.5 * chargeDamageMultiplier);
    const magicDamage = Math.floor(baseDamage * 0.5 * chargeDamageMultiplier);

    applyDamageToMonster(monster.id, physDamage, 'physical');
    applyDamageToMonster(monster.id, magicDamage, 'magic');

    tryApplySkillStatus(data.skillId, monster.id);
  }
}

// ==========================================================================
// BUFF SKILL HANDLERS
// ==========================================================================

function handleFlurry(data: SkillUsedData): void {
  const levelData = getSkillLevelData(data.skillId);
  if (!levelData) return;

  // +40-80% attack speed for 4-6s (scales with level)
  const attackSpeedBonus = levelData.attackSpeedBonus ?? 0.4;
  const duration = levelData.duration ?? 4;

  const player = getPlayer();
  player.attackSpeed *= (1 + attackSpeedBonus);

  emit('skill:buffApplied', { skillId: data.skillId, duration });
  emit('player:statsChanged');

  // Schedule buff removal
  scheduleBuffExpiry(data.skillId, duration, () => {
    const p = getPlayer();
    p.attackSpeed /= (1 + attackSpeedBonus);
    emit('player:statsChanged');
  });
}

function handleMomentum(data: SkillUsedData): void {
  const levelData = getSkillLevelData(data.skillId);
  if (!levelData) return;

  // Toggle: +25% move speed + 15% attack speed, costs energy/sec (handled by skills.ts)
  const moveSpeedBonus = levelData.moveSpeedBonus ?? 0.25;
  const attackSpeedBonus = levelData.attackSpeedBonus ?? 0.15;

  const player = getPlayer();
  player.moveSpeed *= (1 + moveSpeedBonus);
  player.attackSpeed *= (1 + attackSpeedBonus);

  emit('skill:buffApplied', {
    skillId: data.skillId,
    duration: -1, // -1 signals toggle (indefinite)
  });
  emit('player:statsChanged');
}

function handleMomentumDeactivate(skillId: string): void {
  const levelData = getSkillLevelData(skillId);
  if (!levelData) return;

  const moveSpeedBonus = levelData.moveSpeedBonus ?? 0.25;
  const attackSpeedBonus = levelData.attackSpeedBonus ?? 0.15;

  const player = getPlayer();
  player.moveSpeed /= (1 + moveSpeedBonus);
  player.attackSpeed /= (1 + attackSpeedBonus);

  emit('player:statsChanged');
}

function handleAdrenalineRush(data: SkillUsedData): void {
  const levelData = getSkillLevelData(data.skillId);
  if (!levelData) return;

  // +15-35% crit chance + 20% move speed for 5-7s
  const critChanceBonus = levelData.critChanceBonus ?? 0.15;
  const moveSpeedBonus = levelData.moveSpeedBonus ?? 0.2;
  const duration = levelData.duration ?? 5;

  const player = getPlayer();
  player.critChance += critChanceBonus;
  player.moveSpeed *= (1 + moveSpeedBonus);

  emit('skill:buffApplied', { skillId: data.skillId, duration });
  emit('player:statsChanged');

  scheduleBuffExpiry(data.skillId, duration, () => {
    const p = getPlayer();
    p.critChance -= critChanceBonus;
    p.moveSpeed /= (1 + moveSpeedBonus);
    emit('player:statsChanged');
  });
}

function handleOvercharge(data: SkillUsedData): void {
  const levelData = getSkillLevelData(data.skillId);
  if (!levelData) return;

  // Next skill deals +50-100% damage
  const damageBonus = levelData.damageBonus ?? 0.5;

  // Store the bonus to be consumed by the next skill activation
  // The skill-effects system will check and consume this when calculating damage
  // We emit an event so the skills system can track it
  emit('skill:buffApplied', {
    skillId: data.skillId,
    duration: 10, // 10s or until next skill use
  });

  // Track overcharge bonus internally
  overchargeBonusActive = true;
  overchargeDamageMultiplier = 1 + damageBonus;

  scheduleBuffExpiry(data.skillId, 10, () => {
    overchargeBonusActive = false;
    overchargeDamageMultiplier = 1.0;
  });
}

// ==========================================================================
// INSTANT SKILL HANDLERS
// ==========================================================================

function handleEnergySurge(data: SkillUsedData): void {
  const levelData = getSkillLevelData(data.skillId);
  if (!levelData) return;

  const player = getPlayer();

  // Restore 30-50 energy instantly (encoded in damage field as a flat value)
  // We use energyCost as a negative in the data or a custom field.
  // For energy restoration, the amount is scaled by level.
  // Level 1: 30, Level 5: 50 — we can interpolate from the levels array.
  const restoreAmount = Math.floor(levelData.damage * 100);

  const missing = player.maxEnergy - player.currentEnergy;
  const actual = Math.min(missing, restoreAmount);
  player.currentEnergy += actual;

  emit('energy:changed', {
    current: player.currentEnergy,
    max: player.maxEnergy,
  });

  // Visual feedback
  emit('ui:damageNumber', {
    x: player.x,
    y: player.y,
    amount: actual,
    isCrit: false,
    damageType: 'magic',
    isHeal: true,
  });
}

function handleLifeTap(data: SkillUsedData): void {
  const levelData = getSkillLevelData(data.skillId);
  if (!levelData) return;

  const player = getPlayer();

  // Spend 15% current HP
  const hpCost = Math.floor(player.currentHP * 0.15);
  player.currentHP -= hpCost;

  emit('player:damaged', { amount: hpCost, source: 'life_tap' });

  // Gain 25-40 energy (scales with level)
  const energyGain = Math.floor(levelData.damage * 100);
  const missing = player.maxEnergy - player.currentEnergy;
  const actual = Math.min(missing, energyGain);
  player.currentEnergy += actual;

  emit('energy:changed', {
    current: player.currentEnergy,
    max: player.maxEnergy,
  });

  // Check player death from self-damage
  if (player.currentHP <= 0) {
    player.currentHP = 1; // Life tap cannot kill — floor at 1 HP
  }
}

function handlePrecision(data: SkillUsedData): void {
  const levelData = getSkillLevelData(data.skillId);
  if (!levelData) return;

  // Next 3-5 attacks are guaranteed crits
  const guaranteedCrits = levelData.hits ?? 3;

  precisionCritsRemaining = guaranteedCrits;

  emit('skill:buffApplied', {
    skillId: data.skillId,
    duration: 15, // 15s timeout
  });

  scheduleBuffExpiry(data.skillId, 15, () => {
    precisionCritsRemaining = 0;
  });
}

// ==========================================================================
// DASH SKILL HANDLER
// ==========================================================================

function handleShadowStep(data: SkillUsedData): void {
  const player = getPlayer();

  // Move player rapidly in facing direction
  player.isDashing = true;
  player.isInvulnerable = true;

  const dashDistance = DASH_SPEED * DASH_DURATION;
  const targetX = player.x + Math.cos(data.angle) * dashDistance;
  const targetY = player.y + Math.sin(data.angle) * dashDistance;

  // Emit dash event for scene to animate the movement
  emit('skill:buffApplied', {
    skillId: data.skillId,
    duration: DASH_DURATION,
  });

  // The actual position update happens over DASH_DURATION via the update loop,
  // but we set the target so the scene/entity can lerp
  dashState = {
    active: true,
    targetX,
    targetY,
    startX: player.x,
    startY: player.y,
    elapsed: 0,
    duration: DASH_DURATION,
    skillId: data.skillId,
  };
}

// ==========================================================================
// Internal state for effects that persist across frames
// ==========================================================================

/** Buff expiry timers: scheduled callbacks to reverse stat modifications */
interface BuffTimer {
  skillId: string;
  remaining: number;
  onExpire: () => void;
}
const activeBuffTimers: BuffTimer[] = [];

/** Armor debuff restoration timers */
interface ArmorRestoreTimer {
  monsterId: string;
  armorAmount: number;
  remaining: number;
}
const armorRestoreTimers: ArmorRestoreTimer[] = [];

/** Shadow step dash state */
interface DashState {
  active: boolean;
  targetX: number;
  targetY: number;
  startX: number;
  startY: number;
  elapsed: number;
  duration: number;
  skillId: string;
}
let dashState: DashState = {
  active: false,
  targetX: 0,
  targetY: 0,
  startX: 0,
  startY: 0,
  elapsed: 0,
  duration: 0,
  skillId: '',
};

/** Overcharge bonus tracking */
let overchargeBonusActive = false;
let overchargeDamageMultiplier = 1.0;

/** Precision guaranteed crits remaining */
let precisionCritsRemaining = 0;

// --- Timer helpers ---

function scheduleBuffExpiry(skillId: string, duration: number, onExpire: () => void): void {
  // Remove any existing timer for this skill
  const existingIdx = activeBuffTimers.findIndex(t => t.skillId === skillId);
  if (existingIdx !== -1) {
    activeBuffTimers.splice(existingIdx, 1);
  }

  activeBuffTimers.push({ skillId, remaining: duration, onExpire });
}

function scheduleArmorRestore(monsterId: string, armorAmount: number, duration: number): void {
  armorRestoreTimers.push({ monsterId, armorAmount, remaining: duration });
}

// ==========================================================================
// Overcharge and Precision accessors (for other systems via events)
// ==========================================================================

/**
 * Consume overcharge bonus. Returns the damage multiplier (1.0 if none).
 */
export function consumeOverchargeBonus(): number {
  if (!overchargeBonusActive) return 1.0;
  const mult = overchargeDamageMultiplier;
  overchargeBonusActive = false;
  overchargeDamageMultiplier = 1.0;
  return mult;
}

/**
 * Consume one precision crit charge. Returns true if a guaranteed crit was consumed.
 */
export function consumePrecisionCrit(): boolean {
  if (precisionCritsRemaining <= 0) return false;
  precisionCritsRemaining--;

  if (precisionCritsRemaining <= 0) {
    emit('skill:buffExpired', { skillId: 'precision' });
  }

  return true;
}

/**
 * Get remaining precision crit charges.
 */
export function getPrecisionCritsRemaining(): number {
  return precisionCritsRemaining;
}

// ==========================================================================
// Effect dispatch table
// ==========================================================================

type EffectHandler = (data: SkillUsedData) => void;

const effectHandlers: Record<string, EffectHandler> = {
  // Melee
  heavy_slash: handleHeavySlash,
  execution_strike: handleExecutionStrike,
  ground_slam: handleGroundSlam,
  shield_bash: handleShieldBash,

  // Projectile
  arcane_bolt: handleArcaneBolt,
  chain_lightning: handleChainLightning,
  arrow_barrage: handleArrowBarrage,

  // AoE
  charged_burst: handleChargedBurst,

  // Buff
  flurry: handleFlurry,
  momentum: handleMomentum,
  adrenaline_rush: handleAdrenalineRush,
  overcharge: handleOvercharge,

  // Instant
  energy_surge: handleEnergySurge,
  life_tap: handleLifeTap,
  precision: handlePrecision,

  // Dash
  shadow_step: handleShadowStep,
};

// ==========================================================================
// Event handler
// ==========================================================================

function onSkillUsed(data: SkillUsedData): void {
  const handler = effectHandlers[data.skillId];
  if (handler) {
    // Apply overcharge bonus if active and this is a damaging skill
    // (overcharge is consumed inside applyDamageToMonster via the multiplier tracking)
    handler(data);
  }
}

function onBuffExpired(data: { skillId: string }): void {
  // Handle momentum deactivation when the toggle is turned off
  if (data.skillId === 'momentum') {
    handleMomentumDeactivate(data.skillId);
  }
}

// ==========================================================================
// Lifecycle
// ==========================================================================

export function init(): void {
  // Clear internal state
  activeBuffTimers.length = 0;
  armorRestoreTimers.length = 0;
  dashState.active = false;
  overchargeBonusActive = false;
  overchargeDamageMultiplier = 1.0;
  precisionCritsRemaining = 0;
  nextProjectileId = 0;

  on('skill:used', onSkillUsed);
  on('skill:buffExpired', onBuffExpired);
}

export function update(dt: number): void {
  // --- Tick buff timers ---
  for (let i = activeBuffTimers.length - 1; i >= 0; i--) {
    const timer = activeBuffTimers[i];
    timer.remaining -= dt;

    if (timer.remaining <= 0) {
      timer.onExpire();
      emit('skill:buffExpired', { skillId: timer.skillId });
      activeBuffTimers.splice(i, 1);
    }
  }

  // --- Tick armor restore timers ---
  for (let i = armorRestoreTimers.length - 1; i >= 0; i--) {
    const timer = armorRestoreTimers[i];
    timer.remaining -= dt;

    if (timer.remaining <= 0) {
      const monster = getMonsterById(timer.monsterId);
      if (monster && !monster.isDead) {
        monster.armor += timer.armorAmount;
      }
      armorRestoreTimers.splice(i, 1);
    }
  }

  // --- Tick dash ---
  if (dashState.active) {
    dashState.elapsed += dt;
    const progress = Math.min(1.0, dashState.elapsed / dashState.duration);

    const player = getPlayer();
    player.x = dashState.startX + (dashState.targetX - dashState.startX) * progress;
    player.y = dashState.startY + (dashState.targetY - dashState.startY) * progress;

    emit('player:moved', { x: player.x, y: player.y });

    if (progress >= 1.0) {
      dashState.active = false;
      player.isDashing = false;
      player.isInvulnerable = false;
    }
  }
}
