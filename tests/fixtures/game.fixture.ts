import { test as base, type Page } from '@playwright/test';

/** Wait for the Phaser game to be fully initialized and the GameScene running. */
async function waitForGame(page: Page): Promise<void> {
  // Wait for the canvas element to appear
  await page.waitForSelector('canvas', { timeout: 15_000 });

  // Wait for the game state to be exposed on window
  await page.waitForFunction(
    () => (window as Record<string, unknown>).__GAME_STATE__ !== undefined,
    { timeout: 15_000 },
  );

  await page.waitForFunction(
    () => (window as Record<string, unknown>).__GAME_ACTIONS__ !== undefined,
    { timeout: 15_000 },
  );
}

export const test = base.extend<{ gamePage: Page }>({
  gamePage: async ({ page }, use) => {
    await page.goto('/');
    await waitForGame(page);
    // Brief extra wait for initial spawns and rendering
    await page.waitForTimeout(1000);
    await use(page);
  },
});

export { expect } from '@playwright/test';
