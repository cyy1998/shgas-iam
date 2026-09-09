import type { CustomSsoProjectionPermission } from "@iam/custom-sso";
import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import type { SessionKernelRedisTestScope } from "@iam/session-kernel/testing";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import process from "node:process";
import {
  createSubjectAccessOperations,
  createSubjectAccessSessionContext,
  createSubjectAccessSessionRevocation,
  encodeSubjectAccessContext,
  requireSubjectAccessOperation,
  SubjectAccessDisabledError,
  SubjectAccessOperationDeniedError,
  SubjectAccessPermissionRequiredError,
  SubjectAccessUnavailableError,
} from "@iam/api-core/subject-access";
import { createPermittedClientSubjectProjectionService, SubjectProjectionNotReadyError } from "@iam/client-subject-projection";
import { ClientStatus, CustomSsoClientMode, SubjectClaim } from "@iam/contracts";
import { createCustomSsoOperations, CustomSsoConfigurationUnavailableError, CustomSsoRequestMismatchError, CustomSsoTrafficGateUnavailableError } from "@iam/custom-sso";
import { createCustomSsoCleanup } from "@iam/custom-sso/cleanup";
import { createCustomSsoRevocationSelector, customSsoMaintenancePrefixes, decodeCustomSsoLegacyGrant, isCustomSsoAuthorizationArtifact } from "@iam/custom-sso/maintenance";
import { createAuthorizationGrantRedisInspection, createLegacyAuthorizationGrantFixture } from "@iam/custom-sso/testing";
import { createSessionKernelRedisTestHarness } from "@iam/session-kernel/testing";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import Redis from "ioredis";

let redis: Redis;
let harness: Awaited<ReturnType<typeof createSessionKernelRedisTestHarness>>;
let scope: SessionKernelRedisTestScope;
let grantIds: string[];
let grants: ReturnType<typeof createAuthorizationGrantRedisInspection>;

beforeAll(async () => {
  const url = process.env.IAM_CUSTOM_SSO_TEST_REDIS_URL;
  if (!url)
    throw new Error("IAM_CUSTOM_SSO_TEST_REDIS_URL is required; no fallback is allowed");
  redis = new Redis(url, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0 });
  await redis.connect();
  grants = createAuthorizationGrantRedisInspection(redis);
  harness = await createSessionKernelRedisTestHarness(url);
});

beforeEach(async () => {
  grantIds = [];
  scope = await harness.createSessionKernelScope({ cleanupAdapters: [createCustomSsoCleanup({ redis })] });
});

afterEach(async () => {
  try {
    if (grantIds.length)
      await Promise.all(grantIds.map(id => grants.remove(id)));
  }
  finally {
    await scope.close();
  }
});

afterAll(async () => {
  await harness.close();
  await redis.quit();
});

type AccessState = "enabled" | "disabled" | "blocking";
type Mode = "independent" | "gateway" | "gateway-orcas" | "iam";

async function fixture(mode: Mode = "gateway") {
  const subjectIdentifier = randomUUID();
  const transitionId = randomUUID();
  const clientCode = mode === "iam" ? "iam" : `client-${randomUUID()}`;
  const redirectUrl = "https://app.example.com/callback";
  const independent = mode === "independent";
  const state = {
    access: "enabled" as AccessState,
    afterRead: undefined as AccessState | undefined,
    factsAvailable: true,
    reads: 0,
    renewals: 0,
    artifacts: 0,
    facts: 0,
    generation: String(transitionId),
    afterGeneration: undefined as string | undefined,
    attemptIds: [] as string[],
    issuedIds: [] as string[],
    issuedTokens: [] as string[],
    orcasCalls: 0,
    userMissing: false,
    orcasFailure: undefined as "failed" | "response-lost" | undefined,
    orcasEffects: 0,
    beforeOrcas: undefined as (() => Promise<void>) | undefined,
    uncertainIssue: false,
    failCompensation: false,
    configReads: 0,
    gateReads: 0,
    configVersion: 7,
    clientResult: "present" as "present" | "absent" | "unavailable",
    gate: "enabled" as "enabled" | "disabled" | "deleted" | "maintenance" | "unavailable",
    gateThrows: false,
    beforeConfig: undefined as (() => Promise<void>) | undefined,
    beforeGate: undefined as (() => Promise<void>) | undefined,
    afterPermission: undefined as (() => Promise<void>) | undefined,
    consumeFailure: undefined as "before" | "after" | undefined,
    beforeConsume: undefined as (() => Promise<void>) | undefined,
    afterConsume: undefined as (() => Promise<void>) | undefined,
    beforeProjection: undefined as (() => Promise<void>) | undefined,
    projectionInvalid: false,
    issueBeforeWriteFailure: false,
    afterIssue: undefined as (() => Promise<void>) | undefined,
    compensations: [] as string[],
    auditFailure: false,
    secretValid: true,
  };
  const kernel = {
    ...scope.writer,
    async consumeProtocolArtifact(...args: Parameters<typeof scope.writer.consumeProtocolArtifact>) {
      await state.beforeConsume?.();
      if (state.consumeFailure === "before")
        throw new Error("consume not submitted");
      const result = await scope.writer.consumeProtocolArtifact(...args);
      if (state.consumeFailure === "after")
        throw new Error("consume response lost after Redis commit");
      await state.afterConsume?.();
      return result;
    },
    async issueCredential(...args: Parameters<typeof scope.writer.issueCredential>) {
      if (state.issueBeforeWriteFailure)
        throw new Error("credential write not submitted");
      const result = await scope.writer.issueCredential(...args);
      if (result.status === "created") {
        state.issuedIds.push(result.value.credentialId);
        if (result.externalToken)
          state.issuedTokens.push(result.externalToken);
      }
      if (state.uncertainIssue)
        throw new Error("unknown credential write result");
      await state.afterIssue?.();
      return result;
    },
    async revokeCredential(...args: Parameters<typeof scope.writer.revokeCredential>) {
      state.compensations.push(args[0]);
      if (state.failCompensation)
        throw new Error("credential compensation unavailable");
      return await scope.writer.revokeCredential(...args);
    },
    async renewPrincipalSession(...args: Parameters<typeof scope.writer.renewPrincipalSession>) {
      state.renewals += 1;
      return await scope.writer.renewPrincipalSession(...args);
    },
    async createProtocolArtifact(...args: Parameters<typeof scope.writer.createProtocolArtifact>) {
      state.artifacts += 1;
      const result = await scope.writer.createProtocolArtifact(...args);
      if (result.status === "created")
        grantIds.push(result.value.artifactId);
      return result;
    },
  };
  const operations = createSubjectAccessOperations({
    barrier: {
      async readCommittedTransitionId(subject) {
        expect(subject).toBe(subjectIdentifier);
        state.reads += 1;
        if (state.access === "disabled")
          throw new SubjectAccessDisabledError();
        if (state.access === "blocking")
          throw new SubjectAccessUnavailableError();
        if (state.afterRead)
          state.access = state.afterRead;
        const accepted = state.generation;
        if (state.afterGeneration)
          state.generation = state.afterGeneration;
        await state.afterPermission?.();
        return accepted;
      },
    },
    revocation: createSubjectAccessSessionRevocation(scope.writer),
  });
  const client: CustomSsoClientRuntimeDto = {
    id: 1,
    clientCode,
    clientName: "test client",
    status: ClientStatus.Enable,
    isDelete: false,
    customSsoEnabled: true,
    customSsoConfigVersion: 7,
    customSsoConfig: independent
      ? {
          mode: CustomSsoClientMode.Independent,
          subjectClaims: [SubjectClaim.SubjectIdentifier, SubjectClaim.ProfileUsername, SubjectClaim.IamAuthorization],
          validRedirectUrls: [redirectUrl],
          callbackEndpoint: redirectUrl,
          logoutEndpoint: "https://app.example.com/logout",
        }
      : {
          mode: CustomSsoClientMode.Gateway,
          subjectClaims: [SubjectClaim.SubjectIdentifier, SubjectClaim.ProfileUsername, SubjectClaim.IamAuthorization],
          validRedirectUrls: [redirectUrl],
          orcas: { enabled: mode === "gateway-orcas" },
        },
  };
  const subjectProjection = createPermittedClientSubjectProjectionService<CustomSsoProjectionPermission>({
    assertPermission(proof, subject) {
      expect(requireSubjectAccessOperation(proof.operation).requirePermission(subject)).toBe(proof.permission);
    },
    subjectFacts: {
      async read() {
        await state.beforeProjection?.();
        state.facts += 1;
        if (!state.factsAvailable)
          return null;
        return {
          subjectIdentifier: state.projectionInvalid ? randomUUID() : subjectIdentifier,
          sourceDirtyVersion: "1",
          profile: { username: "test", name: "Test", phone: null },
          employments: [],
        };
      },
    },
  });
  const protocol = createCustomSsoOperations({
    kernel,
    clients: { findRuntimeRecord: async (code) => {
      state.configReads += 1;
      await state.beforeConfig?.();
      if (state.clientResult === "unavailable")
        throw new Error("configuration unavailable");
      return state.clientResult === "present" && code === clientCode ? { ...client, customSsoConfigVersion: state.configVersion } : null;
    } },
    clientSecrets: { findSecretRecord: async () => ({ ...client, customSsoConfigVersion: state.configVersion, customSsoSecretHash: "test-hash" }) },
    secrets: { verify: async () => state.secretValid },
    traffic: { check: async () => {
      state.gateReads += 1;
      await state.beforeGate?.();
      if (state.gateThrows)
        throw new Error("gate read failed");
      if (state.gate === "unavailable")
        return { outcome: "unavailable", reason: "read-failed" };
      return { outcome: state.gate };
    } },
    subjectProjection,
    permittedUsers: { findOrcasUserBySubjectIdentifier: async () => state.userMissing ? null : ({ id: 1, username: "test", name: "Test" }) },
    orcas: { orcasLogin: async () => {
      state.orcasCalls += 1;
      await state.beforeOrcas?.();
      if (state.orcasFailure === "failed")
        throw new Error("external login failed");
      state.orcasEffects += 1;
      if (state.orcasFailure === "response-lost")
        throw new Error("external session created but response unavailable");
      return { orcasId: "orcas-user", orcasSessionId: "orcas-session" };
    } },
    auditLogWriter: { recordAuditLog: async () => {
      if (state.auditFailure)
        throw new Error("audit unavailable");
    } },
    logger: { info() {}, warn() {} },
    random: { uuid: () => {
      const id = randomUUID();
      state.attemptIds.push(id);
      return id;
    } },
    config: { authCodeExpireSeconds: 60, localSessionTtlSeconds: 120 },
  });
  const root = await operations.run(async (operation) => {
    const permission = await operation.acquireForAuthentication(subjectIdentifier);
    const result = await scope.writer.createPrincipalSession(
      subjectIdentifier,
      createSubjectAccessSessionContext(operation, permission),
    );
    if (result.status !== "created" || !result.externalToken)
      throw new Error("Principal Session creation failed");
    return { ...result, externalToken: result.externalToken };
  });
  // Redemption is a separate migration ticket; seed its legitimate output through the neutral Kernel.
  const credential = await scope.writer.issueCredential({
    principalSessionId: root.value.principalSessionId,
    protocol: "custom-sso",
    clientCode,
    credentialType: "local_session",
    metadata: {
      version: 2,
      mode: independent ? CustomSsoClientMode.Independent : CustomSsoClientMode.Gateway,
      configVersion: 7,
      ...(mode === "gateway-orcas" ? { orcasId: "orcas-user" } : {}),
    },
  });
  if (credential.status !== "created" || !credential.externalToken)
    throw new Error("Credential creation failed");
  state.reads = 0;
  return {
    state,
    protocol,
    operations,
    root,
    credential,
    clientCode,
    subjectIdentifier,
    client,
    token: mode === "iam" ? root.externalToken : credential.externalToken,
    input: { clientCode, redirectUrl, globalSessionToken: root.externalToken, tokenSource: "cookie" as const },
  };
}

