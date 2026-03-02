// ============================================================================
// VFXManager — Visual effects for combat impacts, attack arcs, and feedback
// ============================================================================

import Phaser from 'phaser';
import { on, off } from '@/core/event-bus';
import { getPlayer, getMonsterById } from '@/core/game-state';
import type { DamageType } from '@/core/types';
import {
  BASIC_ATTACK_ARC,
  BASIC_ATTACK_RANGE,
  ATTACK_ARC_FILL_ALPHA,
  ATTACK_ARC_THICKNESS,
  ATTACK_ARC_INNER_RATIO,
  ATTACK_ARC_FADE_DURATION,
  WHIFF_ARC_ALPHA,
  WHIFF_ARC_FADE_DURATION,
  IMPACT_PARTICLE_COUNT,
  IMPACT_PARTICLE_CRIT_COUNT,
  IMPACT_PARTICLE_SPEED,
  IMPACT_PARTICLE_LIFESPAN,
  IMPACT_PARTICLE_SIZE,
  SCREEN_SHAKE_HIT_DURATION,
  SCREEN_SHAKE_HIT_INTENSITY,
  SCREEN_SHAKE_CRIT_DURATION,
  SCREEN_SHAKE_CRIT_INTENSITY,
  SHAKE_HEAVY_SLASH_DURATION,
  SHAKE_HEAVY_SLASH_INTENSITY,
  SHAKE_HEAVY_SLASH_CRIT_DURATION,
  SHAKE_HEAVY_SLASH_CRIT_INTENSITY,
  ASHBURST_RADIUS,
  OVERLOAD_RADIUS,
  DEATH_BURST_PARTICLE_COUNT,
  DEATH_BURST_SPEED,
  DEATH_BURST_DURATION,
  DEATH_BURST_SHAKE_DURATION,
  DEATH_BURST_SHAKE_INTENSITY,
  COLORS,
} from '@/data/constants';

