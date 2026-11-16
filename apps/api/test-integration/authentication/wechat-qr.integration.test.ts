import { afterEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { createApiPasswordHasher } from "@api/composition/runtime/password-hasher";
import { createApiUnitOfWork } from "@api/composition/tx";
import { HumanVerificationAction } from "@api/enums/humanVerification.action";
import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import { createAuditRepository } from "@api/services/audit/audit.repository";
import { createApiAuditLogWriter } from "@api/services/audit/audit.service";
import { createCapService } from "@api/services/human-verification/cap.service";
import { createHumanRiskService } from "@api/services/human-verification/human-risk.service";
import { createImageCaptchaService } from "@api/services/human-verification/image-captcha.service";
import { createMobileService } from "@api/services/mobile/mobile.service";
import { createMobileCodeCooldown } from "@api/services/mobile/mobile-code-cooldown";
import { createUserRepository } from "@api/services/user/user.repository";
import { createUserPasswordHelper } from "@api/services/user/user-password.helper";
import type { WechatQrDirectoryPort } from "@api/use-cases/authentication/wechat-qr/wechat-qr.port";
import { ApiErrorCode, IMAGE_CAPTCHA_PROOF_HEADER, IMAGE_CAPTCHA_TICKET_HEADER, UserStatus } from "@iam/contracts";
import { auditLogs, userDocumentOutboxEntries, users } from "@iam/db/schema";
import { createLoginRestriction } from "@iam/login-restriction";
import { createRedisLoginRestrictionStore } from "@iam/login-restriction/redis";
import { mapUnitOfWork } from "@iam/unit-of-work";
import { eq } from "drizzle-orm";
import Redis from "ioredis";
import pino from "pino";
import { closeFixtureResources } from "../oidc/oidc.fixture";
import { closeApiRedisConnection, resetApiRedisTestDatabase } from "../support/fixture-lifecycle";
import { createApiPostgresTestHarness } from "../support/postgres-test-harness";
import { fixture } from "./root-authentication.fixture";

afterEach(resetApiRedisTestDatabase);

const external = "https://external.example";
const internal = "https://internal.example";
const callback = `${external}/sso/wechat-qr/mobile/callback`;

function requestCookie(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

function required(value: string | null | undefined) {
  if (!value) throw new Error("Expected an HTTP header, parameter or SSE value");
  return value;
}

async function setup(
  continuationTtlSeconds = 60,
  findRegisteredMember?: WechatQrDirectoryPort["findRegisteredMember"],
  dependencies?: Parameters<typeof fixture>[6],
) {
  let subjectIdentifier = "";
  const f = await fixture(30, undefined, 45, continuationTtlSeconds, undefined, undefined, {
    ...dependencies,
    customAdmission: { evaluate: async () => "no-match" },
    wechatQr: {
      config: { corpId: "test-tenant", agentId: "1000001", callbackUrl: callback },
      binding: dependencies?.wechatQr?.binding,
      directory: {
        lookupApplicationName: async () => "业务应用 <一>",
        findRegisteredMember:
          findRegisteredMember ?? (async (wxId) => (wxId === "wx-test" ? { userId: 1001, subjectIdentifier } : null)),
      },
    },
  });
  subjectIdentifier = f.subjectIdentifier;
  const initial = await f.app.request(
    `${internal}/sso/authorize?client=iam&redirectUrl=https://app.example/callback&state=original`,
  );
  const login = new URL(required(initial.headers.get("location")), internal);
  const browser = requestCookie(initial);
  const desktop = { Cookie: browser, "X-IAM-Entry-Network": "internal" };
  const mobile = { "X-IAM-Entry-Network": "external", "X-Forwarded-Proto": "http" };
  const begin = (headers: HeadersInit = desktop) =>
    f.app.request(`${internal}/sso/wechat-qr?${login.searchParams}`, {
      method: "POST",
      headers,
    });
  const complete = (requestId: string, headers: HeadersInit = desktop, query = login.searchParams) =>
    f.app.request(`${internal}/sso/wechat-qr/${requestId}/complete?${query}`, { method: "POST", headers });
  const readStatus = async (requestId: string, headers: HeadersInit = desktop) => {
    const response = await f.app.request(`${internal}/sso/wechat-qr/${requestId}/events?${login.searchParams}`, {
      headers,
    });
    if (!response.ok) return { status: response.status, event: null };
    if (!response.body) throw new Error("Expected an SSE response");
    const reader = response.body.getReader();
    try {
      const event = await reader.read();
      const line = new TextDecoder().decode(event.value);
      const data = required(line.split("\n").find((value) => value.startsWith("data: ")));
      return { status: response.status, event: JSON.parse(data.slice(6)) };
    } finally {
      await reader.cancel();
    }
  };
  function bindPassword(requestId: string, credential: string, headers = desktop) {
    return f.app.request(`${internal}/sso/wechat-qr/${requestId}/bind/password?${login.searchParams}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
    });
  }
  function bindingSms(requestId: string, phoneNumber: string, code?: string, headers: HeadersInit = desktop) {
    const path = code === undefined ? "bind/sms/send" : "bind/sms";
    return f.app.request(`${internal}/sso/wechat-qr/${requestId}/${path}?${login.searchParams}`, {
      method: "POST",
      headers: new Headers([...new Headers(headers), ["Content-Type", "application/json"]]),
      body: JSON.stringify({ phoneNumber, code }),
    });
  }
  return { ...f, begin, complete, bindPassword, bindingSms, readStatus, desktop, mobile, loginUrl: login };
}

test("only the originating internal browser can create and observe the current QR request", async () => {
  const f = await setup();
  try {
    const guard = await f.app.request(`${internal}/sso/login-guard?${f.loginUrl.searchParams}`, {
      headers: f.desktop,
    });
    const guardBody = await guard.json();
    expect(guardBody).toMatchObject({ data: { decision: "login", wechatQr: true } });
    const externalGuard = await f.app.request(`${external}/sso/login-guard?${f.loginUrl.searchParams}`, {
      headers: { ...f.desktop, ...f.mobile },
    });
    const externalGuardBody = await externalGuard.json();
    expect(externalGuardBody.data).toEqual({ decision: "login" });
    const externalStart = await f.begin({ ...f.desktop, ...f.mobile });
    expect(externalStart.status).toBe(404);
    const unboundStart = await f.begin({ "X-IAM-Entry-Network": "internal" });
    expect(unboundStart.status).toBe(400);

    const start = await f.begin();
    expect(start.status).toBe(200);
    const { data: qr } = await start.json();
    expect(qr.mobileUrl).toBe(`${external}/sso/wechat-qr/mobile/${qr.requestId}`);
    expect(qr.expiresAt - Date.now()).toBeLessThanOrEqual(60_000);
    expect(qr.expiresAt - Date.now()).toBeGreaterThan(0);
    expect(start.headers.getSetCookie()).toEqual([]);
    const internalMobile = await f.app.request(qr.mobileUrl, {
      headers: { "X-IAM-Entry-Network": "internal", "X-Forwarded-Proto": "https" },
    });
    expect(internalMobile.status).toBe(404);

    const waiting = await f.readStatus(qr.requestId);
    expect(waiting).toEqual({ status: 200, event: { status: "waiting" } });
    const token = await f.login();
    const existing = await f.begin({ ...f.desktop, Cookie: `${f.desktop.Cookie}; global_session=${token}` });
    const existingBody = await existing.json();
    expect(existingBody.data).toEqual({ decision: "continue" });
    expect(existing.headers.getSetCookie()).toEqual([]);
    const preserved = await f.readStatus(qr.requestId);
    expect(preserved).toEqual(waiting);
    const other = await f.readStatus(qr.requestId, { "X-IAM-Entry-Network": "internal" });
    expect(other.status).toBe(400);

    const replacement = await f.begin();
    expect(replacement.status).toBe(200);
    const replaced = await f.readStatus(qr.requestId);
    expect(replaced).toEqual({ status: 200, event: { status: "restart" } });
  } finally {
    await f.close();
  }
});

async function authorizePhone(f: Awaited<ReturnType<typeof setup>>, mobileUrl: string, code = "wx-code") {
  const start = await f.app.request(mobileUrl, { headers: f.mobile });
  expect(start.status).toBe(302);
  const target = new URL(required(start.headers.get("location")));
  expect(target.origin + target.pathname).toBe("https://open.weixin.qq.com/connect/oauth2/authorize");
  expect(target.searchParams.get("redirect_uri")).toBe(callback);
  expect(target.searchParams.get("scope")).toBe("snsapi_base");
  expect(start.headers.getSetCookie()[0]).toContain("Secure");
  const state = required(target.searchParams.get("state"));
  const callbackUrl = `${callback}?${new URLSearchParams({ code, state })}`;
  const wrongPhone = await f.app.request(callbackUrl, { headers: f.mobile });
  expect(wrongPhone.status).toBe(400);
  const returned = await f.app.request(callbackUrl, {
    headers: { ...f.mobile, Cookie: requestCookie(start) },
  });
  expect(returned.status).toBe(303);
  expect(returned.headers.get("location")).not.toContain("?");
  expect(returned.headers.get("set-cookie")).not.toContain("global_session");
  const replay = await f.app.request(callbackUrl, {
    headers: { ...f.mobile, Cookie: requestCookie(start) },
  });
  expect(replay.status).toBe(400);
  const cookie = requestCookie(returned);
  const page = await f.app.request(`${external}${returned.headers.get("location")}`, {
    headers: { ...f.mobile, Cookie: cookie },
  });
  expect(page.status).toBe(200);
  const form = await page.text();
  expect(form).toContain("业务应用 &lt;一&gt;");
  expect(form).toContain("Windows 电脑");
  const flow = required(/name="flow" value="([^"]+)"/u.exec(form)?.[1]);
  return (action: "confirm" | "cancel") =>
    f.app.request(`${external}/sso/wechat-qr/mobile/decision`, {
      method: "POST",
      headers: { ...f.mobile, Cookie: cookie, Origin: external, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ flow, action }),
    });
}

test("only the originating browser can receive a session once and recover using its installed cookie", async () => {
  const f = await setup();
  try {
    const start = await f.begin({ ...f.desktop, "User-Agent": "Windows" });
    const { data: qr } = await start.json();
    const confirm = await authorizePhone(f, qr.mobileUrl);
    expect((await confirm("confirm")).status).toBe(200);

    const externalAttempt = await f.complete(qr.requestId, { ...f.desktop, ...f.mobile });
    expect(externalAttempt.status).toBe(404);
    const crossOrigin = await f.complete(qr.requestId, { ...f.desktop, "Sec-Fetch-Site": "cross-site" });
    expect(crossOrigin.status).toBe(400);
    const otherBrowser = await f.app.request(
      `${internal}/sso/authorize?client=iam&redirectUrl=https://app.example/callback`,
    );
    const otherLogin = new URL(required(otherBrowser.headers.get("location")), internal);
    const foreignAttempt = await f.complete(
      qr.requestId,
      { ...f.desktop, Cookie: requestCookie(otherBrowser) },
      otherLogin.searchParams,
    );
    expect(await foreignAttempt.json()).toMatchObject({ data: { decision: "restart" } });
    expect(foreignAttempt.headers.getSetCookie()).toEqual([]);

    const [first, second] = await Promise.all([f.complete(qr.requestId), f.complete(qr.requestId)]);
    const responses = await Promise.all([first.json(), second.json()]);
    expect(responses.map(({ data }) => data.decision).sort()).toEqual(["continue", "restart"]);
    expect(responses.map(({ data }) => Object.keys(data))).toEqual([["decision"], ["decision"]]);
    const issued = [first, second].flatMap((response) => response.headers.getSetCookie());
    expect(issued).toHaveLength(1);
    const cookie = required(issued[0]);
    expect(cookie).toMatch(/^global_session=.+;.*Path=\/;.*HttpOnly;.*SameSite=Lax/u);
    expect(cookie).not.toMatch(/Domain=/iu);

    const lost = await f.complete(qr.requestId);
    expect(await lost.json()).toMatchObject({ data: { decision: "restart" } });
    expect(lost.headers.getSetCookie()).toEqual([]);
    const desktop = { ...f.desktop, Cookie: `${f.desktop.Cookie}; ${cookie.split(";")[0]}` };
    const recovered = await f.complete(qr.requestId, desktop);
    expect(await recovered.json()).toMatchObject({ data: { decision: "continue" } });
    expect(recovered.headers.getSetCookie()).toEqual([]);
    const resumed = await f.app.request(`${internal}/sso/authorize?${f.loginUrl.searchParams}`, { headers: desktop });
    const callback = new URL(required(resumed.headers.get("location")), internal);
    expect(callback.origin + callback.pathname).toBe("https://app.example/callback");
    expect(callback.searchParams.get("state")).toBe("original");
    expect(callback.searchParams.get("code")).toBeTruthy();
    expect(f.audits.filter(({ action }) => action === "auth.login.wechat")).toEqual([
      expect.objectContaining({
        outcome: "success",
        targetId: 1001,
        details: { loginType: "wechat", source: "cross_device" },
      }),
    ]);
  } finally {
    await f.close();
  }
});

async function confirmBoundRequest(f: Awaited<ReturnType<typeof setup>>) {
  const start = await f.begin({ ...f.desktop, "User-Agent": "Windows" });
  const { data: qr } = await start.json();
  const confirm = await authorizePhone(f, qr.mobileUrl);
  expect((await confirm("confirm")).status).toBe(200);
  return qr;
}

test("current access and temporary restriction are checked before consuming the fixed identity", async () => {
  const f = await setup();
  try {
    const qr = await confirmBoundRequest(f);
    f.state.permission = "disabled";
    const denied = await f.complete(qr.requestId);
    expect(denied.status).toBe(401);
    expect(denied.headers.getSetCookie()).toEqual([]);
    f.state.permission = "unknown";
    const unknownAccess = await f.complete(qr.requestId);
    expect(unknownAccess.status).toBe(503);
    expect(unknownAccess.headers.getSetCookie()).toEqual([]);
    f.state.permission = "enabled";
    f.state.restriction = true;
    const restricted = await f.complete(qr.requestId);
    expect(restricted.status).toBe(400);
    expect(await restricted.json()).toMatchObject({
      code: ApiErrorCode.LoginFailed,
      message: expect.stringContaining("1 分钟"),
    });
    expect(restricted.headers.getSetCookie()).toEqual([]);
    f.state.restriction = false;
    f.state.restrictionUnavailable = true;
    const unknownRestriction = await f.complete(qr.requestId);
    expect(unknownRestriction.status).toBe(503);
    expect(unknownRestriction.headers.getSetCookie()).toEqual([]);
    expect(f.state.failures).toBe(0);
    expect(await f.readStatus(qr.requestId)).toMatchObject({ event: { status: "confirmed" } });
    f.state.restrictionUnavailable = false;
    const retry = await f.complete(qr.requestId);
    expect(await retry.json()).toMatchObject({ data: { decision: "continue" } });
    expect(retry.headers.getSetCookie()).toHaveLength(1);
  } finally {
    await f.close();
  }
});

test("a confirmed QR preserves a valid password session and an unknown cookie fails closed", async () => {
  const f = await setup();
  try {
    const qr = await confirmBoundRequest(f);
    const token = await f.login();
    const desktop = { ...f.desktop, Cookie: `${f.desktop.Cookie}; global_session=${token}` };
    const mismatched = new URLSearchParams(f.loginUrl.searchParams);
    mismatched.set("state", "changed");
    expect((await f.complete(qr.requestId, desktop, mismatched)).status).toBe(400);
    f.state.permission = "unknown";
    const unavailable = await f.complete(qr.requestId, desktop);
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.getSetCookie()).toEqual([]);
    f.state.permission = "enabled";
    const alreadyLoggedIn = await f.complete(qr.requestId, desktop);
    expect(await alreadyLoggedIn.json()).toMatchObject({ data: { decision: "continue" } });
    expect(alreadyLoggedIn.headers.getSetCookie()).toEqual([]);
    expect(await f.readStatus(qr.requestId)).toMatchObject({ event: { status: "confirmed" } });
    expect(f.audits.map(({ action }) => action)).toEqual(["auth.login.password"]);
  } finally {
    await f.close();
  }
});

