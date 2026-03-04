# Art Overhaul Roadmap

Status: Active
Reference: `docs/ART_BIBLE_V1.md` (v1.1)
Last updated: 2026-03-04

---

## Current State

The game currently has:
- Player is a plain circle with minimal animation
- Monsters are basic geometric shapes (triangles, squares) with color tints
- No consistent art style — some elements look pixelated, others don't
- No skill/item icons (text placeholders)
- No post-processing effects (no vignette, no fog, no atmosphere)
- UI panels are functional but don't match the "Arcane Low-Fi Noir" feel
- UI is not responsive to different viewport sizes
- No proper environment art (flat colored backgrounds)
- VFX exist but aren't unified under the art bible palette

**Target**: Every visual element follows the Art Bible v1.1 — "Arcane Low-Fi Noir" style, consistent SVGs, unified palette, readable at gameplay speed.

---

## Phase 1 — Foundation

*Everything downstream depends on this phase. Do it first.*

### 1.1 Create palette constants file
- [ ] Create `src/data/palette.ts` with all color tokens from Art Bible Section 5
- [ ] Export base neutrals (`BG_DEEP`, `BG_MID`, `BG_SURFACE`, etc.)
- [ ] Export gameplay accents (`ARCANE`, `NATURE`, `VOID`, `FIRE`, `GOLD`, `DANGER`)
- [ ] Export zone-specific sub-palettes (Whisperwood, Dusthaven, etc.)
- [ ] Replace all hardcoded hex values across the codebase with palette references

### 1.2 SVG asset utility
- [ ] Create `src/utils/svg-helpers.ts` — shared functions for SVG→Phaser texture generation
- [ ] Helper: `registerSVGTexture(scene, key, svgString, width, height)` — renders SVG to canvas, creates Phaser texture
- [ ] Helper: `createGradientDef(id, colors, direction)` — reusable SVG gradient builder
- [ ] Helper: `createRimLighting(baseColor)` — returns edge highlight paths following upper-left light rule
- [ ] Validate approach works with Phaser's texture manager before proceeding

### 1.3 Art Bible integration
- [ ] Add art bible reference link to `CLAUDE.md` under Documentation table
- [ ] Add memory entry noting SVG creation patterns and palette file location

---

## Phase 2 — Player

*Most visible element on screen. Highest immediate impact.*

### 2.1 Player base sprite
- [ ] Design player SVG: rounded humanoid silhouette, slightly top-heavy
- [ ] Directional facing indicator (asymmetric element or weapon glow)
- [ ] Register as Phaser texture, replace current circle in `PlayerEntity.ts`
- [ ] Verify silhouette reads clearly at 64x64 gameplay size

### 2.2 Player animation polish
- [ ] Idle bob (1.5-3% vertical, 1.0-1.5s cycle) — verify or adjust existing
- [ ] Move stretch (up to 6% directional)
- [ ] Attack windup squash (8-12% toward attack direction)
- [ ] Attack release overshoot + recoil (100-160ms)
- [ ] Hit react flash + knockback pop (70-120ms)
- [ ] Death shrink/fade with burst (250-450ms)

### 2.3 Player state visuals audit
- [ ] Verify state layering order matches Art Bible Section 6.2:
  - Base → Wrath tint → Flow glow → Primed pulse → Stealth alpha → Resonance motes
- [ ] Wrath: red body tint (not just screen vignette)
- [ ] Flow: amber aura ring at feet
- [ ] Primed: white scale-pulse on body
- [ ] Stealth: alpha + desaturation
- [ ] Resonance motes: use `FIRE` for Ash, `ARCANE` for Ember from palette

---

## Phase 3 — Monsters

*Combat readability depends on distinct monster silhouettes.*

### 3.1 Monster SVG sprites (top 6)
- [ ] Identify the 6 most common monsters in current zones
- [ ] Design SVGs following shape language rules:
  - Melee: broad base, forward weight
  - Ranged/caster: narrower, taller or floating
  - Each with max 3 internal detail groups
