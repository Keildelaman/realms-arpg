// ============================================================================
// SkillCodex — Full-screen skill management overlay
// ============================================================================

import Phaser from 'phaser';
import { getState, getPlayer } from '@/core/game-state';
import { on, emit } from '@/core/event-bus';
import { SKILLS, ACTIVE_SKILLS, PASSIVE_SKILLS } from '@/data/skills.data';
import {
  MAX_SKILL_LEVEL,
  PASSIVE_SKILL_SLOTS,
  MAX_RESPECS_PER_SESSION,
} from '@/data/constants';
import * as skills from '@/systems/skills';
import {
  UI_THEME,
  drawPanelShell,
  drawSectionCard,
  drawPillButton,
  drawDivider,
} from '@/ui/ui-theme';

// --- Layout constants ---
const PANEL_WIDTH = 560;
const PANEL_HEIGHT = 620;

const CARD_W = 165;
const CARD_H = 60;
const CARD_GAP = 10;

const PASSIVE_CARD_W = 100;
const PASSIVE_CARD_H = 55;
const PASSIVE_CARD_GAP = 8;

// --- Slot key labels ---
const ACTIVE_SLOT_LABELS = ['LMB', 'RMB', 'Q', 'E'];

export class SkillCodex extends Phaser.GameObjects.Container {
  private panelGfx: Phaser.GameObjects.Graphics;

  // Dynamic objects (cleared on each refresh)
  private dynamicGfx: Phaser.GameObjects.Graphics[] = [];
  private dynamicTexts: Phaser.GameObjects.Text[] = [];
  private dynamicZones: Phaser.GameObjects.Zone[] = [];

  // Selection state
  private selectedSkillId: string | null = null;
  private selectedPath: 'A' | 'B' | 'C' | null = null;

  // SP text reference for flash animation
  private spText: Phaser.GameObjects.Text | null = null;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.setScrollFactor(0);
    this.setDepth(200);
    this.setVisible(false);

    this.panelGfx = scene.add.graphics();
    this.add(this.panelGfx);

