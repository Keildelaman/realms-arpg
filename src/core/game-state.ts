// ============================================================================
// Game State — Central mutable state store
// ============================================================================

import type {
  GameState,
  PlayerState,
  MonsterInstance,
  ItemInstance,
  EquipmentSlot,
  ExpeditionRunState,
  ExpeditionMetaProgress,
  GameMode,
} from './types';
import {
  BASE_PLAYER_HP,
  BASE_PLAYER_ATTACK,
  BASE_PLAYER_DEFENSE,
  BASE_PLAYER_MAGIC_POWER,
  BASE_CRIT_CHANCE,
  BASE_CRIT_DAMAGE,
  BASE_MOVE_SPEED,
  BASE_ATTACK_SPEED,
  BASIC_ATTACK_COOLDOWN,
  MAX_ENERGY,
  BASE_XP_REQUIREMENT,
  INVENTORY_SIZE,
} from '@/data/constants';
import { ZONE_ORDER } from '@/data/zones.data';
import { EXPEDITION_MAX_TIER } from '@/data/expeditions.data';

function createDefaultPlayer(): PlayerState {
  return {
    level: 1,
    xp: 0,
    xpToNext: BASE_XP_REQUIREMENT,

    currentHP: BASE_PLAYER_HP,
    maxHP: BASE_PLAYER_HP,
    currentEnergy: MAX_ENERGY,
    maxEnergy: MAX_ENERGY,
    gold: 0,

    baseAttack: BASE_PLAYER_ATTACK,
    baseDefense: BASE_PLAYER_DEFENSE,
    baseMagicPower: BASE_PLAYER_MAGIC_POWER,
    baseCritChance: BASE_CRIT_CHANCE,
    baseCritDamage: BASE_CRIT_DAMAGE,
    baseMoveSpeed: BASE_MOVE_SPEED,
    baseAttackSpeed: BASE_ATTACK_SPEED,

    attack: BASE_PLAYER_ATTACK,
    defense: BASE_PLAYER_DEFENSE,
    magicPower: BASE_PLAYER_MAGIC_POWER,
    critChance: BASE_CRIT_CHANCE,
    critDamage: BASE_CRIT_DAMAGE,
    moveSpeed: BASE_MOVE_SPEED,
    attackSpeed: BASE_ATTACK_SPEED,

    bleedChance: 0,
    poisonChance: 0,
    burnChance: 0,
    slowChance: 0,
    freezeChance: 0,
    statusPotency: 1.0,

    armorPen: 0,
    hpRegen: 0,
    dodgeChance: 0,
    damageReduction: 0,
    energyRegen: 0,
    goldFind: 0,
    xpBonus: 0,

    skillPowerBoost: 0,
    skillSpeedBoost: 0,
    skillCritBoost: 0,
    skillMageBoost: 0,
    skillUtilityBoost: 0,

    skillPowerLevel: 0,
    skillSpeedLevel: 0,
    skillCritLevel: 0,
    skillMageLevel: 0,
    skillUtilityLevel: 0,
    skillAllLevel: 0,

    skillPoints: 1, // start with 1 SP for first skill
    activeSkills: ['basic_attack', null, null, null, null, null],
    passiveSkills: [null, null, null],
    unlockedSkills: [],
    skillLevels: {},

    equipment: {
      weapon: null,
      helmet: null,
      chest: null,
      gloves: null,
      boots: null,
      accessory: null,
    },
    inventory: [],

    x: 400,
    y: 300,
    facingAngle: 0,

    velocityX: 0,
    velocityY: 0,

    attackPhase: 'none',
    attackPhaseTimer: 0,
    attackAngle: 0,

    isAttacking: false,
    isDashing: false,
    isInvulnerable: false,
    lastAttackTime: 0,
    basicAttackCooldown: BASIC_ATTACK_COOLDOWN,

    ascensionLevel: 0,

    targetMonsterId: null,

    monstersKilled: 0,
    totalDamageDealt: 0,
    totalGoldEarned: 0,
    bossesKilled: [],
  };
}

