import { afterEach, expect, spyOn, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { createAuthApiApp } from "@auth-api/app";
import { createAuthApiComposition } from "@auth-api/composition";
import { createApiPasswordHasher } from "@auth-api/composition/runtime/password-hasher";
import { getWechatLoginLogPath } from "@auth-api/routes/sso/wechat-login-log-path";
import createApp from "@iam/api-core/core/create-app";
import { createClientSnapshots } from "@iam/client-snapshot/composition";
import {
  ApiErrorCode,
  ClientSsoCallbackType,
  ClientSsoProtocol,
  ClientStatus,
  createLoginCredential,
  OidcClientType,
  OidcScope,
  SubjectClaim,
  UserStatus,
  WechatQrStartResponseSchema,
} from "@iam/contracts";
import { createSsoRedirectUrlValidator, createUnifiedCustomSsoAuthorization } from "@iam/custom-sso";
import { createClientSnapshotRepository } from "@iam/db/client-snapshot";
import {
  auditLogs,
  clients as clientTable,
  userDocumentOutboxEntries,
  users,
  userWechatExternalBindings,
} from "@iam/db/schema";
import { createOidcAuthorization, OidcProtocolError } from "@iam/oidc";
import { createUnifiedSessionKernel } from "@iam/session-kernel";
import {
  createSubjectAccessBarrier,
  createSubjectAccessOperations,
  requireSubjectAccessOperation,
  type SubjectAccessOperation,
} from "@iam/subject-access";
import { createRedisSubjectAccessStore, createSubjectAccessBootstrap } from "@iam/subject-access/redis";
import { createUnifiedSubjectAccessSessionRevocation } from "@iam/subject-access/session-kernel";
import { eq } from "drizzle-orm";
import Redis from "ioredis";
import pino from "pino";
import { sm2 } from "sm-crypto";
import appConfig from "~auth-api/app.config";
import { authTestEnv, externalOrigin, internalOrigin, qrCallback } from "../support/auth-env.fixture";
import {
  closeAuthApiRedisConnection,
  ownAuthApiTestExecutor,
  resetAuthApiRedisTestDatabase,
} from "../support/fixture-lifecycle";
import { useAuthApiPostgresTestHarness } from "../support/postgres-test-file.fixture";
import { publishUserDocument } from "../support/user-document.fixture";

const getDatabase = useAuthApiPostgresTestHarness();
const logger = pino({ enabled: false });
const redirectUri = "https://rp.example.test/callback";
const password = "WeCom-fixture-2026!";
const mobile = "17721462865";
afterEach(resetAuthApiRedisTestDatabase);

function cookie(response: Response, name: string) {
  const value = response.headers
    .getSetCookie()
    .find((entry) => entry.startsWith(`${name}=`))
    ?.split(";")[0];
  if (!value) throw new Error(`Expected cookie ${name}`);
  return value;
}

function required(value: string | null) {
  if (!value) throw new Error("Expected a redirect or state value");
  return value;
}

const wechatFetch: typeof fetch = Object.assign(
  async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input));
    if (url.pathname === "/cgi-bin/gettoken")
      return Response.json({ errcode: 0, access_token: "test-access-token", expires_in: 7200 });
    if (url.pathname === "/cgi-bin/auth/getuserinfo") {
      const code = required(url.searchParams.get("code"));
      if (code.startsWith("external-")) return Response.json({ errcode: 0, openid: code });
      return Response.json({ errcode: 0, userid: code.startsWith("member-") ? code : "qr-member" });
    }
    throw new Error("Unexpected WeCom API request");
  },
  { preconnect: fetch.preconnect },
);

async function createAuthWithWakeBarrier(
  options: Parameters<typeof createAuthApiApp>[0],
  suspendWake: () => Promise<void>,
) {
  const composition = await createAuthApiComposition(options);
  const queue = composition.userDocumentQueue;
  const addBulk = queue.addBulk.bind(queue);
  spyOn(queue, "addBulk").mockImplementation(async (jobs) => {
    await suspendWake();
    return await addBulk(jobs);
  });
  return {
    app: createApp(appConfig, {
      env: composition.env,
      logger: composition.logger,
      redactLogPath: getWechatLoginLogPath,
      routes: composition.routes,
      middlewares: {},
    }),
    close: composition.close,
  };
}

