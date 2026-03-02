// ============================================================================
// Skill System — Unlock, equip, cooldown management, activation
// ============================================================================

import type {
  SkillDefinition,
  SkillRuntimeState,
  SkillMechanic,
  SkillUpgradeState,
} from '@/core/types';
import { on, emit } from '@/core/event-bus';
import {
  getState,
  getPlayer,
  spendEnergy,
} from '@/core/game-state';
import {
  MAX_SKILL_LEVEL,
  ACTIVE_SKILL_SLOTS,
  PASSIVE_SKILL_SLOTS,
  COOLDOWN_FLOOR_PERCENT,
  MAX_RESPECS_PER_SESSION,
} from '@/data/constants';

// Skill definitions imported from data module (assumed to exist)
// Record<string, SkillDefinition>
import { SKILLS } from '@/data/skills.data';

// --- Internal state ---

/** Tracks which toggle skills are actively draining energy */
const activeToggles = new Set<string>();

/** Tracks which channel skills are currently being held */
const activeChannels = new Set<string>();

/** Tracks how many upgrade respecs have been used this session */
let respecsUsed = 0;

// --- Helpers ---

function getSkillDef(skillId: string): SkillDefinition | undefined {
  return SKILLS[skillId];
}

function ensureSkillState(skillId: string): SkillRuntimeState {
  const state = getState();
  if (!state.skillStates[skillId]) {
    state.skillStates[skillId] = {
      cooldownRemaining: 0,
      isActive: false,
      chargeTime: 0,
      modifierReady: false,
    };
  }
  return state.skillStates[skillId];
}

// --- Public API ---

/**
 * Returns the effective level of a skill, including any item bonuses.
 * Item bonuses are tracked in skillLevels with a separate key convention
 * or via equipment affixes — for now we read directly from player state.
 */
export function getSkillLevel(skillId: string): number {
  const player = getPlayer();
  const baseLevel = player.skillLevels[skillId] ?? 0;

  // Check equipment for skill level bonuses
  let itemBonus = 0;
  for (const slot of Object.values(player.equipment)) {
    if (!slot) continue;
    for (const affix of slot.affixes) {
      // Skill level affixes use convention: stat = 'skillLevel_<skillId>'
      if (affix.id === `skill_level_${skillId}`) {
        itemBonus += affix.value;
      }
    }
  }

  return baseLevel + itemBonus;
}

/**
 * Returns the effective cooldown for a skill after applying CDR modifiers.
 * The cooldown floor prevents any skill from going below 50% of its base CD.
 */
export function getEffectiveCooldown(skillId: string): number {
  const def = getSkillDef(skillId);
  if (!def) return 0;

  const level = getSkillLevel(skillId);
  if (level <= 0) return 0;

  const levelData = def.levels[level - 1];
  if (!levelData) return 0;

  // Check upgrade path cooldown override (e.g. Ravager 4.5s, Sunbreaker 4.0s)
  const flags = getUpgradeFlags(skillId);
  const baseCooldown = typeof flags.cooldownOverride === 'number'
    ? flags.cooldownOverride
    : levelData.cooldown;

  // Gather cooldown reduction from equipment/buffs
  // For now, the player state doesn't have a dedicated CDR stat,
  // so we return the base cooldown. CDR can be added via modifiers later.
  const cdrMultiplier = 1.0; // placeholder for future CDR stat

  const reducedCooldown = baseCooldown * cdrMultiplier;
  const floor = baseCooldown * COOLDOWN_FLOOR_PERCENT;

  return Math.max(floor, reducedCooldown);
}

/**
 * Get the energy cost for a skill at its current level.
 */
export function getEffectiveEnergyCost(skillId: string): number {
  const def = getSkillDef(skillId);
  if (!def) return 0;

  const level = getSkillLevel(skillId);
  if (level <= 0) return 0;

  const levelData = def.levels[level - 1];
  if (!levelData) return 0;

  return levelData.energyCost;
}

/**
 * Checks whether a skill is currently on cooldown.
 */
export function isOnCooldown(skillId: string): boolean {
  const skillState = getState().skillStates[skillId];
  return skillState ? skillState.cooldownRemaining > 0 : false;
}

