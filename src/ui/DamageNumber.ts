// ============================================================================
// DamageNumber — Floating damage numbers that rise and fade
// ============================================================================

import Phaser from 'phaser';
import type { DamageType } from '@/core/types';
import { on } from '@/core/event-bus';
import {
  DAMAGE_NUMBER_DURATION,
  DAMAGE_NUMBER_RISE_SPEED,
  DAMAGE_NUMBER_CRIT_SCALE,
  COLORS,
} from '@/data/constants';

interface DamageNumberDisplay {
  text: Phaser.GameObjects.Text;
  lifetime: number;
  maxLifetime: number;
  velocityY: number;
}

export class DamageNumberManager {
  private scene: Phaser.Scene;
  private numbers: DamageNumberDisplay[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Subscribe to damage number events
    on('ui:damageNumber', this.onDamageNumber);
  }

  private onDamageNumber = (data: {
    x: number;
    y: number;
    amount: number;
    isCrit: boolean;
    damageType: DamageType;
    isHeal?: boolean;
  }): void => {
    this.spawn(data.x, data.y, data.amount, data.isCrit, data.damageType, data.isHeal);
  };

  /**
   * Create a floating damage number at the specified world position.
   */
  spawn(
    x: number,
    y: number,
    amount: number,
    isCrit: boolean,
    damageType: DamageType,
    isHeal?: boolean
  ): void {
    // Determine color
    let color: string;
    if (isHeal) {
      color = COLORS.heal;
    } else if (isCrit) {
      color = COLORS.crit;
    } else if (damageType === 'physical') {
      color = COLORS.physical;
    } else {
      color = COLORS.magic;
    }

    // Build text string
    let displayText = `${Math.round(amount)}`;
    if (isCrit) displayText += '!';
    if (isHeal) displayText = `+${displayText}`;

    // Font size: base 18px, crits are larger
    const baseFontSize = 18;
    const fontSize = isCrit
      ? Math.round(baseFontSize * DAMAGE_NUMBER_CRIT_SCALE)
      : baseFontSize;

    // Slight random horizontal offset to prevent stacking
    const offsetX = (Math.random() - 0.5) * 30;
    const offsetY = (Math.random() - 0.5) * 10;

    const text = this.scene.add.text(
      x + offsetX,
      y + offsetY - 10,
      displayText,
      {
        fontFamily: 'monospace',
        fontSize: `${fontSize}px`,
        color,
        stroke: '#000000',
        strokeThickness: isCrit ? 4 : 3,
        fontStyle: isCrit ? 'bold' : 'normal',
      }
    );
    text.setOrigin(0.5, 0.5);
    text.setDepth(50);

    this.numbers.push({
      text,
      lifetime: DAMAGE_NUMBER_DURATION,
      maxLifetime: DAMAGE_NUMBER_DURATION,
      velocityY: -DAMAGE_NUMBER_RISE_SPEED,
    });
  }

  /**
   * Update all active damage numbers: move upward, reduce alpha, remove expired.
   */
  update(dt: number): void {
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const num = this.numbers[i];
      num.lifetime -= dt;

      // Move upward
      num.text.y += num.velocityY * dt;

      // Slow down vertical speed over time
      num.velocityY *= 0.97;

      // Fade out based on remaining lifetime
      const progress = 1 - (num.lifetime / num.maxLifetime);
      if (progress > 0.5) {
        // Start fading in the second half of lifetime
        const fadeProgress = (progress - 0.5) * 2; // 0 to 1
        num.text.setAlpha(1 - fadeProgress);
      }

      // Remove expired numbers
      if (num.lifetime <= 0) {
        num.text.destroy();
        this.numbers.splice(i, 1);
      }
    }
  }

  /**
   * Clean up all active damage numbers.
   */
  destroy(): void {
    for (const num of this.numbers) {
      num.text.destroy();
    }
    this.numbers.length = 0;
  }
}
