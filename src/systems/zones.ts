// ============================================================================
// Zones System — Zone transitions, monster spawning, world management
// ============================================================================

import type { MonsterInstance, MonsterDefinition, ZoneDefinition } from '@/core/types';
import { on, emit } from '@/core/event-bus';
import {
  getState,
  getPlayer,
  addMonster,
  removeMonster,
  setActiveZone,
  unlockZone,
  incrementZoneKills,
} from '@/core/game-state';
import {
  MONSTER_SPAWN_INTERVAL,
  MAX_MONSTERS_PER_ZONE,
  MONSTER_DESPAWN_RANGE,
  MONSTER_SPAWN_RANGE_MIN,
  MONSTER_SPAWN_RANGE_MAX,
  DEATH_ANIMATION_DURATION,
  SWIFT_ESCAPE_THRESHOLD,
  SWIFT_ESCAPE_SPEED_MULT,
  AGGRESSIVE_WINDUP_DEFAULT,
  AGGRESSIVE_DAMAGE_MULT,
  REGEN_RATE_DEFAULT,
  ARMOR_DEFAULT,
  SHIELD_PERCENT_DEFAULT,
  SHIELD_DAMAGE_REDUCTION,
  RARE_MINION_SPAWN_RADIUS,
  MONSTER_WANDER_PAUSE_MIN,
  MONSTER_WANDER_PAUSE_MAX,
} from '@/data/constants';
import {
  rollMonsterRarity,
  rollAffixes,
  rollMinionCount,
  applyRarityScaling,
  buildRarityName,
} from '@/systems/monster-rarity';
import {
  monsterHP,
  monsterXPReward,
  monsterGoldReward,
  zoneMonsterLevel,
} from '@/data/balance';
import { ZONES, ZONE_ORDER } from '@/data/zones.data';

// --- Internal state ---

let spawnTimer: number = 0;
let nextMonsterId: number = 0;
let bossSpawned: boolean = false;
let bossAvailableNotified: boolean = false;

// Monster definitions — loaded lazily or from data module.
// We use a map for efficient lookup. This is populated by registerMonster()
// or from an external data file. For now, we build instances from zone info.
const monsterDefinitions: Map<string, MonsterDefinition> = new Map();

// --- Public API ---

/**
 * Register a monster definition so the zone system can spawn it.
 * Called from the monster data module or during initialization.
 */
export function registerMonster(def: MonsterDefinition): void {
  monsterDefinitions.set(def.id, def);
}

/**
 * Get a registered monster definition by ID.
 */
export function getMonsterDefinition(id: string): MonsterDefinition | undefined {
  return monsterDefinitions.get(id);
}

/**
 * Enter a new zone. Clears current monsters, sets up the new zone.
 */
export function enterZone(zoneId: string): void {
  const zone = ZONES[zoneId];
  if (!zone) return;

  const state = getState();
  const previousZone = state.activeZoneId;

  // Clear all existing monsters
  clearAllMonsters();

  // Reset spawn state
  spawnTimer = 0;
  bossSpawned = false;
  bossAvailableNotified = false;

  // Update state
  setActiveZone(zoneId);

  // Set world bounds to zone dimensions
  // Note: the scene needs to react to zone:entered and update physics bounds

  // Emit events
  if (previousZone !== zoneId) {
    emit('zone:changed', { fromZone: previousZone, toZone: zoneId });
  }
  emit('zone:entered', { zoneId });
}

/**
 * Spawn a single monster in the current zone.
 * Picks a random monster from the zone's list (weighted by spawnWeight).
 * Places it at a random position within spawn range of the player.
 */
