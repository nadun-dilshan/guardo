// ─────────────────────────────────────────────────────────────
//  guardo  ·  core/ratelimit.ts
//  Sliding-window rate limiter backed by the storage adapter.
// ─────────────────────────────────────────────────────────────

import type { StorageAdapter, RateLimitRule } from "../types";

export class RateLimiter {
  constructor(
    private readonly store: StorageAdapter,
    private readonly rules: {
      otpSend: RateLimitRule;
      otpVerify: RateLimitRule;
    }
  ) {}

  private async check(
    prefix: string,
    identifier: string,
    rule: RateLimitRule
  ): Promise<{ allowed: boolean; remaining: number; resetInSeconds: number }> {
    const key = `ratelimit:${prefix}:${identifier}`;
    const raw = await this.store.get(key);
    const now = Date.now();

    interface Window {
      count: number;
      windowStart: number;
    }

    let window: Window = { count: 0, windowStart: now };

    if (raw) {
      try {
        window = JSON.parse(raw) as Window;
      } catch {
        /* corrupted entry — reset */
      }
    }

    const elapsed = (now - window.windowStart) / 1000;
    if (elapsed >= rule.windowSeconds) {
      // Start a fresh window
      window = { count: 0, windowStart: now };
    }

    window.count += 1;
    const ttl = rule.windowSeconds - Math.floor(elapsed);
    await this.store.set(key, JSON.stringify(window), rule.windowSeconds);

    const allowed = window.count <= rule.max;
    const remaining = Math.max(0, rule.max - window.count);
    const resetInSeconds = allowed ? ttl : ttl;

    return { allowed, remaining, resetInSeconds };
  }

  async checkOtpSend(
    identifier: string
  ): Promise<{ allowed: boolean; remaining: number; resetInSeconds: number }> {
    return this.check("otp_send", identifier, this.rules.otpSend);
  }

  async checkOtpVerify(
    identifier: string
  ): Promise<{ allowed: boolean; remaining: number; resetInSeconds: number }> {
    return this.check("otp_verify", identifier, this.rules.otpVerify);
  }
}
