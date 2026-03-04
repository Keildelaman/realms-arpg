# Art Bible V1

Status: Active v1.1
Owner: Visual Direction / Gameplay Feel
Last updated: 2026-03-04

## 1. Purpose

Define a strict visual system so all future assets (world, monsters, UI, VFX) stay consistent while being generated with AI and integrated by code only.

This is not a loose inspiration doc. It is a pass/fail rule set.

## 2. Core Constraints

- `No manual drawing, rigging, or frame-by-frame animation.`
- `AI-authored assets only` — SVGs written directly in code (PNG fallback for complex textures).
- Animation is `code-driven` (tweens, squash/stretch, recoil, pulse, shader-like overlays).
- Art direction must remain stable across all zones and UI.
- Readability and combat feedback are higher priority than detail.

## 3. Style Direction (Locked)

Working style name: `Arcane Low-Fi Noir`.

Visual identity:
- Dark, moody world base.
- Bright combat accents (cyan, amber, violet) for hits/skills/rewards.
- Chunky silhouettes, simple internal detail.
- Clean geometric readability (not realistic painting).
- Subtle atmospheric layers (fog/noise/glow) to avoid flatness.

This style intentionally sits between:
- minimalist geometry readability
- richer ARPG combat feedback and atmosphere

## 4. Visual Pillars (Must Always Hold)

1. Readability First  
- Player, enemies, hazards, loot, interactables must be identifiable in <250ms.

2. Contrast by Role  
- Gameplay-critical objects use stronger edge contrast and controlled glow.
- Background and props stay lower contrast.

3. Consistent Material Logic  
- Same edge highlight, shadow direction, and outline rule across all assets.

4. Feedback Over Detail  
- Satisfaction comes from timing, impact, and VFX layering, not intricate textures.

## 5. Color System (Global Tokens)

### 5.1 Base Neutrals
- `bg-deep`: `#0B1220`
- `bg-mid`: `#111D33`
- `bg-surface`: `#17243D`
- `stroke-soft`: `#29456C`
- `text-main`: `#E2E8F0`
- `text-dim`: `#94A3B8`

### 5.2 Gameplay Accents
- `arcane`: `#7DD3FC`
- `nature`: `#4ADE80`
- `void`: `#C084FC`
- `fire`: `#F97316`
- `gold`: `#FBBF24`
- `danger`: `#F87171`

### 5.3 Usage Rules
- One scene can use max `2 dominant accents + gold`.
- Background never exceeds 55% luminance.
- Enemy outlines must be at least 20% brighter or darker than their fill.
- Loot/chest highlights must be top 10% luminance in scene.

## 6. Shape Language

### 6.1 Silhouette Rules
- Player silhouette: rounded + directional marker.
- Melee enemies: broad base, forward weight.
- Ranged/caster enemies: narrower, taller or floating profiles.
- Elite/boss enemies: at least 1.4x normal silhouette area.

### 6.2 Player Visual Identity
The player is the most important visual element on screen. Dedicated rules:
- **Base shape**: Rounded humanoid silhouette, slightly top-heavy (shoulders wider than legs). Not a circle — a recognizable figure.
- **Directional marker**: Subtle facing indicator (weapon glow, asymmetric shoulder, or visor slit) so facing direction is readable at a glance.
- **Weapon influence**: Melee stance = compact + grounded; ranged stance = slightly taller + one arm extended; magic stance = floating particles or rune halo near hands.
- **State visual layering order** (bottom to top):
  1. Base sprite body
  2. Wrath tint overlay (red shift on body)
  3. Flow glow (amber aura ring around feet)
  4. Primed pulse (white scale-pulse on body)
  5. Stealth (alpha reduction + desaturation)
  6. Resonance motes (orbiting particles, always topmost)
- States must be distinguishable when stacked — no two states should use the same color channel.

### 6.3 Detail Budget
- Per sprite max 3 internal detail groups (e.g., eyes, crest, core).
- No tiny noise details that disappear at gameplay camera zoom.

## 7. Asset Production Pipeline (AI-Only)

### 7.1 Output Targets
- Preferred source: SVG (written inline in code, not external image generators).
- Runtime texture sizes:
  - Units: 64x64, 96x96, 128x128 (bosses up to 192x192).
  - Props: 32x32 to 128x128.
  - Tiles: 32x32 base modules (allows finer map control), composable into 64x64 visual groups.

