// ============================================================================
// Legendaries Data — 15 hand-crafted legendary items
// Adapted from clicker's legendary definitions for spatial ARPG.
// ============================================================================

import type { LegendaryDefinition } from '@/core/types';

// ============================================================================
// LEGENDARY DEFINITIONS
// ============================================================================

export const LEGENDARIES: Record<string, LegendaryDefinition> = {

  // --- Zone 1: Whisperwood (2) ---

  whisperwood_heart: {
    id: 'whisperwood_heart',
    name: 'Whisperwood Heart',
    slot: 'accessory',
    description: 'Energy regen doubled while below 30% HP.',
    effectId: 'energy_regen_low_hp',
    baseAffixes: ['energy_regen', 'flat_max_hp'],
    color: '#4ade80',
  },

  thornweave_wraps: {
    id: 'thornweave_wraps',
    name: 'Thornweave Wraps',
    slot: 'gloves',
    description: 'Bleed stacks deal 50% bonus damage to slowed targets.',
    effectId: 'bleed_bonus_vs_slowed',
    baseAffixes: ['bleed_chance', 'bleed_potency'],
    color: '#22c55e',
  },

  // --- Zone 2: Dusthaven (2) ---

  sandstorm_fang: {
    id: 'sandstorm_fang',
    name: 'Sandstorm Fang',
    slot: 'weapon',
    description: 'Attacks hit twice at 60% damage each.',
    effectId: 'double_hit',
    baseAffixes: ['flat_attack', 'attack_speed'],
    color: '#f59e0b',
  },

  mirage_band: {
    id: 'mirage_band',
    name: 'Mirage Band',
    slot: 'accessory',
    description: '20% chance to dodge monster attacks entirely.',
    effectId: 'dodge_chance',
    baseAffixes: ['dodge_chance', 'move_speed'],
    color: '#fbbf24',
  },

  // --- Zone 3: Frosthollow (2) ---

  venom_lords_grip: {
    id: 'venom_lords_grip',
    name: "Venom Lord's Grip",
    slot: 'gloves',
    description: 'Poison stacks have no maximum limit.',
    effectId: 'unlimited_poison_stacks',
    baseAffixes: ['poison_chance', 'poison_potency'],
    color: '#16a34a',
  },

  shadowmire_cowl: {
    id: 'shadowmire_cowl',
    name: 'Shadowmire Cowl',
    slot: 'helmet',
    description: 'Status effect durations on monsters increased by 40%.',
    effectId: 'status_duration_bonus',
    baseAffixes: ['slow_chance', 'freeze_chance'],
    color: '#065f46',
  },

  // --- Zone 4: Emberpeak (2) ---

  ironforge_crown: {
    id: 'ironforge_crown',
    name: 'Ironforge Crown',
    slot: 'helmet',
    description: 'Defense also applies as 50% Magic Resist.',
    effectId: 'armor_to_magic_resist',
    baseAffixes: ['flat_defense', 'flat_max_hp'],
    color: '#a8a29e',
  },

  titans_greaves: {
    id: 'titans_greaves',
    name: "Titan's Greaves",
    slot: 'boots',
    description: 'While above 80% HP, gain 25% bonus damage.',
    effectId: 'high_hp_damage_bonus',
    baseAffixes: ['flat_max_hp', 'move_speed'],
    color: '#78716c',
  },

  // --- Zone 5: Shadowmere (2) ---

  embercallers_staff: {
    id: 'embercallers_staff',
    name: "Embercaller's Staff",
    slot: 'weapon',
    description: 'Burn damage can critically strike.',
    effectId: 'burn_can_crit',
    baseAffixes: ['flat_magic_power', 'burn_chance'],
    color: '#f97316',
  },

  ashen_plate: {
    id: 'ashen_plate',
    name: 'Ashen Plate',
    slot: 'chest',
    description: 'Taking fire damage heals instead of harming.',
    effectId: 'fire_damage_heals',
    baseAffixes: ['flat_defense', 'damage_reduction'],
    color: '#ea580c',
  },

  // --- Zone 6: Crystalspire (2) ---

  frostbite_edge: {
    id: 'frostbite_edge',
    name: 'Frostbite Edge',
    slot: 'weapon',
    description: 'Critical hits freeze the target for 0.5 seconds.',
    effectId: 'crit_freeze',
    baseAffixes: ['flat_attack', 'crit_chance'],
    color: '#0ea5e9',
  },

  glacial_mantle: {
    id: 'glacial_mantle',
    name: 'Glacial Mantle',
    slot: 'chest',
    description: 'Gain a shield that regenerates 5% per second while not taking damage.',
    effectId: 'shield_regen_idle',
    baseAffixes: ['flat_defense', 'flat_max_hp'],
    color: '#38bdf8',
  },

  // --- Zone 7: Void Rift (3) ---

  crown_of_the_void_king: {
    id: 'crown_of_the_void_king',
    name: 'Crown of the Void King',
    slot: 'helmet',
    description: 'Kills have 10% chance to fully restore shield.',
    effectId: 'kill_restore_shield',
    baseAffixes: ['flat_max_hp', 'flat_defense'],
    color: '#7c3aed',
  },

  soulreaver: {
    id: 'soulreaver',
    name: 'Soulreaver',
    slot: 'weapon',
    description: '5% of damage dealt is gained as a temporary shield.',
    effectId: 'damage_to_shield',
    baseAffixes: ['flat_attack', 'crit_damage'],
    color: '#a855f7',
  },

  void_eternal: {
    id: 'void_eternal',
    name: 'Void Eternal',
    slot: 'accessory',
    description: 'All skill cooldowns reduced by 1 second on kill.',
    effectId: 'kill_reduce_cooldowns',
    baseAffixes: ['energy_regen', 'xp_bonus'],
    color: '#6d28d9',
  },
};
