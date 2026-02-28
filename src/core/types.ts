// ============================================================================
// Realms of Clickoria: ARPG — Master Type Definitions
// ============================================================================

// --- Basic Enums / Union Types ---

export type DamageType = 'physical' | 'magic';

export type MonsterType =
  | 'normal'
  | 'swift'
  | 'aggressive'
  | 'regenerating'
  | 'armored'
  | 'shielded';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type EquipmentSlot =
  | 'weapon'
  | 'helmet'
  | 'chest'
  | 'gloves'
  | 'boots'
  | 'accessory';

export type StatusEffectType = 'bleed' | 'poison' | 'burn' | 'slow' | 'freeze';

export type SkillCategory = 'power' | 'speed' | 'crit' | 'mage' | 'utility';

export type SkillMechanic =
  | 'melee'       // arc hitbox in front of player
  | 'projectile'  // fires a projectile toward cursor
  | 'aoe'         // area of effect around point
  | 'buff'        // temporary stat enhancement
  | 'dash'        // movement ability with iframes
  | 'toggle'      // on/off sustained effect
  | 'channel'     // hold to charge, release to fire
  | 'instant';    // immediate effect, no spatial component

export type TargetingMode =
  | 'directional' // fires toward cursor direction
  | 'cursor'      // targets cursor position
  | 'self'        // centered on player
  | 'nearest';    // auto-targets nearest enemy

export type AffixCategory =
  | 'offensive'
  | 'defensive'
  | 'utility'
  | 'statusChance'
  | 'statusPotency'
  | 'skillPower'
  | 'skillLevel';

export type MonsterAIState =
  | 'idle'
  | 'patrol'
  | 'chase'
  | 'attack'
  | 'flee'
  | 'stunned'
  | 'dead';

export type Direction = 'up' | 'down' | 'left' | 'right';

// --- Data Definitions (static, read-only from data files) ---

export interface SkillLevelData {
  damage: number;          // multiplier of attack (physical) or magicPower (magic)
  cooldown: number;        // seconds
  energyCost: number;
  duration?: number;       // buff/toggle duration in seconds
  hits?: number;           // multi-hit count
  bounces?: number;        // chain lightning bounces
  attackSpeedBonus?: number;
  moveSpeedBonus?: number;
  critChanceBonus?: number;
  critDamageBonus?: number;
  damageBonus?: number;    // flat % bonus
  statusChance?: number;   // 0-1 chance to apply status effect
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  type: 'active' | 'passive';

  // Active skill properties
  mechanic?: SkillMechanic;
  targeting?: TargetingMode;
  damageType?: DamageType;

  // Per-level scaling (index 0 = level 1)
  levels: SkillLevelData[];

  // Unlock requirements
  unlockLevel: number;
  unlockCost: number; // SP cost

  // Visual
  color: string;

  // Spatial properties (for active skills)
  range?: number;           // pixels
  radius?: number;          // AoE radius in pixels
  arcWidth?: number;        // melee arc in degrees
  projectileSpeed?: number; // pixels/sec
  projectileCount?: number;
  piercing?: boolean;       // projectiles pass through enemies

  // Status effect application
  statusEffect?: StatusEffectType;

  // Passive properties
  passiveEffect?: string; // identifier for the passive handler
}

export interface MonsterDefinition {
  id: string;
  name: string;
  types: MonsterType[];
  zone: string;

  // Base stats
  baseHP: number;
  hpPerLevel: number;
  attack: number;
  defense: number;

  // Behavior
  moveSpeed: number;
  attackRange: number;    // pixels — how close before attacking
  attackCooldown: number; // seconds between attacks
  aggroRange: number;     // pixels — detection range

  // Type-specific
  armor?: number;            // flat damage reduction (armored)
  shieldPercent?: number;    // % of HP as shield (shielded)
  shieldDamageReduction?: number;
  regenRate?: number;        // % maxHP/sec (regenerating)
  escapeThreshold?: number;  // HP% to start fleeing (swift)
  escapeSpeed?: number;      // speed multiplier when fleeing
  aggressiveWindup?: number; // telegraph duration (aggressive)
  aggressiveDamage?: number; // damage dealt by aggressive attack

  // Rewards
  xp: number;
  gold: number;
  dropChance: number; // 0-1

  // Visual (placeholder)
  color: string;
  size: number; // sprite width/height in pixels

  isBoss: boolean;
  spawnWeight: number; // relative spawn chance (0 = don't spawn randomly)
}

export interface ZoneDefinition {
  id: string;
  name: string;
  levelRange: [number, number];
  monsters: string[];  // monster IDs
  bossId: string;
  bossUnlockKills: number; // monsters killed to unlock boss
  backgroundColor: string;
  ambientColor: string;
  tier: number; // 1-7, affects item drops
  unlockCondition?: string; // boss ID of previous zone
  width: number;  // world width in pixels
  height: number; // world height in pixels
}

export interface AffixDefinition {
  id: string;
  name: string;
  description: string;
  stat: string;          // which player stat this modifies
  category: AffixCategory;
  isPrefix: boolean;

  // Per-tier values [tier0 unused, tier1..tier7]
  flatValues: number[];
  percentValues: number[];

