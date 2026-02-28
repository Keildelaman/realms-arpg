// ============================================================================
// HealthBar — Player HP bar at bottom-left of screen (Diablo/PoE style)
// ============================================================================

import Phaser from 'phaser';
import { getPlayer } from '@/core/game-state';
import { on } from '@/core/event-bus';
import { COLORS, GAME_HEIGHT } from '@/data/constants';

// --- Layout constants (local to this component) ---
const HEALTH_BAR_WIDTH = 240;
const HEALTH_BAR_HEIGHT = 24;

export class HealthBar extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private fill: Phaser.GameObjects.Graphics;
  private border: Phaser.GameObjects.Graphics;
  private hpText: Phaser.GameObjects.Text;
  private labelText: Phaser.GameObjects.Text;
  private pulseGlow: Phaser.GameObjects.Graphics;

  private displayedRatio: number = 1;
  private targetRatio: number = 1;
  private flashTimer: number = 0;
  private pulsePhase: number = 0;

  constructor(scene: Phaser.Scene) {
    const h = scene.scale.height || GAME_HEIGHT;
    super(scene, 16, h - 112);
    scene.add.existing(this);
    this.setScrollFactor(0);
    this.setDepth(100);
    scene.scale.on('resize', this.onResize, this);

    // Pulse glow (behind everything)
    this.pulseGlow = scene.add.graphics();
    this.add(this.pulseGlow);

    // Background bar
    this.bg = scene.add.graphics();
    this.add(this.bg);

    // HP fill
    this.fill = scene.add.graphics();
    this.add(this.fill);

    // Border
    this.border = scene.add.graphics();
    this.add(this.border);

    // HP label
    this.labelText = scene.add.text(6, HEALTH_BAR_HEIGHT / 2, 'HP', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: COLORS.playerHP,
      stroke: '#000000',
      strokeThickness: 2,
    });
    this.labelText.setOrigin(0, 0.5);
    this.add(this.labelText);

    // HP text
    this.hpText = scene.add.text(HEALTH_BAR_WIDTH / 2, HEALTH_BAR_HEIGHT / 2, '', {
      fontFamily: 'monospace',
      fontSize: '15px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    });
    this.hpText.setOrigin(0.5, 0.5);
    this.add(this.hpText);

    // Draw static elements
    this.drawBackground();
    this.drawBorder();

    // Subscribe to damage events for flash effect
    on('player:damaged', this.onDamaged);
  }

  private drawBackground(): void {
    const bgColor = Phaser.Display.Color.HexStringToColor(COLORS.playerHPBg).color;
    this.bg.fillStyle(bgColor, 1);
    this.bg.fillRoundedRect(0, 0, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT, 3);
  }

  private drawBorder(): void {
    this.border.lineStyle(1, 0x666666, 0.6);
    this.border.strokeRoundedRect(0, 0, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT, 3);
  }

  update(dt: number): void {
    const player = getPlayer();
    this.targetRatio = player.maxHP > 0 ? player.currentHP / player.maxHP : 0;

    // Smooth lerp toward target
    const lerpSpeed = 5;
    this.displayedRatio += (this.targetRatio - this.displayedRatio) * lerpSpeed * dt;

    // Clamp
    this.displayedRatio = Math.max(0, Math.min(1, this.displayedRatio));

    // Update flash
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
    }

    // Redraw fill
    this.fill.clear();
    const fillColor = this.flashTimer > 0
      ? 0xff0000
      : Phaser.Display.Color.HexStringToColor(COLORS.playerHP).color;
    this.fill.fillStyle(fillColor, 1);
    const fillWidth = HEALTH_BAR_WIDTH * this.displayedRatio;
    if (fillWidth > 0) {
      this.fill.fillRoundedRect(0, 0, fillWidth, HEALTH_BAR_HEIGHT, 3);
    }

    // Low-HP pulse glow when below 30%
    this.pulseGlow.clear();
    if (this.targetRatio < 0.3 && this.targetRatio > 0) {
      this.pulsePhase += dt * 4;
      const pulseAlpha = 0.3 + Math.sin(this.pulsePhase) * 0.3;
      this.pulseGlow.lineStyle(2, 0xff0000, pulseAlpha);
      this.pulseGlow.strokeRoundedRect(-2, -2, HEALTH_BAR_WIDTH + 4, HEALTH_BAR_HEIGHT + 4, 4);
    }

    // Update text
    this.hpText.setText(`${Math.ceil(player.currentHP)} / ${player.maxHP}`);
  }

  private onDamaged = (): void => {
    this.flashTimer = 0.15;
  };

  private onResize = (gameSize: Phaser.Structs.Size): void => {
    this.setPosition(16, gameSize.height - 112);
  };

  destroy(fromScene?: boolean): void {
    this.scene.scale.off('resize', this.onResize, this);
    super.destroy(fromScene);
  }
}
