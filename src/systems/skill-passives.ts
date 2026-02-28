// ============================================================================
// Skill Passives — Passive skill effects that modify player behavior
// ============================================================================
//
// Passive skills are equipped in passive slots (0-2) and provide ongoing
// effects that react to combat events. Each passive has an activate/deactivate
// pair and may have per-frame update logic.
//
// Passives NEVER import other systems. They read from game-state and
// communicate via the event bus.
// ============================================================================

import type {
  SkillDefinition,
  SkillLevelData,
  DamageType,
} from '@/core/types';
import { on, off, emit } from '@/core/event-bus';
import {
  getState,
  getPlayer,
  healPlayer,
  addEnergy,
} from '@/core/game-state';
import { SKILLS } from '@/data/skills.data';

// --- Types ---

interface PassiveState {
  active: boolean;
  level: number;
}

/** Event handler references for clean unsubscription */
interface PassiveHandlers {
  handlers: Array<{ event: string; fn: (...args: never[]) => void }>;
}

// --- Internal state ---

/** Active passive states keyed by passive ID */
const passiveStates = new Map<string, PassiveState>();

/** Registered event handlers for each passive, needed for cleanup on deactivate */
const passiveHandlerRefs = new Map<string, PassiveHandlers>();

// --- Combat Mastery state ---
let combatMasteryConsecutiveHits = 0;
let combatMasteryTimer = 0; // resets after 2s of no hits
let combatMasteryDamageBonus = 0;

// --- Combo Artist state ---
let comboArtistLastSkillId: string | null = null;
let comboArtistLastSkillTime = 0;
let comboArtistBonusActive = false;
let comboArtistBonusTimer = 0;
let comboArtistDamageBonus = 0;

// --- Focused Mind state ---
let focusedMindTimeSinceLastAttack = 0;
let focusedMindActive = false;

// --- Helpers ---

function getPassiveDef(passiveId: string): SkillDefinition | undefined {
  return SKILLS[passiveId];
}

function getPassiveLevel(passiveId: string): number {
  const player = getPlayer();
  const baseLevel = player.skillLevels[passiveId] ?? 0;

  // Include item bonuses
  let itemBonus = 0;
  for (const slot of Object.values(player.equipment)) {
    if (!slot) continue;
    for (const affix of slot.affixes) {
      if (affix.id === `skill_level_${passiveId}`) {
        itemBonus += affix.value;
      }
    }
  }

  return baseLevel + itemBonus;
}

function getPassiveLevelData(passiveId: string): SkillLevelData | undefined {
  const def = getPassiveDef(passiveId);
  if (!def) return undefined;

  const level = getPassiveLevel(passiveId);
  if (level <= 0) return undefined;

  // Clamp to max available level data
  const clampedIndex = Math.min(level - 1, def.levels.length - 1);
  return def.levels[clampedIndex];
}

/**
 * Interpolate a passive value that scales from min to max across levels 1-5.
 */
function scaleValue(min: number, max: number, passiveId: string): number {
  const level = getPassiveLevel(passiveId);
  if (level <= 0) return min;
  const maxLevel = 5;
  const t = (Math.min(level, maxLevel) - 1) / Math.max(1, maxLevel - 1);
  return min + (max - min) * t;
}

// --- Helper to register handlers with cleanup tracking ---

function registerHandler<E extends string>(
  passiveId: string,
  event: E,
  fn: (data: never) => void,
): void {
  if (!passiveHandlerRefs.has(passiveId)) {
    passiveHandlerRefs.set(passiveId, { handlers: [] });
  }
  const refs = passiveHandlerRefs.get(passiveId)!;
  refs.handlers.push({ event, fn });

  // Use type assertion since we know the event bus accepts these
  (on as (event: string, handler: (data: never) => void) => void)(event, fn);
}

