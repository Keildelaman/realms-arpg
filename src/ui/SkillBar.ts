// ============================================================================
// SkillBar - 4 skill slots at bottom-center of screen
// ============================================================================

import Phaser from 'phaser';
import { getPlayer, getState } from '@/core/game-state';
import { GAME_WIDTH, GAME_HEIGHT, MAX_SKILL_LEVEL } from '@/data/constants';
import { SKILLS } from '@/data/skills.data';
import { checkUnlockCondition } from '@/systems/skills';
import { UI_THEME, drawSectionCard } from '@/ui/ui-theme';

const SKILL_ICON_SIZE = 58;
const SKILL_BAR_PADDING = 10;
const SLOT_KEY_LABELS = ['LMB', 'RMB', 'Q', 'E'];

interface SkillSlotDisplay {
  zone: Phaser.GameObjects.Zone;
  bg: Phaser.GameObjects.Graphics;
  cooldownOverlay: Phaser.GameObjects.Graphics;
  keyText: Phaser.GameObjects.Text;
  nameText: Phaser.GameObjects.Text;
  cooldownText: Phaser.GameObjects.Text;
  activeBorder: Phaser.GameObjects.Graphics;
  tooltipContainer: Phaser.GameObjects.Container | null;
  tooltipSkillId: string | null;
}

export class SkillBar extends Phaser.GameObjects.Container {
  private plate: Phaser.GameObjects.Graphics;
  private slots: SkillSlotDisplay[] = [];
  private totalWidth: number;
  private hoveredSlot = -1;

  // SP indicator + passive slots
  private spIndicator: Phaser.GameObjects.Graphics;
  private passivePlate: Phaser.GameObjects.Graphics;
  private passiveTexts: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.setScrollFactor(0);
    this.setDepth(100);

    this.totalWidth = SKILL_ICON_SIZE * 4 + SKILL_BAR_PADDING * 3;

    this.plate = scene.add.graphics();
    this.add(this.plate);

    for (let i = 0; i < 4; i++) {
      this.createSlot(i);
    }

    // SP indicator diamond
    this.spIndicator = scene.add.graphics();
    this.add(this.spIndicator);

    // Passive slot plate
    this.passivePlate = scene.add.graphics();
    this.add(this.passivePlate);

