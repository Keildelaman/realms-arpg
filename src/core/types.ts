// ============================================================================
// Ashen Grace — Master Type Definitions
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

export type AffixScaleType = 'flat' | 'percentage';

export type MonsterArchetype =
  | 'melee'
  | 'ranged'
  | 'caster'
  | 'charger'
  | 'exploder';

export type MonsterRarity =
  | 'normal'
  | 'magic'
  | 'rare';

export type TelegraphShape =
  | 'circle'
  | 'cone'
  | 'line'
  | 'ring';

export type MonsterAbilityTargeting =
  | 'player'
  | 'self'
  | 'player_predict'
  | 'random_near';

export type MonsterAIState =
  | 'idle'
  | 'patrol'
  | 'chase'
  | 'attack'
  | 'flee'
  | 'stunned'
  | 'casting'
  | 'charging'
  | 'recovering'
  | 'fusing'
  | 'dead';

export type Direction = 'up' | 'down' | 'left' | 'right';

export type AttackPhase = 'none' | 'windup' | 'swing' | 'followthrough';
export type GameMode = 'hub' | 'expedition';
export type ObjectiveType =
  | 'extermination'
  | 'sweep'
  | 'boss_hunt'
  | 'survival'
  | 'timed_clear';
export type MapModifier =
  | 'dense'
  | 'lethal'
  | 'haste'
  | 'armored_horde'
  | 'boss_empowered';
export type RoomType = 'spawn' | 'combat' | 'elite' | 'treasure';
export type ExpeditionRunStatus = 'active' | 'awaiting_extraction' | 'completed' | 'failed' | 'abandoned';

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

  // Archetype + abilities
  archetype: MonsterArchetype;
  abilities: string[];

  // Ranged/caster specific
  preferredRange?: number;
  retreatSpeed?: number;

  // Charger specific
  chargeWindup?: number;
  chargeSpeed?: number;
  chargeDamageMultiplier?: number;
  chargeDistance?: number;

  // Exploder specific
  explosionRadius?: number;
  explosionDamage?: number;
  fuseTime?: number;
  detonateOnDeath?: boolean;

  // Shape override
  shape?: 'circle' | 'diamond' | 'triangle' | 'square' | 'hexagon';
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

export interface ExpeditionSpawnPoint {
  id: string;
  x: number;                // relative to room origin
  y: number;
  monsterId: string;        // from zone's monster list
  isElite: boolean;
}

export interface ExpeditionRoom {
  id: string;
  type: RoomType;
  x: number;                // world position
  y: number;
  width: number;
  height: number;
  isBranch: boolean;
  spawnPoints: ExpeditionSpawnPoint[];
  spawnTriggered: boolean;
  cleared: boolean;
  visited: boolean;
}

export interface ExpeditionCorridor {
  id: string;
  fromRoomId: string;
  toRoomId: string;
  points: Vec2[];
  width: number;
}

export interface ExpeditionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExpeditionGrid {
  cellSize: number;
  originX: number;
  originY: number;
  width: number;     // in cells
  height: number;    // in cells
  walkable: number[]; // 0 blocked, 1 walkable
}

export interface ExpeditionWallRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExpeditionLayoutMetrics {
  loops: number;
  deadEnds: number;
  deadEndRatio: number;
  mainPathRooms: number;
}

export interface ExpeditionEncounterPoint {
  id: string;
  x: number;
  y: number;
  packWeight: number;
}

export interface ExpeditionDecorPoint {
  x: number;
  y: number;
  kind: 'rock' | 'tree' | 'ruin' | 'shard';
  scale: number;
}

export interface ExpeditionMap {
  seed: number;
  zoneId: string;
  tier: number;
  objective: ObjectiveType;
  modifiers: MapModifier[];
  rooms: ExpeditionRoom[];
  corridors: ExpeditionCorridor[];
  spawnRoomId: string;
  exitRoomId: string;
  bounds: ExpeditionBounds;
  grid: ExpeditionGrid;
  wallRects: ExpeditionWallRect[];
  metrics: ExpeditionLayoutMetrics;
  encounterPoints: ExpeditionEncounterPoint[];
  decorPoints: ExpeditionDecorPoint[];
}

export interface ExpeditionProgress {
  requiredKills: number;
  currentKills: number;
  roomsVisited: number;
  roomsCleared: number;
}

export interface ExpeditionRewardBreakdown {
  completionXP: number;
  completionGold: number;
  firstClearXPBonus: number;
  firstClearGoldBonus: number;
  completionChestCount: number;
}

export interface ExpeditionExtractionPortal {
  x: number;
  y: number;
  interactRadius: number;
  spawnedAtGameTime: number;
  isActive: boolean;
}

export type ExpeditionChestSource = 'map' | 'completion';

export interface ExpeditionChest {
  id: string;
  x: number;
  y: number;
  interactRadius: number;
  rarity: Rarity;
  source: ExpeditionChestSource;
  dropCount: number;
  spawnedAtGameTime: number;
  isOpened: boolean;
}

