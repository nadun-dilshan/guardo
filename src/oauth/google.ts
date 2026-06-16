// ─────────────────────────────────────────────────────────────
//  guardo  ·  oauth/google.ts
//  Google Sign-In (OpenID Connect) provider.
// ─────────────────────────────────────────────────────────────

import { OAuth2Provider } from "./base";

export interface GoogleProviderOptions {
  clientId: string;
  clientSecret: string;
  /** Defaults to ["openid", "email", "profile"] */
  scopes?: string[];
}

export class GoogleProvider extends OAuth2Provider {
  constructor(opts: GoogleProviderOptions) {
    super({
      id: "google",
      clientId: opts.clientId,
      clientSecret: opts.clientSecret,
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      userInfoEndpoint: "https://openidconnect.googleapis.com/v1/userinfo",
      defaultScopes: opts.scopes ?? ["openid", "email", "profile"],
      usePKCE: true,
      authorizationParams: { access_type: "offline" },
      mapProfile: (raw) => ({
        id: String(raw.sub),
        email: typeof raw.email === "string" ? raw.email : undefined,
        emailVerified: raw.email_verified === true,
        name: typeof raw.name === "string" ? raw.name : undefined,
        avatarUrl: typeof raw.picture === "string" ? raw.picture : undefined,
        raw,
      }),
    });
  }
}
