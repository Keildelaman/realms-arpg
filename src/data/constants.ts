// ============================================================================
// Game Constants — All tuning numbers in one place
// ============================================================================

import type { EquipmentSlot, AffixCategory, Rarity } from '@/core/types';

// --- Display ---
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
export const PIXEL_ART = true;

// --- Player Base Stats ---
export const BASE_PLAYER_HP = 100;
export const HP_PER_LEVEL = 12;
export const BASE_PLAYER_ATTACK = 14;
export const ATTACK_PER_LEVEL = 2;
export const BASE_PLAYER_DEFENSE = 3;
export const DEFENSE_PER_LEVEL = 0.8;
export const BASE_PLAYER_MAGIC_RESIST = 0;
export const MAGIC_RESIST_PER_LEVEL = 0.8;
export const BASE_PLAYER_MAGIC_POWER = 5;
export const MAGIC_POWER_PER_LEVEL = 1.5;
export const BASE_CRIT_CHANCE = 0.05;
export const BASE_CRIT_DAMAGE = 2.0;
export const BASE_MOVE_SPEED = 180;     // pixels/sec
export const BASE_ATTACK_SPEED = 1.0;   // attacks/sec

// --- Player Movement ---
export const DASH_SPEED = 500;
export const DASH_DURATION = 0.15;
export const DASH_COOLDOWN = 1.0;
export const DASH_IFRAME_DURATION = 0.15;
export const PLAYER_SIZE = 32;

// --- Energy ---
export const MAX_ENERGY = 100;
export const ENERGY_REGEN_PER_SECOND = 2;
export const ENERGY_ON_KILL = 8;
export const ENERGY_ON_BOSS_KILL = 25;
export const ENERGY_ON_CRIT = 2;

// --- Combat Math ---
export const MIN_DAMAGE = 1;
export const DEFENSE_CONSTANT = 100; // defense / (defense + DEFENSE_CONSTANT) = reduction
export const KNOCKBACK_FORCE = 120;
export const KNOCKBACK_DURATION = 0.15;
export const KNOCKBACK_DISTANCE = 15;      // pixels pushed on hit
export const HIT_FLASH_DURATION = 0.1;
export const INVULNERABILITY_AFTER_HIT = 0.3; // seconds player is invulnerable after taking damage

// --- Progression ---
export const BASE_XP_REQUIREMENT = 80;
export const XP_GROWTH_RATE = 1.12;      // 12% more XP per level
export const SP_EVERY_N_LEVELS = 3;
export const MAX_SKILL_LEVEL = 5;
export const MAX_LEVEL = 100;

// --- Skills ---
export const ACTIVE_SKILL_SLOTS = 4;
export const PASSIVE_SKILL_SLOTS = 2;
export const COOLDOWN_FLOOR_PERCENT = 0.5; // min CD = 50% of base
export const MAX_RESPECS_PER_SESSION = 3;

// --- Items ---
export const INVENTORY_SIZE = 24;
export const EQUIPMENT_SLOTS: readonly string[] = [
  'weapon', 'helmet', 'chest', 'gloves', 'boots', 'accessory',
] as const;

// Max affix count per rarity (fixed). Use RARITY_MAX_MINUS_ONE_CHANCE
// to determine when to roll (max - 1) instead.
export const RARITY_AFFIX_COUNTS: Record<Rarity, number> = {
  common:    1,
  uncommon:  2,
  rare:      3,
  epic:      4,
  legendary: 4,
};

// Probability of rolling (max - 1) affixes instead of max, per rarity
export const RARITY_MAX_MINUS_ONE_CHANCE: Partial<Record<Rarity, number>> = {
  uncommon: 0.40,
  rare:     0.50,
  epic:     0.60,
};

export const RARITY_WEIGHTS: Record<string, number> = {
  common:    55,
  uncommon:  30,
  rare:      12,
  epic:      2.8,
  legendary: 0.2,
};

export const RARITY_COLORS: Record<string, string> = {
  common:    '#b0b0b0',
  uncommon:  '#4ade80',
  rare:      '#60a5fa',
  epic:      '#c084fc',
  legendary: '#fbbf24',
};

