// ============================================================================
// MonsterEntity — Phaser sprite wrapper for monsters with overhead HP bar
// ============================================================================

import Phaser from 'phaser';
import type { MonsterInstance, DamageType, MonsterRarity } from '@/core/types';
import { getMonsterById } from '@/core/game-state';
import { on, off } from '@/core/event-bus';
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

  // Smooth knockback
  private knockbackTween: Phaser.Tweens.Tween | null = null;
  private isKnockedBack: boolean = false;
  private impactScaleTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, monster: MonsterInstance) {
    this.scene = scene;
    this.monsterId = monster.id;

    // Create a dynamically colored texture for this monster based on shape
    const sizeMult = monster.rarity === 'rare' ? 1.3 : monster.rarity === 'magic' ? 1.15 : 1.0;
    const effectiveSize = Math.floor(monster.size * sizeMult);
    this.textureKey = `monster_${monster.definitionId}_${monster.shape ?? 'square'}_${monster.rarity}`;
    if (!scene.textures.exists(this.textureKey)) {
      const gfx = scene.add.graphics();
      const colorNum = Phaser.Display.Color.HexStringToColor(monster.color).color;
      gfx.fillStyle(colorNum, 1);

      const half = effectiveSize / 2;
      switch (monster.shape) {
        case 'circle':
          gfx.fillCircle(half, half, half);
          break;
        case 'diamond':
          gfx.beginPath();
          gfx.moveTo(half, 0);
          gfx.lineTo(effectiveSize, half);
          gfx.lineTo(half, effectiveSize);
          gfx.lineTo(0, half);
          gfx.closePath();
          gfx.fillPath();
          break;
        case 'triangle':
          gfx.beginPath();
          gfx.moveTo(half, 0);
          gfx.lineTo(effectiveSize, effectiveSize);
          gfx.lineTo(0, effectiveSize);
          gfx.closePath();
          gfx.fillPath();
          break;
        case 'hexagon': {
          gfx.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 6;
            const px = half + Math.cos(angle) * half;
            const py = half + Math.sin(angle) * half;
            if (i === 0) gfx.moveTo(px, py);
            else gfx.lineTo(px, py);
          }
          gfx.closePath();
          gfx.fillPath();
          break;
        }
        case 'square':
        default:
          gfx.fillRect(0, 0, effectiveSize, effectiveSize);
          break;
      }

      gfx.generateTexture(this.textureKey, effectiveSize, effectiveSize);
      gfx.destroy();
    }

    // Create sprite at monster position
    this.sprite = scene.physics.add.sprite(monster.x, monster.y, this.textureKey);
    this.sprite.setDisplaySize(effectiveSize, effectiveSize);
    this.sprite.setDepth(5);

    // Set up physics body
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(effectiveSize, effectiveSize);
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

    // Nameplate for boss, magic, or rare monsters
    const showNameplate = monster.isBoss || monster.rarity === 'magic' || monster.rarity === 'rare';
    if (showNameplate) {
      const nameColor = monster.isBoss ? '#ffdd44'
        : monster.rarity === 'rare' ? '#fbbf24'
        : '#60a5fa';
      this.nameText = scene.add.text(monster.x, monster.y, monster.name, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: nameColor,
        stroke: '#000000',
        strokeThickness: 2,
      });
      this.nameText.setOrigin(0.5, 1);
      this.nameText.setDepth(17);
    }

    // Make boss sprites bigger visually
    if (monster.isBoss) {
      this.sprite.setDisplaySize(effectiveSize * 1.3, effectiveSize * 1.3);
    }

    // Draw initial HP bar
    this.drawHPBar(monster);

    // Listen for knockback events
    on('combat:knockback', this.onKnockback);
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
    // Skip position sync while knockback tween is animating
    if (!this.isKnockedBack) {
      this.sprite.setPosition(monster.x, monster.y);
    }

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

    // Rarity alpha pulse (when not hit-flashing)
    if (this.hitFlashTimer <= 0 && !monster.isWindingUp) {
      if (monster.rarity === 'magic') {
        const pulse = 0.85 + Math.sin(Date.now() * 0.008) * 0.15;
        this.sprite.setAlpha(pulse);
      } else if (monster.rarity === 'rare') {
        const pulse = 0.85 + Math.sin(Date.now() * 0.012) * 0.15;
        this.sprite.setAlpha(pulse);
      }
    }

    // Fuse pulsing for exploders
    if (monster.isFused && this.hitFlashTimer <= 0) {
      const fuseFlash = Math.sin(Date.now() * 0.03) > 0;
      this.sprite.setTint(fuseFlash ? 0xff0000 : 0xff6600);
    }

    // Charge visual for chargers
    if (monster.isCharging && this.hitFlashTimer <= 0) {
      this.sprite.setTint(0xffaa00);
    }

    // Windup indicator for all monsters
    const isFrozen = monster.statusEffects.some(e => e.type === 'freeze');
    if (monster.isWindingUp && !isFrozen) {
      this.showWindupIndicator(monster);
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
      const sizeMult = monster.rarity === 'rare' ? 1.3 : monster.rarity === 'magic' ? 1.15 : 1.0;
      const baseScale = monster.isBoss ? 1.3 : 1.0;
      const displaySize = monster.size * sizeMult * baseScale;
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

    // Stop knockback tweens
    if (this.knockbackTween) {
      this.knockbackTween.stop();
      this.knockbackTween = null;
      this.isKnockedBack = false;
    }
    if (this.impactScaleTween) {
      this.impactScaleTween.stop();
      this.impactScaleTween = null;
    }

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

  // --- Knockback handler ---

  private onKnockback = (data: {
    targetId: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    duration: number;
  }): void => {
    if (data.targetId !== this.monsterId) return;
    if (this.isDying) return;

    // Cancel existing knockback tween
    if (this.knockbackTween) {
      this.knockbackTween.stop();
      this.knockbackTween = null;
    }

    this.isKnockedBack = true;

    // Tween sprite from current position to knockback destination
    this.knockbackTween = this.scene.tweens.add({
      targets: this.sprite,
      x: data.toX,
      y: data.toY,
      duration: data.duration,
      ease: 'Power2',
      onComplete: () => {
        this.isKnockedBack = false;
        this.knockbackTween = null;
      },
    });

    // Cancel existing impact scale tween
    if (this.impactScaleTween) {
      this.impactScaleTween.stop();
      this.impactScaleTween = null;
    }

    // Brief scale pop on impact
    const monster = getMonsterById(this.monsterId);
    const baseScale = monster?.isBoss ? 1.3 : 1.0;

    // Squash on hit
    this.sprite.setScale(baseScale * 1.15, baseScale * 0.85);
    this.impactScaleTween = this.scene.tweens.add({
      targets: this.sprite,
      scaleX: baseScale,
      scaleY: baseScale,
      duration: 120,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.impactScaleTween = null;
      },
    });
  };

  destroy(): void {
    off('combat:knockback', this.onKnockback);

    if (this.knockbackTween) {
      this.knockbackTween.stop();
      this.knockbackTween = null;
    }
    if (this.impactScaleTween) {
      this.impactScaleTween.stop();
      this.impactScaleTween = null;
    }

    this.hpBarBg.destroy();
    this.hpBar.destroy();
    if (this.shieldBar) this.shieldBar.destroy();
    if (this.nameText) this.nameText.destroy();
    if (this.windupIndicator) this.windupIndicator.destroy();
    this.sprite.destroy();
  }
}
