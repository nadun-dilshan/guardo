# Changelog

All notable changes to **guardo** are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com), and this project adheres to
[Semantic Versioning](https://semver.org).

## [1.5.0] - Safer call signatures, test ergonomics & dependency security

### Added

- **`otp.exposeCode`** config flag (default `false`) - returns the plaintext
  `code` in `otp.send()`'s result so automated tests can read the OTP without
  scraping notifier output. **Test/dev only - never enable in production.**
- New exported **`SendOtpResult`** type (`{ expiresInSeconds; code? }`), now the
  return type of `otp.send()`.
- `INVALID_ARGUMENT` error code (`GuardoErrorCode`).

### Changed

- `auth.logout()`, `auth.refreshTokens()` and `auth.logoutAll()` now throw an
  `AuthError` with code `INVALID_ARGUMENT` when called with a non-string
  argument, instead of silently no-op'ing. Previously `logout({ sessionId })`
  (the natural guess given `loginWithOtp`'s options object) left the session
  active and the access token usable, with no error thrown.
- `otp.send()` now returns `SendOtpResult` instead of an inline
  `{ expiresInSeconds: number }`. The runtime shape is unchanged unless
  `otp.exposeCode` is enabled.

### Security

- Upgraded **nodemailer** to `^9.0.1` to clear high-severity advisory
  **GHSA-p6gq-j5cr-w38f** (the message-level `raw` option bypassed
  `disableFileAccess` / `disableUrlAccess`, enabling arbitrary file read and
  SSRF). Bundled by default via the email notifier, so it previously shipped
  transitively to every consumer. `@types/nodemailer` bumped to `^7`.

### Docs

- Documented the **16-character minimum** on `jwt.secret` in the Quick Start so
  short test secrets no longer trigger a surprising crash.
- Clarified that `req.user` is the decoded JWT payload (`sub`, `email?`,
  `sessionId`, `type`, `iat`, `exp`) unless `resolveUser` is configured.
- Bumped the homepage version badge to match the published release.

## [1.3.0] - OAuth / social login

### Added

- **OAuth module** (`auth.oauth`) - social login via the authorization-code
  flow with single-use CSRF `state` and PKCE (S256). `oauth.start(provider)`
  builds the redirect URL; `oauth.callback(provider, { code, state })` exchanges
  the code, resolves/provisions the user, and issues the **same** session +
  JWT pair as OTP login (`OAuthLoginResult` extends `LoginResult`).
- Built-in providers: **`GoogleProvider`** (OIDC, PKCE) and **`GithubProvider`**
  (with `/user/emails` fallback for a verified primary email).
- **`OAuth2Provider`** - a generic, pluggable provider for any OAuth 2.0 / OIDC
  service, plus the `createOAuthProvider()` factory. Custom services need no new
  guardo release.
- `oauth` config on `createAuth()` (`providers`, `redirectUri`,
  `stateTtlSeconds`, `resolveUser`, `onNewUser`).
- OAuth lifecycle events: `oauth.started`, `oauth.success`, `oauth.failed`.
- `OAuthError` class and `OAUTH_*` error codes (`OAUTH_NOT_CONFIGURED`,
  `OAUTH_PROVIDER_NOT_FOUND`, `OAUTH_STATE_INVALID`, `OAUTH_EXCHANGE_FAILED`,
  `OAUTH_PROFILE_FAILED`).
- New `./oauth` package subpath export for the provider classes.

## [1.2.0] - Event-driven architecture & cookie transport

### Added

- Typed lifecycle **events** (`events` config + `GuardoEvents`): `otp.sent`,
  `otp.verified`, `otp.failed`, `login.success`, `login.failed`, `logout`,
  `logout.all`, `token.refreshed`, `token.reuse_detected`, `session.revoked`.
- **httpOnly cookie mode** - `cookies` config plus `setTokenCookies()` /
  `clearTokenCookies()` middleware helpers.
- **Fastify** middleware: `auth.middleware.fastify()`.
- `onNewUser` hook to auto-provision users when `resolveUser` returns `null`.
- Per-IP rate limiting (`otpSendPerIp`, `otpVerifyPerIp`) via the optional `ip`
  on `otp.send()`.
- `session.listAll()` for paginated, cross-user session listing.
- Asymmetric JWT signing via `jwt.algorithm` (e.g. `RS256`).

### Changed

- `VerifyOtpResult` now includes a machine-readable `code` (`GuardoErrorCode`).
- Fixed `package.json` `exports` to point at the emitted CommonJS build instead
  of non-existent `.mjs` files.

## [1.0.1] - Stability & DX improvements

### Fixed

- Ethereal transport silently falls back to console when no internet is
  available.
- `timingSafeEqual` buffer-length mismatch on wrong-length OTP input.

### Changed

- Export `TokenTypeError` from the main entry point.
- Improve error messages for revoked sessions.

## [1.0.0] - Initial public release

### Added

- `createAuth()` factory with full module wiring.
- OTP module: generate, hash, send, verify, attempt limiting.
- JWT module: access + refresh token pair with TTL config.
- Session module: multi-device sessions with touch & revoke.
- Express middleware: JWT guard + RBAC `role()`.
- Next.js Edge middleware + App Router route wrapper.
- `MemoryStore` and `RedisStore` adapters.
- `ConsoleNotifier`, `NodemailerNotifier`, `MultiChannelNotifier`.
- Sliding-window rate limiter for OTP send & verify.
- Full TypeScript types exported from the main entry.

[1.3.0]: https://github.com/nadun-dilshan/guardo/releases/tag/v1.3.0
[1.2.0]: https://github.com/nadun-dilshan/guardo/releases/tag/v1.2.0
[1.0.1]: https://github.com/nadun-dilshan/guardo/releases/tag/v1.0.1
[1.0.0]: https://github.com/nadun-dilshan/guardo/releases/tag/v1.0.0
