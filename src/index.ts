// ─────────────────────────────────────────────────────────────
//  guardo  ·  index.ts
//  Public API surface - everything you need from one import.
// ─────────────────────────────────────────────────────────────

import { MemoryStore } from "./adapters/memory";
import { NodemailerNotifier } from "./notifiers";
import { RateLimiter } from "./core/ratelimit";
import { OtpModule } from "./core/otp";
import { JwtModule } from "./core/jwt";
import { SessionModule } from "./core/session";
import { AuthModule } from "./core/auth";
import { MiddlewareModule } from "./middleware";
import { GuardoEventEmitter } from "./core/events";
import { OAuthModule } from "./core/oauth";
import type { AuthConfig } from "./types";

export type {
  User,
  Session,
  SessionMeta,
  TokenPair,
  TokenPayload,
  LoginResult,
  LoginWithOtpOptions,
  SendOtpOptions,
  SendOtpResult,
  VerifyOtpOptions,
  VerifyOtpResult,
  StorageAdapter,
  Notifier,
  NotifyPayload,
  OtpChannel,
  GuardoErrorCode,
  GuardoEvents,
  CookieOptions,
  AuthConfig,
  OAuthConfig,
  OAuthProvider,
  OAuthTokenResponse,
  OAuthUserProfile,
  OAuthStartOptions,
  OAuthStartResult,
  OAuthCallbackParams,
  OAuthLoginResult,
} from "./types";

// Re-export adapters & notifiers
export { MemoryStore } from "./adapters/memory";
export { RedisStore } from "./adapters/redis";
export {
  ConsoleNotifier,
  BaseNotifier,
  MultiChannelNotifier,
  createNotifier,
  NodemailerNotifier,
} from "./notifiers";
export type { SmtpConfig, EmailNotifierOptions } from "./notifiers";

// Re-export OAuth providers
export {
  OAuth2Provider,
  createOAuthProvider,
  GoogleProvider,
  GithubProvider,
} from "./oauth";
export type {
  OAuth2ProviderOptions,
  GoogleProviderOptions,
  GithubProviderOptions,
} from "./oauth";
export { OAuthModule } from "./core/oauth";

// Re-export error classes
export { AuthError } from "./core/auth";
export { RateLimitError } from "./core/otp";
export { TokenTypeError } from "./core/jwt";
export { OAuthError } from "./core/oauth";

// ── Auth Engine ───────────────────────────────────────────────

export interface AuthEngine {
  otp: OtpModule;
  jwt: JwtModule;
  session: SessionModule;
  auth: AuthModule;
  middleware: MiddlewareModule;
  /** OAuth / social login. Present only when `oauth` is configured. */
  oauth?: OAuthModule;
}

/**
 * Create a fully configured Auth Engine.
 *
 * @example
 * const auth = createAuth({
 *   jwt: { secret: process.env.JWT_SECRET! },
 *   store: new RedisStore(redisClient),
 *   events: {
 *     'login.success': ({ user }) => auditLog.write(user.id, 'login'),
 *     'token.reuse_detected': ({ userId }) => alertTeam(userId),
 *   },
 * });
 */
export function createAuth(config: AuthConfig): AuthEngine {
  const store = config.store ?? new MemoryStore();

  const notifier =
    config.notifier ?? new NodemailerNotifier(config.email ?? {});

  const otpLength = config.otp?.length ?? 6;
  const otpExpiry = config.otp?.expiry ?? 300;

  // ── Event emitter ─────────────────────────────────────────────
  const events = new GuardoEventEmitter(config.events ?? {});

  // ── Rate limiter ──────────────────────────────────────────────
  const rateLimiter = new RateLimiter(store, {
    otpSend: config.rateLimit?.otpSend ?? { max: 5, windowSeconds: 60 },
    otpVerify: config.rateLimit?.otpVerify ?? { max: 10, windowSeconds: 60 },
    otpSendPerIp: config.rateLimit?.otpSendPerIp ?? { max: 20, windowSeconds: 60 },
    otpVerifyPerIp: config.rateLimit?.otpVerifyPerIp ?? { max: 30, windowSeconds: 60 },
  });

  // ── Module construction ───────────────────────────────────────
  const jwtModule = new JwtModule(config.jwt);

  const otpModule = new OtpModule({
    length: otpLength,
    expiry: otpExpiry,
    store,
    notifier,
    rateLimiter,
    events,
    exposeCode: config.otp?.exposeCode,
  });

  const sessionTtl = parseTTLtoSeconds(config.jwt.refreshTokenTTL ?? "7d");
  const sessionModule = new SessionModule(store, sessionTtl, events);

  const authModule = new AuthModule(
    otpModule,
    jwtModule,
    sessionModule,
    config.resolveUser,
    config.onNewUser,
    events
  );

  const middlewareModule = new MiddlewareModule(
    jwtModule,
    sessionModule,
    config.resolveUser,
    config.cookies
  );

  // ── OAuth (optional) ──────────────────────────────────────────
  const oauthModule =
    config.oauth && config.oauth.providers.length > 0
      ? new OAuthModule({
          config: config.oauth,
          store,
          session: sessionModule,
          jwt: jwtModule,
          events,
        })
      : undefined;

  return {
    otp: otpModule,
    jwt: jwtModule,
    session: sessionModule,
    auth: authModule,
    middleware: middlewareModule,
    ...(oauthModule && { oauth: oauthModule }),
  };
}

// ── Helpers ───────────────────────────────────────────────────

function parseTTLtoSeconds(ttl: string): number {
  const match = ttl.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60;

  const value = Number.parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };
  return value * (multipliers[unit] ?? 1);
}
