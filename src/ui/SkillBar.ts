// ============================================================================
// SkillBar — 4 skill slots at bottom-center of screen
// ============================================================================

import Phaser from 'phaser';
import { getPlayer, getState } from '@/core/game-state';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  COLORS,
} from '@/data/constants';
import { SKILLS } from '@/data/skills.data';

// --- Layout constants (local to this component) ---
const SKILL_ICON_SIZE = 60;
const SKILL_BAR_PADDING = 8;

interface SkillSlotDisplay {
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
  private slots: SkillSlotDisplay[] = [];
  private totalWidth: number;
  private hoveredSlot: number = -1;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.setScrollFactor(0);
    this.setDepth(100);

    // Calculate total bar width: 4 icons + 3 gaps
    this.totalWidth = SKILL_ICON_SIZE * 4 + SKILL_BAR_PADDING * 3;

    // Create 4 skill slot displays
    for (let i = 0; i < 4; i++) {
      this.createSlot(i);
    }

    // Handle resize
    scene.scale.on('resize', this.onResize, this);
  }

  private getSlotX(index: number): number {
    const screenWidth = this.scene.scale.width || GAME_WIDTH;
    const startX = (screenWidth - this.totalWidth) / 2;
    return startX + index * (SKILL_ICON_SIZE + SKILL_BAR_PADDING);
  }

  private getSlotY(): number {
    const screenHeight = this.scene.scale.height || GAME_HEIGHT;
    return screenHeight - 80;
  }

  private createSlot(index: number): void {
    const x = this.getSlotX(index);
    const y = this.getSlotY();

    // Background
    const bg = this.scene.add.graphics();
    this.add(bg);

    // Cooldown overlay
    const cooldownOverlay = this.scene.add.graphics();
    this.add(cooldownOverlay);

    // Active border (for toggle skills)
    const activeBorder = this.scene.add.graphics();
    this.add(activeBorder);

    // Key hint (1-4)
    const keyText = this.scene.add.text(
      x + 4,
      y + 2,
      `${index + 1}`,
      {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      }
    );
    this.add(keyText);

    // Skill name abbreviation
    const nameText = this.scene.add.text(
      x + SKILL_ICON_SIZE / 2,
      y + SKILL_ICON_SIZE - 10,
      '',
      {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#cccccc',
        stroke: '#000000',
        strokeThickness: 2,
      }
    );
    nameText.setOrigin(0.5, 0.5);
    this.add(nameText);

    // Cooldown remaining text
    const cooldownText = this.scene.add.text(
      x + SKILL_ICON_SIZE / 2,
      y + SKILL_ICON_SIZE / 2,
      '',
      {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      }
    );
    cooldownText.setOrigin(0.5, 0.5);
    this.add(cooldownText);

    // Set up hover detection zone
    const zone = this.scene.add.zone(
      x + SKILL_ICON_SIZE / 2,
      y + SKILL_ICON_SIZE / 2,
      SKILL_ICON_SIZE,
      SKILL_ICON_SIZE
    );
    zone.setInteractive();
    zone.setScrollFactor(0);
    zone.setDepth(101);
    const slotIndex = index;
    zone.on('pointerover', () => { this.hoveredSlot = slotIndex; });
    zone.on('pointerout', () => { if (this.hoveredSlot === slotIndex) this.hoveredSlot = -1; });
    this.add(zone);

    this.slots.push({
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
    // Positions will be recalculated in update()
  };

  update(_dt: number): void {
    const player = getPlayer();
    const state = getState();

    for (let i = 0; i < 4; i++) {
      const slot = this.slots[i];
      const skillId = player.activeSkills[i];
      const x = this.getSlotX(i);
      const y = this.getSlotY();

      // Update position of key and cooldown text
      slot.keyText.setPosition(x + 4, y + 2);
      slot.nameText.setPosition(x + SKILL_ICON_SIZE / 2, y + SKILL_ICON_SIZE - 10);
      slot.cooldownText.setPosition(x + SKILL_ICON_SIZE / 2, y + SKILL_ICON_SIZE / 2 - 4);

      // Clear graphics
      slot.bg.clear();
      slot.cooldownOverlay.clear();
      slot.activeBorder.clear();

      // Clean up tooltip if no longer hovering this slot or skill changed
      const isHovered = this.hoveredSlot === i;
      if (slot.tooltipContainer && (!isHovered || slot.tooltipSkillId !== skillId)) {
        slot.tooltipContainer.destroy();
        slot.tooltipContainer = null;
        slot.tooltipSkillId = null;
      }

      if (!skillId) {
        // Empty slot
        slot.bg.fillStyle(0x1a1a1a, 0.7);
        slot.bg.fillRoundedRect(x, y, SKILL_ICON_SIZE, SKILL_ICON_SIZE, 4);
        slot.bg.lineStyle(1, 0x333333, 0.4);
        slot.bg.strokeRoundedRect(x, y, SKILL_ICON_SIZE, SKILL_ICON_SIZE, 4);
        // Show dash in center
        slot.nameText.setText('\u2014');
        slot.nameText.setColor('#555555');
        slot.cooldownText.setText('');
        continue;
      }

      const def = SKILLS[skillId];
      if (!def) continue;

      const skillState = state.skillStates[skillId];
      const isOnCooldown = skillState && skillState.cooldownRemaining > 0;
      const isActive = skillState && skillState.isActive;

      // Skill name abbreviation
      slot.nameText.setText(def.name.substring(0, 3).toUpperCase());
      slot.nameText.setColor('#cccccc');

      // Draw skill icon background with skill color
      const skillColor = Phaser.Display.Color.HexStringToColor(def.color).color;

      if (isOnCooldown) {
        // Greyed out when on cooldown
        slot.bg.fillStyle(0x333333, 0.8);
        slot.bg.fillRoundedRect(x, y, SKILL_ICON_SIZE, SKILL_ICON_SIZE, 4);

        // Draw the skill color at reduced opacity underneath
        slot.bg.fillStyle(skillColor, 0.2);
        slot.bg.fillRoundedRect(x + 2, y + 2, SKILL_ICON_SIZE - 4, SKILL_ICON_SIZE - 4, 3);

        // Cooldown overlay: darken from top based on remaining ratio
        const cooldownDuration = skillState.cooldownRemaining;
        const level = player.skillLevels[skillId] ?? 1;
        const levelData = def.levels[Math.min(level - 1, def.levels.length - 1)];
        const totalCD = levelData ? levelData.cooldown : 1;
        const cdRatio = Math.min(1, cooldownDuration / totalCD);

        // Vertical sweep overlay
        const overlayHeight = SKILL_ICON_SIZE * cdRatio;
        slot.cooldownOverlay.fillStyle(0x000000, 0.5);
        slot.cooldownOverlay.fillRoundedRect(
          x, y,
          SKILL_ICON_SIZE, overlayHeight,
          { tl: 4, tr: 4, bl: 0, br: 0 }
        );

        // Show remaining time text
        slot.cooldownText.setText(cooldownDuration.toFixed(1));
        slot.cooldownText.setVisible(true);
      } else {
        // Ready — show skill color
        slot.bg.fillStyle(skillColor, 0.6);
        slot.bg.fillRoundedRect(x, y, SKILL_ICON_SIZE, SKILL_ICON_SIZE, 4);

        // Inner lighter area
        slot.bg.fillStyle(skillColor, 0.3);
        slot.bg.fillRoundedRect(x + 3, y + 3, SKILL_ICON_SIZE - 6, SKILL_ICON_SIZE - 6, 3);

        slot.cooldownText.setText('');
        slot.cooldownText.setVisible(false);
      }

      // Active border for toggle/channel skills
      if (isActive) {
        const pulse = 0.6 + Math.sin(this.scene.time.now / 150) * 0.4;
        slot.activeBorder.lineStyle(3, 0xffffff, pulse);
        slot.activeBorder.strokeRoundedRect(
          x - 2, y - 2,
          SKILL_ICON_SIZE + 4, SKILL_ICON_SIZE + 4,
          5
        );
      }

      // Border
      slot.bg.lineStyle(1, 0x666666, 0.6);
      slot.bg.strokeRoundedRect(x, y, SKILL_ICON_SIZE, SKILL_ICON_SIZE, 4);

      // Hover tooltip — only create when first hovering (not every frame)
      if (isHovered && !slot.tooltipContainer) {
        const level = player.skillLevels[skillId] ?? 1;
        const levelData = def.levels[Math.min(level - 1, def.levels.length - 1)];
        const energyCost = levelData ? levelData.energyCost : 0;
        const cooldown = levelData ? levelData.cooldown : 0;

        const tooltipText = `${def.name}  EN:${energyCost}  CD:${cooldown.toFixed(1)}s`;
        const container = this.scene.add.container(x, y - 28);
        container.setScrollFactor(0);
        container.setDepth(110);

        const bg = this.scene.add.graphics();
        const text = this.scene.add.text(6, 3, tooltipText, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 2,
        });
        const w = text.width + 12;
        const h = text.height + 6;
        bg.fillStyle(0x111111, 0.92);
        bg.fillRoundedRect(0, 0, w, h, 3);
        bg.lineStyle(1, 0x555555, 0.6);
        bg.strokeRoundedRect(0, 0, w, h, 3);
        container.add(bg);
        container.add(text);

        this.add(container);
        slot.tooltipContainer = container;
        slot.tooltipSkillId = skillId;
      }
    }
  }
}
