// ============================================================================
// Player System — Stat computation, buff management, ascension bonuses
// ============================================================================

import { on, emit } from '@/core/event-bus';
import { getPlayer } from '@/core/game-state';
import type { ItemInstance } from '@/core/types';
import {
  BASE_MOVE_SPEED,
  BASE_ATTACK_SPEED,
  BASE_CRIT_CHANCE,
  BASE_CRIT_DAMAGE,
} from '@/data/constants';
import {
  maxHPAtLevel,
  baseAttackAtLevel,
  baseDefenseAtLevel,
  baseMagicPowerAtLevel,
  ascensionBonus,
} from '@/data/balance';

// --- Buff tracking ---

interface Buff {
  id: string;
  stats: Partial<StatModifiers>;
  duration: number;     // remaining seconds (-1 = permanent until removed)
  isExpired: boolean;
}

/**
 * Stat modifiers that buffs and equipment can contribute.
 * Flat values are added; percent values are summed then multiplied.
 */
interface StatModifiers {
  flatAttack: number;
  flatDefense: number;
  flatMagicPower: number;
  flatMaxHP: number;
  flatMoveSpeed: number;
  flatCritChance: number;
  flatCritDamage: number;
  flatAttackSpeed: number;
  percentAttack: number;
  percentDefense: number;
  percentMagicPower: number;
  percentMaxHP: number;
  percentMoveSpeed: number;
  percentCritChance: number;
  percentCritDamage: number;
  percentAttackSpeed: number;
  // Status chances
  flatBleedChance: number;
  flatPoisonChance: number;
  flatBurnChance: number;
  flatSlowChance: number;
  flatFreezeChance: number;
  flatStatusPotency: number;
  // Secondary equipment stats (additive accumulation)
  flatArmorPen: number;
  flatHpRegen: number;
  flatDodgeChance: number;
  flatDamageReduction: number;
  flatEnergyRegen: number;
  flatGoldFind: number;
  flatXpBonus: number;
  // Skill boosts
  flatSkillPowerBoost: number;
  flatSkillSpeedBoost: number;
  flatSkillCritBoost: number;
  flatSkillMageBoost: number;
  flatSkillUtilityBoost: number;
  // Skill levels
  flatSkillPowerLevel: number;
  flatSkillSpeedLevel: number;
  flatSkillCritLevel: number;
  flatSkillMageLevel: number;
  flatSkillUtilityLevel: number;
  flatSkillAllLevel: number;
}

const activeBuffs: Map<string, Buff> = new Map();

// Track whether a recalc is needed this frame
let needsRecalc = false;

// --- Buff API ---

/**
 * Add a temporary buff. If a buff with the same ID already exists, it is replaced.
 *
 * @param id       - unique identifier for this buff
 * @param stats    - stat modifiers to apply
 * @param duration - seconds the buff lasts (-1 for permanent / until removed)
 */
export function addBuff(id: string, stats: Partial<StatModifiers>, duration: number): void {
  activeBuffs.set(id, {
    id,
    stats,
    duration,
    isExpired: false,
  });
  needsRecalc = true;
}

/**
 * Remove a buff by ID. Triggers recalculation.
 */
export function removeBuff(id: string): void {
  if (activeBuffs.delete(id)) {
    needsRecalc = true;
  }
}

/**
 * Check if a buff is currently active.
 */
export function hasBuff(id: string): boolean {
  return activeBuffs.has(id);
}

/**
 * Get remaining duration of a buff, or -1 if permanent, or 0 if not active.
 */
export function getBuffDuration(id: string): number {
  const buff = activeBuffs.get(id);
  if (!buff) return 0;
  return buff.duration;
}

// --- Stat computation ---

/**
 * Recalculate all player stats from scratch.
 *
 * Computation order:
 * 1. Base stats from level
 * 2. + flat equipment bonuses
 * 3. x (1 + sum of % bonuses from equipment)
 * 4. x (1 + sum of buff multipliers)
 * 5. x (1 + ascension bonus)
 */
