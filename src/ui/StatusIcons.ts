// ============================================================================
// StatusIcons — Show active status effect icons on monsters
// Small colored dots near their sprite indicating active effects
// ============================================================================

import Phaser from 'phaser';
import type { MonsterInstance, StatusEffectType } from '@/core/types';
import { getState } from '@/core/game-state';
import { COLORS } from '@/data/constants';

/** Color mapping for status effect dots */
const STATUS_COLORS: Record<StatusEffectType, string> = {
  bleed: COLORS.bleed,
  poison: COLORS.poison,
  burn: COLORS.burn,
  slow: COLORS.slow,
  freeze: COLORS.freeze,
};

/** Display order for consistent positioning */
const STATUS_ORDER: StatusEffectType[] = [
  'bleed', 'poison', 'burn', 'slow', 'freeze',
];

const DOT_RADIUS = 3;
const DOT_SPACING = 8;

export class StatusIcons {
  private scene: Phaser.Scene;
  private graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(18);
  }

  /**
   * Redraw all status icons for all alive monsters.
   * Called each frame from the GameScene.
   */
  update(_dt: number): void {
    this.graphics.clear();

    const state = getState();
    const aliveMonsters = state.monsters.filter(m => !m.isDead);

    for (const monster of aliveMonsters) {
      if (monster.statusEffects.length === 0) continue;
      this.drawMonsterStatusDots(monster);
    }
  }

  private drawMonsterStatusDots(monster: MonsterInstance): void {
    // Collect unique active status types
    const activeTypes: StatusEffectType[] = [];
    for (const effectType of STATUS_ORDER) {
      if (monster.statusEffects.some(e => e.type === effectType)) {
        activeTypes.push(effectType);
      }
    }

    if (activeTypes.length === 0) return;

    // Position dots below the monster sprite
    const startX = monster.x - ((activeTypes.length - 1) * DOT_SPACING) / 2;
    const dotY = monster.y + monster.size / 2 + 6;

    for (let i = 0; i < activeTypes.length; i++) {
      const effectType = activeTypes[i];
      const colorHex = STATUS_COLORS[effectType];
      const color = Phaser.Display.Color.HexStringToColor(colorHex).color;
      const dotX = startX + i * DOT_SPACING;

      // Draw filled dot
      this.graphics.fillStyle(color, 1);
      this.graphics.fillCircle(dotX, dotY, DOT_RADIUS);

      // Draw subtle outline
      this.graphics.lineStyle(1, 0x000000, 0.5);
      this.graphics.strokeCircle(dotX, dotY, DOT_RADIUS);

      // For stacking effects, show stack count as tiny number
      const effect = monster.statusEffects.find(e => e.type === effectType);
      if (effect && effect.stacks > 1) {
        // We draw a small number above the dot using a text object
        // But since this is a Graphics-based system for performance,
        // we indicate stacks with concentric rings instead
        this.graphics.lineStyle(1, color, 0.6);
        this.graphics.strokeCircle(dotX, dotY, DOT_RADIUS + 2);
      }
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
