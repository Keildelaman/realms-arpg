// ============================================================================
// StashPanel — Multi-tab item storage panel
// ============================================================================

import Phaser from 'phaser';
import type { ItemInstance, Rarity, EquipmentSlot } from '@/core/types';
import {
  getState,
  getPlayer,
  setActiveStashTab,
  buyStashTab,
  renameStashTab,
  recolorStashTab,
} from '@/core/game-state';
import { on, off, emit } from '@/core/event-bus';
import { formatAffixValue, formatAffixName } from '@/ui/item-format';
import { RARITY_COLORS, COLORS, STASH_MAX_TABS, STASH_FREE_TABS, STASH_TAB_COSTS, STASH_TAB_SIZE } from '@/data/constants';
import { UI_THEME, drawPanelShell, drawSectionCard, drawPillButton, type UiButtonState } from '@/ui/ui-theme';

// --- Layout constants ---

const PANEL_WIDTH  = 420;
const PANEL_HEIGHT = 640;
const SLOT_SIZE    = 58;
const SLOT_GAP     = 8;
const GRID_COLS    = 4;
const GRID_ROWS    = 6;

// Y offsets within panel
const TITLE_Y      = 14;
const TAB_BAR_Y    = 56;
const TAB_BAR_H    = 30;
const SEARCH_Y     = 104;
const SEARCH_H     = 28;
const GRID_Y       = 150;

const TOOLTIP_MARGIN = 10;

const RARITY_BORDER_COLORS: Record<Rarity, number> = {
  common:    0xb0b0b0,
  uncommon:  0x4ade80,
  rare:      0x60a5fa,
  epic:      0xc084fc,
  legendary: 0xfbbf24,
};

const SWATCH_COLORS = [
  0x94a3b8, // slate
  0x86efac, // green
  0xfbbf24, // amber
  0xf87171, // red
  0x93c5fd, // blue
  0xd8b4fe, // purple
];

interface Tooltip {
  container: Phaser.GameObjects.Container;
}

function itemMatchesQuery(item: ItemInstance, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (item.name.toLowerCase().includes(q)) return true;
  if (item.rarity.toLowerCase().includes(q)) return true;
  if (item.slot.toLowerCase().includes(q)) return true;
  for (const affix of item.affixes) {
    if (affix.id.toLowerCase().includes(q)) return true;
    if (formatAffixName(affix.id).toLowerCase().includes(q)) return true;
  }
  return false;
}

function slotGlyph(slot: EquipmentSlot): string {
  switch (slot) {
    case 'weapon': return 'WPN';
    case 'helmet': return 'HLM';
    case 'chest': return 'CHT';
    case 'gloves': return 'GLV';
    case 'boots': return 'BTS';
    case 'accessory': return 'ACC';
    default: return 'ITM';
  }
}

// ============================================================================
// StashPanel
// ============================================================================

export class StashPanel extends Phaser.GameObjects.Container {
  private panelX: number;
  private panelY: number;

  private panelBg: Phaser.GameObjects.Graphics;
  private titleText: Phaser.GameObjects.Text;
  private closeText: Phaser.GameObjects.Text;

  // Dynamic objects cleared on each refresh
  private dynamicGfx: Phaser.GameObjects.Graphics[] = [];
  private dynamicTexts: Phaser.GameObjects.Text[] = [];
  private dynamicZones: Phaser.GameObjects.Zone[] = [];

  // Tooltip
  private tooltip: Tooltip | null = null;

  // Search state
  private searchText = '';
  private searchFocused = false;
  private searchBg!: Phaser.GameObjects.Graphics;
  private searchDisplay!: Phaser.GameObjects.Text;
  private searchZone!: Phaser.GameObjects.Zone;
  private closeZone!: Phaser.GameObjects.Zone;

  // Color swatches (transient, shown on tab right-click)
  private swatchTabIndex = -1;
  private swatchContainer: Phaser.GameObjects.Container | null = null;
  private hoveredSlotIndex = -1;
  private hoveredClose = false;

  // Keyboard handler reference for cleanup
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.setScrollFactor(0);
    this.setDepth(210);
    this.setVisible(false);

    this.panelX = Math.floor((scene.scale.width - PANEL_WIDTH) / 2);
    this.panelY = Math.floor((scene.scale.height - PANEL_HEIGHT) / 2);

    // Panel background
    this.panelBg = scene.add.graphics();
    this.add(this.panelBg);

