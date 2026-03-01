// ============================================================================
// MerchantPanel — Centered merchant UI for browsing/buying shop items
// and selling inventory items. Event-driven, no per-frame update required.
// ============================================================================

import Phaser from 'phaser';
import type { ItemInstance, Rarity } from '@/core/types';
import { getPlayer, getState, addToInventory } from '@/core/game-state';
import { on, off } from '@/core/event-bus';
import {
  generateShop,
  refreshShop,
  purchaseShopItem,
  getShopItemPrice,
  getRefreshCost,
} from '@/systems/economy';
import { generateShopItem } from '@/systems/item-gen';
import { sellItem, getItemValue } from '@/systems/items';
import { formatAffixValue, formatAffixName } from '@/ui/item-format';
import {
  INVENTORY_SIZE,
  SHOP_SIZE,
  RARITY_COLORS,
  SELL_PRICE_RATIO,
  COLORS,
} from '@/data/constants';

// --- Layout constants ---

const PANEL_WIDTH  = 540;
const PANEL_HEIGHT = 510;

const SHOP_CARD_W  = 160;
const SHOP_CARD_H  = 75;
const SHOP_COLS    = 3;
const SHOP_GAP     = 8;

const INV_SLOT     = 40;
const INV_GAP      = 4;
const INV_COLS     = 6;

// Section Y offsets (relative to panelY)
const SEC_TITLE    = 10;   // "MERCHANT" heading
const SEC_SHOP_LBL = 36;   // "── For Sale ──" + [Refresh Xg]
const SEC_SHOP_GRD = 56;   // 2×3 shop cards
const SEC_DIV      = 222;  // horizontal divider
const SEC_INV_LBL  = 230;  // "── Your Items ──"
const SEC_INV_GRD  = 248;  // 4×6 inventory grid
const SEC_HINT     = 428;  // hint text
const SEC_GOLD     = 452;  // gold display

const TOOLTIP_MARGIN = 10;

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

function invSlotPos(index: number, panelX: number, panelY: number): { x: number; y: number } {
  const col = index % INV_COLS;
  const row = Math.floor(index / INV_COLS);
  const totalW = INV_COLS * INV_SLOT + (INV_COLS - 1) * INV_GAP;
  const startX = panelX + (PANEL_WIDTH - totalW) / 2;
  return {
    x: startX + col * (INV_SLOT + INV_GAP),
    y: panelY + SEC_INV_GRD + row * (INV_SLOT + INV_GAP),
  };
}

interface TooltipHandle {
  container: Phaser.GameObjects.Container;
}

// ============================================================================
// MerchantPanel
// ============================================================================

export class MerchantPanel extends Phaser.GameObjects.Container {
  // Persistent objects (created once)
  private panelBg: Phaser.GameObjects.Graphics;
  private titleText: Phaser.GameObjects.Text;
  private goldText: Phaser.GameObjects.Text;
  private hintText: Phaser.GameObjects.Text;

  // Dynamic objects cleared and recreated on each refresh
  private dynamicGfx: Phaser.GameObjects.Graphics[] = [];
  private dynamicTexts: Phaser.GameObjects.Text[] = [];

  // Interactive zones (persistent, repositioned on resize)
  private shopItemZones: Phaser.GameObjects.Zone[] = [];
  private inventorySlotZones: Phaser.GameObjects.Zone[] = [];
  private refreshZone!: Phaser.GameObjects.Zone;

  private tooltip: TooltipHandle | null = null;

  private panelX: number;
  private panelY: number;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.setScrollFactor(0);
    this.setDepth(200);
    this.setVisible(false);

    this.panelX = (scene.scale.width  - PANEL_WIDTH)  / 2;
    this.panelY = (scene.scale.height - PANEL_HEIGHT) / 2;

    // Background
    this.panelBg = scene.add.graphics();
    this.add(this.panelBg);

