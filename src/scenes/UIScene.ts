import Phaser from 'phaser';
import type { ItemInstance } from '@/core/types';
import { getState, moveInventoryItemToSlot, removeFromInventory, addToInventory, equipItem, addToStash, removeFromStash, isInventoryFull, moveStashItem } from '@/core/game-state';
import { recalculateStats } from '@/systems/player';
import { on, emit } from '@/core/event-bus';
import { RARITY_COLORS, COLORS } from '@/data/constants';
import { ZONES } from '@/data/zones.data';
import * as expeditions from '@/systems/expeditions';
import { UI_THEME, drawPanelShell, drawSectionCard } from '@/ui/ui-theme';

// UI Components
import { HealthBar } from '@/ui/HealthBar';
import { EnergyBar } from '@/ui/EnergyBar';
import { XPBar } from '@/ui/XPBar';
import { SkillBar } from '@/ui/SkillBar';
import { Minimap } from '@/ui/Minimap';
import { InventoryPanel } from '@/ui/InventoryPanel';
import { MerchantPanel } from '@/ui/MerchantPanel';
import { MonsterInfoPanel } from '@/ui/MonsterInfoPanel';
import { StashPanel } from '@/ui/StashPanel';
import { SkillCodex } from '@/ui/SkillCodex';

export class UIScene extends Phaser.Scene {
  private healthBar!: HealthBar;
  private energyBar!: EnergyBar;
  private xpBar!: XPBar;
  private skillBar!: SkillBar;
  private minimap!: Minimap;
  private inventoryPanel!: InventoryPanel;
  private merchantPanel!: MerchantPanel;
  private stashPanel!: StashPanel;
  private monsterInfoPanel!: MonsterInfoPanel;
  private skillCodex!: SkillCodex;

  // Info displays
  private hudInfoBg!: Phaser.GameObjects.Graphics;
  private zoneText!: Phaser.GameObjects.Text;
  private objectiveText!: Phaser.GameObjects.Text;
  private portalsText!: Phaser.GameObjects.Text;
  private fpsText!: Phaser.GameObjects.Text;

  private leaveConfirmText!: Phaser.GameObjects.Text;
  private resultToastText!: Phaser.GameObjects.Text;

  private keyEsc!: Phaser.Input.Keyboard.Key;
  private keyY!: Phaser.Input.Keyboard.Key;
  private keyN!: Phaser.Input.Keyboard.Key;
  private keyTab!: Phaser.Input.Keyboard.Key;
  private keyC!: Phaser.Input.Keyboard.Key;

  private leaveConfirmVisible = false;
  private resultToastTimer = 0;

  // Merchant auto-open tracking
  private inventoryAutoOpenedByMerchant = false;

  // Stash auto-open tracking
  private inventoryAutoOpenedByStash = false;

  // Drag-and-drop state
  private dragGhost: Phaser.GameObjects.Container | null = null;
  private dragItem: ItemInstance | null = null;
  private dragSourceIndex: number = -1;
  private dragSource: 'inventory' | 'staging' | 'stash' = 'inventory';
  private dragSourceStashTab: number = -1;
  private dragSourceStashSlot: number = -1;
  private dragStartX: number = 0;
  private dragStartY: number = 0;

  constructor() {
    super({ key: 'UIScene' });
  }