    for (let i = 0; i < 2; i++) {
      const txt = scene.add.text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: UI_THEME.textDim,
        stroke: '#000000',
        strokeThickness: 1,
      }).setOrigin(0.5, 0.5);
      this.add(txt);
      this.passiveTexts.push(txt);
    }

    scene.scale.on('resize', this.onResize, this);
  }

  private getSlotX(index: number): number {
    const screenWidth = this.scene.scale.width || GAME_WIDTH;
    const startX = (screenWidth - this.totalWidth) / 2;
    return startX + index * (SKILL_ICON_SIZE + SKILL_BAR_PADDING);
  }

  private getSlotY(): number {
    const screenHeight = this.scene.scale.height || GAME_HEIGHT;
    return screenHeight - 82;
  }

  private createSlot(index: number): void {
    const x = this.getSlotX(index);
    const y = this.getSlotY();

    const bg = this.scene.add.graphics();
    this.add(bg);

    const cooldownOverlay = this.scene.add.graphics();
    this.add(cooldownOverlay);

    const activeBorder = this.scene.add.graphics();
    this.add(activeBorder);

    const keyText = this.scene.add.text(x + 4, y + 2, SLOT_KEY_LABELS[index], {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: UI_THEME.text,
      stroke: '#000000',
      strokeThickness: 2,
    });
    this.add(keyText);

    const nameText = this.scene.add.text(x + SKILL_ICON_SIZE / 2, y + SKILL_ICON_SIZE - 10, '', {
      fontFamily: 'monospace',
      fontSize: '9px',
      color: '#cbd5e1',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 0.5);
    this.add(nameText);

    const cooldownText = this.scene.add.text(x + SKILL_ICON_SIZE / 2, y + SKILL_ICON_SIZE / 2 - 3, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5);
    this.add(cooldownText);

    const zone = this.scene.add.zone(x + SKILL_ICON_SIZE / 2, y + SKILL_ICON_SIZE / 2, SKILL_ICON_SIZE, SKILL_ICON_SIZE);
    zone.setInteractive({ useHandCursor: true });
    zone.setScrollFactor(0);
    zone.setDepth(101);
    const slotIndex = index;
    zone.on('pointerover', () => { this.hoveredSlot = slotIndex; });
    zone.on('pointerout', () => { if (this.hoveredSlot === slotIndex) this.hoveredSlot = -1; });
    this.add(zone);

    this.slots.push({
      zone,
      bg,
      cooldownOverlay,
      keyText,
      nameText,
      cooldownText,
      activeBorder,
      tooltipContainer: null,
      tooltipSkillId: null,
    });
  }

  private onResize = (): void => {
    // Positions are recomputed in update.
  };

  update(_dt: number): void {
    const player = getPlayer();
    const state = getState();

    this.drawBarPlate();

    for (let i = 0; i < 4; i++) {
      const slot = this.slots[i];
      const skillId = player.activeSkills[i];
      const x = this.getSlotX(i);
      const y = this.getSlotY();

      slot.zone.setPosition(x + SKILL_ICON_SIZE / 2, y + SKILL_ICON_SIZE / 2);
      slot.keyText.setPosition(x + 4, y + 2);
      slot.nameText.setPosition(x + SKILL_ICON_SIZE / 2, y + SKILL_ICON_SIZE - 10);
      slot.cooldownText.setPosition(x + SKILL_ICON_SIZE / 2, y + SKILL_ICON_SIZE / 2 - 3);

      slot.bg.clear();
      slot.cooldownOverlay.clear();
      slot.activeBorder.clear();

      const isHovered = this.hoveredSlot === i;
      if (slot.tooltipContainer && (!isHovered || slot.tooltipSkillId !== skillId)) {
        slot.tooltipContainer.destroy();
        slot.tooltipContainer = null;
        slot.tooltipSkillId = null;
      }

      if (!skillId) {
        slot.bg.fillStyle(0x1a2333, 0.88);
        slot.bg.fillRoundedRect(x, y, SKILL_ICON_SIZE, SKILL_ICON_SIZE, 6);
        slot.bg.lineStyle(1, isHovered ? 0x64748b : 0x334155, 0.9);
        slot.bg.strokeRoundedRect(x, y, SKILL_ICON_SIZE, SKILL_ICON_SIZE, 6);
        slot.nameText.setText('-');
        slot.nameText.setColor('#64748b');
        slot.cooldownText.setText('');
        continue;
      }

      const def = SKILLS[skillId];
      if (!def) continue;

      const skillState = state.skillStates[skillId];
      const isOnCooldown = !!(skillState && skillState.cooldownRemaining > 0);
      const isActive = !!(skillState && skillState.isActive);
      const skillColor = Phaser.Display.Color.HexStringToColor(def.color).color;

      slot.nameText.setText(def.name.substring(0, 4).toUpperCase());
      slot.nameText.setColor('#e2e8f0');

      if (isOnCooldown) {
        slot.bg.fillStyle(0x334155, 0.9);
        slot.bg.fillRoundedRect(x, y, SKILL_ICON_SIZE, SKILL_ICON_SIZE, 6);
        slot.bg.fillStyle(skillColor, 0.25);
        slot.bg.fillRoundedRect(x + 3, y + 3, SKILL_ICON_SIZE - 6, SKILL_ICON_SIZE - 6, 5);

        const cooldownRemaining = skillState!.cooldownRemaining;
        const level = player.skillLevels[skillId] ?? 1;
        const levelData = def.levels[Math.min(level - 1, def.levels.length - 1)];
        const totalCD = levelData ? levelData.cooldown : 1;
        const cdRatio = Math.min(1, cooldownRemaining / Math.max(0.001, totalCD));
        const overlayHeight = SKILL_ICON_SIZE * cdRatio;

        slot.cooldownOverlay.fillStyle(0x000000, 0.48);
        slot.cooldownOverlay.fillRoundedRect(x, y, SKILL_ICON_SIZE, overlayHeight, { tl: 6, tr: 6, bl: 0, br: 0 });
        slot.cooldownText.setText(cooldownRemaining.toFixed(1));
      } else {
        slot.bg.fillStyle(skillColor, 0.62);
        slot.bg.fillRoundedRect(x, y, SKILL_ICON_SIZE, SKILL_ICON_SIZE, 6);
        slot.bg.fillStyle(skillColor, 0.3);
        slot.bg.fillRoundedRect(x + 3, y + 3, SKILL_ICON_SIZE - 6, SKILL_ICON_SIZE - 6, 5);
        slot.cooldownText.setText('');
      }

      slot.bg.lineStyle(1, isHovered ? 0xbfdbfe : 0x64748b, isHovered ? 0.95 : 0.75);
      slot.bg.strokeRoundedRect(x, y, SKILL_ICON_SIZE, SKILL_ICON_SIZE, 6);

      if (isActive) {
        const pulse = 0.6 + Math.sin(this.scene.time.now / 150) * 0.35;
        slot.activeBorder.lineStyle(2, 0xffffff, pulse);
        slot.activeBorder.strokeRoundedRect(x - 2, y - 2, SKILL_ICON_SIZE + 4, SKILL_ICON_SIZE + 4, 7);
      }

      if (isHovered && !slot.tooltipContainer) {
        const level = player.skillLevels[skillId] ?? 1;
        const levelData = def.levels[Math.min(level - 1, def.levels.length - 1)];
        const energyCost = levelData ? levelData.energyCost : 0;
        const cooldown = levelData ? levelData.cooldown : 0;
        const tooltipText = `${def.name}  EN:${energyCost}  CD:${cooldown.toFixed(1)}s`;
        const container = this.scene.add.container(x, y - 30);
        container.setScrollFactor(0);
        container.setDepth(110);

        const tooltipBg = this.scene.add.graphics();
        const tooltipLabel = this.scene.add.text(6, 3, tooltipText, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: UI_THEME.text,
          stroke: '#000000',
          strokeThickness: 2,
        });
        const w = tooltipLabel.width + 12;
        const h = tooltipLabel.height + 6;
        tooltipBg.fillStyle(0x0f172a, 0.95);
        tooltipBg.fillRoundedRect(0, 0, w, h, 4);
        tooltipBg.lineStyle(1, 0x334155, 0.9);
        tooltipBg.strokeRoundedRect(0, 0, w, h, 4);
        container.add(tooltipBg);
        container.add(tooltipLabel);

        this.add(container);
        slot.tooltipContainer = container;
        slot.tooltipSkillId = skillId;
      }
    }

    // --- SP indicator diamond ---
    this.spIndicator.clear();
    if (player.skillPoints > 0) {
      const hasAction = this.hasAvailableSkillAction(player);
      if (hasAction) {
        const diamondX = this.getSlotX(3) + SKILL_ICON_SIZE + 14;
        const diamondY = this.getSlotY() + SKILL_ICON_SIZE / 2;
        const pulseAlpha = 0.5 + Math.sin(this.scene.time.now * 0.005) * 0.4;
        this.spIndicator.fillStyle(0xfbbf24, pulseAlpha);
        this.spIndicator.fillTriangle(
          diamondX, diamondY - 7,
          diamondX + 6, diamondY,
          diamondX, diamondY + 7,
        );
        this.spIndicator.fillTriangle(
          diamondX, diamondY - 7,
          diamondX - 6, diamondY,
          diamondX, diamondY + 7,
        );
      }
    }

    // --- Passive slot indicators ---
    this.drawPassiveIndicators(player);
  }

  private hasAvailableSkillAction(player: import('@/core/types').PlayerState): boolean {
    // Check if any skill can be unlocked or upgraded with current SP
    for (const def of Object.values(SKILLS)) {
      if (def.isBasicAttack) continue;
      if (player.unlockedSkills.includes(def.id)) {
        // Can level up?
        const level = player.skillLevels[def.id] ?? 0;
        if (level < MAX_SKILL_LEVEL && player.skillPoints >= 1) return true;
      } else {
        // Can unlock?
        if (player.skillPoints >= def.unlockCost) {
          const condition = checkUnlockCondition(def.id);
          if (condition.met) return true;
        }
      }
    }
    return false;
  }

  private drawPassiveIndicators(player: import('@/core/types').PlayerState): void {
    this.passivePlate.clear();

    const slotW = 48;
    const slotH = 22;
    const gap = 6;
    const plateW = slotW * 2 + gap + 16;
    const plateH = slotH + 12;
    const plateX = (this.scene.scale.width || GAME_WIDTH) / 2 - plateW / 2;
    const plateY = this.getSlotY() - plateH - 4;

    drawSectionCard(this.passivePlate, plateX, plateY, plateW, plateH, true, 6);

    for (let i = 0; i < 2; i++) {
      const sx = plateX + 8 + i * (slotW + gap);
      const sy = plateY + 6;

      this.passivePlate.fillStyle(0x111827, 0.7);
      this.passivePlate.fillRoundedRect(sx, sy, slotW, slotH, 4);
      this.passivePlate.lineStyle(1, 0x334155, 0.6);
      this.passivePlate.strokeRoundedRect(sx, sy, slotW, slotH, 4);

      const passiveId = player.passiveSkills[i];
      const txt = this.passiveTexts[i];
      txt.setPosition(sx + slotW / 2, sy + slotH / 2);

      if (passiveId) {
        const def = SKILLS[passiveId];
        txt.setText(def ? def.name.substring(0, 8) : passiveId.substring(0, 8));
        txt.setColor(UI_THEME.accent);
      } else {
        txt.setText('\u2014');
        txt.setColor(UI_THEME.textMuted);
      }
    }
  }

  private drawBarPlate(): void {
    const x = this.getSlotX(0) - 10;
    const y = this.getSlotY() - 10;
    const width = this.totalWidth + 20;
    const height = SKILL_ICON_SIZE + 20;
    this.plate.clear();
    drawSectionCard(this.plate, x, y, width, height, false, 10);
  }
}
