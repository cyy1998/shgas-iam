import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createLegacyAuthorizationGrantFixture, createLegacyGrantMaintenanceFixture } from "@iam/custom-sso/testing";
import { createSessionKernel, createSessionKernelConfig } from "@iam/session-kernel";
import { createKernelMaintenanceFixture } from "@iam/session-kernel/testing";
import Redis from "ioredis";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { createCustomSsoGrantMaintenance, createCustomSsoGrantVerifier } from "../../src/composition/session/custom-sso-grant-maintenance.ts";
import { createProviderSessionStateStore } from "../../src/session/provider-session-state.store.ts";
import { providerSessionBindingLookupKey, providerSessionGenerationMembersKey, providerSessionPrincipalAnchorKey } from "../../src/session/provider-session.ts";
import { RedisOidcAdapter } from "../../src/storage/redis-adapter.ts";
import { createOidcProtocolObjectInspection } from "./oidc-protocol-object-inspection.ts";
import { createProviderSessionStateInspection } from "./provider-session-state-inspection.ts";
import { createOidcProviderRedisTestHarness } from "./redis-test-harness.ts";

let harness: Awaited<ReturnType<typeof createOidcProviderRedisTestHarness>>;
let scope: Awaited<ReturnType<typeof harness.createScope>>;
beforeAll(async () => {
  harness = await createOidcProviderRedisTestHarness();
});
beforeEach(async () => {
  scope = await harness.createScope();
});
afterEach(async () => {
  await scope.close();
});
afterAll(async () => {
  await harness.close();
});

it("inventories without writing, invalidates only Custom SSO authorization artifacts and independently verifies", async () => {
  const namespace = `${scope.unique("kernel")}:`;
  scope.trackPrefix(namespace);
  const kernel = createSessionKernel({
    redis: scope.writer,
    config: createSessionKernelConfig({ namespace, principalIdleTtlMs: 120_000, principalAbsoluteTtlMs: 240_000, lookupHmacKeys: { current: { id: "test", secret: "maintenance-test-secret-00000000000000000000" } } }),
  });
  const principal = await kernel.createPrincipalSession(randomUUID(), { subjectContext: "opaque-context" });
  if (principal.status !== "created")
    throw new Error("Fixture principal failed");
  const artifact = await kernel.createProtocolArtifact({
    protocol: "custom-sso",
    artifactType: "auth_code",
    clientCode: "test-client",
    principalSessionId: principal.value.principalSessionId,
    ttlMs: 60_000,
  });
  if (artifact.status !== "created" || !artifact.externalToken)
    throw new Error("Fixture artifact failed");
  const options = { kernelNamespace: namespace, writersStopped: true };
  const fixture = createKernelMaintenanceFixture(scope.observer, namespace);
  const principalBefore = await fixture.observe("principal_session", principal.value.principalSessionId);
  const maintenance = createCustomSsoGrantMaintenance({ ...options, redis: scope.writer });
  const inventory = await maintenance.inventory();
  expect(inventory.status).toBe("passed");
  expect(inventory.kernel.targets).toBeGreaterThan(0);
  const before = await kernel.resolveProtocolArtifact(artifact.externalToken, { protocol: "custom-sso", artifactType: "auth_code" });
  expect(before.status).toBe("resolved");
  const applied = await maintenance.apply();
  expect(applied.status).toBe("passed");
  const oldCode = await kernel.resolveProtocolArtifact(artifact.externalToken, { protocol: "custom-sso", artifactType: "auth_code" });
  expect(oldCode.status).toBe("missing_or_expired");
  const retained = await kernel.resolvePrincipalSessionById(principal.value.principalSessionId);
  expect(retained.status).toBe("resolved");
  const principalAfter = await fixture.observe("principal_session", principal.value.principalSessionId);
  expect(principalAfter).toEqual(principalBefore);
  const verified = await createCustomSsoGrantVerifier({ ...options, redis: { scan: scope.observer.scan.bind(scope.observer), get: scope.observer.get.bind(scope.observer) } }).verify();
  expect(verified.status).toBe("passed");
  expect(verified.kernel.targets).toBe(0);
});