  create(): void {
    // --- HUD bars ---
    this.healthBar = new HealthBar(this);
    this.add.existing(this.healthBar);

    this.energyBar = new EnergyBar(this);
    this.add.existing(this.energyBar);

    this.xpBar = new XPBar(this);
    this.add.existing(this.xpBar);

    // --- Skill bar ---
    this.skillBar = new SkillBar(this);
    this.add.existing(this.skillBar);

    // --- Minimap ---
    this.minimap = new Minimap(this);
    this.add.existing(this.minimap);

    // --- Inventory panel (hidden by default) ---
    this.inventoryPanel = new InventoryPanel(this);
    this.add.existing(this.inventoryPanel);

    // --- Merchant panel (hidden by default) ---
    this.merchantPanel = new MerchantPanel(this);
    this.add.existing(this.merchantPanel);

    // --- Stash panel (hidden by default) ---
    this.stashPanel = new StashPanel(this);
    this.add.existing(this.stashPanel);

    // --- Skill Codex (hidden by default) ---
    this.skillCodex = new SkillCodex(this);

    // --- Monster info panel ---
    this.monsterInfoPanel = new MonsterInfoPanel(this);

    // --- Info text ---
    this.hudInfoBg = this.add.graphics().setScrollFactor(0).setDepth(95);

    this.zoneText = this.add.text(28, 22, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: UI_THEME.text,
      stroke: '#000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(100);

    this.objectiveText = this.add.text(28, 42, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#bae6fd',
      stroke: '#000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(100);

    this.portalsText = this.add.text(28, 62, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#fde68a',
      stroke: '#000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(100);

    this.fpsText = this.add.text(28, 82, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: UI_THEME.textMuted,
      stroke: '#000',
      strokeThickness: 1,
    }).setScrollFactor(0).setDepth(100);

    this.leaveConfirmText = this.add.text(this.scale.width / 2, this.scale.height / 2, '', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: UI_THEME.text,
      stroke: '#000000',
      strokeThickness: 3,
      backgroundColor: 'rgba(15,23,42,0.88)',
      padding: { x: 12, y: 8 },
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(300).setVisible(false);

    this.resultToastText = this.add.text(this.scale.width / 2, 52, '', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: UI_THEME.text,
      stroke: '#000000',
      strokeThickness: 2,
      backgroundColor: 'rgba(15,23,42,0.85)',
      padding: { x: 10, y: 4 },
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(250).setVisible(false);

    this.drawHudInfoCard();
    this.scale.on('resize', this.onResize, this);

    this.keyEsc = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.keyY = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Y);
    this.keyN = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.N);
    this.keyTab = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
    this.keyC = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.C);

    this.keyTab.on('down', () => {
      const s = getState();
      if (s.codexOpen) return;
      if (s.merchantOpen && s.inventoryOpen) return; // block close while merchant open
      emit('ui:inventoryToggle');
    });

    this.keyC.on('down', () => {
      const s = getState();
      if (s.merchantOpen || s.stashOpen || s.inventoryOpen) return;
      this.skillCodex.toggle();
    });

    this.input.on('pointerdown', this.onHubUiPointerDown, this);

    this.keyEsc.on('down', () => {
      const state = getState();
      if (state.codexOpen) {
        this.skillCodex.toggle();
        return;
      }
      if (state.stashOpen) {
        emit('ui:stashToggle');
        return;
      }
      if (state.gameMode !== 'expedition') return;
      if (state.activeExpedition?.status === 'awaiting_extraction') return;
      if (state.inventoryOpen) {
        if (state.merchantOpen) return; // block: can't close inventory while merchant open
        emit('ui:inventoryToggle');
        return;
      }
      this.leaveConfirmVisible = !this.leaveConfirmVisible;
      this.syncLeaveConfirm();
    });

    this.keyY.on('down', () => {
      if (!this.leaveConfirmVisible) return;
      this.leaveConfirmVisible = false;
      this.syncLeaveConfirm();
      expeditions.abandonActiveExpedition();
    });

    this.keyN.on('down', () => {
      if (!this.leaveConfirmVisible) return;
      this.leaveConfirmVisible = false;
      this.syncLeaveConfirm();
    });

    // --- Event listeners ---
    on('zone:entered', () => {
      this.updateZoneText();
    });

    on('expedition:completed', (data) => {
      const totalXP = data.rewards.completionXP + data.rewards.firstClearXPBonus;
      const totalGold = data.rewards.completionGold + data.rewards.firstClearGoldBonus;
      this.showResultToast(`Expedition Complete  +${totalXP} XP  +${totalGold} Gold`);
    });

    on('expedition:readyToExtract', () => {
      this.showResultToast('Map Cleared  -  Open reward chest, then use portal');
    });

    on('expedition:chestOpened', (data) => {
      const rarityLabel = data.rarity.charAt(0).toUpperCase() + data.rarity.slice(1);
      const sourceLabel = data.source === 'completion' ? 'Reward' : 'Map';
      this.showResultToast(`${sourceLabel} ${rarityLabel} Chest Opened  -  ${data.dropCount} loot drops`);
    });

    on('expedition:failed', (data) => {
      if (data.reason === 'no_portals') {
        this.showResultToast('Expedition Failed: No portals remaining');
      } else {
        this.showResultToast('Expedition Abandoned');
      }
    });

    on('expedition:returnHub', () => {
      this.leaveConfirmVisible = false;
      this.syncLeaveConfirm();
    });

    // Auto-open/close inventory alongside merchant
    on('ui:merchantToggle', () => {
      const state = getState();
      if (state.merchantOpen) {
        // Merchant just opened — also open inventory if not already open
        if (!state.inventoryOpen) {
          emit('ui:inventoryToggle');
          this.inventoryAutoOpenedByMerchant = true;
        }
      } else {
        // Merchant just closed — return any staged items to player inventory
        const returned = this.merchantPanel.drainStaging();
        for (const item of returned) addToInventory(item);

        if (this.inventoryAutoOpenedByMerchant && state.inventoryOpen) {
          // Inventory was auto-opened; close it
          emit('ui:inventoryToggle');
        } else if (returned.length > 0 && state.inventoryOpen) {
          // Inventory was manually opened; refresh to show returned items
          this.inventoryPanel.refresh();
        }

        this.inventoryAutoOpenedByMerchant = false;
        this.cancelDrag();
      }
    });

    // Stash toggle — mirror merchant pattern: auto-open/close inventory alongside
    on('ui:stashToggle', () => {
      const state = getState();
      if (!state.stashOpen) {
        // Opening stash
        this.stashPanel.toggle(); // sets stashOpen = true
        if (!state.inventoryOpen) {
          emit('ui:inventoryToggle');
          this.inventoryAutoOpenedByStash = true;
        }
      } else {
        // Closing stash
        this.stashPanel.toggle(); // sets stashOpen = false
        if (this.inventoryAutoOpenedByStash && state.inventoryOpen) {
          emit('ui:inventoryToggle');
        }
        this.inventoryAutoOpenedByStash = false;
      }
    });

    // Codex toggle (from HubScene ESC or other scenes)
    on('ui:codexToggle', () => {
      this.skillCodex.toggle();
    });

    // Inventory → Stash (Ctrl+Click in InventoryPanel)
    on('ui:inventoryToStash', ({ item, fromInventoryIndex: _idx }) => {
      removeFromInventory(item.id);
      if (addToStash(item)) {
        this.inventoryPanel.refresh();
        this.stashPanel.refresh();
      } else {
        addToInventory(item);          // rollback: stash was full
        this.inventoryPanel.refresh();
      }
    });

    // Stash → Inventory (Ctrl+Click in StashPanel)
    on('ui:stashToInventory', ({ item, tabIndex, slotIndex }) => {
      if (!isInventoryFull()) {
        addToInventory(item);                                     // emits inventory:itemAdded
        this.inventoryPanel.suppressNewIndicator(item.id);       // stash items are not "new"
        removeFromStash(tabIndex, slotIndex);
        this.stashPanel.refresh();
        this.inventoryPanel.refresh();
      }
    });

    // Drag orchestration
    on('ui:itemDragStart', ({ item, sourceIndex, dragSource, stashTab, stashSlot }) => {
      this.dragItem = item;
      this.dragSourceIndex = sourceIndex;
      this.dragSource = dragSource;
      this.dragSourceStashTab = stashTab ?? -1;
      this.dragSourceStashSlot = stashSlot ?? -1;
      this.dragStartX = this.input.activePointer.x;
      this.dragStartY = this.input.activePointer.y;
      this.createDragGhost(item);
      this.input.on('pointermove', this.onDragMove, this);
      this.input.on('pointerup', this.onDragEnd, this);
    });

    // Ctrl+click quick-move: inventory → staging
    on('ui:stagingQuickMove', ({ item, fromInventoryIndex }) => {
      if (!getState().merchantOpen) return;
      const slot = this.merchantPanel.getFirstEmptyStagingSlot();
      if (slot === null) return; // staging full, ignore
      removeFromInventory(item.id);
      this.merchantPanel.acceptStagingDrop(item, slot);
      this.inventoryPanel.refresh();
    });

    // Ctrl+click quick-move: staging → inventory
    on('ui:inventoryQuickMove', ({ item, fromStagingIndex }) => {
      const added = addToInventory(item);
      if (!added) {
        // Inventory full — put it back
        this.merchantPanel.acceptStagingDrop(item, fromStagingIndex);
        return;
      }
      this.merchantPanel.removeFromStaging(fromStagingIndex);
      emit('player:statsChanged');
      this.inventoryPanel.refresh();
      this.merchantPanel.refresh();
    });
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    const state = getState();

    // Update HUD components
    this.healthBar.update(dt);
    this.energyBar.update(dt);
    this.xpBar.update(dt);
    this.skillBar.update(dt);
    this.minimap.update(dt);
    this.inventoryPanel.update(dt);
    this.monsterInfoPanel.update(dt);

    this.updateZoneText();
    this.updateExpeditionHud();

    if (this.resultToastTimer > 0) {
      this.resultToastTimer -= dt;
      if (this.resultToastTimer <= 0) {
        this.resultToastTimer = 0;
        this.resultToastText.setVisible(false);
      }
    }

    // FPS counter
    const fps = Math.round(this.game.loop.actualFps);
    let aliveCount = 0;
    for (const m of state.monsters) { if (!m.isDead) aliveCount++; }
    this.fpsText.setText(`${fps} FPS  Monsters:${aliveCount}`);
  }

  private updateZoneText(): void {
    const state = getState();

    if (state.gameMode === 'hub') {
      this.zoneText.setText('Hub: Haven');
      return;
    }

    const run = state.activeExpedition;
    if (run) {
      const zone = ZONES[run.zoneId];
      this.zoneText.setText(`${zone?.name ?? run.zoneId} (T${run.tier})`);
      return;
    }

    const zone = ZONES[state.activeZoneId];
    if (zone) {
      const kills = state.zoneKillCounts[state.activeZoneId] || 0;
      this.zoneText.setText(`${zone.name} (T${zone.tier}) - Kills: ${kills}/${zone.bossUnlockKills}`);
    }
  }

  private updateExpeditionHud(): void {
    const state = getState();
    if (state.gameMode !== 'expedition' || !state.activeExpedition) {
      this.objectiveText.setText('');
      this.portalsText.setText('');
      return;
    }

    const run = state.activeExpedition;
    if (run.status === 'awaiting_extraction') {
      const hasPendingRewardChest = run.chests.some(chest => chest.source === 'completion' && !chest.isOpened);
      if (hasPendingRewardChest) {
        this.objectiveText.setText('Map Cleared: Open Reward Chest (E)');
      } else {
        this.objectiveText.setText('Map Cleared: Use Extraction Portal (E)');
      }
      this.portalsText.setText('');
      this.leaveConfirmVisible = false;
      this.syncLeaveConfirm();
      return;
    }
    const label = run.map.objective === 'boss_hunt' ? 'Boss Hunt' : 'Extermination';
    this.objectiveText.setText(`${label}: ${run.progress.currentKills}/${run.progress.requiredKills}`);
    this.portalsText.setText(`Portals: ${run.portalsRemaining}/${run.maxPortals}`);
    this.syncLeaveConfirm();
  }

  private syncLeaveConfirm(): void {
    if (!this.leaveConfirmVisible || getState().gameMode !== 'expedition') {
      this.leaveConfirmText.setVisible(false);
      return;
    }

    this.leaveConfirmText
      .setVisible(true)
      .setText('Leave Expedition?\nY: Confirm  |  N or ESC: Cancel');
  }

  // --- Drag-to-sell helpers ---

  private createDragGhost(item: ItemInstance): void {
    const s = 44; // match inventory SLOT_SIZE

    this.dragGhost = this.add.container(0, 0);
    this.dragGhost.setScrollFactor(0).setDepth(500).setAlpha(0.9);

    const rarityColor = RARITY_COLORS[item.rarity] ?? '#e5e5e5';
    const rarityColorInt = Phaser.Display.Color.HexStringToColor(rarityColor).color;

    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a1a, 0.8);
    bg.fillRoundedRect(0, 0, s, s, 2);
    bg.lineStyle(2, rarityColorInt, 1);
    bg.strokeRoundedRect(0, 0, s, s, 2);
    this.dragGhost.add(bg);

    const nameText = this.add.text(s / 2, s / 2, item.name.substring(0, 4), {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: rarityColor,
      stroke: '#000000',
      strokeThickness: 1,
    }).setOrigin(0.5, 0.5);
    this.dragGhost.add(nameText);
  }

