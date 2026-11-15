import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { devices, expect } from "@playwright/test";
import { composeArguments } from "./src/docker-infra.ts";
import { requireEnvironment } from "./src/environment.ts";
import { test } from "./src/gateway-test.ts";
import { createPkceS256Pair, receiveOidcAuthorizationCallback } from "./src/oidc-rp.ts";
import { standInForWecomAuthorization } from "./src/wecom-journey.ts";
import { wecomBoundMember, wecomMobileCallbackPath } from "./src/wecom-provider.ts";

test("an internal OIDC request completes with WeCom confirmation on a separate public phone", async ({
  browser,
  page,
  request,
}) => {
  const desktopOrigin = requireEnvironment("IAM_E2E_INTERNAL_ORIGIN");
  const mobileOrigin = requireEnvironment("IAM_E2E_WECHAT_QR_MOBILE_ORIGIN");
  const clientId = `${requireEnvironment("IAM_E2E_OIDC_CLIENT_CODE")}-dual`;
  const redirectUri = requireEnvironment("IAM_E2E_OIDC_REDIRECT_URI");
  const issuer = `${desktopOrigin}/oidc`;
  const pkce = createPkceS256Pair();
  const state = randomUUID();
  const nonce = randomUUID();
  const authorization = new URL("/oidc/auth", desktopOrigin);
  authorization.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile",
    prompt: "login",
    state,
    nonce,
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
  }).toString();

  const phone = await browser.newContext({ ...devices["Pixel 7"] });
  try {
    const mobilePage = await phone.newPage();
    await standInForWecomAuthorization(mobilePage, { mobileOrigin, member: wecomBoundMember });
    await page.goto(authorization.href);
    await expect(page).toHaveURL((url) => url.origin === desktopOrigin && url.pathname === "/portal/login");
    await page.getByRole("button", { name: "企业微信扫码登录" }).click();
    const login = new URL(page.url());
    const link = await page.getByRole("link", { name: "企业微信扫码链接" }).getAttribute("href");
    if (!link) throw new Error("WeCom QR did not expose its mobile destination");
    const qrUrl = new URL(link);
    expect(qrUrl.origin).toBe(mobileOrigin);
    expect(qrUrl.hostname).not.toBe(login.hostname);
    expect(qrUrl.search).toBe("");

    const completePath = `/oidc/wechat-qr/${qrUrl.pathname.split("/").at(-1)}/complete`;
    const completed = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.origin === desktopOrigin && url.pathname === completePath && url.search === login.search;
    });
    const resumed = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.origin === desktopOrigin && url.pathname === "/oidc/resume" && url.search === login.search;
    });
    const callbackResponse = mobilePage.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.origin === mobileOrigin && url.pathname === wecomMobileCallbackPath;
    });
    const confirmation = await mobilePage.goto(link);
    expect(confirmation?.status()).toBe(200);
    const confirmUrl = new URL(mobilePage.url());
    expect(confirmUrl.origin).toBe(mobileOrigin);
    expect(confirmUrl.pathname).toMatch(/^\/sso\/wechat-qr\/mobile\/confirm\/[^/]+$/u);
    const callback = await callbackResponse;
    expect(callback.status()).toBe(303);
    expect(callback.headers().location).toBe(confirmUrl.pathname);
    const [decision] = await Promise.all([
      mobilePage.waitForResponse((response) => new URL(response.url()).pathname === "/sso/wechat-qr/mobile/decision"),
      mobilePage.getByRole("button", { name: "确认登录" }).click(),
    ]);
    expect(decision.request().method()).toBe("POST");
    expect(decision.status()).toBe(200);
    const delivery = await completed;
    expect(delivery.request().method()).toBe("POST");
    expect(delivery.status()).toBe(200);
    expect((await resumed).status()).toBe(303);
    await expect(page).toHaveURL((url) => {
      const callback = new URL(redirectUri);
      return url.origin === callback.origin && url.pathname === callback.pathname && url.searchParams.has("code");
    });
    const { code } = receiveOidcAuthorizationCallback(page.url(), { redirectUri, state });
    const oauthQuery = new URL(callback.url()).searchParams;
    const secretValues = [
      qrUrl.pathname.split("/").at(-1),
      confirmUrl.pathname.split("/").at(-1),
      oauthQuery.get("code"),
      oauthQuery.get("state"),
      login.searchParams.get("oidcReturn"),
    ];
    await expectRedactedQrLogs(secretValues);
    expect(new URL(page.url()).searchParams.get("iss")).toBe(issuer);

    const root = (await page.context().cookies(desktopOrigin)).find(({ name }) => name === "global_session");
    expect(root).toMatchObject({ domain: login.hostname, path: "/", httpOnly: true, sameSite: "Lax" });
    const browserBinding = (await page.context().cookies(`${issuer}/resume`)).find(
      ({ name }) => name === "oidc_interaction_binding",
    );
    expect(browserBinding).toMatchObject({ domain: login.hostname, path: "/oidc", httpOnly: true, sameSite: "Lax" });
    expect(
      (await page.context().cookies([mobileOrigin, redirectUri])).some(({ name }) => name === "global_session"),
    ).toBe(false);
    expect((await phone.cookies()).some(({ name }) => name === "global_session" || name.startsWith("oidc_"))).toBe(
      false,
    );

    const tokenResponse = await request.post(`${issuer}/token`, {
      form: {
        client_id: clientId,
        code,
        code_verifier: pkce.verifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      },
    });
    expect(tokenResponse.status()).toBe(200);
    const tokens = await tokenResponse.json();
    expect(tokens).toMatchObject({ token_type: "Bearer", scope: "openid profile" });
    const claims = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString("utf8"));
    expect(claims).toMatchObject({ aud: clientId, iss: issuer, nonce, auth_time: expect.any(Number) });
    const identity = await request.get(`${issuer}/me`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    expect(identity.status()).toBe(200);
    expect(await identity.json()).toMatchObject({
      sub: claims.sub,
      preferred_username: requireEnvironment("IAM_E2E_ADMIN_USERNAME"),
    });
  } finally {
    await phone.close();
  }
});

