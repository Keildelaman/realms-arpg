// ============================================================================
// MonsterEntity — Phaser sprite wrapper for monsters with overhead HP bar
// ============================================================================

import Phaser from 'phaser';
import type { MonsterInstance, DamageType } from '@/core/types';
import { getMonsterById } from '@/core/game-state';
import { on } from '@/core/event-bus';
import {
  DEATH_ANIMATION_DURATION,
  HIT_FLASH_DURATION,
  COLORS,
} from '@/data/constants';

// --- Layout constants (local to this component) ---
const MONSTER_HP_BAR_WIDTH = 40;
const MONSTER_HP_BAR_HEIGHT = 4;
const MONSTER_HP_BAR_OFFSET = -8;

export class MonsterEntity {
  sprite: Phaser.Physics.Arcade.Sprite;
  hpBar: Phaser.GameObjects.Graphics;
  hpBarBg: Phaser.GameObjects.Graphics;
  shieldBar: Phaser.GameObjects.Graphics | null = null;
  nameText: Phaser.GameObjects.Text | null = null;
  windupIndicator: Phaser.GameObjects.Graphics | null = null;
  scene: Phaser.Scene;
  monsterId: string;

  private hitFlashTimer: number = 0;
  private isDying: boolean = false;
  private deathTimer: number = 0;
  private statusTintApplied: boolean = false;
  private textureKey: string;

  constructor(scene: Phaser.Scene, monster: MonsterInstance) {
    this.scene = scene;
    this.monsterId = monster.id;

    // Create a dynamically colored texture for this monster
    this.textureKey = `monster_${monster.definitionId}`;
    if (!scene.textures.exists(this.textureKey)) {
      const gfx = scene.add.graphics();
      const colorNum = Phaser.Display.Color.HexStringToColor(monster.color).color;
      gfx.fillStyle(colorNum, 1);
      gfx.fillRect(0, 0, monster.size, monster.size);
      gfx.generateTexture(this.textureKey, monster.size, monster.size);
      gfx.destroy();
    }

    // Create sprite at monster position
    this.sprite = scene.physics.add.sprite(monster.x, monster.y, this.textureKey);
    this.sprite.setDisplaySize(monster.size, monster.size);
    this.sprite.setDepth(5);

    // Set up physics body
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(monster.size, monster.size);
    body.setImmovable(false);

    // Create HP bar background
    this.hpBarBg = scene.add.graphics();
    this.hpBarBg.setDepth(15);

    // Create HP bar foreground
    this.hpBar = scene.add.graphics();
    this.hpBar.setDepth(16);

    // If shielded, create shield bar
    if (monster.maxShield > 0) {
      this.shieldBar = scene.add.graphics();
      this.shieldBar.setDepth(16);
    }

    // If boss, create name text
    if (monster.isBoss) {
      this.nameText = scene.add.text(monster.x, monster.y, monster.name, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ffdd44',
        stroke: '#000000',
        strokeThickness: 2,
      });
      this.nameText.setOrigin(0.5, 1);
      this.nameText.setDepth(17);

      // Make boss sprites slightly bigger visually
      this.sprite.setDisplaySize(monster.size * 1.3, monster.size * 1.3);
    }

