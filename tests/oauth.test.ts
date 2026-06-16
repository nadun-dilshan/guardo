// ─────────────────────────────────────────────────────────────
//  guardo  ·  tests/oauth.test.ts
//  OAuth flow: state/PKCE handling, callback, provisioning, errors.
//  Uses a fake in-process provider so no network access is needed.
// ─────────────────────────────────────────────────────────────

import { OAuthModule, OAuthError } from "../src/core/oauth";
import { OAuth2Provider } from "../src/oauth/base";
import { GoogleProvider } from "../src/oauth/google";
import { GithubProvider } from "../src/oauth/github";
import { JwtModule } from "../src/core/jwt";
import { SessionModule } from "../src/core/session";
import { MemoryStore } from "../src/adapters/memory";
import type {
  OAuthProvider,
  OAuthAuthorizationParams,
  OAuthExchangeParams,
  OAuthTokenResponse,
  OAuthUserProfile,
} from "../src/types";

const SECRET = "test-secret-at-least-16-chars-long";
const REDIRECT = "https://app.test/auth/callback";

/** A no-network provider that records what it was handed. */
class FakeProvider implements OAuthProvider {
  readonly id: string;
  readonly usePKCE: boolean;
  lastExchange?: OAuthExchangeParams;
  constructor(id: string, usePKCE: boolean, private readonly profile: OAuthUserProfile) {
    this.id = id;
    this.usePKCE = usePKCE;
  }
  buildAuthorizationUrl(params: OAuthAuthorizationParams): string {
    const url = new URL(`https://provider.test/${this.id}/authorize`);
    url.searchParams.set("state", params.state);
    url.searchParams.set("redirect_uri", params.redirectUri);
    if (params.codeChallenge) url.searchParams.set("code_challenge", params.codeChallenge);
    return url.toString();
  }
  async exchangeCode(params: OAuthExchangeParams): Promise<OAuthTokenResponse> {
    this.lastExchange = params;
    return { access_token: `tok_${params.code}` };
  }
  async fetchProfile(_tokens: OAuthTokenResponse): Promise<OAuthUserProfile> {
    return this.profile;
  }
}

const PROFILE: OAuthUserProfile = {
  id: "999",
  email: "octo@example.com",
  emailVerified: true,
  name: "Octo Cat",
  raw: { id: 999 },
};

function setup(
  provider: OAuthProvider,
  config: Partial<Parameters<typeof makeModule>[1]> = {}
) {
  return makeModule(provider, config);
}

function makeModule(
  provider: OAuthProvider,
  extra: {
    resolveUser?: (p: OAuthUserProfile, id: string) => Promise<any>;
    onNewUser?: (p: OAuthUserProfile, id: string) => Promise<any>;
    redirectUri?: string;
  } = {}
) {
  const store = new MemoryStore();
  const jwt = new JwtModule({ secret: SECRET });
  const session = new SessionModule(store, 3600);
  const oauth = new OAuthModule({
    config: {
      providers: [provider],
      redirectUri: extra.redirectUri ?? REDIRECT,
      resolveUser: extra.resolveUser,
      onNewUser: extra.onNewUser,
    },
    store,
    session,
    jwt,
  });
  return { store, jwt, session, oauth };
}

describe("OAuthModule.start", () => {
  it("generates a state, persists it, and embeds it in the URL", async () => {
    const provider = new FakeProvider("fake", false, PROFILE);
    const { store, oauth } = setup(provider);

    const { url, state } = await oauth.start("fake");

    expect(state).toEqual(expect.any(String));
    expect(new URL(url).searchParams.get("state")).toBe(state);
    expect(await store.get(`oauth_state:${state}`)).not.toBeNull();
  });

  it("adds a PKCE challenge for PKCE providers and a verifier in the stored state", async () => {
    const provider = new FakeProvider("pkce", true, PROFILE);
    const { store, oauth } = setup(provider);

    const { url, state } = await oauth.start("pkce");

    expect(new URL(url).searchParams.get("code_challenge")).toEqual(expect.any(String));
    const stored = JSON.parse((await store.get(`oauth_state:${state}`))!);
    expect(stored.codeVerifier).toEqual(expect.any(String));
  });

  it("throws when no redirectUri is configured or passed", async () => {
    const provider = new FakeProvider("fake", false, PROFILE);
    const { oauth } = setup(provider, { redirectUri: "" });
    await expect(oauth.start("fake")).rejects.toMatchObject({ code: "OAUTH_NOT_CONFIGURED" });
  });

  it("throws OAUTH_PROVIDER_NOT_FOUND for an unknown provider", async () => {
    const { oauth } = setup(new FakeProvider("fake", false, PROFILE));
    await expect(oauth.start("nope")).rejects.toMatchObject({ code: "OAUTH_PROVIDER_NOT_FOUND" });
  });
});

