// ============================================================================
// Save / Load System — Unified versioned localStorage persistence
// ============================================================================

import type { EquipmentSlot, ItemInstance, ExpeditionMetaProgress } from './types';
import { getState, getPlayer, setExpeditionMeta, createDefaultStash } from './game-state';
import { recalculateStats } from '@/systems/player';
import { getShopRefreshCount, restoreShopRefreshCount } from '@/systems/economy';
import { on } from './event-bus';
import { BASIC_ATTACK_COOLDOWN, INVENTORY_SIZE, STASH_TAB_SIZE } from '@/data/constants';

// --- Constants ---

export const SAVE_VERSION = 1;
const SAVE_KEY = 'ashen_grace_save_v1';
const LEGACY_EXPEDITION_META_KEY = 'ashen_grace_expedition_meta_v2';

// --- Interfaces ---

interface PlayerSaveData {
  level: number;
  xp: number;
  xpToNext: number;
  gold: number;
  baseAttack: number;
  baseDefense: number;
  baseMagicPower: number;
  baseCritChance: number;
  baseCritDamage: number;
  baseMoveSpeed: number;
  baseAttackSpeed: number;
  skillPoints: number;
  activeSkills: (string | null)[];
  passiveSkills: (string | null)[];
  unlockedSkills: string[];
  skillLevels: Record<string, number>;
  equipment: Record<EquipmentSlot, ItemInstance | null>;
  inventory: (ItemInstance | null)[];
  ascensionLevel: number;
  monstersKilled: number;
  totalDamageDealt: number;
  totalGoldEarned: number;
  bossesKilled: string[];
  skillUsageCounts?: Record<string, number>;
  skillUpgrades?: Record<string, { pathChoice: 'A' | 'B' | 'C' | null; tier: number }>;
  firstUseShown?: Record<string, boolean>;
  stash?: {
    tabs: Array<{ id: string; name: string; color: number; items: (ItemInstance | null)[] }>;
    activeTabIndex: number;
  };
}

interface WorldSaveData {
  activeZoneId: string;
  zoneKillCounts: Record<string, number>;
  unlockedZones: string[];
}

interface ShopSaveData {
  items: ItemInstance[];
  refreshCost: number;
  refreshCount: number;
}

export interface SaveData {
  version: number;
  savedAt: number;
  player: PlayerSaveData;
  world: WorldSaveData;
  shop: ShopSaveData;
  expeditionMeta: ExpeditionMetaProgress;
}

// --- Serialization ---

function serializeToSave(): SaveData {
  const state = getState();
  const player = getPlayer();

  const playerSave: PlayerSaveData = {
    level: player.level,
    xp: player.xp,
    xpToNext: player.xpToNext,
    gold: player.gold,
    baseAttack: player.baseAttack,
    baseDefense: player.baseDefense,
    baseMagicPower: player.baseMagicPower,
    baseCritChance: player.baseCritChance,
    baseCritDamage: player.baseCritDamage,
    baseMoveSpeed: player.baseMoveSpeed,
    baseAttackSpeed: player.baseAttackSpeed,
    skillPoints: player.skillPoints,
    activeSkills: [...player.activeSkills],
    passiveSkills: [...player.passiveSkills],
    unlockedSkills: [...player.unlockedSkills],
    skillLevels: { ...player.skillLevels },
    equipment: { ...player.equipment },
    inventory: player.inventory.map(item =>
      item ? { ...item, affixes: item.affixes.map(a => ({ ...a })) } : null
    ),
    ascensionLevel: player.ascensionLevel,
    monstersKilled: player.monstersKilled,
    totalDamageDealt: player.totalDamageDealt,
    totalGoldEarned: player.totalGoldEarned,
    bossesKilled: [...player.bossesKilled],
    skillUsageCounts: { ...player.skillUsageCounts },
    skillUpgrades: { ...player.skillUpgrades },
    firstUseShown: { ...player.firstUseShown },
    stash: {
      tabs: player.stash.tabs.map(tab => ({
        id: tab.id,
        name: tab.name,
        color: tab.color,
        items: tab.items.map(item =>
          item ? { ...item, affixes: item.affixes.map(a => ({ ...a })) } : null
        ),
      })),
      activeTabIndex: player.stash.activeTabIndex,
    },
  };

  const worldSave: WorldSaveData = {
    activeZoneId: state.activeZoneId,
    zoneKillCounts: { ...state.zoneKillCounts },
    unlockedZones: [...state.unlockedZones],
  };

  const shopSave: ShopSaveData = {
    items: state.shopItems.map(item => ({ ...item, affixes: item.affixes.map(a => ({ ...a })) })),
    refreshCost: state.shopRefreshCost,
    refreshCount: getShopRefreshCount(),
  };

  const expeditionMeta: ExpeditionMetaProgress = {
    unlockedZones: [...state.expeditionMeta.unlockedZones],
    maxTierByZone: { ...state.expeditionMeta.maxTierByZone },
    bossClearedByZone: { ...state.expeditionMeta.bossClearedByZone },
    selectedZoneId: state.expeditionMeta.selectedZoneId,
    selectedTierByZone: { ...state.expeditionMeta.selectedTierByZone },
    firstClearClaimed: { ...state.expeditionMeta.firstClearClaimed },
    totalRuns: state.expeditionMeta.totalRuns,
    totalCompletions: state.expeditionMeta.totalCompletions,
    totalFailures: state.expeditionMeta.totalFailures,
  };

  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    player: playerSave,
    world: worldSave,
    shop: shopSave,
    expeditionMeta,
  };
}

