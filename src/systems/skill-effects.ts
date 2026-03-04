// ============================================================================
// Skill Effects — Handles spatial effects when skills are activated
// ============================================================================
//
// Each active skill has an effect handler that creates hitboxes, projectiles,
// or movement effects. This system listens to 'skill:used' and dispatches
// to the appropriate handler based on skill ID.
//
// Also listens to 'resonance:release' for Ashburst/Overload AoE effects.
// ============================================================================

import type {
  SkillDefinition,
  SkillLevelData,
  DamageType,
  ProjectileInstance,
  MonsterInstance,
  EnemyStateType,
  EnvironmentalZone,
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
  PLAYER_BODY_RADIUS,
  ASHBURST_RADIUS,
  ASHBURST_DAMAGE_MULT,
  OVERLOAD_RADIUS,
  OVERLOAD_DAMAGE_MULT,
  RESONANCE_DUALITY_DAMAGE_BONUS,
  WRATH_DAMAGE_BONUS,
  SUNDERED_DURATION,
  SUNDERED_DEFENSE_REDUCTION,
  FLOW_STATE_RELEASE_DAMAGE_BONUS,
  FLOW_STATE_RELEASE_RADIUS_BONUS,
  CHARGED_DURATION,
  CHARGED_MAX_STACKS,
  STAGGERED_DURATION,
  PRIMED_DAMAGE_BONUS,
  CHAIN_REACTION_BASE_DETONATION_RADIUS,
  CHAIN_REACTION_RADIUS_PER_HIT,
  SHADOW_TRAIL_TICK_INTERVAL,
  ASSASSIN_BEHIND_OFFSET,
  KNOCKBACK_DISTANCE_BASE,
  KNOCKBACK_CRIT_MULTIPLIER,
  KNOCKBACK_TWEEN_DURATION,
  AFTERSHOCK_ZONE_RADIUS,
  AFTERSHOCK_ZONE_DURATION,
  AFTERSHOCK_ZONE_TICK_INTERVAL,
  AFTERSHOCK_ZONE_DAMAGE_PERCENT,
} from '@/data/constants';
import { SKILLS } from '@/data/skills.data';
import { getUpgradeFlags } from '@/systems/skills';
import { safeResolvePosition, resolveMovementAgainstMap } from './expedition-generation';

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
  return getEffectiveSkillLevelData(skillId);
}

/**
 * Get the effective skill level, adding category-specific and all-skill level bonuses.
 */
function getEffectiveSkillLevel(skillId: string): number {
  const def = getSkillDef(skillId);
  if (!def) return 0;

  const player = getPlayer();
  const base = player.skillLevels[skillId] ?? 0;
  if (base <= 0) return 0;

  let bonus = player.skillAllLevel;
  switch (def.category) {
    case 'power':   bonus += player.skillPowerLevel; break;
    case 'speed':   bonus += player.skillSpeedLevel; break;
    case 'crit':    bonus += player.skillCritLevel; break;
    case 'mage':    bonus += player.skillMageLevel; break;
    case 'utility': bonus += player.skillUtilityLevel; break;
  }

  // Cap at max defined levels in the skill definition
  const maxLevel = def.levels.length;
  return Math.min(maxLevel, base + bonus);
}

/**
 * Get skill level data using effective (bonus-adjusted) level.
 */
function getEffectiveSkillLevelData(skillId: string): SkillLevelData | undefined {
  const def = getSkillDef(skillId);
  if (!def) return undefined;

  const effectiveLevel = getEffectiveSkillLevel(skillId);
  if (effectiveLevel <= 0) return undefined;

  return def.levels[effectiveLevel - 1];
}

/**
 * Get the category damage boost for a skill.
 */
function getSkillCategoryBoost(skillId: string): number {
  const def = getSkillDef(skillId);
  if (!def) return 0;

  const player = getPlayer();
  switch (def.category) {
    case 'power':   return player.skillPowerBoost;
    case 'speed':   return player.skillSpeedBoost;
    case 'crit':    return player.skillCritBoost;
    case 'mage':    return player.skillMageBoost;
    case 'utility': return player.skillUtilityBoost;
    default:        return 0;
  }
}

/**
 * Calculate raw base damage for a skill hit.
 * damage = skill.levels[lvl].damage * (physical ? player.attack : player.magicPower)
 * Multiplied by (1 + category boost).
 */
function calculateSkillBaseDamage(skillId: string): number {
  const def = getSkillDef(skillId);
  if (!def) return 0;

  const levelData = getEffectiveSkillLevelData(skillId);
  if (!levelData) return 0;

  const player = getPlayer();
  const statValue = def.damageType === 'magic' ? player.magicPower : player.attack;
  const categoryBoost = getSkillCategoryBoost(skillId);
  return Math.floor(levelData.damage * statValue * (1 + categoryBoost));
}

/**
 * Compute the multiplicative damage bonus from player combat states.
 * Stacking: primed x wrath x duality (all multiplicative).
 */
function computePlayerStateMultiplier(): number {
  const player = getPlayer();
  let mult = 1.0;
  if (player.combatStates.primed) mult *= player.combatStates.primedMultiplier;
  if (player.combatStates.wrath) mult *= (1 + WRATH_DAMAGE_BONUS + player.combatStates.wrathBonusExtra);
  if (player.resonance.dualityActive) mult *= (1 + RESONANCE_DUALITY_DAMAGE_BONUS);
  return mult;
}

/**
 * Apply or refresh an enemy state on a monster (local helper — no system imports).
 */