### 7.1.1 SVG Technical Constraints
- **ViewBox**: Always use `0 0 W H` where W/H matches the runtime texture size (e.g., `0 0 64 64`). Asset centered within viewBox.
- **Path complexity budget**: Units max ~30-40 paths. Props max ~15-20 paths. Tiles max ~10 paths. Simpler = faster rendering.
- **Gradients**: Linear gradients OK for depth/shading. Radial gradients allowed but max 50% of asset area. No complex multi-stop noise gradients.
- **Stroke widths**: 2px outlines for units, 1.5px for interactables, 1px for props/tiles. Consistent within category.
- **Fill rule**: Use `fill` for solid areas, avoid `clip-path` and `mask` for runtime performance.
- **No embedded raster**: SVGs must not contain `<image>` tags with base64 data. Pure vector only.

### 7.2 Asset Categories
- `Units`: player, monsters, bosses.
- `Environment`: floor tiles, wall tiles, blockers, props, decals.
- `Interactables`: chest, portal, shrine-like objects.
- `UI`: panel ornaments, iconography, button glyphs.
- `VFX sprites`: sparks, smoke puffs, slash marks, rune circles, beam masks.

### 7.3 Naming Convention (Strict)
- `unit_<faction>_<name>_v01.svg`
- `env_<zone>_<type>_<variant>_v01.svg`
- `prop_<zone>_<name>_<variant>_v01.svg`
- `ui_<group>_<name>_v01.svg`
- `vfx_<type>_<variant>_v01.svg`

No spaces, no camelCase in filenames.

## 8. Style Reference Checklist (Per Asset)

All assets are created as inline SVGs written directly in code. Before writing any SVG, verify against this checklist:

### 8.1 Mandatory Checks
- [ ] **Style lock**: Arcane Low-Fi Noir — dark fantasy mood, flat-shaded with gentle gradients, no photorealism
- [ ] **Perspective**: Top-down, no isometric, no side view
- [ ] **Silhouette**: Clean, readable at gameplay camera zoom — identifiable shape in <250ms
- [ ] **Edge lighting**: Consistent upper-left light source, subtle rim light on right/bottom edges
- [ ] **Detail budget**: Max 3 internal detail groups per unit sprite
- [ ] **Color tokens**: Uses only palette colors from Section 5 (no ad-hoc hex values)
- [ ] **Value range**: Dark-mid base fills, clear light-dark separation on edges
- [ ] **Output**: Centered in viewBox, transparent background, no text/watermarks in SVG

### 8.2 Reject If
- Looks painterly, photorealistic, or pixel-art
- Has cluttered micro-detail that disappears at zoom
- Uses colors outside the palette without explicit zone-specific justification
- Breaks silhouette readability when scaled to runtime size

## 9. Animation System (Code-Driven Only)

No rigging pipeline. All motion comes from transform/timing logic in code.

### 9.1 Unit Motion Presets
- `Idle`: 1.5%-3.0% vertical bob, 1.0-1.5s cycle.
- `Move`: directional stretch up to 6%.
- `Attack windup`: 8%-12% squash toward attack direction.
- `Attack release`: overshoot + recoil in 100-160ms.
- `Hit react`: 1-frame flash + 70-120ms knockback pop.
- `Death`: shrink/fade with burst particles (250-450ms).

### 9.2 Camera Feel Budget
- Normal hit shake: low intensity, <=80ms.
- Crit/elite hit shake: medium, <=140ms.
- Boss slams only: higher intensity, <=220ms.

Never chain long shakes that obscure control.

## 10. Combat VFX Rules

Every hit should combine at least 3 layers:

1. Contact layer  
- Flash, spark, impact ring.

2. Motion layer  
- Slash arc, streak, projectile trail, recoil.

3. Persistence layer  
- Short-lived decal, ember, or dissipating smoke (0.2-0.8s).

Critical hits add:
- larger ring
- brighter accent
- extra particle burst

Status effects must have unique color identity:
- Poison: green
- Burn: orange/red
- Freeze/slow: cyan
- Bleed: crimson
- Arcane/void: violet

## 11. Environment and Atmosphere

### 11.1 Map Look Targets
- Walkable area must visually feel continuous (not box-corridor-box).
- Edge transitions use broken borders, debris, and tint fade.
- Outside-playable area must be textured/noisy, never flat color.

### 11.2 Atmosphere Layers
- Base gradient fog layer (very subtle).
- Sparse drifting particles.
- Zone-tinted vignette.
- Optional light shafts/rune haze on rare points of interest.