function unregisterHandlers(passiveId: string): void {
  const refs = passiveHandlerRefs.get(passiveId);
  if (!refs) return;

  for (const { event, fn } of refs.handlers) {
    (off as (event: string, handler: (data: never) => void) => void)(event, fn);
  }
  refs.handlers.length = 0;
  passiveHandlerRefs.delete(passiveId);
}

// ==========================================================================
// PASSIVE IMPLEMENTATIONS
// ==========================================================================

// --------------------------------------------------------------------------
// 1. Combat Mastery — Consecutive hits add +3-7% damage. Resets on 2s timeout.
// --------------------------------------------------------------------------

function activateCombatMastery(passiveId: string): void {
  combatMasteryConsecutiveHits = 0;
  combatMasteryTimer = 0;
  combatMasteryDamageBonus = 0;

  const bonusPerHit = scaleValue(0.03, 0.07, passiveId);

  const onDamageDealt = (data: {
    targetId: string;
    damage: number;
    isCrit: boolean;
    damageType: DamageType;
    x: number;
    y: number;
  }) => {
    combatMasteryConsecutiveHits++;
    combatMasteryTimer = 2.0; // reset 2s window

    // Calculate new bonus
    const newBonus = combatMasteryConsecutiveHits * bonusPerHit;
    const bonusDiff = newBonus - combatMasteryDamageBonus;

    if (bonusDiff !== 0) {
      const player = getPlayer();
      // Additive bonus to attack
      player.attack = Math.floor(player.baseAttack * (1 + newBonus));
      combatMasteryDamageBonus = newBonus;
      emit('player:statsChanged');
    }
  };

  const onMiss = () => {
    resetCombatMastery();
  };

  registerHandler(passiveId, 'combat:damageDealt', onDamageDealt as (data: never) => void);
  registerHandler(passiveId, 'combat:miss', onMiss as (data: never) => void);
}

function resetCombatMastery(): void {
  if (combatMasteryDamageBonus > 0) {
    const player = getPlayer();
    player.attack = player.baseAttack;
    emit('player:statsChanged');
  }
  combatMasteryConsecutiveHits = 0;
  combatMasteryTimer = 0;
  combatMasteryDamageBonus = 0;
}

function deactivateCombatMastery(passiveId: string): void {
  resetCombatMastery();
  unregisterHandlers(passiveId);
}

function updateCombatMastery(dt: number): void {
  if (combatMasteryTimer > 0) {
    combatMasteryTimer -= dt;
    if (combatMasteryTimer <= 0) {
      resetCombatMastery();
    }
  }
}

// --------------------------------------------------------------------------
// 2. Vampiric Strikes — Heal for 2-6% of damage dealt.
// --------------------------------------------------------------------------

function activateVampiricStrikes(passiveId: string): void {
  const healPercent = scaleValue(0.02, 0.06, passiveId);

  const onDamageDealt = (data: {
    targetId: string;
    damage: number;
    isCrit: boolean;
    damageType: DamageType;
    x: number;
    y: number;
  }) => {
    const healAmount = Math.max(1, Math.floor(data.damage * healPercent));
    const actualHeal = healPlayer(healAmount);

    if (actualHeal > 0) {
      emit('player:healed', { amount: actualHeal, source: 'vampiric_strikes' });
    }
  };

  registerHandler(passiveId, 'combat:damageDealt', onDamageDealt as (data: never) => void);
}

function deactivateVampiricStrikes(passiveId: string): void {
  unregisterHandlers(passiveId);
}

// --------------------------------------------------------------------------
// 3. Critical Flow — On crit hit, gain 3-7 bonus energy.
// --------------------------------------------------------------------------

