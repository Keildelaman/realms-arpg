// ============================================================================
// VFXManager — Visual effects for combat impacts, attack arcs, and feedback
// ============================================================================

import Phaser from 'phaser';
import { on, off } from '@/core/event-bus';
import { getPlayer } from '@/core/game-state';
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

  destroy(): void {
    off('combat:impact', this.onImpact);
    off('combat:attackSwing', this.onAttackSwing);
    off('combat:miss', this.onMiss);
  }
}