    // Title
    this.titleText = scene.add.text(0, 0, 'MERCHANT', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: COLORS.uiText,
      stroke: '#000000',
      strokeThickness: 2,
    });
    this.titleText.setOrigin(0.5, 0);
    this.add(this.titleText);

    // Gold display
    this.goldText = scene.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: COLORS.gold,
      stroke: '#000000',
      strokeThickness: 2,
    });
    this.goldText.setOrigin(0, 0);
    this.add(this.goldText);

    // Hint
    this.hintText = scene.add.text(0, 0, 'Right-click item to sell', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: COLORS.uiTextDim,
    });
    this.hintText.setOrigin(0.5, 0);
    this.add(this.hintText);

    this.createShopItemZones();
    this.createInventoryZones();
    this.createRefreshZone();

    on('ui:merchantToggle', this.toggle);
    on('economy:goldChanged', this.onGoldChanged);

    scene.scale.on('resize', this.onResize, this);
  }

  // --- Shop tier mapping ---

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
      zone.on('pointerover', () => { this.showShopTooltip(idx); });
      zone.on('pointerout',  () => { this.hideTooltip(); });

      this.add(zone);
      this.shopItemZones.push(zone);
    }
  }

  private createInventoryZones(): void {
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const { x, y } = invSlotPos(i, this.panelX, this.panelY);
      const zone = this.scene.add.zone(
        x + INV_SLOT / 2,
        y + INV_SLOT / 2,
        INV_SLOT,
        INV_SLOT,
      );
      zone.setInteractive({ useHandCursor: true });

      const idx = i;
      zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (pointer.rightButtonDown()) this.onInventoryRightClick(idx);
      });
      zone.on('pointerover', () => { this.showInventoryTooltip(idx); });
      zone.on('pointerout',  () => { this.hideTooltip(); });

      this.add(zone);
      this.inventorySlotZones.push(zone);
    }
  }

  private createRefreshZone(): void {
    this.refreshZone = this.scene.add.zone(0, 0, 120, 20);
    this.refreshZone.setInteractive({ useHandCursor: true });
    this.refreshZone.on('pointerdown', () => { this.onRefreshClick(); });
    this.add(this.refreshZone);
  }

  // --- Zone repositioning on resize ---

  private repositionZones(): void {
    for (let i = 0; i < this.shopItemZones.length; i++) {
      const { x, y } = shopCardPos(i, this.panelX, this.panelY);
      this.shopItemZones[i].setPosition(x + SHOP_CARD_W / 2, y + SHOP_CARD_H / 2);
    }
    for (let i = 0; i < this.inventorySlotZones.length; i++) {
      const { x, y } = invSlotPos(i, this.panelX, this.panelY);
      this.inventorySlotZones[i].setPosition(x + INV_SLOT / 2, y + INV_SLOT / 2);
    }
    // refreshZone is repositioned in drawShopSection()
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

    bg.fillStyle(0x111111, 0.93);
    bg.fillRoundedRect(this.panelX, this.panelY, PANEL_WIDTH, PANEL_HEIGHT, 8);

    bg.lineStyle(2, 0x555555, 0.8);
    bg.strokeRoundedRect(this.panelX, this.panelY, PANEL_WIDTH, PANEL_HEIGHT, 8);

    // Divider between shop and inventory sections
    bg.lineStyle(1, 0x333333, 0.7);
    bg.beginPath();
    bg.moveTo(this.panelX + 12, this.panelY + SEC_DIV);
    bg.lineTo(this.panelX + PANEL_WIDTH - 12, this.panelY + SEC_DIV);
    bg.strokePath();
  }

  private drawShopSection(): void {
    const state = getState();
    const player = getPlayer();

    // Section label
    const forSaleLabel = this.scene.add.text(
      this.panelX + 14,
      this.panelY + SEC_SHOP_LBL,
      '── For Sale ──',
      { fontFamily: 'monospace', fontSize: '11px', color: COLORS.uiTextDim },
    );
    forSaleLabel.setOrigin(0, 0);
    this.add(forSaleLabel);
    this.dynamicTexts.push(forSaleLabel);

    // Refresh button text
    const refreshCost    = getRefreshCost();
    const canAffordRefresh = player.gold >= refreshCost;
    const refreshLabel   = this.scene.add.text(
      this.panelX + PANEL_WIDTH - 14,
      this.panelY + SEC_SHOP_LBL,
      `[Refresh ${refreshCost}g]`,
      {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: canAffordRefresh ? COLORS.gold : COLORS.uiTextDim,
      },
    );
    refreshLabel.setOrigin(1, 0);
    this.add(refreshLabel);
    this.dynamicTexts.push(refreshLabel);

    // Reposition refresh interactive zone to match the text
    this.refreshZone.setSize(refreshLabel.width + 8, refreshLabel.height + 4);
    this.refreshZone.setPosition(
      this.panelX + PANEL_WIDTH - 14 - refreshLabel.width / 2,
      this.panelY + SEC_SHOP_LBL + refreshLabel.height / 2,
    );

    // Shop item cards
    for (let i = 0; i < SHOP_SIZE; i++) {
      const { x, y } = shopCardPos(i, this.panelX, this.panelY);
      const item = state.shopItems[i] as ItemInstance | undefined;

      const gfx = this.scene.add.graphics();
      this.add(gfx);
      this.dynamicGfx.push(gfx);

      if (item) {
        const price     = getShopItemPrice(i);
        const canAfford = player.gold >= price;

        gfx.fillStyle(0x1e1e1e, 0.9);
        gfx.fillRoundedRect(x, y, SHOP_CARD_W, SHOP_CARD_H, 4);
        gfx.lineStyle(2, RARITY_BORDER_COLORS[item.rarity], 1);
        gfx.strokeRoundedRect(x, y, SHOP_CARD_W, SHOP_CARD_H, 4);

        // Item name
        const nameText = this.scene.add.text(
          x + 6, y + 6,
          item.name.substring(0, 14),
          {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: RARITY_COLORS[item.rarity],
            stroke: '#000000',
            strokeThickness: 1,
          },
        );
        this.add(nameText);
        this.dynamicTexts.push(nameText);

        // Slot label
        const slotText = this.scene.add.text(
          x + 6, y + 26,
          item.slot.charAt(0).toUpperCase() + item.slot.slice(1),
          { fontFamily: 'monospace', fontSize: '10px', color: COLORS.uiTextDim },
        );
        this.add(slotText);
        this.dynamicTexts.push(slotText);

        // Price
        const priceText = this.scene.add.text(
          x + 6, y + SHOP_CARD_H - 18,
          `${price}g`,
          {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: canAfford ? COLORS.gold : '#f87171',
          },
        );
        this.add(priceText);
        this.dynamicTexts.push(priceText);
      } else {
        // Empty / sold slot
        gfx.fillStyle(0x141414, 0.7);
        gfx.fillRoundedRect(x, y, SHOP_CARD_W, SHOP_CARD_H, 4);
        gfx.lineStyle(1, 0x333333, 0.5);
        gfx.strokeRoundedRect(x, y, SHOP_CARD_W, SHOP_CARD_H, 4);

        const soldText = this.scene.add.text(
          x + SHOP_CARD_W / 2,
          y + SHOP_CARD_H / 2,
          'SOLD',
          { fontFamily: 'monospace', fontSize: '12px', color: '#444444' },
        );
        soldText.setOrigin(0.5, 0.5);
        this.add(soldText);
        this.dynamicTexts.push(soldText);
      }
    }
  }

  private drawInventorySection(): void {
    const player = getPlayer();

    // Section label
    const invLabel = this.scene.add.text(
      this.panelX + PANEL_WIDTH / 2,
      this.panelY + SEC_INV_LBL,
      '── Your Items ──',
      { fontFamily: 'monospace', fontSize: '11px', color: COLORS.uiTextDim },
    );
    invLabel.setOrigin(0.5, 0);
    this.add(invLabel);
    this.dynamicTexts.push(invLabel);

    // Inventory grid
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const { x, y } = invSlotPos(i, this.panelX, this.panelY);
      const item = player.inventory[i] as ItemInstance | undefined;

      const gfx = this.scene.add.graphics();
      this.add(gfx);
      this.dynamicGfx.push(gfx);

      gfx.fillStyle(0x1a1a1a, 0.8);
      gfx.fillRoundedRect(x, y, INV_SLOT, INV_SLOT, 2);

      if (item) {
        gfx.lineStyle(2, RARITY_BORDER_COLORS[item.rarity], 1);
        gfx.strokeRoundedRect(x, y, INV_SLOT, INV_SLOT, 2);

        const nameText = this.scene.add.text(
          x + INV_SLOT / 2,
          y + INV_SLOT / 2,
          item.name.substring(0, 4),
          {
            fontFamily: 'monospace',
            fontSize: '10px',
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
        gfx.strokeRoundedRect(x, y, INV_SLOT, INV_SLOT, 2);
      }
    }
  }

  // --- Interaction handlers ---

  private onShopItemClick(index: number): void {
    const player = getPlayer();
    const price = getShopItemPrice(index);

    if (price <= 0) return; // empty slot

    if (player.inventory.length >= INVENTORY_SIZE) {
      this.hintText.setText('Inventory full!');
      this.scene.time.delayedCall(2000, () => {
        if (this.visible) this.hintText.setText('Right-click item to sell');
      });
      return;
    }

    if (player.gold < price) return;

    const item = purchaseShopItem(index);
    if (item) {
      addToInventory(item);
      this.refresh();
    }
  }

  private onInventoryRightClick(index: number): void {
    const player = getPlayer();
    const item = player.inventory[index];
    if (!item) return;

    sellItem(item.id);
    this.hideTooltip();
    this.refresh();
  }

  private onRefreshClick(): void {
    const success = refreshShop(this.getShopTier(), generateShopItem);
    if (success) this.refresh();
  }

  // --- Tooltips ---

  private showShopTooltip(index: number): void {
    const item = getState().shopItems[index] as ItemInstance | undefined;
    if (!item) return;

    const price     = getShopItemPrice(index);
    const canAfford = getPlayer().gold >= price;
    const { x, y }  = shopCardPos(index, this.panelX, this.panelY);

    this.showItemTooltip(item, x, y, SHOP_CARD_W, `Price: ${price}g`, canAfford ? COLORS.gold : '#f87171');
  }

  private showInventoryTooltip(index: number): void {
    const item = getPlayer().inventory[index] as ItemInstance | undefined;
    if (!item) return;

    const sellPrice = Math.floor(getItemValue(item) * SELL_PRICE_RATIO);
    const { x, y }  = invSlotPos(index, this.panelX, this.panelY);

    this.showItemTooltip(item, x, y, INV_SLOT, `Sell: ${sellPrice}g`, COLORS.gold);
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
    lines.push({ text: '──────────────────', color: COLORS.uiTextDim, size: 8 });

    const sortedAffixes = [...item.affixes].sort((a, b) => (b.isPrefix ? 1 : 0) - (a.isPrefix ? 1 : 0));
    for (const affix of sortedAffixes) {
      lines.push({
        text: `${formatAffixValue(affix.id, affix.value)} ${formatAffixName(affix.id)}`,
        color: '#cccccc',
        size: 12,
      });
    }

    if (item.legendaryEffect) {
      lines.push({ text: '──────────────────', color: COLORS.uiTextDim, size: 8 });
      lines.push({ text: item.legendaryEffect, color: RARITY_COLORS.legendary, size: 11 });
    }

    lines.push({ text: '──────────────────', color: COLORS.uiTextDim, size: 8 });
    lines.push({ text: priceLabel, color: priceColor, size: 12 });

    const container = this.scene.add.container(0, 0);
    container.setScrollFactor(0);
    container.setDepth(250);

    const bg = this.scene.add.graphics();
    container.add(bg);

    let lineY   = 8;
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

    // Try left side first; fall back to right side if not enough room
    const sceneW = this.scene.scale.width;
    const sceneH = this.scene.scale.height;

    let finalX = slotX - tooltipWidth - TOOLTIP_MARGIN;
    if (finalX < 8) {
      finalX = slotX + slotW + TOOLTIP_MARGIN;
    }
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

  // --- Public API ---

  refresh(): void {
    this.clearDynamic();
    this.drawPanelBackground();
    this.drawShopSection();
    this.drawInventorySection();
    this.updateGoldDisplay();

    this.titleText.setPosition(
      this.panelX + PANEL_WIDTH / 2,
      this.panelY + SEC_TITLE,
    );
    this.hintText.setPosition(
      this.panelX + PANEL_WIDTH / 2,
      this.panelY + SEC_HINT,
    );
    // Don't overwrite a "Inventory full!" message that's still showing
    if (this.hintText.text !== 'Inventory full!') {
      this.hintText.setText('Right-click item to sell');
    }
  }

  private updateGoldDisplay(): void {
    this.goldText.setText(`Gold: ${getPlayer().gold}`);
    this.goldText.setPosition(this.panelX + 14, this.panelY + SEC_GOLD);
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
    this.panelX = (gameSize.width  - PANEL_WIDTH)  / 2;
    this.panelY = (gameSize.height - PANEL_HEIGHT) / 2;
    this.repositionZones();
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