async function rejection(work: () => Promise<unknown>) {
  try {
    await work();
  }
  catch (error) {
    return error;
  }
  throw new Error("Expected rejection");
}

test("authorization checks once before renewal and persists its real Redis Grant", async () => {
  const f = await fixture();
  const result = await f.operations.run(op => f.protocol.forOperation(op).authorize.execute(f.input));
  expect(result.isLogin).toBe(true);
  expect(f.state).toMatchObject({ reads: 1, renewals: 1, artifacts: 1 });
  if (!result.isLogin)
    throw new Error("Authorization failed");
  const artifact = await scope.writer.resolveProtocolArtifact(result.code, { protocol: "custom-sso", artifactType: "auth_code" });
  const records = await Promise.all(grantIds.map(id => grants.inspect(id)));
  expect(artifact.status).toBe("resolved");
  expect(records).toHaveLength(1);
  expect(records[0]).toBeNull();
  const repeated = await f.operations.run(op => f.protocol.forOperation(op).authorize.execute(f.input));
  expect(repeated.isLogin).toBe(true);
  expect(f.state.reads).toBe(2);
});

test("continuation inspects a real Principal Session without renewal or Grant issuance", async () => {
  const f = await fixture();
  const before = await scope.writer.resolvePrincipalSession(f.root.externalToken);
  const result = await f.operations.run(op => f.protocol.forOperation(op).checkLoginContinuation.execute(f.input));
  const after = await scope.writer.resolvePrincipalSession(f.root.externalToken);
  expect(result).toBe("valid");
  if (before.status !== "resolved" || after.status !== "resolved")
    throw new Error("Continuation must retain the Principal Session");
  expect(after.value).toEqual(before.value);
  expect(f.state).toMatchObject({ reads: 1, renewals: 0, artifacts: 0 });
});

test.each(["blocking", "disabled"] as const)("authorization admitted before %s finishes; next call rejects before renewal", async (state) => {
  const f = await fixture();
  f.state.afterRead = state;
  const result = await f.operations.run(op => f.protocol.forOperation(op).authorize.execute(f.input));
  expect(result.isLogin).toBe(true);
  expect(f.state).toMatchObject({ reads: 1, renewals: 1, artifacts: 1 });
  const error = await rejection(() => f.operations.run(op => f.protocol.forOperation(op).authorize.execute(f.input)));
  expect(error).toBeInstanceOf(state === "disabled" ? SubjectAccessOperationDeniedError : SubjectAccessUnavailableError);
  expect(f.state).toMatchObject({ reads: 2, renewals: 1, artifacts: 1 });
});

test.each(["blocking", "disabled"] as const)("initial %s denial creates no Grant and does not renew", async (state) => {
  const f = await fixture();
  f.state.access = state;
  const error = await rejection(() => f.operations.run(op => f.protocol.forOperation(op).authorize.execute(f.input)));
  expect(error).toBeInstanceOf(state === "disabled" ? SubjectAccessOperationDeniedError : SubjectAccessUnavailableError);
  expect(f.state).toMatchObject({ reads: 1, renewals: 0, artifacts: 0 });
  expect(grantIds).toHaveLength(0);
  const root = await scope.writer.resolvePrincipalSession(f.root.externalToken);
  expect(root.status).toBe(state === "disabled" ? "revoked" : "resolved");
});

test.each(["independent", "gateway", "gateway-orcas", "iam"] as const)("%s Public UserInfo reuses one permission including repeated projection", async (mode) => {
  const f = await fixture(mode);
  const operation = f.operations.createOperation();
  const authentication = await f.protocol.forOperation(operation).resolvePublicAuthentication(f.token, f.clientCode);
  expect(authentication.authenticationContext).toMatchObject({
    subjectIdentifier: f.subjectIdentifier,
    authenticatedClientCode: f.clientCode,
  });
  if (mode === "gateway-orcas")
    expect(authentication.authenticationContext).toHaveProperty("orcasId", "orcas-user");
  f.state.access = "disabled";
  const first = await authentication.subjectDeliveryCapability.resolveUserInfo();
  const second = await authentication.subjectDeliveryCapability.resolveUserInfo();
  expect(first).toEqual(second);
  expect(first).toMatchObject({ version: 2, subjectIdentifier: f.subjectIdentifier });
  expect(f.state).toMatchObject({ reads: 1, facts: 2 });
  operation.close();
  const closed = await rejection(() => authentication.subjectDeliveryCapability.resolveUserInfo());
  expect(closed).toBeInstanceOf(SubjectAccessPermissionRequiredError);
  expect(f.state.facts).toBe(2);
  const denied = await rejection(() => f.operations.run(op =>
    f.protocol.forOperation(op).resolvePublicAuthentication(f.token, f.clientCode)));
  expect(denied).toBeInstanceOf(SubjectAccessOperationDeniedError);
  expect(f.state.reads).toBe(2);
});

