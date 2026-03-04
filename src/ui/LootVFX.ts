import Phaser from 'phaser';
import type { LootDrop, GoldDrop, Rarity } from '@/core/types';

interface RarityVFXConfig {
  color: number;
  outerGlowRadius: number;
  outerGlowAlpha: number;
  innerGlowRadius: number;
  innerGlowAlpha: number;
  beamHeight: number;
  beamWidth: number;
  beamAlpha: number;
  burstCount: number;
  burstSpeed: number;
  burstDuration: number;
  risePeriod: number;
  showLabel: boolean;
  shakeMs: number;
  shakeIntensity: number;
  cameraFlash: boolean;
  showNotification: boolean;
  shockwave: boolean;
}

const ARC_DURATION = 200; // ms — item arc/fall animation

interface ItemDropVisuals {
  container: Phaser.GameObjects.Container;
  rarity: Rarity;
  itemName: string;           // stored for legendary notification at landing
  particleTimer: number;
  landed: boolean;            // false during arc; true once onItemLanded() fires
  gem: Phaser.GameObjects.Graphics;
  outerGlow: Phaser.GameObjects.Arc;
  innerGlow: Phaser.GameObjects.Arc | null;
  beam: Phaser.GameObjects.Rectangle | null;
}

interface GoldDropVisuals {
  container: Phaser.GameObjects.Container;
  amount: number;
}

const RARITY_HEX: Record<Rarity, number> = {
  common:    0xb0b0b0,
  uncommon:  0x4ade80,
  rare:      0x60a5fa,
  epic:      0xc084fc,
  legendary: 0xfbbf24,
};

const RARITY_VFX: Record<Rarity, RarityVFXConfig> = {
  common: {
    color: RARITY_HEX.common,
    outerGlowRadius: 12, outerGlowAlpha: 0.12,
    innerGlowRadius: 0,  innerGlowAlpha: 0,
    beamHeight: 0, beamWidth: 0, beamAlpha: 0,
    burstCount: 4, burstSpeed: 40, burstDuration: 350,
    risePeriod: 0, showLabel: false,
    shakeMs: 0, shakeIntensity: 0,
    cameraFlash: false, showNotification: false, shockwave: false,
  },
  uncommon: {
    color: RARITY_HEX.uncommon,
    outerGlowRadius: 18, outerGlowAlpha: 0.22,
    innerGlowRadius: 0,  innerGlowAlpha: 0,
    beamHeight: 0, beamWidth: 0, beamAlpha: 0,
    burstCount: 6, burstSpeed: 55, burstDuration: 450,
    risePeriod: 0, showLabel: false,
    shakeMs: 0, shakeIntensity: 0,
    cameraFlash: false, showNotification: false, shockwave: false,
  },
  rare: {
    color: RARITY_HEX.rare,
    outerGlowRadius: 22, outerGlowAlpha: 0.28,
    innerGlowRadius: 12, innerGlowAlpha: 0.45,
    beamHeight: 60, beamWidth: 3, beamAlpha: 0.50,
    burstCount: 10, burstSpeed: 70, burstDuration: 550,
    risePeriod: 2.5, showLabel: false,
    shakeMs: 25, shakeIntensity: 0.001,
    cameraFlash: false, showNotification: false, shockwave: false,
  },
  epic: {
    color: RARITY_HEX.epic,
    outerGlowRadius: 28, outerGlowAlpha: 0.35,
    innerGlowRadius: 16, innerGlowAlpha: 0.55,
    beamHeight: 100, beamWidth: 4, beamAlpha: 0.55,
    burstCount: 14, burstSpeed: 85, burstDuration: 650,
    risePeriod: 1.5, showLabel: true,
    shakeMs: 40, shakeIntensity: 0.002,
    cameraFlash: false, showNotification: false, shockwave: false,
  },
  legendary: {
    color: RARITY_HEX.legendary,
    outerGlowRadius: 50, outerGlowAlpha: 0.40,
    innerGlowRadius: 20, innerGlowAlpha: 0.70,
    beamHeight: 200, beamWidth: 5, beamAlpha: 0.70,
    burstCount: 22, burstSpeed: 110, burstDuration: 800,
    risePeriod: 0.8, showLabel: true,
    shakeMs: 100, shakeIntensity: 0.005,
    cameraFlash: true, showNotification: true, shockwave: true,
  },
};

