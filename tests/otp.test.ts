// ─────────────────────────────────────────────────────────────
//  guardo  ·  tests/otp.test.ts
//  Security-critical OTP behaviour: hashed storage, one-time use,
//  attempt limiting, timing-safe comparison.
// ─────────────────────────────────────────────────────────────

import crypto from "node:crypto";
import { OtpModule } from "../src/core/otp";
import { MemoryStore } from "../src/adapters/memory";
import type { Notifier, NotifyPayload } from "../src/types";

/** Notifier that records the plaintext code so tests can read it back. */
class CaptureNotifier implements Notifier {
  public lastCode: string | null = null;
  async sendOTP(payload: NotifyPayload): Promise<void> {
    this.lastCode = payload.code;
  }
}

const ID = "user@example.com";
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

function setup() {
  const store = new MemoryStore();
  const notifier = new CaptureNotifier();
  const otp = new OtpModule({ length: 6, expiry: 300, store, notifier });
  return { store, notifier, otp };
}

describe("OtpModule.send", () => {
  it("generates a code of the configured length", async () => {
    const { otp, notifier } = setup();
    await otp.send({ identifier: ID });
    expect(notifier.lastCode).toMatch(/^\d{6}$/);
  });

  it("stores the OTP hashed, never in plaintext", async () => {
    const { otp, notifier, store } = setup();
    await otp.send({ identifier: ID });

    const stored = await store.get(`otp:${ID}`);
    expect(stored).not.toBeNull();
    expect(stored).not.toBe(notifier.lastCode); // not plaintext
    expect(stored).toBe(sha256(notifier.lastCode!)); // SHA-256 of the code
  });

  it("resets the attempt counter on each new send", async () => {
    const { otp, store } = setup();
    await store.set(`otp_attempts:${ID}`, "3", 300);
    await otp.send({ identifier: ID });
    expect(await store.get(`otp_attempts:${ID}`)).toBeNull();
  });
});

describe("OtpModule.verify", () => {
  it("verifies a correct code and consumes it (one-time use)", async () => {
    const { otp, notifier } = setup();
    await otp.send({ identifier: ID });
    const code = notifier.lastCode!;

    const first = await otp.verify({ identifier: ID, otp: code });
    expect(first).toEqual({ success: true, verified: true });

    // Second use of the same code must fail - it was consumed.
    const second = await otp.verify({ identifier: ID, otp: code });
    expect(second.verified).toBe(false);
    expect(second.code).toBe("OTP_EXPIRED");
  });

  it("trims surrounding whitespace before comparing", async () => {
    const { otp, notifier } = setup();
    await otp.send({ identifier: ID });
    const result = await otp.verify({ identifier: ID, otp: `  ${notifier.lastCode}  ` });
    expect(result.verified).toBe(true);
  });

  it("rejects an incorrect code and counts down remaining attempts", async () => {
    const { otp, notifier } = setup();
    await otp.send({ identifier: ID });
    const wrong = notifier.lastCode === "000000" ? "111111" : "000000";

    const result = await otp.verify({ identifier: ID, otp: wrong });
    expect(result.verified).toBe(false);
    expect(result.code).toBe("OTP_INVALID");
    expect(result.error).toContain("4 attempt(s) remaining");
  });

  it("locks out after 5 failed attempts and destroys the OTP", async () => {
    const { otp, notifier, store } = setup();
    await otp.send({ identifier: ID });
    const wrong = notifier.lastCode === "000000" ? "111111" : "000000";

    // 5 wrong attempts -> still "invalid"
    for (let i = 0; i < 5; i++) {
      const r = await otp.verify({ identifier: ID, otp: wrong });
      expect(r.code).toBe("OTP_INVALID");
    }

    // 6th -> max attempts, and the OTP is wiped from the store
    const locked = await otp.verify({ identifier: ID, otp: wrong });
    expect(locked.code).toBe("OTP_MAX_ATTEMPTS");
    expect(await store.get(`otp:${ID}`)).toBeNull();

    // Even the correct code no longer works after lockout.
    const afterLock = await otp.verify({ identifier: ID, otp: notifier.lastCode! });
    expect(afterLock.code).toBe("OTP_EXPIRED");
  });

  it("reports OTP_EXPIRED when no OTP exists", async () => {
    const { otp } = setup();
    const result = await otp.verify({ identifier: "nobody@example.com", otp: "123456" });
    expect(result.verified).toBe(false);
    expect(result.code).toBe("OTP_EXPIRED");
  });
});
