// ============================================================================
// Expeditions System -- encounter-director runtime and lifecycle
// ============================================================================

import type {
  ExpeditionMap,
  ExpeditionRewardBreakdown,
  ExpeditionRunState,
  MonsterDefinition,
  MonsterInstance,
  ObjectiveType,
  ExpeditionEncounterPoint,
} from '@/core/types';
import { on, emit } from '@/core/event-bus';
import {
  rollMonsterRarity,
  rollAffixes,
  applyRarityScaling,
  buildRarityName,
} from '@/systems/monster-rarity';
import {
  getState,
  getPlayer,
  addMonster,
  removeMonster,
  setActiveZone,
  setActiveExpedition,
  clearActiveExpedition,
  setGameMode,
  getActiveExpedition,
  unlockExpeditionTier,
  markExpeditionFirstClear,
  incrementExpeditionRuns,
  incrementExpeditionCompletions,
  incrementExpeditionFailures,
  addToInventory,
} from '@/core/game-state';
import { ZONES } from '@/data/zones.data';
import { MONSTERS } from '@/data/monsters.data';
import { AGGRESSIVE_WINDUP_DEFAULT } from '@/data/constants';
import {
  zoneMonsterLevel,
  monsterGoldReward,
  monsterHP,
  monsterXPReward,
} from '@/data/balance';
import {
  COMPLETION_CHEST_COUNT_BY_TIER,
  COMPLETION_GOLD_BY_TIER,
  COMPLETION_XP_BY_TIER,
  EXPEDITION_MAX_PORTALS,
  EXPEDITION_OBJECTIVE,
  EXPEDITION_START_SAFE_RADIUS,
  EXPEDITION_TOTAL_BUDGET_MULT,
  EXPEDITION_PACK_SIZE_MULT,
  EXPEDITION_CHECKPOINT_KILL_INTERVAL_MULT,
  PLAYER_RESPAWN_FULL_ENERGY,
  PLAYER_RESPAWN_FULL_HEAL,
  RESPAWN_INVULNERABILITY_SECONDS,
  FIRST_CLEAR_GOLD_MULT,
  FIRST_CLEAR_XP_MULT,
  clampTier,
} from '@/data/expeditions.data';
import {
  generateExpeditionMap,
  getRoomWorldCenter,
  isPointWalkable,
} from './expedition-generation';
import { generateShopItem } from './item-gen';
import { grantXP } from './progression';
import { grantGold } from './economy';
import { clearAllLootDrops, spawnLoot } from './loot';

interface LaunchConfig {
  zoneId: string;
  tier: number;
  seed?: number;
  objective?: ObjectiveType;
}

interface SpawnDirectorState {
  totalBudget: number;
  totalSpawned: number;
  checkpointEveryKills: number;
  nextCheckpointAtKills: number;
  packSizeMult: number;
}

let initialized = false;
let nextRunId = 1;
let nextMonsterId = 0;
let respawnInvulnerabilityTimer = 0;

const director: SpawnDirectorState = {
  totalBudget: 0,
  totalSpawned: 0,
  checkpointEveryKills: 16,
  nextCheckpointAtKills: 16,
  packSizeMult: 1,
};

const monsterEncounterById = new Map<string, string>();

class LocalRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0x100000000;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

function clearTransientState(): void {
  monsterEncounterById.clear();
  respawnInvulnerabilityTimer = 0;
  director.totalBudget = 0;
  director.totalSpawned = 0;
  director.checkpointEveryKills = 16;
  director.nextCheckpointAtKills = 16;
  director.packSizeMult = 1;
}

function clearMonstersAndProjectiles(): void {
  const state = getState();
  while (state.monsters.length > 0) {
    state.monsters.pop();
  }
  while (state.projectiles.length > 0) {
    state.projectiles.pop();
  }
}

function getMapBounds(map: ExpeditionMap): { width: number; height: number } {
  return {
    width: map.bounds.width,
    height: map.bounds.height,
  };
}

function findEncounterById(map: ExpeditionMap, id: string): ExpeditionEncounterPoint | null {
  for (const p of map.encounterPoints) {
    if (p.id === id) return p;
  }
  return null;
}

