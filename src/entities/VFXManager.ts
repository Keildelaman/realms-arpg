// ============================================================================
// VFXManager — Visual effects for combat impacts, attack arcs, and feedback
// ============================================================================

import Phaser from 'phaser';
import { on, off } from '@/core/event-bus';
import { getPlayer, getMonsterById } from '@/core/game-state';
import type { DamageType } from '@/core/types';
import {
  BASIC_ATTACK_ARC,
  BASIC_ATTACK_RANGE,
  ATTACK_ARC_FILL_ALPHA,
  ATTACK_ARC_THICKNESS,
  ATTACK_ARC_INNER_RATIO,
  ATTACK_ARC_FADE_DURATION,
  WHIFF_ARC_ALPHA,
  WHIFF_ARC_FADE_DURATION,
  IMPACT_PARTICLE_COUNT,
  IMPACT_PARTICLE_CRIT_COUNT,
  IMPACT_PARTICLE_SPEED,
  IMPACT_PARTICLE_LIFESPAN,
  IMPACT_PARTICLE_SIZE,
  SCREEN_SHAKE_HIT_DURATION,
  SCREEN_SHAKE_HIT_INTENSITY,
  SCREEN_SHAKE_CRIT_DURATION,
  SCREEN_SHAKE_CRIT_INTENSITY,
  COLORS,
} from '@/data/constants';

