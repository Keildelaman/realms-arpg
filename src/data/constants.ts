// ============================================================================
// Game Constants — All tuning numbers in one place
// ============================================================================

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
export const BASE_PLAYER_MAGIC_POWER = 5;
export const MAGIC_POWER_PER_LEVEL = 1.5;
export const BASE_CRIT_CHANCE = 0.05;
export const BASE_CRIT_DAMAGE = 2.0;
export const BASE_MOVE_SPEED = 180;     // pixels/sec
export const BASE_ATTACK_SPEED = 1.0;   // attacks/sec
export const BASIC_ATTACK_COOLDOWN = 0.45; // seconds

// --- Player Movement ---
export const DASH_SPEED = 500;
export const DASH_DURATION = 0.15;
export const DASH_COOLDOWN = 1.0;
export const DASH_IFRAME_DURATION = 0.15;
export const PLAYER_SIZE = 32;

// --- Basic Attack ---
export const BASIC_ATTACK_ARC = 120;       // degrees
export const BASIC_ATTACK_RANGE = 80;      // pixels from center
export const BASIC_ATTACK_DAMAGE = 1.0;    // multiplier of attack stat

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
export const ACTIVE_SKILL_SLOTS = 6;
export const PASSIVE_SKILL_SLOTS = 3;
export const COOLDOWN_FLOOR_PERCENT = 0.5; // min CD = 50% of base

// --- Items ---
export const INVENTORY_SIZE = 24;
export const EQUIPMENT_SLOTS: readonly string[] = [
  'weapon', 'helmet', 'chest', 'gloves', 'boots', 'accessory',
] as const;

export const RARITY_AFFIX_COUNTS: Record<string, [number, number]> = {
  common:    [1, 1],
  uncommon:  [1, 2],
  rare:      [2, 3],
  epic:      [3, 4],
  legendary: [4, 5],
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
export const SHIELD_DAMAGE_REDUCTION = 0.5;    // 50% while shield up

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
export const ATTACK_WINDUP_DURATION = 0.065;       // seconds
export const ATTACK_SWING_DURATION = 0.08;          // seconds
export const ATTACK_FOLLOW_THROUGH_DURATION = 0.12; // seconds
export const ATTACK_PULLBACK_DISTANCE = 4;          // pixels
export const ATTACK_LUNGE_DISTANCE = 10;            // pixels
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

// --- UI ---
export const DAMAGE_NUMBER_DURATION = 0.8;
export const DAMAGE_NUMBER_RISE_SPEED = 60;
export const DAMAGE_NUMBER_CRIT_SCALE = 1.5;

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