export class VFXManager {
  private scene: Phaser.Scene;
  private activeZoneVisuals: Map<string, Phaser.GameObjects.Graphics> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    on('combat:impact', this.onImpact);
    on('combat:attackSwing', this.onAttackSwing);
    on('combat:miss', this.onMiss);
    on('monster:detonated', this.onDetonated);
    on('affix:frostNova', this.onFrostNova);
    on('affix:teleport', this.onTeleport);
    on('affix:vampiricHeal', this.onVampiricHeal);
    on('resonance:release', this.onResonanceRelease);
    on('monster:died', this.onMonsterDied);
    on('shadow:trailCreated', this.onShadowTrailCreated);
    on('shadow:echoStarted', this.onShadowEchoStarted);
    on('environment:zoneCreated', this.onZoneCreated);
    on('environment:zoneExpired', this.onZoneExpired);
  }

  // --- Attack arc (filled wedge) ---

  private onAttackSwing = (data: { angle: number; duration: number }): void => {
    const player = getPlayer();
    const gfx = this.scene.add.graphics();
    gfx.setDepth(11);

    const halfArcRad = (BASIC_ATTACK_ARC / 2) * (Math.PI / 180);
    const startAngle = data.angle - halfArcRad;
    const endAngle = data.angle + halfArcRad;
    const outerR = BASIC_ATTACK_RANGE;
    const innerR = outerR * ATTACK_ARC_INNER_RATIO;

    // Filled wedge
    const physColor = Phaser.Display.Color.HexStringToColor(COLORS.physical).color;
    gfx.fillStyle(physColor, ATTACK_ARC_FILL_ALPHA);
    gfx.beginPath();
    gfx.arc(player.x, player.y, innerR, startAngle, endAngle, false);
    gfx.arc(player.x, player.y, outerR, endAngle, startAngle, true);
    gfx.closePath();
    gfx.fillPath();

    // Bright outer edge
    gfx.lineStyle(ATTACK_ARC_THICKNESS, 0xffffff, 0.7);
    gfx.beginPath();
    gfx.arc(player.x, player.y, outerR, startAngle, endAngle, false);
    gfx.strokePath();

    // Inner highlight
    gfx.lineStyle(2, physColor, 0.5);
    gfx.beginPath();
    gfx.arc(player.x, player.y, innerR, startAngle, endAngle, false);
    gfx.strokePath();

    this.scene.tweens.add({
      targets: gfx,
      alpha: 0,
      duration: ATTACK_ARC_FADE_DURATION,
      onComplete: () => gfx.destroy(),
    });
  };

  // --- Whiff arc (dimmer, faster) ---

  private onMiss = (_data: { targetId: string; x: number; y: number }): void => {
    const player = getPlayer();
    const gfx = this.scene.add.graphics();
    gfx.setDepth(11);

    const angle = player.facingAngle;
    const halfArcRad = (BASIC_ATTACK_ARC / 2) * (Math.PI / 180);
    const startAngle = angle - halfArcRad;
    const endAngle = angle + halfArcRad;
    const outerR = BASIC_ATTACK_RANGE;
    const innerR = outerR * ATTACK_ARC_INNER_RATIO;

    const physColor = Phaser.Display.Color.HexStringToColor(COLORS.physical).color;
    gfx.fillStyle(physColor, WHIFF_ARC_ALPHA);
    gfx.beginPath();
    gfx.arc(player.x, player.y, innerR, startAngle, endAngle, false);
    gfx.arc(player.x, player.y, outerR, endAngle, startAngle, true);
    gfx.closePath();
    gfx.fillPath();

    gfx.lineStyle(3, 0xffffff, 0.2);
    gfx.beginPath();
    gfx.arc(player.x, player.y, outerR, startAngle, endAngle, false);
    gfx.strokePath();

    this.scene.tweens.add({
      targets: gfx,
      alpha: 0,
      duration: WHIFF_ARC_FADE_DURATION,
      onComplete: () => gfx.destroy(),
    });
  };

  // --- Impact particles + screen shake (source-differentiated) ---

  private onImpact = (data: {
    x: number;
    y: number;
    angle: number;
    damage: number;
    isCrit: boolean;
    damageType: DamageType;
    targetId: string;
    source?: string;
  }): void => {
    const source = data.source;

    if (source === 'resonance') {
      // Resonance releases get their own shockwave VFX (handled in onResonanceRelease)
      // Still emit basic particles for the per-monster hits
      this.showBasicImpactParticles(data);
      return;
    }

    if (source === 'skill') {
      // Skill-specific VFX
      if (data.damageType === 'physical') {
        this.showSlashMark(data.x, data.y, data.angle, data.isCrit);
        // Camera shake: physical skill hit
        const dur = data.isCrit ? SHAKE_HEAVY_SLASH_CRIT_DURATION : SHAKE_HEAVY_SLASH_DURATION;
        const int = data.isCrit ? SHAKE_HEAVY_SLASH_CRIT_INTENSITY : SHAKE_HEAVY_SLASH_INTENSITY;
        this.scene.cameras.main.shake(dur, int);
      } else {
        this.showSparkBurst(data.x, data.y, data.isCrit);
        // No camera shake for magic skills (surgical feel per spec)
      }
      return;
    }

    // Basic attack: existing behavior
    const shakeDuration = data.isCrit ? SCREEN_SHAKE_CRIT_DURATION : SCREEN_SHAKE_HIT_DURATION;
    const shakeIntensity = data.isCrit ? SCREEN_SHAKE_CRIT_INTENSITY : SCREEN_SHAKE_HIT_INTENSITY;
    this.scene.cameras.main.shake(shakeDuration, shakeIntensity);

    this.showBasicImpactParticles(data);
  };

  // --- Basic impact particles (shared by basic attacks and resonance per-hit) ---

  private showBasicImpactParticles(data: {
    x: number;
    y: number;
    angle: number;
    isCrit: boolean;
    damageType: DamageType;
  }): void {
    const count = data.isCrit ? IMPACT_PARTICLE_CRIT_COUNT : IMPACT_PARTICLE_COUNT;
    const baseColor = data.isCrit ? 0xfbbf24 : (data.damageType === 'physical' ? 0xf97316 : 0xa855f7);

    for (let i = 0; i < count; i++) {
      const spreadAngle = data.angle + (Math.random() - 0.5) * Math.PI;
      const speed = IMPACT_PARTICLE_SPEED * (0.5 + Math.random() * 0.5);
      const vx = Math.cos(spreadAngle) * speed;
      const vy = Math.sin(spreadAngle) * speed;

      const particle = this.scene.add.circle(
        data.x,
        data.y,
        IMPACT_PARTICLE_SIZE * (data.isCrit ? 1.5 : 1),
        baseColor,
        1,
      );
      particle.setDepth(12);

      this.scene.tweens.add({
        targets: particle,
        x: data.x + vx * (IMPACT_PARTICLE_LIFESPAN / 1000),
        y: data.y + vy * (IMPACT_PARTICLE_LIFESPAN / 1000),
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: IMPACT_PARTICLE_LIFESPAN,
        ease: 'Power2',
        onComplete: () => particle.destroy(),
      });
    }
  }

  // --- Slash mark VFX (physical skill hits) ---

  private showSlashMark(x: number, y: number, angle: number, isCrit: boolean): void {
    const gfx = this.scene.add.graphics();
    gfx.setDepth(12);

    const arcLength = isCrit ? 40 : 28;
    const arcSweep = isCrit ? 0.8 : 0.6; // radians
    const startA = angle - arcSweep / 2;
    const endA = angle + arcSweep / 2;

    // Primary slash arc
    gfx.lineStyle(isCrit ? 4 : 3, 0xf97316, 0.9);
    gfx.beginPath();
    gfx.arc(x, y, arcLength, startA, endA, false);
    gfx.strokePath();

    // White highlight edge
    gfx.lineStyle(isCrit ? 2 : 1, 0xffffff, 0.7);
    gfx.beginPath();
    gfx.arc(x, y, arcLength - 2, startA, endA, false);
    gfx.strokePath();

    // Crit: expanding ring
    if (isCrit) {
      gfx.lineStyle(2, 0xfbbf24, 0.5);
      gfx.strokeCircle(x, y, 8);
      this.scene.tweens.add({
        targets: gfx,
        alpha: 0,
        scaleX: 1.8,
        scaleY: 1.8,
        duration: 400,
        ease: 'Power2',
        onComplete: () => gfx.destroy(),
      });
    } else {
      this.scene.tweens.add({
        targets: gfx,
        alpha: 0,
        duration: 400,
        ease: 'Power2',
        onComplete: () => gfx.destroy(),
      });
    }

    // Orange spark particles (fewer than basic, directional)
    const count = isCrit ? 8 : 5;
    for (let i = 0; i < count; i++) {
      const sparkAngle = angle + (Math.random() - 0.5) * 1.2;
      const speed = 80 + Math.random() * 60;
      const px = x + Math.cos(sparkAngle) * (arcLength * 0.5);
      const py = y + Math.sin(sparkAngle) * (arcLength * 0.5);

      const spark = this.scene.add.circle(px, py, isCrit ? 2.5 : 2, 0xf97316, 1);
      spark.setDepth(12);
      this.scene.tweens.add({
        targets: spark,
        x: px + Math.cos(sparkAngle) * speed * 0.3,
        y: py + Math.sin(sparkAngle) * speed * 0.3,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: 300,
        ease: 'Power2',
        onComplete: () => spark.destroy(),
      });
    }
  }

  // --- Spark burst VFX (magic skill hits) ---

  private showSparkBurst(x: number, y: number, isCrit: boolean): void {
    const count = isCrit ? 12 : 8;

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const speed = 60 + Math.random() * 50;
      const color = isCrit ? 0xc084fc : 0x60a5fa; // purple on crit, blue normal

      const spark = this.scene.add.circle(x, y, isCrit ? 3 : 2, color, 1);
      spark.setDepth(12);

      this.scene.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: 200,
        ease: 'Power1',
        onComplete: () => spark.destroy(),
      });
    }

    // Crit: additional expanding ring
    if (isCrit) {
      const ring = this.scene.add.graphics();
      ring.setDepth(12);
      ring.lineStyle(2, 0xc084fc, 0.6);
      ring.strokeCircle(x, y, 6);
      this.scene.tweens.add({
        targets: ring,
        alpha: 0,
        scaleX: 3,
        scaleY: 3,
        duration: 250,
        ease: 'Power1',
        onComplete: () => ring.destroy(),
      });
    }
  }

  // --- Resonance release shockwave ---

  private onResonanceRelease = (data: {
    type: 'ashburst' | 'overload';
    x: number;
    y: number;
  }): void => {
    this.showResonanceShockwave(data.x, data.y, data.type);

    // Camera zoom pulse
    this.scene.cameras.main.zoomTo(0.95, 300, 'Sine.easeOut');
    this.scene.time.delayedCall(300, () => {
      this.scene.cameras.main.zoomTo(1.0, 200, 'Sine.easeIn');
    });
  };

  private showResonanceShockwave(
    x: number,
    y: number,
    type: 'ashburst' | 'overload',
  ): void {
    const isAsh = type === 'ashburst';
    const radius = isAsh ? ASHBURST_RADIUS : OVERLOAD_RADIUS;
    const fillColor = isAsh ? 0xf97316 : 0x60a5fa;
    const lineColor = isAsh ? 0xfbbf24 : 0xc084fc;

    // Expanding ring
    const gfx = this.scene.add.graphics();
    gfx.setDepth(12);
    gfx.setPosition(x, y);

    // Start small, expand to full radius
    gfx.lineStyle(3, lineColor, 0.8);
    gfx.strokeCircle(0, 0, 8);
    gfx.fillStyle(fillColor, 0.25);
    gfx.fillCircle(0, 0, 8);

    const startScale = 1;
    const endScale = radius / 8;

    this.scene.tweens.add({
      targets: gfx,
      scaleX: endScale,
      scaleY: endScale,
      alpha: 0,
      duration: 300,
      ease: 'Power1',
      onComplete: () => gfx.destroy(),
    });

    // Particle spray outward
    const particleCount = isAsh ? 14 : 16;
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount;
      const dist = radius * (0.5 + Math.random() * 0.5);
      const color = isAsh ? 0xf97316 : 0xa855f7;

      const particle = this.scene.add.circle(x, y, 3, color, 1);
      particle.setDepth(12);

      this.scene.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scaleX: 0.3,
        scaleY: 0.3,
        duration: 350,
        ease: 'Power2',
        onComplete: () => particle.destroy(),
      });
    }
  }

  // --- Death burst VFX ---

  private onMonsterDied = (data: {
    monsterId: string;
    x: number;
    y: number;
    xp: number;
    gold: number;
    isBoss: boolean;
  }): void => {
    const monster = getMonsterById(data.monsterId);
    const color = monster
      ? Phaser.Display.Color.HexStringToColor(monster.color).color
      : 0xcccccc;
    this.showDeathBurst(data.x, data.y, color, data.isBoss);
  };

  private showDeathBurst(x: number, y: number, color: number, isBoss: boolean): void {
    const count = isBoss ? DEATH_BURST_PARTICLE_COUNT * 2 : DEATH_BURST_PARTICLE_COUNT;
    const speed = isBoss ? DEATH_BURST_SPEED * 1.5 : DEATH_BURST_SPEED;

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const spd = speed * (0.4 + Math.random() * 0.6);
      const size = 2 + Math.random() * 2;

      const particle = this.scene.add.circle(x, y, size, color, 1);
      particle.setDepth(12);

      this.scene.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * spd,
        y: y + Math.sin(angle) * spd,
        alpha: 0,
        scaleX: 0.1,
        scaleY: 0.1,
        duration: DEATH_BURST_DURATION,
        ease: 'Power2',
        onComplete: () => particle.destroy(),
      });
    }

    // Small camera shake
    this.scene.cameras.main.shake(
      isBoss ? DEATH_BURST_SHAKE_DURATION * 2 : DEATH_BURST_SHAKE_DURATION,
      isBoss ? DEATH_BURST_SHAKE_INTENSITY * 2 : DEATH_BURST_SHAKE_INTENSITY,
    );
  }

  // --- Exploder detonation VFX ---

  private onDetonated = (data: {
    monsterId: string;
    x: number;
    y: number;
    radius: number;
    damage: number;
    hitPlayer: boolean;
  }): void => {
    // Expanding explosion circle
    const gfx = this.scene.add.graphics();
    gfx.setDepth(12);
    gfx.fillStyle(0xff4400, 0.4);
    gfx.fillCircle(data.x, data.y, data.radius);
    gfx.lineStyle(3, 0xff6600, 0.8);
    gfx.strokeCircle(data.x, data.y, data.radius);

    this.scene.tweens.add({
      targets: gfx,
      alpha: 0,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 400,
      onComplete: () => gfx.destroy(),
    });

    // Particle burst
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12;
      const speed = 100 + Math.random() * 80;
      const particle = this.scene.add.circle(data.x, data.y, 3, 0xff6600, 1);
      particle.setDepth(12);

      this.scene.tweens.add({
        targets: particle,
        x: data.x + Math.cos(angle) * speed,
        y: data.y + Math.sin(angle) * speed,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: 350,
        onComplete: () => particle.destroy(),
      });
    }

    // Camera shake
    this.scene.cameras.main.shake(150, 0.005);
  };

  // --- Frost nova VFX ---

  private onFrostNova = (data: { x: number; y: number; radius: number }): void => {
    // Expanding blue ring
    const gfx = this.scene.add.graphics();
    gfx.setDepth(12);
    gfx.fillStyle(0x93c5fd, 0.3);
    gfx.fillCircle(data.x, data.y, data.radius);
    gfx.lineStyle(2, 0x60a5fa, 0.7);
    gfx.strokeCircle(data.x, data.y, data.radius);

    this.scene.tweens.add({
      targets: gfx,
      alpha: 0,
      scaleX: 1.4,
      scaleY: 1.4,
      duration: 500,
      onComplete: () => gfx.destroy(),
    });

    // Ice particles
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const dist = data.radius * 0.6 + Math.random() * data.radius * 0.4;
      const particle = this.scene.add.circle(
        data.x + Math.cos(angle) * dist * 0.3,
        data.y + Math.sin(angle) * dist * 0.3,
        2,
        0xbfdbfe,
        1,
      );
      particle.setDepth(12);

      this.scene.tweens.add({
        targets: particle,
        x: data.x + Math.cos(angle) * dist,
        y: data.y + Math.sin(angle) * dist,
        alpha: 0,
        duration: 400,
        onComplete: () => particle.destroy(),
      });
    }
  };

  // --- Teleport VFX ---

  private onTeleport = (data: {
    monsterId: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  }): void => {
    // Purple flash at old position
    const fromFlash = this.scene.add.circle(data.fromX, data.fromY, 15, 0x9333ea, 0.6);
    fromFlash.setDepth(12);
    this.scene.tweens.add({
      targets: fromFlash,
      alpha: 0,
      scaleX: 2,
      scaleY: 2,
      duration: 300,
      onComplete: () => fromFlash.destroy(),
    });

    // Purple flash at new position
    const toFlash = this.scene.add.circle(data.toX, data.toY, 15, 0x9333ea, 0.6);
    toFlash.setDepth(12);
    this.scene.tweens.add({
      targets: toFlash,
      alpha: 0,
      scaleX: 2,
      scaleY: 2,
      duration: 300,
      delay: 50,
      onComplete: () => toFlash.destroy(),
    });
  };

  // --- Vampiric heal VFX ---

  private onVampiricHeal = (data: { monsterId: string; amount: number }): void => {
    const monster = getMonsterById(data.monsterId);
    if (!monster) return;

    // Green particles toward monster
    for (let i = 0; i < 4; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 20;
      const startX = monster.x + Math.cos(angle) * dist;
      const startY = monster.y + Math.sin(angle) * dist;

      const particle = this.scene.add.circle(startX, startY, 2, 0x22c55e, 0.8);
      particle.setDepth(12);

      this.scene.tweens.add({
        targets: particle,
        x: monster.x,
        y: monster.y,
        alpha: 0,
        duration: 300,
        onComplete: () => particle.destroy(),
      });
    }
  };

  // --- Shadow Trail VFX (Phase Walk) ---

  private onShadowTrailCreated = (data: {
    startX: number; startY: number;
    endX: number; endY: number;
    width: number; duration: number;
  }): void => {
    const gfx = this.scene.add.graphics();
    gfx.setDepth(3); // Below monsters, above ground

    const dx = data.endX - data.startX;
    const dy = data.endY - data.startY;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) { gfx.destroy(); return; }

    // Perpendicular offset for width
    const nx = (-dy / len) * (data.width / 2);
    const ny = (dx / len) * (data.width / 2);

    // Filled quad (trail shape)
    gfx.fillStyle(0x1a1a2e, 0.5);
    gfx.beginPath();
    gfx.moveTo(data.startX + nx, data.startY + ny);
    gfx.lineTo(data.endX + nx, data.endY + ny);
    gfx.lineTo(data.endX - nx, data.endY - ny);
    gfx.lineTo(data.startX - nx, data.startY - ny);
    gfx.closePath();
    gfx.fillPath();

    // Wispy edge lines
    gfx.lineStyle(1, 0x4a3f6b, 0.6);
    gfx.beginPath();
    gfx.moveTo(data.startX + nx, data.startY + ny);
    gfx.lineTo(data.endX + nx, data.endY + ny);
    gfx.strokePath();
    gfx.beginPath();
    gfx.moveTo(data.startX - nx, data.startY - ny);
    gfx.lineTo(data.endX - nx, data.endY - ny);
    gfx.strokePath();

    // Fade out over duration
    this.scene.tweens.add({
      targets: gfx,
      alpha: 0,
      duration: data.duration * 1000,
      ease: 'Power1',
      onComplete: () => gfx.destroy(),
    });
  };

  // --- Echo Step VFX (Phase Walk T2) ---

  private onShadowEchoStarted = (data: {
    startX: number; startY: number;
    endX: number; endY: number;
    duration: number;
  }): void => {
    // Ghost trail: translucent tinted circle moving from start to end
    const ghost = this.scene.add.circle(data.startX, data.startY, 14, 0x6366f1, 0.4);
    ghost.setDepth(9);

    this.scene.tweens.add({
      targets: ghost,
      x: data.endX,
      y: data.endY,
      alpha: 0,
      duration: data.duration * 1000,
      ease: 'Power1',
      onComplete: () => ghost.destroy(),
    });
  };

  // --- Environmental Zone VFX ---

  private onZoneCreated = (data: {
    id: string; type: string;
    x: number; y: number;
    radius: number; duration: number;
  }): void => {
    const gfx = this.scene.add.graphics();
    gfx.setDepth(2); // Below everything else

    if (data.type === 'aftershock') {
      // Cracked ground circle
      gfx.fillStyle(0x3d2b1f, 0.3);
      gfx.fillCircle(data.x, data.y, data.radius);

      // Crack lines radiating from center
      gfx.lineStyle(1.5, 0x8b7355, 0.5);
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 + 0.3;
        const endR = data.radius * (0.5 + Math.random() * 0.4);
        const midR = endR * 0.5;
        const jitter = (Math.random() - 0.5) * 0.4;
        gfx.beginPath();
        gfx.moveTo(data.x, data.y);
        gfx.lineTo(
          data.x + Math.cos(angle + jitter) * midR,
          data.y + Math.sin(angle + jitter) * midR,
        );
        gfx.lineTo(
          data.x + Math.cos(angle) * endR,
          data.y + Math.sin(angle) * endR,
        );
        gfx.strokePath();
      }

      // Outer ring
      gfx.lineStyle(2, 0x8b7355, 0.4);
      gfx.strokeCircle(data.x, data.y, data.radius);
    }

    this.activeZoneVisuals.set(data.id, gfx);

    // Fade out over duration
    this.scene.tweens.add({
      targets: gfx,
      alpha: 0,
      duration: data.duration * 1000,
      ease: 'Power1',
    });
  };

  private onZoneExpired = (data: { id: string }): void => {
    const gfx = this.activeZoneVisuals.get(data.id);
    if (gfx) {
      gfx.destroy();
      this.activeZoneVisuals.delete(data.id);
    }
  };

  destroy(): void {
    off('combat:impact', this.onImpact);
    off('combat:attackSwing', this.onAttackSwing);
    off('combat:miss', this.onMiss);
    off('monster:detonated', this.onDetonated);
    off('affix:frostNova', this.onFrostNova);
    off('affix:teleport', this.onTeleport);
    off('affix:vampiricHeal', this.onVampiricHeal);
    off('resonance:release', this.onResonanceRelease);
    off('monster:died', this.onMonsterDied);
    off('shadow:trailCreated', this.onShadowTrailCreated);
    off('shadow:echoStarted', this.onShadowEchoStarted);
    off('environment:zoneCreated', this.onZoneCreated);
    off('environment:zoneExpired', this.onZoneExpired);

    // Clean up active zone visuals
    for (const gfx of this.activeZoneVisuals.values()) {
      gfx.destroy();
    }
    this.activeZoneVisuals.clear();
  }
}
