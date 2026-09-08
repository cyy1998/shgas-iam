import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import type { AddressInfo } from "node:net";
import type { OidcProviderRedisTestHarness, OidcProviderRedisTestScope } from "./redis-test-harness.ts";
import { createHash, randomUUID } from "node:crypto";
import { createSubjectAccessBootstrap, createSubjectAccessSessionContext, SubjectAccessPermissionRequiredError } from "@iam/api-core/subject-access";
import { UserProfileDirtyStatus } from "@iam/contracts";
import { createSubjectFactsRedisCache } from "@iam/user-profile-read-model/subject-facts";
import { exportJWK, generateKeyPair } from "jose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createOidcHttpServer } from "../../src/composition/http/create-http-server.ts";
import { createOidcProviderRuntime } from "../../src/composition/provider/index.ts";
import { createOidcProviderSession } from "../../src/composition/session/index.ts";
import { parseOidcProviderEnv } from "../../src/env.ts";
import { RedisOidcAdapter } from "../../src/storage/redis-adapter.ts";
import { createOidcTokenStore } from "../../src/stores/token.store.ts";
import { createOidcProviderRedisTestHarness } from "./redis-test-harness.ts";

let harness: OidcProviderRedisTestHarness;
let scope: OidcProviderRedisTestScope;
const servers: ReturnType<typeof createOidcHttpServer>[] = [];
const issuer = "http://issuer.test/oidc";
const verifier = "a".repeat(64);
const challenge = createHash("sha256").update(verifier).digest("base64url");

beforeAll(async () => {
  harness = await createOidcProviderRedisTestHarness();
});
beforeEach(async () => {
  scope = await harness.createScope();
});
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  })));
  vi.restoreAllMocks();
  await scope?.close();
});
afterAll(async () => {
  await harness?.close();
});

