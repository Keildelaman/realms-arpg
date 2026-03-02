// ============================================================================
// Resonance System — Ash/Ember charge management + release effects
// ============================================================================
//
// Physical hits → Ash charges (max 5). Magic hits → Ember charges (max 5).
// At 5 Ash → Ashburst AoE. At 5 Ember → Overload nova.
// Both at 3+ → Duality (+15% all damage).
//
// Standalone — communicates via event bus only.
// ============================================================================

import type { ResonanceType } from '@/core/types';
import { on, emit } from '@/core/event-bus';
import { getPlayer } from '@/core/game-state';
import {
  RESONANCE_MAX_CHARGES,
  RESONANCE_DECAY_TIME,
  RESONANCE_DECAY_RATE,
  RESONANCE_DUALITY_THRESHOLD,
} from '@/data/constants';

// --- Internal state ---

let decayAccumulator = 0; // accumulates fractional decay

// --- Helpers ---

function addCharge(type: ResonanceType, amount: number): void {
  const player = getPlayer();
  const res = player.resonance;

  // Reset decay timer on any charge gained
  res.decayTimer = 0;
  decayAccumulator = 0;

  if (type === 'ash') {
    res.ash = Math.min(RESONANCE_MAX_CHARGES, res.ash + amount);
    emit('resonance:chargeGained', { type: 'ash', current: res.ash });

    // Check for Ashburst release
    if (res.ash >= RESONANCE_MAX_CHARGES) {
      emit('resonance:release', { type: 'ashburst', x: player.x, y: player.y });
      res.ash = 0;
      emit('resonance:chargeLost', { type: 'ash', current: 0 });
    }
  } else {
    res.ember = Math.min(RESONANCE_MAX_CHARGES, res.ember + amount);
    emit('resonance:chargeGained', { type: 'ember', current: res.ember });

    // Check for Overload release
    if (res.ember >= RESONANCE_MAX_CHARGES) {
      emit('resonance:release', { type: 'overload', x: player.x, y: player.y });
      res.ember = 0;
      emit('resonance:chargeLost', { type: 'ember', current: 0 });
    }
  }

  // Check Duality
  checkDuality();
}

function checkDuality(): void {
  const res = getPlayer().resonance;
  const shouldBeActive = res.ash >= RESONANCE_DUALITY_THRESHOLD && res.ember >= RESONANCE_DUALITY_THRESHOLD;

  if (shouldBeActive !== res.dualityActive) {
    res.dualityActive = shouldBeActive;
    emit('resonance:duality', { active: shouldBeActive });
  }
}

// --- Event handlers ---

function onDamageDealt(data: {
  targetId: string;
  damage: number;
  isCrit: boolean;
  damageType: 'physical' | 'magic';
  x: number;
  y: number;
  source?: string;
}): void {
  // Skip resonance-sourced damage to prevent infinite loop
  if (data.source === 'resonance') return;

  const player = getPlayer();
  const inWrath = player.combatStates.wrath;

  if (data.damageType === 'physical') {
    // Wrath doubles physical Ash generation
    addCharge('ash', inWrath ? 2 : 1);
  } else {
    // Wrath suppresses magic Ember generation
    if (!inWrath) {
      addCharge('ember', 1);
    }
  }
}

function onClearAll(): void {
  const player = getPlayer();
  const res = player.resonance;

  const hadAsh = res.ash > 0;
  const hadEmber = res.ember > 0;

  res.ash = 0;
  res.ember = 0;
  res.decayTimer = 0;
  decayAccumulator = 0;

  if (hadAsh) emit('resonance:chargeLost', { type: 'ash', current: 0 });
  if (hadEmber) emit('resonance:chargeLost', { type: 'ember', current: 0 });

  checkDuality();
}

function onRequestCharge(data: { type: ResonanceType; amount: number }): void {
  addCharge(data.type, data.amount);
}

// --- Lifecycle ---

export function init(): void {
  decayAccumulator = 0;

  on('combat:damageDealt', onDamageDealt);
  on('resonance:requestCharge', onRequestCharge);
  on('resonance:clearAll', onClearAll);
}

export function update(dt: number): void {
  const res = getPlayer().resonance;

  // No charges → nothing to decay
  if (res.ash === 0 && res.ember === 0) {
    res.decayTimer = 0;
    decayAccumulator = 0;
    return;
  }

  // Increment decay timer
  res.decayTimer += dt;

  // Only decay after the grace period
  if (res.decayTimer < RESONANCE_DECAY_TIME) return;

  // Accumulate decay
  decayAccumulator += RESONANCE_DECAY_RATE * dt;

  // Lose charges when accumulator >= 1
  while (decayAccumulator >= 1 && (res.ash > 0 || res.ember > 0)) {
    decayAccumulator -= 1;

    // Alternate: lose from whichever is higher, or ash first on tie
    if (res.ash >= res.ember && res.ash > 0) {
      res.ash--;
      emit('resonance:chargeLost', { type: 'ash', current: res.ash });
    } else if (res.ember > 0) {
      res.ember--;
      emit('resonance:chargeLost', { type: 'ember', current: res.ember });
    }
  }

  // Re-check Duality after decay
  checkDuality();
}
