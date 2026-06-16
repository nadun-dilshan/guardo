// ─────────────────────────────────────────────────────────────
//  guardo  ·  tests/auth.test.ts
//  Refresh-token rotation and stolen-token reuse detection.
// ─────────────────────────────────────────────────────────────

import { AuthModule, AuthError } from "../src/core/auth";
import { OtpModule } from "../src/core/otp";
import { JwtModule } from "../src/core/jwt";
import { SessionModule } from "../src/core/session";
import { MemoryStore } from "../src/adapters/memory";
import type { Notifier, NotifyPayload, User } from "../src/types";

class NoopNotifier implements Notifier {
  async sendOTP(_payload: NotifyPayload): Promise<void> {}
}

const SECRET = "test-secret-at-least-16-chars-long";
const USER: User = { id: "u1", email: "u1@example.com", role: "member" };

function setup() {
  const store = new MemoryStore();
  const jwt = new JwtModule({ secret: SECRET });
  const session = new SessionModule(store, 3600);
  const otp = new OtpModule({ length: 6, expiry: 300, store, notifier: new NoopNotifier() });
  const auth = new AuthModule(otp, jwt, session);
  return { store, jwt, session, auth };
}

describe("AuthModule.refreshTokens - rotation", () => {
  it("rotates the session: old token's session is revoked, a new one is issued", async () => {
    const { jwt, session, auth } = setup();

    const s1 = await session.create(USER.id);
    const refreshToken = jwt.issueRefreshToken(USER, s1.sessionId);

    const result = await auth.refreshTokens(refreshToken);

    expect(result.sessionId).not.toBe(s1.sessionId);
    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));

    // Old session invalidated, new session valid.
    expect(await session.isValid(s1.sessionId)).toBe(false);
    expect(await session.isValid(result.sessionId)).toBe(true);
  });

  it("issues a refresh token that itself verifies as a refresh token", async () => {
    const { jwt, session, auth } = setup();
    const s1 = await session.create(USER.id);
    const result = await auth.refreshTokens(jwt.issueRefreshToken(USER, s1.sessionId));

    const payload = jwt.verifyRefreshToken(result.refreshToken);
    expect(payload.sub).toBe(USER.id);
    expect(payload.sessionId).toBe(result.sessionId);
  });
});

describe("AuthModule.refreshTokens - reuse detection", () => {
  it("revokes ALL sessions when an already-rotated refresh token is replayed", async () => {
    const { jwt, session, auth } = setup();

    const s1 = await session.create(USER.id);
    const stolenToken = jwt.issueRefreshToken(USER, s1.sessionId);

    // Legitimate rotation: s1 -> s2.
    const rotated = await auth.refreshTokens(stolenToken);
    expect(await session.isValid(rotated.sessionId)).toBe(true);

    // Attacker replays the original token whose session is already revoked.
    await expect(auth.refreshTokens(stolenToken)).rejects.toMatchObject({
      code: "REFRESH_TOKEN_REUSE",
    });

    // Reuse triggers a full revocation - the legit session is gone too.
    expect(await session.isValid(rotated.sessionId)).toBe(false);
  });

  it("rejects a token signed with the wrong secret", async () => {
    const { auth } = setup();
    const foreign = new JwtModule({ secret: "a-different-secret-16+chars" });
    const token = foreign.issueRefreshToken(USER, "sess_x");

    await expect(auth.refreshTokens(token)).rejects.toBeInstanceOf(Error);
  });

  it("throws AuthError (not a generic Error) on reuse", async () => {
    const { jwt, session, auth } = setup();
    const s1 = await session.create(USER.id);
    const token = jwt.issueRefreshToken(USER, s1.sessionId);
    await auth.refreshTokens(token);

    await expect(auth.refreshTokens(token)).rejects.toBeInstanceOf(AuthError);
  });
});
