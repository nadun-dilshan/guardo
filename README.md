# guardo

Production-ready authentication engine for **Node.js** and **Next.js**,
written in TypeScript.

---

## What you get

| Feature | Details |
|---------|---------|
| **OTP Login** | Generate, deliver, and verify time-limited codes |
| **JWT Tokens** | Access + refresh token pair with configurable TTLs |
| **Session Management** | Multi-device sessions with per-session revocation |
| **Express Middleware** | JWT guard + role-based access in one line |
| **Next.js Middleware** | Edge-compatible + App Router route wrappers |
| **Pluggable Storage** | In-memory (dev) or Redis (prod) out of the box |
| **Pluggable Notifier** | Console (dev), or wire in any email/SMS provider |
| **Rate Limiting** | Per-identifier sliding-window limits on OTP flows |
| **Security** | Hashed OTP storage, timing-safe comparison, attempt limits |

---

## Installation

```bash
npm install guardo
# or
pnpm add guardo
```

---

## Quick Start

```ts
import { createAuth } from "guardo";

const auth = createAuth({
  jwt: {
    secret: process.env.JWT_SECRET!,
    accessTokenTTL: "15m",   // default
    refreshTokenTTL: "7d",   // default
  },
});

// Step 1 — send OTP
await auth.otp.send({ identifier: "user@example.com" });

// Step 2 — verify OTP + log in
const { user, accessToken, refreshToken, sessionId } =
  await auth.auth.loginWithOtp({
    identifier: "user@example.com",
    otp: "123456",
    meta: { device: "chrome-mac", ip: req.ip },
  });

// Step 3 — protect routes
app.get("/me", auth.middleware.express(), (req, res) => {
  res.json(req.user);
});
```

---

## Configuration

```ts
const auth = createAuth({
  // ── Required ─────────────────────────────────────────────
  jwt: {
    secret: "at-least-16-chars",
    accessTokenTTL: "15m",
    refreshTokenTTL: "7d",
    extraClaims: { iss: "my-app" }, // embedded in every token
  },

  // ── OTP ──────────────────────────────────────────────────
  otp: {
    length: 6,     // default
    expiry: 300,   // seconds — default 5 minutes
  },

  // ── Storage ───────────────────────────────────────────────
  store: new RedisStore(redisClient), // default: MemoryStore

  // ── Notifications ─────────────────────────────────────────
  notifier: myEmailNotifier,         // default: ConsoleNotifier

  // ── Rate limits ───────────────────────────────────────────
  rateLimit: {
    otpSend:   { max: 5,  windowSeconds: 60 },  // default
    otpVerify: { max: 10, windowSeconds: 60 },  // default
  },

  // ── User resolution ───────────────────────────────────────
  // Called after OTP verification and on every authenticated request.
  // Attach your DB call here so req.user is always a full User object.
  resolveUser: async (identifier) => {
    return db.users.findByEmail(identifier);
  },
});
```

---

## OTP Module — `auth.otp`

### `send(opts)`

```ts
await auth.otp.send({
  identifier: "user@example.com",
  channel: "email", // or "sms" — default "email"
});
// Returns: { expiresInSeconds: 300 }
```

### `verify(opts)`

```ts
const result = await auth.otp.verify({
  identifier: "user@example.com",
  otp: "123456",
});
// { success: true, verified: true }
// { success: false, verified: false, error: "Invalid OTP. 4 attempt(s) remaining." }
```

### `exists(identifier)`

```ts
const pending = await auth.otp.exists("user@example.com"); // boolean
```

---

## Auth Module — `auth.auth`

### `loginWithOtp(opts)` — full login flow

```ts
const result = await auth.auth.loginWithOtp({
  identifier: "user@example.com",
  otp: "123456",
  meta: { device: "iPhone 15", ip: "1.2.3.4" },
});

// result:
{
  user: { id: "123", email: "user@example.com" },
  accessToken: "eyJ...",
  refreshToken: "eyJ...",
  sessionId: "sess_abc123",
}
```

### `refreshTokens(refreshToken)` — rotate tokens

```ts
const { accessToken, refreshToken, sessionId } =
  await auth.auth.refreshTokens(oldRefreshToken);
```

### `logout(sessionId)` — single device

```ts
await auth.auth.logout("sess_abc123");
```

### `logoutAll(userId)` — all devices

```ts
const count = await auth.auth.logoutAll("user-123"); // → 3
```

---

## JWT Module — `auth.jwt`

```ts
// Issue tokens manually
const accessToken  = auth.jwt.issueAccessToken(user, sessionId);
const refreshToken = auth.jwt.issueRefreshToken(user, sessionId);
const { accessToken, refreshToken } = auth.jwt.issueTokenPair(user, sessionId);

// Verify
const payload = auth.jwt.verifyAccessToken(token);   // throws if invalid
const payload = auth.jwt.verifyRefreshToken(token);  // throws if invalid

// Decode without verifying (e.g. to read sub from expired token)
const payload = auth.jwt.decode(token);
```

---

## Session Module — `auth.session`

