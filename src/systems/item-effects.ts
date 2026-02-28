// ============================================================================
// Item Effects System — Compute equipment stat bonuses and legendary effects
// ============================================================================

import type {
  AffixInstance,
  EquipmentSlot,
} from '@/core/types';
import { getPlayer } from '@/core/game-state';
import { AFFIXES } from '@/data/affixes.data';

// --- Stat bonus container ---

/**
 * All stat bonuses derived from equipment.
 * Keys correspond to the `stat` field in AffixDefinition.
 * Flat bonuses are added to base stats.
 * Percent bonuses are applied as multipliers after flat bonuses.
 */
export interface EquipmentStatBonuses {
  // Flat offensive
  attack: number;
  magicPower: number;

  // Percent/additive offensive
  critChance: number;
  critDamage: number;
  attackSpeed: number;
  armorPen: number;

  // Flat defensive
  maxHP: number;
  defense: number;

  // Percent defensive
  hpRegen: number;
  dodgeChance: number;
  damageReduction: number;

  // Utility
  moveSpeed: number;
  energyRegen: number;
  goldFind: number;
  xpBonus: number;

  // Status chances
  bleedChance: number;
  poisonChance: number;
  burnChance: number;
  slowChance: number;
  freezeChance: number;

  // Status potency
  bleedPotency: number;
  poisonPotency: number;
  burnPotency: number;
  slowPotency: number;
  freezePotency: number;

  // Skill power (category damage boosts)
  skillPowerDmg: number;
  skillSpeedDmg: number;
  skillCritDmg: number;
  skillMageDmg: number;
  skillUtilityDmg: number;

  // Skill levels
  skillPowerLevel: number;
  skillSpeedLevel: number;
  skillCritLevel: number;
  skillMageLevel: number;
  skillUtilityLevel: number;
  skillAllLevel: number;

  // Legendary effect IDs currently active
  legendaryEffects: string[];
}

/**
 * Create an empty stat bonuses object with all values at zero.
 */
function emptyBonuses(): EquipmentStatBonuses {
  return {
    attack: 0,
    magicPower: 0,

    critChance: 0,
    critDamage: 0,
    attackSpeed: 0,
    armorPen: 0,

    maxHP: 0,
    defense: 0,

    hpRegen: 0,
    dodgeChance: 0,
    damageReduction: 0,

    moveSpeed: 0,
    energyRegen: 0,
    goldFind: 0,
    xpBonus: 0,

    bleedChance: 0,
    poisonChance: 0,
    burnChance: 0,
    slowChance: 0,
    freezeChance: 0,

    bleedPotency: 0,
    poisonPotency: 0,
    burnPotency: 0,
    slowPotency: 0,
    freezePotency: 0,

    skillPowerDmg: 0,
    skillSpeedDmg: 0,
    skillCritDmg: 0,
    skillMageDmg: 0,
    skillUtilityDmg: 0,

    skillPowerLevel: 0,
    skillSpeedLevel: 0,
    skillCritLevel: 0,
    skillMageLevel: 0,
    skillUtilityLevel: 0,
    skillAllLevel: 0,

    legendaryEffects: [],
  };
}

// --- Affix stat mapping ---

/**
 * Map an affix instance to the corresponding bonus field using
 * the AffixDefinition's `stat` property. Adds its value to the
 * appropriate field in the bonuses object.
 */
function applyAffixToBonus(
  bonuses: EquipmentStatBonuses,
  affix: AffixInstance,
): void {
  // Look up the affix definition to get the stat it modifies
  const def = AFFIXES[affix.id];
  if (!def) return;

  const stat = def.stat;
  const { value } = affix;

  // Map the stat string to the bonuses field
  if (stat in bonuses && stat !== 'legendaryEffects') {
    (bonuses as unknown as Record<string, number>)[stat] += value;
  }
}

// --- Equipment stats computation ---

/**
 * Iterate over all equipped items and compute the total stat bonuses
 * from all affixes. Also collects active legendary effects.
 *
 * @returns aggregate stat bonuses from all equipment
 */
