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
  /** Delivery method — defaults to "email" */
  channel?: OtpChannel;
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
  error?: string;
}

// ── JWT ───────────────────────────────────────────────────────

export interface JwtConfig {
  /** Secret or private key used to sign tokens */
  secret: string;
  /** Access token lifetime — e.g. "15m", "1h" (default: "15m") */
  accessTokenTTL?: string;
  /** Refresh token lifetime — e.g. "7d", "30d" (default: "7d") */
  refreshTokenTTL?: string;
  /** Extra fields to embed in the JWT payload */
  extraClaims?: Record<string, unknown>;
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

// ── Rate Limiter ──────────────────────────────────────────────

export interface RateLimitRule {
  /** Maximum number of requests */
  max: number;
  /** Window in seconds */
  windowSeconds: number;
}

export interface RateLimitConfig {
  /** Rate limit for OTP send requests (default: 5 per 60 s) */
  otpSend?: RateLimitRule;
  /** Rate limit for OTP verify requests (default: 10 per 60 s) */
  otpVerify?: RateLimitRule;
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
  /** Storage backend — defaults to in-memory */
  store?: StorageAdapter;
  /** Notification backend — defaults to console logger */
  notifier?: Notifier;
  rateLimit?: RateLimitConfig;
  /**
   * Shorthand email config — passed straight to NodemailerNotifier.
   * If `notifier` is also set, `notifier` wins.
   * If neither is set, defaults to Ethereal (dev fake inbox).
   *
   * @example
   * email: { smtp: { host: "smtp.gmail.com", user: "x", pass: "y" }, from: "noreply@myapp.com" }
   */
  email?: import("./notifiers/email").EmailNotifierOptions;
  /**
   * Resolve a User object from an identifier.
   * Useful so middleware can attach the full user to req.user.
   * If not provided, only the JWT payload is returned.
   */
  resolveUser?: (identifier: string) => Promise<User | null>;
}

// ── Middleware helpers ────────────────────────────────────────

/** Minimal interface so the lib doesn't hard-depend on Express types */
export interface ExpressRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: User | TokenPayload;
  session?: Session;
  [key: string]: unknown;
}

export interface ExpressResponse {
  status(code: number): this;
  json(body: unknown): this;
}

export type NextFunction = (err?: unknown) => void;