test("Custom SSO continuation uses current application admission and retains the new IAM root on rejection", async () => {
  const f = await setup();
  try {
    const qr = await confirmBoundRequest(f);
    f.setClient({
      ...f.getClient(),
      admissionEnabled: true,
      admissionFilter: { field: "username", op: "eq", value: "someone-else" },
    });
    const completed = await f.complete(qr.requestId);
    expect(completed.status).toBe(200);
    const desktop = { ...f.desktop, Cookie: `${f.desktop.Cookie}; ${requestCookie(completed)}` };
    const denied = await f.app.request(`${internal}/sso/authorize?${f.loginUrl.searchParams}`, { headers: desktop });
    expect(denied.headers.get("location")).toBe("/portal/application-access-denied?client=iam");
    expect(denied.headers.getSetCookie()).toEqual([]);
    const recovered = await f.complete(qr.requestId, desktop);
    expect(await recovered.json()).toMatchObject({ data: { decision: "continue" } });
    expect(recovered.headers.getSetCookie()).toEqual([]);
  } finally {
    await f.close();
  }
});

test("failed audit delivery leaves the result consumed and requires a new QR without a root cookie", async () => {
  const f = await setup();
  try {
    const qr = await confirmBoundRequest(f);
    f.state.authenticationAuditUnavailable = true;
    const failed = await f.complete(qr.requestId);
    expect(failed.status).toBe(500);
    expect(failed.headers.getSetCookie()).toEqual([]);
    const inventory = await f.operations.run((operation) =>
      f.kernel.forOperation(operation).listSessions({ kind: "userSession", offset: 0, limit: 10 }),
    );
    expect(inventory).toMatchObject({ total: 0, records: [] });
    f.state.authenticationAuditUnavailable = false;
    const replay = await f.complete(qr.requestId);
    expect(await replay.json()).toMatchObject({ data: { decision: "restart" } });
    expect(replay.headers.getSetCookie()).toEqual([]);
    expect(f.audits).toEqual([]);
  } finally {
    await f.close();
  }
});