async function runtimeFixture(options: { publishFacts?: boolean } = {}) {
  // Register the exact keys used by this isolated runtime, including generated Provider IDs.
  const sendCommand = scope.writer.sendCommand.bind(scope.writer);
  vi.spyOn(scope.writer, "sendCommand").mockImplementation((command, stream) => {
    for (const key of command.getKeys())
      scope.trackKey(String(key));
    return sendCommand(command, stream);
  });
  const subject = randomUUID();
  const client = scope.unique("client");
  await createSubjectAccessBootstrap({ redis: scope.writer, random: { uuid: randomUUID } }).seedMany(
    [{ subjectIdentifier: subject, state: "enabled" }],
    new Date(),
  );
  const env = parseOidcProviderEnv({
    NODE_ENV: "test",
    IAM_OIDC_PROVIDER_DATABASE_URL: "postgres://unused.test/fixture",
    IAM_OIDC_PROVIDER_REDIS_HOST: "unused.test",
    IAM_OIDC_PROVIDER_ISSUER: issuer,
    IAM_OIDC_PROVIDER_PUBLIC_ORIGIN: "http://issuer.test",
    IAM_OIDC_PROVIDER_COOKIE_KEYS: `${"a".repeat(32)},${"b".repeat(32)}`,
    IAM_OIDC_PROVIDER_COOKIE_SECURE: "false",
    IAM_OIDC_PROVIDER_CURRENT_JWK_JSON: "{}",
    IAM_OIDC_PROVIDER_SESSION_KERNEL_NAMESPACE: `${scope.unique("kernel")}:`,
  });
  scope.trackPrefix(env.sessionKernel.namespace);
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const account = { findBySubject: vi.fn(async (id: string) => id === subject
    ? {
        id: 7,
        subjectIdentifier: subject,
        username: "alice",
        name: "Alice",
        mobile: null,
      }
    : null) };
  let allowed = true;
  let clientVersion = 1;
  const metadata = {
    client_id: client,
    client_name: "Operation fixture",
    iam_client_id: 1,
    oidc_config_version: 1,
    allowed_scopes: ["openid", "profile", "iam:authorization"],
    scope: "openid profile iam:authorization",
    redirect_uris: ["https://client.example/callback"],
    post_logout_redirect_uris: [],
    grant_types: ["authorization_code"],
    response_types: ["code"],
    subject_type: "public",
    require_auth_time: true,
    id_token_signed_response_alg: "RS256",
    token_endpoint_auth_method: "none",
  };
  const stores = {
    clientRuntime: {
      findRuntime: async (id: string) => id === client ? metadata : null,
      findActiveVersion: async (id: string) => id === client ? clientVersion : null,
    },
    clientTrafficGate: { check: async () => ({ outcome: allowed ? "enabled" : "maintenance" }) },
    tokens: createOidcTokenStore(scope.writer),
  };
  const session = createOidcProviderSession({
    env,
    redis: scope.writer,
    logger,
    repositories: { account },
    stores,
  } as never);
  async function setAccess(state: "disabled" | "blocking") {
    const transition = await session.subjectAccess.beginBlocking(subject);
    if (state === "disabled") {
      await session.subjectAccess.prepareRepair(transition, state);
      await session.subjectAccess.finalize(transition, state);
    }
  }
  const principal = await session.operations.run(async (operation) => {
    const permission = await operation.acquireForAuthentication(subject);
    return session.kernel.createPrincipalSession(subject, createSubjectAccessSessionContext(operation, permission));
  });
  if (principal.status !== "created")
    throw new Error("Principal Session fixture failed");
  const barrier = vi.spyOn(session.subjectAccess, "readCommittedTransitionId");
  const renew = vi.spyOn(session.kernel, "renewPrincipalSession");
  const stage = vi.spyOn(session.providerSessionState, "stage");
  const refresh = vi.spyOn(session.providerSessionState, "refresh");
  const captured: SubjectAccessOperation[] = [];
  const run = session.operations.run.bind(session.operations);
  vi.spyOn(session.operations, "run").mockImplementation(callback => run(async (operation) => {
    captured.push(operation);
    return callback(operation);
  }));
  if (options.publishFacts !== false) {
    await createSubjectFactsRedisCache(scope.writer).publish({
      schemaVersion: 3,
      sourceDirtyVersion: "1",
      publishedAt: new Date().toISOString(),
      subjectIdentifier: subject,
      profile: { username: "alice", name: "Alice", phone: null },
      facts: { employments: [] },
    });
  }
  let fresh = true;
  const freshness = vi.fn(async () => [{ dirtyVersion: "1", status: fresh ? UserProfileDirtyStatus.Processed : UserProfileDirtyStatus.Pending }]);
  const query = { from: () => query, innerJoin: () => query, where: () => query, limit: freshness };
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  const jwk = { ...await exportJWK(privateKey), alg: "RS256", kid: "current", use: "sig" };
  const runtime = createOidcProviderRuntime({
    env,
    redis: scope.writer,
    logger,
    db: { select: () => query },
    repositories: { account },
    session,
    stores,
    signingKeys: { current: { jwk, key: privateKey } },
    security: { clientAuthRateLimiter: {}, clientSecretVerifier: {} },
  } as never);
  const providerContexts: SubjectAccessOperation[] = [];
  const current = runtime.bridge.current.bind(runtime.bridge);
  vi.spyOn(runtime.bridge, "current").mockImplementation(() => {
    const operation = current();
    providerContexts.push(operation);
    return operation;
  });
  const server = createOidcHttpServer({ ...runtime, env, logger, health: scope.writer });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const cookies = new Map<string, string>([["global_session", principal.externalToken!]]);
  async function request(path: string, jar = cookies, form?: URLSearchParams, headers: Record<string, string> = {}) {
    const target = new URL(path, issuer);
    const response = await fetch(`${base}${target.pathname}${target.search}`, {
      redirect: "manual",
      method: form ? "POST" : "GET",
      body: form,
      headers: { cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "), ...headers },
    });
    const body = await response.text();

    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(";", 1)[0]!;
      const separator = pair.indexOf("=");
      const key = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value)
        jar.set(key, value);
      else
        jar.delete(key);
    }
    return { response, body, location: response.headers.get("location") };
  }
  function authorization(extra: Record<string, string> = {}) {
    return `/oidc/auth?${new URLSearchParams({
      client_id: client,
      redirect_uri: "https://client.example/callback",
      response_type: "code",
      scope: "openid",
      state: randomUUID(),
      code_challenge: challenge,
      code_challenge_method: "S256",
      ...extra,
    })}`;
  }
  async function authorize(extra: Record<string, string> = {}) {
    let result = await request(authorization(extra));
    for (let hop = 0; hop < 8 && result.location && new URL(result.location, issuer).hostname !== "client.example"; hop += 1)
      result = await request(result.location);
    return result;
  }
  return {
    ...runtime,
    session,
    subject,
    client,
    barrier,
    renew,
    stage,
    refresh,
    captured,
    freshness,
    account,
    cookies,
    request,
    authorization,
    authorize,
    async issueCode(extra: Record<string, string> = {}) {
      const authorized = await authorize(extra);
      const code = authorized.location && new URL(authorized.location).searchParams.get("code");
      if (!code)
        throw new Error(`Authorization fixture did not issue a Code: ${authorized.response.status}`);
      return code;
    },
    exchange(code: string, extra: Record<string, string> = {}) {
      return request("/oidc/token", new Map(), new URLSearchParams({
        grant_type: "authorization_code",
        client_id: client,
        code,
        redirect_uri: "https://client.example/callback",
        code_verifier: verifier,
        ...extra,
      }));
    },
    userInfo(accessToken: string) {
      return request("/oidc/me", new Map(), undefined, { authorization: `Bearer ${accessToken}` });
    },
    setAccess,
    providerContexts,
    setFresh(value: boolean) { fresh = value; },
    setClientAllowed(value: boolean) { allowed = value; },
    setClientVersion(value: number) { clientVersion = value; },
  };
}

