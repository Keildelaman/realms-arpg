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
  ExpeditionChest,
  Rarity,
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
  unlockExpeditionTierForZone,
  unlockExpeditionZone,
  isExpeditionZoneUnlocked,
  markExpeditionFirstClear,
  markExpeditionZoneBossCleared,
  incrementExpeditionRuns,
  incrementExpeditionCompletions,
  incrementExpeditionFailures,
  isExpeditionTierUnlocked,
} from '@/core/game-state';
import { ZONES } from '@/data/zones.data';
import { MONSTERS } from '@/data/monsters.data';
import {
  AGGRESSIVE_WINDUP_DEFAULT,
  MONSTER_WANDER_PAUSE_MIN,
  MONSTER_WANDER_PAUSE_MAX,
  PLAYER_BODY_RADIUS,
} from '@/data/constants';
import {
  monsterGoldReward,
  monsterHP,
  monsterXPReward,
} from '@/data/balance';
import {
  EXPEDITION_MAX_PORTALS,
  EXPEDITION_BOSS_GATE_TIER,
  EXPEDITION_START_SAFE_RADIUS,
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
  safeResolvePosition,
} from './expedition-generation';
import { generateItem } from './item-gen';
import { grantXP } from './progression';
import { grantGold } from './economy';
import { clearAllLootDrops, spawnLoot } from './loot';
import {
  getObjectiveForTier,
  getNextZoneId,
  getExpeditionMonsterLevel,
  getExpeditionTotalBudget,
  getExpeditionPackSizeMultiplier,
  getExpeditionCheckpointKillInterval,
  getExpeditionCompletionXP,
  getExpeditionCompletionGold,
  getExpeditionCompletionChestCount,
  getExpeditionMapChestSpawnChance,
  getExpeditionMapChestMaxCount,
  getExpeditionChestRarityWeights,
  getExpeditionChestDropRange,
  getExpeditionChestTierBonus,
} from '@/data/expedition-progression.data';

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
let nextChestId = 0;
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

function makeChestId(): string {
  nextChestId += 1;
  return `chest_${nextChestId}`;
}

function pickWeightedRarity(weights: Record<Rarity, number>, rng: LocalRng): Rarity {
  const entries = Object.entries(weights) as Array<[Rarity, number]>;
  let total = 0;
  for (const [, weight] of entries) {
    total += Math.max(0, weight);
  }
  if (total <= 0) return 'common';

  let roll = rng.float(0, total);
  for (const [rarity, weight] of entries) {
    roll -= Math.max(0, weight);
    if (roll <= 0) return rarity;
  }

  return entries[entries.length - 1]?.[0] ?? 'common';
}

function pickCountInRange(min: number, max: number, rng: LocalRng): number {
  if (max <= min) return min;
  return rng.int(min, max);
}

function rollItemRarityForChest(chestRarity: Rarity, rng: LocalRng): Rarity {
  const weightsByChest: Record<Rarity, Record<Rarity, number>> = {
    common: {
      common: 72,
      uncommon: 22,
      rare: 5.5,
      epic: 0.45,
      legendary: 0.05,
    },
    uncommon: {
      common: 32,
      uncommon: 45,
      rare: 19,
      epic: 3.6,
      legendary: 0.4,
    },
    rare: {
      common: 6,
      uncommon: 30,
      rare: 43,
      epic: 18,
      legendary: 3,
    },
    epic: {
      common: 0,
      uncommon: 8,
      rare: 37,
      epic: 43,
      legendary: 12,
    },
    legendary: {
      common: 0,
      uncommon: 2,
      rare: 18,
      epic: 47,
      legendary: 33,
    },
  };

  return pickWeightedRarity(weightsByChest[chestRarity], rng);
}

function rollChestDropCount(
  tier: number,
  rarity: Rarity,
  source: 'map' | 'completion',
  baseCount: number,
  rng: LocalRng,
): number {
  const [minCount, maxCount] = getExpeditionChestDropRange(rarity, source);
  const rolled = pickCountInRange(minCount, maxCount, rng);
  return Math.max(1, baseCount + rolled - 1);
}

function spawnChestLoot(run: ExpeditionRunState, chest: ExpeditionChest): number {
  const seedMix = run.seed ^ (nextMonsterId + 1) ^ ((run.progress.currentKills + 1) * 2654435761);
  const rng = new LocalRng(seedMix >>> 0);
  const tierBonus = getExpeditionChestTierBonus(chest.rarity, chest.source);
  const itemTier = clampTier(run.tier + tierBonus);

  for (let i = 0; i < chest.dropCount; i++) {
    const itemRarity = rollItemRarityForChest(chest.rarity, rng);
    const item = generateItem(itemTier, itemRarity);
    const angle = rng.float(0, Math.PI * 2);
    const radius = 30 + rng.float(6, 54);
    const x = chest.x + Math.cos(angle) * radius;
    const y = chest.y + Math.sin(angle) * radius;
    spawnLoot(item, x, y);
  }

  return chest.dropCount;
}

