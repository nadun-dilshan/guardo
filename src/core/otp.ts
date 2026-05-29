// ─────────────────────────────────────────────────────────────
//  guardo  ·  core/otp.ts
//  Generates, stores (hashed), and verifies OTP codes.
// ─────────────────────────────────────────────────────────────

import crypto from "node:crypto";
import type {
  StorageAdapter,
  Notifier,
  SendOtpOptions,
  VerifyOtpOptions,
  VerifyOtpResult,
} from "../types";
import type { RateLimiter } from "./ratelimit";

interface OtpModuleOptions {
  length: number;
  expiry: number; // seconds
  store: StorageAdapter;
  notifier: Notifier;
  rateLimiter?: RateLimiter;
}

/** Namespace key so OTP entries don't clash with sessions/tokens */
const KEY = (identifier: string) => `otp:${identifier}`;

/** Attempts key to track wrong guesses per identifier */
const ATTEMPTS_KEY = (identifier: string) => `otp_attempts:${identifier}`;

const MAX_ATTEMPTS = 5;

export class OtpModule {
  private readonly length: number;
  private readonly expiry: number;
  private readonly store: StorageAdapter;
  private readonly notifier: Notifier;
  private readonly rateLimiter?: RateLimiter;

  constructor(opts: OtpModuleOptions) {
    this.length = opts.length;
    this.expiry = opts.expiry;
    this.store = opts.store;
    this.notifier = opts.notifier;
    this.rateLimiter = opts.rateLimiter;
  }

  // ── Private helpers ──────────────────────────────────────────

  private generate(): string {
    const max = Math.pow(10, this.length);
    const code = crypto.randomInt(0, max);
    return code.toString().padStart(this.length, "0");
  }

  private hash(otp: string): string {
    return crypto.createHash("sha256").update(otp).digest("hex");
  }

  // ── Public API ───────────────────────────────────────────────

  /**
   * Generate and send a fresh OTP to the identifier.
   * Calling this again before expiry replaces the previous OTP.
   */
  async send(opts: SendOtpOptions): Promise<{ expiresInSeconds: number }> {
    const { identifier, channel = "email" } = opts;

    if (this.rateLimiter) {
      const limit = await this.rateLimiter.checkOtpSend(identifier);
      if (!limit.allowed) {
        throw new RateLimitError(
          `Too many OTP requests. Try again in ${limit.resetInSeconds}s.`,
          limit.resetInSeconds
        );
      }
    }

    const code = this.generate();
    const hashed = this.hash(code);

    // Store hashed OTP
    await this.store.set(KEY(identifier), hashed, this.expiry);

    // Reset bad-attempt counter on fresh send
    await this.store.delete(ATTEMPTS_KEY(identifier));

    // Deliver
    await this.notifier.sendOTP({
      to: identifier,
      code,
      channel,
      expiresInSeconds: this.expiry,
    });

    return { expiresInSeconds: this.expiry };
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
        return {
          success: false,
          verified: false,
          error: `Too many attempts. Try again in ${limit.resetInSeconds}s.`,
        };
      }
    }

    const stored = await this.store.get(KEY(identifier));
    if (!stored) {
      return {
        success: false,
        verified: false,
        error: "OTP expired or not found. Request a new code.",
      };
    }

    // Increment attempt counter before checking
    const rawAttempts = await this.store.get(ATTEMPTS_KEY(identifier));
    const attempts = rawAttempts ? parseInt(rawAttempts, 10) + 1 : 1;
    await this.store.set(ATTEMPTS_KEY(identifier), String(attempts), this.expiry);

    if (attempts > MAX_ATTEMPTS) {
      await this.store.delete(KEY(identifier));
      await this.store.delete(ATTEMPTS_KEY(identifier));
      return {
        success: false,
        verified: false,
        error: "Too many failed attempts. Please request a new OTP.",
      };
    }

    const hashed = this.hash(otp.trim());
    if (!crypto.timingSafeEqual(Buffer.from(hashed), Buffer.from(stored))) {
      return {
        success: false,
        verified: false,
        error: `Invalid OTP. ${MAX_ATTEMPTS - attempts} attempt(s) remaining.`,
      };
    }

    // ✅ Success — consume OTP (one-time use)
    await this.store.delete(KEY(identifier));
    await this.store.delete(ATTEMPTS_KEY(identifier));

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
