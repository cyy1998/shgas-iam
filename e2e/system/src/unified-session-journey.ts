import type { APIRequestContext, Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { ApiErrorCode, ClientSsoCallbackType, ClientSsoConfigSchema, ClientSsoProtocol, SubjectClaim } from "@iam/contracts";
import { normalizeClientSsoConfig } from "@iam/domain/client";
import { expect } from "@playwright/test";
import { createPkceS256Pair, receiveOidcAuthorizationCallback } from "./oidc-rp.ts";

/** One browser root, actual Admin mutations and both production protocol routes. */
export async function exerciseUnifiedSession(input: {
  adminPage: Page;
  page: Page;
  origin: string;
  clientId: string;
  redirectUri: string;
  originalCode: string;
  originalAccessToken: string;
}) {
  const { origin, clientId, redirectUri } = input;
  const browser = input.page.context().request;
  const admin = input.adminPage.context().request;
  const adminHeaders = { Client: "iam-admin" };
  const endpoint = `${origin}/api/iam/admin/clients-sso/${encodeURIComponent(clientId)}`;
  const detailResponse = await admin.get(endpoint, { headers: adminHeaders });
  expect(detailResponse.status()).toBe(200);
  const detail = await detailResponse.json();
  expect(detail.code).toBe(200);
  expect(detail.data.ssoConfig.protocol).toBe(ClientSsoProtocol.Oidc);
  const originalConfig = ClientSsoConfigSchema.parse(detail.data.ssoConfig);
  if (originalConfig.protocol !== ClientSsoProtocol.Oidc)
    throw new Error("Expected the seeded OIDC Client");
  // A seeded row can predate the first Admin normalization; submit its canonical full value.
  const oidcConfig = normalizeClientSsoConfig(originalConfig);
  const customConfig = normalizeClientSsoConfig({
    protocol: ClientSsoProtocol.CustomSso,
    callbackType: ClientSsoCallbackType.Business,
    callbackEndpoint: redirectUri,
    validRedirectUrls: [redirectUri],
    subjectClaims: [SubjectClaim.ProfileName, SubjectClaim.SubjectIdentifier],
  });
  async function mutate(action: string, data?: unknown) {
    const response = await admin.post(`${endpoint}/${action}`, { headers: adminHeaders, ...(data === undefined ? {} : { data }) });
    expect(response.status(), `Admin ${action}`).toBe(200);
    const result = await response.json();
    expect(result.code).toBe(200);
    if (action !== "secret/read") {
      expect(result.data.changed).toEqual(expect.any(Boolean));
      expect(result.data.result.clientCode).toBe(clientId);
    }
    if (action === "secret/rotate")
      expect(result.data.changed).toBe(true);
    return result;
  }
  async function select(config: unknown) {
    const result = await mutate("protocol", { config });
    expect(result.data.result.ssoConfig).toEqual(config);
  }
  async function enabled(value: boolean) {
    const result = await mutate("enabled", { enabled: value });
    expect(result.data.result.ssoEnabled).toBe(value);
  }
  const identity = (code: string) => {
    const parts = code.split(".");
    expect(parts).toHaveLength(3);
    expect(parts.every(Boolean)).toBe(true);
    return parts.slice(1);
  };
  const originalIdentity = identity(input.originalCode);
  async function authorizeCustom() {
    const response = await browser.get(`${origin}/sso/authorize?${new URLSearchParams({ client: clientId, redirectUrl: redirectUri, state: "joint196" })}`, { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    const location = new URL(response.headers().location!);
    expect(location.origin + location.pathname).toBe(new URL(redirectUri).origin + new URL(redirectUri).pathname);
    expect(location.searchParams.get("state")).toBe("joint196");
    const code = location.searchParams.get("code");
    expect(code).toEqual(expect.any(String));
    return String(code);
  }
  const exchangeCustom = (code: string, secret: string) => browser.post(`${origin}/sso/token`, {
    headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}` },
    form: { code, redirect_uri: redirectUri },
  });
  const useCustom = (request: APIRequestContext, sid: string) => request.get(`${origin}/api/iam/public/user-info`, {
    headers: { Authorization: sid, Client: clientId },
  });
  // Cookie-free reads exercise the protocol Token, not the browser root fallback.
  const tokenReader = await input.page.context().browser()!.newContext();
  try {
    const useOidc = (token: string) => tokenReader.request.get(`${origin}/oidc/me`, { headers: { Authorization: `Bearer ${token}` } });
    await select(customConfig);
    await mutate("secret/rotate");
    const secretRead = await mutate("secret/read");
    expect(secretRead.data.secret).toEqual(expect.any(String));
    const secret = String(secretRead.data.secret);
    const customCode = await authorizeCustom();
    expect(identity(customCode)).toEqual(originalIdentity);
    const customResponse = await exchangeCustom(customCode, secret);
    expect(customResponse.status()).toBe(200);
    const customToken = (await customResponse.json()).data.sid;
    expect(customToken).toEqual(expect.any(String));
    expect((await useCustom(tokenReader.request, customToken)).status()).toBe(200);
    await select(oidcConfig);
    expect((await mutate("secret/read")).data.secret).toBe(secret);
    expect((await useOidc(input.originalAccessToken)).status()).toBe(200);
    const otherProtocol = await useCustom(tokenReader.request, customToken);
    expect(otherProtocol.status()).toBe(400);
    expect(await otherProtocol.json()).toMatchObject({ code: ApiErrorCode.InvalidSsoClient, data: null });
    const pkce = createPkceS256Pair();
    async function authorizeOidc() {
      const state = "joint196-oidc";
      const response = await browser.get(`${origin}/oidc/auth?${new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid profile", state, code_challenge: pkce.challenge, code_challenge_method: "S256" })}`, { maxRedirects: 0 });
      expect(response.status()).toBe(303);
      return receiveOidcAuthorizationCallback(response.headers().location!, { redirectUri, state }).code;
    }
    const oidcCode = await authorizeOidc();
    expect(identity(oidcCode)).toEqual(originalIdentity);
    await select(customConfig);
    expect((await useCustom(tokenReader.request, customToken)).status()).toBe(200);
    const secretGateCode = await authorizeCustom();
    await enabled(false);
    expect((await exchangeCustom(secretGateCode, "incorrect-secret")).status()).toBe(400);
    await enabled(true);
    const retained = await exchangeCustom(secretGateCode, secret);
    expect(retained.status()).toBe(200);
    expect(identity(secretGateCode)).toEqual(originalIdentity);
    expect((await useCustom(tokenReader.request, customToken)).status()).toBe(200);
    const failedCode = await authorizeCustom();
    await enabled(false);
    const gated = await exchangeCustom(failedCode, secret);
    expect(gated.status()).toBe(400);
    expect(await gated.json()).toMatchObject({ code: ApiErrorCode.InvalidSsoClient, data: null });
    expect(gated.headers()["x-iam-code-consumption"]).toBe("not_attempted");
    expect(gated.headers()["x-iam-client-session-revocation"]).toBe("terminated");
    await enabled(true);
    expect((await useCustom(tokenReader.request, customToken)).status()).toBe(401);
    await select(oidcConfig);
    expect((await useOidc(input.originalAccessToken)).status()).toBe(401);
    const newCode = await authorizeOidc();
    expect(identity(newCode)[0]).toBe(originalIdentity[0]);
    expect(identity(newCode)[1]).not.toBe(originalIdentity[1]);
    // A late request names the old instance, never the new relationship slot.
    const late = await exchangeCustom(failedCode, secret);
    expect(late.status()).toBe(400);
    expect(await late.json()).toMatchObject({ code: ApiErrorCode.InvalidSsoClient, data: null });
    expect(late.headers()["x-iam-client-session-revocation"]).toBe("already_terminated");
    const fresh = await browser.post(`${origin}/oidc/token`, { form: { client_id: clientId, code: newCode, code_verifier: pkce.verifier, grant_type: "authorization_code", redirect_uri: redirectUri } });
    expect(fresh.status()).toBe(200);
    const tokens = await fresh.json() as Record<string, unknown>;
    expect(tokens.access_token).toEqual(expect.any(String));
    expect((await useOidc(String(tokens.access_token))).status()).toBe(200);
    // The separate management root and its Client remain usable throughout.
    expect((await admin.get(endpoint, { headers: adminHeaders })).status()).toBe(200);
    return tokens;
  }
  finally {
    await tokenReader.close();
  }
}