  // Slot weights — higher = more likely on this slot type
  slotWeights: Record<EquipmentSlot, number>;
}

export interface LegendaryDefinition {
  id: string;
  name: string;
  slot: EquipmentSlot;
  description: string;
  effectId: string; // unique handler identifier
  baseAffixes: string[]; // guaranteed affix IDs
  color: string;
}

export interface StatusEffectDefinition {
  type: StatusEffectType;
  maxStacks: number;
  baseDuration: number;    // seconds
  tickInterval: number;    // seconds (0 = no tick, just a state)
  damagePercent: number;   // % of source stat per stack per tick
  damageStat: 'attack' | 'magicPower';
  speedReduction?: number; // 0-1 for slow
  reapplyCooldown?: number; // seconds (freeze)
  color: string;
}

// --- Runtime Instances (mutable game state) ---

export interface PlayerState {
  // Identity
  level: number;
  xp: number;
  xpToNext: number;

  // Resources
  currentHP: number;
  maxHP: number;
  currentEnergy: number;
  maxEnergy: number;
  gold: number;

  // Base stats (level-derived, before equipment)
  baseAttack: number;
  baseDefense: number;
  baseMagicPower: number;
  baseCritChance: number;
  baseCritDamage: number;
  baseMoveSpeed: number;
  baseAttackSpeed: number;

  // Computed stats (after equipment + passives + buffs)
  attack: number;
  defense: number;
  magicPower: number;
  critChance: number;
  critDamage: number;
  moveSpeed: number;
  attackSpeed: number;

  // Status chances (from equipment)
  bleedChance: number;
  poisonChance: number;
  burnChance: number;
  slowChance: number;
  freezeChance: number;

  // Status potency (multiplier on status damage/duration)
  statusPotency: number;

  // Skills
  skillPoints: number;
  activeSkills: (string | null)[]; // 4 active slots
  passiveSkills: (string | null)[]; // 3 passive slots
  unlockedSkills: string[];
  skillLevels: Record<string, number>;

  // Equipment
  equipment: Record<EquipmentSlot, ItemInstance | null>;
  inventory: ItemInstance[];

  // Position (synced with entity)
  x: number;
  y: number;
  facingAngle: number; // radians, 0 = right

  // Combat state
  isAttacking: boolean;
  isDashing: boolean;
  isInvulnerable: boolean;
  lastAttackTime: number;
  basicAttackCooldown: number;

  // Ascension
  ascensionLevel: number;

  // Tracking
  monstersKilled: number;
  totalDamageDealt: number;
  totalGoldEarned: number;
  bossesKilled: string[]; // boss IDs
}

export interface MonsterInstance {
  id: string;
  definitionId: string;
  name: string;
  types: MonsterType[];

  // Stats
  currentHP: number;
  maxHP: number;
  attack: number;
  defense: number;

  // Type-specific runtime
  armor: number;
  currentShield: number;
  maxShield: number;
  shieldDamageReduction: number;

  // AI state
  aiState: MonsterAIState;
  aiTimer: number;
  targetX: number;
  targetY: number;
  lastAttackTime: number;
  aggroRange: number;
  attackRange: number;
  attackCooldown: number;
  moveSpeed: number;

  // Aggressive type
  isWindingUp: boolean;
  windupTimer: number;
  windupDuration: number;

  // Swift type
  isFleeing: boolean;

  // Position
  x: number;
  y: number;

  // Status effects
  statusEffects: StatusEffectInstance[];

  // Visual
  color: string;
  size: number;
  isBoss: boolean;

  // State
  isDead: boolean;
  deathTimer: number;

  // Rewards
  xp: number;
  gold: number;
  dropChance: number;
  zone: string;
}

export interface ProjectileInstance {
  id: string;
  ownerId: string;   // 'player' or monster id
  skillId?: string;

  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  speed: number;

  damage: number;
  damageType: DamageType;
  piercing: boolean;
  hitTargets: string[]; // IDs of already-hit targets

  // Chain lightning
  bounces?: number;
  bounceRange?: number;

  // Status effect
  statusEffect?: StatusEffectType;
  statusChance?: number;

  // Lifetime
  maxDistance: number;
  distanceTraveled: number;
  isExpired: boolean;

  // Visual
  color: string;
  size: number;
}

export interface ItemInstance {
  id: string;
  name: string;
  slot: EquipmentSlot;
  rarity: Rarity;
  itemLevel: number;
  tier: number;

  affixes: AffixInstance[];
  legendaryId?: string;
  legendaryEffect?: string;

  // Crafting state
  isImbued: boolean;
  temperLevel: number;
  temperCycle: number;
  reforgeCount: number;
}

export interface AffixInstance {
  id: string;
  value: number;
  isPrefix: boolean;
}

export interface StatusEffectInstance {
  type: StatusEffectType;
  stacks: number;
  duration: number;     // remaining seconds
  tickTimer: number;    // time until next tick
  sourceAttack: number; // snapshot of source's attack/magicPower at application
  sourcePotency: number;
}

