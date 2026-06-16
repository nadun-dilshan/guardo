// ─────────────────────────────────────────────────────────────
//  guardo  ·  tests/ratelimit.test.ts
//  Sliding-window limits, per-identifier AND per-IP, with reset.
// ─────────────────────────────────────────────────────────────

import { RateLimiter } from "../src/core/ratelimit";
import { MemoryStore } from "../src/adapters/memory";

function setup() {
  const store = new MemoryStore();
  const rl = new RateLimiter(store, {
    otpSend: { max: 3, windowSeconds: 60 },
    otpVerify: { max: 5, windowSeconds: 60 },
    otpSendPerIp: { max: 2, windowSeconds: 60 },
    otpVerifyPerIp: { max: 10, windowSeconds: 60 },
  });
  return { store, rl };
}

describe("RateLimiter - per identifier", () => {
  it("allows requests up to max, then blocks", async () => {
    const { rl } = setup();

    const r1 = await rl.checkOtpSend("alice");
    const r2 = await rl.checkOtpSend("alice");
    const r3 = await rl.checkOtpSend("alice");
    const r4 = await rl.checkOtpSend("alice");

    expect(r1.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
    expect(r4.allowed).toBe(false);
  });

  it("tracks identifiers independently", async () => {
    const { rl } = setup();
    await rl.checkOtpSend("alice");
    await rl.checkOtpSend("alice");
    await rl.checkOtpSend("alice");

    // bob is a fresh bucket
    expect((await rl.checkOtpSend("bob")).allowed).toBe(true);
  });
});

describe("RateLimiter - per IP", () => {
  it("blocks on the shared IP limit even when each identifier is fresh", async () => {
    const { rl } = setup();
    const ip = "203.0.113.7";

    expect((await rl.checkOtpSend("a", ip)).allowed).toBe(true); // ip count 1
    expect((await rl.checkOtpSend("b", ip)).allowed).toBe(true); // ip count 2
    expect((await rl.checkOtpSend("c", ip)).allowed).toBe(false); // ip count 3 > 2
  });
});

describe("RateLimiter - window reset", () => {
  it("resets the counter once the window elapses", async () => {
    const { rl } = setup();
    let now = 1_700_000_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);

    await rl.checkOtpSend("carol");
    await rl.checkOtpSend("carol");
    await rl.checkOtpSend("carol");
    expect((await rl.checkOtpSend("carol")).allowed).toBe(false);

    // Advance past the 60s window - the bucket should be fresh again.
    now += 61_000;
    expect((await rl.checkOtpSend("carol")).allowed).toBe(true);
  });
});
