// ─────────────────────────────────────────────────────────────
//  guardo  ·  types.ts
//  Central type definitions for the entire library
// ─────────────────────────────────────────────────────────────

// ── User ──────────────────────────────────────────────────────

export interface User {
  id: string;
  email?: string;
  phone?: string;
  role?: string;
  [key: string]: unknown;
}

// ── OTP ───────────────────────────────────────────────────────

export type OtpChannel = "email" | "sms";

export interface SendOtpOptions {
  /** The user's email address or phone number */
  identifier: string;
  /** Delivery method - defaults to "email" */
  channel?: OtpChannel;
  /** Optional IP address for IP-based rate limiting */
  ip?: string;
}

export interface VerifyOtpOptions {
  /** The same identifier used when sending */
  identifier: string;
  /** The 6-digit (or custom-length) code the user entered */
  otp: string;
}

export interface VerifyOtpResult {
  success: boolean;
  verified: boolean;
  /** Human-readable message */
  error?: string;
  /** Machine-readable error code */
  code?: GuardoErrorCode;
}

// ── Error codes ───────────────────────────────────────────────

export type GuardoErrorCode =
  | "OTP_EXPIRED"
  | "OTP_INVALID"
  | "OTP_MAX_ATTEMPTS"
  | "OTP_RATE_LIMITED"
  | "SESSION_REVOKED"
  | "SESSION_NOT_FOUND"
  | "TOKEN_EXPIRED"
  | "TOKEN_INVALID"
  | "TOKEN_TYPE_MISMATCH"
  | "USER_NOT_FOUND"
  | "REFRESH_TOKEN_REUSE"
  | "FORBIDDEN"
  | "OAUTH_NOT_CONFIGURED"
  | "OAUTH_PROVIDER_NOT_FOUND"
  | "OAUTH_STATE_INVALID"
  | "OAUTH_EXCHANGE_FAILED"
  | "OAUTH_PROFILE_FAILED";

// ── JWT ───────────────────────────────────────────────────────

