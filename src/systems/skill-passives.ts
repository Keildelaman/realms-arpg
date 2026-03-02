// ============================================================================
// Skill Passives — 5 passive skill effects (Phase 2 — Spec Reconciliation)
// ============================================================================
//
// combat_rhythm:    3+ hits on same target → escalating +5%/hit damage (max +25%)
// arcane_recursion: Magic cast → reduce all other skill CDs by 0.5s
// shadow_reflexes:  After Shadow Step → 2 empowered hits (+20% dmg, guarantee states)
// blood_price:      Take damage → Ash charges + Wrath stacking damage bonus
// flow_state:       In Flow → +1 Resonance/hit, release +30% dmg/+20% radius, +8 energy
//
// Passives NEVER import other systems. They read from game-state and
// communicate via the event bus.
// ============================================================================

import type {
  SkillDefinition,
  DamageType,
} from '@/core/types';
import { on, off, emit } from '@/core/event-bus';
import {
  getPlayer,
  addEnergy,
} from '@/core/game-state';
import { SKILLS } from '@/data/skills.data';
import {
  RHYTHM_HIT_THRESHOLD,
  RHYTHM_MAX_BONUS,
  RHYTHM_BONUS_PER_HIT,
  RHYTHM_TIMEOUT,
  ARCANE_RECURSION_CDR,
  BLOOD_PRICE_HP_CHUNK,
  BLOOD_PRICE_WRATH_STACK,
  BLOOD_PRICE_WRATH_CAP,
  BLOOD_PRICE_PANIC_THRESHOLD,
  SHADOW_REFLEXES_HITS,
  SHADOW_REFLEXES_DAMAGE_BONUS,
  SHADOW_REFLEXES_DURATION,
  SHADOW_REFLEXES_PANIC_WINDOW,
  SHADOW_REFLEXES_PANIC_CDR,
  FLOW_STATE_ENERGY_RESTORE,
} from '@/data/constants';

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

// --- Combat Rhythm state ---
let rhythmTargetId: string | null = null;
let rhythmHitCount = 0;
let rhythmBonus = 0;
let rhythmTimer = 0;
let rhythmBonusApplied = false;

// --- Shadow Reflexes state ---
let shadowReflexesHitsRemaining = 0;
let shadowReflexesTimer = 0;
let shadowReflexesDmgBonusApplied = false;
let shadowReflexesLastDamagedTime = -999;
let shadowReflexesMonotonicTime = 0;

// --- Flow State state ---
let flowStateReleaseBoostApplied = false;

// --- Helpers ---

