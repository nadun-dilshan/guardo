// ─────────────────────────────────────────────────────────────
//  guardo  ·  oauth/base.ts
//  Generic OAuth 2.0 provider. Extend or instantiate this for any
//  standard authorization-code service - "plug and use" others.
// ─────────────────────────────────────────────────────────────

import type {
  OAuthProvider,
  OAuthAuthorizationParams,
  OAuthExchangeParams,
  OAuthTokenResponse,
  OAuthUserProfile,
} from "../types";
import { OAuthError } from "../core/oauth";

export interface OAuth2ProviderOptions {
  /** Stable provider id, e.g. "google", "gitlab", "discord" */
  id: string;
  clientId: string;
  clientSecret: string;
  /** Authorization endpoint the user is redirected to */
  authorizationEndpoint: string;
  /** Token endpoint that exchanges the code for tokens */
  tokenEndpoint: string;
  /** Endpoint that returns the user's profile (Bearer auth) */
  userInfoEndpoint?: string;
  /** Scopes requested when the caller doesn't override them */
  defaultScopes?: string[];
  /** How scopes are joined in the URL (default: " ") */
  scopeSeparator?: string;
  /** Participate in PKCE (S256). Default: false */
  usePKCE?: boolean;
  /** Static extra params appended to every authorization request */
  authorizationParams?: Record<string, string>;
  /** Map a raw profile payload into a normalized `OAuthUserProfile` */
  mapProfile?: (raw: Record<string, unknown>) => OAuthUserProfile;
  /**
   * Fully custom profile fetch (e.g. when several API calls are needed).
   * Takes precedence over `userInfoEndpoint` + `mapProfile`.
   */
  fetchProfileOverride?: (
    tokens: OAuthTokenResponse
  ) => Promise<OAuthUserProfile>;
}

export class OAuth2Provider implements OAuthProvider {
  readonly id: string;
  readonly usePKCE: boolean;

  protected readonly clientId: string;
  protected readonly clientSecret: string;
  protected readonly authorizationEndpoint: string;
  protected readonly tokenEndpoint: string;
  protected readonly userInfoEndpoint?: string;
  protected readonly defaultScopes: string[];
  protected readonly scopeSeparator: string;
  protected readonly authorizationParams: Record<string, string>;
  protected readonly mapProfile?: (
    raw: Record<string, unknown>
  ) => OAuthUserProfile;
  protected readonly fetchProfileOverride?: (
    tokens: OAuthTokenResponse
  ) => Promise<OAuthUserProfile>;

  constructor(opts: OAuth2ProviderOptions) {
    this.id = opts.id;
    this.usePKCE = opts.usePKCE ?? false;
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
    this.authorizationEndpoint = opts.authorizationEndpoint;
    this.tokenEndpoint = opts.tokenEndpoint;
    this.userInfoEndpoint = opts.userInfoEndpoint;
    this.defaultScopes = opts.defaultScopes ?? [];
    this.scopeSeparator = opts.scopeSeparator ?? " ";
    this.authorizationParams = opts.authorizationParams ?? {};
    this.mapProfile = opts.mapProfile;
    this.fetchProfileOverride = opts.fetchProfileOverride;
  }

  buildAuthorizationUrl(params: OAuthAuthorizationParams): string {
    const url = new URL(this.authorizationEndpoint);
    const scopes = params.scopes ?? this.defaultScopes;

    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", params.state);
    if (scopes.length) {
      url.searchParams.set("scope", scopes.join(this.scopeSeparator));
    }
    if (this.usePKCE && params.codeChallenge) {
      url.searchParams.set("code_challenge", params.codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
    }
    for (const [key, value] of Object.entries({
      ...this.authorizationParams,
      ...params.extraParams,
    })) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  async exchangeCode(
    params: OAuthExchangeParams
  ): Promise<OAuthTokenResponse> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    if (params.codeVerifier) {
      body.set("code_verifier", params.codeVerifier);
    }

    const res = await fetch(this.tokenEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new OAuthError(
        `[guardo] ${this.id}: token exchange failed (HTTP ${res.status}). ${await safeText(res)}`,
        "OAUTH_EXCHANGE_FAILED"
      );
    }

    const data = (await res.json()) as OAuthTokenResponse;
    if (!data?.access_token) {
      throw new OAuthError(
        `[guardo] ${this.id}: token endpoint did not return an access_token.`,
        "OAUTH_EXCHANGE_FAILED"
      );
    }
    return data;
  }

  async fetchProfile(tokens: OAuthTokenResponse): Promise<OAuthUserProfile> {
    if (this.fetchProfileOverride) {
      return this.fetchProfileOverride(tokens);
    }
    if (!this.userInfoEndpoint || !this.mapProfile) {
      throw new OAuthError(
        `[guardo] ${this.id}: configure either userInfoEndpoint + mapProfile, or fetchProfileOverride.`,
        "OAUTH_PROFILE_FAILED"
      );
    }

    const res = await fetch(this.userInfoEndpoint, {
      headers: {
        authorization: `Bearer ${tokens.access_token}`,
        accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new OAuthError(
        `[guardo] ${this.id}: failed to fetch profile (HTTP ${res.status}). ${await safeText(res)}`,
        "OAUTH_PROFILE_FAILED"
      );
    }

    const raw = (await res.json()) as Record<string, unknown>;
    return this.mapProfile(raw);
  }
}

/**
 * Functional sugar for `new OAuth2Provider(opts)` - matches the
 * `createNotifier` style used elsewhere in guardo.
 */
export function createOAuthProvider(
  opts: OAuth2ProviderOptions
): OAuth2Provider {
  return new OAuth2Provider(opts);
}

// ── Helpers ───────────────────────────────────────────────────

export async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "";
  }
}
