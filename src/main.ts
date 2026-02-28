import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { HubScene } from './scenes/HubScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { GAME_WIDTH, GAME_HEIGHT } from './data/constants';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, HubScene, GameScene, UIScene],
};

const game = new Phaser.Game(config);

// Expose game state on window for Playwright testing
if (typeof window !== 'undefined' && window.location.search.includes('test=1')) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  win.__PHASER_GAME__ = game;

  // Lazy-load state helpers once the game is booted
  game.events.once('ready', () => {
    import('./core/game-state').then(({ getState, getPlayer }) => {
      win.__GAME_STATE__ = { getState, getPlayer };
    });

    import('./systems/expeditions').then(({ init, launchExpedition }) => {
      win.__GAME_ACTIONS__ = {
        async launchTestExpedition() {
          init();
          const run = launchExpedition({
            zoneId: 'whisperwood',
            tier: 1,
            objective: 'extermination',
          });
          if (!run) return false;

          if (game.scene.isSleeping('GameScene')) {
            game.scene.wake('GameScene');
          } else if (!game.scene.isActive('GameScene')) {
            game.scene.start('GameScene');
          }

          if (game.scene.isActive('HubScene')) {
            game.scene.sleep('HubScene');
          }

          return true;
        },
      };
    });
  });
}