const EXPEDITION_META_STORAGE_KEY_V1 = 'ashen_grace_expedition_meta_v1';
const EXPEDITION_META_STORAGE_KEY_V2 = 'ashen_grace_expedition_meta_v2';

interface LegacyExpeditionMetaV1 {
  unlockedTiers?: number[];
  firstClearClaimed?: Record<string, boolean>;
  totalRuns?: number;
  totalCompletions?: number;
  totalFailures?: number;
}

function firstExpeditionZoneId(): string {
  return ZONE_ORDER[0] ?? 'whisperwood';
}

function clampExpeditionTier(tier: number): number {
  return Math.max(1, Math.min(EXPEDITION_MAX_TIER, Math.floor(tier)));
}

function createDefaultExpeditionMeta(): ExpeditionMetaProgress {
  const firstZone = firstExpeditionZoneId();
  return {
    unlockedZones: [firstZone],
    maxTierByZone: { [firstZone]: 1 },
    bossClearedByZone: {},
    selectedZoneId: firstZone,
    selectedTierByZone: { [firstZone]: 1 },
    firstClearClaimed: {},
    totalRuns: 0,
    totalCompletions: 0,
    totalFailures: 0,
  };
}

function migrateLegacyExpeditionMeta(raw: string): ExpeditionMetaProgress {
  const firstZone = firstExpeditionZoneId();
  const defaults = createDefaultExpeditionMeta();
  const parsed = JSON.parse(raw) as LegacyExpeditionMetaV1;

  const maxLegacyTier = Array.isArray(parsed.unlockedTiers) && parsed.unlockedTiers.length > 0
    ? clampExpeditionTier(Math.max(...parsed.unlockedTiers.map(v => Math.floor(v))))
    : 1;

  const migratedFirstClear: Record<string, boolean> = {};
  const legacyFirstClear = parsed.firstClearClaimed ?? {};
  for (const [key, claimed] of Object.entries(legacyFirstClear)) {
    if (!claimed) continue;
    const parts = key.split(':');
    if (parts.length >= 2) {
      const tier = clampExpeditionTier(Number(parts[0]) || 1);
      const objective = parts[1] || 'extermination';
      migratedFirstClear[`${firstZone}:${tier}:${objective}`] = true;
    } else {
      migratedFirstClear[key] = true;
    }
  }

  return {
    ...defaults,
    maxTierByZone: { [firstZone]: maxLegacyTier },
    selectedTierByZone: { [firstZone]: maxLegacyTier },
    firstClearClaimed: migratedFirstClear,
    totalRuns: Math.max(0, parsed.totalRuns ?? 0),
    totalCompletions: Math.max(0, parsed.totalCompletions ?? 0),
    totalFailures: Math.max(0, parsed.totalFailures ?? 0),
  };
}

