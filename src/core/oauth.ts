// ─────────────────────────────────────────────────────────────
//  guardo  ·  core/oauth.ts
//  OAuth 2.0 / social-login orchestration (authorization-code flow
//  with CSRF state + optional PKCE). Providers are pluggable.
// ─────────────────────────────────────────────────────────────

import crypto from "node:crypto";
import type {
  StorageAdapter,
  SessionMeta,
  User,
  GuardoErrorCode,
  OAuthConfig,
  OAuthProvider,
  OAuthStartOptions,
  OAuthStartResult,
  OAuthCallbackParams,
  OAuthLoginResult,
  OAuthUserProfile,
} from "../types";
import type { SessionModule } from "./session";
import type { JwtModule } from "./jwt";
import type { GuardoEventEmitter } from "./events";

const STATE_KEY = (state: string) => `oauth_state:${state}`;
const DEFAULT_STATE_TTL = 600; // 10 minutes

interface StoredState {
  provider: string;
  redirectUri: string;
  codeVerifier?: string;
}

interface OAuthModuleOptions {
  config: OAuthConfig;
  store: StorageAdapter;
  session: SessionModule;
  jwt: JwtModule;
  events?: GuardoEventEmitter;
}

export class OAuthModule {
  private readonly providers: Map<string, OAuthProvider>;
  private readonly store: StorageAdapter;
  private readonly session: SessionModule;
  private readonly jwt: JwtModule;
  private readonly events?: GuardoEventEmitter;
  private readonly redirectUri?: string;
  private readonly stateTtl: number;
  private readonly resolveUser?: OAuthConfig["resolveUser"];
  private readonly onNewUser?: OAuthConfig["onNewUser"];

  constructor(opts: OAuthModuleOptions) {
    this.providers = new Map(
      opts.config.providers.map((p) => [p.id, p])
    );
    this.store = opts.store;
    this.session = opts.session;
    this.jwt = opts.jwt;
    this.events = opts.events;
    this.redirectUri = opts.config.redirectUri;
    this.stateTtl = opts.config.stateTtlSeconds ?? DEFAULT_STATE_TTL;
    this.resolveUser = opts.config.resolveUser;
    this.onNewUser = opts.config.onNewUser;
  }

  /** List the ids of every registered provider. */
  providerIds(): string[] {
    return [...this.providers.keys()];
  }

