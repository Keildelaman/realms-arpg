import Phaser from 'phaser';
import {
  getPlayer,
  getState,
  setGameMode,
  getExpeditionSelectedZoneId,
  getExpeditionSelectedTierForZone,
  setExpeditionSelectedZoneId,
  setExpeditionSelectedTierForZone,
  isExpeditionZoneUnlocked,
  isExpeditionTierUnlocked,
  getExpeditionMaxTier,
} from '@/core/game-state';
import { emit } from '@/core/event-bus';
import { ZONES } from '@/data/zones.data';
import { clampTier, EXPEDITION_MAX_TIER } from '@/data/expeditions.data';
import * as expeditions from '@/systems/expeditions';
import { PlayerEntity } from '@/entities/PlayerEntity';
import {
  getOrderedExpeditionZones,
  getObjectiveForTier,
  getExpeditionMonsterLevel,
  getExpeditionTotalBudget,
  getExpeditionMapSizeScale,
  getExpeditionCompletionXP,
  getExpeditionCompletionGold,
  getExpeditionCompletionChestCount,
} from '@/data/expedition-progression.data';

interface Station {
  id: string;
  label: string;
  x: number;
  y: number;
  radius: number;
  color: number;
}

const HUB_WIDTH = 1280;
const HUB_HEIGHT = 720;
const HUB_PLAYER_SPEED = 240;
const MAP_PANEL_FRAME_W = 760;
const MAP_PANEL_FRAME_H = 484;

export class HubScene extends Phaser.Scene {
  private playerEntity!: PlayerEntity;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private keyEnter!: Phaser.Input.Keyboard.Key;

  private stations: Station[] = [];
  private stationGraphics!: Phaser.GameObjects.Graphics;
  private promptText!: Phaser.GameObjects.Text;

  private mapPanel!: Phaser.GameObjects.Container;
  private mapPanelTitleText!: Phaser.GameObjects.Text;
  private mapPanelSubtitleText!: Phaser.GameObjects.Text;
  private mapPanelZoneValueText!: Phaser.GameObjects.Text;
  private mapPanelTierValueText!: Phaser.GameObjects.Text;
  private mapPanelZoneLockText!: Phaser.GameObjects.Text;
  private mapPanelObjectiveValueText!: Phaser.GameObjects.Text;
  private mapPanelMonsterLevelValueText!: Phaser.GameObjects.Text;
  private mapPanelRewardValueText!: Phaser.GameObjects.Text;
  private mapPanelScaleValueText!: Phaser.GameObjects.Text;
  private mapPanelProgressValueText!: Phaser.GameObjects.Text;
  private mapPanelStatusText!: Phaser.GameObjects.Text;
  private mapPanelTierPrevButtonBg!: Phaser.GameObjects.Rectangle;
  private mapPanelTierPrevText!: Phaser.GameObjects.Text;
  private mapPanelTierNextButtonBg!: Phaser.GameObjects.Rectangle;
  private mapPanelTierNextText!: Phaser.GameObjects.Text;
  private mapPanelZonePrevButtonBg!: Phaser.GameObjects.Rectangle;
  private mapPanelZonePrevText!: Phaser.GameObjects.Text;
  private mapPanelZoneNextButtonBg!: Phaser.GameObjects.Rectangle;
  private mapPanelZoneNextText!: Phaser.GameObjects.Text;
  private mapPanelZonePrevHitZone!: Phaser.GameObjects.Zone;
  private mapPanelZoneNextHitZone!: Phaser.GameObjects.Zone;
  private mapPanelTierPrevHitZone!: Phaser.GameObjects.Zone;
  private mapPanelTierNextHitZone!: Phaser.GameObjects.Zone;
  private mapPanelLaunchHitZone!: Phaser.GameObjects.Zone;
  private mapPanelCloseHitZone!: Phaser.GameObjects.Zone;
  private mapPanelLaunchButtonBg!: Phaser.GameObjects.Rectangle;
  private mapPanelLaunchButtonText!: Phaser.GameObjects.Text;
  private mapPanelCloseButtonBg!: Phaser.GameObjects.Rectangle;
  private mapPanelCloseButtonText!: Phaser.GameObjects.Text;
  private mapPanelHintText!: Phaser.GameObjects.Text;
  private panelOpen = false;

  private selectedTier = 1;
  private selectedZoneId = 'whisperwood';

  constructor() {
    super({ key: 'HubScene' });
  }

