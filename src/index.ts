// ─────────────────────────────────────────────────────────────
//  guardo  ·  index.ts
//  Public API surface — everything you need from one import.
// ─────────────────────────────────────────────────────────────

import { MemoryStore } from "./adapters/memory";
import { ConsoleNotifier } from "./notifiers";
import { RateLimiter } from "./core/ratelimit";
import { OtpModule } from "./core/otp";
import { JwtModule } from "./core/jwt";
import { SessionModule } from "./core/session";
import { AuthModule } from "./core/auth";
import { MiddlewareModule } from "./middleware";
import type { AuthConfig } from "./types";

export type { AuthConfig } from "./types";
export type {
  User,
  Session,
  SessionMeta,
  TokenPair,
  TokenPayload,
  LoginResult,
  LoginWithOtpOptions,
  SendOtpOptions,
  VerifyOtpOptions,
  VerifyOtpResult,
  StorageAdapter,
  Notifier,
  NotifyPayload,
  OtpChannel,
} from "./types";

// Re-export adapters & notifiers for convenience
export { MemoryStore } from "./adapters/memory";
export { RedisStore } from "./adapters/redis";
export { ConsoleNotifier, BaseNotifier, MultiChannelNotifier, createNotifier } from "./notifiers";

// Re-export custom error classes
export { AuthError } from "./core/auth";
export { RateLimitError } from "./core/otp";
export { TokenTypeError } from "./core/jwt";

// ── Auth Engine ───────────────────────────────────────────────

export interface AuthEngine {
  /** OTP operations — send, verify, check existence */
  otp: OtpModule;
  /** JWT operations — issue and verify access/refresh tokens */
  jwt: JwtModule;
  /** Session management — create, list, revoke */
  session: SessionModule;
  /** High-level auth flows — login, refresh, logout */
  auth: AuthModule;
  /** Express & Next.js middleware factories */
  middleware: MiddlewareModule;
}

/**
 * Create a fully configured Auth Engine.
 *
 * @example
 * const auth = createAuth({
 *   jwt: { secret: process.env.JWT_SECRET! },
 *   store: new RedisStore(redisClient),
 * });
 */
export function createAuth(config: AuthConfig): {
  otp: OtpModule;
  jwt: JwtModule;
  session: SessionModule;
  auth: AuthModule;
  middleware: MiddlewareModule;
} {
  // ── Defaults ─────────────────────────────────────────────────

  const store = config.store ?? new MemoryStore();
  const notifier = config.notifier ?? new ConsoleNotifier();

  const otpLength = config.otp?.length ?? 6;
  const otpExpiry = config.otp?.expiry ?? 300;

  // ── Rate limiter ──────────────────────────────────────────────

  const rateLimiter = new RateLimiter(store, {
    otpSend: config.rateLimit?.otpSend ?? { max: 5, windowSeconds: 60 },
    otpVerify: config.rateLimit?.otpVerify ?? { max: 10, windowSeconds: 60 },
  });

  // ── Module construction ───────────────────────────────────────

  const jwtModule = new JwtModule(config.jwt);

  const otpModule = new OtpModule({
    length: otpLength,
    expiry: otpExpiry,
    store,
    notifier,
    rateLimiter,
  });

  // Derive session TTL from refresh token TTL so sessions expire naturally
  const sessionTtl = parseTTLtoSeconds(config.jwt.refreshTokenTTL ?? "7d");

  const sessionModule = new SessionModule(store, sessionTtl);

  const authModule = new AuthModule(
    otpModule,
    jwtModule,
    sessionModule,
    config.resolveUser
  );

  const middlewareModule = new MiddlewareModule(
    jwtModule,
    sessionModule,
    config.resolveUser
  );

  return {
    otp: otpModule,
    jwt: jwtModule,
    session: sessionModule,
    auth: authModule,
    middleware: middlewareModule,
  };
}

// ── Helpers ───────────────────────────────────────────────────

function parseTTLtoSeconds(ttl: string): number {
  const match = ttl.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60; // default 7 days

  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };
  return value * (multipliers[unit] ?? 1);
}