function activateCriticalFlow(passiveId: string): void {
  const energyGain = Math.floor(scaleValue(3, 7, passiveId));

  const onDamageDealt = (data: {
    targetId: string;
    damage: number;
    isCrit: boolean;
    damageType: DamageType;
    x: number;
    y: number;
  }) => {
    if (!data.isCrit) return;

    const actual = addEnergy(energyGain);
    if (actual > 0) {
      const player = getPlayer();
      emit('energy:changed', {
        current: player.currentEnergy,
        max: player.maxEnergy,
      });
    }
  };

  registerHandler(passiveId, 'combat:damageDealt', onDamageDealt as (data: never) => void);
}

function deactivateCriticalFlow(passiveId: string): void {
  unregisterHandlers(passiveId);
}

// --------------------------------------------------------------------------
// 4. Heavy Handed — +20-40% damage, -15% attack speed (flat modifier).
// --------------------------------------------------------------------------

function activateHeavyHanded(passiveId: string): void {
  const damageBonus = scaleValue(0.20, 0.40, passiveId);
  const attackSpeedPenalty = 0.15;

  const player = getPlayer();
  player.attack = Math.floor(player.attack * (1 + damageBonus));
  player.attackSpeed *= (1 - attackSpeedPenalty);

  emit('player:statsChanged');

  // Store the modifiers in passive state for clean removal
  const state = passiveStates.get(passiveId);
  if (state) {
    (state as PassiveState & { damageBonus?: number; attackSpeedPenalty?: number }).damageBonus = damageBonus;
    (state as PassiveState & { attackSpeedPenalty?: number }).attackSpeedPenalty = attackSpeedPenalty;
  }
}

function deactivateHeavyHanded(passiveId: string): void {
  const state = passiveStates.get(passiveId) as
    (PassiveState & { damageBonus?: number; attackSpeedPenalty?: number }) | undefined;

  if (state) {
    const damageBonus = state.damageBonus ?? 0.20;
    const attackSpeedPenalty = state.attackSpeedPenalty ?? 0.15;

    const player = getPlayer();
    player.attack = Math.floor(player.attack / (1 + damageBonus));
    player.attackSpeed /= (1 - attackSpeedPenalty);

    emit('player:statsChanged');
  }

  unregisterHandlers(passiveId);
}

// --------------------------------------------------------------------------
// 5. Combo Artist — If 2 different skills used within 3s, +20-40% damage for 4s.
// --------------------------------------------------------------------------

function activateComboArtist(passiveId: string): void {
  comboArtistLastSkillId = null;
  comboArtistLastSkillTime = 0;
  comboArtistBonusActive = false;
  comboArtistBonusTimer = 0;
  comboArtistDamageBonus = 0;

  const damageBonus = scaleValue(0.20, 0.40, passiveId);

  const onSkillUsed = (data: { skillId: string; x: number; y: number; angle: number }) => {
    const now = getState().gameTime;

    if (comboArtistLastSkillId !== null &&
        comboArtistLastSkillId !== data.skillId &&
        (now - comboArtistLastSkillTime) <= 3.0) {
      // Combo triggered
      if (!comboArtistBonusActive) {
        comboArtistBonusActive = true;
        comboArtistDamageBonus = damageBonus;

        const player = getPlayer();
        player.attack = Math.floor(player.attack * (1 + damageBonus));
        emit('player:statsChanged');
      }

      comboArtistBonusTimer = 4.0; // refresh duration
    }

    comboArtistLastSkillId = data.skillId;
    comboArtistLastSkillTime = now;
  };

  registerHandler(passiveId, 'skill:used', onSkillUsed as (data: never) => void);
}

function deactivateComboArtist(passiveId: string): void {
  if (comboArtistBonusActive) {
    const player = getPlayer();
    player.attack = Math.floor(player.attack / (1 + comboArtistDamageBonus));
    emit('player:statsChanged');
  }
  comboArtistBonusActive = false;
  comboArtistBonusTimer = 0;
  comboArtistDamageBonus = 0;
  comboArtistLastSkillId = null;
  unregisterHandlers(passiveId);
}