async function scenario() {
  const namespace = `${scope.unique("kernel")}:`;
  scope.trackPrefix(namespace);
  const kernel = createSessionKernel({ redis: scope.writer, config: createSessionKernelConfig({
    namespace,
    principalIdleTtlMs: 120_000,
    principalAbsoluteTtlMs: 240_000,
    lookupHmacKeys: { current: { id: "test", secret: "maintenance-test-secret-00000000000000000000" } },
  }) });
  const options = { kernelNamespace: namespace, writersStopped: true };
  const reader = { scan: scope.observer.scan.bind(scope.observer), get: scope.observer.get.bind(scope.observer) };
  const fixture = createKernelMaintenanceFixture(scope.writer, namespace);
  return {
    kernel,
    options,
    fixture,
    reader,
    maintenance: createCustomSsoGrantMaintenance({ ...options, redis: scope.writer }),
    verifier: createCustomSsoGrantVerifier({ ...options, redis: reader }),
    grants: createLegacyAuthorizationGrantFixture({ redis: scope.writer, trackKey: scope.trackKey }),
    grantFixture: createLegacyGrantMaintenanceFixture(scope.writer, scope.trackKey),
    async target(protocol = "custom-sso", artifactType = "auth_code") {
      const result = await kernel.createProtocolArtifact({ protocol, artifactType, clientCode: "test-client", ttlMs: 120_000 });
      if (result.status !== "created" || !result.externalToken)
        throw new Error("Artifact fixture failed");
      return { value: result.value, token: result.externalToken, purpose: { protocol, artifactType } };
    },
  };
}

it("discovers unindexed artifacts, consumed tombstones and orphan legacy records in all three states", async () => {
  const s = await scenario();
  const pending = await s.target();
  await s.fixture.forgetArtifactIndexes(pending.value.artifactId);
  const consumed = await s.target();
  const observed = await s.kernel.resolveProtocolArtifact(consumed.token, consumed.purpose);
  if (observed.status !== "resolved")
    throw new Error("Expected observed artifact");
  const consumption = await s.kernel.consumeProtocolArtifact(consumed.token, consumed.purpose, observed.value);
  expect(consumption.status).toBe("resolved");
  const ids = [pending.value.artifactId, randomUUID(), consumed.value.artifactId];
  for (const [index, state] of (["issued", "redeeming", "consumed"] as const).entries()) {
    const base = { version: 1 as const, grantId: ids[index]!, expiresAt: Date.now() + 120_000 };
    await s.grants.initialize(state === "redeeming"
      ? { ...base, state, attemptId: "legacy-attempt", leaseExpiresAt: Date.now() + 60_000 }
      : { ...base, state });
  }
  const before = await s.verifier.inventory();
  expect(before.grants.states).toEqual({ issued: 1, redeeming: 1, consumed: 1 });
  const notEmpty = await s.verifier.verify();
  expect(notEmpty.status).toBe("failed");
  const applied = await s.maintenance.apply();
  expect(applied.status).toBe("passed");
  for (const id of ids) expect(await s.grantFixture.observe(id)).toBeNull();
  const tombstone = await s.fixture.observeTombstone(consumed.value.artifactId);
  expect(tombstone.payload).toBeNull();
  const verified = await s.verifier.verify();
  expect(verified.status).toBe("passed");
  const repeated = await s.maintenance.apply();
  expect(repeated.kernel.removed).toBe(0);
  expect(repeated.grants.removed).toBe(0);
});

it("preserves a replacement selected before CAS, including its later lookup discovery in the same run", async () => {
  const s = await scenario();
  const target = await s.target();
  let replacement: Awaited<ReturnType<typeof s.fixture.observe>> | undefined;
  let writes = 0;
  const maintenance = createCustomSsoGrantMaintenance({ ...s.options, redis: {
    ...s.reader,
    async eval(...args) {
      writes++;
      await s.fixture.replaceArtifact(target.value.artifactId);
      replacement = await s.fixture.observe("artifact", target.value.artifactId);
      return await scope.writer.eval(...args);
    },
  } });
  const report = await maintenance.apply();
  expect(report.status).toBe("failed");
  expect(writes).toBe(1);
  const after = await s.fixture.observe("artifact", target.value.artifactId);
  expect(after).toEqual(replacement);
  const verified = await s.verifier.verify();
  expect(verified.status).toBe("failed");
});