/**
 * Checks whether a skill is currently active (toggle on, channel held).
 */
export function isSkillActive(skillId: string): boolean {
  const skillState = getState().skillStates[skillId];
  return skillState ? skillState.isActive : false;
}

/**
 * Unlock a skill by spending SP.
 * Returns true if the skill was successfully unlocked.
 */
export function unlockSkill(skillId: string): boolean {
  const def = getSkillDef(skillId);
  if (!def) return false;

  const player = getPlayer();

  // Already unlocked?
  if (player.unlockedSkills.includes(skillId)) return false;

  // Level requirement
  if (player.level < def.unlockLevel) return false;

  // SP cost
  if (player.skillPoints < def.unlockCost) return false;

  // Check unlock condition
  const condition = checkUnlockCondition(skillId);
  if (!condition.met) return false;

  // Spend SP and unlock
  player.skillPoints -= def.unlockCost;
  player.unlockedSkills.push(skillId);
  player.skillLevels[skillId] = 1;

  // Initialize runtime state
  ensureSkillState(skillId);

  emit('skill:unlocked', { skillId });

  return true;
}

/**
 * Check if a skill's unlock condition is met (beyond SP cost).
 * Exported separately so UI/Codex can query lock reasons without attempting unlock.
 */
export function checkUnlockCondition(skillId: string): { met: boolean; reason?: string } {
  const def = getSkillDef(skillId);
  if (!def) return { met: false, reason: 'Unknown skill' };

  const condition = def.unlockCondition;
  if (!condition) return { met: true };

  const player = getPlayer();

  switch (condition.type) {
    case 'level':
      if (player.level < (condition.value as number))
        return { met: false, reason: `Requires Level ${condition.value}` };
      return { met: true };

    case 'boss':
      if (!player.bossesKilled.includes(condition.value as string))
        return { met: false, reason: `Defeat ${condition.value} first` };
      return { met: true };

    case 'usageCount': {
      const [targetSkill, countStr] = (condition.value as string).split(':');
      const required = parseInt(countStr, 10);
      const current = player.skillUsageCounts[targetSkill] ?? 0;
      if (current < required)
        return { met: false, reason: `Use ${targetSkill} ${required} times (${current}/${required})` };
      return { met: true };
    }

    case 'stat': {
      const [stat, thresholdStr] = (condition.value as string).split(':');
      const threshold = parseInt(thresholdStr, 10);
      const current = (player as unknown as Record<string, number>)[stat] ?? 0;
      if (current < threshold)
        return { met: false, reason: `Requires ${threshold} ${stat} (${current}/${threshold})` };
      return { met: true };
    }

    default:
      return { met: true };
  }
}

/**
 * Upgrade a skill by spending 1 SP.
 * Returns true if the skill was successfully upgraded.
 */
export function upgradeSkill(skillId: string): boolean {
  const def = getSkillDef(skillId);
  if (!def) return false;

  const player = getPlayer();

  // Must be unlocked
  if (!player.unlockedSkills.includes(skillId)) return false;

  const currentLevel = player.skillLevels[skillId] ?? 0;

  // Max level check (base level, not counting item bonuses)
  if (currentLevel >= MAX_SKILL_LEVEL) return false;

  // Must have enough levels defined
  if (currentLevel >= def.levels.length) return false;

  // SP cost: 1 SP per upgrade
  if (player.skillPoints < 1) return false;

  player.skillPoints -= 1;
  player.skillLevels[skillId] = currentLevel + 1;

  emit('skill:levelUp', { skillId, newLevel: currentLevel + 1 });

  return true;
}

/**
 * Equip an active skill to a slot (0-3) or passive skill to a slot (0-2).
 * Returns true if the skill was successfully equipped.
 */
