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
  HIT_STOP_BASE,
  HIT_STOP_CRIT_BONUS,
  HIT_STOP_DAMAGE_SCALE,
  HIT_STOP_MAX,
  MOTE_ORBIT_RADIUS,
  MOTE_BASE_SPEED,
  MOTE_MAX_SPEED_MULT,
  MOTE_SIZE,
  MOTE_GLOW_SIZE,
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

  // Resonance motes
  private moteGfx: Phaser.GameObjects.Graphics;

  // Player state visuals
  private isInFlow: boolean = false;
  private isInWrath: boolean = false;
  private isPrimed: boolean = false;
  private stateGfx: Phaser.GameObjects.Graphics;
  private flowText: Phaser.GameObjects.Text | null = null;

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

    // Graphics for resonance motes (below player)
    this.moteGfx = scene.add.graphics();
    this.moteGfx.setDepth(9);

    // Graphics for player state visuals (below player)
    this.stateGfx = scene.add.graphics();
    this.stateGfx.setDepth(8);

    // Subscribe to events
    on('player:damaged', this.onDamaged);
    on('combat:impact', this.onImpact);
    on('skill:used', this.onSkillUsed);
    on('playerState:flowEntered', this.onFlowEntered);
    on('playerState:flowBroken', this.onFlowBroken);
    on('playerState:wrathEntered', this.onWrathEntered);
    on('playerState:wrathExited', this.onWrathExited);
    on('playerState:primed', this.onPrimed);
    on('playerState:primedConsumed', this.onPrimedConsumed);
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
        const phaseDur = player.attackPhaseDuration || 0.065;
        const progress = 1 - (player.attackPhaseTimer / phaseDur);
        const pullback = player.attackPullback * progress;
        offsetX = -cosA * pullback;
        offsetY = -sinA * pullback;
        scaleX = 1 - 0.05 * progress;
        scaleY = 1 + 0.05 * progress;
      } else if (player.attackPhase === 'swing') {
        // Lunge toward attack direction, stretch
        const phaseDur = player.attackPhaseDuration || 0.08;
        const progress = 1 - (player.attackPhaseTimer / phaseDur);
        const lunge = player.attackLunge * (1 - Math.pow(1 - progress, 2));
        offsetX = cosA * lunge;
        offsetY = sinA * lunge;
        scaleX = 1 + 0.1 * (1 - progress);
        scaleY = 1 - 0.1 * (1 - progress);
      } else if (player.attackPhase === 'followthrough') {
        // Rebound back to center with slight overshoot
        const phaseDur = player.attackPhaseDuration || 0.12;
        const progress = 1 - (player.attackPhaseTimer / phaseDur);
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

    // --- Resonance motes ---
    this.updateResonanceMotes(player.x, player.y);

    // --- Player state visuals ---
    this.updateStateVisuals(player.x, player.y);
  }

  // --- Resonance mote rendering ---

  private updateResonanceMotes(px: number, py: number): void {
    const player = getPlayer();
    const res = player.resonance;

    this.moteGfx.clear();

    if (res.ash === 0 && res.ember === 0) return;

    const speedMult = (res.ash >= 5 || res.ember >= 5) ? MOTE_MAX_SPEED_MULT : 1.0;
    const moteTime = this.scene.time.now / 1000;

    // Duality pulsing alpha
    let dualityAlpha = 1.0;
    if (res.dualityActive) {
      dualityAlpha = 0.6 + 0.4 * Math.sin(moteTime * 6);
    }

    // Wrath makes ash motes glow brighter
    const wrathBoost = this.isInWrath ? 1.3 : 1.0;

    // Ash motes (red/orange, clockwise)
    for (let i = 0; i < res.ash; i++) {
      const angle = (moteTime * MOTE_BASE_SPEED * speedMult) + (i / Math.max(1, res.ash)) * Math.PI * 2;
      const mx = px + Math.cos(angle) * MOTE_ORBIT_RADIUS;
      const my = py + Math.sin(angle) * MOTE_ORBIT_RADIUS;

      // Glow (larger, dimmer)
      this.moteGfx.fillStyle(0xfbbf24, dualityAlpha * 0.4 * wrathBoost);
      this.moteGfx.fillCircle(mx, my, MOTE_GLOW_SIZE);
      // Core
      this.moteGfx.fillStyle(0xf97316, dualityAlpha * wrathBoost);
      this.moteGfx.fillCircle(mx, my, MOTE_SIZE);
    }

    // Ember motes (blue/violet, counterclockwise)
    for (let i = 0; i < res.ember; i++) {
      const angle = -(moteTime * MOTE_BASE_SPEED * speedMult) + (i / Math.max(1, res.ember)) * Math.PI * 2;
      const mx = px + Math.cos(angle) * MOTE_ORBIT_RADIUS;
      const my = py + Math.sin(angle) * MOTE_ORBIT_RADIUS;

      // Glow (larger, dimmer)
      this.moteGfx.fillStyle(0x60a5fa, dualityAlpha * 0.4);
      this.moteGfx.fillCircle(mx, my, MOTE_GLOW_SIZE);
      // Core
      this.moteGfx.fillStyle(0xa855f7, dualityAlpha);
      this.moteGfx.fillCircle(mx, my, MOTE_SIZE);
    }
  }

  // --- Player state visuals (Flow, Wrath, Primed) ---

  private updateStateVisuals(px: number, py: number): void {
    this.stateGfx.clear();

    // Flow: subtle amber glow behind player
    if (this.isInFlow) {
      const pulse = 0.12 + 0.06 * Math.sin(this.scene.time.now * 0.005);
      this.stateGfx.fillStyle(0xfbbf24, pulse);
      this.stateGfx.fillCircle(px, py, 22);
    }

    // Wrath: screen-edge red vignette effect
    if (this.isInWrath) {
      const cam = this.scene.cameras.main;
      const vx = cam.scrollX;
      const vy = cam.scrollY;
      const vw = cam.width;
      const vh = cam.height;
      const vignetteAlpha = 0.08 + 0.05 * Math.sin(this.scene.time.now * 0.004);
      const thickness = 40;

      this.stateGfx.fillStyle(0xdc2626, vignetteAlpha);
      // Top edge
      this.stateGfx.fillRect(vx, vy, vw, thickness);
      // Bottom edge
      this.stateGfx.fillRect(vx, vy + vh - thickness, vw, thickness);
      // Left edge
      this.stateGfx.fillRect(vx, vy, thickness, vh);
      // Right edge
      this.stateGfx.fillRect(vx + vw - thickness, vy, thickness, vh);
    }

    // Primed: subtle white tint pulse
    if (this.isPrimed && this.hitFlashTimer <= 0) {
      const primePulse = 0.5 + 0.5 * Math.sin(this.scene.time.now * 0.008);
      if (primePulse > 0.7) {
        this.sprite.setTint(0xffffff);
      }
    }

    // Update flow text position
    if (this.flowText) {
      this.flowText.setPosition(px, this.flowText.y);
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

  // --- Skill body animations ---

  private onSkillUsed = (data: { skillId: string; x: number; y: number; angle: number }): void => {
    const player = getPlayer();

    if (data.skillId === 'heavy_slash') {
      // Lunge forward toward facing angle
      const cos = Math.cos(player.facingAngle);
      const sin = Math.sin(player.facingAngle);
      this.scene.tweens.add({
        targets: this.sprite,
        x: this.sprite.x + cos * 8,
        y: this.sprite.y + sin * 8,
        duration: 100,
        yoyo: true,
        ease: 'Power2',
      });
    } else if (data.skillId === 'arcane_bolt') {
      // Recoil backward
      const cos = Math.cos(player.facingAngle);
      const sin = Math.sin(player.facingAngle);
      this.scene.tweens.add({
        targets: this.sprite,
        x: this.sprite.x - cos * 3,
        y: this.sprite.y - sin * 3,
        duration: 80,
        yoyo: true,
        ease: 'Power1',
      });
    } else if (data.skillId === 'ranger_shot') {
      // Small recoil on shot
      const cos = Math.cos(player.facingAngle);
      const sin = Math.sin(player.facingAngle);
      this.scene.tweens.add({
        targets: this.sprite,
        x: this.sprite.x - cos * 4,
        y: this.sprite.y - sin * 4,
        duration: 70,
        yoyo: true,
        ease: 'Power1',
      });
    } else if (data.skillId === 'arcane_strike') {
      // Short forward pulse
      const cos = Math.cos(player.facingAngle);
      const sin = Math.sin(player.facingAngle);
      this.scene.tweens.add({
        targets: this.sprite,
        x: this.sprite.x + cos * 5,
        y: this.sprite.y + sin * 5,
        duration: 60,
        yoyo: true,
        ease: 'Power2',
      });
    }
  };

  // --- Flow state ---

  private onFlowEntered = (): void => {
    this.isInFlow = true;
    const player = getPlayer();
    const py = player.y;

    this.flowText = this.scene.add.text(player.x, py - 24, 'FLOW', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#fbbf24',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(13);

    this.scene.tweens.add({
      targets: this.flowText,
      alpha: 0,
      y: py - 36,
      delay: 700,
      duration: 300,
      onComplete: () => {
        this.flowText?.destroy();
        this.flowText = null;
      },
    });
  };

  private onFlowBroken = (): void => {
    this.isInFlow = false;
    if (this.flowText) {
      this.flowText.destroy();
      this.flowText = null;
    }
  };

  // --- Wrath state ---

  private onWrathEntered = (): void => {
    this.isInWrath = true;
  };

  private onWrathExited = (): void => {
    this.isInWrath = false;
  };

  // --- Primed state ---

  private onPrimed = (_data: { multiplier: number }): void => {
    this.isPrimed = true;
    // Brief white scale-pulse on cast
    const curScaleX = this.sprite.scaleX;
    const curScaleY = this.sprite.scaleY;
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: curScaleX * 1.15,
      scaleY: curScaleY * 1.15,
      duration: 100,
      yoyo: true,
    });
  };

  private onPrimedConsumed = (): void => {
    this.isPrimed = false;
    this.sprite.clearTint();
  };

  destroy(): void {
    off('player:damaged', this.onDamaged);
    off('combat:impact', this.onImpact);
    off('skill:used', this.onSkillUsed);
    off('playerState:flowEntered', this.onFlowEntered);
    off('playerState:flowBroken', this.onFlowBroken);
    off('playerState:wrathEntered', this.onWrathEntered);
    off('playerState:wrathExited', this.onWrathExited);
    off('playerState:primed', this.onPrimed);
    off('playerState:primedConsumed', this.onPrimedConsumed);

    for (const trail of this.dashTrails) {
      trail.destroy();
    }
    this.dashTrails.length = 0;
    this.moteGfx.destroy();
    this.stateGfx.destroy();
    if (this.flowText) {
      this.flowText.destroy();
      this.flowText = null;
    }
    this.sprite.destroy();
  }
}