export function recalculateStats(): void {
  const player = getPlayer();

  // --- Step 1: Base stats from level ---
  const baseMaxHP = maxHPAtLevel(player.level);
  const baseAtk = baseAttackAtLevel(player.level);
  const baseDef = baseDefenseAtLevel(player.level);
  const baseMagic = baseMagicPowerAtLevel(player.level);
  const baseCrit = BASE_CRIT_CHANCE;
  const baseCritDmg = BASE_CRIT_DAMAGE;
  const baseSpeed = BASE_MOVE_SPEED;
  const baseAtkSpeed = BASE_ATTACK_SPEED;

  // Update base stats on player
  player.baseAttack = baseAtk;
  player.baseDefense = baseDef;
  player.baseMagicPower = baseMagic;
  player.baseCritChance = baseCrit;
  player.baseCritDamage = baseCritDmg;
  player.baseMoveSpeed = baseSpeed;
  player.baseAttackSpeed = baseAtkSpeed;

  // --- Step 2 & 3: Equipment bonuses (flat + percent) ---
  const equipFlat: StatModifiers = createEmptyModifiers();
  const equipPercent: StatModifiers = createEmptyModifiers();

  const equipment = player.equipment;
  for (const slot of Object.keys(equipment) as Array<keyof typeof equipment>) {
    const item = equipment[slot];
    if (!item) continue;
    accumulateItemModifiers(item, equipFlat, equipPercent);
  }

  // After flat addition
  let hp = baseMaxHP + equipFlat.flatMaxHP;
  let atk = baseAtk + equipFlat.flatAttack;
  let def = baseDef + equipFlat.flatDefense;
  let magic = baseMagic + equipFlat.flatMagicPower;
  let crit = baseCrit + equipFlat.flatCritChance;
  let critDmg = baseCritDmg + equipFlat.flatCritDamage;
  let speed = baseSpeed + equipFlat.flatMoveSpeed;
  let atkSpeed = baseAtkSpeed + equipFlat.flatAttackSpeed;

  // Status chances from equipment
  let bleedChance = equipFlat.flatBleedChance;
  let poisonChance = equipFlat.flatPoisonChance;
  let burnChance = equipFlat.flatBurnChance;
  let slowChance = equipFlat.flatSlowChance;
  let freezeChance = equipFlat.flatFreezeChance;
  let statusPotency = 1.0 + equipFlat.flatStatusPotency;

  // Apply equipment percent bonuses
  hp = Math.floor(hp * (1 + equipPercent.percentMaxHP));
  atk = Math.floor(atk * (1 + equipPercent.percentAttack));
  def = Math.floor(def * (1 + equipPercent.percentDefense));
  magic = Math.floor(magic * (1 + equipPercent.percentMagicPower));
  crit = crit * (1 + equipPercent.percentCritChance);
  critDmg = critDmg * (1 + equipPercent.percentCritDamage);
  speed = Math.floor(speed * (1 + equipPercent.percentMoveSpeed));
  atkSpeed = atkSpeed * (1 + equipPercent.percentAttackSpeed);

  // --- Step 4: Buff multipliers ---
  const buffMods = sumBuffModifiers();

  // Flat buff additions
  hp += buffMods.flatMaxHP;
  atk += buffMods.flatAttack;
  def += buffMods.flatDefense;
  magic += buffMods.flatMagicPower;
  crit += buffMods.flatCritChance;
  critDmg += buffMods.flatCritDamage;
  speed += buffMods.flatMoveSpeed;
  atkSpeed += buffMods.flatAttackSpeed;

  bleedChance += buffMods.flatBleedChance;
  poisonChance += buffMods.flatPoisonChance;
  burnChance += buffMods.flatBurnChance;
  slowChance += buffMods.flatSlowChance;
  freezeChance += buffMods.flatFreezeChance;
  statusPotency += buffMods.flatStatusPotency;

  // Percent buff multipliers
  hp = Math.floor(hp * (1 + buffMods.percentMaxHP));
  atk = Math.floor(atk * (1 + buffMods.percentAttack));
  def = Math.floor(def * (1 + buffMods.percentDefense));
  magic = Math.floor(magic * (1 + buffMods.percentMagicPower));
  crit = crit * (1 + buffMods.percentCritChance);
  critDmg = critDmg * (1 + buffMods.percentCritDamage);
  speed = Math.floor(speed * (1 + buffMods.percentMoveSpeed));
  atkSpeed = atkSpeed * (1 + buffMods.percentAttackSpeed);

  // --- Step 5: Ascension bonuses ---
  const ascBonus = ascensionBonus(player.ascensionLevel);
  atk = Math.floor(atk * (1 + ascBonus));
  magic = Math.floor(magic * (1 + ascBonus));

  // --- Apply final values ---
  const oldMaxHP = player.maxHP;
  player.maxHP = Math.max(1, hp);
  player.attack = Math.max(1, atk);
  player.defense = Math.max(0, def);
  player.magicPower = Math.max(0, magic);
  player.critChance = Math.max(0, Math.min(1, crit)); // clamp 0-1
  player.critDamage = Math.max(1, critDmg); // min 1x multiplier
  player.moveSpeed = Math.max(1, speed);
  player.attackSpeed = Math.max(0.1, atkSpeed); // min 0.1 attacks/sec

  player.bleedChance = Math.max(0, Math.min(1, bleedChance));
  player.poisonChance = Math.max(0, Math.min(1, poisonChance));
  player.burnChance = Math.max(0, Math.min(1, burnChance));
  player.slowChance = Math.max(0, Math.min(1, slowChance));
  player.freezeChance = Math.max(0, Math.min(1, freezeChance));
  player.statusPotency = Math.max(0, statusPotency);

  // --- Secondary equipment stats (additive from equipment + buffs) ---
  player.armorPen       = Math.max(0, Math.min(0.9, equipFlat.flatArmorPen + buffMods.flatArmorPen));
  player.hpRegen        = Math.max(0, equipFlat.flatHpRegen + buffMods.flatHpRegen);
  player.dodgeChance    = Math.max(0, Math.min(0.75, equipFlat.flatDodgeChance + buffMods.flatDodgeChance));
  player.damageReduction = Math.max(0, Math.min(0.75, equipFlat.flatDamageReduction + buffMods.flatDamageReduction));
  player.energyRegen    = Math.max(0, equipFlat.flatEnergyRegen + buffMods.flatEnergyRegen);
  player.goldFind       = Math.max(0, equipFlat.flatGoldFind + buffMods.flatGoldFind);
  player.xpBonus        = Math.max(0, equipFlat.flatXpBonus + buffMods.flatXpBonus);

  player.skillPowerBoost   = Math.max(0, equipFlat.flatSkillPowerBoost + buffMods.flatSkillPowerBoost);
  player.skillSpeedBoost   = Math.max(0, equipFlat.flatSkillSpeedBoost + buffMods.flatSkillSpeedBoost);
  player.skillCritBoost    = Math.max(0, equipFlat.flatSkillCritBoost + buffMods.flatSkillCritBoost);
  player.skillMageBoost    = Math.max(0, equipFlat.flatSkillMageBoost + buffMods.flatSkillMageBoost);
  player.skillUtilityBoost = Math.max(0, equipFlat.flatSkillUtilityBoost + buffMods.flatSkillUtilityBoost);

  player.skillPowerLevel   = Math.max(0, Math.round(equipFlat.flatSkillPowerLevel + buffMods.flatSkillPowerLevel));
  player.skillSpeedLevel   = Math.max(0, Math.round(equipFlat.flatSkillSpeedLevel + buffMods.flatSkillSpeedLevel));
  player.skillCritLevel    = Math.max(0, Math.round(equipFlat.flatSkillCritLevel + buffMods.flatSkillCritLevel));
  player.skillMageLevel    = Math.max(0, Math.round(equipFlat.flatSkillMageLevel + buffMods.flatSkillMageLevel));
  player.skillUtilityLevel = Math.max(0, Math.round(equipFlat.flatSkillUtilityLevel + buffMods.flatSkillUtilityLevel));
  player.skillAllLevel     = Math.max(0, Math.round(equipFlat.flatSkillAllLevel + buffMods.flatSkillAllLevel));

  // Scale current HP proportionally if max HP changed
  if (oldMaxHP > 0 && player.maxHP !== oldMaxHP) {
    const ratio = player.currentHP / oldMaxHP;
    player.currentHP = Math.max(1, Math.min(player.maxHP, Math.floor(player.maxHP * ratio)));
  }

  emit('player:statsChanged');
}

