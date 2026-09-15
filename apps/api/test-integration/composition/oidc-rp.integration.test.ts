import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import * as rp from "openid-client";
import { createOidcConformanceCandidate } from "./oidc-conformance.fixture";

test("independent openid-client validates public and confidential Code/PKCE, signed claims, UserInfo and RP logout against production API", async () => {
  const directory = await mkdtemp(join(tmpdir(), "iam195-rp-"));
  process.stdout.write(`OIDC RP evidence: ${directory}\n`);
  const redirectUri = "https://rp.example/callback";
  const candidate = await createOidcConformanceCandidate({
    redirectUris: [redirectUri],
    postLogoutRedirectUris: [redirectUri],
    logPath: join(directory, "api.log"),
  });
  try {
    for (const clientId of [candidate.clientId, candidate.publicClientId]) {
      for (const logoutMode of ["normal", "none", "state-only", "hint-only"]) {
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
          new URL(`${candidate.origin}/oidc`),
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
        const loginUrl = new URL(loginRedirect.headers.get("location")!);
        expect(loginUrl.pathname).toBe("/login");
        const login = await browserRequest(`${candidate.origin}/auth/login/password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: candidate.credential() }),
        });
        const loginBody = await login.text();
        expect({ status: login.status, body: loginBody }).toMatchObject({ status: 200 });
        expect(cookies.get("global_session")).toBeTruthy();
        const resume = await browserRequest(
          `${candidate.origin}/oidc/resume?${new URLSearchParams({ oidcReturn: loginUrl.searchParams.get("oidcReturn")! })}`,
        );
        expect(resume.status).toBe(303);
        const callback = new URL(resume.headers.get("location")!);
        const tokens = await rp.authorizationCodeGrant(config, callback, {
          pkceCodeVerifier: verifier,
          expectedNonce: nonce,
          expectedState: state,
          idTokenExpected: true,
        });
        const claims = tokens.claims();
        expect(claims).toMatchObject({
          sub: candidate.subjectIdentifier,
          iss: `${candidate.origin}/oidc`,
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
        const logout = await browserRequest(`${candidate.origin}/oidc/session/end/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ xsrf: xsrf!, logout: "yes" }),
        });
        expect(logout.status).toBe(303);
        const postLogout = new URL(logout.headers.get("location")!);
        expect(`${postLogout.origin}${postLogout.pathname}`).toBe(
          logoutMode === "normal" ? redirectUri : `${candidate.origin}/oidc/session/end/success`,
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
    }
  }
  finally {
    await candidate.close();
  }
}, 45000);
