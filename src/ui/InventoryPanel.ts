// ============================================================================
// InventoryPanel — Full inventory + equipment panel (toggled with Tab or I)
// ============================================================================

import Phaser from 'phaser';
import type { ItemInstance, EquipmentSlot, Rarity } from '@/core/types';
import { getPlayer, getState, equipItem, removeFromInventory, addToInventory, unequipItem } from '@/core/game-state';
import { on, emit } from '@/core/event-bus';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  INVENTORY_SIZE,
  RARITY_COLORS,
  SELL_PRICE_RATIO,
  COLORS,
} from '@/data/constants';

const PANEL_WIDTH = 660;
const PANEL_HEIGHT = 460;
const SLOT_SIZE = 44;
const SLOT_GAP = 4;
const GRID_COLS = 6;
const GRID_ROWS = 4;
const EQUIP_SLOT_SIZE = 50;

/** Equipment slot layout positions (relative to equip area origin) */
const EQUIP_LAYOUT: Record<EquipmentSlot, { x: number; y: number; label: string }> = {
  weapon:    { x: 0,   y: 100, label: 'WPN' },
  helmet:    { x: 70,  y: 20,  label: 'HLM' },
  chest:     { x: 70,  y: 100, label: 'CHT' },
  gloves:    { x: 140, y: 100, label: 'GLV' },
  boots:     { x: 70,  y: 180, label: 'BTS' },
  accessory: { x: 140, y: 180, label: 'ACC' },
};

const RARITY_BORDER_COLORS: Record<Rarity, number> = {
  common: 0xb0b0b0,
  uncommon: 0x4ade80,
  rare: 0x60a5fa,
  epic: 0xc084fc,
  legendary: 0xfbbf24,
};

interface Tooltip {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  texts: Phaser.GameObjects.Text[];
}

export class InventoryPanel extends Phaser.GameObjects.Container {
  private panelBg: Phaser.GameObjects.Graphics;
  private equipArea: Phaser.GameObjects.Container;
  private inventoryArea: Phaser.GameObjects.Container;
  private goldText: Phaser.GameObjects.Text;
  private statsText: Phaser.GameObjects.Text;
  private titleText: Phaser.GameObjects.Text;
  private tooltip: Tooltip | null = null;
  private panelX: number;
  private panelY: number;

  // Interactive slot references for hit detection
  private equipSlotZones: Map<EquipmentSlot, Phaser.GameObjects.Zone> = new Map();
  private inventorySlotZones: Phaser.GameObjects.Zone[] = [];

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.setScrollFactor(0);
    this.setDepth(200);
    this.setVisible(false);

    // Center the panel
    this.panelX = ((scene.scale.width || GAME_WIDTH) - PANEL_WIDTH) / 2;
    this.panelY = ((scene.scale.height || GAME_HEIGHT) - PANEL_HEIGHT) / 2;

    // Panel background
    this.panelBg = scene.add.graphics();
    this.add(this.panelBg);

    // Title
    this.titleText = scene.add.text(
      this.panelX + PANEL_WIDTH / 2,
      this.panelY + 12,
      'INVENTORY',
      {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: COLORS.uiText,
        stroke: '#000000',
        strokeThickness: 2,
      }
    );
    this.titleText.setOrigin(0.5, 0);
    this.add(this.titleText);

    // Equipment area (left side)
    this.equipArea = scene.add.container(this.panelX + 20, this.panelY + 40);
    this.add(this.equipArea);

    // Inventory area (right side)
    this.inventoryArea = scene.add.container(this.panelX + 220, this.panelY + 40);
    this.add(this.inventoryArea);

    // Gold display
    this.goldText = scene.add.text(
      this.panelX + 20,
      this.panelY + PANEL_HEIGHT - 30,
      '',
      {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: COLORS.gold,
        stroke: '#000000',
        strokeThickness: 2,
      }
    );
    this.add(this.goldText);

    // Player stats summary (bottom right)
    this.statsText = scene.add.text(
      this.panelX + PANEL_WIDTH - 20,
      this.panelY + PANEL_HEIGHT - 100,
      '',
      {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: COLORS.uiText,
        stroke: '#000000',
        strokeThickness: 1,
        lineSpacing: 3,
      }
    );
    this.statsText.setOrigin(1, 0);
    this.add(this.statsText);

    // Create interactive zones for equipment slots
    this.createEquipmentSlots();

    // Create interactive zones for inventory grid
    this.createInventoryGrid();

    // Subscribe to inventory toggle event
    on('ui:inventoryToggle', this.toggle);