    // Title
    this.titleText = scene.add.text(0, 0, 'STASH', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: UI_THEME.text,
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 0);
    this.add(this.titleText);

    this.closeText = scene.add.text(0, 0, 'X', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: UI_THEME.textDim,
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(0.5, 0.5);
    this.add(this.closeText);

    // Search bar background + text (persistent, just repositioned)
    this.searchBg = scene.add.graphics();
    this.add(this.searchBg);

    this.searchDisplay = scene.add.text(0, 0, 'Search...', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: COLORS.uiTextDim,
    });
    this.add(this.searchDisplay);

    // Search click zone
    this.searchZone = scene.add.zone(0, 0, PANEL_WIDTH - 32, SEARCH_H);
    this.searchZone.setInteractive({ useHandCursor: true });
    this.searchZone.on('pointerdown', () => {
      this.searchFocused = true;
      this.registerKeydown();
      this.drawSearch();
    });
    this.add(this.searchZone);

    this.closeZone = scene.add.zone(0, 0, 24, 24);
    this.closeZone.setInteractive({ useHandCursor: true });
    this.closeZone.on('pointerdown', () => {
      if (!this.visible) return;
      this.toggle();
    });
    this.closeZone.on('pointerover', () => {
      this.hoveredClose = true;
      if (this.visible) this.updateCloseControl();
    });
    this.closeZone.on('pointerout', () => {
      this.hoveredClose = false;
      if (this.visible) this.updateCloseControl();
    });
    this.add(this.closeZone);

    // Subscribe
    on('stash:itemAdded',    this.refresh);
    on('stash:tabChanged',   this.refresh);
    on('stash:tabBought',    this.refresh);
    on('economy:goldChanged', this.refresh);