export function equipSkill(skillId: string, slot: number): boolean {
  const def = getSkillDef(skillId);
  if (!def) return false;

  const player = getPlayer();

  // Must be unlocked
  if (!player.unlockedSkills.includes(skillId)) return false;

  if (def.type === 'active') {
    // Validate slot range
    if (slot < 0 || slot >= ACTIVE_SKILL_SLOTS) return false;

    // If already equipped elsewhere, unequip from old slot first
    const existingSlot = player.activeSkills.indexOf(skillId);
    if (existingSlot !== -1) {
      player.activeSkills[existingSlot] = null;
      emit('skill:unequipped', { skillId, slot: existingSlot });
    }

    // If target slot is occupied, unequip the current skill
    const currentSkill = player.activeSkills[slot];
    if (currentSkill !== null) {
      // Deactivate if it's a toggle
      if (activeToggles.has(currentSkill)) {
        deactivateToggle(currentSkill);
      }
      emit('skill:unequipped', { skillId: currentSkill, slot });
    }

    player.activeSkills[slot] = skillId;
    emit('skill:equipped', { skillId, slot });
  } else {
    // Passive skill
    if (slot < 0 || slot >= PASSIVE_SKILL_SLOTS) return false;

    // If already equipped elsewhere, unequip from old slot first
    const existingSlot = player.passiveSkills.indexOf(skillId);
    if (existingSlot !== -1) {
      player.passiveSkills[existingSlot] = null;
      emit('skill:unequipped', { skillId, slot: existingSlot });
    }

    // If target slot is occupied, unequip the current passive
    const currentPassive = player.passiveSkills[slot];
    if (currentPassive !== null) {
      emit('skill:unequipped', { skillId: currentPassive, slot });
    }

    player.passiveSkills[slot] = skillId;
    emit('skill:equipped', { skillId, slot });
  }

  return true;
}

/**
 * Unequip a skill from a slot.
 * @param slot - the slot index
 * @param type - 'active' or 'passive'
 */
export function unequipSkill(slot: number, type: 'active' | 'passive'): boolean {
  const player = getPlayer();

  if (type === 'active') {
    if (slot < 0 || slot >= ACTIVE_SKILL_SLOTS) return false;
    const skillId = player.activeSkills[slot];
    if (skillId === null) return false;

    // Deactivate toggle if active
    if (activeToggles.has(skillId)) {
      deactivateToggle(skillId);
    }

    // Stop channel if active
    if (activeChannels.has(skillId)) {
      releaseChannel(skillId);
    }

    player.activeSkills[slot] = null;
    emit('skill:unequipped', { skillId, slot });
  } else {
    if (slot < 0 || slot >= PASSIVE_SKILL_SLOTS) return false;
    const skillId = player.passiveSkills[slot];
    if (skillId === null) return false;

    player.passiveSkills[slot] = null;
    emit('skill:unequipped', { skillId, slot });
  }

  return true;
}

/**
 * Activate a skill by ID. For toggles, this toggles on/off.
 * For channels, call startChannel / releaseChannel instead.
 * For all other types, this triggers a one-shot use.
 *
 * @param skillId - the skill to activate
 * @param angle   - facing direction in radians (for directional skills)
 * @returns true if the skill was successfully activated
 */
export function activateSkill(skillId: string, angle: number): boolean {
  const def = getSkillDef(skillId);
  if (!def || def.type !== 'active') return false;

  const player = getPlayer();
  const skillState = ensureSkillState(skillId);

  // Must be equipped
  if (!player.activeSkills.includes(skillId)) return false;

  // Handle toggle skills specially
  if (def.mechanic === 'toggle') {
    if (activeToggles.has(skillId)) {
      deactivateToggle(skillId);
      return true;
    }
    return activateToggle(skillId);
  }

  // Handle channel skills specially
  if (def.mechanic === 'channel') {
    if (activeChannels.has(skillId)) {
      // Already channeling — release fires it
      releaseChannel(skillId);
      return true;
    }
    return startChannel(skillId);
  }

  // Standard one-shot activation

  // Check cooldown
  if (skillState.cooldownRemaining > 0) return false;

  // Check energy cost
  const energyCost = getEffectiveEnergyCost(skillId);
  if (player.currentEnergy < energyCost) {
    emit('energy:insufficient', { skillId, cost: energyCost });
    return false;
  }

  // Spend energy
  if (!spendEnergy(energyCost)) return false;

  // Start cooldown
  const cooldown = getEffectiveCooldown(skillId);
  skillState.cooldownRemaining = cooldown;

  emit('skill:cooldownStarted', { skillId, duration: cooldown });

  // Emit skill used event — skill-effects system will handle the rest
  emit('skill:used', {
    skillId,
    x: player.x,
    y: player.y,
    angle,
  });

  // Track usage count (for unlock conditions)
  player.skillUsageCounts[skillId] = (player.skillUsageCounts[skillId] ?? 0) + 1;

  return true;
}

