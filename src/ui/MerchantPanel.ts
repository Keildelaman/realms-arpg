// ============================================================================
// MerchantPanel — Shop-only merchant UI. Player inventory auto-opens alongside
// (managed by UIScene). Drag items from inventory onto the sell zone to sell.
// ============================================================================

import Phaser from 'phaser';
import type { ItemInstance, Rarity } from '@/core/types';
import { getPlayer, getState, addToInventory, isInventoryFull } from '@/core/game-state';
import { on, off, emit } from '@/core/event-bus';
import {
  generateShop,
  refreshShop,
  purchaseShopItem,
  getShopItemPrice,
  getRefreshCost,
} from '@/systems/economy';
import { generateShopItem } from '@/systems/item-gen';
import { getItemValue } from '@/systems/items';
import { formatAffixValue, formatAffixName } from '@/ui/item-format';
import {
  SHOP_SIZE,
  RARITY_COLORS,
  SELL_PRICE_RATIO,
  COLORS,
} from '@/data/constants';
import { UI_THEME, drawPanelShell, drawSectionCard, drawDivider, drawPillButton, type UiButtonState } from '@/ui/ui-theme';

// --- Layout constants ---

const PANEL_WIDTH  = 560;
const PANEL_HEIGHT = 392;

const SHOP_CARD_W  = 170;
const SHOP_CARD_H  = 86;
const SHOP_COLS    = 3;
const SHOP_GAP     = 10;

const MERCHANT_STAGING_SIZE = 6;
const STAGING_SLOT_SIZE = 52;
const STAGING_SLOT_GAP  = 6;

// Section Y offsets (relative to panelY)
const SEC_TITLE    = 12;
const SEC_SHOP_LBL = 40;
const SEC_SHOP_GRD = 64;
const SEC_DIV      = 260;
const SEC_SELL_LBL = 270;
const SEC_STAGING  = 294;
const SEC_SELL_BTN = 356;

const TOOLTIP_MARGIN = 10;

// InventoryPanel layout ref — used to position merchant left of inventory
const INV_PANEL_WIDTH  = 500;
const INV_PANEL_MARGIN = 12;

const RARITY_BORDER_COLORS: Record<Rarity, number> = {
  common:    0xb0b0b0,
  uncommon:  0x4ade80,
  rare:      0x60a5fa,
  epic:      0xc084fc,
  legendary: 0xfbbf24,
};

// --- Position helpers ---

function shopCardPos(index: number, panelX: number, panelY: number): { x: number; y: number } {
  const col = index % SHOP_COLS;
  const row = Math.floor(index / SHOP_COLS);
  const totalW = SHOP_COLS * SHOP_CARD_W + (SHOP_COLS - 1) * SHOP_GAP;
  const startX = panelX + (PANEL_WIDTH - totalW) / 2;
  return {
    x: startX + col * (SHOP_CARD_W + SHOP_GAP),
    y: panelY + SEC_SHOP_GRD + row * (SHOP_CARD_H + SHOP_GAP),
  };
}

function stagingSlotPos(index: number, panelX: number, panelY: number): { x: number; y: number } {
  const totalW = MERCHANT_STAGING_SIZE * STAGING_SLOT_SIZE + (MERCHANT_STAGING_SIZE - 1) * STAGING_SLOT_GAP;
  const startX = panelX + (PANEL_WIDTH - totalW) / 2;
  return {
    x: startX + index * (STAGING_SLOT_SIZE + STAGING_SLOT_GAP),
    y: panelY + SEC_STAGING,
  };
}

interface TooltipHandle {
  container: Phaser.GameObjects.Container;
}

// ============================================================================
// MerchantPanel
// ============================================================================

export class MerchantPanel extends Phaser.GameObjects.Container {
  // Persistent graphics/text (created once, repositioned on resize)
  private panelBg: Phaser.GameObjects.Graphics;
  private titleText: Phaser.GameObjects.Text;
  private goldText: Phaser.GameObjects.Text;
  private closeText: Phaser.GameObjects.Text;