function getPassiveDef(passiveId: string): SkillDefinition | undefined {
  return SKILLS[passiveId];
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
// 1. Combat Rhythm — 3+ hits on same target → escalating damage bonus
// --------------------------------------------------------------------------

function activateCombatRhythm(_passiveId: string): void {
  rhythmTargetId = null;
  rhythmHitCount = 0;
  rhythmBonus = 0;
  rhythmTimer = 0;
  rhythmBonusApplied = false;

  const onDamageDealt = (data: {
    targetId: string;
    damage: number;
    isCrit: boolean;
    damageType: DamageType;
    x: number;
    y: number;
    source?: string;
  }) => {
    if (data.source === 'resonance') return;

    if (data.targetId === rhythmTargetId) {
      // Same target — increment
      rhythmHitCount++;
      rhythmTimer = RHYTHM_TIMEOUT;

      if (rhythmHitCount >= RHYTHM_HIT_THRESHOLD) {
        const newBonus = Math.min(RHYTHM_MAX_BONUS, (rhythmHitCount - RHYTHM_HIT_THRESHOLD) * RHYTHM_BONUS_PER_HIT);

        if (newBonus !== rhythmBonus) {
          // Remove old bonus, apply new
          removeRhythmBonus();
          rhythmBonus = newBonus;
          if (rhythmBonus > 0) {
            applyRhythmBonus();
          }
        }
      }
    } else {
      // Different target — reset
      removeRhythmBonus();
      rhythmTargetId = data.targetId;
      rhythmHitCount = 1;
      rhythmTimer = RHYTHM_TIMEOUT;
      rhythmBonus = 0;
    }
  };

  registerHandler(_passiveId, 'combat:damageDealt', onDamageDealt as (data: never) => void);
}

function applyRhythmBonus(): void {
  if (rhythmBonusApplied || rhythmBonus <= 0) return;
  const player = getPlayer();
  player.attack = Math.floor(player.attack * (1 + rhythmBonus));
  player.magicPower = Math.floor(player.magicPower * (1 + rhythmBonus));
  rhythmBonusApplied = true;
  emit('player:statsChanged');
}

function removeRhythmBonus(): void {
  if (!rhythmBonusApplied || rhythmBonus <= 0) return;
  const player = getPlayer();
  player.attack = Math.floor(player.attack / (1 + rhythmBonus));
  player.magicPower = Math.floor(player.magicPower / (1 + rhythmBonus));
  rhythmBonusApplied = false;
  emit('player:statsChanged');
}

function deactivateCombatRhythm(passiveId: string): void {
  removeRhythmBonus();
  rhythmTargetId = null;
  rhythmHitCount = 0;
  rhythmBonus = 0;
  rhythmTimer = 0;
  rhythmBonusApplied = false;
  unregisterHandlers(passiveId);
}

function updateCombatRhythm(dt: number): void {
  if (rhythmHitCount > 0) {
    rhythmTimer -= dt;
    if (rhythmTimer <= 0) {
      removeRhythmBonus();
      rhythmTargetId = null;
      rhythmHitCount = 0;
      rhythmBonus = 0;
      rhythmTimer = 0;
    }
  }
}

// --------------------------------------------------------------------------
// 2. Arcane Recursion — Magic cast → reduce all other CDs by 0.5s
// --------------------------------------------------------------------------

function activateArcaneRecursion(passiveId: string): void {
  const onSkillUsed = (data: { skillId: string; x: number; y: number; angle: number }) => {
    const skillDef = SKILLS[data.skillId];
    if (!skillDef || skillDef.damageType !== 'magic') return;

    emit('skill:reduceCooldowns', {
      amount: ARCANE_RECURSION_CDR,
      excludeSkillId: data.skillId,
    });
  };

  registerHandler(passiveId, 'skill:used', onSkillUsed as (data: never) => void);
}

function deactivateArcaneRecursion(passiveId: string): void {
  unregisterHandlers(passiveId);
}

// --------------------------------------------------------------------------
// 3. Blood Price — Take damage → Ash charges, Wrath stacking bonus, panic
// --------------------------------------------------------------------------

function activateBloodPrice(passiveId: string): void {
  const onPlayerDamaged = (data: { amount: number; source: string }) => {
    // Skip self-inflicted damage (e.g., from old blood_price mechanic)
    if (data.source === 'blood_price') return;

    const player = getPlayer();
    const cs = player.combatStates;

    // Generate Ash charges: 1 per 5% maxHP chunk received
    const chunkSize = player.maxHP * BLOOD_PRICE_HP_CHUNK;
    if (chunkSize > 0) {
      const chunks = Math.floor(data.amount / chunkSize);
      if (chunks > 0) {
        emit('resonance:requestCharge', { type: 'ash', amount: Math.min(5, chunks) });
      }
    }

    // In Wrath: +5% damage per hit taken (max +35%)
    if (cs.wrath) {
      cs.wrathBonusExtra = Math.min(BLOOD_PRICE_WRATH_CAP, cs.wrathBonusExtra + BLOOD_PRICE_WRATH_STACK);
    }

    // Panic: below 15% HP → lose all Resonance
    const hpRatio = player.currentHP / player.maxHP;
    if (hpRatio < BLOOD_PRICE_PANIC_THRESHOLD) {
      emit('resonance:clearAll');
    }
  };

  const onWrathExited = () => {
    const player = getPlayer();
    player.combatStates.wrathBonusExtra = 0;
  };

  registerHandler(passiveId, 'player:damaged', onPlayerDamaged as (data: never) => void);
  registerHandler(passiveId, 'playerState:wrathExited', onWrathExited as (data: never) => void);
}

function deactivateBloodPrice(passiveId: string): void {
  const player = getPlayer();
  player.combatStates.wrathBonusExtra = 0;
  unregisterHandlers(passiveId);
}

// --------------------------------------------------------------------------
// 4. Shadow Reflexes — After Shadow Step → 2 empowered hits + panic dash
// --------------------------------------------------------------------------

function activateShadowReflexes(passiveId: string): void {
  shadowReflexesHitsRemaining = 0;
  shadowReflexesTimer = 0;
  shadowReflexesDmgBonusApplied = false;
  shadowReflexesLastDamagedTime = -999;
  shadowReflexesMonotonicTime = 0;

  const onSkillUsed = (data: { skillId: string; x: number; y: number; angle: number }) => {
    if (data.skillId !== 'shadow_step') return;

    // Activate empowered window
    shadowReflexesHitsRemaining = SHADOW_REFLEXES_HITS;
    shadowReflexesTimer = SHADOW_REFLEXES_DURATION;
    applyShadowReflexesBonus();

    const player = getPlayer();
    player.combatStates.guaranteeStateApply = true;

    // Panic dash check: if damaged within the last 0.5s
    if ((shadowReflexesMonotonicTime - shadowReflexesLastDamagedTime) <= SHADOW_REFLEXES_PANIC_WINDOW) {
      emit('skill:reduceSingleCooldown', {
        skillId: 'shadow_step',
        amount: SHADOW_REFLEXES_PANIC_CDR,
      });
    }
  };

  const onDamageDealt = (data: {
    targetId: string;
    damage: number;
    isCrit: boolean;
    damageType: DamageType;
    x: number;
    y: number;
    source?: string;
  }) => {
    if (data.source === 'resonance') return;
    if (shadowReflexesHitsRemaining <= 0) return;

    shadowReflexesHitsRemaining--;
    if (shadowReflexesHitsRemaining <= 0) {
      removeShadowReflexesBonus();
      const player = getPlayer();
      player.combatStates.guaranteeStateApply = false;
    }
  };

  const onPlayerDamaged = (_data: { amount: number; source: string }) => {
    shadowReflexesLastDamagedTime = shadowReflexesMonotonicTime;
  };

  registerHandler(passiveId, 'skill:used', onSkillUsed as (data: never) => void);
  registerHandler(passiveId, 'combat:damageDealt', onDamageDealt as (data: never) => void);
  registerHandler(passiveId, 'player:damaged', onPlayerDamaged as (data: never) => void);
}

function applyShadowReflexesBonus(): void {
  if (shadowReflexesDmgBonusApplied) return;
  const player = getPlayer();
  player.attack = Math.floor(player.attack * (1 + SHADOW_REFLEXES_DAMAGE_BONUS));
  player.magicPower = Math.floor(player.magicPower * (1 + SHADOW_REFLEXES_DAMAGE_BONUS));
  shadowReflexesDmgBonusApplied = true;
  emit('player:statsChanged');
}

function removeShadowReflexesBonus(): void {
  if (!shadowReflexesDmgBonusApplied) return;
  const player = getPlayer();
  player.attack = Math.floor(player.attack / (1 + SHADOW_REFLEXES_DAMAGE_BONUS));
  player.magicPower = Math.floor(player.magicPower / (1 + SHADOW_REFLEXES_DAMAGE_BONUS));
  shadowReflexesDmgBonusApplied = false;
  emit('player:statsChanged');
}

function deactivateShadowReflexes(passiveId: string): void {
  removeShadowReflexesBonus();
  const player = getPlayer();
  player.combatStates.guaranteeStateApply = false;
  shadowReflexesHitsRemaining = 0;
  shadowReflexesTimer = 0;
  shadowReflexesDmgBonusApplied = false;
  shadowReflexesLastDamagedTime = -999;
  shadowReflexesMonotonicTime = 0;
  unregisterHandlers(passiveId);
}

function updateShadowReflexes(dt: number): void {
  shadowReflexesMonotonicTime += dt;

  if (shadowReflexesHitsRemaining > 0) {
    shadowReflexesTimer -= dt;
    if (shadowReflexesTimer <= 0) {
      shadowReflexesHitsRemaining = 0;
      removeShadowReflexesBonus();
      const player = getPlayer();
      player.combatStates.guaranteeStateApply = false;
    }
  }
}

// --------------------------------------------------------------------------
// 5. Flow State — In Flow: +1 Resonance/hit, release boost, energy restore
// --------------------------------------------------------------------------

function activateFlowState(passiveId: string): void {
  flowStateReleaseBoostApplied = false;

  const onFlowEntered = () => {
    // Restore 8 energy
    const player = getPlayer();
    const actual = addEnergy(FLOW_STATE_ENERGY_RESTORE);
    if (actual > 0) {
      emit('energy:changed', {
        current: player.currentEnergy,
        max: player.maxEnergy,
      });
    }

    // Enable release boost
    player.resonance.flowReleaseBoost = true;
    flowStateReleaseBoostApplied = true;
  };

  const onFlowBroken = () => {
    const player = getPlayer();
    player.resonance.flowReleaseBoost = false;
    flowStateReleaseBoostApplied = false;
  };

  const onDamageDealt = (data: {
    targetId: string;
    damage: number;
    isCrit: boolean;
    damageType: DamageType;
    x: number;
    y: number;
    source?: string;
  }) => {
    if (data.source === 'resonance') return;

    const player = getPlayer();
    if (!player.combatStates.flow) return;

    // +1 matching Resonance charge per hit while in Flow
    const chargeType = data.damageType === 'physical' ? 'ash' : 'ember';
    emit('resonance:requestCharge', { type: chargeType, amount: 1 });
  };

  registerHandler(passiveId, 'playerState:flowEntered', onFlowEntered as (data: never) => void);
  registerHandler(passiveId, 'playerState:flowBroken', onFlowBroken as (data: never) => void);
  registerHandler(passiveId, 'combat:damageDealt', onDamageDealt as (data: never) => void);
}

function deactivateFlowState(passiveId: string): void {
  const player = getPlayer();
  player.resonance.flowReleaseBoost = false;
  flowStateReleaseBoostApplied = false;
  unregisterHandlers(passiveId);
}

// ==========================================================================
// Passive dispatch tables
// ==========================================================================

type ActivateHandler = (passiveId: string) => void;
type DeactivateHandler = (passiveId: string) => void;
type UpdateHandler = (passiveId: string, dt: number) => void;

const activateHandlers: Record<string, ActivateHandler> = {
  combat_rhythm: activateCombatRhythm,
  arcane_recursion: activateArcaneRecursion,
  blood_price: activateBloodPrice,
  shadow_reflexes: activateShadowReflexes,
  flow_state: activateFlowState,
};

const deactivateHandlers: Record<string, DeactivateHandler> = {
  combat_rhythm: deactivateCombatRhythm,
  arcane_recursion: deactivateArcaneRecursion,
  blood_price: deactivateBloodPrice,
  shadow_reflexes: deactivateShadowReflexes,
  flow_state: deactivateFlowState,
};

const updateHandlers: Record<string, UpdateHandler> = {
  combat_rhythm: (_id, dt) => updateCombatRhythm(dt),
  shadow_reflexes: (_id, dt) => updateShadowReflexes(dt),
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

  const player = getPlayer();
  const level = player.skillLevels[passiveId] ?? 0;
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
  rhythmTargetId = null;
  rhythmHitCount = 0;
  rhythmBonus = 0;
  rhythmTimer = 0;
  rhythmBonusApplied = false;

  shadowReflexesHitsRemaining = 0;
  shadowReflexesTimer = 0;
  shadowReflexesDmgBonusApplied = false;
  shadowReflexesLastDamagedTime = -999;
  shadowReflexesMonotonicTime = 0;

  flowStateReleaseBoostApplied = false;

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
