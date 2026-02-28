// ============================================================================
// Item Names Data — Procedural item name generation
// Adapted from clicker's item-names.data.js for spatial ARPG.
// Structure: "[Adjective] [Noun]" with optional suffix for rare+ items.
// ============================================================================

import type { EquipmentSlot, Rarity } from '@/core/types';

// ============================================================================
// BASE NOUNS (per slot)
// ============================================================================

const SLOT_NOUNS: Record<EquipmentSlot, string[]> = {
  weapon:    ['Blade', 'Sword', 'Staff', 'Dagger', 'Mace', 'Wand', 'Axe', 'Hammer', 'Spear', 'Scepter'],
  helmet:    ['Crown', 'Hood', 'Helm', 'Circlet', 'Mask', 'Visor', 'Cap', 'Diadem'],
  chest:     ['Plate', 'Robe', 'Vest', 'Chainmail', 'Tunic', 'Hauberk', 'Mantle', 'Cuirass'],
  gloves:    ['Gauntlets', 'Wraps', 'Grips', 'Bracers', 'Mitts', 'Handguards', 'Claws'],
  boots:     ['Greaves', 'Sandals', 'Treads', 'Sabatons', 'Striders', 'Walkers', 'Stompers'],
  accessory: ['Ring', 'Amulet', 'Pendant', 'Charm', 'Talisman', 'Band', 'Brooch', 'Locket'],
};

// ============================================================================
// ADJECTIVES (per rarity)
// ============================================================================

const RARITY_ADJECTIVES: Record<Rarity, string[]> = {
  common: [
    'Sturdy', 'Worn', 'Simple', 'Plain', 'Rustic',
    'Old', 'Battered', 'Humble', 'Basic', 'Rough',
  ],
  uncommon: [
    'Refined', 'Tempered', 'Polished', 'Sharp', 'Solid',
    'Reinforced', 'Hardened', 'Keen', 'Steady', 'Reliable',
  ],
  rare: [
    'Arcane', 'Enchanted', 'Gleaming', 'Blessed', 'Radiant',
    'Mystic', 'Ethereal', 'Luminous', 'Hallowed', 'Empowered',
  ],
  epic: [
    'Mythic', 'Abyssal', 'Celestial', 'Infernal', 'Primordial',
    'Transcendent', 'Eldritch', 'Draconic', 'Astral', 'Divine',
  ],
  legendary: [
    'Legendary', 'Ancient', 'Eternal', 'Supreme', 'Godforged',
    'Timeless', 'Void-touched', 'World-forged', 'Immortal', 'Ascendant',
  ],
};

// ============================================================================
// WEAPON DAMAGE TYPE MAPPING
// ============================================================================

export const WEAPON_DAMAGE_TYPES: Record<string, 'physical' | 'magic'> = {
  Blade:   'physical',
  Sword:   'physical',
  Dagger:  'physical',
  Mace:    'physical',
  Axe:     'physical',
  Hammer:  'physical',
  Spear:   'physical',
  Staff:   'magic',
  Wand:    'magic',
  Scepter: 'magic',
};

// ============================================================================
// SUFFIXES (by dominant affix category)
// ============================================================================

const AFFIX_SUFFIXES: Record<string, string[]> = {
  offensive:     ['of Might', 'of Power', 'of the Warrior', 'of Destruction'],
  defensive:     ['of the Bear', 'of Vitality', 'of the Fortress', 'of Warding'],
  utility:       ['of Fortune', 'of Wisdom', 'of Vigor', 'of Haste'],
  statusChance:  ['of Affliction', 'of Torment', 'of Blight', 'of Corruption'],
  statusPotency: ['of Devastation', 'of Ruin', 'of Agony', 'of Decay'],
  skillPower:    ['of Mastery', 'of Expertise', 'of the Adept', 'of Prowess'],
  skillLevel:    ['of Ascendancy', 'of Transcendence', 'of the Sage', 'of Eminence'],
};

// ============================================================================
// NAME GENERATION
// ============================================================================

/**
 * Pick a random element from an array.
 */
function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a procedural item name based on slot and rarity.
 * Format: "[Adjective] [Noun]"
 */
export function generateItemName(slot: EquipmentSlot, rarity: Rarity): string {
  const adjective = pickRandom(RARITY_ADJECTIVES[rarity]);
  const noun = pickRandom(SLOT_NOUNS[slot]);
  return `${adjective} ${noun}`;
}

/**
 * Generate a full item name with an optional suffix based on the dominant
 * affix category. Used for rare+ items.
 * Format: "[Adjective] [Noun] [of Suffix]"
 */
export function generateItemNameWithSuffix(
  slot: EquipmentSlot,
  rarity: Rarity,
  dominantAffixCategory?: string
): string {
  const baseName = generateItemName(slot, rarity);

  if (dominantAffixCategory && AFFIX_SUFFIXES[dominantAffixCategory]) {
    const suffix = pickRandom(AFFIX_SUFFIXES[dominantAffixCategory]);
    return `${baseName} ${suffix}`;
  }

  return baseName;
}
