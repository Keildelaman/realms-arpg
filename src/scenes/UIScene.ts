import Phaser from 'phaser';
import { getPlayer, getState } from '@/core/game-state';
import { on } from '@/core/event-bus';
import { ZONES } from '@/data/zones.data';

// UI Components
import { HealthBar } from '@/ui/HealthBar';
import { EnergyBar } from '@/ui/EnergyBar';
import { XPBar } from '@/ui/XPBar';
import { SkillBar } from '@/ui/SkillBar';
import { Minimap } from '@/ui/Minimap';
import { InventoryPanel } from '@/ui/InventoryPanel';
import { LootPopupManager } from '@/ui/LootPopup';
import { COLORS } from '@/data/constants';

export class UIScene extends Phaser.Scene {
  private healthBar!: HealthBar;
  private energyBar!: EnergyBar;
  private xpBar!: XPBar;
  private skillBar!: SkillBar;
  private minimap!: Minimap;
  private inventoryPanel!: InventoryPanel;
  private lootPopups!: LootPopupManager;

  // Info displays
  private goldText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private zoneText!: Phaser.GameObjects.Text;
  private fpsText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'UIScene' });
  }

  create(): void {
    // --- HUD bars ---
    this.healthBar = new HealthBar(this);
    this.add.existing(this.healthBar);

    this.energyBar = new EnergyBar(this);
    this.add.existing(this.energyBar);

    this.xpBar = new XPBar(this);
    this.add.existing(this.xpBar);

    // --- Skill bar ---
    this.skillBar = new SkillBar(this);
    this.add.existing(this.skillBar);

    // --- Minimap ---
    this.minimap = new Minimap(this);
    this.add.existing(this.minimap);

    // --- Inventory panel (hidden by default) ---
    this.inventoryPanel = new InventoryPanel(this);
    this.add.existing(this.inventoryPanel);

    // --- Loot popups ---
    this.lootPopups = new LootPopupManager(this);

    // --- Info text ---
    this.goldText = this.add.text(16, 72, '', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: COLORS.gold,
      stroke: '#000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(100);

    this.levelText = this.add.text(16, 92, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: COLORS.uiText,
      stroke: '#000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(100);

    this.zoneText = this.add.text(16, 110, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: COLORS.uiTextDim,
      stroke: '#000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(100);

    this.fpsText = this.add.text(16, 130, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#666666',
      stroke: '#000',
      strokeThickness: 1,
    }).setScrollFactor(0).setDepth(100);

    // --- Controls hint with dark background panel ---
    const controlsText = 'WASD:Move  Mouse:Aim  LClick:Attack  1-4:Skills  Space:Dash  Tab:Inventory';
    this.add.text(
      this.scale.width / 2, 16,
      controlsText,
      {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#dddddd',
        stroke: '#000',
        strokeThickness: 2,
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: { x: 10, y: 4 },
      },
    ).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100);

    // --- Event listeners ---
    on('zone:entered', () => {
      this.updateZoneText();
    });
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    const player = getPlayer();
    const state = getState();

    // Update HUD components
    this.healthBar.update(dt);
    this.energyBar.update(dt);
    this.xpBar.update(dt);
    this.skillBar.update(dt);
    this.minimap.update(dt);
    this.inventoryPanel.update(dt);

    // Update info text
    this.goldText.setText(`Gold: ${player.gold}`);
    this.levelText.setText(`Lv.${player.level}  ATK:${player.attack}  DEF:${player.defense}  SPD:${Math.floor(player.moveSpeed)}`);
    this.updateZoneText();

    // FPS counter
    const fps = Math.round(this.game.loop.actualFps);
    let aliveCount = 0;
    for (const m of state.monsters) { if (!m.isDead) aliveCount++; }
    this.fpsText.setText(`${fps} FPS  Monsters:${aliveCount}`);
  }

  private updateZoneText(): void {
    const state = getState();
    const zone = ZONES[state.activeZoneId];
    if (zone) {
      const kills = state.zoneKillCounts[state.activeZoneId] || 0;
      this.zoneText.setText(`${zone.name} (T${zone.tier}) — Kills: ${kills}/${zone.bossUnlockKills}`);
    }
  }
}