// --- Equipment affix mapping ---

/**
 * Accumulate an item's affix contributions into flat and percent modifier objects.
 * Affix IDs match the snake_case keys defined in affixes.data.ts.
 */
function accumulateItemModifiers(
  item: ItemInstance,
  flat: StatModifiers,
  percent: StatModifiers,
): void {
  for (const affix of item.affixes) {
    const id = affix.id;
    const val = affix.value;

    // --- Flat affixes (scaleType: 'flat' in affixes.data.ts) ---
    if (id === 'flat_attack') flat.flatAttack += val;
    else if (id === 'flat_defense') flat.flatDefense += val;
    else if (id === 'flat_magic_power') flat.flatMagicPower += val;
    else if (id === 'flat_max_hp') flat.flatMaxHP += val;

    // --- Critical stats (percentage, added directly as bonus) ---
    else if (id === 'crit_chance') flat.flatCritChance += val;
    else if (id === 'crit_damage') flat.flatCritDamage += val;

    // --- Speed stats (percentage, used as multiplicative bonus) ---
    else if (id === 'attack_speed') percent.percentAttackSpeed += val;
    else if (id === 'move_speed') percent.percentMoveSpeed += val;

    // --- Status chance affixes (percentage, added directly to chance fields) ---
    else if (id === 'bleed_chance') flat.flatBleedChance += val;
    else if (id === 'poison_chance') flat.flatPoisonChance += val;
    else if (id === 'burn_chance') flat.flatBurnChance += val;
    else if (id === 'slow_chance') flat.flatSlowChance += val;
    else if (id === 'freeze_chance') flat.flatFreezeChance += val;

    // --- Status potency affixes (all contribute to statusPotency multiplier) ---
    else if (
      id === 'bleed_potency' ||
      id === 'poison_potency' ||
      id === 'burn_potency' ||
      id === 'slow_potency' ||
      id === 'freeze_potency'
    ) flat.flatStatusPotency += val;

    // --- Secondary stats ---
    else if (id === 'armor_penetration') flat.flatArmorPen += val;
    else if (id === 'hp_regen') flat.flatHpRegen += val;
    else if (id === 'dodge_chance') flat.flatDodgeChance += val;
    else if (id === 'damage_reduction') flat.flatDamageReduction += val;
    else if (id === 'energy_regen') flat.flatEnergyRegen += val;
    else if (id === 'gold_find') flat.flatGoldFind += val;
    else if (id === 'xp_bonus') flat.flatXpBonus += val;

    // --- Skill boosts ---
    else if (id === 'skill_power_boost') flat.flatSkillPowerBoost += val;
    else if (id === 'skill_speed_boost') flat.flatSkillSpeedBoost += val;
    else if (id === 'skill_crit_boost') flat.flatSkillCritBoost += val;
    else if (id === 'skill_mage_boost') flat.flatSkillMageBoost += val;
    else if (id === 'skill_utility_boost') flat.flatSkillUtilityBoost += val;

    // --- Skill levels ---
    else if (id === 'skill_power_level') flat.flatSkillPowerLevel += val;
    else if (id === 'skill_speed_level') flat.flatSkillSpeedLevel += val;
    else if (id === 'skill_crit_level') flat.flatSkillCritLevel += val;
    else if (id === 'skill_mage_level') flat.flatSkillMageLevel += val;
    else if (id === 'skill_utility_level') flat.flatSkillUtilityLevel += val;
    else if (id === 'skill_all_level') flat.flatSkillAllLevel += val;
  }
}