async function setup(
  protocol: "custom_sso" | "oidc",
  bindAccount: boolean,
  fixture: {
    origin?: string;
    suspendWake?: () => Promise<void>;
    continuationTtlSeconds?: number;
    environment?: NodeJS.ProcessEnv;
  } = {},
) {
  const { origin = internalOrigin, suspendWake, continuationTtlSeconds = 90, environment } = fixture;
  const pg = getDatabase();
  const keys = sm2.generateKeyPairHex();
  const env = authTestEnv(pg.databaseUrl, {
    IAM_AUTH_API_WECHAT_QR_AGENT_ID: "1000001",
    IAM_AUTH_API_WECHAT_QR_CALLBACK_URL: qrCallback,
    IAM_AUTH_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON: JSON.stringify({ fixture: keys.privateKey }),
    ...environment,
  });
  const redis = new Redis(env.redis);
  ownAuthApiTestExecutor(() => closeAuthApiRedisConnection(redis));
  const messages: string[] = [];
  const options = {
    env,
    logger,
    integrationFetch: {
      wechat: wechatFetch,
      sms: Object.assign(
        async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
          messages.push(JSON.parse(String(init?.body)).message);
          return Response.json({ resultCode: "0000", resultInfo: "ok", result: "" });
        },
        { preconnect: fetch.preconnect },
      ),
    },
  };
  const auth = suspendWake ? await createAuthWithWakeBarrier(options, suspendWake) : await createAuthApiApp(options);
  ownAuthApiTestExecutor(auth.close);
  const subjectIdentifier = randomUUID();
  const [user] = await pg.db
    .insert(users)
    .values({
      username: "test-qr-user",
      name: "QR User",
      subjectIdentifier,
      status: UserStatus.Enable,
      mobile,
      wxId: bindAccount ? null : "qr-member",
      password: await createApiPasswordHasher(4).hashPassword(password),
    })
    .returning({ id: users.id });
  if (!user) throw new Error("Expected fixture account");
  await publishUserDocument(pg.db, user.id);
  await createSubjectAccessBootstrap({ redis, random: { uuid: randomUUID } }).seedMany(
    [{ subjectIdentifier, state: "enabled" }],
    new Date(),
  );
  const clientCode = "qr-client";
  await pg.db.insert(clientTable).values({
    clientCode,
    clientName: "QR Application",
    clientSecret: "fixture",
    extAttributes: {},
    status: ClientStatus.Enable,
    ssoEnabled: true,
    ssoConfig:
      protocol === "oidc"
        ? {
            protocol: ClientSsoProtocol.Oidc,
            clientType: OidcClientType.Public,
            redirectUris: [redirectUri],
            postLogoutRedirectUris: [],
            allowedScopes: [OidcScope.OpenId],
          }
        : {
            protocol: ClientSsoProtocol.CustomSso,
            callbackType: ClientSsoCallbackType.Business,
            callbackEndpoint: redirectUri,
            validRedirectUrls: [redirectUri],
            subjectClaims: [SubjectClaim.SubjectIdentifier],
          },
  });
  const barrier = createSubjectAccessBarrier({
    clock: { nowDate: () => new Date() },
    random: { uuid: randomUUID },
    store: createRedisSubjectAccessStore({ redis }),
  });
  const kernel = createUnifiedSessionKernel<SubjectAccessOperation>({
    redis,
    ...env.sessionKernel,
    assertOperationActive: requireSubjectAccessOperation,
  });
  const operations = createSubjectAccessOperations({
    barrier,
    revocation: createUnifiedSubjectAccessSessionRevocation(kernel, {
      run: (callback) => operations.run(callback),
    }),
  });
  const clients = createClientSnapshots({ redis, source: createClientSnapshotRepository(pg.db) }).client;
  const protocolOptions = {
    kernel,
    clients,
    redis,
    codeTtlSeconds: 60,
    continuationTtlSeconds,
    admission: { evaluate: async () => "match" as const },
  };
  const issuer = `${origin}/oidc`;
  const state = "client-state";
  if (protocol === "oidc") {
    const oidc = createOidcAuthorization({ ...protocolOptions, namespace: env.oidc.namespace });
    const parameters = new URLSearchParams({
      client_id: clientCode,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid",
      code_challenge: createHash("sha256").update("qr-fixture").digest("base64url"),
      code_challenge_method: "S256",
      state,
      prompt: "login",
    });
    const initial = await operations.run((operation) => oidc.forOperation(operation, issuer).authorize(parameters, {}));
    if (initial.kind !== "login") throw new Error("Expected an OIDC continuation");
    return {
      auth,
      userId: user.id,
      keys,
      protocol,
      messages,
      browserCookie: `oidc_interaction_binding=${initial.browserBinding}`,
      query: new URLSearchParams({ protocol, oidcReturn: initial.handle }),
      resume: (token: string) =>
        operations.run((operation) =>
          oidc.forOperation(operation, issuer).resume(initial.handle, {
            browserBinding: initial.browserBinding,
            globalSessionToken: token,
          }),
        ),
    };
  }
  const custom = createUnifiedCustomSsoAuthorization({
    ...protocolOptions,
    namespace: env.sessionKernel.namespace,
    redirectUrls: createSsoRedirectUrlValidator({ logger }),
  });
  async function newCustomBrowser() {
    const initial = await operations.run((operation) =>
      custom.forOperation(operation).authorize({ clientCode, redirectUrl: redirectUri, state }),
    );
    if (initial.kind !== "login") throw new Error("Expected a Custom SSO continuation");
    return {
      browserCookie: `custom_sso_continuation=${initial.browserBinding}`,
      query: new URLSearchParams({
        protocol,
        client: clientCode,
        redirectUrl: redirectUri,
        state,
        ssoReturn: initial.continuation,
      }),
      resume: (token: string) =>
        operations.run((operation) =>
          custom.forOperation(operation).authorize({
            clientCode,
            redirectUrl: redirectUri,
            state,
            continuation: initial.continuation,
            browserBinding: initial.browserBinding,
            globalSessionToken: token,
          }),
        ),
    };
  }
  return {
    auth,
    userId: user.id,
    keys,
    protocol,
    messages,
    ...(await newCustomBrowser()),
    newCustomBrowser,
    redis,
  };
}