function updateComboArtist(dt: number): void {
  if (comboArtistBonusActive) {
    comboArtistBonusTimer -= dt;
    if (comboArtistBonusTimer <= 0) {
      comboArtistBonusActive = false;
      const player = getPlayer();
      player.attack = Math.floor(player.attack / (1 + comboArtistDamageBonus));
      comboArtistDamageBonus = 0;
      emit('player:statsChanged');
    }
  }
}

// --------------------------------------------------------------------------
// 6. Berserker — When HP below 50%, +10-30% damage and +5-15% crit chance.
// --------------------------------------------------------------------------

let berserkerActive = false;
let berserkerDamageBonus = 0;
let berserkerCritBonus = 0;

function activateBerserker(passiveId: string): void {
  berserkerActive = false;
  berserkerDamageBonus = 0;
  berserkerCritBonus = 0;

  // We check HP ratio each frame in update, not via events
  // Store scale values
  const state = passiveStates.get(passiveId);
  if (state) {
    (state as PassiveState & { scaledDamage?: number; scaledCrit?: number }).scaledDamage =
      scaleValue(0.10, 0.30, passiveId);
    (state as PassiveState & { scaledDamage?: number; scaledCrit?: number }).scaledCrit =
      scaleValue(0.05, 0.15, passiveId);
  }
}

function deactivateBerserker(passiveId: string): void {
  if (berserkerActive) {
    const player = getPlayer();
    player.attack = Math.floor(player.attack / (1 + berserkerDamageBonus));
    player.critChance -= berserkerCritBonus;
    berserkerActive = false;
    berserkerDamageBonus = 0;
    berserkerCritBonus = 0;
    emit('player:statsChanged');
  }
  unregisterHandlers(passiveId);
}

function updateBerserker(passiveId: string): void {
  const player = getPlayer();
  const hpRatio = player.currentHP / player.maxHP;
  const state = passiveStates.get(passiveId) as
    (PassiveState & { scaledDamage?: number; scaledCrit?: number }) | undefined;

  const targetDamageBonus = state?.scaledDamage ?? scaleValue(0.10, 0.30, passiveId);
  const targetCritBonus = state?.scaledCrit ?? scaleValue(0.05, 0.15, passiveId);

  if (hpRatio < 0.5 && !berserkerActive) {
    // Activate berserker bonus
    berserkerActive = true;
    berserkerDamageBonus = targetDamageBonus;
    berserkerCritBonus = targetCritBonus;

    player.attack = Math.floor(player.attack * (1 + berserkerDamageBonus));
    player.critChance += berserkerCritBonus;
    emit('player:statsChanged');
  } else if (hpRatio >= 0.5 && berserkerActive) {
    // Deactivate berserker bonus
    player.attack = Math.floor(player.attack / (1 + berserkerDamageBonus));
    player.critChance -= berserkerCritBonus;
    berserkerActive = false;
    berserkerDamageBonus = 0;
    berserkerCritBonus = 0;
    emit('player:statsChanged');
  }
}

// --------------------------------------------------------------------------
// 7. Efficient Casting — All skill energy costs reduced by 8-20%.
// --------------------------------------------------------------------------
// No direct event wiring needed here.
// Energy-cost reduction is computed in the skills system based on whether
// this passive is equipped and its current effective level.

function activateEfficientCasting(_passiveId: string): void {
}

function deactivateEfficientCasting(passiveId: string): void {
  unregisterHandlers(passiveId);
}

// --------------------------------------------------------------------------
// 8. Spell Weaver — Using any skill reduces all other skill CDs by 0.3-0.8s.
//    Cooldown floor still applies.
// --------------------------------------------------------------------------