export interface ExpeditionRunState {
  runId: string;
  seed: number;
  zoneId: string;
  tier: number;
  status: ExpeditionRunStatus;
  portalsRemaining: number;
  maxPortals: number;
  checkpointRoomId: string;
  checkpointX: number;
  checkpointY: number;
  map: ExpeditionMap;
  progress: ExpeditionProgress;
  pendingRewards: ExpeditionRewardBreakdown | null;
  extractionPortal: ExpeditionExtractionPortal | null;
  chests: ExpeditionChest[];
  startedAtGameTime: number;
}

export interface ExpeditionMetaProgress {
  unlockedZones: string[];
  maxTierByZone: Record<string, number>; // key: zoneId, value: 1..EXPEDITION_MAX_TIER
  bossClearedByZone: Record<string, boolean>; // key: zoneId
  selectedZoneId: string;
  selectedTierByZone: Record<string, number>; // key: zoneId, value: last selected tier
  firstClearClaimed: Record<string, boolean>; // key: `${zoneId}:${tier}:${objective}`
  totalRuns: number;
  totalCompletions: number;
  totalFailures: number;
}

export interface AffixDefinition {
  id: string;
  name: string;
  description: string;
  stat: string;          // which player stat this modifies
  category: AffixCategory;
  isPrefix: boolean;

  // Range at tier 1 — higher tiers are scaled via TIER_*_MULTIPLIERS
  t1Min: number;
  t1Max: number;

  // 'flat' = integer stat (attack, defense, etc.), 'percentage' = 0-1 fraction
  scaleType: AffixScaleType;

  // Selection weight within its category (higher = more common)
  weight: number;
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

// --- Monster Ability/Affix Definitions ---

export interface MonsterAbilityDef {
  id: string;
  name: string;
  cooldown: number;
  castTime: number;
  activationRange: number;
  targeting: MonsterAbilityTargeting;
  damageMultiplier: number;
  damageType: DamageType;
  radius?: number;
  width?: number;
  length?: number;
  projectile?: {
    speed: number;
    size: number;
    color: string;
    piercing: boolean;
    count: number;
    spread: number;
    maxDistance: number;
  };
  telegraph: {
    shape: TelegraphShape;
    color: string;
    duration: number;
    warningFlash: boolean;
  };
  triggerOnDeath?: boolean;
  moveDuringCast: boolean;
  dashToTarget?: boolean;
  dashSpeed?: number;
}

export interface MonsterAffixDef {
  id: string;
  name: string;
  description: string;
  hpMultiplier?: number;
  damageMultiplier?: number;
  speedMultiplier?: number;
  armorBonus?: number;
  sizeMultiplier?: number;
  onHitEffect?: string;
  onDeathEffect?: string;
  auraEffect?: string;
  auraRadius?: number;
  auraStatBuff?: {
    stat: 'damage' | 'speed' | 'defense';
    multiplier: number;
  };
  attackCooldownMultiplier?: number;
  color: string;
  particleEffect?: string;
}

export interface MonsterAffixInstance {
  id: string;
  auraCooldown?: number;
  lastTriggerTime?: number;
}

export interface ActiveTelegraph {
  id: string;
  monsterId: string;
  abilityId: string;
  shape: TelegraphShape;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  radius?: number;
  width?: number;
  length?: number;
  color: string;
  duration: number;
  elapsed: number;
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

  // Equipment-derived secondary stats (wired in player.ts recalculateStats)
  armorPen: number;         // reduces enemy effective defense (0-1 fraction)
  hpRegen: number;          // % of maxHP restored per second
  dodgeChance: number;      // chance to avoid damage entirely (0-1 fraction)
  damageReduction: number;  // % of incoming damage reduced (0-0.75 cap)
  energyRegen: number;      // bonus energy per second multiplier
  goldFind: number;         // gold drop multiplier (additive)
  xpBonus: number;          // XP gain multiplier (additive)

  // Skill category damage multipliers
  skillPowerBoost: number;
  skillSpeedBoost: number;
  skillCritBoost: number;
  skillMageBoost: number;
  skillUtilityBoost: number;

  // Skill category flat level bonuses (integer)
  skillPowerLevel: number;
  skillSpeedLevel: number;
  skillCritLevel: number;
  skillMageLevel: number;
  skillUtilityLevel: number;
  skillAllLevel: number;

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

  // Velocity (acceleration model)
  velocityX: number;
  velocityY: number;

  // Attack animation phases
  attackPhase: AttackPhase;
  attackPhaseTimer: number;
  attackAngle: number;

  // Combat state
  isAttacking: boolean;
  isDashing: boolean;
  isInvulnerable: boolean;
  lastAttackTime: number;
  basicAttackCooldown: number;

  // Ascension
  ascensionLevel: number;

  // Targeting
  targetMonsterId: string | null;

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