/**
 * Reduce the cooldown of a specific skill by a given amount.
 * Respects the cooldown floor — will not reduce below 0.
 */
export function reduceCooldown(skillId: string, amount: number): void {
  const skillState = getState().skillStates[skillId];
  if (!skillState) return;

  skillState.cooldownRemaining = Math.max(0, skillState.cooldownRemaining - amount);

  if (skillState.cooldownRemaining <= 0) {
    skillState.cooldownRemaining = 0;
    emit('skill:cooldownReady', { skillId });
  }
}

/**
 * Reduce all skill cooldowns by a given amount (used by spell_weaver passive).
 * Skips the triggering skill (specified by excludeSkillId).
 * Respects the cooldown floor.
 */
export function reduceAllCooldowns(amount: number, excludeSkillId?: string): void {
  const state = getState();
  const player = getPlayer();

  for (const equippedSkillId of player.activeSkills) {
    if (equippedSkillId === null) continue;
    if (equippedSkillId === excludeSkillId) continue;

    const skillState = state.skillStates[equippedSkillId];
    if (!skillState || skillState.cooldownRemaining <= 0) continue;

    skillState.cooldownRemaining = Math.max(0, skillState.cooldownRemaining - amount);

    if (skillState.cooldownRemaining <= 0) {
      skillState.cooldownRemaining = 0;
      emit('skill:cooldownReady', { skillId: equippedSkillId });
    }
  }
}

/**
 * Get the current charge time of a channeling skill.
 */
export function getChargeTime(skillId: string): number {
  const skillState = getState().skillStates[skillId];
  return skillState ? skillState.chargeTime : 0;
}

/**
 * Check if a skill is currently being channeled.
 */
export function isChanneling(skillId: string): boolean {
  return activeChannels.has(skillId);
}

/**
 * Check if a toggle skill is currently active.
 */
export function isToggleActive(skillId: string): boolean {
  return activeToggles.has(skillId);
}

// --- Toggle management ---

function activateToggle(skillId: string): boolean {
  const def = getSkillDef(skillId);
  if (!def) return false;

  const player = getPlayer();
  const skillState = ensureSkillState(skillId);

  // Check cooldown
  if (skillState.cooldownRemaining > 0) return false;

  // Check initial energy (need at least a tick's worth)
  const energyCost = getEffectiveEnergyCost(skillId);
  if (player.currentEnergy < energyCost * 0.1) {
    emit('energy:insufficient', { skillId, cost: energyCost });
    return false;
  }

  activeToggles.add(skillId);
  skillState.isActive = true;

  emit('skill:used', {
    skillId,
    x: player.x,
    y: player.y,
    angle: player.facingAngle,
  });

  return true;
}

function deactivateToggle(skillId: string): void {
  const skillState = getState().skillStates[skillId];
  if (skillState) {
    skillState.isActive = false;
  }
  activeToggles.delete(skillId);

  // Start cooldown on deactivation
  const cooldown = getEffectiveCooldown(skillId);
  if (skillState && cooldown > 0) {
    skillState.cooldownRemaining = cooldown;
    emit('skill:cooldownStarted', { skillId, duration: cooldown });
  }

  emit('skill:buffExpired', { skillId });
}

// --- Channel management ---

function startChannel(skillId: string): boolean {
  const def = getSkillDef(skillId);
  if (!def) return false;

  const skillState = ensureSkillState(skillId);

  // Check cooldown
  if (skillState.cooldownRemaining > 0) return false;

  // Check energy
  const energyCost = getEffectiveEnergyCost(skillId);
  const player = getPlayer();
  if (player.currentEnergy < energyCost) {
    emit('energy:insufficient', { skillId, cost: energyCost });
    return false;
  }

  // Spend energy on channel start
  if (!spendEnergy(energyCost)) return false;

  activeChannels.add(skillId);
  skillState.isActive = true;
  skillState.chargeTime = 0;

  return true;
}

