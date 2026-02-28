import type { Page } from '@playwright/test';

interface GameStateHelpers {
  getState: () => unknown;
  getPlayer: () => unknown;
}

interface GameActions {
  launchTestExpedition: () => Promise<boolean>;
}

/** Retrieve player data from the game running in the browser. */
export async function getPlayerData(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const helpers = (window as Record<string, unknown>).__GAME_STATE__ as GameStateHelpers | undefined;
    if (!helpers) throw new Error('Game state not exposed');
    const player = helpers.getPlayer() as Record<string, unknown>;
    return {
      currentHP: player.currentHP,
      maxHP: player.maxHP,
      x: player.x,
      y: player.y,
      level: player.level,
      attack: player.attack,
      activeSkills: player.activeSkills,
      gold: player.gold,
    };
  });
}

/** Get the number of alive monsters. */
export async function getAliveMonsterCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const helpers = (window as Record<string, unknown>).__GAME_STATE__ as GameStateHelpers | undefined;
    if (!helpers) throw new Error('Game state not exposed');
    const state = helpers.getState() as { monsters: Array<{ isDead: boolean }> };
    return state.monsters.filter(m => !m.isDead).length;
  });
}

/** Launch a default expedition for gameplay tests. */
export async function launchTestExpedition(page: Page): Promise<void> {
  const launched = await page.evaluate(async () => {
    const actions = (window as Record<string, unknown>).__GAME_ACTIONS__ as GameActions | undefined;
    if (!actions) throw new Error('Game actions not exposed');
    return actions.launchTestExpedition();
  });

  if (!launched) {
    throw new Error('Failed to launch test expedition');
  }
}