export function spawnMonster(zoneId?: string): MonsterInstance | null {
  const state = getState();
  const player = getPlayer();
  const zone = ZONES[zoneId ?? state.activeZoneId];
  if (!zone) return null;

  // Check monster cap (allow up to 4 overflow for rare minion packs)
  const aliveMonsters = state.monsters.filter(m => !m.isDead);
  if (aliveMonsters.length >= MAX_MONSTERS_PER_ZONE) return null;

  // Pick a random monster from the zone's monster list (weighted)
  const candidates: MonsterDefinition[] = [];
  const weights: number[] = [];

  for (const monsterId of zone.monsters) {
    const def = monsterDefinitions.get(monsterId);
    if (def && !def.isBoss && def.spawnWeight > 0) {
      candidates.push(def);
      weights.push(def.spawnWeight);
    }
  }

  if (candidates.length === 0) return null;

  // Weighted random selection
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * totalWeight;
  let selectedDef: MonsterDefinition = candidates[0];

  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      selectedDef = candidates[i];
      break;
    }
  }

  // Calculate monster level based on zone progress
  const killCount = state.zoneKillCounts[zone.id] ?? 0;
  const progress = Math.min(1, killCount / (zone.bossUnlockKills * 2));
  const level = zoneMonsterLevel(zone.tier, progress);

  // Pick random spawn position within range of player
  const spawnPos = getSpawnPosition(player.x, player.y, zone);

  // Create the monster instance
  const monster = createMonsterInstance(selectedDef, level, spawnPos.x, spawnPos.y, zone.id);

  // Add to state
  addMonster(monster);

  // Emit event
  emit('monster:spawned', { monster });

  // Spawn minion pack for rare monsters
  if (monster.rarity === 'rare') {
    const minionCount = rollMinionCount('rare');
    for (let i = 0; i < minionCount; i++) {
      // Cluster minions around the rare monster
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * RARE_MINION_SPAWN_RADIUS;
      const minionX = monster.x + Math.cos(angle) * dist;
      const minionY = monster.y + Math.sin(angle) * dist;

      const minion = createMonsterInstance(selectedDef, level, minionX, minionY, zone.id, 'normal');
      addMonster(minion);
      emit('monster:spawned', { monster: minion });
    }
  }

  return monster;
}

/**
 * Check if the boss unlock condition is met for the given zone.
 */
export function checkBossUnlock(zoneId?: string): boolean {
  const state = getState();
  const zone = ZONES[zoneId ?? state.activeZoneId];
  if (!zone) return false;

  const killCount = state.zoneKillCounts[zone.id] ?? 0;
  return killCount >= zone.bossUnlockKills;
}

/**
 * Spawn the zone boss if conditions are met and boss hasn't been spawned already.
 */
export function spawnBoss(zoneId?: string): MonsterInstance | null {
  const state = getState();
  const player = getPlayer();
  const zone = ZONES[zoneId ?? state.activeZoneId];
  if (!zone) return null;

  if (bossSpawned) return null;
  if (!checkBossUnlock(zone.id)) return null;

  const bossDef = monsterDefinitions.get(zone.bossId);
  if (!bossDef) return null;

  // Boss level: top of zone range
  const level = zone.levelRange[1];

  // Spawn boss at a fixed distance from player
  const spawnPos = getSpawnPosition(player.x, player.y, zone);

  // Create boss instance
  const monster = createMonsterInstance(bossDef, level, spawnPos.x, spawnPos.y, zone.id);

  // Add to state
  addMonster(monster);
  bossSpawned = true;

  // Emit event
  emit('monster:spawned', { monster });

  return monster;
}

// --- Monster creation ---

/**
 * Create a MonsterInstance from a MonsterDefinition at a given level.
 */