Keep atmosphere at low opacity to preserve combat clarity.

## 12. UI Visual Rules

UI must follow the same world palette family (already close in current theme).

### 12.1 Layout Rules
- **8px rhythm** for all spacing, padding, and margins (multiples of 8: 8, 16, 24, 32...).
- Clear hierarchy: Title > Section > Label > Value.
- Buttons: stable default + clear hover + press feedback.
- Text is always legible on first glance (contrast priority over style).
- If space is available, prefer breathing room over dense compaction.

### 12.2 Font Size Hierarchy
- **Title**: 20px bold (`text-main`)
- **Section header**: 16px semibold (`text-main`)
- **Label**: 13px regular (`text-dim`)
- **Value/body**: 14px regular (`text-main`)
- **Small/caption**: 11px regular (`text-dim`)
- All text uses a single font family (system sans-serif or loaded game font).

### 12.3 Panel Sizing
- **Min panel width**: 280px (ensures readability on smaller viewports).
- **Max panel width**: 480px (prevents over-stretching on wide screens).
- **Panel height**: Content-driven, but scrollable beyond 70% viewport height.
- **Tooltip max width**: 260px.
- **Touch/click targets**: Min 32x32px hit area (even if visual element is smaller).

### 12.4 Responsive Behavior
- Panels anchor to screen edges (inventory=right, skill codex=left, etc.).
- On viewport < 1024px wide: panels overlay game area (semi-transparent backdrop).
- On viewport >= 1024px wide: panels can sit alongside game area if space allows.
- HUD elements (HP/energy bars, skill bar) always visible, never overlapped by panels.

## 13. Zone Visual Identity Matrix

Each zone gets:
- 1 primary hue
- 1 secondary hue
- 1 accent hue (combat/highlight)
- 2 prop families

Example structure:
- Whisperwood: moss green + bark brown, cyan accent, roots + stones.
- Dusthaven: ochre + slate, amber accent, bones + cracked pillars.

Rule: zone identity changes by palette/props/atmosphere, not by breaking global style.

## 14. Chest and Loot Visual Hierarchy

Chest rarity readability from distance:
- Common: neutral metal/wood, no aura.
- Uncommon: faint green pulse.
- Rare: blue pulse + tiny particles.
- Epic: violet aura + stronger pulse.
- Legendary: gold aura + beam + sparkle cadence.

Loot visuals must be brighter than surrounding ground by default.

## 15. Pass/Fail Quality Gates (Before Merge)

An asset batch fails if any is true:
- Looks like a different game style.
- Low contrast at gameplay camera.
- Outline/lighting rule inconsistent.
- Too detailed to read while moving.
- VFX obscures player/enemy hitboxes.
- UI text unreadable at 100% scale.

An asset batch passes when:
- In-scene readability is immediate.
- It matches palette + shape language + lighting rules.
- It improves feel without adding visual noise.

## 16. Production Workflow (Per Asset)

All assets are created as SVGs directly in code (no external generation pipeline).

1. **Define asset brief** — category, role, zone, shape language target, size.
2. **Write SVG** — Build the SVG following the Style Reference Checklist (Section 8). Start simple, add detail groups incrementally.
3. **Verify checklist** — Run through Section 8 checks. Reject and revise if any fail.
4. **In-game test** — Load at gameplay camera zoom. Check readability, silhouette clarity, palette fit.
5. **Adjust** — Tweak scale, stroke widths, colors, or simplify paths based on in-game result.
6. **VFX interaction check** — Verify hit VFX, loot glow, and status overlays remain readable on/around the asset.
7. **Commit** — Include before/after screenshots in commit message or PR description.

## 17. V1 Priority Backlog (Recommended)

1. Replace player placeholder circle with style-locked sprite pack (idle-ready single sprite).  
2. Replace top 6 most common monster placeholders with silhouette-strong variants.  
3. Add zone floor/wall tile set for Whisperwood + one prop family.  
4. Add outside-map texture layer + atmosphere particles for expeditions.  
5. Replace chest and portal visuals with rarity/readability-driven versions.  
6. Unify combat hit VFX palette and timing against this bible.

## 18. Non-Negotiables Summary

- Keep one style language.
- Prioritize readability and feel.
- Use AI as a deliberate craftsman, not a randomizer.
- Enforce pass/fail gates every batch.
- Do not introduce assets that "look cool alone" but break scene cohesion.