export function computeEquipmentStats(): EquipmentStatBonuses {
  const player = getPlayer();
  const bonuses = emptyBonuses();

  const slots: EquipmentSlot[] = [
    'weapon', 'helmet', 'chest', 'gloves', 'boots', 'accessory',
  ];

  for (const slot of slots) {
    const item = player.equipment[slot];
    if (!item) continue;

    // Sum all affix bonuses
    for (const affix of item.affixes) {
      applyAffixToBonus(bonuses, affix);
    }

    // Track legendary effects
    if (item.legendaryEffect) {
      bonuses.legendaryEffects.push(item.legendaryEffect);
    }
  }

  return bonuses;
}

/**
 * Apply the computed equipment stat bonuses to the player's computed stats.
 * This is called by the player system whenever equipment changes.
 *
 * The player system is responsible for:
 * 1. Computing base stats from level
 * 2. Calling computeEquipmentStats()
 * 3. Calling applyBonusesToPlayer() with the result
 * 4. Adding skill/buff bonuses on top
 *
 * @param bonuses - the bonuses computed from equipment
 */
export function applyBonusesToPlayer(bonuses: EquipmentStatBonuses): void {
  const player = getPlayer();

  // Attack: base + flat equipment bonus
  player.attack = Math.floor(player.baseAttack + bonuses.attack);

  // Magic power: base + flat equipment bonus
  player.magicPower = Math.floor(player.baseMagicPower + bonuses.magicPower);

  // Max HP: base + flat equipment bonus
  player.maxHP = Math.floor(player.maxHP + bonuses.maxHP);

  // Defense: base + flat equipment bonus
  player.defense = Math.floor(player.baseDefense + bonuses.defense);

  // Crit chance: base + equipment (additive)
  player.critChance = player.baseCritChance + bonuses.critChance;

  // Crit damage: base + equipment (additive)
  player.critDamage = player.baseCritDamage + bonuses.critDamage;

  // Attack speed: base + equipment (additive)
  player.attackSpeed = player.baseAttackSpeed + bonuses.attackSpeed;

  // Move speed: base * (1 + equipment bonus)
  player.moveSpeed = Math.floor(player.baseMoveSpeed * (1 + bonuses.moveSpeed));

  // Status chances: directly from equipment
  player.bleedChance = bonuses.bleedChance;
  player.poisonChance = bonuses.poisonChance;
  player.burnChance = bonuses.burnChance;
  player.slowChance = bonuses.slowChance;
  player.freezeChance = bonuses.freezeChance;

  // Status potency: 1.0 base + sum of all potency bonuses
  player.statusPotency = 1.0
    + bonuses.bleedPotency
    + bonuses.poisonPotency
    + bonuses.burnPotency
    + bonuses.slowPotency
    + bonuses.freezePotency;

  // Clamp current HP/energy to max
  player.currentHP = Math.min(player.currentHP, player.maxHP);
  player.currentEnergy = Math.min(player.currentEnergy, player.maxEnergy);
}

/**
 * Check if a specific legendary effect is currently active
 * (i.e., the legendary item providing it is equipped).
 *
 * @param effectId - the legendary effect identifier
 * @returns true if the effect is active
 */
export function isLegendaryEffectActive(effectId: string): boolean {
  const player = getPlayer();
  const slots: EquipmentSlot[] = [
    'weapon', 'helmet', 'chest', 'gloves', 'boots', 'accessory',
  ];

  for (const slot of slots) {
    const item = player.equipment[slot];
    if (item?.legendaryEffect === effectId) return true;
  }

  return false;
}

/**
 * Get all currently active legendary effect IDs.
 */
export function getActiveLegendaryEffects(): string[] {
  const effects: string[] = [];
  const player = getPlayer();
  const slots: EquipmentSlot[] = [
    'weapon', 'helmet', 'chest', 'gloves', 'boots', 'accessory',
  ];

  for (const slot of slots) {
    const item = player.equipment[slot];
    if (item?.legendaryEffect) {
      effects.push(item.legendaryEffect);
    }
  }

  return effects;
}

// --- Lifecycle ---

export function init(): void {
  // Item effects are computed on demand, no initialization needed.
}

export function update(_dt: number): void {
  // Item effects are recomputed when equipment changes (event-driven).
}