    // Draw initial HP bar
    this.drawHPBar(monster);
  }

  update(dt: number): void {
    const monster = getMonsterById(this.monsterId);
    if (!monster) return;

    // Handle death animation
    if (this.isDying) {
      this.deathTimer -= dt;
      const progress = 1 - (this.deathTimer / DEATH_ANIMATION_DURATION);
      const scale = Math.max(0, 1 - progress);
      this.sprite.setScale(scale);
      this.sprite.setAlpha(1 - progress);

      // Update HP bar position even while dying (to stay in place)
      this.updateBarPositions(monster);

      if (this.deathTimer <= 0) {
        this.destroy();
      }
      return;
    }

    // Sync position from MonsterInstance (AI updates state, entity follows)
    this.sprite.setPosition(monster.x, monster.y);

    // Update HP bar
    this.drawHPBar(monster);
    this.updateBarPositions(monster);

    // Update hit flash
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
      if (this.hitFlashTimer <= 0) {
        this.hitFlashTimer = 0;
        this.sprite.clearTint();
        this.statusTintApplied = false;
      }
    }

    // Apply status effect tints (only when not in hit flash)
    if (this.hitFlashTimer <= 0) {
      this.applyStatusTint(monster);
    }

    // Windup indicator for all monsters
    const isFrozen = monster.statusEffects.some(e => e.type === 'freeze');
    if (monster.isWindingUp && !isFrozen) {
      this.showWindupIndicator(monster);
      // Scale up and tint red during windup
      const baseScale = monster.isBoss ? 1.3 : 1.0;
      this.sprite.setScale(baseScale * 1.15);
      if (this.hitFlashTimer <= 0) {
        this.sprite.setTint(0xff4444);
      }
    } else {
      if (this.windupIndicator) {
        this.windupIndicator.destroy();
        this.windupIndicator = null;
      }
      // Reset scale when not winding up
      const baseScale = monster.isBoss ? 1.3 : 1.0;
      const displaySize = monster.size * baseScale;
      this.sprite.setDisplaySize(displaySize, displaySize);
      this.sprite.setScale(baseScale);
    }
  }

  private drawHPBar(monster: MonsterInstance): void {
    // Clear previous drawings
    this.hpBarBg.clear();
    this.hpBar.clear();

    if (monster.isDead) return;

    // HP bar width scales with monster size for bosses
    const barWidth = monster.isBoss ? MONSTER_HP_BAR_WIDTH * 2.5 : MONSTER_HP_BAR_WIDTH;
    const barHeight = monster.isBoss ? MONSTER_HP_BAR_HEIGHT * 1.5 : MONSTER_HP_BAR_HEIGHT;

    // Background
    const bgColor = Phaser.Display.Color.HexStringToColor(COLORS.monsterHPBg).color;
    this.hpBarBg.fillStyle(bgColor, 0.8);
    this.hpBarBg.fillRect(-barWidth / 2, 0, barWidth, barHeight);

    // HP fill
    const hpRatio = Math.max(0, monster.currentHP / monster.maxHP);
    const hpColor = Phaser.Display.Color.HexStringToColor(COLORS.monsterHP).color;
    this.hpBar.fillStyle(hpColor, 1);
    this.hpBar.fillRect(-barWidth / 2, 0, barWidth * hpRatio, barHeight);

    // Shield bar
    if (this.shieldBar && monster.maxShield > 0) {
      this.shieldBar.clear();
      const shieldRatio = Math.max(0, monster.currentShield / monster.maxShield);
      if (shieldRatio > 0) {
        const shieldColor = Phaser.Display.Color.HexStringToColor(COLORS.monsterShield).color;
        this.shieldBar.fillStyle(shieldColor, 0.8);
        this.shieldBar.fillRect(
          -barWidth / 2,
          barHeight + 1,
          barWidth * shieldRatio,
          barHeight * 0.6
        );
      }
    }
  }

  private updateBarPositions(monster: MonsterInstance): void {
    const barY = monster.y - monster.size / 2 + MONSTER_HP_BAR_OFFSET;

    this.hpBarBg.setPosition(monster.x, barY);
    this.hpBar.setPosition(monster.x, barY);

    if (this.shieldBar) {
      this.shieldBar.setPosition(monster.x, barY);
    }

    if (this.nameText) {
      this.nameText.setPosition(monster.x, barY - 4);
    }
  }

  private applyStatusTint(monster: MonsterInstance): void {
    if (monster.statusEffects.length === 0) {
      if (this.statusTintApplied) {
        this.sprite.clearTint();
        this.statusTintApplied = false;
      }
      return;
    }

    // Priority: freeze > burn > poison > bleed > slow
    const hasFreezing = monster.statusEffects.some(e => e.type === 'freeze');
    const hasBurning = monster.statusEffects.some(e => e.type === 'burn');
    const hasPoisoned = monster.statusEffects.some(e => e.type === 'poison');
    const hasBleeding = monster.statusEffects.some(e => e.type === 'bleed');
    const hasSlowed = monster.statusEffects.some(e => e.type === 'slow');

    if (hasFreezing) {
      this.sprite.setTint(0x93c5fd);
    } else if (hasBurning) {
      this.sprite.setTint(0xf97316);
    } else if (hasPoisoned) {
      this.sprite.setTint(0x16a34a);
    } else if (hasBleeding) {
      this.sprite.setTint(0xdc2626);
    } else if (hasSlowed) {
      this.sprite.setTint(0x60a5fa);
    }
    this.statusTintApplied = true;
  }

  /** Brief white flash on damage taken */
  flashHit(): void {
    this.sprite.setTint(0xffffff);
    this.hitFlashTimer = HIT_FLASH_DURATION;
  }

  /** Show a floating damage number at this monster's position */
  showDamageNumber(amount: number, isCrit: boolean, damageType: DamageType): void {
    // Damage numbers are managed by the DamageNumberManager in UIScene.
    // This method exists as a convenience hook if needed for entity-specific effects.
  }

  /** Begin death animation — shrink + fade, then destroy */
  playDeathAnimation(): void {
    if (this.isDying) return;
    this.isDying = true;
    this.deathTimer = DEATH_ANIMATION_DURATION;

    // Hide HP bar immediately
    this.hpBarBg.setVisible(false);
    this.hpBar.setVisible(false);
    if (this.shieldBar) this.shieldBar.setVisible(false);
    if (this.nameText) this.nameText.setVisible(false);
    if (this.windupIndicator) {
      this.windupIndicator.destroy();
      this.windupIndicator = null;
    }
  }

  /** Red circle grows during aggressive windup */
  showWindupIndicator(monster?: MonsterInstance): void {
    if (!monster) {
      monster = getMonsterById(this.monsterId) ?? undefined;
      if (!monster) return;
    }

    if (!this.windupIndicator) {
      this.windupIndicator = this.scene.add.graphics();
      this.windupIndicator.setDepth(4);
    }

    this.windupIndicator.clear();

    // Progress of windup: 0 to 1
    const progress = monster.windupDuration > 0
      ? Math.min(1, monster.windupTimer / monster.windupDuration)
      : 0;

    const maxRadius = monster.size * 1.5;
    const currentRadius = maxRadius * progress;

    // Draw expanding red circle
    this.windupIndicator.lineStyle(2, 0xff2222, 0.6 + progress * 0.4);
    this.windupIndicator.strokeCircle(monster.x, monster.y, currentRadius);

    // Fill with semi-transparent red
    this.windupIndicator.fillStyle(0xff2222, 0.1 + progress * 0.2);
    this.windupIndicator.fillCircle(monster.x, monster.y, currentRadius);
  }

  /** Whether this entity is currently playing its death animation */
  get isDeathAnimating(): boolean {
    return this.isDying;
  }

  destroy(): void {
    this.hpBarBg.destroy();
    this.hpBar.destroy();
    if (this.shieldBar) this.shieldBar.destroy();
    if (this.nameText) this.nameText.destroy();
    if (this.windupIndicator) this.windupIndicator.destroy();
    this.sprite.destroy();
  }
}
