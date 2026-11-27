import { afterEach, expect, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createAuthApiApp } from "@auth-api/app";
import { createAuthApiComposition } from "@auth-api/composition";
import { createApiPasswordHasher } from "@auth-api/composition/runtime/password-hasher";
import createApp from "@iam/api-core/core/create-app";
import { customSsoLocalSessionCookieName } from "@iam/api-core/http/custom-sso-transport";
import { createClientSnapshots } from "@iam/client-snapshot/composition";
import { createClientSecretAuthenticator } from "@iam/client-snapshot/credentials";
import { createPermittedClientSubjectProjectionService } from "@iam/client-subject-projection";
import {
  ApiErrorCode,
  ClientSsoCallbackType,
  ClientSsoProtocol,
  createLoginCredential,
  SubjectClaim,
  UserStatus,
  UserType,
} from "@iam/contracts";
import {
  createSsoRedirectUrlValidator,
  createUnifiedCustomSsoAuthorization,
  createUnifiedCustomSsoOperations,
} from "@iam/custom-sso";
import { createClientSnapshotRepository } from "@iam/db/client-snapshot";
import { auditLogs, clients, userDocumentOutboxEntries, users } from "@iam/db/schema";
import { createSubjectFactsReader, createSubjectFactsRedisCache } from "@iam/documents/user";
import { createUnifiedSessionKernel } from "@iam/session-kernel";
import {
  createSubjectAccessBarrier,
  createSubjectAccessOperations,
  requireSubjectAccessOperation,
  type SubjectAccessOperation,
} from "@iam/subject-access";
import { createRedisSubjectAccessStore, createSubjectAccessBootstrap } from "@iam/subject-access/redis";
import { createUnifiedSubjectAccessSessionRevocation } from "@iam/subject-access/session-kernel";
import Redis from "ioredis";
import pino from "pino";
import { sm2, sm3 } from "sm-crypto";
import appConfig from "~auth-api/app.config";
import { authTestEnv, internalOrigin } from "../support/auth-env.fixture";
import {
  closeAuthApiRedisConnection,
  ownAuthApiTestExecutor,
  resetAuthApiRedisTestDatabase,
} from "../support/fixture-lifecycle";
import { useAuthApiPostgresTestHarness } from "../support/postgres-test-file.fixture";
import { publishUserDocument } from "../support/user-document.fixture";

const getDatabase = useAuthApiPostgresTestHarness();
const username = "auth-fixture-user";
const password = "Fixture1-old";
const newPassword = "Fixture2-new";
const mobile = "17721462865";
const redirect = "https://app.example.test/callback";
const logger = pino({ enabled: false });
const internalSecret = "internal-fixture";
afterEach(resetAuthApiRedisTestDatabase);

async function authWithSessionFault(
  options: Parameters<typeof createAuthApiApp>[0],
  fault: { action: "revoke" | "create"; after: boolean; armed: boolean },
) {
  const composition = await createAuthApiComposition(options);
  const { redis } = composition.runtime;
  const evalRedis = redis.eval;
  const prefix = `${composition.env.sessionKernel.namespace}:unified:v1:`;
  spyOn(redis, "eval").mockImplementation(async (script, keyCount, ...args) => {
    const run = (): Promise<unknown> => Reflect.apply(evalRedis, redis, [script, keyCount, ...args]);
    if (fault.armed && keyCount === 0 && args[0] === prefix && JSON.parse(String(args[1])).action === fault.action) {
      fault.armed = false;
      if (fault.after) await run();
      throw new Error("Injected Redis transport failure");
    }
    return await run();
  });
  return {
    app: createApp(appConfig, {
      env: composition.env,
      logger: composition.logger,
      routes: composition.routes,
      middlewares: {},
    }),
    close: composition.close,
  };
}