function buildRun(config: LaunchConfig): ExpeditionRunState {
  const tier = clampTier(config.tier);
  const seed = config.seed ?? Math.floor(Math.random() * 1_000_000_000);
  const objective = config.objective ?? EXPEDITION_OBJECTIVE;
  const map = generateExpeditionMap({
    zoneId: config.zoneId,
    tier,
    seed,
    objective,
  });

  const spawnRoom = map.rooms.find(room => room.id === map.spawnRoomId) ?? map.rooms[0];
  const center = getRoomWorldCenter(spawnRoom);

  return {
    runId: `run_${nextRunId++}`,
    seed,
    zoneId: config.zoneId,
    tier,
    status: 'active',
    portalsRemaining: EXPEDITION_MAX_PORTALS,
    maxPortals: EXPEDITION_MAX_PORTALS,
    checkpointRoomId: spawnRoom.id,
    checkpointX: center.x,
    checkpointY: center.y,
    map,
    progress: {
      requiredKills: 1,
      currentKills: 0,
      roomsVisited: 0,
      roomsCleared: 0,
    },
    startedAtGameTime: getState().gameTime,
  };
}

function createMonsterInstance(
  def: MonsterDefinition,
  level: number,
  x: number,
  y: number,
  zoneId: string,
): MonsterInstance {
  const hp = monsterHP(def.baseHP, def.hpPerLevel, level);
  const shieldAmount = def.shieldPercent ? Math.floor(hp * def.shieldPercent) : 0;

  // Initialize ability cooldowns
  const abilityCooldowns: Record<string, number> = {};
  for (const abilityId of def.abilities) {
    abilityCooldowns[abilityId] = 0;
  }

  const instance: MonsterInstance = {
    id: `monster_${nextMonsterId++}`,
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

    // Archetype + rarity fields
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

  // Apply rarity in expeditions
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

  return instance;
}

function chooseMonsterDefinition(zoneId: string, rng: LocalRng): MonsterDefinition | null {
  const zone = ZONES[zoneId];
  if (!zone || zone.monsters.length === 0) return null;

  const weighted: Array<{ def: MonsterDefinition; weight: number }> = [];
  for (const id of zone.monsters) {
    const def = MONSTERS[id];
    if (!def || def.isBoss) continue;
    weighted.push({ def, weight: Math.max(1, def.spawnWeight) });
  }

  if (weighted.length === 0) return null;

  const total = weighted.reduce((sum, v) => sum + v.weight, 0);
  let roll = rng.next() * total;
  for (const w of weighted) {
    roll -= w.weight;
    if (roll <= 0) return w.def;
  }

  return weighted[weighted.length - 1].def;
}

function spawnPackAt(point: ExpeditionEncounterPoint, run: ExpeditionRunState): number {
  if (director.totalSpawned >= director.totalBudget) return 0;

  const zone = ZONES[run.zoneId];
  const rng = new LocalRng((run.seed ^ (director.totalSpawned * 2654435761)) >>> 0);

  const basePack = 3 + Math.floor(run.tier * 0.9);
  const rawPackSize = Math.round(basePack * point.packWeight * director.packSizeMult) + rng.int(-1, 2);
  const packSize = Math.max(3, Math.min(12, rawPackSize));

  let spawned = 0;

  for (let i = 0; i < packSize; i++) {
    if (director.totalSpawned >= director.totalBudget) break;

    const def = chooseMonsterDefinition(run.zoneId, rng);
    if (!def) break;

    const angle = rng.next() * Math.PI * 2;
    const dist = rng.int(24, 125);
    const x = point.x + Math.cos(angle) * dist;
    const y = point.y + Math.sin(angle) * dist;

    if (!isPointWalkable(run.map, x, y, Math.max(12, def.size * 0.35))) {
      continue;
    }

    const progressRatio = run.progress.requiredKills > 0
      ? Math.min(1, run.progress.currentKills / run.progress.requiredKills)
      : 0;

    const level = zone
      ? zoneMonsterLevel(run.tier, progressRatio)
      : run.tier * 10;

    const monster = createMonsterInstance(def, level, x, y, run.zoneId);

    addMonster(monster);
    emit('monster:spawned', { monster });

    monsterEncounterById.set(monster.id, point.id);

    spawned += 1;
    director.totalSpawned += 1;
  }

  return spawned;
}

function setupDirectorForRun(run: ExpeditionRunState): void {
  const tier = clampTier(run.tier);
  director.totalBudget = Math.max(70, Math.round((92 + tier * 30) * EXPEDITION_TOTAL_BUDGET_MULT));
  director.totalSpawned = 0;
  director.checkpointEveryKills = Math.max(
    8,
    Math.round((14 - Math.floor(tier / 2)) * EXPEDITION_CHECKPOINT_KILL_INTERVAL_MULT),
  );
  director.nextCheckpointAtKills = director.checkpointEveryKills;
  director.packSizeMult = EXPEDITION_PACK_SIZE_MULT;

  run.progress.requiredKills = director.totalBudget;
}

function sortEncounterIdsForInitialSpread(run: ExpeditionRunState): string[] {
  const spawnPoint = {
    x: run.checkpointX,
    y: run.checkpointY,
  };

  const points = [...run.map.encounterPoints];
  points.sort((a, b) => {
    const da = Math.hypot(a.x - spawnPoint.x, a.y - spawnPoint.y);
    const db = Math.hypot(b.x - spawnPoint.x, b.y - spawnPoint.y);
    return da - db;
  });

  // Interleave near and far to avoid single-cluster population.
  const out: string[] = [];
  let left = 0;
  let right = points.length - 1;
  while (left <= right) {
    out.push(points[left].id);
    left += 1;
    if (left <= right) {
      out.push(points[right].id);
      right -= 1;
    }
  }

  return out;
}

function initialSpawn(run: ExpeditionRunState): void {
  const sortedIds = sortEncounterIdsForInitialSpread(run);
  const safeRadius = EXPEDITION_START_SAFE_RADIUS;
  const safeRadiusSq = safeRadius * safeRadius;
  const startX = run.checkpointX;
  const startY = run.checkpointY;
  const eligible: string[] = [];

  for (const id of sortedIds) {
    const point = findEncounterById(run.map, id);
    if (!point) continue;
    const dx = point.x - startX;
    const dy = point.y - startY;
    if (dx * dx + dy * dy >= safeRadiusSq) {
      eligible.push(id);
    }
  }

  // Fallback for tight seeds: allow all points if the safe ring filters too aggressively.
  const cycle = eligible.length > 0 ? eligible : sortedIds;
  if (cycle.length === 0) {
    run.progress.requiredKills = 0;
    return;
  }

  let cursor = 0;
  let failedSpawns = 0;
  const maxFailures = cycle.length * 3;

  while (director.totalSpawned < director.totalBudget && failedSpawns < maxFailures) {
    const id = cycle[cursor % cycle.length];
    cursor += 1;

    const point = findEncounterById(run.map, id);
    if (!point) {
      failedSpawns += 1;
      continue;
    }

    const spawned = spawnPackAt(point, run);
    if (spawned > 0) {
      failedSpawns = 0;
    } else {
      failedSpawns += 1;
    }
  }
  // Objective is based on actually spawned monsters, so no refill spawning is required.
  run.progress.requiredKills = Math.max(0, director.totalSpawned);
}

function maybeUpdateCheckpoint(run: ExpeditionRunState): void {
  if (run.progress.currentKills < director.nextCheckpointAtKills) return;

  const player = getPlayer();
  run.checkpointX = player.x;
  run.checkpointY = player.y;

  director.nextCheckpointAtKills += director.checkpointEveryKills;

  emit('expedition:checkpointUpdated', {
    runId: run.runId,
    roomId: run.checkpointRoomId,
  });
}

function getFirstClearKey(tier: number): string {
  return `${clampTier(tier)}:${EXPEDITION_OBJECTIVE}`;
}

function buildCompletionRewards(run: ExpeditionRunState): ExpeditionRewardBreakdown {
  const tier = clampTier(run.tier);
  const completionXP = COMPLETION_XP_BY_TIER[tier] ?? 0;
  const completionGold = COMPLETION_GOLD_BY_TIER[tier] ?? 0;

  const firstClearKey = getFirstClearKey(tier);
  const firstClear = !getState().expeditionMeta.firstClearClaimed[firstClearKey];

  return {
    completionXP,
    completionGold,
    firstClearXPBonus: firstClear ? Math.floor(completionXP * FIRST_CLEAR_XP_MULT) : 0,
    firstClearGoldBonus: firstClear ? Math.floor(completionGold * FIRST_CLEAR_GOLD_MULT) : 0,
    completionChestCount: COMPLETION_CHEST_COUNT_BY_TIER[tier] ?? 1,
  };
}

function grantCompletionRewards(run: ExpeditionRunState, rewards: ExpeditionRewardBreakdown): void {
  const totalXP = rewards.completionXP + rewards.firstClearXPBonus;
  const totalGold = rewards.completionGold + rewards.firstClearGoldBonus;

  if (totalXP > 0) {
    grantXP(totalXP);
  }
  if (totalGold > 0) {
    grantGold(totalGold);
  }

  for (let i = 0; i < rewards.completionChestCount; i++) {
    const item = generateShopItem(run.tier);
    const added = addToInventory(item);
    if (!added) {
      const player = getPlayer();
      spawnLoot(item, player.x, player.y);
    }
  }

  const clearKey = getFirstClearKey(run.tier);
  if (!getState().expeditionMeta.firstClearClaimed[clearKey]) {
    markExpeditionFirstClear(clearKey);
  }
}

function finishRun(outcome: 'completed' | 'failed' | 'abandoned', rewards?: ExpeditionRewardBreakdown): void {
  const run = getActiveExpedition();
  if (!run) return;

  if (outcome === 'completed') {
    run.status = 'completed';
    incrementExpeditionCompletions();

    const nextTier = run.tier + 1;
    if (nextTier <= 7) {
      unlockExpeditionTier(nextTier);
    }

    if (rewards) {
      grantCompletionRewards(run, rewards);
    }

    emit('expedition:completed', {
      runId: run.runId,
      durationSec: Math.max(0, getState().gameTime - run.startedAtGameTime),
      rewards: rewards ?? {
        completionXP: 0,
        completionGold: 0,
        firstClearXPBonus: 0,
        firstClearGoldBonus: 0,
        completionChestCount: 0,
      },
    });
  } else {
    run.status = outcome === 'failed' ? 'failed' : 'abandoned';
    incrementExpeditionFailures();

    emit('expedition:failed', {
      runId: run.runId,
      reason: outcome === 'failed' ? 'no_portals' : 'abandoned',
    });
  }

  clearMonstersAndProjectiles();
  clearAllLootDrops();
  clearTransientState();

  const player = getPlayer();
  player.currentHP = player.maxHP;
  player.currentEnergy = player.maxEnergy;
  player.isInvulnerable = false;
  player.isDashing = false;
  player.isAttacking = false;
  player.attackPhase = 'none';
  player.attackPhaseTimer = 0;
  player.velocityX = 0;
  player.velocityY = 0;

  setGameMode('hub');
  clearActiveExpedition();

  emit('expedition:returnHub', {
    runId: run.runId,
    outcome,
  });
}

function onMonsterDied(data: {
  monsterId: string;
  x: number;
  y: number;
  xp: number;
  gold: number;
  isBoss: boolean;
}): void {
  const run = getActiveExpedition();
  if (!run || run.status !== 'active') return;

  monsterEncounterById.delete(data.monsterId);

  run.progress.currentKills += 1;
  emit('expedition:progress', {
    runId: run.runId,
    currentKills: run.progress.currentKills,
    requiredKills: run.progress.requiredKills,
  });

  maybeUpdateCheckpoint(run);

  if (run.progress.currentKills >= run.progress.requiredKills) {
    const rewards = buildCompletionRewards(run);
    finishRun('completed', rewards);
  }
}

function respawnPlayerAtCheckpoint(): void {
  const run = getActiveExpedition();
  if (!run) return;

  const player = getPlayer();
  player.x = run.checkpointX;
  player.y = run.checkpointY;

  if (PLAYER_RESPAWN_FULL_HEAL) {
    player.currentHP = player.maxHP;
  }
  if (PLAYER_RESPAWN_FULL_ENERGY) {
    player.currentEnergy = player.maxEnergy;
  }

  player.isDashing = false;
  player.isAttacking = false;
  player.attackPhase = 'none';
  player.attackPhaseTimer = 0;
  player.velocityX = 0;
  player.velocityY = 0;

  player.isInvulnerable = true;
  respawnInvulnerabilityTimer = RESPAWN_INVULNERABILITY_SECONDS;

  // On death, clear nearby monsters around checkpoint to avoid spawn-camping.
  const clearRadius = 220;
  const clearRadiusSq = clearRadius * clearRadius;
  const state = getState();
  const toRemove: string[] = [];

  for (const monster of state.monsters) {
    if (monster.isDead) continue;
    const dx = monster.x - run.checkpointX;
    const dy = monster.y - run.checkpointY;
    if (dx * dx + dy * dy <= clearRadiusSq) {
      toRemove.push(monster.id);
    }
  }

  for (const id of toRemove) {
    removeMonster(id);
    monsterEncounterById.delete(id);
  }
}

function onPlayerDied(): void {
  const run = getActiveExpedition();
  if (!run || run.status !== 'active') return;

  run.portalsRemaining = Math.max(0, run.portalsRemaining - 1);
  emit('expedition:portalUsed', {
    runId: run.runId,
    portalsRemaining: run.portalsRemaining,
  });

  if (run.portalsRemaining <= 0) {
    finishRun('failed');
    return;
  }

  respawnPlayerAtCheckpoint();
}

export function init(): void {
  if (initialized) return;
  initialized = true;

  clearTransientState();

  on('monster:died', onMonsterDied);
  on('player:died', onPlayerDied);
}

export function hasActiveExpedition(): boolean {
  const run = getActiveExpedition();
  return !!run && run.status === 'active';
}

export function launchExpedition(config: LaunchConfig): ExpeditionRunState | null {
  const zone = ZONES[config.zoneId];
  if (!zone) return null;

  const tier = clampTier(config.tier);
  if (!getState().expeditionMeta.unlockedTiers.includes(tier)) {
    return null;
  }

  const run = buildRun({
    zoneId: config.zoneId,
    tier,
    seed: config.seed,
    objective: config.objective ?? EXPEDITION_OBJECTIVE,
  });

  clearMonstersAndProjectiles();
  clearAllLootDrops();
  clearTransientState();

  setActiveExpedition(run);
  setGameMode('expedition');
  setActiveZone(run.zoneId);
  incrementExpeditionRuns();

  const player = getPlayer();
  player.x = run.checkpointX;
  player.y = run.checkpointY;
  player.isInvulnerable = false;

  setupDirectorForRun(run);
  initialSpawn(run);

  emit('expedition:launched', {
    runId: run.runId,
    zoneId: run.zoneId,
    tier: run.tier,
    seed: run.seed,
  });

  emit('expedition:progress', {
    runId: run.runId,
    currentKills: run.progress.currentKills,
    requiredKills: run.progress.requiredKills,
  });

  return run;
}

export function abandonActiveExpedition(): boolean {
  const run = getActiveExpedition();
  if (!run || run.status !== 'active') return false;

  finishRun('abandoned');
  return true;
}

export function getActiveMapBounds(): { width: number; height: number } | null {
  const run = getActiveExpedition();
  if (!run) return null;
  return getMapBounds(run.map);
}

export function update(dt: number): void {
  const run = getActiveExpedition();
  if (!run || run.status !== 'active') {
    if (respawnInvulnerabilityTimer > 0) {
      respawnInvulnerabilityTimer -= dt;
      if (respawnInvulnerabilityTimer <= 0) {
        getPlayer().isInvulnerable = false;
      }
    }
    return;
  }

  if (respawnInvulnerabilityTimer > 0) {
    respawnInvulnerabilityTimer -= dt;
    if (respawnInvulnerabilityTimer <= 0) {
      getPlayer().isInvulnerable = false;
    }
  }
}