test.each(["gateway", "gateway-orcas"] as const)("%s authz checks once and selects only the minimal subject header", async (mode) => {
  const f = await fixture(mode);
  f.state.afterRead = "blocking";
  const header = await f.operations.run(op => f.protocol.forOperation(op).authorizeLocalSession(f.token, f.clientCode));
  expect(JSON.parse(Buffer.from(header, "base64").toString("utf8"))).toEqual({ version: 1, subjectIdentifier: f.subjectIdentifier, username: "test" });
  expect(f.state).toMatchObject({ reads: 1, facts: 1 });
});

test("missing Facts still reject UserInfo after Subject Access permission", async () => {
  const f = await fixture();
  f.state.factsAvailable = false;
  const error = await rejection(() => f.operations.run(async (op) => {
    const authentication = await f.protocol.forOperation(op).resolvePublicAuthentication(f.token, f.clientCode);
    return await authentication.subjectDeliveryCapability.resolveUserInfo();
  }));
  expect(error).toBeInstanceOf(SubjectProjectionNotReadyError);
  expect(f.state).toMatchObject({ reads: 1, facts: 1 });
});

test("missing and closed operations cannot authorize", async () => {
  const f = await fixture();
  expect(() => f.protocol.forOperation(undefined!)).toThrow(SubjectAccessPermissionRequiredError);
  const op = f.operations.createOperation();
  const bound = f.protocol.forOperation(op);
  op.close();
  const error = await rejection(() => bound.authorize.execute(f.input));
  expect(error).toBeInstanceOf(SubjectAccessPermissionRequiredError);
  expect(f.state).toMatchObject({ reads: 0, renewals: 0, artifacts: 0 });
});

test("invalid credentials never trigger Subject Access", async () => {
  const f = await fixture();
  const result = await f.operations.run(op => f.protocol.forOperation(op).authorize.execute({ ...f.input, globalSessionToken: "invalid" }));
  const continuation = await f.operations.run(op => f.protocol.forOperation(op).checkLoginContinuation.execute({ ...f.input, globalSessionToken: "invalid" }));
  const error = await rejection(() => f.operations.run(op => f.protocol.forOperation(op).resolvePublicAuthentication("invalid", f.clientCode)));
  expect(result.isLogin).toBe(false);
  expect(continuation).toBe("invalid");
  expect(error).toBeInstanceOf(Error);
  expect(f.state).toMatchObject({ reads: 0, renewals: 0, artifacts: 0 });
});

test.each(["blocking", "disabled"] as const)("logout under %s revokes the root and credential without Subject Access", async (state) => {
  const f = await fixture();
  f.state.access = state;
  await f.protocol.logout.execute({ sessionToken: f.token });
  const root = await scope.writer.resolvePrincipalSession(f.root.externalToken);
  const credential = await scope.writer.resolveCredential(f.token, { protocol: "custom-sso", credentialType: "local_session" });
  expect(root.status).toBe("revoked");
  expect(credential.status).toBe("revoked");
  expect(f.state.reads).toBe(0);
});

async function redemptionFixture(mode: Exclude<Mode, "iam">) {
  const f = await fixture(mode);
  const grant = await f.operations.run(op => f.protocol.forOperation(op).authorize.execute({ ...f.input, state: "opaque-state" }));
  if (!grant.isLogin)
    throw new Error("Expected authorization code");
  const artifact = await scope.writer.resolveProtocolArtifact(grant.code, { protocol: "custom-sso", artifactType: "auth_code" });
  if (artifact.status !== "resolved")
    throw new Error("Expected real authorization artifact");
  const grantId = artifact.value.artifactId;
  f.state.reads = 0;
  f.state.attemptIds.length = 0;
  const redeem = (code = grant.code, redirect = f.input.redirectUrl) => f.operations.run(async op => mode === "independent"
    ? await f.protocol.forOperation(op).exchangeCode.execute({ clientCode: f.clientCode, clientSecret: "secret", code, redirectUri: redirect })
    : await f.protocol.forOperation(op).completeCallback.execute({ clientCode: f.clientCode, code, redirectUrl: redirect }));
  return { ...f, redeem, grantId, artifact: artifact.value, code: grant.code };
}

test.each(["config", "gate"] as const)("parallel callbacks share the pending %s acquisition and retain both accepted results", async (source) => {
  const f = await fixture();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const wait = async () => {
    entered.resolve();
    await release.promise;
  };
  if (source === "config")
    f.state.beforeConfig = wait;
  else f.state.beforeGate = wait;
  const operation = f.operations.createOperation();
  try {
    const first = f.protocol.forOperation(operation).checkLoginContinuation.execute(f.input);
    await entered.promise;
    const second = f.protocol.forOperation(operation).authorize.execute(f.input);
    release.resolve();
    const [continued, authorized] = await Promise.all([first, second]);
    expect(continued).toBe("valid");
    expect(authorized.isLogin).toBe(true);
    expect(f.state).toMatchObject({ configReads: 1, gateReads: 1, reads: 1 });
    f.state.configVersion = 8;
    f.state.gate = "maintenance";
    const accepted = await f.protocol.forOperation(operation).resolvePublicAuthentication(f.token, f.clientCode);
    expect(accepted.authenticationContext.subjectIdentifier).toBe(f.subjectIdentifier);
    expect(f.state).toMatchObject({ configReads: 1, gateReads: 1 });
  }
  finally {
    release.resolve();
    operation.close();
  }
  await rejection(() => f.operations.run(op => f.protocol.forOperation(op).authorize.execute(f.input)));
  expect(f.state.gateReads).toBe(2);
});

test.each(["config-absent", "config-unavailable", "gate-disabled", "gate-maintenance", "gate-unavailable", "gate-throw"] as const)("%s is fixed for concurrent and repeated callbacks, with a fresh result next operation", async (failure) => {
  const f = await fixture();
  if (failure === "config-absent")
    f.state.clientResult = "absent";
  if (failure === "config-unavailable")
    f.state.clientResult = "unavailable";
  if (failure === "gate-disabled")
    f.state.gate = "disabled";
  if (failure === "gate-maintenance")
    f.state.gate = "maintenance";
  if (failure === "gate-unavailable")
    f.state.gate = "unavailable";
  if (failure === "gate-throw")
    f.state.gateThrows = true;
  const operation = f.operations.createOperation();
  try {
    const results = await Promise.allSettled([
      f.protocol.forOperation(operation).authorize.execute(f.input),
      f.protocol.forOperation(operation).checkLoginContinuation.execute(f.input),
    ]);
    expect(results.map(result => result.status)).toEqual(["rejected", "rejected"]);
    const counts = { configReads: f.state.configReads, gateReads: f.state.gateReads };
    f.state.clientResult = "present";
    f.state.gate = "enabled";
    f.state.gateThrows = false;
    const repeated = await rejection(() => f.protocol.forOperation(operation).authorize.execute(f.input));
    if (failure === "config-unavailable")
      expect(repeated).toBeInstanceOf(CustomSsoConfigurationUnavailableError);
    if (failure === "gate-unavailable" || failure === "gate-throw")
      expect(repeated).toBeInstanceOf(CustomSsoTrafficGateUnavailableError);
    expect(f.state).toMatchObject({ ...counts, reads: 0, renewals: 0, artifacts: 0 });
  }
  finally { operation.close(); }
  const next = await f.operations.run(op => f.protocol.forOperation(op).authorize.execute(f.input));
  expect(next.isLogin).toBe(true);
  expect(f.state.gateReads).toBe(2);
});

