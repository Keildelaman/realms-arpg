import { test, expect } from '../fixtures/game.fixture';

test.describe('UI elements', () => {
  test('game canvas renders at expected size', async ({ gamePage }) => {
    const canvas = gamePage.locator('canvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(800);
    expect(box!.height).toBeGreaterThanOrEqual(400);
  });

  test('hub text is visible on initial state', async ({ gamePage }) => {
    await expect(gamePage.getByText('Hub: Haven')).toBeVisible();
  });
});