function createMonsterInstance(
  def: MonsterDefinition,
  level: number,
  x: number,
  y: number,
  zoneId: string,
  forceRarity?: 'normal',
): MonsterInstance {
  const hp = monsterHP(def.baseHP, def.hpPerLevel, level);
  const shieldAmount = def.shieldPercent
    ? Math.floor(hp * def.shieldPercent)
    : 0;

  const id = `monster_${nextMonsterId++}`;

  // Initialize ability cooldowns (all start ready)
  const abilityCooldowns: Record<string, number> = {};
  for (const abilityId of def.abilities) {
    abilityCooldowns[abilityId] = 0;
  }

  const instance: MonsterInstance = {
    id,
    definitionId: def.id,
    name: def.name,
    types: [...def.types],

    currentHP: hp,
    maxHP: hp,
    attack: def.attack + Math.floor((level - 1) * 1.5),
    defense: def.defense + Math.floor((level - 1) * 0.5),

    armor: def.armor ?? 0,
    currentShield: shieldAmount,
    maxShield: shieldAmount,
    shieldDamageReduction: def.shieldDamageReduction ?? 0,

    aiState: 'idle',
    aiTimer: 0,
    targetX: x,
    targetY: y,
    lastAttackTime: 0,
    aggroRange: def.aggroRange,
    attackRange: def.attackRange,
    attackCooldown: def.attackCooldown,
    moveSpeed: def.moveSpeed,

    isWindingUp: false,
    windupTimer: 0,
    windupDuration: def.aggressiveWindup ?? AGGRESSIVE_WINDUP_DEFAULT,

    isFleeing: false,

    x,
    y,

    spawnX: x,
    spawnY: y,
    wanderPauseTimer: MONSTER_WANDER_PAUSE_MIN + Math.random() * (MONSTER_WANDER_PAUSE_MAX - MONSTER_WANDER_PAUSE_MIN),

    statusEffects: [],

    color: def.color,
    size: def.size,
    isBoss: def.isBoss,

    isDead: false,
    deathTimer: 0,

    xp: monsterXPReward(def.xp, level),
    gold: monsterGoldReward(def.gold, level),
    dropChance: def.dropChance,
    zone: zoneId,

    // New fields
    archetype: def.archetype,
    rarity: 'normal',
    affixes: [],
    abilityCooldowns,
    currentAbility: null,
    abilityCastTimer: 0,
    abilityTargetX: 0,
    abilityTargetY: 0,
    isCharging: false,
    chargeTargetX: 0,
    chargeTargetY: 0,
    chargeTimer: 0,
    isFused: false,
    fuseTimer: 0,
    isRetreating: false,
    shape: def.shape ?? 'square',
  };

  // Roll rarity (unless forced to normal, e.g., for minions)
  if (forceRarity !== 'normal') {
    const zone = ZONES[zoneId];
    const tier = zone?.tier ?? 1;
    const rarity = rollMonsterRarity(tier, def.isBoss, def.archetype);
    instance.rarity = rarity;

    if (rarity !== 'normal') {
      const affixIds = rollAffixes(rarity);
      applyRarityScaling(instance, rarity, affixIds);
      instance.name = buildRarityName(def.name, rarity, affixIds);

      emit('monster:raritySpawned', {
        monsterId: instance.id,
        rarity,
        affixes: affixIds,
      });
    }
  }

  return instance;
}

// --- Spawn positioning ---

/**
 * Pick a random spawn position within [MONSTER_SPAWN_RANGE_MIN, MONSTER_SPAWN_RANGE_MAX]
 * of the player, clamped to zone bounds.
 */
function getSpawnPosition(
  playerX: number,
  playerY: number,
  zone: ZoneDefinition,
): { x: number; y: number } {
  // Random angle
  const angle = Math.random() * Math.PI * 2;

  // Random distance within range
  const distance = MONSTER_SPAWN_RANGE_MIN +
    Math.random() * (MONSTER_SPAWN_RANGE_MAX - MONSTER_SPAWN_RANGE_MIN);

  let x = playerX + Math.cos(angle) * distance;
  let y = playerY + Math.sin(angle) * distance;

  // Clamp to zone bounds with some margin
  const margin = 50;
  x = Math.max(margin, Math.min(zone.width - margin, x));
  y = Math.max(margin, Math.min(zone.height - margin, y));

  return { x, y };
}

// --- Monster cleanup ---

/**
 * Remove all monsters from the state.
 */
function clearAllMonsters(): void {
  const state = getState();
  // Remove all by clearing the array (splice to maintain reference)
  while (state.monsters.length > 0) {
    state.monsters.pop();
  }
}

/**
 * Despawn monsters that are too far from the player.
 */