test.each(["independent", "gateway-orcas"] as const)("%s stale redirect rejection leaves Grant untouched, then exact permanent rejection cleans only that Grant", async (mode) => {
  const f = await redemptionFixture(mode);
  const other = await fixture();
  f.state.configVersion = 8;
  f.state.access = "disabled";
  await rejection(() => f.redeem(f.code, "https://wrong.example/callback"));
  const retained = await scope.observer.resolveProtocolArtifact(f.code, { protocol: "custom-sso", artifactType: "auth_code" });
  expect(retained).toMatchObject({ status: "resolved", value: f.artifact });
  expect(f.state).toMatchObject({ reads: 0, attemptIds: [], issuedIds: [], orcasCalls: 0 });
  await rejection(() => f.redeem());
  const artifact = await scope.observer.resolveProtocolArtifact(f.code, { protocol: "custom-sso", artifactType: "auth_code" });
  const cleaned = await grants.inspect(f.grantId);
  const roots = await Promise.all([scope.observer.resolvePrincipalSession(f.root.externalToken), scope.observer.resolvePrincipalSession(other.root.externalToken)]);
  const credential = await scope.observer.resolveCredential(f.token, { protocol: "custom-sso", credentialType: "local_session" });
  expect(artifact.status).toBe("revoked");
  expect(cleaned).toBeNull();
  expect(roots.map(value => value.status)).toEqual(["resolved", "resolved"]);
  expect(credential.status).toBe("resolved");
  expect(f.state).toMatchObject({ reads: 0, attemptIds: [], issuedIds: [], orcasCalls: 0 });
});

test.each(["independent", "gateway-orcas"] as const)("%s accepted redemption creates the old version in flight; next operation precisely rejects it", async (mode) => {
  const f = await redemptionFixture(mode);
  f.state.afterPermission = async () => {
    f.state.configVersion = 8;
    f.state.gate = "maintenance";
  };
  const result = await f.redeem();
  const token = "sid" in result ? result.sid : result.token;
  const issued = await scope.observer.resolveCredential(token, { protocol: "custom-sso", credentialType: "local_session" });
  expect(issued.status).toBe("resolved");
  if (issued.status !== "resolved")
    throw new Error("Expected issued credential");
  expect(issued.value.metadata).toMatchObject({ configVersion: 7 });
  f.state.afterPermission = undefined;
  f.state.gate = "enabled";
  await rejection(() => f.operations.run(op => f.protocol.forOperation(op).resolvePublicAuthentication(token, f.clientCode)));
  const revoked = await scope.observer.resolveCredential(token, { protocol: "custom-sso", credentialType: "local_session" });
  const root = await scope.observer.resolvePrincipalSession(f.root.externalToken);
  expect(revoked.status).toBe("revoked");
  expect(root.status).toBe("resolved");
});

test.each(["independent", "gateway-orcas"] as const)("%s accepted configuration cannot redeem a Grant removed before consumption", async (mode) => {
  const f = await redemptionFixture(mode);
  f.state.afterPermission = async () => {
    f.state.configVersion = 8;
    await scope.observer.revokeArtifact(f.grantId, "client_config_changed");
  };
  await rejection(() => f.redeem());
  const grant = await grants.inspect(f.grantId);
  expect(grant).toBeNull();
  expect(f.state).toMatchObject({ reads: 1, issuedIds: [], orcasCalls: 0 });
});

test.each(["independent", "gateway-orcas"] as const)("%s authorization writes an old Code after version cleanup; next redemption precisely removes it", async (mode) => {
  const f = await fixture(mode);
  const other = await fixture();
  const entered = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  f.state.afterPermission = async () => {
    entered.resolve();
    await resume.promise;
  };
  const pending = f.operations.run(op => f.protocol.forOperation(op).authorize.execute(f.input));
  await entered.promise;
  try {
    f.state.afterPermission = undefined;
    f.state.configVersion = 8;
    await scope.observer.revokeSelectedClientProtocolObjects(f.clientCode, "custom-sso", createCustomSsoRevocationSelector(8), "client_config_changed");
    const afterCleanup = await scope.observer.inventoryClientProtocol(f.clientCode, "custom-sso");
    expect(afterCleanup.counts.credentials).toBe(0);
    const current = await f.operations.run(op => f.protocol.forOperation(op).authorize.execute(f.input));
    if (!current.isLogin)
      throw new Error("Expected new Code");
    resume.resolve();
    const late = await pending;
    if (!late.isLogin)
      throw new Error("Expected in-flight old Code");
    const purpose = { protocol: "custom-sso", artifactType: "auth_code", clientCode: f.clientCode };
    const observed = await scope.observer.resolveProtocolArtifact(late.code, purpose);
    expect(observed).toMatchObject({ status: "resolved", value: { metadata: { configVersion: 7 } } });
    if (observed.status !== "resolved")
      throw new Error("Expected old Artifact");
    await rejection(() => f.operations.run(async op => mode === "independent"
      ? await f.protocol.forOperation(op).exchangeCode.execute({ code: late.code, clientCode: f.clientCode, clientSecret: "secret", redirectUri: f.input.redirectUrl })
      : await f.protocol.forOperation(op).completeCallback.execute({ code: late.code, clientCode: f.clientCode, redirectUrl: f.input.redirectUrl })));
    const removed = await scope.observer.resolveProtocolArtifact(late.code, purpose);
    const grant = await grants.inspect(observed.value.artifactId);
    const retained = await scope.observer.resolveProtocolArtifact(current.code, purpose);
    const control = await scope.observer.resolveCredential(other.token, { protocol: "custom-sso", credentialType: "local_session" });
    const root = await scope.observer.resolvePrincipalSession(f.root.externalToken);
    expect(removed.status).toBe("revoked");
    expect(grant).toBeNull();
    expect(retained).toMatchObject({ status: "resolved", value: { metadata: { configVersion: 8 } } });
    expect([control.status, root.status]).toEqual(["resolved", "resolved"]);
    expect(f.state.issuedIds).toEqual([]);
  }
  finally {
    resume.resolve();
    await pending;
  }
});

test("an older accepted configuration refuses a newer Credential without deleting it; the next operation accepts it", async () => {
  const f = await fixture();
  const operation = f.operations.createOperation();
  try {
    await f.protocol.forOperation(operation).checkLoginContinuation.execute(f.input);
    f.state.configVersion = 8;
    const newer = await scope.writer.issueCredential({ principalSessionId: f.root.value.principalSessionId, protocol: "custom-sso", clientCode: f.clientCode, credentialType: "local_session", metadata: { version: 2, mode: CustomSsoClientMode.Gateway, configVersion: 8 } });
    if (newer.status !== "created" || !newer.externalToken)
      throw new Error("Expected newer credential");
    const token = newer.externalToken;
    const error = await rejection(() => f.protocol.forOperation(operation).resolvePublicAuthentication(token, f.clientCode));
    expect(error).toBeInstanceOf(CustomSsoRequestMismatchError);
    const retained = await scope.observer.resolveCredential(token, { protocol: "custom-sso", credentialType: "local_session" });
    expect(retained.status).toBe("resolved");
    const next = await f.operations.run(op => f.protocol.forOperation(op).resolvePublicAuthentication(token, f.clientCode));
    expect(next.authenticationContext.subjectIdentifier).toBe(f.subjectIdentifier);
  }
  finally { operation.close(); }
});

test("logout refuses a newer Credential under an older configuration without destroying the root", async () => {
  const f = await fixture();
  f.state.configVersion = 6;
  const error = await rejection(() => f.protocol.logout.execute({ sessionToken: f.token }));
  const credential = await scope.observer.resolveCredential(f.token, { protocol: "custom-sso", credentialType: "local_session" });
  const root = await scope.observer.resolvePrincipalSession(f.root.externalToken);
  expect(error).toBeInstanceOf(Error);
  expect([credential.status, root.status]).toEqual(["resolved", "resolved"]);
  f.state.configVersion = 7;
  await f.protocol.logout.execute({ sessionToken: f.token });
  const ended = await scope.observer.resolvePrincipalSession(f.root.externalToken);
  expect(ended.status).toBe("revoked");
  expect(f.state.reads).toBe(0);
});