  // Dynamic objects cleared and recreated on each refresh
  private dynamicGfx: Phaser.GameObjects.Graphics[] = [];
  private dynamicTexts: Phaser.GameObjects.Text[] = [];

  // Interactive zones (persistent)
  private shopItemZones: Phaser.GameObjects.Zone[] = [];
  private refreshZone!: Phaser.GameObjects.Zone;
  private stagingZones: Phaser.GameObjects.Zone[] = [];
  private sellAllZone!: Phaser.GameObjects.Zone;
  private closeZone!: Phaser.GameObjects.Zone;

  private tooltip: TooltipHandle | null = null;
  private hoveredShopIndex = -1;
  private hoveredStagingIndex = -1;
  private hoveredRefresh = false;
  private hoveredSellAll = false;
  private hoveredClose = false;

  private panelX: number;
  private panelY: number;

  // Merchant staging inventory
  private stagingInventory: (ItemInstance | null)[] = Array.from({ length: MERCHANT_STAGING_SIZE }, () => null);

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.setScrollFactor(0);
    this.setDepth(200);
    this.setVisible(false);

    this.panelX = this.computePanelX(scene.scale.width);
    this.panelY = Math.floor((scene.scale.height - PANEL_HEIGHT) / 2);

    // Background
    this.panelBg = scene.add.graphics();
    this.add(this.panelBg);