type Fixture = Awaited<ReturnType<typeof setup>>;

function desktop(f: Fixture, suffix: string, init: RequestInit = {}) {
  const headers = new Headers({ Cookie: f.browserCookie, "X-IAM-Entry-Network": "internal" });
  for (const [name, value] of new Headers(init.headers)) headers.set(name, value);
  return f.auth.app.request(`${internalOrigin}/auth/wechat-qr${suffix}?${f.query}`, { ...init, headers });
}

async function confirmOnPhone(f: Fixture, mobileUrl: string, code = "fixture-oauth-code") {
  const headers = { "X-IAM-Entry-Network": "external" };
  const mobile = await f.auth.app.request(mobileUrl, { headers });
  expect(mobile.status).toBe(302);
  const provider = new URL(required(mobile.headers.get("Location")));
  const state = required(provider.searchParams.get("state"));
  const callback = new URL(required(provider.searchParams.get("redirect_uri")));
  expect(callback.href).toBe(qrCallback);
  callback.search = new URLSearchParams({ state, code }).toString();
  const authorized = await f.auth.app.request(callback, {
    headers: { ...headers, Cookie: cookie(mobile, `__Host-wecom_oauth_${state}`) },
  });
  expect(authorized.status).toBe(303);
  const confirm = new URL(required(authorized.headers.get("Location")), externalOrigin);
  const flow = confirm.pathname.split("/").at(-1);
  if (!flow) throw new Error("Expected mobile confirmation flow");
  const proof = cookie(authorized, `__Host-wecom_confirm_${flow}`);
  const page = await f.auth.app.request(confirm, { headers: { ...headers, Cookie: proof } });
  expect(page.status).toBe(200);
  expect(await page.text()).toContain("QR Application");
  const confirmed = await f.auth.app.request(`${externalOrigin}/sso/wechat-qr/mobile/decision`, {
    method: "POST",
    headers: { ...headers, Cookie: proof, "Content-Type": "application/x-www-form-urlencoded", Origin: externalOrigin },
    body: new URLSearchParams({ flow, action: "confirm" }),
  });
  expect(confirmed.status).toBe(200);
  expect(confirmed.headers.getSetCookie().some((entry) => entry.startsWith("global_session="))).toBe(false);
  await confirmed.body?.cancel();
}