  private onDragMove = (pointer: Phaser.Input.Pointer): void => {
    if (!this.dragGhost) return;
    this.dragGhost.setPosition(pointer.x - 22, pointer.y - 22); // center on cursor
  };

  private onDragEnd = (pointer: Phaser.Input.Pointer): void => {
    if (!this.dragItem) return;

    const dx = pointer.x - this.dragStartX;
    const dy = pointer.y - this.dragStartY;
    const isClick = Math.sqrt(dx * dx + dy * dy) < 5;
    const state = getState();

    if (isClick) {
      if (this.dragSource === 'inventory') {
        this.equipFromInventory(this.dragSourceIndex);
      } else if (this.dragSource === 'staging') {
        // Staging click: item already removed from staging — return it to inventory
        const added = addToInventory(this.dragItem);
        if (!added) {
          this.merchantPanel.restoreToStaging(this.dragSourceIndex, this.dragItem);
        } else {
          emit('player:statsChanged');
          this.inventoryPanel.refresh();
          this.merchantPanel.refresh();
        }
      }
      // 'stash': click with no drag — cancel silently (tooltip already shown by zone hover)
    } else {
      const merchantSlot = this.merchantPanel.getStagingSlotAtPoint(pointer.x, pointer.y);
      const invSlot = this.inventoryPanel.getInventorySlotBoundsAtPoint(pointer.x, pointer.y);

      if (this.dragSource === 'inventory') {
        if (state.stashOpen && this.stashPanel.isPointOverStash(pointer.x, pointer.y)) {
          // Drop on stash: deposit into active tab's first empty slot
          if (addToStash(this.dragItem)) {
            removeFromInventory(this.dragItem.id);
            this.stashPanel.refresh();
            this.inventoryPanel.refresh();
          }
          // If stash tab is full, drag is silently cancelled (item stays in inventory)
          this.destroyDragGhost();
          this.input.off('pointermove', this.onDragMove, this);
          this.input.off('pointerup', this.onDragEnd, this);
          emit('ui:itemDragEnd', { sold: false });
          this.dragItem = null;
          this.dragSourceIndex = -1;
          this.dragSource = 'inventory';
          return;
        } else if (merchantSlot !== null && state.merchantOpen) {
          removeFromInventory(this.dragItem.id);
          this.merchantPanel.acceptStagingDrop(this.dragItem, merchantSlot);
        } else if (invSlot !== null && invSlot !== this.dragSourceIndex) {
          moveInventoryItemToSlot(this.dragSourceIndex, invSlot);
          emit('player:statsChanged');
        }
        // else: cancel — item stays in inventory

      } else if (this.dragSource === 'staging') {
        // item already removed from staging
        if (merchantSlot !== null && state.merchantOpen) {
          // Move within staging (acceptStagingDrop handles occupied-slot displacement)
          this.merchantPanel.acceptStagingDrop(this.dragItem, merchantSlot);
        } else if (invSlot !== null) {
          // Drop on inventory slot: place at exact slot, displace existing item if any
          const inv = state.player.inventory;
          const displaced = inv[invSlot];
          inv[invSlot] = this.dragItem;
          if (displaced) {
            if (!addToInventory(displaced)) {
              this.merchantPanel.acceptStagingDrop(displaced, this.dragSourceIndex);
            }
          }
          emit('player:statsChanged');
          this.inventoryPanel.refresh();
          this.merchantPanel.refresh();
        } else {
          // Cancel: restore to original staging slot
          this.merchantPanel.restoreToStaging(this.dragSourceIndex, this.dragItem);
        }
      } else {
        // dragSource === 'stash'; item stays in stash during drag
        const targetSlot = this.stashPanel.getStashSlotAtPoint(pointer.x, pointer.y);
        if (targetSlot !== null) {
          // Swap (or move to empty slot) within active stash tab
          moveStashItem(this.dragSourceStashTab, this.dragSourceStashSlot, targetSlot);
          this.stashPanel.refresh();
        } else if (invSlot !== null) {
          // Drop on inventory: move from stash to inventory
          const added = addToInventory(this.dragItem);
          if (added) {
            removeFromStash(this.dragSourceStashTab, this.dragSourceStashSlot);
            this.inventoryPanel.suppressNewIndicator(this.dragItem.id);
            this.stashPanel.refresh();
            this.inventoryPanel.refresh();
          }
        }
        // else: cancel — stash state untouched
      }
    }

    this.destroyDragGhost();
    this.input.off('pointermove', this.onDragMove, this);
    this.input.off('pointerup', this.onDragEnd, this);
    emit('ui:itemDragEnd', { sold: false });
    this.dragItem = null;
    this.dragSourceIndex = -1;
    this.dragSource = 'inventory';
    this.dragSourceStashTab = -1;
    this.dragSourceStashSlot = -1;
  };

