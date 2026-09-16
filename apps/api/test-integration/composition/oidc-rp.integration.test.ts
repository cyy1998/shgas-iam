import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import * as rp from "openid-client";
import { createOidcConformanceCandidate } from "./oidc-conformance.fixture";

const scenarios = (["same-origin", "dual"] as const).flatMap(issuerMode =>
  (issuerMode === "dual" ? ["internal", "external"] as const : ["external"] as const).flatMap(entry =>
    (["public", "confidential"] as const).flatMap(clientType =>
      (["normal", "none", "state-only", "hint-only"] as const).map(logoutMode => [
        `${issuerMode}/${entry}/${clientType}/logout-${logoutMode}`,
        issuerMode,
        entry,
        clientType,
        logoutMode,
      ] as const),
    ),
  ),
);

test.each(scenarios)("independent openid-client validates %s", async (name, issuerMode, entry, clientType, logoutMode) => {
  const directory = await mkdtemp(join(tmpdir(), "iam195-rp-"));
  process.stdout.write(`OIDC RP evidence (${name}): ${directory}\n`);
  const redirectUri = "https://rp.example/callback";
  const candidate = await createOidcConformanceCandidate({
    issuerMode,
    redirectUris: [redirectUri],
    postLogoutRedirectUris: [redirectUri],
    logPath: join(directory, "api.log"),
  });
  try {
    let sharedJwks: unknown;
    for (const origin of new Set(Object.values(candidate.origins))) {
      const discoveryResponse = await fetch(`${origin}/oidc/.well-known/openid-configuration`);
      expect(discoveryResponse.status).toBe(200);
      const metadata = await discoveryResponse.json();
      expect(metadata).toMatchObject({
        issuer: `${origin}/oidc`,
        authorization_response_iss_parameter_supported: true,
      });
      for (const endpoint of ["authorization_endpoint", "token_endpoint", "userinfo_endpoint", "jwks_uri", "end_session_endpoint"])
        expect(new URL(metadata[endpoint]).origin).toBe(origin);
      const jwksResponse = await fetch(metadata.jwks_uri);
      expect(jwksResponse.status).toBe(200);
      const jwks = await jwksResponse.json();
      expect(jwks.keys.length).toBeGreaterThan(0);
      if (sharedJwks)
        expect(jwks).toEqual(sharedJwks);
      sharedJwks = jwks;
    }
    const origin = candidate.origins[entry];
    const clientId = clientType === "public" ? candidate.publicClientId : candidate.clientId;
    const cookies = new Map<string, string>();
    async function browserRequest(url: string | URL, init: RequestInit = {}) {
      const headers = new Headers(init.headers);
      headers.set("Cookie", Array.from(cookies, ([name, value]) => `${name}=${value}`).join("; "));
      const response = await fetch(url, { ...init, headers, redirect: "manual" });
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(";", 1)[0]!;
        const separator = pair.indexOf("=");
        cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
      return response;
    }
    const config = await rp.discovery(
      new URL(`${origin}/oidc`),
      clientId,
      {
        token_endpoint_auth_method:
              clientId === candidate.publicClientId ? "none" : "client_secret_basic",
      },
      clientId === candidate.publicClientId ? rp.None() : rp.ClientSecretBasic(candidate.secret),
      { execute: [rp.allowInsecureRequests, rp.enableNonRepudiationChecks] },
    );
    const verifier = rp.randomPKCECodeVerifier();
    const nonce = rp.randomNonce();
    const state = rp.randomState();
    const authorize = rp.buildAuthorizationUrl(config, {
      redirect_uri: redirectUri,
      scope: "openid profile phone",
      state,
      nonce,
      code_challenge: await rp.calculatePKCECodeChallenge(verifier),
      code_challenge_method: "S256",
    });
    const loginRedirect = await browserRequest(authorize);
    expect(loginRedirect.status).toBe(302);
    expect(loginRedirect.headers.get("location")).toStartWith("/login?");
    const loginUrl = new URL(loginRedirect.headers.get("location")!, origin);
    expect(loginUrl.pathname).toBe("/login");
    const login = await browserRequest(`${origin}/auth/login/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: candidate.credential() }),
    });
    const loginBody = await login.text();
    expect({ status: login.status, body: loginBody }).toMatchObject({ status: 200 });
    expect(cookies.get("global_session")).toBeTruthy();
    const resume = await browserRequest(
      `${origin}/oidc/resume?${new URLSearchParams({ oidcReturn: loginUrl.searchParams.get("oidcReturn")! })}`,
    );
    expect(resume.status).toBe(303);
    const callback = new URL(resume.headers.get("location")!);
    expect(callback.searchParams.get("iss")).toBe(`${origin}/oidc`);
    const tokens = await rp.authorizationCodeGrant(config, callback, {
      pkceCodeVerifier: verifier,
      expectedNonce: nonce,
      expectedState: state,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    expect(claims).toMatchObject({
      sub: candidate.subjectIdentifier,
      iss: `${origin}/oidc`,
      aud: clientId,
      nonce,
      name: "Conformance User",
      preferred_username: candidate.username,
    });
    expect(claims?.auth_time).toBeNumber();
    expect(claims).not.toHaveProperty("iam:employments");
    expect(claims).not.toHaveProperty("iam:authorization");
    const userInfo = await rp.fetchUserInfo(config, tokens.access_token, candidate.subjectIdentifier);
    expect(userInfo).toMatchObject({
      sub: candidate.subjectIdentifier,
      name: "Conformance User",
      preferred_username: candidate.username,
      phone_number: "+8613800000195",
    });
    const logoutState = rp.randomState();
    const logoutParameters: Record<string, string> = {};
    if (logoutMode === "normal" || logoutMode === "hint-only")
      logoutParameters.id_token_hint = tokens.id_token!;
    if (logoutMode === "normal")
      logoutParameters.post_logout_redirect_uri = redirectUri;
    if (logoutMode === "normal" || logoutMode === "state-only")
      logoutParameters.state = logoutState;
    const logoutUrl = rp.buildEndSessionUrl(config, logoutParameters);
    const confirmation = await browserRequest(logoutUrl);
    expect(confirmation.status).toBe(200);
    const html = await confirmation.text();
    const xsrf = /name="xsrf" value="([^"]+)"/u.exec(html)?.[1];
    expect(xsrf).toBeTruthy();
    const logout = await browserRequest(`${origin}/oidc/session/end/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ xsrf: xsrf!, logout: "yes" }),
    });
    expect(logout.status).toBe(303);
    if (logoutMode !== "normal")
      expect(logout.headers.get("location")).toBe("/oidc/session/end/success");
    const postLogout = new URL(logout.headers.get("location")!, origin);
    expect(`${postLogout.origin}${postLogout.pathname}`).toBe(
      logoutMode === "normal" ? redirectUri : `${origin}/oidc/session/end/success`,
    );
    expect(postLogout.searchParams.get("state")).toBe(logoutMode === "normal" ? logoutState : null);
    let rejected: unknown;
    try {
      await rp.fetchUserInfo(config, tokens.access_token, candidate.subjectIdentifier);
    }
    catch (error) {
      rejected = error;
    }
    expect(rejected).toBeInstanceOf(rp.WWWAuthenticateChallengeError);
  }
  finally {
    await candidate.close();
  }
}, 45000);