export class VFXManager {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    on('combat:impact', this.onImpact);
    on('combat:attackSwing', this.onAttackSwing);
    on('combat:miss', this.onMiss);
    on('monster:detonated', this.onDetonated);
    on('affix:frostNova', this.onFrostNova);
    on('affix:teleport', this.onTeleport);
    on('affix:vampiricHeal', this.onVampiricHeal);
  }

  // --- Attack arc (filled wedge) ---

  private onAttackSwing = (data: { angle: number; duration: number }): void => {
    const player = getPlayer();
    const gfx = this.scene.add.graphics();
    gfx.setDepth(11);

    const halfArcRad = (BASIC_ATTACK_ARC / 2) * (Math.PI / 180);
    const startAngle = data.angle - halfArcRad;
    const endAngle = data.angle + halfArcRad;
    const outerR = BASIC_ATTACK_RANGE;
    const innerR = outerR * ATTACK_ARC_INNER_RATIO;

    // Filled wedge
    const physColor = Phaser.Display.Color.HexStringToColor(COLORS.physical).color;
    gfx.fillStyle(physColor, ATTACK_ARC_FILL_ALPHA);
    gfx.beginPath();
    gfx.arc(player.x, player.y, innerR, startAngle, endAngle, false);
    gfx.arc(player.x, player.y, outerR, endAngle, startAngle, true);
    gfx.closePath();
    gfx.fillPath();

    // Bright outer edge
    gfx.lineStyle(ATTACK_ARC_THICKNESS, 0xffffff, 0.7);
    gfx.beginPath();
    gfx.arc(player.x, player.y, outerR, startAngle, endAngle, false);
    gfx.strokePath();

    // Inner highlight
    gfx.lineStyle(2, physColor, 0.5);
    gfx.beginPath();
    gfx.arc(player.x, player.y, innerR, startAngle, endAngle, false);
    gfx.strokePath();

    this.scene.tweens.add({
      targets: gfx,
      alpha: 0,
      duration: ATTACK_ARC_FADE_DURATION,
      onComplete: () => gfx.destroy(),
    });
  };

  // --- Whiff arc (dimmer, faster) ---

  private onMiss = (_data: { targetId: string; x: number; y: number }): void => {
    const player = getPlayer();
    const gfx = this.scene.add.graphics();
    gfx.setDepth(11);

    const angle = player.facingAngle;
    const halfArcRad = (BASIC_ATTACK_ARC / 2) * (Math.PI / 180);
    const startAngle = angle - halfArcRad;
    const endAngle = angle + halfArcRad;
    const outerR = BASIC_ATTACK_RANGE;
    const innerR = outerR * ATTACK_ARC_INNER_RATIO;

    const physColor = Phaser.Display.Color.HexStringToColor(COLORS.physical).color;
    gfx.fillStyle(physColor, WHIFF_ARC_ALPHA);
    gfx.beginPath();
    gfx.arc(player.x, player.y, innerR, startAngle, endAngle, false);
    gfx.arc(player.x, player.y, outerR, endAngle, startAngle, true);
    gfx.closePath();
    gfx.fillPath();

    gfx.lineStyle(3, 0xffffff, 0.2);
    gfx.beginPath();
    gfx.arc(player.x, player.y, outerR, startAngle, endAngle, false);
    gfx.strokePath();

    this.scene.tweens.add({
      targets: gfx,
      alpha: 0,
      duration: WHIFF_ARC_FADE_DURATION,
      onComplete: () => gfx.destroy(),
    });
  };

  // --- Impact particles + screen shake ---

  private onImpact = (data: {
    x: number;
    y: number;
    angle: number;
    damage: number;
    isCrit: boolean;
    damageType: DamageType;
    targetId: string;
  }): void => {
    // Camera shake
    const shakeDuration = data.isCrit ? SCREEN_SHAKE_CRIT_DURATION : SCREEN_SHAKE_HIT_DURATION;
    const shakeIntensity = data.isCrit ? SCREEN_SHAKE_CRIT_INTENSITY : SCREEN_SHAKE_HIT_INTENSITY;
    this.scene.cameras.main.shake(shakeDuration, shakeIntensity);

    // Spawn impact spark particles
    const count = data.isCrit ? IMPACT_PARTICLE_CRIT_COUNT : IMPACT_PARTICLE_COUNT;
    const baseColor = data.isCrit ? 0xfbbf24 : (data.damageType === 'physical' ? 0xf97316 : 0xa855f7);

    for (let i = 0; i < count; i++) {
      // Spread particles outward from impact point with some randomness
      const spreadAngle = data.angle + (Math.random() - 0.5) * Math.PI;
      const speed = IMPACT_PARTICLE_SPEED * (0.5 + Math.random() * 0.5);
      const vx = Math.cos(spreadAngle) * speed;
      const vy = Math.sin(spreadAngle) * speed;

      const particle = this.scene.add.circle(
        data.x,
        data.y,
        IMPACT_PARTICLE_SIZE * (data.isCrit ? 1.5 : 1),
        baseColor,
        1,
      );
      particle.setDepth(12);

      this.scene.tweens.add({
        targets: particle,
        x: data.x + vx * (IMPACT_PARTICLE_LIFESPAN / 1000),
        y: data.y + vy * (IMPACT_PARTICLE_LIFESPAN / 1000),
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: IMPACT_PARTICLE_LIFESPAN,
        ease: 'Power2',
        onComplete: () => particle.destroy(),
      });
    }
  };

  // --- Exploder detonation VFX ---

  private onDetonated = (data: {
    monsterId: string;
    x: number;
    y: number;
    radius: number;
    damage: number;
    hitPlayer: boolean;
  }): void => {
    // Expanding explosion circle
    const gfx = this.scene.add.graphics();
    gfx.setDepth(12);
    gfx.fillStyle(0xff4400, 0.4);
    gfx.fillCircle(data.x, data.y, data.radius);
    gfx.lineStyle(3, 0xff6600, 0.8);
    gfx.strokeCircle(data.x, data.y, data.radius);

    this.scene.tweens.add({
      targets: gfx,
      alpha: 0,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 400,
      onComplete: () => gfx.destroy(),
    });

    // Particle burst
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12;
      const speed = 100 + Math.random() * 80;
      const particle = this.scene.add.circle(data.x, data.y, 3, 0xff6600, 1);
      particle.setDepth(12);

      this.scene.tweens.add({
        targets: particle,
        x: data.x + Math.cos(angle) * speed,
        y: data.y + Math.sin(angle) * speed,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: 350,
        onComplete: () => particle.destroy(),
      });
    }

    // Camera shake
    this.scene.cameras.main.shake(150, 0.005);
  };

  // --- Frost nova VFX ---

  private onFrostNova = (data: { x: number; y: number; radius: number }): void => {
    // Expanding blue ring
    const gfx = this.scene.add.graphics();
    gfx.setDepth(12);
    gfx.fillStyle(0x93c5fd, 0.3);
    gfx.fillCircle(data.x, data.y, data.radius);
    gfx.lineStyle(2, 0x60a5fa, 0.7);
    gfx.strokeCircle(data.x, data.y, data.radius);

    this.scene.tweens.add({
      targets: gfx,
      alpha: 0,
      scaleX: 1.4,
      scaleY: 1.4,
      duration: 500,
      onComplete: () => gfx.destroy(),
    });

    // Ice particles
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const dist = data.radius * 0.6 + Math.random() * data.radius * 0.4;
      const particle = this.scene.add.circle(
        data.x + Math.cos(angle) * dist * 0.3,
        data.y + Math.sin(angle) * dist * 0.3,
        2,
        0xbfdbfe,
        1,
      );
      particle.setDepth(12);

      this.scene.tweens.add({
        targets: particle,
        x: data.x + Math.cos(angle) * dist,
        y: data.y + Math.sin(angle) * dist,
        alpha: 0,
        duration: 400,
        onComplete: () => particle.destroy(),
      });
    }
  };

  // --- Teleport VFX ---

  private onTeleport = (data: {
    monsterId: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  }): void => {
    // Purple flash at old position
    const fromFlash = this.scene.add.circle(data.fromX, data.fromY, 15, 0x9333ea, 0.6);
    fromFlash.setDepth(12);
    this.scene.tweens.add({
      targets: fromFlash,
      alpha: 0,
      scaleX: 2,
      scaleY: 2,
      duration: 300,
      onComplete: () => fromFlash.destroy(),
    });

    // Purple flash at new position
    const toFlash = this.scene.add.circle(data.toX, data.toY, 15, 0x9333ea, 0.6);
    toFlash.setDepth(12);
    this.scene.tweens.add({
      targets: toFlash,
      alpha: 0,
      scaleX: 2,
      scaleY: 2,
      duration: 300,
      delay: 50,
      onComplete: () => toFlash.destroy(),
    });
  };

  // --- Vampiric heal VFX ---

  private onVampiricHeal = (data: { monsterId: string; amount: number }): void => {
    const monster = getMonsterById(data.monsterId);
    if (!monster) return;

    // Green particles toward monster
    for (let i = 0; i < 4; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 20;
      const startX = monster.x + Math.cos(angle) * dist;
      const startY = monster.y + Math.sin(angle) * dist;

      const particle = this.scene.add.circle(startX, startY, 2, 0x22c55e, 0.8);
      particle.setDepth(12);

      this.scene.tweens.add({
        targets: particle,
        x: monster.x,
        y: monster.y,
        alpha: 0,
        duration: 300,
        onComplete: () => particle.destroy(),
      });
    }
  };

  destroy(): void {
    off('combat:impact', this.onImpact);
    off('combat:attackSwing', this.onAttackSwing);
    off('combat:miss', this.onMiss);
    off('monster:detonated', this.onDetonated);
    off('affix:frostNova', this.onFrostNova);
    off('affix:teleport', this.onTeleport);
    off('affix:vampiricHeal', this.onVampiricHeal);
  }
}
