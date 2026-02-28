# Repository Guidelines

## Project Structure & Module Organization
Core game code is in `src/`:
- `src/scenes/` for Phaser scenes (`BootScene`, `GameScene`, `UIScene`)
- `src/entities/` for world objects (player, monsters, projectiles, VFX)
- `src/systems/` for gameplay logic (combat, movement, skills, loot, progression)
- `src/data/` for static definitions and balance values
- `src/core/` for shared state and event bus
- `src/ui/` for HUD and overlay components

Other key folders:
- `tests/specs/` Playwright end-to-end specs
- `tests/fixtures/`, `tests/helpers/` shared test setup/helpers
- `assets/` game assets
- `docs/` architecture and design references
- `dist/` production output (generated)

## Build, Test, and Development Commands
- `npm run dev` starts the Vite dev server on `http://localhost:3000`
- `npm run build` type-checks (`tsc --noEmit`) and builds production assets
- `npm run preview` serves the built app from `dist/`
- `npm run test` runs Playwright tests (`tests/playwright.config.ts`)
- `npm run test:ui` opens Playwright UI mode
- `npm run test:headed` runs browser tests visibly
- `npm run test:debug` runs Playwright in debug mode

## Coding Style & Naming Conventions
- Language: TypeScript (strict mode enabled in `tsconfig.json`)
- Indentation: 2 spaces; use semicolons and trailing commas where present
- Naming: `camelCase` for variables/functions, `PascalCase` for classes/types, `UPPER_SNAKE_CASE` for shared constants
- File names: `PascalCase.ts` for class-like modules (e.g., `PlayerEntity.ts`), `camelCase.ts` for systems/data modules (e.g., `combat.ts`)
- Use path alias imports via `@/*` for `src/*`
- Keep architecture boundaries: systems handle logic/state, scenes/entities handle Phaser objects

## Testing Guidelines
- Framework: Playwright (`@playwright/test`) with specs in `tests/specs/*.spec.ts`
- Prefer behavior-focused names, e.g., `test('clicking performs an attack', ...)`
- For gameplay or balance changes, add or update at least one relevant spec
- Run `npm run test` before opening a PR; use `test:headed` when debugging flaky interactions

## Commit & Pull Request Guidelines
- Follow Conventional Commit style seen in history: `feat: ...` (use `fix:`, `refactor:`, `test:` as applicable)
- Keep commits focused and atomic; use imperative summaries
- PRs should include:
  - clear change summary and rationale
  - linked issue/task when available
  - test evidence (`npm run test` result)
  - screenshots/GIFs for visible UI or VFX changes
