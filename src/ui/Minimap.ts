// ============================================================================
// Minimap — Small minimap in top-right corner
// ============================================================================

import Phaser from 'phaser';
import { getState, getPlayer } from '@/core/game-state';
import { ZONES } from '@/data/zones.data';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
} from '@/data/constants';

const MINIMAP_SIZE = 200;
const MINIMAP_MARGIN = 16;
const MINIMAP_BG_COLOR = 0x1a1a2e;
const MINIMAP_BORDER_COLOR = 0x444444;
const PLAYER_DOT_COLOR = 0x4488ff;
const MONSTER_DOT_COLOR = 0xff4444;
const BOSS_DOT_COLOR = 0xff2222;

export class Minimap extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private dots: Phaser.GameObjects.Graphics;
  private border: Phaser.GameObjects.Graphics;
  private compassLabels: Phaser.GameObjects.Text[] = [];
  private minimapX: number;
  private minimapY: number;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.setScrollFactor(0);
    this.setDepth(100);

    // Position: top-right with margin
    this.minimapX = (scene.scale.width || GAME_WIDTH) - MINIMAP_SIZE - MINIMAP_MARGIN;
    this.minimapY = MINIMAP_MARGIN;

    // Background
    this.bg = scene.add.graphics();
    this.add(this.bg);

    // Dots layer (redrawn each frame)
    this.dots = scene.add.graphics();
    this.add(this.dots);

    // Border
    this.border = scene.add.graphics();
    this.add(this.border);

    // Compass labels
    const compassStyle = { fontFamily: 'monospace', fontSize: '8px', color: '#888888' };
    const labelN = scene.add.text(0, 0, 'N', compassStyle).setOrigin(0.5, 0);
    const labelS = scene.add.text(0, 0, 'S', compassStyle).setOrigin(0.5, 1);
    const labelE = scene.add.text(0, 0, 'E', compassStyle).setOrigin(0, 0.5);
    const labelW = scene.add.text(0, 0, 'W', compassStyle).setOrigin(1, 0.5);
    this.compassLabels = [labelN, labelS, labelE, labelW];
    for (const l of this.compassLabels) this.add(l);

    this.drawStaticElements();

    // Handle resize
    scene.scale.on('resize', this.onResize, this);
  }

  private drawStaticElements(): void {
    // Background
    this.bg.clear();
    this.bg.fillStyle(MINIMAP_BG_COLOR, 0.8);
    this.bg.fillRect(this.minimapX, this.minimapY, MINIMAP_SIZE, MINIMAP_SIZE);

    // Border
    this.border.clear();
    this.border.lineStyle(1, MINIMAP_BORDER_COLOR, 1.0);
    this.border.strokeRect(this.minimapX, this.minimapY, MINIMAP_SIZE, MINIMAP_SIZE);

    // Position compass labels
    const cx = this.minimapX + MINIMAP_SIZE / 2;
    const cy = this.minimapY + MINIMAP_SIZE / 2;
    this.compassLabels[0].setPosition(cx, this.minimapY + 2);          // N
    this.compassLabels[1].setPosition(cx, this.minimapY + MINIMAP_SIZE - 2); // S
    this.compassLabels[2].setPosition(this.minimapX + MINIMAP_SIZE - 3, cy); // E
    this.compassLabels[3].setPosition(this.minimapX + 3, cy);           // W
  }

  private onResize = (gameSize: Phaser.Structs.Size): void => {
    this.minimapX = gameSize.width - MINIMAP_SIZE - MINIMAP_MARGIN;
    this.minimapY = MINIMAP_MARGIN;
    this.drawStaticElements();
  };

  /** Convert world coordinates to minimap coordinates */
  private worldToMinimap(worldX: number, worldY: number): { x: number; y: number } {
    const state = getState();
    const zone = ZONES[state.activeZoneId];
    const zoneWidth = zone ? zone.width : 2400;
    const zoneHeight = zone ? zone.height : 2400;

    const ratioX = Math.max(0, Math.min(1, worldX / zoneWidth));
    const ratioY = Math.max(0, Math.min(1, worldY / zoneHeight));

    return {
      x: this.minimapX + ratioX * MINIMAP_SIZE,
      y: this.minimapY + ratioY * MINIMAP_SIZE,
    };
  }

  update(_dt: number): void {
    const state = getState();
    const player = getPlayer();

    this.dots.clear();

    // Draw monster dots (red, bosses are larger)
    for (const monster of state.monsters) {
      if (monster.isDead) continue;

      const pos = this.worldToMinimap(monster.x, monster.y);

      if (monster.isBoss) {
        // Large red dot for boss
        this.dots.fillStyle(BOSS_DOT_COLOR, 1);
        this.dots.fillCircle(pos.x, pos.y, 6);
        // Pulsing ring
        const pulse = 0.5 + Math.sin(this.scene.time.now / 300) * 0.3;
        this.dots.lineStyle(1, BOSS_DOT_COLOR, pulse);
        this.dots.strokeCircle(pos.x, pos.y, 8);
      } else {
        // Regular monster dot
        this.dots.fillStyle(MONSTER_DOT_COLOR, 0.8);
        this.dots.fillCircle(pos.x, pos.y, 4);
      }
    }

    // Draw player dot (blue) — draw last so it's on top
    const playerPos = this.worldToMinimap(player.x, player.y);
    this.dots.fillStyle(PLAYER_DOT_COLOR, 1);
    this.dots.fillCircle(playerPos.x, playerPos.y, 5);

    // Directional indicator — small line showing facing direction
    const lineLen = 8;
    const endX = playerPos.x + Math.cos(player.facingAngle) * lineLen;
    const endY = playerPos.y + Math.sin(player.facingAngle) * lineLen;
    this.dots.lineStyle(1, PLAYER_DOT_COLOR, 0.8);
    this.dots.beginPath();
    this.dots.moveTo(playerPos.x, playerPos.y);
    this.dots.lineTo(endX, endY);
    this.dots.strokePath();
  }

  destroy(fromScene?: boolean): void {
    this.scene.scale.off('resize', this.onResize, this);
    super.destroy(fromScene);
  }
}
