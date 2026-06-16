// ─────────────────────────────────────────────────────────────
//  guardo  ·  oauth/github.ts
//  GitHub OAuth provider. Falls back to the /user/emails endpoint
//  to recover a verified primary email when it isn't public.
// ─────────────────────────────────────────────────────────────

import type { OAuthTokenResponse, OAuthUserProfile } from "../types";
import { OAuth2Provider, safeText } from "./base";
import { OAuthError } from "../core/oauth";

export interface GithubProviderOptions {
  clientId: string;
  clientSecret: string;
  /** Defaults to ["read:user", "user:email"] */
  scopes?: string[];
}

interface GithubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

export class GithubProvider extends OAuth2Provider {
  constructor(opts: GithubProviderOptions) {
    super({
      id: "github",
      clientId: opts.clientId,
      clientSecret: opts.clientSecret,
      authorizationEndpoint: "https://github.com/login/oauth/authorize",
      tokenEndpoint: "https://github.com/login/oauth/access_token",
      defaultScopes: opts.scopes ?? ["read:user", "user:email"],
      usePKCE: false,
      fetchProfileOverride: (tokens) => fetchGithubProfile(tokens),
    });
  }
}

async function fetchGithubProfile(
  tokens: OAuthTokenResponse
): Promise<OAuthUserProfile> {
  const headers = {
    authorization: `Bearer ${tokens.access_token}`,
    accept: "application/vnd.github+json",
    "user-agent": "guardo",
  };

  const userRes = await fetch("https://api.github.com/user", { headers });
  if (!userRes.ok) {
    throw new OAuthError(
      `[guardo] github: failed to fetch profile (HTTP ${userRes.status}). ${await safeText(userRes)}`,
      "OAUTH_PROFILE_FAILED"
    );
  }
  const raw = (await userRes.json()) as Record<string, unknown>;

  let email = typeof raw.email === "string" ? raw.email : undefined;
  let emailVerified = email !== undefined; // a public profile email is verified

  // The profile email is often null - resolve a verified primary instead.
  if (!email) {
    const emailRes = await fetch("https://api.github.com/user/emails", {
      headers,
    });
    if (emailRes.ok) {
      const emails = (await emailRes.json()) as GithubEmail[];
      const chosen =
        emails.find((e) => e.primary && e.verified) ??
        emails.find((e) => e.verified) ??
        emails[0];
      if (chosen) {
        email = chosen.email;
        emailVerified = chosen.verified;
      }
    }
  }

  return {
    id: String(raw.id),
    email,
    emailVerified,
    name:
      (typeof raw.name === "string" && raw.name) ||
      (typeof raw.login === "string" ? raw.login : undefined),
    avatarUrl: typeof raw.avatar_url === "string" ? raw.avatar_url : undefined,
    raw,
  };
}
