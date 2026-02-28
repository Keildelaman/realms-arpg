import Phaser from 'phaser';

const PLAYER_SPEED = 200;

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    // Placeholder ground color
    this.cameras.main.setBackgroundColor('#2d5a1e');

    // Player
    this.player = this.physics.add.sprite(400, 300, 'player');
    this.player.setCollideWorldBounds(true);

    // Camera follows player
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // World bounds (larger than screen for scrolling)
    this.physics.world.setBounds(0, 0, 2400, 2400);
    this.cameras.main.setBounds(0, 0, 2400, 2400);

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      W: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // Spawn a few test monsters
    for (let i = 0; i < 5; i++) {
      const x = Phaser.Math.Between(100, 2300);
      const y = Phaser.Math.Between(100, 2300);
      const monster = this.physics.add.sprite(x, y, 'monster');
      monster.setCollideWorldBounds(true);
    }

    // Launch UI overlay scene
    this.scene.launch('UIScene');
  }

  update(): void {
    this.handleMovement();
  }

  private handleMovement(): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0);

    let vx = 0;
    let vy = 0;

    if (this.cursors.left.isDown || this.wasd.A.isDown) vx = -1;
    else if (this.cursors.right.isDown || this.wasd.D.isDown) vx = 1;

    if (this.cursors.up.isDown || this.wasd.W.isDown) vy = -1;
    else if (this.cursors.down.isDown || this.wasd.S.isDown) vy = 1;

    // Normalize diagonal movement
    if (vx !== 0 && vy !== 0) {
      const diag = Math.SQRT1_2;
      vx *= diag;
      vy *= diag;
    }

    body.setVelocity(vx * PLAYER_SPEED, vy * PLAYER_SPEED);
  }
}