describe("oIDC Token and UserInfo operations through real Redis and production HTTP routing", () => {
  it("shares one permission across Token callbacks, isolates parallel requests and closes their claims", async () => {
    const runtime = await runtimeFixture();
    const codes = [await runtime.issueCode(), await runtime.issueCode()];
    runtime.barrier.mockClear();
    runtime.captured.splice(0);
    runtime.providerContexts.splice(0);
    const responses = await Promise.all(codes.map(code => runtime.exchange(code)));
    for (const result of responses)
      expect(result.response.status).toBe(200);
    expect(runtime.barrier).toHaveBeenCalledTimes(2);
    expect(runtime.captured).toHaveLength(2);
    expect(new Set(runtime.providerContexts)).toEqual(new Set(runtime.captured));
    expect(runtime.providerContexts.length).toBeGreaterThan(2);
    for (const operation of runtime.captured)
      expect(() => operation.requirePermission(runtime.subject)).toThrow(SubjectAccessPermissionRequiredError);
    runtime.barrier.mockClear();
    const token = JSON.parse(responses[0]!.body).access_token;
    const profile = await runtime.userInfo(token);
    expect(profile.response.status).toBe(200);
    expect(JSON.parse(profile.body)).toMatchObject({ sub: runtime.subject });
    expect(runtime.barrier).toHaveBeenCalledTimes(1);
  });

  it.each(["blocking", "unavailable"] as const)("does not consume a Code during %s and permits a new request to retry", async (failure) => {
    const runtime = await runtimeFixture();
    const code = await runtime.issueCode();
    const consume = vi.spyOn(RedisOidcAdapter.prototype, "consume");
    const transition = failure === "blocking" ? await runtime.session.subjectAccess.beginBlocking(runtime.subject) : null;
    if (failure === "unavailable")
      runtime.barrier.mockRejectedValueOnce(new Error("fixture Redis read unavailable"));
    runtime.barrier.mockClear();
    const denied = await runtime.exchange(code);
    expect(denied.response.status).toBe(503);
    expect(JSON.parse(denied.body).error).toBe("temporarily_unavailable");
    expect(denied.response.headers.getSetCookie().some(header => header.startsWith("global_session="))).toBe(false);
    expect(runtime.barrier).toHaveBeenCalledTimes(1);
    expect(consume).not.toHaveBeenCalled();
    if (transition)
      await runtime.session.subjectAccess.abortBegin(transition);
    const retried = await runtime.exchange(code);
    expect(retried.response.status).toBe(200);
    expect(consume).toHaveBeenCalledWith(code);
    expect(runtime.barrier).toHaveBeenCalledTimes(2);
  });

  it.each(["disabled", "blocking", "unavailable"] as const)("rejects UserInfo %s before refreshing its mapping", async (failure) => {
    const runtime = await runtimeFixture();
    const issued = await runtime.exchange(await runtime.issueCode());
    expect(issued.response.status).toBe(200);
    const token = JSON.parse(issued.body).access_token;
    if (failure === "unavailable")
      runtime.barrier.mockRejectedValueOnce(new Error("fixture Redis read unavailable"));
    else
      await runtime.setAccess(failure);
    runtime.refresh.mockClear();
    runtime.barrier.mockClear();
    const denied = await runtime.userInfo(token);
    expect(denied.response.status).toBe(failure === "disabled" ? 401 : 503);
    expect(JSON.parse(denied.body).error).toBe(failure === "disabled" ? "invalid_token" : "temporarily_unavailable");
    expect(denied.response.headers.getSetCookie().some(header => header.startsWith("global_session="))).toBe(false);
    expect(runtime.barrier).toHaveBeenCalledTimes(1);
    expect(runtime.refresh).not.toHaveBeenCalled();
  });

  it("allows an in-flight Token operation after disable but rejects the next UserInfo request", async () => {
    const runtime = await runtimeFixture();
    const code = await runtime.issueCode();
    runtime.barrier.mockRestore();
    const read = runtime.session.subjectAccess.readCommittedTransitionId.bind(runtime.session.subjectAccess);
    const barrier = vi.spyOn(runtime.session.subjectAccess, "readCommittedTransitionId").mockImplementationOnce(async (subject) => {
      const generation = await read(subject);
      await runtime.setAccess("disabled");
      return generation;
    });
    const issued = await runtime.exchange(code);
    expect(issued.response.status).toBe(200);
    expect(barrier).toHaveBeenCalledTimes(1);
    const denied = await runtime.userInfo(JSON.parse(issued.body).access_token);
    expect(denied.response.status).toBe(401);
    expect(barrier).toHaveBeenCalledTimes(2);
  });

  it("does not consume a Code outside its operation and rejects retained Token claims callbacks", async () => {
    const runtime = await runtimeFixture();
    const adapters = new Map<string, RedisOidcAdapter>();
    const upsert = RedisOidcAdapter.prototype.upsert;
    vi.spyOn(RedisOidcAdapter.prototype, "upsert").mockImplementation(async function (this: RedisOidcAdapter, ...args) {
      adapters.set(args[0], this);
      return upsert.apply(this, args);
    });
    const code = await runtime.issueCode();
    const adapter = adapters.get(code);
    if (!adapter)
      throw new Error("Authorization Code adapter was not observed");
    const failure = await adapter.consume(code).catch(cause => cause);
    expect(failure).toBeInstanceOf(SubjectAccessPermissionRequiredError);
    const extra = vi.spyOn(runtime.claims, "createAccessTokenExtra");
    const findAccount = vi.spyOn(runtime.claims, "findAccount");
    const issued = await runtime.exchange(code);
    expect(issued.response.status).toBe(200);
    const args = extra.mock.calls[0];
    if (!args)
      throw new Error("Provider did not request Access Token claims");
    const retainedExtra = await runtime.claims.createAccessTokenExtra(...args).catch(cause => cause);
    expect(retainedExtra).toBeInstanceOf(SubjectAccessPermissionRequiredError);
    const account = await findAccount.mock.results[0]!.value;
    expect(account).toBeDefined();
    const retainedClaims = await account!.claims("id_token", "openid").catch((cause: unknown) => cause);
    expect(retainedClaims).toBeInstanceOf(SubjectAccessPermissionRequiredError);
  });

  it("revokes the Grant on consumed Code replay without requiring Subject Access", async () => {
    const runtime = await runtimeFixture();
    const code = await runtime.issueCode();
    const issued = await runtime.exchange(code);
    expect(issued.response.status).toBe(200);
    const revoke = vi.spyOn(RedisOidcAdapter.prototype, "revokeByGrantId");
    const transition = await runtime.session.subjectAccess.beginBlocking(runtime.subject);
    runtime.barrier.mockClear();
    const replayed = await runtime.exchange(code);
    expect(replayed.response.status).toBe(400);
    expect(JSON.parse(replayed.body).error).toBe("invalid_grant");
    expect(runtime.barrier).not.toHaveBeenCalled();
    expect(revoke).toHaveBeenCalled();
    await runtime.session.subjectAccess.abortBegin(transition);
    const denied = await runtime.userInfo(JSON.parse(issued.body).access_token);
    expect(denied.response.status).toBe(401);
  });

  it.each([
    { label: "PKCE", key: "code_verifier", value: "b".repeat(64), error: "invalid_grant" },
    { label: "redirect", key: "redirect_uri", value: "https://client.example/other", error: "invalid_grant" },
    { label: "client", key: "client_id", value: "unknown-client", error: "invalid_client" },
  ])("retains the $label validation before Code consumption", async ({ key, value, error }) => {
    const runtime = await runtimeFixture();
    const code = await runtime.issueCode();
    const consume = vi.spyOn(RedisOidcAdapter.prototype, "consume");
    const denied = await runtime.exchange(code, { [key]: value });
    expect(denied.response.status).toBeGreaterThanOrEqual(400);
    expect(JSON.parse(denied.body).error).toBe(error);
    expect(consume).not.toHaveBeenCalled();
    const retried = await runtime.exchange(code);
    expect(retried.response.status).toBe(200);
  });

  it("denies disabled Subject Access before consuming a new Code", async () => {
    const runtime = await runtimeFixture();
    const code = await runtime.issueCode();
    await runtime.setAccess("disabled");
    const consume = vi.spyOn(RedisOidcAdapter.prototype, "consume");
    runtime.barrier.mockClear();
    const denied = await runtime.exchange(code);
    expect(denied.response.status).toBe(401);
    expect(JSON.parse(denied.body).error).toBe("login_required");
    expect(consume).not.toHaveBeenCalled();
    expect(runtime.barrier).toHaveBeenCalledTimes(1);
  });

  it("fixes a failed permission across adapter retries in one Provider request", async () => {
    const runtime = await runtimeFixture();
    const code = await runtime.issueCode();
    const find = RedisOidcAdapter.prototype.find;
    const failures: unknown[] = [];
    vi.spyOn(RedisOidcAdapter.prototype, "find").mockImplementation(async function (this: RedisOidcAdapter, id) {
      if (id !== code)
        return find.call(this, id);
      const first = await find.call(this, id).catch(cause => cause);
      const retried = await find.call(this, id).catch(cause => cause);
      failures.push(first, retried);
      throw first;
    });
    runtime.barrier.mockClear();
    runtime.barrier.mockRejectedValueOnce(new Error("fixture Redis read unavailable"));
    const denied = await runtime.exchange(code);
    expect(denied.response.status).toBe(503);
    expect(failures).toHaveLength(2);
    expect(failures[0]).toBeInstanceOf(Error);
    expect(failures[1]).toBe(failures[0]);
    expect(runtime.barrier).toHaveBeenCalledTimes(1);
  });

  it("isolates concurrent UserInfo requests and ends each operation", async () => {
    const runtime = await runtimeFixture();
    const issued = await runtime.exchange(await runtime.issueCode());
    expect(issued.response.status).toBe(200);
    runtime.barrier.mockClear();
    runtime.captured.splice(0);
    runtime.providerContexts.splice(0);
    const token = JSON.parse(issued.body).access_token;
    const responses = await Promise.all([runtime.userInfo(token), runtime.userInfo(token)]);
    for (const response of responses)
      expect(response.response.status).toBe(200);
    expect(runtime.barrier).toHaveBeenCalledTimes(2);
    expect(runtime.captured).toHaveLength(2);
    expect(new Set(runtime.providerContexts)).toEqual(new Set(runtime.captured));
    for (const operation of runtime.captured)
      expect(() => operation.requirePermission(runtime.subject)).toThrow(SubjectAccessPermissionRequiredError);
  });

  it("finishes an already permitted UserInfo request after disable and refuses its successor", async () => {
    const runtime = await runtimeFixture();
    const issued = await runtime.exchange(await runtime.issueCode());
    expect(issued.response.status).toBe(200);
    const token = JSON.parse(issued.body).access_token;
    runtime.barrier.mockRestore();
    const read = runtime.session.subjectAccess.readCommittedTransitionId.bind(runtime.session.subjectAccess);
    const barrier = vi.spyOn(runtime.session.subjectAccess, "readCommittedTransitionId").mockImplementationOnce(async (subject) => {
      const generation = await read(subject);
      await runtime.setAccess("disabled");
      return generation;
    });
    const permitted = await runtime.userInfo(token);
    expect(permitted.response.status).toBe(200);
    expect(barrier).toHaveBeenCalledTimes(1);
    runtime.refresh.mockClear();
    const denied = await runtime.userInfo(token);
    expect(denied.response.status).toBe(401);
    expect(barrier).toHaveBeenCalledTimes(2);
    expect(runtime.refresh).not.toHaveBeenCalled();
  });

  it("rejects a Code from an obsolete Client configuration", async () => {
    const runtime = await runtimeFixture();
    const code = await runtime.issueCode();
    runtime.setClientVersion(2);
    const consume = vi.spyOn(RedisOidcAdapter.prototype, "consume");
    const denied = await runtime.exchange(code);
    expect(denied.response.status).toBe(400);
    expect(JSON.parse(denied.body).error).toBe("invalid_grant");
    expect(consume).not.toHaveBeenCalled();
  });

  it("keeps authorization-time claims when Facts freshness changes after Code issuance", async () => {
    const runtime = await runtimeFixture();
    const code = await runtime.issueCode({ scope: "openid profile iam:authorization" });
    runtime.setFresh(false);
    runtime.freshness.mockClear();
    const issued = await runtime.exchange(code);
    expect(issued.response.status).toBe(200);
    const info = await runtime.userInfo(JSON.parse(issued.body).access_token);
    expect(info.response.status).toBe(200);
    expect(JSON.parse(info.body)).toMatchObject({ sub: runtime.subject, name: "Alice" });
    expect(runtime.freshness).not.toHaveBeenCalled();
  });

  it("fails closed when permitted account data disappears", async () => {
    const runtime = await runtimeFixture();
    const code = await runtime.issueCode();
    runtime.account.findBySubject.mockResolvedValue(null);
    runtime.barrier.mockClear();
    const denied = await runtime.exchange(code);
    expect(denied.response.status).toBeGreaterThanOrEqual(400);
    expect(JSON.parse(denied.body)).not.toHaveProperty("access_token");
    expect(runtime.barrier).toHaveBeenCalledTimes(1);
  });
});

