import Phaser from 'phaser';
import { MONSTERS } from '@/data/monsters.data';
import { PLAYER_SIZE } from '@/data/constants';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    this.createPlaceholderTextures();
  }

  create(): void {
    this.scene.start('GameScene');
  }

  private createPlaceholderTextures(): void {
    // Player — blue square
    const playerGfx = this.add.graphics();
    playerGfx.fillStyle(0x4488ff);
    playerGfx.fillRect(0, 0, PLAYER_SIZE, PLAYER_SIZE);
    playerGfx.generateTexture('player', PLAYER_SIZE, PLAYER_SIZE);
    playerGfx.destroy();

    // Generate a texture for each monster definition
    for (const def of Object.values(MONSTERS)) {
      const key = `monster_${def.id}`;
      if (this.textures.exists(key)) continue;
      const gfx = this.add.graphics();
      const color = parseInt(def.color.replace('#', ''), 16);
      gfx.fillStyle(color);
      if (def.isBoss) {
        // Bosses: rounded rect
        gfx.fillRoundedRect(0, 0, def.size, def.size, 6);
      } else {
        gfx.fillRect(0, 0, def.size, def.size);
      }
      gfx.generateTexture(key, def.size, def.size);
      gfx.destroy();
    }

    // Fallback monster texture (red square)
    const monsterGfx = this.add.graphics();
    monsterGfx.fillStyle(0xff4444);
    monsterGfx.fillRect(0, 0, 32, 32);
    monsterGfx.generateTexture('monster', 32, 32);
    monsterGfx.destroy();

    // Projectile — yellow circle
    const projGfx = this.add.graphics();
    projGfx.fillStyle(0xffff44);
    projGfx.fillCircle(4, 4, 4);
    projGfx.generateTexture('projectile', 8, 8);
    projGfx.destroy();

    // Loot bag — gold diamond
    const lootGfx = this.add.graphics();
    lootGfx.fillStyle(0xfbbf24);
    lootGfx.fillTriangle(8, 0, 16, 8, 8, 16);
    lootGfx.fillTriangle(8, 0, 0, 8, 8, 16);
    lootGfx.generateTexture('loot_bag', 16, 16);
    lootGfx.destroy();
  }
}
