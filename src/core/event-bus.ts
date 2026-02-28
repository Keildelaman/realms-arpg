// ============================================================================
// Event Bus — Typed pub/sub for cross-system communication
// ============================================================================

import type { GameEvent, GameEventMap } from './types';

type Handler<T> = T extends undefined ? () => void : (data: T) => void;

const listeners = new Map<string, Set<Handler<never>>>();

export function on<E extends GameEvent>(
  event: E,
  handler: Handler<GameEventMap[E]>,
): void {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event)!.add(handler as Handler<never>);
}

export function off<E extends GameEvent>(
  event: E,
  handler: Handler<GameEventMap[E]>,
): void {
  listeners.get(event)?.delete(handler as Handler<never>);
}

export function emit<E extends GameEvent>(
  event: E,
  ...[data]: GameEventMap[E] extends undefined ? [] : [GameEventMap[E]]
): void {
  const handlers = listeners.get(event);
  if (!handlers) return;
  for (const handler of handlers) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (handler as (data: any) => void)(data);
  }
}

export function once<E extends GameEvent>(
  event: E,
  handler: Handler<GameEventMap[E]>,
): void {
  const wrapper = ((data: GameEventMap[E]) => {
    off(event, wrapper as Handler<GameEventMap[E]>);
    (handler as (data: GameEventMap[E]) => void)(data);
  }) as Handler<GameEventMap[E]>;
  on(event, wrapper);
}

export function clear(): void {
  listeners.clear();
}
