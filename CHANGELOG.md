# Changelog

All notable changes to **guardo** are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com), and this project adheres to
[Semantic Versioning](https://semver.org).

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

[1.2.0]: https://github.com/nadun-dilshan/guardo/releases/tag/v1.2.0
[1.0.1]: https://github.com/nadun-dilshan/guardo/releases/tag/v1.0.1
[1.0.0]: https://github.com/nadun-dilshan/guardo/releases/tag/v1.0.0