function activateSpellWeaver(passiveId: string): void {
  const cdReduction = scaleValue(0.3, 0.8, passiveId);

  const onSkillUsed = (data: { skillId: string; x: number; y: number; angle: number }) => {
    const state = getState();
    const player = getPlayer();

    // Reduce cooldowns on all OTHER equipped active skills
    for (const equippedSkillId of player.activeSkills) {
      if (equippedSkillId === null || equippedSkillId === data.skillId) continue;

      const skillState = state.skillStates[equippedSkillId];
      if (!skillState || skillState.cooldownRemaining <= 0) continue;

      skillState.cooldownRemaining = Math.max(0, skillState.cooldownRemaining - cdReduction);

      if (skillState.cooldownRemaining <= 0) {
        skillState.cooldownRemaining = 0;
        emit('skill:cooldownReady', { skillId: equippedSkillId });
      }
    }
  };

  registerHandler(passiveId, 'skill:used', onSkillUsed as (data: never) => void);
}

function deactivateSpellWeaver(passiveId: string): void {
  unregisterHandlers(passiveId);
}

// --------------------------------------------------------------------------
// 9. Residual Energy — When any buff expires, gain 4-10 energy.
// --------------------------------------------------------------------------

function activateResidualEnergy(passiveId: string): void {
  const energyGain = Math.floor(scaleValue(4, 10, passiveId));

  const onBuffExpired = (data: { skillId: string }) => {
    const actual = addEnergy(energyGain);
    if (actual > 0) {
      const player = getPlayer();
      emit('energy:changed', {
        current: player.currentEnergy,
        max: player.maxEnergy,
      });
    }
  };

  registerHandler(passiveId, 'skill:buffExpired', onBuffExpired as (data: never) => void);
}

function deactivateResidualEnergy(passiveId: string): void {
  unregisterHandlers(passiveId);
}

// --------------------------------------------------------------------------
// 10. Focused Mind — When player hasn't attacked for 1.5s, gain +2-5 energy/sec.
// --------------------------------------------------------------------------

function activateFocusedMind(passiveId: string): void {
  focusedMindTimeSinceLastAttack = 0;
  focusedMindActive = false;

  const onPlayerAttack = () => {
    focusedMindTimeSinceLastAttack = 0;
    focusedMindActive = false;
  };

  const onSkillUsed = () => {
    focusedMindTimeSinceLastAttack = 0;
    focusedMindActive = false;
  };

  registerHandler(passiveId, 'combat:playerAttack', onPlayerAttack as (data: never) => void);
  registerHandler(passiveId, 'skill:used', onSkillUsed as (data: never) => void);
}

function deactivateFocusedMind(passiveId: string): void {
  focusedMindActive = false;
  focusedMindTimeSinceLastAttack = 0;
  unregisterHandlers(passiveId);
}

function updateFocusedMind(passiveId: string, dt: number): void {
  focusedMindTimeSinceLastAttack += dt;

  if (focusedMindTimeSinceLastAttack >= 1.5) {
    focusedMindActive = true;

    const energyPerSec = scaleValue(2, 5, passiveId);
    const energyThisTick = energyPerSec * dt;
    const actual = addEnergy(energyThisTick);

    if (actual > 0) {
      const player = getPlayer();
      emit('energy:changed', {
        current: player.currentEnergy,
        max: player.maxEnergy,
      });
    }
  }
}

// ==========================================================================
// Passive dispatch tables
// ==========================================================================

type ActivateHandler = (passiveId: string) => void;
type DeactivateHandler = (passiveId: string) => void;
type UpdateHandler = (passiveId: string, dt: number) => void;

const activateHandlers: Record<string, ActivateHandler> = {
  combat_mastery: activateCombatMastery,
  vampiric_strikes: activateVampiricStrikes,
  critical_flow: activateCriticalFlow,
  heavy_handed: activateHeavyHanded,
  combo_artist: activateComboArtist,
  berserker: activateBerserker,
  efficient_casting: activateEfficientCasting,
  spell_weaver: activateSpellWeaver,
  residual_energy: activateResidualEnergy,
  focused_mind: activateFocusedMind,
};

