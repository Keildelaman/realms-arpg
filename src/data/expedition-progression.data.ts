import type { ObjectiveType, Rarity } from '@/core/types';
import { ZONES, ZONE_ORDER } from '@/data/zones.data';
import { clampTier, EXPEDITION_BOSS_GATE_TIER } from '@/data/expeditions.data';

export function getOrderedExpeditionZones(): string[] {
  return ZONE_ORDER.filter(zoneId => !!ZONES[zoneId]);
}

export function getZoneIndex(zoneId: string): number {
  const ordered = getOrderedExpeditionZones();
  const idx = ordered.indexOf(zoneId);
  return idx >= 0 ? idx : 0;
}

export function getNextZoneId(zoneId: string): string | null {
  const ordered = getOrderedExpeditionZones();
  const idx = ordered.indexOf(zoneId);
  if (idx < 0 || idx >= ordered.length - 1) return null;
  return ordered[idx + 1];
}

export function isBossGateTier(tier: number): boolean {
  return clampTier(tier) >= EXPEDITION_BOSS_GATE_TIER;
}

export function getObjectiveForTier(tier: number): ObjectiveType {
  return isBossGateTier(tier) ? 'boss_hunt' : 'extermination';
}

export function getExpeditionMonsterLevel(zoneId: string, tier: number, progressRatio: number): number {
  const clampedTier = clampTier(tier);
  const zone = ZONES[zoneId];
  const zoneBaseLevel = zone?.levelRange[0] ?? 1 + getZoneIndex(zoneId) * 10;
  const tierComponent = (clampedTier - 1) * 2;
  const progressComponent = Math.floor(Math.max(0, Math.min(1, progressRatio)) * 2);
  return Math.max(1, zoneBaseLevel + tierComponent + progressComponent);
}

export function getExpeditionTotalBudget(zoneId: string, tier: number): number {
  const clampedTier = clampTier(tier);
  const zoneIndex = getZoneIndex(zoneId);
  const baseByTier = [0, 10, 18, 26, 34, 43, 53, 64, 76, 89, 103] as const;
  const zoneBonusByIndex = [0, 8, 16, 24, 32, 40, 50] as const;

  const tierBase = baseByTier[clampedTier] ?? 43;
  const zoneBonus = zoneBonusByIndex[Math.max(0, Math.min(zoneBonusByIndex.length - 1, zoneIndex))] ?? 0;
  const budget = Math.min(160, tierBase + zoneBonus);

  // Boss gate runs remain denser than tutorial/mid tiers, but should still be
  // shorter than full extermination maps because the objective is the boss.
  if (isBossGateTier(clampedTier)) {
    return Math.max(42, Math.round(budget * 0.72));
  }
  return Math.max(10, budget);
}

export function getExpeditionPackSizeMultiplier(tier: number): number {
  const clampedTier = clampTier(tier);
  return 1 + (clampedTier - 1) * 0.025;
}

export function getExpeditionMapSizeScale(zoneId: string, tier: number): number {
  const clampedTier = clampTier(tier);
  const zoneIndex = getZoneIndex(zoneId);

  const tierScale = [0, 0.52, 0.60, 0.68, 0.76, 0.86, 0.96, 1.05, 1.15, 1.24, 1.32] as const;
  const zoneBonus = [0, 0.02, 0.04, 0.06, 0.08, 0.10, 0.12] as const;

  const t = tierScale[clampedTier] ?? 0.86;
  const z = zoneBonus[Math.max(0, Math.min(zoneBonus.length - 1, zoneIndex))] ?? 0;
  return Math.max(0.52, Math.min(1.40, t + z));
}

export function getExpeditionEncounterPointMinDistance(zoneId: string, tier: number): number {
  const clampedTier = clampTier(tier);
  const zoneIndex = getZoneIndex(zoneId);

  const base = 172;
  const tierReduction = (clampedTier - 1) * 3.2;
  const zoneReduction = zoneIndex * 1.7;
  return Math.round(Math.max(124, Math.min(178, base - tierReduction - zoneReduction)));
}