it.each(["json", "version", "identity"] as const)("retains %s authority and fails inventory, apply and verify closed", async (problem) => {
  const s = await scenario();
  const target = await s.target();
  await s.fixture.corruptArtifact(target.value.artifactId, problem);
  const before = await s.fixture.observe("artifact", target.value.artifactId);
  for (const operation of [s.verifier.inventory, s.maintenance.apply, s.verifier.verify]) {
    const report = await operation();
    expect(report.status).toBe("failed");
    expect(report.kernel.failed).toBeGreaterThan(0);
  }
  const after = await s.fixture.observe("artifact", target.value.artifactId);
  expect(after).toEqual(before);
});

it("does not infer ownership of an orphan lookup", async () => {
  const s = await scenario();
  const target = await s.target();
  await s.fixture.removeArtifactPayload(target.value.artifactId);
  const before = await s.fixture.observeArtifactReferences(target.value);
  const report = await s.maintenance.apply();
  expect(report.status).toBe("failed");
  expect(report.kernel.removed).toBe(0);
  const verified = await s.verifier.verify();
  expect(verified.status).toBe("failed");
  const after = await s.fixture.observeArtifactReferences(target.value);
  expect(after).toEqual(before);
});

it("keeps changed lookup owners and non-target objects intact", async () => {
  const s = await scenario();
  const target = await s.target();
  const other = await s.target("oidc", "authorization_code");
  await s.fixture.redirectArtifactLookup(target.value, other.value);
  const before = await s.fixture.observeArtifactReferences(target.value);
  const otherBefore = await s.fixture.observeArtifactReferences(other.value);
  const report = await s.maintenance.apply();
  expect(report.status).toBe("failed");
  const after = await s.fixture.observeArtifactReferences(target.value);
  const otherAfter = await s.fixture.observeArtifactReferences(other.value);
  expect(after).toEqual(before);
  expect(otherAfter).toEqual(otherBefore);
});

it("compares lookup and tombstone observations before every destructive operation", async () => {
  const s = await scenario();
  const target = await s.target();
  const other = await s.target("oidc", "authorization_code");
  let replaced: Awaited<ReturnType<typeof s.fixture.observeArtifactReferences>> | undefined;
  const report = await createCustomSsoGrantMaintenance({ ...s.options, redis: { ...s.reader, async eval(...args) {
    await s.fixture.redirectArtifactLookup(target.value, other.value);
    replaced = await s.fixture.observeArtifactReferences(target.value);
    return await scope.writer.eval(...args);
  } } }).apply();
  expect(report.status).toBe("failed");
  const after = await s.fixture.observeArtifactReferences(target.value);
  expect(after).toEqual(replaced);
});

it("preserves changed consumed tombstones and replacement legacy records", async () => {
  const s = await scenario();
  const target = await s.target();
  const observed = await s.kernel.resolveProtocolArtifact(target.token, target.purpose);
  if (observed.status !== "resolved")
    throw new Error("Expected artifact");
  await s.kernel.consumeProtocolArtifact(target.token, target.purpose, observed.value);
  let replacement: Awaited<ReturnType<typeof s.fixture.observeTombstone>> | undefined;
  const report = await createCustomSsoGrantMaintenance({ ...s.options, redis: { ...s.reader, async eval(...args) {
    await s.fixture.replaceTombstone(target.value.artifactId);
    replacement = await s.fixture.observeTombstone(target.value.artifactId);
    return await scope.writer.eval(...args);
  } } }).apply();
  expect(report.status).toBe("failed");
  const after = await s.fixture.observeTombstone(target.value.artifactId);
  expect(after).toEqual(replacement);
  const id = randomUUID();
  await s.grants.initialize({ version: 1, grantId: id, state: "issued", expiresAt: Date.now() + 120_000 });
  let grantReplacement: string | null = null;
  const grantReport = await createCustomSsoGrantMaintenance({ ...s.options, redis: { ...s.reader, async eval(...args) {
    await s.grants.initialize({ version: 1, grantId: id, state: "consumed", expiresAt: Date.now() + 120_000 });
    grantReplacement = await s.grantFixture.observe(id);
    return await scope.writer.eval(...args);
  } } }).apply();
  expect(grantReport.grants.status).toBe("failed");
  const grantAfter = await s.grantFixture.observe(id);
  expect(grantAfter).toBe(grantReplacement);
});