export interface SkillRuntimeState {
  cooldownRemaining: number;
  isActive: boolean;      // for toggles/channels
  chargeTime: number;     // for channels
  modifierReady: boolean; // for hit/click modifiers
}

// --- Game State ---

export interface GameState {
  player: PlayerState;
  monsters: MonsterInstance[];
  projectiles: ProjectileInstance[];
  activeZoneId: string;
  isPaused: boolean;
  gameTime: number; // total elapsed seconds

  // Skill runtime
  skillStates: Record<string, SkillRuntimeState>;

  // Zone progress
  zoneKillCounts: Record<string, number>;
  unlockedZones: string[];

  // Shop
  shopItems: ItemInstance[];
  shopRefreshCost: number;

  // UI state
  inventoryOpen: boolean;
  selectedInventorySlot: number;
}

// --- Events ---

export type GameEventMap = {
  // Player events
  'player:damaged': { amount: number; source: string };
  'player:healed': { amount: number; source: string };
  'player:died': undefined;
  'player:levelUp': { level: number; hpGain: number };
  'player:xpGained': { amount: number; source: string };
  'player:statsChanged': undefined;
  'player:moved': { x: number; y: number };

  // Combat events
  'combat:playerAttack': { angle: number; skillId?: string };
  'combat:damageDealt': {
    targetId: string;
    damage: number;
    isCrit: boolean;
    damageType: DamageType;
    x: number;
    y: number;
  };
  'combat:monsterAttack': { monsterId: string; damage: number };
  'combat:miss': { targetId: string; x: number; y: number };

  // Monster events
  'monster:spawned': { monster: MonsterInstance };
  'monster:damaged': {
    monsterId: string;
    damage: number;
    isCrit: boolean;
    remainingHP: number;
  };
  'monster:died': {
    monsterId: string;
    x: number;
    y: number;
    xp: number;
    gold: number;
    isBoss: boolean;
  };
  'monster:shieldBroken': { monsterId: string };
  'monster:aggroChanged': { monsterId: string; state: MonsterAIState };

  // Skill events
  'skill:used': { skillId: string; x: number; y: number; angle: number };
  'skill:cooldownStarted': { skillId: string; duration: number };
  'skill:cooldownReady': { skillId: string };
  'skill:unlocked': { skillId: string };
  'skill:equipped': { skillId: string; slot: number };
  'skill:unequipped': { skillId: string; slot: number };
  'skill:levelUp': { skillId: string; newLevel: number };
  'skill:buffApplied': { skillId: string; duration: number };
  'skill:buffExpired': { skillId: string };

  // Status effect events
  'status:applied': {
    targetId: string;
    type: StatusEffectType;
    stacks: number;
  };
  'status:ticked': {
    targetId: string;
    type: StatusEffectType;
    damage: number;
  };
  'status:expired': { targetId: string; type: StatusEffectType };

  // Item events
  'item:dropped': { item: ItemInstance; x: number; y: number };
  'item:pickedUp': { item: ItemInstance };
  'item:equipped': { item: ItemInstance; slot: EquipmentSlot };
  'item:unequipped': { item: ItemInstance; slot: EquipmentSlot };
  'item:sold': { item: ItemInstance; gold: number };
  'item:reforged': { item: ItemInstance };
  'item:imbued': { item: ItemInstance };
  'item:tempered': { item: ItemInstance };

  // Loot events
  'loot:spawned': { item: ItemInstance; x: number; y: number };

  // Economy events
  'economy:goldChanged': { amount: number; total: number };
  'economy:purchase': { cost: number; itemName: string };

  // Progression events
  'progression:zoneUnlocked': { zoneId: string };
  'progression:bossAvailable': { zoneId: string };
  'progression:bossDefeated': { zoneId: string; bossId: string };

  // Zone events
  'zone:changed': { fromZone: string; toZone: string };
  'zone:entered': { zoneId: string };

  // Energy events
  'energy:changed': { current: number; max: number };
  'energy:insufficient': { skillId: string; cost: number };

  // Projectile events
  'projectile:spawned': { projectile: ProjectileInstance };
  'projectile:hit': { projectileId: string; targetId: string };
  'projectile:expired': { projectileId: string };

  // UI events
  'ui:inventoryToggle': undefined;
  'ui:skillSlotClicked': { slot: number };
  'ui:damageNumber': {
    x: number;
    y: number;
    amount: number;
    isCrit: boolean;
    damageType: DamageType;
    isHeal?: boolean;
  };
};

export type GameEvent = keyof GameEventMap;

// --- Utility Types ---

export interface Vec2 {
  x: number;
  y: number;
}

export interface HitBox {
  type: 'circle' | 'arc' | 'rect';
  x: number;
  y: number;
  radius?: number;
  arcStart?: number;  // radians
  arcEnd?: number;    // radians
  width?: number;
  height?: number;
}

export interface LootDrop {
  item: ItemInstance;
  x: number;
  y: number;
  createdAt: number;
  isPickedUp: boolean;
  magnetTimer: number; // timer for auto-pickup magnet
}

export interface DamageResult {
  damage: number;
  isCrit: boolean;
  damageType: DamageType;
  statusApplied?: StatusEffectType;
  killed: boolean;
}
