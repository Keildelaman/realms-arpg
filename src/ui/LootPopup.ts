// ============================================================================
// LootPopup — Brief popup when item is picked up
// ============================================================================

import Phaser from 'phaser';
import type { ItemInstance } from '@/core/types';
import { on } from '@/core/event-bus';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  RARITY_COLORS,
  COLORS,
} from '@/data/constants';

const POPUP_WIDTH = 220;
const POPUP_HEIGHT = 70;
const POPUP_MARGIN = 16;
const POPUP_LIFETIME = 3.0;
const SLIDE_DURATION = 200; // ms for slide-in animation
const FADE_START = 2.2; // start fading at this lifetime

interface LootPopupDisplay {
  container: Phaser.GameObjects.Container;
  lifetime: number;
  targetY: number;
}

export class LootPopupManager {
  private scene: Phaser.Scene;
  private popups: LootPopupDisplay[] = [];
  private baseX: number;
  private baseY: number;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.baseX = (scene.scale.width || GAME_WIDTH) - POPUP_WIDTH - POPUP_MARGIN;
    this.baseY = 180; // Below minimap area

    // Subscribe to item pickup events
    on('item:pickedUp', this.onItemPickedUp);

    // Handle resize
    scene.scale.on('resize', this.onResize);
  }

  private onResize = (gameSize: Phaser.Structs.Size): void => {
    this.baseX = gameSize.width - POPUP_WIDTH - POPUP_MARGIN;
  };

  private onItemPickedUp = (data: { item: ItemInstance }): void => {
    this.spawn(data.item);
  };

  /**
   * Create a new loot popup card.
   */
  spawn(item: ItemInstance): void {
    // Push existing popups down
    for (const popup of this.popups) {
      popup.targetY += POPUP_HEIGHT + 6;
    }

    const container = this.scene.add.container(
      this.baseX + POPUP_WIDTH + 20, // Start off-screen to the right
      this.baseY
    );
    container.setScrollFactor(0);
    container.setDepth(150);

    // Background
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x111111, 0.9);
    bg.fillRoundedRect(0, 0, POPUP_WIDTH, POPUP_HEIGHT, 5);

    // Rarity-colored left border accent
    const rarityColorHex = RARITY_COLORS[item.rarity];
    const rarityColor = Phaser.Display.Color.HexStringToColor(rarityColorHex).color;
    bg.fillStyle(rarityColor, 1);
    bg.fillRect(0, 0, 4, POPUP_HEIGHT);

    // Border
    bg.lineStyle(1, 0x444444, 0.6);
    bg.strokeRoundedRect(0, 0, POPUP_WIDTH, POPUP_HEIGHT, 5);

    container.add(bg);

    // Item name in rarity color
    const nameText = this.scene.add.text(14, 8, item.name, {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: rarityColorHex,
      stroke: '#000000',
      strokeThickness: 2,
    });
    container.add(nameText);

    // Slot type
    const slotLabel = item.slot.charAt(0).toUpperCase() + item.slot.slice(1);
    const slotText = this.scene.add.text(14, 28, slotLabel, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: COLORS.uiTextDim,
    });
    container.add(slotText);

    // Key affixes (show first 2)
    const affixStrings: string[] = [];
    for (let i = 0; i < Math.min(2, item.affixes.length); i++) {
      const affix = item.affixes[i];
      affixStrings.push(`+${affix.value} ${affix.id.replace(/_/g, ' ')}`);
    }
    if (item.affixes.length > 2) {
      affixStrings.push(`+${item.affixes.length - 2} more...`);
    }

    if (affixStrings.length > 0) {
      const affixText = this.scene.add.text(
        14,
        46,
        affixStrings.join('  '),
        {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#aaaaaa',
        }
      );
      container.add(affixText);
    }

    // Slide in animation
    this.scene.tweens.add({
      targets: container,
      x: this.baseX,
      duration: SLIDE_DURATION,
      ease: 'Back.easeOut',
    });

    this.popups.push({
      container,
      lifetime: POPUP_LIFETIME,
      targetY: this.baseY,
    });
  }

  update(dt: number): void {
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const popup = this.popups[i];
      popup.lifetime -= dt;

      // Smooth vertical repositioning
      const currentY = popup.container.y;
      const diff = popup.targetY - currentY;
      popup.container.y += diff * 5 * dt;

      // Fade out in the last portion of lifetime
      if (popup.lifetime < POPUP_LIFETIME - FADE_START) {
        const fadeProgress = 1 - (popup.lifetime / (POPUP_LIFETIME - FADE_START));
        popup.container.setAlpha(Math.max(0, 1 - fadeProgress));
      }

      // Remove expired popups
      if (popup.lifetime <= 0) {
        popup.container.destroy();
        this.popups.splice(i, 1);
      }
    }
  }

  destroy(): void {
    for (const popup of this.popups) {
      popup.container.destroy();
    }
    this.popups.length = 0;
  }
}
