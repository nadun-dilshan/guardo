// ─────────────────────────────────────────────────────────────
//  guardo  ·  core/otp.ts
//  Generates, stores (hashed), and verifies OTP codes.
// ─────────────────────────────────────────────────────────────

import crypto from "node:crypto";
import type {
  StorageAdapter,
  Notifier,
  SendOtpOptions,
  SendOtpResult,
  VerifyOtpOptions,
  VerifyOtpResult,
} from "../types";
import type { RateLimiter } from "./ratelimit";
import type { GuardoEventEmitter } from "./events";

interface OtpModuleOptions {
  length: number;
  expiry: number; // seconds
  store: StorageAdapter;
  notifier: Notifier;
  rateLimiter?: RateLimiter;
  events?: GuardoEventEmitter;
  /** Return the plaintext code from `send()` - test/dev only (default: false) */
  exposeCode?: boolean;
}

const KEY = (identifier: string) => `otp:${identifier}`;
const ATTEMPTS_KEY = (identifier: string) => `otp_attempts:${identifier}`;

const MAX_ATTEMPTS = 5;

export class OtpModule {
  private readonly length: number;
  private readonly expiry: number;
  private readonly store: StorageAdapter;
  private readonly notifier: Notifier;
  private readonly rateLimiter?: RateLimiter;
  private readonly events?: GuardoEventEmitter;
  private readonly exposeCode: boolean;

  constructor(opts: OtpModuleOptions) {
    this.length = opts.length;
    this.expiry = opts.expiry;
    this.store = opts.store;
    this.notifier = opts.notifier;
    this.rateLimiter = opts.rateLimiter;
    this.events = opts.events;
    this.exposeCode = opts.exposeCode ?? false;
  }

  private generate(): string {
    const max = Math.pow(10, this.length);
    const code = crypto.randomInt(0, max);
    return code.toString().padStart(this.length, "0");
  }

  private hash(otp: string): string {
    return crypto.createHash("sha256").update(otp).digest("hex");
  }

  /**
   * Generate and send a fresh OTP to the identifier.
   * Supports per-identifier and per-IP rate limiting.
   */
  async send(opts: SendOtpOptions): Promise<SendOtpResult> {
    const { identifier, channel = "email", ip } = opts;

    if (this.rateLimiter) {
      const limit = await this.rateLimiter.checkOtpSend(identifier, ip);
      if (!limit.allowed) {
        throw new RateLimitError(
          `Too many OTP requests. Try again in ${limit.resetInSeconds}s.`,
          limit.resetInSeconds
        );
      }
    }

    const code = this.generate();
    const hashed = this.hash(code);

    await this.store.set(KEY(identifier), hashed, this.expiry);
    await this.store.delete(ATTEMPTS_KEY(identifier));

    await this.notifier.sendOTP({
      to: identifier,
      code,
      channel,
      expiresInSeconds: this.expiry,
    });

    this.events?.emit("otp.sent", {
      identifier,
      channel,
      expiresInSeconds: this.expiry,
    });

    return {
      expiresInSeconds: this.expiry,
      ...(this.exposeCode && { code }),
    };
  }

  /**
   * Verify the OTP entered by the user.
   * Consumes the OTP on success (one-time use).
   */
  async verify(opts: VerifyOtpOptions): Promise<VerifyOtpResult> {
    const { identifier, otp } = opts;

    if (this.rateLimiter) {
      const limit = await this.rateLimiter.checkOtpVerify(identifier);
      if (!limit.allowed) {
        this.events?.emit("otp.failed", {
          identifier,
          reason: "Rate limited",
        });
        return {
          success: false,
          verified: false,
          error: `Too many attempts. Try again in ${limit.resetInSeconds}s.`,
          code: "OTP_RATE_LIMITED",
        };
      }
    }

    const stored = await this.store.get(KEY(identifier));
    if (!stored) {
      this.events?.emit("otp.failed", { identifier, reason: "OTP expired or not found" });
      return {
        success: false,
        verified: false,
        error: "OTP expired or not found. Request a new code.",
        code: "OTP_EXPIRED",
      };
    }

    const rawAttempts = await this.store.get(ATTEMPTS_KEY(identifier));
    const attempts = rawAttempts ? parseInt(rawAttempts, 10) + 1 : 1;
    await this.store.set(ATTEMPTS_KEY(identifier), String(attempts), this.expiry);

    if (attempts > MAX_ATTEMPTS) {
      await this.store.delete(KEY(identifier));
      await this.store.delete(ATTEMPTS_KEY(identifier));
      this.events?.emit("otp.failed", { identifier, reason: "Max attempts exceeded" });
      return {
        success: false,
        verified: false,
        error: "Too many failed attempts. Please request a new OTP.",
        code: "OTP_MAX_ATTEMPTS",
      };
    }

    const hashed = this.hash(otp.trim());
    if (!crypto.timingSafeEqual(Buffer.from(hashed), Buffer.from(stored))) {
      const remaining = MAX_ATTEMPTS - attempts;
      this.events?.emit("otp.failed", {
        identifier,
        reason: "Invalid OTP",
        attemptsRemaining: remaining,
      });
      return {
        success: false,
        verified: false,
        error: `Invalid OTP. ${remaining} attempt(s) remaining.`,
        code: "OTP_INVALID",
      };
    }

    // ✅ Success - consume OTP
    await this.store.delete(KEY(identifier));
    await this.store.delete(ATTEMPTS_KEY(identifier));

    this.events?.emit("otp.verified", { identifier });

    return { success: true, verified: true };
  }

  /** Check whether a valid (unexpired) OTP exists for an identifier */
  async exists(identifier: string): Promise<boolean> {
    const value = await this.store.get(KEY(identifier));
    return value !== null;
  }
}

// ── Custom Errors ─────────────────────────────────────────────

export class RateLimitError extends Error {
  constructor(message: string, public readonly retryAfterSeconds: number) {
    super(message);
    this.name = "RateLimitError";
  }
}