export const TIER_FLAT_MULTIPLIERS = [0, 1.0, 2.0, 3.8, 6.5, 11.0, 18.0, 30.0];
export const TIER_PERCENT_MULTIPLIERS = [0, 1.0, 1.3, 1.7, 2.2, 2.8, 3.6, 4.5];

// --- Item Crafting ---
export const REFORGE_BASE_COST = 100;
export const REFORGE_COST_MULTIPLIER = 2.2;
export const IMBUE_BASE_COST = 500;
export const TEMPER_BASE_COST = 200;
export const TEMPER_LEVELS_PER_CYCLE = 4;
export const TEMPER_MAX_CYCLES = 3;
export const TEMPER_BONUSES = [0.05, 0.07, 0.10]; // per cycle

// --- Economy ---
export const SHOP_SIZE = 6;
export const SHOP_REFRESH_BASE_COST = 200;
export const SHOP_REFRESH_COST_MULTIPLIER = 1.5;
export const SELL_PRICE_RATIO = 0.3;

// --- Loot ---
export const LOOT_MAGNET_RANGE = 80;     // pixels — auto-pickup radius
export const LOOT_DESPAWN_TIME = 30;      // seconds before loot disappears
export const LOOT_DROP_SPREAD = 40;       // pixels — random spread on drop
export const LOOT_PICKUP_IMMUNITY_TIME = 0.35; // seconds items are immune to pickup after spawning
export const BOSS_GUARANTEED_RARE = true;
export const BOSS_SECOND_DROP_CHANCE = 0.4;

// --- Monster General ---
export const MONSTER_SPAWN_INTERVAL = 2.0;   // seconds between spawns
export const MAX_MONSTERS_PER_ZONE = 15;
export const MONSTER_DESPAWN_RANGE = 1200;   // pixels from player
export const MONSTER_SPAWN_RANGE_MIN = 400;  // min spawn distance from player
export const MONSTER_SPAWN_RANGE_MAX = 800;  // max spawn distance from player
export const DEATH_ANIMATION_DURATION = 0.4; // seconds

// --- Monster Type Constants ---
export const SWIFT_ESCAPE_THRESHOLD = 0.3;   // flee below 30% HP
export const SWIFT_ESCAPE_SPEED_MULT = 1.8;
export const AGGRESSIVE_WINDUP_DEFAULT = 0.8;  // seconds telegraph
export const DEFAULT_WINDUP_DURATION = 0.4;    // seconds — non-aggressive monster windup
export const AGGRESSIVE_DAMAGE_MULT = 1.5;
export const REGEN_RATE_DEFAULT = 0.03;        // 3% maxHP/sec
export const ARMOR_DEFAULT = 10;
export const SHIELD_PERCENT_DEFAULT = 0.3;     // 30% of max HP

// --- Monster Rarity ---
export const MONSTER_MAGIC_BASE_CHANCE = 0.12;
export const MONSTER_RARE_BASE_CHANCE = 0.03;
export const MONSTER_RARITY_TIER_SCALING = 0.015;

// --- Monster Rarity Stat Scaling ---
export const MAGIC_HP_MULT = 1.5;
export const MAGIC_DAMAGE_MULT = 1.2;
export const MAGIC_DEFENSE_MULT = 1.2;
export const MAGIC_XP_MULT = 2.0;
export const MAGIC_GOLD_MULT = 2.0;
export const MAGIC_DROP_CHANCE_MULT = 2.0;
export const MAGIC_DROP_RARITY_BOOST = 1;
export const MAGIC_AFFIX_COUNT = 1;

export const RARE_HP_MULT = 3.0;
export const RARE_DAMAGE_MULT = 1.8;
export const RARE_DEFENSE_MULT = 1.5;
export const RARE_XP_MULT = 5.0;
export const RARE_GOLD_MULT = 5.0;
export const RARE_DROP_CHANCE_MULT = 4.0;
export const RARE_DROP_RARITY_BOOST = 2;
export const RARE_AFFIX_COUNT_MIN = 2;
export const RARE_AFFIX_COUNT_MAX = 3;
export const RARE_MINION_COUNT_MIN = 2;
export const RARE_MINION_COUNT_MAX = 4;
export const RARE_MINION_SPAWN_RADIUS = 80;

