<div align="center">

<h1>🔐 guardo</h1>

<p>Production-ready authentication engine for <strong>Node.js</strong> and <strong>Next.js</strong>, written in TypeScript.</p>

[![npm version](https://img.shields.io/npm/v/guardo?color=6c63ff&style=flat-square)](https://www.npmjs.com/package/guardo)
[![npm downloads](https://img.shields.io/npm/dm/guardo?color=38bdf8&style=flat-square)](https://www.npmjs.com/package/guardo)
[![license](https://img.shields.io/npm/l/guardo?color=34d399&style=flat-square)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6?style=flat-square)](https://www.typescriptlang.org)

<p>OTP login · JWT tokens · Multi-device sessions · Express &amp; Next.js middleware - all wired together.</p>

</div>

---

## Features

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

# Optional: Redis adapter for production
npm install ioredis
```

---

## Quick Start

```ts
import { createAuth } from "guardo";

const auth = createAuth({
  jwt: { secret: process.env.JWT_SECRET! },
});

// Step 1 - Send OTP
await auth.otp.send({ identifier: "user@example.com" });

// Step 2 - Verify OTP + login
const { user, accessToken, refreshToken, sessionId } =
  await auth.auth.loginWithOtp({
    identifier: "user@example.com",
    otp: "123456",
    meta: { device: "chrome-mac", ip: req.ip },
  });

// Step 3 - Protect routes
app.get("/me", auth.middleware.express(), (req, res) => {
  res.json(req.user);
});
```

> **In development**, with no SMTP config the default notifier creates a throwaway [Ethereal](https://ethereal.email) test inbox and logs a preview URL for each email (falling back to the console if Ethereal is unreachable). Prefer your terminal? Pass `notifier: new ConsoleNotifier()`.

> 📚 **Full documentation:** [guardo.nadun.me](https://guardo.nadun.me)

---

## Configuration

```ts
const auth = createAuth({
  // Required
  jwt: {
    secret: "at-least-16-chars",
    accessTokenTTL:  "15m",   // default
    refreshTokenTTL: "7d",    // default
    extraClaims: { iss: "my-app" },
  },

  // OTP settings
  otp: {
    length: 6,     // default
    expiry: 300,   // seconds, default 5 minutes
  },

  // Storage (default: in-memory)
  store: new RedisStore(redisClient),

  // Notifications (default: NodemailerNotifier - Ethereal inbox in dev)
  notifier: myEmailNotifier,

  // Rate limiting (per-identifier and per-IP)
  rateLimit: {
    otpSend:        { max: 5,  windowSeconds: 60 },
    otpVerify:      { max: 10, windowSeconds: 60 },
    otpSendPerIp:   { max: 20, windowSeconds: 60 },
    otpVerifyPerIp: { max: 30, windowSeconds: 60 },
  },

  // Optional: resolve full user from DB after OTP verification
  resolveUser: async (identifier) => db.users.findByEmail(identifier),

  // Optional: auto-provision when resolveUser returns null
  onNewUser: async (identifier) => db.users.create({ email: identifier }),

  // Optional: typed lifecycle event handlers
  events: {
    "login.success": ({ user }) => audit.log(user.id, "login"),
  },
});
```

---

## OTP Module - `auth.otp`

```ts
// Send OTP
await auth.otp.send({ identifier: "user@example.com", channel: "email" });
// → { expiresInSeconds: 300 }

// Verify OTP
const result = await auth.otp.verify({ identifier: "user@example.com", otp: "123456" });
// → { success: true, verified: true }
// → { success: false, verified: false, error: "Invalid OTP. 4 attempt(s) remaining." }

// Check if a pending OTP exists
const pending = await auth.otp.exists("user@example.com"); // boolean
```

---

## Auth Module - `auth.auth`

```ts
// Login (OTP verify + session + tokens in one step)
const { user, accessToken, refreshToken, sessionId } =
  await auth.auth.loginWithOtp({ identifier, otp, meta: { device, ip } });

// Refresh tokens (rotation - old session revoked)
const { accessToken, refreshToken, sessionId } =
  await auth.auth.refreshTokens(oldRefreshToken);

// Logout from one device
await auth.auth.logout("sess_abc123");

// Logout from all devices
const count = await auth.auth.logoutAll("user-123"); // → 3
```

---

## JWT Module - `auth.jwt`

```ts
// Issue tokens manually
const pair = auth.jwt.issueTokenPair(user, sessionId);

// Verify (throws on invalid/expired)
const payload = auth.jwt.verifyAccessToken(token);
const payload = auth.jwt.verifyRefreshToken(token);

// Decode without verifying
const payload = auth.jwt.decode(token);
```

---

## Session Module - `auth.session`

```ts
const session = await auth.session.create(userId, { device, ip });
const sessions = await auth.session.list(userId);   // newest first
await auth.session.touch("sess_abc123");             // update lastActiveAt
await auth.session.revoke("sess_abc123");            // single device
const n = await auth.session.revokeAll(userId);      // all devices
```

---

## Middleware

### Express

```ts
// JWT guard - populates req.user and req.session
app.get("/profile", auth.middleware.express(), handler);

// Role-based access (must come after express())
app.delete(
  "/admin/users/:id",
  auth.middleware.express(),
  auth.middleware.role(["admin", "superadmin"]),
  handler,
);
```

### Fastify

```ts
// Register globally…
fastify.addHook("preHandler", auth.middleware.fastify());
// …or per route
fastify.get("/me", { preHandler: auth.middleware.fastify() }, async (req) => req.user);
```

### Next.js Edge Middleware

```ts
// middleware.ts
export const middleware = auth.middleware.nextjs();
export const config = { matcher: ["/api/:path*", "/dashboard/:path*"] };
```

### Next.js App Router Route Wrapper

```ts
// app/api/me/route.ts
export const GET = auth.middleware.nextjsRoute(async (req, user) => {
  return Response.json({ user });
});
```

### httpOnly Cookie Mode

```ts
// Enable by passing `cookies` to createAuth()
const auth = createAuth({ jwt: { secret: "..." }, cookies: { secure: true } });

// After login, set httpOnly cookies instead of returning tokens in the body
auth.middleware.setTokenCookies(res, accessToken, refreshToken);
auth.middleware.clearTokenCookies(res); // on logout
```

---

## Events

Hook into the auth lifecycle for audit logging, analytics, and alerting. Handlers
are typed and never crash the auth flow.

```ts
const auth = createAuth({
  jwt: { secret: "..." },
  events: {
    "login.success": ({ user, sessionId }) => audit.write(user.id, "login"),
    "otp.failed": ({ identifier, reason }) => metrics.inc("otp.failed"),
    "token.reuse_detected": ({ userId }) => alertTeam(userId),
  },
});
```

Events: `otp.sent`, `otp.verified`, `otp.failed`, `login.success`, `login.failed`,
`logout`, `logout.all`, `token.refreshed`, `token.reuse_detected`, `session.revoked`.

---

## Storage Adapters

### In-Memory (dev/test)

```ts
import { MemoryStore } from "guardo";
const store = new MemoryStore();
store.clear(); // wipe in tests
```

### Redis (production)

```ts
import { RedisStore } from "guardo";
import Redis from "ioredis";

const store = new RedisStore(new Redis(process.env.REDIS_URL));
```

### Custom Store

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

### Console (dev)

```ts
import { ConsoleNotifier } from "guardo";
const auth = createAuth({ jwt: { secret: "..." }, notifier: new ConsoleNotifier() });
// Logs: [guardo] OTP for user@example.com via email: 483920 (expires in 300s)
```

### Nodemailer - Ethereal (dev)

```ts
import { NodemailerNotifier } from "guardo";
// No config → auto-creates Ethereal test inbox, logs preview URL
const auth = createAuth({ jwt: { secret: "..." }, notifier: new NodemailerNotifier() });
```

### Nodemailer - Real SMTP (production)

```ts
const auth = createAuth({
  jwt: { secret: "..." },
  notifier: new NodemailerNotifier({
    smtp: {
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    from: "noreply@myapp.com",
    subject: "Your login code",
  }),
});
```

### Custom Notifier

```ts
import type { Notifier, NotifyPayload } from "guardo";

class SendGridNotifier implements Notifier {
  async sendOTP({ to, code, expiresInSeconds }: NotifyPayload) {
    await sendgrid.send({ to, subject: "Your code", text: `Code: ${code}` });
  }
}
```

### Multi-Channel (email + SMS)

```ts
import { MultiChannelNotifier } from "guardo";
const notifier = new MultiChannelNotifier({
  email: new SendGridNotifier(),
  sms:   new TwilioNotifier(),
});
```

---

## Error Handling

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

| Error Class | Thrown by | Extra |
|-------------|-----------|-------|
| `AuthError` | `auth.auth.*` | - |
| `RateLimitError` | `auth.otp.send()` | `.retryAfterSeconds` |
| `TokenTypeError` | `auth.jwt.verify*()` | - |
| `JsonWebTokenError` | `auth.jwt.verify*()` | - |
| `TokenExpiredError` | `auth.jwt.verify*()` | - |

---

## Security

- OTPs stored as **SHA-256 hashes** - plaintext is never persisted
- OTP comparison uses `crypto.timingSafeEqual` to prevent timing attacks
- Each OTP is **single-use** - consumed on successful verification
- After **5 failed attempts**, the OTP is automatically invalidated
- Refresh token **rotation** - new session on every refresh
- Sessions are **TTL-bound** and expire with the refresh token

---

## Roadmap

- [x] OTP + JWT + Sessions
- [x] Express + Next.js middleware
- [x] Redis adapter
- [ ] OAuth providers (Google, GitHub)
- [ ] Device fingerprinting
- [ ] Risk scoring
- [ ] Analytics hooks

---

## Repository layout

The published `guardo` package lives at the repository root. The documentation
site is a nested workspace.

```
.
├── src/          → SDK source (published as dist/)
├── examples/     → runnable usage examples
├── docs/         → Nextra documentation site (workspace)
├── package.json  → the `guardo` package + docs workspace
├── CHANGELOG.md
└── LICENSE
```

```bash
npm install        # installs the SDK + docs workspace
npm run build      # compile the SDK to dist/
npm run typecheck  # type-check without emitting
npm run docs:dev   # run the docs site at http://localhost:3000
```

### Releasing

Releases are automated. From the **Actions → Release SDK** workflow, choose a
version bump (`patch` / `minor` / `major`) and run it. The workflow bumps
`package.json`, commits and tags, publishes to npm, and cuts a GitHub Release -
no manual version editing required. (Requires the `NPM_TOKEN` repo secret.)

The docs site deploys automatically to GitHub Pages on every push to `main` that
touches `docs/`.

## Contributing

Issues and PRs welcome! See the [GitHub repo](https://github.com/nadun-dilshan/guardo) to get started.

## License

[MIT](./LICENSE) © [nadun-dilshan](https://github.com/nadun-dilshan)