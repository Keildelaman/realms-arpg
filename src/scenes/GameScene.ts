import Phaser from 'phaser';
import { getState, getPlayer } from '@/core/game-state';
import { on, emit } from '@/core/event-bus';
import type { MonsterInstance, ProjectileInstance } from '@/core/types';
import { ZONES } from '@/data/zones.data';
import { MONSTERS } from '@/data/monsters.data';
import { CAMERA_LERP } from '@/data/constants';

// Systems
import * as combat from '@/systems/combat';
import * as movement from '@/systems/movement';
import * as health from '@/systems/health';
import * as energy from '@/systems/energy';
import * as playerSys from '@/systems/player';
import * as skills from '@/systems/skills';
import * as skillEffects from '@/systems/skill-effects';
import * as skillPassives from '@/systems/skill-passives';
import * as statusEffects from '@/systems/status-effects';
import * as items from '@/systems/items';
import * as itemGen from '@/systems/item-gen';
import * as itemEffects from '@/systems/item-effects';
import * as progression from '@/systems/progression';
import * as economy from '@/systems/economy';
import * as loot from '@/systems/loot';
import * as monsterAI from '@/systems/monster-ai';
import * as zones from '@/systems/zones';

// Entities
import { PlayerEntity } from '@/entities/PlayerEntity';
import { MonsterEntity } from '@/entities/MonsterEntity';
import { Projectile } from '@/entities/Projectile';
import { VFXManager } from '@/entities/VFXManager';

// UI (damage numbers rendered in world space)
import { DamageNumberManager } from '@/ui/DamageNumber';
import { StatusIcons } from '@/ui/StatusIcons';

export class GameScene extends Phaser.Scene {
  private playerEntity!: PlayerEntity;
  private monsterEntities: Map<string, MonsterEntity> = new Map();
  private projectileEntities: Map<string, Projectile> = new Map();
  private lootSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private damageNumbers!: DamageNumberManager;
  private statusIcons!: StatusIcons;
  private vfxManager!: VFXManager;

  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyTab!: Phaser.Input.Keyboard.Key;
  private skillKeys!: Phaser.Input.Keyboard.Key[];

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    // --- Register monster definitions ---
    for (const def of Object.values(MONSTERS)) {
      zones.registerMonster(def);
    }

    // --- Initialize all systems ---
    combat.init();
    movement.init();
    health.init();
    energy.init();
    playerSys.init();
    skills.init();
    skillEffects.init();
    skillPassives.init();
    statusEffects.init();
    items.init();
    itemGen.init();
    itemEffects.init();
    progression.init();
    economy.init();
    loot.init();
    monsterAI.init();
    zones.init();

    // --- Inject loot generators (avoids system-to-system imports) ---
    loot.setItemGenerators(
      (tier: number) => itemGen.generateItem(tier),
      (tier: number) => itemGen.generateBossItem(tier),
    );

    // --- Set up the zone ---
    const state = getState();
    const zone = ZONES[state.activeZoneId];
    if (zone) {
      this.physics.world.setBounds(0, 0, zone.width, zone.height);
      this.cameras.main.setBounds(0, 0, zone.width, zone.height);
      this.cameras.main.setBackgroundColor(zone.backgroundColor);
    }

    // --- Create player entity ---
    const player = getPlayer();
    this.playerEntity = new PlayerEntity(this, player.x, player.y);
    this.cameras.main.startFollow(this.playerEntity.sprite, true, CAMERA_LERP, CAMERA_LERP);

    // --- World-space UI ---
    this.damageNumbers = new DamageNumberManager(this);
    this.statusIcons = new StatusIcons(this);

    // --- VFX Manager ---
    this.vfxManager = new VFXManager(this);