test("parallel mobile authorizations accept precisely one confirmation or cancellation and SSE reconnect reads it", async () => {
  const f = await setup();
  try {
    const start = await f.begin({ ...f.desktop, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" });
    const { data: qr } = await start.json();
    const [confirm, cancel] = await Promise.all([authorizePhone(f, qr.mobileUrl), authorizePhone(f, qr.mobileUrl)]);
    const [confirmed, cancelled] = await Promise.all([confirm("confirm"), cancel("cancel")]);
    expect([confirmed.status, cancelled.status].sort()).toEqual([200, 400]);
    expect(requestCookie(confirmed)).not.toContain("global_session");
    expect(requestCookie(cancelled)).not.toContain("global_session");
    for (let reconnect = 0; reconnect < 2; reconnect++) {
      const reconnectEvent = await f.readStatus(qr.requestId);
      expect(reconnectEvent).toEqual({
        status: 200,
        event: { status: confirmed.ok ? "confirmed" : "restart" },
      });
    }
    const replay = await confirm("confirm");
    expect(replay.status).toBe(400);
  } finally {
    await f.close();
  }
});

test("changing the QR invalidates already authorized mobile forms and a new unregistered member reaches binding", async () => {
  const f = await setup();
  try {
    const headers = { ...f.desktop, "User-Agent": "Windows" };
    const first = await f.begin(headers);
    const { data: original } = await first.json();
    const oldConfirm = await authorizePhone(f, original.mobileUrl);
    const second = await f.begin(headers);
    const { data: next } = await second.json();
    expect(next.requestId).not.toBe(original.requestId);
    const stale = await oldConfirm("confirm");
    expect(stale.status).toBe(400);
    const confirm = await authorizePhone(f, next.mobileUrl, "wx-unregistered-code");
    const accepted = await confirm("confirm");
    expect(accepted.status).toBe(200);
    const current = await f.readStatus(next.requestId);
    expect(current).toEqual({ status: 200, event: { status: "binding_required" } });
  } finally {
    await f.close();
  }
});

const accountPassword = "wecom-fixture-password";

type BindingDatabaseOptions = {
  capEnabled?: boolean;
  continuationTtlSeconds?: number;
  cooldownMilliseconds?: number;
  realLoginRestriction?: boolean;
};

async function withBindingDatabase(
  testBinding: (db: {
    pg: Awaited<ReturnType<typeof createApiPostgresTestHarness>>;
    newBrowser: (onWake?: () => Promise<void>) => ReturnType<typeof setup>;
    addAccount: (input: {
      id?: number;
      username: string;
      subjectIdentifier?: string;
      mobile?: string;
      wxId?: string;
      status?: UserStatus;
    }) => Promise<number>;
    mobileService: ReturnType<typeof createMobileService>;
    sentCodes: Map<string, string>;
    imageCaptcha: ReturnType<typeof createImageCaptchaService>;
    loginRestriction: ReturnType<typeof createLoginRestriction>;
  }) => Promise<void>,
  options: BindingDatabaseOptions = {},
) {
  const pg = await createApiPostgresTestHarness();
  const redis = new Redis(required(process.env.IAM_API_TEST_REDIS_URL), {
    keyPrefix: `wecom-binding-test:${randomUUID()}:`,
    lazyConnect: true,
    maxRetriesPerRequest: 0,
  });
  const browsers: Awaited<ReturnType<typeof setup>>[] = [];
  try {
    await redis.connect();
    const userRepository = createUserRepository(pg.db);
    const sentCodes = new Map<string, string>();
    let nextCode = 6100;
    const mobileService = createMobileService({
      redis,
      cooldown: createMobileCodeCooldown(redis, options.cooldownMilliseconds),
      userRepository,
      smsSender: {
        async sendVerificationCode(phone) {
          const code = String(nextCode++);
          sentCodes.set(phone, code);
          return { success: true, code };
        },
        sendMessage: async () => true,
      },
      config: { verificationCodeTtlSeconds: 180 },
    });
    const loginRestriction = createLoginRestriction({
      store: createRedisLoginRestrictionStore({ redis }),
      clock: { now: Date.now },
      random: { uuid: randomUUID },
    });
    const imageCaptcha = createImageCaptchaService({
      redis,
      enabled: true,
      secret: "binding-test-image-captcha",
      clock: { now: Date.now },
      render: () => ({ answer: "AC9TV3", imageBase64: "test-image" }),
    });
    const humanRisk = createHumanRiskService({
      redis,
      config: {
        capEnabled: options.capEnabled ?? false,
        loginFailureThreshold: 2,
        windowSeconds: 60,
        lookupThreshold: 2,
      },
    });
    const humanVerification = createCapService({
      redis,
      riskService: humanRisk,
      imageCaptcha,
      capClient: {
        createChallenge: async () => ({ challenge: { c: 1, s: 1, d: 1 }, expires: Date.now() + 60_000 }),
        redeemChallenge: async () => ({ success: true, token: "cap-test-token" }),
        validateToken: async () => ({ success: true }),
      },
      logger: pino({ level: "silent" }),
      config: {
        capEnabled: options.capEnabled ?? false,
        siteKey: "test",
        secret: "cap-test-secret",
        challengeTtlMs: 60_000,
        tokenTtlSeconds: 60,
      },
    });
    const auditLogWriter = createApiAuditLogWriter({ auditRepository: createAuditRepository(pg.db) });
    const passwordHelper = createUserPasswordHelper({ passwordHasher: createApiPasswordHasher(4) });
    const password = await passwordHelper.hashUserPassword(accountPassword);

    const newBrowser = async (onWake?: () => Promise<void>) => {
      const uow = createApiUnitOfWork({
        db: pg.db,
        logger: { warn() {}, error() {} },
        clock: { nowDate: () => new Date() },
        userDocumentJobProducer: {
          async enqueueOutboxEntries(entries) {
            await onWake?.();
            return { enqueued: entries.length, jobIds: [] };
          },
        },
        organizationDocumentJobProducer: {
          async enqueueOutboxEntries(entries) {
            return { enqueued: entries.length };
          },
        },
      });
      const f = await setup(options.continuationTtlSeconds ?? 60, userRepository.findRegisteredWechatMember, {
        loginRestriction: options.realLoginRestriction ? loginRestriction : undefined,
        auditLogWriter,
        wechatUsers: userRepository,
        wechatQr: {
          config: { corpId: "test-tenant", agentId: "1000001", callbackUrl: callback },
          directory: {
            lookupApplicationName: async () => "业务应用 <一>",
            findRegisteredMember: userRepository.findRegisteredWechatMember,
          },
          binding: {
            users: userRepository,
            sms: mobileService,
            verifyUserPassword: passwordHelper.verifyUserPassword,
            humanVerification,
            humanRisk,
            uow: mapUnitOfWork(uow, (tx) => ({
              userRepository: tx.repositories.user,
              auditLogWriter: tx.auditLogWriter,
              userDocumentInvalidation: tx.userDocumentInvalidation,
            })),
          },
        },
      });
      browsers.push(f);
      return f;
    };
    await testBinding({
      pg,
      newBrowser,
      mobileService,
      sentCodes,
      imageCaptcha,
      loginRestriction,
      async addAccount(input) {
        const [user] = await pg.db
          .insert(users)
          .values({ ...input, name: input.username, password })
          .returning({ id: users.id });
        if (!user) throw new Error("User fixture was not inserted");
        return user.id;
      },
    });
  } finally {
    await closeFixtureResources([
      pg.close,
      () => closeApiRedisConnection(redis),
      ...browsers.map((browser) => browser.close),
    ]);
  }
}

async function startBinding(f: Awaited<ReturnType<typeof setup>>, code = "wx-unregistered-code") {
  const start = await f.begin({ ...f.desktop, "User-Agent": "Windows" });
  const { data: qr } = await start.json();
  const confirm = await authorizePhone(f, qr.mobileUrl, code);
  expect((await confirm("confirm")).status).toBe(200);
  expect(await f.readStatus(qr.requestId)).toMatchObject({ event: { status: "binding_required" } });
  return qr.requestId as string;
}

test("the originating browser binds by its delivered SMS code and shares the mobile cooldown", async () => {
  await withBindingDatabase(async ({ pg, newBrowser, addAccount, sentCodes, mobileService }) => {
    const f = await newBrowser();
    const phone = "13800000000";
    const userId = await addAccount({
      id: 1001,
      username: "wecom-sms",
      subjectIdentifier: f.subjectIdentifier,
      mobile: phone,
    });
    const requestId = await startBinding(f);
    const wrongOrigin = await f.bindingSms(requestId, phone, undefined, {
      ...f.desktop,
      "Sec-Fetch-Site": "cross-site",
    });
    expect(wrongOrigin.status).toBe(400);
    expect(sentCodes.has(phone)).toBe(false);
    const send = await f.bindingSms(requestId, ` ${phone} `);
    expect(await send.json()).toMatchObject({ data: { decision: "sent" } });
    expect(send.headers.getSetCookie()).toEqual([]);
    const code = required(sentCodes.get(phone));
    const resend = await f.bindingSms(requestId, phone);
    expect(resend.status).toBe(429);
    expect(Number(resend.headers.get("Retry-After"))).toBeGreaterThan(0);
    const ordinary = await Promise.allSettled([mobileService.sendCode(phone, VerificationCodeUsage.Login)]);
    expect(ordinary[0]).toMatchObject({ status: "rejected", reason: { code: ApiErrorCode.SmsCooldown } });
    const ordinaryCode = await mobileService.consumeVerificationCode(VerificationCodeUsage.Login, phone, code);
    expect(ordinaryCode).toBe(false);

    const wrongCode = await f.bindingSms(requestId, phone, "0000");
    expect(await wrongCode.json()).toMatchObject({ code: ApiErrorCode.LoginFailed });
    expect(wrongCode.headers.getSetCookie()).toEqual([]);
    const bound = await f.bindingSms(requestId, phone, code);
    expect(await bound.json()).toMatchObject({ data: { decision: "continue" } });
    expect(requestCookie(bound)).toMatch(/^global_session=/u);
    expect(await pg.db.query.users.findFirst({ where: { id: userId } })).toMatchObject({ wxId: "wx-unregistered" });
    const bindingAudits = await pg.db.select().from(auditLogs).where(eq(auditLogs.action, "self.wecom.bind"));
    expect(bindingAudits).toHaveLength(2);
    expect(bindingAudits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outcome: "failure",
          targetId: userId,
          details: expect.objectContaining({ verificationMethod: "mobile", reason: "invalid_verification_code" }),
        }),
        expect.objectContaining({
          outcome: "success",
          actorUserId: userId,
          targetId: userId,
          details: expect.objectContaining({ verificationMethod: "mobile" }),
        }),
      ]),
    );
    expect(await pg.db.select().from(userDocumentOutboxEntries)).toHaveLength(1);
  });
});

