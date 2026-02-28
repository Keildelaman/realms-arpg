// ============================================================================
// PlayerEntity — Phaser sprite wrapper for the player character
// ============================================================================

import Phaser from 'phaser';
import { getPlayer } from '@/core/game-state';
import { on, off } from '@/core/event-bus';
import type { DamageType } from '@/core/types';
import {
  PLAYER_SIZE,
  HIT_FLASH_DURATION,
  PLAYER_IDLE_PULSE_MIN,
  PLAYER_IDLE_PULSE_MAX,
  PLAYER_IDLE_PULSE_SPEED,
  MOVE_STRETCH_FACTOR,
  MOVE_TRAIL_SPEED_THRESHOLD,
  MOVE_TRAIL_FREQUENCY,
  MOVE_SQUASH_ON_STOP,
  MOVE_SQUASH_DURATION,
  ATTACK_PULLBACK_DISTANCE,
  ATTACK_LUNGE_DISTANCE,
  ATTACK_WINDUP_DURATION,
  ATTACK_SWING_DURATION,
  ATTACK_FOLLOW_THROUGH_DURATION,
  HIT_STOP_BASE,
  HIT_STOP_CRIT_BONUS,
  HIT_STOP_DAMAGE_SCALE,
  HIT_STOP_MAX,
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

  // Idle breathing
  private idlePulseTime: number = 0;

  // Movement dust
  private dustTrailTimer: number = 0;

  // Squash-on-stop
  private squashTimer: number = 0;
  private wasMovingLastFrame: boolean = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;

    // Create sprite using the 'player' texture (64x64, displayed at 32x32)
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
    on('combat:impact', this.onImpact);
  }

  update(dt: number): void {
    const player = getPlayer();

    // Hit-stop: briefly pause player position update
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      return; // freeze everything during hit-stop
    }

    // Sync position from game state
    this.sprite.setPosition(player.x, player.y);

    // --- Rotation-based facing (wedge points toward cursor) ---
    this.sprite.setRotation(player.facingAngle);

    // --- Determine visual transforms ---
    const speed = Math.sqrt(player.velocityX * player.velocityX + player.velocityY * player.velocityY);
    const maxSpeed = player.moveSpeed;
    const speedRatio = Math.min(1, speed / Math.max(1, maxSpeed));
    const isMoving = speed > 5;

    let scaleX = 1;
    let scaleY = 1;
    let offsetX = 0;
    let offsetY = 0;

    // --- Attack phase transforms ---
    if (player.attackPhase !== 'none') {
      const angle = player.attackAngle;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      if (player.attackPhase === 'windup') {
        // Pull back away from attack direction, squash slightly
        const progress = 1 - (player.attackPhaseTimer / ATTACK_WINDUP_DURATION);
        const pullback = ATTACK_PULLBACK_DISTANCE * progress;
        offsetX = -cosA * pullback;
        offsetY = -sinA * pullback;
        scaleX = 1 - 0.05 * progress;
        scaleY = 1 + 0.05 * progress;
      } else if (player.attackPhase === 'swing') {
        // Lunge toward attack direction, stretch
        const progress = 1 - (player.attackPhaseTimer / ATTACK_SWING_DURATION);
        const lunge = ATTACK_LUNGE_DISTANCE * (1 - Math.pow(1 - progress, 2));
        offsetX = cosA * lunge;
        offsetY = sinA * lunge;
        scaleX = 1 + 0.1 * (1 - progress);
        scaleY = 1 - 0.1 * (1 - progress);
      } else if (player.attackPhase === 'followthrough') {
        // Rebound back to center with slight overshoot
        const progress = 1 - (player.attackPhaseTimer / ATTACK_FOLLOW_THROUGH_DURATION);
        const overshoot = Math.sin(progress * Math.PI) * 2;
        offsetX = -cosA * overshoot;
        offsetY = -sinA * overshoot;
        // Scale recovers to 1.0
        const scaleRecover = 1 - (1 - progress) * 0.05;
        scaleX = scaleRecover;
        scaleY = scaleRecover;
      }
    } else if (isMoving) {
      // --- Movement stretch ---
      scaleX = 1 + MOVE_STRETCH_FACTOR * speedRatio;
      scaleY = 1 - MOVE_STRETCH_FACTOR * 0.5 * speedRatio;
    } else {
      // --- Squash-on-stop ---
      if (this.squashTimer > 0) {
        this.squashTimer -= dt;
        const progress = Math.max(0, this.squashTimer / MOVE_SQUASH_DURATION);
        scaleX = 1 + MOVE_SQUASH_ON_STOP * progress;
        scaleY = 1 - MOVE_SQUASH_ON_STOP * progress;
      } else {
        // --- Idle breathing ---
        this.idlePulseTime += dt;
        const pulse = Math.sin(this.idlePulseTime * PLAYER_IDLE_PULSE_SPEED * Math.PI * 2);
        const t = (pulse + 1) / 2; // 0-1
        const pulseScale = PLAYER_IDLE_PULSE_MIN + t * (PLAYER_IDLE_PULSE_MAX - PLAYER_IDLE_PULSE_MIN);
        scaleX = pulseScale;
        scaleY = pulseScale;
      }
    }

    // Detect stop transition for squash
    if (!isMoving && this.wasMovingLastFrame) {
      this.squashTimer = MOVE_SQUASH_DURATION;
      this.idlePulseTime = 0;
    }
    this.wasMovingLastFrame = isMoving;

    // Apply visual transforms
    this.sprite.setScale(
      scaleX * (PLAYER_SIZE / 64), // 64px texture displayed at 32px
      scaleY * (PLAYER_SIZE / 64),
    );
    this.sprite.setPosition(player.x + offsetX, player.y + offsetY);

    // --- Movement dust particles ---
    if (isMoving && speed > MOVE_TRAIL_SPEED_THRESHOLD) {
      this.dustTrailTimer += dt;
      if (this.dustTrailTimer >= MOVE_TRAIL_FREQUENCY) {
        this.dustTrailTimer = 0;
        this.spawnDustParticle(player.x, player.y, player.velocityX, player.velocityY);
      }
    } else {
      this.dustTrailTimer = 0;
    }

    // --- Hit flash ---
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
      if (this.hitFlashTimer <= 0) {
        this.hitFlashTimer = 0;
        this.sprite.clearTint();
      }
    }

    // --- Invulnerability blink ---
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

    // --- Dash trail ---
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

  private spawnDustParticle(px: number, py: number, vx: number, vy: number): void {
    // Spawn behind the player (opposite to movement direction)
    const speed = Math.sqrt(vx * vx + vy * vy);
    const offsetX = speed > 0 ? -(vx / speed) * 8 : 0;
    const offsetY = speed > 0 ? -(vy / speed) * 8 : 0;

    const dust = this.scene.add.image(
      px + offsetX + (Math.random() - 0.5) * 6,
      py + offsetY + (Math.random() - 0.5) * 6,
      'dust',
    );
    dust.setDepth(8);
    dust.setAlpha(0.5);
    dust.setScale(0.8 + Math.random() * 0.4);

    this.scene.tweens.add({
      targets: dust,
      alpha: 0,
      scaleX: 0.1,
      scaleY: 0.1,
      duration: 300 + Math.random() * 100,
      onComplete: () => dust.destroy(),
    });
  }

  private spawnDashTrail(): void {
    const trail = this.scene.add.image(
      this.sprite.x,
      this.sprite.y,
      'player',
    );
    trail.setDisplaySize(PLAYER_SIZE, PLAYER_SIZE);
    trail.setAlpha(0.5);
    trail.setTint(0x2244aa);
    trail.setDepth(9);
    trail.setRotation(this.sprite.rotation);
    this.dashTrails.push(trail);
  }

  // --- Event handlers ---

  private onDamaged = (_data: { amount: number; source: string }): void => {
    // Brief red tint
    this.sprite.setTint(0xff2222);
    this.hitFlashTimer = HIT_FLASH_DURATION;
    // Start invulnerability blink
    this.invulnerableBlinkTimer = 0;
    this.invulnerableBlinkOn = true;
  };

  private onImpact = (data: {
    x: number;
    y: number;
    angle: number;
    damage: number;
    isCrit: boolean;
    damageType: DamageType;
    targetId: string;
  }): void => {
    // Scaled hit-stop
    let duration = HIT_STOP_BASE;
    if (data.isCrit) duration += HIT_STOP_CRIT_BONUS;
    duration += data.damage * HIT_STOP_DAMAGE_SCALE;
    duration = Math.min(duration, HIT_STOP_MAX);
    this.hitStopTimer = duration;
  };

  destroy(): void {
    off('player:damaged', this.onDamaged);
    off('combat:impact', this.onImpact);

    for (const trail of this.dashTrails) {
      trail.destroy();
    }
    this.dashTrails.length = 0;
    this.sprite.destroy();
  }
}