function despawnDistantMonsters(): void {
  const state = getState();
  const player = getPlayer();
  const despawnRangeSq = MONSTER_DESPAWN_RANGE * MONSTER_DESPAWN_RANGE;

  // Collect IDs of monsters to remove
  const toRemove: string[] = [];

  for (const monster of state.monsters) {
    if (monster.isDead) continue;
    if (monster.isBoss) continue; // Never despawn bosses

    const dx = monster.x - player.x;
    const dy = monster.y - player.y;
    const distSq = dx * dx + dy * dy;

    if (distSq > despawnRangeSq) {
      toRemove.push(monster.id);
    }
  }

  for (const id of toRemove) {
    removeMonster(id);
  }
}

/**
 * Clean up dead monsters whose death animation has finished.
 */
function cleanupDeadMonsters(dt: number): void {
  const state = getState();

  for (const monster of state.monsters) {
    if (!monster.isDead) continue;

    monster.deathTimer += dt;
    if (monster.deathTimer >= DEATH_ANIMATION_DURATION + 0.5) {
      removeMonster(monster.id);
    }
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
  const state = getState();
  if (state.gameMode === 'expedition') return;

  // Increment kill count
  incrementZoneKills(state.activeZoneId);

  // Check boss unlock
  if (!bossAvailableNotified && checkBossUnlock()) {
    bossAvailableNotified = true;
    emit('progression:bossAvailable', { zoneId: state.activeZoneId });
  }

  // If boss was killed, handle progression
  if (data.isBoss) {
    bossSpawned = false;

    const player = getPlayer();
    const zone = ZONES[state.activeZoneId];
    if (zone) {
      // Record boss kill
      if (!player.bossesKilled.includes(zone.bossId)) {
        player.bossesKilled.push(zone.bossId);
      }

      emit('progression:bossDefeated', {
        zoneId: zone.id,
        bossId: zone.bossId,
      });

      // Unlock next zone if applicable
      const currentZoneIndex = ZONE_ORDER.indexOf(zone.id);
      if (currentZoneIndex >= 0 && currentZoneIndex < ZONE_ORDER.length - 1) {
        const nextZoneId = ZONE_ORDER[currentZoneIndex + 1];
        const nextZone = ZONES[nextZoneId];

        // Check if the next zone's unlock condition is this boss
        if (nextZone && nextZone.unlockCondition === zone.bossId) {
          if (!state.unlockedZones.includes(nextZoneId)) {
            unlockZone(nextZoneId);
            emit('progression:zoneUnlocked', { zoneId: nextZoneId });
          }
        }
      }
    }
  }
}

function onZoneChanged(data: { fromZone: string; toZone: string }): void {
  // The zone transition is already handled by enterZone().
  // This handler exists for any additional cleanup needed by other systems.
}

// --- Lifecycle ---

export function init(): void {
  spawnTimer = 0;
  nextMonsterId = 0;
  bossSpawned = false;
  bossAvailableNotified = false;

  on('monster:died', onMonsterDied);
  on('zone:changed', onZoneChanged);
}

export function update(dt: number): void {
  const state = getState();
  if (state.isPaused) return;
  if (state.gameMode === 'expedition') return;

  // Tick spawn timer
  spawnTimer += dt;

  // Spawn monsters at regular intervals
  if (spawnTimer >= MONSTER_SPAWN_INTERVAL) {
    spawnTimer -= MONSTER_SPAWN_INTERVAL;

    const aliveMonsters = state.monsters.filter(m => !m.isDead);
    if (aliveMonsters.length < MAX_MONSTERS_PER_ZONE) {
      spawnMonster();
    }
  }

  // Despawn distant monsters
  despawnDistantMonsters();

  // Clean up dead monsters
  cleanupDeadMonsters(dt);

  // Auto-spawn boss when available and not yet spawned
  if (!bossSpawned && checkBossUnlock()) {
    // Only spawn if player has cleared enough monsters and there's room
    const aliveMonsters = state.monsters.filter(m => !m.isDead);
    if (aliveMonsters.filter(m => m.isBoss).length === 0) {
      spawnBoss();
    }
  }
}