test.each(["independent", "gateway-orcas"] as const)("%s delayed Credential rejection preserves protocol-issued access after version-selected cleanup", async (mode) => {
  const f = await fixture(mode);
  const other = await fixture();
  const sameClientOtherUser = await scope.writer.issueCredential({ principalSessionId: other.root.value.principalSessionId, protocol: "custom-sso", clientCode: f.clientCode, credentialType: "local_session", metadata: { version: 2, mode: CustomSsoClientMode.Gateway, configVersion: 8 } });
  if (sameClientOtherUser.status !== "created" || !sameClientOtherUser.externalToken)
    throw new Error("Expected other-user credential");
  f.state.configVersion = 8;
  const entered = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  f.state.beforeConfig = async () => {
    entered.resolve();
    await resume.promise;
  };
  const pending = rejection(() => f.operations.run(op => f.protocol.forOperation(op).resolvePublicAuthentication(f.token, f.clientCode)));
  await entered.promise;
  try {
    await scope.observer.revokeSelectedClientProtocolObjects(f.clientCode, "custom-sso", createCustomSsoRevocationSelector(8), "client_config_changed");
    const cleaned = await scope.observer.resolveCredential(f.token, { protocol: "custom-sso", credentialType: "local_session" });
    expect(cleaned.status).toBe("revoked");
    f.state.beforeConfig = undefined;
    const authorized = await f.operations.run(op => f.protocol.forOperation(op).authorize.execute(f.input));
    if (!authorized.isLogin)
      throw new Error("Expected new authorization");
    const newer = await f.operations.run(async op => mode === "independent"
      ? await f.protocol.forOperation(op).exchangeCode.execute({ code: authorized.code, clientCode: f.clientCode, clientSecret: "secret", redirectUri: f.input.redirectUrl })
      : await f.protocol.forOperation(op).completeCallback.execute({ code: authorized.code, clientCode: f.clientCode, redirectUrl: f.input.redirectUrl }));
    const token = "sid" in newer ? newer.sid : newer.token;
    resume.resolve();
    await pending;
    const remaining = await Promise.all([token, sameClientOtherUser.externalToken, other.token].map(value => scope.observer.resolveCredential(value, { protocol: "custom-sso", credentialType: "local_session" })));
    const roots = await Promise.all([f.root.externalToken, other.root.externalToken].map(value => scope.observer.resolvePrincipalSession(value)));
    expect(remaining.map(value => value.status)).toEqual(["resolved", "resolved", "resolved"]);
    expect(roots.map(value => value.status)).toEqual(["resolved", "resolved"]);
    const accepted = await f.operations.run(op => f.protocol.forOperation(op).resolvePublicAuthentication(token, f.clientCode));
    expect(accepted.authenticationContext.subjectIdentifier).toBe(f.subjectIdentifier);
    await rejection(() => f.operations.run(op => f.protocol.forOperation(op).resolvePublicAuthentication(f.token, f.clientCode)));
  }
  finally {
    resume.resolve();
    await pending;
  }
});

test.each(["credential", "artifact"] as const)("permanent %s rejection is bound to its original observed object during a real Redis replacement", async (kind) => {
  const f = await redemptionFixture("gateway-orcas");
  f.state.configVersion = 8;
  scope.replaceObjectBeforeNextRevoke();
  await rejection(() => kind === "credential"
    ? f.operations.run(op => f.protocol.forOperation(op).resolvePublicAuthentication(f.token, f.clientCode))
    : f.redeem());
  const retained = kind === "credential"
    ? await scope.observer.resolveCredential(f.token, { protocol: "custom-sso", credentialType: "local_session" })
    : await scope.observer.resolveProtocolArtifact(f.code, { protocol: "custom-sso", artifactType: "auth_code" });
  expect(retained.status).toBe("resolved");
  if (retained.status !== "resolved")
    throw new Error("Expected replacement to survive");
  expect(retained.value.metadata).toEqual({ concurrentReplacement: true });
  expect(f.state).toMatchObject({ reads: 0, attemptIds: [], issuedIds: [], orcasCalls: 0 });
});

test.each(["independent", "gateway-orcas"] as const)("%s preserves newer Code with an older accepted snapshot and accepts it in the next operation", async (mode) => {
  const f = await fixture(mode);
  const operation = f.operations.createOperation();
  try {
    await f.protocol.forOperation(operation).checkLoginContinuation.execute(f.input);
    f.state.configVersion = 8;
    const code = await f.operations.run(op => f.protocol.forOperation(op).authorize.execute(f.input));
    if (!code.isLogin)
      throw new Error("Expected code");
    const redeem = (op: Parameters<typeof f.protocol.forOperation>[0]) => mode === "independent"
      ? f.protocol.forOperation(op).exchangeCode.execute({ code: code.code, clientCode: f.clientCode, clientSecret: "secret", redirectUri: f.input.redirectUrl })
      : f.protocol.forOperation(op).completeCallback.execute({ code: code.code, clientCode: f.clientCode, redirectUrl: f.input.redirectUrl });
    await rejection(() => redeem(operation));
    const artifact = await scope.observer.resolveProtocolArtifact(code.code, { protocol: "custom-sso", artifactType: "auth_code" });
    expect(artifact.status).toBe("resolved");
    if (artifact.status !== "resolved")
      throw new Error("Expected retained code");
    const grant = await grants.inspect(artifact.value.artifactId);
    expect(grant).toBeNull();
    await f.operations.run(async op => await redeem(op));
  }
  finally { operation.close(); }
});

test.each(["independent", "gateway-orcas"] as const)("%s temporary config/Gate failures preserve the real Grant without consumption or ORCAS", async (mode) => {
  const f = await redemptionFixture(mode);
  for (const failure of ["config", "maintenance", "unavailable"] as const) {
    f.state.clientResult = failure === "config" ? "unavailable" : "present";
    f.state.gate = failure === "config" ? "enabled" : failure;
    await rejection(() => f.redeem());
    const observed = await scope.observer.resolveProtocolArtifact(f.code, { protocol: "custom-sso", artifactType: "auth_code" });
    expect(observed).toMatchObject({ status: "resolved", value: f.artifact });
    expect(f.state).toMatchObject({ reads: 0, attemptIds: [], issuedIds: [], orcasCalls: 0 });
  }
  f.state.clientResult = "present";
  f.state.gate = "enabled";
  const result = await f.redeem();
  expect("sid" in result ? result.sid : result.token).toBeTruthy();
});

test.each(["missing", "disabled", "protocol-disabled", "gate-disabled", "gate-deleted"] as const)("permanent %s rejection cleans only the request-owned Grant before consumption", async (failure) => {
  const f = await redemptionFixture("gateway-orcas");
  if (failure === "missing")
    f.state.clientResult = "absent";
  if (failure === "disabled")
    f.client.status = ClientStatus.Disable;
  if (failure === "protocol-disabled")
    f.client.customSsoEnabled = false;
  if (failure === "gate-disabled")
    f.state.gate = "disabled";
  if (failure === "gate-deleted")
    f.state.gate = "deleted";
  await rejection(() => f.redeem());
  const artifact = await scope.observer.resolveProtocolArtifact(f.code, { protocol: "custom-sso", artifactType: "auth_code" });
  const grant = await grants.inspect(f.grantId);
  const root = await scope.observer.resolvePrincipalSession(f.root.externalToken);
  expect(artifact.status).toBe("revoked");
  expect(grant).toBeNull();
  expect(root.status).toBe("resolved");
  expect(f.state).toMatchObject({ reads: 0, attemptIds: [], issuedIds: [], orcasCalls: 0 });
});