test("binding SMS accepts only the active request, registered number and the originally selected account", async () => {
  await withBindingDatabase(async ({ pg, newBrowser, addAccount, mobileService, sentCodes }) => {
    const first = await newBrowser();
    const second = await newBrowser();
    const phone = "13800000000";
    const otherPhone = "13800000001";
    const userId = await addAccount({
      id: 1001,
      username: "wecom-sms-first",
      subjectIdentifier: first.subjectIdentifier,
      mobile: phone,
    });
    const otherId = await addAccount({
      id: 1002,
      username: "wecom-sms-second",
      subjectIdentifier: second.subjectIdentifier,
      mobile: otherPhone,
    });
    const firstRequest = await startBinding(first);
    const secondRequest = await startBinding(second, "wx-unregistered-other-code");
    expect(await mobileService.sendCode(otherPhone, VerificationCodeUsage.Login)).toBe(true);
    const ordinaryFirst = await second.bindingSms(secondRequest, otherPhone);
    expect(ordinaryFirst.status).toBe(429);
    expect(Number(ordinaryFirst.headers.get("Retry-After"))).toBeGreaterThan(0);
    const ordinaryCode = required(sentCodes.get(otherPhone));
    const wrongPurpose = await second.bindingSms(secondRequest, otherPhone, ordinaryCode);
    expect(await wrongPurpose.json()).toMatchObject({ code: ApiErrorCode.LoginFailed });

    const sent = await first.bindingSms(firstRequest, phone);
    expect(sent.status).toBe(200);
    const code = required(sentCodes.get(phone));
    const wrongBrowser = await second.bindingSms(firstRequest, phone, code);
    expect(await wrongBrowser.json()).toMatchObject({ data: { decision: "restart" } });
    const wrongQr = await second.bindingSms(secondRequest, phone, code);
    expect(await wrongQr.json()).toMatchObject({ code: ApiErrorCode.LoginFailed });
    const wrongPhone = await first.bindingSms(firstRequest, otherPhone, code);
    expect(await wrongPhone.json()).toMatchObject({ code: ApiErrorCode.LoginFailed });

    await pg.db.update(users).set({ mobile: null }).where(eq(users.id, userId));
    await pg.db.update(users).set({ mobile: phone }).where(eq(users.id, otherId));
    const changedAccount = await first.bindingSms(firstRequest, phone, code);
    expect(await changedAccount.json()).toMatchObject({ code: ApiErrorCode.LoginFailed });
    const replacement = await startBinding(first);
    const staleQr = await first.bindingSms(firstRequest, phone, code);
    expect(await staleQr.json()).toMatchObject({ data: { decision: "restart" } });
    const replacementQr = await first.bindingSms(replacement, phone, code);
    expect(await replacementQr.json()).toMatchObject({ code: ApiErrorCode.LoginFailed });
    expect(await pg.db.select().from(userDocumentOutboxEntries)).toEqual([]);
  });
});

