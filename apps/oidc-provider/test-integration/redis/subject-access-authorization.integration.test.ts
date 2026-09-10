import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import type { AddressInfo } from "node:net";
import type { OidcProviderRedisTestHarness, OidcProviderRedisTestScope } from "./redis-test-harness.ts";
import { createHash, randomUUID } from "node:crypto";
import { createSubjectAccessBootstrap, createSubjectAccessSessionContext, SubjectAccessPermissionRequiredError } from "@iam/api-core/subject-access";
import { ClientStatus, CustomSsoClientMode, SubjectClaim } from "@iam/contracts";
import { createCustomSsoOperations } from "@iam/custom-sso";
import { AUTHORIZATION_GRANT_REDEMPTION_CLEANUP_KIND, createAuthorizationGrantRedisInspection, createLegacyAuthorizationGrantFixture } from "@iam/custom-sso/testing";
import { createOidcRevocationSelector } from "@iam/domain/client/oidc-revocation-selector";
import { createKernelMaintenanceFixture } from "@iam/session-kernel/testing";
import { createSubjectFactsRedisCache } from "@iam/user-profile-read-model/subject-facts";
import { exportJWK, generateKeyPair } from "jose";
import { errors } from "oidc-provider";
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

interface CommandObservation {
  name: string;
  startedAt: number;
  completedAt: number;
}