- [ ] Elite variants: 1.4x normal silhouette area
- [ ] Register textures, replace geometric placeholders in `MonsterEntity`

### 3.2 Monster type visual differentiation
- [ ] `normal`: neutral colors, standard silhouette
- [ ] `swift`: sleeker shape, motion lines or trailing edge
- [ ] `aggressive`: spikier edges, forward-leaning
- [ ] `regenerating`: organic/pulsing detail, green accent
- [ ] `armored`: heavier base, angular plates
- [ ] `shielded`: visible barrier outline or glow shell

### 3.3 Monster state overlays
- [ ] Audit existing Sundered/Charged/Staggered visuals against art bible
- [ ] Sundered: crack lines + dust particles (using `DANGER` palette)
- [ ] Charged: lightning arcs + blue sparks (using `ARCANE` palette)
- [ ] Staggered: sprite tilt tween (already exists — verify timing)

### 3.4 Monster animation
- [ ] Idle bob per monster (varied timing to avoid synchronization)
- [ ] Hit react flash + pop
- [ ] Death burst with monster-tinted particles

---

## Phase 4 — Combat VFX

*The "feel" layer. Makes hits satisfying.*

### 4.1 Audit against 3-layer rule
- [ ] Catalog every hit type: basic melee, basic ranged, physical skill, magic skill, resonance release
- [ ] For each, verify: contact layer + motion layer + persistence layer
- [ ] Identify gaps (missing layers) and create fix list

### 4.2 Unify VFX color palette
- [ ] All physical impact sparks: `FIRE`/`GOLD` family
- [ ] All magic impact sparks: `ARCANE`/`VOID` family
- [ ] All crit effects: brighter version of base + extra burst
- [ ] Replace any hardcoded VFX colors with palette tokens

### 4.3 Status effect VFX
- [ ] Poison: `NATURE` green tick particles
- [ ] Burn: `FIRE` orange/red flame wisps
- [ ] Freeze/Slow: `ARCANE` cyan frost overlay
- [ ] Bleed: `DANGER` crimson drip particles
- [ ] Void effects: `VOID` violet swirl

### 4.4 Resonance release visuals
- [ ] Ashburst: red/orange shockwave ring using `FIRE` palette
- [ ] Overload: cyan/blue energy burst using `ARCANE` palette
- [ ] Duality: combined color burst
- [ ] Camera zoom pulse on release (0.95 → 1.0, already partially implemented)

---

## Phase 5 — Environment

*Transforms the game from "colored rectangles" to a world.*

### 5.1 Floor and wall tileset (Zone 1)
- [ ] Design base floor tile SVG (32x32, composable)
- [ ] Design wall/edge tile SVGs (top, side, corner variants)
- [ ] Design 2-3 floor variation tiles (cracks, stains, moss)
- [ ] Integrate with tilemap system
- [ ] Test seamless tiling at gameplay camera

### 5.2 Zone props
- [ ] Zone 1 prop family A (e.g., roots, mushrooms, fallen logs)
- [ ] Zone 1 prop family B (e.g., stones, rubble, rune markers)
- [ ] Props as Phaser static sprites with proper depth sorting
- [ ] Verify props don't obscure gameplay elements

### 5.3 Atmosphere layers
- [ ] Base fog gradient layer (very subtle, zone-tinted)
- [ ] Drifting particle system (sparse, low-opacity embers/dust/spores)
- [ ] Zone vignette overlay (dark edges, zone accent color)
- [ ] Keep all atmosphere layers at low opacity (combat clarity > mood)

### 5.4 Outside-map treatment
- [ ] Texture/noise beyond playable area (not flat black/void)
- [ ] Fade transition at map edges (broken borders, tint fade)
- [ ] Consistent across all zone types

---

## Phase 6 — UI Overhaul

