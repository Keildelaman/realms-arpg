// ============================================================================
// XPBar — Thin XP bar at bottom of screen, full width
// ============================================================================

import Phaser from 'phaser';
import { getPlayer } from '@/core/game-state';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  COLORS,
} from '@/data/constants';

// --- Layout constants (local to this component) ---
const XP_BAR_HEIGHT = 14;

export class XPBar extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private fill: Phaser.GameObjects.Graphics;
  private levelText: Phaser.GameObjects.Text;
  private xpText: Phaser.GameObjects.Text;

  private barWidth: number;
  private barY: number;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.setScrollFactor(0);
    this.setDepth(100);

    // Calculate dimensions based on actual game size
    this.barWidth = scene.scale.width || GAME_WIDTH;
    this.barY = (scene.scale.height || GAME_HEIGHT) - XP_BAR_HEIGHT;

    // Background
    this.bg = scene.add.graphics();
    this.add(this.bg);

    // Fill
    this.fill = scene.add.graphics();
    this.add(this.fill);

    // Level text (left side)
    this.levelText = scene.add.text(8, this.barY - 16, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: COLORS.uiText,
      stroke: '#000000',
      strokeThickness: 2,
    });
    this.add(this.levelText);

    // XP progress text (right side)
    this.xpText = scene.add.text(this.barWidth - 8, this.barY - 16, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: COLORS.uiTextDim,
      stroke: '#000000',
      strokeThickness: 2,
    });
    this.xpText.setOrigin(1, 0);
    this.add(this.xpText);

    // Draw background
    this.drawBackground();

    // Handle resize
    scene.scale.on('resize', this.onResize, this);
  }

  private drawBackground(): void {
    this.bg.clear();
    const bgColor = Phaser.Display.Color.HexStringToColor(COLORS.xpBarBg).color;
    this.bg.fillStyle(bgColor, 0.9);
    this.bg.fillRect(0, this.barY, this.barWidth, XP_BAR_HEIGHT);
  }

  private onResize = (gameSize: Phaser.Structs.Size): void => {
    this.barWidth = gameSize.width;
    this.barY = gameSize.height - XP_BAR_HEIGHT;
    this.drawBackground();
    this.levelText.setPosition(8, this.barY - 16);
    this.xpText.setPosition(this.barWidth - 8, this.barY - 16);
  };

  update(_dt: number): void {
    const player = getPlayer();

    // Calculate XP ratio
    const xpRatio = player.xpToNext > 0
      ? Math.min(1, player.xp / player.xpToNext)
      : 0;

    // Redraw fill
    this.fill.clear();
    const fillColor = Phaser.Display.Color.HexStringToColor(COLORS.xpBar).color;
    this.fill.fillStyle(fillColor, 1);
    this.fill.fillRect(0, this.barY, this.barWidth * xpRatio, XP_BAR_HEIGHT);

    // Update texts
    this.levelText.setText(`Lv.${player.level}`);
    this.xpText.setText(`${player.xp} / ${player.xpToNext} XP`);
  }
}