test.each(["credential", "artifact"] as const)("unparseable %s version cannot authorize and is handled precisely", async (kind) => {
  const f = await fixture("gateway-orcas");
  const object = kind === "credential"
    ? await scope.writer.issueCredential({ principalSessionId: f.root.value.principalSessionId, protocol: "custom-sso", clientCode: f.clientCode, credentialType: "local_session", metadata: { version: 2, mode: CustomSsoClientMode.Gateway } })
    : await scope.writer.createProtocolArtifact({ principalSessionId: f.root.value.principalSessionId, protocol: "custom-sso", clientCode: f.clientCode, artifactType: "auth_code", ttlMs: 60_000, metadata: { version: 2, mode: CustomSsoClientMode.Gateway, clientCode: f.clientCode, subjectIdentifier: f.subjectIdentifier, redirectUri: f.input.redirectUrl } });
  if (object.status !== "created" || !object.externalToken)
    throw new Error("Expected malformed-version fixture");
  const token = object.externalToken;
  await rejection(() => f.operations.run(async op => kind === "credential"
    ? await f.protocol.forOperation(op).resolvePublicAuthentication(token, f.clientCode)
    : await f.protocol.forOperation(op).completeCallback.execute({ code: token, clientCode: f.clientCode, redirectUrl: f.input.redirectUrl })));
  const invalid = kind === "credential"
    ? await scope.observer.resolveCredential(token, { protocol: "custom-sso", credentialType: "local_session" })
    : await scope.observer.resolveProtocolArtifact(token, { protocol: "custom-sso", artifactType: "auth_code" });
  const valid = await scope.observer.resolveCredential(f.token, { protocol: "custom-sso", credentialType: "local_session" });
  expect(invalid.status).toBe("revoked");
  expect(valid.status).toBe("resolved");
  expect(f.state).toMatchObject({ reads: 0, issuedIds: [], orcasCalls: 0 });
});

test("permanent rejection remains denied when authority revocation fails", async () => {
  const f = await redemptionFixture("gateway-orcas");
  f.state.configVersion = 8;
  scope.failNextPrincipalRevoke();
  await rejection(() => f.redeem());
  const artifact = await scope.observer.resolveProtocolArtifact(f.code, { protocol: "custom-sso", artifactType: "auth_code" });
  expect(artifact.status).toBe("resolved");
  expect(f.state).toMatchObject({ reads: 0, attemptIds: [], issuedIds: [], orcasCalls: 0 });
});

test.each(["independent", "gateway", "gateway-orcas"] as const)("%s rejects before Grant consumption and resumes the same code after blocking", async (mode) => {
  const f = await redemptionFixture(mode);
  f.state.access = "blocking";
  const error = await rejection(() => f.redeem());
  expect(error).toBeInstanceOf(SubjectAccessUnavailableError);
  const observed = await scope.observer.resolveProtocolArtifact(f.code, { protocol: "custom-sso", artifactType: "auth_code" });
  expect(observed).toMatchObject({ status: "resolved", value: f.artifact });
  expect(f.state).toMatchObject({ reads: 1, attemptIds: [], issuedIds: [], orcasCalls: 0 });
  f.state.access = "enabled";
  const result = await f.redeem();
  const token = "sid" in result ? result.sid : result.token;
  const credential = await scope.writer.resolveCredential(token, { protocol: "custom-sso", credentialType: "local_session" });
  expect(credential.status).toBe("resolved");
  expect(f.state).toMatchObject({ reads: 2, orcasCalls: mode === "gateway-orcas" ? 1 : 0 });
  expect(f.state.issuedIds).toHaveLength(1);
  const replay = await rejection(() => f.redeem());
  expect(replay).toBeInstanceOf(Error);
  expect(f.state.issuedIds).toHaveLength(1);
});

test.each(["independent", "gateway", "gateway-orcas"] as const)("%s disabled denial cannot consume or issue and preserves new-generation roots", async (mode) => {
  const f = await redemptionFixture(mode);
  const freshGeneration = randomUUID();
  const fresh = await scope.writer.createPrincipalSession(f.subjectIdentifier, {
    subjectContext: encodeSubjectAccessContext({ version: 1, subjectIdentifier: f.subjectIdentifier, transitionId: freshGeneration }),
  });
  if (fresh.status !== "created" || !fresh.externalToken)
    throw new Error("Expected new-generation root");
  f.state.access = "disabled";
  const error = await rejection(() => f.redeem());
  const oldRoot = await scope.writer.resolvePrincipalSession(f.root.externalToken);
  const newRoot = await scope.writer.resolvePrincipalSession(fresh.externalToken);
  expect(error).toBeInstanceOf(SubjectAccessOperationDeniedError);
  expect(f.state).toMatchObject({ reads: 1, attemptIds: [], issuedIds: [], orcasCalls: 0 });
  expect(oldRoot.status).toBe("revoked");
  expect(newRoot.status).toBe("resolved");
});

test.each(["independent", "gateway", "gateway-orcas"] as const)("%s in-flight redemption retains its original generation and next access refuses it", async (mode) => {
  const f = await redemptionFixture(mode);
  f.state.afterGeneration = randomUUID();
  const result = await f.redeem();
  const token = "sid" in result ? result.sid : result.token;
  const credential = await scope.writer.resolveCredential(token, { protocol: "custom-sso", credentialType: "local_session" });
  expect(credential.status).toBe("resolved");
  if (credential.status !== "resolved")
    throw new Error("Expected issued credential");
  expect(credential.value.subjectContext).toBe(f.root.value.subjectContext);
  expect(f.state).toMatchObject({ reads: 1, orcasCalls: mode === "gateway-orcas" ? 1 : 0 });
  if ("state" in result)
    expect(result.state).toBe("opaque-state");
  if ("subject" in result)
    expect(result.subject).toMatchObject({ version: 2, subjectIdentifier: f.subjectIdentifier });
  const denied = await rejection(() => f.operations.run(op => f.protocol.forOperation(op).resolvePublicAuthentication(token, f.clientCode)));
  expect(denied).toBeInstanceOf(SubjectAccessOperationDeniedError);
  expect(f.state.reads).toBe(2);
});

test.each(["independent", "gateway", "gateway-orcas"] as const)("%s rejects invalid protocol identity without acquiring permission", async (mode) => {
  const f = await redemptionFixture(mode);
  for (const [code, redirect] of [["invalid", f.input.redirectUrl], [f.code, "https://app.example.com/wrong"]]) {
    const error = await rejection(() => f.redeem(code, redirect));
    expect(error).toBeInstanceOf(Error);
  }
  expect(f.state).toMatchObject({ reads: 0, attemptIds: [], issuedIds: [], orcasCalls: 0 });
});

test("Independent missing Facts consume Code and require new authorization", async () => {
  const f = await redemptionFixture("independent");
  f.state.factsAvailable = false;
  const error = await rejection(() => f.redeem());
  const artifact = await scope.observer.resolveProtocolArtifact(f.code, { protocol: "custom-sso", artifactType: "auth_code" });
  expect(error).toBeInstanceOf(SubjectProjectionNotReadyError);
  expect(artifact.status).not.toBe("resolved");
  expect(f.state).toMatchObject({ reads: 1, issuedIds: [] });
  f.state.factsAvailable = true;
  await rejection(() => f.redeem());
  expect(f.state.issuedIds).toHaveLength(0);
});

test.each(["independent", "gateway-orcas"] as const)("%s consume commit failures never enter projection, ORCAS or issuance", async (mode) => {
  for (const timing of ["before", "after"] as const) {
    const f = await redemptionFixture(mode);
    f.state.consumeFailure = timing;
    await rejection(() => f.redeem());
    const artifact = await scope.observer.resolveProtocolArtifact(f.code, { protocol: "custom-sso", artifactType: "auth_code" });
    expect(artifact.status).toBe(timing === "before" ? "resolved" : "consumed_replay");
    if (artifact.status === "resolved")
      expect(artifact.value.expiresAt).toBe(f.artifact.expiresAt);
    expect(f.state).toMatchObject({ facts: 0, orcasCalls: 0, issuedIds: [], compensations: [] });
  }
});

