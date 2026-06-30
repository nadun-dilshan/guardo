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
import type { GuardoEventEmitter } from "./events";

export class AuthModule {
  constructor(
    private readonly otp: OtpModule,
    private readonly jwt: JwtModule,
    private readonly session: SessionModule,
    private readonly resolveUser?: (identifier: string) => Promise<User | null>,
    private readonly onNewUser?: (identifier: string) => Promise<User>,
    private readonly events?: GuardoEventEmitter
  ) {}

  // ── OTP Login ────────────────────────────────────────────────

  async loginWithOtp(opts: LoginWithOtpOptions): Promise<LoginResult> {
    const { identifier, otp, meta } = opts;

    // 1. Verify OTP
    const verification = await this.otp.verify({ identifier, otp });
    if (!verification.verified) {
      this.events?.emit("login.failed", {
        identifier,
        reason: verification.error ?? "OTP verification failed",
      });
      throw new AuthError(
        verification.error ?? "OTP verification failed.",
        verification.code
      );
    }

    // 2. Resolve user - or auto-provision via onNewUser
    let user: User;
    if (this.resolveUser) {
      const resolved = await this.resolveUser(identifier);
      if (!resolved) {
        if (this.onNewUser) {
          user = await this.onNewUser(identifier);
        } else {
          this.events?.emit("login.failed", { identifier, reason: "User not found" });
          throw new AuthError(
            `No user found for identifier: ${identifier}`,
            "USER_NOT_FOUND"
          );
        }
      } else {
        user = resolved;
      }
    } else {
      // Fallback: treat identifier as both id and email/phone
      user = {
        id: identifier,
        ...(identifier.includes("@")
          ? { email: identifier }
          : { phone: identifier }),
      };
    }

    // 3. Create session
    const sessionRecord = await this.session.create(user.id, meta);

    // 4. Issue token pair
    const { accessToken, refreshToken } = this.jwt.issueTokenPair(
      user,
      sessionRecord.sessionId
    );

    this.events?.emit("login.success", {
      user,
      sessionId: sessionRecord.sessionId,
      meta,
    });

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
   * Detects refresh token reuse - if the session is already revoked,
   * ALL user sessions are invalidated (stolen token protection).
   */
  async refreshTokens(
    refreshToken: string
  ): Promise<TokenPair & { sessionId: string }> {
    if (typeof refreshToken !== "string") {
      throw new AuthError(
        "refreshTokens(refreshToken) expects a refresh-token string, e.g. refreshTokens(result.refreshToken).",
        "INVALID_ARGUMENT"
      );
    }

    const payload = this.jwt.verifyRefreshToken(refreshToken);

    const sessionId = payload.sessionId as string | undefined;
    if (sessionId) {
      const valid = await this.session.isValid(sessionId);
      if (!valid) {
        // Refresh token reuse detected - revoke all sessions for safety
        this.events?.emit("token.reuse_detected", {
          userId: payload.sub,
          sessionId,
        });
        await this.session.revokeAll(payload.sub);
        throw new AuthError(
          "Refresh token reuse detected. All sessions have been revoked. Please log in again.",
          "REFRESH_TOKEN_REUSE"
        );
      }
      // Revoke old session (rotation)
      await this.session.revoke(sessionId);
    }

    // Rebuild user from payload
    const user: User = {
      id: payload.sub,
      ...(payload.email && { email: payload.email as string }),
      ...(payload.role && { role: payload.role as string }),
    };

    const newSession = await this.session.create(user.id);
    const tokens = this.jwt.issueTokenPair(user, newSession.sessionId);

    this.events?.emit("token.refreshed", {
      userId: user.id,
      newSessionId: newSession.sessionId,
    });

    return { ...tokens, sessionId: newSession.sessionId };
  }

  // ── Logout ────────────────────────────────────────────────────

  async logout(sessionId: string): Promise<void> {
    if (typeof sessionId !== "string") {
      throw new AuthError(
        "logout(sessionId) expects a session-ID string, e.g. logout(result.sessionId).",
        "INVALID_ARGUMENT"
      );
    }

    const session = await this.session.get(sessionId);
    await this.session.revoke(sessionId);
    this.events?.emit("logout", {
      sessionId,
      userId: session?.userId,
    });
  }

  async logoutAll(userId: string): Promise<number> {
    if (typeof userId !== "string") {
      throw new AuthError(
        "logoutAll(userId) expects a user-ID string, e.g. logoutAll(result.user.id).",
        "INVALID_ARGUMENT"
      );
    }

    const count = await this.session.revokeAll(userId);
    this.events?.emit("logout.all", { userId, sessionsRevoked: count });
    return count;
  }
}

// ── Custom Errors ─────────────────────────────────────────────

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code?: import("../types").GuardoErrorCode
  ) {
    super(message);
    this.name = "AuthError";
  }
}