// --- Buff helpers ---

function sumBuffModifiers(): StatModifiers {
  const sum = createEmptyModifiers();

  for (const buff of activeBuffs.values()) {
    if (buff.isExpired) continue;
    const s = buff.stats;

    if (s.flatAttack) sum.flatAttack += s.flatAttack;
    if (s.flatDefense) sum.flatDefense += s.flatDefense;
    if (s.flatMagicPower) sum.flatMagicPower += s.flatMagicPower;
    if (s.flatMaxHP) sum.flatMaxHP += s.flatMaxHP;
    if (s.flatMoveSpeed) sum.flatMoveSpeed += s.flatMoveSpeed;
    if (s.flatCritChance) sum.flatCritChance += s.flatCritChance;
    if (s.flatCritDamage) sum.flatCritDamage += s.flatCritDamage;
    if (s.flatAttackSpeed) sum.flatAttackSpeed += s.flatAttackSpeed;
    if (s.percentAttack) sum.percentAttack += s.percentAttack;
    if (s.percentDefense) sum.percentDefense += s.percentDefense;
    if (s.percentMagicPower) sum.percentMagicPower += s.percentMagicPower;
    if (s.percentMaxHP) sum.percentMaxHP += s.percentMaxHP;
    if (s.percentMoveSpeed) sum.percentMoveSpeed += s.percentMoveSpeed;
    if (s.percentCritChance) sum.percentCritChance += s.percentCritChance;
    if (s.percentCritDamage) sum.percentCritDamage += s.percentCritDamage;
    if (s.percentAttackSpeed) sum.percentAttackSpeed += s.percentAttackSpeed;
    if (s.flatBleedChance) sum.flatBleedChance += s.flatBleedChance;
    if (s.flatPoisonChance) sum.flatPoisonChance += s.flatPoisonChance;
    if (s.flatBurnChance) sum.flatBurnChance += s.flatBurnChance;
    if (s.flatSlowChance) sum.flatSlowChance += s.flatSlowChance;
    if (s.flatFreezeChance) sum.flatFreezeChance += s.flatFreezeChance;
    if (s.flatStatusPotency) sum.flatStatusPotency += s.flatStatusPotency;
    if (s.flatArmorPen) sum.flatArmorPen += s.flatArmorPen;
    if (s.flatHpRegen) sum.flatHpRegen += s.flatHpRegen;
    if (s.flatDodgeChance) sum.flatDodgeChance += s.flatDodgeChance;
    if (s.flatDamageReduction) sum.flatDamageReduction += s.flatDamageReduction;
    if (s.flatEnergyRegen) sum.flatEnergyRegen += s.flatEnergyRegen;
    if (s.flatGoldFind) sum.flatGoldFind += s.flatGoldFind;
    if (s.flatXpBonus) sum.flatXpBonus += s.flatXpBonus;
    if (s.flatSkillPowerBoost) sum.flatSkillPowerBoost += s.flatSkillPowerBoost;
    if (s.flatSkillSpeedBoost) sum.flatSkillSpeedBoost += s.flatSkillSpeedBoost;
    if (s.flatSkillCritBoost) sum.flatSkillCritBoost += s.flatSkillCritBoost;
    if (s.flatSkillMageBoost) sum.flatSkillMageBoost += s.flatSkillMageBoost;
    if (s.flatSkillUtilityBoost) sum.flatSkillUtilityBoost += s.flatSkillUtilityBoost;
    if (s.flatSkillPowerLevel) sum.flatSkillPowerLevel += s.flatSkillPowerLevel;
    if (s.flatSkillSpeedLevel) sum.flatSkillSpeedLevel += s.flatSkillSpeedLevel;
    if (s.flatSkillCritLevel) sum.flatSkillCritLevel += s.flatSkillCritLevel;
    if (s.flatSkillMageLevel) sum.flatSkillMageLevel += s.flatSkillMageLevel;
    if (s.flatSkillUtilityLevel) sum.flatSkillUtilityLevel += s.flatSkillUtilityLevel;
    if (s.flatSkillAllLevel) sum.flatSkillAllLevel += s.flatSkillAllLevel;
  }

  return sum;
}