it("validates index types before writing and does not partly remove an artifact on Lua error", async () => {
  const s = await scenario();
  const target = await s.target();
  await s.fixture.corruptArtifactIndex(target.value.artifactId);
  const before = await s.fixture.observeArtifactReferences(target.value);
  const report = await s.maintenance.apply();
  expect(report.status).toBe("failed");
  const after = await s.fixture.observeArtifactReferences(target.value);
  expect(after).toEqual(before);
});

it.each(["json", "version", "identity", "state"] as const)("preserves %s legacy records and reports only safe failure counts", async (problem) => {
  const s = await scenario();
  const id = randomUUID();
  await s.grantFixture.corrupt(id, problem);
  const before = await s.grantFixture.observe(id);
  const report = await s.maintenance.apply();
  expect(report.status).toBe("failed");
  expect(report.grants.failed).toBe(1);
  expect(JSON.stringify(report)).not.toContain(id);
  const after = await s.grantFixture.observe(id);
  expect(after).toBe(before);
  const verified = await s.verifier.verify();
  expect(verified.status).toBe("failed");
});

it("reports partial removal and unknown commits, then converges from actual inventory on a new run", async () => {
  const s = await scenario();
  const targets = [await s.target(), await s.target(), await s.target()];
  let writes = 0;
  const report = await createCustomSsoGrantMaintenance({ ...s.options, redis: { ...s.reader, async eval(...args) {
    if (++writes === 3)
      throw new Error("sensitive redis://password Code cookie subject");
    const value = await scope.writer.eval(...args);
    if (writes === 2)
      throw new Error("commit response lost");
    return value;
  } } }).apply();
  expect(report.status).toBe("failed");
  expect(report.kernel.failed).toBe(2);
  expect(report.kernel.removed).toBe(1);
  const stored = await Promise.all(targets.map(target => s.fixture.observe("artifact", target.value.artifactId)));
  expect(stored.filter(value => value.payload === null)).toHaveLength(2);
  expect(stored.filter(value => value.payload !== null)).toHaveLength(1);
  expect(JSON.stringify(report)).not.toContain("password");
  const remaining = await s.verifier.verify();
  expect(remaining.status).toBe("failed");
  const repeated = await s.maintenance.apply();
  expect(repeated.status).toBe("passed");
  const verified = await s.verifier.verify();
  expect(verified.status).toBe("passed");
});

it("reports incomplete SCAN and aborted verification without holding write capabilities", async () => {
  const s = await scenario();
  const verifier = createCustomSsoGrantVerifier({ ...s.options, redis: {
    get: s.reader.get,
    async scan() { throw new Error("sensitive connection"); },
  } });
  const report = await verifier.verify();
  expect(report.status).toBe("failed");
  expect(report.kernel).toMatchObject({ scanComplete: false, unverified: 1 });
  expect(report.grants).toMatchObject({ scanComplete: false, unverified: 1 });
  const signal = AbortSignal.abort();
  const aborted = await createCustomSsoGrantVerifier({ ...s.options, redis: s.reader, signal }).verify();
  expect(aborted.status).toBe("failed");
  expect(JSON.stringify(report)).not.toContain("sensitive");
});