function normalizeExpeditionMeta(parsed: Partial<ExpeditionMetaProgress>): ExpeditionMetaProgress {
  const defaults = createDefaultExpeditionMeta();
  const firstZone = firstExpeditionZoneId();

  const unlockedZonesRaw = Array.isArray(parsed.unlockedZones) ? parsed.unlockedZones : [];
  const unlockedZones = [...new Set(unlockedZonesRaw.filter(zoneId => ZONE_ORDER.includes(zoneId)))];
  if (unlockedZones.length === 0) {
    unlockedZones.push(firstZone);
  }

  const maxTierByZone: Record<string, number> = {};
  const selectedTierByZone: Record<string, number> = {};
  for (const zoneId of unlockedZones) {
    const rawMax = parsed.maxTierByZone?.[zoneId];
    const clampedMax = clampExpeditionTier(typeof rawMax === 'number' ? rawMax : 1);
    maxTierByZone[zoneId] = clampedMax;

    const rawSelected = parsed.selectedTierByZone?.[zoneId];
    const clampedSelected = clampExpeditionTier(typeof rawSelected === 'number' ? rawSelected : 1);
    selectedTierByZone[zoneId] = clampedSelected;
  }

  const selectedZoneId = unlockedZones.includes(parsed.selectedZoneId ?? '')
    ? (parsed.selectedZoneId as string)
    : unlockedZones[0];

  const bossClearedByZone: Record<string, boolean> = {};
  for (const zoneId of unlockedZones) {
    bossClearedByZone[zoneId] = !!parsed.bossClearedByZone?.[zoneId];
  }

  return {
    ...defaults,
    unlockedZones,
    maxTierByZone,
    bossClearedByZone,
    selectedZoneId,
    selectedTierByZone,
    firstClearClaimed: parsed.firstClearClaimed ?? {},
    totalRuns: Math.max(0, parsed.totalRuns ?? 0),
    totalCompletions: Math.max(0, parsed.totalCompletions ?? 0),
    totalFailures: Math.max(0, parsed.totalFailures ?? 0),
  };
}

function loadExpeditionMetaFromStorage(): ExpeditionMetaProgress {
  if (typeof window === 'undefined') return createDefaultExpeditionMeta();

  try {
    const rawV2 = window.localStorage.getItem(EXPEDITION_META_STORAGE_KEY_V2);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as Partial<ExpeditionMetaProgress>;
      return normalizeExpeditionMeta(parsed);
    }

    const rawV1 = window.localStorage.getItem(EXPEDITION_META_STORAGE_KEY_V1);
    if (rawV1) {
      return migrateLegacyExpeditionMeta(rawV1);
    }

    return createDefaultExpeditionMeta();
  } catch {
    return createDefaultExpeditionMeta();
  }
}

function persistExpeditionMeta(): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      EXPEDITION_META_STORAGE_KEY_V2,
      JSON.stringify(state.expeditionMeta),
    );
  } catch {
    // Ignore storage failures (private mode, quota, etc.)
  }
}

const state: GameState = {
  player: createDefaultPlayer(),
  monsters: [],
  projectiles: [],
  gameMode: 'hub',
  activeZoneId: 'whisperwood',
  activeExpedition: null,
  expeditionMeta: loadExpeditionMetaFromStorage(),
  isPaused: false,
  gameTime: 0,

  skillStates: {},
  zoneKillCounts: {},
  unlockedZones: ['whisperwood'],

  shopItems: [],
  shopRefreshCost: 200,

  inventoryOpen: false,
  merchantOpen: false,
  selectedInventorySlot: -1,
};

// --- Accessors ---

export function getState(): GameState {
  return state;
}

export function getPlayer(): PlayerState {
  return state.player;
}

export function getGameMode(): GameMode {
  return state.gameMode;
}

export function getActiveExpedition(): ExpeditionRunState | null {
  return state.activeExpedition;
}

// --- Player Mutations ---

export function updatePlayer(updates: Partial<PlayerState>): void {
  Object.assign(state.player, updates);
}

export function damagePlayer(amount: number): number {
  const actual = Math.min(state.player.currentHP, Math.max(0, amount));
  state.player.currentHP -= actual;
  return actual;
}

export function healPlayer(amount: number): number {
  const missing = state.player.maxHP - state.player.currentHP;
  const actual = Math.min(missing, Math.max(0, amount));
  state.player.currentHP += actual;
  return actual;
}

export function addEnergy(amount: number): number {
  const missing = state.player.maxEnergy - state.player.currentEnergy;
  const actual = Math.min(missing, Math.max(0, amount));
  state.player.currentEnergy += actual;
  return actual;
}

export function spendEnergy(amount: number): boolean {
  if (state.player.currentEnergy < amount) return false;
  state.player.currentEnergy -= amount;
  return true;
}

export function addGold(amount: number): void {
  state.player.gold += amount;
  state.player.totalGoldEarned += amount;
}

