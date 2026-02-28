import { test, expect } from '../fixtures/game.fixture';
import { getPlayerData, launchTestExpedition } from '../helpers/game-state';

test.describe('Skills', () => {
  test.beforeEach(async ({ gamePage }) => {
    await launchTestExpedition(gamePage);
    await gamePage.waitForTimeout(800);
  });

  test('basic_attack, heavy_slash and shadow_step are auto-equipped', async ({ gamePage }) => {
    const player = await getPlayerData(gamePage);
    const skills = player.activeSkills as (string | null)[];
    expect(skills[0]).toBe('basic_attack');
    expect(skills[2]).toBe('heavy_slash');
    expect(skills[5]).toBe('shadow_step');
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
