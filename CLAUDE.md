# CLAUDE.md

Guidance for AI assistants working in this repository. Keep changes consistent
with the rules below.

## What this is

`guardo` — a production-ready authentication engine for Node.js & Next.js
(OTP login, JWT, multi-device sessions, middleware). The repo root **is** the
published npm package; `docs/` is a nested Nextra documentation site (an npm
workspace).

```
src/        SDK source — compiled to dist/ (the only thing published)
docs/       Nextra docs site (workspace)
examples/   runnable usage samples (not published, not built in CI)
dist/        build output (gitignored)
```

## Commands

| Task | Command |
|------|---------|
| Build the SDK | `npm run build` (`tsc`) |
| Type-check only | `npm run typecheck` (`tsc --noEmit`) |
| Watch build | `npm run dev` |
| Run docs locally | `npm run docs:dev` |
| Build docs (static export → `docs/out`) | `npm run docs:build` |

There is a `test` script (`jest`) but **no tests exist yet and jest is not
installed** — don't claim tests pass; if asked to add tests, set up the runner first.

## Architecture

`createAuth(config)` in [src/index.ts](src/index.ts) wires the modules and is the
single public entry point. Modules:

- `src/core/otp.ts` — generate/hash/verify OTPs (SHA-256 + `timingSafeEqual`, 5-attempt limit)
- `src/core/jwt.ts` — access/refresh tokens (`JwtModule`)
- `src/core/session.ts` — multi-device sessions + `listAll()`
- `src/core/auth.ts` — high-level flows (`loginWithOtp`, `refreshTokens` with reuse detection)
- `src/core/ratelimit.ts` — sliding-window limits, per-identifier **and** per-IP
- `src/core/events.ts` — typed lifecycle events; handlers must never crash the flow
- `src/middleware/index.ts` — Express, Fastify, Next.js (Edge + App Router), cookie helpers
- `src/adapters/` — `MemoryStore` (dev), `RedisStore` (prod) implementing `StorageAdapter`
- `src/notifiers/` — `ConsoleNotifier`, `NodemailerNotifier` (default), `MultiChannelNotifier`, `BaseNotifier`
- `src/types.ts` — all shared types; this is the contract surface

## Rules

1. **`src/` is the source of truth.** When docs and code disagree, fix the docs
   to match the code (or flag a real code bug) — never document behavior that
   doesn't exist. Verify the actual API in `src/` before writing about it.
2. **Keep docs in sync with the API.** Any change to the public surface
   (`createAuth` config, exported functions/types, middleware) must be reflected
   in `docs/pages/**` and the `README.md` in the same change.
3. **Don't break the public API.** Adding is fine; renaming/removing exports from
   [src/index.ts](src/index.ts) is a breaking change — call it out explicitly.
4. **Build is CommonJS-only** (`tsc`, no bundler). `package.json` `exports` must
   point at emitted `.js`/`.d.ts` files — never invent `.mjs` paths.
5. **Only `dist/`, `README.md`, `LICENSE` are published** (see `files` +
   `.npmignore`). Never let `src/`, `docs/`, or `examples/` leak into the tarball;
   sanity-check with `npm pack --dry-run` when touching packaging.
6. **Never hand-edit the version in `package.json`.** Releases are automated by
   `.github/workflows/release.yml` (manual dispatch → bump → tag → publish).
7. **Security defaults are load-bearing** — hashed OTP storage, timing-safe
   compare, attempt limits, refresh-token rotation + reuse detection. Don't weaken
   them; preserve them in any refactor.
8. **Match existing style:** TypeScript `strict`, 2-space indent, double quotes,
   explicit return types on public methods, the section-divider comment banners
   already used in `src/`. No new runtime dependencies without strong reason —
   `express`/`fastify`/`next`/`ioredis` stay **optional peer deps** referenced
   only via structural types, never imported at module top level.
9. **Always verify before claiming done:** run `npm run typecheck && npm run build`
   for SDK changes, and `npm run docs:build` for docs changes. Report real output.
10. **Don't commit** unless asked. `dist/`, `docs/out`, `node_modules`, `.next`
    are gitignored — keep them out of commits.
11. **Commit messages follow Conventional Commits** — see
    [.github/commit-instructions.md](.github/commit-instructions.md).
    `<type>(<scope>): <description>` in the imperative mood (`feat`, `fix`,
    `chore`, `docs`, `style`, `refactor`, `perf`, `test`, `ci`, `build`,
    `revert`). Breaking changes get a `!` and a `BREAKING CHANGE:` footer.