// --- Application ---

export function applySave(data: SaveData): void {
  const state = getState();
  const player = getPlayer();

  // 1. Restore persistent player fields
  player.level = data.player.level;
  player.xp = data.player.xp;
  player.xpToNext = data.player.xpToNext;
  player.gold = data.player.gold;
  player.baseAttack = data.player.baseAttack;
  player.baseDefense = data.player.baseDefense;
  player.baseMagicPower = data.player.baseMagicPower;
  player.baseCritChance = data.player.baseCritChance;
  player.baseCritDamage = data.player.baseCritDamage;
  player.baseMoveSpeed = data.player.baseMoveSpeed;
  player.baseAttackSpeed = data.player.baseAttackSpeed;
  player.skillPoints = data.player.skillPoints;
  player.activeSkills = [...data.player.activeSkills];
  player.passiveSkills = [...data.player.passiveSkills];
  player.unlockedSkills = [...data.player.unlockedSkills];
  player.skillLevels = { ...data.player.skillLevels };
  player.equipment = { ...data.player.equipment };
  const savedInv = Array.isArray(data.player.inventory) ? data.player.inventory : [];
  const inv: (ItemInstance | null)[] = Array(INVENTORY_SIZE).fill(null);
  savedInv.forEach((item, i) => {
    if (i < INVENTORY_SIZE && item && typeof item === 'object') {
      inv[i] = { ...item, affixes: ((item as ItemInstance).affixes ?? []).map(a => ({ ...a })) };
    }
  });
  player.inventory = inv;
  player.ascensionLevel = data.player.ascensionLevel;
  player.monstersKilled = data.player.monstersKilled;
  player.totalDamageDealt = data.player.totalDamageDealt;
  player.totalGoldEarned = data.player.totalGoldEarned;
  player.bossesKilled = [...data.player.bossesKilled];

  // Restore skill usage counts
  player.skillUsageCounts = data.player.skillUsageCounts
    ? { ...data.player.skillUsageCounts }
    : {};

  // Restore skill upgrades
  if (data.player.skillUpgrades) {
    const upgrades: Record<string, import('./types').SkillUpgradeState> = {};
    for (const [key, val] of Object.entries(data.player.skillUpgrades)) {
      upgrades[key] = { pathChoice: val.pathChoice, tier: val.tier as 0 | 1 | 2 };
    }
    player.skillUpgrades = upgrades;
  } else {
    player.skillUpgrades = {};
  }

  // Restore first-use celebration tracking
  player.firstUseShown = data.player.firstUseShown
    ? { ...data.player.firstUseShown }
    : {};

  // Restore stash
  if (data.player.stash) {
    player.stash = {
      activeTabIndex: data.player.stash.activeTabIndex ?? 0,
      tabs: data.player.stash.tabs.map((tab, i) => {
        const items: (ItemInstance | null)[] = Array(STASH_TAB_SIZE).fill(null);
        (tab.items ?? []).forEach((item, j) => {
          if (j < STASH_TAB_SIZE && item && typeof item === 'object') {
            items[j] = { ...item, affixes: ((item as ItemInstance).affixes ?? []).map(a => ({ ...a })) };
          }
        });
        return { id: tab.id ?? `tab_${i}`, name: tab.name ?? `Tab ${i + 1}`, color: tab.color ?? 0x94a3b8, items };
      }),
    };
  } else {
    player.stash = createDefaultStash();
  }

  // 2. Reset transient player fields
  player.x = 640;
  player.y = 420;
  player.velocityX = 0;
  player.velocityY = 0;
  player.facingAngle = 0;
  player.isAttacking = false;
  player.isDashing = false;
  player.isInvulnerable = false;
  player.attackPhase = 'none';
  player.attackPhaseTimer = 0;
  player.attackAngle = 0;
  player.lastAttackTime = 0;
  player.basicAttackCooldown = BASIC_ATTACK_COOLDOWN;
  player.targetMonsterId = null;

  // 3. Recalculate derived stats from base stats + equipment
  recalculateStats();

  // 4. Restore HP and energy to full
  player.currentHP = player.maxHP;
  player.currentEnergy = player.maxEnergy;

  // 5. Apply world state
  state.activeZoneId = data.world.activeZoneId;
  state.zoneKillCounts = { ...data.world.zoneKillCounts };
  state.unlockedZones = [...data.world.unlockedZones];

  // 6. Apply shop state
  state.shopItems = data.shop.items.map(item => ({ ...item, affixes: item.affixes.map(a => ({ ...a })) }));
  state.shopRefreshCost = data.shop.refreshCost;
  restoreShopRefreshCount(data.shop.refreshCount);

  // 7. Apply expedition meta (normalizes + keeps legacy key in sync)
  setExpeditionMeta(data.expeditionMeta);

  // 8. Clear transient game state
  state.monsters = [];
  state.projectiles = [];
  state.skillStates = {};
  state.activeExpedition = null;
  state.gameMode = 'hub';
  state.isPaused = false;
  state.inventoryOpen = false;
  state.merchantOpen = false;
  state.stashOpen = false;
  state.codexOpen = false;
}