    // Handle resize
    scene.scale.on('resize', this.onResize, this);
  }

  private createEquipmentSlots(): void {
    const slots: EquipmentSlot[] = ['weapon', 'helmet', 'chest', 'gloves', 'boots', 'accessory'];

    for (const slot of slots) {
      const layout = EQUIP_LAYOUT[slot];
      const zone = this.scene.add.zone(
        layout.x + EQUIP_SLOT_SIZE / 2,
        layout.y + EQUIP_SLOT_SIZE / 2,
        EQUIP_SLOT_SIZE,
        EQUIP_SLOT_SIZE
      );
      zone.setInteractive({ useHandCursor: true });

      zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (pointer.rightButtonDown()) {
          this.onEquipSlotRightClick(slot);
        } else {
          this.onEquipSlotClick(slot);
        }
      });

      zone.on('pointerover', () => {
        this.showEquipTooltip(slot);
      });

      zone.on('pointerout', () => {
        this.hideTooltip();
      });

      this.equipArea.add(zone);
      this.equipSlotZones.set(slot, zone);
    }
  }

  private createInventoryGrid(): void {
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const x = col * (SLOT_SIZE + SLOT_GAP) + SLOT_SIZE / 2;
      const y = row * (SLOT_SIZE + SLOT_GAP) + SLOT_SIZE / 2;

      const zone = this.scene.add.zone(x, y, SLOT_SIZE, SLOT_SIZE);
      zone.setInteractive({ useHandCursor: true });

      const index = i;
      zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (pointer.rightButtonDown()) {
          this.onInventorySlotRightClick(index);
        } else {
          this.onInventorySlotClick(index);
        }
      });

      zone.on('pointerover', () => {
        this.showInventoryTooltip(index);
      });

      zone.on('pointerout', () => {
        this.hideTooltip();
      });

      this.inventoryArea.add(zone);
      this.inventorySlotZones.push(zone);
    }
  }

  private drawPanelBackground(): void {
    this.panelBg.clear();

    // Semi-transparent dark background
    this.panelBg.fillStyle(0x111111, 0.92);
    this.panelBg.fillRoundedRect(this.panelX, this.panelY, PANEL_WIDTH, PANEL_HEIGHT, 8);

    // Border
    this.panelBg.lineStyle(2, 0x555555, 0.8);
    this.panelBg.strokeRoundedRect(this.panelX, this.panelY, PANEL_WIDTH, PANEL_HEIGHT, 8);

    // Divider line between equip and inventory areas
    this.panelBg.lineStyle(1, 0x333333, 0.6);
    this.panelBg.beginPath();
    this.panelBg.moveTo(this.panelX + 210, this.panelY + 35);
    this.panelBg.lineTo(this.panelX + 210, this.panelY + PANEL_HEIGHT - 15);
    this.panelBg.strokePath();
  }

  private drawEquipmentSlots(): void {
    const player = getPlayer();

    // Clear previous equipment slot graphics (children of equipArea that are Graphics)
    const toRemove: Phaser.GameObjects.GameObject[] = [];
    this.equipArea.each((child: Phaser.GameObjects.GameObject) => {
      if (child instanceof Phaser.GameObjects.Graphics || child instanceof Phaser.GameObjects.Text) {
        toRemove.push(child);
      }
    });
    for (const child of toRemove) {
      child.destroy();
      this.equipArea.remove(child);
    }

    const slots: EquipmentSlot[] = ['weapon', 'helmet', 'chest', 'gloves', 'boots', 'accessory'];

    for (const slot of slots) {
      const layout = EQUIP_LAYOUT[slot];
      const item = player.equipment[slot];

      const gfx = this.scene.add.graphics();

      // Slot background
      gfx.fillStyle(0x222222, 0.8);
      gfx.fillRoundedRect(layout.x, layout.y, EQUIP_SLOT_SIZE, EQUIP_SLOT_SIZE, 3);

      if (item) {
        // Rarity-colored border
        const rarityColor = RARITY_BORDER_COLORS[item.rarity];
        gfx.lineStyle(2, rarityColor, 1);
        gfx.strokeRoundedRect(layout.x, layout.y, EQUIP_SLOT_SIZE, EQUIP_SLOT_SIZE, 3);

        // Item name (truncated)
        const nameText = this.scene.add.text(
          layout.x + EQUIP_SLOT_SIZE / 2,
          layout.y + EQUIP_SLOT_SIZE / 2,
          item.name.substring(0, 4),
          {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: RARITY_COLORS[item.rarity],
            stroke: '#000000',
            strokeThickness: 1,
          }
        );
        nameText.setOrigin(0.5, 0.5);
        this.equipArea.add(nameText);
      } else {
        // Empty slot border
        gfx.lineStyle(1, 0x444444, 0.5);
        gfx.strokeRoundedRect(layout.x, layout.y, EQUIP_SLOT_SIZE, EQUIP_SLOT_SIZE, 3);

        // Slot label
        const labelText = this.scene.add.text(
          layout.x + EQUIP_SLOT_SIZE / 2,
          layout.y + EQUIP_SLOT_SIZE / 2,
          layout.label,
          {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: COLORS.uiTextDim,
          }
        );
        labelText.setOrigin(0.5, 0.5);
        this.equipArea.add(labelText);
      }

      this.equipArea.add(gfx);
    }
  }

  private drawInventoryGrid(): void {
    const player = getPlayer();

    // Clear previous inventory graphics
    const toRemove: Phaser.GameObjects.GameObject[] = [];
    this.inventoryArea.each((child: Phaser.GameObjects.GameObject) => {
      if (child instanceof Phaser.GameObjects.Graphics || child instanceof Phaser.GameObjects.Text) {
        toRemove.push(child);
      }
    });
    for (const child of toRemove) {
      child.destroy();
      this.inventoryArea.remove(child);
    }

    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const x = col * (SLOT_SIZE + SLOT_GAP);
      const y = row * (SLOT_SIZE + SLOT_GAP);

      const gfx = this.scene.add.graphics();
      const item = player.inventory[i] as ItemInstance | undefined;

      // Slot background
      gfx.fillStyle(0x1a1a1a, 0.8);
      gfx.fillRoundedRect(x, y, SLOT_SIZE, SLOT_SIZE, 2);

      if (item) {
        // Rarity-colored border
        const rarityColor = RARITY_BORDER_COLORS[item.rarity];
        gfx.lineStyle(2, rarityColor, 1);
        gfx.strokeRoundedRect(x, y, SLOT_SIZE, SLOT_SIZE, 2);

        // Item name (truncated)
        const nameText = this.scene.add.text(
          x + SLOT_SIZE / 2,
          y + SLOT_SIZE / 2,
          item.name.substring(0, 4),
          {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: RARITY_COLORS[item.rarity],
            stroke: '#000000',
            strokeThickness: 1,
          }
        );
        nameText.setOrigin(0.5, 0.5);
        this.inventoryArea.add(nameText);
      } else {
        gfx.lineStyle(1, 0x333333, 0.3);
        gfx.strokeRoundedRect(x, y, SLOT_SIZE, SLOT_SIZE, 2);
      }

      this.inventoryArea.add(gfx);
    }

    // Inventory label
    const invLabel = this.scene.add.text(0, -18, 'Backpack', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: COLORS.uiTextDim,
    });
    this.inventoryArea.add(invLabel);
  }

  private updateStats(): void {
    const player = getPlayer();
    this.statsText.setText(
      `ATK: ${player.attack}\n` +
      `DEF: ${player.defense}\n` +
      `MGK: ${player.magicPower}\n` +
      `CRT: ${(player.critChance * 100).toFixed(1)}%\n` +
      `CDM: ${(player.critDamage * 100).toFixed(0)}%\n` +
      `SPD: ${player.moveSpeed}\n` +
      `ASP: ${player.attackSpeed.toFixed(2)}`
    );
    this.statsText.setPosition(
      this.panelX + PANEL_WIDTH - 20,
      this.panelY + PANEL_HEIGHT - 110
    );
  }

  private onEquipSlotClick(slot: EquipmentSlot): void {
    const player = getPlayer();
    const equippedItem = player.equipment[slot];

    if (equippedItem) {
      // Unequip: move to inventory
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
    this.refresh();
  }

  private onEquipSlotRightClick(_slot: EquipmentSlot): void {
    // Right-click on equipment: could sell or provide additional options
    // For now, same as left click (unequip)
  }

  private onInventorySlotClick(index: number): void {
    const player = getPlayer();
    const item = player.inventory[index];
    if (!item) return;

    // Click to equip
    const previousItem = equipItem(item);
    // Remove from inventory
    removeFromInventory(item.id);

    // If there was a previous item in the slot, put it in inventory
    if (previousItem) {
      addToInventory(previousItem);
    }

    emit('item:equipped', { item, slot: item.slot });
    emit('player:statsChanged');
    this.refresh();
  }

  private onInventorySlotRightClick(index: number): void {
    const player = getPlayer();
    const item = player.inventory[index];
    if (!item) return;

    // Right-click to sell
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

  private showEquipTooltip(slot: EquipmentSlot): void {
    const player = getPlayer();
    const item = player.equipment[slot];
    if (!item) return;
    this.showItemTooltip(item, EQUIP_LAYOUT[slot].x + EQUIP_SLOT_SIZE + 10 + this.panelX + 20, EQUIP_LAYOUT[slot].y + this.panelY + 40);
  }

  private showInventoryTooltip(index: number): void {
    const player = getPlayer();
    const item = player.inventory[index] as ItemInstance | undefined;
    if (!item) return;

    const col = index % GRID_COLS;
    const row = Math.floor(index / GRID_COLS);
    const x = this.panelX + 220 + col * (SLOT_SIZE + SLOT_GAP) + SLOT_SIZE + 10;
    const y = this.panelY + 40 + row * (SLOT_SIZE + SLOT_GAP);

    this.showItemTooltip(item, x, y);
  }

  private showItemTooltip(item: ItemInstance, x: number, y: number): void {
    this.hideTooltip();

    const container = this.scene.add.container(x, y);
    container.setDepth(250);
    container.setScrollFactor(0);

    const bg = this.scene.add.graphics();
    const texts: Phaser.GameObjects.Text[] = [];

    // Build tooltip lines
    const lines: { text: string; color: string; size: number }[] = [];

    // Item name in rarity color
    lines.push({
      text: item.name,
      color: RARITY_COLORS[item.rarity],
      size: 15,
    });

    // Rarity and slot
    lines.push({
      text: `${item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1)} ${item.slot}`,
      color: COLORS.uiTextDim,
      size: 12,
    });

    // Item level
    lines.push({
      text: `iLvl ${item.itemLevel}  Tier ${item.tier}`,
      color: COLORS.uiTextDim,
      size: 10,
    });

    // Separator
    lines.push({ text: '---', color: COLORS.uiTextDim, size: 8 });

    // Affixes
    for (const affix of item.affixes) {
      lines.push({
        text: `${affix.isPrefix ? '+' : ''}${affix.value} ${affix.id.replace(/_/g, ' ')}`,
        color: '#cccccc',
        size: 12,
      });
    }

    // Legendary effect
    if (item.legendaryEffect) {
      lines.push({ text: '---', color: COLORS.uiTextDim, size: 8 });
      lines.push({
        text: item.legendaryEffect,
        color: RARITY_COLORS.legendary,
        size: 12,
      });
    }

    // Crafting info
    if (item.isImbued || item.temperLevel > 0 || item.reforgeCount > 0) {
      lines.push({ text: '---', color: COLORS.uiTextDim, size: 8 });
      if (item.isImbued) {
        lines.push({ text: 'Imbued', color: '#a855f7', size: 9 });
      }
      if (item.temperLevel > 0) {
        lines.push({
          text: `Tempered +${item.temperLevel}`,
          color: '#f97316',
          size: 9,
        });
      }
    }

    // Render text lines
    let lineY = 8;
    let maxWidth = 0;
    for (const line of lines) {
      const text = this.scene.add.text(8, lineY, line.text, {
        fontFamily: 'monospace',
        fontSize: `${line.size}px`,
        color: line.color,
      });
      texts.push(text);
      container.add(text);
      maxWidth = Math.max(maxWidth, text.width);
      lineY += text.height + 3;
    }

    // Draw background
    const tooltipWidth = maxWidth + 16;
    const tooltipHeight = lineY + 8;
    bg.fillStyle(0x111111, 0.95);
    bg.fillRoundedRect(0, 0, tooltipWidth, tooltipHeight, 4);
    bg.lineStyle(1, 0x555555, 0.8);
    bg.strokeRoundedRect(0, 0, tooltipWidth, tooltipHeight, 4);
    container.addAt(bg, 0);

    this.add(container);
    this.tooltip = { container, bg, texts };
  }

  private hideTooltip(): void {
    if (this.tooltip) {
      for (const text of this.tooltip.texts) text.destroy();
      this.tooltip.bg.destroy();
      this.tooltip.container.destroy();
      this.tooltip = null;
    }
  }

  /** Refresh the visual state of the panel */
  refresh(): void {
    this.drawPanelBackground();
    this.drawEquipmentSlots();
    this.drawInventoryGrid();
    this.updateGoldDisplay();
    this.updateStats();
  }

  private updateGoldDisplay(): void {
    const player = getPlayer();
    this.goldText.setText(`Gold: ${player.gold}`);
    this.goldText.setPosition(this.panelX + 20, this.panelY + PANEL_HEIGHT - 30);
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

  private onResize = (gameSize: Phaser.Structs.Size): void => {
    this.panelX = (gameSize.width - PANEL_WIDTH) / 2;
    this.panelY = (gameSize.height - PANEL_HEIGHT) / 2;

    if (this.visible) {
      this.refresh();
    }
  };

  update(_dt: number): void {
    // Only update when visible
    if (!this.visible) return;

    // Refresh gold in case it changed
    this.updateGoldDisplay();
  }
}
