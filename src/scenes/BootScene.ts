import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // TODO: Load assets here (spritesheets, tilemaps, audio)
    // For now, create placeholder textures
    this.createPlaceholderTextures();
  }

  create(): void {
    this.scene.start('GameScene');
  }

  private createPlaceholderTextures(): void {
    // Player — 32x32 blue square
    const playerGfx = this.add.graphics();
    playerGfx.fillStyle(0x4488ff);
    playerGfx.fillRect(0, 0, 32, 32);
    playerGfx.generateTexture('player', 32, 32);
    playerGfx.destroy();

    // Monster — 32x32 red square
    const monsterGfx = this.add.graphics();
    monsterGfx.fillStyle(0xff4444);
    monsterGfx.fillRect(0, 0, 32, 32);
    monsterGfx.generateTexture('monster', 32, 32);
    monsterGfx.destroy();

    // Projectile — 8x8 yellow circle
    const projGfx = this.add.graphics();
    projGfx.fillStyle(0xffff44);
    projGfx.fillCircle(4, 4, 4);
    projGfx.generateTexture('projectile', 8, 8);
    projGfx.destroy();
  }
}