test("binding send requires human verification and scopes the image proof to the specific QR and phone", async () => {
  await withBindingDatabase(
    async ({ newBrowser, addAccount, sentCodes, imageCaptcha }) => {
      const first = await newBrowser();
      const second = await newBrowser();
      const phone = "13800000000";
      const otherPhone = "13800000001";
      await addAccount({
        id: 1001,
        username: "wecom-sms-first",
        subjectIdentifier: first.subjectIdentifier,
        mobile: phone,
      });
      await addAccount({
        id: 1002,
        username: "wecom-sms-second",
        subjectIdentifier: second.subjectIdentifier,
        mobile: otherPhone,
      });
      const firstRequest = await startBinding(first);
      const secondRequest = await startBinding(second, "wx-unregistered-other-code");
      const challenged = await first.bindingSms(firstRequest, phone);
      expect(await challenged.json()).toMatchObject({ code: ApiErrorCode.HumanVerificationRequired });
      expect(sentCodes.size).toBe(0);

      const ticket = required(challenged.headers.get(IMAGE_CAPTCHA_TICKET_HEADER));
      const { challengeId } = await imageCaptcha.createChallenge(ticket);
      const result = await imageCaptcha.verifyAnswer(ticket, challengeId, "AC9TV3");
      if (result.result !== "verified") throw new Error("Fixture image proof was not issued");
      const firstProof = { ...first.desktop, [IMAGE_CAPTCHA_PROOF_HEADER]: result.proof };
      const secondProof = { ...second.desktop, [IMAGE_CAPTCHA_PROOF_HEADER]: result.proof };
      const wrongQr = await second.bindingSms(secondRequest, phone, undefined, secondProof);
      expect(await wrongQr.json()).toMatchObject({ code: ApiErrorCode.HumanVerificationRequired });
      const wrongPhone = await first.bindingSms(firstRequest, otherPhone, undefined, firstProof);
      expect(await wrongPhone.json()).toMatchObject({ code: ApiErrorCode.HumanVerificationRequired });
      const wrongAction = await first.bindingSms(firstRequest, phone, "0000", firstProof);
      expect(await wrongAction.json()).toMatchObject({ code: ApiErrorCode.HumanVerificationRequired });
      expect(sentCodes.size).toBe(0);
      const delivered = await first.bindingSms(firstRequest, phone, undefined, firstProof);
      expect(await delivered.json()).toMatchObject({ data: { decision: "sent" } });
      const duplicate = await first.bindingSms(firstRequest, phone, undefined, firstProof);
      expect(await duplicate.json()).toMatchObject({ code: ApiErrorCode.HumanVerificationRequired });
      expect(sentCodes.size).toBe(1);
    },
    { capEnabled: true },
  );
});

