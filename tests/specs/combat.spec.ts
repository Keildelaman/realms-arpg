import { test, expect } from '../fixtures/game.fixture';
import { getPlayerData, getAliveMonsterCount } from '../helpers/game-state';

test.describe('Combat', () => {
  test('player starts with expected stats', async ({ gamePage }) => {
    const player = await getPlayerData(gamePage);
    expect(player.currentHP).toBeGreaterThan(0);
    expect(player.maxHP).toBeGreaterThanOrEqual(100);
    expect(player.attack).toBeGreaterThanOrEqual(14);
  });

  test('monsters spawn in the zone', async ({ gamePage }) => {
    // Wait a bit for spawns
    await gamePage.waitForTimeout(3000);
    const count = await getAliveMonsterCount(gamePage);
    expect(count).toBeGreaterThan(0);
  });

  test('clicking performs an attack', async ({ gamePage }) => {
    // Click near center to perform basic attack
    await gamePage.mouse.click(640, 360);
    // Brief wait for attack to register
    await gamePage.waitForTimeout(500);
    // Just verify the game is still running (no crash)
    const player = await getPlayerData(gamePage);
    expect(player.currentHP).toBeGreaterThan(0);
  });
});