test.each(["independent", "gateway", "gateway-orcas"] as const)("%s issuance failures burn Code and preserve other credentials", async (mode) => {
  for (const failure of ["before-write", "committed", "compensation-failed"] as const) {
    const f = await redemptionFixture(mode);
    f.state.issueBeforeWriteFailure = failure === "before-write";
    f.state.uncertainIssue = failure !== "before-write";
    f.state.failCompensation = failure === "compensation-failed";
    await rejection(() => f.redeem());
    expect(f.state.compensations).toHaveLength(1);
    const target = f.state.compensations[0]!;
    const targetExists = await scope.activeObjectExists({ kind: "credential", id: target });
    expect(targetExists).toBe(failure === "compensation-failed");
    expect(f.state.issuedIds).toHaveLength(failure === "before-write" ? 0 : 1);
    const retained = await scope.observer.resolveCredential(f.credential.externalToken!, { protocol: "custom-sso", credentialType: "local_session" });
    expect(retained.status).toBe("resolved");
    await rejection(() => f.redeem());
    expect(f.state.compensations).toEqual([target]);
    // New authorization reuses the valid root, with a new identity.
    f.state.issueBeforeWriteFailure = false;
    f.state.uncertainIssue = false;
    f.state.failCompensation = false;
    const fresh = await f.operations.run(op => f.protocol.forOperation(op).authorize.execute(f.input));
    if (!fresh.isLogin)
      throw new Error("Expected authorization continuation");
    const result = await f.redeem(fresh.code);
    expect("sid" in result ? result.sid : result.token).toBeTruthy();
    expect(f.state.issuedIds.at(-1)).not.toBe(target);
  }
});

test("Independent projection invariant failure creates no compensation identity", async () => {
  const f = await redemptionFixture("independent");
  f.state.projectionInvalid = true;
  await rejection(() => f.redeem());
  const consumed = await scope.observer.resolveProtocolArtifact(f.code, { protocol: "custom-sso", artifactType: "auth_code" });
  expect(consumed.status).toBe("consumed_replay");
  expect(f.state).toMatchObject({ issuedIds: [], attemptIds: [], compensations: [] });
});

test.each(["independent", "gateway-orcas"] as const)("%s controlled interruptions after consumption and issuance never reopen Code", async (mode) => {
  for (const phase of ["consumed", "issued"] as const) {
    const f = await redemptionFixture(mode);
    const reached = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const interrupt = async () => {
      reached.resolve();
      await resume.promise;
      throw new Error("controlled interruption; not a production process crash");
    };
    if (phase === "consumed")
      f.state.afterConsume = interrupt;
    else
      f.state.afterIssue = interrupt;
    const pending = rejection(() => f.redeem());
    try {
      await reached.promise;
      await rejection(() => f.redeem());
      expect(f.state.issuedIds).toHaveLength(phase === "issued" ? 1 : 0);
      if (phase === "issued") {
        const exists = await scope.activeObjectExists({ kind: "credential", id: f.state.issuedIds[0]! });
        expect(exists).toBe(true);
      }
      expect(f.state.compensations).toEqual([]);
    }
    finally {
      resume.resolve();
      await pending;
    }
  }
});

test.each(["independent", "gateway-orcas"] as const)("%s consumed response loss and audit failure cannot replay or revoke deliverable credentials", async (mode) => {
  const f = await redemptionFixture(mode);
  f.state.auditFailure = true;
  await f.redeem(); // Discard the successful delivery, as a caller losing its response would.
  const id = f.state.issuedIds[0]!;
  const exists = await scope.activeObjectExists({ kind: "credential", id });
  expect(exists).toBe(true);
  await rejection(() => f.redeem());
  expect(f.state).toMatchObject({ compensations: [], issuedIds: [id] });
});

test.each(["independent", "gateway-orcas"] as const)("%s delayed failure compensates its own Credential and preserves a newer authorization", async (mode) => {
  const f = await redemptionFixture(mode);
  const reached = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  f.state.afterIssue = async () => {
    reached.resolve();
    await resume.promise;
    throw new Error("old issuance response interrupted");
  };
  const pending = rejection(() => f.redeem());
  let newerToken: string | undefined;
  try {
    await reached.promise;
    f.state.afterIssue = undefined;
    const fresh = await f.operations.run(op => f.protocol.forOperation(op).authorize.execute(f.input));
    if (!fresh.isLogin)
      throw new Error("Expected fresh authorization");
    const result = await f.redeem(fresh.code);
    newerToken = "sid" in result ? result.sid : result.token;
  }
  finally {
    resume.resolve();
    await pending;
  }
  expect(f.state.compensations).toEqual([f.state.issuedIds[0]!]);
  const oldExists = await scope.activeObjectExists({ kind: "credential", id: f.state.issuedIds[0]! });
  expect(oldExists).toBe(false);
  const newer = await scope.observer.resolveCredential(newerToken!, { protocol: "custom-sso", credentialType: "local_session" });
  expect(newer.status).toBe("resolved");
});

test("Independent contenders enter projection only after the unique confirmed consumption", async () => {
  const f = await redemptionFixture("independent");
  const reached = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  f.state.beforeProjection = async () => {
    reached.resolve();
    await resume.promise;
  };
  const winner = f.redeem();
  try {
    await reached.promise;
    await rejection(() => f.redeem());
    expect(f.state.issuedIds).toEqual([]);
  }
  finally { resume.resolve(); }
  await winner;
  expect(f.state.facts).toBe(1);
  expect(f.state.issuedIds).toHaveLength(1);
});

test("Independent Client authentication and Gateway mode mismatch preserve Code before consumption", async () => {
  const f = await redemptionFixture("independent");
  f.state.secretValid = false;
  await rejection(() => f.redeem());
  f.state.secretValid = true;
  await rejection(() => f.operations.run(op => f.protocol.forOperation(op).completeCallback.execute({
    clientCode: f.clientCode,
    code: f.code,
    redirectUrl: f.input.redirectUrl,
  })));
  const retained = await scope.observer.resolveProtocolArtifact(f.code, { protocol: "custom-sso", artifactType: "auth_code" });
  expect(retained.status).toBe("resolved");
  expect(f.state).toMatchObject({ facts: 0, issuedIds: [] });
  await f.redeem();
});

test.each(["independent", "gateway-orcas"] as const)("%s consumption rejects replaced and revoked observed Artifacts", async (mode) => {
  for (const change of ["replaced", "revoked"] as const) {
    const f = await redemptionFixture(mode);
    if (change === "replaced") {
      scope.replaceArtifactPayloadBeforeNextValidation({
        artifactId: f.grantId,
        serializedPayload: JSON.stringify({ ...f.artifact, metadata: { ...f.artifact.metadata, configVersion: 8 } }),
      });
    }
    else {
      f.state.beforeConsume = async () => {
        await scope.observer.revokeArtifact(f.grantId, "admin_revoke");
      };
    }
    await rejection(() => f.redeem());
    expect(f.state).toMatchObject({ facts: 0, issuedIds: [], compensations: [] });
    const artifact = await scope.observer.resolveProtocolArtifact(f.code, { protocol: "custom-sso", artifactType: "auth_code" });
    expect(artifact.status).toBe(change === "replaced" ? "resolved" : "revoked");
    if (artifact.status === "resolved")
      expect(artifact.value.metadata?.configVersion).toBe(8);
    const peer = await scope.observer.resolveCredential(f.credential.externalToken!, { protocol: "custom-sso", credentialType: "local_session" });
    expect(peer.status).toBe("resolved");
  }
});

test.each(["independent", "gateway-orcas"] as const)("%s undelivered Credential follows root renewal and disappears from access after root revocation", async (mode) => {
  const f = await redemptionFixture(mode);
  f.state.uncertainIssue = true;
  f.state.failCompensation = true;
  await rejection(() => f.redeem());
  const id = f.state.issuedIds[0]!;
  const token = f.state.issuedTokens[0]!;
  const residual = await scope.observer.resolveCredential(token, { protocol: "custom-sso", credentialType: "local_session" });
  expect(residual.status).toBe("resolved");
  const renewed = await scope.writer.renewPrincipalSession(f.root.value.principalSessionId);
  expect(renewed.status).toBe("resolved");
  const extended = await scope.observer.resolveCredential(token, { protocol: "custom-sso", credentialType: "local_session" });
  if (extended.status !== "resolved" || renewed.status !== "resolved" || residual.status !== "resolved")
    throw new Error("Expected retained renewable credential");
  expect(extended.value.renewalPolicy).toBe("extend_with_principal");
  expect(extended.value.expiresAt).toBeGreaterThanOrEqual(residual.value.expiresAt);
  expect(extended.value.expiresAt).toBeLessThanOrEqual(renewed.value.absoluteExpiresAt);
  await scope.writer.revokePrincipalSession(f.root.value.principalSessionId);
  const exists = await scope.activeObjectExists({ kind: "credential", id });
  expect(exists).toBe(false);
});

