// ─────────────────────────────────────────────────────────────
//  guardo  ·  core/auth.ts
//  High-level login / token-refresh flows.
// ─────────────────────────────────────────────────────────────

import type {
  LoginWithOtpOptions,
  LoginResult,
  User,
  TokenPair,
} from "../types";
import type { OtpModule } from "./otp";
import type { JwtModule } from "./jwt";
import type { SessionModule } from "./session";

export class AuthModule {
  constructor(
    private readonly otp: OtpModule,
    private readonly jwt: JwtModule,
    private readonly session: SessionModule,
    private readonly resolveUser?: (identifier: string) => Promise<User | null>
  ) {}

  // ── OTP Login ────────────────────────────────────────────────

  /**
   * One-shot login: verify OTP → create session → issue tokens.
   *
   * @example
   * const result = await auth.loginWithOtp({
   *   identifier: "user@example.com",
   *   otp: "123456",
   *   meta: { device: "chrome-mac", ip: "1.2.3.4" },
   * });
   */
  async loginWithOtp(opts: LoginWithOtpOptions): Promise<LoginResult> {
    const { identifier, otp, meta } = opts;

    // 1. Verify OTP
    const verification = await this.otp.verify({ identifier, otp });
    if (!verification.verified) {
      throw new AuthError(verification.error ?? "OTP verification failed.");
    }

    // 2. Resolve the user (or build a minimal one from the identifier)
    let user: User;
    if (this.resolveUser) {
      const resolved = await this.resolveUser(identifier);
      if (!resolved) {
        throw new AuthError(`No user found for identifier: ${identifier}`);
      }
      user = resolved;
    } else {
      // Fallback: treat the identifier as both id and email/phone
      user = {
        id: identifier,
        ...(identifier.includes("@")
          ? { email: identifier }
          : { phone: identifier }),
      };
    }

    // 3. Create a session
    const sessionRecord = await this.session.create(user.id, meta);

    // 4. Issue token pair
    const { accessToken, refreshToken } = this.jwt.issueTokenPair(
      user,
      sessionRecord.sessionId
    );

    return {
      user,
      accessToken,
      refreshToken,
      sessionId: sessionRecord.sessionId,
    };
  }

  // ── Token Refresh ─────────────────────────────────────────────

  /**
   * Exchange a valid refresh token for a fresh token pair.
   * Revokes the old session and creates a new one (rotation).
   */
  async refreshTokens(refreshToken: string): Promise<TokenPair & { sessionId: string }> {
    const payload = this.jwt.verifyRefreshToken(refreshToken);

    const sessionId = payload.sessionId as string | undefined;
    if (sessionId) {
      const valid = await this.session.isValid(sessionId);
      if (!valid) {
        throw new AuthError("Session has been revoked. Please log in again.");
      }
      // Revoke old session (rotation)
      await this.session.revoke(sessionId);
    }

    // Rebuild minimal user from payload
    const user: User = {
      id: payload.sub,
      ...(payload.email && { email: payload.email as string }),
      ...(payload.role && { role: payload.role as string }),
    };

    // New session
    const newSession = await this.session.create(user.id);
    const tokens = this.jwt.issueTokenPair(user, newSession.sessionId);

    return { ...tokens, sessionId: newSession.sessionId };
  }

  // ── Logout ────────────────────────────────────────────────────

  /**
   * Revoke a specific session (single-device logout).
   */
  async logout(sessionId: string): Promise<void> {
    await this.session.revoke(sessionId);
  }

  /**
   * Revoke ALL sessions for a user (logout everywhere).
   * Returns the number of sessions revoked.
   */
  async logoutAll(userId: string): Promise<number> {
    return this.session.revokeAll(userId);
  }
}

// ── Custom Errors ─────────────────────────────────────────────

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}