    // Title
    this.titleText = scene.add.text(0, 0, 'MERCHANT', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: UI_THEME.text,
      stroke: '#000000',
      strokeThickness: 2,
    });
    this.titleText.setOrigin(0.5, 0);
    this.add(this.titleText);

    // Gold display (right-aligned in title row)
    this.goldText = scene.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: COLORS.gold,
      stroke: '#000000',
      strokeThickness: 2,
    });
    this.goldText.setOrigin(1, 0);
    this.goldText.setVisible(false);
    this.add(this.goldText);

    this.closeText = scene.add.text(0, 0, 'X', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: UI_THEME.textDim,
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(0.5, 0.5);
    this.add(this.closeText);

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

    this.createShopItemZones();
    this.createRefreshZone();
    this.createStagingZones();
    this.createSellAllZone();

    on('ui:merchantToggle', this.toggle);
    on('economy:goldChanged', this.onGoldChanged);

    scene.scale.on('resize', this.onResize, this);
  }

  // --- Panel positioning ---

  private computePanelX(sceneWidth: number): number {
    return Math.floor((sceneWidth - PANEL_WIDTH) / 2);
  }

  // --- Shop tier ---

  private getShopTier(): number {
    const level = getPlayer().level;
    return Math.min(7, Math.max(1, Math.ceil(level / 14)));
  }

  // --- Zone creation ---

  private createShopItemZones(): void {
    for (let i = 0; i < SHOP_SIZE; i++) {
      const { x, y } = shopCardPos(i, this.panelX, this.panelY);
      const zone = this.scene.add.zone(
        x + SHOP_CARD_W / 2,
        y + SHOP_CARD_H / 2,
        SHOP_CARD_W,
        SHOP_CARD_H,
      );
      zone.setInteractive({ useHandCursor: true });

      const idx = i;
      zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (!pointer.rightButtonDown()) this.onShopItemClick(idx);
      });
      zone.on('pointerover', () => {
        this.hoveredShopIndex = idx;
        if (this.visible) this.refresh();
        this.showShopTooltip(idx);
      });
      zone.on('pointerout',  () => {
        if (this.hoveredShopIndex === idx) this.hoveredShopIndex = -1;
        if (this.visible) this.refresh();
        this.hideTooltip();
      });

      this.add(zone);
      this.shopItemZones.push(zone);
    }
  }

  private createRefreshZone(): void {
    this.refreshZone = this.scene.add.zone(0, 0, 120, 20);
    this.refreshZone.setInteractive({ useHandCursor: true });
    this.refreshZone.on('pointerdown', () => { this.onRefreshClick(); });
    this.refreshZone.on('pointerover', () => {
      this.hoveredRefresh = true;
      if (this.visible) this.refresh();
    });
    this.refreshZone.on('pointerout', () => {
      this.hoveredRefresh = false;
      if (this.visible) this.refresh();
    });
    this.add(this.refreshZone);
  }

  private createStagingZones(): void {
    for (let i = 0; i < MERCHANT_STAGING_SIZE; i++) {
      const { x, y } = stagingSlotPos(i, this.panelX, this.panelY);
      const zone = this.scene.add.zone(
        x + STAGING_SLOT_SIZE / 2,
        y + STAGING_SLOT_SIZE / 2,
        STAGING_SLOT_SIZE,
        STAGING_SLOT_SIZE,
      );
      zone.setInteractive({ useHandCursor: true });
      const idx = i;
      zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (pointer.rightButtonDown()) return;
        const item = this.stagingInventory[idx];
        if (!item) return;
        // Ctrl+click → quick-return to inventory
        if ((pointer.event as MouseEvent).ctrlKey) {
          emit('ui:inventoryQuickMove', { item, fromStagingIndex: idx });
          return;
        }
        // Drag: remove from staging immediately, then start drag
        this.stagingInventory[idx] = null;
        this.refresh();
        emit('ui:itemDragStart', { item, sourceIndex: idx, dragSource: 'staging' });
      });
      zone.on('pointerover', () => {
        this.hoveredStagingIndex = idx;
        if (this.visible) this.refresh();
        this.showStagingTooltip(idx);
      });
      zone.on('pointerout',  () => {
        if (this.hoveredStagingIndex === idx) this.hoveredStagingIndex = -1;
        if (this.visible) this.refresh();
        this.hideTooltip();
      });
      this.add(zone);
      this.stagingZones.push(zone);
    }
  }

  private createSellAllZone(): void {
    this.sellAllZone = this.scene.add.zone(0, 0, 120, 28);
    this.sellAllZone.setInteractive({ useHandCursor: true });
    this.sellAllZone.on('pointerdown', () => { this.onSellAllClick(); });
    this.sellAllZone.on('pointerover', () => {
      this.hoveredSellAll = true;
      if (this.visible) this.refresh();
    });
    this.sellAllZone.on('pointerout', () => {
      this.hoveredSellAll = false;
      if (this.visible) this.refresh();
    });
    this.add(this.sellAllZone);
  }

  // --- Zone repositioning on resize ---

  private repositionZones(): void {
    for (let i = 0; i < this.shopItemZones.length; i++) {
      const { x, y } = shopCardPos(i, this.panelX, this.panelY);
      this.shopItemZones[i].setPosition(x + SHOP_CARD_W / 2, y + SHOP_CARD_H / 2);
    }
    for (let i = 0; i < this.stagingZones.length; i++) {
      const { x, y } = stagingSlotPos(i, this.panelX, this.panelY);
      this.stagingZones[i].setPosition(x + STAGING_SLOT_SIZE / 2, y + STAGING_SLOT_SIZE / 2);
    }
    // refreshZone and sellAllZone are repositioned inside their draw calls
  }

  // --- Drawing ---

  private clearDynamic(): void {
    for (const gfx of this.dynamicGfx) { this.remove(gfx); gfx.destroy(); }
    for (const txt of this.dynamicTexts) { this.remove(txt); txt.destroy(); }
    this.dynamicGfx = [];
    this.dynamicTexts = [];
  }

  private drawPanelBackground(): void {
    const bg = this.panelBg;
    bg.clear();
    drawPanelShell(bg, this.panelX, this.panelY, PANEL_WIDTH, PANEL_HEIGHT, 10);
    drawSectionCard(bg, this.panelX + 12, this.panelY + 30, PANEL_WIDTH - 24, 222, false);
    drawSectionCard(bg, this.panelX + 12, this.panelY + SEC_DIV + 8, PANEL_WIDTH - 24, PANEL_HEIGHT - (SEC_DIV + 20), true);
    drawDivider(bg, this.panelX + 20, this.panelY + SEC_DIV, this.panelX + PANEL_WIDTH - 20, this.panelY + SEC_DIV);
  }

  private drawShopSection(): void {
    const state = getState();
    const player = getPlayer();

    // Section label
    const forSaleLabel = this.scene.add.text(
      this.panelX + 14,
      this.panelY + SEC_SHOP_LBL,
      'For Sale',
      { fontFamily: 'monospace', fontSize: '11px', color: UI_THEME.textDim },
    );
    forSaleLabel.setOrigin(0, 0);
    this.add(forSaleLabel);
    this.dynamicTexts.push(forSaleLabel);

    // Refresh button
    const refreshCost = getRefreshCost();
    const canAffordRefresh = player.gold >= refreshCost;
    const refreshButtonW = 142;
    const refreshButtonH = 20;
    const refreshButtonX = this.panelX + PANEL_WIDTH - 18 - refreshButtonW;
    const refreshButtonY = this.panelY + SEC_SHOP_LBL - 1;
    const refreshBtnGfx = this.scene.add.graphics();
    const refreshState: UiButtonState = !canAffordRefresh ? 'disabled' : this.hoveredRefresh ? 'hover' : 'default';
    drawPillButton(refreshBtnGfx, refreshButtonX, refreshButtonY, refreshButtonW, refreshButtonH, refreshState, { fill: 0x14532d, border: 0x22c55e });
    this.add(refreshBtnGfx);
    this.dynamicGfx.push(refreshBtnGfx);

    const refreshLabel = this.scene.add.text(
      refreshButtonX + refreshButtonW / 2,
      refreshButtonY + refreshButtonH / 2 + 1,
      `Refresh (${refreshCost}g)`,
      {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: canAffordRefresh ? UI_THEME.text : UI_THEME.textMuted,
      },
    ).setOrigin(0.5, 0.5);
    this.add(refreshLabel);
    this.dynamicTexts.push(refreshLabel);

    this.refreshZone.setSize(refreshButtonW, refreshButtonH);
    this.refreshZone.setPosition(
      refreshButtonX + refreshButtonW / 2,
      refreshButtonY + refreshButtonH / 2,
    );

    // Shop item cards
    for (let i = 0; i < SHOP_SIZE; i++) {
      const { x, y } = shopCardPos(i, this.panelX, this.panelY);
      const item = state.shopItems[i] as ItemInstance | undefined;

      const gfx = this.scene.add.graphics();
      this.add(gfx);
      this.dynamicGfx.push(gfx);

      if (item) {
        const price = getShopItemPrice(i);
        const canAfford = player.gold >= price;
        const isHovered = this.hoveredShopIndex === i;

        gfx.fillStyle(isHovered ? 0x25334b : 0x1e293b, 0.94);
        gfx.fillRoundedRect(x, y, SHOP_CARD_W, SHOP_CARD_H, 6);
        gfx.lineStyle(2, RARITY_BORDER_COLORS[item.rarity], 1);
        gfx.strokeRoundedRect(x, y, SHOP_CARD_W, SHOP_CARD_H, 6);

        const nameText = this.scene.add.text(x + 10, y + 8, item.name.substring(0, 18), {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: RARITY_COLORS[item.rarity],
          stroke: '#000000',
          strokeThickness: 1,
        });
        this.add(nameText);
        this.dynamicTexts.push(nameText);

        const slotText = this.scene.add.text(
          x + 10, y + 34,
          `${item.slot.charAt(0).toUpperCase() + item.slot.slice(1)}  |  iLvl ${item.itemLevel}  T${item.tier}`,
          { fontFamily: 'monospace', fontSize: '10px', color: COLORS.uiTextDim },
        );
        this.add(slotText);
        this.dynamicTexts.push(slotText);

        const priceText = this.scene.add.text(x + SHOP_CARD_W - 10, y + SHOP_CARD_H - 18, `${price}g`, {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: canAfford ? COLORS.gold : '#f87171',
        }).setOrigin(1, 0);
        this.add(priceText);
        this.dynamicTexts.push(priceText);
      } else {
        gfx.fillStyle(0x141414, 0.7);
        gfx.fillRoundedRect(x, y, SHOP_CARD_W, SHOP_CARD_H, 6);
        gfx.lineStyle(1, 0x333333, 0.5);
        gfx.strokeRoundedRect(x, y, SHOP_CARD_W, SHOP_CARD_H, 6);

        const soldText = this.scene.add.text(
          x + SHOP_CARD_W / 2, y + SHOP_CARD_H / 2, 'SOLD',
          { fontFamily: 'monospace', fontSize: '12px', color: '#444444' },
        );
        soldText.setOrigin(0.5, 0.5);
        this.add(soldText);
        this.dynamicTexts.push(soldText);
      }
    }
  }

  private drawStagingSection(): void {
    // Section label
    const sellLabel = this.scene.add.text(
      this.panelX + 14, this.panelY + SEC_SELL_LBL,
      'Staging',
      { fontFamily: 'monospace', fontSize: '11px', color: UI_THEME.textDim },
    );
    sellLabel.setOrigin(0, 0);
    this.add(sellLabel);
    this.dynamicTexts.push(sellLabel);

    // Draw 6 staging slots (same style as inventory)
    for (let i = 0; i < MERCHANT_STAGING_SIZE; i++) {
      const { x, y } = stagingSlotPos(i, this.panelX, this.panelY);
      const item = this.stagingInventory[i];
      const isHovered = this.hoveredStagingIndex === i;

      const gfx = this.scene.add.graphics();
      this.add(gfx);
      this.dynamicGfx.push(gfx);

      gfx.fillStyle(isHovered ? 0x243246 : 0x1a2333, 0.86);
      gfx.fillRoundedRect(x, y, STAGING_SLOT_SIZE, STAGING_SLOT_SIZE, 4);

      if (item) {
        gfx.lineStyle(2, RARITY_BORDER_COLORS[item.rarity], 1);
        gfx.strokeRoundedRect(x, y, STAGING_SLOT_SIZE, STAGING_SLOT_SIZE, 4);

        const nameText = this.scene.add.text(
          x + STAGING_SLOT_SIZE / 2,
          y + STAGING_SLOT_SIZE / 2,
          item.name.substring(0, 5),
          {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: RARITY_COLORS[item.rarity],
            stroke: '#000000',
            strokeThickness: 1,
          },
        );
        nameText.setOrigin(0.5, 0.5);
        this.add(nameText);
        this.dynamicTexts.push(nameText);
      } else {
        gfx.lineStyle(1, 0x2a2a2a, 0.6);
        gfx.strokeRoundedRect(x, y, STAGING_SLOT_SIZE, STAGING_SLOT_SIZE, 4);
      }
    }

    // SELL ALL button
    const hasItems = this.stagingInventory.some(Boolean);
    const totalValue = this.stagingInventory.reduce((sum, item) => {
      if (!item) return sum;
      return sum + Math.floor(getItemValue(item) * SELL_PRICE_RATIO);
    }, 0);

    const btnLabel = hasItems ? `[ SELL ALL: ${totalValue}g ]` : '[ SELL ALL ]';
    const btnColor = hasItems ? COLORS.gold : '#555555';

    const sellBtnW = 214;
    const sellBtnH = 26;
    const sellBtnX = this.panelX + PANEL_WIDTH / 2 - sellBtnW / 2;
    const sellBtnY = this.panelY + SEC_SELL_BTN - 2;
    const sellBtnGfx = this.scene.add.graphics();
    const sellBtnState: UiButtonState = !hasItems ? 'disabled' : this.hoveredSellAll ? 'hover' : 'default';
    drawPillButton(sellBtnGfx, sellBtnX, sellBtnY, sellBtnW, sellBtnH, sellBtnState, { fill: 0x854d0e, border: 0xf59e0b });
    this.add(sellBtnGfx);
    this.dynamicGfx.push(sellBtnGfx);

    const sellBtnText = this.scene.add.text(
      this.panelX + PANEL_WIDTH / 2,
      sellBtnY + sellBtnH / 2 + 1,
      btnLabel,
      {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: hasItems ? btnColor : UI_THEME.textMuted,
      },
    ).setOrigin(0.5, 0.5);
    this.add(sellBtnText);
    this.dynamicTexts.push(sellBtnText);

    this.sellAllZone.setPosition(
      this.panelX + PANEL_WIDTH / 2,
      sellBtnY + sellBtnH / 2,
    );
    this.sellAllZone.setSize(sellBtnW, sellBtnH);
  }

  // --- Interaction handlers ---

  private onShopItemClick(index: number): void {
    const player = getPlayer();
    const price = getShopItemPrice(index);
    if (price <= 0) return;
    if (isInventoryFull()) return;
    if (player.gold < price) return;

    const item = purchaseShopItem(index);
    if (item) {
      addToInventory(item);
      this.refresh();
    }
  }

  private onRefreshClick(): void {
    const success = refreshShop(this.getShopTier(), generateShopItem);
    if (success) this.refresh();
  }

  private onSellAllClick(): void {
    const hasItems = this.stagingInventory.some(Boolean);
    if (!hasItems) return;

    const player = getPlayer();
    let totalGold = 0;

    for (const item of this.stagingInventory) {
      if (!item) continue;
      const sellPrice = Math.floor(getItemValue(item) * SELL_PRICE_RATIO);
      player.gold += sellPrice;
      player.totalGoldEarned += sellPrice;
      totalGold += sellPrice;
      emit('item:sold', { item, gold: sellPrice });
    }

    if (totalGold > 0) {
      emit('economy:goldChanged', { amount: totalGold, total: player.gold });
    }

    this.stagingInventory.fill(null);
    this.refresh();
  }

  // --- Tooltips ---

  private showShopTooltip(index: number): void {
    const item = getState().shopItems[index] as ItemInstance | undefined;
    if (!item) return;

    const price = getShopItemPrice(index);
    const canAfford = getPlayer().gold >= price;
    const { x, y } = shopCardPos(index, this.panelX, this.panelY);

    this.showItemTooltip(item, x, y, SHOP_CARD_W, `Price: ${price}g`, canAfford ? COLORS.gold : '#f87171');
  }

  private showStagingTooltip(index: number): void {
    const item = this.stagingInventory[index];
    if (!item) return;

    const sellPrice = Math.floor(getItemValue(item) * SELL_PRICE_RATIO);
    const { x, y } = stagingSlotPos(index, this.panelX, this.panelY);
    this.showItemTooltip(item, x, y, STAGING_SLOT_SIZE, `Sell: ${sellPrice}g`, COLORS.gold);
  }

  private showItemTooltip(
    item: ItemInstance,
    slotX: number,
    slotY: number,
    slotW: number,
    priceLabel: string,
    priceColor: string,
  ): void {
    this.hideTooltip();

    const lines: { text: string; color: string; size: number }[] = [];

    lines.push({ text: item.name, color: RARITY_COLORS[item.rarity], size: 14 });

    const rarityLabel = item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1);
    lines.push({ text: `${rarityLabel} ${item.slot}`, color: COLORS.uiTextDim, size: 11 });
    lines.push({ text: `iLvl ${item.itemLevel}  Tier ${item.tier}`, color: COLORS.uiTextDim, size: 10 });
    lines.push({ text: '------------------', color: COLORS.uiTextDim, size: 8 });

    const sortedAffixes = [...item.affixes].sort((a, b) => (b.isPrefix ? 1 : 0) - (a.isPrefix ? 1 : 0));
    for (const affix of sortedAffixes) {
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
    lines.push({ text: priceLabel, color: priceColor, size: 12 });

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

    const sceneW = this.scene.scale.width;
    const sceneH = this.scene.scale.height;

    let finalX = slotX - tooltipWidth - TOOLTIP_MARGIN;
    if (finalX < 8) finalX = slotX + slotW + TOOLTIP_MARGIN;
    finalX = Math.min(finalX, sceneW - tooltipWidth - 8);

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

  // --- Public API (called by UIScene during drag) ---

  /** Returns the staging slot index under the given screen point, or null if no match */
  getStagingSlotAtPoint(px: number, py: number): number | null {
    if (!this.visible) return null;
    for (let i = 0; i < MERCHANT_STAGING_SIZE; i++) {
      const { x, y } = stagingSlotPos(i, this.panelX, this.panelY);
      if (px >= x && px <= x + STAGING_SLOT_SIZE && py >= y && py <= y + STAGING_SLOT_SIZE) {
        return i;
      }
    }
    return null;
  }

  /** Move an item into a staging slot. If slot is occupied the displaced item returns to inventory. */
  acceptStagingDrop(item: ItemInstance, slotIndex: number): void {
    const displaced = this.stagingInventory[slotIndex];
    if (displaced) {
      addToInventory(displaced);
      emit('player:statsChanged');
    }
    this.stagingInventory[slotIndex] = item;
    this.refresh();
  }

  /** First staging slot with no item, or null if all occupied */
  getFirstEmptyStagingSlot(): number | null {
    for (let i = 0; i < MERCHANT_STAGING_SIZE; i++) {
      if (!this.stagingInventory[i]) return i;
    }
    return null;
  }

  /** Remove item from staging without refreshing (caller must refresh) */
  removeFromStaging(slotIndex: number): void {
    this.stagingInventory[slotIndex] = null;
  }

  /** Restore an item to staging (called on drag cancel) */
  restoreToStaging(slotIndex: number, item: ItemInstance): void {
    this.stagingInventory[slotIndex] = item;
    this.refresh();
  }

  /** Remove all staged items and return them (called when merchant closes) */
  drainStaging(): ItemInstance[] {
    const items = this.stagingInventory.filter((item): item is ItemInstance => item !== null);
    this.stagingInventory.fill(null);
    return items;
  }

  // --- Public API ---

  refresh(): void {
    this.clearDynamic();
    this.drawPanelBackground();
    this.drawShopSection();
    this.drawStagingSection();
    this.updateGoldDisplay();
    this.updateCloseControl();

    this.titleText.setPosition(this.panelX + PANEL_WIDTH / 2, this.panelY + SEC_TITLE);
  }

  private updateGoldDisplay(): void {
    // Intentionally hidden in merchant panel; character panel already shows gold.
    this.goldText.setText('');
  }

  private updateCloseControl(): void {
    const x = this.panelX + PANEL_WIDTH - 18;
    const y = this.panelY + SEC_TITLE + 9;
    this.closeText.setPosition(x, y);
    this.closeText.setColor(this.hoveredClose ? '#fca5a5' : UI_THEME.textDim);
    this.closeZone.setPosition(x, y);
  }

  isPointOverPanel(px: number, py: number): boolean {
    return (
      px >= this.panelX && px <= this.panelX + PANEL_WIDTH &&
      py >= this.panelY && py <= this.panelY + PANEL_HEIGHT
    );
  }

  toggle = (): void => {
    const state = getState();
    state.merchantOpen = !state.merchantOpen;
    this.setVisible(state.merchantOpen);

    if (state.merchantOpen) {
      if (state.shopItems.length === 0) {
        generateShop(this.getShopTier(), generateShopItem);
      }
      this.refresh();
    } else {
      this.hideTooltip();
    }
  };

  private onGoldChanged = (): void => {
    if (this.visible) this.updateGoldDisplay();
  };

  private onResize = (gameSize: Phaser.Structs.Size): void => {
    this.panelX = this.computePanelX(gameSize.width);
    this.panelY = Math.floor((gameSize.height - PANEL_HEIGHT) / 2);
    this.repositionZones();
    this.updateCloseControl();
    if (this.visible) this.refresh();
  };

  destroy(fromScene?: boolean): void {
    off('ui:merchantToggle', this.toggle);
    off('economy:goldChanged', this.onGoldChanged);
    this.scene.scale.off('resize', this.onResize, this);
    this.hideTooltip();
    super.destroy(fromScene);
  }
}