export class LootVFX {
  private scene: Phaser.Scene;
  private itemContainers: Map<string, ItemDropVisuals> = new Map();
  private goldContainers: Map<string, GoldDropVisuals> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  syncDrops(activeDrops: LootDrop[], activeGoldDrops: GoldDrop[]): void {
    // --- Items ---
    const activeLootIds = new Set(
      activeDrops.filter(d => !d.isPickedUp).map(d => d.item.id),
    );
    for (const drop of activeDrops) {
      if (drop.isPickedUp) continue;
      if (!this.itemContainers.has(drop.item.id)) this.createItemVisuals(drop);
    }
    for (const drop of activeDrops) {
      if (drop.isPickedUp) continue;
      const vis = this.itemContainers.get(drop.item.id);
      if (vis && vis.landed) {
        // Tween owns x/y during arc; only track position after landing.
        vis.container.setPosition(drop.x, drop.y);
      }
    }
    const toDeleteItems: string[] = [];
    for (const [id] of this.itemContainers) {
      if (!activeLootIds.has(id)) toDeleteItems.push(id);
    }
    for (const id of toDeleteItems) {
      const vis = this.itemContainers.get(id)!;
      this.spawnPickupBurst(vis.container.x, vis.container.y, vis.rarity);
      vis.container.destroy();
      this.itemContainers.delete(id);
    }

    // --- Gold (getActiveGoldDrops() already filters isPickedUp) ---
    const activeGoldIds = new Set(activeGoldDrops.map(d => d.id));
    for (const drop of activeGoldDrops) {
      if (!this.goldContainers.has(drop.id)) this.createGoldVisuals(drop);
    }
    for (const drop of activeGoldDrops) {
      this.goldContainers.get(drop.id)?.container.setPosition(drop.x, drop.y);
    }
    const toDeleteGold: string[] = [];
    for (const [id] of this.goldContainers) {
      if (!activeGoldIds.has(id)) toDeleteGold.push(id);
    }
    for (const id of toDeleteGold) {
      const vis = this.goldContainers.get(id)!;
      this.spawnPickupBurst(vis.container.x, vis.container.y, 'uncommon');
      vis.container.destroy();
      this.goldContainers.delete(id);
    }
  }

  update(dt: number): void {
    for (const [, vis] of this.itemContainers) {
      if (!vis.landed) continue;
      const cfg = RARITY_VFX[vis.rarity];
      if (cfg.risePeriod <= 0) continue;
      vis.particleTimer += dt;
      if (vis.particleTimer >= cfg.risePeriod) {
        vis.particleTimer = 0;
        this.spawnRisingParticle(vis.container.x, vis.container.y, cfg.color);
      }
    }
  }

  clearAll(): void {
    for (const [, vis] of this.itemContainers) vis.container.destroy();
    this.itemContainers.clear();
    for (const [, vis] of this.goldContainers) vis.container.destroy();
    this.goldContainers.clear();
  }

  private createItemVisuals(drop: LootDrop): void {
    const { item } = drop;
    const cfg = RARITY_VFX[item.rarity];

    // Arc origin: slightly above and horizontally offset from the resting position.
    const arcOffsetX = (Math.random() - 0.5) * 40;       // ±20px horizontal
    const arcStartY  = drop.y - (35 + Math.random() * 20); // 35–55px above

    const container = this.scene.add
      .container(drop.x + arcOffsetX, arcStartY)
      .setDepth(5)
      .setScale(0.4); // grows to 1.0 during arc

    // 1. Outer glow — alpha=0; fades in at landing
    const outerGlow = this.scene.add.circle(0, 0, cfg.outerGlowRadius, cfg.color, 0);
    container.add(outerGlow);

    // 2. Inner glow — alpha=0
    let innerGlow: Phaser.GameObjects.Arc | null = null;
    if (cfg.innerGlowRadius > 0) {
      innerGlow = this.scene.add.circle(0, 0, cfg.innerGlowRadius, cfg.color, 0);
      container.add(innerGlow);
    }

    // 3. Beam — alpha=0
    let beam: Phaser.GameObjects.Rectangle | null = null;
    if (cfg.beamHeight > 0) {
      beam = this.scene.add.rectangle(
        0, -(cfg.beamHeight / 2 + 8),
        cfg.beamWidth, cfg.beamHeight,
        cfg.color, 0,
      );
      container.add(beam);
    }

    // 4. Gem shape (replaces loot_bag sprite)
    const gem = this.drawGemShape(item.rarity);
    container.add(gem);

    // 5. Label (if configured; visible from spawn is fine — small during arc)
    if (cfg.showLabel) {
      const colorStr = `#${cfg.color.toString(16).padStart(6, '0')}`;
      const label = this.scene.add.text(0, -20, item.name, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: colorStr,
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5, 1);
      container.add(label);
    }

    // Register as not-yet-landed
    const vis: ItemDropVisuals = {
      container, rarity: item.rarity, itemName: item.name,
      particleTimer: 0, landed: false,
      gem, outerGlow, innerGlow, beam,
    };
    this.itemContainers.set(item.id, vis);

    // Arc tween: Power2.easeIn simulates gravity (slow start → fast land)
    this.scene.tweens.add({
      targets: container,
      x: drop.x,
      y: drop.y,
      scaleX: 1.0,
      scaleY: 1.0,
      duration: ARC_DURATION,
      ease: 'Power2.easeIn',
      onComplete: () => this.onItemLanded(vis, cfg, drop.x, drop.y),
    });
  }