async function expectRedactedQrLogs(secretValues: Array<string | null | undefined>) {
  const runId = requireEnvironment("IAM_E2E_RUN_ID");
  if (!/^[a-z0-9][a-z0-9-]{7,62}$/u.test(runId)) throw new Error("Invalid E2E run ID");
  const composeFile = fileURLToPath(new URL("./compose.yaml", import.meta.url));
  const project = `iam-e2e-${runId}`;

  async function readLogs(service: "api" | "apisix") {
    const args = composeArguments(composeFile, project, [
      "logs",
      "--no-color",
      "--no-log-prefix",
      "--tail",
      "300",
      service,
    ]);
    const { stdout, stderr } = await promisify(execFile)("docker", args, { timeout: 8000 });
    return stdout + stderr;
  }

  for (const service of ["api", "apisix"] as const) {
    await expect
      .poll(
        async () => {
          const logs = await readLogs(service);
          expect(logs.includes("/sso/wechat-qr/mobile/callback?"), `${service} logged the callback query`).toBe(false);
          for (const value of secretValues) {
            if (!value) throw new Error("The WeCom browser journey omitted a sensitive value under test");
            expect(logs.includes(value), `${service} logged a WeCom request secret`).toBe(false);
          }
          return [
            "/sso/wechat-qr/mobile/callback",
            "/sso/wechat-qr/mobile/confirm/:flowId",
            "/oidc/wechat-qr/:requestId/complete",
          ].every((pattern) => logs.includes(pattern));
        },
        { message: `${service} logs should contain the WeCom route patterns` },
      )
      .toBe(true);
  }
}