  // Spawn origin (for wander leash)
  spawnX: number;
  spawnY: number;

  // Wander state
  wanderTargetX?: number;
  wanderTargetY?: number;
  wanderPauseTimer: number;

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

  // Archetype
  archetype: MonsterArchetype;

  // Rarity
  rarity: MonsterRarity;
  affixes: MonsterAffixInstance[];

  // Ability state
  abilityCooldowns: Record<string, number>;
  currentAbility: string | null;
  abilityCastTimer: number;
  abilityTargetX: number;
  abilityTargetY: number;

  // Charger state
  isCharging: boolean;
  chargeTargetX: number;
  chargeTargetY: number;
  chargeTimer: number;

  // Exploder state
  isFused: boolean;
  fuseTimer: number;

  // Ranged/caster state
  isRetreating: boolean;

  // Visual
  shape: 'circle' | 'diamond' | 'triangle' | 'square' | 'hexagon';
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
  gameMode: GameMode;
  activeZoneId: string;
  activeExpedition: ExpeditionRunState | null;
  expeditionMeta: ExpeditionMetaProgress;
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
  merchantOpen: boolean;
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
  'player:velocityChanged': { vx: number; vy: number; speed: number };
  'player:startedMoving': undefined;
  'player:stoppedMoving': undefined;
  'player:targetChanged': { monsterId: string | null };

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
  'combat:attackWindup': { angle: number; duration: number };
  'combat:attackSwing': { angle: number; duration: number };
  'combat:attackFollowThrough': { angle: number; duration: number };
  'combat:attackComplete': undefined;
  'combat:attackReady': undefined;
  'combat:impact': {
    x: number;
    y: number;
    angle: number;
    damage: number;
    isCrit: boolean;
    damageType: DamageType;
    targetId: string;
  };
  'combat:knockback': {
    targetId: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    duration: number;
  };

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
  'ui:merchantToggle': undefined;
  'ui:skillSlotClicked': { slot: number };
  'ui:damageNumber': {
    x: number;
    y: number;
    amount: number;
    isCrit: boolean;
    damageType: DamageType;
    isHeal?: boolean;
  };

  // Monster ability events
  'monster:abilityCastStart': {
    monsterId: string;
    abilityId: string;
    targetX: number;
    targetY: number;
    castTime: number;
  };
  'monster:abilityCastComplete': {
    monsterId: string;
    abilityId: string;
  };
  'monster:abilityCancelled': {
    monsterId: string;
    abilityId: string;
  };

  // Charger events
  'monster:chargeStart': {
    monsterId: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    speed: number;
  };
  'monster:chargeEnd': {
    monsterId: string;
    hitPlayer: boolean;
  };

  // Exploder events
  'monster:fuseStart': {
    monsterId: string;
    fuseTime: number;
    radius: number;
  };
  'monster:detonated': {
    monsterId: string;
    x: number;
    y: number;
    radius: number;
    damage: number;
    hitPlayer: boolean;
  };

  // Rarity events
  'monster:raritySpawned': {
    monsterId: string;
    rarity: MonsterRarity;
    affixes: string[];
  };

  // Telegraph events
  'telegraph:created': {
    id: string;
    monsterId: string;
    shape: TelegraphShape;
    x: number;
    y: number;
    radius?: number;
    color: string;
    duration: number;
  };
  'telegraph:expired': { id: string };

  // Affix events
  'affix:teleport': { monsterId: string; fromX: number; fromY: number; toX: number; toY: number };
  'affix:frostNova': { x: number; y: number; radius: number };
  'affix:vampiricHeal': { monsterId: string; amount: number };

  // Expedition events
  'expedition:launched': { runId: string; zoneId: string; tier: number; seed: number };
  'expedition:roomEntered': { runId: string; roomId: string };
  'expedition:roomCleared': { runId: string; roomId: string };
  'expedition:progress': { runId: string; currentKills: number; requiredKills: number };
  'expedition:checkpointUpdated': { runId: string; roomId: string };
  'expedition:portalUsed': { runId: string; portalsRemaining: number };
  'expedition:completed': {
    runId: string;
    durationSec: number;
    rewards: ExpeditionRewardBreakdown;
  };
  'expedition:readyToExtract': {
    runId: string;
    x: number;
    y: number;
    rewards: ExpeditionRewardBreakdown;
  };
  'expedition:chestSpawned': {
    runId: string;
    chestId: string;
    x: number;
    y: number;
    rarity: Rarity;
    source: ExpeditionChestSource;
  };
  'expedition:chestOpened': {
    runId: string;
    chestId: string;
    rarity: Rarity;
    source: ExpeditionChestSource;
    dropCount: number;
  };
  'expedition:failed': { runId: string; reason: 'no_portals' | 'abandoned' };
  'expedition:returnHub': {
    runId: string;
    outcome: 'completed' | 'failed' | 'abandoned';
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
