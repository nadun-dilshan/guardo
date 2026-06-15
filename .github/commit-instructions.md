# Commit Message Instructions (Conventional Commits)

Generate every commit message in the [Conventional Commits](https://www.conventionalcommits.org)
format. This file is the source of truth for AI-assisted commit messages
(GitHub Copilot, Claude, and others) and for human contributors.

## Format

```
<type>(<optional scope>): <description>

[optional body]

[optional footer]
```

## Rules

1. **Type** is required and must be one of the table below.
2. **Scope** is optional, lowercase, in parentheses, naming the affected area
   (e.g. `auth`, `otp`, `jwt`, `session`, `middleware`, `notifiers`, `adapters`,
   `docs`, `ci`, `release`). Example: `feat(auth): add Google OAuth login`.
3. **Description** is required, in the **imperative mood** ("add", not "added"
   or "adds"), lowercase first letter, no trailing period, ≤ 72 characters.
4. **Body** (optional) explains *what* changed and *why*, not how. Wrap at ~72
   columns. Separate it from the subject with one blank line.
5. **Footer** (optional) holds metadata: issue links (`Fixes #123`,
   `Refs #456`) and breaking changes.
6. **Breaking changes**: add a `!` after the type/scope **and** a
   `BREAKING CHANGE:` footer explaining the migration. Example:
   `feat(auth)!: migrate JWT to OAuth`.
7. Keep each commit focused on a single logical change.

## Types

| Type | Description |
|------|-------------|
| `feat` | Introduces a new feature |
| `fix` | Fixes a bug |
| `chore` | Maintenance tasks (build process, dependencies, etc.) |
| `docs` | Documentation only |
| `style` | Formatting / whitespace; no code-behavior change |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adds or updates tests |
| `ci` | CI/CD configuration changes |
| `build` | Build system or external dependency changes |
| `revert` | Reverts a previous commit |

## Examples

```
feat: add user profile page
```

```
fix(otp): resolve timing-safe compare crash on wrong-length codes
```

```
refactor(adapters): improve Redis key scan efficiency

Replaced KEYS with SCAN to avoid blocking the event loop on large
datasets, cutting p99 list latency from ~800ms to ~200ms.
```

```
feat(notifiers): integrate Twilio SMS channel

Adds a TwilioNotifier and wires it into MultiChannelNotifier.

Fixes #42
```

```
feat(auth)!: migrate JWT to OAuth

Replaced JWT authentication with OAuth for enhanced security.

BREAKING CHANGE: users must reauthenticate after upgrading.
```
