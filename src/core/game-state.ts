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

    monstersKilled: 0,
    totalDamageDealt: 0,
    totalGoldEarned: 0,
    bossesKilled: [],
  };
}

const EXPEDITION_META_STORAGE_KEY = 'realms_arpg_expedition_meta_v1';

function createDefaultExpeditionMeta(): ExpeditionMetaProgress {
  return {
    unlockedTiers: [1],
    firstClearClaimed: {},
    totalRuns: 0,
    totalCompletions: 0,
    totalFailures: 0,
  };
}

function loadExpeditionMetaFromStorage(): ExpeditionMetaProgress {
  if (typeof window === 'undefined') return createDefaultExpeditionMeta();

  try {
    const raw = window.localStorage.getItem(EXPEDITION_META_STORAGE_KEY);
    if (!raw) return createDefaultExpeditionMeta();

    const parsed = JSON.parse(raw) as Partial<ExpeditionMetaProgress>;
    return {
      unlockedTiers: Array.isArray(parsed.unlockedTiers) && parsed.unlockedTiers.length > 0
        ? [...new Set(parsed.unlockedTiers.map(v => Math.max(1, Math.min(7, Math.floor(v)))))]
            .sort((a, b) => a - b)
        : [1],
      firstClearClaimed: parsed.firstClearClaimed ?? {},
      totalRuns: parsed.totalRuns ?? 0,
      totalCompletions: parsed.totalCompletions ?? 0,
      totalFailures: parsed.totalFailures ?? 0,
    };
  } catch {
    return createDefaultExpeditionMeta();
  }
}

function persistExpeditionMeta(): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      EXPEDITION_META_STORAGE_KEY,
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
  state.expeditionMeta = meta;
  persistExpeditionMeta();
}

export function unlockExpeditionTier(tier: number): void {
  const clamped = Math.max(1, Math.min(7, Math.floor(tier)));
  if (!state.expeditionMeta.unlockedTiers.includes(clamped)) {
    state.expeditionMeta.unlockedTiers.push(clamped);
    state.expeditionMeta.unlockedTiers.sort((a, b) => a - b);
    persistExpeditionMeta();
  }
}

export function markExpeditionFirstClear(key: string): void {
  if (!state.expeditionMeta.firstClearClaimed[key]) {
    state.expeditionMeta.firstClearClaimed[key] = true;
    persistExpeditionMeta();
  }
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
    selectedInventorySlot: -1,
  });
}

// Re-export ProjectileInstance for convenience
import type { ProjectileInstance } from './types';