// --- Archetype Defaults ---
export const RANGED_DEFAULT_PREFERRED_RANGE = 250;
export const RANGED_RETREAT_THRESHOLD_RATIO = 0.5;
export const RANGED_DEFAULT_RETREAT_SPEED_RATIO = 0.7;

export const CASTER_DEFAULT_PREFERRED_RANGE = 280;
export const CASTER_DEFAULT_RETREAT_SPEED_RATIO = 0.6;

export const CHARGER_DEFAULT_WINDUP = 0.8;
export const CHARGER_DEFAULT_SPEED = 500;
export const CHARGER_DEFAULT_DAMAGE_MULT = 2.0;
export const CHARGER_DEFAULT_DISTANCE = 350;
export const CHARGER_ACTIVATION_RANGE = 350;
export const CHARGER_COOLDOWN = 4.0;
export const CHARGER_RECOVERY_DURATION = 1.0;

export const EXPLODER_DEFAULT_FUSE_TIME = 1.2;
export const EXPLODER_DEFAULT_RADIUS = 80;
export const EXPLODER_DEFAULT_DAMAGE_MULT = 2.5;
export const EXPLODER_FUSE_ACTIVATION_RANGE = 60;
export const EXPLODER_DEATH_DAMAGE_RATIO = 0.5;

// --- Item Affix Generation ---

// 2-tier probability: category chosen first (per slot), then affix within category
export const SLOT_CATEGORY_WEIGHTS: Record<EquipmentSlot, Record<AffixCategory, number>> = {
  weapon:    { offensive: 45, defensive: 5,  utility: 5,  statusChance: 20, statusPotency: 15, skillPower: 5,  skillLevel: 5  },
  helmet:    { offensive: 10, defensive: 35, utility: 20, statusChance: 10, statusPotency: 10, skillPower: 10, skillLevel: 5  },
  chest:     { offensive: 5,  defensive: 50, utility: 15, statusChance: 10, statusPotency: 10, skillPower: 5,  skillLevel: 5  },
  gloves:    { offensive: 30, defensive: 10, utility: 10, statusChance: 25, statusPotency: 15, skillPower: 5,  skillLevel: 5  },
  boots:     { offensive: 5,  defensive: 20, utility: 45, statusChance: 10, statusPotency: 10, skillPower: 5,  skillLevel: 5  },
  accessory: { offensive: 15, defensive: 20, utility: 20, statusChance: 15, statusPotency: 15, skillPower: 10, skillLevel: 5  },
};

// Affix group ID sets for validation rules
export const STATUS_AFFIX_IDS = new Set([
  'bleed_chance', 'poison_chance', 'burn_chance', 'slow_chance', 'freeze_chance',
  'bleed_potency', 'poison_potency', 'burn_potency', 'slow_potency', 'freeze_potency',
]);
export const SKILL_LEVEL_AFFIX_IDS = new Set([
  'skill_power_level', 'skill_speed_level', 'skill_crit_level',
  'skill_mage_level', 'skill_utility_level', 'skill_all_level',
]);
export const SKILL_BOOST_AFFIX_IDS = new Set([
  'skill_power_boost', 'skill_speed_boost', 'skill_crit_boost',
  'skill_mage_boost', 'skill_utility_boost',
]);

// Validation limits for affix selection
export const MAX_STATUS_AFFIXES_PER_ITEM = 2;
export const MAX_SKILL_LEVEL_AFFIXES_PER_ITEM = 1;
export const AFFIX_REROLL_MAX_ATTEMPTS = 10;

// --- Affix Constants ---
export const AFFIX_TELEPORT_COOLDOWN = 5.0;
export const AFFIX_TELEPORT_RANGE = 400;
export const AFFIX_TELEPORT_OFFSET = 150;
export const AFFIX_VAMPIRIC_LEECH = 0.15;
export const AFFIX_FRENZY_AURA_RADIUS = 150;
export const AFFIX_FRENZY_DAMAGE_MULT = 1.2;
export const AFFIX_FRENZY_ATTACK_SPEED_MULT = 1.15;
export const AFFIX_FROST_NOVA_RADIUS = 100;
export const AFFIX_FROST_NOVA_SLOW_DURATION = 2.0;
export const AFFIX_FROST_NOVA_DAMAGE_MULT = 0.5;

