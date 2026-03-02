// ============================================================================
// MonsterInfoPanel - Displays focused monster info in a compact top-center card
// ============================================================================

import Phaser from 'phaser';
import { getState, getMonsterById } from '@/core/game-state';
import { on, off } from '@/core/event-bus';
import { COLORS, GAME_WIDTH } from '@/data/constants';
import { ZONES } from '@/data/zones.data';
import { getMonsterAffix } from '@/data/monster-affixes.data';
import { UI_THEME, drawPanelShell, drawSectionCard } from '@/ui/ui-theme';

const PANEL_WIDTH = 320;
const PANEL_HEIGHT = 132;
const PANEL_PADDING = 12;
const HP_BAR_HEIGHT = 10;

const RARITY_COLORS: Record<string, string> = {
  normal: '#e2e8f0',
  magic: '#60a5fa',
  rare: '#fbbf24',
};

export class MonsterInfoPanel extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private nameText: Phaser.GameObjects.Text;
  private metaText: Phaser.GameObjects.Text;
  private hpBarBg: Phaser.GameObjects.Graphics;
  private hpBarFill: Phaser.GameObjects.Graphics;
  private hpText: Phaser.GameObjects.Text;
  private archetypeText: Phaser.GameObjects.Text;
  private typeText: Phaser.GameObjects.Text;
  private affixText: Phaser.GameObjects.Text;

  private isShown = false;
  private slideProgress = 0;

  constructor(scene: Phaser.Scene) {
    const w = scene.scale.width || GAME_WIDTH;
    const panelX = Math.floor((w - PANEL_WIDTH) / 2);
    super(scene, panelX, 14);
    scene.add.existing(this);
    this.setScrollFactor(0);
    this.setDepth(110);

    this.bg = scene.add.graphics();
    this.add(this.bg);
    this.drawBackground();

    this.nameText = scene.add.text(PANEL_PADDING, PANEL_PADDING, '', {
      fontFamily: 'monospace',
      fontSize: '15px',
      color: UI_THEME.text,
      stroke: '#000',
      strokeThickness: 2,
      wordWrap: { width: PANEL_WIDTH - PANEL_PADDING * 2 - 88 },
    });
    this.add(this.nameText);

    this.metaText = scene.add.text(PANEL_WIDTH - PANEL_PADDING, PANEL_PADDING + 1, '', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: UI_THEME.textDim,
      stroke: '#000',
      strokeThickness: 1,
      align: 'right',
    }).setOrigin(1, 0);
    this.add(this.metaText);

    this.hpBarBg = scene.add.graphics();
    this.add(this.hpBarBg);

    this.hpBarFill = scene.add.graphics();
    this.add(this.hpBarFill);

    this.hpText = scene.add.text(PANEL_WIDTH / 2, PANEL_PADDING + 26, '', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#ffffff',
      stroke: '#000',
      strokeThickness: 1,
    }).setOrigin(0.5, 0);
    this.add(this.hpText);

    this.archetypeText = scene.add.text(PANEL_PADDING, PANEL_PADDING + 52, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#cbd5e1',
      stroke: '#000',
      strokeThickness: 1,
    });
    this.add(this.archetypeText);

    this.typeText = scene.add.text(PANEL_PADDING, PANEL_PADDING + 69, '', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#94a3b8',
      stroke: '#000',
      strokeThickness: 1,
    });
    this.add(this.typeText);

    this.affixText = scene.add.text(PANEL_PADDING, PANEL_PADDING + 86, '', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#c084fc',
      stroke: '#000',
      strokeThickness: 1,
      wordWrap: { width: PANEL_WIDTH - PANEL_PADDING * 2 },
    });
    this.add(this.affixText);

    this.setVisible(false);
    this.setAlpha(0);

    on('player:targetChanged', this.onTargetChanged);
    scene.scale.on('resize', this.onResize, this);
  }

  private onTargetChanged = (): void => {
    // Visibility handled in update by targetMonsterId.
  };

  private onResize = (size: Phaser.Structs.Size): void => {
    this.setPosition(Math.floor((size.width - PANEL_WIDTH) / 2), 14);
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

    if (this.isShown && this.slideProgress < 1) {
      this.slideProgress = Math.min(1, this.slideProgress + dt * 6);
      this.setAlpha(this.slideProgress);
    } else if (!this.isShown && this.slideProgress > 0) {
      this.slideProgress = Math.max(0, this.slideProgress - dt * 6);
      this.setAlpha(this.slideProgress);
      if (this.slideProgress <= 0) this.setVisible(false);
    }

    if (!this.visible || !targetId) return;

    const monster = getMonsterById(targetId);
    if (!monster || monster.isDead) {
      state.player.targetMonsterId = null;
      return;
    }

    const nameColor = RARITY_COLORS[monster.rarity] ?? '#e2e8f0';
    this.nameText.setColor(nameColor);
    this.nameText.setText(monster.name);

    const zoneName = ZONES[monster.zone]?.name ?? monster.zone;
    const rarityLabel = monster.rarity.charAt(0).toUpperCase() + monster.rarity.slice(1);
    this.metaText.setText(`${rarityLabel}\n${zoneName}`);

    const hpRatio = Math.max(0, monster.currentHP / Math.max(1, monster.maxHP));
    const barX = PANEL_PADDING;
    const barY = PANEL_PADDING + 36;
    const barWidth = PANEL_WIDTH - PANEL_PADDING * 2;

    this.hpBarBg.clear();
    this.hpBarBg.fillStyle(0x111827, 0.92);
    this.hpBarBg.fillRoundedRect(barX, barY, barWidth, HP_BAR_HEIGHT, 4);
    this.hpBarBg.lineStyle(1, 0x334155, 0.9);
    this.hpBarBg.strokeRoundedRect(barX, barY, barWidth, HP_BAR_HEIGHT, 4);

    this.hpBarFill.clear();
    const hpColor = Phaser.Display.Color.HexStringToColor(COLORS.monsterHP).color;
    this.hpBarFill.fillStyle(hpColor, 1);
    if (hpRatio > 0) {
      this.hpBarFill.fillRoundedRect(barX, barY, barWidth * hpRatio, HP_BAR_HEIGHT, 4);
    }

    if (monster.maxShield > 0 && monster.currentShield > 0) {
      const shieldRatio = monster.currentShield / monster.maxShield;
      const shieldColor = Phaser.Display.Color.HexStringToColor(COLORS.monsterShield).color;
      this.hpBarFill.fillStyle(shieldColor, 0.72);
      this.hpBarFill.fillRoundedRect(barX, barY + HP_BAR_HEIGHT + 2, barWidth * shieldRatio, 4, 2);
    }

    this.hpText.setText(`${Math.ceil(monster.currentHP)} / ${monster.maxHP}`);
    this.hpText.setY(barY - 1);

    const archLabel = monster.archetype.charAt(0).toUpperCase() + monster.archetype.slice(1);
    this.archetypeText.setText(`${archLabel}  ATK:${monster.attack}  DEF:${monster.defense}  RES:${monster.magicResist}`);

    const typeLabels = monster.types.filter(t => t !== 'normal').join(', ');
    this.typeText.setText(typeLabels ? `Types: ${typeLabels}` : 'Types: -');

    if (monster.affixes.length > 0) {
      const affixNames = monster.affixes
        .map(a => getMonsterAffix(a.id)?.name ?? a.id)
        .join(', ');
      this.affixText.setText(affixNames);
      this.affixText.setColor(monster.rarity === 'rare' ? '#fbbf24' : '#60a5fa');
    } else {
      this.affixText.setText('');
    }
  }

  private drawBackground(): void {
    this.bg.clear();
    drawPanelShell(this.bg, 0, 0, PANEL_WIDTH, PANEL_HEIGHT, 10);
    drawSectionCard(this.bg, 10, 10, PANEL_WIDTH - 20, PANEL_HEIGHT - 20, false);
  }

  destroy(fromScene?: boolean): void {
    off('player:targetChanged', this.onTargetChanged);
    this.scene.scale.off('resize', this.onResize, this);
    super.destroy(fromScene);
  }
}
