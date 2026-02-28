import Phaser from 'phaser';
import { MONSTERS } from '@/data/monsters.data';
import { PLAYER_SIZE, PLAYER_BODY_RADIUS, PLAYER_DIRECTION_WEDGE_ANGLE } from '@/data/constants';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    this.createPlaceholderTextures();
  }

  create(): void {
    this.scene.start('HubScene');
  }

  private createPlaceholderTextures(): void {
    // Player — circle with directional wedge (64x64 texture, displayed at 32x32)
    const TEX_SIZE = 64;
    const cx = TEX_SIZE / 2;
    const cy = TEX_SIZE / 2;
    const bodyR = PLAYER_BODY_RADIUS * 2; // scale up for 64px texture
    const playerGfx = this.add.graphics();

    // Inner core glow
    playerGfx.fillStyle(0x88bbff, 0.3);
    playerGfx.fillCircle(cx, cy, bodyR * 0.5);

    // Body fill
    playerGfx.fillStyle(0x3377ee, 1);
    playerGfx.fillCircle(cx, cy, bodyR);

    // Rim highlight
    playerGfx.lineStyle(2, 0x66aaff, 0.8);
    playerGfx.strokeCircle(cx, cy, bodyR);

    // Directional wedge (triangle pointing right)
    const wedgeAngleRad = (PLAYER_DIRECTION_WEDGE_ANGLE / 2) * (Math.PI / 180);
    const wedgeTipX = cx + bodyR * 1.1;
    const wedgeBaseY1 = cy - Math.sin(wedgeAngleRad) * bodyR * 0.7;
    const wedgeBaseY2 = cy + Math.sin(wedgeAngleRad) * bodyR * 0.7;
    const wedgeBaseX = cx + Math.cos(wedgeAngleRad) * bodyR * 0.3;
    playerGfx.fillStyle(0xccddff, 0.9);
    playerGfx.fillTriangle(wedgeTipX, cy, wedgeBaseX, wedgeBaseY1, wedgeBaseX, wedgeBaseY2);

    playerGfx.generateTexture('player', TEX_SIZE, TEX_SIZE);
    playerGfx.destroy();

    // Dust particle — small gray circle (6x6)
    const dustGfx = this.add.graphics();
    dustGfx.fillStyle(0x999999, 0.8);
    dustGfx.fillCircle(3, 3, 3);
    dustGfx.generateTexture('dust', 6, 6);
    dustGfx.destroy();

    // Spark particle — small orange/yellow circle (6x6)
    const sparkGfx = this.add.graphics();
    sparkGfx.fillStyle(0xffaa33, 1);
    sparkGfx.fillCircle(3, 3, 3);
    sparkGfx.generateTexture('spark', 6, 6);
    sparkGfx.destroy();

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
