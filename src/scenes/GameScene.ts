import Phaser from 'phaser';
import { getState, getPlayer } from '@/core/game-state';
import { on, emit } from '@/core/event-bus';
import type { MonsterInstance, ProjectileInstance, ExpeditionMap } from '@/core/types';
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
import * as monsterAbilities from '@/systems/monster-abilities';
import * as zones from '@/systems/zones';
import * as expeditions from '@/systems/expeditions';

// Entities
import { PlayerEntity } from '@/entities/PlayerEntity';
import { MonsterEntity } from '@/entities/MonsterEntity';
import { Projectile } from '@/entities/Projectile';
import { VFXManager } from '@/entities/VFXManager';

// UI (damage numbers rendered in world space)
import { DamageNumberManager } from '@/ui/DamageNumber';
import { StatusIcons } from '@/ui/StatusIcons';

export class GameScene extends Phaser.Scene {
  private static systemsInitialized = false;

  private playerEntity!: PlayerEntity;
  private monsterEntities: Map<string, MonsterEntity> = new Map();
  private projectileEntities: Map<string, Projectile> = new Map();
  private lootSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private damageNumbers!: DamageNumberManager;
  private statusIcons!: StatusIcons;
  private vfxManager!: VFXManager;
  private expeditionGeometry: Phaser.GameObjects.Graphics | null = null;
  private expeditionWallGroup: Phaser.Physics.Arcade.StaticGroup | null = null;
  private expeditionWallObjects: Phaser.GameObjects.Rectangle[] = [];
  private activeTelegraphs: Map<string, { graphics: Phaser.GameObjects.Graphics; duration: number; elapsed: number; radius?: number }> = new Map();
  private targetIndicator: Phaser.GameObjects.Graphics | null = null;

  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private skillKeys!: Phaser.Input.Keyboard.Key[];
  private extractionPortalGraphics: Phaser.GameObjects.Graphics | null = null;
  private extractionPromptText: Phaser.GameObjects.Text | null = null;
  private chestGraphicsById: Map<string, Phaser.GameObjects.Graphics> = new Map();

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    if (!GameScene.systemsInitialized) {
      // --- Register monster definitions ---
      for (const def of Object.values(MONSTERS)) {
        zones.registerMonster(def);
      }

      // --- Initialize all systems once ---
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
      monsterAbilities.init();
      zones.init();
      expeditions.init();

      // --- Inject loot generators (avoids system-to-system imports) ---
      loot.setItemGenerators(
        (tier: number) => itemGen.generateItem(tier),
        (tier: number) => itemGen.generateBossItem(tier),
      );

      GameScene.systemsInitialized = true;
    }

    const state = getState();
    this.refreshWorldFromState();