function releaseChannel(skillId: string): void {
  const skillState = getState().skillStates[skillId];
  const player = getPlayer();

  if (skillState) {
    skillState.isActive = false;

    // Emit skill:used with charge time encoded — the effect handler reads chargeTime
    emit('skill:used', {
      skillId,
      x: player.x,
      y: player.y,
      angle: player.facingAngle,
    });

    // Start cooldown
    const cooldown = getEffectiveCooldown(skillId);
    skillState.cooldownRemaining = cooldown;
    skillState.chargeTime = 0;

    emit('skill:cooldownStarted', { skillId, duration: cooldown });
  }

  activeChannels.delete(skillId);
}

// --- Upgrade Fork Management ---

/**
 * Choose an upgrade path for a skill (tier 1 fork).
 * Locks out the other two paths.
 */
export function chooseUpgradePath(skillId: string, path: 'A' | 'B' | 'C'): boolean {
  const def = getSkillDef(skillId);
  if (!def?.upgradeTree) return false;

  const player = getPlayer();
  if (!player.unlockedSkills.includes(skillId)) return false;

  const upgrade = player.skillUpgrades[skillId];
  if (upgrade && upgrade.tier >= 1) return false;

  const pathDef = def.upgradeTree.tier1[path];
  if (player.skillPoints < pathDef.spCost) return false;

  player.skillPoints -= pathDef.spCost;
  player.skillUpgrades[skillId] = { pathChoice: path, tier: 1 };

  emit('skill:upgraded', { skillId, path, tier: 1 });
  return true;
}

/**
 * Unlock the tier 2 Awakening for a skill.
 * Requires tier 1 already chosen.
 */
export function unlockAwakening(skillId: string): boolean {
  const def = getSkillDef(skillId);
  if (!def?.upgradeTree) return false;

  const player = getPlayer();
  const upgrade = player.skillUpgrades[skillId];
  if (!upgrade || upgrade.tier !== 1 || !upgrade.pathChoice) return false;

  const pathDef = def.upgradeTree.tier2[upgrade.pathChoice];
  if (player.skillPoints < pathDef.spCost) return false;

  player.skillPoints -= pathDef.spCost;
  upgrade.tier = 2;

  emit('skill:upgraded', { skillId, path: upgrade.pathChoice, tier: 2 });
  return true;
}

/**
 * Get the current upgrade state for a skill.
 */
export function getUpgradeState(skillId: string): SkillUpgradeState {
  const player = getPlayer();
  return player.skillUpgrades[skillId] ?? { pathChoice: null, tier: 0 };
}

/**
 * Get the merged flags for the currently active upgrade path.
 * Returns empty object if no path chosen.
 */
export function getUpgradeFlags(skillId: string): Record<string, number | boolean | string> {
  const def = getSkillDef(skillId);
  if (!def?.upgradeTree) return {};

  const player = getPlayer();
  const upgrade = player.skillUpgrades[skillId];
  if (!upgrade || !upgrade.pathChoice) return {};

  const flags: Record<string, number | boolean | string> = {};

  // Merge tier 1 flags
  const t1 = def.upgradeTree.tier1[upgrade.pathChoice];
  if (t1.flags) Object.assign(flags, t1.flags);

  // Merge tier 2 flags (if awakening unlocked)
  if (upgrade.tier >= 2) {
    const t2 = def.upgradeTree.tier2[upgrade.pathChoice];
    if (t2.flags) Object.assign(flags, t2.flags);
  }

  return flags;
}

/**
 * Respec a skill's upgrade path. Refunds SP.
 * Limited to MAX_RESPECS_PER_SESSION respecs per session.
 */