test("maintenance decodes real old Grant inventory, rejects uncertain records and recognizes active/consumed targets", async () => {
  const f = await redemptionFixture("gateway");
  const key = `${customSsoMaintenancePrefixes()[0]}${f.grantId}`;
  await createLegacyAuthorizationGrantFixture({ redis }).initialize({ version: 1, grantId: f.grantId, state: "issued", expiresAt: f.artifact.expiresAt });
  for (const state of ["issued", "redeeming", "consumed"] as const) {
    const common = { version: 1 as const, grantId: f.grantId, expiresAt: f.artifact.expiresAt };
    const record = state === "redeeming"
      ? { ...common, state, attemptId: randomUUID(), leaseExpiresAt: f.artifact.expiresAt }
      : { ...common, state };
    await createLegacyAuthorizationGrantFixture({ redis }).initialize(record);
    const stored = await redis.get(key);
    expect(decodeCustomSsoLegacyGrant(key, stored!)).toEqual(record);
  }
  await createLegacyAuthorizationGrantFixture({ redis }).initialize({ version: 1, grantId: f.grantId, state: "issued", expiresAt: f.artifact.expiresAt });
  const raw = await redis.get(key);
  if (!raw)
    throw new Error("Expected legacy inventory");
  expect(decodeCustomSsoLegacyGrant(key, raw)).toMatchObject({ grantId: f.grantId, state: "issued", expiresAt: f.artifact.expiresAt });
  expect(() => decodeCustomSsoLegacyGrant(`${key}-wrong`, raw)).toThrow();
  expect(() => decodeCustomSsoLegacyGrant(key, "not-json")).toThrow();
  expect(() => decodeCustomSsoLegacyGrant(key, JSON.stringify({ ...JSON.parse(raw), state: "unknown" }))).toThrow();
  expect(isCustomSsoAuthorizationArtifact(f.artifact)).toBe(true);
  expect(isCustomSsoAuthorizationArtifact(f.credential.value)).toBe(false);
  expect(isCustomSsoAuthorizationArtifact({ ...f.artifact, protocol: "oidc" })).toBe(false);
  const next = await redemptionFixture("independent");
  await next.redeem();
  const consumed = await scope.observer.resolveProtocolArtifact(next.code, { protocol: "custom-sso", artifactType: "auth_code" });
  if (consumed.status !== "consumed_replay")
    throw new Error("Expected consumed inventory");
  expect(isCustomSsoAuthorizationArtifact(consumed.tombstone)).toBe(true);
});

test("ORCAS missing Profile burns Code without outbounds or Credential", async () => {
  const f = await redemptionFixture("gateway-orcas");
  f.state.userMissing = true;
  const error = await rejection(() => f.redeem());
  const consumed = await scope.observer.resolveProtocolArtifact(f.code, { protocol: "custom-sso", artifactType: "auth_code" });
  expect(error).toBeInstanceOf(Error);
  expect(consumed.status).toBe("consumed_replay");
  expect(f.state).toMatchObject({ reads: 1, issuedIds: [], orcasCalls: 0 });
});

test.each(["independent", "gateway", "gateway-orcas"] as const)("%s permission survives in-flight blocking and disabled transitions", async (mode) => {
  for (const access of ["blocking", "disabled"] as const) {
    const f = await redemptionFixture(mode);
    f.state.afterRead = access;
    const result = await f.redeem();
    const token = "sid" in result ? result.sid : result.token;
    const credential = await scope.writer.resolveCredential(token, { protocol: "custom-sso", credentialType: "local_session" });
    expect(credential.status).toBe("resolved");
    expect(f.state.reads).toBe(1);
    const denied = await rejection(() => f.operations.run(op =>
      f.protocol.forOperation(op).resolvePublicAuthentication(token, f.clientCode)));
    expect(denied).toBeInstanceOf(access === "disabled" ? SubjectAccessOperationDeniedError : SubjectAccessUnavailableError);
    expect(f.state.reads).toBe(2);
  }
});

test.each(["independent", "gateway", "gateway-orcas"] as const)("%s concurrent redemption keeps exactly one real Credential winner", async (mode) => {
  const f = await redemptionFixture(mode);
  const reached = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  let arrivals = 0;
  f.state.beforeConsume = async () => {
    arrivals += 1;
    if (arrivals === 2)
      reached.resolve();
    await resume.promise;
  };
  const pending = Promise.allSettled([f.redeem(), f.redeem()]);
  await reached.promise;
  resume.resolve();
  const outcomes = await pending;
  expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.filter(outcome => outcome.status === "rejected")).toHaveLength(1);
  expect(f.state.issuedIds).toHaveLength(1);
  expect(f.state.orcasCalls).toBe(mode === "gateway-orcas" ? 1 : 0);
});

test.each(["failed", "response-lost"] as const)("ORCAS %s burns Code and a fresh authorization may create another external session", async (failure) => {
  const f = await redemptionFixture("gateway-orcas");
  f.state.orcasFailure = failure;
  await rejection(() => f.redeem());
  const consumed = await scope.observer.resolveProtocolArtifact(f.code, { protocol: "custom-sso", artifactType: "auth_code" });
  expect(consumed.status).toBe("consumed_replay");
  expect(f.state).toMatchObject({ orcasCalls: 1, orcasEffects: failure === "failed" ? 0 : 1, issuedIds: [], attemptIds: [], compensations: [] });
  await rejection(() => f.redeem());
  expect(f.state.orcasCalls).toBe(1);
  f.state.orcasFailure = undefined;
  const fresh = await f.operations.run(op => f.protocol.forOperation(op).authorize.execute(f.input));
  if (!fresh.isLogin)
    throw new Error("Expected fresh authorization");
  await f.redeem(fresh.code);
  expect(f.state.orcasCalls).toBe(2);
  expect(f.state.orcasEffects).toBe(failure === "failed" ? 1 : 2);
});

test.each(["during-orcas", "after-issue"] as const)("Gateway parent revocation %s prevents delivery and keeps Code consumed", async (phase) => {
  const f = await redemptionFixture("gateway-orcas");
  const revoke = async () => {
    await scope.observer.revokePrincipalSession(f.root.value.principalSessionId);
  };
  if (phase === "during-orcas")
    f.state.beforeOrcas = revoke;
  else
    f.state.afterIssue = revoke;
  await rejection(() => f.redeem());
  await rejection(() => f.redeem());
  expect(f.state.orcasCalls).toBe(1);
  const retained = await scope.observer.resolveProtocolArtifact(f.code, { protocol: "custom-sso", artifactType: "auth_code" });
  expect(retained.status).not.toBe("resolved");
  for (const id of f.state.issuedIds) {
    const exists = await scope.activeObjectExists({ kind: "credential", id });
    expect(exists).toBe(false);
  }
});

test("Gateway rejects a Grant with a different subject before consumption and preserves peer access", async () => {
  const f = await redemptionFixture("gateway-orcas");
  const invalid = await scope.writer.createProtocolArtifact({
    principalSessionId: f.root.value.principalSessionId,
    protocol: "custom-sso",
    clientCode: f.clientCode,
    artifactType: "auth_code",
    ttlMs: 60_000,
    metadata: { ...f.artifact.metadata, subjectIdentifier: randomUUID() },
  });
  if (invalid.status !== "created" || !invalid.externalToken)
    throw new Error("Expected invalid subject fixture");
  await rejection(() => f.redeem(invalid.externalToken));
  const rejected = await scope.observer.resolveProtocolArtifact(invalid.externalToken, { protocol: "custom-sso", artifactType: "auth_code" });
  expect(rejected.status).toBe("revoked");
  const valid = await scope.observer.resolveProtocolArtifact(f.code, { protocol: "custom-sso", artifactType: "auth_code" });
  expect(valid).toMatchObject({ status: "resolved", value: f.artifact });
  const peer = await scope.observer.resolveCredential(f.credential.externalToken!, { protocol: "custom-sso", credentialType: "local_session" });
  expect(peer.status).toBe("resolved");
  expect(f.state).toMatchObject({ reads: 0, issuedIds: [], compensations: [], orcasCalls: 0 });
});
