// ============================================================================
// Projectile — Phaser sprite for projectiles (player skills and monster attacks)
// ============================================================================

import Phaser from 'phaser';
import type { ProjectileInstance, MonsterInstance } from '@/core/types';
import { getState } from '@/core/game-state';
import { emit } from '@/core/event-bus';

export class Projectile {
  sprite: Phaser.Physics.Arcade.Sprite;
  data: ProjectileInstance;
  trail: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  scene: Phaser.Scene;

  private textureKey: string;

  constructor(scene: Phaser.Scene, proj: ProjectileInstance) {
    this.scene = scene;
    this.data = proj;

    // Create a dynamically colored circle texture for this projectile
    this.textureKey = `proj_${proj.color.replace('#', '')}`;
    if (!scene.textures.exists(this.textureKey)) {
      const gfx = scene.add.graphics();
      const colorNum = Phaser.Display.Color.HexStringToColor(proj.color).color;
      gfx.fillStyle(colorNum, 1);
      gfx.fillCircle(proj.size, proj.size, proj.size);
      gfx.generateTexture(this.textureKey, proj.size * 2, proj.size * 2);
      gfx.destroy();
    }

    // Create sprite at projectile position
    this.sprite = scene.physics.add.sprite(proj.x, proj.y, this.textureKey);
    this.sprite.setDisplaySize(proj.size * 2, proj.size * 2);
    this.sprite.setDepth(8);

    // Set initial velocity
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(proj.velocityX, proj.velocityY);
    body.setAllowGravity(false);

    // Set up optional particle trail
    this.createTrail(proj);
  }

  private createTrail(proj: ProjectileInstance): void {
    // Create a small particle texture if it doesn't exist
    const trailKey = `trail_${proj.color.replace('#', '')}`;
    if (!this.scene.textures.exists(trailKey)) {
      const gfx = this.scene.add.graphics();
      const colorNum = Phaser.Display.Color.HexStringToColor(proj.color).color;
      gfx.fillStyle(colorNum, 1);
      gfx.fillCircle(2, 2, 2);
      gfx.generateTexture(trailKey, 4, 4);
      gfx.destroy();
    }

    // Only create trail for player projectiles with a skill
    if (proj.ownerId === 'player' && proj.skillId) {
      try {
        this.trail = this.scene.add.particles(0, 0, trailKey, {
          follow: this.sprite,
          lifespan: 300,
          speed: { min: 5, max: 15 },
          scale: { start: 0.8, end: 0 },
          alpha: { start: 0.6, end: 0 },
          frequency: 30,
          blendMode: Phaser.BlendModes.ADD,
        });
        this.trail.setDepth(7);
      } catch {
        // Particle emitters may not be available in all Phaser builds
        this.trail = null;
      }
    }
  }

  update(dt: number): void {
    if (this.data.isExpired) return;

    // Track distance traveled
    const dx = this.data.velocityX * dt;
    const dy = this.data.velocityY * dt;
    this.data.distanceTraveled += Math.sqrt(dx * dx + dy * dy);

    // Update position from physics body
    this.data.x = this.sprite.x;
    this.data.y = this.sprite.y;

    // For homing projectiles: adjust velocity toward nearest enemy
    if (this.data.ownerId === 'player') {
      this.handleHoming();
    }

    // Sync velocity back to sprite (in case homing adjusted it)
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(this.data.velocityX, this.data.velocityY);

    // Check if expired (beyond maxDistance)
    if (this.data.distanceTraveled >= this.data.maxDistance) {
      this.data.isExpired = true;
      emit('projectile:expired', { projectileId: this.data.id });
    }

    // Check if out of world bounds
    const state = getState();
    if (
      this.data.x < -50 || this.data.y < -50 ||
      this.data.x > 2500 || this.data.y > 2500
    ) {
      this.data.isExpired = true;
      emit('projectile:expired', { projectileId: this.data.id });
    }
  }

  private handleHoming(): void {
    // Only homing for skills that use 'nearest' targeting
    // Check if this projectile has a skill with nearest targeting
    if (!this.data.skillId) return;

    const state = getState();
    const aliveMonsters = state.monsters.filter(
      m => !m.isDead && !this.data.hitTargets.includes(m.id)
    );

    if (aliveMonsters.length === 0) return;

    // Find nearest monster
    let nearest: MonsterInstance | null = null;
    let nearestDistSq = Infinity;

    for (const m of aliveMonsters) {
      const dx = m.x - this.data.x;
      const dy = m.y - this.data.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = m;
      }
    }

    if (!nearest) return;

    // Only home if within a reasonable range (300px)
    if (nearestDistSq > 300 * 300) return;

    // Smoothly adjust velocity toward target
    const targetAngle = Math.atan2(
      nearest.y - this.data.y,
      nearest.x - this.data.x
    );
    const currentAngle = Math.atan2(this.data.velocityY, this.data.velocityX);

    // Compute angle difference, normalized
    let angleDiff = targetAngle - currentAngle;
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    // Turn rate: 3 radians/sec
    const turnRate = 3.0;
    const maxTurn = turnRate * (1 / 60); // approximate dt
    const actualTurn = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), maxTurn);

    const newAngle = currentAngle + actualTurn;
    this.data.velocityX = Math.cos(newAngle) * this.data.speed;
    this.data.velocityY = Math.sin(newAngle) * this.data.speed;
  }

  destroy(): void {
    if (this.trail) {
      this.trail.destroy();
      this.trail = null;
    }
    this.sprite.destroy();
  }
}