export function spendGold(amount: number): boolean {
  if (state.player.gold < amount) return false;
  state.player.gold -= amount;
  return true;
}

export function addXP(amount: number): void {
  state.player.xp += amount;
}

export function addToInventory(item: ItemInstance): boolean {
  if (state.player.inventory.length >= INVENTORY_SIZE) return false;
  state.player.inventory.push(item);
  return true;
}

export function removeFromInventory(itemId: string): ItemInstance | null {
  const idx = state.player.inventory.findIndex(i => i.id === itemId);
  if (idx === -1) return null;
  return state.player.inventory.splice(idx, 1)[0];
}

export function equipItem(item: ItemInstance): ItemInstance | null {
  const prev = state.player.equipment[item.slot];
  state.player.equipment[item.slot] = item;
  return prev;
}

export function unequipItem(slot: EquipmentSlot): ItemInstance | null {
  const item = state.player.equipment[slot];
  if (!item) return null;
  state.player.equipment[slot] = null;
  return item;
}

// --- Monster Mutations ---

export function addMonster(monster: MonsterInstance): void {
  state.monsters.push(monster);
}

export function removeMonster(id: string): void {
  const idx = state.monsters.findIndex(m => m.id === id);
  if (idx !== -1) state.monsters.splice(idx, 1);
}

export function getMonsterById(id: string): MonsterInstance | undefined {
  return state.monsters.find(m => m.id === id);
}

// --- Projectile Mutations ---

export function addProjectile(proj: ProjectileInstance): void {
  state.projectiles.push(proj);
}

export function removeProjectile(id: string): void {
  const idx = state.projectiles.findIndex(p => p.id === id);
  if (idx !== -1) state.projectiles.splice(idx, 1);
}

// --- Mode/Expeditions ---

export function setGameMode(mode: GameMode): void {
  state.gameMode = mode;
}

export function setActiveExpedition(run: ExpeditionRunState): void {
  state.activeExpedition = run;
}

export function clearActiveExpedition(): void {
  state.activeExpedition = null;
}

export function setExpeditionMeta(meta: ExpeditionMetaProgress): void {
  state.expeditionMeta = normalizeExpeditionMeta(meta);
  persistExpeditionMeta();
}

export function isExpeditionZoneUnlocked(zoneId: string): boolean {
  return state.expeditionMeta.unlockedZones.includes(zoneId);
}

export function unlockExpeditionZone(zoneId: string): void {
  if (!ZONE_ORDER.includes(zoneId)) return;

  if (!state.expeditionMeta.unlockedZones.includes(zoneId)) {
    state.expeditionMeta.unlockedZones.push(zoneId);
  }

  if (!state.expeditionMeta.maxTierByZone[zoneId]) {
    state.expeditionMeta.maxTierByZone[zoneId] = 1;
  }
  if (!state.expeditionMeta.selectedTierByZone[zoneId]) {
    state.expeditionMeta.selectedTierByZone[zoneId] = 1;
  }

  persistExpeditionMeta();
}

export function getExpeditionMaxTier(zoneId: string): number {
  return clampExpeditionTier(state.expeditionMeta.maxTierByZone[zoneId] ?? 1);
}

export function isExpeditionTierUnlocked(zoneId: string, tier: number): boolean {
  if (!isExpeditionZoneUnlocked(zoneId)) return false;
  return clampExpeditionTier(tier) <= getExpeditionMaxTier(zoneId);
}

export function unlockExpeditionTier(tier: number): void {
  // Backward-compatible helper: apply to currently selected zone.
  const zoneId = state.expeditionMeta.selectedZoneId || firstExpeditionZoneId();
  unlockExpeditionTierForZone(zoneId, tier);
}

