// ─────────────────────────────────────────────────────────────
//  guardo  ·  core/ratelimit.ts
//  Sliding-window rate limiter - per-identifier AND per-IP.
// ─────────────────────────────────────────────────────────────

import type { StorageAdapter, RateLimitRule } from "../types";

export class RateLimiter {
  constructor(
    private readonly store: StorageAdapter,
    private readonly rules: {
      otpSend: RateLimitRule;
      otpVerify: RateLimitRule;
      otpSendPerIp: RateLimitRule;
      otpVerifyPerIp: RateLimitRule;
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
        /* corrupted entry - reset */
      }
    }

    const elapsed = (now - window.windowStart) / 1000;
    if (elapsed >= rule.windowSeconds) {
      window = { count: 0, windowStart: now };
    }

    window.count += 1;
    const ttl = rule.windowSeconds - Math.floor(elapsed);
    await this.store.set(key, JSON.stringify(window), rule.windowSeconds);

    const allowed = window.count <= rule.max;
    const remaining = Math.max(0, rule.max - window.count);
    const resetInSeconds = ttl;

    return { allowed, remaining, resetInSeconds };
  }

  async checkOtpSend(
    identifier: string,
    ip?: string
  ): Promise<{ allowed: boolean; remaining: number; resetInSeconds: number }> {
    const byId = await this.check("otp_send", identifier, this.rules.otpSend);
    if (!byId.allowed) return byId;

    if (ip) {
      const byIp = await this.check("otp_send_ip", ip, this.rules.otpSendPerIp);
      if (!byIp.allowed) return byIp;
    }

    return byId;
  }

  async checkOtpVerify(
    identifier: string,
    ip?: string
  ): Promise<{ allowed: boolean; remaining: number; resetInSeconds: number }> {
    const byId = await this.check("otp_verify", identifier, this.rules.otpVerify);
    if (!byId.allowed) return byId;

    if (ip) {
      const byIp = await this.check("otp_verify_ip", ip, this.rules.otpVerifyPerIp);
      if (!byIp.allowed) return byIp;
    }

    return byId;
  }
}