async function runtimeFixture(options: { publishFacts?: boolean; renewableRoot?: boolean; observeCommand?: (value: CommandObservation) => void } = {}) {
  // Register the exact keys used by this isolated runtime, including generated Provider IDs.
  const sendCommand = scope.writer.sendCommand.bind(scope.writer);
  vi.spyOn(scope.writer, "sendCommand").mockImplementation((command, stream) => {
    for (const key of command.getKeys())
      scope.trackKey(String(key));
    const startedAt = performance.now();
    const result = sendCommand(command, stream);
    if (options.observeCommand) {
      void Promise.resolve(result).then(() => options.observeCommand?.({ name: command.name, startedAt, completedAt: performance.now() }), () => {});
    }
    return result;
  });
  const subject = randomUUID();
  const client = scope.unique("client");
  const otherClient = scope.unique("other-client");
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
    ...(options.renewableRoot
      ? {
          IAM_OIDC_PROVIDER_SESSION_KERNEL_PRINCIPAL_IDLE_TTL_SECONDS: "300",
          IAM_OIDC_PROVIDER_SESSION_KERNEL_PRINCIPAL_ABSOLUTE_TTL_SECONDS: "600",
        }
      : {}),
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
      findRuntime: async (id: string) => [client, otherClient].includes(id) ? { ...metadata, client_id: id, oidc_config_version: clientVersion } : null,
      findActiveVersion: async (id: string) => [client, otherClient].includes(id) ? clientVersion : null,
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
  async function publishFacts(version: string, role?: string) {
    await createSubjectFactsRedisCache(scope.writer).publish({
      schemaVersion: 3,
      sourceDirtyVersion: version,
      publishedAt: new Date().toISOString(),
      subjectIdentifier: subject,
      profile: { username: "alice", name: "Alice", phone: null },
      facts: { employments: role === undefined
        ? []
        : [{
            isPrimary: true,
            organization: { code: "org", name: "Organization", type: "department", path: [{ code: "org", name: "Organization", type: "department" }] },
            position: { code: "position", name: "Position" },
            responsibilities: [],
            clientAuthorizations: [{ clientCode: client, roles: [{ code: role, privileges: ["read"] }] }],
          }] },
    });
  }
  if (options.publishFacts !== false)
    await publishFacts("1");
  const profileReads = vi.fn(async () => []);
  const query = { from: () => query, where: () => query, limit: profileReads };
  const databaseSelect = vi.fn(() => query);
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  const jwk = { ...await exportJWK(privateKey), alg: "RS256", kid: "current", use: "sig" };
  const runtime = createOidcProviderRuntime({
    env,
    redis: scope.writer,
    logger,
    db: { select: databaseSelect },
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
    env,
    logger,
    stores,
    principal,
    session,
    subject,
    client,
    otherClient,
    barrier,
    renew,
    stage,
    refresh,
    captured,
    profileReads,
    databaseSelect,
    publishFacts,
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
    setClientAllowed(value: boolean) { allowed = value; },
    setClientVersion(value: number) { clientVersion = value; },
  };
}

describe("oIDC Token and UserInfo operations through real Redis and production HTTP routing", () => {
  it.each(["empty", "json", "redis_type"] as const)("issued Code rejects Artifact state failure %s without affecting its peer", async (problem) => {
    const f = await runtimeFixture();
    const code = await f.issueCode();
    const peer = await f.issueCode({ client_id: f.otherClient });
    const artifact = await f.session.kernel.resolveProtocolArtifact(code, { protocol: "oidc", artifactType: "authorization_code" });
    if (artifact.status !== "resolved")
      throw new Error("Expected issued Artifact");
    for (const input of [artifact.value.artifactId, artifact.value.lookupHash]) {
      const denied = await f.exchange(input);
      expect(denied.response.status).toBe(400);
      expect(JSON.parse(denied.body).error).toBe("invalid_grant");
    }
    const inspection = createKernelMaintenanceFixture(scope.observer, f.env.sessionKernel.namespace);
    await inspection.corruptArtifact(artifact.value.artifactId, problem);
    const denied = await f.exchange(code);
    expect(denied.response.status).toBe(problem === "redis_type" ? 500 : 400);
    expect(JSON.parse(denied.body).error).toBe(problem === "redis_type" ? "server_error" : "invalid_grant");
    const retained = await f.exchange(peer, { client_id: f.otherClient });
    expect(retained.response.status).toBe(200);
  });

  it.each(["empty", "json", "redis_type"] as const)("issued AccessToken rejects Credential state failure %s without affecting its peer", async (problem) => {
    const f = await runtimeFixture();
    const issued = await f.exchange(await f.issueCode());
    expect(issued.response.status).toBe(200);
    const token = JSON.parse(issued.body).access_token;
    const peer = JSON.parse((await f.exchange(await f.issueCode({ client_id: f.otherClient }), { client_id: f.otherClient })).body).access_token;
    const credential = await f.session.kernel.resolveCredential(token, { protocol: "oidc", credentialType: "access_token", clientCode: f.client });
    if (credential.status !== "resolved")
      throw new Error("Expected issued Credential");
    for (const input of [credential.value.credentialId, credential.value.lookupHash]) {
      const denied = await f.userInfo(input);
      expect(denied.response.status).toBe(401);
    }
    await createKernelMaintenanceFixture(scope.observer, f.env.sessionKernel.namespace).corruptCredential(credential.value.credentialId, problem);
    const denied = await f.userInfo(token);
    expect(denied.response.status).toBe(problem === "redis_type" ? 500 : 401);
    const retained = await f.userInfo(peer);
    expect(retained.response.status).toBe(200);
  });

  it.each(["token-time", "missing-time", "binding-time", "binding-expired", "credential-time", "credential-subject", "snapshot-subject", "snapshot-session", "snapshot-client"] as const)("rejects inconsistent issued protocol facts: %s", async (problem) => {
    const f = await runtimeFixture();
    const token = JSON.parse((await f.exchange(await f.issueCode())).body).access_token;
    const peer = JSON.parse((await f.exchange(await f.issueCode({ client_id: f.otherClient }), { client_id: f.otherClient })).body).access_token;
    const credential = await f.session.kernel.resolveCredential(token, { protocol: "oidc", credentialType: "access_token", clientCode: f.client });
    if (credential.status !== "resolved" || !credential.value.bindingId)
      throw new Error("Expected Credential and Binding");
    const inspection = createKernelMaintenanceFixture(scope.observer, f.env.sessionKernel.namespace);
    if (problem.startsWith("binding-")) {
      await inspection.corruptBinding(credential.value.bindingId, problem === "binding-time" ? "authentication_time" : "expired");
    }
    else if (problem.startsWith("credential-")) {
      if (problem === "credential-time")
        await inspection.patchCredentialMetadata(credential.value.credentialId, { authTime: Number(credential.value.metadata!.authTime) + 1 });
      else
        await inspection.replaceCredentialSubject(credential.value.credentialId, randomUUID());
    }
    else {
      const key = `oidc:model:AccessToken:${token}`;
      const changed = JSON.parse((await scope.observer.get(key))!);
      if (problem === "token-time") {
        changed.extra.authTime += 1;
      }
      else if (problem === "missing-time") {
        delete changed.extra.authTime;
      }
      else if (problem === "snapshot-subject") {
        changed.extra.claimsSnapshot.subjectIdentifier = randomUUID();
        changed.extra.claimsSnapshot.claims.sub = changed.extra.claimsSnapshot.subjectIdentifier;
      }
      else if (problem === "snapshot-session") {
        changed.extra.claimsSnapshot.principalSessionId = randomUUID();
      }
      else {
        changed.extra.claimsSnapshot.clientId = f.otherClient;
      }
      await scope.observer.set(key, JSON.stringify(changed), "KEEPTTL");
    }
    expect((await f.userInfo(token)).response.status).toBe(401);
    expect((await f.userInfo(peer)).response.status).toBe(200);
    expect((await f.session.kernel.resolvePrincipalSession(f.principal.externalToken!)).status).toBe("resolved");
  });

  it.each(["retained", "revoked", "missing"] as const)("keeps the observed-root issuance boundary with a %s Binding", async (bindingState) => {
    const f = await runtimeFixture({ renewableRoot: true });
    const code = await f.issueCode();
    const payload = JSON.parse((await scope.observer.get(`oidc:model:AuthorizationCode:${code}`))!);
    const bindingId = payload.claimsSnapshot.providerSessionBindingId;
    const inspection = createKernelMaintenanceFixture(scope.observer, f.env.sessionKernel.namespace);
    const writerInspection = createKernelMaintenanceFixture(scope.writer, f.env.sessionKernel.namespace);
    const principalBefore = await f.session.kernel.resolvePrincipalSession(f.principal.externalToken!);
    if (principalBefore.status !== "resolved")
      throw new Error("Expected active root");
    let notifyReached!: () => void;
    const reached = new Promise<void>((resolve) => {
      notifyReached = resolve;
    });
    let pause: ReturnType<typeof writerInspection.pauseNextPrincipalObservation> | undefined;
    const issue = f.session.kernel.issueCredential.bind(f.session.kernel);
    vi.spyOn(f.session.kernel, "issueCredential").mockImplementationOnce((input) => {
      pause = writerInspection.pauseNextPrincipalObservation(input.principalSessionId);
      void pause.reached.then(notifyReached);
      return issue(input);
    });
    const request = f.exchange(code);
    try {
      await reached;
      await inspection.forgetPrincipalChildIndex(f.principal.value.principalSessionId);
      await f.session.kernel.revokePrincipalSession(f.principal.value.principalSessionId, "logout");
      if (bindingState === "revoked")
        await f.session.kernel.revokeBinding(bindingId, "admin_revoke");
      if (bindingState === "missing")
        await inspection.removeObjectPayload("client_binding", bindingId);
      pause!.release();
      const result = await request;
      if (bindingState === "retained") {
        expect(result.response.status).toBe(200);
        const token = JSON.parse(result.body).access_token;
        const credential = await f.session.kernel.resolveCredential(token, { protocol: "oidc", credentialType: "access_token", clientCode: f.client });
        if (credential.status !== "resolved")
          throw new Error("Expected late Credential");
        expect(credential.value.subjectContext).toBe(principalBefore.value.subjectContext);
        expect(credential.value.expiresAt).toBeLessThanOrEqual(principalBefore.value.expiresAt);
        expect(credential.value.expiresAt).toBeLessThanOrEqual(principalBefore.value.absoluteExpiresAt);
        expect((await f.userInfo(token)).response.status).toBe(200);
        await f.session.kernel.revokeCredential(credential.value.credentialId, "admin_revoke");
        expect((await f.userInfo(token)).response.status).toBe(401);
      }
      else {
        expect(result.response.status).toBe(200);
        expect((await f.userInfo(JSON.parse(result.body).access_token)).response.status).toBe(401);
        expect((await f.session.kernel.resolveClientBindingById(bindingId, { protocol: "oidc", clientCode: f.client })).status).toBe(bindingState === "revoked" ? "revoked" : "missing_or_expired");
      }
      expect((await f.session.kernel.resolvePrincipalSession(f.principal.externalToken!)).status).toBe("revoked");
      expect((await f.exchange(code)).response.status).not.toBe(200);
    }
    finally {
      pause?.restore();
      await request;
    }
  });

  it.each(["binding", "credential", "anchor", "payload"] as const)("accepts a missed child after real root revocation but rejects its own invalid %s", async (invalid) => {
    const f = await runtimeFixture();
    const token = JSON.parse((await f.exchange(await f.issueCode())).body).access_token;
    const peerToken = JSON.parse((await f.exchange(await f.issueCode({ client_id: f.otherClient }), { client_id: f.otherClient })).body).access_token;
    const code = await f.issueCode();
    const credential = await f.session.kernel.resolveCredential(token, { protocol: "oidc", credentialType: "access_token", clientCode: f.client });
    if (credential.status !== "resolved" || !credential.value.bindingId)
      throw new Error("Expected issued Credential and Binding");
    const inspection = createKernelMaintenanceFixture(scope.observer, f.env.sessionKernel.namespace);
    const credentialBefore = await inspection.observe("credential", credential.value.credentialId);
    const bindingBefore = await inspection.observe("client_binding", credential.value.bindingId);
    await inspection.forgetPrincipalChildIndex(f.principal.value.principalSessionId);
    const revoked = await f.session.kernel.revokePrincipalSession(f.principal.value.principalSessionId, "logout");
    expect(revoked.principalSessions.revoked).toBe(1);
    const root = await f.session.kernel.resolvePrincipalSession(f.principal.externalToken!);
    expect(root.status).toBe("revoked");
    f.account.findBySubject.mockClear();
    f.barrier.mockClear();
    const rootRead = vi.spyOn(f.session.kernel, "resolvePrincipalSessionById");
    const used = await f.userInfo(token);
    expect(used.response.status).toBe(200);
    expect(JSON.parse(used.body)).toMatchObject({ sub: f.subject });
    expect(rootRead).not.toHaveBeenCalled();
    expect(f.account.findBySubject).not.toHaveBeenCalled();
    expect(f.barrier).toHaveBeenCalledTimes(1);
    expect(await inspection.observe("credential", credential.value.credentialId)).toMatchObject({ payload: credentialBefore.payload, expiresAt: credentialBefore.expiresAt, references: credentialBefore.references });
    expect(await inspection.observe("client_binding", credential.value.bindingId)).toMatchObject({ payload: bindingBefore.payload, expiresAt: bindingBefore.expiresAt });
    const refusedCode = await f.exchange(code);
    expect(refusedCode.response.status).not.toBe(200);
    const codeRecord = JSON.parse((await scope.observer.get(`oidc:model:AuthorizationCode:${code}`))!);
    expect(codeRecord?.consumed).toBeUndefined();
    const authorization = await f.authorize();
    expect(authorization.location && new URL(authorization.location, issuer).searchParams.get("code")).toBeNull();
    if (invalid === "binding") {
      await f.session.kernel.revokeBinding(credential.value.bindingId, "admin_revoke");
    }
    else if (invalid === "credential") {
      await f.session.kernel.revokeCredential(credential.value.credentialId, "admin_revoke");
    }
    else if (invalid === "payload") {
      await f.stores.tokens.revokeAccessToken(`oidc:model:AccessToken:${token}`);
    }
    else {
      const serialized = JSON.parse((await scope.observer.get(`oidc:model:AccessToken:${token}`))!);
      const anchor = await f.session.providerSessionState.readAnchor(serialized.sessionUid);
      await f.session.providerSessionState.destroyProviderSession(serialized.sessionUid, {
        generation: anchor!.generation,
        principalSessionId: f.principal.value.principalSessionId,
      });
    }
    expect((await f.userInfo(token)).response.status).toBe(401);
    if (invalid !== "anchor")
      expect((await f.userInfo(peerToken)).response.status).toBe(200);
  });

  it.each(["UserInfo", "Code exchange"] as const)("observes successful %s Redis command round trips through Provider HTTP", async (entry) => {
    let observations: CommandObservation[] | undefined;
    const f = await runtimeFixture({ observeCommand: value => observations?.push(value) });
    const issued = await f.exchange(await f.issueCode());
    expect(issued.response.status).toBe(200);
    const token = JSON.parse(issued.body).access_token;
    const monitor = await scope.observer.monitor();
    let serverCommands: Array<{ name: string; source: string }> | undefined;
    monitor.on("monitor", (_time, args: string[], source: string) => {
      if (args[0]?.toLowerCase() !== "echo")
        serverCommands?.push({ name: args[0]!.toLowerCase(), source: source === "lua" ? "lua" : "client" });
    });
    async function drainMonitor() {
      const marker = randomUUID();
      const drained = new Promise<void>((resolve) => {
        const onMonitor = (_time: string, args: string[]) => {
          if (args[0]?.toLowerCase() === "echo" && args[1] === marker) {
            monitor.off("monitor", onMonitor);
            resolve();
          }
        };
        monitor.on("monitor", onMonitor);
      });
      await scope.observer.echo(marker);
      await drained;
    }
    try {
      const warmup = entry === "UserInfo" ? await f.userInfo(token) : await f.exchange(await f.issueCode());
      expect(warmup.response.status).toBe(200);
      for (let sample = 0; sample < 5; sample += 1) {
        const code = entry === "Code exchange" ? await f.issueCode() : undefined;
        await drainMonitor();
        observations = [];
        serverCommands = [];
        const startedAt = performance.now();
        const response = code === undefined ? await f.userInfo(token) : await f.exchange(code);
        const requestMs = performance.now() - startedAt;
        expect(response.response.status).toBe(200);
        await drainMonitor();
        const commands = observations;
        observations = undefined;
        let waveEnd = -Infinity;
        let waves = 0;
        for (const value of commands.toSorted((a, b) => a.startedAt - b.startedAt)) {
          if (value.startedAt >= waveEnd)
            waves += 1;
          waveEnd = Math.max(waveEnd, value.completedAt);
        }
        process.stdout.write(`OIDC ${entry} Redis observation ${JSON.stringify({
          sample,
          requestMs,
          waves,
          commands: commands.map(value => ({ name: value.name, startMs: value.startedAt - startedAt, endMs: value.completedAt - startedAt, rttMs: value.completedAt - value.startedAt })),
          serverCommands,
        })}\n`);
        serverCommands = undefined;
      }
    }
    finally {
      observations = undefined;
      monitor.disconnect();
    }
  });

  it("oIDC HTTP authorization renews its root and Binding without extending both same-root Custom SSO Credentials", async () => {
    const f = await runtimeFixture({ renewableRoot: true });
    const code = await f.issueCode();
    const serialized = await scope.observer.get(`oidc:model:AuthorizationCode:${code}`);
    const payload = serialized ? JSON.parse(serialized) : null;
    const bindingId = payload?.claimsSnapshot?.providerSessionBindingId;
    if (!bindingId)
      throw new Error("Expected OIDC Binding");
    const bindingBefore = await f.session.kernel.resolveClientBindingById(bindingId, { protocol: "oidc", clientCode: f.client });
    const credentials = [];
    for (const mode of [CustomSsoClientMode.Independent, CustomSsoClientMode.Gateway]) {
      const rootBeforeAuthorization = await f.session.kernel.resolvePrincipalSession(f.principal.externalToken!);
      const clientCode = scope.unique("custom-sso");
      const redirectUrl = "https://client.example/callback";
      const client = {
        id: 2,
        clientCode,
        clientName: "Fixed lifetime",
        status: ClientStatus.Enable,
        isDelete: false,
        customSsoEnabled: true,
        customSsoConfigVersion: 1,
        customSsoConfig: mode === CustomSsoClientMode.Independent
          ? { mode, subjectClaims: [SubjectClaim.SubjectIdentifier], validRedirectUrls: [redirectUrl], callbackEndpoint: redirectUrl, logoutEndpoint: "https://client.example/logout" }
          : { mode, subjectClaims: [SubjectClaim.SubjectIdentifier], validRedirectUrls: [redirectUrl], orcas: { enabled: false } },
      };
      const custom = createCustomSsoOperations({
        kernel: f.session.kernel,
        clients: { findRuntimeRecord: async () => client },
        clientSecrets: { findSecretRecord: async () => ({ ...client, customSsoSecretHash: "hash" }) },
        secrets: { verify: async () => true },
        traffic: { check: async () => ({ outcome: "enabled" }) },
        subjectProjection: { resolve: async () => ({ subjectIdentifier: f.subject }) },
        permittedUsers: { findOrcasUserBySubjectIdentifier: async () => null },
        orcas: { orcasLogin: async () => { throw new Error("ORCAS is disabled"); } },
        auditLogWriter: { recordAuditLog: async () => {} },
        logger: f.logger,
        random: { uuid: randomUUID },
        config: { authCodeExpireSeconds: 60, localSessionTtlSeconds: 120 },
      });
      const grant = await f.session.operations.run(op => custom.forOperation(op).authorize.execute({ clientCode, redirectUrl, globalSessionToken: f.principal.externalToken!, tokenSource: "cookie" }));
      if (!grant.isLogin)
        throw new Error("Expected Custom SSO authorization");
      const issued = await f.session.operations.run(async op => mode === CustomSsoClientMode.Independent
        ? await custom.forOperation(op).exchangeCode.execute({ clientCode, clientSecret: "secret", code: grant.code, redirectUri: redirectUrl })
        : await custom.forOperation(op).completeCallback.execute({ clientCode, code: grant.code, redirectUrl }));
      const token = "sid" in issued ? issued.sid : issued.token;
      const credentialBefore = await f.session.kernel.resolveCredential(token, { protocol: "custom-sso", credentialType: "local_session", clientCode });
      const rootAfterAuthorization = await f.session.kernel.resolvePrincipalSession(f.principal.externalToken!);
      if (rootBeforeAuthorization.status !== "resolved" || rootAfterAuthorization.status !== "resolved")
        throw new Error("Expected retained root after Custom SSO authorization");
      expect(rootAfterAuthorization.value).toEqual(rootBeforeAuthorization.value);
      credentials.push({ token, clientCode, credentialBefore });
    }
    const rootBefore = await f.session.kernel.resolvePrincipalSession(f.principal.externalToken!);
    f.cookies.clear();
    f.cookies.set("global_session", f.principal.externalToken!);
    await f.issueCode();
    const rootAfter = await f.session.kernel.resolvePrincipalSession(f.principal.externalToken!);
    const bindingAfter = await f.session.kernel.resolveClientBindingById(bindingId, { protocol: "oidc", clientCode: f.client });
    if (rootBefore.status !== "resolved" || rootAfter.status !== "resolved" || bindingBefore.status !== "resolved" || bindingAfter.status !== "resolved")
      throw new Error("Expected retained sessions and Credential");
    expect(rootAfter.value.expiresAt).toBeGreaterThan(rootBefore.value.expiresAt);
    expect(bindingAfter.value.expiresAt).toBeGreaterThan(bindingBefore.value.expiresAt);
    expect(bindingAfter.value.renewalPolicy).toBe("extend_with_principal");
    for (const { token, clientCode, credentialBefore } of credentials) {
      const credentialAfter = await f.session.kernel.resolveCredential(token, { protocol: "custom-sso", credentialType: "local_session", clientCode });
      if (credentialBefore.status !== "resolved" || credentialAfter.status !== "resolved")
        throw new Error("Expected retained Custom SSO Credential");
      expect(credentialAfter.value).toEqual(credentialBefore.value);
      expect(credentialAfter.value.renewalPolicy).toBe("fixed_at_issue");
      expect(credentialAfter.value.principalSessionId).toBe(f.principal.value.principalSessionId);
    }
  });

  it("keeps independently accepted configuration and Gate through Code consumption and token issuance", async () => {
    const f = await runtimeFixture();
    const code = await f.issueCode();
    const config = vi.spyOn(f.stores.clientRuntime, "findRuntime");
    const gate = vi.spyOn(f.stores.clientTrafficGate, "check");
    const consume = f.session.kernel.consumeProtocolArtifact;
    vi.spyOn(f.session.kernel, "consumeProtocolArtifact").mockImplementationOnce(async (...args) => {
      f.setClientVersion(2);
      f.setClientAllowed(false);
      return consume(...args);
    });
    const issued = await f.exchange(code);
    expect(issued.response.status).toBe(200);
    expect(config).toHaveBeenCalledTimes(1);
    expect(gate).toHaveBeenCalledTimes(1);
    const token = JSON.parse(issued.body).access_token;
    const purpose = { protocol: "oidc", credentialType: "access_token", clientCode: f.client };
    const credential = await f.session.kernel.resolveCredential(token, purpose);
    expect(credential).toMatchObject({ status: "resolved", value: { metadata: { oidcConfigVersion: 1 } } });
    const maintained = await f.userInfo(token);
    expect(maintained.response.status).toBe(503);
    const retained = await f.session.kernel.resolveCredential(token, purpose);
    expect(retained.status).toBe("resolved");
    f.setClientAllowed(true);
    const obsolete = await f.userInfo(token);
    expect(obsolete.response.status).toBe(401);
    const removed = await f.session.kernel.resolveCredential(token, purpose);
    expect(removed.status).toBe("revoked");
  });

  it("keeps UserInfo's accepted configuration and Gate across later Binding and Claims callbacks", async () => {
    const f = await runtimeFixture();
    const issued = await f.exchange(await f.issueCode());
    const token = JSON.parse(issued.body).access_token;
    const config = vi.spyOn(f.stores.clientRuntime, "findRuntime");
    const gate = vi.spyOn(f.stores.clientTrafficGate, "check");
    const refresh = f.session.providerSessionState.refresh;
    f.refresh.mockImplementationOnce(async (...args) => {
      f.setClientVersion(2);
      f.setClientAllowed(false);
      return refresh(...args);
    });
    const delivered = await f.userInfo(token);
    expect(delivered.response.status).toBe(200);
    expect(JSON.parse(delivered.body)).toMatchObject({ sub: f.subject });
    expect(config).toHaveBeenCalledTimes(1);
    expect(gate).toHaveBeenCalledTimes(1);
    const denied = await f.userInfo(token);
    expect(denied.response.status).toBe(503);
  });

  it.each(["success", "absent", "config-error", "maintenance", "unavailable", "gate-error", "disabled"] as const)("fixes %s across concurrent callback facades, then reacquires next request", async (result) => {
    const f = await runtimeFixture();
    const issued = await f.exchange(await f.issueCode());
    const token = JSON.parse(issued.body).access_token;
    const readConfig = f.stores.clientRuntime.findRuntime;
    const readGate = f.stores.clientTrafficGate.check;
    let configReady!: () => void;
    let releaseConfig!: () => void;
    let gateReady!: () => void;
    let releaseGate!: () => void;
    const configStarted = new Promise<void>((resolve) => {
      configReady = resolve;
    });
    const configLatch = new Promise<void>((resolve) => {
      releaseConfig = resolve;
    });
    const gateStarted = new Promise<void>((resolve) => {
      gateReady = resolve;
    });
    const gateLatch = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    const failure = new errors.TemporarilyUnavailable();
    const config = vi.spyOn(f.stores.clientRuntime, "findRuntime").mockImplementationOnce(async (client) => {
      const value = await readConfig(client);
      configReady();
      await configLatch;
      if (result === "config-error")
        throw failure;
      return result === "absent" ? null : value;
    });
    const gate = vi.spyOn(f.stores.clientTrafficGate, "check").mockImplementationOnce(async () => {
      gateReady();
      await gateLatch;
      if (result === "gate-error")
        throw failure;
      return { outcome: result === "maintenance" || result === "unavailable" || result === "disabled" ? result : "enabled" };
    });
    const find = RedisOidcAdapter.prototype.find;
    const attempts: unknown[][] = [];
    let retainedScope: ReturnType<typeof f.session.sessions.snapshotsForOperation> | undefined;
    const wrapped = vi.spyOn(RedisOidcAdapter.prototype, "find").mockImplementation(async function (this: RedisOidcAdapter, id) {
      if (id !== token)
        return find.call(this, id);
      const operation = f.bridge.current();
      const first = f.session.sessions.snapshotsForOperation(operation);
      const second = f.session.sessions.snapshotsForOperation(operation);
      retainedScope = first;
      attempts.push(await Promise.all([
        first.clients.findRuntime(f.client).catch(error => error),
        second.clients.findRuntime(f.client).catch(error => error),
      ]));
      attempts.push(await Promise.all([
        first.traffic!.check(f.client).catch(error => error),
        second.traffic!.check(f.client).catch(error => error),
      ]));
      // Source recovery cannot alter a decision already taken by this operation.
      config.mockImplementation(readConfig);
      gate.mockImplementation(readGate);
      return find.call(this, id);
    });
    const pending = f.userInfo(token);
    await configStarted;
    expect(config).toHaveBeenCalledTimes(1);
    // Config and Gate are separate acquisitions: Gate has not started yet.
    expect(gate).not.toHaveBeenCalled();
    releaseConfig();
    await gateStarted;
    expect(gate).toHaveBeenCalledTimes(1);
    releaseGate();
    const response = await pending;
    expect(response.response.status).toBe(result === "success" ? 200 : result === "absent" || result === "disabled" ? 401 : result.endsWith("error") ? 400 : 503);
    if (result.endsWith("error"))
      expect(JSON.parse(response.body).error).toBe("temporarily_unavailable");
    expect(config).toHaveBeenCalledTimes(1);
    expect(gate).toHaveBeenCalledTimes(1);
    for (const pair of attempts) expect(pair[1]).toBe(pair[0]);
    wrapped.mockRestore();
    const closedConfig = await retainedScope!.clients.findRuntime(f.client).catch(error => error);
    const closedGate = await retainedScope!.traffic!.check(f.client).catch(error => error);
    expect(closedConfig).toBeInstanceOf(SubjectAccessPermissionRequiredError);
    expect(closedGate).toBeInstanceOf(SubjectAccessPermissionRequiredError);
    const state = await f.session.kernel.resolveCredential(token, { protocol: "oidc", credentialType: "access_token", clientCode: f.client });
    expect(state.status).toBe(result === "absent" ? "revoked" : "resolved");
    if (result !== "absent") {
      const next = await f.userInfo(token);
      expect(next.response.status).toBe(200);
      expect(config).toHaveBeenCalledTimes(2);
      expect(gate).toHaveBeenCalledTimes(2);
    }
    else {
      const next = await f.exchange(await f.issueCode());
      expect(next.response.status).toBe(200);
      expect(config.mock.calls.length).toBeGreaterThan(1);
    }
  });

  it.each(["code", "credential"] as const)("rejects a newer %s against an older operation snapshot without revoking it", async (kind) => {
    const f = await runtimeFixture();
    f.setClientVersion(2);
    const code = await f.issueCode();
    const token = kind === "code" ? code : JSON.parse((await f.exchange(code)).body).access_token;
    f.setClientVersion(1);
    const denied = kind === "code" ? await f.exchange(token) : await f.userInfo(token);
    expect(denied.response.status).toBe(kind === "code" ? 400 : 401);
    const object = kind === "code"
      ? await f.session.kernel.resolveProtocolArtifact(token, { protocol: "oidc", artifactType: "authorization_code", clientCode: f.client })
      : await f.session.kernel.resolveCredential(token, { protocol: "oidc", credentialType: "access_token", clientCode: f.client });
    expect(object).toMatchObject({ status: "resolved", value: { metadata: { oidcConfigVersion: 2 } } });
    f.setClientVersion(2);
    const next = kind === "code" ? await f.exchange(token) : await f.userInfo(token);
    expect(next.response.status).toBe(200);
  });

  it("preserves newer Binding and Provider Grant objects when a snapshot is older", async () => {
    const f = await runtimeFixture();
    f.setClientVersion(2);
    const code = await f.issueCode();
    const serialized = await scope.observer.get(`oidc:model:AuthorizationCode:${code}`);
    if (!serialized)
      throw new Error("expected Code");
    const payload = JSON.parse(serialized);
    const grantKey = `oidc:model:Grant:${payload.grantId}`;
    const grantBefore = await scope.observer.get(grantKey);
    expect(grantBefore).not.toBeNull();
    f.setClientVersion(1);
    const denied = await f.bridge.run(async (operation) => {
      const session = f.session.sessions.forOperation(operation);
      return {
        binding: await session.readForAuthorization(payload.claimsSnapshot.providerSessionUid, f.client),
        grant: await f.provider.Grant.find(payload.grantId),
      };
    });
    expect(denied.binding).toBeNull();
    expect(denied.grant).toBeUndefined();
    const binding = await f.session.kernel.resolveClientBindingById(payload.claimsSnapshot.providerSessionBindingId, { protocol: "oidc", clientCode: f.client });
    expect(binding).toMatchObject({ status: "resolved", value: { metadata: { oidcConfigVersion: 2 } } });
    const grantAfter = await scope.observer.get(grantKey);
    expect(grantAfter).toBe(grantBefore);
    f.setClientVersion(2);
    const next = await f.exchange(code);
    expect(next.response.status).toBe(200);
  });

  it("preserves a replacement Provider payload when an observed Grant fails its delayed configuration read", async () => {
    const f = await runtimeFixture();
    const code = await f.issueCode();
    const codePayload = await scope.observer.get(`oidc:model:AuthorizationCode:${code}`);
    if (!codePayload)
      throw new Error("expected Code");
    const grantId = JSON.parse(codePayload).grantId;
    const grantKey = `oidc:model:Grant:${grantId}`;
    let reached!: () => void;
    let release!: () => void;
    const paused = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const latch = new Promise<void>((resolve) => {
      release = resolve;
    });
    const readConfig = f.stores.clientRuntime.findRuntime;
    vi.spyOn(f.stores.clientRuntime, "findRuntime").mockImplementationOnce(async (client) => {
      reached();
      await latch;
      return readConfig(client);
    });
    const pending = f.bridge.run(async () => f.provider.Grant.find(grantId));
    await paused;
    try {
      f.setClientVersion(2);
      const freshCode = await f.issueCode();
      const freshCodePayload = await scope.observer.get(`oidc:model:AuthorizationCode:${freshCode}`);
      if (!freshCodePayload)
        throw new Error("expected fresh Code");
      const freshGrantId = JSON.parse(freshCodePayload).grantId;
      const freshGrant = await scope.observer.get(`oidc:model:Grant:${freshGrantId}`);
      if (!freshGrant)
        throw new Error("expected fresh Grant");
      const replacement = JSON.stringify({ ...JSON.parse(freshGrant), jti: grantId });
      await scope.observer.set(grantKey, replacement, "KEEPTTL");
      release();
      const denied = await pending;
      expect(denied).toBeUndefined();
      const retained = await scope.observer.get(grantKey);
      expect(retained).toBe(replacement);
      const next = await f.bridge.run(async () => f.provider.Grant.find(grantId));
      expect(next).toBeDefined();
    }
    finally {
      release();
      await pending;
    }
  });

  it("rejects completion of a pending acquisition after its HTTP operation is closed", async () => {
    const f = await runtimeFixture();
    const issued = await f.exchange(await f.issueCode());
    const token = JSON.parse(issued.body).access_token;
    const config = f.stores.clientRuntime.findRuntime;
    vi.spyOn(f.stores.clientRuntime, "findRuntime").mockImplementationOnce(async (client) => {
      const value = await config(client);
      f.bridge.current().close();
      return value;
    });
    const response = await f.userInfo(token);
    expect(response.response.status).toBe(500);
    const retained = await f.session.kernel.resolveCredential(token, { protocol: "oidc", credentialType: "access_token", clientCode: f.client });
    expect(retained.status).toBe("resolved");
    const next = await f.userInfo(token);
    expect(next.response.status).toBe(200);
  });
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

  it("keeps issued claims after new Facts are published and uses new Facts on the next authorization", async () => {
    const runtime = await runtimeFixture();
    await runtime.publishFacts("2", "operator");
    const code = await runtime.issueCode({ scope: "openid profile iam:authorization" });
    await runtime.publishFacts("3", "auditor");
    const issued = await runtime.exchange(code);
    expect(issued.response.status).toBe(200);
    const info = await runtime.userInfo(JSON.parse(issued.body).access_token);
    expect(info.response.status).toBe(200);
    expect(JSON.parse(info.body)).toMatchObject({ "sub": runtime.subject, "name": "Alice", "iam:authorization": { roles: ["operator"] } });
    const nextIssued = await runtime.exchange(await runtime.issueCode({ scope: "openid profile iam:authorization" }));
    expect(nextIssued.response.status).toBe(200);
    const nextInfo = await runtime.userInfo(JSON.parse(nextIssued.body).access_token);
    expect(nextInfo.response.status).toBe(200);
    expect(JSON.parse(nextInfo.body)).toMatchObject({ "iam:authorization": { roles: ["auditor"] } });
    expect(runtime.databaseSelect).not.toHaveBeenCalled();
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
  it("isolates concurrent native login guards and preserves a newer Return Handle", async () => {
    const f = await runtimeFixture();
    f.setClientVersion(2);
    const principalToken = f.cookies.get("global_session")!;
    f.cookies.delete("global_session");
    const auth = await f.request(f.authorization());
    const login = await f.request(auth.location!);
    const handle = new URL(login.location!).searchParams.get("oidcReturn")!;
    const path = `/oidc/login-guard?oidcReturn=${encodeURIComponent(handle)}`;
    f.cookies.set("global_session", principalToken);
    f.setClientVersion(1);
    const old = await f.request(path);
    expect(old.response.status).toBe(400);
    const retained = await f.session.kernel.resolveProtocolArtifact(handle, { protocol: "oidc", artifactType: "login_return_handle", clientCode: f.client });
    expect(retained).toMatchObject({ status: "resolved", value: { metadata: { oidcConfigVersion: 2 } } });
    f.setClientVersion(2);
    f.captured.splice(0);
    const config = vi.spyOn(f.stores.clientRuntime, "findRuntime");
    const gate = vi.spyOn(f.stores.clientTrafficGate, "check");
    const replies = await Promise.all([f.request(path, new Map(f.cookies)), f.request(path, new Map(f.cookies))]);
    expect(replies.map(reply => reply.response.status)).toEqual([200, 200]);
    expect(config).toHaveBeenCalledTimes(2);
    expect(gate).toHaveBeenCalledTimes(2);
    expect(new Set(f.captured).size).toBe(2);
    for (const operation of f.captured)
      expect(() => f.session.sessions.snapshotsForOperation(operation)).toThrow(SubjectAccessPermissionRequiredError);
  });
  it.each(["interaction", "login-guard", "resume"] as const)("shares configuration and Gate across native %s and its Provider callbacks", async (entry) => {
    const f = await runtimeFixture();
    let path: string;
    if (entry === "interaction") {
      path = (await f.request(f.authorization())).location!;
    }
    else {
      const principalToken = f.cookies.get("global_session")!;
      f.cookies.delete("global_session");
      const auth = await f.request(f.authorization());
      const login = await f.request(auth.location!);
      const handle = new URL(login.location!).searchParams.get("oidcReturn")!;
      path = `/oidc/${entry}?oidcReturn=${encodeURIComponent(handle)}`;
      f.cookies.set("global_session", principalToken);
    }
    f.captured.splice(0);
    const readConfig = f.stores.clientRuntime.findRuntime;
    const readGate = f.stores.clientTrafficGate.check;
    let configAccepted = false;
    let gateAccepted = false;
    const shiftAfterBothAcquisitions = () => {
      if (configAccepted && gateAccepted) {
        f.setClientVersion(2);
        f.setClientAllowed(false);
      }
    };
    const config = vi.spyOn(f.stores.clientRuntime, "findRuntime").mockImplementation(async (client) => {
      const value = await readConfig(client);
      configAccepted = true;
      shiftAfterBothAcquisitions();
      return value;
    });
    const gate = vi.spyOn(f.stores.clientTrafficGate, "check").mockImplementation(async () => {
      const value = await readGate();
      gateAccepted = true;
      shiftAfterBothAcquisitions();
      return value;
    });
    const result = await f.request(path);
    expect(result.response.status).toBe(entry === "interaction" ? 303 : entry === "login-guard" ? 200 : 302);
    expect(config).toHaveBeenCalledTimes(1);
    expect(gate).toHaveBeenCalledTimes(1);
    expect(f.captured).toHaveLength(1);
    expect(f.cookies.has("global_session")).toBe(true);
    expect(() => f.session.sessions.snapshotsForOperation(f.captured[0]!)).toThrow(SubjectAccessPermissionRequiredError);
    const root = await f.session.kernel.resolvePrincipalSession(f.principal.externalToken!);
    expect(root.status).toBe("resolved");
    if (entry !== "resume") {
      config.mockImplementation(readConfig);
      gate.mockImplementation(readGate);
      f.setClientAllowed(true);
      const next = await f.request(path);
      expect(next.response.status).toBeGreaterThanOrEqual(400);
      expect(config).toHaveBeenCalledTimes(2);
    }
  });
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

  it("delivers cached authorization without PostgreSQL while retaining client scope and traffic gates", async () => {
    const runtime = await runtimeFixture();
    const initial = await runtime.authorize();
    expect(new URL(initial.location!).searchParams.get("code")).toEqual(expect.any(String));
    const projected = await runtime.request(runtime.authorization({ scope: "openid iam:authorization" }));
    expect(new URL(projected.location!).searchParams.get("code")).toEqual(expect.any(String));
    expect(runtime.databaseSelect).not.toHaveBeenCalled();
    const invalidScope = await runtime.request(runtime.authorization({ scope: "openid phone" }));
    expect(new URL(invalidScope.location!).searchParams.get("error")).toBe("invalid_scope");
    runtime.setClientAllowed(false);
    const maintenance = await runtime.request(runtime.authorization());
    expect(new URL(maintenance.location!).searchParams.get("error")).toBe("temporarily_unavailable");
  });

  it("fails closed when Facts are unavailable after a successful permission check", async () => {
    const runtime = await runtimeFixture({ publishFacts: false });
    const initial = await runtime.authorize();
    expect(new URL(initial.location!).searchParams.get("code")).toEqual(expect.any(String));
    runtime.barrier.mockClear();
    const missing = await runtime.request(runtime.authorization({ scope: "openid iam:authorization" }));
    expect(new URL(missing.location!).searchParams.get("code")).toBeNull();
    expect(new URL(missing.location!).searchParams.get("error")).toBe("temporarily_unavailable");
    expect(runtime.barrier).toHaveBeenCalledTimes(1);
    expect(runtime.cookies.has("global_session")).toBe(true);
    expect(runtime.profileReads).toHaveBeenCalledTimes(1);
  });
});

describe("oIDC protocol purpose isolation", () => {
  it("rejects Custom SSO bearer and code at real HTTP entries without consuming or revoking any scope", async () => {
    const f = await runtimeFixture();
    const second = await f.session.kernel.createPrincipalSession(randomUUID(), { subjectContext: "other-user" });
    const third = await f.session.kernel.createPrincipalSession(randomUUID(), { subjectContext: "other-client" });
    if (second.status !== "created" || third.status !== "created")
      throw new Error("expected control roots");
    const credentials = [];
    const codes = [];
    const grants = createLegacyAuthorizationGrantFixture({ redis: scope.writer });
    const grantInspection = createAuthorizationGrantRedisInspection(scope.writer);
    for (const [root, clientCode] of [[f.principal.value, f.client], [second.value, f.client], [third.value, `${f.client}-other`]] as const) {
      const credential = await f.session.kernel.issueCredential({
        principalSessionId: root.principalSessionId,
        protocol: "custom-sso",
        clientCode,
        credentialType: "local_session",
        ttlMs: 60_000,
        metadata: { version: 2, configVersion: 1, mode: "gateway" },
      });
      const grantId = randomUUID();
      const code = await f.session.kernel.createProtocolArtifact({
        artifactId: grantId,
        cleanupRefs: [{ protocol: "custom-sso", kind: AUTHORIZATION_GRANT_REDEMPTION_CLEANUP_KIND, ref: grantId }],
        principalSessionId: root.principalSessionId,
        protocol: "custom-sso",
        clientCode,
        artifactType: "auth_code",
        ttlMs: 60_000,
        tokenKind: "authCode",
        metadata: { version: 2, subjectIdentifier: root.principal.subjectId, clientCode, configVersion: 1, redirectUri: "https://client.example/callback", mode: "gateway" },
      });
      if (credential.status !== "created" || code.status !== "created")
        throw new Error("expected Custom SSO objects");
      await grants.initialize({ version: 1, state: "issued", grantId, expiresAt: code.value.expiresAt });
      const initialized = await grantInspection.inspect(grantId);
      expect(initialized).toMatchObject({ state: "issued", expiresAt: code.value.expiresAt });
      credentials.push(credential);
      codes.push(code);
    }
    f.barrier.mockClear();
    const bearer = await f.userInfo(credentials[0]!.externalToken!);
    expect(bearer.response.status).toBe(401);
    const resume = await f.request(`/oidc/resume?oidcReturn=${codes[0]!.externalToken}`, new Map());
    expect(resume.response.status).toBeGreaterThanOrEqual(400);
    expect(f.barrier).not.toHaveBeenCalled();
    for (const credential of credentials) {
      const retained = await f.session.kernel.resolveCredential(credential.externalToken!, credential.value);
      expect(retained).toMatchObject({ status: "resolved", value: JSON.parse(JSON.stringify(credential.value)) });
    }
    for (const code of codes) {
      const retained = await f.session.kernel.resolveProtocolArtifact(code.externalToken!, code.value);
      expect(retained).toMatchObject({ status: "resolved", value: JSON.parse(JSON.stringify(code.value)) });
      const grant = await grantInspection.inspect(code.value.artifactId);
      expect(grant).toMatchObject({ state: "issued" });
    }
    for (const root of [f.principal, second, third]) {
      const retained = await f.session.kernel.resolvePrincipalSession(root.externalToken!);
      expect(retained.status).toBe("resolved");
    }
  });

  it("keeps a Code with wrong redirect and rejects its later permanent version failure precisely", async () => {
    const f = await runtimeFixture();
    const code = await f.issueCode();
    const purpose = { protocol: "oidc", artifactType: "authorization_code", clientCode: f.client };
    f.setClientVersion(2);
    const wrongClient = await f.exchange(code, { client_id: f.otherClient });
    expect(wrongClient.response.status).toBe(400);
    const afterWrongClient = await f.session.kernel.resolveProtocolArtifact(code, purpose);
    expect(afterWrongClient.status).toBe("resolved");
    const wrong = await f.exchange(code, { redirect_uri: "https://wrong.example/callback" });
    expect(wrong.response.status).toBe(400);
    const retained = await f.session.kernel.resolveProtocolArtifact(code, purpose);
    expect(retained.status).toBe("resolved");
    const correct = await f.exchange(code);
    expect(correct.response.status).toBe(400);
    const revoked = await f.session.kernel.resolveProtocolArtifact(code, purpose);
    expect(revoked.status).toBe("revoked");
    const root = await f.session.kernel.resolvePrincipalSession(f.principal.externalToken!);
    expect(root.status).toBe("resolved");
  });

  it("keeps Return Handle and browser cookies when maintenance blocks an expired configuration", async () => {
    const f = await runtimeFixture();
    const payload = { browserBinding: "browser", clientId: f.client, interactionUid: "interaction", oidcConfigVersion: 1, returnTarget: `${issuer}/resume` };
    const handle = await f.session.operations.run(operation => f.session.sessions.forOperation(operation).create(payload, 60));
    if (!handle)
      throw new Error("expected handle");
    f.setClientVersion(2);
    f.setClientAllowed(false);
    const jar = new Map([["oidc_interaction_binding", "browser"]]);
    const denied = await f.request(`/oidc/resume?oidcReturn=${handle}`, jar);
    expect(denied.response.status).toBe(503);
    const retained = await f.session.kernel.resolveProtocolArtifact(handle, { protocol: "oidc", artifactType: "login_return_handle", clientCode: f.client });
    expect(retained.status).toBe("resolved");
    expect(denied.response.headers.getSetCookie()).toEqual([]);
  });
  it("a paused old UserInfo request preserves protocol-issued access after version-selected cleanup", async () => {
    const f = await runtimeFixture();
    const code = await f.issueCode();
    const exchanged = await f.exchange(code);
    expect(exchanged.response.status).toBe(200);
    const oldToken = JSON.parse(exchanged.body).access_token as string;
    const otherRoot = await f.session.kernel.createPrincipalSession(randomUUID(), { subjectContext: "control" });
    if (otherRoot.status !== "created")
      throw new Error("expected control root");
    const controlCredential = await f.session.kernel.issueCredential({
      principalSessionId: otherRoot.value.principalSessionId,
      protocol: "oidc",
      clientCode: f.client,
      credentialType: "access_token",
      ttlMs: 60_000,
      metadata: { oidcConfigVersion: 2 },
    });
    if (controlCredential.status !== "created")
      throw new Error("expected control Credential");
    const controlToken = controlCredential.externalToken!;
    const otherClient = await f.session.kernel.issueCredential({
      principalSessionId: otherRoot.value.principalSessionId,
      protocol: "oidc",
      clientCode: `${f.client}-control`,
      credentialType: "access_token",
      metadata: { oidcConfigVersion: 1 },
    });
    if (otherClient.status !== "created" || !otherClient.externalToken)
      throw new Error("expected other Client Credential");
    const purpose = { protocol: "oidc", credentialType: "access_token", clientCode: f.client };
    const old = await f.session.kernel.resolveCredential(oldToken, purpose);
    if (old.status !== "resolved")
      throw new Error("expected old Credential");
    let reached!: () => void;
    let release!: () => void;
    const paused = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const resume = new Promise<void>((resolve) => {
      release = resolve;
    });
    const findVersion = f.stores.clientRuntime.findRuntime;
    const versionRead = vi.spyOn(f.stores.clientRuntime, "findRuntime");
    versionRead.mockImplementationOnce(async () => {
      reached();
      await resume;
      return { ...await findVersion(f.client), oidc_config_version: 2 } as Awaited<ReturnType<typeof findVersion>>;
    });
    const pending = f.userInfo(oldToken);
    await paused;
    try {
      f.setClientVersion(2);
      await f.session.kernel.revokeSelectedClientProtocolObjects(f.client, "oidc", createOidcRevocationSelector(2), "client_config_changed");
      const cleaned = await f.session.kernel.resolveCredential(oldToken, purpose);
      expect(cleaned.status).toBe("revoked");
      versionRead.mockImplementation(findVersion);
      const freshCode = await f.issueCode();
      const freshExchange = await f.exchange(freshCode);
      expect(freshExchange.response.status).toBe(200);
      const freshToken = JSON.parse(freshExchange.body).access_token as string;
      release();
      const denied = await pending;
      expect(denied.response.status).toBe(401);
      const fresh = await f.userInfo(freshToken);
      expect(fresh.response.status).toBe(200);
      const control = await f.session.kernel.resolveCredential(controlToken, purpose);
      expect(control.status).toBe("resolved");
      const root = await f.session.kernel.resolvePrincipalSession(f.principal.externalToken!);
      expect(root.status).toBe("resolved");
      const other = await f.session.kernel.resolveCredential(otherClient.externalToken, { protocol: "oidc", credentialType: "access_token" });
      const controlRoot = await f.session.kernel.resolvePrincipalSessionById(otherRoot.value.principalSessionId);
      expect([other.status, controlRoot.status]).toEqual(["resolved", "resolved"]);
      const late = await f.userInfo(oldToken);
      expect(late.response.status).toBe(401);
    }
    finally {
      release();
      await pending;
    }
  });

  it.each(["unavailable", "cleanup-failure"] as const)("rejects %s without granting access or revoking controls", async (failure) => {
    const f = await runtimeFixture();
    const exchanged = await f.exchange(await f.issueCode());
    const token = JSON.parse(exchanged.body).access_token as string;
    const purpose = { protocol: "oidc", credentialType: "access_token", clientCode: f.client };
    const revoke = vi.spyOn(f.session.kernel, "revokeObservedObject");
    if (failure === "unavailable") {
      vi.spyOn(f.stores.clientRuntime, "findRuntime").mockRejectedValue(new Error("reader unavailable"));
    }
    else {
      f.setClientVersion(2);
      revoke.mockRejectedValue(new Error("cleanup unavailable"));
    }
    const denied = await f.userInfo(token);
    expect(denied.response.status).toBeGreaterThanOrEqual(400);
    if (failure === "unavailable")
      expect(revoke).not.toHaveBeenCalled();
    else
      expect(revoke).toHaveBeenCalledOnce();
    const retained = await f.session.kernel.resolveCredential(token, purpose);
    expect(retained.status).toBe("resolved");
    const root = await f.session.kernel.resolvePrincipalSession(f.principal.externalToken!);
    expect(root.status).toBe("resolved");
  });
  it.each(["kernel", "provider", "both"] as const)("does not mark a replacement Code consumed when %s state changes after find", async (replacement) => {
    const f = await runtimeFixture();
    const code = await f.issueCode();
    const purpose = { protocol: "oidc", clientCode: f.client, artifactType: "authorization_code" };
    const original = await f.session.kernel.resolveProtocolArtifact(code, purpose);
    if (original.status !== "resolved")
      throw new Error("expected original Kernel Artifact");
    const providerKey = `oidc:model:AuthorizationCode:${code}`;
    const markerKey = `oidc:consumed:AuthorizationCode:${code}`;
    const originalPayload = await scope.observer.get(providerKey);
    if (!originalPayload)
      throw new Error("expected original Provider Code");
    let reached!: () => void;
    let release!: () => void;
    const paused = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const resume = new Promise<void>((resolve) => {
      release = resolve;
    });
    const Code = f.provider.AuthorizationCode;
    const consume = Code.prototype.consume;
    vi.spyOn(Code.prototype, "consume").mockImplementationOnce(async function (this: InstanceType<typeof Code>) {
      reached();
      await resume;
      return await consume.call(this);
    });
    const pending = f.exchange(code);
    await paused;
    let replacementPayload = originalPayload;
    try {
      if (replacement !== "provider") {
        const inspection = createKernelMaintenanceFixture(scope.observer, f.env.sessionKernel.namespace);
        await inspection.expireArtifactGeneration(original.value);
        const created = await f.session.kernel.createProtocolArtifact({
          artifactId: original.value.artifactId,
          externalToken: code,
          protocol: original.value.protocol,
          clientCode: original.value.clientCode,
          artifactType: original.value.artifactType,
          principalSessionId: original.value.principalSessionId,
          bindingId: original.value.bindingId,
          cleanupRefs: original.value.cleanupRefs,
          metadata: { ...original.value.metadata, nonce: "replacement" },
          ttlMs: 60_000,
        });
        expect(created.status).toBe("created");
      }
      if (replacement !== "kernel") {
        // Fault injection changes one field of a Code issued by the real Provider.
        replacementPayload = JSON.stringify({ ...JSON.parse(originalPayload), nonce: "replacement" });
        await scope.observer.set(providerKey, replacementPayload, "KEEPTTL");
      }
      release();
      const denied = await pending;
      expect(denied.response.status).toBeGreaterThanOrEqual(400);
      expect(JSON.parse(denied.body)).not.toHaveProperty("access_token");
      const marker = await scope.observer.get(markerKey);
      expect(marker).toBeNull();
      const retainedPayload = await scope.observer.get(providerKey);
      expect(retainedPayload).toBe(replacementPayload);
      const retained = await f.session.kernel.resolveProtocolArtifact(code, purpose);
      expect(retained.status).toBe("resolved");
      if (retained.status === "resolved")
        expect(retained.value.artifactId).toBe(original.value.artifactId);
      const root = await f.session.kernel.resolvePrincipalSession(f.principal.externalToken!);
      expect(root.status).toBe("resolved");
      const next = await f.exchange(code);
      expect(next.response.status).toBe(200);
    }
    finally {
      release();
      await pending;
    }
  });

  it.each(["permanent", "maintenance"] as const)("binding.read handles %s configuration failure without widening the cascade", async (failure) => {
    const f = await runtimeFixture();
    const tokenResponse = await f.exchange(await f.issueCode());
    expect(tokenResponse.response.status).toBe(200);
    const token = JSON.parse(tokenResponse.body).access_token as string;
    const code = await f.issueCode();
    const credential = await f.session.kernel.resolveCredential(token, { protocol: "oidc", credentialType: "access_token", clientCode: f.client });
    if (credential.status !== "resolved" || !credential.value.bindingId)
      throw new Error("expected target Credential");
    const binding = await f.session.kernel.resolveClientBindingById(credential.value.bindingId, { protocol: "oidc", clientCode: f.client });
    if (binding.status !== "resolved")
      throw new Error("expected target Binding");
    const providerSessionUid = String(binding.value.metadata?.providerSessionUid);
    const controls = [];
    for (const clientCode of [f.client, f.otherClient]) {
      const subject = randomUUID();
      await createSubjectAccessBootstrap({ redis: scope.writer, random: { uuid: randomUUID } }).seedMany(
        [{ subjectIdentifier: subject, state: "enabled" }],
        new Date(),
      );
      const control = await f.session.operations.run(async (operation) => {
        const permission = await operation.acquireForAuthentication(subject);
        const root = await f.session.kernel.createPrincipalSession(subject, createSubjectAccessSessionContext(operation, permission));
        if (root.status !== "created")
          throw new Error("expected control Principal");
        const childBinding = await f.session.kernel.createClientBinding({ principalSessionId: root.value.principalSessionId, protocol: "oidc", clientCode, metadata: { oidcConfigVersion: 1 } });
        if (childBinding.status !== "created")
          throw new Error("expected control Binding");
        const childCode = await f.session.kernel.createProtocolArtifact({ principalSessionId: root.value.principalSessionId, bindingId: childBinding.value.bindingId, protocol: "oidc", clientCode, artifactType: "authorization_code", ttlMs: 60_000, metadata: { oidcConfigVersion: 1 } });
        const childToken = await f.session.kernel.issueCredential({ principalSessionId: root.value.principalSessionId, bindingId: childBinding.value.bindingId, protocol: "oidc", clientCode, credentialType: "access_token", ttlMs: 60_000, metadata: { oidcConfigVersion: 1 } });
        if (childCode.status !== "created" || childToken.status !== "created")
          throw new Error("expected control Code and Credential");
        return { root, binding: childBinding, code: childCode, credential: childToken };
      });
      controls.push(control);
    }
    f.setClientVersion(2);
    if (failure === "maintenance")
      f.setClientAllowed(false);
    const outcome = await f.session.operations.run(operation => f.session.sessions.forOperation(operation).readForAuthorization(providerSessionUid, f.client)).catch(error => error);
    if (failure === "permanent")
      expect(outcome).toBeNull();
    else
      expect(outcome).toBeInstanceOf(Error);
    const expectedStatus = failure === "permanent" ? "revoked" : "resolved";
    const targetBinding = await f.session.kernel.resolveClientBindingById(binding.value.bindingId, { protocol: "oidc", clientCode: f.client });
    const targetCode = await f.session.kernel.resolveProtocolArtifact(code, { protocol: "oidc", clientCode: f.client, artifactType: "authorization_code" });
    const targetToken = await f.session.kernel.resolveCredential(token, { protocol: "oidc", clientCode: f.client, credentialType: "access_token" });
    expect(targetBinding.status).toBe(expectedStatus);
    expect(targetCode.status).toBe(expectedStatus);
    expect(targetToken.status).toBe(expectedStatus);
    const codePayload = await scope.observer.get(`oidc:model:AuthorizationCode:${code}`);
    const tokenPayload = await scope.observer.get(String(credential.value.metadata?.providerTokenKey));
    if (failure === "permanent") {
      expect(codePayload).toBeNull();
      expect(tokenPayload).toBeNull();
    }
    else {
      expect(codePayload).not.toBeNull();
      expect(tokenPayload).not.toBeNull();
    }
    for (const control of controls) {
      const controlBinding = await f.session.kernel.resolveClientBindingById(control.binding.value.bindingId, control.binding.value);
      const controlCode = await f.session.kernel.resolveProtocolArtifact(control.code.externalToken!, control.code.value);
      const controlToken = await f.session.kernel.resolveCredential(control.credential.externalToken!, control.credential.value);
      const root = await f.session.kernel.resolvePrincipalSession(control.root.externalToken!);
      expect([controlBinding.status, controlCode.status, controlToken.status, root.status]).toEqual(["resolved", "resolved", "resolved", "resolved"]);
    }
    const root = await f.session.kernel.resolvePrincipalSession(f.principal.externalToken!);
    expect(root.status).toBe("resolved");
  });
  it("does not write a marker onto a Provider Code replaced after Kernel consumption", async () => {
    const f = await runtimeFixture();
    const code = await f.issueCode();
    const providerKey = `oidc:model:AuthorizationCode:${code}`;
    const markerKey = `oidc:consumed:AuthorizationCode:${code}`;
    const originalPayload = await scope.observer.get(providerKey);
    if (!originalPayload)
      throw new Error("expected Provider Code");
    let reached!: () => void;
    let release!: () => void;
    const paused = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const resume = new Promise<void>((resolve) => {
      release = resolve;
    });
    const consume = f.session.kernel.consumeProtocolArtifact;
    vi.spyOn(f.session.kernel, "consumeProtocolArtifact").mockImplementationOnce(async (...args) => {
      const result = await consume(...args);
      expect(result.status).toBe("resolved");
      reached();
      await resume;
      return result;
    });
    const pending = f.exchange(code);
    await paused;
    try {
      const replacementPayload = JSON.stringify({ ...JSON.parse(originalPayload), nonce: "late-replacement" });
      await scope.observer.set(providerKey, replacementPayload, "KEEPTTL");
      release();
      const denied = await pending;
      expect(denied.response.status).toBeGreaterThanOrEqual(400);
      const marker = await scope.observer.get(markerKey);
      const retained = await scope.observer.get(providerKey);
      expect(marker).toBeNull();
      expect(retained).toBe(replacementPayload);
      // The earlier Kernel transition remains committed; this is not a two-owner rollback.
      const artifact = await f.session.kernel.resolveProtocolArtifact(code, { protocol: "oidc", clientCode: f.client, artifactType: "authorization_code" });
      expect(artifact.status).toBe("consumed_replay");
    }
    finally {
      release();
      await pending;
    }
  });
  it.each(["live", "consumed"] as const)("preserves a %s new Code generation when an old Provider payload fails its delayed version read", async (replacementState) => {
    const f = await runtimeFixture();
    const code = await f.issueCode();
    const purpose = { protocol: "oidc", clientCode: f.client, artifactType: "authorization_code" };
    const original = await f.session.kernel.resolveProtocolArtifact(code, purpose);
    if (original.status !== "resolved")
      throw new Error("expected original Kernel Artifact");
    const providerKey = `oidc:model:AuthorizationCode:${code}`;
    const markerKey = `oidc:consumed:AuthorizationCode:${code}`;
    let reached!: () => void;
    let release!: () => void;
    const paused = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const resume = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.setClientVersion(2);
    const revoke = f.session.kernel.revokeObservedObject;
    vi.spyOn(f.session.kernel, "revokeObservedObject")
      .mockImplementationOnce(async (...args) => {
        reached();
        await resume;
        return revoke(...args);
      });
    const pending = f.exchange(code);
    await paused;
    try {
      f.setClientVersion(2);
      const browser = new Map([["global_session", f.principal.externalToken!]]);
      let authorization = await f.request(f.authorization(), browser);
      for (let hop = 0; hop < 8 && authorization.location && new URL(authorization.location, issuer).hostname !== "client.example"; hop += 1)
        authorization = await f.request(authorization.location, browser);
      const freshCode = authorization.location && new URL(authorization.location).searchParams.get("code");
      if (!freshCode)
        throw new Error("expected production v2 authorization Code");
      const fresh = await f.session.kernel.resolveProtocolArtifact(freshCode, purpose);
      const freshPayload = await scope.observer.get(`oidc:model:AuthorizationCode:${freshCode}`);
      if (fresh.status !== "resolved" || !freshPayload)
        throw new Error("expected current Code owners");
      const inspection = createKernelMaintenanceFixture(scope.observer, f.env.sessionKernel.namespace);
      await inspection.expireArtifactGeneration(original.value);
      const replacement = await f.session.kernel.createProtocolArtifact({
        artifactId: original.value.artifactId,
        externalToken: code,
        protocol: fresh.value.protocol,
        clientCode: fresh.value.clientCode,
        artifactType: fresh.value.artifactType,
        principalSessionId: fresh.value.principalSessionId,
        bindingId: fresh.value.bindingId,
        metadata: { ...fresh.value.metadata, providerCodeId: code },
        cleanupRefs: fresh.value.cleanupRefs.map(ref => ({ ...ref, ref: providerKey })),
        ttlMs: 60_000,
      });
      expect(replacement.status).toBe("created");
      // Replace the old identity with an otherwise production-issued v2 payload.
      const replacementPayload = JSON.stringify({ ...JSON.parse(freshPayload), jti: code });
      await scope.observer.set(providerKey, replacementPayload, "KEEPTTL");
      if (replacementState === "consumed") {
        const exchanged = await f.exchange(code);
        expect(exchanged.response.status).toBe(200);
      }
      const replacementMarker = await scope.observer.get(markerKey);
      if (replacementState === "consumed")
        expect(replacementMarker).not.toBeNull();
      release();
      const denied = await pending;
      expect(denied.response.status).toBe(400);
      const retainedPayload = await scope.observer.get(providerKey);
      const marker = await scope.observer.get(markerKey);
      const retained = await f.session.kernel.resolveProtocolArtifact(code, purpose);
      expect(retainedPayload).toBe(replacementPayload);
      expect(marker).toBe(replacementMarker);
      if (replacementState === "live")
        expect(retained).toMatchObject({ status: "resolved", value: { artifactId: original.value.artifactId, metadata: { oidcConfigVersion: 2 } } });
      else
        expect(retained.status).toBe("consumed_replay");
      const next = await f.exchange(replacementState === "live" ? code : freshCode);
      expect(next.response.status).toBe(200);
      const root = await f.session.kernel.resolvePrincipalSession(f.principal.externalToken!);
      expect(root.status).toBe("resolved");
    }
    finally {
      release();
      await pending;
    }
  });
  it.each(["same-client-live", "retry-other-client-live", "retry-other-client-consumed"] as const)("rejects occupied Code upsert and preserves an independent Code during precise cleanup: %s", async (scenario) => {
    const f = await runtimeFixture();
    const code = await f.issueCode();
    const purpose = { protocol: "oidc", clientCode: f.client, artifactType: "authorization_code" };
    const original = await f.session.kernel.resolveProtocolArtifact(code, purpose);
    if (original.status !== "resolved")
      throw new Error("expected original Artifact A");
    let reached!: () => void;
    let release!: () => void;
    const paused = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const resume = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.setClientVersion(2);
    const revoke = f.session.kernel.revokeObservedObject;
    vi.spyOn(f.session.kernel, "revokeObservedObject").mockImplementationOnce(async (...args) => {
      reached();
      await resume;
      return revoke(...args);
    });
    const pending = f.exchange(code);
    await paused;
    try {
      f.setClientVersion(2);
      const clientCode = scenario === "same-client-live" ? f.client : f.otherClient;
      const browser = new Map([["global_session", f.principal.externalToken!]]);
      let authorization = await f.request(f.authorization({ client_id: clientCode }), browser);
      for (let hop = 0; hop < 8 && authorization.location && new URL(authorization.location, issuer).hostname !== "client.example"; hop += 1)
        authorization = await f.request(authorization.location, browser);
      const freshCode = authorization.location && new URL(authorization.location).searchParams.get("code");
      if (!freshCode)
        throw new Error("expected fresh production authorization");
      const serialized = await scope.observer.get(`oidc:model:AuthorizationCode:${freshCode}`);
      if (!serialized)
        throw new Error("expected fresh Provider payload");
      const payload = JSON.parse(serialized);
      const collision = await f.session.operations.run(async (operation) => {
        const session = f.session.sessions.forOperation(operation);
        const adapter = new RedisOidcAdapter("AuthorizationCode", scope.observer, {
          oidcSession: session,
          providerSessions: session,
          clientVersions: f.stores.clientRuntime,
          claims: { createAuthorizationCodeSnapshot: async () => payload.claimsSnapshot },
          tokens: f.stores.tokens,
        });
        await adapter.upsert(code, { ...payload, jti: code, authorizationAttemptId: undefined }, 60);
      }).catch((cause: unknown) => cause);
      expect(collision).toBeInstanceOf(Error);
      expect(collision).toMatchObject({ message: "OIDC authorization code Kernel artifact registration failed" });
      const occupied = await f.session.kernel.resolveProtocolArtifact(code, purpose);
      expect(occupied).toMatchObject({ status: "resolved", value: original.value });
      const replacementPurpose = { ...purpose, clientCode };
      const replacement = await f.session.kernel.resolveProtocolArtifact(freshCode, replacementPurpose);
      if (replacement.status !== "resolved")
        throw new Error("expected production Artifact B");
      expect(replacement.value.artifactId).not.toBe(original.value.artifactId);
      const providerKey = `oidc:model:AuthorizationCode:${freshCode}`;
      const markerKey = `oidc:consumed:AuthorizationCode:${freshCode}`;
      const replacementPayload = await scope.observer.get(providerKey);
      let token: string | undefined;
      if (scenario === "retry-other-client-consumed") {
        const exchanged = await f.exchange(freshCode, { client_id: clientCode });
        expect(exchanged.response.status).toBe(200);
        token = JSON.parse(exchanged.body).access_token;
      }
      const replacementMarker = await scope.observer.get(markerKey);
      if (token)
        expect(replacementMarker).not.toBeNull();
      let cleanupUnavailable = scenario.startsWith("retry-");
      if (scenario.startsWith("retry-")) {
        const evaluate = scope.writer.eval.bind(scope.writer);
        vi.spyOn(scope.writer, "eval").mockImplementation(async (...args) => {
          if (cleanupUnavailable && String(args[0]).includes("session-kernel-direct-cleanup-v1")) {
            throw new Error("cleanup connection unavailable");
          }
          return await evaluate(...args);
        });
      }
      release();
      const denied = await pending;
      expect(denied.response.status).toBe(400);
      const originalState = await scope.observer.get(f.session.kernel.keys.state("artifact", original.value.lookupHash));
      expect(originalState).not.toBeNull();
      if (scenario.startsWith("retry-")) {
        const inventory = await f.session.kernel.inventoryClientProtocol(f.client, "oidc");
        expect(inventory.counts.cleanupPending).toBe(1);
        cleanupUnavailable = false;
        const recovered = createOidcProviderSession({ env: f.env, redis: scope.observer, logger: f.logger, repositories: { account: f.account }, stores: f.stores } as never);
        const retried = await recovered.kernel.revokeClientProtocol(f.client, "oidc", "client_config_changed");
        expect(retried.cleanup.succeeded).toBeGreaterThan(0);
        expect(retried.cleanup.failed).toBe(0);
      }
      const retainedPayload = await scope.observer.get(providerKey);
      const retainedMarker = await scope.observer.get(markerKey);
      const retained = await f.session.kernel.resolveProtocolArtifact(freshCode, replacementPurpose);
      expect(retainedPayload).toBe(replacementPayload);
      expect(retainedMarker).toBe(replacementMarker);
      expect(retained.status).toBe(token ? "consumed_replay" : "resolved");
      if (token) {
        const info = await f.userInfo(token);
        expect(info.response.status).toBe(200);
      }
      else {
        const next = await f.exchange(freshCode, { client_id: clientCode });
        expect(next.response.status).toBe(200);
      }
      const root = await f.session.kernel.resolvePrincipalSession(f.principal.externalToken!);
      expect(root.status).toBe("resolved");
    }
    finally {
      release();
      await pending;
    }
  });
  it("allows exactly one concurrent HTTP redemption of the same Code", async () => {
    const f = await runtimeFixture();
    const code = await f.issueCode();
    const Code = f.provider.AuthorizationCode;
    const consume = Code.prototype.consume;
    let arrivals = 0;
    let release!: () => void;
    const bothAcquired = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(Code.prototype, "consume").mockImplementation(async function (this: InstanceType<typeof Code>) {
      arrivals += 1;
      if (arrivals === 2)
        release();
      await bothAcquired;
      return await consume.call(this);
    });
    const results = await Promise.all([f.exchange(code), f.exchange(code)]);
    expect(results.filter(result => result.response.status === 200)).toHaveLength(1);
    expect(results.filter(result => result.response.status >= 400)).toHaveLength(1);
    const artifact = await f.session.kernel.resolveProtocolArtifact(code, { protocol: "oidc", clientCode: f.client, artifactType: "authorization_code" });
    expect(artifact.status).toBe("consumed_replay");
    const marker = await scope.observer.get(`oidc:consumed:AuthorizationCode:${code}`);
    expect(marker).not.toBeNull();
    const replay = await f.exchange(code);
    expect(replay.response.status).toBe(400);
    expect(JSON.parse(replay.body).error).toBe("invalid_grant");
  });
});