export function respecSkillUpgrade(skillId: string): boolean {
  const player = getPlayer();
  const upgrade = player.skillUpgrades[skillId];
  if (!upgrade || upgrade.tier === 0) return false;

  if (respecsUsed >= MAX_RESPECS_PER_SESSION) return false;

  const def = getSkillDef(skillId);
  if (!def?.upgradeTree || !upgrade.pathChoice) return false;

  let refund = def.upgradeTree.tier1[upgrade.pathChoice].spCost;
  if (upgrade.tier >= 2) {
    refund += def.upgradeTree.tier2[upgrade.pathChoice].spCost;
  }

  player.skillPoints += refund;
  player.skillUpgrades[skillId] = { pathChoice: null, tier: 0 };
  respecsUsed++;

  emit('skill:respecced', { skillId, spRefunded: refund });
  return true;
}

// --- Event handlers ---

function onPlayerAttack(data: { angle: number; skillId?: string }): void {
  if (data.skillId) {
    activateSkill(data.skillId, data.angle);
  }
}

/**
 * Event-driven CDR: reduce all skill cooldowns by a given amount.
 * Enforces 50% CD floor per skill so passives can't reduce to 0.
 */
function onReduceCooldowns(data: { amount: number; excludeSkillId?: string }): void {
  const state = getState();
  const player = getPlayer();

  for (const equippedSkillId of player.activeSkills) {
    if (equippedSkillId === null) continue;
    if (equippedSkillId === data.excludeSkillId) continue;

    const skillState = state.skillStates[equippedSkillId];
    if (!skillState || skillState.cooldownRemaining <= 0) continue;

    // Compute floor from base cooldown (respecting upgrade path override)
    const def = getSkillDef(equippedSkillId);
    if (!def) continue;
    const level = getSkillLevel(equippedSkillId);
    if (level <= 0) continue;
    const upgradeFlags = getUpgradeFlags(equippedSkillId);
    const baseCooldown = typeof upgradeFlags.cooldownOverride === 'number'
      ? upgradeFlags.cooldownOverride
      : (def.levels[level - 1]?.cooldown ?? 0);
    const floor = baseCooldown * COOLDOWN_FLOOR_PERCENT;

    const newCd = Math.max(floor, skillState.cooldownRemaining - data.amount);
    // Only reduce, never increase
    if (newCd < skillState.cooldownRemaining) {
      skillState.cooldownRemaining = newCd;
    }

    if (skillState.cooldownRemaining <= 0) {
      skillState.cooldownRemaining = 0;
      emit('skill:cooldownReady', { skillId: equippedSkillId });
    }
  }
}

/**
 * Event-driven single-skill CDR (e.g., shadow_reflexes panic dash).
 */
function onReduceSingleCooldown(data: { skillId: string; amount: number }): void {
  reduceCooldown(data.skillId, data.amount);
}

// --- Lifecycle ---

export function init(): void {
  activeToggles.clear();
  activeChannels.clear();
  respecsUsed = 0;

  on('combat:playerAttack', onPlayerAttack);
  on('skill:reduceCooldowns', onReduceCooldowns);
  on('skill:reduceSingleCooldown', onReduceSingleCooldown);
}

export function update(dt: number): void {
  const state = getState();
  const player = getPlayer();

  // --- Tick all cooldowns ---
  for (const skillId of Object.keys(state.skillStates)) {
    const skillState = state.skillStates[skillId];
    if (skillState.cooldownRemaining > 0) {
      skillState.cooldownRemaining -= dt;
      if (skillState.cooldownRemaining <= 0) {
        skillState.cooldownRemaining = 0;
        emit('skill:cooldownReady', { skillId });
      }
    }
  }

  // --- Tick active toggles: drain energy per second ---
  for (const skillId of activeToggles) {
    const def = getSkillDef(skillId);
    if (!def) continue;

    const energyCost = getEffectiveEnergyCost(skillId);
    const drainThisTick = energyCost * dt;

    if (player.currentEnergy < drainThisTick) {
      // Out of energy — deactivate toggle
      deactivateToggle(skillId);
      continue;
    }

    player.currentEnergy -= drainThisTick;

    emit('energy:changed', {
      current: player.currentEnergy,
      max: player.maxEnergy,
    });
  }

  // --- Tick active channels: accumulate charge time ---
  for (const skillId of activeChannels) {
    const skillState = state.skillStates[skillId];
    if (skillState) {
      skillState.chargeTime += dt;
    }
  }
}
