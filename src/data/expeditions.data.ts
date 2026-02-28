// ============================================================================
// Expeditions Data -- runtime tuning values
// ============================================================================

import type { RoomType } from '@/core/types';

export const EXPEDITION_OBJECTIVE = 'extermination' as const;

export const ROOM_COUNT_BY_TIER: Record<number, [number, number]> = {
  1: [4, 5],
  2: [5, 6],
  3: [5, 6],
  4: [6, 7],
  5: [6, 7],
  6: [7, 8],
  7: [7, 8],
};

export const MAP_GEN_MAX_ATTEMPTS = 32;
export const MAP_GEN_NEIGHBOR_LINKS = 3;
export const MAP_GEN_EXTRA_LOOP_EDGE_RATIO = 0.28;
export const MAP_GEN_MIN_MAIN_PATH_RATIO = 0.45;
export const MAP_GEN_MIN_LOOPS = 1;
export const MAP_GEN_DEAD_END_RATIO_RANGE: [number, number] = [0.15, 0.65];
export const MAP_GEN_LAYOUT_MARGIN = 200;
export const MAP_GEN_NODE_COUNT_BONUS_MIN = 12;
export const MAP_GEN_NODE_COUNT_BONUS_MAX = 20;
export const MAP_GEN_NODE_RADIUS_BASE = 240;
export const MAP_GEN_NODE_RADIUS_TIER_BONUS = 14;
export const MAP_GEN_STEP_MIN = 380;
export const MAP_GEN_STEP_MAX = 620;
export const MAP_GEN_STEP_TIER_BONUS = 34;

export const EXPEDITION_GRID_CELL_SIZE = 32;
export const EXPEDITION_WALL_MIN_RECT_CELLS = 1;

export const ROOM_TYPE_WEIGHTS: Array<{ type: RoomType; weight: number }> = [
  { type: 'combat', weight: 82 },
  { type: 'elite', weight: 13 },
  { type: 'treasure', weight: 5 },
];

export const BASE_SPAWNS_PER_COMBAT_ROOM = 4;
export const BASE_SPAWNS_PER_ELITE_ROOM = 6;
export const SPAWN_TIER_SCALAR_STEP = 0.12;
export const MIN_SPAWNS_PER_ROOM = 3;

export const EXPEDITION_START_SAFE_RADIUS = 420;

export const EXPEDITION_MAX_PORTALS = 3;
export const RESPAWN_INVULNERABILITY_SECONDS = 2.0;
export const PLAYER_RESPAWN_FULL_HEAL = true;
export const PLAYER_RESPAWN_FULL_ENERGY = true;

export const COMPLETION_XP_BY_TIER = [0, 80, 170, 320, 560, 900, 1350, 2000] as const;
export const COMPLETION_GOLD_BY_TIER = [0, 120, 260, 470, 760, 1150, 1650, 2400] as const;
export const COMPLETION_CHEST_COUNT_BY_TIER = [0, 1, 1, 1, 1, 2, 2, 2] as const;

export const FIRST_CLEAR_XP_MULT = 0.5;
export const FIRST_CLEAR_GOLD_MULT = 0.5;

export const EXPEDITION_TOTAL_BUDGET_MULT = 1.2;
export const EXPEDITION_PACK_SIZE_MULT = 1.18;
export const EXPEDITION_CHECKPOINT_KILL_INTERVAL_MULT = 1.15;

export function clampTier(tier: number): number {
  return Math.max(1, Math.min(7, Math.floor(tier)));
}

export function getTierRange(
  table: Record<number, [number, number]>,
  tier: number,
  fallback: [number, number],
): [number, number] {
  return table[clampTier(tier)] ?? fallback;
}
