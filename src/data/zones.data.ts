// ============================================================================
// Zones Data — 7 zones adapted from the clicker's zone definitions
// Each zone: 2400x2400 world size with zone-specific theming
// ============================================================================

import type { ZoneDefinition } from '@/core/types';

// ============================================================================
// ZONE DEFINITIONS
// ============================================================================

export const ZONES: Record<string, ZoneDefinition> = {

  // --- Zone 1: Whisperwood (Tier 1, Levels 1-10) ---
  whisperwood: {
    id: 'whisperwood',
    name: 'Whisperwood Glen',
    levelRange: [1, 10],
    monsters: [
      'whisperwood_wolf',
      'whisperwood_thorn_sprite',
      'whisperwood_mushroom_brute',
      'whisperwood_spitting_toad',
      'whisperwood_bramble_stag',
      'whisperwood_will_o_wisp',
      'whisperwood_blightpuff',
    ],
    bossId: 'boss_mossback',
    bossUnlockKills: 20,
    backgroundColor: '#1a3518',
    ambientColor: '#2d5a27',
    tier: 1,
    width: 2400,
    height: 2400,
  },

  // --- Zone 2: Dusthaven (Tier 2, Levels 10-20) ---
  dusthaven: {
    id: 'dusthaven',
    name: 'Dusthaven Plains',
    levelRange: [10, 20],
    monsters: [
      'dusthaven_dog',
      'dusthaven_scorpion',
      'dusthaven_snake',
      'dusthaven_devil',
      'dusthaven_vulture',
      'dusthaven_bandit',
      'dusthaven_raider',
      'dusthaven_stalker',
      'dusthaven_coyote',
    ],
    bossId: 'boss_redfang',
    bossUnlockKills: 40,
    backgroundColor: '#4a3a20',
    ambientColor: '#6b5530',
    tier: 2,
    unlockCondition: 'boss_mossback',
    width: 2400,
    height: 2400,
  },

  // --- Zone 3: Frosthollow (Tier 3, Levels 20-30) ---
  frosthollow: {
    id: 'frosthollow',
    name: 'Frosthollow Swamp',
    levelRange: [20, 30],
    monsters: [
      'frosthollow_crawler',
      'frosthollow_toad',
      'frosthollow_wisp',
      'frosthollow_vine',
      'frosthollow_leech',
      'frosthollow_hag',
      'frosthollow_shade',
      'frosthollow_husk',
      'frosthollow_serpent',
    ],
    bossId: 'boss_mire_mother',
    bossUnlockKills: 60,
    backgroundColor: '#1a2f3e',
    ambientColor: '#3a6575',
    tier: 3,
    unlockCondition: 'boss_redfang',
    width: 2400,
    height: 2400,
  },

  // --- Zone 4: Emberpeak (Tier 4, Levels 30-45) ---
  emberpeak: {
    id: 'emberpeak',
    name: 'Emberpeak Mines',
    levelRange: [30, 45],
    monsters: [
      'emberpeak_elemental',
      'emberpeak_spider',
      'emberpeak_bat',
      'emberpeak_sentinel',
      'emberpeak_worm',
      'emberpeak_kobold',
      'emberpeak_drake',
      'emberpeak_golem',
      'emberpeak_guardian',
    ],
    bossId: 'boss_grimstone',
    bossUnlockKills: 80,
    backgroundColor: '#4a1200',
    ambientColor: '#8b2500',
    tier: 4,
    unlockCondition: 'boss_mire_mother',
    width: 2400,
    height: 2400,
  },

  // --- Zone 5: Shadowmere (Tier 5, Levels 45-60) ---
  shadowmere: {
    id: 'shadowmere',
    name: 'Shadowmere Wastes',
    levelRange: [45, 60],
    monsters: [
      'shadowmere_hound',
      'shadowmere_slime',
      'shadowmere_imp',
      'shadowmere_cultist',
      'shadowmere_wraith',
      'shadowmere_golem',
      'shadowmere_salamander',
      'shadowmere_giant',
      'shadowmere_drake',
    ],
    bossId: 'boss_pyrax',
    bossUnlockKills: 100,
    backgroundColor: '#1a0f2e',
    ambientColor: '#2d1b4e',
    tier: 5,
    unlockCondition: 'boss_grimstone',
    width: 2400,
    height: 2400,
  },

  // --- Zone 6: Crystalspire (Tier 6, Levels 60-75) ---
  crystalspire: {
    id: 'crystalspire',
    name: 'Crystalspire Summit',
    levelRange: [60, 75],
    monsters: [
      'crystalspire_sprite',
      'crystalspire_yeti',
      'crystalspire_elemental',
      'crystalspire_prowler',
      'crystalspire_wolf',
      'crystalspire_wraith',
      'crystalspire_banshee',
      'crystalspire_giant',
      'crystalspire_wyrm',
    ],
    bossId: 'boss_glacielle',
    bossUnlockKills: 120,
    backgroundColor: '#1a3d4a',
    ambientColor: '#3a6575',
    tier: 6,
    unlockCondition: 'boss_pyrax',
    width: 2400,
    height: 2400,
  },

  // --- Zone 7: Void Rift (Tier 7, Levels 75-100) ---
  void_rift: {
    id: 'void_rift',
    name: 'The Void Rift',
    levelRange: [75, 100],
    monsters: [
      'void_rift_walker',
      'void_rift_stalker',
      'void_rift_imp',
      'void_rift_golem',
      'void_rift_leech',
      'void_rift_bender',
      'void_rift_wraith',
      'void_rift_horror',
      'void_rift_titan',
    ],
    bossId: 'boss_xaltheron',
    bossUnlockKills: 150,
    backgroundColor: '#0a0518',
    ambientColor: '#1a0f2e',
    tier: 7,
    unlockCondition: 'boss_glacielle',
    width: 2400,
    height: 2400,
  },
};

// ============================================================================
// ZONE PROGRESSION ORDER
// ============================================================================

export const ZONE_ORDER: string[] = [
  'whisperwood',
  'dusthaven',
  'frosthollow',
  'emberpeak',
  'shadowmere',
  'crystalspire',
  'void_rift',
];
