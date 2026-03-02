import Phaser from 'phaser';

export type UiButtonState = 'default' | 'hover' | 'pressed' | 'disabled';

export const UI_THEME = {
  panelOuterFill: 0x0a1222,
  panelOuterAlpha: 0.96,
  panelInnerFill: 0x111d33,
  panelInnerAlpha: 0.96,
  panelBorder: 0x29456c,
  panelBorderAlpha: 0.85,
  sectionFill: 0x0f1728,
  sectionAltFill: 0x101a2b,
  sectionAlpha: 0.9,
  sectionBorder: 0x243246,
  sectionBorderAlpha: 0.9,
  text: '#e2e8f0',
  textDim: '#94a3b8',
  textMuted: '#64748b',
  accent: '#7dd3fc',
  success: '#86efac',
  warning: '#fbbf24',
  danger: '#fca5a5',
};

export function drawPanelShell(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 10,
): void {
  gfx.fillStyle(UI_THEME.panelOuterFill, UI_THEME.panelOuterAlpha);
  gfx.fillRoundedRect(x, y, width, height, radius + 2);
  gfx.fillStyle(UI_THEME.panelInnerFill, UI_THEME.panelInnerAlpha);
  gfx.fillRoundedRect(x + 6, y + 6, width - 12, height - 12, radius);
  gfx.lineStyle(2, UI_THEME.panelBorder, UI_THEME.panelBorderAlpha);
  gfx.strokeRoundedRect(x + 6, y + 6, width - 12, height - 12, radius);
}

export function drawSectionCard(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  alt = false,
  radius = 8,
): void {
  gfx.fillStyle(alt ? UI_THEME.sectionAltFill : UI_THEME.sectionFill, UI_THEME.sectionAlpha);
  gfx.fillRoundedRect(x, y, width, height, radius);
  gfx.lineStyle(1, UI_THEME.sectionBorder, UI_THEME.sectionBorderAlpha);
  gfx.strokeRoundedRect(x, y, width, height, radius);
}

export function drawDivider(
  gfx: Phaser.GameObjects.Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color = 0x2a3a54,
  alpha = 0.9,
): void {
  gfx.lineStyle(1, color, alpha);
  gfx.beginPath();
  gfx.moveTo(x1, y1);
  gfx.lineTo(x2, y2);
  gfx.strokePath();
}

export function drawPillButton(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  state: UiButtonState,
  palette: { fill: number; border: number } = { fill: 0x1e3a8a, border: 0x3b82f6 },
): void {
  const fillAlpha = state === 'disabled' ? 0.18 : state === 'pressed' ? 0.45 : state === 'hover' ? 0.4 : 0.32;
  const borderAlpha = state === 'disabled' ? 0.45 : state === 'hover' ? 0.95 : 0.82;
  gfx.fillStyle(state === 'disabled' ? 0x111827 : palette.fill, fillAlpha);
  gfx.fillRoundedRect(x, y, width, height, 6);
  gfx.lineStyle(1, state === 'disabled' ? 0x334155 : palette.border, borderAlpha);
  gfx.strokeRoundedRect(x, y, width, height, 6);
}
