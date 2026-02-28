import Phaser from 'phaser';

export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  create(): void {
    // HUD text — stays fixed on screen
    this.add.text(16, 16, 'Realms of Clickoria — ARPG Prototype', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: '#00000088',
      padding: { x: 8, y: 4 },
    }).setScrollFactor(0);

    this.add.text(16, 48, 'WASD / Arrow keys to move', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#aaaaaa',
      backgroundColor: '#00000088',
      padding: { x: 8, y: 4 },
    }).setScrollFactor(0);
  }
}