describe("OAuthModule.callback", () => {
  it("exchanges the code, opens a session, and issues a verifiable token pair", async () => {
    const provider = new FakeProvider("fake", false, PROFILE);
    const { jwt, session, oauth } = setup(provider);

    const { state } = await oauth.start("fake");
    const result = await oauth.callback("fake", { code: "abc", state });

    expect(result.provider).toBe("fake");
    expect(result.profile).toEqual(PROFILE);
    expect(result.user.id).toBe("fake:999"); // zero-config synth id
    expect(await session.isValid(result.sessionId)).toBe(true);

    const payload = jwt.verifyAccessToken(result.accessToken);
    expect(payload.sub).toBe("fake:999");
    expect(payload.sessionId).toBe(result.sessionId);
  });

  it("forwards the PKCE verifier to the token exchange", async () => {
    const provider = new FakeProvider("pkce", true, PROFILE);
    const { oauth } = setup(provider);

    const { state } = await oauth.start("pkce");
    await oauth.callback("pkce", { code: "abc", state });

    expect(provider.lastExchange?.codeVerifier).toEqual(expect.any(String));
  });

  it("consumes state on first use (replay is rejected)", async () => {
    const provider = new FakeProvider("fake", false, PROFILE);
    const { oauth } = setup(provider);

    const { state } = await oauth.start("fake");
    await oauth.callback("fake", { code: "abc", state });

    await expect(oauth.callback("fake", { code: "abc", state })).rejects.toMatchObject({
      code: "OAUTH_STATE_INVALID",
    });
  });

  it("rejects an unknown/forged state", async () => {
    const { oauth } = setup(new FakeProvider("fake", false, PROFILE));
    await expect(
      oauth.callback("fake", { code: "abc", state: "forged" })
    ).rejects.toBeInstanceOf(OAuthError);
  });

  it("rejects a state minted for a different provider", async () => {
    const store = new MemoryStore();
    const jwt = new JwtModule({ secret: SECRET });
    const session = new SessionModule(store, 3600);
    const oauth = new OAuthModule({
      config: {
        providers: [
          new FakeProvider("a", false, PROFILE),
          new FakeProvider("b", false, PROFILE),
        ],
        redirectUri: REDIRECT,
      },
      store,
      session,
      jwt,
    });

    const { state } = await oauth.start("a");
    await expect(oauth.callback("b", { code: "abc", state })).rejects.toMatchObject({
      code: "OAUTH_STATE_INVALID",
    });
  });

  it("resolves an existing user via resolveUser", async () => {
    const provider = new FakeProvider("fake", false, PROFILE);
    const { oauth } = setup(provider, {
      resolveUser: async (p) => ({ id: "db-1", email: p.email, role: "member" }),
    });

    const { state } = await oauth.start("fake");
    const result = await oauth.callback("fake", { code: "abc", state });

    expect(result.user.id).toBe("db-1");
    expect(result.isNewUser).toBe(false);
  });

  it("provisions via onNewUser when resolveUser returns null", async () => {
    const provider = new FakeProvider("fake", false, PROFILE);
    const created: string[] = [];
    const { oauth } = setup(provider, {
      resolveUser: async () => null,
      onNewUser: async (p) => {
        created.push(p.email!);
        return { id: "db-new", email: p.email };
      },
    });

    const { state } = await oauth.start("fake");
    const result = await oauth.callback("fake", { code: "abc", state });

    expect(result.isNewUser).toBe(true);
    expect(result.user.id).toBe("db-new");
    expect(created).toEqual(["octo@example.com"]);
  });

  it("throws USER_NOT_FOUND when resolveUser is null and no provisioner exists", async () => {
    const provider = new FakeProvider("fake", false, PROFILE);
    const { oauth } = setup(provider, { resolveUser: async () => null });

    const { state } = await oauth.start("fake");
    await expect(oauth.callback("fake", { code: "abc", state })).rejects.toMatchObject({
      code: "USER_NOT_FOUND",
    });
  });
});

describe("built-in providers", () => {
  it("GoogleProvider builds a PKCE authorization URL with OIDC scopes", () => {
    const google = new GoogleProvider({ clientId: "gid", clientSecret: "gsecret" });
    expect(google.usePKCE).toBe(true);

    const url = new URL(
      google.buildAuthorizationUrl({
        redirectUri: REDIRECT,
        state: "s1",
        codeChallenge: "chal",
      })
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("gid");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("code_challenge")).toBe("chal");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("GithubProvider is non-PKCE and targets GitHub endpoints", () => {
    const github = new GithubProvider({ clientId: "ghid", clientSecret: "ghsecret" });
    expect(github.usePKCE).toBe(false);

    const url = new URL(
      github.buildAuthorizationUrl({ redirectUri: REDIRECT, state: "s2" })
    );
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("scope")).toBe("read:user user:email");
    expect(url.searchParams.get("code_challenge")).toBeNull();
  });

  it("OAuth2Provider can plug in any other service", () => {
    const discord = new OAuth2Provider({
      id: "discord",
      clientId: "did",
      clientSecret: "dsecret",
      authorizationEndpoint: "https://discord.com/oauth2/authorize",
      tokenEndpoint: "https://discord.com/api/oauth2/token",
      userInfoEndpoint: "https://discord.com/api/users/@me",
      defaultScopes: ["identify", "email"],
      mapProfile: (raw) => ({ id: String(raw.id), email: raw.email as string, raw }),
    });

    const url = new URL(
      discord.buildAuthorizationUrl({ redirectUri: REDIRECT, state: "s3" })
    );
    expect(url.origin + url.pathname).toBe("https://discord.com/oauth2/authorize");
    expect(url.searchParams.get("scope")).toBe("identify email");
  });
});