export function unlockExpeditionTierForZone(zoneId: string, tier: number): void {
  if (!ZONE_ORDER.includes(zoneId)) return;
  const clamped = clampExpeditionTier(tier);
  const current = getExpeditionMaxTier(zoneId);
  if (clamped > current) {
    state.expeditionMeta.maxTierByZone[zoneId] = clamped;
    if (!state.expeditionMeta.selectedTierByZone[zoneId]) {
      state.expeditionMeta.selectedTierByZone[zoneId] = 1;
    }
    persistExpeditionMeta();
  }
}

export function markExpeditionZoneBossCleared(zoneId: string): void {
  if (!state.expeditionMeta.bossClearedByZone[zoneId]) {
    state.expeditionMeta.bossClearedByZone[zoneId] = true;
    persistExpeditionMeta();
  }
}

export function isExpeditionZoneBossCleared(zoneId: string): boolean {
  return !!state.expeditionMeta.bossClearedByZone[zoneId];
}

export function markExpeditionFirstClear(key: string): void {
  if (!state.expeditionMeta.firstClearClaimed[key]) {
    state.expeditionMeta.firstClearClaimed[key] = true;
    persistExpeditionMeta();
  }
}

export function getExpeditionSelectedZoneId(): string {
  const zoneId = state.expeditionMeta.selectedZoneId;
  if (isExpeditionZoneUnlocked(zoneId)) return zoneId;
  return state.expeditionMeta.unlockedZones[0] ?? firstExpeditionZoneId();
}

export function setExpeditionSelectedZoneId(zoneId: string): void {
  if (!isExpeditionZoneUnlocked(zoneId)) return;
  state.expeditionMeta.selectedZoneId = zoneId;
  if (!state.expeditionMeta.selectedTierByZone[zoneId]) {
    state.expeditionMeta.selectedTierByZone[zoneId] = 1;
  }
  persistExpeditionMeta();
}

export function getExpeditionSelectedTierForZone(zoneId: string): number {
  const selected = state.expeditionMeta.selectedTierByZone[zoneId] ?? 1;
  return clampExpeditionTier(selected);
}

export function setExpeditionSelectedTierForZone(zoneId: string, tier: number): void {
  if (!isExpeditionZoneUnlocked(zoneId)) return;
  const clamped = clampExpeditionTier(tier);
  state.expeditionMeta.selectedTierByZone[zoneId] = clamped;
  persistExpeditionMeta();
}

export function incrementExpeditionRuns(): void {
  state.expeditionMeta.totalRuns += 1;
  persistExpeditionMeta();
}

export function incrementExpeditionCompletions(): void {
  state.expeditionMeta.totalCompletions += 1;
  persistExpeditionMeta();
}

export function incrementExpeditionFailures(): void {
  state.expeditionMeta.totalFailures += 1;
  persistExpeditionMeta();
}

// --- Zone ---

export function setActiveZone(zoneId: string): void {
  state.activeZoneId = zoneId;
}

export function unlockZone(zoneId: string): void {
  if (!state.unlockedZones.includes(zoneId)) {
    state.unlockedZones.push(zoneId);
  }
}

export function incrementZoneKills(zoneId: string): number {
  state.zoneKillCounts[zoneId] = (state.zoneKillCounts[zoneId] || 0) + 1;
  return state.zoneKillCounts[zoneId];
}

// --- Game ---

export function resetState(): void {
  const expeditionMeta = loadExpeditionMetaFromStorage();
  Object.assign(state, {
    player: createDefaultPlayer(),
    monsters: [],
    projectiles: [],
    gameMode: 'hub',
    activeZoneId: 'whisperwood',
    activeExpedition: null,
    expeditionMeta,
    isPaused: false,
    gameTime: 0,
    skillStates: {},
    zoneKillCounts: {},
    unlockedZones: ['whisperwood'],
    shopItems: [],
    shopRefreshCost: 200,
    inventoryOpen: false,
    merchantOpen: false,
    selectedInventorySlot: -1,
  });
}

// Re-export ProjectileInstance for convenience
import type { ProjectileInstance } from './types';
