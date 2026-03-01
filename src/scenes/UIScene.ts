import Phaser from 'phaser';
import { getState } from '@/core/game-state';
import { on, emit } from '@/core/event-bus';
import { ZONES } from '@/data/zones.data';
import * as expeditions from '@/systems/expeditions';

// UI Components
import { HealthBar } from '@/ui/HealthBar';
import { EnergyBar } from '@/ui/EnergyBar';
import { XPBar } from '@/ui/XPBar';
import { SkillBar } from '@/ui/SkillBar';
import { Minimap } from '@/ui/Minimap';
import { InventoryPanel } from '@/ui/InventoryPanel';
import { MerchantPanel } from '@/ui/MerchantPanel';
import { LootPopupManager } from '@/ui/LootPopup';
import { MonsterInfoPanel } from '@/ui/MonsterInfoPanel';
import { COLORS } from '@/data/constants';

export class UIScene extends Phaser.Scene {
  private healthBar!: HealthBar;
  private energyBar!: EnergyBar;
  private xpBar!: XPBar;
  private skillBar!: SkillBar;
  private minimap!: Minimap;
  private inventoryPanel!: InventoryPanel;
  private merchantPanel!: MerchantPanel;
  private lootPopups!: LootPopupManager;
  private monsterInfoPanel!: MonsterInfoPanel;

  // Info displays
  private zoneText!: Phaser.GameObjects.Text;
  private objectiveText!: Phaser.GameObjects.Text;
  private portalsText!: Phaser.GameObjects.Text;
  private fpsText!: Phaser.GameObjects.Text;

  private leaveConfirmText!: Phaser.GameObjects.Text;
  private resultToastText!: Phaser.GameObjects.Text;

  private keyEsc!: Phaser.Input.Keyboard.Key;
  private keyY!: Phaser.Input.Keyboard.Key;
  private keyN!: Phaser.Input.Keyboard.Key;
  private keyTab!: Phaser.Input.Keyboard.Key;

  private controlsHint!: Phaser.GameObjects.Text;

  private leaveConfirmVisible = false;
  private resultToastTimer = 0;

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

    // --- Merchant panel (hidden by default) ---
    this.merchantPanel = new MerchantPanel(this);
    this.add.existing(this.merchantPanel);

    // --- Loot popups ---
    this.lootPopups = new LootPopupManager(this);

    // --- Monster info panel ---
    this.monsterInfoPanel = new MonsterInfoPanel(this);

