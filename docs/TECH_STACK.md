# Tech Stack — Realms of Clickoria ARPG

## Core Technologies

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Phaser 3** | ^3.90 | Game framework | 2D rendering (WebGL/Canvas), physics (Arcade), tilemaps, sprite animation, camera, input, audio. Battle-tested, huge community, zero GUI required — pure code. |
| **TypeScript** | ^5.9 | Language | Type safety across 15k+ lines. Catches misspelled properties, wrong function args, missing fields at compile time instead of runtime. Codebase will grow large — types pay for themselves. |
| **Vite** | ^7.3 | Dev server + bundler | Near-instant HMR, native ES module dev server, fast production builds. Replaces the "just open index.html" workflow with `npm run dev` + auto-reload. |

## Why These Over Alternatives

### Why Phaser over PixiJS?
- PixiJS is just a renderer. Phaser includes physics, tilemaps, animation, audio, input, cameras — all things we need.
- Building those systems on top of PixiJS would take weeks. Phaser has them built-in.
- Phaser's Arcade physics is simple enough for a 2D ARPG (no need for Matter.js complexity).

### Why Phaser over Godot/Unity?
- 100% code, no GUI. Perfect for vibe-coding with Claude Code.
- Stays in the web ecosystem (JavaScript/TypeScript). No new language to learn.
- Deploys to any browser. No export step, no engine overhead.
- The clicker codebase's patterns (event bus, game state, system architecture) map directly.

### Why TypeScript over vanilla JS?
- The clicker repo is 16k lines of JS. The ARPG will be larger.
- 46 skills, 61 affixes, 54 monsters, 15 legendaries — lots of data structures where a typo causes silent bugs.
- IDE autocomplete on Phaser's API is dramatically better with TS.
- Strict mode catches null/undefined issues before they become runtime crashes.

### Why Vite over no build step?
- TypeScript requires compilation. Vite makes this invisible — just `npm run dev`.
- HMR means changes appear in the browser instantly without full reload.
- Path aliases (`@/systems/combat`) keep imports clean as the project grows.
- Production builds are tree-shaken and optimized.

## Dev Workflow

```bash
# Install dependencies
npm install

# Start dev server (opens browser at localhost:3000)
npm run dev

# Type-check without building
npx tsc --noEmit

# Production build to dist/
npm run build

# Preview production build locally
npm run preview
```

## Project Structure

```
realms_arpg/
├── index.html              # Entry point (minimal — just a canvas container)
├── package.json            # Dependencies + scripts
├── tsconfig.json           # TypeScript config (strict, ESNext)
├── vite.config.ts          # Vite config (port 3000, path aliases)
│
├── src/
│   ├── main.ts             # Phaser game config + scene registration
│   │
│   ├── scenes/             # Phaser scenes (replace clicker's ui/ folder)
│   │   ├── BootScene.ts    # Asset loading, placeholder textures
│   │   ├── GameScene.ts    # Main gameplay (world, entities, camera)
│   │   └── UIScene.ts      # HUD overlay (HP bars, skill bar, minimap)
│   │
│   ├── systems/            # Game logic (ported/adapted from clicker)
│   │   └── ...             # combat, player, skills, items, status-effects, etc.
│   │
│   ├── entities/           # NEW — game objects with spatial presence
│   │   └── ...             # Player, Monster, Projectile classes
│   │
│   ├── data/               # Static game data (ported from clicker)
│   │   └── ...             # constants, balance, skills, monsters, items, zones
│   │
│   ├── core/               # Framework-level modules
│   │   └── ...             # event-bus, game-state (game-loop replaced by Phaser)
│   │
│   └── ui/                 # Phaser-based UI components
│       └── ...             # HealthBar, SkillBar, DamageNumbers, etc.
│
├── assets/
│   ├── sprites/            # Character/monster spritesheets
│   ├── tilemaps/           # Tiled JSON maps + tilesets
│   └── audio/              # Sound effects + music
│
└── docs/                   # Documentation
    ├── TECH_STACK.md        # This file
    ├── CLICKER_REFERENCE.md # What we're porting from
    └── ARCHITECTURE.md      # How systems connect
```

## Optional Tools

| Tool | Purpose | Required? |
|------|---------|-----------|
| **Tiled** | Visual tilemap editor | Optional — exports JSON, can also generate maps in code |
| **TexturePacker** | Spritesheet packing | Optional — Phaser can load individual frames too |
| **Aseprite** | Pixel art creation | Optional — for when we move past colored rectangles |

## Deployment

- **Development:** `npm run dev` → localhost:3000
- **Production:** `npm run build` → `dist/` folder → deploy anywhere (Netlify, Vercel, GitHub Pages)
- GitHub Pages works with Vite builds via `vite build --base=/repo-name/`