async function fixture(overrides: NodeJS.ProcessEnv = {}, fault?: Parameters<typeof authWithSessionFault>[1]) {
  const pg = getDatabase();
  const keys = sm2.generateKeyPairHex();
  const env = authTestEnv(pg.databaseUrl, {
    IAM_AUTH_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON: JSON.stringify({ fixture: keys.privateKey }),
    ...overrides,
  });
  const sms: { mobile: string; message: string }[] = [];
  const options: NonNullable<Parameters<typeof createAuthApiApp>[0]> = {
    env,
    logger,
    integrationFetch: {
      sms: Object.assign(
        async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
          sms.push(JSON.parse(String(init?.body)));
          return Response.json({ resultCode: "0000", resultInfo: "ok", result: "" });
        },
        { preconnect: fetch.preconnect },
      ),
      wechat: Object.assign(
        async (input: Parameters<typeof fetch>[0]) => {
          const url = new URL(String(input));
          if (url.pathname.endsWith("/gettoken"))
            return Response.json({ errcode: 0, access_token: "fixture-token", expires_in: 7200 });
          if (url.pathname.endsWith("/getuserinfo")) return Response.json({ errcode: 0, userid: "fixture-member" });
          throw new Error("Unexpected WeCom endpoint");
        },
        { preconnect: fetch.preconnect },
      ),
    },
  };
  const auth = fault ? await authWithSessionFault(options, fault) : await createAuthApiApp(options);
  ownAuthApiTestExecutor(auth.close);
  const redis = new Redis(env.redis);
  ownAuthApiTestExecutor(() => closeAuthApiRedisConnection(redis));
  const subjectIdentifier = randomUUID();
  const [user] = await pg.db
    .insert(users)
    .values({
      username,
      name: "Fixture User",
      subjectIdentifier,
      status: UserStatus.Enable,
      userType: UserType.Formal,
      password: await createApiPasswordHasher(4).hashPassword(password),
      mobile,
      wxId: "fixture-member",
    })
    .returning({ id: users.id });
  if (!user) throw new Error("Fixture account was not created");
  await publishUserDocument(pg.db, user.id);
  await createSubjectAccessBootstrap({ redis, random: { uuid: randomUUID } }).seedMany(
    [{ subjectIdentifier, state: "enabled" }],
    new Date(),
  );
  for (const clientCode of ["iam", "app", "other-app"]) {
    await pg.db.insert(clients).values({
      clientCode,
      clientName: clientCode,
      clientSecret: internalSecret,
      ssoEnabled: true,
      extAttributes: {},
      ssoConfig: {
        protocol: ClientSsoProtocol.CustomSso,
        callbackType: ClientSsoCallbackType.Managed,
        validRedirectUrls: [redirect],
        subjectClaims: [SubjectClaim.SubjectIdentifier],
      },
    });
  }
  const kernel = createUnifiedSessionKernel<SubjectAccessOperation>({
    redis,
    ...env.sessionKernel,
    assertOperationActive: requireSubjectAccessOperation,
  });
  const barrier = createSubjectAccessBarrier({
    store: createRedisSubjectAccessStore({ redis }),
    clock: { nowDate: () => new Date() },
    random: { uuid: randomUUID },
  });
  const operations: ReturnType<typeof createSubjectAccessOperations> = createSubjectAccessOperations({
    barrier,
    revocation: createUnifiedSubjectAccessSessionRevocation(kernel, { run: (callback) => operations.run(callback) }),
  });
  const resolveRoot = (token: string) =>
    operations.run((operation) => kernel.forOperation(operation).resolveUserSession(token));
  const listRoots = () =>
    operations.run((operation) =>
      kernel.forOperation(operation).listSessions({ kind: "userSession", offset: 0, limit: 10 }),
    );

  function post(path: string, body: object, headers: Record<string, string> = {}) {
    return auth.app.request(`${internalOrigin}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  }

  function passwordLogin(input = password) {
    const credential = createLoginCredential({
      username,
      password: input,
      kid: "fixture",
      publicKey: keys.publicKey,
      now: Date.now(),
      nonce: randomUUID(),
    });
    return post("/auth/login/password", { credential });
  }

  async function issueLocalSession(root: string) {
    const snapshots = createClientSnapshots({ redis, source: createClientSnapshotRepository(pg.db) });
    const shared = { redis, namespace: env.sessionKernel.namespace, kernel, clients: snapshots.client };
    const authorization = createUnifiedCustomSsoAuthorization({
      ...shared,
      codeTtlSeconds: 60,
      continuationTtlSeconds: 60,
      redirectUrls: createSsoRedirectUrlValidator({ logger }),
      admission: { evaluate: async () => "match" as const },
    });
    const projection = createPermittedClientSubjectProjectionService<SubjectAccessOperation>({
      subjectFacts: createSubjectFactsReader({ db: pg.db, cache: createSubjectFactsRedisCache(redis) }),
      assertPermission: (operation, subject) => operation.requirePermission(subject),
    });
    const custom = createUnifiedCustomSsoOperations({
      ...shared,
      projection,
      tokenTtlSeconds: 60,
      credentials: createClientSecretAuthenticator(snapshots.credential),
      managed: { logger, audit: { recordAuditLog: async () => {} } },
    });
    const granted = await operations.run((operation) =>
      authorization.forOperation(operation).authorize({
        clientCode: "app",
        redirectUrl: redirect,
        globalSessionToken: root,
      }),
    );
    if (granted.kind !== "granted") throw new Error("Expected managed authorization");
    return await operations.run((operation) =>
      custom.forOperation(operation).completeCallback({
        clientCode: "app",
        code: granted.code,
        redirectUrl: redirect,
      }),
    );
  }

  return {
    auth,
    pg,
    redis,
    userId: user.id,
    subjectIdentifier,
    post,
    passwordLogin,
    sms,
    resolveRoot,
    listRoots,
    issueLocalSession,
  };
}

function oaPath(loginId: string) {
  const ts = String(Date.now());
  const token = Buffer.from(sm3(`${loginId}|${ts}|${internalSecret}${internalSecret}`), "hex").toBase64();
  const query = new URLSearchParams({
    client: "iam",
    redirectUrl: redirect,
    state: "state",
    loginid: loginId,
    ts,
    token,
  });
  return `${internalOrigin}/sso/thirdparty/iam?${query}`;
}

async function loginToken(response: Response) {
  expect(response.status).toBe(200);
  const { data } = await response.json();
  expect(response.headers.getSetCookie()[0]).toContain(`global_session=${data.token};`);
  return String(data.token);
}

test("account password changes work with a root Cookie and keep that session usable", async () => {
  const f = await fixture();
  const root = await loginToken(await f.passwordLogin());
  const changed = await f.post(
    "/auth/account/password",
    { oldPassword: password, newPassword },
    {
      Client: "iam",
      Cookie: `global_session=${root}`,
      Authorization: "ignored-because-cookie-wins",
    },
  );
  expect(changed.status).toBe(200);
  expect(await changed.json()).toMatchObject({ data: true });
  const session = await f.resolveRoot(root);
  expect(session.status).toBe("resolved");
  const oldLogin = await f.passwordLogin();
  expect(oldLogin.status).toBe(400);
  await loginToken(await f.passwordLogin(newPassword));
  const audits = await f.pg.db.select().from(auditLogs);
  expect(audits.some((audit) => audit.action === "self.password.change" && audit.sourceApp === "auth-api")).toBe(true);
});

test("account mobile accepts Local Session authentication and spends the SMS proof once", async () => {
  const f = await fixture();
  const root = await loginToken(await f.passwordLogin());
  const local = await f.issueLocalSession(root);
  const number = "17721462866";
  const sent = await f.post("/auth/sms/send", { usage: "bindPhone", phoneNumber: number });
  expect(sent.status).toBe(200);
  const code = f.sms[0]?.message.match(/\d{4}/u)?.[0];
  if (!code) throw new Error("Expected a code in the SMS provider request");
  const wrongClient = await f.post(
    "/auth/account/mobile",
    { phoneNumber: number, code },
    {
      Client: "other-app",
      Cookie: `${customSsoLocalSessionCookieName("other-app")}=${local.token}`,
    },
  );
  expect(wrongClient.status).toBe(401);
  expect(wrongClient.headers.getSetCookie()).toEqual([]);
  const headers = { Client: "app", Cookie: `${customSsoLocalSessionCookieName("app")}=${local.token}` };
  const responses = await Promise.all([
    f.post("/auth/account/mobile", { phoneNumber: ` ${number} `, code }, headers),
    f.post("/auth/account/mobile", { phoneNumber: number, code }, headers),
  ]);
  expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
  const rejected = responses.find((response) => response.status !== 200);
  if (!rejected) throw new Error("Expected one concurrent bind request to be rejected");
  const failure = { status: rejected.status, code: (await rejected.json()).code };
  expect([
    { status: 400, code: ApiErrorCode.InvalidVerificationCode },
    { status: 409, code: ApiErrorCode.MobileAlreadyExists },
  ]).toContainEqual(failure);
  const recorded = await f.pg.db.query.users.findFirst({ where: { id: f.userId } });
  expect(recorded?.mobile).toBe(number);
  const outbox = await f.pg.db.select().from(userDocumentOutboxEntries);
  expect(outbox).toHaveLength(1);
  const verified = await f.post("/auth/sms/verify", { usage: "bindPhone", phoneNumber: number, code });
  expect(await verified.json()).toMatchObject({ data: { result: false } });
});

test("password and mobile failures count together while an existing session stays valid", async () => {
  const f = await fixture();
  const root = await loginToken(await f.passwordLogin());
  for (let attempt = 1; attempt <= 4; attempt++) {
    const invalid = await f.passwordLogin("wrong-password");
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      code: ApiErrorCode.LoginFailed,
      message: expect.stringContaining(`当前已连续失败 ${attempt} 次`),
    });
  }
  const invalidSms = await f.post("/auth/login/mobile", { phoneNumber: mobile, code: "999999" });
  expect(invalidSms.status).toBe(400);
  expect(await invalidSms.json()).toMatchObject({ message: expect.stringContaining("当前已连续失败 5 次") });
  const restricted = await f.post("/auth/login/mobile", { phoneNumber: mobile, code: "000000" });
  expect(restricted.status).toBe(400);
  expect(restricted.headers.getSetCookie()).toEqual([]);
  expect(await restricted.json()).toMatchObject({ message: expect.stringContaining("最后触发方式：手机验证码") });
  const session = await f.resolveRoot(root);
  expect(session.status).toBe("resolved");
});

test("OA reuses the current root without renewing it and the legacy WeCom callback establishes a root", async () => {
  const f = await fixture({ NODE_ENV: "production" });
  const root = await loginToken(await f.passwordLogin());
  const before = await f.resolveRoot(root);
  const oauth = new URLSearchParams({ client: "iam", redirectUrl: redirect, state: "state" });
  const oa = await f.auth.app.request(oaPath(username), { headers: { Cookie: `global_session=${root}` } });
  expect(oa.status).toBe(302);
  expect(oa.headers.getSetCookie()).toEqual([]);
  expect(oa.headers.get("Location")).toContain("/sso/authorize?");
  const after = await f.resolveRoot(root);
  if (before.status !== "resolved" || after.status !== "resolved") throw new Error("Expected to retain the root");
  expect(after.value.userSession).toEqual(before.value.userSession);

  oauth.set("code", "wechat-code");
  const wx = await f.auth.app.request(`${internalOrigin}/sso/third-party/wx?${oauth}`);
  expect(wx.status).toBe(302);
  const issued = new URL(wx.headers.get("Location")!, internalOrigin).searchParams.get("token");
  expect(issued).toBeTruthy();
  expect(wx.headers.getSetCookie()[0]).toContain(`global_session=${issued};`);
  const rootFromWechat = await f.resolveRoot(issued!);
  expect(rootFromWechat.status).toBe("resolved");
  const audits = await f.pg.db.select().from(auditLogs);
  expect(audits.filter((audit) => audit.action === "auth.login.oa")).toHaveLength(0);
});

test.each([
  { action: "revoke", after: false, expectedRoot: "resolved" },
  { action: "revoke", after: true, expectedRoot: "terminated" },
  { action: "create", after: false, expectedRoot: "terminated" },
] as const)("OA user switching preserves session state on $action failure (response lost: $after)", async (failure) => {
  const fault = { ...failure, armed: false };
  const f = await fixture({ NODE_ENV: "production" }, fault);
  const oldRoot = await loginToken(await f.passwordLogin());
  const nextUser = "another-oa-user";
  const subjectIdentifier = randomUUID();
  const [user] = await f.pg.db
    .insert(users)
    .values({
      username: nextUser,
      name: "Another OA user",
      subjectIdentifier,
      status: UserStatus.Enable,
      userType: UserType.Formal,
    })
    .returning({ id: users.id });
  if (!user) throw new Error("Expected secondary OA account");
  await publishUserDocument(f.pg.db, user.id);
  await createSubjectAccessBootstrap({ redis: f.redis, random: { uuid: randomUUID } }).seedMany(
    [{ subjectIdentifier, state: "enabled" }],
    new Date(),
  );
  expect((await f.listRoots()).total).toBe(1);
  fault.armed = true;
  const failed = await f.auth.app.request(oaPath(nextUser), { headers: { Cookie: `global_session=${oldRoot}` } });
  if (failure.action === "revoke") expect(failed.status).toBe(503);
  else expect(failed.status).toBeGreaterThanOrEqual(500);
  expect(failed.headers.getSetCookie()).toEqual([]);
  expect(fault.armed).toBe(false);
  const previous = await f.resolveRoot(oldRoot);
  expect(previous.status).toBe(failure.expectedRoot);
  const after = await f.listRoots();
  expect(after.total).toBe(failure.expectedRoot === "resolved" ? 1 : 0);
  const audits = await f.pg.db.select().from(auditLogs);
  expect(audits.filter((audit) => audit.action === "auth.login.oa")).toHaveLength(0);
});

test("canonical recovery and CAP endpoints use the configured security and public projection", async () => {
  const f = await fixture({ IAM_AUTH_API_CAP_ENABLED: "true" });
  const status = await f.auth.app.request("/auth/client/status?clientCode=iam");
  expect(await status.json()).toMatchObject({ data: { clientCode: "iam", clientName: "iam" } });
  const lookup = await f.auth.app.request(`/auth/recovery/users/${username}/masked-mobile`);
  expect(await lookup.json()).toMatchObject({ data: { mobile: "177****2865" } });
  const challenge = await f.post("/auth/captcha/cap/iam-sso/challenge", {});
  expect(challenge.status).toBe(200);
  expect(await challenge.json()).toMatchObject({ token: expect.any(String), challenge: expect.any(Object) });
});

test("public Client status looks up dot, double dot and literal percent codes independently", async () => {
  const f = await fixture();
  const cases = [
    { clientCode: ".", clientName: "Dot", queryValue: "." },
    { clientCode: "..", clientName: "Double dot", queryValue: ".." },
    { clientCode: "%2E", clientName: "Literal %2E", queryValue: "%252E" },
  ];
  await f.pg.db.insert(clients).values(
    cases.map(({ clientCode, clientName }) => ({
      clientCode,
      clientName,
      clientSecret: internalSecret,
      extAttributes: {},
    })),
  );

  for (const { clientCode, clientName, queryValue } of cases) {
    const response = await f.auth.app.request(`/auth/client/status?clientCode=${queryValue}`);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ code: 200, data: { clientCode, clientName } });
  }
});

test("mobile login rejects a request without credentials", async () => {
  const f = await fixture();
  const response = await f.post("/auth/login/mobile", {});
  expect(response.status).toBe(422);
});

test("SMS login consumes a delivered code and keeps the same-phone cooldown", async () => {
  const f = await fixture();
  const sent = await f.post("/auth/sms/send", { usage: "login", phoneNumber: mobile });
  expect(sent.status).toBe(200);
  const code = f.sms[0]?.message.match(/\d{4}/u)?.[0];
  if (!code) throw new Error("Expected a code in the SMS provider request");
  const token = await loginToken(await f.post("/auth/login/mobile", { phoneNumber: mobile, code }));
  const session = await f.resolveRoot(token);
  expect(session).toMatchObject({ status: "resolved", value: { userSession: { amr: ["sms"] } } });
  const cooldown = await f.post("/auth/sms/send", { usage: "resetPassword", username });
  expect(cooldown.status).toBe(429);
  expect(Number(cooldown.headers.get("Retry-After"))).toBeGreaterThan(0);
  expect(f.sms).toHaveLength(1);
});

test("recovery verification leaves the delivered proof for one password reset", async () => {
  const f = await fixture();
  const sent = await f.post("/auth/sms/send", { usage: "resetPassword", username });
  expect(sent.status).toBe(200);
  const code = f.sms[0]?.message.match(/\d{4}/u)?.[0];
  if (!code) throw new Error("Expected a code in the SMS provider request");
  const verified = await f.post("/auth/sms/verify", { usage: "resetPassword", username, code });
  expect(await verified.json()).toMatchObject({ data: { result: true } });
  const reset = await f.post("/auth/recovery/password-reset", { username, code, newPassword });
  expect(reset.status).toBe(200);
  const replay = await f.post("/auth/recovery/password-reset", { username, code, newPassword: password });
  expect(replay.status).toBe(400);
  await loginToken(await f.passwordLogin(newPassword));
});

test("a PostgreSQL connection failure leaves Redis health available and readiness unavailable", async () => {
  const env = authTestEnv("postgresql://fixture:fixture@127.0.0.1:1/unavailable");
  const auth = await createAuthApiApp({ env, logger });
  ownAuthApiTestExecutor(auth.close);
  const health = await auth.app.request("/health");
  const ready = await auth.app.request("/ready");
  expect(health.status).toBe(200);
  expect(await health.json()).toEqual({ status: "ok" });
  expect(ready.status).toBe(503);
  expect(await ready.json()).toEqual({ status: "unavailable" });
});