// --- Public API ---

export function saveGame(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(serializeToSave()));
  } catch {
    // Storage quota exceeded — fail silently
  }
}

export function loadGame(): SaveData | null {
  if (typeof window === 'undefined') return null;

  try {
    // Try the unified save key first
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SaveData;
      return migrateIfNeeded(parsed);
    }

    // Legacy migration: expedition meta exists but no unified save
    const legacyRaw = window.localStorage.getItem(LEGACY_EXPEDITION_META_KEY);
    if (legacyRaw) {
      const legacyMeta = JSON.parse(legacyRaw) as ExpeditionMetaProgress;
      // Build a default-player save and overlay the legacy expedition meta
      const defaultSave = serializeToSave();
      defaultSave.expeditionMeta = legacyMeta;
      return defaultSave;
    }

    return null;
  } catch {
    return null;
  }
}

export function hasSaveGame(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(SAVE_KEY) !== null;
}

export function deleteSaveGame(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SAVE_KEY);
}

// --- Migration ---

function migrateIfNeeded(data: SaveData): SaveData {
  // Idempotent migration: rename 'endurance' passive → 'flow_state'
  migrateEnduranceToFlowState(data);

  return data;
}

function migrateEnduranceToFlowState(data: SaveData): void {
  const p = data.player;

  // passiveSkills: rename equipped slot
  for (let i = 0; i < p.passiveSkills.length; i++) {
    if (p.passiveSkills[i] === 'endurance') {
      p.passiveSkills[i] = 'flow_state';
    }
  }

  // unlockedSkills: rename entry
  const idx = p.unlockedSkills.indexOf('endurance');
  if (idx !== -1) {
    p.unlockedSkills[idx] = 'flow_state';
  }

  // skillLevels: transfer level
  if (p.skillLevels['endurance'] !== undefined && p.skillLevels['flow_state'] === undefined) {
    p.skillLevels['flow_state'] = p.skillLevels['endurance'];
    delete p.skillLevels['endurance'];
  }
}

// --- Auto-save subscriptions ---

export function init(): void {
  on('expedition:returnHub', saveGame);
  on('player:levelUp', saveGame);
  on('item:equipped', saveGame);
  on('item:sold', saveGame);
  on('economy:purchase', saveGame);
  on('stash:changed', saveGame);
}