  create(): void {
    expeditions.init();

    this.cameras.main.setBackgroundColor('#1a1f2b');
    this.physics.world.setBounds(0, 0, HUB_WIDTH, HUB_HEIGHT);
    this.cameras.main.centerOn(HUB_WIDTH / 2, HUB_HEIGHT / 2);

    this.scale.on('resize', () => {
      this.cameras.main.centerOn(HUB_WIDTH / 2, HUB_HEIGHT / 2);
    }, this);

    this.drawHubBackground();
    this.createStations();

    const player = getPlayer();
    setGameMode('hub');

    player.x = 640;
    player.y = 420;

    this.playerEntity = new PlayerEntity(this, player.x, player.y);

    this.events.on('wake', () => {
      this.onWakeFromExpedition();
    });

    this.promptText = this.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      backgroundColor: 'rgba(0,0,0,0.45)',
      padding: { x: 8, y: 4 },
    })
      .setDepth(50)
      .setScrollFactor(0)
      .setVisible(false);

    this.createMapPanel();
    this.syncSelectionFromMeta();
    this.refreshMapPanel();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyE = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyEsc = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.keyEnter = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);

    this.keyE.on('down', () => {
      if (this.panelOpen) {
        this.launchSelectedExpedition();
        return;
      }

      const station = this.getNearestStation();
      if (!station) return;

      this.handleStationInteract(station);
    });

    this.keyEsc.on('down', () => {
      if (getState().codexOpen) {
        emit('ui:codexToggle');
        return;
      }
      if (getState().stashOpen) {
        emit('ui:stashToggle');
        return;
      }
      if (getState().merchantOpen) {
        emit('ui:merchantToggle');
        return;
      }
      if (this.panelOpen) {
        this.toggleMapPanel(false);
      }
    });

    this.keyEnter.on('down', () => {
      if (this.panelOpen) {
        this.launchSelectedExpedition();
      }
    });

    this.input.on('pointerdown', this.onPointerDown, this);

    if (!this.scene.isActive('UIScene')) {
      this.scene.launch('UIScene');
    }
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    const player = getPlayer();

    // Always face mouse (matching expedition feel)
    const pointer = this.input.activePointer;
    player.facingAngle = Math.atan2(pointer.worldY - player.y, pointer.worldX - player.x);

    if (!this.panelOpen && !getState().merchantOpen && !getState().stashOpen && !getState().codexOpen) {
      let dx = 0;
      let dy = 0;
      if (this.cursors.left.isDown || this.keyA.isDown) dx -= 1;
      if (this.cursors.right.isDown || this.keyD.isDown) dx += 1;
      if (this.cursors.up.isDown || this.keyW.isDown) dy -= 1;
      if (this.cursors.down.isDown || this.keyS.isDown) dy += 1;

      if (dx !== 0 || dy !== 0) {
        const len = Math.sqrt(dx * dx + dy * dy);
        dx /= len;
        dy /= len;

        player.x += dx * HUB_PLAYER_SPEED * dt;
        player.y += dy * HUB_PLAYER_SPEED * dt;
        player.velocityX = dx * HUB_PLAYER_SPEED;
        player.velocityY = dy * HUB_PLAYER_SPEED;
      } else {
        player.velocityX = 0;
        player.velocityY = 0;
      }

      player.x = Phaser.Math.Clamp(player.x, 90, HUB_WIDTH - 90);
      player.y = Phaser.Math.Clamp(player.y, 80, HUB_HEIGHT - 80);

      this.playerEntity.update(dt);
    }

    if (this.panelOpen) {
      this.handleMapPanelInput();
    }

    const station = this.getNearestStation();
    if (station && !this.panelOpen) {
      this.promptText.setVisible(true);
      this.promptText.setText(`Press E: ${station.label}`);
      this.promptText.setPosition(
        (this.scale.width - this.promptText.width) * 0.5,
        this.scale.height - 120,
      );
    } else {
      this.promptText.setVisible(false);
    }
  }

  // ============================================================================
  // Background drawing — geometric stone art style
  // ============================================================================

  private drawHubBackground(): void {
    const g = this.add.graphics();
    g.setDepth(0);

    // --- Layer B: Perimeter wall (drawn first; interior tiles draw on top) ---
    g.fillStyle(0x2a2e38, 1);
    g.fillRect(60, 50, 1160, 620);

    // Top highlight strip
    g.fillStyle(0x3d4455, 1);
    g.fillRect(60, 50, 1160, 5);
    // Left highlight strip
    g.fillRect(60, 50, 5, 620);

    // --- Layer A: Stone tile grid (interior walkable area) ---
    const tileSize = 40;
    const innerX = 84;
    const innerY = 74;
    const innerW = 1112;
    const innerH = 572;
    const tileColors = [0x191e2c, 0x1e2330, 0x28304a];

    for (let ty = innerY; ty < innerY + innerH; ty += tileSize) {
      for (let tx = innerX; tx < innerX + innerW; tx += tileSize) {
        const col = Math.floor((tx - innerX) / tileSize);
        const row = Math.floor((ty - innerY) / tileSize);
        const seed = (col * 7 + row * 13) % 3;
        g.fillStyle(tileColors[seed], 1);
        g.fillRect(tx, ty, tileSize - 1, tileSize - 1);
      }
    }

    // Grout lines
    g.lineStyle(1, 0x111622, 0.8);
    for (let tx = innerX; tx <= innerX + innerW; tx += tileSize) {
      g.beginPath();
      g.moveTo(tx, innerY);
      g.lineTo(tx, innerY + innerH);
      g.strokePath();
    }
    for (let ty = innerY; ty <= innerY + innerH; ty += tileSize) {
      g.beginPath();
      g.moveTo(innerX, ty);
      g.lineTo(innerX + innerW, ty);
      g.strokePath();
    }

    // --- Layer C: Connecting paths (lighter tone) ---
    const plazaCx = 640;
    const plazaCy = 360;
    const pathW = 50;
    const pathColor = 0x252c3a;
    g.fillStyle(pathColor, 1);

    // Horizontal paths left and right of plaza
    g.fillRect(innerX, plazaCy - pathW / 2, plazaCx - innerX, pathW);
    g.fillRect(plazaCx, plazaCy - pathW / 2, innerX + innerW - plazaCx, pathW);
    // Vertical paths to top stations
    g.fillRect(240 - pathW / 2, innerY, pathW, plazaCy - innerY);
    g.fillRect(1040 - pathW / 2, innerY, pathW, plazaCy - innerY);
    // Vertical paths to bottom stations
    g.fillRect(260 - pathW / 2, plazaCy, pathW, innerY + innerH - plazaCy);
    g.fillRect(1020 - pathW / 2, plazaCy, pathW, innerY + innerH - plazaCy);
    // Vertical path to map device (bottom center)
    g.fillRect(plazaCx - pathW / 2, plazaCy, pathW, innerY + innerH - plazaCy);

    // --- Layer D: Central plaza (200×200 paved area) ---
    const plazaX = 540;
    const plazaY = 260;
    const plazaW = 200;
    const plazaH = 200;
    const subSize = 20;
    const plazaColors = [0x2c3548, 0x323d52, 0x283040];

    for (let py = plazaY; py < plazaY + plazaH; py += subSize) {
      for (let px = plazaX; px < plazaX + plazaW; px += subSize) {
        const col = Math.floor((px - plazaX) / subSize);
        const row = Math.floor((py - plazaY) / subSize);
        const seed = (col * 3 + row * 5) % 3;
        g.fillStyle(plazaColors[seed], 1);
        g.fillRect(px, py, subSize - 1, subSize - 1);
      }
    }

    // Concentric decorative rings on plaza
    g.lineStyle(3, 0x3a4865, 0.7);
    g.strokeCircle(plazaCx, plazaCy, 80);
    g.strokeCircle(plazaCx, plazaCy, 55);
    // Small center circle
    g.fillStyle(0x323d52, 1);
    g.fillCircle(plazaCx, plazaCy, 16);

    // --- Layer E: Braziers at plaza corners ---
    const brazierPositions = [
      { x: 540, y: 260 },
      { x: 740, y: 260 },
      { x: 540, y: 460 },
      { x: 740, y: 460 },
    ];

    for (const bp of brazierPositions) {
      // Stone base
      g.fillStyle(0x3a4055, 1);
      g.fillRect(bp.x - 5, bp.y + 4, 10, 6);
      // Metal bowl
      g.fillStyle(0x58627a, 1);
      g.fillRect(bp.x - 7, bp.y - 2, 14, 6);
      // Flame
      g.fillStyle(0xe87f1b, 1);
      g.fillCircle(bp.x, bp.y - 6, 5);
      // Bright core
      g.fillStyle(0xf5a623, 1);
      g.fillCircle(bp.x, bp.y - 7, 3);
    }

    // --- Layer F: Scattered decorative rocks at wall corners ---
    const rockPositions = [
      { x: 100, y: 90 }, { x: 130, y: 80 },
      { x: 1160, y: 90 }, { x: 1185, y: 105 },
      { x: 100, y: 630 }, { x: 125, y: 650 },
      { x: 1165, y: 625 }, { x: 1185, y: 645 },
      { x: 150, y: 120 }, { x: 88, y: 150 },
      { x: 1180, y: 140 }, { x: 1150, y: 170 },
      { x: 115, y: 600 }, { x: 90, y: 570 },
      { x: 1160, y: 590 }, { x: 1185, y: 610 },
    ];

    for (const rock of rockPositions) {
      g.fillStyle(0x3a4055, 1);
      g.fillCircle(rock.x, rock.y, 6);
      // Moss accent
      g.fillStyle(0x243328, 0.6);
      g.fillCircle(rock.x - 2, rock.y - 2, 3);
    }
  }

  // ============================================================================
  // Station creation — distinct buildings per station type
  // ============================================================================

  private createStations(): void {
    this.stations = [
      { id: 'stash',      label: 'Stash',         x: 240,  y: 200, radius: 80, color: 0x334155 },
      { id: 'blacksmith', label: 'Blacksmith',     x: 1040, y: 200, radius: 80, color: 0x78350f },
      { id: 'merchant',   label: 'Merchant',       x: 260,  y: 520, radius: 80, color: 0x1f5132 },
      { id: 'dummy',      label: 'Training Dummy', x: 1020, y: 520, radius: 80, color: 0x4c1d95 },
      { id: 'map_device', label: 'Map Device',     x: 640,  y: 560, radius: 90, color: 0x0f766e },
    ];

    this.stationGraphics = this.add.graphics();
    this.stationGraphics.setDepth(2);

    const labelColors: Record<string, string> = {
      stash:      '#93c5fd',
      blacksmith: '#fbbf24',
      merchant:   '#86efac',
      dummy:      '#d8b4fe',
      map_device: '#5eead4',
    };

    for (const station of this.stations) {
      this.drawStationBuilding(this.stationGraphics, station);

      const labelY = station.id === 'map_device' ? station.y + 68 : station.y + 52;
      this.add.text(station.x, labelY, station.label.toUpperCase(), {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: labelColors[station.id] ?? '#e5e7eb',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(3);
    }
  }

  private drawStationBuilding(g: Phaser.GameObjects.Graphics, station: Station): void {
    switch (station.id) {
      case 'stash':      this.drawStashBuilding(g, station.x, station.y); break;
      case 'blacksmith': this.drawBlacksmithBuilding(g, station.x, station.y); break;
      case 'merchant':   this.drawMerchantBuilding(g, station.x, station.y); break;
      case 'dummy':      this.drawDummyBuilding(g, station.x, station.y); break;
      case 'map_device': this.drawMapDeviceBuilding(g, station.x, station.y); break;
    }
  }

  // --- Stash: deep navy stone vault with iron door and lock ---
  private drawStashBuilding(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    // Corner reinforcements
    g.fillStyle(0x3a4560, 1);
    g.fillRect(cx - 30, cy - 35, 7, 70);
    g.fillRect(cx + 23, cy - 35, 7, 70);

    // Stone block body
    g.fillStyle(0x2a3040, 1);
    g.fillRect(cx - 30, cy - 35, 60, 70);

    // Roof overhang slab
    g.fillStyle(0x1e2535, 1);
    g.fillRect(cx - 34, cy - 42, 68, 8);

    // Vault door recess
    g.fillStyle(0x1a2030, 1);
    g.fillRect(cx - 16, cy - 18, 32, 36);

    // Metal bands on door
    g.fillStyle(0x4a5875, 1);
    g.fillRect(cx - 16, cy - 10, 32, 4);
    g.fillRect(cx - 16, cy,      32, 4);
    g.fillRect(cx - 16, cy + 10, 32, 4);

    // Circular lock mechanism
    g.fillStyle(0x8ba3c0, 1);
    g.fillCircle(cx, cy - 22, 5);
    g.fillStyle(0x5a7090, 1);
    g.fillCircle(cx, cy - 22, 3);
  }

  // --- Blacksmith: amber/brown forge with chimney and anvil ---
  private drawBlacksmithBuilding(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    // Main body
    g.fillStyle(0x3d2710, 1);
    g.fillRect(cx - 32, cy - 32, 64, 65);

    // Chimney
    g.fillStyle(0x2e1e0c, 1);
    g.fillRect(cx + 10, cy - 58, 14, 30);
    // Chimney cap
    g.fillStyle(0x261808, 1);
    g.fillRect(cx + 8, cy - 62, 18, 5);

    // Forge opening
    g.fillStyle(0x160e05, 1);
    g.fillRect(cx - 18, cy - 15, 36, 28);

    // Fire glow inside forge (three layers: orange → yellow → white)
    g.fillStyle(0xe87f1b, 1);
    g.fillRect(cx - 12, cy,     24, 10);
    g.fillStyle(0xf5c842, 1);
    g.fillRect(cx - 8,  cy - 5, 16, 10);
    g.fillStyle(0xffffff, 0.5);
    g.fillRect(cx - 4,  cy - 8, 8,  6);

    // Anvil silhouette at base
    g.fillStyle(0x5a5a6a, 1);
    g.fillRect(cx - 22, cy + 20, 44, 8);  // base
    g.fillStyle(0x6a6a7a, 1);
    g.fillRect(cx - 16, cy + 14, 32, 8);  // body
    g.fillStyle(0x7a7a8a, 1);
    g.fillRect(cx - 20, cy + 10, 26, 6);  // top/horn
  }

  // --- Merchant: forest green market stall with striped awning ---
  private drawMerchantBuilding(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    // Back wall
    g.fillStyle(0x1a3d22, 1);
    g.fillRect(cx - 36, cy - 30, 72, 60);

    // Striped canopy
    const canopyColors = [0x1f6127, 0x2a7a32];
    for (let i = 0; i < 8; i++) {
      g.fillStyle(canopyColors[i % 2], 1);
      g.fillRect(cx - 40 + i * 10, cy - 46, 10, 16);
    }

    // Zigzag drape front
    for (let i = 0; i < 8; i++) {
      g.fillStyle(0x1a4e20, 1);
      const offset = (i % 2 === 0) ? 0 : 4;
      g.fillRect(cx - 40 + i * 10, cy - 32 + offset, 10, 6);
    }

    // Counter/table slab
    g.fillStyle(0x4a3620, 1);
    g.fillRect(cx - 32, cy + 8, 64, 8);
    // Table legs
    g.fillRect(cx - 28, cy + 16, 6, 12);
    g.fillRect(cx + 22, cy + 16, 6, 12);

    // Items on counter
    g.fillStyle(0xf5c842, 1);  // gold item
    g.fillRect(cx - 20, cy, 10, 8);
    g.fillStyle(0x3b82f6, 1);  // blue item
    g.fillRect(cx - 5, cy, 10, 8);
    g.fillStyle(0x9333ea, 1);  // purple item
    g.fillRect(cx + 10, cy, 10, 8);
  }

  // --- Training Dummy: deep purple dais with wooden post and dummy figure ---
  private drawDummyBuilding(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    // Raised platform/dais
    g.fillStyle(0x2d2040, 1);
    g.fillRect(cx - 35, cy + 25, 70, 10);
    g.fillStyle(0x3a2d50, 1);
    g.fillRect(cx - 30, cy + 20, 60, 8);

    // Vertical post
    g.fillStyle(0x4a3620, 1);
    g.fillRect(cx - 4, cy - 30, 8, 55);

    // Horizontal crossbar
    g.fillStyle(0x5a4430, 1);
    g.fillRect(cx - 20, cy - 28, 40, 6);

    // Dummy head
    g.fillStyle(0x8b6f5e, 1);
    g.fillCircle(cx, cy - 38, 10);
    // Head highlight
    g.fillStyle(0xb8967e, 0.4);
    g.fillCircle(cx - 3, cy - 40, 4);

    // Torso
    g.fillStyle(0x5a4a70, 1);
    g.fillRect(cx - 14, cy - 26, 28, 38);

    // Armor plate strips
    g.fillStyle(0x6a5a80, 1);
    g.fillRect(cx - 14, cy - 20, 28, 5);
    g.fillRect(cx - 14, cy - 10, 28, 5);
    g.fillRect(cx - 14, cy,      28, 5);

    // X-pattern hit marks
    g.lineStyle(2, 0xff4444, 0.8);
    g.beginPath();
    g.moveTo(cx - 8, cy - 18);
    g.lineTo(cx + 8, cy - 4);
    g.moveTo(cx + 8, cy - 18);
    g.lineTo(cx - 8, cy - 4);
    g.strokePath();
  }

  // --- Map Device: teal obelisk with arcane rings and glowing apex ---
  private drawMapDeviceBuilding(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    // Two concentric energy rings (drawn first so obelisk renders on top)
    g.lineStyle(2, 0x0d9488, 0.6);
    g.strokeCircle(cx, cy + 5, 38);
    g.strokeCircle(cx, cy + 5, 52);

    // 4 cardinal rune marks on outer ring
    g.fillStyle(0x0d9488, 0.8);
    g.fillRect(cx - 2, cy + 5 - 54, 4, 4);
    g.fillRect(cx + 50, cy + 5 - 2,  4, 4);
    g.fillRect(cx - 2, cy + 5 + 50,  4, 4);
    g.fillRect(cx - 54, cy + 5 - 2,  4, 4);

    // Stepped plinth (2-tier base)
    g.fillStyle(0x0e2a28, 1);
    g.fillRect(cx - 28, cy + 20, 56, 16);
    g.fillStyle(0x123532, 1);
    g.fillRect(cx - 20, cy + 10, 40, 12);

    // Tapered obelisk (3 progressively narrower rectangles)
    g.fillStyle(0x103832, 1);
    g.fillRect(cx - 16, cy - 20, 32, 32);
    g.fillStyle(0x0d2e28, 1);
    g.fillRect(cx - 12, cy - 48, 24, 30);
    g.fillStyle(0x0a2420, 1);
    g.fillRect(cx - 8, cy - 68, 16, 22);

    // Left-edge highlight strips for 3D depth
    g.fillStyle(0x1c5448, 1);
    g.fillRect(cx - 16, cy - 20, 3, 32);
    g.fillRect(cx - 12, cy - 48, 3, 30);
    g.fillRect(cx - 8,  cy - 68, 3, 22);

    // Horizontal arcane rune lines on obelisk
    g.lineStyle(1, 0x0d9488, 0.8);
    for (let i = 0; i < 4; i++) {
      const ry = cy - 15 + i * 8;
      g.beginPath();
      g.moveTo(cx - 14, ry);
      g.lineTo(cx + 14, ry);
      g.strokePath();
    }
    for (let i = 0; i < 3; i++) {
      const ry = cy - 45 + i * 9;
      g.beginPath();
      g.moveTo(cx - 10, ry);
      g.lineTo(cx + 10, ry);
      g.strokePath();
    }

    // Pyramid tip
    g.fillStyle(0x0f766e, 1);
    g.fillTriangle(cx, cy - 74, cx - 8, cy - 68, cx + 8, cy - 68);

    // Glowing apex circle
    g.fillStyle(0x14b8a6, 0.8);
    g.fillCircle(cx, cy - 74, 4);
    g.fillStyle(0x5eead4, 1);
    g.fillCircle(cx, cy - 74, 2);
  }

  // ============================================================================
  // Map panel
  // ============================================================================

  private createMapPanel(): void {
    this.mapPanel = this.add.container(this.scale.width * 0.5, this.scale.height * 0.5);
    this.mapPanel.setScrollFactor(0);
    this.mapPanel.setDepth(80);
    this.mapPanel.setVisible(false);

    const frame = this.add.graphics();
    frame.fillStyle(0x0a1020, 0.97);
    frame.fillRoundedRect(-380, -242, MAP_PANEL_FRAME_W, MAP_PANEL_FRAME_H, 14);
    frame.fillStyle(0x111d33, 0.96);
    frame.fillRoundedRect(-372, -234, 744, 468, 12);
    frame.lineStyle(2, 0x28466e, 0.8);
    frame.strokeRoundedRect(-372, -234, 744, 468, 12);

    // Left and right content cards.
    frame.fillStyle(0x0f1728, 0.9);
    frame.fillRoundedRect(-352, -142, 332, 262, 10);
    frame.fillStyle(0x101a2b, 0.9);
    frame.fillRoundedRect(20, -142, 332, 262, 10);
    frame.lineStyle(1, 0x243246, 0.9);
    frame.strokeRoundedRect(-352, -142, 332, 262, 10);
    frame.strokeRoundedRect(20, -142, 332, 262, 10);

    this.mapPanelTitleText = this.add.text(-352, -206, 'Map Device', {
      fontFamily: 'monospace',
      fontSize: '24px',
      color: '#f8fafc',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0, 0.5);

    this.mapPanelSubtitleText = this.add.text(-352, -176, 'Select zone and tier, then launch expedition.', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#94a3b8',
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(0, 0.5);

    this.mapPanelCloseButtonBg = this.add.rectangle(340, -206, 28, 22, 0x7f1d1d, 0.35)
      .setStrokeStyle(1, 0xef4444, 0.85)
      .setInteractive({ useHandCursor: true });
    this.mapPanelCloseButtonText = this.add.text(340, -206, 'X', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#fecaca',
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    const leftTitle = this.add.text(-332, -118, 'Selection', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#7dd3fc',
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(0, 0.5);

    const rightTitle = this.add.text(40, -118, 'Run Summary', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#7dd3fc',
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(0, 0.5);

    const zoneLabel = this.add.text(-332, -78, 'Zone', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#94a3b8',
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(0, 0.5);
    this.mapPanelZoneValueText = this.add.text(-286, -78, '', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#a7f3d0',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0, 0.5);
    this.mapPanelZonePrevButtonBg = this.add.rectangle(-294, -48, 78, 24, 0x1e3a8a, 0.3)
      .setStrokeStyle(1, 0x3b82f6, 0.8)
      .setInteractive({ useHandCursor: true });
    this.mapPanelZonePrevText = this.add.text(-294, -48, 'Prev', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#93c5fd',
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.mapPanelZoneNextButtonBg = this.add.rectangle(-198, -48, 78, 24, 0x1e3a8a, 0.3)
      .setStrokeStyle(1, 0x3b82f6, 0.8)
      .setInteractive({ useHandCursor: true });
    this.mapPanelZoneNextText = this.add.text(-198, -48, 'Next', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#93c5fd',
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.mapPanelZoneLockText = this.add.text(-332, -16, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#fca5a5',
      wordWrap: { width: 300 },
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(0, 0);

    const tierLabel = this.add.text(-332, 28, 'Tier', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#94a3b8',
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(0, 0.5);
    this.mapPanelTierValueText = this.add.text(-286, 28, '', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#bfdbfe',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0, 0.5);
    this.mapPanelTierPrevButtonBg = this.add.rectangle(-294, 58, 78, 24, 0x1e3a8a, 0.3)
      .setStrokeStyle(1, 0x3b82f6, 0.8)
      .setInteractive({ useHandCursor: true });
    this.mapPanelTierPrevText = this.add.text(-294, 58, '- Tier', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#93c5fd',
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.mapPanelTierNextButtonBg = this.add.rectangle(-198, 58, 78, 24, 0x1e3a8a, 0.3)
      .setStrokeStyle(1, 0x3b82f6, 0.8)
      .setInteractive({ useHandCursor: true });
    this.mapPanelTierNextText = this.add.text(-198, 58, '+ Tier', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#93c5fd',
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this.mapPanelObjectiveValueText = this.add.text(40, -78, '', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#fbbf24',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0, 0.5);
    this.mapPanelMonsterLevelValueText = this.add.text(40, -48, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#e2e8f0',
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(0, 0.5);
    this.mapPanelRewardValueText = this.add.text(40, -18, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#e2e8f0',
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(0, 0.5);
    this.mapPanelScaleValueText = this.add.text(40, 12, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#e2e8f0',
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(0, 0.5);
    this.mapPanelProgressValueText = this.add.text(40, 42, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#cbd5e1',
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(0, 0.5);

    this.mapPanelStatusText = this.add.text(-352, 154, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#86efac',
      stroke: '#000000',
      strokeThickness: 1,
      backgroundColor: 'rgba(15,118,110,0.20)',
      padding: { x: 8, y: 4 },
    }).setOrigin(0, 0.5);

    this.mapPanelLaunchButtonBg = this.add.rectangle(256, 154, 192, 40, 0x14532d, 0.95)
      .setStrokeStyle(2, 0x22c55e, 0.95)
      .setInteractive({ useHandCursor: true });
    this.mapPanelLaunchButtonText = this.add.text(256, 154, 'Launch Expedition', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#ecfeff',
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this.mapPanelHintText = this.add.text(0, 204, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#cbd5e1',
      align: 'center',
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(0.5);

    const hookButtonFx = (
      bg: Phaser.GameObjects.Rectangle,
      label: Phaser.GameObjects.Text,
      enabledAlpha: number,
      disabledAlpha: number,
    ): void => {
      const setBaseVisual = (): void => {
        const enabled = !!bg.input?.enabled;
        bg.setAlpha(enabled ? enabledAlpha : disabledAlpha);
        if (!enabled) {
          bg.setScale(1);
          label.setScale(1);
        }
      };
      setBaseVisual();

      const onOver = (): void => {
        if (!bg.input?.enabled) return;
        bg.setAlpha(Math.min(1, enabledAlpha + 0.08));
        bg.setScale(1.02);
        label.setScale(1.01);
      };
      const onOut = (): void => {
        setBaseVisual();
      };
      const onPress = (): void => {
        if (!bg.input?.enabled) return;
        this.tweens.killTweensOf([bg, label]);
        bg.setScale(0.97);
        label.setScale(0.97);
        this.tweens.add({
          targets: [bg, label],
          scaleX: 1.0,
          scaleY: 1.0,
          duration: 90,
          ease: 'Quad.Out',
        });
      };

      bg.on('pointerover', onOver);
      bg.on('pointerout', onOut);
      label.on('pointerover', onOver);
      label.on('pointerout', onOut);
      bg.on('pointerdown', onPress);
      label.on('pointerdown', onPress);
    };
    hookButtonFx(this.mapPanelZonePrevButtonBg, this.mapPanelZonePrevText, 0.92, 0.55);
    hookButtonFx(this.mapPanelZoneNextButtonBg, this.mapPanelZoneNextText, 0.92, 0.55);
    hookButtonFx(this.mapPanelTierPrevButtonBg, this.mapPanelTierPrevText, 0.92, 0.55);
    hookButtonFx(this.mapPanelTierNextButtonBg, this.mapPanelTierNextText, 0.92, 0.55);
    hookButtonFx(this.mapPanelLaunchButtonBg, this.mapPanelLaunchButtonText, 0.92, 0.62);
    hookButtonFx(this.mapPanelCloseButtonBg, this.mapPanelCloseButtonText, 0.92, 0.62);

    const baseX = this.scale.width * 0.5;
    const baseY = this.scale.height * 0.5;
    const makeHitZone = (x: number, y: number, w: number, h: number): Phaser.GameObjects.Zone => {
      return this.add.zone(baseX + x, baseY + y, w, h)
        .setScrollFactor(0)
        .setDepth(140)
        .setInteractive({ useHandCursor: true });
    };

    this.mapPanelZonePrevHitZone = makeHitZone(-294, -48, 84, 28);
    this.mapPanelZoneNextHitZone = makeHitZone(-198, -48, 84, 28);
    this.mapPanelTierPrevHitZone = makeHitZone(-294, 58, 84, 28);
    this.mapPanelTierNextHitZone = makeHitZone(-198, 58, 84, 28);
    this.mapPanelLaunchHitZone = makeHitZone(256, 154, 198, 44);
    this.mapPanelCloseHitZone = makeHitZone(340, -206, 32, 24);

    this.mapPanelZonePrevHitZone.on('pointerover', () => this.mapPanelZonePrevButtonBg.emit('pointerover'));
    this.mapPanelZonePrevHitZone.on('pointerout', () => this.mapPanelZonePrevButtonBg.emit('pointerout'));
    this.mapPanelZonePrevHitZone.on('pointerdown', () => {
      this.mapPanelZonePrevButtonBg.emit('pointerdown');
      this.changeSelectedZone(-1);
    });

    this.mapPanelZoneNextHitZone.on('pointerover', () => this.mapPanelZoneNextButtonBg.emit('pointerover'));
    this.mapPanelZoneNextHitZone.on('pointerout', () => this.mapPanelZoneNextButtonBg.emit('pointerout'));
    this.mapPanelZoneNextHitZone.on('pointerdown', () => {
      this.mapPanelZoneNextButtonBg.emit('pointerdown');
      this.changeSelectedZone(1);
    });

    this.mapPanelTierPrevHitZone.on('pointerover', () => this.mapPanelTierPrevButtonBg.emit('pointerover'));
    this.mapPanelTierPrevHitZone.on('pointerout', () => this.mapPanelTierPrevButtonBg.emit('pointerout'));
    this.mapPanelTierPrevHitZone.on('pointerdown', () => {
      this.mapPanelTierPrevButtonBg.emit('pointerdown');
      this.changeSelectedTier(-1);
    });

    this.mapPanelTierNextHitZone.on('pointerover', () => this.mapPanelTierNextButtonBg.emit('pointerover'));
    this.mapPanelTierNextHitZone.on('pointerout', () => this.mapPanelTierNextButtonBg.emit('pointerout'));
    this.mapPanelTierNextHitZone.on('pointerdown', () => {
      this.mapPanelTierNextButtonBg.emit('pointerdown');
      this.changeSelectedTier(1);
    });

    this.mapPanelLaunchHitZone.on('pointerover', () => this.mapPanelLaunchButtonBg.emit('pointerover'));
    this.mapPanelLaunchHitZone.on('pointerout', () => this.mapPanelLaunchButtonBg.emit('pointerout'));
    this.mapPanelLaunchHitZone.on('pointerdown', () => {
      this.mapPanelLaunchButtonBg.emit('pointerdown');
      this.launchSelectedExpedition();
    });

    this.mapPanelCloseHitZone.on('pointerover', () => this.mapPanelCloseButtonBg.emit('pointerover'));
    this.mapPanelCloseHitZone.on('pointerout', () => this.mapPanelCloseButtonBg.emit('pointerout'));
    this.mapPanelCloseHitZone.on('pointerdown', () => {
      this.mapPanelCloseButtonBg.emit('pointerdown');
      this.toggleMapPanel(false);
    });

    this.mapPanel.add([
      frame,
      this.mapPanelTitleText,
      this.mapPanelSubtitleText,
      this.mapPanelCloseButtonBg,
      this.mapPanelCloseButtonText,
      leftTitle,
      rightTitle,
      zoneLabel,
      this.mapPanelZoneValueText,
      this.mapPanelZonePrevButtonBg,
      this.mapPanelZonePrevText,
      this.mapPanelZoneNextButtonBg,
      this.mapPanelZoneNextText,
      this.mapPanelZoneLockText,
      tierLabel,
      this.mapPanelTierValueText,
      this.mapPanelTierPrevButtonBg,
      this.mapPanelTierPrevText,
      this.mapPanelTierNextButtonBg,
      this.mapPanelTierNextText,
      this.mapPanelObjectiveValueText,
      this.mapPanelMonsterLevelValueText,
      this.mapPanelRewardValueText,
      this.mapPanelScaleValueText,
      this.mapPanelProgressValueText,
      this.mapPanelStatusText,
      this.mapPanelLaunchButtonBg,
      this.mapPanelLaunchButtonText,
      this.mapPanelHintText,
    ]);

    const disableZone = (zone: Phaser.GameObjects.Zone): void => {
      zone.setActive(false);
      if (zone.input) zone.input.enabled = false;
    };
    disableZone(this.mapPanelZonePrevHitZone);
    disableZone(this.mapPanelZoneNextHitZone);
    disableZone(this.mapPanelTierPrevHitZone);
    disableZone(this.mapPanelTierNextHitZone);
    disableZone(this.mapPanelLaunchHitZone);
    disableZone(this.mapPanelCloseHitZone);
  }

  // ============================================================================
  // Station interaction
  // ============================================================================

  private getNearestStation(): Station | null {
    const player = getPlayer();

    for (const station of this.stations) {
      const dx = player.x - station.x;
      const dy = player.y - station.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= station.radius * station.radius) {
        return station;
      }
    }

    return null;
  }

  private handleStationInteract(station: Station): void {
    if (station.id === 'map_device') {
      this.toggleMapPanel(true);
      return;
    }

    if (station.id === 'stash') {
      emit('ui:stashToggle');
      return;
    }

    if (station.id === 'merchant') {
      emit('ui:merchantToggle');
      return;
    }

    if (station.id === 'blacksmith') {
      emit('ui:inventoryToggle');
      return;
    }
  }

  private toggleMapPanel(open: boolean): void {
    this.panelOpen = open;
    this.mapPanel.setVisible(open);
    const setZoneOpen = (zone: Phaser.GameObjects.Zone): void => {
      zone.setActive(open);
      if (zone.input) zone.input.enabled = open;
    };
    setZoneOpen(this.mapPanelZonePrevHitZone);
    setZoneOpen(this.mapPanelZoneNextHitZone);
    setZoneOpen(this.mapPanelTierPrevHitZone);
    setZoneOpen(this.mapPanelTierNextHitZone);
    setZoneOpen(this.mapPanelLaunchHitZone);
    setZoneOpen(this.mapPanelCloseHitZone);
    const uiScene = this.scene.get('UIScene');
    if (uiScene?.input) {
      // Prevent UI scene hit-areas from stealing map-device clicks.
      uiScene.input.enabled = !open;
    }
    if (open) {
      this.scene.bringToTop();
    } else if (this.scene.isActive('UIScene')) {
      this.scene.bringToTop('UIScene');
    }
    if (open) {
      this.syncSelectionFromMeta();
      this.refreshMapPanel();
    }
  }

  // ============================================================================
  // Expedition selection
  // ============================================================================

  private getSelectableZoneIds(): string[] {
    return getOrderedExpeditionZones();
  }

  private getSelectedZoneIndex(): number {
    const zones = this.getSelectableZoneIds();
    const idx = zones.indexOf(this.selectedZoneId);
    return idx >= 0 ? idx : 0;
  }

  private syncSelectionFromMeta(): void {
    const zoneId = getExpeditionSelectedZoneId();
    this.selectedZoneId = zoneId;
    this.selectedTier = getExpeditionSelectedTierForZone(zoneId);
  }

  private changeSelectedTier(delta: number): void {
    this.selectedTier = clampTier(this.selectedTier + delta);
    if (isExpeditionZoneUnlocked(this.selectedZoneId)) {
      setExpeditionSelectedTierForZone(this.selectedZoneId, this.selectedTier);
    }
    this.refreshMapPanel();
  }

  private changeSelectedZone(delta: number): void {
    const zones = this.getSelectableZoneIds();
    if (zones.length <= 1) return;

    const currentIdx = this.getSelectedZoneIndex();
    const nextIdx = Phaser.Math.Clamp(currentIdx + delta, 0, zones.length - 1);
    if (nextIdx === currentIdx) {
      this.refreshMapPanel();
      return;
    }

    this.selectedZoneId = zones[nextIdx];
    if (isExpeditionZoneUnlocked(this.selectedZoneId)) {
      setExpeditionSelectedZoneId(this.selectedZoneId);
      this.selectedTier = getExpeditionSelectedTierForZone(this.selectedZoneId);
    }
    this.refreshMapPanel();
  }

  private getZoneLockReason(zoneId: string): string {
    if (isExpeditionZoneUnlocked(zoneId)) return '';
    const ordered = this.getSelectableZoneIds();
    const idx = ordered.indexOf(zoneId);
    if (idx <= 0) return 'Locked';
    const prevId = ordered[idx - 1];
    const prevName = ZONES[prevId]?.name ?? prevId;
    return `Locked: Defeat ${prevName} T${EXPEDITION_MAX_TIER} boss`;
  }

  private getTierLockReason(zoneId: string, tier: number): string {
    if (!isExpeditionZoneUnlocked(zoneId)) return this.getZoneLockReason(zoneId);
    if (isExpeditionTierUnlocked(zoneId, tier)) return 'Ready';
    const maxTier = getExpeditionMaxTier(zoneId);
    return `Locked: Complete ${ZONES[zoneId]?.name ?? zoneId} T${maxTier}`;
  }

  private refreshMapPanel(): void {
    const zones = this.getSelectableZoneIds();
    if (!zones.includes(this.selectedZoneId)) {
      this.selectedZoneId = zones[0] ?? 'whisperwood';
    }
    this.selectedTier = clampTier(this.selectedTier);

    const zone = ZONES[this.selectedZoneId];
    const objective = getObjectiveForTier(this.selectedTier) === 'boss_hunt'
      ? 'Boss Hunt'
      : 'Extermination';
    const levelMin = getExpeditionMonsterLevel(this.selectedZoneId, this.selectedTier, 0);
    const levelMax = getExpeditionMonsterLevel(this.selectedZoneId, this.selectedTier, 1);
    const rewardXp = getExpeditionCompletionXP(this.selectedZoneId, this.selectedTier);
    const rewardGold = getExpeditionCompletionGold(this.selectedZoneId, this.selectedTier);
    const rewardChests = getExpeditionCompletionChestCount(this.selectedTier);
    const targetKills = getExpeditionTotalBudget(this.selectedZoneId, this.selectedTier);
    const mapSizeScale = getExpeditionMapSizeScale(this.selectedZoneId, this.selectedTier);
    const maxUnlockedTier = getExpeditionMaxTier(this.selectedZoneId);
    const status = this.getTierLockReason(this.selectedZoneId, this.selectedTier);
    const zoneUnlocked = isExpeditionZoneUnlocked(this.selectedZoneId);
    const tierUnlocked = zoneUnlocked && isExpeditionTierUnlocked(this.selectedZoneId, this.selectedTier);
    const ready = zoneUnlocked && tierUnlocked;
    const zoneIndex = this.getSelectedZoneIndex();
    const canZonePrev = zones.length > 1 && zoneIndex > 0;
    const canZoneNext = zones.length > 1 && zoneIndex < zones.length - 1;
    const canTierDown = this.selectedTier > 1;
    const canTierUp = this.selectedTier < EXPEDITION_MAX_TIER;

    const applySmallButtonState = (
      bg: Phaser.GameObjects.Rectangle,
      text: Phaser.GameObjects.Text,
      hitZone: Phaser.GameObjects.Zone,
      enabled: boolean,
    ): void => {
      bg.setFillStyle(enabled ? 0x1e3a8a : 0x111827, enabled ? 0.3 : 0.2);
      bg.setStrokeStyle(1, enabled ? 0x3b82f6 : 0x334155, 0.8);
      text.setColor(enabled ? '#93c5fd' : '#64748b');
      if (bg.input) bg.input.enabled = enabled;
      if (text.input) text.input.enabled = enabled;
      if (hitZone.input) hitZone.input.enabled = enabled && this.panelOpen;
      bg.setAlpha(enabled ? 0.92 : 0.55);
    };

    this.mapPanelZoneValueText.setText(zone?.name ?? this.selectedZoneId);
    this.mapPanelTierValueText.setText(`T${this.selectedTier}  (Unlocked: ${maxUnlockedTier}/${EXPEDITION_MAX_TIER})`);
    this.mapPanelZoneLockText.setText(zoneUnlocked ? '' : this.getZoneLockReason(this.selectedZoneId));
    this.mapPanelObjectiveValueText.setText(`Objective: ${objective}`);
    this.mapPanelMonsterLevelValueText.setText(`Monster Level: ${levelMin}-${levelMax}`);
    this.mapPanelRewardValueText.setText(`Rewards: ${rewardXp} XP, ${rewardGold} Gold, ${rewardChests} Chests`);
    this.mapPanelScaleValueText.setText(`Map Scale: ${(mapSizeScale * 100).toFixed(0)}%  |  Target Kills: ${targetKills}`);
    this.mapPanelProgressValueText.setText(`Tier Progress: ${maxUnlockedTier}/${EXPEDITION_MAX_TIER}`);
    this.mapPanelStatusText.setText(status);
    this.mapPanelStatusText.setColor(ready ? '#86efac' : '#fcd34d');
    this.mapPanelStatusText.setBackgroundColor(ready ? 'rgba(21,128,61,0.22)' : 'rgba(120,53,15,0.22)');
    this.mapPanelLaunchButtonBg.setFillStyle(ready ? 0x14532d : 0x3f3f46, ready ? 0.95 : 0.85);
    this.mapPanelLaunchButtonBg.setStrokeStyle(2, ready ? 0x22c55e : 0x71717a, 0.95);
    this.mapPanelLaunchButtonText.setText(ready ? 'Launch Expedition' : 'Locked');
    this.mapPanelLaunchButtonText.setColor(ready ? '#ecfeff' : '#d4d4d8');
    if (this.mapPanelLaunchButtonBg.input) this.mapPanelLaunchButtonBg.input.enabled = ready;
    if (this.mapPanelLaunchButtonText.input) this.mapPanelLaunchButtonText.input.enabled = ready;
    if (this.mapPanelLaunchHitZone.input) this.mapPanelLaunchHitZone.input.enabled = ready && this.panelOpen;
    this.mapPanelLaunchButtonBg.setAlpha(ready ? 0.92 : 0.62);

    applySmallButtonState(this.mapPanelZonePrevButtonBg, this.mapPanelZonePrevText, this.mapPanelZonePrevHitZone, canZonePrev);
    applySmallButtonState(this.mapPanelZoneNextButtonBg, this.mapPanelZoneNextText, this.mapPanelZoneNextHitZone, canZoneNext);
    applySmallButtonState(this.mapPanelTierPrevButtonBg, this.mapPanelTierPrevText, this.mapPanelTierPrevHitZone, canTierDown);
    applySmallButtonState(this.mapPanelTierNextButtonBg, this.mapPanelTierNextText, this.mapPanelTierNextHitZone, canTierUp);

    this.mapPanelHintText.setText(
      'A/D or Left/Right: Tier   W/S or Up/Down: Zone   Enter/E: Launch   Esc: Close'
    );
  }

  private handleMapPanelInput(): void {
    if (Phaser.Input.Keyboard.JustDown(this.cursors.left) || Phaser.Input.Keyboard.JustDown(this.keyA)) {
      this.changeSelectedTier(-1);
    }

    if (Phaser.Input.Keyboard.JustDown(this.cursors.right) || Phaser.Input.Keyboard.JustDown(this.keyD)) {
      this.changeSelectedTier(1);
    }

    if (Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.keyW)) {
      this.changeSelectedZone(-1);
    }

    if (Phaser.Input.Keyboard.JustDown(this.cursors.down) || Phaser.Input.Keyboard.JustDown(this.keyS)) {
      this.changeSelectedZone(1);
    }
  }

  private launchSelectedExpedition(): void {
    const zoneId = this.selectedZoneId;
    const tier = clampTier(this.selectedTier);

    if (!isExpeditionZoneUnlocked(zoneId)) {
      this.mapPanelStatusText.setText(this.getZoneLockReason(zoneId));
      this.mapPanelStatusText.setColor('#fca5a5');
      this.mapPanelStatusText.setBackgroundColor('rgba(127,29,29,0.28)');
      return;
    }

    if (!isExpeditionTierUnlocked(zoneId, tier)) {
      this.mapPanelStatusText.setText(this.getTierLockReason(zoneId, tier));
      this.mapPanelStatusText.setColor('#fca5a5');
      this.mapPanelStatusText.setBackgroundColor('rgba(127,29,29,0.28)');
      return;
    }

    const run = expeditions.launchExpedition({ zoneId, tier });
    if (!run) {
      this.mapPanelStatusText.setText('Unable to launch expedition');
      this.mapPanelStatusText.setColor('#fca5a5');
      this.mapPanelStatusText.setBackgroundColor('rgba(127,29,29,0.28)');
      return;
    }

    this.toggleMapPanel(false);

    if (this.scene.isSleeping('GameScene')) {
      this.scene.wake('GameScene');
    } else if (!this.scene.isActive('GameScene')) {
      this.scene.launch('GameScene');
    }

    this.scene.sleep();
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.panelOpen) return;
    if (this.isPointInsideMapPanel(pointer.x, pointer.y)) return;
    this.toggleMapPanel(false);
  }

  private isPointInsideMapPanel(px: number, py: number): boolean {
    const cx = this.scale.width * 0.5;
    const cy = this.scale.height * 0.5;
    const left = cx - MAP_PANEL_FRAME_W / 2;
    const top = cy - MAP_PANEL_FRAME_H / 2;
    return (
      px >= left && px <= left + MAP_PANEL_FRAME_W &&
      py >= top && py <= top + MAP_PANEL_FRAME_H
    );
  }

  private onWakeFromExpedition(): void {
    setGameMode('hub');
    this.toggleMapPanel(false);

    const player = getPlayer();
    player.x = 640;
    player.y = 420;
    this.playerEntity.sprite.setPosition(player.x, player.y);
  }
}
