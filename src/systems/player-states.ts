// ============================================================================
// Player States — Flow, Wrath, Primed state tracking
// ============================================================================
//
// Flow: 4+ consecutive hits (within 2s window) → +8% move/attack speed.
//   - Flow state passive adds extra resonance charges every other hit.
// Wrath: <35% HP → +20% all damage. Wrath modifies Resonance generation.
// Primed: After buff applied → next hit +25% damage. Auto-expires after 8s.
//
// Standalone — communicates via event bus only.
// ============================================================================

import type { DamageType } from '@/core/types';
import { on, emit } from '@/core/event-bus';
import { getPlayer } from '@/core/game-state';
import {
  FLOW_HIT_THRESHOLD,
  FLOW_HIT_WINDOW,
  FLOW_SPEED_BONUS,
  WRATH_HP_THRESHOLD,
  PRIMED_DAMAGE_BONUS,
  PRIMED_DURATION,
} from '@/data/constants';

// --- Module-level state ---

let primedTimer = 0;
let flowExtraChargeToggle = false;

// --- Flow state ---

function onDamageDealtFlow(data: {
  targetId: string;
  damage: number;
  isCrit: boolean;
  damageType: DamageType;
  x: number;
  y: number;
  source?: string;
}): void {
  // Skip resonance AoE hits — only direct player actions count
  if (data.source === 'resonance') return;

  const player = getPlayer();
  const cs = player.combatStates;

  // Increment hit counter, reset timer
  cs.flowHitCount++;
  cs.flowTimer = 0;

  // Check threshold
  if (!cs.flow && cs.flowHitCount >= FLOW_HIT_THRESHOLD) {
    cs.flow = true;
    player.moveSpeed *= (1 + FLOW_SPEED_BONUS);
    player.attackSpeed *= (1 + FLOW_SPEED_BONUS);
    emit('playerState:flowEntered');
    emit('player:statsChanged');
  }

  // Flow extra resonance charge: every other hit while in Flow
  if (cs.flow) {
    flowExtraChargeToggle = !flowExtraChargeToggle;
    if (flowExtraChargeToggle) {
      const chargeType = data.damageType === 'physical' ? 'ash' : 'ember';
      emit('resonance:requestCharge', { type: chargeType, amount: 1 });
    }
  }
}

function breakFlow(): void {
  const player = getPlayer();
  const cs = player.combatStates;

  if (cs.flow) {
    cs.flow = false;
    player.moveSpeed /= (1 + FLOW_SPEED_BONUS);
    player.attackSpeed /= (1 + FLOW_SPEED_BONUS);
    emit('playerState:flowBroken');
    emit('player:statsChanged');
  }
  cs.flowHitCount = 0;
  cs.flowTimer = 0;
  flowExtraChargeToggle = false;
}

// --- Primed state ---

function onBuffApplied(_data: { skillId: string; duration: number }): void {
  const player = getPlayer();
  const cs = player.combatStates;

  if (!cs.primed) {
    cs.primed = true;
    cs.primedMultiplier = 1 + PRIMED_DAMAGE_BONUS;
    primedTimer = PRIMED_DURATION;
    emit('playerState:primed', { multiplier: cs.primedMultiplier });
  }
}

function onDamageDealtPrimed(data: {
  targetId: string;
  damage: number;
  isCrit: boolean;
  damageType: DamageType;
  x: number;
  y: number;
  source?: string;
}): void {
  // Skip resonance AoE hits — only direct player actions consume Primed
  if (data.source === 'resonance') return;

  const player = getPlayer();
  const cs = player.combatStates;

  // Consume primed on next hit
  if (cs.primed) {
    cs.primed = false;
    cs.primedMultiplier = 1.0;
    primedTimer = 0;
    emit('playerState:primedConsumed');
  }
}

// --- Lifecycle ---

export function init(): void {
  primedTimer = 0;
  flowExtraChargeToggle = false;

  on('combat:damageDealt', onDamageDealtFlow);
  on('combat:damageDealt', onDamageDealtPrimed);
  on('skill:buffApplied', onBuffApplied);
}

export function update(dt: number): void {
  const player = getPlayer();
  const cs = player.combatStates;

  // --- Flow timer ---
  if (cs.flowHitCount > 0) {
    cs.flowTimer += dt;
    if (cs.flowTimer >= FLOW_HIT_WINDOW) {
      breakFlow();
    }
  }

  // --- Primed timeout ---
  if (cs.primed) {
    primedTimer -= dt;
    if (primedTimer <= 0) {
      cs.primed = false;
      cs.primedMultiplier = 1.0;
      primedTimer = 0;
      emit('playerState:primedConsumed');
    }
  }

  // --- Wrath: HP threshold check ---
  const hpRatio = player.currentHP / player.maxHP;

  if (hpRatio < WRATH_HP_THRESHOLD && !cs.wrath) {
    cs.wrath = true;
    emit('playerState:wrathEntered');
  } else if (hpRatio >= WRATH_HP_THRESHOLD && cs.wrath) {
    cs.wrath = false;
    cs.wrathBonusExtra = 0; // clear blood_price stacking bonus
    emit('playerState:wrathExited');
  }
}