// --- Monster Wander ---
export const MONSTER_WANDER_RADIUS = 80;
export const MONSTER_WANDER_SPEED_RATIO = 0.35;
export const MONSTER_WANDER_PAUSE_MIN = 1.5;
export const MONSTER_WANDER_PAUSE_MAX = 4.0;
export const MONSTER_WANDER_ARRIVAL_DIST = 8;

// --- Monster Projectile ---
export const MONSTER_PROJECTILE_PLAYER_KNOCKBACK = 8;

// --- Status Effects ---
export const BLEED_MAX_STACKS = 5;
export const BLEED_DURATION = 4.0;
export const BLEED_TICK_INTERVAL = 1.0;
export const BLEED_DAMAGE_PERCENT = 0.05; // 5% atk/stack/tick

export const POISON_MAX_STACKS = 10;
export const POISON_DURATION = 5.0;
export const POISON_TICK_INTERVAL = 1.0;
export const POISON_DAMAGE_PERCENT = 0.03; // 3% atk/stack/tick

export const BURN_MAX_STACKS = 1;
export const BURN_DURATION = 3.5;
export const BURN_TICK_INTERVAL = 0.5;
export const BURN_DAMAGE_PERCENT = 0.10; // 10% magicPower/tick

export const SLOW_SPEED_REDUCTION = 0.3;  // 30%
export const SLOW_DURATION = 4.0;

export const FREEZE_DURATION = 1.5;
export const FREEZE_REAPPLY_COOLDOWN = 5.0;

// --- Resonance ---
export const RESONANCE_MAX_CHARGES = 5;
export const RESONANCE_DECAY_TIME = 5;       // seconds after last charge before decay starts
export const RESONANCE_DECAY_RATE = 1;       // lose 1 charge per second during decay
export const RESONANCE_DUALITY_THRESHOLD = 3; // 3+ of each type triggers Duality
export const RESONANCE_DUALITY_DAMAGE_BONUS = 0.15; // +15% all damage

// --- Ashburst/Overload ---
export const ASHBURST_RADIUS = 120;          // pixels
export const ASHBURST_DAMAGE_MULT = 2.0;     // ×2.0 player.attack
export const OVERLOAD_RADIUS = 160;          // pixels
export const OVERLOAD_DAMAGE_MULT = 2.5;     // ×2.5 player.magicPower

// --- Player States ---
export const FLOW_HIT_THRESHOLD = 4;         // consecutive hits to enter Flow
export const FLOW_HIT_WINDOW = 2.0;          // seconds between hits before counter resets
export const FLOW_SPEED_BONUS = 0.08;        // +8% move/attack speed
export const WRATH_HP_THRESHOLD = 0.35;      // <35% HP triggers Wrath
export const WRATH_DAMAGE_BONUS = 0.20;      // +20% all damage
export const PRIMED_DAMAGE_BONUS = 0.25;     // +25% next hit damage

// --- Enemy States ---
export const SUNDERED_DEFENSE_REDUCTION = 0.20; // -20% defense
export const SUNDERED_DURATION = 4.0;
export const CHARGED_MR_REDUCTION = 0.20;       // -20% magicResist per stack
export const CHARGED_MAX_STACKS = 3;
export const CHARGED_DURATION = 4.0;
export const STAGGERED_DURATION = 0.4;          // 0.4s guaranteed crit window
export const PRIMED_DURATION = 8.0;               // seconds before Primed auto-expires