test("five invalid binding codes temporarily restrict the account for send and verification", async () => {
  await withBindingDatabase(
    async ({ newBrowser, addAccount, sentCodes, loginRestriction }) => {
      const f = await newBrowser();
      const phone = "13800000000";
      const id = await addAccount({
        id: 1001,
        username: "wecom-sms",
        subjectIdentifier: f.subjectIdentifier,
        mobile: phone,
      });
      const requestId = await startBinding(f);
      const sent = await f.bindingSms(requestId, phone);
      expect(sent.status).toBe(200);
      const code = required(sentCodes.get(phone));
      for (let i = 0; i < 5; i++) {
        const rejected = await f.bindingSms(requestId, phone, "0000");
        expect(rejected.status).toBe(400);
      }
      expect(await loginRestriction.getRestriction(id)).toMatchObject({ triggerMethod: "mobile" });
      const restrictedSend = await f.bindingSms(requestId, phone);
      expect(await restrictedSend.json()).toMatchObject({
        code: ApiErrorCode.LoginFailed,
        message: expect.stringContaining("账号已被临时限制"),
      });
      const restrictedVerify = await f.bindingSms(requestId, phone, code);
      expect(await restrictedVerify.json()).toMatchObject({
        code: ApiErrorCode.LoginFailed,
        message: expect.stringContaining("账号已被临时限制"),
      });
      await loginRestriction.clearLoginState(id);
      const bound = await f.bindingSms(requestId, phone, code);
      expect(await bound.json()).toMatchObject({ data: { decision: "continue" } });
    },
    { realLoginRestriction: true },
  );
});

test("resend replaces the delivered code without extending the original QR deadline", async () => {
  await withBindingDatabase(
    async ({ newBrowser, addAccount, sentCodes, mobileService }) => {
      const f = await newBrowser();
      const phoneNumber = "13800000000";
      const userId = await addAccount({
        id: 1001,
        username: "wecom-sms",
        subjectIdentifier: f.subjectIdentifier,
        mobile: phoneNumber,
      });
      const start = await f.begin({ ...f.desktop, "User-Agent": "Windows" });
      const { data: qr } = await start.json();
      const confirm = await authorizePhone(f, qr.mobileUrl, "wx-unregistered-code");
      expect((await confirm("confirm")).status).toBe(200);
      const sent = await f.bindingSms(qr.requestId, phoneNumber);
      expect(sent.status).toBe(200);
      const firstCode = required(sentCodes.get(phoneNumber));
      await Bun.sleep(700);
      const resent = await f.bindingSms(qr.requestId, phoneNumber);
      expect(resent.status).toBe(200);
      const newCode = required(sentCodes.get(phoneNumber));
      expect(newCode).not.toBe(firstCode);
      const replaced = await f.bindingSms(qr.requestId, phoneNumber, firstCode);
      expect(await replaced.json()).toMatchObject({ code: ApiErrorCode.LoginFailed });
      await Bun.sleep(Math.max(0, qr.expiresAt - Date.now()) + 100);
      const scope = { requestId: qr.requestId, userId, phoneNumber, expiresAt: qr.expiresAt };
      expect(await mobileService.consumeWechatBindingCode(scope, newCode)).toBe(false);
      const expired = await f.bindingSms(qr.requestId, phoneNumber, newCode);
      expect(expired.status).toBe(400);
      expect(expired.headers.getSetCookie()).toEqual([]);
    },
    { continuationTtlSeconds: 3, cooldownMilliseconds: 650 },
  );
}, 10_000);

