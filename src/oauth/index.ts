// ─────────────────────────────────────────────────────────────
//  guardo  ·  oauth/index.ts
//  Built-in OAuth providers + the generic base for any other.
// ─────────────────────────────────────────────────────────────

export { OAuth2Provider, createOAuthProvider } from "./base";
export type { OAuth2ProviderOptions } from "./base";
export { GoogleProvider } from "./google";
export type { GoogleProviderOptions } from "./google";
export { GithubProvider } from "./github";
export type { GithubProviderOptions } from "./github";