async function startQr(f: Fixture) {
  const started = await desktop(f, "", { method: "POST" });
  expect(started.status).toBe(200);
  const { data: qr } = WechatQrStartResponseSchema.parse(await started.json());
  if (qr.decision !== "scan") throw new Error("Expected a QR request");
  return qr;
}

function bindPassword(f: Fixture, requestId: string, username = "test-qr-user") {
  const credential = createLoginCredential({
    username,
    password,
    kid: "fixture",
    publicKey: f.keys.publicKey,
    now: Date.now(),
    nonce: randomUUID(),
    wechatQrRequestId: requestId,
  });
  return desktop(f, `/${requestId}/bind/password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });
}

function bindSms(f: Fixture, requestId: string, code?: string) {
  return desktop(f, `/${requestId}/bind/sms${code === undefined ? "/send" : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber: mobile, code }),
  });
}

test("five invalid WeCom binding codes restrict SMS send and verification for the account", async () => {
  const f = await setup("custom_sso", true, { environment: { IAM_AUTH_API_IMAGE_CAPTCHA_ENABLED: "false" } });
  const qr = await startQr(f);
  await confirmOnPhone(f, qr.mobileUrl);
  const sent = await bindSms(f, qr.requestId);
  expect(await sent.json()).toMatchObject({ data: { decision: "sent" } });
  const code = required(f.messages[0]?.match(/\d{4}/u)?.[0] ?? null);

  for (let attempt = 0; attempt < 5; attempt++) {
    const rejected = await bindSms(f, qr.requestId, "0000");
    expect(rejected.status).toBe(400);
    expect(rejected.headers.getSetCookie()).toEqual([]);
    expect(await rejected.json()).toMatchObject({ code: ApiErrorCode.LoginFailed });
  }
  for (const input of [undefined, code]) {
    const restricted = await bindSms(f, qr.requestId, input);
    expect(restricted.status).toBe(400);
    expect(restricted.headers.getSetCookie()).toEqual([]);
    expect(await restricted.json()).toMatchObject({
      code: ApiErrorCode.LoginFailed,
      message: expect.stringContaining("账号已被临时限制"),
    });
  }
  expect(f.messages).toHaveLength(1);
});

test("resending a WeCom binding code preserves the original QR expiry", async () => {
  const f = await setup("custom_sso", true, { continuationTtlSeconds: 4 });
  if (f.protocol !== "custom_sso") throw new Error("Expected a Custom SSO fixture");
  const qr = await startQr(f);
  await confirmOnPhone(f, qr.mobileUrl);
  const sent = await bindSms(f, qr.requestId);
  expect(await sent.json()).toMatchObject({ data: { decision: "sent" } });
  const cooldown = await bindSms(f, qr.requestId);
  expect(cooldown.status).toBe(429);
  expect(Number(cooldown.headers.get("Retry-After"))).toBeGreaterThan(0);
  // Advance only the test phone's cooldown so the original QR stays close to expiry.
  await f.redis.pexpire(`mobile-code-cooldown:${mobile}`, 1);
  await Bun.sleep(25);
  const resent = await bindSms(f, qr.requestId);
  expect(await resent.json()).toMatchObject({ data: { decision: "sent" } });
  expect(f.messages).toHaveLength(2);
  const code = required(f.messages[1]?.match(/\d{4}/u)?.[0] ?? null);
  const codeKey = `wechat-binding-code:${qr.requestId}:${f.userId}:${mobile}`;
  const storedCode = await f.redis.get(codeKey);
  expect(storedCode).toBe(code);
  const storedDeadline = await f.redis.pexpiretime(codeKey);
  expect(storedDeadline).toBeGreaterThan(Date.now());
  expect(storedDeadline).toBeLessThanOrEqual(qr.expiresAt);

  await Bun.sleep(Math.max(0, qr.expiresAt - Date.now()) + 100);
  const expired = await bindSms(f, qr.requestId, code);
  expect(expired.status).toBe(400);
  expect(expired.headers.getSetCookie()).toEqual([]);
  const remaining = await f.redis.exists(codeKey);
  expect(remaining).toBe(0);
}, 15_000);