function createEmptyModifiers(): StatModifiers {
  return {
    flatAttack: 0,
    flatDefense: 0,
    flatMagicPower: 0,
    flatMaxHP: 0,
    flatMoveSpeed: 0,
    flatCritChance: 0,
    flatCritDamage: 0,
    flatAttackSpeed: 0,
    percentAttack: 0,
    percentDefense: 0,
    percentMagicPower: 0,
    percentMaxHP: 0,
    percentMoveSpeed: 0,
    percentCritChance: 0,
    percentCritDamage: 0,
    percentAttackSpeed: 0,
    flatBleedChance: 0,
    flatPoisonChance: 0,
    flatBurnChance: 0,
    flatSlowChance: 0,
    flatFreezeChance: 0,
    flatStatusPotency: 0,
    flatArmorPen: 0,
    flatHpRegen: 0,
    flatDodgeChance: 0,
    flatDamageReduction: 0,
    flatEnergyRegen: 0,
    flatGoldFind: 0,
    flatXpBonus: 0,
    flatSkillPowerBoost: 0,
    flatSkillSpeedBoost: 0,
    flatSkillCritBoost: 0,
    flatSkillMageBoost: 0,
    flatSkillUtilityBoost: 0,
    flatSkillPowerLevel: 0,
    flatSkillSpeedLevel: 0,
    flatSkillCritLevel: 0,
    flatSkillMageLevel: 0,
    flatSkillUtilityLevel: 0,
    flatSkillAllLevel: 0,
  };
}