export interface JwtConfig {
  /** Secret or private key used to sign tokens */
  secret: string;
  /** Access token lifetime - e.g. "15m", "1h" (default: "15m") */
  accessTokenTTL?: string;
  /** Refresh token lifetime - e.g. "7d", "30d" (default: "7d") */
  refreshTokenTTL?: string;
  /** Extra fields to embed in the JWT payload */
  extraClaims?: Record<string, unknown>;
  /** JWT signing algorithm (default: "HS256"). Use "RS256" for asymmetric keys. */
  algorithm?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface TokenPayload {
  sub: string;
  email?: string;
  role?: string;
  sessionId?: string;
  type: "access" | "refresh";
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

// ── Session ───────────────────────────────────────────────────

export interface SessionMeta {
  /** Browser / client device label */
  device?: string;
  /** IP address of the client */
  ip?: string;
  /** User-Agent string */
  userAgent?: string;
}

export interface Session {
  sessionId: string;
  userId: string;
  device?: string;
  ip?: string;
  userAgent?: string;
  createdAt: string;
  lastActiveAt: string;
}

// ── Auth (Login flow) ─────────────────────────────────────────

export interface LoginWithOtpOptions {
  identifier: string;
  otp: string;
  /** Optional session metadata */
  meta?: SessionMeta;
}

export interface LoginResult {
  user: User;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

// ── Storage Adapter ───────────────────────────────────────────

export interface StorageAdapter {
  /** Store a value with an optional TTL in seconds */
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
  /** Return all keys that start with the given prefix */
  keys(prefix: string): Promise<string[]>;
}

// ── Notifier ──────────────────────────────────────────────────

export interface NotifyPayload {
  to: string;
  code: string;
  channel: OtpChannel;
  /** Expiry in seconds so the notifier can mention it in messages */
  expiresInSeconds?: number;
}

export interface Notifier {
  sendOTP(payload: NotifyPayload): Promise<void>;
}

// ── OAuth ─────────────────────────────────────────────────────

/** Raw token response from an OAuth 2.0 / OpenID Connect token endpoint. */
export interface OAuthTokenResponse {
  access_token: string;
  token_type?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  [key: string]: unknown;
}

/** Normalized user profile that every OAuth provider resolves to. */
export interface OAuthUserProfile {
  /** The provider's stable, unique identifier for this user */
  id: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  avatarUrl?: string;
  /** The untouched profile payload as returned by the provider */
  raw: Record<string, unknown>;
}

export interface OAuthAuthorizationParams {
  /** Where the provider redirects back to after consent */
  redirectUri: string;
  /** Opaque CSRF token round-tripped through the provider */
  state: string;
  /** Scopes to request - falls back to the provider's defaults */
  scopes?: string[];
  /** PKCE S256 code challenge - set only when the provider uses PKCE */
  codeChallenge?: string;
  /** Provider-specific extra query params (e.g. prompt, login_hint) */
  extraParams?: Record<string, string>;
}

export interface OAuthExchangeParams {
  /** The `code` query param returned to the redirect URI */
  code: string;
  /** The redirect URI used to start the flow (must match) */
  redirectUri: string;
  /** PKCE code verifier - set only when the provider uses PKCE */
  codeVerifier?: string;
}

/**
 * A pluggable OAuth provider. Implement this interface - or extend the
 * built-in `OAuth2Provider` - to support any OAuth 2.0 / OIDC service.
 */
export interface OAuthProvider {
  /** Stable provider id, e.g. "google", "github" */
  readonly id: string;
  /** Whether this provider participates in PKCE (S256) */
  readonly usePKCE: boolean;
  /** Build the authorization redirect URL the user is sent to */
  buildAuthorizationUrl(params: OAuthAuthorizationParams): string;
  /** Exchange an authorization code for tokens */
  exchangeCode(params: OAuthExchangeParams): Promise<OAuthTokenResponse>;
  /** Fetch and normalize the user's profile using the issued tokens */
  fetchProfile(tokens: OAuthTokenResponse): Promise<OAuthUserProfile>;
}

export interface OAuthStartOptions {
  /** Override the configured redirect URI for this request */
  redirectUri?: string;
  /** Override the provider's default scopes */
  scopes?: string[];
  /** Extra authorization-endpoint query params (e.g. prompt, login_hint) */
  extraParams?: Record<string, string>;
}

export interface OAuthStartResult {
  /** The URL to redirect the user to */
  url: string;
  /** The CSRF state value (also embedded in `url`) */
  state: string;
}

export interface OAuthCallbackParams {
  /** The `code` query param returned to your redirect URI */
  code: string;
  /** The `state` query param returned to your redirect URI */
  state: string;
}

export interface OAuthLoginResult extends LoginResult {
  /** The provider id the user authenticated with */
  provider: string;
  /** True when the user was provisioned during this callback */
  isNewUser: boolean;
  /** The normalized profile fetched from the provider */
  profile: OAuthUserProfile;
}

export interface OAuthConfig {
  /**
   * The OAuth providers to enable - built-in `GoogleProvider` /
   * `GithubProvider`, or any instance of `OAuth2Provider` for other services.
   */
  providers: OAuthProvider[];
  /**
   * Default redirect URI registered with each provider. Can be overridden
   * per request via `auth.oauth.start(provider, { redirectUri })`.
   */
  redirectUri?: string;
  /** How long (seconds) a pending authorization `state` stays valid (default: 600) */
  stateTtlSeconds?: number;
  /**
   * Resolve an app `User` from an OAuth profile. Return `null` to provision a
   * new user via `onNewUser`. If omitted, a user is synthesized from the
   * profile (`id` = `"<provider>:<profileId>"`).
   */
  resolveUser?: (
    profile: OAuthUserProfile,
    providerId: string
  ) => Promise<User | null>;
  /**
   * Provision a new app `User` from an OAuth profile when `resolveUser`
   * returns `null`.
   */
  onNewUser?: (
    profile: OAuthUserProfile,
    providerId: string
  ) => Promise<User>;
}

// ── Rate Limiter ──────────────────────────────────────────────

export interface RateLimitRule {
  /** Maximum number of requests */
  max: number;
  /** Window in seconds */
  windowSeconds: number;
}

export interface RateLimitConfig {
  /** Rate limit for OTP send requests per identifier (default: 5 per 60 s) */
  otpSend?: RateLimitRule;
  /** Rate limit for OTP verify requests per identifier (default: 10 per 60 s) */
  otpVerify?: RateLimitRule;
  /** Rate limit for OTP send requests per IP (default: 20 per 60 s) */
  otpSendPerIp?: RateLimitRule;
  /** Rate limit for OTP verify requests per IP (default: 30 per 60 s) */
  otpVerifyPerIp?: RateLimitRule;
}

// ── Events ────────────────────────────────────────────────────

export interface GuardoEvents {
  "otp.sent": (payload: { identifier: string; channel: OtpChannel; expiresInSeconds: number }) => void;
  "otp.verified": (payload: { identifier: string }) => void;
  "otp.failed": (payload: { identifier: string; reason: string; attemptsRemaining?: number }) => void;
  "login.success": (payload: { user: User; sessionId: string; meta?: SessionMeta }) => void;
  "login.failed": (payload: { identifier: string; reason: string }) => void;
  "logout": (payload: { sessionId: string; userId?: string }) => void;
  "logout.all": (payload: { userId: string; sessionsRevoked: number }) => void;
  "token.refreshed": (payload: { userId: string; newSessionId: string }) => void;
  "token.reuse_detected": (payload: { userId: string; sessionId: string }) => void;
  "session.revoked": (payload: { sessionId: string; userId: string }) => void;
  "oauth.started": (payload: { provider: string; state: string }) => void;
  "oauth.success": (payload: { provider: string; user: User; sessionId: string; isNewUser: boolean }) => void;
  "oauth.failed": (payload: { provider: string; reason: string }) => void;
}

export type GuardoEventName = keyof GuardoEvents;
export type GuardoEventHandler<E extends GuardoEventName> = GuardoEvents[E];

// ── Cookie options ────────────────────────────────────────────

export interface CookieOptions {
  /** Cookie name for access token (default: "guardo_access") */
  accessTokenCookie?: string;
  /** Cookie name for refresh token (default: "guardo_refresh") */
  refreshTokenCookie?: string;
  /** Cookie domain */
  domain?: string;
  /** Cookie path (default: "/") */
  path?: string;
  /** sameSite attribute (default: "lax") */
  sameSite?: "strict" | "lax" | "none";
  /** Secure flag - should be true in production (default: true) */
  secure?: boolean;
}

// ── Top-level config ──────────────────────────────────────────

export interface AuthConfig {
  jwt: JwtConfig;
  otp?: {
    /** Length of the generated OTP (default: 6) */
    length?: number;
    /** Expiry in seconds (default: 300) */
    expiry?: number;
  };
  /** Storage backend - defaults to in-memory */
  store?: StorageAdapter;
  /** Notification backend - defaults to NodemailerNotifier (Ethereal inbox in dev) */
  notifier?: Notifier;
  rateLimit?: RateLimitConfig;
  /**
   * Shorthand email config - passed straight to NodemailerNotifier.
   * If `notifier` is also set, `notifier` wins.
   */
  email?: import("./notifiers/email").EmailNotifierOptions;
  /**
   * Resolve a User object from an identifier (id or email/phone).
   * Useful so middleware can attach the full user to req.user.
   */
  resolveUser?: (identifier: string) => Promise<User | null>;
  /**
   * Called when a user logs in for the first time (resolveUser returned null).
   * Use this to auto-provision users in your database.
   * @returns The newly created User
   */
  onNewUser?: (identifier: string) => Promise<User>;
  /**
   * Event handlers - fired for auth lifecycle events.
   * Useful for audit logging, analytics, and monitoring.
   */
  events?: Partial<GuardoEvents>;
  /**
   * Enable httpOnly cookie mode for token transport.
   * When set, middleware will read tokens from cookies instead of Bearer headers.
   */
  cookies?: CookieOptions;
  /**
   * Enable OAuth / social login (Google, GitHub, or any custom provider).
   * Exposes `auth.oauth.start()` and `auth.oauth.callback()`.
   */
  oauth?: OAuthConfig;
}

// ── Middleware helpers ────────────────────────────────────────

/** Minimal interface so the lib doesn't hard-depend on Express types */
export interface ExpressRequest {
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string>;
  user?: User | TokenPayload;
  session?: Session;
  [key: string]: unknown;
}

export interface ExpressResponse {
  status(code: number): this;
  json(body: unknown): this;
  cookie(name: string, value: string, options: Record<string, unknown>): this;
  clearCookie(name: string, options?: Record<string, unknown>): this;
}

export type NextFunction = (err?: unknown) => void;