  private onItemLanded(
    vis: ItemDropVisuals,
    cfg: RarityVFXConfig,
    x: number,
    y: number,
  ): void {
    const { gem, outerGlow, innerGlow, beam } = vis;

    // 1. Gem scale punch: 1.0 → 1.35 → 1.0, 80ms yoyo
    this.scene.tweens.add({
      targets: gem,
      scaleX: 1.35, scaleY: 1.35,
      duration: 80,
      ease: 'Power2.easeOut',
      yoyo: true,
    });

    // 2. Bob tween on gem (perpetual, local y — container.y not affected)
    this.scene.tweens.add({
      targets: gem,
      y: -4,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // 3. Outer glow fade-in → then start pulse loop
    this.scene.tweens.add({
      targets: outerGlow,
      alpha: cfg.outerGlowAlpha,
      duration: 200,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: outerGlow,
          alpha: cfg.outerGlowAlpha * 0.4,
          duration: 1200,
          yoyo: true, repeat: -1,
          ease: 'Sine.easeInOut',
        });
      },
    });

    // 4. Inner glow fade-in
    if (innerGlow) {
      this.scene.tweens.add({
        targets: innerGlow,
        alpha: cfg.innerGlowAlpha,
        duration: 200,
        ease: 'Sine.easeOut',
      });
    }

    // 5. Beam fade-in → then start shimmer loop
    if (beam) {
      this.scene.tweens.add({
        targets: beam,
        alpha: cfg.beamAlpha,
        duration: 300,
        ease: 'Sine.easeOut',
        onComplete: () => {
          this.scene.tweens.add({
            targets: beam,
            alpha: cfg.beamAlpha * 0.5,
            duration: 900,
            yoyo: true, repeat: -1,
            ease: 'Sine.easeInOut',
          });
        },
      });
    }

    // 6. Impact burst (was previously fired at spawn)
    this.spawnImpactBurst(x, y, vis.rarity);

    // 7. Camera effects
    if (cfg.shakeMs > 0) this.scene.cameras.main.shake(cfg.shakeMs, cfg.shakeIntensity);
    if (cfg.cameraFlash) this.scene.cameras.main.flash(400, 251, 191, 36, false);
    if (cfg.showNotification) this.spawnLegendaryNotification(vis.itemName);

    // 8. Stagger rising-particle timer
    if (cfg.risePeriod > 0) vis.particleTimer = Math.random() * cfg.risePeriod;