    // --- Info text ---
    this.zoneText = this.add.text(16, 16, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: COLORS.uiTextDim,
      stroke: '#000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(100);

    this.objectiveText = this.add.text(16, 36, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#bae6fd',
      stroke: '#000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(100);

    this.portalsText = this.add.text(16, 56, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#fde68a',
      stroke: '#000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(100);

    this.fpsText = this.add.text(16, 76, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#666666',
      stroke: '#000',
      strokeThickness: 1,
    }).setScrollFactor(0).setDepth(100);

    this.leaveConfirmText = this.add.text(this.scale.width / 2, this.scale.height / 2, '', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#f8fafc',
      stroke: '#000000',
      strokeThickness: 3,
      backgroundColor: 'rgba(0,0,0,0.75)',
      padding: { x: 12, y: 8 },
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(300).setVisible(false);

    this.resultToastText = this.add.text(this.scale.width / 2, 52, '', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#f8fafc',
      stroke: '#000000',
      strokeThickness: 2,
      backgroundColor: 'rgba(0,0,0,0.55)',
      padding: { x: 10, y: 4 },
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(250).setVisible(false);

    // --- Controls hint with dark background panel (expedition-only) ---
    const controlsText = 'WASD:Move  Mouse:Aim  LClick:Attack  1-4:Skills  Space:Dash  Tab:Inventory';
    this.controlsHint = this.add.text(
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

    this.keyEsc = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.keyY = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Y);
    this.keyN = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.N);
    this.keyTab = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);

    this.keyTab.on('down', () => {
      emit('ui:inventoryToggle');
    });

    this.keyEsc.on('down', () => {
      const state = getState();
      if (state.gameMode !== 'expedition') return;
      if (state.activeExpedition?.status === 'awaiting_extraction') return;
      if (state.inventoryOpen) {
        emit('ui:inventoryToggle');
        return;
      }
      this.leaveConfirmVisible = !this.leaveConfirmVisible;
      this.syncLeaveConfirm();
    });

    this.keyY.on('down', () => {
      if (!this.leaveConfirmVisible) return;
      this.leaveConfirmVisible = false;
      this.syncLeaveConfirm();
      expeditions.abandonActiveExpedition();
    });

    this.keyN.on('down', () => {
      if (!this.leaveConfirmVisible) return;
      this.leaveConfirmVisible = false;
      this.syncLeaveConfirm();
    });

    // --- Event listeners ---
    on('zone:entered', () => {
      this.updateZoneText();
    });

    on('expedition:completed', (data) => {
      const totalXP = data.rewards.completionXP + data.rewards.firstClearXPBonus;
      const totalGold = data.rewards.completionGold + data.rewards.firstClearGoldBonus;
      this.showResultToast(`Expedition Complete  +${totalXP} XP  +${totalGold} Gold`);
    });

    on('expedition:readyToExtract', () => {
      this.showResultToast('Map Cleared  -  Open reward chest, then use portal');
    });

    on('expedition:chestOpened', (data) => {
      const rarityLabel = data.rarity.charAt(0).toUpperCase() + data.rarity.slice(1);
      const sourceLabel = data.source === 'completion' ? 'Reward' : 'Map';
      this.showResultToast(`${sourceLabel} ${rarityLabel} Chest Opened  -  ${data.dropCount} loot drops`);
    });

    on('expedition:failed', (data) => {
      if (data.reason === 'no_portals') {
        this.showResultToast('Expedition Failed: No portals remaining');
      } else {
        this.showResultToast('Expedition Abandoned');
      }
    });

    on('expedition:returnHub', () => {
      this.leaveConfirmVisible = false;
      this.syncLeaveConfirm();
    });
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    const state = getState();

    // Update HUD components
    this.healthBar.update(dt);
    this.energyBar.update(dt);
    this.xpBar.update(dt);
    this.skillBar.update(dt);
    this.minimap.update(dt);
    this.inventoryPanel.update(dt);
    this.lootPopups.update(dt);
    this.monsterInfoPanel.update(dt);
    this.controlsHint.setVisible(state.gameMode === 'expedition');

    this.updateZoneText();
    this.updateExpeditionHud();

    if (this.resultToastTimer > 0) {
      this.resultToastTimer -= dt;
      if (this.resultToastTimer <= 0) {
        this.resultToastTimer = 0;
        this.resultToastText.setVisible(false);
      }
    }

    // FPS counter
    const fps = Math.round(this.game.loop.actualFps);
    let aliveCount = 0;
    for (const m of state.monsters) { if (!m.isDead) aliveCount++; }
    this.fpsText.setText(`${fps} FPS  Monsters:${aliveCount}`);
  }

  private updateZoneText(): void {
    const state = getState();

    if (state.gameMode === 'hub') {
      this.zoneText.setText('Hub: Haven');
      return;
    }

    const run = state.activeExpedition;
    if (run) {
      const zone = ZONES[run.zoneId];
      this.zoneText.setText(`${zone?.name ?? run.zoneId} (T${run.tier})`);
      return;
    }

    const zone = ZONES[state.activeZoneId];
    if (zone) {
      const kills = state.zoneKillCounts[state.activeZoneId] || 0;
      this.zoneText.setText(`${zone.name} (T${zone.tier}) - Kills: ${kills}/${zone.bossUnlockKills}`);
    }
  }

  private updateExpeditionHud(): void {
    const state = getState();
    if (state.gameMode !== 'expedition' || !state.activeExpedition) {
      this.objectiveText.setText('');
      this.portalsText.setText('');
      return;
    }

    const run = state.activeExpedition;
    if (run.status === 'awaiting_extraction') {
      const hasPendingRewardChest = run.chests.some(chest => chest.source === 'completion' && !chest.isOpened);
      if (hasPendingRewardChest) {
        this.objectiveText.setText('Map Cleared: Open Reward Chest (E)');
      } else {
        this.objectiveText.setText('Map Cleared: Use Extraction Portal (E)');
      }
      this.portalsText.setText('');
      this.leaveConfirmVisible = false;
      this.syncLeaveConfirm();
      return;
    }
    const label = run.map.objective === 'boss_hunt' ? 'Boss Hunt' : 'Extermination';
    this.objectiveText.setText(`${label}: ${run.progress.currentKills}/${run.progress.requiredKills}`);
    this.portalsText.setText(`Portals: ${run.portalsRemaining}/${run.maxPortals}`);
    this.syncLeaveConfirm();
  }

  private syncLeaveConfirm(): void {
    if (!this.leaveConfirmVisible || getState().gameMode !== 'expedition') {
      this.leaveConfirmText.setVisible(false);
      return;
    }

    this.leaveConfirmText
      .setVisible(true)
      .setText('Leave Expedition?\nY: Confirm  |  N or ESC: Cancel');
  }

  private showResultToast(text: string): void {
    this.resultToastText.setText(text);
    this.resultToastText.setVisible(true);
    this.resultToastTimer = 4;
  }
}
