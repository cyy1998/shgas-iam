import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { devices, expect } from "@playwright/test";
import { captureCommand } from "./src/command-runner.ts";
import { test } from "./src/gateway-test.ts";
import type { HybridRunContext } from "./src/hybrid-context.ts";
import { createPkceS256Pair, receiveOidcAuthorizationCallback } from "./src/oidc-rp.ts";
import { standInForWecomAuthorization } from "./src/wecom-journey.ts";
import { wecomBoundMember, wecomMobileCallbackPath } from "./src/wecom-provider.ts";

test("an internal OIDC request completes with WeCom confirmation on a separate public phone", async ({
  runtime,
  browser,
  page,
  request,
}) => {
  const startedAt = new Date();
  const apiLogs = await Promise.all(
    ["stdout", "stderr"].map(async (stream) => {
      const path = join(runtime.logDirectory, `auth-api.${stream}.log`);
      return { path, offset: (await stat(path)).size };
    }),
  );
  const desktopOrigin = runtime.internalOrigin;
  const mobileOrigin = runtime.wecomMobileOrigin;
  const clientId = `${runtime.references.oidcClientCode}-dual`;
  const redirectUri = runtime.references.oidcRedirectUri;
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
    await standInForWecomAuthorization(mobilePage, {
      mobileOrigin,
      member: wecomBoundMember,
      runId: runtime.references.runId,
    });
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

    const completePath = `/api/iam/auth/wechat-qr/${qrUrl.pathname.split("/").at(-1)}/complete`;
    const completed = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.origin === desktopOrigin &&
        url.pathname === completePath &&
        url.searchParams.get("protocol") === "oidc" &&
        url.searchParams.get("oidcReturn") === login.searchParams.get("oidcReturn")
      );
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
    const secretValues = {
      requestId: qrUrl.pathname.split("/").at(-1),
      mobileFlow: confirmUrl.pathname.split("/").at(-1),
      oauthCode: oauthQuery.get("code"),
      oauthState: oauthQuery.get("state"),
      oidcContinuation: login.searchParams.get("oidcReturn"),
    };
    await expectRedactedQrLogs(runtime, startedAt, apiLogs, secretValues);
    expect(new URL(page.url()).searchParams.get("iss")).toBe(issuer);

    const root = (await page.context().cookies(desktopOrigin)).find(({ name }) => name === "global_session");
    expect(root).toMatchObject({ domain: login.hostname, path: "/", httpOnly: true, sameSite: "Lax" });
    const browserBinding = (await page.context().cookies(`${issuer}/resume`)).find(
      ({ name }) => name === "oidc_interaction_binding",
    );
    expect(browserBinding).toMatchObject({ domain: login.hostname, path: "/", httpOnly: true, sameSite: "Lax" });
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
      preferred_username: runtime.references.adminUsername,
    });
  } finally {
    await phone.close();
  }
});

async function expectRedactedQrLogs(
  runtime: HybridRunContext,
  startTime: Date,
  apiLogs: Array<{ path: string; offset: number }>,
  secretValues: Record<string, string | null | undefined>,
) {
  async function readLogs(service: "auth-api" | "apisix") {
    if (service === "auth-api") {
      const logs = await Promise.all(
        apiLogs.map(async ({ path, offset }) => (await readFile(path)).subarray(offset).toString("utf8")),
      );
      return logs.join("\n");
    }
    const { stdout, stderr } = await captureCommand(
      "docker",
      [
        "compose",
        "--project-name",
        runtime.project,
        "--file",
        runtime.apisixComposeFile,
        "logs",
        "--no-color",
        "--no-log-prefix",
        "--since",
        startTime.toISOString(),
        "--tail",
        "300",
        "apisix",
      ],
      { cwd: process.cwd(), signal: AbortSignal.timeout(8_000) },
    );
    return stdout + stderr;
  }

  for (const service of ["auth-api", "apisix"] as const) {
    await expect
      .poll(
        async () => {
          const logs = await readLogs(service);
          expect(logs.includes("/sso/wechat-qr/mobile/callback?"), `${service} logged the callback query`).toBe(false);
          for (const [name, value] of Object.entries(secretValues)) {
            if (!value) throw new Error(`The WeCom browser journey omitted ${name}`);
            expect(logs.includes(value), `${service} logged the WeCom ${name}`).toBe(false);
          }
          return [
            "/api/iam/auth/wechat-qr/:requestId/complete",
            "/sso/wechat-qr/mobile/callback",
            "/sso/wechat-qr/mobile/confirm/:flowId",
          ].every((pattern) => logs.includes(service === "auth-api" ? pattern.replace(/^\/api\/iam/u, "") : pattern));
        },
        { message: `${service} logs should contain the WeCom route patterns` },
      )
      .toBe(true);
  }
}