    // --- Input ---
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keySpace = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyTab = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
    this.skillKeys = [
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR),
    ];

    // Prevent Tab from leaving the game
    this.keyTab.on('down', () => {
      emit('ui:inventoryToggle');
    });

    // Skill key bindings
    this.skillKeys.forEach((key, index) => {
      key.on('down', () => {
        const player = getPlayer();
        const skillId = player.activeSkills[index];
        if (skillId) {
          const angle = movement.getPlayerFacingAngle();
          skills.activateSkill(skillId, angle);
        }
      });
    });

    // --- Subscribe to game events for entity creation/destruction ---
    on('monster:spawned', (data) => {
      this.createMonsterEntity(data.monster);
    });

    on('monster:died', (data) => {
      const entity = this.monsterEntities.get(data.monsterId);
      if (entity) {
        entity.playDeathAnimation();
        // Remove after death animation
        this.time.delayedCall(400, () => {
          entity.destroy();
          this.monsterEntities.delete(data.monsterId);
        });
      }
    });

    on('monster:damaged', (data) => {
      const entity = this.monsterEntities.get(data.monsterId);
      if (entity) {
        entity.flashHit();
      }
    });

    on('monster:shieldBroken', (data) => {
      const entity = this.monsterEntities.get(data.monsterId);
      if (entity) {
        entity.flashHit();
      }
    });

    on('player:damaged', () => {
      // flashHit + flashInvulnerable handled by PlayerEntity's own listener
      this.cameras.main.shake(80, 0.003);
    });

    on('projectile:spawned', (data) => {
      this.createProjectileEntity(data.projectile);
    });

    on('projectile:expired', (data) => {
      const entity = this.projectileEntities.get(data.projectileId);
      if (entity) {
        entity.destroy();
        this.projectileEntities.delete(data.projectileId);
      }
    });

    on('loot:spawned', (data) => {
      this.createLootSprite(data.item.id, data.x, data.y);
    });

    on('item:pickedUp', (data) => {
      const sprite = this.lootSprites.get(data.item.id);
      if (sprite) {
        sprite.destroy();
        this.lootSprites.delete(data.item.id);
      }
    });

    on('zone:entered', (data) => {
      const zone = ZONES[data.zoneId];
      if (zone) {
        this.physics.world.setBounds(0, 0, zone.width, zone.height);
        this.cameras.main.setBounds(0, 0, zone.width, zone.height);
        this.cameras.main.setBackgroundColor(zone.backgroundColor);
        // Clear old entities
        this.clearAllEntities();
      }
    });

    on('player:died', () => {
      // Brief pause, then respawn
      this.cameras.main.flash(500, 255, 0, 0);
    });

    on('player:levelUp', (data) => {
      // Flash screen gold on level up
      this.cameras.main.flash(300, 255, 215, 0, false);
      // Show level up text at player position
      const p = getPlayer();
      const text = this.add.text(p.x, p.y - 40, `Level ${data.level}!`, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#fbbf24',
        stroke: '#000',
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(50);
      this.tweens.add({
        targets: text,
        y: p.y - 100,
        alpha: 0,
        duration: 1500,
        onComplete: () => text.destroy(),
      });
    });

    // --- Auto-unlock and equip starter skills ---
    skills.unlockSkill('heavy_slash');
    skills.unlockSkill('shadow_step');
    skills.equipSkill('heavy_slash', 0);
    skills.equipSkill('shadow_step', 3);

    // --- Welcome toast ---
    const p = getPlayer();
    const toast = this.add.text(p.x, p.y - 50, '1: Heavy Slash | 4: Dash | Space: Dodge | Tab: Inventory', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      backgroundColor: 'rgba(0,0,0,0.5)',
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setDepth(50);
    this.tweens.add({
      targets: toast,
      alpha: 0,
      delay: 4000,
      duration: 1000,
      onComplete: () => toast.destroy(),
    });

    // --- Enter the starting zone (triggers monster spawning) ---
    zones.enterZone(state.activeZoneId);

    // --- Launch UI overlay ---
    this.scene.launch('UIScene');
  }

  update(time: number, delta: number): void {
    const dt = delta / 1000;
    const state = getState();

    if (state.isPaused) return;

    state.gameTime += dt;

    // --- Relay input to movement system ---
    this.relayInput();

    // --- Update all systems ---
    movement.update(dt);
    combat.update(dt);
    health.update(dt);
    energy.update(dt);
    playerSys.update(dt);
    skills.update(dt);
    skillEffects.update(dt);
    skillPassives.update(dt);
    statusEffects.update(dt);
    items.update(dt);
    itemGen.update(dt);
    itemEffects.update(dt);
    progression.update(dt);
    economy.update(dt);
    loot.update(dt);
    monsterAI.update(dt);
    zones.update(dt);

    // --- Update entities ---
    this.playerEntity.update(dt);

    // Sync monster entities with state
    for (const monster of state.monsters) {
      let entity = this.monsterEntities.get(monster.id);
      if (!entity && !monster.isDead) {
        entity = this.createMonsterEntity(monster);
      }
      if (entity) {
        entity.update(dt);
      }
    }

    // Clean up entities for removed monsters (Set avoids O(N*M) .find())
    const monsterIds = new Set(state.monsters.map(m => m.id));
    for (const [id, entity] of this.monsterEntities) {
      if (!monsterIds.has(id)) {
        entity.destroy();
        this.monsterEntities.delete(id);
      }
    }

    // Sync projectile entities
    for (const proj of state.projectiles) {
      let entity = this.projectileEntities.get(proj.id);
      if (!entity && !proj.isExpired) {
        entity = this.createProjectileEntity(proj);
      }
      if (entity) {
        entity.update(dt);
      }
    }

    // Clean up expired projectile entities
    const projectileIds = new Set(state.projectiles.map(p => p.id));
    for (const [id, entity] of this.projectileEntities) {
      if (!projectileIds.has(id)) {
        entity.destroy();
        this.projectileEntities.delete(id);
      }
    }

    // Sync loot sprites
    const activeDrops = loot.getActiveLootDrops();
    for (const drop of activeDrops) {
      if (!this.lootSprites.has(drop.item.id) && !drop.isPickedUp) {
        this.createLootSprite(drop.item.id, drop.x, drop.y);
      }
      // Update loot position (magnet effect moves them)
      const sprite = this.lootSprites.get(drop.item.id);
      if (sprite && !drop.isPickedUp) {
        sprite.setPosition(drop.x, drop.y);
      }
    }
    // Clean up picked-up loot sprites
    const activeLootIds = new Set(activeDrops.filter(d => !d.isPickedUp).map(d => d.item.id));
    for (const [id, sprite] of this.lootSprites) {
      if (!activeLootIds.has(id)) {
        sprite.destroy();
        this.lootSprites.delete(id);
      }
    }

    // --- World-space UI ---
    this.damageNumbers.update(dt);
    this.statusIcons.update(dt);
  }

  private relayInput(): void {
    const up = this.cursors.up.isDown || this.keyW.isDown;
    const down = this.cursors.down.isDown || this.keyS.isDown;
    const left = this.cursors.left.isDown || this.keyA.isDown;
    const right = this.cursors.right.isDown || this.keyD.isDown;

    movement.setKeyState('up', up);
    movement.setKeyState('down', down);
    movement.setKeyState('left', left);
    movement.setKeyState('right', right);
    movement.setKeyState('dash', this.keySpace.isDown);

    // Mouse position in world coords
    const pointer = this.input.activePointer;
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    movement.setMouseWorldPos(worldPoint.x, worldPoint.y);
    movement.setMousePressed(pointer.isDown);
  }

  private createMonsterEntity(monster: MonsterInstance): MonsterEntity {
    const entity = new MonsterEntity(this, monster);
    this.monsterEntities.set(monster.id, entity);
    return entity;
  }

  private createProjectileEntity(proj: ProjectileInstance): Projectile {
    const entity = new Projectile(this, proj);
    this.projectileEntities.set(proj.id, entity);
    return entity;
  }

  private createLootSprite(itemId: string, x: number, y: number): void {
    if (this.lootSprites.has(itemId)) return;
    const sprite = this.add.sprite(x, y, 'loot_bag').setDepth(5);
    // Gentle bob animation
    this.tweens.add({
      targets: sprite,
      y: y - 4,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.lootSprites.set(itemId, sprite);
  }

  private clearAllEntities(): void {
    for (const [, entity] of this.monsterEntities) {
      entity.destroy();
    }
    this.monsterEntities.clear();

    for (const [, entity] of this.projectileEntities) {
      entity.destroy();
    }
    this.projectileEntities.clear();

    for (const [, sprite] of this.lootSprites) {
      sprite.destroy();
    }
    this.lootSprites.clear();

    if (this.vfxManager) {
      this.vfxManager.destroy();
      this.vfxManager = new VFXManager(this);
    }
  }
}