export function getExpeditionEncounterPointCellDivisor(zoneId: string, tier: number): number {
  const clampedTier = clampTier(tier);
  const zoneIndex = getZoneIndex(zoneId);
  const base = 56;
  const tierReduction = (clampedTier - 1) * 1.4;
  const zoneReduction = zoneIndex * 0.8;
  return Math.max(34, Math.min(58, base - tierReduction - zoneReduction));
}

export function getExpeditionEncounterPointMinCount(zoneId: string, tier: number): number {
  const budget = getExpeditionTotalBudget(zoneId, tier);
  return Math.max(12, Math.round(budget * 0.62));
}

export function getExpeditionCheckpointKillInterval(tier: number): number {
  const clampedTier = clampTier(tier);
  return Math.max(8, Math.round(16 - clampedTier * 0.8));
}

export function getExpeditionCompletionXP(zoneId: string, tier: number): number {
  const clampedTier = clampTier(tier);
  const zoneIndex = getZoneIndex(zoneId);
  return Math.round((120 + zoneIndex * 90) * (1 + 0.18 * (clampedTier - 1)));
}

export function getExpeditionCompletionGold(zoneId: string, tier: number): number {
  const clampedTier = clampTier(tier);
  const zoneIndex = getZoneIndex(zoneId);
  return Math.round((160 + zoneIndex * 110) * (1 + 0.16 * (clampedTier - 1)));
}

export function getExpeditionCompletionChestCount(tier: number): number {
  const clampedTier = clampTier(tier);
  if (clampedTier >= EXPEDITION_BOSS_GATE_TIER) return 3;
  if (clampedTier >= 5) return 2;
  return 1;
}

export function getExpeditionMapChestSpawnChance(zoneId: string, tier: number): number {
  const clampedTier = clampTier(tier);
  const zoneIndex = getZoneIndex(zoneId);

  // First tutorial map should almost never have side chests.
  if (zoneIndex === 0 && clampedTier === 1) {
    return 0;
  }

  const baseByTier = [
    0,
    0.008,
    0.011,
    0.014,
    0.018,
    0.023,
    0.028,
    0.034,
    0.041,
    0.049,
    0.058,
  ] as const;
  const zoneBonus = zoneIndex * 0.008;
  return Math.max(0, Math.min(0.2, (baseByTier[clampedTier] ?? 0.02) + zoneBonus));
}

export function getExpeditionMapChestMaxCount(zoneId: string, tier: number): number {
  const clampedTier = clampTier(tier);
  const zoneIndex = getZoneIndex(zoneId);

  if (zoneIndex === 0 && clampedTier <= 2) return 1;
  if (clampedTier >= 8) return 3;
  if (clampedTier >= 4) return 2;
  return 1;
}

export function getExpeditionChestRarityWeights(
  tier: number,
  source: 'map' | 'completion',
): Record<Rarity, number> {
  const clampedTier = clampTier(tier);
  const t = clampedTier - 1;

  if (source === 'completion') {
    return {
      common: Math.max(18, 56 - t * 3.4),
      uncommon: 30 + t * 1.8,
      rare: 10 + t * 1.25,
      epic: 3 + t * 0.55,
      legendary: 0.6 + t * 0.22,
    };
  }

  return {
    common: Math.max(36, 74 - t * 3.2),
    uncommon: 18 + t * 1.7,
    rare: 6 + t * 0.9,
    epic: 1.6 + t * 0.35,
    legendary: 0.15 + t * 0.12,
  };
}

export function getExpeditionChestDropRange(
  rarity: Rarity,
  source: 'map' | 'completion',
): [number, number] {
  if (source === 'completion') {
    if (rarity === 'legendary') return [3, 5];
    if (rarity === 'epic') return [2, 4];
    if (rarity === 'rare') return [2, 3];
    if (rarity === 'uncommon') return [1, 2];
    return [1, 2];
  }

  if (rarity === 'legendary') return [3, 4];
  if (rarity === 'epic') return [2, 3];
  if (rarity === 'rare') return [2, 2];
  if (rarity === 'uncommon') return [1, 2];
  return [1, 1];
}

export function getExpeditionChestTierBonus(rarity: Rarity, source: 'map' | 'completion'): number {
  if (rarity === 'legendary') return source === 'completion' ? 2 : 1;
  if (rarity === 'epic') return 1;
  return 0;
}
