import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { requireEnvironment } from "./src/environment.ts";
import {
  createPkceS256Pair,
  receiveOidcAuthorizationCallback,
} from "./src/oidc-rp.ts";

test("public RP completes OIDC Authorization Code + PKCE once and reads UserInfo", async ({
  page,
  request,
}) => {
  const origin = requireEnvironment("IAM_E2E_ORIGIN");
  const adminUsername = requireEnvironment("IAM_E2E_ADMIN_USERNAME");
  const adminPassword = requireEnvironment("IAM_E2E_ADMIN_PASSWORD");
  const clientId = requireEnvironment("IAM_E2E_OIDC_CLIENT_CODE");
  const redirectUri = requireEnvironment("IAM_E2E_OIDC_REDIRECT_URI");
  const pkce = createPkceS256Pair();
  const state = randomBytes(24).toString("base64url");
  const nonce = randomBytes(24).toString("base64url");
  const authorization = new URL("/oidc/auth", origin);
  authorization.search = new URLSearchParams({
    client_id: clientId,
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    nonce,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile",
    state,
  }).toString();

  await page.goto(authorization.href);
  await expect(page).toHaveURL(/\/portal\/login\?/u);

  const interactionCookie = (await page.context().cookies(`${origin}/oidc/resume`))
    .find(cookie => cookie.name === "oidc_interaction_binding");
  expect(interactionCookie).toMatchObject({
    httpOnly: true,
    path: "/oidc",
    sameSite: "Lax",
    secure: false,
  });

  await page.getByLabel("工号 / 账号").fill(adminUsername);
  await page.getByPlaceholder("请输入登录密码").fill(adminPassword);
  await page.getByRole("button", { name: "安全登录" }).click();
  await page.getByRole("button", { name: "跳过", exact: true }).click();

  await expect(page).toHaveURL((url) => {
    const expected = new URL(redirectUri);
    return url.origin === expected.origin && url.pathname === expected.pathname;
  });
  const { code } = receiveOidcAuthorizationCallback(page.url(), {
    redirectUri,
    state,
  });

  const tokenForm = {
    client_id: clientId,
    code,
    code_verifier: pkce.verifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  };
  const pkceMismatchResponse = await request.post(`${origin}/oidc/token`, {
    form: {
      ...tokenForm,
      code_verifier: "mismatched-pkce-verifier-that-is-long-enough-for-oauth",
    },
  });
  expect(pkceMismatchResponse.status()).toBe(400);
  expect(await pkceMismatchResponse.json()).toMatchObject({
    error: "invalid_grant",
  });

  const tokenResponse = await request.post(`${origin}/oidc/token`, {
    form: tokenForm,
  });
  expect(tokenResponse.status()).toBe(200);
  const tokens = await tokenResponse.json() as Record<string, unknown>;
  expect(tokens).toMatchObject({
    token_type: "Bearer",
    scope: "openid profile",
  });
  expect(tokens.access_token).toEqual(expect.any(String));
  expect(tokens.id_token).toEqual(expect.any(String));
  expect(tokens.expires_in).toEqual(expect.any(Number));

  const userInfoResponse = await request.get(`${origin}/oidc/me`, {
    headers: { authorization: `Bearer ${String(tokens.access_token)}` },
  });
  expect(userInfoResponse.status()).toBe(200);
  const userInfo = await userInfoResponse.json() as Record<string, unknown>;
  expect(userInfo).toMatchObject({
    preferred_username: adminUsername,
  });
  expect(userInfo.sub).toEqual(expect.any(String));
  const idToken = readJwtClaims(String(tokens.id_token));
  expect(idToken).toMatchObject({
    aud: clientId,
    iss: `${origin}/oidc`,
    nonce,
    sub: userInfo.sub,
  });

  const replayResponse = await request.post(`${origin}/oidc/token`, {
    form: tokenForm,
  });
  expect(replayResponse.status()).toBe(400);
  expect(await replayResponse.json()).toMatchObject({
    error: "invalid_grant",
  });
});

function readJwtClaims(token: string) {
  const payload = token.split(".")[1];
  if (payload === undefined)
    throw new Error("OIDC ID Token did not contain a payload");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as
    Record<string, unknown>;
  if (typeof claims.sub !== "string")
    throw new Error("OIDC ID Token did not contain a subject");
  return claims;
}
