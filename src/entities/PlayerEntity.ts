// ============================================================================
// PlayerEntity — Phaser sprite wrapper for the player character
// ============================================================================

import Phaser from 'phaser';
import { getPlayer } from '@/core/game-state';
import { on, off } from '@/core/event-bus';
import {
  PLAYER_SIZE,
  HIT_FLASH_DURATION,
  BASIC_ATTACK_RANGE,
  COLORS,
} from '@/data/constants';

export class PlayerEntity {
  sprite: Phaser.Physics.Arcade.Sprite;
  scene: Phaser.Scene;

  private hitFlashTimer: number = 0;
  private invulnerableBlinkTimer: number = 0;
  private invulnerableBlinkOn: boolean = false;
  private dashTrailTimer: number = 0;
  private dashTrails: Phaser.GameObjects.Image[] = [];
  private hitStopTimer: number = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;

    // Create sprite using the 'player' texture (32x32 blue square placeholder)
    this.sprite = scene.physics.add.sprite(x, y, 'player');
    this.sprite.setDisplaySize(PLAYER_SIZE, PLAYER_SIZE);

    // Set up physics body
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(PLAYER_SIZE, PLAYER_SIZE);
    body.setCollideWorldBounds(true);

    // Set depth for rendering order (player draws above ground, below UI)
    this.sprite.setDepth(10);

    // Subscribe to events
    on('player:damaged', this.onDamaged);
    on('combat:playerAttack', this.onAttack);
    on('combat:damageDealt', this.onDamageDealt);
  }

  update(dt: number): void {
    const player = getPlayer();

    // Hit-stop: briefly pause player position update
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
    } else {
      // Sync position from game state (movement system updates state, entity follows)
      this.sprite.setPosition(player.x, player.y);
    }

    // Update facing direction — flip sprite based on facing angle
    this.sprite.setFlipX(
      Math.abs(player.facingAngle) > Math.PI / 2
    );

    // Update hit flash
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
      if (this.hitFlashTimer <= 0) {
        this.hitFlashTimer = 0;
        this.sprite.clearTint();
      }
    }

    // Update invulnerability blink
    if (player.isInvulnerable && !player.isDashing) {
      this.invulnerableBlinkTimer += dt;
      if (this.invulnerableBlinkTimer >= 0.08) {
        this.invulnerableBlinkTimer = 0;
        this.invulnerableBlinkOn = !this.invulnerableBlinkOn;
        this.sprite.setAlpha(this.invulnerableBlinkOn ? 0.3 : 1.0);
      }
    } else if (!player.isInvulnerable && this.sprite.alpha !== 1.0) {
      this.sprite.setAlpha(1.0);
      this.invulnerableBlinkTimer = 0;
      this.invulnerableBlinkOn = false;
    }

    // Update dash trail
    if (player.isDashing) {
      this.dashTrailTimer += dt;
      if (this.dashTrailTimer >= 0.03) {
        this.dashTrailTimer = 0;
        this.spawnDashTrail();
      }
    } else {
      this.dashTrailTimer = 0;
    }

    // Fade and clean up dash trails
    for (let i = this.dashTrails.length - 1; i >= 0; i--) {
      const trail = this.dashTrails[i];
      trail.alpha -= dt * 4;
      if (trail.alpha <= 0) {
        trail.destroy();
        this.dashTrails.splice(i, 1);
      }
    }
  }

  /** Brief red tint on damage taken */
  flashHit(): void {
    this.sprite.setTint(0xff2222);
    this.hitFlashTimer = HIT_FLASH_DURATION;
  }

  /** Blink alpha during iframes */
  flashInvulnerable(): void {
    this.invulnerableBlinkTimer = 0;
    this.invulnerableBlinkOn = true;
  }

  /** Brief weapon swing visual — colored arc matching attack range */
  playAttackAnimation(angle: number): void {
    const player = getPlayer();
    const gfx = this.scene.add.graphics();
    gfx.setDepth(11);

    // Draw an orange arc matching the attack range
    const arcRadius = BASIC_ATTACK_RANGE;
    const startAngle = angle - Math.PI / 3; // 120° arc = PI/3 each side
    const endAngle = angle + Math.PI / 3;

    const arcColor = Phaser.Display.Color.HexStringToColor(COLORS.physical).color;
    gfx.lineStyle(4, arcColor, 0.8);
    gfx.beginPath();
    gfx.arc(player.x, player.y, arcRadius, startAngle, endAngle, false);
    gfx.strokePath();

    // Inner arc for thickness effect
    gfx.lineStyle(2, 0xffffff, 0.4);
    gfx.beginPath();
    gfx.arc(player.x, player.y, arcRadius * 0.7, startAngle, endAngle, false);
    gfx.strokePath();

    // Fade and destroy over 200ms
    this.scene.tweens.add({
      targets: gfx,
      alpha: 0,
      duration: 200,
      onComplete: () => gfx.destroy(),
    });
  }

  /** Shadow trail during dash */
  playDashEffect(): void {
    // Trail is handled automatically in update() when isDashing
  }

  private spawnDashTrail(): void {
    const trail = this.scene.add.image(
      this.sprite.x,
      this.sprite.y,
      'player'
    );
    trail.setDisplaySize(PLAYER_SIZE, PLAYER_SIZE);
    trail.setAlpha(0.5);
    trail.setTint(0x2244aa);
    trail.setDepth(9);
    trail.setFlipX(this.sprite.flipX);
    this.dashTrails.push(trail);
  }

  // --- Event handlers ---

  private onDamaged = (_data: { amount: number; source: string }): void => {
    this.flashHit();
    this.flashInvulnerable();
  };

  private onAttack = (data: { angle: number; skillId?: string }): void => {
    if (!data.skillId) {
      this.playAttackAnimation(data.angle);
    }
  };

  private onDamageDealt = (_data: { targetId: string; damage: number }): void => {
    // Screen shake on dealing damage
    this.scene.cameras.main.shake(50, 0.002);
    // Hit-stop: brief 30ms pause
    this.hitStopTimer = 0.03;
  };

  destroy(): void {
    off('player:damaged', this.onDamaged);
    off('combat:playerAttack', this.onAttack);
    off('combat:damageDealt', this.onDamageDealt);

    for (const trail of this.dashTrails) {
      trail.destroy();
    }
    this.dashTrails.length = 0;
    this.sprite.destroy();
  }
}