    // 9. Enable position tracking in syncDrops
    vis.landed = true;
  }

  private drawGemShape(rarity: Rarity): Phaser.GameObjects.Graphics {
    const color = RARITY_HEX[rarity];
    const gfx = this.scene.add.graphics();

    gfx.fillStyle(color, 1);

    switch (rarity) {
      case 'common':
        gfx.fillRoundedRect(-5, -5, 10, 10, 2);
        break;

      case 'uncommon':
        gfx.beginPath();
        gfx.moveTo(0, -6);
        gfx.lineTo(5, 0);
        gfx.lineTo(0, 6);
        gfx.lineTo(-5, 0);
        gfx.closePath();
        gfx.fillPath();
        break;

      case 'rare': {
        const r = 9;
        gfx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 6; // flat-top orientation
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          if (i === 0) gfx.moveTo(px, py); else gfx.lineTo(px, py);
        }
        gfx.closePath();
        gfx.fillPath();
        break;
      }

      case 'epic': {
        const outerR = 11, innerR = 5, pts = 6;
        gfx.beginPath();
        for (let i = 0; i < pts * 2; i++) {
          const r = i % 2 === 0 ? outerR : innerR;
          const a = (Math.PI / pts) * i - Math.PI / 2;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          if (i === 0) gfx.moveTo(px, py); else gfx.lineTo(px, py);
        }
        gfx.closePath();
        gfx.fillPath();
        break;
      }

      case 'legendary': {
        const outerR = 13, innerR = 6, pts = 8;
        gfx.beginPath();
        for (let i = 0; i < pts * 2; i++) {
          const r = i % 2 === 0 ? outerR : innerR;
          const a = (Math.PI / pts) * i - Math.PI / 2;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          if (i === 0) gfx.moveTo(px, py); else gfx.lineTo(px, py);
        }
        gfx.closePath();
        gfx.fillPath();
        // Inner circle accent
        gfx.fillStyle(0xffffff, 0.25);
        gfx.fillCircle(0, 0, 5);
        break;
      }
    }

    // Specular highlight — small white dot near top-left of all shapes
    gfx.fillStyle(0xffffff, 0.45);
    gfx.fillCircle(-3, -3, 2);

    return gfx;
  }

  private createGoldVisuals(drop: GoldDrop): void {
    const { amount } = drop;
    const scale      = amount <= 15 ? 1.0 : amount <= 50 ? 1.35 : amount <= 150 ? 1.75 : 2.3;
    const glowRadius = amount <= 15 ? 0   : amount <= 50 ? 12   : amount <= 150 ? 18   : 28;

    const container = this.scene.add.container(drop.x, drop.y).setDepth(5).setScale(0);

    if (glowRadius > 0) {
      const glow = this.scene.add.circle(0, 0, glowRadius, 0xfde68a, 0.20);
      container.add(glow);
      this.scene.time.delayedCall(180, () => {
        this.scene.tweens.add({
          targets: glow, alpha: 0.08, duration: 1200,
          yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
      });
    }

    const sprite = this.scene.add.sprite(0, 0, 'gold_coin').setScale(scale);
    container.add(sprite);
    this.scene.time.delayedCall(180, () => {
      this.scene.tweens.add({
        targets: sprite, y: -3, duration: 600,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    });

    const labelStr = amount >= 1000 ? `${(amount / 1000).toFixed(1)}k` : `${amount}`;
    const label = this.scene.add.text(0, -10 * scale, labelStr, {
      fontFamily: 'monospace', fontSize: '8px',
      color: '#fde68a', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 1);
    container.add(label);

    // Scale pop: 0 → 1.3 → 1.0 over 180ms
    this.scene.tweens.add({
      targets: container, scaleX: 1.3, scaleY: 1.3,
      duration: 100, ease: 'Power2.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: container, scaleX: 1.0, scaleY: 1.0,
          duration: 80, ease: 'Power2.easeIn',
        });
      },
    });

    this.goldContainers.set(drop.id, { container, amount });
  }

  private spawnImpactBurst(x: number, y: number, rarity: Rarity): void {
    const cfg = RARITY_VFX[rarity];
    for (let i = 0; i < cfg.burstCount; i++) {
      const angle = (i / cfg.burstCount) * Math.PI * 2;
      const speed = cfg.burstSpeed * (0.7 + Math.random() * 0.6);
      const dist  = speed * (cfg.burstDuration / 1000);
      const particle = this.scene.add.circle(x, y, 2.5, cfg.color, 1).setDepth(12);
      this.scene.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scaleX: 0.1,
        scaleY: 0.1,
        duration: cfg.burstDuration,
        ease: 'Power2',
        onComplete: () => particle.destroy(),
      });
    }
    if (cfg.shockwave) {
      this.spawnShockwaveRing(x, y);
    }
  }

  private spawnShockwaveRing(x: number, y: number): void {
    const gfx = this.scene.add.graphics().setDepth(12);
    gfx.lineStyle(3, 0xfbbf24, 0.8);
    gfx.strokeCircle(x, y, 8);
    this.scene.tweens.add({
      targets: gfx,
      scaleX: 6,
      scaleY: 6,
      alpha: 0,
      duration: 500,
      ease: 'Power2',
      onComplete: () => gfx.destroy(),
    });
  }

  private spawnRisingParticle(containerX: number, containerY: number, color: number): void {
    const px = containerX + (Math.random() - 0.5) * 20;
    const particle = this.scene.add.circle(px, containerY, 2, color, 0.7).setDepth(6);
    this.scene.tweens.add({
      targets: particle,
      y: containerY - (35 + Math.random() * 15),
      alpha: 0,
      duration: 1200 + Math.random() * 600,
      ease: 'Sine.easeOut',
      onComplete: () => particle.destroy(),
    });
  }

  private spawnPickupBurst(x: number, y: number, rarity: Rarity): void {
    const cfg   = RARITY_VFX[rarity];
    const count = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 40;
      const particle = this.scene.add.circle(x, y, 2, cfg.color, 0.9).setDepth(12);
      this.scene.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0,
        duration: 200,
        ease: 'Power2',
        onComplete: () => particle.destroy(),
      });
    }
  }

  private spawnLegendaryNotification(itemName: string): void {
    const cam  = this.scene.cameras.main;
    const text = this.scene.add
      .text(cam.centerX, -40, `\u2726 ${itemName} \u2726`, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#fbbf24',
        stroke: '#000000',
        strokeThickness: 4,
        fontStyle: 'bold',
      })
      .setScrollFactor(0)
      .setDepth(200)
      .setOrigin(0.5)
      .setAlpha(0);

    this.scene.tweens.add({
      targets: text,
      y: 60,
      alpha: 1,
      duration: 400,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: text,
          alpha: 0,
          delay: 2500,
          duration: 600,
          onComplete: () => text.destroy(),
        });
      },
    });
  }
}
