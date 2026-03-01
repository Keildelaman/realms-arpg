// ============================================================================
// Monster Abilities Data — All monster ability definitions
// Pure data module: static objects and pure functions only.
// ============================================================================

import type { MonsterAbilityDef } from '@/core/types';

export const MONSTER_ABILITIES: Record<string, MonsterAbilityDef> = {

  // --- Melee Abilities ---

  ground_slam: {
    id: 'ground_slam',
    name: 'Ground Slam',
    cooldown: 5,
    castTime: 0.8,
    activationRange: 60,
    targeting: 'self',
    damageMultiplier: 1.8,
    damageType: 'physical',
    radius: 70,
    telegraph: {
      shape: 'circle',
      color: '#ff2222',
      duration: 0.8,
      warningFlash: true,
    },
    moveDuringCast: false,
  },

  cleave: {
    id: 'cleave',
    name: 'Cleave',
    cooldown: 3.5,
    castTime: 0.5,
    activationRange: 50,
    targeting: 'player',
    damageMultiplier: 1.3,
    damageType: 'physical',
    width: 120, // degrees arc
    length: 60,
    telegraph: {
      shape: 'cone',
      color: '#ff2222',
      duration: 0.5,
      warningFlash: true,
    },
    moveDuringCast: false,
  },

  leaping_strike: {
    id: 'leaping_strike',
    name: 'Leaping Strike',
    cooldown: 6,
    castTime: 0.6,
    activationRange: 200,
    targeting: 'player',
    damageMultiplier: 2.0,
    damageType: 'physical',
    radius: 50,
    telegraph: {
      shape: 'circle',
      color: '#ff4444',
      duration: 0.6,
      warningFlash: true,
    },
    moveDuringCast: false,
    dashToTarget: true,
    dashSpeed: 600,
  },

  // --- Ranged Abilities ---

  arrow_shot: {
    id: 'arrow_shot',
    name: 'Arrow Shot',
    cooldown: 0,
    castTime: 0.3,
    activationRange: 300,
    targeting: 'player',
    damageMultiplier: 0.8,
    damageType: 'physical',
    projectile: {
      speed: 350,
      size: 4,
      color: '#d4a574',
      piercing: false,
      count: 1,
      spread: 0,
      maxDistance: 400,
    },
    telegraph: {
      shape: 'line',
      color: '#d4a574',
      duration: 0.3,
      warningFlash: false,
    },
    moveDuringCast: false,
  },

  arrow_volley: {
    id: 'arrow_volley',
    name: 'Arrow Volley',
    cooldown: 4,
    castTime: 0.7,
    activationRange: 300,
    targeting: 'player',
    damageMultiplier: 0.6,
    damageType: 'physical',
    projectile: {
      speed: 300,
      size: 4,
      color: '#d4a574',
      piercing: false,
      count: 3,
      spread: 20,
      maxDistance: 400,
    },
    telegraph: {
      shape: 'line',
      color: '#d4a574',
      duration: 0.7,
      warningFlash: true,
    },
    moveDuringCast: false,
  },

  poison_spit: {
    id: 'poison_spit',
    name: 'Poison Spit',
    cooldown: 3,
    castTime: 0.4,
    activationRange: 250,
    targeting: 'player_predict',
    damageMultiplier: 0.5,
    damageType: 'magic',
    projectile: {
      speed: 250,
      size: 6,
      color: '#16a34a',
      piercing: false,
      count: 1,
      spread: 0,
      maxDistance: 350,
    },
    telegraph: {
      shape: 'line',
      color: '#16a34a',
      duration: 0.4,
      warningFlash: false,
    },
    moveDuringCast: false,
  },

  // --- Caster Abilities ---

  fireball: {
    id: 'fireball',
    name: 'Fireball',
    cooldown: 3.5,
    castTime: 0.6,
    activationRange: 350,
    targeting: 'player',
    damageMultiplier: 1.5,
    damageType: 'magic',
    radius: 50, // explosion radius on impact
    projectile: {
      speed: 220,
      size: 8,
      color: '#f97316',
      piercing: false,
      count: 1,
      spread: 0,
      maxDistance: 450,
    },
    telegraph: {
      shape: 'circle',
      color: '#f97316',
      duration: 0.6,
      warningFlash: true,
    },
    moveDuringCast: false,
  },

  frost_bolt: {
    id: 'frost_bolt',
    name: 'Frost Bolt',
    cooldown: 2.5,
    castTime: 0.4,
    activationRange: 300,
    targeting: 'player_predict',
    damageMultiplier: 0.8,
    damageType: 'magic',
    projectile: {
      speed: 280,
      size: 5,
      color: '#93c5fd',
      piercing: false,
      count: 1,
      spread: 0,
      maxDistance: 400,
    },
    telegraph: {
      shape: 'line',
      color: '#93c5fd',
      duration: 0.4,
      warningFlash: false,
    },
    moveDuringCast: false,
  },

  void_zone: {
    id: 'void_zone',
    name: 'Void Zone',
    cooldown: 7,
    castTime: 1.0,
    activationRange: 300,
    targeting: 'player',
    damageMultiplier: 0.4,
    damageType: 'magic',
    radius: 60,
    telegraph: {
      shape: 'circle',
      color: '#7c3aed',
      duration: 1.0,
      warningFlash: true,
    },
    moveDuringCast: false,
  },
};

/**
 * Look up a monster ability definition by ID.
 */
export function getMonsterAbility(id: string): MonsterAbilityDef | undefined {
  return MONSTER_ABILITIES[id];
}
