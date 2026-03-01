// ============================================================================
// Monster Affixes Data — 10 affixes for magic/rare monsters
// Pure data module: static objects and pure functions only.
// ============================================================================

import type { MonsterAffixDef } from '@/core/types';

export const MONSTER_AFFIXES: Record<string, MonsterAffixDef> = {

  // --- Offensive Affixes ---

  berserker: {
    id: 'berserker',
    name: 'Berserker',
    description: '+35% damage, +15% speed, -15% HP',
    damageMultiplier: 1.35,
    speedMultiplier: 1.15,
    hpMultiplier: 0.85,
    color: '#dc2626',
    particleEffect: 'red_trail',
  },

  hasted: {
    id: 'hasted',
    name: 'Hasted',
    description: '+40% speed, -25% attack cooldown',
    speedMultiplier: 1.4,
    attackCooldownMultiplier: 0.75,
    color: '#3b82f6',
    particleEffect: 'blue_streak',
  },

  deadly: {
    id: 'deadly',
    name: 'Deadly',
    description: '+50% damage',
    damageMultiplier: 1.5,
    color: '#991b1b',
  },

  // --- Defensive Affixes ---

  fortified: {
    id: 'fortified',
    name: 'Fortified',
    description: '+70% HP, +20 armor, -10% speed',
    hpMultiplier: 1.7,
    armorBonus: 20,
    speedMultiplier: 0.9,
    color: '#6b7280',
    particleEffect: 'grey_particles',
  },

  regenerating: {
    id: 'regenerating',
    name: 'Regenerating',
    description: '2% maxHP/sec regen',
    color: '#16a34a',
    particleEffect: 'green_heal',
  },

  shielded: {
    id: 'shielded',
    name: 'Shielded',
    description: '30% maxHP shield, 50% absorption',
    color: '#60a5fa',
  },

  // --- Utility Affixes ---

  vampiric: {
    id: 'vampiric',
    name: 'Vampiric',
    description: '15% lifesteal on hit',
    onHitEffect: 'vampiric',
    color: '#4ade80',
  },

  teleporting: {
    id: 'teleporting',
    name: 'Teleporting',
    description: 'Blinks near player every 5s',
    color: '#a855f7',
    particleEffect: 'purple_flash',
  },

  frenzy_aura: {
    id: 'frenzy_aura',
    name: 'Frenzy Aura',
    description: '+20% damage, +15% attack speed to nearby allies',
    auraEffect: 'frenzy',
    auraRadius: 150,
    auraStatBuff: {
      stat: 'damage',
      multiplier: 1.2,
    },
    color: '#f97316',
    particleEffect: 'orange_pulse',
  },

  frost_nova: {
    id: 'frost_nova',
    name: 'Frost Nova',
    description: 'On death: 100px frost nova with slow + damage',
    onDeathEffect: 'frost_nova',
    color: '#93c5fd',
    particleEffect: 'ice_particles',
  },
};

/**
 * Look up a monster affix definition by ID.
 */
export function getMonsterAffix(id: string): MonsterAffixDef | undefined {
  return MONSTER_AFFIXES[id];
}

/**
 * Get all affix IDs.
 */
export function getAllAffixIds(): string[] {
  return Object.keys(MONSTER_AFFIXES);
}
