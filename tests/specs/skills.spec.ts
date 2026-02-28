import { test, expect } from '../fixtures/game.fixture';
import { getPlayerData } from '../helpers/game-state';

test.describe('Skills', () => {
  test('heavy_slash and shadow_step are auto-equipped', async ({ gamePage }) => {
    const player = await getPlayerData(gamePage);
    const skills = player.activeSkills as (string | null)[];
    expect(skills[0]).toBe('heavy_slash');
    expect(skills[3]).toBe('shadow_step');
  });

  test('pressing 1 activates heavy slash without crashing', async ({ gamePage }) => {
    await gamePage.keyboard.press('1');
    await gamePage.waitForTimeout(500);
    const player = await getPlayerData(gamePage);
    expect(player.currentHP).toBeGreaterThan(0);
  });

  test('pressing 4 activates shadow step without crashing', async ({ gamePage }) => {
    await gamePage.keyboard.press('4');
    await gamePage.waitForTimeout(500);
    const player = await getPlayerData(gamePage);
    expect(player.currentHP).toBeGreaterThan(0);
  });
});