    // --- Create player entity ---
    const player = getPlayer();
    this.playerEntity = new PlayerEntity(this, player.x, player.y);
    if (this.expeditionWallGroup) {
      this.physics.add.collider(this.playerEntity.sprite, this.expeditionWallGroup);
    }
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
    this.keyE = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keySpace = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.skillKeys = [
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR),
    ];

    // Skill key bindings — keys 1-4 map to slots 2-5
    this.skillKeys.forEach((key, index) => {
      key.on('down', () => {
        this.activateSlotSkill(index + 2);
      });
    });

    // RMB handling
    this.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        this.activateSlotSkill(1);
      } else if (pointer.leftButtonDown()) {
        this.handleLeftClickTarget(pointer);
      }
    });

    this.events.on('wake', () => {
      this.refreshWorldFromState();
      this.clearAllEntities();
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

      // Auto-clear target if focused monster died
      const state = getState();
      if (state.player.targetMonsterId === data.monsterId) {
        state.player.targetMonsterId = null;
        emit('player:targetChanged', { monsterId: null });
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

    on('expedition:launched', () => {
      this.refreshWorldFromState();
      this.clearAllEntities();
      this.clearExtractionPortalVisuals();
      this.clearChestVisuals();
    });

    on('expedition:returnHub', () => {
      this.clearAllEntities();
      this.clearExtractionPortalVisuals();
      this.clearChestVisuals();
      if (this.expeditionGeometry) {
        this.expeditionGeometry.destroy();
        this.expeditionGeometry = null;
      }
      this.clearExpeditionWalls();

      if (this.scene.isSleeping('HubScene')) {
        this.scene.wake('HubScene');
      } else if (!this.scene.isActive('HubScene')) {
        this.scene.launch('HubScene');
      }

      this.scene.sleep();
    });

    on('player:died', () => {
      // Brief pause, then respawn
      this.cameras.main.flash(500, 255, 0, 0);
    });

    on('expedition:readyToExtract', () => {
      this.ensureExtractionPortalVisuals();
    });

    // --- Telegraph rendering ---
    on('telegraph:created', (data) => {
      const gfx = this.add.graphics();
      gfx.setDepth(3);
      this.activeTelegraphs.set(data.id, {
        graphics: gfx,
        duration: data.duration,
        elapsed: 0,
        radius: data.radius,
      });
    });

    on('telegraph:expired', (data) => {
      const telegraph = this.activeTelegraphs.get(data.id);
      if (telegraph) {
        telegraph.graphics.destroy();
        this.activeTelegraphs.delete(data.id);
      }
    });

    on('monster:abilityCastComplete', (data) => {
      // Clean up any lingering telegraphs for this monster
      for (const [id, telegraph] of this.activeTelegraphs) {
        if (id.includes(data.monsterId)) {
          telegraph.graphics.destroy();
          this.activeTelegraphs.delete(id);
        }
      }
    });

    on('monster:abilityCancelled', (data) => {
      for (const [id, telegraph] of this.activeTelegraphs) {
        if (id.includes(data.monsterId)) {
          telegraph.graphics.destroy();
          this.activeTelegraphs.delete(id);
        }
      }
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
    skills.unlockSkill('basic_attack');
    skills.equipSkill('basic_attack', 0);
    skills.unlockSkill('heavy_slash');
    skills.unlockSkill('shadow_step');
    skills.equipSkill('heavy_slash', 2);
    skills.equipSkill('shadow_step', 5);

    // --- Welcome toast ---
    const p = getPlayer();
    const toast = this.add.text(p.x, p.y - 50, 'LMB: Attack | 1: Heavy Slash | 4: Dash | Space: Dodge | Tab: Inventory', {
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

    // --- Launch UI overlay ---
    if (!this.scene.isActive('UIScene')) {
      this.scene.launch('UIScene');
    }
  }

  update(time: number, delta: number): void {
    const dt = delta / 1000;
    const state = getState();

    if (state.isPaused) return;
    if (state.gameMode !== 'expedition') return;

    state.gameTime += dt;

    // --- Relay input to movement system ---
    this.relayInput();

    // --- LMB → slot 0 ---
    if (movement.consumeMouseJustPressed()) {
      this.activateSlotSkill(0);
    }

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
    expeditions.update(dt);
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

    // --- Update telegraphs ---
    for (const [id, telegraph] of this.activeTelegraphs) {
      telegraph.elapsed += dt;
      const progress = Math.min(1, telegraph.elapsed / telegraph.duration);

      telegraph.graphics.clear();

      // Draw expanding fill with increasing alpha
      const alpha = 0.05 + progress * 0.25;
      const flashAlpha = progress > 0.8 ? 0.4 + (progress - 0.8) * 3 : 0;

      if (telegraph.radius) {
        telegraph.graphics.fillStyle(0xff2222, alpha + flashAlpha);
        telegraph.graphics.fillCircle(0, 0, telegraph.radius * progress);
        telegraph.graphics.lineStyle(2, 0xff4444, 0.4 + progress * 0.4);
        telegraph.graphics.strokeCircle(0, 0, telegraph.radius);
      }

      // Auto-expire
      if (telegraph.elapsed >= telegraph.duration) {
        telegraph.graphics.destroy();
        this.activeTelegraphs.delete(id);
      }
    }

    // --- Target indicator ---
    this.updateTargetIndicator();

    // --- World-space UI ---
    this.damageNumbers.update(dt);
    this.statusIcons.update(dt);
    this.updateExpeditionInteractables(dt);
  }

  private activateSlotSkill(slotIndex: number): void {
    const player = getPlayer();
    const skillId = player.activeSkills[slotIndex];
    if (!skillId) return;
    const angle = movement.getPlayerFacingAngle();
    if (skillId === 'basic_attack') {
      emit('combat:playerAttack', { angle });
    } else {
      skills.activateSkill(skillId, angle);
    }
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
    movement.setMousePressed(pointer.leftButtonDown());
  }

  private createMonsterEntity(monster: MonsterInstance): MonsterEntity {
    const entity = new MonsterEntity(this, monster);
    if (this.expeditionWallGroup) {
      this.physics.add.collider(entity.sprite, this.expeditionWallGroup);
    }
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

  private ensureExtractionPortalVisuals(): void {
    if (!this.extractionPortalGraphics) {
      this.extractionPortalGraphics = this.add.graphics().setDepth(6);
    }
    if (!this.extractionPromptText) {
      this.extractionPromptText = this.add.text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#d1fae5',
        stroke: '#000000',
        strokeThickness: 2,
        backgroundColor: 'rgba(0,0,0,0.45)',
        padding: { x: 8, y: 4 },
      })
        .setScrollFactor(0)
        .setDepth(120)
        .setVisible(false);
    }
  }

  private rarityToChestColors(rarity: string): { base: number; trim: number; glow: number } {
    if (rarity === 'legendary') return { base: 0x8a4f00, trim: 0xf59e0b, glow: 0xfbbf24 };
    if (rarity === 'epic') return { base: 0x4c2a78, trim: 0xc084fc, glow: 0xe9d5ff };
    if (rarity === 'rare') return { base: 0x1f4f87, trim: 0x60a5fa, glow: 0xbfdbfe };
    if (rarity === 'uncommon') return { base: 0x1f5d37, trim: 0x4ade80, glow: 0xbbf7d0 };
    return { base: 0x4a3f32, trim: 0xb0b0b0, glow: 0xd4d4d4 };
  }

  private clearChestVisuals(): void {
    for (const [, gfx] of this.chestGraphicsById) {
      gfx.destroy();
    }
    this.chestGraphicsById.clear();
  }

  private updateChestVisuals(): void {
    const chests = expeditions.getActiveChests();
    const activeIds = new Set(chests.map(c => c.id));
    const pulse = 0.72 + 0.28 * Math.sin(this.time.now * 0.005);

    for (const chest of chests) {
      let gfx = this.chestGraphicsById.get(chest.id);
      if (!gfx) {
        gfx = this.add.graphics().setDepth(7);
        this.chestGraphicsById.set(chest.id, gfx);
      }

      const colors = this.rarityToChestColors(chest.rarity);
      const w = 32;
      const h = 22;
      const lidH = 9;
      const x = chest.x - w * 0.5;
      const y = chest.y - h * 0.5;

      gfx.clear();

      // Subtle rarity aura.
      gfx.fillStyle(colors.glow, 0.12 * pulse);
      gfx.fillCircle(chest.x, chest.y, 26 + 3 * pulse);

      // Chest body.
      gfx.fillStyle(colors.base, 1);
      gfx.fillRoundedRect(x, y + lidH, w, h - lidH, 3);
      gfx.fillStyle(colors.trim, 0.9);
      gfx.fillRoundedRect(x, y, w, lidH, 3);

      // Hinges / lock accents.
      gfx.fillStyle(colors.trim, 0.8);
      gfx.fillRect(chest.x - 3, y + lidH + 4, 6, 6);
      gfx.fillRect(x + 5, y + 3, 4, 3);
      gfx.fillRect(x + w - 9, y + 3, 4, 3);

      if (chest.source === 'completion') {
        gfx.lineStyle(2, colors.glow, 0.45 + 0.35 * pulse);
        gfx.strokeCircle(chest.x, chest.y, 22 + 2 * pulse);
      }
    }

    for (const [id, gfx] of this.chestGraphicsById) {
      if (!activeIds.has(id)) {
        gfx.destroy();
        this.chestGraphicsById.delete(id);
      }
    }
  }

  private clearExtractionPortalVisuals(): void {
    if (this.extractionPortalGraphics) {
      this.extractionPortalGraphics.destroy();
      this.extractionPortalGraphics = null;
    }
    if (this.extractionPromptText) {
      this.extractionPromptText.destroy();
      this.extractionPromptText = null;
    }
  }

  private updateExpeditionInteractables(_dt: number): void {
    this.updateChestVisuals();
    this.ensureExtractionPortalVisuals();
    if (!this.extractionPromptText) return;

    const player = getPlayer();
    const pressedInteract = Phaser.Input.Keyboard.JustDown(this.keyE);
    const openableChests = expeditions.getActiveChests();
    let nearestChest: (typeof openableChests)[number] | null = null;
    let nearestChestDistSq = Infinity;
    for (const chest of openableChests) {
      const dx = player.x - chest.x;
      const dy = player.y - chest.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= chest.interactRadius * chest.interactRadius && distSq < nearestChestDistSq) {
        nearestChestDistSq = distSq;
        nearestChest = chest;
      }
    }

    if (nearestChest) {
      if (pressedInteract) {
        expeditions.openChest(nearestChest.id);
      }
      const rarityLabel = nearestChest.rarity.charAt(0).toUpperCase() + nearestChest.rarity.slice(1);
      this.extractionPromptText.setVisible(true);
      this.extractionPromptText.setText(`Press E: Open ${rarityLabel} Chest`);
      this.extractionPromptText.setPosition(
        (this.scale.width - this.extractionPromptText.width) * 0.5,
        26,
      );
    } else {
      this.extractionPromptText.setVisible(false);
    }

    const portal = expeditions.getExtractionPortalPosition();
    if (!portal) {
      if (this.extractionPortalGraphics) {
        this.extractionPortalGraphics.clear();
      }
      return;
    }

    if (!this.extractionPortalGraphics) return;

    const t = this.time.now * 0.0018;
    const pulse = 0.75 + 0.25 * Math.sin(this.time.now * 0.006);
    const innerR = 24 + Math.sin(this.time.now * 0.004) * 3;
    const outerR = 44 + Math.cos(this.time.now * 0.003) * 4;

    this.extractionPortalGraphics.clear();
    this.extractionPortalGraphics.lineStyle(3, 0x2dd4bf, 0.9 * pulse);
    this.extractionPortalGraphics.strokeCircle(portal.x, portal.y, outerR);
    this.extractionPortalGraphics.lineStyle(2, 0x5eead4, 0.8);
    this.extractionPortalGraphics.strokeCircle(portal.x, portal.y, innerR);
    this.extractionPortalGraphics.fillStyle(0x0f766e, 0.16);
    this.extractionPortalGraphics.fillCircle(portal.x, portal.y, innerR - 4);

    for (let i = 0; i < 6; i++) {
      const a = t + (i / 6) * Math.PI * 2;
      const rx = portal.x + Math.cos(a) * (outerR - 2);
      const ry = portal.y + Math.sin(a) * (outerR - 2);
      this.extractionPortalGraphics.fillStyle(0x99f6e4, 0.7);
      this.extractionPortalGraphics.fillCircle(rx, ry, 2);
    }

    const canUse = expeditions.canUseExtractionPortal(player.x, player.y);
    if (!nearestChest && canUse && pressedInteract) {
      const used = expeditions.useExtractionPortal();
      if (used) {
        // Extraction can destroy prompt/graphics via returnHub event in the same frame.
        return;
      }
    }

    if (!nearestChest && canUse) {
      this.extractionPromptText.setVisible(true);
      this.extractionPromptText.setText('Press E: Return to Hub');
      this.extractionPromptText.setPosition(
        (this.scale.width - this.extractionPromptText.width) * 0.5,
        26,
      );
    }
  }

  private handleLeftClickTarget(pointer: Phaser.Input.Pointer): void {
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const state = getState();

    // Find closest monster to click position
    let closestId: string | null = null;
    let closestDist = Infinity;
    const clickPadding = 10; // extra pixels around monster hitbox

    for (const monster of state.monsters) {
      if (monster.isDead) continue;
      const dx = worldPoint.x - monster.x;
      const dy = worldPoint.y - monster.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const hitRadius = monster.size * 0.5 + clickPadding;

      if (d <= hitRadius && d < closestDist) {
        closestDist = d;
        closestId = monster.id;
      }
    }

    // Only update target when clicking ON a monster (preserve target on empty clicks)
    if (closestId !== null && state.player.targetMonsterId !== closestId) {
      state.player.targetMonsterId = closestId;
      emit('player:targetChanged', { monsterId: closestId });
    }
  }

  private updateTargetIndicator(): void {
    const state = getState();
    const targetId = state.player.targetMonsterId;

    if (!targetId) {
      if (this.targetIndicator) {
        this.targetIndicator.destroy();
        this.targetIndicator = null;
      }
      return;
    }

    const monster = state.monsters.find(m => m.id === targetId);
    if (!monster || monster.isDead) {
      if (this.targetIndicator) {
        this.targetIndicator.destroy();
        this.targetIndicator = null;
      }
      state.player.targetMonsterId = null;
      return;
    }

    if (!this.targetIndicator) {
      this.targetIndicator = this.add.graphics();
      this.targetIndicator.setDepth(4);
    }

    this.targetIndicator.clear();

    // Pulsing gold ring around targeted monster
    const radius = monster.size * 0.6 + 6;
    const pulseAlpha = 0.4 + Math.sin(Date.now() * 0.006) * 0.3;
    this.targetIndicator.lineStyle(2, 0xfbbf24, pulseAlpha);
    this.targetIndicator.strokeCircle(monster.x, monster.y, radius);

    // Corner brackets
    const bracketLen = 6;
    const br = radius + 3;
    const corners = [
      { x: monster.x - br, y: monster.y - br, dx: 1, dy: 1 },
      { x: monster.x + br, y: monster.y - br, dx: -1, dy: 1 },
      { x: monster.x - br, y: monster.y + br, dx: 1, dy: -1 },
      { x: monster.x + br, y: monster.y + br, dx: -1, dy: -1 },
    ];

    this.targetIndicator.lineStyle(2, 0xfbbf24, pulseAlpha + 0.2);
    for (const c of corners) {
      this.targetIndicator.beginPath();
      this.targetIndicator.moveTo(c.x + c.dx * bracketLen, c.y);
      this.targetIndicator.lineTo(c.x, c.y);
      this.targetIndicator.lineTo(c.x, c.y + c.dy * bracketLen);
      this.targetIndicator.strokePath();
    }
  }

  private refreshWorldFromState(): void {
    const state = getState();
    const run = state.activeExpedition;

    if (run) {
      const bounds = expeditions.getActiveMapBounds();
      if (bounds) {
        this.physics.world.setBounds(
          run.map.bounds.x,
          run.map.bounds.y,
          bounds.width,
          bounds.height,
        );
        this.cameras.main.setBounds(
          run.map.bounds.x,
          run.map.bounds.y,
          bounds.width,
          bounds.height,
        );
      }

      const zone = ZONES[run.zoneId];
      this.cameras.main.setBackgroundColor(zone?.backgroundColor ?? '#10131a');
      this.drawExpeditionGeometry(run.map);
      this.buildExpeditionWalls(run.map);
      return;
    }

    const zone = ZONES[state.activeZoneId];
    if (zone) {
      this.physics.world.setBounds(0, 0, zone.width, zone.height);
      this.cameras.main.setBounds(0, 0, zone.width, zone.height);
      this.cameras.main.setBackgroundColor(zone.backgroundColor);
    }

    if (this.expeditionGeometry) {
      this.expeditionGeometry.destroy();
      this.expeditionGeometry = null;
    }
    this.clearExpeditionWalls();
    this.clearChestVisuals();
  }

  private drawExpeditionGeometry(map: ExpeditionMap): void {
    if (this.expeditionGeometry) {
      this.expeditionGeometry.destroy();
      this.expeditionGeometry = null;
    }

    const g = this.add.graphics();
    g.setDepth(1);

    const paletteByZone: Record<string, {
      floorBase: number;
      floorMid: number;
      floorHigh: number;
      edgeShade: number;
      wallBase: number;
      wallTop: number;
      clutterA: number;
      clutterB: number;
      outsideBase: number;
      outsideMid: number;
      outsideHigh: number;
      outsideAccent: number;
    }> = {
      whisperwood: {
        floorBase: 0x1f3025,
        floorMid: 0x253a2b,
        floorHigh: 0x2d4533,
        edgeShade: 0x1a261f,
        wallBase: 0x0f1612,
        wallTop: 0x3f5d49,
        clutterA: 0x3d5d45,
        clutterB: 0x5e7f64,
        outsideBase: 0x141f19,
        outsideMid: 0x19271f,
        outsideHigh: 0x213429,
        outsideAccent: 0x355740,
      },
      dusthaven: {
        floorBase: 0x3b3126,
        floorMid: 0x4a3d2e,
        floorHigh: 0x5a4a36,
        edgeShade: 0x2a231a,
        wallBase: 0x18130f,
        wallTop: 0x7d6749,
        clutterA: 0x7c6a52,
        clutterB: 0xa48762,
        outsideBase: 0x221b14,
        outsideMid: 0x2b2218,
        outsideHigh: 0x392d20,
        outsideAccent: 0x5b452c,
      },
      frosthollow: {
        floorBase: 0x22333a,
        floorMid: 0x2a3f47,
        floorHigh: 0x35525d,
        edgeShade: 0x18262c,
        wallBase: 0x10171b,
        wallTop: 0x5b7f8a,
        clutterA: 0x506e77,
        clutterB: 0x79a0ab,
        outsideBase: 0x162126,
        outsideMid: 0x1d2a30,
        outsideHigh: 0x24363e,
        outsideAccent: 0x3f6470,
      },
    };

    const palette = paletteByZone[map.zoneId] ?? {
      floorBase: 0x2b2f3a,
      floorMid: 0x333946,
      floorHigh: 0x3f4757,
      edgeShade: 0x1e2230,
      wallBase: 0x10141d,
      wallTop: 0x5e6c84,
      clutterA: 0x4f5a6e,
      clutterB: 0x7e8ca6,
      outsideBase: 0x171b26,
      outsideMid: 0x1d2331,
      outsideHigh: 0x262e42,
      outsideAccent: 0x3f4e6f,
    };

    const grid = map.grid;
    const cell = grid.cellSize;
    const walk = grid.walkable;
    const width = grid.width;
    const height = grid.height;
    const idx = (x: number, y: number) => y * width + x;

    const noise = (x: number, y: number): number => {
      const n = (x * 73856093) ^ (y * 19349663) ^ (map.seed * 83492791);
      return (n >>> 0) & 0xffff;
    };

    const renderPadX = Math.max(this.cameras.main.width, 320);
    const renderPadY = Math.max(this.cameras.main.height, 240);
    const renderBounds = {
      x: map.bounds.x - renderPadX,
      y: map.bounds.y - renderPadY,
      width: map.bounds.width + renderPadX * 2,
      height: map.bounds.height + renderPadY * 2,
    };

    g.fillStyle(palette.outsideBase, 1);
    g.fillRect(renderBounds.x, renderBounds.y, renderBounds.width, renderBounds.height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const wx = grid.originX + x * cell;
        const wy = grid.originY + y * cell;
        const isWalkable = walk[idx(x, y)] === 1;

        if (isWalkable) {
          const n = noise(x, y) % 10;
          let color = palette.floorMid;
          if (n <= 2) color = palette.floorBase;
          if (n >= 8) color = palette.floorHigh;

          g.fillStyle(color, 1);
          g.fillRect(wx, wy, cell, cell);

          // Slight edge shade for cells touching blocked space.
          let touchingBlocked = false;
          if (x > 0 && walk[idx(x - 1, y)] === 0) touchingBlocked = true;
          if (x < width - 1 && walk[idx(x + 1, y)] === 0) touchingBlocked = true;
          if (y > 0 && walk[idx(x, y - 1)] === 0) touchingBlocked = true;
          if (y < height - 1 && walk[idx(x, y + 1)] === 0) touchingBlocked = true;

          if (touchingBlocked) {
            g.fillStyle(palette.edgeShade, 0.4);
            g.fillRect(wx, wy, cell, cell);
          }
        } else {
          const n = noise(x + 41, y + 79) % 12;
          let outsideColor = palette.outsideMid;
          if (n <= 2) outsideColor = palette.outsideBase;
          if (n >= 9) outsideColor = palette.outsideHigh;
          g.fillStyle(outsideColor, 1);
          g.fillRect(wx, wy, cell, cell);
        }
      }
    }

    const blotchCount = Math.max(90, Math.floor((renderBounds.width * renderBounds.height) / 220000));
    for (let i = 0; i < blotchCount; i++) {
      const fx = noise(i * 3 + 17, i * 7 + 101) / 0xffff;
      const fy = noise(i * 5 + 29, i * 11 + 191) / 0xffff;
      const x = renderBounds.x + fx * renderBounds.width;
      const y = renderBounds.y + fy * renderBounds.height;

      const gx = Math.floor((x - grid.originX) / cell);
      const gy = Math.floor((y - grid.originY) / cell);
      if (gx >= 0 && gx < width && gy >= 0 && gy < height && walk[idx(gx, gy)] === 1) {
        continue;
      }

      const radius = 22 + (noise(i * 13 + 71, i * 17 + 37) % 58);
      const alpha = 0.07 + (noise(i * 19 + 11, i * 23 + 53) % 10) * 0.008;
      const color = (i % 3 === 0) ? palette.outsideAccent : palette.outsideHigh;
      g.fillStyle(color, alpha);
      g.fillCircle(x, y, radius);
    }

    for (const decor of map.decorPoints) {
      if (decor.kind === 'rock') {
        g.fillStyle(palette.clutterA, 0.62);
        g.fillCircle(decor.x, decor.y, 4 * decor.scale);
      } else if (decor.kind === 'tree') {
        g.fillStyle(palette.clutterB, 0.55);
        g.fillCircle(decor.x, decor.y, 6 * decor.scale);
      } else if (decor.kind === 'ruin') {
        g.fillStyle(palette.clutterA, 0.58);
        g.fillRect(decor.x - 5 * decor.scale, decor.y - 4 * decor.scale, 10 * decor.scale, 8 * decor.scale);
      } else {
        g.fillStyle(palette.clutterB, 0.6);
        g.fillRect(decor.x - 2 * decor.scale, decor.y - 2 * decor.scale, 4 * decor.scale, 4 * decor.scale);
      }
    }

    for (const wall of map.wallRects) {
      g.fillStyle(palette.wallBase, 1);
      g.fillRect(wall.x, wall.y, wall.width, wall.height);

      g.fillStyle(palette.wallTop, 0.35);
      g.fillRect(wall.x, wall.y, wall.width, Math.min(6, wall.height));
    }

    const frameInset = 10;
    g.lineStyle(2, palette.outsideAccent, 0.22);
    g.strokeRect(
      map.bounds.x + frameInset,
      map.bounds.y + frameInset,
      Math.max(0, map.bounds.width - frameInset * 2),
      Math.max(0, map.bounds.height - frameInset * 2),
    );

    this.expeditionGeometry = g;
  }

  private buildExpeditionWalls(map: ExpeditionMap): void {
    this.clearExpeditionWalls();

    this.expeditionWallGroup = this.physics.add.staticGroup();
    for (const rect of map.wallRects) {
      const wall = this.add.rectangle(
        rect.x + rect.width * 0.5,
        rect.y + rect.height * 0.5,
        rect.width,
        rect.height,
        0x0b1220,
        0,
      );
      wall.setDepth(2);
      this.physics.add.existing(wall, true);
      this.expeditionWallGroup.add(wall);
      this.expeditionWallObjects.push(wall);
    }

    if (this.playerEntity && this.expeditionWallGroup) {
      this.physics.add.collider(this.playerEntity.sprite, this.expeditionWallGroup);
    }

    for (const [, entity] of this.monsterEntities) {
      if (this.expeditionWallGroup) {
        this.physics.add.collider(entity.sprite, this.expeditionWallGroup);
      }
    }
  }

  private clearExpeditionWalls(): void {
    if (this.expeditionWallGroup) {
      this.expeditionWallGroup.clear(true, true);
      this.expeditionWallGroup = null;
    }

    for (const wall of this.expeditionWallObjects) {
      wall.destroy();
    }
    this.expeditionWallObjects.length = 0;
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
    this.clearChestVisuals();

    for (const [, telegraph] of this.activeTelegraphs) {
      telegraph.graphics.destroy();
    }
    this.activeTelegraphs.clear();

    if (this.targetIndicator) {
      this.targetIndicator.destroy();
      this.targetIndicator = null;
    }

    if (this.vfxManager) {
      this.vfxManager.destroy();
      this.vfxManager = new VFXManager(this);
    }
  }
}