    scene.scale.on('resize', this.onResize, this);
  }

  // --- Search keyboard capture ---

  private registerKeydown(): void {
    if (this.keydownHandler) return;
    this.keydownHandler = (e: KeyboardEvent) => {
      if (!this.searchFocused) return;
      e.stopPropagation();
      if (e.key === 'Escape') {
        this.searchFocused = false;
        this.searchText = '';
        this.unregisterKeydown();
        this.refresh();
        return;
      }
      if (e.key === 'Backspace') {
        this.searchText = this.searchText.slice(0, -1);
      } else if (e.key.length === 1) {
        this.searchText += e.key;
      }
      this.refresh();
    };
    window.addEventListener('keydown', this.keydownHandler, true);
  }

  private unregisterKeydown(): void {
    if (this.keydownHandler) {
      window.removeEventListener('keydown', this.keydownHandler, true);
      this.keydownHandler = null;
    }
  }

  // --- Drawing helpers ---

  private clearDynamic(): void {
    for (const g of this.dynamicGfx)   { this.remove(g, true); }
    for (const t of this.dynamicTexts) { this.remove(t, true); }
    for (const z of this.dynamicZones) { this.remove(z, true); }
    this.dynamicGfx   = [];
    this.dynamicTexts = [];
    this.dynamicZones = [];
  }

  private drawPanelBackground(): void {
    this.panelBg.clear();
    drawPanelShell(this.panelBg, this.panelX, this.panelY, PANEL_WIDTH, PANEL_HEIGHT, 10);
    drawSectionCard(this.panelBg, this.panelX + 12, this.panelY + 34, PANEL_WIDTH - 24, 48, false);
    drawSectionCard(this.panelBg, this.panelX + 12, this.panelY + SEARCH_Y - 4, PANEL_WIDTH - 24, SEARCH_H + 8, true);
    drawSectionCard(this.panelBg, this.panelX + 12, this.panelY + GRID_Y - 6, PANEL_WIDTH - 24, PANEL_HEIGHT - GRID_Y - 18, false);
  }

  private drawTitle(): void {
    this.titleText.setPosition(this.panelX + PANEL_WIDTH / 2, this.panelY + TITLE_Y);
    this.updateCloseControl();
  }

  private updateCloseControl(): void {
    const x = this.panelX + PANEL_WIDTH - 18;
    const y = this.panelY + TITLE_Y + 8;
    this.closeText.setPosition(x, y);
    this.closeText.setColor(this.hoveredClose ? '#fca5a5' : UI_THEME.textDim);
    this.closeZone.setPosition(x, y);
  }

  private drawSearch(): void {
    const sx = this.panelX + 16;
    const sy = this.panelY + SEARCH_Y;
    const sw = PANEL_WIDTH - 32;

    this.searchBg.clear();
    this.searchBg.fillStyle(0x0f172a, 0.95);
    this.searchBg.fillRoundedRect(sx, sy, sw, SEARCH_H, 3);
    this.searchBg.lineStyle(1, this.searchFocused ? 0x60a5fa : 0x334155, 1);
    this.searchBg.strokeRoundedRect(sx, sy, sw, SEARCH_H, 3);

    this.searchZone.setPosition(sx + sw / 2, sy + SEARCH_H / 2);

    const displayStr = this.searchText.length > 0 ? this.searchText : (this.searchFocused ? '|' : 'Search...');
    this.searchDisplay.setText(displayStr);
    this.searchDisplay.setColor(this.searchText.length > 0 || this.searchFocused ? UI_THEME.text : UI_THEME.textDim);
    this.searchDisplay.setPosition(sx + 10, sy + 5);
  }

  private drawTabBar(): void {
    const stash = getState().player.stash;
    const tabs = stash.tabs;
    const activeIdx = stash.activeTabIndex;

    const tabY = this.panelY + TAB_BAR_Y;
    const plusW = 30;
    const gap = 6;
    const innerLeft = this.panelX + 18;
    const innerW = PANEL_WIDTH - 40;
    const availW = innerW - (tabs.length < STASH_MAX_TABS ? plusW + gap : 0);
    const tabW = Math.floor(availW / Math.max(tabs.length, 1));

    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i]!;
      const tx = innerLeft + i * (tabW + gap);
      const isActive = i === activeIdx;

      const tabGfx = this.scene.add.graphics();
      const buttonState: UiButtonState = isActive ? 'pressed' : 'default';
      drawPillButton(tabGfx, tx, tabY, tabW, TAB_BAR_H, buttonState, { fill: 0x1e3a8a, border: 0x3b82f6 });
      this.add(tabGfx);
      this.dynamicGfx.push(tabGfx);

      const tabText = this.scene.add.text(tx + tabW / 2, tabY + TAB_BAR_H / 2, tab.name.substring(0, 8), {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#' + tab.color.toString(16).padStart(6, '0'),
      }).setOrigin(0.5, 0.5).setAlpha(isActive ? 1 : 0.6);
      this.add(tabText);
      this.dynamicTexts.push(tabText);

      // Click zone
      const tabIdx = i;
      const zone = this.scene.add.zone(tx + tabW / 2, tabY + TAB_BAR_H / 2, tabW, TAB_BAR_H);
      zone.setInteractive({ useHandCursor: true });
      zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (pointer.rightButtonDown()) {
          this.showSwatches(tabIdx, tx, tabY + TAB_BAR_H + 2);
        } else {
          this.hideSwatches();
          setActiveStashTab(tabIdx);
        }
      });
      this.add(zone);
      this.dynamicZones.push(zone);
    }

    // Buy tab "+" button
    if (tabs.length < STASH_MAX_TABS) {
      const plusX = innerLeft + tabs.length * (tabW + gap);
      const costIndex = tabs.length - STASH_FREE_TABS;
      const cost = STASH_TAB_COSTS[costIndex] ?? 0;
      const canAfford = getPlayer().gold >= cost;

      const plusGfx = this.scene.add.graphics();
      drawPillButton(plusGfx, plusX, tabY, plusW, TAB_BAR_H, canAfford ? 'default' : 'disabled', { fill: 0x14532d, border: 0x22c55e });
      this.add(plusGfx);
      this.dynamicGfx.push(plusGfx);

      const plusText = this.scene.add.text(plusX + plusW / 2, tabY + TAB_BAR_H / 2, '+', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: canAfford ? UI_THEME.success : UI_THEME.textMuted,
      }).setOrigin(0.5, 0.5);
      this.add(plusText);
      this.dynamicTexts.push(plusText);

      const plusZone = this.scene.add.zone(plusX + plusW / 2, tabY + TAB_BAR_H / 2, plusW, TAB_BAR_H);
      plusZone.setInteractive({ useHandCursor: true });
      plusZone.on('pointerdown', () => {
        this.hideSwatches();
        buyStashTab();
      });
      plusZone.on('pointerover', () => {
        this.showBuyTabTooltip(cost, canAfford, plusX, tabY);
      });
      plusZone.on('pointerout', () => { this.hideTooltip(); });
      this.add(plusZone);
      this.dynamicZones.push(plusZone);
    }
  }

  private drawGrid(): void {
    const stash = getState().player.stash;
    const tab = stash.tabs[stash.activeTabIndex];
    if (!tab) return;

    const gridStartX = this.panelX + (PANEL_WIDTH - (GRID_COLS * (SLOT_SIZE + SLOT_GAP) - SLOT_GAP)) / 2;
    const gridStartY = this.panelY + GRID_Y;

    const query = this.searchText.toLowerCase();

    for (let i = 0; i < STASH_TAB_SIZE; i++) {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const sx = gridStartX + col * (SLOT_SIZE + SLOT_GAP);
      const sy = gridStartY + row * (SLOT_SIZE + SLOT_GAP);

      const item = tab.items[i] ?? null;
      const matches = !query || (item !== null && itemMatchesQuery(item, query));
      const alpha = query && !matches ? 0.2 : 1;
      const isHovered = this.hoveredSlotIndex === i;

      const slotGfx = this.scene.add.graphics();
      slotGfx.setAlpha(alpha);
      slotGfx.fillStyle(isHovered ? 0x243246 : 0x1a2333, 0.86);
      slotGfx.fillRoundedRect(sx, sy, SLOT_SIZE, SLOT_SIZE, 4);

      if (item) {
        slotGfx.fillStyle(RARITY_BORDER_COLORS[item.rarity], 0.1);
        slotGfx.fillRoundedRect(sx + 2, sy + 2, SLOT_SIZE - 4, SLOT_SIZE - 4, 3);
        slotGfx.fillStyle(0x000000, 0.42);
        slotGfx.fillRoundedRect(sx + 6, sy + SLOT_SIZE / 2 - 12, SLOT_SIZE - 12, 24, 4);
        slotGfx.lineStyle(2, RARITY_BORDER_COLORS[item.rarity], 1);
        slotGfx.strokeRoundedRect(sx, sy, SLOT_SIZE, SLOT_SIZE, 4);

        const nameText = this.scene.add.text(sx + SLOT_SIZE / 2, sy + SLOT_SIZE / 2 + 4, item.name.substring(0, 4).toUpperCase(), {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 3,
        }).setOrigin(0.5, 0.5).setAlpha(alpha < 1 ? 0.75 : 1);
        nameText.setShadow(0, 1, '#000000', 3, false, true);
        this.add(nameText);
        this.dynamicTexts.push(nameText);

        const glyphText = this.scene.add.text(sx + 5, sy + 4, slotGlyph(item.slot), {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 2,
        }).setAlpha(alpha < 1 ? 0.75 : 1);
        glyphText.setShadow(0, 1, '#000000', 2, false, true);
        this.add(glyphText);
        this.dynamicTexts.push(glyphText);

        const tierText = this.scene.add.text(sx + SLOT_SIZE - 5, sy + 4, `T${item.tier}`, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 2,
        }).setOrigin(1, 0).setAlpha(alpha < 1 ? 0.75 : 1);
        tierText.setShadow(0, 1, '#000000', 2, false, true);
        this.add(tierText);
        this.dynamicTexts.push(tierText);
      } else {
        slotGfx.lineStyle(1, 0x2a2a2a, 0.5);
        slotGfx.strokeRoundedRect(sx, sy, SLOT_SIZE, SLOT_SIZE, 4);
      }

      this.add(slotGfx);
      this.dynamicGfx.push(slotGfx);

      // Interaction zone
      const slotIdx = i;
      const zone = this.scene.add.zone(sx + SLOT_SIZE / 2, sy + SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE);
      zone.setInteractive({ useHandCursor: !!item });
      zone.on('pointerover', () => {
        this.hoveredSlotIndex = slotIdx;
        if (item) this.showItemTooltip(item, sx, sy);
      });
      zone.on('pointerout', () => {
        if (this.hoveredSlotIndex === slotIdx) this.hoveredSlotIndex = -1;
        this.hideTooltip();
      });
      zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (!item) return;
        this.hideTooltip();
        this.hideSwatches();
        if ((pointer.event as MouseEvent).ctrlKey) {
          emit('ui:stashToInventory', { item, tabIndex: stash.activeTabIndex, slotIndex: slotIdx });
        } else {
          emit('ui:itemDragStart', {
            item,
            sourceIndex: slotIdx,
            dragSource: 'stash',
            stashTab: stash.activeTabIndex,
            stashSlot: slotIdx,
          });
        }
      });
      this.add(zone);
      this.dynamicZones.push(zone);
    }
  }

  // --- Swatch overlay ---

  private showSwatches(tabIndex: number, x: number, y: number): void {
    this.hideSwatches();
    this.swatchTabIndex = tabIndex;

    const container = this.scene.add.container(x, y);
    container.setScrollFactor(0).setDepth(300);

    // Prompt for rename
    const renameTxt = this.scene.add.text(0, 0, 'Rename | Color:', {
      fontFamily: 'monospace',
      fontSize: '9px',
      color: COLORS.uiTextDim,
    });
    container.add(renameTxt);

    // Rename button
    const renameZone = this.scene.add.zone(renameTxt.width + 24, 5, 40, 14);
    renameZone.setInteractive({ useHandCursor: true });
    renameZone.on('pointerdown', () => {
      const tab = getState().player.stash.tabs[tabIndex];
      const newName = window.prompt('Rename tab:', tab?.name ?? '');
      if (newName !== null && newName.trim().length > 0) {
        renameStashTab(tabIndex, newName.trim().substring(0, 8));
        this.hideSwatches();
        this.refresh();
      }
    });
    container.add(renameZone);

    const editTxt = this.scene.add.text(renameTxt.width + 4, 0, '[edit]', {
      fontFamily: 'monospace',
      fontSize: '9px',
      color: '#60a5fa',
    });
    container.add(editTxt);

    // Color swatches
    const swatchSize = 14;
    const swatchGap = 3;
    for (let s = 0; s < SWATCH_COLORS.length; s++) {
      const color = SWATCH_COLORS[s]!;
      const sx = s * (swatchSize + swatchGap);
      const sy = 16;

      const gfx = this.scene.add.graphics();
      gfx.fillStyle(color, 1);
      gfx.fillCircle(sx + swatchSize / 2, sy + swatchSize / 2, swatchSize / 2);
      gfx.lineStyle(1, 0x888888, 0.6);
      gfx.strokeCircle(sx + swatchSize / 2, sy + swatchSize / 2, swatchSize / 2);
      container.add(gfx);

      const swatchZone = this.scene.add.zone(sx + swatchSize / 2, sy + swatchSize / 2, swatchSize, swatchSize);
      swatchZone.setInteractive({ useHandCursor: true });
      const colorVal = color;
      const tidx = tabIndex;
      swatchZone.on('pointerdown', () => {
        recolorStashTab(tidx, colorVal);
        this.hideSwatches();
        this.refresh();
      });
      container.add(swatchZone);
    }

    this.swatchContainer = container;
  }

  private hideSwatches(): void {
    if (this.swatchContainer) {
      this.swatchContainer.destroy();
      this.swatchContainer = null;
    }
    this.swatchTabIndex = -1;
  }

  // --- Tooltip ---

  private showItemTooltip(item: ItemInstance, slotX: number, slotY: number): void {
    this.hideTooltip();

    const lines: { text: string; color: string; size: number }[] = [];
    lines.push({ text: item.name, color: RARITY_COLORS[item.rarity], size: 14 });
    const rarityLabel = item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1);
    lines.push({ text: `${rarityLabel} ${item.slot}`, color: COLORS.uiTextDim, size: 11 });
    lines.push({ text: `iLvl ${item.itemLevel}  Tier ${item.tier}`, color: COLORS.uiTextDim, size: 10 });
    lines.push({ text: '------------------', color: COLORS.uiTextDim, size: 8 });

    const sorted = [...item.affixes].sort((a, b) => (b.isPrefix ? 1 : 0) - (a.isPrefix ? 1 : 0));
    for (const affix of sorted) {
      lines.push({
        text: `${formatAffixValue(affix.id, affix.value)} ${formatAffixName(affix.id)}`,
        color: '#cccccc',
        size: 12,
      });
    }

    if (item.legendaryEffect) {
      lines.push({ text: '------------------', color: COLORS.uiTextDim, size: 8 });
      lines.push({ text: item.legendaryEffect, color: RARITY_COLORS.legendary, size: 11 });
    }

    lines.push({ text: '------------------', color: COLORS.uiTextDim, size: 8 });
    lines.push({ text: 'Ctrl+Click to move to inventory', color: COLORS.uiTextDim, size: 10 });

    const container = this.scene.add.container(0, 0);
    container.setScrollFactor(0).setDepth(260);

    const bg = this.scene.add.graphics();
    container.add(bg);

    let lineY = 8;
    let maxWidth = 0;
    for (const line of lines) {
      const txt = this.scene.add.text(8, lineY, line.text, {
        fontFamily: 'monospace',
        fontSize: `${line.size}px`,
        color: line.color,
      });
      container.add(txt);
      maxWidth = Math.max(maxWidth, txt.width);
      lineY += txt.height + 3;
    }

    const tw = maxWidth + 16;
    const th = lineY + 8;
    bg.fillStyle(0x0d0d0d, 0.97);
    bg.fillRoundedRect(0, 0, tw, th, 4);
    bg.lineStyle(1, 0x555555, 0.8);
    bg.strokeRoundedRect(0, 0, tw, th, 4);

    // Position to the right of the slot (panel is centered)
    let finalX = slotX + SLOT_SIZE + TOOLTIP_MARGIN;
    if (finalX + tw > this.scene.scale.width - 8) {
      finalX = slotX - tw - TOOLTIP_MARGIN;
    }
    finalX = Math.max(8, finalX);

    const sceneH = this.scene.scale.height;
    let finalY = slotY;
    finalY = Math.max(8, Math.min(finalY, sceneH - th - 8));

    container.setPosition(finalX, finalY);
    this.tooltip = { container };
  }

  private showBuyTabTooltip(cost: number, canAfford: boolean, x: number, y: number): void {
    this.hideTooltip();

    const text = canAfford ? `Buy Tab: ${cost} Gold` : `Requires: ${cost} Gold`;
    const color = canAfford ? '#4ade80' : '#f87171';

    const container = this.scene.add.container(0, 0);
    container.setScrollFactor(0).setDepth(260);

    const bg = this.scene.add.graphics();
    const txt = this.scene.add.text(8, 6, text, { fontFamily: 'monospace', fontSize: '10px', color });

    const tw = txt.width + 16;
    const th = txt.height + 12;
    bg.fillStyle(0x0d0d0d, 0.97);
    bg.fillRoundedRect(0, 0, tw, th, 4);
    bg.lineStyle(1, 0x555555, 0.8);
    bg.strokeRoundedRect(0, 0, tw, th, 4);

    container.add(bg);
    container.add(txt);
    container.setPosition(Math.max(8, x), y + TAB_BAR_H + 4);
    this.tooltip = { container };
  }

  private hideTooltip(): void {
    if (this.tooltip) {
      this.tooltip.container.destroy();
      this.tooltip = null;
    }
  }

  // --- Public API ---

  isPointOverStash(px: number, py: number): boolean {
    return (
      px >= this.panelX && px <= this.panelX + PANEL_WIDTH &&
      py >= this.panelY && py <= this.panelY + PANEL_HEIGHT
    );
  }

  getStashSlotAtPoint(px: number, py: number): number | null {
    const gridStartX = this.panelX + (PANEL_WIDTH - (GRID_COLS * (SLOT_SIZE + SLOT_GAP) - SLOT_GAP)) / 2;
    const gridStartY = this.panelY + GRID_Y;
    for (let i = 0; i < STASH_TAB_SIZE; i++) {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const sx = gridStartX + col * (SLOT_SIZE + SLOT_GAP);
      const sy = gridStartY + row * (SLOT_SIZE + SLOT_GAP);
      if (px >= sx && px <= sx + SLOT_SIZE && py >= sy && py <= sy + SLOT_SIZE) return i;
    }
    return null;
  }

  refresh = (): void => {
    this.clearDynamic();
    this.drawPanelBackground();
    this.drawTitle();
    this.drawSearch();
    this.drawTabBar();
    this.drawGrid();
  };

  toggle(): void {
    const s = getState();
    s.stashOpen = !s.stashOpen;
    this.setVisible(s.stashOpen);

    if (s.stashOpen) {
      this.refresh();
    } else {
      this.searchText = '';
      this.searchFocused = false;
      this.unregisterKeydown();
      this.hideTooltip();
      this.hideSwatches();
    }
  }

  destroy(fromScene?: boolean): void {
    off('stash:itemAdded',    this.refresh);
    off('stash:tabChanged',   this.refresh);
    off('stash:tabBought',    this.refresh);
    off('economy:goldChanged', this.refresh);
    this.scene.scale.off('resize', this.onResize, this);
    this.unregisterKeydown();
    this.hideTooltip();
    this.hideSwatches();
    super.destroy(fromScene);
  }

  private onResize = (gameSize: Phaser.Structs.Size): void => {
    this.panelX = Math.floor((gameSize.width - PANEL_WIDTH) / 2);
    this.panelY = Math.floor((gameSize.height - PANEL_HEIGHT) / 2);
    if (this.visible) this.refresh();
  };
}