  private equipFromInventory(index: number): void {
    const item = getState().player.inventory[index];
    if (!item) return;
    const displaced = equipItem(item);
    removeFromInventory(item.id);
    if (displaced) addToInventory(displaced);
    emit('item:equipped', { item, slot: item.slot });
    emit('player:statsChanged');
    recalculateStats();
  }

  private destroyDragGhost(): void {
    if (this.dragGhost) {
      this.dragGhost.destroy();
      this.dragGhost = null;
    }
  }

  private cancelDrag(): void {
    if (!this.dragItem) return;
    // If drag started from staging, item was already removed — restore it
    if (this.dragSource === 'staging') {
      this.merchantPanel.restoreToStaging(this.dragSourceIndex, this.dragItem);
    }
    // 'stash': item was never removed, nothing to restore
    this.destroyDragGhost();
    this.input.off('pointermove', this.onDragMove, this);
    this.input.off('pointerup', this.onDragEnd, this);
    emit('ui:itemDragEnd', { sold: false });
    this.dragItem = null;
    this.dragSourceIndex = -1;
    this.dragSource = 'inventory';
    this.dragSourceStashTab = -1;
    this.dragSourceStashSlot = -1;
  }

  private showResultToast(text: string): void {
    this.resultToastText.setText(text);
    this.resultToastText.setVisible(true);
    this.resultToastTimer = 4;
  }