for (const protocol of ["custom_sso", "oidc"] as const) {
  for (const method of ["linked", "password", "sms"] as const) {
    test(`${protocol} resumes the original browser after WeCom confirmation (${method})`, async () => {
      const bindAccount = method !== "linked";
      const f = await setup(protocol, bindAccount);
      const missingBinding = await desktop(f, "", { method: "POST", headers: { Cookie: "" } });
      expect(missingBinding.status).toBe(400);
      const external = await desktop(f, "", { method: "POST", headers: { "X-IAM-Entry-Network": "external" } });
      expect(external.status).toBe(404);
      const qr = await startQr(f);
      const events = await desktop(f, `/${qr.requestId}/events`);
      expect(events.headers.get("Content-Type")).toStartWith("text/event-stream");
      const reader = events.body!.getReader();
      try {
        const firstEvent = await reader.read();
        expect(new TextDecoder().decode(firstEvent.value)).toContain('"status":"waiting"');
      } finally {
        await reader.cancel();
      }
      await confirmOnPhone(f, qr.mobileUrl);
      const status = await desktop(f, `/${qr.requestId}/status`);
      expect(await status.json()).toMatchObject({ data: { status: bindAccount ? "binding_required" : "confirmed" } });

      const completePath = `/${qr.requestId}/complete`;
      let completed: Response;
      if (method === "password") {
        completed = await bindPassword(f, qr.requestId);
      } else if (method === "sms") {
        const send = await desktop(f, `/${qr.requestId}/bind/sms/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phoneNumber: mobile }),
        });
        expect(await send.json()).toMatchObject({ data: { decision: "sent" } });
        const code = f.messages[0]?.match(/\d{4}/u)?.[0];
        if (!code) throw new Error("Expected a WeCom binding code");
        completed = await desktop(f, `/${qr.requestId}/bind/sms`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phoneNumber: mobile, code }),
        });
      } else {
        const attempts = await Promise.all([
          desktop(f, completePath, { method: "POST" }),
          desktop(f, completePath, { method: "POST" }),
        ]);
        const delivered = attempts.filter((attempt) => attempt.headers.has("Set-Cookie"));
        expect(delivered).toHaveLength(1);
        completed = delivered[0]!;
        const duplicate = attempts.find((attempt) => attempt !== completed)!;
        expect(await duplicate.json()).toMatchObject({ data: { decision: "restart" } });
      }
      expect(completed.status).toBe(200);
      expect(await completed.json()).toMatchObject({ data: { decision: "continue" } });
      const root = cookie(completed, "global_session").slice("global_session=".length);
      const replayed = await desktop(f, completePath, { method: "POST" });
      expect(await replayed.json()).toMatchObject({ data: { decision: "restart" } });
      expect(replayed.headers.getSetCookie()).toEqual([]);
      if (protocol === "oidc" && method === "linked") {
        const passwordResponse = await f.auth.app.request("/auth/login/password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            credential: createLoginCredential({
              username: "test-qr-user",
              password,
              kid: "fixture",
              publicKey: f.keys.publicKey,
              now: Date.now(),
              nonce: randomUUID(),
            }),
          }),
        });
        expect(passwordResponse.status).toBe(200);
        const otherRoot = cookie(passwordResponse, "global_session").slice("global_session=".length);
        expect(otherRoot).not.toBe(root);
        const wrongRoot = await f.resume(otherRoot);
        expect(wrongRoot).toMatchObject({ kind: "response", response: { parameters: { error: "login_required" } } });
      }
      const result = await f.resume(root);
      expect(result).toMatchObject(
        protocol === "oidc"
          ? {
              kind: "response",
              response: { redirectUri, parameters: { state: "client-state", code: expect.any(String) } },
            }
          : { kind: "granted", redirectUrl: redirectUri, state: "client-state", code: expect.any(String) },
      );
      if (protocol === "oidc") {
        const failure = await f.resume(root).catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(OidcProtocolError);
        expect(failure).toMatchObject({ errorCode: "invalid_request" });
      }
      if (bindAccount) {
        const bound = await getDatabase().db.query.users.findFirst({ where: { id: f.userId } });
        expect(bound?.wxId).toBe("qr-member");
      }
    });
  }
}

test("only one account can bind the same external WeCom identity across concurrent QR requests", async () => {
  const first = await setup("custom_sso", true);
  if (first.protocol !== "custom_sso") throw new Error("Expected a Custom SSO fixture");
  const second = { ...first, ...(await first.newCustomBrowser()) };
  const { db } = getDatabase();
  const subjectIdentifier = randomUUID();
  const [account] = await db
    .insert(users)
    .values({
      username: "second-qr-user",
      name: "Second QR User",
      subjectIdentifier,
      password: await createApiPasswordHasher(4).hashPassword(password),
    })
    .returning({ id: users.id });
  if (!account) throw new Error("Expected second fixture account");
  await publishUserDocument(db, account.id);
  await createSubjectAccessBootstrap({ redis: first.redis, random: { uuid: randomUUID } }).seedMany(
    [{ subjectIdentifier, state: "enabled" }],
    new Date(),
  );
  const [firstQr, secondQr] = await Promise.all([startQr(first), startQr(second)]);
  const openId = "external-same-identity";
  await Promise.all([
    confirmOnPhone(first, firstQr.mobileUrl, openId),
    confirmOnPhone(second, secondQr.mobileUrl, openId),
  ]);
  const responses = await Promise.all([
    bindPassword(first, firstQr.requestId),
    bindPassword(second, secondQr.requestId, "second-qr-user"),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
  const winner = responses.findIndex((response) => response.ok);
  const success = responses[winner];
  const denied = responses.find((response) => !response.ok);
  if (!success || !denied) throw new Error("Expected one accepted and one rejected binding");
  expect(await success.json()).toMatchObject({ data: { decision: "continue" } });
  expect(cookie(success, "global_session")).toStartWith("global_session=");
  expect(await denied.json()).toMatchObject({
    code: ApiErrorCode.LoginFailed,
    message: "企业微信绑定冲突，请联系管理员",
  });
  expect(denied.headers.getSetCookie()).toEqual([]);
  const bindings = await db.select().from(userWechatExternalBindings);
  expect(bindings).toMatchObject([{ openId, userId: winner === 0 ? first.userId : account.id, revokedAt: null }]);
});

test("replacing a QR after commit preserves the binding, audit and User Document Outbox", async () => {
  const committed = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const f = await setup("custom_sso", true, {
    async suspendWake() {
      committed.resolve();
      await release.promise;
    },
  });
  const original = await startQr(f);
  await confirmOnPhone(f, original.mobileUrl);
  const binding = bindPassword(f, original.requestId);
  try {
    const milestone = await Promise.race([committed.promise, binding]);
    expect(milestone).toBeUndefined();
    const { db } = getDatabase();
    const next = await startQr(f);
    expect(next.requestId).not.toBe(original.requestId);
    release.resolve();
    const result = await binding;
    expect(await result.json()).toMatchObject({ data: { decision: "restart" } });
    expect(result.headers.getSetCookie()).toEqual([]);

    const bound = await db.query.users.findFirst({ where: { id: f.userId } });
    const audit = await db.select().from(auditLogs).where(eq(auditLogs.action, "self.wecom.bind"));
    const entries = await db.select().from(userDocumentOutboxEntries);
    expect(bound?.wxId).toBe("qr-member");
    expect(audit).toMatchObject([{ outcome: "success", targetId: f.userId }]);
    expect(entries).toHaveLength(1);

    await confirmOnPhone(f, next.mobileUrl);
    const status = await desktop(f, `/${next.requestId}/status`);
    expect(await status.json()).toMatchObject({ data: { status: "confirmed" } });
    const completed = await desktop(f, `/${next.requestId}/complete`, { method: "POST" });
    expect(await completed.json()).toMatchObject({ data: { decision: "continue" } });
    expect(cookie(completed, "global_session")).toStartWith("global_session=");
  } finally {
    release.resolve();
    await Promise.allSettled([binding]);
  }
});

test("OIDC desktop start rejects a continuation from the external issuer with its original Cookie", async () => {
  const f = await setup("oidc", false, { origin: externalOrigin });
  const result = await desktop(f, "", { method: "POST" });
  expect(result.status).toBe(400);
  expect(result.headers.getSetCookie()).toEqual([]);
});

test("development OpenAPI includes canonical authentication and both WeCom route families", async () => {
  const f = await setup("oidc", false);
  const auth = await f.auth.app.request("/auth/doc");
  expect(auth.status).toBe(200);
  const authDocument = await auth.json();
  expect(authDocument.openapi).toBe("3.1.0");
  expect(authDocument.paths["/auth/wechat-qr"].post.parameters).toContainEqual(
    expect.objectContaining({
      in: "query",
      required: true,
      style: "form",
      explode: true,
      schema: { $ref: "#/components/schemas/WechatQrContinuation" },
    }),
  );
  expect(authDocument.components.schemas.WechatQrContinuation.oneOf).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        required: expect.arrayContaining(["protocol", "oidcReturn"]),
        properties: expect.objectContaining({ ssoReturn: expect.objectContaining({ not: {} }) }),
      }),
      expect.objectContaining({
        required: expect.arrayContaining(["protocol", "ssoReturn", "client", "redirectUrl"]),
        properties: expect.objectContaining({ oidcReturn: expect.objectContaining({ not: {} }) }),
      }),
    ]),
  );
  expect(authDocument.paths).toMatchObject({
    "/auth/login/password": { post: expect.any(Object) },
    "/auth/login/mobile": { post: expect.any(Object) },
    "/auth/captcha/cap/{siteKey}/challenge": { post: expect.any(Object) },
    "/auth/captcha/cap/{siteKey}/redeem": { post: expect.any(Object) },
    "/auth/captcha/image/challenge": { post: expect.any(Object) },
    "/auth/captcha/image/answer": { post: expect.any(Object) },
    "/auth/client/status": { get: expect.any(Object) },
    "/auth/recovery/users/{username}/masked-mobile": { get: expect.any(Object) },
    "/auth/recovery/password-reset": { post: expect.any(Object) },
    "/auth/sms/send": { post: expect.any(Object) },
    "/auth/sms/verify": { post: expect.any(Object) },
    "/auth/account/password": { post: expect.any(Object) },
    "/auth/account/mobile": { post: expect.any(Object) },
    "/auth/wechat-qr": { post: expect.any(Object) },
    "/auth/wechat-qr/{requestId}/status": { get: expect.any(Object) },
    "/auth/wechat-qr/{requestId}/events": { get: expect.any(Object) },
    "/auth/wechat-qr/{requestId}/complete": { post: expect.any(Object) },
    "/auth/wechat-qr/{requestId}/bind/password": { post: expect.any(Object) },
    "/auth/wechat-qr/{requestId}/bind/sms": { post: expect.any(Object) },
    "/auth/wechat-qr/{requestId}/bind/sms/send": { post: expect.any(Object) },
  });
  const sso = await f.auth.app.request("/sso/doc");
  expect(sso.status).toBe(200);
  expect((await sso.json()).paths).toMatchObject({
    "/sso/thirdparty/{clientCode}": { get: expect.any(Object) },
    "/sso/third-party/wx": { get: expect.any(Object) },
    "/sso/wechat-qr/mobile/{requestId}": { get: expect.any(Object) },
    "/sso/wechat-qr/mobile/callback": { get: expect.any(Object) },
    "/sso/wechat-qr/mobile/confirm/{flowId}": { get: expect.any(Object) },
    "/sso/wechat-qr/mobile/decision": { post: expect.any(Object) },
  });
});
