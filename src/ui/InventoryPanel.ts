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
  COLORS,
} from '@/data/constants';
import { UI_THEME, drawPanelShell, drawSectionCard, drawDivider, drawPillButton, type UiButtonState } from '@/ui/ui-theme';

// --- Layout constants ---

const PANEL_WIDTH = 500;
const PANEL_HEIGHT = 768;
const SLOT_SIZE = 50;
const SLOT_GAP = 5;
const GRID_COLS = 6;
const EQUIP_SLOT_SIZE = 48;
const EQUIP_SLOT_GAP = 6;

// Section Y offsets (relative to panelY)
const SECTION_TITLE_Y = 8;
const SECTION_EQUIP_Y = 42;
const SECTION_STATS_Y = 186;
const SECTION_GRID_Y = 454;
const SECTION_GOLD_Y = 744;

const TOOLTIP_MARGIN = 10;
const SORT_BTN_W = 60;
const SORT_BTN_H = 22;
const SORT_BTN_GAP = 8;

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

interface StatRow {
  label: string;
  value: string;
  help: string;
}

type StatPage = 'summary' | 'offense' | 'defense' | 'utility' | 'status';

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
    y: panelY + SECTION_GRID_Y + 35 + row * (SLOT_SIZE + SLOT_GAP),
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
  private dynamicZones: Phaser.GameObjects.Zone[] = [];

  // Interactive zones (persistent, repositioned on resize)
  private equipSlotZones: Map<EquipmentSlot, Phaser.GameObjects.Zone> = new Map();
  private inventorySlotZones: Phaser.GameObjects.Zone[] = [];

  // Sort button zones
  private sortRarityZone!: Phaser.GameObjects.Zone;
  private sortSlotZone!: Phaser.GameObjects.Zone;
  private sortNameZone!: Phaser.GameObjects.Zone;

  // Tooltip (scene-level object, null when hidden)
  private tooltip: Tooltip | null = null;

  private panelX: number;
  private panelY: number;

  // Drag-source tracking for gray-out
  private dragSourceIndex: number | null = null;
  private hoveredSort: 'rarity' | 'slot' | 'name' | null = null;
  private statPage: StatPage = 'summary';

  // New-item indicator tracking (session-only, never persisted)
  private newItemIds: Set<string> = new Set();

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
    this.titleText = scene.add.text(0, 0, 'CHARACTER', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: UI_THEME.text,
      stroke: '#000000',
      strokeThickness: 2,
    });
    this.titleText.setOrigin(0.5, 0);
    this.add(this.titleText);

    // Stats header divider label
    this.statsHeaderText = scene.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: UI_THEME.textDim,
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
      fontSize: '14px',
      color: COLORS.gold,
      stroke: '#000000',
      strokeThickness: 2,
    });
    this.add(this.goldText);
    this.statsHeaderText.setVisible(false);
    this.statsLeft.setVisible(false);
    this.statsRight.setVisible(false);

    // Create interactive zones
    this.createEquipmentZones();
    this.createInventoryZones();
    this.createSortZones();

    // Subscribe to events
    on('ui:inventoryToggle', this.toggle);
    on('player:statsChanged', this.onStatsChanged);
    on('item:sold', this.onItemSold);
    on('economy:purchase', this.onPurchase);
    on('ui:itemDragStart', this.onDragStarted);
    on('ui:itemDragEnd', this.onDragEnded);
    on('inventory:itemAdded', this.onItemAdded);

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
        if (pointer.rightButtonDown()) return; // right-click does nothing
        const item = getPlayer().inventory[index];
        if (!item) return;
        const isCtrlHeld = (pointer.event as MouseEvent).ctrlKey;
        // Ctrl+click while stash is open → deposit to stash
        if (isCtrlHeld && getState().stashOpen) {
          emit('ui:inventoryToStash', { item, fromInventoryIndex: index });
          return;
        }
        // Ctrl+click while merchant open → quick-stage the item
        if (isCtrlHeld && getState().merchantOpen) {
          emit('ui:stagingQuickMove', { item, fromInventoryIndex: index });
          return;
        }
        emit('ui:itemDragStart', { item, sourceIndex: index, dragSource: 'inventory' });
      });
      zone.on('pointerover', () => {
        this.dismissNewIndicatorAtSlot(index);
        this.showInventoryTooltip(index);
      });
      zone.on('pointerout',  () => { this.hideTooltip(); });

      this.add(zone);
      this.inventorySlotZones.push(zone);
    }
  }

  private createSortZones(): void {
    const rowCy = this.panelY + SECTION_GRID_Y + 10 + SORT_BTN_H / 2;
    const rightEdge = this.panelX + PANEL_WIDTH - 18;

    this.sortNameZone = this.scene.add.zone(rightEdge - SORT_BTN_W / 2, rowCy, SORT_BTN_W, SORT_BTN_H);
    this.sortNameZone.setInteractive({ useHandCursor: true });
    this.sortNameZone.on('pointerdown', () => this.sortInventoryBy('name'));
    this.sortNameZone.on('pointerover', () => {
      this.hoveredSort = 'name';
      if (this.visible) this.refresh();
    });
    this.sortNameZone.on('pointerout', () => {
      if (this.hoveredSort === 'name') this.hoveredSort = null;
      if (this.visible) this.refresh();
    });
    this.add(this.sortNameZone);

    this.sortSlotZone = this.scene.add.zone(rightEdge - SORT_BTN_W - SORT_BTN_GAP - SORT_BTN_W / 2, rowCy, SORT_BTN_W, SORT_BTN_H);
    this.sortSlotZone.setInteractive({ useHandCursor: true });
    this.sortSlotZone.on('pointerdown', () => this.sortInventoryBy('slot'));
    this.sortSlotZone.on('pointerover', () => {
      this.hoveredSort = 'slot';
      if (this.visible) this.refresh();
    });
    this.sortSlotZone.on('pointerout', () => {
      if (this.hoveredSort === 'slot') this.hoveredSort = null;
      if (this.visible) this.refresh();
    });
    this.add(this.sortSlotZone);

    this.sortRarityZone = this.scene.add.zone(rightEdge - 2 * (SORT_BTN_W + SORT_BTN_GAP) - SORT_BTN_W / 2, rowCy, SORT_BTN_W, SORT_BTN_H);
    this.sortRarityZone.setInteractive({ useHandCursor: true });
    this.sortRarityZone.on('pointerdown', () => this.sortInventoryBy('rarity'));
    this.sortRarityZone.on('pointerover', () => {
      this.hoveredSort = 'rarity';
      if (this.visible) this.refresh();
    });
    this.sortRarityZone.on('pointerout', () => {
      if (this.hoveredSort === 'rarity') this.hoveredSort = null;
      if (this.visible) this.refresh();
    });
    this.add(this.sortRarityZone);
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

  private repositionSortZones(): void {
    const rowCy = this.panelY + SECTION_GRID_Y + 10 + SORT_BTN_H / 2;
    const rightEdge = this.panelX + PANEL_WIDTH - 18;
    this.sortNameZone.setPosition(rightEdge - SORT_BTN_W / 2, rowCy);
    this.sortSlotZone.setPosition(rightEdge - SORT_BTN_W - SORT_BTN_GAP - SORT_BTN_W / 2, rowCy);
    this.sortRarityZone.setPosition(rightEdge - 2 * (SORT_BTN_W + SORT_BTN_GAP) - SORT_BTN_W / 2, rowCy);
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
    for (const zone of this.dynamicZones) {
      this.remove(zone);
      zone.destroy();
    }
    this.dynamicGfx = [];
    this.dynamicTexts = [];
    this.dynamicZones = [];
  }

  private drawPanelBackground(): void {
    const bg = this.panelBg;
    bg.clear();
    drawPanelShell(bg, this.panelX, this.panelY, PANEL_WIDTH, PANEL_HEIGHT, 10);
    drawSectionCard(bg, this.panelX + 12, this.panelY + 30, PANEL_WIDTH - 24, 136, false);
    drawSectionCard(bg, this.panelX + 12, this.panelY + SECTION_STATS_Y, PANEL_WIDTH - 24, 250, true);
    drawSectionCard(bg, this.panelX + 12, this.panelY + SECTION_GRID_Y, PANEL_WIDTH - 24, 276, false);
    drawSectionCard(bg, this.panelX + 12, this.panelY + SECTION_GOLD_Y - 6, PANEL_WIDTH - 24, 24, true);
    drawDivider(bg, this.panelX + 20, this.panelY + SECTION_STATS_Y - 8, this.panelX + PANEL_WIDTH - 20, this.panelY + SECTION_STATS_Y - 8);
    drawDivider(bg, this.panelX + 20, this.panelY + SECTION_GRID_Y - 8, this.panelX + PANEL_WIDTH - 20, this.panelY + SECTION_GRID_Y - 8);
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
    const labelY = this.panelY + SECTION_GRID_Y + 8;

    // "Backpack" label — left-aligned
    const label = this.scene.add.text(this.panelX + 18, labelY, 'Backpack', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: UI_THEME.textDim,
    });
    label.setOrigin(0, 0);
    this.add(label);
    this.dynamicTexts.push(label);

    // Sort buttons — right-aligned (visual only; interaction is on persistent zones)
    const SORT_BUTTONS: { key: 'rarity' | 'slot' | 'name'; label: string }[] = [
      { key: 'rarity', label: 'Rarity' },
      { key: 'slot', label: 'Type' },
      { key: 'name', label: 'Name' },
    ];
    const btnW = SORT_BTN_W;
    const btnH = SORT_BTN_H;
    const gap = SORT_BTN_GAP;
    const rightEdge = this.panelX + PANEL_WIDTH - 18;
    for (let b = 0; b < SORT_BUTTONS.length; b++) {
      const tx = rightEdge - (2 - b) * (btnW + gap) - btnW / 2;
      const btnX = tx - btnW / 2;
      const buttonGfx = this.scene.add.graphics();
      const state: UiButtonState = this.hoveredSort === SORT_BUTTONS[b].key ? 'hover' : 'default';
      drawPillButton(buttonGfx, btnX, labelY - 1, btnW, btnH, state);
      this.add(buttonGfx);
      this.dynamicGfx.push(buttonGfx);

      const btnText = this.scene.add.text(tx, labelY, SORT_BUTTONS[b].label, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: this.hoveredSort === SORT_BUTTONS[b].key ? UI_THEME.text : UI_THEME.textDim,
      }).setOrigin(0.5, 0.5);
      btnText.setY(labelY + btnH / 2 - 1);
      this.add(btnText);
      this.dynamicTexts.push(btnText);
    }

    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const { x, y } = invSlotPos(i, this.panelX, this.panelY);
      const item = player.inventory[i];
      const isDragSource = i === this.dragSourceIndex;

      const gfx = this.scene.add.graphics();
      this.add(gfx);
      this.dynamicGfx.push(gfx);

      // Slot background
      gfx.fillStyle(0x1a1a1a, 0.8);
      gfx.fillRoundedRect(x, y, SLOT_SIZE, SLOT_SIZE, 2);

      if (item) {
        if (isDragSource) {
          gfx.setAlpha(0.3);
          gfx.lineStyle(2, 0x888888, 1);
        } else {
          gfx.lineStyle(2, RARITY_BORDER_COLORS[item.rarity], 1);
        }
        gfx.strokeRoundedRect(x, y, SLOT_SIZE, SLOT_SIZE, 2);

        const nameText = this.scene.add.text(
          x + SLOT_SIZE / 2,
          y + SLOT_SIZE / 2,
          item.name.substring(0, 4),
          {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: isDragSource ? '#888888' : RARITY_COLORS[item.rarity],
            stroke: '#000000',
            strokeThickness: 1,
          }
        );
        nameText.setOrigin(0.5, 0.5);
        if (isDragSource) nameText.setAlpha(0.3);
        this.add(nameText);
        this.dynamicTexts.push(nameText);

        // New item indicator dot
        if (this.newItemIds.has(item.id)) {
          const dotGfx = this.scene.add.graphics();
          dotGfx.fillStyle(0xffffff, 1);
          dotGfx.fillCircle(x + SLOT_SIZE - 6, y + 6, 4);
          dotGfx.lineStyle(1, 0x000000, 0.6);
          dotGfx.strokeCircle(x + SLOT_SIZE - 6, y + 6, 4);
          this.add(dotGfx);
          this.dynamicGfx.push(dotGfx);
        }
      } else {
        gfx.lineStyle(1, 0x2a2a2a, 0.6);
        gfx.strokeRoundedRect(x, y, SLOT_SIZE, SLOT_SIZE, 2);
      }
    }
  }

  // --- Stats panel ---

  private updateStatsPanel(): void {
    const player = getPlayer();
    const pct = (value: number, digits = 1): string => `${(value * 100).toFixed(digits)}%`;
    const statsY = this.panelY + SECTION_STATS_Y;
    const colWidth = Math.floor((PANEL_WIDTH - 56) / 2);
    const leftX = this.panelX + 20;
    const rightX = leftX + colWidth + 16;

    const cardTitle = this.scene.add.text(this.panelX + 20, statsY + 10, 'Character Stats', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: UI_THEME.textDim,
    });
    this.add(cardTitle);
    this.dynamicTexts.push(cardTitle);
    this.drawStatTabs(statsY + 30);

    const offenseRows: StatRow[] = [
      { label: 'ATK', value: String(player.attack), help: 'Base physical damage used by attacks and many melee skills.' },
      { label: 'MGK', value: String(player.magicPower), help: 'Base magic damage used by spells and magic-scaling effects.' },
      { label: 'CRT', value: pct(player.critChance), help: 'Chance for hits to critically strike.' },
      { label: 'CDM', value: pct(player.critDamage, 0), help: 'Critical damage multiplier when a hit crits.' },
      { label: 'ASP', value: player.attackSpeed.toFixed(2), help: 'Attack speed multiplier for weapon/basic attacks.' },
      { label: 'ArmP', value: pct(player.armorPen), help: 'Armor penetration reduces enemy effective defense.' },
      { label: 'MagP', value: pct(player.magicPen), help: 'Magic penetration reduces enemy effective magic resistance.' },
    ];

    const defenseRows: StatRow[] = [
      { label: 'HP', value: String(player.maxHP), help: 'Maximum health pool.' },
      { label: 'DEF', value: String(player.defense), help: 'Physical mitigation stat used in incoming hit reduction.' },
      { label: 'MRes', value: String(player.magicResist), help: 'Magic resistance against magical damage.' },
      { label: 'DR', value: pct(player.damageReduction), help: 'Flat incoming damage reduction from stats and effects.' },
      { label: 'Dodge', value: pct(player.dodgeChance), help: 'Chance to avoid incoming hit damage entirely.' },
      { label: 'Regen', value: pct(player.hpRegen), help: 'HP regeneration per second (% max HP).' },
    ];

    const utilityRows: StatRow[] = [
      { label: 'SPD', value: String(player.moveSpeed), help: 'Character movement speed in world units.' },
      { label: 'E-Regen', value: `x${player.energyRegen.toFixed(2)}`, help: 'Energy regeneration multiplier.' },
      { label: 'LSteal', value: pct(player.lifeSteal), help: 'Life steal from physical damage.' },
      { label: 'SLeech', value: pct(player.spellLeech), help: 'Leech from magic damage.' },
      { label: 'Gold+', value: pct(player.goldFind), help: 'Bonus gold gains.' },
      { label: 'XP+', value: pct(player.xpBonus), help: 'Bonus XP gains.' },
    ];

    const statusRows: StatRow[] = [
      { label: 'Potency', value: `x${player.statusPotency.toFixed(2)}`, help: 'Status potency scales status damage and duration.' },
      { label: 'Bleed', value: pct(player.bleedChance), help: 'Chance to apply bleed on hit.' },
      { label: 'Poison', value: pct(player.poisonChance), help: 'Chance to apply poison on hit.' },
      { label: 'Burn', value: pct(player.burnChance), help: 'Chance to apply burn on hit.' },
      { label: 'Slow', value: pct(player.slowChance), help: 'Chance to apply slow on hit.' },
      { label: 'Freeze', value: pct(player.freezeChance), help: 'Chance to apply freeze on hit.' },
    ];

    if (this.statPage === 'summary') {
      this.drawStatGroup(leftX, statsY + 58, colWidth, 'Offense', offenseRows.slice(0, 4));
      this.drawStatGroup(leftX, statsY + 160, colWidth, 'Combat', [offenseRows[4], utilityRows[0], offenseRows[5], offenseRows[6]]);
      this.drawStatGroup(rightX, statsY + 58, colWidth, 'Defense', defenseRows.slice(0, 4));
      this.drawStatGroup(rightX, statsY + 160, colWidth, 'Status', [statusRows[0], statusRows[1], statusRows[2], statusRows[3]]);
      return;
    }

    const pageRows: Record<Exclude<StatPage, 'summary'>, StatRow[]> = {
      offense: offenseRows,
      defense: defenseRows,
      utility: utilityRows,
      status: statusRows,
    };

    const rows = pageRows[this.statPage as Exclude<StatPage, 'summary'>];
    const splitIndex = Math.ceil(rows.length / 2);
    this.drawStatList(leftX, statsY + 64, colWidth, rows.slice(0, splitIndex));
    this.drawStatList(rightX, statsY + 64, colWidth, rows.slice(splitIndex));
  }

  private drawStatTabs(y: number): void {
    const tabs: { id: StatPage; label: string }[] = [
      { id: 'summary', label: 'Summary' },
      { id: 'offense', label: 'Offense' },
      { id: 'defense', label: 'Defense' },
      { id: 'utility', label: 'Utility' },
      { id: 'status', label: 'Status' },
    ];
    const gap = 6;
    const totalWidth = PANEL_WIDTH - 40;
    const tabW = Math.floor((totalWidth - gap * (tabs.length - 1)) / tabs.length);
    const tabH = 20;
    const startX = this.panelX + 20;

    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      const x = startX + i * (tabW + gap);
      const state: UiButtonState = this.statPage === tab.id ? 'pressed' : 'default';

      const bg = this.scene.add.graphics();
      drawPillButton(bg, x, y, tabW, tabH, state, { fill: 0x1e3a8a, border: 0x3b82f6 });
      this.add(bg);
      this.dynamicGfx.push(bg);

      const text = this.scene.add.text(x + tabW / 2, y + 2, tab.label, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: this.statPage === tab.id ? UI_THEME.text : UI_THEME.textDim,
      }).setOrigin(0.5, 0.5);
      text.setY(y + tabH / 2);
      this.add(text);
      this.dynamicTexts.push(text);

      const zone = this.scene.add.zone(x + tabW / 2, y + tabH / 2, tabW, tabH);
      zone.setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        this.statPage = tab.id;
        if (this.visible) this.refresh();
      });
      this.add(zone);
      this.dynamicZones.push(zone);
    }
  }

  private drawStatGroup(x: number, y: number, width: number, title: string, rows: StatRow[]): void {
    const titleText = this.scene.add.text(x, y, title, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#7dd3fc',
    });
    this.add(titleText);
    this.dynamicTexts.push(titleText);

    const rowStartY = y + 20;
    const rowHeight = 16;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowY = rowStartY + i * rowHeight;

      const labelText = this.scene.add.text(x, rowY, row.label, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: UI_THEME.text,
      });
      this.add(labelText);
      this.dynamicTexts.push(labelText);

      const valueText = this.scene.add.text(x + width - 4, rowY, row.value, {
        fontFamily: 'monospace',
        fontSize: row.label === 'B/P/Bu' || row.label === 'Sl/Fr' ? '9px' : '10px',
        color: UI_THEME.text,
      }).setOrigin(1, 0);
      this.add(valueText);
      this.dynamicTexts.push(valueText);

      const zone = this.scene.add.zone(x + width / 2, rowY + rowHeight / 2, width, rowHeight + 2);
      zone.setInteractive({ useHandCursor: true });
      zone.on('pointerover', (pointer: Phaser.Input.Pointer) => {
        this.showStatTooltip(row.label, row.help, pointer.x + 12, pointer.y + 10);
      });
      zone.on('pointerout', () => {
        this.hideTooltip();
      });
      this.add(zone);
      this.dynamicZones.push(zone);
    }
  }

  private drawStatList(x: number, y: number, width: number, rows: StatRow[]): void {
    const rowHeight = 22;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowY = y + i * rowHeight;

      const rowBg = this.scene.add.graphics();
      rowBg.fillStyle(0x111c2e, 0.45);
      rowBg.fillRoundedRect(x - 2, rowY - 1, width + 4, rowHeight - 2, 4);
      this.add(rowBg);
      this.dynamicGfx.push(rowBg);

      const labelText = this.scene.add.text(x + 4, rowY + 2, row.label, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: UI_THEME.textDim,
      });
      this.add(labelText);
      this.dynamicTexts.push(labelText);

      const valueText = this.scene.add.text(x + width - 4, rowY + 2, row.value, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: UI_THEME.text,
      }).setOrigin(1, 0);
      this.add(valueText);
      this.dynamicTexts.push(valueText);

      const zone = this.scene.add.zone(x + width / 2, rowY + rowHeight / 2, width, rowHeight);
      zone.setInteractive({ useHandCursor: true });
      zone.on('pointerover', (pointer: Phaser.Input.Pointer) => {
        this.showStatTooltip(row.label, row.help, pointer.x + 12, pointer.y + 10);
      });
      zone.on('pointerout', () => {
        this.hideTooltip();
      });
      this.add(zone);
      this.dynamicZones.push(zone);
    }
  }

  private showStatTooltip(stat: string, description: string, x: number, y: number): void {
    this.hideTooltip();
    const container = this.scene.add.container(0, 0);
    container.setScrollFactor(0);
    container.setDepth(250);

    const bg = this.scene.add.graphics();
    container.add(bg);

    const title = this.scene.add.text(8, 6, stat, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#7dd3fc',
    });
    const body = this.scene.add.text(8, 22, description, {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: UI_THEME.text,
      wordWrap: { width: 220 },
    });
    container.add(title);
    container.add(body);

    const width = Math.max(title.width, body.width) + 16;
    const height = body.y + body.height + 8;
    bg.fillStyle(0x0b1220, 0.96);
    bg.fillRoundedRect(0, 0, width, height, 6);
    bg.lineStyle(1, 0x334155, 0.9);
    bg.strokeRoundedRect(0, 0, width, height, 6);

    const clampedX = Math.max(8, Math.min(x, this.scene.scale.width - width - 8));
    const clampedY = Math.max(8, Math.min(y, this.scene.scale.height - height - 8));
    container.setPosition(clampedX, clampedY);
    this.tooltip = { container };
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
    const item = player.inventory[index];
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
    lines.push({ text: '------------------', color: COLORS.uiTextDim, size: 8 });

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
      lines.push({ text: '------------------', color: COLORS.uiTextDim, size: 8 });
      lines.push({ text: item.legendaryEffect, color: RARITY_COLORS.legendary, size: 11 });
    }

    // Crafting info
    if (item.isImbued || item.temperLevel > 0) {
      lines.push({ text: '------------------', color: COLORS.uiTextDim, size: 8 });
      if (item.isImbued) lines.push({ text: 'Imbued', color: '#a855f7', size: 9 });
      if (item.temperLevel > 0) {
        lines.push({ text: `Tempered +${item.temperLevel}`, color: '#f97316', size: 9 });
      }
    }

    // Comparison diffs
    if (diffs && Object.keys(diffs).length > 0) {
      lines.push({ text: '-- vs equipped --', color: COLORS.uiTextDim, size: 9 });
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
    if (state.merchantOpen && state.inventoryOpen) return; // never close while merchant open
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
      this.refresh();
    }
  };

  private onItemSold = (): void => {
    if (this.visible) this.refresh();
  };

  private onPurchase = (): void => {
    if (this.visible) this.refresh();
  };

  private onDragStarted = ({ sourceIndex, dragSource }: { item: ItemInstance; sourceIndex: number; dragSource: 'inventory' | 'staging' | 'stash' }): void => {
    this.dragSourceIndex = dragSource === 'inventory' ? sourceIndex : null;
    if (this.visible) this.refresh();
  };

  private onDragEnded = (): void => {
    this.dragSourceIndex = null;
    if (this.visible) this.refresh();
  };

  private onItemAdded = ({ item }: { item: ItemInstance; slotIndex: number }): void => {
    this.newItemIds.add(item.id);
    if (this.visible) this.refresh();
  };

  suppressNewIndicator(itemId: string): void {
    this.newItemIds.delete(itemId);
  }

  private dismissNewIndicatorAtSlot(index: number): void {
    const item = getPlayer().inventory[index];
    if (!item || !this.newItemIds.has(item.id)) return;
    this.newItemIds.delete(item.id);
    if (this.visible) this.refresh();
  }

  /** Returns the inventory slot index under the given screen point, or null */
  getInventorySlotBoundsAtPoint(px: number, py: number): number | null {
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const { x, y } = invSlotPos(i, this.panelX, this.panelY);
      if (px >= x && px <= x + SLOT_SIZE && py >= y && py <= y + SLOT_SIZE) return i;
    }
    return null;
  }

  isPointOverPanel(px: number, py: number): boolean {
    return (
      px >= this.panelX && px <= this.panelX + PANEL_WIDTH &&
      py >= this.panelY && py <= this.panelY + PANEL_HEIGHT
    );
  }

  private onResize = (gameSize: Phaser.Structs.Size): void => {
    this.panelX = gameSize.width - PANEL_WIDTH - 12;
    this.panelY = (gameSize.height - PANEL_HEIGHT) / 2;

    this.repositionZones();
    this.repositionSortZones();
    if (this.visible) {
      this.refresh();
    }
  };

  private sortInventoryBy(criteria: 'rarity' | 'slot' | 'name'): void {
    const inv = getPlayer().inventory;
    const items = inv.filter((i): i is ItemInstance => i !== null);

    const rarityOrder: Record<string, number> = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };
    const slotOrder: Record<string, number> = { weapon: 0, helmet: 1, chest: 2, gloves: 3, boots: 4, accessory: 5 };

    switch (criteria) {
      case 'rarity':
        items.sort((a, b) => (rarityOrder[a.rarity] - rarityOrder[b.rarity]) || a.name.localeCompare(b.name));
        break;
      case 'slot':
        items.sort((a, b) => (slotOrder[a.slot] - slotOrder[b.slot]) || (rarityOrder[a.rarity] - rarityOrder[b.rarity]));
        break;
      case 'name':
        items.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    inv.fill(null);
    items.forEach((item, i) => { inv[i] = item; });
    emit('player:statsChanged');
    this.refresh();
  }

  update(_dt: number): void {
    if (!this.visible) return;
    this.updateGoldDisplay();
  }

  destroy(fromScene?: boolean): void {
    off('ui:inventoryToggle', this.toggle);
    off('player:statsChanged', this.onStatsChanged);
    off('item:sold', this.onItemSold);
    off('economy:purchase', this.onPurchase);
    off('ui:itemDragStart', this.onDragStarted);
    off('ui:itemDragEnd', this.onDragEnded);
    off('inventory:itemAdded', this.onItemAdded);
    this.scene.scale.off('resize', this.onResize, this);
    this.hideTooltip();
    super.destroy(fromScene);
  }
}