function command(args: string[], namespace: string, overrides: Record<string, string | undefined> = {}) {
  const url = new URL(process.env.IAM_OIDC_PROVIDER_TEST_REDIS_URL!);
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    execFile(process.execPath, ["--import", "tsx", "src/commands/custom-sso-grant-command.ts", ...args], {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      timeout: 10_000,
      maxBuffer: 64 * 1024,
      env: { ...process.env, IAM_OIDC_PROVIDER_REDIS_HOST: url.hostname, IAM_OIDC_PROVIDER_REDIS_PORT: url.port || "6379", IAM_OIDC_PROVIDER_REDIS_DB: url.pathname.slice(1) || "0", IAM_OIDC_PROVIDER_REDIS_PASSWORD: decodeURIComponent(url.password) || undefined, IAM_OIDC_PROVIDER_SESSION_KERNEL_NAMESPACE: namespace, ...overrides },
    }, (error, stdout, stderr) => { resolve({ code: error ? Number(error.code) || 1 : 0, stdout, stderr }); });
  });
}

it("runs inventory, apply and independent verify in separate CLI processes with safe exit gates", async () => {
  const s = await scenario();
  const target = await s.target();
  const before = await s.fixture.observeArtifactReferences(target.value);
  const inventory = await command(["inventory", "--writers-stopped"], s.options.kernelNamespace);
  expect(inventory.code).toBe(0);
  expect(JSON.parse(inventory.stdout).status).toBe("passed");
  const inventoryAfter = await s.fixture.observeArtifactReferences(target.value);
  expect(inventoryAfter).toEqual(before);
  const missingConfirmation = await command(["apply"], s.options.kernelNamespace);
  expect(missingConfirmation.code).not.toBe(0);
  const unsafeNamespace = await command(["apply", "--writers-stopped"], "*");
  expect(unsafeNamespace.code).not.toBe(0);
  const beforeApply = await command(["verify", "--writers-stopped"], s.options.kernelNamespace);
  expect(beforeApply.code).not.toBe(0);
  const applied = await command(["apply", "--writers-stopped"], s.options.kernelNamespace);
  expect(applied.code).toBe(0);
  const verified = await command(["verify", "--writers-stopped"], s.options.kernelNamespace);
  expect(verified.code).toBe(0);
  expect(JSON.parse(verified.stdout)).toMatchObject({ operation: "verify", kernel: { targets: 0, scanComplete: true }, preservation: "requires_independent_baseline_comparison" });
  const missingResource = await command(["verify", "--writers-stopped"], s.options.kernelNamespace, { IAM_OIDC_PROVIDER_REDIS_HOST: undefined });
  expect(missingResource.code).not.toBe(0);
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Expected TCP address");
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  const connectionFailure = await command(["verify", "--writers-stopped"], s.options.kernelNamespace, { IAM_OIDC_PROVIDER_REDIS_HOST: "127.0.0.1", IAM_OIDC_PROVIDER_REDIS_PORT: String(address.port), IAM_OIDC_PROVIDER_REDIS_PASSWORD: "sensitive-not-for-output" });
  expect(connectionFailure.code).not.toBe(0);
  expect(`${connectionFailure.stdout}${connectionFailure.stderr}`).not.toContain("sensitive-not-for-output");
}, 20_000);

it("verifies with a Redis account that cannot execute any write command", async () => {
  const s = await scenario();
  const target = await s.target();
  const username = scope.unique("reader");
  const password = randomUUID();
  await scope.writer.acl("SETUSER", username, "on", `>${password}`, "~*", "-@all", "+scan", "+get", "+select", "+quit");
  const redis = new Redis(process.env.IAM_OIDC_PROVIDER_TEST_REDIS_URL!, {
    username,
    password,
    lazyConnect: true,
    enableReadyCheck: false,
    retryStrategy: () => null,
    maxRetriesPerRequest: 0,
  });
  redis.on("error", () => {});
  try {
    await redis.connect();
    const verifier = createCustomSsoGrantVerifier({ ...s.options, redis: { scan: redis.scan.bind(redis), get: redis.get.bind(redis) } });
    const before = await s.fixture.observeArtifactReferences(target.value);
    const inventory = await verifier.inventory();
    expect(inventory.status).toBe("passed");
    let denied: unknown;
    try {
      await redis.eval("return 1", 0);
    }
    catch (error) { denied = error; }
    expect(denied).toBeInstanceOf(Error);
    const after = await s.fixture.observeArtifactReferences(target.value);
    expect(after).toEqual(before);
    const apply = await s.maintenance.apply();
    expect(apply.status).toBe("passed");
    const verify = await verifier.verify();
    expect(verify.status).toBe("passed");
    await scope.writer.acl("SETUSER", username, "-scan");
    const failed = await verifier.verify();
    expect(failed.status).toBe("failed");
    expect(failed.kernel.scanComplete).toBe(false);
  }
  finally {
    redis.disconnect();
    await scope.writer.acl("DELUSER", username);
  }
});