  /** Look up a provider by id, or throw if it isn't registered. */
  getProvider(providerId: string): OAuthProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new OAuthError(
        `[guardo] Unknown OAuth provider: "${providerId}". Registered: ${
          this.providerIds().join(", ") || "(none)"
        }.`,
        "OAUTH_PROVIDER_NOT_FOUND"
      );
    }
    return provider;
  }

  // ── Step 1: build the authorization redirect ─────────────────

  /**
   * Begin an OAuth login. Returns the URL to redirect the user to and the
   * generated `state`. A short-lived state record (plus the PKCE verifier for
   * providers that use PKCE) is persisted in the store and consumed once on
   * `callback()`.
   */
  async start(
    providerId: string,
    opts: OAuthStartOptions = {}
  ): Promise<OAuthStartResult> {
    const provider = this.getProvider(providerId);

    const redirectUri = opts.redirectUri ?? this.redirectUri;
    if (!redirectUri) {
      throw new OAuthError(
        "[guardo] No OAuth redirectUri configured. Set oauth.redirectUri in createAuth() or pass it to start().",
        "OAUTH_NOT_CONFIGURED"
      );
    }

    const state = base64url(crypto.randomBytes(24));

    let codeVerifier: string | undefined;
    let codeChallenge: string | undefined;
    if (provider.usePKCE) {
      codeVerifier = base64url(crypto.randomBytes(32));
      codeChallenge = base64url(
        crypto.createHash("sha256").update(codeVerifier).digest()
      );
    }

    const stored: StoredState = {
      provider: providerId,
      redirectUri,
      ...(codeVerifier && { codeVerifier }),
    };
    await this.store.set(
      STATE_KEY(state),
      JSON.stringify(stored),
      this.stateTtl
    );

    const url = provider.buildAuthorizationUrl({
      redirectUri,
      state,
      scopes: opts.scopes,
      codeChallenge,
      extraParams: opts.extraParams,
    });

    this.events?.emit("oauth.started", { provider: providerId, state });

    return { url, state };
  }

  // ── Step 2: handle the provider's callback ───────────────────

  /**
   * Complete an OAuth login. Validates `state` (CSRF), exchanges the code for
   * tokens, fetches the profile, resolves/provisions the user, opens a session
   * and issues a JWT pair - the same shape `loginWithOtp` returns.
   */
  async callback(
    providerId: string,
    params: OAuthCallbackParams,
    meta?: SessionMeta
  ): Promise<OAuthLoginResult> {
    const provider = this.getProvider(providerId);
    const { code, state } = params;

    if (!code || !state) {
      this.fail(providerId, "Missing code or state in callback");
      throw new OAuthError(
        "[guardo] OAuth callback is missing `code` or `state`.",
        "OAUTH_STATE_INVALID"
      );
    }

    const raw = await this.store.get(STATE_KEY(state));
    if (!raw) {
      this.fail(providerId, "Invalid or expired state");
      throw new OAuthError(
        "[guardo] Invalid or expired OAuth state. Restart the login flow.",
        "OAUTH_STATE_INVALID"
      );
    }
    // State is single-use - consume it before doing any network work.
    await this.store.delete(STATE_KEY(state));

    let stored: StoredState;
    try {
      stored = JSON.parse(raw) as StoredState;
    } catch {
      this.fail(providerId, "Corrupted state record");
      throw new OAuthError(
        "[guardo] Corrupted OAuth state record.",
        "OAUTH_STATE_INVALID"
      );
    }

    if (stored.provider !== providerId) {
      this.fail(providerId, "State/provider mismatch");
      throw new OAuthError(
        "[guardo] OAuth state does not match the requested provider.",
        "OAUTH_STATE_INVALID"
      );
    }

    let profile: OAuthUserProfile;
    try {
      const tokens = await provider.exchangeCode({
        code,
        redirectUri: stored.redirectUri,
        ...(stored.codeVerifier && { codeVerifier: stored.codeVerifier }),
      });
      profile = await provider.fetchProfile(tokens);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "OAuth exchange failed";
      this.fail(providerId, reason);
      throw err instanceof OAuthError
        ? err
        : new OAuthError(reason, "OAUTH_EXCHANGE_FAILED");
    }

    // ── Resolve / provision the user ────────────────────────────
    let user: User;
    let isNewUser = false;
    if (this.resolveUser) {
      const resolved = await this.resolveUser(profile, providerId);
      if (resolved) {
        user = resolved;
      } else if (this.onNewUser) {
        user = await this.onNewUser(profile, providerId);
        isNewUser = true;
      } else {
        this.fail(providerId, "User not found");
        throw new OAuthError(
          `[guardo] No user found for ${providerId} profile ${profile.id} and no onNewUser provisioner was configured.`,
          "USER_NOT_FOUND"
        );
      }
    } else {
      user = synthUser(providerId, profile);
    }

    const session = await this.session.create(user.id, meta);
    const { accessToken, refreshToken } = this.jwt.issueTokenPair(
      user,
      session.sessionId
    );

    this.events?.emit("oauth.success", {
      provider: providerId,
      user,
      sessionId: session.sessionId,
      isNewUser,
    });

    return {
      user,
      accessToken,
      refreshToken,
      sessionId: session.sessionId,
      provider: providerId,
      isNewUser,
      profile,
    };
  }

  private fail(provider: string, reason: string): void {
    this.events?.emit("oauth.failed", { provider, reason });
  }
}

// ── Helpers ───────────────────────────────────────────────────

function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Build a User straight from the provider profile (zero-config mode). */
function synthUser(providerId: string, profile: OAuthUserProfile): User {
  return {
    id: `${providerId}:${profile.id}`,
    ...(profile.email && { email: profile.email }),
    ...(profile.name && { name: profile.name }),
    provider: providerId,
  };
}

// ── Custom Errors ─────────────────────────────────────────────

export class OAuthError extends Error {
  constructor(message: string, public readonly code?: GuardoErrorCode) {
    super(message);
    this.name = "OAuthError";
  }
}