```ts
// Create
const session = await auth.session.create(userId, {
  device: "Safari on iPad",
  ip: "1.2.3.4",
});

// Get one
const session = await auth.session.get("sess_abc123");

// List all for a user
const sessions = await auth.session.list(userId);
// Returns newest-first

// Touch (keep alive / update lastActiveAt)
await auth.session.touch("sess_abc123");

// Revoke one
await auth.session.revoke("sess_abc123");

// Revoke all → returns count
const n = await auth.session.revokeAll(userId);
```

---

## Middleware

### Express — `auth.middleware.express()`

Attach to any route to require a valid JWT. Adds `req.user` and `req.session`.

```ts
app.get("/profile", auth.middleware.express(), (req, res) => {
  res.json(req.user);
});
```

### Express — `auth.middleware.role(roles)`

Must be placed **after** `express()`.

```ts
app.delete(
  "/admin/users/:id",
  auth.middleware.express(),
  auth.middleware.role(["admin", "superadmin"]),
  handler,
);
```

### Next.js Edge Middleware — `auth.middleware.nextjs()`

```ts
// middleware.ts (project root)
import { createAuth } from "guardo";
const auth = createAuth({ jwt: { secret: process.env.JWT_SECRET! } });

export const middleware = auth.middleware.nextjs();

export const config = {
  matcher: ["/api/:path*", "/dashboard/:path*"],
};
```

### Next.js App Router Route Wrapper — `auth.middleware.nextjsRoute()`

```ts
// app/api/me/route.ts
export const GET = auth.middleware.nextjsRoute(async (req, user) => {
  return Response.json({ user });
});
```

---

## Storage Adapters

### In-Memory (default — dev/test only)

```ts
import { MemoryStore } from "guardo";
const store = new MemoryStore();
store.clear(); // wipe in tests
```

### Redis (production)

Requires [`ioredis`](https://github.com/redis/ioredis) as a peer dep.

```ts
import { RedisStore } from "guardo";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);
const store = new RedisStore(redis);

const auth = createAuth({ jwt: { secret: "..." }, store });
```

### Custom Store

Implement the `StorageAdapter` interface:

```ts
import type { StorageAdapter } from "guardo";

class MongoStore implements StorageAdapter {
  async set(key: string, value: string, ttlSeconds?: number) { /* ... */ }
  async get(key: string): Promise<string | null> { /* ... */ }
  async delete(key: string) { /* ... */ }
  async keys(prefix: string): Promise<string[]> { /* ... */ }
}
```

---

## Notifiers

### Console (default — dev only)

Logs `[guardo] OTP for user@example.com via email: 483920 (expires in 300s)`.

### Custom Notifier

```ts
import type { Notifier, NotifyPayload } from "guardo";

class SendGridNotifier implements Notifier {
  async sendOTP({ to, code, expiresInSeconds }: NotifyPayload) {
    await sendgrid.send({
      to,
      subject: "Your verification code",
      text: `Your code is ${code}. It expires in ${expiresInSeconds}s.`,
    });
  }
}

const auth = createAuth({
  jwt: { secret: "..." },
  notifier: new SendGridNotifier(),
});
```

### Multi-Channel

```ts
import { MultiChannelNotifier } from "guardo";

const auth = createAuth({
  jwt: { secret: "..." },
  notifier: new MultiChannelNotifier({
    email: new SendGridNotifier(),
    sms:   new TwilioNotifier(),
  }),
});
```

### Functional shorthand

```ts
import { createNotifier } from "guardo";

const auth = createAuth({
  jwt: { secret: "..." },
  notifier: createNotifier(async ({ to, code }) => {
    console.log(`Send ${code} to ${to}`);
  }),
});
```

---

## Error Handling

All errors thrown by the library extend `Error` and have a `.name` property:

| Class | Thrown by |
|-------|-----------|
| `AuthError` | `auth.auth.*` — bad OTP, revoked session, user not found |
| `RateLimitError` | `auth.otp.send()` — has `.retryAfterSeconds` |
| `TokenTypeError` | `auth.jwt.verify*()` — wrong token type |
| `JsonWebTokenError` | `auth.jwt.verify*()` — invalid signature |
| `TokenExpiredError` | `auth.jwt.verify*()` — expired token |

```ts
import { AuthError, RateLimitError } from "guardo";

try {
  await auth.auth.loginWithOtp({ identifier, otp });
} catch (err) {
  if (err instanceof RateLimitError) {
    res.status(429).json({ error: `Retry in ${err.retryAfterSeconds}s` });
  } else if (err instanceof AuthError) {
    res.status(401).json({ error: err.message });
  }
}
```

---

## Security Notes

- OTPs are stored as **SHA-256 hashes** — plaintext is never persisted.
- OTP comparison uses `crypto.timingSafeEqual` to prevent timing attacks.
- Each OTP is **single-use** — consumed on successful verification.
- After **5 failed attempts**, the OTP is invalidated automatically.
- Refresh token rotation creates a new session on every refresh.
- Sessions are TTL-bound and tied to refresh token lifetime.

---

## Roadmap

- [x] OTP + JWT + Sessions
- [x] Express + Next.js middleware
- [x] Redis adapter
- [ ] OAuth providers (Google, GitHub)
- [ ] Device fingerprinting
- [ ] Risk scoring
- [ ] Analytics hooks
