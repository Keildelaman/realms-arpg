// ============================================================================
// Movement System — Player movement, mouse aiming, dash mechanics
// ============================================================================

import { emit } from '@/core/event-bus';
import { getPlayer } from '@/core/game-state';
import {
  DASH_SPEED,
  DASH_DURATION,
  DASH_COOLDOWN,
  MOVE_ACCELERATION,
  MOVE_DECELERATION,
} from '@/data/constants';

// --- Input state ---

interface KeyboardState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  dash: boolean;
}

const keys: KeyboardState = {
  up: false,
  down: false,
  left: false,
  right: false,
  dash: false,
};

let mouseWorldX = 0;
let mouseWorldY = 0;
let mousePressed = false;
let mouseJustPressed = false;

// --- Velocity state (acceleration model) ---

let currentVx = 0;
let currentVy = 0;
let wasMoving = false;

/** Linearly approach target by maxDelta per step. */
function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) {
    return Math.min(current + maxDelta, target);
  } else {
    return Math.max(current - maxDelta, target);
  }
}

// --- Dash state ---

let isDashing = false;
let dashTimer = 0;
let dashCooldownTimer = 0;
let dashDirectionX = 0;
let dashDirectionY = 0;

// --- Exported queries ---

/** Get the current mouse position in world coordinates. */
export function getMouseWorldPosition(): { x: number; y: number } {
  return { x: mouseWorldX, y: mouseWorldY };
}

/** Get the angle from the player to the mouse cursor (radians, 0 = right). */
export function getPlayerFacingAngle(): number {
  const player = getPlayer();
  return Math.atan2(mouseWorldY - player.y, mouseWorldX - player.x);
}

// --- Input binding ---

/**
 * Bind keyboard and mouse input to the movement system.
 * Called once from the scene's create() method, passing the Phaser scene
 * for input registration. This is the ONLY Phaser-aware part; the system
 * itself stores plain state and the scene reads from it.
 *
 * Alternative: the scene can call setKeyState / setMouseState each frame.
 */

export function setKeyState(key: 'up' | 'down' | 'left' | 'right' | 'dash', isDown: boolean): void {
  keys[key] = isDown;
}

export function setMouseWorldPos(x: number, y: number): void {
  mouseWorldX = x;
  mouseWorldY = y;
}

export function setMousePressed(pressed: boolean): void {
  if (pressed && !mousePressed) {
    mouseJustPressed = true;
  }
  mousePressed = pressed;
}

// --- Dash ---

function startDash(): void {
  if (isDashing || dashCooldownTimer > 0) return;

  const player = getPlayer();
  if (player.isDashing) return;

  // Determine dash direction: movement direction if moving, else facing direction
  let dx = 0;
  let dy = 0;

  if (keys.left) dx -= 1;
  if (keys.right) dx += 1;
  if (keys.up) dy -= 1;
  if (keys.down) dy += 1;

  // If not moving, dash toward cursor
  if (dx === 0 && dy === 0) {
    const angle = getPlayerFacingAngle();
    dx = Math.cos(angle);
    dy = Math.sin(angle);
  } else {
    // Normalize
    const len = Math.sqrt(dx * dx + dy * dy);
    dx /= len;
    dy /= len;
  }

  dashDirectionX = dx;
  dashDirectionY = dy;
  isDashing = true;
  dashTimer = DASH_DURATION;
  dashCooldownTimer = DASH_COOLDOWN;

  // Set player state
  player.isDashing = true;
  player.isInvulnerable = true;
}

function endDash(): void {
  isDashing = false;
  const player = getPlayer();
  player.isDashing = false;
  player.isInvulnerable = false;

  // Reset velocity so player doesn't slide after dashing
  currentVx = 0;
  currentVy = 0;
  player.velocityX = 0;
  player.velocityY = 0;
}

// --- Lifecycle ---