// --- Passive Tuning ---
export const RHYTHM_HIT_THRESHOLD = 3;
export const RHYTHM_MAX_BONUS = 0.25;
export const RHYTHM_BONUS_PER_HIT = 0.05;
export const RHYTHM_TIMEOUT = 2.0;
export const ARCANE_RECURSION_CDR = 0.5;
export const BLOOD_PRICE_HP_CHUNK = 0.05;
export const BLOOD_PRICE_WRATH_STACK = 0.05;
export const BLOOD_PRICE_WRATH_CAP = 0.35;
export const BLOOD_PRICE_PANIC_THRESHOLD = 0.15;
export const SHADOW_REFLEXES_HITS = 2;
export const SHADOW_REFLEXES_DAMAGE_BONUS = 0.20;
export const SHADOW_REFLEXES_DURATION = 3.0;
export const SHADOW_REFLEXES_PANIC_WINDOW = 0.5;
export const SHADOW_REFLEXES_PANIC_CDR = 2.0;
export const FLOW_STATE_ENERGY_RESTORE = 8;
export const FLOW_STATE_RELEASE_DAMAGE_BONUS = 0.30;
export const FLOW_STATE_RELEASE_RADIUS_BONUS = 0.20;

// --- Shadow Step Upgrade Constants ---
export const SHADOW_TRAIL_TICK_INTERVAL = 0.5;  // seconds between trail damage ticks
export const ASSASSIN_BEHIND_OFFSET = 35;        // px behind target center

// --- Environmental Zones ---
export const AFTERSHOCK_ZONE_RADIUS = 80;
export const AFTERSHOCK_ZONE_DURATION = 4.0;
export const AFTERSHOCK_ZONE_TICK_INTERVAL = 1.0;
export const AFTERSHOCK_ZONE_SLOW_PERCENT = 0.20;
export const AFTERSHOCK_ZONE_DAMAGE_PERCENT = 0.10; // 10% of player attack per tick

// --- Arcane Bolt Upgrade Constants ---
export const SEEKER_HOMING_TURN_RATE = 8.0;     // rad/sec (vs base 3.0)
export const SEEKER_HOMING_RANGE = 500;          // px detection range (vs base 300)
export const CHAIN_REACTION_BASE_DETONATION_RADIUS = 40;  // px
export const CHAIN_REACTION_RADIUS_PER_HIT = 20;          // px added per piercing hit

// --- Zones ---
export const ZONE_TRANSITION_DISTANCE = 60; // pixels from edge to trigger transition

// --- Player Visual ---
export const PLAYER_BODY_RADIUS = 14;
export const PLAYER_DIRECTION_WEDGE_ANGLE = 50; // degrees
export const PLAYER_IDLE_PULSE_MIN = 0.96;
export const PLAYER_IDLE_PULSE_MAX = 1.04;
export const PLAYER_IDLE_PULSE_SPEED = 1.8; // Hz

// --- Movement Feel ---
export const MOVE_ACCELERATION = 1400;    // px/s²
export const MOVE_DECELERATION = 2200;    // px/s² — snappier stop
export const MOVE_STRETCH_FACTOR = 0.08;
export const MOVE_LEAN_ANGLE = 6;         // degrees (unused for now)
export const MOVE_TRAIL_SPEED_THRESHOLD = 120; // px/s before dust spawns
export const MOVE_TRAIL_FREQUENCY = 0.04; // seconds between dust particles
export const MOVE_SQUASH_ON_STOP = 0.06;
export const MOVE_SQUASH_DURATION = 0.1;  // seconds

// --- Attack Animation ---
export const ATTACK_ARC_FILL_ALPHA = 0.35;
export const ATTACK_ARC_THICKNESS = 8;
export const ATTACK_ARC_INNER_RATIO = 0.45;
export const ATTACK_ARC_FADE_DURATION = 180;        // ms

// --- Hit Impact ---
export const HIT_STOP_BASE = 0.05;            // seconds
export const HIT_STOP_CRIT_BONUS = 0.03;      // seconds added on crit
export const HIT_STOP_DAMAGE_SCALE = 0.0005;  // seconds per damage point
export const HIT_STOP_MAX = 0.12;             // seconds cap
export const SCREEN_SHAKE_HIT_DURATION = 80;   // ms
export const SCREEN_SHAKE_HIT_INTENSITY = 0.003;
export const SCREEN_SHAKE_CRIT_DURATION = 120; // ms
export const SCREEN_SHAKE_CRIT_INTENSITY = 0.006;
export const IMPACT_PARTICLE_COUNT = 6;
export const IMPACT_PARTICLE_CRIT_COUNT = 12;
export const IMPACT_PARTICLE_SPEED = 200;      // px/s
export const IMPACT_PARTICLE_LIFESPAN = 350;   // ms
export const IMPACT_PARTICLE_SIZE = 3;         // radius

