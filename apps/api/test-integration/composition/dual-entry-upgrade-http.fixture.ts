import type { createOidcConformanceCandidate } from "./oidc-conformance.fixture";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

type Candidate = Awaited<ReturnType<typeof createOidcConformanceCandidate>>;
export const upgradeRedirectUri = "https://rp.example/callback";
const verifier = "v".repeat(43);

/** HTTP-only browser jar; each replay uses a fresh copy of the original cookies. */
export function upgradeBrowser(origin: string, initial = new Map<string, string>()) {
  const cookies = new Map(initial);
  return {
    origin,
    cookies,
    async request(path: string, init: RequestInit = {}) {
      const headers = new Headers(init.headers);
      headers.set("Cookie", Array.from(cookies, ([name, value]) => `${name}=${value}`).join("; "));
      const response = await fetch(new URL(path, origin), {
        ...init,
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
      });
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(";", 1)[0]!;
        const separator = pair.indexOf("=");
        cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
      return response;
    },
  };
}
type Browser = ReturnType<typeof upgradeBrowser>;

function authorizePath(candidate: Candidate, custom: boolean) {
  return custom
    ? `/sso/authorize?${new URLSearchParams({ client: candidate.secondClientId, redirectUrl: upgradeRedirectUri })}`
    : `/oidc/auth?${new URLSearchParams({
      client_id: candidate.clientId,
      redirect_uri: upgradeRedirectUri,
      response_type: "code",
      scope: "openid profile",
      state: "upgrade",
      nonce: "upgrade",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    })}`;
}

export async function upgradeLogin(candidate: Candidate, browser: Browser) {
  const response = await browser.request("/auth/login/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential: candidate.credential() }),
  });
  assert.equal(response.status, 200, "Password login must succeed");
  assert.ok(browser.cookies.get("global_session"), "Login must issue a root Cookie");
}

export async function upgradeCode(candidate: Candidate, browser: Browser, custom: boolean) {
  const response = await browser.request(authorizePath(candidate, custom));
  assert.equal(response.status, custom ? 302 : 303, "Authenticated authorization must succeed");
  const callback = new URL(response.headers.get("location")!);
  assert.equal(`${callback.origin}${callback.pathname}`, upgradeRedirectUri);
  const code = callback.searchParams.get("code");
  assert.ok(code, "Authorization must return a Code");
  return code;
}

export async function upgradeExchange(candidate: Candidate, browser: Browser, custom: boolean, code: string) {
  return await browser.request(custom ? "/sso/token" : "/oidc/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${Buffer.from(`${custom ? candidate.secondClientId : candidate.clientId}:${candidate.secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ code, redirect_uri: upgradeRedirectUri, ...(custom ? {} : { grant_type: "authorization_code", code_verifier: verifier }) }),
  });
}

export async function upgradeUseToken(candidate: Candidate, browser: Browser, custom: boolean, token: string) {
  return await browser.request(custom ? "/public/user-info" : "/oidc/me", {
    headers: custom
      ? { Authorization: token, Client: candidate.secondClientId }
      : { Authorization: `Bearer ${token}` },
  });
}

export async function upgradeMint(candidate: Candidate, browser: Browser, custom: boolean) {
  const code = await upgradeCode(candidate, browser, custom);
  const response = await upgradeExchange(candidate, browser, custom, code);
  assert.equal(response.status, 200, "Code exchange must succeed before cleanup");
  const body = await response.json();
  const token = custom ? body.data.sid : body.access_token;
  assert.equal(typeof token, "string");
  if (!custom) {
    assert.equal(typeof body.id_token, "string");
    const claims = JSON.parse(Buffer.from(body.id_token.split(".")[1], "base64url").toString("utf8"));
    assert.equal(claims.iss, `${browser.origin}/oidc`, "ID Token issuer must match the entry that issued it");
  }
  const use = await upgradeUseToken(candidate, browser, custom, token);
  assert.equal(use.status, 200, "Issued online Token must work before cleanup");
  return { token: String(token), idToken: String(body.id_token ?? "") };
}

export async function upgradeContinuation(candidate: Candidate, origin: string, custom: boolean) {
  const browser = upgradeBrowser(origin);
  const response = await browser.request(authorizePath(candidate, custom));
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("location")!, origin);
  assert.equal(location.pathname, "/login");
  const handle = location.searchParams.get(custom ? "ssoReturn" : "oidcReturn");
  assert.ok(handle, "Unauthenticated authorization must create a continuation");
  const query = custom
    ? new URLSearchParams({ client: candidate.secondClientId, redirectUrl: upgradeRedirectUri, ssoReturn: handle })
    : new URLSearchParams({ oidcReturn: handle });
  const guardPath = `${custom ? "/sso" : "/oidc"}/login-guard?${query}`;
  const guard = await browser.request(guardPath);
  assert.equal(guard.status, 200, "Old continuation must be accepted before cleanup");
  return {
    cookies: new Map(browser.cookies),
    guardPath,
    resumePath: custom ? `/sso/authorize?${query}` : `/oidc/resume?${query}`,
  };
}

export async function upgradeLogout(browser: Browser, idToken: string) {
  const response = await browser.request(`/oidc/session/end?${new URLSearchParams({
    id_token_hint: idToken,
    post_logout_redirect_uri: upgradeRedirectUri,
    state: "upgrade-logout",
  })}`);
  assert.equal(response.status, 200, "Old logout confirmation must be established");
  const html = await response.text();
  const xsrf = /name="xsrf" value="([^"]+)"/u.exec(html)?.[1];
  assert.ok(xsrf, "Logout must issue an XSRF confirmation");
  return { cookies: new Map(browser.cookies), xsrf };
}

export async function replayUpgradeLogout(browser: Browser, xsrf: string) {
  return await browser.request("/oidc/session/end/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ xsrf, logout: "yes" }),
  });
}