*Bring panels, bars, and icons into the art bible.*

### 6.1 Panel restyling
- [ ] All panel backgrounds: `BG_DEEP` → `BG_MID` → `BG_SURFACE` depth layers
- [ ] Panel borders: `STROKE_SOFT` with subtle inner glow
- [ ] 8px spacing rhythm everywhere (padding, margins, gaps)
- [ ] Consistent corner radius across all panels

### 6.2 HUD bars
- [ ] HP bar: gradient with `DANGER` accent
- [ ] Energy bar: gradient with `ARCANE` accent
- [ ] XP bar: gradient with `GOLD` accent
- [ ] Bar backgrounds: `BG_DEEP` with subtle inner border
- [ ] Bar text: `TEXT_MAIN` values, `TEXT_DIM` labels

### 6.3 Skill and item icons
- [ ] Design SVG icons for all 31 active skills (small, high-contrast glyphs)
- [ ] Design SVG icons for equipment slot types (weapon, helmet, chest, gloves, boots, accessory)
- [ ] Design SVG icons for item rarities (border/corner treatments)
- [ ] Design SVG icons for status effects (poison vial, flame, snowflake, blood drop, void swirl)
- [ ] Register all as Phaser textures with consistent sizing

### 6.4 Interactable visuals
- [ ] Chest SVGs with rarity-driven auras (Section 14 of art bible)
- [ ] Portal SVG with arcane glow
- [ ] Shrine/station SVGs for hub
- [ ] Loot drop ground glow (brighter than surrounding, rarity-colored)

### 6.5 Responsive layout
- [ ] Set min/max panel widths (280px min, 480px max)
- [ ] Panels overlay on narrow viewports (< 1024px)
- [ ] HUD elements never overlapped by panels
- [ ] Font size hierarchy: 20/16/14/13/11px as per art bible
- [ ] Touch targets: min 32x32px hit areas

---

## Phase 7 — Post-Processing and Polish

*Final layer that ties everything together.*

### 7.1 Screen-space effects
- [ ] Persistent subtle vignette (dark edges)
- [ ] Zone-specific color grading (tint shift per zone palette)
- [ ] Optional CRT/noise scanline (very subtle, toggleable)

### 7.2 Camera feel audit
- [ ] Normal hit shake: <=80ms, low intensity
- [ ] Crit/elite shake: <=140ms, medium intensity
- [ ] Boss slam shake: <=220ms, higher intensity
- [ ] Verify no shake chains that obscure control
- [ ] Smooth camera follow (slight lag for weight)

### 7.3 Final readability pass
- [ ] Screenshot every major screen state (combat, inventory, skill codex, merchant, stash)
- [ ] Run each screenshot against Section 15 pass/fail gates
- [ ] Verify: player readable, enemies readable, loot readable, UI readable
- [ ] Fix any remaining contrast/readability issues
- [ ] Verify all color usage follows Section 5.3 rules (max 2 accents + gold per scene)

---

## Dependency Graph

```
Phase 1 (Foundation)
  ├── Phase 2 (Player)
  ├── Phase 3 (Monsters)
  ├── Phase 4 (Combat VFX)
  ├── Phase 5 (Environment)
  └── Phase 6 (UI Overhaul)
        └── Phase 7 (Post-Processing & Polish)
```

Phase 1 blocks everything. Phases 2-5 can be worked on in any order after Phase 1 (though Player → Monsters → VFX is the recommended flow since each builds visual context for the next). Phase 6 can run in parallel with 2-5. Phase 7 is always last.

---

## Notes

- Each phase should be committed separately with before/after screenshots.
- After each phase, run the pass/fail quality gates (Art Bible Section 15) on affected areas.
- If an SVG approach proves too complex for a specific asset (e.g., dense tile textures), fall back to PNG — but document why.
- Zone-specific work (Phase 5) starts with Zone 1 only. Additional zones follow the same template.