function createMapChestCandidates(run: ExpeditionRunState): ExpeditionChest[] {
  const chance = getExpeditionMapChestSpawnChance(run.zoneId, run.tier);
  if (chance <= 0 || run.map.encounterPoints.length === 0) {
    return [];
  }

  const maxCount = getExpeditionMapChestMaxCount(run.zoneId, run.tier);
  if (maxCount <= 0) return [];

  const rng = new LocalRng((run.seed ^ 0x6ac1d3f7) >>> 0);
  const points = [...run.map.encounterPoints];
  for (let i = points.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [points[i], points[j]] = [points[j], points[i]];
  }

  const out: ExpeditionChest[] = [];
  const minDistFromSpawn = Math.max(260, EXPEDITION_START_SAFE_RADIUS * 0.65);
  const minDistBetweenChests = 360;

  let chestChance = chance;
  for (const point of points) {
    if (out.length >= maxCount) break;
    if (rng.next() > chestChance) continue;

    const dSpawn = Math.hypot(point.x - run.checkpointX, point.y - run.checkpointY);
    if (dSpawn < minDistFromSpawn) continue;

    let tooCloseToOtherChest = false;
    for (const chest of out) {
      if (Math.hypot(point.x - chest.x, point.y - chest.y) < minDistBetweenChests) {
        tooCloseToOtherChest = true;
        break;
      }
    }
    if (tooCloseToOtherChest) continue;

    const rarity = pickWeightedRarity(getExpeditionChestRarityWeights(run.tier, 'map'), rng);
    const dropCount = rollChestDropCount(run.tier, rarity, 'map', 1, rng);

    out.push({
      id: makeChestId(),
      x: point.x,
      y: point.y,
      interactRadius: 68,
      rarity,
      source: 'map',
      dropCount,
      spawnedAtGameTime: getState().gameTime,
      isOpened: false,
    });

    // Rapidly diminishing probability for additional chests in one map.
    chestChance *= 0.26;
  }

  return out;
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
  const objective = config.objective ?? getObjectiveForTier(tier);
  const map = generateExpeditionMap({
    zoneId: config.zoneId,
    tier,
    seed,
    objective,
  });

  const spawnRoom = map.rooms.find(room => room.id === map.spawnRoomId) ?? map.rooms[0];
  const center = getRoomWorldCenter(spawnRoom);

  const run: ExpeditionRunState = {
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
    pendingRewards: null,
    extractionPortal: null,
    chests: [],
    startedAtGameTime: getState().gameTime,
  };

  run.chests = createMapChestCandidates(run);
  return run;
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

function chooseMonsterDefinition(zoneId: string, tier: number, rng: LocalRng): MonsterDefinition | null {
  const zone = ZONES[zoneId];
  if (!zone || zone.monsters.length === 0) return null;

  const tutorialTier = zoneId === 'whisperwood' && clampTier(tier) === 1;

  const weighted: Array<{ def: MonsterDefinition; weight: number }> = [];
  for (const id of zone.monsters) {
    const def = MONSTERS[id];
    if (!def || def.isBoss) continue;
    if (tutorialTier && def.archetype !== 'melee') continue;
    weighted.push({ def, weight: Math.max(1, def.spawnWeight) });
  }

  if (weighted.length === 0) {
    // Fallback to full pool if tier filter produced an empty set.
    for (const id of zone.monsters) {
      const def = MONSTERS[id];
      if (!def || def.isBoss) continue;
      weighted.push({ def, weight: Math.max(1, def.spawnWeight) });
    }
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

    const def = chooseMonsterDefinition(run.zoneId, run.tier, rng);
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
      ? getExpeditionMonsterLevel(run.zoneId, run.tier, progressRatio)
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
  director.totalBudget = getExpeditionTotalBudget(run.zoneId, tier);
  director.totalSpawned = 0;
  director.checkpointEveryKills = getExpeditionCheckpointKillInterval(tier);
  director.nextCheckpointAtKills = director.checkpointEveryKills;
  director.packSizeMult = getExpeditionPackSizeMultiplier(tier);

  run.progress.requiredKills = director.totalBudget;
}

function sortEncounterIdsForInitialSpread(run: ExpeditionRunState): string[] {
  const spawnPoint = {
    x: run.checkpointX,
    y: run.checkpointY,
  };

  const annotated = run.map.encounterPoints
    .map(point => ({
      id: point.id,
      dist: Math.hypot(point.x - spawnPoint.x, point.y - spawnPoint.y),
      angle: Math.atan2(point.y - spawnPoint.y, point.x - spawnPoint.x),
    }))
    .sort((a, b) => a.dist - b.dist);

  // Traverse outward ring-by-ring, rotating angle order per ring.
  // This keeps kill flow local while still distributing packs around the map.
  const ringSize = Math.max(5, Math.round(annotated.length / 7));
  const out: string[] = [];
  let ringIndex = 0;
  for (let start = 0; start < annotated.length; start += ringSize) {
    const ring = annotated.slice(start, start + ringSize).sort((a, b) => a.angle - b.angle);
    if (ring.length === 0) continue;

    const rotation = ringIndex % ring.length;
    for (let i = 0; i < ring.length; i++) {
      const idx = (i + rotation) % ring.length;
      out.push(ring[idx].id);
    }
    ringIndex += 1;
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

  const spawnUntilTarget = (targetTotal: number): void => {
    let cursor = 0;
    let failedSpawns = 0;
    const maxFailures = cycle.length * 3;

    while (director.totalSpawned < targetTotal && failedSpawns < maxFailures) {
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
  };

  const spawnBossObjective = (): boolean => {
    const zone = ZONES[run.zoneId];
    const bossDef = zone?.bossId ? MONSTERS[zone.bossId] : null;
    if (!bossDef) return false;

    let bossPoint = findEncounterById(run.map, cycle[0]) ?? run.map.encounterPoints[0] ?? null;
    let bestDist = -1;
    for (const id of cycle) {
      const point = findEncounterById(run.map, id);
      if (!point) continue;
      const d = Math.hypot(point.x - startX, point.y - startY);
      if (d > bestDist) {
        bestDist = d;
        bossPoint = point;
      }
    }

    const bossX = bossPoint?.x ?? run.map.bounds.width * 0.5;
    const bossY = bossPoint?.y ?? run.map.bounds.height * 0.5;
    const bossLevel = getExpeditionMonsterLevel(run.zoneId, run.tier, 1);
    const boss = createMonsterInstance(bossDef, bossLevel, bossX, bossY, run.zoneId);

    addMonster(boss);
    emit('monster:spawned', { monster: boss });
    monsterEncounterById.set(boss.id, 'boss_objective');
    director.totalSpawned += 1;
    return true;
  };

  if (run.map.objective === 'boss_hunt') {
    const supportTarget = Math.max(0, director.totalBudget - 1);
    spawnUntilTarget(supportTarget);
    const bossSpawned = spawnBossObjective();
    run.progress.requiredKills = bossSpawned ? 1 : Math.max(0, director.totalSpawned);
    return;
  }

  spawnUntilTarget(director.totalBudget);
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

function getFirstClearKey(run: ExpeditionRunState): string {
  return `${run.zoneId}:${clampTier(run.tier)}:${run.map.objective}`;
}

function buildCompletionRewards(run: ExpeditionRunState): ExpeditionRewardBreakdown {
  const tier = clampTier(run.tier);
  const completionXP = getExpeditionCompletionXP(run.zoneId, tier);
  const completionGold = getExpeditionCompletionGold(run.zoneId, tier);

  const firstClearKey = getFirstClearKey(run);
  const firstClear = !getState().expeditionMeta.firstClearClaimed[firstClearKey];

  return {
    completionXP,
    completionGold,
    firstClearXPBonus: firstClear ? Math.floor(completionXP * FIRST_CLEAR_XP_MULT) : 0,
    firstClearGoldBonus: firstClear ? Math.floor(completionGold * FIRST_CLEAR_GOLD_MULT) : 0,
    completionChestCount: getExpeditionCompletionChestCount(tier),
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

  const clearKey = getFirstClearKey(run);
  if (!getState().expeditionMeta.firstClearClaimed[clearKey]) {
    markExpeditionFirstClear(clearKey);
  }
}

function spawnCompletionRewardChest(run: ExpeditionRunState, rewards: ExpeditionRewardBreakdown): void {
  const portal = run.extractionPortal;
  const centerX = portal?.x ?? getPlayer().x;
  const centerY = portal?.y ?? getPlayer().y;
  const rng = new LocalRng((run.seed ^ 0x91f2a54d ^ Math.floor(getState().gameTime * 1000)) >>> 0);
  const rarity = pickWeightedRarity(getExpeditionChestRarityWeights(run.tier, 'completion'), rng);
  const dropCount = rollChestDropCount(run.tier, rarity, 'completion', rewards.completionChestCount, rng);

  const candidateX = centerX + 74;
  const candidateY = centerY + 36;
  const resolved = safeResolvePosition(run.map, centerX, centerY, candidateX, candidateY, 20);
  const chest: ExpeditionChest = {
    id: makeChestId(),
    x: resolved.x,
    y: resolved.y,
    interactRadius: 72,
    rarity,
    source: 'completion',
    dropCount,
    spawnedAtGameTime: getState().gameTime,
    isOpened: false,
  };

  run.chests.push(chest);

  emit('expedition:chestSpawned', {
    runId: run.runId,
    chestId: chest.id,
    x: chest.x,
    y: chest.y,
    rarity: chest.rarity,
    source: chest.source,
  });
}

function enterExtractionPhase(run: ExpeditionRunState, rewards: ExpeditionRewardBreakdown): void {
  if (run.status !== 'active') return;

  run.status = 'awaiting_extraction';
  run.pendingRewards = rewards;

  incrementExpeditionCompletions();

  const nextTier = run.tier + 1;
  if (nextTier <= EXPEDITION_BOSS_GATE_TIER) {
    unlockExpeditionTierForZone(run.zoneId, nextTier);
  }

  if (run.tier >= EXPEDITION_BOSS_GATE_TIER || run.map.objective === 'boss_hunt') {
    markExpeditionZoneBossCleared(run.zoneId);
    const nextZoneId = getNextZoneId(run.zoneId);
    if (nextZoneId) {
      unlockExpeditionZone(nextZoneId);
      unlockExpeditionTierForZone(nextZoneId, 1);
    }
  }

  grantCompletionRewards(run, rewards);

  const player = getPlayer();
  const desiredX = player.x + 130;
  const desiredY = player.y + 36;
  const resolved = safeResolvePosition(run.map, player.x, player.y, desiredX, desiredY, 20);

  run.extractionPortal = {
    x: resolved.x,
    y: resolved.y,
    interactRadius: 72,
    spawnedAtGameTime: getState().gameTime,
    isActive: true,
  };

  // Objective is complete, clear combat and allow looting/extraction.
  clearMonstersAndProjectiles();
  monsterEncounterById.clear();
  clearTransientState();

  spawnCompletionRewardChest(run, rewards);

  emit('expedition:completed', {
    runId: run.runId,
    durationSec: Math.max(0, getState().gameTime - run.startedAtGameTime),
    rewards,
  });

  emit('expedition:readyToExtract', {
    runId: run.runId,
    x: resolved.x,
    y: resolved.y,
    rewards,
  });
}

function finishRun(outcome: 'completed' | 'failed' | 'abandoned'): void {
  const run = getActiveExpedition();
  if (!run) return;

  if (outcome === 'completed') {
    run.status = 'completed';
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

  if (run.map.objective === 'boss_hunt') {
    if (!data.isBoss) return;

    run.progress.currentKills = 1;
    emit('expedition:progress', {
      runId: run.runId,
      currentKills: run.progress.currentKills,
      requiredKills: run.progress.requiredKills,
    });

    const rewards = buildCompletionRewards(run);
    enterExtractionPhase(run, rewards);
    return;
  }

  run.progress.currentKills += 1;
  emit('expedition:progress', {
    runId: run.runId,
    currentKills: run.progress.currentKills,
    requiredKills: run.progress.requiredKills,
  });

  maybeUpdateCheckpoint(run);

  if (run.progress.currentKills >= run.progress.requiredKills) {
    const rewards = buildCompletionRewards(run);
    enterExtractionPhase(run, rewards);
  }
}

function respawnPlayerAtCheckpoint(): void {
  const run = getActiveExpedition();
  if (!run) return;

  const player = getPlayer();

  // Validate checkpoint is walkable, find nearest walkable if not
  if (isPointWalkable(run.map, run.checkpointX, run.checkpointY, PLAYER_BODY_RADIUS)) {
    player.x = run.checkpointX;
    player.y = run.checkpointY;
  } else {
    const resolved = safeResolvePosition(
      run.map, run.checkpointX, run.checkpointY,
      run.checkpointX, run.checkpointY, PLAYER_BODY_RADIUS,
    );
    player.x = resolved.x;
    player.y = resolved.y;
  }

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

  nextChestId = 0;
  clearTransientState();

  on('monster:died', onMonsterDied);
  on('player:died', onPlayerDied);
}

export function hasActiveExpedition(): boolean {
  const run = getActiveExpedition();
  return !!run && (run.status === 'active' || run.status === 'awaiting_extraction');
}

export function launchExpedition(config: LaunchConfig): ExpeditionRunState | null {
  const zone = ZONES[config.zoneId];
  if (!zone) return null;

  const tier = clampTier(config.tier);
  if (!isExpeditionZoneUnlocked(config.zoneId)) {
    return null;
  }
  if (!isExpeditionTierUnlocked(config.zoneId, tier)) {
    return null;
  }

  const resolvedObjective = config.objective ?? getObjectiveForTier(tier);

  const run = buildRun({
    zoneId: config.zoneId,
    tier,
    seed: config.seed,
    objective: resolvedObjective,
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

  for (const chest of run.chests) {
    emit('expedition:chestSpawned', {
      runId: run.runId,
      chestId: chest.id,
      x: chest.x,
      y: chest.y,
      rarity: chest.rarity,
      source: chest.source,
    });
  }

  return run;
}

export function abandonActiveExpedition(): boolean {
  const run = getActiveExpedition();
  if (!run || run.status !== 'active') return false;

  finishRun('abandoned');
  return true;
}

export function getActiveChests(): Array<{
  id: string;
  x: number;
  y: number;
  interactRadius: number;
  rarity: Rarity;
  source: 'map' | 'completion';
}> {
  const run = getActiveExpedition();
  if (!run) return [];
  if (run.status !== 'active' && run.status !== 'awaiting_extraction') return [];

  return run.chests
    .filter(chest => !chest.isOpened)
    .map(chest => ({
      id: chest.id,
      x: chest.x,
      y: chest.y,
      interactRadius: chest.interactRadius,
      rarity: chest.rarity,
      source: chest.source,
    }));
}

export function canOpenChest(chestId: string, playerX: number, playerY: number): boolean {
  const run = getActiveExpedition();
  if (!run) return false;
  if (run.status !== 'active' && run.status !== 'awaiting_extraction') return false;

  const chest = run.chests.find(c => c.id === chestId);
  if (!chest || chest.isOpened) return false;

  const dx = playerX - chest.x;
  const dy = playerY - chest.y;
  return dx * dx + dy * dy <= chest.interactRadius * chest.interactRadius;
}

export function openChest(chestId: string): boolean {
  const run = getActiveExpedition();
  if (!run) return false;
  if (run.status !== 'active' && run.status !== 'awaiting_extraction') return false;

  const chest = run.chests.find(c => c.id === chestId);
  if (!chest || chest.isOpened) return false;
  if (!canOpenChest(chestId, getPlayer().x, getPlayer().y)) return false;

  chest.isOpened = true;
  const dropCount = spawnChestLoot(run, chest);

  emit('expedition:chestOpened', {
    runId: run.runId,
    chestId: chest.id,
    rarity: chest.rarity,
    source: chest.source,
    dropCount,
  });

  return true;
}

export function getExtractionPortalPosition(): { x: number; y: number; interactRadius: number } | null {
  const run = getActiveExpedition();
  if (!run || run.status !== 'awaiting_extraction' || !run.extractionPortal || !run.extractionPortal.isActive) {
    return null;
  }

  return {
    x: run.extractionPortal.x,
    y: run.extractionPortal.y,
    interactRadius: run.extractionPortal.interactRadius,
  };
}

export function canUseExtractionPortal(playerX: number, playerY: number): boolean {
  const run = getActiveExpedition();
  if (!run) return false;
  if (run.chests.some(chest => chest.source === 'completion' && !chest.isOpened)) {
    return false;
  }

  const portal = getExtractionPortalPosition();
  if (!portal) return false;
  const dx = playerX - portal.x;
  const dy = playerY - portal.y;
  return dx * dx + dy * dy <= portal.interactRadius * portal.interactRadius;
}

export function useExtractionPortal(): boolean {
  const run = getActiveExpedition();
  if (!run || run.status !== 'awaiting_extraction') return false;
  if (!run.extractionPortal || !run.extractionPortal.isActive) return false;
  if (!canUseExtractionPortal(getPlayer().x, getPlayer().y)) return false;

  run.extractionPortal.isActive = false;
  finishRun('completed');
  return true;
}

export function getActiveMapBounds(): { width: number; height: number } | null {
  const run = getActiveExpedition();
  if (!run) return null;
  return getMapBounds(run.map);
}

export function update(dt: number): void {
  const run = getActiveExpedition();
  if (!run || (run.status !== 'active' && run.status !== 'awaiting_extraction')) {
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