function applyEnemyStateLocal(
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
 * Apply damage to a monster via combat events.
 * Handles crit calculation and damage reduction.
 * Returns the final damage dealt.
 */
export function applyDamageToMonster(
  monsterId: string,
  rawDamage: number,
  damageType: DamageType,
  bonusMultiplier: number = 1.0,
  options?: { source?: string; physDefenseMultOverride?: number },
): number {
  const monster = getMonsterById(monsterId);
  if (!monster || monster.isDead) return 0;

  const player = getPlayer();

  // Apply bonus multiplier + player state multiplier
  const stateMultiplier = computePlayerStateMultiplier();
  let baseDmg = Math.floor(rawDamage * bonusMultiplier * stateMultiplier);

  // Staggered: guaranteed crit
  const isStaggered = monster.enemyStates?.some(s => s.type === 'staggered' && s.duration > 0) ?? false;
  const isCrit = isStaggered || Math.random() < player.critChance;
  if (isCrit) {
    baseDmg = Math.floor(baseDmg * player.critDamage);
  }

  // Type-routed defense reduction (with enemy state debuffs + mark)
  // Mark defense reduction applies to all damage types (reduces effective defense/MR)
  const markDefReduction = monster.mark ? monster.mark.defenseReduction : 0;

  let finalDamage: number;
  if (damageType === 'physical') {
    let sunderedMult: number;
    if (options?.physDefenseMultOverride != null) {
      sunderedMult = options.physDefenseMultOverride;
    } else {
      const hasSundered = monster.enemyStates?.some(s => s.type === 'sundered' && s.duration > 0) ?? false;
      sunderedMult = hasSundered ? (1 - SUNDERED_DEFENSE_REDUCTION) : 1;
    }
    const effectiveDefense = Math.max(0, monster.defense * sunderedMult * (1 - markDefReduction) * (1 - player.armorPen));
    const reduction = effectiveDefense / (effectiveDefense + DEFENSE_CONSTANT);
    finalDamage = Math.max(MIN_DAMAGE, Math.floor(baseDmg * (1 - reduction)));
  } else {
    const chargedStacks = monster.enemyStates
      ?.filter(s => s.type === 'charged' && s.duration > 0)
      .reduce((sum, s) => sum + s.stacks, 0) ?? 0;
    const chargedMult = Math.max(0, 1 - chargedStacks * 0.20);
    const effectiveMR = Math.max(0, monster.magicResist * chargedMult * (1 - markDefReduction) * (1 - player.magicPen));
    const reduction = effectiveMR / (effectiveMR + DEFENSE_CONSTANT);
    finalDamage = Math.max(MIN_DAMAGE, Math.floor(baseDmg * (1 - reduction)));
  }

  // Shield: full 1:1 absorption
  if (monster.currentShield > 0) {
    const absorbed = Math.min(monster.currentShield, finalDamage);
    monster.currentShield -= absorbed;
    const overflow = finalDamage - absorbed;

    if (monster.currentShield <= 0) {
      monster.currentShield = 0;
      emit('monster:shieldBroken', { monsterId });
    }

    if (overflow <= 0) {
      // Fully absorbed
      emit('ui:damageNumber', {
        x: monster.x,
        y: monster.y,
        amount: absorbed,
        isCrit,
        damageType,
      });
      return 0;
    }

    finalDamage = overflow;
  }

  // Apply HP damage
  finalDamage = Math.max(MIN_DAMAGE, finalDamage);
  monster.currentHP = Math.max(0, monster.currentHP - finalDamage);

  // Track player stats
  player.totalDamageDealt += finalDamage;

  // Life steal / spell leech
  if (damageType === 'physical' && player.lifeSteal > 0) {
    const healed = Math.max(1, Math.floor(finalDamage * player.lifeSteal));
    player.currentHP = Math.min(player.maxHP, player.currentHP + healed);
    emit('player:healed', { amount: healed, source: 'life_steal' });
  }
  if (damageType === 'magic' && player.spellLeech > 0) {
    const healed = Math.max(1, Math.floor(finalDamage * player.spellLeech));
    player.currentHP = Math.min(player.maxHP, player.currentHP + healed);
    emit('player:healed', { amount: healed, source: 'spell_leech' });
  }

  // Emit events
  emit('combat:damageDealt', {
    targetId: monsterId,
    damage: finalDamage,
    isCrit,
    damageType,
    x: monster.x,
    y: monster.y,
    source: options?.source,
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

  // Impact VFX + knockback for skill/resonance hits
  const impactAngle = Math.atan2(monster.y - player.y, monster.x - player.x);
  emit('combat:impact', {
    x: monster.x,
    y: monster.y,
    angle: impactAngle,
    damage: finalDamage,
    isCrit,
    damageType,
    targetId: monsterId,
    source: options?.source,
  });

  if (finalDamage > 0 && !monster.isDead) {
    const knockDist = isCrit
      ? KNOCKBACK_DISTANCE_BASE * KNOCKBACK_CRIT_MULTIPLIER
      : KNOCKBACK_DISTANCE_BASE;
    const kbDist = Math.sqrt(
      (monster.x - player.x) ** 2 + (monster.y - player.y) ** 2,
    );
    if (kbDist > 0) {
      let toX = monster.x + Math.cos(impactAngle) * knockDist;
      let toY = monster.y + Math.sin(impactAngle) * knockDist;
      // Wall-aware knockback in expeditions
      const state = getState();
      if (state.activeExpedition) {
        const resolved = safeResolvePosition(
          state.activeExpedition.map,
          monster.x, monster.y,
          toX, toY,
          Math.max(10, monster.size * 0.35),
        );
        toX = resolved.x;
        toY = resolved.y;
      }
      monster.x = toX;
      monster.y = toY;
      emit('combat:knockback', {
        targetId: monsterId,
        fromX: player.x,
        fromY: player.y,
        toX,
        toY,
        duration: KNOCKBACK_TWEEN_DURATION,
      });
    }
  }

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

// ==========================================================================
// ENVIRONMENTAL ZONES
// ==========================================================================

/**
 * Create an Aftershock Zone at a world position. Exported for future Ground Slam to call.
 * Deals periodic physical damage and applies Sundered + Slow to enemies inside.
 */
export function createAftershockZone(x: number, y: number): void {
  const player = getPlayer();
  const zone: EnvironmentalZone = {
    id: `aftershock_${Date.now()}_${Math.random()}`,
    type: 'aftershock',
    x, y,
    radius: AFTERSHOCK_ZONE_RADIUS,
    duration: AFTERSHOCK_ZONE_DURATION,
    elapsed: 0,
    tickTimer: 0, // tick immediately on creation
    damagePerTick: Math.floor(player.attack * AFTERSHOCK_ZONE_DAMAGE_PERCENT),
    damageType: 'physical',
  };
  activeEnvironmentalZones.push(zone);
  emit('environment:zoneCreated', {
    id: zone.id, type: zone.type,
    x: zone.x, y: zone.y,
    radius: zone.radius, duration: zone.duration,
  });
}

function updateEnvironmentalZones(dt: number): void {
  for (let i = activeEnvironmentalZones.length - 1; i >= 0; i--) {
    const zone = activeEnvironmentalZones[i];
    zone.elapsed += dt;

    if (zone.elapsed >= zone.duration) {
      activeEnvironmentalZones.splice(i, 1);
      emit('environment:zoneExpired', { id: zone.id });
      continue;
    }

    zone.tickTimer -= dt;
    if (zone.tickTimer <= 0) {
      zone.tickTimer += AFTERSHOCK_ZONE_TICK_INTERVAL;

      const monsters = findMonstersInCircle(zone.x, zone.y, zone.radius);
      for (const monster of monsters) {
        applyDamageToMonster(monster.id, zone.damagePerTick, zone.damageType, 1.0, { source: 'environment' });
        // Aftershock: apply Sundered while inside
        applyEnemyStateLocal(monster.id, 'sundered', 1.0, 1);
        // Aftershock: apply slow
        emit('status:requestApply', {
          targetId: monster.id,
          type: 'slow',
          sourceAttack: 0,
          sourcePotency: 1.0,
        });
      }
    }
  }
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

// ==========================================================================
// SKILL HANDLERS (3 active skills)
// ==========================================================================

// --- Heavy Slash: melee arc — dispatcher routes to base or upgrade variant ---

function handleHeavySlash(data: SkillUsedData): void {
  const flags = getUpgradeFlags('heavy_slash');

  if (flags.sunderStacks) {
    handleHeavySlashSunbreaker(data, flags);
  } else if (flags.execute50Bonus !== undefined) {
    handleHeavySlashExecutioner(data, flags);
  } else if (flags.bleedStacks) {
    handleHeavySlashRavager(data, flags);
  } else {
    handleHeavySlashBase(data);
  }
}

// --- Base Heavy Slash (no upgrade): 100° arc, 56px range, Sundered, 1 Ash ---

function handleHeavySlashBase(data: SkillUsedData): void {
  const baseDamage = calculateSkillBaseDamage(data.skillId);
  const hits = findMonstersInArc(data.x, data.y, data.angle, 100, 56);

  for (const monster of hits) {
    applyDamageToMonster(monster.id, baseDamage, 'physical');
    applyEnemyStateLocal(monster.id, 'sundered', SUNDERED_DURATION, 1);
    if (monster.mark) consumeMark(monster);
  }

  emit('resonance:requestCharge', { type: 'ash', amount: 1 });
}

// --- Path A: Ravager — wide arc, Bleed stacks, no Sundered ---

function handleHeavySlashRavager(
  data: SkillUsedData,
  flags: Record<string, number | boolean | string>,
): void {
  const arcWidth = (flags.arcWidth as number) ?? 180;
  const range = (flags.range as number) ?? 90;
  const bleedStacks = (flags.bleedStacks as number) ?? 2;

  const baseDamage = calculateSkillBaseDamage('heavy_slash');
  const hits = findMonstersInArc(data.x, data.y, data.angle, arcWidth, range);
  const player = getPlayer();

  for (const monster of hits) {
    applyDamageToMonster(monster.id, baseDamage, 'physical');
    if (monster.mark) consumeMark(monster);

    // Apply Bleed stacks (no Sundered — removeSundered flag)
    for (let i = 0; i < bleedStacks; i++) {
      emit('status:requestApply', {
        targetId: monster.id,
        type: 'bleed',
        sourceAttack: player.attack,
        sourcePotency: player.statusPotency,
      });
    }
  }

  emit('resonance:requestCharge', { type: 'ash', amount: 1 });

  // Tier 2 — Hemorrhage: delayed second hit
  if (flags.doubleHit) {
    const secondHitDamageMult = (flags.secondHitDamageMult as number) ?? 0.60;
    const secondHitDelay = (flags.secondHitDelay as number) ?? 0.2;
    const secondDamage = Math.floor(baseDamage * secondHitDamageMult);

    let secondHitAshEmitted = false;
    delayedHits.push({
      remaining: secondHitDelay,
      targets: hits.map(m => m.id),
      damage: secondDamage,
      damageType: 'physical',
      bonusMultiplier: 1.0,
      source: 'skill',
      onResolve: (monsterId: string) => {
        // Second hit also applies Bleed stacks
        for (let i = 0; i < bleedStacks; i++) {
          emit('status:requestApply', {
            targetId: monsterId,
            type: 'bleed',
            sourceAttack: player.attack,
            sourcePotency: player.statusPotency,
          });
        }
        // Second hit generates +1 Ash (once, not per target)
        if (!secondHitAshEmitted) {
          secondHitAshEmitted = true;
          emit('resonance:requestCharge', { type: 'ash', amount: 1 });
        }
      },
    });
  }

  // Cast move speed bonus (brief boost during swing)
  if (flags.castMoveSpeedBonus) {
    const bonus = flags.castMoveSpeedBonus as number;
    player.moveSpeed *= (1 + bonus);
    scheduleBuffExpiry('heavy_slash_moveboost', 0.3, () => {
      player.moveSpeed /= (1 + bonus);
    });
  }
}

// --- Path B: Executioner — execute damage, extended Sundered, crit bonus ---

function handleHeavySlashExecutioner(
  data: SkillUsedData,
  flags: Record<string, number | boolean | string>,
): void {
  const execute50Bonus = (flags.execute50Bonus as number) ?? 0.30;
  const execute25Bonus = (flags.execute25Bonus as number) ?? 0.60;
  const critBonus = (flags.critBonus as number) ?? 0.08;
  const sunderedDuration = (flags.sunderedDuration as number) ?? 10;

  const baseDamage = calculateSkillBaseDamage('heavy_slash');
  const hits = findMonstersInArc(data.x, data.y, data.angle, 100, 56);
  const player = getPlayer();

  // Snapshot sundered status BEFORE damage loop (for Coup de Grâce)
  const wasSunderedMap = new Map<string, boolean>();
  for (const monster of hits) {
    const hasSundered = monster.enemyStates?.some(s => s.type === 'sundered' && s.duration > 0) ?? false;
    wasSunderedMap.set(monster.id, hasSundered);
  }

  // Temporarily boost crit chance
  player.critChance += critBonus;

  for (const monster of hits) {
    // Execute damage bonus based on HP ratio
    const hpRatio = monster.currentHP / monster.maxHP;
    let executeMult = 1.0;
    if (hpRatio < 0.25) {
      executeMult += execute25Bonus;
    } else if (hpRatio < 0.50) {
      executeMult += execute50Bonus;
    }

    applyDamageToMonster(monster.id, baseDamage, 'physical', executeMult);
    if (monster.mark) consumeMark(monster);

    // Apply Sundered with extended duration
    if (!monster.isDead) {
      applyEnemyStateLocal(monster.id, 'sundered', sunderedDuration, 1);
    }
  }

  // Restore crit chance
  player.critChance -= critBonus;

  // Tier 2 — Coup de Grâce: killing blow triggers AoE burst
  if (flags.executionBurst) {
    const burstRadius = (flags.burstRadius as number) ?? 60;
    const burstDamageMult = (flags.burstDamageMult as number) ?? 1.0;
    const burstAshCharges = (flags.burstAshCharges as number) ?? 2;
    const sunderedBurstRadiusMult = (flags.sunderedBurstRadiusMult as number) ?? 1.5;

    for (const monster of hits) {
      if (monster.isDead && monster.currentHP <= 0) {
        const wasSundered = wasSunderedMap.get(monster.id) ?? false;
        const effectiveRadius = wasSundered ? burstRadius * sunderedBurstRadiusMult : burstRadius;
        const burstDamage = Math.floor(player.attack * burstDamageMult);

        const burstHits = findMonstersInCircle(monster.x, monster.y, effectiveRadius);
        for (const burstTarget of burstHits) {
          if (burstTarget.id === monster.id) continue; // skip the dead monster
          applyDamageToMonster(burstTarget.id, burstDamage, 'physical', 1.0, { source: 'skill' });
        }

        emit('resonance:requestCharge', { type: 'ash', amount: burstAshCharges });
      }
    }
  }

  emit('resonance:requestCharge', { type: 'ash', amount: 1 });
}

// --- Path C: Sunbreaker — graduated Sunder Stacks, detonation at max ---

function handleHeavySlashSunbreaker(
  data: SkillUsedData,
  flags: Record<string, number | boolean | string>,
): void {
  const maxSunderStacks = (flags.maxSunderStacks as number) ?? 3;
  const detonationRadius = (flags.detonationRadius as number) ?? 70;
  const detonationDamageMult = (flags.detonationDamageMult as number) ?? 0.6;

  const baseDamage = calculateSkillBaseDamage('heavy_slash');
  const hits = findMonstersInArc(data.x, data.y, data.angle, 100, 56);
  const player = getPlayer();

  for (const monster of hits) {
    // Check current sunder stacks BEFORE incrementing
    const sunderedState = monster.enemyStates?.find(s => s.type === 'sundered');
    const currentStacks = sunderedState?.stacks ?? 0;
    const wasFullySundered = currentStacks >= maxSunderStacks;

    if (wasFullySundered) {
      // --- Sundered Detonation: clear stacks, AoE at monster position ---
      // Clear sunder stacks on the triggering monster
      if (sunderedState) {
        sunderedState.stacks = 0;
        sunderedState.duration = 0;
      }
      emit('enemyState:expired', { monsterId: monster.id, type: 'sundered' });

      // Deal base damage to triggering monster (no defense reduction from cleared sunder)
      applyDamageToMonster(monster.id, baseDamage, 'physical');
      if (monster.mark) consumeMark(monster);

      // AoE detonation
      let radius = detonationRadius;
      let detonationDamage = Math.floor(player.attack * detonationDamageMult);

      // Tier 2 — Cataclysm: radius scales with Ash charges, apply sunder to hit targets
      if (flags.chainDetonation) {
        const ashScaling = (flags.detonationAshScaling as number) ?? 0.30;
        const ashCap = (flags.detonationAshCap as number) ?? 5;
        const ashCharges = Math.min(player.resonance.ash, ashCap);
        radius *= (1 + ashCharges * ashScaling);

        // Consume all Ash charges
        if (player.resonance.ash > 0) {
          player.resonance.ash = 0;
          emit('resonance:chargeLost', { type: 'ash', current: 0 });
        }
      }

      const detonationHits = findMonstersInCircle(monster.x, monster.y, radius);
      for (const target of detonationHits) {
        if (target.id === monster.id) continue; // skip triggering monster
        applyDamageToMonster(target.id, detonationDamage, 'physical', 1.0, { source: 'skill' });

        // Cataclysm: apply 1 Sunder Stack to detonation targets
        if (flags.chainDetonation && !target.isDead) {
          applyEnemyStateLocal(target.id, 'sundered', SUNDERED_DURATION, maxSunderStacks);
        }
      }
    } else {
      // --- Normal hit: increment sunder stacks, deal damage with graduated reduction ---
      // Apply/increment sunder stacks
      applyEnemyStateLocal(monster.id, 'sundered', SUNDERED_DURATION, maxSunderStacks);

      const newStacks = Math.min(currentStacks + 1, maxSunderStacks);
      // Graduated defense mult: -10% per stack
      const defMult = 1 - (newStacks * 0.10);

      applyDamageToMonster(monster.id, baseDamage, 'physical', 1.0, {
        physDefenseMultOverride: defMult,
      });
      if (monster.mark) consumeMark(monster);
    }
  }

  emit('resonance:requestCharge', { type: 'ash', amount: 1 });
}

// --- Arcane Bolt: dispatcher routes to base or upgrade variant ---

function handleArcaneBolt(data: SkillUsedData): void {
  const flags = getUpgradeFlags('arcane_bolt');

  if (flags.piercing) {
    handleArcaneBoltUnstable(data, flags);
  } else if (flags.doubleCharged) {
    handleArcaneBoltOverload(data, flags);
  } else if (flags.persistentHoming) {
    handleArcaneBoltSeeker(data, flags);
  } else {
    handleArcaneBoltBase(data);
  }
}

// --- Base Arcane Bolt (no upgrade): homing projectile, 1 Charged, 1 Ember ---

function handleArcaneBoltBase(data: SkillUsedData): void {
  const baseDamage = calculateSkillBaseDamage(data.skillId);
  const def = getSkillDef(data.skillId);
  if (!def) return;

  const speed = def.projectileSpeed ?? 400;
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

  // Generate 1 Ember charge
  emit('resonance:requestCharge', { type: 'ember', amount: 1 });
}

// --- Path A: Seeker — persistent homing, chain on impact ---

function handleArcaneBoltSeeker(
  data: SkillUsedData,
  flags: Record<string, number | boolean | string>,
): void {
  const baseDamage = calculateSkillBaseDamage('arcane_bolt');
  const def = getSkillDef('arcane_bolt');
  if (!def) return;

  const speed = def.projectileSpeed ?? 400;
  const vx = Math.cos(data.angle) * speed;
  const vy = Math.sin(data.angle) * speed;

  // Seeker: base = 1 bounce; Thunderchain = flags.chainBounces (3)
  const bounces = (flags.chainBounces as number) ?? 1;

  const projectile: ProjectileInstance = {
    id: generateProjectileId(),
    ownerId: 'player',
    skillId: 'arcane_bolt',
    x: data.x,
    y: data.y,
    velocityX: vx,
    velocityY: vy,
    speed,
    damage: baseDamage,
    damageType: 'magic',
    piercing: false,
    hitTargets: [],
    bounces,
    bounceRange: (flags.chainRange as number) ?? 200,
    maxDistance: 600,
    distanceTraveled: 0,
    isExpired: false,
    color: def.color,
    size: 8,
    persistentHoming: true,
    statusEffect: def.statusEffect,
    statusChance: getSkillLevelData('arcane_bolt')?.statusChance,
  };

  getState().projectiles.push(projectile);
  emit('projectile:spawned', { projectile });

  emit('resonance:requestCharge', { type: 'ember', amount: 1 });
}

// --- Path B: Overload — same projectile as base; all logic in onProjectileHit ---

function handleArcaneBoltOverload(
  _data: SkillUsedData,
  _flags: Record<string, number | boolean | string>,
): void {
  // Overload projectile is identical to base
  handleArcaneBoltBase(_data);
}

// --- Path C: Unstable Bolt — piercing, fast, explosion on 3rd pierce ---

function handleArcaneBoltUnstable(
  data: SkillUsedData,
  flags: Record<string, number | boolean | string>,
): void {
  const baseDamage = calculateSkillBaseDamage('arcane_bolt');
  const def = getSkillDef('arcane_bolt');
  if (!def) return;

  const speed = (flags.speedOverride as number) ?? 600;
  const vx = Math.cos(data.angle) * speed;
  const vy = Math.sin(data.angle) * speed;

  const projectile: ProjectileInstance = {
    id: generateProjectileId(),
    ownerId: 'player',
    skillId: 'arcane_bolt',
    x: data.x,
    y: data.y,
    velocityX: vx,
    velocityY: vy,
    speed,
    damage: baseDamage,
    damageType: 'magic',
    piercing: true,
    hitTargets: [],
    maxDistance: 800,
    distanceTraveled: 0,
    isExpired: false,
    color: def.color,
    size: 8,
    piercingHitCount: 0,
    piercingDamageScale: 1.0,
    hitSunderedTarget: false,
    statusEffect: def.statusEffect,
    statusChance: getSkillLevelData('arcane_bolt')?.statusChance,
  };

  getState().projectiles.push(projectile);
  emit('projectile:spawned', { projectile });

  emit('resonance:requestCharge', { type: 'ember', amount: 1 });
}

// --- Shadow Step: dispatcher routes to base or upgrade variant ---

function handleShadowStep(data: SkillUsedData): void {
  const flags = getUpgradeFlags('shadow_step');

  if (flags.shadowTrail) {
    handleShadowStepPhaseWalk(data, flags);
  } else if (flags.dashDistance) {
    handleShadowStepMomentum(data, flags);
  } else if (flags.behindTarget) {
    handleShadowStepAssassin(data, flags);
  } else {
    handleShadowStepBase(data);
  }
}

// --- Base Shadow Step (no upgrade): dash 200px, 40px arrival AoE, Stagger, 1 Ash ---

function handleShadowStepBase(data: SkillUsedData): void {
  const player = getPlayer();
  const def = getSkillDef('shadow_step');
  const dashDistance = def?.range ?? 200;
  const duration = dashDistance / DASH_SPEED;

  player.isDashing = true;
  player.isInvulnerable = true;

  const targetX = player.x + Math.cos(data.angle) * dashDistance;
  const targetY = player.y + Math.sin(data.angle) * dashDistance;

  emit('skill:buffApplied', { skillId: data.skillId, duration });

  dashState = {
    active: true, targetX, targetY,
    startX: player.x, startY: player.y,
    elapsed: 0, duration, skillId: data.skillId,
    flags: {}, throughStaggerHits: [],
  };
}

// --- Path A: Assassin — teleport behind nearest enemy, +crit bonus ---

function handleShadowStepAssassin(
  data: SkillUsedData,
  flags: Record<string, number | boolean | string>,
): void {
  const player = getPlayer();
  const behindRange = (flags.behindRange as number) ?? 120;

  // Find nearest alive monster within behindRange of cursor position
  const target = findNearestMonster(data.x, data.y, behindRange);

  let targetX: number;
  let targetY: number;

  if (target) {
    // Compute behind-position: angle from player → enemy, then offset behind
    const angle = Math.atan2(target.y - player.y, target.x - player.x);
    targetX = target.x + Math.cos(angle) * ASSASSIN_BEHIND_OFFSET;
    targetY = target.y + Math.sin(angle) * ASSASSIN_BEHIND_OFFSET;
  } else {
    // No target found — fall back to base directional dash
    const def = getSkillDef('shadow_step');
    const dashDistance = def?.range ?? 200;
    targetX = player.x + Math.cos(data.angle) * dashDistance;
    targetY = player.y + Math.sin(data.angle) * dashDistance;
  }

  const dx = targetX - player.x;
  const dy = targetY - player.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const duration = Math.max(0.05, dist / DASH_SPEED);

  player.isDashing = true;
  player.isInvulnerable = true;

  emit('skill:buffApplied', { skillId: data.skillId, duration });

  dashState = {
    active: true, targetX, targetY,
    startX: player.x, startY: player.y,
    elapsed: 0, duration, skillId: data.skillId,
    flags, throughStaggerHits: [],
  };
}

// --- Path B: Momentum Dash — longer dash, distance-scaling damage ---

function handleShadowStepMomentum(
  data: SkillUsedData,
  flags: Record<string, number | boolean | string>,
): void {
  const player = getPlayer();
  const dashDistance = (flags.dashDistance as number) ?? 240;
  const duration = dashDistance / DASH_SPEED;

  player.isDashing = true;
  player.isInvulnerable = true;

  const targetX = player.x + Math.cos(data.angle) * dashDistance;
  const targetY = player.y + Math.sin(data.angle) * dashDistance;

  emit('skill:buffApplied', { skillId: data.skillId, duration });

  dashState = {
    active: true, targetX, targetY,
    startX: player.x, startY: player.y,
    elapsed: 0, duration, skillId: data.skillId,
    flags, throughStaggerHits: [],
  };
}

// --- Path C: Phase Walk — shadow trail + through-dash stagger ---

function handleShadowStepPhaseWalk(
  data: SkillUsedData,
  flags: Record<string, number | boolean | string>,
): void {
  const player = getPlayer();
  const def = getSkillDef('shadow_step');
  const dashDistance = def?.range ?? 200;
  const duration = dashDistance / DASH_SPEED;

  player.isDashing = true;
  player.isInvulnerable = true;

  const targetX = player.x + Math.cos(data.angle) * dashDistance;
  const targetY = player.y + Math.sin(data.angle) * dashDistance;

  emit('skill:buffApplied', { skillId: data.skillId, duration });

  dashState = {
    active: true, targetX, targetY,
    startX: player.x, startY: player.y,
    elapsed: 0, duration, skillId: data.skillId,
    flags, throughStaggerHits: [],
  };
}

// ==========================================================================
// SHADOW STEP LANDING — upgrade-aware resolution
// ==========================================================================

function resolveShadowStepLanding(): void {
  const player = getPlayer();
  const flags = dashState.flags;

  // 1. Calculate base arrival damage
  let arrivalDamage = calculateSkillBaseDamage('shadow_step');

  // 2. Apply arrivalDamageMult if set (Assassin: 0.8×)
  if (typeof flags.arrivalDamageMult === 'number') {
    arrivalDamage = Math.floor(arrivalDamage * flags.arrivalDamageMult);
  }

  // 3. Distance damage scaling (Momentum): bonus from distance traveled
  if (typeof flags.distanceDamageScaling === 'number' && typeof flags.distanceDamageInterval === 'number') {
    const dx = player.x - dashState.startX;
    const dy = player.y - dashState.startY;
    const actualDistance = Math.sqrt(dx * dx + dy * dy);
    const intervals = Math.floor(actualDistance / (flags.distanceDamageInterval as number));
    const bonus = intervals * (flags.distanceDamageScaling as number);
    arrivalDamage = Math.floor(arrivalDamage * (1 + bonus));
  }

  // 4. Determine arrival radius and stagger duration
  const arrivalRadius = (typeof flags.arrivalRadius === 'number') ? flags.arrivalRadius : 40;
  const staggerDuration = (typeof flags.staggerDurationOverride === 'number')
    ? flags.staggerDurationOverride : STAGGERED_DURATION;

  // 5. Stealth crit bonus: temporarily boost crit for arrival damage
  let critBoostApplied = false;
  if (assassinCritBonusActive) {
    player.critChance += assassinCritBonusAmount;
    critBoostApplied = true;
  }

  // 6. Find monsters in arrival radius and apply damage + Stagger
  const hits = findMonstersInCircle(player.x, player.y, arrivalRadius);
  const knockbackDist = (typeof flags.knockbackDistance === 'number') ? flags.knockbackDistance : 0;

  for (const monster of hits) {
    applyDamageToMonster(monster.id, arrivalDamage, 'physical');

    if (!monster.isDead) {
      applyEnemyStateLocal(monster.id, 'staggered', staggerDuration, 1);
    }

    // Knockback (Momentum: 30px)
    if (knockbackDist > 0 && !monster.isDead) {
      applyKnockback(monster, player.x, player.y, knockbackDist);
    }
  }

  // 7. Restore crit chance if boosted
  if (critBoostApplied) {
    player.critChance -= assassinCritBonusAmount;
  }

  // 8. Ash generation
  if (typeof flags.ashPerHit === 'number') {
    // Impact Wave: +N ash per enemy hit
    for (const _monster of hits) {
      emit('resonance:requestCharge', { type: 'ash', amount: flags.ashPerHit as number });
    }
  } else {
    // Base: +1 Ash
    emit('resonance:requestCharge', { type: 'ash', amount: 1 });
  }

  // 9. Post-landing effects

  // Double pulse (Impact Wave tier 2)
  if (flags.doublePulse) {
    const secondPulseDelay = (flags.secondPulseDelay as number) ?? 0.3;
    const secondPulseRadius = (flags.secondPulseRadius as number) ?? 100;
    const secondPulseDamageMult = (flags.secondPulseDamageMult as number) ?? 0.50;
    const secondPulseDamage = Math.floor(arrivalDamage * secondPulseDamageMult);
    const landingX = player.x;
    const landingY = player.y;
    const ashPerHit = (typeof flags.ashPerHit === 'number') ? (flags.ashPerHit as number) : 1;

    delayedHits.push({
      remaining: secondPulseDelay,
      targets: [],  // we'll find targets at resolution time
      damage: secondPulseDamage,
      damageType: 'physical',
      bonusMultiplier: 1.0,
      source: 'skill',
      onResolve: () => {
        // Find monsters at landing position (not current player pos)
        const pulseHits = findMonstersInCircle(landingX, landingY, secondPulseRadius);
        for (const m of pulseHits) {
          applyDamageToMonster(m.id, secondPulseDamage, 'physical', 1.0, { source: 'skill' });
          if (!m.isDead) {
            applyEnemyStateLocal(m.id, 'staggered', STAGGERED_DURATION, 1);
          }
          emit('resonance:requestCharge', { type: 'ash', amount: ashPerHit });
        }
      },
    });
  }

  // Shadow Trail (Phase Walk)
  if (flags.shadowTrail) {
    createShadowTrail(flags);
  }

  // Stealth (Death's Shadow tier 2)
  if (flags.stealth) {
    activateStealth(flags);
  }

  // Shadow Echo (Echo Step tier 2)
  if (flags.shadowEcho) {
    scheduleEcho(arrivalDamage, flags);
  }

  // Assassin crit bonus (tier 1 — +40% crit on next attack)
  if (typeof flags.nextAttackCritBonus === 'number' && !flags.stealth) {
    assassinCritBonusActive = true;
    assassinCritBonusAmount = flags.nextAttackCritBonus as number;
    // Generous timeout to prevent leaking
    scheduleBuffExpiry('shadow_step_crit_bonus', 5.0, () => {
      assassinCritBonusActive = false;
      assassinCritBonusAmount = 0;
    });
  }

  // Stealth overrides assassin crit with guaranteed crit
  if (flags.stealth && flags.guaranteedCrit) {
    assassinCritBonusActive = true;
    assassinCritBonusAmount = 1.0; // guaranteed
    scheduleBuffExpiry('shadow_step_crit_bonus', (flags.stealthDuration as number) ?? 2.0, () => {
      assassinCritBonusActive = false;
      assassinCritBonusAmount = 0;
    });
  }
}

// ==========================================================================
// SHADOW STEP HELPERS
// ==========================================================================

/** Apply knockback to a monster away from a source point */
function applyKnockback(monster: MonsterInstance, fromX: number, fromY: number, distance: number): void {
  const dx = monster.x - fromX;
  const dy = monster.y - fromY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= 0) return;

  const newX = monster.x + (dx / dist) * distance;
  const newY = monster.y + (dy / dist) * distance;

  // Resolve against map walls
  const state = getState();
  if (state.activeExpedition) {
    const resolved = safeResolvePosition(
      state.activeExpedition.map,
      monster.x, monster.y,
      newX, newY,
      Math.max(10, monster.size * 0.35),
    );
    monster.x = resolved.x;
    monster.y = resolved.y;
  } else {
    monster.x = newX;
    monster.y = newY;
  }

  emit('combat:knockback', {
    targetId: monster.id,
    fromX, fromY,
    toX: monster.x, toY: monster.y,
    duration: 0.15,
  });
}

/** Create a shadow trail from dash start to landing (Phase Walk) */
function createShadowTrail(flags: Record<string, number | boolean | string>): void {
  const player = getPlayer();
  const width = (flags.trailWidth as number) ?? 16;
  const duration = (flags.trailDuration as number) ?? 2.0;
  const damagePercent = (flags.trailDamagePercent as number) ?? 0.20;
  const damagePerSec = Math.floor(player.attack * damagePercent);

  const trail: ShadowTrailInstance = {
    startX: dashState.startX,
    startY: dashState.startY,
    endX: player.x,
    endY: player.y,
    width,
    remaining: duration,
    damagePerTick: Math.floor(damagePerSec * SHADOW_TRAIL_TICK_INTERVAL),
    tickTimer: SHADOW_TRAIL_TICK_INTERVAL,
  };

  activeTrails.push(trail);

  emit('shadow:trailCreated', {
    startX: trail.startX, startY: trail.startY,
    endX: trail.endX, endY: trail.endY,
    width, duration,
  });
}

/** Activate stealth (Death's Shadow tier 2) */
function activateStealth(flags: Record<string, number | boolean | string>): void {
  const player = getPlayer();
  stealthActive = true;
  stealthTimer = (flags.stealthDuration as number) ?? 2.0;
  stealthGuaranteedCrit = !!flags.guaranteedCrit;
  stealthGuaranteedStatus = !!flags.guaranteedStatus;
  player.isStealth = true;
  emit('player:stealthStart');
}

/** Deactivate stealth */
function deactivateStealth(): void {
  if (!stealthActive) return;
  stealthActive = false;
  stealthTimer = 0;
  const player = getPlayer();
  player.isStealth = false;
  emit('player:stealthEnd');
}

/** Schedule a shadow echo (Echo Step tier 2) */
function scheduleEcho(arrivalBaseDamage: number, flags: Record<string, number | boolean | string>): void {
  const player = getPlayer();
  const echoDamageMult = (flags.echoDamageMult as number) ?? 0.60;

  echoState = {
    pending: true,
    remaining: (flags.echoDelay as number) ?? 1.5,
    startX: dashState.startX,
    startY: dashState.startY,
    endX: player.x,
    endY: player.y,
    arrivalDamage: Math.floor(arrivalBaseDamage * echoDamageMult),
    flags,
  };
}

/** Resolve the echo arrival (delayed dash replay) */
function resolveEchoArrival(): void {
  emit('shadow:echoStarted', {
    startX: echoState.startX, startY: echoState.startY,
    endX: echoState.endX, endY: echoState.endY,
    duration: 0.2,
  });

  // Find monsters at echo endpoint (40px radius)
  const hits = findMonstersInCircle(echoState.endX, echoState.endY, 40);

  for (const monster of hits) {
    applyDamageToMonster(monster.id, echoState.arrivalDamage, 'physical', 1.0, { source: 'skill' });
    if (!monster.isDead) {
      applyEnemyStateLocal(monster.id, 'staggered', STAGGERED_DURATION, 1);
    }
  }

  // Generate +1 Ash
  emit('resonance:requestCharge', { type: 'ash', amount: 1 });

  // If original flags had shadowTrail, create another trail for the echo
  if (echoState.flags.shadowTrail) {
    const width = (echoState.flags.trailWidth as number) ?? 16;
    const duration = (echoState.flags.trailDuration as number) ?? 2.0;
    const damagePercent = (echoState.flags.trailDamagePercent as number) ?? 0.20;
    const player = getPlayer();
    const damagePerSec = Math.floor(player.attack * damagePercent);

    const trail: ShadowTrailInstance = {
      startX: echoState.startX,
      startY: echoState.startY,
      endX: echoState.endX,
      endY: echoState.endY,
      width,
      remaining: duration,
      damagePerTick: Math.floor(damagePerSec * SHADOW_TRAIL_TICK_INTERVAL),
      tickTimer: SHADOW_TRAIL_TICK_INTERVAL,
    };

    activeTrails.push(trail);
    emit('shadow:trailCreated', {
      startX: trail.startX, startY: trail.startY,
      endX: trail.endX, endY: trail.endY,
      width, duration,
    });
  }

  // Through-dash stagger along echo path
  if (echoState.flags.throughDashStagger) {
    const state = getState();
    for (const monster of state.monsters) {
      if (monster.isDead) continue;
      const dist = pointToSegmentDistance(
        monster.x, monster.y,
        echoState.startX, echoState.startY,
        echoState.endX, echoState.endY,
      );
      if (dist <= PLAYER_BODY_RADIUS + monster.size / 2) {
        applyEnemyStateLocal(monster.id, 'staggered', STAGGERED_DURATION, 1);
      }
    }
  }
}

/** Point-to-segment distance for trail collision detection */
function pointToSegmentDistance(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + t * dx, projY = y1 + t * dy;
  return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
}

// ==========================================================================
// RESONANCE RELEASE HANDLER
// ==========================================================================

function onResonanceRelease(data: { type: 'ashburst' | 'overload'; x: number; y: number }): void {
  const player = getPlayer();

  // Flow State passive: +30% damage, +20% radius on resonance release
  const flowBoost = player.resonance.flowReleaseBoost;
  const damageMult = flowBoost ? (1 + FLOW_STATE_RELEASE_DAMAGE_BONUS) : 1;
  const radiusMult = flowBoost ? (1 + FLOW_STATE_RELEASE_RADIUS_BONUS) : 1;

  if (data.type === 'ashburst') {
    // Physical AoE around player
    const radius = ASHBURST_RADIUS * radiusMult;
    const hits = findMonstersInCircle(data.x, data.y, radius);
    const damage = Math.floor(player.attack * ASHBURST_DAMAGE_MULT * damageMult);
    for (const monster of hits) {
      applyDamageToMonster(monster.id, damage, 'physical', 1.0, { source: 'resonance' });
    }
  } else {
    // Magic AoE around player
    const radius = OVERLOAD_RADIUS * radiusMult;
    const hits = findMonstersInCircle(data.x, data.y, radius);
    const damage = Math.floor(player.magicPower * OVERLOAD_DAMAGE_MULT * damageMult);
    for (const monster of hits) {
      applyDamageToMonster(monster.id, damage, 'magic', 1.0, { source: 'resonance' });
    }
  }
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
  // Upgrade fields
  flags: Record<string, number | boolean | string>;
  throughStaggerHits: string[];  // monster IDs staggered during dash (Phase Walk)
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
  flags: {},
  throughStaggerHits: [],
};

// Shadow Trail instances (Phase Walk)
interface ShadowTrailInstance {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  width: number;
  remaining: number;
  damagePerTick: number;
  tickTimer: number;
}
const activeTrails: ShadowTrailInstance[] = [];

// Environmental zones (Aftershock, future ground effects)
const activeEnvironmentalZones: EnvironmentalZone[] = [];

// Stealth state (Death's Shadow)
let stealthActive = false;
let stealthTimer = 0;
let stealthGuaranteedCrit = false;
let stealthGuaranteedStatus = false;

// Echo state (Echo Step)
interface EchoState {
  pending: boolean;
  remaining: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  arrivalDamage: number;
  flags: Record<string, number | boolean | string>;
}
let echoState: EchoState = {
  pending: false, remaining: 0,
  startX: 0, startY: 0, endX: 0, endY: 0,
  arrivalDamage: 0, flags: {},
};

// Assassin crit bonus (consumed on next attack)
let assassinCritBonusActive = false;
let assassinCritBonusAmount = 0;

// --- Basic Attack Upgrade State ---

// Overwhelm tracking (basic_attack path C)
let overwhelmTargetId = '';
let overwhelmHitCount = 0;
let overwhelmTimer = 0;

// Quick Draw tracking (ranger_shot path B)
let rangerShotFireCount = 0;
let rapidVolleyStacks = 0;

// Cascade tracking (arcane_strike path A — Resonant Strike)
let cascadeChargesRemaining = 0;
let cascadeDamageBonus = 0;
let cascadeGrantsEmber = false;

/** Delayed hit queue — for effects that resolve after a short delay (e.g. Hemorrhage) */
interface DelayedHit {
  remaining: number;
  targets: string[];        // monster IDs
  damage: number;
  damageType: DamageType;
  bonusMultiplier: number;
  source: string;
  onResolve?: (monsterId: string) => void; // per-target callback (e.g. apply bleed)
}
const delayedHits: DelayedHit[] = [];

// --- Timer helpers ---

function scheduleBuffExpiry(skillId: string, duration: number, onExpire: () => void): void {
  // Remove any existing timer for this skill
  const existingIdx = activeBuffTimers.findIndex(t => t.skillId === skillId);
  if (existingIdx !== -1) {
    activeBuffTimers.splice(existingIdx, 1);
  }

  activeBuffTimers.push({ skillId, remaining: duration, onExpire });
}

// ==========================================================================
// PROJECTILE HIT HANDLER — handles damage + all arcane bolt upgrade effects
// ==========================================================================

function onProjectileHit(data: { projectileId: string; targetId: string; x: number; y: number }): void {
  const state = getState();
  const proj = state.projectiles.find(p => p.id === data.projectileId);
  if (!proj || proj.ownerId !== 'player') return;

  // Handle ranger_shot projectile hits
  if (proj.skillId === 'ranger_shot') {
    const rsFlags = getUpgradeFlags('ranger_shot');
    let rawDamage = proj.damage;

    // Piercing Shot: damage falloff per pierce, Sundered bonuses
    if (proj.maxPierceTargets != null && proj.piercingHitCount != null && proj.piercingHitCount > 0) {
      // Damage already reduced by combat.ts pierce handler; apply Sundered bonus
      const targetMon = getMonsterById(data.targetId);
      if (targetMon && !targetMon.isDead && proj.sunderedPierceBonus) {
        const hasSundered = targetMon.enemyStates?.some(s => s.type === 'sundered' && s.duration > 0) ?? false;
        if (hasSundered) {
          rawDamage = Math.floor(rawDamage * (1 + proj.sunderedPierceBonus));
          // Skewering: extend Sundered duration
          if (proj.sunderedPierceExtend) {
            const sunderedState = targetMon.enemyStates?.find(s => s.type === 'sundered');
            if (sunderedState) {
              sunderedState.duration += proj.sunderedPierceExtend;
            }
          }
        }
      }
      // +1 Ash per extra target beyond first
      if (typeof rsFlags.pierceAshPerExtra === 'number') {
        emit('resonance:requestCharge', { type: 'ash', amount: rsFlags.pierceAshPerExtra as number });
      }
    }

    applyDamageToMonster(data.targetId, rawDamage, 'physical', 1.0, { source: 'basic' });
    applyEquipmentStatusProcs(data.targetId, 'physical');

    // Marked Shot: apply mark to target
    if (typeof rsFlags.markDuration === 'number') {
      const targetMon = getMonsterById(data.targetId);
      if (targetMon && !targetMon.isDead) {
        targetMon.mark = {
          duration: rsFlags.markDuration as number,
          damageBonus: (rsFlags.markDamageBonus as number) ?? 0.15,
          defenseReduction: (rsFlags.markDefenseReduction as number) ?? 0.10,
          energyRefund: (rsFlags.markEnergyRefund as number) ?? 8,
          cooldownRefund: typeof rsFlags.markCooldownRefund === 'number' ? rsFlags.markCooldownRefund as number : undefined,
        };
      }
    }
    return;
  }

  if (proj.skillId !== 'arcane_bolt') return;

  const flags = getUpgradeFlags('arcane_bolt');
  const player = getPlayer();

  // --- 1. Calculate hit damage (apply piercingDamageScale if set) ---
  const rawDamage = proj.piercingDamageScale != null
    ? Math.floor(proj.damage * proj.piercingDamageScale)
    : proj.damage;

  // --- 2. Deal damage ---
  applyDamageToMonster(data.targetId, rawDamage, 'magic', 1.0, { source: 'skill' });

  // --- 2b. Consume mark (arcane_bolt is a non-basic skill) ---
  const markTarget = getMonsterById(data.targetId);
  if (markTarget && !markTarget.isDead && markTarget.mark) {
    consumeMark(markTarget);
  }

  // --- 3. Apply Charged: 2 stacks if doubleCharged, else 1 ---
  const monster = getMonsterById(data.targetId);
  if (monster && !monster.isDead) {
    if (flags.doubleCharged) {
      // Apply 2 stacks (call twice so applyEnemyStateLocal increments)
      applyEnemyStateLocal(data.targetId, 'charged', CHARGED_DURATION, CHARGED_MAX_STACKS);
      applyEnemyStateLocal(data.targetId, 'charged', CHARGED_DURATION, CHARGED_MAX_STACKS);
    } else {
      applyEnemyStateLocal(data.targetId, 'charged', CHARGED_DURATION, CHARGED_MAX_STACKS);
    }
  }

  // --- 4. Discharge check (Path B): doubleCharged + monster at max Charged stacks ---
  if (flags.doubleCharged) {
    handleDischargeCheck(data.targetId, data.x, data.y, flags);
  }

  // --- 5. Chain bounce (Path A): if proj.bounces > 0 ---
  if (proj.bounces != null && proj.bounces > 0) {
    handleChainBounce(proj, data.x, data.y, flags);
  }

  // --- 6. Thunderchain burst: max-Charged target triggers Overload Burst ---
  if (flags.overloadBurstOnMaxCharged) {
    const targetMonster = getMonsterById(data.targetId);
    if (targetMonster && !targetMonster.isDead) {
      const chargedStacks = targetMonster.enemyStates
        ?.filter(s => s.type === 'charged' && s.duration > 0)
        .reduce((sum, s) => sum + s.stacks, 0) ?? 0;
      if (chargedStacks >= CHARGED_MAX_STACKS) {
        handleOverloadBurst(data.targetId, data.x, data.y, flags);
      }
    }
  }

  // --- 7. Piercing effects (Path C) ---
  if (proj.piercing && proj.piercingHitCount != null) {
    // Track hitSunderedTarget
    const targetMon = getMonsterById(data.targetId);
    if (targetMon && !targetMon.isDead) {
      const hasSundered = targetMon.enemyStates?.some(s => s.type === 'sundered' && s.duration > 0) ?? false;
      if (hasSundered) {
        proj.hitSunderedTarget = true;
      }
    }

    // Scale piercingDamageScale for next hit (Chain Reaction)
    if (flags.piercingDamageScaling && proj.piercingDamageScale != null) {
      proj.piercingDamageScale *= (1 + (flags.piercingDamageScaling as number));
    }

    // Explosion at threshold (Unstable Bolt: 3rd pierce)
    const threshold = (flags.explosionThreshold as number) ?? 0;
    if (threshold > 0 && proj.piercingHitCount === threshold) {
      handlePiercingExplosion(proj, data.x, data.y, flags);
    }
  }
}

// ==========================================================================
// ARCANE BOLT UPGRADE HELPERS
// ==========================================================================

/**
 * Path B — Discharge: triggers when a monster reaches max Charged stacks.
 * Clears all Charged on trigger target, AoE damage at position.
 */
function handleDischargeCheck(
  monsterId: string,
  hitX: number,
  hitY: number,
  flags: Record<string, number | boolean | string>,
): void {
  const monster = getMonsterById(monsterId);
  if (!monster || monster.isDead) return;

  const chargedStacks = monster.enemyStates
    ?.filter(s => s.type === 'charged' && s.duration > 0)
    .reduce((sum, s) => sum + s.stacks, 0) ?? 0;

  if (chargedStacks < CHARGED_MAX_STACKS) return;

  // Clear all Charged stacks on trigger target
  if (monster.enemyStates) {
    for (let i = monster.enemyStates.length - 1; i >= 0; i--) {
      if (monster.enemyStates[i].type === 'charged') {
        monster.enemyStates.splice(i, 1);
      }
    }
    emit('enemyState:expired', { monsterId, type: 'charged' });
  }

  // AoE damage at monster position
  const player = getPlayer();
  const radius = (flags.dischargeRadiusOverride as number) ?? (flags.dischargeRadius as number) ?? 80;
  const damage = Math.floor(player.magicPower * ((flags.dischargeDamageMult as number) ?? 1.4));

  const aoeHits = findMonstersInCircle(hitX, hitY, radius);
  let hitCount = 0;
  for (const target of aoeHits) {
    if (target.id === monsterId) continue; // skip trigger target (already took projectile damage)
    applyDamageToMonster(target.id, damage, 'magic', 1.0, { source: 'skill' });
    hitCount++;

    // Critical Mass: apply 1 Charged to all AoE targets
    if (flags.dischargeAppliesCharged && !target.isDead) {
      applyEnemyStateLocal(target.id, 'charged', CHARGED_DURATION, CHARGED_MAX_STACKS);
    }
  }

  // Critical Mass: 3+ enemies hit → grant Primed to player
  if (flags.dischargePrimedThreshold && hitCount >= (flags.dischargePrimedThreshold as number)) {
    const player = getPlayer();
    if (!player.combatStates.primed) {
      player.combatStates.primed = true;
      player.combatStates.primedMultiplier = 1 + PRIMED_DAMAGE_BONUS;
      emit('playerState:primed', { multiplier: player.combatStates.primedMultiplier });
    }
  }

  // Critical Mass: generate Ember charges
  if (flags.dischargeEmberCharges) {
    emit('resonance:requestCharge', { type: 'ember', amount: (flags.dischargeEmberCharges as number) });
  }
}

/**
 * Path A — Chain Bounce: spawns a new homing projectile toward nearest unhit enemy.
 */
function handleChainBounce(
  proj: ProjectileInstance,
  hitX: number,
  hitY: number,
  flags: Record<string, number | boolean | string>,
): void {
  const bounceRange = proj.bounceRange ?? (flags.chainRange as number) ?? 200;
  const target = findNearestMonster(hitX, hitY, bounceRange, proj.hitTargets);
  if (!target) return;

  const chainDamageFalloff = (flags.chainDamageFalloff as number) ?? (flags.chainDamageMult as number) ?? 0.50;
  const chainDamage = Math.floor(proj.damage * chainDamageFalloff);

  const dx = target.x - hitX;
  const dy = target.y - hitY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const speed = proj.speed;
  const vx = dist > 0 ? (dx / dist) * speed : speed;
  const vy = dist > 0 ? (dy / dist) * speed : 0;

  const chainProj: ProjectileInstance = {
    id: generateProjectileId(),
    ownerId: 'player',
    skillId: 'arcane_bolt',
    x: hitX,
    y: hitY,
    velocityX: vx,
    velocityY: vy,
    speed,
    damage: chainDamage,
    damageType: 'magic',
    piercing: false,
    hitTargets: [...proj.hitTargets], // carry forward to avoid re-hitting
    bounces: proj.bounces! - 1,
    bounceRange,
    maxDistance: bounceRange + 50,
    distanceTraveled: 0,
    isExpired: false,
    color: proj.color,
    size: 6, // slightly smaller visual cue
    persistentHoming: true,
    statusEffect: proj.statusEffect,
    statusChance: proj.statusChance,
  };

  getState().projectiles.push(chainProj);
  emit('projectile:spawned', { projectile: chainProj });
}

/**
 * Thunderchain — Overload Burst: AoE at hit position when chain hits max-Charged enemy.
 */
function handleOverloadBurst(
  triggerId: string,
  hitX: number,
  hitY: number,
  flags: Record<string, number | boolean | string>,
): void {
  const player = getPlayer();
  const radius = (flags.overloadBurstRadius as number) ?? 50;
  const damage = Math.floor(player.magicPower * 1.0);

  const aoeHits = findMonstersInCircle(hitX, hitY, radius);
  for (const target of aoeHits) {
    if (target.id === triggerId) continue; // exclude trigger target
    applyDamageToMonster(target.id, damage, 'magic', 1.0, { source: 'skill' });
  }
}

/**
 * Unstable Bolt — Piercing Explosion: triggers at explosionThreshold piercing hits.
 */
function handlePiercingExplosion(
  proj: ProjectileInstance,
  hitX: number,
  hitY: number,
  flags: Record<string, number | boolean | string>,
): void {
  const radius = (flags.explosionRadius as number) ?? 60;
  const bonusMult = (flags.explosionBonusMult as number) ?? 0.50;
  const damage = Math.floor(proj.damage * bonusMult);

  const aoeHits = findMonstersInCircle(hitX, hitY, radius);
  for (const target of aoeHits) {
    // Skip monsters already hit by the piercing projectile
    if (proj.hitTargets.includes(target.id)) continue;
    applyDamageToMonster(target.id, damage, 'magic', 1.0, { source: 'skill' });
  }
}

// ==========================================================================
// ENDPOINT DETONATION HANDLER (Chain Reaction — projectile:expiredWithPosition)
// ==========================================================================

function onProjectileExpiredWithPosition(data: { projectileId: string; x: number; y: number }): void {
  const state = getState();
  const proj = state.projectiles.find(p => p.id === data.projectileId);
  if (!proj || proj.ownerId !== 'player') return;
  if (proj.skillId !== 'arcane_bolt') return;
  if (!proj.piercing || proj.piercingHitCount == null || proj.piercingHitCount === 0) return;

  const flags = getUpgradeFlags('arcane_bolt');
  if (!flags.endpointDetonation) return;

  const maxRadius = (flags.maxDetonationRadius as number) ?? 140;
  const radius = Math.min(
    maxRadius,
    CHAIN_REACTION_BASE_DETONATION_RADIUS + proj.piercingHitCount * CHAIN_REACTION_RADIUS_PER_HIT,
  );

  const rawDamage = Math.floor(proj.damage * (proj.piercingDamageScale ?? 1.0));

  const aoeHits = findMonstersInCircle(data.x, data.y, radius);
  for (const target of aoeHits) {
    if (proj.hitSunderedTarget && flags.sunderedHybridDamage) {
      // Split into 50% physical + 50% magic
      const halfDamage = Math.floor(rawDamage / 2);
      applyDamageToMonster(target.id, halfDamage, 'physical', 1.0, { source: 'skill' });
      applyDamageToMonster(target.id, halfDamage, 'magic', 1.0, { source: 'skill' });
    } else {
      applyDamageToMonster(target.id, rawDamage, 'magic', 1.0, { source: 'skill' });
    }
  }
}

// ==========================================================================
// Melee Phase State Machine (for basic_attack, arcane_strike, etc.)
// ==========================================================================

interface ActiveMeleePhase {
  skillId: string;
  angle: number;
  phase: 'windup' | 'swing' | 'followthrough';
  phaseTimer: number;
  hitResolved: boolean;
  phases: NonNullable<import('@/core/types').SkillDefinition['meleePhases']>;
  damageType: import('@/core/types').DamageType;
  upgradeFlags?: Record<string, number | boolean | string>;
}

let activeMeleePhase: ActiveMeleePhase | null = null;

function tickMeleePhase(dt: number): void {
  if (!activeMeleePhase) return;

  const mp = activeMeleePhase;
  const player = getPlayer();

  mp.phaseTimer -= dt;

  if (mp.phaseTimer <= 0) {
    if (mp.phase === 'windup') {
      // Windup → Swing: resolve hits
      mp.phase = 'swing';
      mp.phaseTimer = mp.phases.swingDuration;
      player.attackPhase = 'swing';
      player.attackPhaseTimer = mp.phases.swingDuration;
      player.attackPhaseDuration = mp.phases.swingDuration;
      const swingDef = getSkillDef(mp.skillId);
      const swingFlags = mp.upgradeFlags ?? {};
      emit('combat:attackSwing', {
        angle: mp.angle,
        duration: mp.phases.swingDuration,
        arcWidth: (swingFlags.cleaveArc ?? swingFlags.precisionArc ?? swingFlags.destabilizeArc ?? swingDef?.arcWidth ?? 120) as number,
        range: (swingFlags.cleaveRange ?? swingFlags.precisionRange ?? swingDef?.range ?? 80) as number,
      });

      // Resolve hits during swing
      resolveMeleePhaseHits(mp);
    } else if (mp.phase === 'swing') {
      // Swing → Follow-through
      mp.phase = 'followthrough';
      mp.phaseTimer = mp.phases.followthroughDuration;
      player.attackPhase = 'followthrough';
      player.attackPhaseTimer = mp.phases.followthroughDuration;
      player.attackPhaseDuration = mp.phases.followthroughDuration;
      emit('combat:attackFollowThrough', { angle: mp.angle, duration: mp.phases.followthroughDuration });
    } else if (mp.phase === 'followthrough') {
      // Complete
      player.attackPhase = 'none';
      player.attackPhaseTimer = 0;
      player.attackPhaseDuration = 0;
      emit('combat:attackComplete');
      activeMeleePhase = null;
    }
  } else {
    // Keep player state in sync
    player.attackPhaseTimer = mp.phaseTimer;
  }
}

function resolveMeleePhaseHits(mp: ActiveMeleePhase): void {
  if (mp.hitResolved) return;
  mp.hitResolved = true;

  const def = getSkillDef(mp.skillId);
  if (!def) return;

  const player = getPlayer();
  const flags = mp.upgradeFlags ?? {};

  // Determine arc/range — upgrades can override
  const arcWidth = (flags.cleaveArc ?? flags.precisionArc ?? flags.destabilizeArc ?? def.arcWidth ?? 120) as number;
  const range = (flags.cleaveRange ?? flags.precisionRange ?? def.range ?? 80) as number;
  let baseDamage = calculateSkillBaseDamage(mp.skillId);

  // Precision damage mult
  if (typeof flags.precisionDamageMult === 'number') {
    baseDamage = Math.floor(baseDamage * (flags.precisionDamageMult as number));
  }

  // Precision crit bonus — temporarily add
  let precisionCritApplied = false;
  if (typeof flags.precisionCritBonus === 'number') {
    player.critChance += flags.precisionCritBonus as number;
    precisionCritApplied = true;
  }
  // Lethal Focus crit damage bonus
  let lethalCritApplied = false;
  if (typeof flags.lethalCritDamageBonus === 'number') {
    player.critDamage += flags.lethalCritDamageBonus as number;
    lethalCritApplied = true;
  }

  // Cascade bonus (arcane_strike Resonant Strike)
  let cascadeMult = 1.0;
  if (mp.skillId === 'arcane_strike' && cascadeChargesRemaining > 0) {
    cascadeMult = 1 + cascadeDamageBonus;
    cascadeChargesRemaining--;
    // Harmonic Cascade: cascade hits grant +1 Ember
    if (cascadeGrantsEmber) {
      emit('resonance:requestCharge', { type: 'ember', amount: 1 });
    }
  }

  const hits = findMonstersInArc(player.x, player.y, mp.angle, arcWidth, range);

  // --- Per-hit processing ---
  let isFirstTarget = true;
  for (const monster of hits) {
    let hitDamage = baseDamage;
    let hitMult = cascadeMult;

    // Cleave: falloff on targets beyond the first
    if (typeof flags.cleaveFalloff === 'number' && !isFirstTarget) {
      hitMult *= flags.cleaveFalloff as number;
    }

    // Overwhelm: consecutive hit stacking on same target
    if (typeof flags.overwhelmBonusPerHit === 'number') {
      if (monster.id === overwhelmTargetId) {
        overwhelmHitCount = Math.min(overwhelmHitCount + 1, (flags.overwhelmMaxHits as number) ?? 5);
      } else {
        overwhelmTargetId = monster.id;
        overwhelmHitCount = 1;
      }
      overwhelmTimer = (flags.overwhelmTimeout as number) ?? 2.0;
      const stackBonus = Math.min(
        overwhelmHitCount * (flags.overwhelmBonusPerHit as number),
        (flags.overwhelmMaxBonus as number) ?? 0.40,
      );
      hitMult *= 1 + stackBonus;

      // Battering Force T2: Stagger at threshold
      if (typeof flags.overwhelmStaggerThreshold === 'number' && overwhelmHitCount >= (flags.overwhelmStaggerThreshold as number)) {
        applyEnemyStateLocal(monster.id, 'staggered', STAGGERED_DURATION, 1);
      }
      // Battering Force T2: attack speed buff at max stacks
      if (typeof flags.overwhelmAtkSpeedThreshold === 'number' && overwhelmHitCount >= (flags.overwhelmAtkSpeedThreshold as number)) {
        const bonus = (flags.overwhelmAtkSpeedBonus as number) ?? 0.15;
        const dur = (flags.overwhelmAtkSpeedDuration as number) ?? 3.0;
        player.attackSpeed *= (1 + bonus);
        scheduleBuffExpiry('overwhelm_atkspeed', dur, () => {
          player.attackSpeed /= (1 + bonus);
        });
      }
    }

    // Siphon Strike: energy restore on hit
    if (typeof flags.siphonEnergy === 'number' && mp.skillId === 'arcane_strike') {
      let energyGain = flags.siphonEnergy as number;
      const hasCharged = monster.enemyStates?.some(s => s.type === 'charged' && s.duration > 0) ?? false;
      if (hasCharged && typeof flags.siphonChargedBonus === 'number') {
        energyGain += flags.siphonChargedBonus as number;
      }
      // Mana Burn T2: bonus magic damage vs Charged
      if (hasCharged && typeof flags.manaBurnDamageBonus === 'number') {
        hitMult *= 1 + (flags.manaBurnDamageBonus as number);
      }
      player.currentEnergy = Math.min(player.maxEnergy, player.currentEnergy + energyGain);
      emit('energy:changed', { current: player.currentEnergy, max: player.maxEnergy });

      // Mana Burn T2: 3 Charged stacks → explosion
      if (hasCharged && flags.manaBurnExplosion) {
        const chargedStacks = monster.enemyStates
          ?.filter(s => s.type === 'charged' && s.duration > 0)
          .reduce((sum, s) => sum + s.stacks, 0) ?? 0;
        if (chargedStacks >= CHARGED_MAX_STACKS) {
          // Consume all Charged stacks
          if (monster.enemyStates) {
            for (let i = monster.enemyStates.length - 1; i >= 0; i--) {
              if (monster.enemyStates[i].type === 'charged') {
                monster.enemyStates.splice(i, 1);
              }
            }
            emit('enemyState:expired', { monsterId: monster.id, type: 'charged' });
          }
          // Energy burst
          const burstEnergy = (flags.manaBurnEnergyBurst as number) ?? 15;
          player.currentEnergy = Math.min(player.maxEnergy, player.currentEnergy + burstEnergy);
          emit('energy:changed', { current: player.currentEnergy, max: player.maxEnergy });
          // Shockwave AoE
          const explosionRadius = (flags.manaBurnExplosionRadius as number) ?? 40;
          const explosionMult = (flags.manaBurnExplosionMult as number) ?? 0.30;
          const explosionDamage = Math.floor(player.magicPower * explosionMult);
          const aoeHits = findMonstersInCircle(monster.x, monster.y, explosionRadius);
          for (const target of aoeHits) {
            if (target.id === monster.id) continue;
            applyDamageToMonster(target.id, explosionDamage, 'magic', 1.0, { source: 'basic' });
          }
        }
      }
    }

    // Apply damage
    applyDamageToMonster(monster.id, hitDamage, mp.damageType, hitMult, { source: 'basic' });
    applyEquipmentStatusProcs(monster.id, mp.damageType);

    // Cleave: extra Ash per extra target
    if (typeof flags.cleaveAshPerExtra === 'number' && !isFirstTarget) {
      emit('resonance:requestCharge', { type: 'ash', amount: flags.cleaveAshPerExtra as number });
    }

    // Rending Cleave T2: apply Bleed to all targets
    if (typeof flags.cleaveBleed === 'number') {
      for (let i = 0; i < (flags.cleaveBleed as number); i++) {
        emit('status:requestApply', {
          targetId: monster.id,
          type: 'bleed',
          sourceAttack: player.attack,
          sourcePotency: player.statusPotency,
        });
      }
    }

    // Destabilize: apply Charged per hit
    if (typeof flags.destabilizeCharged === 'number' && mp.skillId === 'arcane_strike') {
      if (!monster.isDead) {
        applyEnemyStateLocal(monster.id, 'charged', CHARGED_DURATION, CHARGED_MAX_STACKS);
      }

      // Arcane Disruption T2: detonate at 3 Charged stacks
      if (flags.arcaneDisruption && !monster.isDead) {
        const chargedStacks = monster.enemyStates
          ?.filter(s => s.type === 'charged' && s.duration > 0)
          .reduce((sum, s) => sum + s.stacks, 0) ?? 0;
        if (chargedStacks >= CHARGED_MAX_STACKS) {
          // Clear all Charged stacks
          if (monster.enemyStates) {
            for (let i = monster.enemyStates.length - 1; i >= 0; i--) {
              if (monster.enemyStates[i].type === 'charged') {
                monster.enemyStates.splice(i, 1);
              }
            }
            emit('enemyState:expired', { monsterId: monster.id, type: 'charged' });
          }
          // Detonation AoE
          const disruptRadius = (flags.disruptionRadius as number) ?? 60;
          const disruptMult = (flags.disruptionDamageMult as number) ?? 0.80;
          const disruptDamage = Math.floor(baseDamage * disruptMult);
          const aoeHits = findMonstersInCircle(monster.x, monster.y, disruptRadius);
          for (const target of aoeHits) {
            if (target.id === monster.id) continue;
            applyDamageToMonster(target.id, disruptDamage, 'magic', 1.0, { source: 'basic' });
            // Apply 1 Charged to all AoE targets
            if (!target.isDead) {
              applyEnemyStateLocal(target.id, 'charged', CHARGED_DURATION, CHARGED_MAX_STACKS);
            }
          }
          // +2 Ember on detonation
          const disruptEmber = (flags.disruptionEmber as number) ?? 2;
          emit('resonance:requestCharge', { type: 'ember', amount: disruptEmber });
        }
      }
    }

    // Mark consumption: non-basic skills consume marks
    if (!SKILLS[mp.skillId]?.isBasicAttack && monster.mark) {
      consumeMark(monster);
    }

    isFirstTarget = false;
  }

  // Restore precision crit
  if (precisionCritApplied) {
    player.critChance -= flags.precisionCritBonus as number;
  }
  if (lethalCritApplied) {
    player.critDamage -= flags.lethalCritDamageBonus as number;
  }

  // Rending Cleave T2: 3+ targets → burst Ash instead of per-target
  if (typeof flags.cleaveAshThreshold === 'number' && hits.length >= (flags.cleaveAshThreshold as number)) {
    emit('resonance:requestCharge', { type: 'ash', amount: (flags.cleaveAshBurst as number) ?? 2 });
  }

  // Resonance charge (base)
  if (hits.length > 0) {
    const resType = mp.damageType === 'magic' ? 'ember' : 'ash';
    // Resonant Strike: override Ember amount
    const resAmount = (mp.skillId === 'arcane_strike' && typeof flags.resonantEmber === 'number')
      ? (flags.resonantEmber as number)
      : 1;
    emit('resonance:requestCharge', { type: resType, amount: resAmount });
  }

  // Whiff
  if (hits.length === 0) {
    const missX = player.x + Math.cos(mp.angle) * range * 0.7;
    const missY = player.y + Math.sin(mp.angle) * range * 0.7;
    emit('combat:miss', { targetId: 'none', x: missX, y: missY });
  }
}

// ==========================================================================
// Mark Consumption (Marked Shot — ranger_shot upgrade)
// ==========================================================================

/**
 * Consume a mark on a monster: refund energy, optionally reduce cooldowns, clear mark.
 */
function consumeMark(monster: MonsterInstance): void {
  if (!monster.mark) return;
  const player = getPlayer();
  player.currentEnergy = Math.min(player.maxEnergy, player.currentEnergy + monster.mark.energyRefund);
  emit('energy:changed', { current: player.currentEnergy, max: player.maxEnergy });
  if (monster.mark.cooldownRefund) {
    emit('skill:reduceCooldowns', { amount: monster.mark.cooldownRefund });
  }
  monster.mark = undefined;
}

// ==========================================================================
// Equipment Status Procs (shared by all isBasicAttack skills)
// ==========================================================================

/**
 * Apply equipment-derived status procs to a monster.
 * Type-gated: bleed/poison = physical only, burn = magic only, slow/freeze = either.
 */
function applyEquipmentStatusProcs(monsterId: string, damageType: import('@/core/types').DamageType): void {
  const player = getPlayer();

  // Physical-only procs
  if (damageType === 'physical') {
    if (player.bleedChance > 0 && Math.random() < player.bleedChance) {
      emit('status:requestApply', { targetId: monsterId, type: 'bleed', sourceAttack: player.attack, sourcePotency: player.statusPotency });
    }
    if (player.poisonChance > 0 && Math.random() < player.poisonChance) {
      emit('status:requestApply', { targetId: monsterId, type: 'poison', sourceAttack: player.attack, sourcePotency: player.statusPotency });
    }
  }

  // Magic-only procs
  if (damageType === 'magic') {
    if (player.burnChance > 0 && Math.random() < player.burnChance) {
      emit('status:requestApply', { targetId: monsterId, type: 'burn', sourceAttack: player.magicPower, sourcePotency: player.statusPotency });
    }
  }

  // Either type procs
  if (player.slowChance > 0 && Math.random() < player.slowChance) {
    emit('status:requestApply', { targetId: monsterId, type: 'slow', sourceAttack: player.attack, sourcePotency: player.statusPotency });
  }
  if (player.freezeChance > 0 && Math.random() < player.freezeChance) {
    emit('status:requestApply', { targetId: monsterId, type: 'freeze', sourceAttack: player.attack, sourcePotency: player.statusPotency });
  }
}

// ==========================================================================
// Basic Attack Handlers
// ==========================================================================

/** Shared melee phase start for basic_attack and arcane_strike (with upgrade flags) */
function startBasicMeleePhase(
  skillId: string,
  data: SkillUsedData,
  damageType: DamageType,
  flags: Record<string, number | boolean | string>,
): void {
  const def = getSkillDef(skillId);
  if (!def?.meleePhases) return;

  const player = getPlayer();

  activeMeleePhase = {
    skillId,
    angle: data.angle,
    phase: 'windup',
    phaseTimer: def.meleePhases.windupDuration,
    hitResolved: false,
    phases: def.meleePhases,
    damageType,
    upgradeFlags: Object.keys(flags).length > 0 ? flags : undefined,
  };

  player.attackPhase = 'windup';
  player.attackPhaseTimer = def.meleePhases.windupDuration;
  player.attackPhaseDuration = def.meleePhases.windupDuration;
  player.attackAngle = data.angle;
  player.attackPullback = def.meleePhases.pullbackDistance;
  player.attackLunge = def.meleePhases.lungeDistance;

  emit('combat:attackWindup', { angle: data.angle, duration: def.meleePhases.windupDuration });
}

function handleBasicAttack(data: SkillUsedData): void {
  const flags = getUpgradeFlags('basic_attack');
  startBasicMeleePhase('basic_attack', data, 'physical', flags);
}

function handleArcaneStrike(data: SkillUsedData): void {
  const flags = getUpgradeFlags('arcane_strike');
  startBasicMeleePhase('arcane_strike', data, 'magic', flags);
}

function handleRangerShot(data: SkillUsedData): void {
  const def = getSkillDef('ranger_shot');
  if (!def) return;

  const flags = getUpgradeFlags('ranger_shot');
  const baseDamage = calculateSkillBaseDamage('ranger_shot');
  const speed = def.projectileSpeed ?? 500;
  const maxDist = def.range ?? 300;

  const cos = Math.cos(data.angle);
  const sin = Math.sin(data.angle);

  const proj: ProjectileInstance = {
    id: generateProjectileId(),
    ownerId: 'player',
    skillId: 'ranger_shot',
    x: data.x + cos * PLAYER_BODY_RADIUS,
    y: data.y + sin * PLAYER_BODY_RADIUS,
    velocityX: cos * speed,
    velocityY: sin * speed,
    speed,
    damage: baseDamage,
    damageType: 'physical',
    piercing: !!flags.piercing,
    hitTargets: [],
    maxDistance: maxDist,
    distanceTraveled: 0,
    isExpired: false,
    color: '#88aa44',
    size: 4,
  };

  // Piercing Shot: set pierce fields
  if (flags.piercing) {
    proj.maxPierceTargets = (flags.maxPierceTargets as number) ?? 3;
    proj.pierceDamageFalloff = (flags.pierceDamageFalloff as number) ?? 0.25;
    proj.piercingHitCount = 0;
    if (typeof flags.sunderedPierceBonus === 'number') {
      proj.sunderedPierceBonus = flags.sunderedPierceBonus as number;
    }
    if (typeof flags.sunderedPierceExtend === 'number') {
      proj.sunderedPierceExtend = flags.sunderedPierceExtend as number;
    }
  }

  // Marked Shot: mark fields handled in onProjectileHit

  getState().projectiles.push(proj);
  emit('projectile:spawned', { projectile: proj });

  // Resonance: +1 Ash on fire
  emit('resonance:requestCharge', { type: 'ash', amount: 1 });

  // Quick Draw: twin projectile logic
  if (typeof flags.twinEveryN === 'number') {
    rangerShotFireCount++;
    const twinN = flags.twinEveryN as number;
    if (rangerShotFireCount % twinN === 0) {
      const offsetDeg = (flags.twinAngleOffset as number) ?? 15;
      const offsetRad = offsetDeg * (Math.PI / 180);
      // Fire twin at angle + offset (pick one side randomly)
      const twinAngle = data.angle + (Math.random() < 0.5 ? offsetRad : -offsetRad);
      const twinCos = Math.cos(twinAngle);
      const twinSin = Math.sin(twinAngle);

      const twinProj: ProjectileInstance = {
        id: generateProjectileId(),
        ownerId: 'player',
        skillId: 'ranger_shot',
        x: data.x + twinCos * PLAYER_BODY_RADIUS,
        y: data.y + twinSin * PLAYER_BODY_RADIUS,
        velocityX: twinCos * speed,
        velocityY: twinSin * speed,
        speed,
        damage: baseDamage,
        damageType: 'physical',
        piercing: false,
        hitTargets: [],
        maxDistance: maxDist,
        distanceTraveled: 0,
        isExpired: false,
        color: '#88aa44',
        size: 4,
        twinProjectile: true,
      };

      getState().projectiles.push(twinProj);
      emit('projectile:spawned', { projectile: twinProj });

      // Rapid Volley T2: attack speed buff on twin fire
      if (typeof flags.rapidVolleyAtkSpeedBonus === 'number') {
        const bonus = flags.rapidVolleyAtkSpeedBonus as number;
        const dur = (flags.rapidVolleyDuration as number) ?? 1.5;
        const maxStacks = (flags.rapidVolleyMaxStacks as number) ?? 2;
        const player = getPlayer();
        if (rapidVolleyStacks < maxStacks) {
          rapidVolleyStacks++;
          player.attackSpeed *= (1 + bonus);
          scheduleBuffExpiry(`rapid_volley_${rapidVolleyStacks}`, dur, () => {
            player.attackSpeed /= (1 + bonus);
            rapidVolleyStacks = Math.max(0, rapidVolleyStacks - 1);
          });
        }
      }
    }
  } else {
    rangerShotFireCount++;
  }
}

// ==========================================================================
// Effect dispatch table
// ==========================================================================

type EffectHandler = (data: SkillUsedData) => void;

const effectHandlers: Record<string, EffectHandler> = {
  heavy_slash: handleHeavySlash,
  arcane_bolt: handleArcaneBolt,
  shadow_step: handleShadowStep,
  basic_attack: handleBasicAttack,
  ranger_shot: handleRangerShot,
  arcane_strike: handleArcaneStrike,
};

// ==========================================================================
// Event handler
// ==========================================================================

function onSkillUsed(data: SkillUsedData): void {
  const handler = effectHandlers[data.skillId];
  if (handler) {
    handler(data);
  }
}

// ==========================================================================
// Lifecycle
// ==========================================================================

export function init(): void {
  // Clear internal state
  activeBuffTimers.length = 0;
  delayedHits.length = 0;
  dashState.active = false;
  dashState.flags = {};
  dashState.throughStaggerHits = [];
  nextProjectileId = 0;
  activeMeleePhase = null;

  // Clear shadow step upgrade state
  activeTrails.length = 0;
  stealthActive = false;
  stealthTimer = 0;
  stealthGuaranteedCrit = false;
  stealthGuaranteedStatus = false;
  echoState.pending = false;
  assassinCritBonusActive = false;
  assassinCritBonusAmount = 0;

  // Clear basic attack upgrade state
  overwhelmTargetId = '';
  overwhelmHitCount = 0;
  overwhelmTimer = 0;
  rangerShotFireCount = 0;
  rapidVolleyStacks = 0;
  cascadeChargesRemaining = 0;
  cascadeDamageBonus = 0;
  cascadeGrantsEmber = false;

  on('skill:used', onSkillUsed);
  on('resonance:release', onResonanceRelease);
  on('projectile:hit', onProjectileHit);
  on('projectile:expiredWithPosition', onProjectileExpiredWithPosition);

  // Cascade setup: Overload triggers cascade charges for Resonant Strike
  on('resonance:release', (data) => {
    if (data.type !== 'overload') return;
    const asFlags = getUpgradeFlags('arcane_strike');
    if (!asFlags.cascadeEnabled) return;
    cascadeChargesRemaining = (asFlags.cascadeHits as number) ?? 3;
    cascadeDamageBonus = (asFlags.cascadeDamageBonus as number) ?? 0.30;
    cascadeGrantsEmber = !!asFlags.cascadeGrantsEmber;
  });

  // Lethal Focus: kill resets basic_attack cooldown
  on('monster:died', () => {
    const baFlags = getUpgradeFlags('basic_attack');
    if (!baFlags.killResetCooldown) return;
    const state = getState();
    const skillState = state.skillStates['basic_attack'];
    if (skillState && skillState.cooldownRemaining > 0) {
      skillState.cooldownRemaining = 0;
      emit('skill:cooldownReady', { skillId: 'basic_attack' });
    }
  });

  // Stealth break: damage dealt by player → consume crit bonus, apply status effects
  on('combat:damageDealt', (data) => {
    if (data.source === 'resonance') return; // don't break stealth on resonance releases

    // Consume assassin crit bonus after first hit
    if (assassinCritBonusActive) {
      assassinCritBonusActive = false;
      assassinCritBonusAmount = 0;
      // Cancel the timeout timer
      const timerIdx = activeBuffTimers.findIndex(t => t.skillId === 'shadow_step_crit_bonus');
      if (timerIdx !== -1) activeBuffTimers.splice(timerIdx, 1);
    }

    // Stealth break on dealing damage
    if (stealthActive) {
      // Apply guaranteed status effects to the target before breaking stealth
      if (stealthGuaranteedStatus) {
        const player = getPlayer();
        const statusTypes: Array<'bleed' | 'poison' | 'burn' | 'slow' | 'freeze'> =
          ['bleed', 'poison', 'burn', 'slow', 'freeze'];
        for (const statusType of statusTypes) {
          emit('status:requestApply', {
            targetId: data.targetId,
            type: statusType,
            sourceAttack: data.damageType === 'magic' ? player.magicPower : player.attack,
            sourcePotency: player.statusPotency,
          });
        }
      }
      deactivateStealth();
    }
  });

  // Stealth break: player takes damage
  on('player:damaged', () => {
    if (stealthActive) {
      deactivateStealth();
    }
  });
}

export function update(dt: number): void {
  // --- Tick melee phase (basic attack / arcane strike) ---
  tickMeleePhase(dt);

  // --- Tick overwhelm timer (basic_attack Overwhelm) ---
  if (overwhelmTimer > 0) {
    overwhelmTimer -= dt;
    if (overwhelmTimer <= 0) {
      overwhelmTargetId = '';
      overwhelmHitCount = 0;
      overwhelmTimer = 0;
    }
  }

  // --- Tick marks on monsters (Marked Shot) ---
  const state = getState();
  for (const monster of state.monsters) {
    if (monster.isDead || !monster.mark) continue;
    monster.mark.duration -= dt;
    if (monster.mark.duration <= 0) {
      monster.mark = undefined;
    }
  }

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

  // --- Tick delayed hits ---
  for (let i = delayedHits.length - 1; i >= 0; i--) {
    delayedHits[i].remaining -= dt;
    if (delayedHits[i].remaining <= 0) {
      const hit = delayedHits[i];
      for (const monsterId of hit.targets) {
        applyDamageToMonster(monsterId, hit.damage, hit.damageType, hit.bonusMultiplier, { source: hit.source });
        if (hit.onResolve) hit.onResolve(monsterId);
      }
      delayedHits.splice(i, 1);
    }
  }

  // --- Tick dash ---
  if (dashState.active) {
    dashState.elapsed += dt;
    const progress = Math.min(1.0, dashState.elapsed / dashState.duration);
    const player = getPlayer();

    const frameTargetX = dashState.startX + (dashState.targetX - dashState.startX) * progress;
    const frameTargetY = dashState.startY + (dashState.targetY - dashState.startY) * progress;

    const state = getState();
    if (state.activeExpedition) {
      const resolved = resolveMovementAgainstMap(
        state.activeExpedition.map,
        player.x, player.y,
        frameTargetX, frameTargetY,
        PLAYER_BODY_RADIUS,
      );
      // End dash early if completely blocked on both axes
      const blockedX = Math.abs(resolved.x - frameTargetX) > 2;
      const blockedY = Math.abs(resolved.y - frameTargetY) > 2;
      player.x = resolved.x;
      player.y = resolved.y;
      if (blockedX && blockedY) {
        dashState.active = false;
        player.isDashing = false;
        player.isInvulnerable = false;
        resolveShadowStepLanding();
      }
    } else {
      player.x = frameTargetX;
      player.y = frameTargetY;
    }

    // Through-dash stagger (Phase Walk): check monsters along dash path each frame
    if (dashState.flags.throughDashStagger) {
      for (const monster of state.monsters) {
        if (monster.isDead) continue;
        if (dashState.throughStaggerHits.includes(monster.id)) continue;
        const dx = monster.x - player.x;
        const dy = monster.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= PLAYER_BODY_RADIUS + monster.size / 2) {
          applyEnemyStateLocal(monster.id, 'staggered', STAGGERED_DURATION, 1);
          dashState.throughStaggerHits.push(monster.id);
        }
      }
    }

    emit('player:moved', { x: player.x, y: player.y });

    if (progress >= 1.0) {
      dashState.active = false;
      player.isDashing = false;
      player.isInvulnerable = false;
      resolveShadowStepLanding();
    }
  }

  // --- Tick shadow trails ---
  for (let i = activeTrails.length - 1; i >= 0; i--) {
    const trail = activeTrails[i];
    trail.remaining -= dt;
    trail.tickTimer -= dt;

    if (trail.tickTimer <= 0) {
      trail.tickTimer += SHADOW_TRAIL_TICK_INTERVAL;
      const state = getState();
      for (const monster of state.monsters) {
        if (monster.isDead) continue;
        const dist = pointToSegmentDistance(
          monster.x, monster.y,
          trail.startX, trail.startY,
          trail.endX, trail.endY,
        );
        if (dist <= trail.width / 2 + monster.size / 2) {
          applyDamageToMonster(monster.id, trail.damagePerTick, 'physical', 1.0, { source: 'skill' });
        }
      }
    }

    if (trail.remaining <= 0) {
      activeTrails.splice(i, 1);
    }
  }

  // --- Tick environmental zones ---
  updateEnvironmentalZones(dt);

  // --- Tick stealth ---
  if (stealthActive) {
    stealthTimer -= dt;
    if (stealthTimer <= 0) {
      deactivateStealth();
    }
  }

  // --- Tick echo ---
  if (echoState.pending) {
    echoState.remaining -= dt;
    if (echoState.remaining <= 0) {
      echoState.pending = false;
      resolveEchoArrival();
    }
  }
}