test("password binding accepts only the account's own password and completes an account with no mobile", async () => {
  await withBindingDatabase(async ({ pg, newBrowser, addAccount }) => {
    const f = await newBrowser();
    const userId = await addAccount({ id: 1001, username: "138550", subjectIdentifier: f.subjectIdentifier });
    const start = await f.begin({ ...f.desktop, "User-Agent": "Windows" });
    const { data: qr } = await start.json();
    const actualPassword = f.credential(accountPassword, undefined, qr.requestId);
    const early = await f.bindPassword(qr.requestId, actualPassword);
    expect(await early.json()).toMatchObject({ data: { decision: "restart" } });
    expect(early.headers.getSetCookie()).toEqual([]);
    const confirm = await authorizePhone(f, qr.mobileUrl, "wx-unregistered-code");
    expect((await confirm("confirm")).status).toBe(200);

    const ordinaryCredential = await f.bindPassword(qr.requestId, f.credential(accountPassword));
    expect(await ordinaryCredential.json()).toMatchObject({ code: ApiErrorCode.InvalidLoginCredential });
    const ordinaryAttempt = await f.app.request(`${internal}/auth/login/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: actualPassword }),
    });
    expect(await ordinaryAttempt.json()).toMatchObject({ code: ApiErrorCode.InvalidLoginCredential });
    const wrongBrowser = await f.bindPassword(qr.requestId, actualPassword, { ...f.desktop, Cookie: "" });
    expect(wrongBrowser.status).toBe(400);
    const wrongPassword = await f.bindPassword(qr.requestId, f.credential("magic-test", undefined, qr.requestId));
    expect(wrongPassword.status).toBe(400);
    expect(await wrongPassword.json()).toMatchObject({ code: ApiErrorCode.LoginFailed });
    expect(wrongPassword.headers.getSetCookie()).toEqual([]);
    expect(f.state.failures).toBe(1);
    expect(await f.readStatus(qr.requestId)).toMatchObject({ event: { status: "binding_required" } });
    f.state.restriction = true;
    const restricted = await f.bindPassword(qr.requestId, f.credential(accountPassword, undefined, qr.requestId));
    expect(await restricted.json()).toMatchObject({ code: ApiErrorCode.LoginFailed });
    expect(restricted.headers.getSetCookie()).toEqual([]);
    f.state.restriction = false;

    const bound = await f.bindPassword(qr.requestId, actualPassword);
    expect(await bound.json()).toMatchObject({ data: { decision: "continue" } });
    expect(requestCookie(bound)).toMatch(/^global_session=/u);
    const user = await pg.db.query.users.findFirst({ where: { id: userId } });
    expect(user).toMatchObject({ wxId: "wx-unregistered", mobile: null });
    const rows = await pg.db.select().from(auditLogs);
    expect(rows.filter((entry) => entry.action === "self.wecom.bind")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outcome: "failure",
          actorType: "anonymous",
          actorUserId: null,
          targetId: userId,
          details: expect.objectContaining({ verificationMethod: "password", reason: "invalid_password" }),
        }),
        expect.objectContaining({
          outcome: "success",
          actorType: "user",
          actorUserId: userId,
          targetId: userId,
          details: expect.objectContaining({ verificationMethod: "password" }),
        }),
      ]),
    );
    expect(rows.filter((entry) => entry.action === "auth.login.wechat")).toEqual([
      expect.objectContaining({
        outcome: "success",
        targetId: userId,
        details: expect.objectContaining({ source: "cross_device" }),
      }),
    ]);
    const outbox = await pg.db.select().from(userDocumentOutboxEntries);
    expect(outbox).toHaveLength(1);
  });
});

test("different QR requests cannot claim the same WeCom member for two accounts", async () => {
  await withBindingDatabase(async ({ pg, newBrowser, addAccount }) => {
    const first = await newBrowser();
    const second = await newBrowser();
    const accounts = [
      { id: 1001, username: "wecom-first", subjectIdentifier: first.subjectIdentifier },
      { id: 1002, username: "wecom-second", subjectIdentifier: second.subjectIdentifier },
    ];
    for (const account of accounts) await addAccount(account);
    const [firstRequest, secondRequest] = await Promise.all([startBinding(first), startBinding(second)]);
    const results = await Promise.all([
      first.bindPassword(firstRequest, first.credential(accountPassword, accounts[0]?.username, firstRequest)),
      second.bindPassword(secondRequest, second.credential(accountPassword, accounts[1]?.username, secondRequest)),
    ]);
    const responses = await Promise.all(results.map((result) => result.json()));
    expect(results.map((result) => result.status).sort()).toEqual([200, 400]);
    const winner = accounts[results.findIndex((result) => result.ok)];
    const loser = accounts[results.findIndex((result) => !result.ok)];
    expect(responses.find((response) => response.code === ApiErrorCode.LoginFailed)?.message).toBe(
      "企业微信绑定冲突，请联系管理员",
    );
    const bound = await pg.db.select().from(users).where(eq(users.wxId, "wx-unregistered"));
    expect(bound).toEqual([expect.objectContaining({ id: winner?.id })]);
    const bindingAudits = await pg.db.select().from(auditLogs).where(eq(auditLogs.action, "self.wecom.bind"));
    expect(bindingAudits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ outcome: "success", actorUserId: winner?.id, targetId: winner?.id }),
        expect.objectContaining({ outcome: "failure", actorUserId: loser?.id, targetId: loser?.id }),
      ]),
    );
    expect(bindingAudits).toHaveLength(2);
    expect(await pg.db.select().from(userDocumentOutboxEntries)).toHaveLength(1);
  });
});

test("concurrent bindings cannot overwrite a user's WeCom identity", async () => {
  await withBindingDatabase(async ({ pg, newBrowser, addAccount }) => {
    const first = await newBrowser();
    const second = await newBrowser();
    await addAccount({ id: 1001, username: "138550", subjectIdentifier: first.subjectIdentifier });
    const [firstRequest, secondRequest] = await Promise.all([
      startBinding(first),
      startBinding(second, "wx-unregistered-other-code"),
    ]);
    const results = await Promise.all([
      first.bindPassword(firstRequest, first.credential(accountPassword, undefined, firstRequest)),
      second.bindPassword(secondRequest, second.credential(accountPassword, undefined, secondRequest)),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 400]);
    const rejected = results.find((result) => !result.ok);
    expect(await rejected?.json()).toMatchObject({
      code: ApiErrorCode.LoginFailed,
      message: "企业微信绑定冲突，请联系管理员",
    });
    const user = await pg.db.query.users.findFirst({ where: { id: 1001 } });
    expect(user?.wxId).toBe(results[0]?.ok ? "wx-unregistered" : "wx-unregistered-other");
    expect(await pg.db.select().from(userDocumentOutboxEntries)).toHaveLength(1);
  });
});

test("a disabled account occupying the confirmed identity blocks a new password binding", async () => {
  await withBindingDatabase(async ({ pg, newBrowser, addAccount }) => {
    const f = await newBrowser();
    await addAccount({ id: 1001, username: "138550", subjectIdentifier: f.subjectIdentifier });
    const requestId = await startBinding(f);
    const disabled = await addAccount({
      username: "disabled-holder",
      wxId: "wx-unregistered",
      status: UserStatus.Disable,
    });
    const response = await f.bindPassword(requestId, f.credential(accountPassword, undefined, requestId));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: ApiErrorCode.LoginFailed,
      message: "企业微信绑定冲突，请联系管理员",
    });
    expect(response.headers.getSetCookie()).toEqual([]);
    const bound = await pg.db.select().from(users).where(eq(users.wxId, "wx-unregistered"));
    expect(bound).toEqual([expect.objectContaining({ id: disabled })]);
    expect(await pg.db.select().from(userDocumentOutboxEntries)).toEqual([]);
  });
});

test("an in-progress submit keeps one owner and one user on the confirmed QR", async () => {
  await withBindingDatabase(async ({ pg, newBrowser, addAccount }) => {
    const committed = Promise.withResolvers<void>();
    const publish = Promise.withResolvers<void>();
    const f = await newBrowser(async () => {
      committed.resolve();
      await publish.promise;
    });
    await addAccount({ id: 1001, username: "138550", subjectIdentifier: f.subjectIdentifier });
    const other = await addAccount({ id: 1002, username: "another-account" });
    const requestId = await startBinding(f);
    const binding = f.bindPassword(requestId, f.credential(accountPassword, undefined, requestId));
    try {
      await Promise.race([committed.promise, binding]);
      const parallel = await f.bindPassword(requestId, f.credential(accountPassword, "another-account", requestId));
      expect(await parallel.json()).toMatchObject({ data: { decision: "pending" } });
      expect(parallel.headers.getSetCookie()).toEqual([]);
      publish.resolve();
      const result = await binding;
      expect(await result.json()).toMatchObject({ data: { decision: "continue" } });
      expect(requestCookie(result)).toMatch(/^global_session=/u);
      const unbound = await pg.db.query.users.findFirst({ where: { id: other } });
      expect(unbound?.wxId).toBeNull();
      const audits = await pg.db.select().from(auditLogs).where(eq(auditLogs.action, "self.wecom.bind"));
      expect(audits).toEqual([expect.objectContaining({ outcome: "success", targetId: 1001 })]);
    } finally {
      publish.resolve();
      await Promise.allSettled([binding]);
    }
  });
});

test("changing the QR after PostgreSQL commits leaves the binding, audit and outbox intact", async () => {
  await withBindingDatabase(async ({ pg, newBrowser, addAccount }) => {
    const committed = Promise.withResolvers<void>();
    const publish = Promise.withResolvers<void>();
    const f = await newBrowser(async () => {
      committed.resolve();
      await publish.promise;
    });
    await addAccount({ id: 1001, username: "138550", subjectIdentifier: f.subjectIdentifier });
    const requestId = await startBinding(f);
    const binding = f.bindPassword(requestId, f.credential(accountPassword, undefined, requestId));
    try {
      await Promise.race([committed.promise, binding]);
      const start = await f.begin({ ...f.desktop, "User-Agent": "Windows" });
      const { data: next } = await start.json();
      expect(next.requestId).not.toBe(requestId);

      publish.resolve();
      const result = await binding;
      expect(await result.json()).toMatchObject({ data: { decision: "restart" } });
      expect(result.headers.getSetCookie()).toEqual([]);
      const audit = await pg.db.select().from(auditLogs);
      expect(audit).toEqual([
        expect.objectContaining({ action: "self.wecom.bind", outcome: "success", targetId: 1001 }),
      ]);
      expect(await pg.db.select().from(userDocumentOutboxEntries)).toHaveLength(1);
      const confirm = await authorizePhone(f, next.mobileUrl, "wx-unregistered-code");
      expect((await confirm("confirm")).status).toBe(200);
      expect(await f.readStatus(next.requestId)).toMatchObject({ event: { status: "confirmed" } });
      const completed = await f.complete(next.requestId);
      expect(await completed.json()).toMatchObject({ data: { decision: "continue" } });
      expect(requestCookie(completed)).toMatch(/^global_session=/u);
    } finally {
      publish.resolve();
      await Promise.allSettled([binding]);
    }
  });
});

test("the original continuation deadline invalidates an authorized phone without extending the QR", async () => {
  const f = await setup(2);
  try {
    const browserTime = Date.now();
    const start = await f.begin({ ...f.desktop, "User-Agent": "Windows" });
    const { data: qr } = await start.json();
    expect(qr.expiresAt).toBeLessThanOrEqual(browserTime + 2_100);
    const confirm = await authorizePhone(f, qr.mobileUrl);
    await Bun.sleep(Math.max(0, qr.expiresAt - Date.now()) + 50);
    const mobile = await confirm("confirm");
    expect(mobile.status).toBe(400);
    const desktop = await f.readStatus(qr.requestId);
    expect(desktop.status).toBe(400);
    const expired = await f.complete(qr.requestId);
    expect(expired.status).toBe(400);
    expect(expired.headers.getSetCookie()).toEqual([]);
  } finally {
    await f.close();
  }
});

test("a disabled account retains its registered WeCom identity during confirmation", async () => {
  const pg = await createApiPostgresTestHarness();
  try {
    await pg.db.insert(users).values({
      username: "wecom-disabled",
      name: "Disabled WeCom Member",
      status: UserStatus.Disable,
      wxId: "wx-test",
    });
    const f = await setup(60, createUserRepository(pg.db).findRegisteredWechatMember);
    try {
      const start = await f.begin({ ...f.desktop, "User-Agent": "Windows" });
      const { data: qr } = await start.json();
      const confirm = await authorizePhone(f, qr.mobileUrl);
      const accepted = await confirm("confirm");
      expect(accepted.status).toBe(200);
      expect(requestCookie(accepted)).not.toContain("global_session");
      const desktop = await f.readStatus(qr.requestId);
      expect(desktop).toEqual({ status: 200, event: { status: "confirmed" } });
    } finally {
      await f.close();
    }
  } finally {
    await pg.close();
  }
});
