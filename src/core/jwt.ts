// ─────────────────────────────────────────────────────────────
//  guardo  ·  core/jwt.ts
//  Issues and verifies access + refresh tokens.
// ─────────────────────────────────────────────────────────────

import jwt from "jsonwebtoken";
import type { JwtConfig, TokenPayload, TokenPair, User } from "../types";

export class JwtModule {
  private readonly secret: string;
  private readonly accessTTL: string;
  private readonly refreshTTL: string;
  private readonly extraClaims: Record<string, unknown>;

  constructor(config: JwtConfig) {
    if (!config.secret || config.secret.length < 16) {
      throw new Error(
        "[guardo] JWT secret must be at least 16 characters."
      );
    }
    this.secret = config.secret;
    this.accessTTL = config.accessTokenTTL ?? "15m";
    this.refreshTTL = config.refreshTokenTTL ?? "7d";
    this.extraClaims = config.extraClaims ?? {};
  }

  // ── Token issuance ───────────────────────────────────────────

  /** Issue a short-lived access token */
  issueAccessToken(user: User, sessionId?: string): string {
    const payload: Omit<TokenPayload, "iat" | "exp"> = {
      sub: user.id,
      ...(user.email && { email: user.email }),
      ...(user.role && { role: user.role }),
      ...(sessionId && { sessionId }),
      type: "access",
      ...this.extraClaims,
    };

    return jwt.sign(payload, this.secret, {
      expiresIn: this.accessTTL,
    } as jwt.SignOptions);
  }

  /** Issue a long-lived refresh token */
  issueRefreshToken(user: User, sessionId?: string): string {
    const payload: Omit<TokenPayload, "iat" | "exp"> = {
      sub: user.id,
      ...(sessionId && { sessionId }),
      type: "refresh",
    };

    return jwt.sign(payload, this.secret, {
      expiresIn: this.refreshTTL,
    } as jwt.SignOptions);
  }

  /** Issue both tokens at once */
  issueTokenPair(user: User, sessionId?: string): TokenPair {
    return {
      accessToken: this.issueAccessToken(user, sessionId),
      refreshToken: this.issueRefreshToken(user, sessionId),
    };
  }

  // ── Token verification ───────────────────────────────────────

  /** Verify and decode an access token. Throws on invalid/expired. */
  verifyAccessToken(token: string): TokenPayload {
    const payload = jwt.verify(token, this.secret) as TokenPayload;
    if (payload.type !== "access") {
      throw new TokenTypeError("Expected an access token but received a refresh token.");
    }
    return payload;
  }

  /** Verify and decode a refresh token. Throws on invalid/expired. */
  verifyRefreshToken(token: string): TokenPayload {
    const payload = jwt.verify(token, this.secret) as TokenPayload;
    if (payload.type !== "refresh") {
      throw new TokenTypeError("Expected a refresh token but received an access token.");
    }
    return payload;
  }

  /**
   * Safely decode a token without verifying the signature.
   * Useful for reading the `sub` from an expired token before deciding to refresh.
   */
  decode(token: string): TokenPayload | null {
    const decoded = jwt.decode(token);
    return decoded as TokenPayload | null;
  }
}

// ── Custom Errors ─────────────────────────────────────────────

export class TokenTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenTypeError";
  }
}
