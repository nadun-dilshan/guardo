# Copilot / AI Instructions

Repository-wide guidance for AI coding assistants (GitHub Copilot and others).

## Commit messages

Always write commit messages in **Conventional Commits** format. The full ruleset
and examples live in [`.github/commit-instructions.md`](./commit-instructions.md):
`<type>(<scope>): <description>` in the imperative mood, with `feat`, `fix`,
`chore`, `docs`, `style`, `refactor`, `perf`, `test`, `ci`, `build`, or `revert`
as the type. Mark breaking changes with `!` and a `BREAKING CHANGE:` footer.

## Project conventions

This repo is the `guardo` authentication SDK (root) plus a nested Nextra docs
site (`docs/`). The complete coding rules - source of truth, keeping docs in sync,
CommonJS-only build, automated versioning, security defaults - are in
[`CLAUDE.md`](../CLAUDE.md). Follow them when generating code.

Before suggesting "done": SDK changes must pass `npm run typecheck && npm run build`;
docs changes must pass `npm run docs:build`.
