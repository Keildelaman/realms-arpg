// ============================================================================
// InventoryPanel — Full inventory + equipment panel (toggled with Tab or I)
// Right-anchored, PoE/D4 style with slot icons, formatted affixes, item comparison.
// ============================================================================

import Phaser from 'phaser';
import type { ItemInstance, EquipmentSlot, Rarity } from '@/core/types';
import { getPlayer, getState, equipItem, removeFromInventory, addToInventory, unequipItem } from '@/core/game-state';
import { on, off, emit } from '@/core/event-bus';
import { compareItems } from '@/systems/items';
import { recalculateStats } from '@/systems/player';
import { formatAffixValue, formatAffixName } from '@/ui/item-format';
import {
  INVENTORY_SIZE,
  RARITY_COLORS,
  SELL_PRICE_RATIO,
  COLORS,
} from '@/data/constants';

// --- Layout constants ---

const PANEL_WIDTH = 380;
const PANEL_HEIGHT = 580;
const SLOT_SIZE = 44;
const SLOT_GAP = 4;
const GRID_COLS = 6;
const EQUIP_SLOT_SIZE = 48;
const EQUIP_SLOT_GAP = 6;

// Section Y offsets (relative to panelY)
const SECTION_TITLE_Y = 8;
const SECTION_EQUIP_Y = 36;
const SECTION_STATS_Y = 158;
const SECTION_GRID_Y = 330;
const SECTION_GOLD_Y = 552;

const TOOLTIP_MARGIN = 10;

const RARITY_BORDER_COLORS: Record<Rarity, number> = {
  common:    0xb0b0b0,
  uncommon:  0x4ade80,
  rare:      0x60a5fa,
  epic:      0xc084fc,
  legendary: 0xfbbf24,
};

/** Equipment slot layout: col/row in 3×2 grid, label, icon type */
const EQUIP_LAYOUT: Record<EquipmentSlot, { col: number; row: number; label: string }> = {
  weapon:    { col: 0, row: 0, label: 'WPN' },
  helmet:    { col: 1, row: 0, label: 'HLM' },
  chest:     { col: 2, row: 0, label: 'CHT' },
  gloves:    { col: 0, row: 1, label: 'GLV' },
  boots:     { col: 1, row: 1, label: 'BTS' },
  accessory: { col: 2, row: 1, label: 'ACC' },
};

interface Tooltip {
  container: Phaser.GameObjects.Container;
}

// --- Helper: compute equipment slot screen position (top-left corner of slot) ---

function equipSlotPos(col: number, row: number, panelX: number, panelY: number): { x: number; y: number } {
  const gridWidth = 3 * EQUIP_SLOT_SIZE + 2 * EQUIP_SLOT_GAP;
  const startX = panelX + (PANEL_WIDTH - gridWidth) / 2;
  return {
    x: startX + col * (EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP),
    y: panelY + SECTION_EQUIP_Y + row * (EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP),
  };
}

// --- Helper: compute inventory grid start X ---

function invGridStartX(panelX: number): number {
  const gridWidth = GRID_COLS * (SLOT_SIZE + SLOT_GAP) - SLOT_GAP;
  return panelX + (PANEL_WIDTH - gridWidth) / 2;
}

// --- Helper: inventory slot screen position (top-left corner) ---

function invSlotPos(index: number, panelX: number, panelY: number): { x: number; y: number } {
  const col = index % GRID_COLS;
  const row = Math.floor(index / GRID_COLS);
  const gx = invGridStartX(panelX);
  return {
    x: gx + col * (SLOT_SIZE + SLOT_GAP),
    y: panelY + SECTION_GRID_Y + 20 + row * (SLOT_SIZE + SLOT_GAP),
  };
}

// ============================================================================
// InventoryPanel
// ============================================================================

export class InventoryPanel extends Phaser.GameObjects.Container {
  // Persistent graphical/text objects
  private panelBg: Phaser.GameObjects.Graphics;
  private titleText: Phaser.GameObjects.Text;
  private statsLeft: Phaser.GameObjects.Text;
  private statsRight: Phaser.GameObjects.Text;
  private statsHeaderText: Phaser.GameObjects.Text;
  private goldText: Phaser.GameObjects.Text;

  // Dynamic objects cleared and recreated on each refresh
  private dynamicGfx: Phaser.GameObjects.Graphics[] = [];
  private dynamicTexts: Phaser.GameObjects.Text[] = [];