  private onHubUiPointerDown = (pointer: Phaser.Input.Pointer): void => {
    const state = getState();
    if (state.gameMode !== 'hub') return;
    if (this.dragItem) return;

    if (state.merchantOpen) {
      const inMerchant = this.merchantPanel.isPointOverPanel(pointer.x, pointer.y);
      const inInventory = this.inventoryPanel.isPointOverPanel(pointer.x, pointer.y);
      if (!inMerchant && !inInventory) {
        emit('ui:merchantToggle');
      }
      return;
    }

    if (state.stashOpen) {
      const inStash = this.stashPanel.isPointOverStash(pointer.x, pointer.y);
      const inInventory = this.inventoryPanel.isPointOverPanel(pointer.x, pointer.y);
      if (!inStash && !inInventory) {
        emit('ui:stashToggle');
      }
    }
  };

  private onResize = (size: Phaser.Structs.Size): void => {
    this.leaveConfirmText.setPosition(size.width / 2, size.height / 2);
    this.resultToastText.setPosition(size.width / 2, 52);
    this.drawHudInfoCard();
  };

  private drawHudInfoCard(): void {
    this.hudInfoBg.clear();
    drawPanelShell(this.hudInfoBg, 16, 14, 304, 94, 8);
    drawSectionCard(this.hudInfoBg, 26, 20, 284, 78, false, 6);
  }
}