describe("oIDC operation authorization through real Redis and production HTTP routing", () => {
  it("isolates concurrent HTTP requests and rejects claims use outside Provider scope", async () => {
    const runtime = await runtimeFixture();
    await runtime.authorize();
    runtime.barrier.mockClear();
    runtime.captured.splice(0);
    runtime.providerContexts.splice(0);
    const results = await Promise.all([
      runtime.request(runtime.authorization(), new Map(runtime.cookies)),
      runtime.request(runtime.authorization(), new Map(runtime.cookies)),
    ]);
    for (const result of results)
      expect(new URL(result.location!).searchParams.get("code")).toEqual(expect.any(String));
    expect(runtime.barrier).toHaveBeenCalledTimes(2);
    expect(runtime.captured).toHaveLength(2);
    expect(new Set(runtime.providerContexts)).toEqual(new Set(runtime.captured));
    const error = await runtime.claims.findAccount(runtime.subject).catch(cause => cause);
    expect(error).toBeInstanceOf(SubjectAccessPermissionRequiredError);
    for (const operation of runtime.captured)
      expect(() => operation.requirePermission(runtime.subject)).toThrow(SubjectAccessPermissionRequiredError);
  });

  it("closes the native scope after an account failure and permits an independent retry", async () => {
    const runtime = await runtimeFixture();
    const auth = await runtime.request(runtime.authorization());
    runtime.account.findBySubject.mockRejectedValueOnce(new Error("fixture account read failed"));
    runtime.captured.splice(0);
    runtime.barrier.mockClear();
    const failed = await runtime.request(auth.location!);
    expect(failed.response.status).toBe(500);
    expect(runtime.cookies.has("global_session")).toBe(true);
    expect(runtime.barrier).toHaveBeenCalledTimes(1);
    expect(() => runtime.captured[0]!.requirePermission(runtime.subject)).toThrow(SubjectAccessPermissionRequiredError);
    const retried = await runtime.request(auth.location!);
    expect(retried.response.status).toBe(303);
    expect(runtime.barrier).toHaveBeenCalledTimes(2);
  });

  it("completes logout with disabled Subject Access without acquiring a new permission", async () => {
    const runtime = await runtimeFixture();
    await runtime.authorize();
    await runtime.setAccess("disabled");
    runtime.barrier.mockClear();
    const prompt = await runtime.request("/oidc/session/end");
    expect(prompt.response.status).toBe(200);
    const action = prompt.body.match(/action="([^"]+)"/u)?.[1];
    const xsrf = prompt.body.match(/name="xsrf" value="([^"]+)"/u)?.[1];
    expect(action).toEqual(expect.any(String));
    expect(xsrf).toEqual(expect.any(String));
    const logout = await runtime.request(action!, runtime.cookies, new URLSearchParams({ logout: "yes", xsrf: xsrf! }));
    expect(logout.response.status).toBeLessThan(400);
    expect(runtime.barrier).not.toHaveBeenCalled();
    expect(runtime.cookies.has("global_session")).toBe(false);
  });

  it("acquires once per native interaction and Provider request and closes every context", async () => {
    const runtime = await runtimeFixture();
    const auth = await runtime.request(runtime.authorization());
    expect(runtime.barrier).toHaveBeenCalledTimes(1);
    runtime.barrier.mockClear();
    const interaction = await runtime.request(auth.location!);
    expect(runtime.barrier).toHaveBeenCalledTimes(1);
    expect(runtime.stage).toHaveBeenCalledTimes(1);
    runtime.barrier.mockClear();
    const resume = await runtime.request(interaction.location!);
    expect(new URL(resume.location!).searchParams.get("code")).toEqual(expect.any(String));
    expect(runtime.barrier).toHaveBeenCalledTimes(1);
    expect(new Set(runtime.captured).size).toBe(runtime.captured.length);
    for (const operation of runtime.captured)
      expect(() => operation.requirePermission(runtime.subject)).toThrow(SubjectAccessPermissionRequiredError);
    runtime.barrier.mockClear();
    const silent = await runtime.request(runtime.authorization());
    expect(new URL(silent.location!).searchParams.get("code")).toEqual(expect.any(String));
    expect(runtime.barrier).toHaveBeenCalledTimes(1);
  });

  it("retains an acquired permission while Redis becomes disabled and rejects the next request", async () => {
    const runtime = await runtimeFixture();
    const initial = await runtime.authorize();
    expect(new URL(initial.location!).searchParams.get("code")).toEqual(expect.any(String));

    runtime.barrier.mockRestore();
    const original = runtime.session.subjectAccess.readCommittedTransitionId.bind(runtime.session.subjectAccess);
    const check = vi.spyOn(runtime.session.subjectAccess, "readCommittedTransitionId").mockImplementation(async (subject) => {
      const generation = await original(subject);
      await runtime.setAccess("disabled");
      return generation;
    });

    const inFlight = await runtime.request(runtime.authorization());
    expect(new URL(inFlight.location!).searchParams.get("code")).toEqual(expect.any(String));
    expect(check).toHaveBeenCalledTimes(1);
    runtime.renew.mockClear();
    runtime.stage.mockClear();
    const denied = await runtime.request(runtime.authorization());
    expect(denied.response.status).toBe(401);
    expect(runtime.renew).not.toHaveBeenCalled();
    expect(runtime.stage).not.toHaveBeenCalled();
    expect(runtime.cookies.has("global_session")).toBe(false);
  });

  it.each(["disabled", "blocking"] as const)("denies %s before native renewal or staging with deliberate cookie semantics", async (state) => {
    const runtime = await runtimeFixture();
    const auth = await runtime.request(runtime.authorization());
    runtime.renew.mockClear();
    runtime.stage.mockClear();
    runtime.barrier.mockClear();
    await runtime.setAccess(state);
    const denied = await runtime.request(auth.location!);
    expect(denied.response.status).toBe(state === "disabled" ? 401 : 503);
    expect(runtime.barrier).toHaveBeenCalledTimes(1);
    expect(runtime.renew).not.toHaveBeenCalled();
    expect(runtime.stage).not.toHaveBeenCalled();
    expect(runtime.cookies.has("global_session")).toBe(state !== "disabled");
  });

  it("keeps subjectless return handles neutral and checks login guard and native resume separately", async () => {
    const runtime = await runtimeFixture();
    const token = runtime.cookies.get("global_session")!;
    runtime.cookies.delete("global_session");
    const auth = await runtime.request(runtime.authorization());
    const login = await runtime.request(auth.location!);
    const handle = new URL(login.location!).searchParams.get("oidcReturn")!;
    const guardPath = `/oidc/login-guard?oidcReturn=${encodeURIComponent(handle)}`;
    const absent = await runtime.request(guardPath);
    expect(absent.response.status).toBe(200);
    expect(runtime.barrier).not.toHaveBeenCalled();
    runtime.cookies.set("global_session", token);
    const guard = await runtime.request(guardPath);
    expect(runtime.barrier).toHaveBeenCalledTimes(1);
    expect(guard.response.status).toBe(200);
    runtime.barrier.mockClear();
    const resumed = await runtime.request(`/oidc/resume?oidcReturn=${encodeURIComponent(handle)}`);
    expect(resumed.response.status).toBe(302);
    expect(runtime.barrier).toHaveBeenCalledTimes(1);
  });

  it("retains client scope and freshness gates after subject permission", async () => {
    const runtime = await runtimeFixture();
    const initial = await runtime.authorize();
    expect(new URL(initial.location!).searchParams.get("code")).toEqual(expect.any(String));
    const projected = await runtime.request(runtime.authorization({ scope: "openid iam:authorization" }));
    expect(new URL(projected.location!).searchParams.get("code")).toEqual(expect.any(String));
    expect(runtime.freshness).toHaveBeenCalled();
    const invalidScope = await runtime.request(runtime.authorization({ scope: "openid phone" }));
    expect(new URL(invalidScope.location!).searchParams.get("error")).toBe("invalid_scope");
    runtime.setFresh(false);
    const stale = await runtime.request(runtime.authorization({ scope: "openid iam:authorization" }));
    expect(new URL(stale.location!).searchParams.get("code")).toBeNull();
    expect(runtime.freshness).toHaveBeenCalled();
    runtime.setClientAllowed(false);
    const maintenance = await runtime.request(runtime.authorization());
    expect(new URL(maintenance.location!).searchParams.get("error")).toBe("temporarily_unavailable");
  });

  it("fails closed when Facts are unavailable after a successful permission check", async () => {
    const runtime = await runtimeFixture({ publishFacts: false });
    const initial = await runtime.authorize();
    expect(new URL(initial.location!).searchParams.get("code")).toEqual(expect.any(String));
    runtime.freshness.mockResolvedValueOnce([]);
    runtime.barrier.mockClear();
    const missing = await runtime.request(runtime.authorization({ scope: "openid iam:authorization" }));
    expect(new URL(missing.location!).searchParams.get("code")).toBeNull();
    expect(new URL(missing.location!).searchParams.get("error")).toBe("temporarily_unavailable");
    expect(runtime.barrier).toHaveBeenCalledTimes(1);
    expect(runtime.cookies.has("global_session")).toBe(true);
  });
});
