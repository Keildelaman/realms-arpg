// ============================================================================
// MonsterInfoPanel — Displays focused monster's stats in the UI
// ============================================================================

import Phaser from 'phaser';
import { getState, getMonsterById } from '@/core/game-state';
import { on } from '@/core/event-bus';
import { COLORS, GAME_WIDTH } from '@/data/constants';
import { getMonsterAffix } from '@/data/monster-affixes.data';

// --- Layout constants ---
const PANEL_WIDTH = 200;
const PANEL_HEIGHT = 130;
const PANEL_PADDING = 10;
const PANEL_MARGIN = 16;
const HP_BAR_HEIGHT = 10;

const RARITY_COLORS: Record<string, string> = {
  normal: '#e5e5e5',
  magic: '#60a5fa',
  rare: '#fbbf24',
};

export class MonsterInfoPanel extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private nameText: Phaser.GameObjects.Text;
  private levelText: Phaser.GameObjects.Text;
  private hpBarBg: Phaser.GameObjects.Graphics;
  private hpBarFill: Phaser.GameObjects.Graphics;
  private hpText: Phaser.GameObjects.Text;
  private archetypeText: Phaser.GameObjects.Text;
  private typeText: Phaser.GameObjects.Text;
  private affixText: Phaser.GameObjects.Text;

  private isShown: boolean = false;
  private slideProgress: number = 0;

  constructor(scene: Phaser.Scene) {
    const w = scene.scale.width || GAME_WIDTH;
    const panelY = 200 + 16 + 16; // below minimap (200px) + minimap margin (16px) + gap (16px)
    super(scene, w - PANEL_WIDTH - PANEL_MARGIN, panelY);
    scene.add.existing(this);
    this.setScrollFactor(0);
    this.setDepth(110);

    // Background panel
    this.bg = scene.add.graphics();
    this.add(this.bg);
    this.drawBackground();

    // Monster name
    this.nameText = scene.add.text(PANEL_PADDING, PANEL_PADDING, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#e5e5e5',
      stroke: '#000',
      strokeThickness: 2,
      wordWrap: { width: PANEL_WIDTH - PANEL_PADDING * 2 },
    });
    this.add(this.nameText);

    // Level text (right-aligned)
    this.levelText = scene.add.text(PANEL_WIDTH - PANEL_PADDING, PANEL_PADDING, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: COLORS.uiTextDim,
      stroke: '#000',
      strokeThickness: 1,
    }).setOrigin(1, 0);
    this.add(this.levelText);

    // HP bar background
    this.hpBarBg = scene.add.graphics();
    this.add(this.hpBarBg);

    // HP bar fill
    this.hpBarFill = scene.add.graphics();
    this.add(this.hpBarFill);

    // HP text
    this.hpText = scene.add.text(PANEL_WIDTH / 2, PANEL_PADDING + 22, '', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#ffffff',
      stroke: '#000',
      strokeThickness: 1,
    }).setOrigin(0.5, 0);
    this.add(this.hpText);

    // Archetype label
    this.archetypeText = scene.add.text(PANEL_PADDING, PANEL_PADDING + 52, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#a3a3a3',
      stroke: '#000',
      strokeThickness: 1,
    });
    this.add(this.archetypeText);

    // Monster type label
    this.typeText = scene.add.text(PANEL_PADDING, PANEL_PADDING + 68, '', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#737373',
      stroke: '#000',
      strokeThickness: 1,
    });
    this.add(this.typeText);

    // Affix names
    this.affixText = scene.add.text(PANEL_PADDING, PANEL_PADDING + 84, '', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#c084fc',
      stroke: '#000',
      strokeThickness: 1,
      wordWrap: { width: PANEL_WIDTH - PANEL_PADDING * 2 },
    });
    this.add(this.affixText);

    // Start hidden
    this.setVisible(false);
    this.setAlpha(0);

    // Listen for target changes
    on('player:targetChanged', this.onTargetChanged);
  }

  private onTargetChanged = (_data: { monsterId: string | null }): void => {
    // Show/hide is handled in update based on targetMonsterId
  };

  update(dt: number): void {
    const state = getState();
    const targetId = state.player.targetMonsterId;

    const shouldShow = targetId !== null;

    if (shouldShow && !this.isShown) {
      this.isShown = true;
      this.setVisible(true);
    } else if (!shouldShow && this.isShown) {
      this.isShown = false;
    }

    // Slide animation
    if (this.isShown && this.slideProgress < 1) {
      this.slideProgress = Math.min(1, this.slideProgress + dt * 5);
      this.setAlpha(this.slideProgress);
    } else if (!this.isShown && this.slideProgress > 0) {
      this.slideProgress = Math.max(0, this.slideProgress - dt * 5);
      this.setAlpha(this.slideProgress);
      if (this.slideProgress <= 0) {
        this.setVisible(false);
      }
    }

    if (!this.visible || !targetId) return;

    const monster = getMonsterById(targetId);
    if (!monster || monster.isDead) {
      // Auto-clear
      state.player.targetMonsterId = null;
      return;
    }

    // Update name with rarity color
    const nameColor = RARITY_COLORS[monster.rarity] ?? '#e5e5e5';
    this.nameText.setColor(nameColor);
    this.nameText.setText(monster.name);

    // Level
    const zone = ZONES_LEVEL_DISPLAY[monster.zone] ?? '';
    this.levelText.setText(zone);

    // HP bar
    const hpRatio = Math.max(0, monster.currentHP / monster.maxHP);
    const barX = PANEL_PADDING;
    const barY = PANEL_PADDING + 34;
    const barWidth = PANEL_WIDTH - PANEL_PADDING * 2;

    this.hpBarBg.clear();
    this.hpBarBg.fillStyle(0x1a1a1a, 0.8);
    this.hpBarBg.fillRect(barX, barY, barWidth, HP_BAR_HEIGHT);

    this.hpBarFill.clear();
    const hpColor = Phaser.Display.Color.HexStringToColor(COLORS.monsterHP).color;
    this.hpBarFill.fillStyle(hpColor, 1);
    this.hpBarFill.fillRect(barX, barY, barWidth * hpRatio, HP_BAR_HEIGHT);

    // Shield overlay
    if (monster.maxShield > 0 && monster.currentShield > 0) {
      const shieldRatio = monster.currentShield / monster.maxShield;
      const shieldColor = Phaser.Display.Color.HexStringToColor(COLORS.monsterShield).color;
      this.hpBarFill.fillStyle(shieldColor, 0.6);
      this.hpBarFill.fillRect(barX, barY + HP_BAR_HEIGHT, barWidth * shieldRatio, 3);
    }

    this.hpText.setText(`${Math.ceil(monster.currentHP)} / ${monster.maxHP}`);
    this.hpText.setY(barY - 1);

    // Archetype
    const archLabel = monster.archetype.charAt(0).toUpperCase() + monster.archetype.slice(1);
    const atk = monster.attack;
    const def = monster.defense + monster.armor;
    this.archetypeText.setText(`${archLabel}  ATK:${atk}  DEF:${def}`);

    // Monster types
    const typeLabels = monster.types.filter(t => t !== 'normal').join(', ');
    this.typeText.setText(typeLabels ? `Type: ${typeLabels}` : '');

    // Affixes
    if (monster.affixes.length > 0) {
      const affixNames = monster.affixes
        .map(a => {
          const def = getMonsterAffix(a.id);
          return def?.name ?? a.id;
        })
        .join(', ');
      this.affixText.setText(affixNames);
      this.affixText.setColor(monster.rarity === 'rare' ? '#fbbf24' : '#60a5fa');
    } else {
      this.affixText.setText('');
    }
  }

  private drawBackground(): void {
    this.bg.clear();
    this.bg.fillStyle(0x000000, 0.75);
    this.bg.fillRoundedRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT, 6);
    this.bg.lineStyle(1, 0x333333, 0.8);
    this.bg.strokeRoundedRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT, 6);
  }
}

// Simple zone display — just show zone name if available
const ZONES_LEVEL_DISPLAY: Record<string, string> = {};