    // Subscribe to skill events → refresh when visible
    const refreshEvents: string[] = [
      'skill:unlocked',
      'skill:equipped',
      'skill:unequipped',
      'skill:upgraded',
      'skill:respecced',
      'skill:spGained',
      'skill:levelUp',
    ];
    for (const evt of refreshEvents) {
      on(evt as keyof import('@/core/types').GameEventMap, () => {
        if (this.visible) this.refresh();
      });
    }
  }

  toggle(): void {
    const s = getState();
    if (!s.codexOpen) {
      // Block if in combat (any monster chasing/attacking)
      const inCombat = s.monsters.some(
        (m) =>
          !m.isDead &&
          ['chase', 'attack', 'charging', 'casting'].includes(m.aiState),
      );
      if (inCombat) return;
      // Block if other panels open
      if (s.inventoryOpen || s.merchantOpen || s.stashOpen) return;
    }
    s.codexOpen = !s.codexOpen;
    s.isPaused = s.codexOpen;
    this.setVisible(s.codexOpen);
    if (s.codexOpen) {
      this.selectedSkillId = null;
      this.selectedPath = null;
      this.refresh();
    }
  }

  refresh(): void {
    this.clearDynamic();
    this.panelGfx.clear();

    const screenW = this.scene.scale.width;
    const screenH = this.scene.scale.height;
    const px = (screenW - PANEL_WIDTH) / 2;
    const py = (screenH - PANEL_HEIGHT) / 2;

    // Panel shell
    drawPanelShell(this.panelGfx, px, py, PANEL_WIDTH, PANEL_HEIGHT);

    const innerX = px + 20;
    const innerW = PANEL_WIDTH - 40;

    // Header
    this.addText(innerX, py + 14, 'SKILL CODEX', 14, UI_THEME.accent, true);

    const player = getPlayer();
    const spLabel = `SP: ${player.skillPoints}`;
    this.spText = this.addText(
      px + PANEL_WIDTH - 70,
      py + 14,
      spLabel,
      13,
      player.skillPoints > 0 ? UI_THEME.warning : UI_THEME.textDim,
      true,
    );

    // Close button
    this.addButton(
      px + PANEL_WIDTH - 34,
      py + 10,
      22,
      22,
      'X',
      UI_THEME.danger,
      () => this.toggle(),
    );

    // --- Active skills section ---
    const activeY = py + 40;
    this.addText(innerX, activeY, 'ACTIVE SKILLS', 11, UI_THEME.textDim);

    const activeStartY = activeY + 18;
    const activeSkills = ACTIVE_SKILLS;
    const activeRowX =
      innerX + (innerW - (activeSkills.length * CARD_W + (activeSkills.length - 1) * CARD_GAP)) / 2;

    for (let i = 0; i < activeSkills.length; i++) {
      const def = activeSkills[i];
      const cx = activeRowX + i * (CARD_W + CARD_GAP);
      this.drawSkillCard(cx, activeStartY, CARD_W, CARD_H, def);
    }

    // --- Passive skills section ---
    const passiveY = activeStartY + CARD_H + 10;
    this.addText(innerX, passiveY, 'PASSIVES', 11, UI_THEME.textDim);

    const passiveStartY = passiveY + 18;
    const passivesPerRow = Math.min(5, PASSIVE_SKILLS.length);
    const passiveRowW =
      passivesPerRow * PASSIVE_CARD_W + (passivesPerRow - 1) * PASSIVE_CARD_GAP;
    const passiveRowX = innerX + (innerW - passiveRowW) / 2;

    for (let i = 0; i < PASSIVE_SKILLS.length; i++) {
      const def = PASSIVE_SKILLS[i];
      const row = Math.floor(i / passivesPerRow);
      const col = i % passivesPerRow;
      const cx = passiveRowX + col * (PASSIVE_CARD_W + PASSIVE_CARD_GAP);
      const cy = passiveStartY + row * (PASSIVE_CARD_H + PASSIVE_CARD_GAP);
      this.drawSkillCard(cx, cy, PASSIVE_CARD_W, PASSIVE_CARD_H, def);
    }

    // --- Divider ---
    const passiveRows = Math.ceil(PASSIVE_SKILLS.length / passivesPerRow);
    const dividerY =
      passiveStartY + passiveRows * (PASSIVE_CARD_H + PASSIVE_CARD_GAP) + 4;
    drawDivider(this.panelGfx, innerX, dividerY, innerX + innerW, dividerY);

    // --- Detail panel ---
    const detailY = dividerY + 8;
    const detailH = py + PANEL_HEIGHT - 20 - detailY;
    this.drawDetailPanel(innerX, detailY, innerW, detailH);
  }

  // =========================================================================
  // Skill Cards
  // =========================================================================

  private drawSkillCard(
    x: number,
    y: number,
    w: number,
    h: number,
    def: import('@/core/types').SkillDefinition,
  ): void {
    const gfx = this.scene.add.graphics();
    this.add(gfx);
    this.dynamicGfx.push(gfx);

    const player = getPlayer();
    const isUnlocked = player.unlockedSkills.includes(def.id);
    const isSelected = this.selectedSkillId === def.id;
    const skillColor = Phaser.Display.Color.HexStringToColor(def.color).color;

    // Determine equip state
    let equippedSlot = -1;
    if (def.type === 'active') {
      equippedSlot = player.activeSkills.indexOf(def.id);
    } else {
      equippedSlot = player.passiveSkills.indexOf(def.id);
    }
    const isEquipped = equippedSlot >= 0;

    if (!isUnlocked) {
      // Locked card
      gfx.fillStyle(0x111827, 0.7);
      gfx.fillRoundedRect(x, y, w, h, 6);
      gfx.lineStyle(1, 0x334155, 0.6);
      gfx.strokeRoundedRect(x, y, w, h, 6);

      this.addText(x + 8, y + 6, def.name, 10, UI_THEME.textMuted);

      // Lock reason
      const condition = skills.checkUnlockCondition(def.id);
      const lockText = condition.reason ?? `LVL ${def.unlockLevel}`;
      this.addText(x + 8, y + h - 18, lockText, 9, UI_THEME.textMuted);
    } else if (isEquipped) {
      // Equipped card — bright border
      gfx.fillStyle(skillColor, 0.25);
      gfx.fillRoundedRect(x, y, w, h, 6);
      gfx.lineStyle(2, skillColor, 0.9);
      gfx.strokeRoundedRect(x, y, w, h, 6);

      this.addText(x + 8, y + 6, def.name, 10, UI_THEME.text, true);

      // Slot badge
      let badge = '';
      if (def.type === 'active') {
        badge = ACTIVE_SLOT_LABELS[equippedSlot] ?? '';
      } else {
        badge = `P${equippedSlot + 1}`;
      }
      if (badge) {
        this.addText(x + w - 30, y + 6, badge, 9, UI_THEME.accent, true);
      }

      // Level stars
      this.drawLevelStars(x + 8, y + h - 18, def.id);
    } else {
      // Unlocked, not equipped
      gfx.fillStyle(0x0f1728, 0.85);
      gfx.fillRoundedRect(x, y, w, h, 6);
      gfx.lineStyle(1, skillColor, 0.5);
      gfx.strokeRoundedRect(x, y, w, h, 6);

      this.addText(x + 8, y + 6, def.name, 10, UI_THEME.text);

      // Level stars
      this.drawLevelStars(x + 8, y + h - 18, def.id);
    }

    // Selection highlight
    if (isSelected) {
      gfx.lineStyle(2, 0x7dd3fc, 0.95);
      gfx.strokeRoundedRect(x - 1, y - 1, w + 2, h + 2, 7);
    }

    // Click zone
    const zone = this.scene.add.zone(x + w / 2, y + h / 2, w, h);
    zone.setInteractive({ useHandCursor: true });
    zone.setScrollFactor(0);
    zone.setDepth(201);
    zone.on('pointerdown', () => {
      this.selectedSkillId = def.id;
      this.selectedPath = null;
      this.refresh();
    });
    this.add(zone);
    this.dynamicZones.push(zone);
  }

  private drawLevelStars(x: number, y: number, skillId: string): void {
    const player = getPlayer();
    const level = player.skillLevels[skillId] ?? 0;
    let stars = '';
    for (let i = 0; i < MAX_SKILL_LEVEL; i++) {
      stars += i < level ? '\u2605' : '\u2606';
    }
    this.addText(x, y, stars, 10, UI_THEME.warning);
  }

  // =========================================================================
  // Detail Panel
  // =========================================================================

  private drawDetailPanel(
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    if (!this.selectedSkillId) {
      this.addText(
        x + w / 2,
        y + h / 2 - 6,
        'Select a skill to view details',
        12,
        UI_THEME.textMuted,
        false,
        true,
      );
      return;
    }

    const def = SKILLS[this.selectedSkillId];
    if (!def) return;

    const player = getPlayer();
    const isUnlocked = player.unlockedSkills.includes(def.id);

    if (!isUnlocked) {
      this.drawLockedDetail(x, y, w, def);
    } else if (def.type === 'active') {
      this.drawActiveDetail(x, y, w, h, def);
    } else {
      this.drawPassiveDetail(x, y, w, def);
    }
  }

  // ---- Locked detail ----

  private drawLockedDetail(
    x: number,
    y: number,
    w: number,
    def: import('@/core/types').SkillDefinition,
  ): void {
    const skillColor = def.color;
    let cy = y;

    this.addText(x, cy, def.name, 14, skillColor, true);
    cy += 20;

    this.addText(x, cy, def.description, 11, UI_THEME.textDim, false, false, w);
    cy += 30;

    // Lock reason
    const condition = skills.checkUnlockCondition(def.id);
    const lockReason = condition.reason ?? `Requires Level ${def.unlockLevel}`;
    this.addText(x, cy, lockReason, 11, UI_THEME.warning);
    cy += 22;

    // Unlock button
    const player = getPlayer();
    const canAfford = player.skillPoints >= def.unlockCost && condition.met;
    const label = `UNLOCK \u2014 ${def.unlockCost} SP`;
    this.addButton(
      x,
      cy,
      140,
      28,
      label,
      canAfford ? UI_THEME.success : UI_THEME.textMuted,
      canAfford
        ? () => {
            skills.unlockSkill(def.id);

            // SP flash animation — briefly flash red
            if (this.spText) {
              this.spText.setColor('#ef4444');
              this.scene.time.delayedCall(300, () => {
                if (this.spText) this.spText.setColor(UI_THEME.warning);
              });
            }

            // Particle burst at unlock button
            const burstX = x + 70;
            const burstY = cy + 14;
            const burstColor = Phaser.Display.Color.HexStringToColor(def.color).color;
            for (let i = 0; i < 10; i++) {
              const angle = (Math.PI * 2 * i) / 10;
              const speed = 40 + Math.random() * 30;
              const p = this.scene.add.circle(burstX, burstY, 2.5, burstColor, 1);
              p.setDepth(201);
              p.setScrollFactor(0);
              this.scene.tweens.add({
                targets: p,
                x: burstX + Math.cos(angle) * speed,
                y: burstY + Math.sin(angle) * speed,
                alpha: 0,
                scaleX: 0.2,
                scaleY: 0.2,
                duration: 400,
                ease: 'Power2',
                onComplete: () => p.destroy(),
              });
            }

            this.refresh();
          }
        : undefined,
      canAfford
        ? { fill: 0x166534, border: 0x4ade80 }
        : undefined,
    );
  }

  // ---- Active skill detail ----

  private drawActiveDetail(
    x: number,
    y: number,
    w: number,
    h: number,
    def: import('@/core/types').SkillDefinition,
  ): void {
    const player = getPlayer();
    const level = player.skillLevels[def.id] ?? 1;
    const skillColor = def.color;
    let cy = y;

    // Name + level
    this.addText(x, cy, def.name, 14, skillColor, true);
    this.addText(x + 200, cy + 2, `Level ${level}/${MAX_SKILL_LEVEL}`, 11, UI_THEME.textDim);
    cy += 20;

    // Description
    this.addText(x, cy, def.description, 11, UI_THEME.textDim, false, false, w);
    cy += 26;

    // Equip row — slots 0-3
    this.addText(x, cy, 'Equip:', 10, UI_THEME.textDim);
    const equippedSlot = player.activeSkills.indexOf(def.id);
    for (let slot = 0; slot <= 3; slot++) {
      const btnX = x + 50 + slot * 48;
      const isCurrentSlot = equippedSlot === slot;
      const label = ACTIVE_SLOT_LABELS[slot];
      this.addButton(
        btnX,
        cy - 2,
        44,
        22,
        label,
        isCurrentSlot ? UI_THEME.accent : UI_THEME.text,
        () => {
          skills.equipSkill(def.id, slot);
          this.refresh();
        },
        isCurrentSlot
          ? { fill: 0x1e3a8a, border: 0x7dd3fc }
          : { fill: 0x1e293b, border: 0x475569 },
      );
    }
    cy += 28;

    // Level up button
    const canLevelUp = level < MAX_SKILL_LEVEL && player.skillPoints >= 1;
    this.addButton(
      x,
      cy,
      130,
      26,
      'LEVEL UP \u2014 1 SP',
      canLevelUp ? UI_THEME.success : UI_THEME.textMuted,
      canLevelUp
        ? () => {
            skills.upgradeSkill(def.id);
            this.refresh();
          }
        : undefined,
      canLevelUp
        ? { fill: 0x166534, border: 0x4ade80 }
        : undefined,
    );
    cy += 34;

    // Upgrade tree (if skill has one)
    if (def.upgradeTree) {
      this.drawUpgradeTree(x, cy, w, def);
    }
  }

  // ---- Passive skill detail ----

  private drawPassiveDetail(
    x: number,
    y: number,
    w: number,
    def: import('@/core/types').SkillDefinition,
  ): void {
    const player = getPlayer();
    const level = player.skillLevels[def.id] ?? 1;
    let cy = y;

    this.addText(x, cy, def.name, 14, def.color, true);
    this.addText(x + 200, cy + 2, `Level ${level}/${MAX_SKILL_LEVEL}`, 11, UI_THEME.textDim);
    cy += 20;

    this.addText(x, cy, def.description, 11, UI_THEME.textDim, false, false, w);
    cy += 36;

    const equippedSlot = player.passiveSkills.indexOf(def.id);
    const isEquipped = equippedSlot >= 0;

    if (!isEquipped) {
      // Find first empty passive slot
      const emptySlot = player.passiveSkills.indexOf(null);
      if (emptySlot >= 0) {
        this.addButton(
          x,
          cy,
          90,
          26,
          'EQUIP',
          UI_THEME.accent,
          () => {
            skills.equipSkill(def.id, emptySlot);
            this.refresh();
          },
          { fill: 0x1e3a8a, border: 0x3b82f6 },
        );
      } else {
        // Both slots full — show swap buttons
        for (let s = 0; s < PASSIVE_SKILL_SLOTS; s++) {
          const currentId = player.passiveSkills[s];
          const currentDef = currentId ? SKILLS[currentId] : null;
          const slotLabel = currentDef
            ? `Swap P${s + 1}: ${currentDef.name}`
            : `Equip P${s + 1}`;
          this.addButton(
            x,
            cy + s * 30,
            200,
            26,
            slotLabel,
            UI_THEME.accent,
            () => {
              skills.equipSkill(def.id, s);
              this.refresh();
            },
            { fill: 0x1e3a8a, border: 0x3b82f6 },
          );
        }
      }
    } else {
      this.addText(x, cy, `Equipped (Slot P${equippedSlot + 1})`, 11, UI_THEME.accent);
      this.addButton(
        x + 160,
        cy - 3,
        90,
        24,
        'UNEQUIP',
        UI_THEME.danger,
        () => {
          skills.unequipSkill(equippedSlot, 'passive');
          this.refresh();
        },
        { fill: 0x7f1d1d, border: 0xfca5a5 },
      );
    }
    cy += isEquipped ? 28 : (player.passiveSkills.indexOf(null) >= 0 ? 32 : 66);

    // Level up button
    const canLevelUp = level < MAX_SKILL_LEVEL && player.skillPoints >= 1;
    this.addButton(
      x,
      cy,
      130,
      26,
      'LEVEL UP \u2014 1 SP',
      canLevelUp ? UI_THEME.success : UI_THEME.textMuted,
      canLevelUp
        ? () => {
            skills.upgradeSkill(def.id);
            this.refresh();
          }
        : undefined,
      canLevelUp
        ? { fill: 0x166534, border: 0x4ade80 }
        : undefined,
    );
  }

  // =========================================================================
  // Upgrade Tree
  // =========================================================================

  private drawUpgradeTree(
    x: number,
    y: number,
    w: number,
    def: import('@/core/types').SkillDefinition,
  ): void {
    if (!def.upgradeTree) return;

    const upgradeState = skills.getUpgradeState(def.id);
    const player = getPlayer();
    let cy = y;

    drawDivider(this.panelGfx, x, cy, x + w, cy);
    cy += 8;
    this.addText(x, cy, 'UPGRADE PATH', 11, UI_THEME.textDim);
    cy += 18;

    if (upgradeState.tier === 0) {
      // No path chosen — show 3 path cards
      this.drawPathSelection(x, cy, w, def, player);
    } else {
      // Path chosen
      this.drawChosenPath(x, cy, w, def, upgradeState, player);
    }
  }

  private drawPathSelection(
    x: number,
    y: number,
    w: number,
    def: import('@/core/types').SkillDefinition,
    player: import('@/core/types').PlayerState,
  ): void {
    if (!def.upgradeTree) return;

    const pathCardW = Math.floor((w - 2 * 8) / 3);
    const paths: ('A' | 'B' | 'C')[] = ['A', 'B', 'C'];
    let cy = y;

    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      const pathDef = def.upgradeTree.tier1[path];
      const cx = x + i * (pathCardW + 8);
      const isPreview = this.selectedPath === path;

      const gfx = this.scene.add.graphics();
      this.add(gfx);
      this.dynamicGfx.push(gfx);

      // Card background
      const borderColor = isPreview ? 0x7dd3fc : 0x334155;
      gfx.fillStyle(isPreview ? 0x1e293b : 0x111827, 0.85);
      gfx.fillRoundedRect(cx, cy, pathCardW, 60, 5);
      gfx.lineStyle(1, borderColor, isPreview ? 0.9 : 0.6);
      gfx.strokeRoundedRect(cx, cy, pathCardW, 60, 5);

      this.addText(cx + 6, cy + 4, `${path}: ${pathDef.name}`, 10, UI_THEME.text, true);
      this.addText(cx + 6, cy + 20, pathDef.description, 8, UI_THEME.textDim, false, false, pathCardW - 12);
      this.addText(cx + pathCardW - 30, cy + 44, `${pathDef.spCost} SP`, 9, UI_THEME.warning);

      // Click zone
      const zone = this.scene.add.zone(
        cx + pathCardW / 2,
        cy + 30,
        pathCardW,
        60,
      );
      zone.setInteractive({ useHandCursor: true });
      zone.setScrollFactor(0);
      zone.setDepth(201);
      zone.on('pointerdown', () => {
        this.selectedPath = this.selectedPath === path ? null : path;
        this.refresh();
      });
      this.add(zone);
      this.dynamicZones.push(zone);
    }

    // Preview section (if a path is selected)
    if (this.selectedPath) {
      const pathDef = def.upgradeTree.tier1[this.selectedPath];
      const previewY = cy + 68;

      const gfx = this.scene.add.graphics();
      this.add(gfx);
      this.dynamicGfx.push(gfx);

      drawSectionCard(gfx, x, previewY, w, 70, true, 6);

      this.addText(x + 8, previewY + 6, pathDef.detailedDescription, 10, UI_THEME.text, false, false, w - 16);

      const canAfford = player.skillPoints >= pathDef.spCost;

      this.addButton(
        x + 8,
        previewY + 44,
        130,
        22,
        `CHOOSE \u2014 ${pathDef.spCost} SP`,
        canAfford ? UI_THEME.success : UI_THEME.textMuted,
        canAfford
          ? () => {
              skills.chooseUpgradePath(def.id, this.selectedPath!);
              this.selectedPath = null;
              this.refresh();
            }
          : undefined,
        canAfford
          ? { fill: 0x166534, border: 0x4ade80 }
          : undefined,
      );

      this.addButton(
        x + 150,
        previewY + 44,
        60,
        22,
        'BACK',
        UI_THEME.textDim,
        () => {
          this.selectedPath = null;
          this.refresh();
        },
        { fill: 0x1e293b, border: 0x475569 },
      );
    }
  }

  private drawChosenPath(
    x: number,
    y: number,
    w: number,
    def: import('@/core/types').SkillDefinition,
    upgradeState: import('@/core/types').SkillUpgradeState,
    player: import('@/core/types').PlayerState,
  ): void {
    if (!def.upgradeTree || !upgradeState.pathChoice) return;

    let cy = y;
    const paths: ('A' | 'B' | 'C')[] = ['A', 'B', 'C'];
    const chosenPath = upgradeState.pathChoice;

    // Show all 3 paths inline — chosen highlighted, others dimmed
    const miniW = Math.floor((w - 2 * 6) / 3);
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      const pathDef = def.upgradeTree.tier1[path];
      const cx = x + i * (miniW + 6);
      const isChosen = path === chosenPath;

      const gfx = this.scene.add.graphics();
      this.add(gfx);
      this.dynamicGfx.push(gfx);

      const alpha = isChosen ? 0.85 : 0.3;
      gfx.fillStyle(isChosen ? 0x1e293b : 0x111827, alpha);
      gfx.fillRoundedRect(cx, cy, miniW, 28, 4);
      const borderCol = isChosen ? 0x4ade80 : 0x334155;
      gfx.lineStyle(1, borderCol, isChosen ? 0.9 : 0.4);
      gfx.strokeRoundedRect(cx, cy, miniW, 28, 4);

      const nameColor = isChosen ? UI_THEME.success : UI_THEME.textMuted;
      this.addText(cx + 6, cy + 6, `${path}: ${pathDef.name}`, 9, nameColor, isChosen);
    }
    cy += 34;

    // Chosen path detailed description
    const chosenDef = def.upgradeTree.tier1[chosenPath];
    this.addText(x, cy, chosenDef.detailedDescription, 10, UI_THEME.text, false, false, w);
    cy += 30;

    // Awakening section
    const awakeningDef = def.upgradeTree.tier2[chosenPath];
    drawDivider(this.panelGfx, x, cy, x + w, cy, 0x334155, 0.5);
    cy += 6;

    if (upgradeState.tier >= 2) {
      // Fully awakened
      this.addText(x, cy, `AWAKENED: ${awakeningDef.name}`, 11, UI_THEME.warning, true);
      cy += 18;
      this.addText(x, cy, awakeningDef.detailedDescription, 10, UI_THEME.text, false, false, w);
    } else {
      // Show awakening preview
      this.addText(x, cy, `Awakening: ${awakeningDef.name}`, 11, UI_THEME.textDim);
      cy += 18;
      this.addText(x, cy, awakeningDef.detailedDescription, 10, UI_THEME.textDim, false, false, w);
      cy += 30;

      const canAfford = player.skillPoints >= awakeningDef.spCost;
      this.addButton(
        x,
        cy,
        180,
        24,
        `UNLOCK AWAKENING \u2014 ${awakeningDef.spCost} SP`,
        canAfford ? UI_THEME.warning : UI_THEME.textMuted,
        canAfford
          ? () => {
              skills.unlockAwakening(def.id);
              this.refresh();
            }
          : undefined,
        canAfford
          ? { fill: 0x78350f, border: 0xfbbf24 }
          : undefined,
      );
    }

    // Respec button (always shown if path is chosen)
    const respecY = y + 160; // fixed position near bottom of detail area
    this.addText(
      x + w - 160,
      respecY,
      `Respecs: ${MAX_RESPECS_PER_SESSION - this.getRespecsRemaining()} / ${MAX_RESPECS_PER_SESSION}`,
      9,
      UI_THEME.textMuted,
    );

    const canRespec = this.getRespecsRemaining() > 0;
    this.addButton(
      x + w - 70,
      respecY + 14,
      60,
      22,
      'RESPEC',
      canRespec ? UI_THEME.danger : UI_THEME.textMuted,
      canRespec
        ? () => {
            skills.respecSkillUpgrade(def.id);
            this.selectedPath = null;
            this.refresh();
          }
        : undefined,
      canRespec
        ? { fill: 0x7f1d1d, border: 0xfca5a5 }
        : undefined,
    );
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private getRespecsRemaining(): number {
    return MAX_RESPECS_PER_SESSION - skills.getRespecsUsed();
  }

  private addText(
    x: number,
    y: number,
    content: string,
    fontSize: number,
    color: string,
    bold = false,
    centered = false,
    wordWrapWidth?: number,
  ): Phaser.GameObjects.Text {
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'monospace',
      fontSize: `${fontSize}px`,
      color,
      stroke: '#000000',
      strokeThickness: fontSize >= 12 ? 2 : 1,
    };
    if (bold) {
      style.fontStyle = 'bold';
    }
    if (wordWrapWidth) {
      style.wordWrap = { width: wordWrapWidth, useAdvancedWrap: true };
    }
    const text = this.scene.add.text(x, y, content, style);
    if (centered) text.setOrigin(0.5, 0.5);
    text.setScrollFactor(0);
    text.setDepth(201);
    this.add(text);
    this.dynamicTexts.push(text);
    return text;
  }

  private addButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    textColor: string,
    onClick?: () => void,
    palette?: { fill: number; border: number },
  ): void {
    const gfx = this.scene.add.graphics();
    this.add(gfx);
    this.dynamicGfx.push(gfx);

    const state = onClick ? 'default' : 'disabled';
    drawPillButton(
      gfx,
      x,
      y,
      w,
      h,
      state as import('@/ui/ui-theme').UiButtonState,
      palette,
    );

    const txt = this.scene.add.text(x + w / 2, y + h / 2, label, {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: onClick ? textColor : UI_THEME.textMuted,
      stroke: '#000000',
      strokeThickness: 1,
    })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(202);
    this.add(txt);
    this.dynamicTexts.push(txt);

    if (onClick) {
      const zone = this.scene.add.zone(x + w / 2, y + h / 2, w, h);
      zone.setInteractive({ useHandCursor: true });
      zone.setScrollFactor(0);
      zone.setDepth(203);
      zone.on('pointerdown', onClick);
      this.add(zone);
      this.dynamicZones.push(zone);
    }
  }

  private clearDynamic(): void {
    for (const g of this.dynamicGfx) g.destroy();
    for (const t of this.dynamicTexts) t.destroy();
    for (const z of this.dynamicZones) {
      z.removeAllListeners();
      z.destroy();
    }
    this.dynamicGfx.length = 0;
    this.dynamicTexts.length = 0;
    this.dynamicZones.length = 0;
  }
}
