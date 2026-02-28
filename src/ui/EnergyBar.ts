// ============================================================================
// EnergyBar — Player energy bar above HP bar (bottom-left, Diablo/PoE style)
// ============================================================================

import Phaser from 'phaser';
import { getPlayer } from '@/core/game-state';
import { COLORS, GAME_HEIGHT } from '@/data/constants';

// --- Layout constants (local to this component) ---
const ENERGY_BAR_WIDTH = 240;
const ENERGY_BAR_HEIGHT = 18;

export class EnergyBar extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private fill: Phaser.GameObjects.Graphics;
  private border: Phaser.GameObjects.Graphics;
  private energyText: Phaser.GameObjects.Text;
  private labelText: Phaser.GameObjects.Text;

  private displayedRatio: number = 1;

  constructor(scene: Phaser.Scene) {
    const h = scene.scale.height || GAME_HEIGHT;
    super(scene, 16, h - 136);
    scene.add.existing(this);
    this.setScrollFactor(0);
    this.setDepth(100);
    scene.scale.on('resize', this.onResize, this);

    // Background bar
    this.bg = scene.add.graphics();
    this.add(this.bg);

    // Energy fill
    this.fill = scene.add.graphics();
    this.add(this.fill);

    // Border
    this.border = scene.add.graphics();
    this.add(this.border);

    // Energy label
    this.labelText = scene.add.text(6, ENERGY_BAR_HEIGHT / 2, 'EN', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: COLORS.playerEnergy,
      stroke: '#000000',
      strokeThickness: 2,
    });
    this.labelText.setOrigin(0, 0.5);
    this.add(this.labelText);

    // Energy text
    this.energyText = scene.add.text(
      ENERGY_BAR_WIDTH / 2,
      ENERGY_BAR_HEIGHT / 2,
      '',
      {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      }
    );
    this.energyText.setOrigin(0.5, 0.5);
    this.add(this.energyText);

    // Draw static elements
    this.drawBackground();
    this.drawBorder();
  }

  private drawBackground(): void {
    const bgColor = Phaser.Display.Color.HexStringToColor(COLORS.playerEnergyBg).color;
    this.bg.fillStyle(bgColor, 1);
    this.bg.fillRoundedRect(0, 0, ENERGY_BAR_WIDTH, ENERGY_BAR_HEIGHT, 2);
  }

  private drawBorder(): void {
    this.border.lineStyle(1, 0x555555, 0.5);
    this.border.strokeRoundedRect(0, 0, ENERGY_BAR_WIDTH, ENERGY_BAR_HEIGHT, 2);
  }

  update(dt: number): void {
    const player = getPlayer();
    const targetRatio = player.maxEnergy > 0
      ? player.currentEnergy / player.maxEnergy
      : 0;

    // Smooth lerp
    const lerpSpeed = 6;
    this.displayedRatio += (targetRatio - this.displayedRatio) * lerpSpeed * dt;
    this.displayedRatio = Math.max(0, Math.min(1, this.displayedRatio));

    // Redraw fill
    this.fill.clear();
    const fillColor = Phaser.Display.Color.HexStringToColor(COLORS.playerEnergy).color;
    this.fill.fillStyle(fillColor, 1);
    const fillWidth = ENERGY_BAR_WIDTH * this.displayedRatio;
    if (fillWidth > 0) {
      this.fill.fillRoundedRect(0, 0, fillWidth, ENERGY_BAR_HEIGHT, 2);
    }

    // Update text
    this.energyText.setText(
      `${Math.floor(player.currentEnergy)} / ${player.maxEnergy}`
    );
  }

  private onResize = (gameSize: Phaser.Structs.Size): void => {
    this.setPosition(16, gameSize.height - 136);
  };

  destroy(fromScene?: boolean): void {
    this.scene.scale.off('resize', this.onResize, this);
    super.destroy(fromScene);
  }
}