export function init(): void {
  // Reset all input state
  keys.up = false;
  keys.down = false;
  keys.left = false;
  keys.right = false;
  keys.dash = false;
  mouseWorldX = 0;
  mouseWorldY = 0;
  mousePressed = false;
  mouseJustPressed = false;
  isDashing = false;
  dashTimer = 0;
  dashCooldownTimer = 0;
  dashDirectionX = 0;
  dashDirectionY = 0;

  // Reset velocity state
  currentVx = 0;
  currentVy = 0;
  wasMoving = false;
}

export function update(dt: number): void {
  const player = getPlayer();

  // --- Tick cooldowns ---
  if (dashCooldownTimer > 0) {
    dashCooldownTimer -= dt;
    if (dashCooldownTimer < 0) dashCooldownTimer = 0;
  }

  // --- Dash processing ---
  if (isDashing) {
    dashTimer -= dt;

    // Move in dash direction at dash speed
    player.x += dashDirectionX * DASH_SPEED * dt;
    player.y += dashDirectionY * DASH_SPEED * dt;

    if (dashTimer <= 0) {
      endDash();
    }

    // During dash, skip normal movement
    emit('player:moved', { x: player.x, y: player.y });

    // Update facing angle even during dash
    player.facingAngle = getPlayerFacingAngle();

    // Consume mouse press during dash
    mouseJustPressed = false;
    return;
  }

  // --- Start dash on Space ---
  if (keys.dash) {
    startDash();
    keys.dash = false; // Consume — treat as a single press
    if (isDashing) {
      // Dash just started, skip normal movement this frame
      emit('player:moved', { x: player.x, y: player.y });
      player.facingAngle = getPlayerFacingAngle();
      mouseJustPressed = false;
      return;
    }
  }

  // --- Normal movement (acceleration model) ---
  let dx = 0;
  let dy = 0;

  if (keys.left) dx -= 1;
  if (keys.right) dx += 1;
  if (keys.up) dy -= 1;
  if (keys.down) dy += 1;

  // Attack commitment: zero input during swing phase
  if (player.attackPhase === 'swing') {
    dx = 0;
    dy = 0;
  }

  // Normalize diagonal movement
  if (dx !== 0 && dy !== 0) {
    const diag = Math.SQRT1_2; // 1/sqrt(2)
    dx *= diag;
    dy *= diag;
  }

  // Compute target velocity
  const speed = player.moveSpeed;
  const targetVx = dx * speed;
  const targetVy = dy * speed;

  // Determine acceleration rate: accelerate when input held, decelerate when released
  const hasInput = dx !== 0 || dy !== 0;
  const accel = hasInput ? MOVE_ACCELERATION : MOVE_DECELERATION;

  // Approach target velocity
  currentVx = approach(currentVx, targetVx, accel * dt);
  currentVy = approach(currentVy, targetVy, accel * dt);

  // Apply velocity to position
  player.x += currentVx * dt;
  player.y += currentVy * dt;

  // Write velocity to state for visual layer
  player.velocityX = currentVx;
  player.velocityY = currentVy;

  // Update facing angle — player always faces the cursor
  player.facingAngle = getPlayerFacingAngle();

  // Detect movement start/stop transitions and emit events
  const currentSpeed = Math.sqrt(currentVx * currentVx + currentVy * currentVy);
  const isMoving = currentSpeed > 5; // small threshold to avoid jitter

  if (isMoving && !wasMoving) {
    emit('player:startedMoving');
  } else if (!isMoving && wasMoving) {
    emit('player:stoppedMoving');
  }
  wasMoving = isMoving;

  // Emit velocity and position events
  if (isMoving) {
    emit('player:moved', { x: player.x, y: player.y });
    emit('player:velocityChanged', { vx: currentVx, vy: currentVy, speed: currentSpeed });
  }

  // --- Mouse click → attack ---
  if (mouseJustPressed) {
    emit('combat:playerAttack', { angle: player.facingAngle });
    mouseJustPressed = false;
  }
}
