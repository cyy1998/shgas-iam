import { afterEach, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { createAuthApiApp } from "@auth-api/app";
import { createApiPasswordHasher } from "@auth-api/composition/runtime/password-hasher";
import { createClientSnapshots } from "@iam/client-snapshot/composition";
import {
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
import { clients as clientTable, users } from "@iam/db/schema";
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
import Redis from "ioredis";
import pino from "pino";
import { sm2 } from "sm-crypto";
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
    if (url.pathname === "/cgi-bin/auth/getuserinfo") return Response.json({ errcode: 0, userid: "qr-member" });
    throw new Error("Unexpected WeCom API request");
  },
  { preconnect: fetch.preconnect },
);

async function setup(protocol: "custom_sso" | "oidc", bindAccount: boolean, origin = internalOrigin) {
  const pg = getDatabase();
  const keys = sm2.generateKeyPairHex();
  const env = authTestEnv(pg.databaseUrl, {
    IAM_AUTH_API_WECHAT_QR_AGENT_ID: "1000001",
    IAM_AUTH_API_WECHAT_QR_CALLBACK_URL: qrCallback,
    IAM_AUTH_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON: JSON.stringify({ fixture: keys.privateKey }),
  });
  const redis = new Redis(env.redis);
  ownAuthApiTestExecutor(() => closeAuthApiRedisConnection(redis));
  const messages: string[] = [];
  const auth = await createAuthApiApp({
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
  });
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
    continuationTtlSeconds: 90,
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
  const initial = await operations.run((operation) =>
    custom.forOperation(operation).authorize({ clientCode, redirectUrl: redirectUri, state }),
  );
  if (initial.kind !== "login") throw new Error("Expected a Custom SSO continuation");
  return {
    auth,
    userId: user.id,
    keys,
    protocol,
    messages,
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

type Fixture = Awaited<ReturnType<typeof setup>>;

function desktop(f: Fixture, suffix: string, init: RequestInit = {}) {
  const headers = new Headers({ Cookie: f.browserCookie, "X-IAM-Entry-Network": "internal" });
  for (const [name, value] of new Headers(init.headers)) headers.set(name, value);
  return f.auth.app.request(`${internalOrigin}/auth/wechat-qr${suffix}?${f.query}`, { ...init, headers });
}

async function confirmOnPhone(f: Fixture, mobileUrl: string) {
  const headers = { "X-IAM-Entry-Network": "external" };
  const mobile = await f.auth.app.request(mobileUrl, { headers });
  expect(mobile.status).toBe(302);
  const provider = new URL(required(mobile.headers.get("Location")));
  const state = required(provider.searchParams.get("state"));
  const callback = new URL(required(provider.searchParams.get("redirect_uri")));
  expect(callback.href).toBe(qrCallback);
  callback.search = new URLSearchParams({ state, code: "fixture-oauth-code" }).toString();
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

for (const protocol of ["custom_sso", "oidc"] as const) {
  for (const method of ["linked", "password", "sms"] as const) {
    test(`${protocol} resumes the original browser after WeCom confirmation (${method})`, async () => {
      const bindAccount = method !== "linked";
      const f = await setup(protocol, bindAccount);
      const missingBinding = await desktop(f, "", { method: "POST", headers: { Cookie: "" } });
      expect(missingBinding.status).toBe(400);
      const external = await desktop(f, "", { method: "POST", headers: { "X-IAM-Entry-Network": "external" } });
      expect(external.status).toBe(404);
      const started = await desktop(f, "", { method: "POST" });
      expect(started.status).toBe(200);
      const { data: qr } = WechatQrStartResponseSchema.parse(await started.json());
      if (qr.decision !== "scan") throw new Error("Expected a QR request");
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
        const credential = createLoginCredential({
          username: "test-qr-user",
          password,
          kid: "fixture",
          publicKey: f.keys.publicKey,
          now: Date.now(),
          nonce: randomUUID(),
          wechatQrRequestId: qr.requestId,
        });
        completed = await desktop(f, `/${qr.requestId}/bind/password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential }),
        });
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

test("OIDC desktop start rejects a continuation from the external issuer with its original Cookie", async () => {
  const f = await setup("oidc", false, externalOrigin);
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