const deactivateHandlers: Record<string, DeactivateHandler> = {
  combat_mastery: deactivateCombatMastery,
  vampiric_strikes: deactivateVampiricStrikes,
  critical_flow: deactivateCriticalFlow,
  heavy_handed: deactivateHeavyHanded,
  combo_artist: deactivateComboArtist,
  berserker: deactivateBerserker,
  efficient_casting: deactivateEfficientCasting,
  spell_weaver: deactivateSpellWeaver,
  residual_energy: deactivateResidualEnergy,
  focused_mind: deactivateFocusedMind,
};

const updateHandlers: Record<string, UpdateHandler> = {
  combat_mastery: (_id, dt) => updateCombatMastery(dt),
  combo_artist: (_id, dt) => updateComboArtist(dt),
  berserker: (id) => updateBerserker(id),
  focused_mind: (id, dt) => updateFocusedMind(id, dt),
};

// ==========================================================================
// Public API
// ==========================================================================

/**
 * Activate a passive skill's effects.
 */
export function activate(passiveId: string): void {
  const def = getPassiveDef(passiveId);
  if (!def || def.type !== 'passive') return;

  const level = getPassiveLevel(passiveId);
  if (level <= 0) return;

  // Already active?
  if (passiveStates.has(passiveId) && passiveStates.get(passiveId)!.active) return;

  passiveStates.set(passiveId, { active: true, level });

  const handler = activateHandlers[passiveId];
  if (handler) {
    handler(passiveId);
  }
}

/**
 * Deactivate a passive skill's effects.
 */
export function deactivate(passiveId: string): void {
  const state = passiveStates.get(passiveId);
  if (!state || !state.active) return;

  state.active = false;

  const handler = deactivateHandlers[passiveId];
  if (handler) {
    handler(passiveId);
  }

  passiveStates.delete(passiveId);
}

/**
 * Check if a passive is currently active.
 */
export function isActive(passiveId: string): boolean {
  const state = passiveStates.get(passiveId);
  return state ? state.active : false;
}

// ==========================================================================
// Event handlers
// ==========================================================================

function onSkillEquipped(data: { skillId: string; slot: number }): void {
  const def = getPassiveDef(data.skillId);
  if (!def || def.type !== 'passive') return;

  activate(data.skillId);
}

function onSkillUnequipped(data: { skillId: string; slot: number }): void {
  const def = getPassiveDef(data.skillId);
  if (!def || def.type !== 'passive') return;

  deactivate(data.skillId);
}

// ==========================================================================
// Lifecycle
// ==========================================================================

export function init(): void {
  // Deactivate all existing passives
  for (const [passiveId] of passiveStates) {
    deactivate(passiveId);
  }
  passiveStates.clear();
  passiveHandlerRefs.clear();

  // Reset all internal state
  combatMasteryConsecutiveHits = 0;
  combatMasteryTimer = 0;
  combatMasteryDamageBonus = 0;
  comboArtistLastSkillId = null;
  comboArtistLastSkillTime = 0;
  comboArtistBonusActive = false;
  comboArtistBonusTimer = 0;
  comboArtistDamageBonus = 0;
  berserkerActive = false;
  berserkerDamageBonus = 0;
  berserkerCritBonus = 0;
  focusedMindTimeSinceLastAttack = 0;
  focusedMindActive = false;

  // Listen for skill equip/unequip to auto-activate/deactivate passives
  on('skill:equipped', onSkillEquipped);
  on('skill:unequipped', onSkillUnequipped);

  // Activate any already-equipped passives (e.g., on game load)
  const player = getPlayer();
  for (const passiveId of player.passiveSkills) {
    if (passiveId !== null) {
      activate(passiveId);
    }
  }
}

export function update(dt: number): void {
  // Tick all active passives that have update logic
  for (const [passiveId, state] of passiveStates) {
    if (!state.active) continue;

    const handler = updateHandlers[passiveId];
    if (handler) {
      handler(passiveId, dt);
    }
  }
}