// --- Event handlers ---

function onEquipmentChanged(): void {
  needsRecalc = true;
}

function onBuffApplied(data: { skillId: string; duration: number }): void {
  // Skill-based buffs are added via addBuff() from the skill-effects system.
  // This handler is for coordination — recalc triggers automatically via addBuff.
  needsRecalc = true;
}

function onBuffExpired(data: { skillId: string }): void {
  removeBuff(data.skillId);
}

function onLevelUp(data: { level: number; hpGain: number }): void {
  needsRecalc = true;
}

// --- Lifecycle ---

export function init(): void {
  activeBuffs.clear();
  needsRecalc = true; // Initial calculation

  on('item:equipped', onEquipmentChanged);
  on('item:unequipped', onEquipmentChanged);
  on('item:reforged', onEquipmentChanged);
  on('item:imbued', onEquipmentChanged);
  on('item:tempered', onEquipmentChanged);
  on('skill:buffApplied', onBuffApplied);
  on('skill:buffExpired', onBuffExpired);
  on('player:levelUp', onLevelUp);
}

export function update(dt: number): void {
  // Tick buff durations
  let anyExpired = false;

  for (const buff of activeBuffs.values()) {
    if (buff.isExpired) continue;
    if (buff.duration < 0) continue; // permanent buff

    buff.duration -= dt;
    if (buff.duration <= 0) {
      buff.isExpired = true;
      anyExpired = true;
    }
  }

  // Remove expired buffs
  if (anyExpired) {
    for (const [id, buff] of activeBuffs) {
      if (buff.isExpired) {
        activeBuffs.delete(id);
      }
    }
    needsRecalc = true;
  }

  // Recalculate if anything changed
  if (needsRecalc) {
    needsRecalc = false;
    recalculateStats();
  }
}

// --- Export types for other systems to use when adding buffs ---

export type { StatModifiers };