// --- Knockback (upgraded) ---
export const KNOCKBACK_DISTANCE_BASE = 25;     // pixels (up from 15)
export const KNOCKBACK_CRIT_MULTIPLIER = 1.5;
export const KNOCKBACK_TWEEN_DURATION = 150;   // ms

// --- Whiff ---
export const WHIFF_ARC_ALPHA = 0.15;
export const WHIFF_ARC_FADE_DURATION = 120;    // ms

// --- Camera ---
export const CAMERA_LERP = 0.1;
export const SCREEN_SHAKE_DURATION = 0.1;
export const SCREEN_SHAKE_INTENSITY = 4;

// --- Death ---
export const DEATH_GOLD_LOSS_PERCENT = 0.5;
export const DEATH_RESPAWN_DELAY = 1.5;
export const MILESTONE_INTERVAL = 10; // reset to nearest multiple

// --- Ascension ---
export const ASCENSION_DAMAGE_BONUS = 0.05;
export const ASCENSION_GOLD_BONUS = 0.05;
export const ASCENSION_XP_BONUS = 0.05;

// --- Stash ---
export const STASH_TAB_SIZE  = 24;    // 4×6 grid, same as inventory
export const STASH_MAX_TABS  = 8;
export const STASH_FREE_TABS = 3;
// Cost to buy tabs 4–8:
export const STASH_TAB_COSTS = [2000, 5000, 10000, 20000, 35000];

// --- UI ---
export const DAMAGE_NUMBER_DURATION = 0.8;
export const DAMAGE_NUMBER_RISE_SPEED = 60;
export const DAMAGE_NUMBER_CRIT_SCALE = 1.5;

// --- Resonance Mote Visuals ---
export const MOTE_ORBIT_RADIUS = 18;
export const MOTE_BASE_SPEED = 2.5;
export const MOTE_MAX_SPEED_MULT = 1.5;
export const MOTE_SIZE = 3;
export const MOTE_GLOW_SIZE = 5;

// --- Skill Camera Shake ---
export const SHAKE_HEAVY_SLASH_DURATION = 200;
export const SHAKE_HEAVY_SLASH_INTENSITY = 0.002;
export const SHAKE_HEAVY_SLASH_CRIT_DURATION = 300;
export const SHAKE_HEAVY_SLASH_CRIT_INTENSITY = 0.005;
export const SHAKE_PLAYER_HIT_DURATION = 250;
export const SHAKE_PLAYER_HIT_INTENSITY = 0.004;

// --- Death VFX ---
export const DEATH_BURST_PARTICLE_COUNT = 16;
export const DEATH_BURST_SPEED = 120;
export const DEATH_BURST_DURATION = 300;
export const DEATH_BURST_SHAKE_DURATION = 100;
export const DEATH_BURST_SHAKE_INTENSITY = 0.002;

// --- Colors ---
export const COLORS = {
  playerHP: '#ef4444',
  playerHPBg: '#450a0a',
  playerEnergy: '#3b82f6',
  playerEnergyBg: '#172554',
  xpBar: '#a855f7',
  xpBarBg: '#2e1065',
  shield: '#60a5fa',
  gold: '#fbbf24',

  physical: '#f97316',
  magic: '#a855f7',
  heal: '#4ade80',
  crit: '#fbbf24',

  bleed: '#dc2626',
  poison: '#16a34a',
  burn: '#f97316',
  slow: '#60a5fa',
  freeze: '#93c5fd',

  monsterHP: '#ef4444',
  monsterHPBg: '#1a1a1a',
  monsterShield: '#60a5fa',

  uiBg: 'rgba(0, 0, 0, 0.7)',
  uiBorder: '#333333',
  uiText: '#e5e5e5',
  uiTextDim: '#888888',
} as const;
