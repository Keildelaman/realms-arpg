// ============================================================================
// Minimap -- mode-aware minimap for hub and expeditions
// ============================================================================

import Phaser from 'phaser';
import { getState, getPlayer } from '@/core/game-state';
import type { ExpeditionMap } from '@/core/types';
import { ZONES } from '@/data/zones.data';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
} from '@/data/constants';
import { UI_THEME, drawPanelShell, drawSectionCard } from '@/ui/ui-theme';

const MINIMAP_SIZE = 206;
const MINIMAP_MARGIN = 16;
const MINIMAP_INNER_SIZE = 184;
const PLAYER_DOT_COLOR = 0x4488ff;
const MONSTER_DOT_COLOR = 0xff4444;
const BOSS_DOT_COLOR = 0xff2222;

const HUB_WIDTH = 1280;
const HUB_HEIGHT = 720;

export class Minimap extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private dots: Phaser.GameObjects.Graphics;
  private border: Phaser.GameObjects.Graphics;
  private titleText: Phaser.GameObjects.Text;
  private minimapX: number;
  private minimapY: number;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.setScrollFactor(0);
    this.setDepth(100);

    this.minimapX = (scene.scale.width || GAME_WIDTH) - MINIMAP_SIZE - MINIMAP_MARGIN;
    this.minimapY = MINIMAP_MARGIN;

    this.bg = scene.add.graphics();
    this.add(this.bg);

    this.dots = scene.add.graphics();
    this.add(this.dots);

    this.border = scene.add.graphics();
    this.add(this.border);

    this.titleText = scene.add.text(0, 0, 'Map', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: UI_THEME.textDim,
      stroke: '#000000',
      strokeThickness: 1,
    });
    this.add(this.titleText);

    this.drawStaticElements();
    scene.scale.on('resize', this.onResize, this);
  }

  private drawStaticElements(): void {
    this.bg.clear();
    drawPanelShell(this.bg, this.minimapX, this.minimapY, MINIMAP_SIZE, MINIMAP_SIZE, 8);
    drawSectionCard(this.bg, this.minimapX + 10, this.minimapY + 18, MINIMAP_INNER_SIZE, MINIMAP_INNER_SIZE, false, 6);

    this.border.clear();
    this.border.lineStyle(1, 0x334155, 0.95);
    this.border.strokeRoundedRect(this.minimapX + 10, this.minimapY + 18, MINIMAP_INNER_SIZE, MINIMAP_INNER_SIZE, 6);
    this.titleText.setPosition(this.minimapX + 12, this.minimapY + 5);
  }

  private onResize = (gameSize: Phaser.Structs.Size): void => {
    this.minimapX = gameSize.width - MINIMAP_SIZE - MINIMAP_MARGIN;
    this.minimapY = MINIMAP_MARGIN;
    this.drawStaticElements();
  };

  private mapToMinimap(
    worldX: number,
    worldY: number,
    worldWidth: number,
    worldHeight: number,
  ): { x: number; y: number } {
    const ratioX = Math.max(0, Math.min(1, worldX / Math.max(1, worldWidth)));
    const ratioY = Math.max(0, Math.min(1, worldY / Math.max(1, worldHeight)));

    return {
      x: this.minimapX + 10 + ratioX * MINIMAP_INNER_SIZE,
      y: this.minimapY + 18 + ratioY * MINIMAP_INNER_SIZE,
    };
  }

  private drawPlayerDot(worldWidth: number, worldHeight: number): void {
    const player = getPlayer();
    const playerPos = this.mapToMinimap(player.x, player.y, worldWidth, worldHeight);

    this.dots.fillStyle(PLAYER_DOT_COLOR, 1);
    this.dots.fillCircle(playerPos.x, playerPos.y, 5);

    const lineLen = 8;
    const endX = playerPos.x + Math.cos(player.facingAngle) * lineLen;
    const endY = playerPos.y + Math.sin(player.facingAngle) * lineLen;
    this.dots.lineStyle(1, PLAYER_DOT_COLOR, 0.8);
    this.dots.beginPath();
    this.dots.moveTo(playerPos.x, playerPos.y);
    this.dots.lineTo(endX, endY);
    this.dots.strokePath();
  }

  private drawHubView(): void {
    // Stations on hub minimap.
    const stations = [
      { x: 240,  y: 200, color: 0x93c5fd },  // Stash
      { x: 1040, y: 200, color: 0xfbbf24 },  // Blacksmith
      { x: 260,  y: 520, color: 0x86efac },  // Merchant
      { x: 1020, y: 520, color: 0xd8b4fe },  // Dummy
      { x: 640,  y: 560, color: 0x5eead4 },  // Map Device
    ];

    for (const station of stations) {
      const pos = this.mapToMinimap(station.x, station.y, HUB_WIDTH, HUB_HEIGHT);
      this.dots.fillStyle(station.color, 0.9);
      this.dots.fillRect(pos.x - 2, pos.y - 2, 4, 4);
    }

    this.drawPlayerDot(HUB_WIDTH, HUB_HEIGHT);
  }

  private getExpeditionBounds(map: ExpeditionMap): { width: number; height: number } {
    return {
      width: Math.max(1, map.bounds.width),
      height: Math.max(1, map.bounds.height),
    };
  }

  private drawExpeditionView(): void {
    const state = getState();
    const run = state.activeExpedition;
    if (!run) return;

    const bounds = this.getExpeditionBounds(run.map);

    const grid = run.map.grid;
    const step = 2;
    for (let y = 0; y < grid.height; y += step) {
      for (let x = 0; x < grid.width; x += step) {
        const idx = y * grid.width + x;
        if (grid.walkable[idx] !== 1) continue;

        const wx = grid.originX + x * grid.cellSize;
        const wy = grid.originY + y * grid.cellSize;
        const pos = this.mapToMinimap(wx, wy, bounds.width, bounds.height);
        this.dots.fillStyle(0x5b708f, 0.4);
        this.dots.fillRect(pos.x, pos.y, 2, 2);
      }
    }

    for (const monster of state.monsters) {
      if (monster.isDead) continue;

      const pos = this.mapToMinimap(monster.x, monster.y, bounds.width, bounds.height);
      if (monster.isBoss) {
        this.dots.fillStyle(BOSS_DOT_COLOR, 1);
        this.dots.fillCircle(pos.x, pos.y, 5);
      } else {
        this.dots.fillStyle(MONSTER_DOT_COLOR, 0.8);
        this.dots.fillCircle(pos.x, pos.y, 3);
      }
    }

    this.drawPlayerDot(bounds.width, bounds.height);
  }

  private drawLegacyZoneView(): void {
    const state = getState();
    const zone = ZONES[state.activeZoneId];
    const zoneWidth = zone ? zone.width : 2400;
    const zoneHeight = zone ? zone.height : 2400;

    for (const monster of state.monsters) {
      if (monster.isDead) continue;

      const pos = this.mapToMinimap(monster.x, monster.y, zoneWidth, zoneHeight);
      this.dots.fillStyle(monster.isBoss ? BOSS_DOT_COLOR : MONSTER_DOT_COLOR, 0.85);
      this.dots.fillCircle(pos.x, pos.y, monster.isBoss ? 5 : 3);
    }

    this.drawPlayerDot(zoneWidth, zoneHeight);
  }

  update(_dt: number): void {
    const state = getState();
    this.dots.clear();

    if (state.gameMode === 'hub') {
      this.titleText.setText('Hub');
      this.drawHubView();
      return;
    }

    if (state.activeExpedition) {
      const zoneId = state.activeExpedition.zoneId;
      const zoneName = ZONES[zoneId]?.name ?? zoneId;
      this.titleText.setText(zoneName);
      this.drawExpeditionView();
      return;
    }

    this.titleText.setText('Zone');
    this.drawLegacyZoneView();
  }

  destroy(fromScene?: boolean): void {
    this.scene.scale.off('resize', this.onResize, this);
    super.destroy(fromScene);
  }
}