it("preserves Principal, both Custom SSO Credentials and OIDC Binding, Code, Token and Provider Session bytes and expiry", async () => {
  const s = await scenario();
  const subject = randomUUID();
  const principal = await s.kernel.createPrincipalSession(subject, { subjectContext: "opaque-context" });
  if (principal.status !== "created")
    throw new Error("Principal fixture failed");
  const principalId = principal.value.principalSessionId;
  const clientCode = scope.unique("client");
  const preserved: Array<{ kind: "principal_session" | "credential" | "client_binding" | "artifact"; id: string }> = [{ kind: "principal_session", id: principalId }];
  for (const mode of ["independent", "gateway"]) {
    const credential = await s.kernel.issueCredential({
      principalSessionId: principalId,
      clientCode,
      protocol: "custom-sso",
      credentialType: "local_session",
      renewalPolicy: "extend_with_principal",
      ttlMs: 120_000,
      tokenKind: "localSession",
      metadata: { version: 2, mode, configVersion: 1 },
    });
    if (credential.status !== "created")
      throw new Error("Credential fixture failed");
    preserved.push({ kind: "credential", id: credential.value.credentialId });
  }
  const binding = await s.kernel.createClientBinding({ principalSessionId: principalId, protocol: "oidc", clientCode, ttlMs: 120_000 });
  if (binding.status !== "created")
    throw new Error("Binding fixture failed");
  preserved.push({ kind: "client_binding", id: binding.value.bindingId });
  const providerSessionUid = scope.unique("provider");
  const generation = scope.unique("generation");
  const providerBinding = { bindingId: binding.value.bindingId, principalSessionId: principalId, clientCode, accountId: subject, authTime: binding.value.authTime, expiresAt: binding.value.expiresAt, oidcConfigVersion: 1, mappingOwnerId: randomUUID(), anchorGeneration: generation };
  for (const key of [providerSessionBindingLookupKey(providerSessionUid, clientCode), providerSessionPrincipalAnchorKey(providerSessionUid), providerSessionGenerationMembersKey(providerSessionUid, generation)]) scope.trackKey(key);
  const state = createProviderSessionStateStore({
    get: scope.writer.get.bind(scope.writer),
    mget: scope.writer.mget.bind(scope.writer),
    set: async () => { throw new Error("Publication must use its atomic owner operation"); },
    del: scope.writer.del.bind(scope.writer),
    eval: scope.writer.eval.bind(scope.writer),
    zrangebyscore: scope.writer.zrangebyscore.bind(scope.writer),
    zremrangebyscore: scope.writer.zremrangebyscore.bind(scope.writer),
  });
  const publication = await state.publishRebind({ attemptId: generation, expectedAnchorGeneration: null, providerSessionUid, expiresAt: binding.value.expiresAt, binding: providerBinding });
  expect(publication.status).toBe("committed");
  // Register the production adapter's actual keys for exact fixture cleanup without reproducing its key protocol.
  const trackedWriter = new Proxy(scope.writer, {
    get(target, property) {
      if (property === "eval") {
        return async (script: string, count: number, ...args: Array<string | number>) => {
          for (const key of args.slice(0, count)) scope.trackKey(String(key));
          return await target.eval(script, count, ...args);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const unused = () => {
    throw new Error("Unexpected read/mutation during preservation fixture");
  };
  const deps = {
    claims: { createAuthorizationCodeSnapshot: async () => ({ subjectIdentifier: subject }) },
    clientVersions: { findActiveVersion: async () => 1 },
    providerSessions: { readForAuthorization: async () => providerBinding, readPrincipalAnchor: async () => ({ accountId: subject, principalSessionId: principalId, generation }), ensureClientBinding: async () => providerBinding, consumeStaged: unused, destroyProviderSession: unused },
    tokens: { revokeAccessToken: unused },
    oidcSession: {
      async registerAuthorizationCodeArtifact(input: { providerCodeId: string }) {
        const artifact = await s.kernel.createProtocolArtifact({ principalSessionId: principalId, bindingId: binding.value.bindingId, protocol: "oidc", artifactType: "authorization_code", clientCode, externalToken: input.providerCodeId, ttlMs: 120_000 });
        if (artifact.status !== "created")
          return false;
        preserved.push({ kind: "artifact", id: artifact.value.artifactId });
        return true;
      },
      async registerAccessTokenCredential(input: { providerTokenId: string }) {
        const credential = await s.kernel.issueCredential({ principalSessionId: principalId, bindingId: binding.value.bindingId, protocol: "oidc", credentialType: "access_token", clientCode, externalToken: input.providerTokenId, ttlMs: 120_000 });
        if (credential.status !== "created")
          return null;
        preserved.push({ kind: "credential", id: credential.value.credentialId });
        return credential.value;
      },
      resolveAuthorizationCodeSessionLifetime: unused,
      consumeAuthorizationCodeArtifact: unused,
      resolveAccessTokenCredential: unused,
      revokeAccessTokenCredential: unused,
    },
  };
  const objects = ["AuthorizationCode", "AccessToken", "Session", "Interaction", "Grant"].map(model => ({ model, id: scope.unique(model) }));
  for (const { model, id } of objects) {
    await new RedisOidcAdapter(model, trackedWriter, deps).upsert(id, {
      clientId: clientCode,
      accountId: subject,
      sessionUid: providerSessionUid,
      scope: "openid",
      uid: providerSessionUid,
    }, 120);
  }
  const nonTarget = await s.target("custom-sso", "different_purpose");
  preserved.push({ kind: "artifact", id: nonTarget.value.artifactId });
  const target = await s.target();
  await s.fixture.forgetArtifactIndexes(target.value.artifactId);
  const protocolInspection = createOidcProtocolObjectInspection(scope.observer);
  const providerInspection = createProviderSessionStateInspection(scope.observer);
  const observe = async () => ({
    kernel: await Promise.all(preserved.map(item => s.fixture.observe(item.kind, item.id))),
    oidc: await Promise.all(objects.map(({ model, id }) => protocolInspection.observe(model, id))),
    provider: await providerInspection.observe(providerSessionUid, clientCode, generation),
  });
  const before = await observe();
  expect(before.kernel.every(item => item.payload !== null && item.expiresAt > 0)).toBe(true);
  expect(before.oidc.every(item => item.payload !== null && item.expiresAt > 0)).toBe(true);
  expect(before.provider.every(item => item.payload !== null && item.expiresAt > 0)).toBe(true);
  const inventory = await s.verifier.inventory();
  expect(inventory.status).toBe("passed");
  const afterInventory = await observe();
  expect(afterInventory).toEqual(before);
  const applied = await s.maintenance.apply();
  expect(applied.status).toBe("passed");
  const verify = await s.verifier.verify();
  expect(verify.status).toBe("passed");
  const after = await observe();
  expect(after).toEqual(before);
  const oldCode = await s.kernel.resolveProtocolArtifact(target.token, target.purpose);
  expect(oldCode.status).toBe("missing_or_expired");
  const continuation = await s.kernel.createProtocolArtifact({ principalSessionId: principalId, protocol: "custom-sso", artifactType: "auth_code", clientCode, ttlMs: 120_000 });
  expect(continuation.status).toBe("created");
});
