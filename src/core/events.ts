// ─────────────────────────────────────────────────────────────
//  guardo  ·  core/events.ts
//  Lightweight typed event emitter for auth lifecycle hooks.
// ─────────────────────────────────────────────────────────────

import type { GuardoEvents, GuardoEventName, GuardoEventHandler } from "../types";

export class GuardoEventEmitter {
  private handlers: Partial<GuardoEvents>;

  constructor(handlers: Partial<GuardoEvents> = {}) {
    this.handlers = handlers;
  }

  emit<E extends GuardoEventName>(
    event: E,
    payload: Parameters<GuardoEvents[E]>[0]
  ): void {
    const handler = this.handlers[event] as GuardoEventHandler<E> | undefined;
    if (handler) {
      try {
        (handler as (p: Parameters<GuardoEvents[E]>[0]) => void)(payload);
      } catch {
        // Event handlers must never crash the auth flow
      }
    }
  }
}