  // Interactive zones (persistent, repositioned on resize)
  private equipSlotZones: Map<EquipmentSlot, Phaser.GameObjects.Zone> = new Map();
  private inventorySlotZones: Phaser.GameObjects.Zone[] = [];

  // Tooltip (scene-level object, null when hidden)
  private tooltip: Tooltip | null = null;

  private panelX: number;
  private panelY: number;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.setScrollFactor(0);
    this.setDepth(200);
    this.setVisible(false);

    this.panelX = scene.scale.width - PANEL_WIDTH - 12;
    this.panelY = (scene.scale.height - PANEL_HEIGHT) / 2;

    // Panel background graphics (draws everything non-interactive)
    this.panelBg = scene.add.graphics();
    this.add(this.panelBg);

    // Title
    this.titleText = scene.add.text(0, 0, 'INVENTORY', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: COLORS.uiText,
      stroke: '#000000',
      strokeThickness: 2,
    });
    this.titleText.setOrigin(0.5, 0);
    this.add(this.titleText);

    // Stats header divider label
    this.statsHeaderText = scene.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: COLORS.uiTextDim,
    });
    this.add(this.statsHeaderText);

    // Stats left column (ATK, DEF, MGK, HP)
    this.statsLeft = scene.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: COLORS.uiText,
      lineSpacing: 5,
    });
    this.add(this.statsLeft);

    // Stats right column (CRT, CDM, ASP, SPD)
    this.statsRight = scene.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: COLORS.uiText,
      lineSpacing: 5,
    });
    this.add(this.statsRight);

    // Gold display
    this.goldText = scene.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: COLORS.gold,
      stroke: '#000000',
      strokeThickness: 2,
    });
    this.add(this.goldText);

    // Create interactive zones
    this.createEquipmentZones();
    this.createInventoryZones();

    // Subscribe to events
    on('ui:inventoryToggle', this.toggle);
    on('player:statsChanged', this.onStatsChanged);

    scene.scale.on('resize', this.onResize, this);
  }

  // --- Zone creation ---

  private createEquipmentZones(): void {
    const slots: EquipmentSlot[] = ['weapon', 'helmet', 'chest', 'gloves', 'boots', 'accessory'];

    for (const slot of slots) {
      const layout = EQUIP_LAYOUT[slot];
      const { x, y } = equipSlotPos(layout.col, layout.row, this.panelX, this.panelY);
      const cx = x + EQUIP_SLOT_SIZE / 2;
      const cy = y + EQUIP_SLOT_SIZE / 2;

      const zone = this.scene.add.zone(cx, cy, EQUIP_SLOT_SIZE, EQUIP_SLOT_SIZE);
      zone.setInteractive({ useHandCursor: true });

      zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (pointer.rightButtonDown()) {
          this.onEquipSlotRightClick(slot);
        } else {
          this.onEquipSlotClick(slot);
        }
      });
      zone.on('pointerover', () => { this.showEquipTooltip(slot); });
      zone.on('pointerout',  () => { this.hideTooltip(); });

      this.add(zone);
      this.equipSlotZones.set(slot, zone);
    }
  }

  private createInventoryZones(): void {
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const { x, y } = invSlotPos(i, this.panelX, this.panelY);
      const cx = x + SLOT_SIZE / 2;
      const cy = y + SLOT_SIZE / 2;

      const zone = this.scene.add.zone(cx, cy, SLOT_SIZE, SLOT_SIZE);
      zone.setInteractive({ useHandCursor: true });

      const index = i;
      zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (pointer.rightButtonDown()) {
          this.onInventorySlotRightClick(index);
        } else {
          this.onInventorySlotClick(index);
        }
      });
      zone.on('pointerover', () => { this.showInventoryTooltip(index); });
      zone.on('pointerout',  () => { this.hideTooltip(); });

      this.add(zone);
      this.inventorySlotZones.push(zone);
    }
  }

  // --- Zone repositioning on resize ---

  private repositionZones(): void {
    for (const [slot, zone] of this.equipSlotZones) {
      const layout = EQUIP_LAYOUT[slot];
      const { x, y } = equipSlotPos(layout.col, layout.row, this.panelX, this.panelY);
      zone.setPosition(x + EQUIP_SLOT_SIZE / 2, y + EQUIP_SLOT_SIZE / 2);
    }
    for (let i = 0; i < this.inventorySlotZones.length; i++) {
      const { x, y } = invSlotPos(i, this.panelX, this.panelY);
      this.inventorySlotZones[i].setPosition(x + SLOT_SIZE / 2, y + SLOT_SIZE / 2);
    }
  }

  // --- Drawing ---

  private clearDynamic(): void {
    for (const gfx of this.dynamicGfx) {
      this.remove(gfx);
      gfx.destroy();
    }
    for (const txt of this.dynamicTexts) {
      this.remove(txt);
      txt.destroy();
    }
    this.dynamicGfx = [];
    this.dynamicTexts = [];
  }

  private drawPanelBackground(): void {
    const bg = this.panelBg;
    bg.clear();

    // Main background
    bg.fillStyle(0x111111, 0.93);
    bg.fillRoundedRect(this.panelX, this.panelY, PANEL_WIDTH, PANEL_HEIGHT, 8);

    // Border
    bg.lineStyle(2, 0x555555, 0.8);
    bg.strokeRoundedRect(this.panelX, this.panelY, PANEL_WIDTH, PANEL_HEIGHT, 8);

    // Divider below equipment area
    bg.lineStyle(1, 0x333333, 0.7);
    bg.beginPath();
    bg.moveTo(this.panelX + 12, this.panelY + SECTION_STATS_Y - 4);
    bg.lineTo(this.panelX + PANEL_WIDTH - 12, this.panelY + SECTION_STATS_Y - 4);
    bg.strokePath();

    // Divider below stats area
    bg.beginPath();
    bg.moveTo(this.panelX + 12, this.panelY + SECTION_GRID_Y - 4);
    bg.lineTo(this.panelX + PANEL_WIDTH - 12, this.panelY + SECTION_GRID_Y - 4);
    bg.strokePath();
  }

  private drawEquipmentSlots(): void {
    const player = getPlayer();

    for (const [slot, layout] of Object.entries(EQUIP_LAYOUT) as [EquipmentSlot, typeof EQUIP_LAYOUT[EquipmentSlot]][]) {
      const { x, y } = equipSlotPos(layout.col, layout.row, this.panelX, this.panelY);
      const item = player.equipment[slot];

      const gfx = this.scene.add.graphics();
      this.add(gfx);
      this.dynamicGfx.push(gfx);

      // Slot background
      gfx.fillStyle(0x1e1e1e, 0.9);
      gfx.fillRoundedRect(x, y, EQUIP_SLOT_SIZE, EQUIP_SLOT_SIZE, 4);

      if (item) {
        // Rarity border
        gfx.lineStyle(2, RARITY_BORDER_COLORS[item.rarity], 1);
        gfx.strokeRoundedRect(x, y, EQUIP_SLOT_SIZE, EQUIP_SLOT_SIZE, 4);

        // Item name centered (first 5 chars)
        const nameText = this.scene.add.text(
          x + EQUIP_SLOT_SIZE / 2,
          y + EQUIP_SLOT_SIZE / 2,
          item.name.substring(0, 5),
          {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: RARITY_COLORS[item.rarity],
            stroke: '#000000',
            strokeThickness: 1,
          }
        );
        nameText.setOrigin(0.5, 0.5);
        this.add(nameText);
        this.dynamicTexts.push(nameText);
      } else {
        // Empty slot border
        gfx.lineStyle(1, 0x444444, 0.5);
        gfx.strokeRoundedRect(x, y, EQUIP_SLOT_SIZE, EQUIP_SLOT_SIZE, 4);

        // Slot icon drawing
        this.drawSlotIcon(gfx, slot, x, y);

        // Slot label text
        const labelText = this.scene.add.text(
          x + EQUIP_SLOT_SIZE / 2,
          y + EQUIP_SLOT_SIZE - 10,
          layout.label,
          {
            fontFamily: 'monospace',
            fontSize: '9px',
            color: COLORS.uiTextDim,
          }
        );
        labelText.setOrigin(0.5, 0.5);
        this.add(labelText);
        this.dynamicTexts.push(labelText);
      }
    }
  }

  /**
   * Draw a simple silhouette icon inside an empty equipment slot.
   * All coordinates are absolute scene positions.
   */
  private drawSlotIcon(gfx: Phaser.GameObjects.Graphics, slot: EquipmentSlot, x: number, y: number): void {
    const cx = x + EQUIP_SLOT_SIZE / 2;
    const cy = y + EQUIP_SLOT_SIZE / 2 - 4;

    gfx.lineStyle(1.5, 0x555555, 0.8);
    gfx.fillStyle(0x555555, 0.4);

    switch (slot) {
      case 'weapon': {
        // Diagonal blade line
        gfx.beginPath();
        gfx.moveTo(x + 12, y + 36);
        gfx.lineTo(x + 36, y + 12);
        gfx.strokePath();
        // Crossguard
        const midX = x + 24, midY = y + 24;
        gfx.beginPath();
        gfx.moveTo(midX - 5, midY + 5);
        gfx.lineTo(midX + 5, midY - 5);
        gfx.strokePath();
        // Pommel dot
        gfx.fillCircle(x + 10, y + 38, 2.5);
        break;
      }
      case 'helmet': {
        // Semi-dome arc
        gfx.beginPath();
        gfx.arc(cx, cy + 4, 13, Math.PI, 2 * Math.PI);
        gfx.strokePath();
        // Brim line
        gfx.beginPath();
        gfx.moveTo(cx - 15, cy + 4);
        gfx.lineTo(cx + 15, cy + 4);
        gfx.strokePath();
        break;
      }
      case 'chest': {
        // Torso rect
        gfx.strokeRoundedRect(cx - 11, cy - 10, 22, 20, 2);
        // Shoulder plates
        gfx.fillRect(cx - 14, cy - 12, 7, 5);
        gfx.fillRect(cx + 7, cy - 12, 7, 5);
        break;
      }
      case 'gloves': {
        // Palm
        gfx.strokeRoundedRect(cx - 9, cy - 2, 18, 13, 3);
        // Finger stubs
        const fingerSpacing = 5;
        for (let f = 0; f < 3; f++) {
          const fx = cx - 5 + f * fingerSpacing;
          gfx.beginPath();
          gfx.moveTo(fx, cy - 2);
          gfx.lineTo(fx, cy - 9);
          gfx.strokePath();
        }
        break;
      }
      case 'boots': {
        // Shaft
        gfx.strokeRect(cx - 7, cy - 12, 14, 16);
        // Sole
        gfx.strokeRect(cx - 9, cy + 3, 18, 5);
        break;
      }
      case 'accessory': {
        // Ring circle
        gfx.strokeCircle(cx, cy, 10);
        // Gem dot at top
        gfx.fillCircle(cx, cy - 10, 3);
        break;
      }
    }
  }

  private drawInventoryGrid(): void {
    const player = getPlayer();
    const gx = invGridStartX(this.panelX);
    const labelY = this.panelY + SECTION_GRID_Y + 4;

    // "Backpack" label
    const label = this.scene.add.text(this.panelX + PANEL_WIDTH / 2, labelY, 'Backpack', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: COLORS.uiTextDim,
    });
    label.setOrigin(0.5, 0);
    this.add(label);
    this.dynamicTexts.push(label);

    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const { x, y } = invSlotPos(i, this.panelX, this.panelY);
      const item = player.inventory[i] as ItemInstance | undefined;

      const gfx = this.scene.add.graphics();
      this.add(gfx);
      this.dynamicGfx.push(gfx);

      // Slot background
      gfx.fillStyle(0x1a1a1a, 0.8);
      gfx.fillRoundedRect(x, y, SLOT_SIZE, SLOT_SIZE, 2);

      if (item) {
        gfx.lineStyle(2, RARITY_BORDER_COLORS[item.rarity], 1);
        gfx.strokeRoundedRect(x, y, SLOT_SIZE, SLOT_SIZE, 2);

        const nameText = this.scene.add.text(
          x + SLOT_SIZE / 2,
          y + SLOT_SIZE / 2,
          item.name.substring(0, 4),
          {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: RARITY_COLORS[item.rarity],
            stroke: '#000000',
            strokeThickness: 1,
          }
        );
        nameText.setOrigin(0.5, 0.5);
        this.add(nameText);
        this.dynamicTexts.push(nameText);
      } else {
        gfx.lineStyle(1, 0x2a2a2a, 0.6);
        gfx.strokeRoundedRect(x, y, SLOT_SIZE, SLOT_SIZE, 2);
      }
    }
  }

  // --- Stats panel ---

  private updateStatsPanel(): void {
    const player = getPlayer();

    const atkStr = String(player.attack);
    const defStr = String(player.defense);
    const mgkStr = String(player.magicPower);
    const hpStr  = String(player.maxHP);

    const crtStr = `${(player.critChance  * 100).toFixed(1)}%`;
    const cdmStr = `${(player.critDamage  * 100).toFixed(0)}%`;
    const aspStr = player.attackSpeed.toFixed(2);
    const spdStr = String(player.moveSpeed);

    this.statsLeft.setText(
      `ATK  ${atkStr}\n` +
      `DEF  ${defStr}\n` +
      `MGK  ${mgkStr}\n` +
      `HP   ${hpStr}`
    );

    this.statsRight.setText(
      `CRT  ${crtStr}\n` +
      `CDM  ${cdmStr}\n` +
      `ASP  ${aspStr}\n` +
      `SPD  ${spdStr}`
    );

    const statsY = this.panelY + SECTION_STATS_Y;
    this.statsHeaderText.setText('── STATS ─────────────────');
    this.statsHeaderText.setPosition(this.panelX + 14, statsY + 4);
    this.statsLeft.setPosition(this.panelX + 14, statsY + 22);
    this.statsRight.setPosition(this.panelX + PANEL_WIDTH / 2, statsY + 22);
  }

  // --- Gold display ---

  private updateGoldDisplay(): void {
    const player = getPlayer();
    this.goldText.setText(`Gold: ${player.gold}`);
    this.goldText.setPosition(this.panelX + 14, this.panelY + SECTION_GOLD_Y);
  }

  // --- Slot interaction ---

  private onEquipSlotClick(slot: EquipmentSlot): void {
    const player = getPlayer();
    const equippedItem = player.equipment[slot];

    if (equippedItem) {
      const removed = unequipItem(slot);
      if (removed) {
        const added = addToInventory(removed);
        if (added) {
          emit('item:unequipped', { item: removed, slot });
          emit('player:statsChanged');
        } else {
          // Inventory full — re-equip
          equipItem(removed);
        }
      }
    }
    recalculateStats();
    this.refresh();
  }

  private onEquipSlotRightClick(_slot: EquipmentSlot): void {
    // Right-click on equip slot: future use (sell / inspect)
  }

  private onInventorySlotClick(index: number): void {
    const player = getPlayer();
    const item = player.inventory[index];
    if (!item) return;

    const previousItem = equipItem(item);
    removeFromInventory(item.id);

    if (previousItem) {
      addToInventory(previousItem);
    }

    emit('item:equipped', { item, slot: item.slot });
    emit('player:statsChanged');
    recalculateStats();
    this.refresh();
  }

  private onInventorySlotRightClick(index: number): void {
    const player = getPlayer();
    const item = player.inventory[index];
    if (!item) return;

    const sellPrice = Math.floor(
      (item.tier * 100 + item.affixes.length * 50) * SELL_PRICE_RATIO
    );

    removeFromInventory(item.id);
    player.gold += sellPrice;
    player.totalGoldEarned += sellPrice;

    emit('item:sold', { item, gold: sellPrice });
    emit('economy:goldChanged', { amount: sellPrice, total: player.gold });
    this.refresh();
  }

  // --- Tooltip ---

  private showEquipTooltip(slot: EquipmentSlot): void {
    const player = getPlayer();
    const item = player.equipment[slot];
    if (!item) return;

    const layout = EQUIP_LAYOUT[slot];
    const { x, y } = equipSlotPos(layout.col, layout.row, this.panelX, this.panelY);
    this.showItemTooltip(item, x, y);
  }

  private showInventoryTooltip(index: number): void {
    const player = getPlayer();
    const item = player.inventory[index] as ItemInstance | undefined;
    if (!item) return;

    const { x, y } = invSlotPos(index, this.panelX, this.panelY);
    const equippedInSlot = player.equipment[item.slot];
    const diffs = equippedInSlot ? compareItems(item, equippedInSlot) : null;
    this.showItemTooltip(item, x, y, diffs);
  }

  private showItemTooltip(
    item: ItemInstance,
    slotX: number,
    slotY: number,
    diffs?: Record<string, number> | null,
  ): void {
    this.hideTooltip();

    const lines: { text: string; color: string; size: number }[] = [];

    // Item name
    lines.push({ text: item.name, color: RARITY_COLORS[item.rarity], size: 14 });

    // Rarity + slot
    const rarityLabel = item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1);
    lines.push({ text: `${rarityLabel} ${item.slot}`, color: COLORS.uiTextDim, size: 11 });

    // Item level / tier
    lines.push({ text: `iLvl ${item.itemLevel}  Tier ${item.tier}`, color: COLORS.uiTextDim, size: 10 });

    // Separator
    lines.push({ text: '──────────────────', color: COLORS.uiTextDim, size: 8 });

    // Affixes — prefixes first, then suffixes; formatted
    const sortedAffixes = [...item.affixes].sort((a, b) => (b.isPrefix ? 1 : 0) - (a.isPrefix ? 1 : 0));
    for (const affix of sortedAffixes) {
      lines.push({
        text: `${formatAffixValue(affix.id, affix.value)} ${formatAffixName(affix.id)}`,
        color: '#cccccc',
        size: 12,
      });
    }

    // Legendary effect
    if (item.legendaryEffect) {
      lines.push({ text: '──────────────────', color: COLORS.uiTextDim, size: 8 });
      lines.push({ text: item.legendaryEffect, color: RARITY_COLORS.legendary, size: 11 });
    }

    // Crafting info
    if (item.isImbued || item.temperLevel > 0) {
      lines.push({ text: '──────────────────', color: COLORS.uiTextDim, size: 8 });
      if (item.isImbued) lines.push({ text: 'Imbued', color: '#a855f7', size: 9 });
      if (item.temperLevel > 0) {
        lines.push({ text: `Tempered +${item.temperLevel}`, color: '#f97316', size: 9 });
      }
    }

    // Comparison diffs
    if (diffs && Object.keys(diffs).length > 0) {
      lines.push({ text: '─── vs equipped ───', color: COLORS.uiTextDim, size: 9 });
      for (const [affixId, diff] of Object.entries(diffs)) {
        const color = diff > 0 ? '#4ade80' : '#f87171';
        lines.push({
          text: `${formatAffixValue(affixId, diff)} ${formatAffixName(affixId)}`,
          color,
          size: 11,
        });
      }
    }

    // Render lines into a temporary container to measure width
    const container = this.scene.add.container(0, 0);
    container.setScrollFactor(0);
    container.setDepth(250);

    const bg = this.scene.add.graphics();
    container.add(bg);

    let lineY = 8;
    let maxWidth = 0;

    for (const line of lines) {
      const text = this.scene.add.text(8, lineY, line.text, {
        fontFamily: 'monospace',
        fontSize: `${line.size}px`,
        color: line.color,
      });
      container.add(text);
      maxWidth = Math.max(maxWidth, text.width);
      lineY += text.height + 3;
    }

    const tooltipWidth  = maxWidth + 16;
    const tooltipHeight = lineY + 8;

    bg.fillStyle(0x0d0d0d, 0.96);
    bg.fillRoundedRect(0, 0, tooltipWidth, tooltipHeight, 4);
    bg.lineStyle(1, 0x555555, 0.8);
    bg.strokeRoundedRect(0, 0, tooltipWidth, tooltipHeight, 4);

    // Position tooltip to the LEFT of the slot (right-anchored panel)
    let finalX = slotX - tooltipWidth - TOOLTIP_MARGIN;
    finalX = Math.max(8, finalX);

    // Clamp vertically
    const sceneH = this.scene.scale.height;
    let finalY = slotY;
    finalY = Math.max(8, Math.min(finalY, sceneH - tooltipHeight - 8));

    container.setPosition(finalX, finalY);

    this.tooltip = { container };
  }

  private hideTooltip(): void {
    if (this.tooltip) {
      this.tooltip.container.destroy();
      this.tooltip = null;
    }
  }

  // --- Public API ---

  /** Full repaint of the panel. */
  refresh(): void {
    this.clearDynamic();
    this.drawPanelBackground();
    this.drawEquipmentSlots();
    this.drawInventoryGrid();
    this.updateStatsPanel();
    this.updateGoldDisplay();

    // Title position
    this.titleText.setPosition(
      this.panelX + PANEL_WIDTH / 2,
      this.panelY + SECTION_TITLE_Y
    );
  }

  toggle = (): void => {
    const state = getState();
    state.inventoryOpen = !state.inventoryOpen;
    this.setVisible(state.inventoryOpen);

    if (state.inventoryOpen) {
      this.refresh();
    } else {
      this.hideTooltip();
    }
  };

  private onStatsChanged = (): void => {
    if (this.visible) {
      this.updateStatsPanel();
    }
  };

  private onResize = (gameSize: Phaser.Structs.Size): void => {
    this.panelX = gameSize.width - PANEL_WIDTH - 12;
    this.panelY = (gameSize.height - PANEL_HEIGHT) / 2;

    this.repositionZones();
    if (this.visible) {
      this.refresh();
    }
  };

  update(_dt: number): void {
    if (!this.visible) return;
    this.updateGoldDisplay();
  }

  destroy(fromScene?: boolean): void {
    off('ui:inventoryToggle', this.toggle);
    off('player:statsChanged', this.onStatsChanged);
    this.scene.scale.off('resize', this.onResize, this);
    this.hideTooltip();
    super.destroy(fromScene);
  }
}
