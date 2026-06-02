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
  private readonly algorithm: string;

  constructor(config: JwtConfig) {
    if (!config.secret || config.secret.length < 16) {
      throw new Error("[guardo] JWT secret must be at least 16 characters.");
    }
    this.secret = config.secret;
    this.accessTTL = config.accessTokenTTL ?? "15m";
    this.refreshTTL = config.refreshTokenTTL ?? "7d";
    this.extraClaims = config.extraClaims ?? {};
    this.algorithm = config.algorithm ?? "HS256";
  }

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
      algorithm: this.algorithm as jwt.Algorithm,
    } as jwt.SignOptions);
  }

  issueRefreshToken(user: User, sessionId?: string): string {
    const payload: Omit<TokenPayload, "iat" | "exp"> = {
      sub: user.id,
      ...(sessionId && { sessionId }),
      type: "refresh",
    };

    return jwt.sign(payload, this.secret, {
      expiresIn: this.refreshTTL,
      algorithm: this.algorithm as jwt.Algorithm,
    } as jwt.SignOptions);
  }

  issueTokenPair(user: User, sessionId?: string): TokenPair {
    return {
      accessToken: this.issueAccessToken(user, sessionId),
      refreshToken: this.issueRefreshToken(user, sessionId),
    };
  }

  verifyAccessToken(token: string): TokenPayload {
    const payload = jwt.verify(token, this.secret, {
      algorithms: [this.algorithm as jwt.Algorithm],
    }) as TokenPayload;
    if (payload.type !== "access") {
      throw new TokenTypeError(
        "Expected an access token but received a refresh token.",
        "TOKEN_TYPE_MISMATCH"
      );
    }
    return payload;
  }

  verifyRefreshToken(token: string): TokenPayload {
    const payload = jwt.verify(token, this.secret, {
      algorithms: [this.algorithm as jwt.Algorithm],
    }) as TokenPayload;
    if (payload.type !== "refresh") {
      throw new TokenTypeError(
        "Expected a refresh token but received an access token.",
        "TOKEN_TYPE_MISMATCH"
      );
    }
    return payload;
  }

  decode(token: string): TokenPayload | null {
    const decoded = jwt.decode(token);
    return decoded as TokenPayload | null;
  }
}

// ── Custom Errors ─────────────────────────────────────────────

export class TokenTypeError extends Error {
  constructor(
    message: string,
    public readonly code?: import("../types").GuardoErrorCode
  ) {
    super(message);
    this.name = "TokenTypeError";
  }
}
