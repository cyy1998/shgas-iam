import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { createSubjectAccessOperations, createSubjectAccessSessionContext, createSubjectAccessSessionRevocation } from "@iam/api-core/subject-access";
import { ClientStatus, CustomSsoClientMode, SubjectClaim } from "@iam/contracts";
import { createCustomSsoOperations } from "@iam/custom-sso";
import { createCustomSsoCleanup } from "@iam/custom-sso/cleanup";
import { createAuthorizationGrantRedisInspection } from "@iam/custom-sso/testing";
import { createSessionKernelRedisTestHarness } from "@iam/session-kernel/testing";
import { expect, test } from "bun:test";
import Redis from "ioredis";

test.each(["independent", "gateway", "gateway-orcas"])("complete %s operations and independent synchronous cleanup use real Redis", async (mode) => {
  const url = process.env.IAM_CUSTOM_SSO_TEST_REDIS_URL;
  if (!url)
    throw new Error("IAM_CUSTOM_SSO_TEST_REDIS_URL is required; no fallback is allowed");
  const redis = new Redis(url, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0 });
  await redis.connect();
  const harness = await createSessionKernelRedisTestHarness(url);
  const cleanup = createCustomSsoCleanup({ redis });
  const scope = await harness.createSessionKernelScope({ cleanupAdapters: [cleanup] });
  const grantIds: string[] = [];
  const grants = createAuthorizationGrantRedisInspection(redis);
  const sentinel = `iam:test:custom-sso:sentinel:${randomUUID()}`;
  try {
    const subjectIdentifier = randomUUID();
    const clientCode = `client-${randomUUID()}`;
    const redirectUrl = "https://app.example.com/callback";
    const independent = mode === "independent";
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
            subjectClaims: [SubjectClaim.SubjectIdentifier],
            validRedirectUrls: [redirectUrl],
            callbackEndpoint: redirectUrl,
            logoutEndpoint: "https://app.example.com/logout",
          }
        : {
            mode: CustomSsoClientMode.Gateway,
            subjectClaims: [SubjectClaim.SubjectIdentifier],
            validRedirectUrls: [redirectUrl],
            orcas: { enabled: mode === "gateway-orcas" },
          },
    };
    const events: string[] = [];
    const protocol = createCustomSsoOperations({
      redis,
      kernel: scope.writer,
      clients: { findRuntimeRecord: async () => client },
      clientSecrets: { findSecretRecord: async () => ({ ...client, customSsoSecretHash: "test-hash" }) },
      secrets: { verify: async secret => secret === "test-secret" },
      traffic: { check: async () => ({ outcome: "enabled" }) },
      subjectProjection: { resolve: async input => ({ subjectIdentifier: input.subjectIdentifier }) },
      permittedUsers: { findOrcasUserBySubjectIdentifier: async () => ({ id: 1, username: "test", name: "Test" }) },
      orcas: { orcasLogin: async () => {
        events.push("orcas");
        return { orcasId: "test-orcas", orcasSessionId: "test-session" };
      } },
      auditLogWriter: { recordAuditLog: async (input) => { events.push(input.action); } },
      logger: { info() {}, warn() {} },
      random: { uuid: randomUUID },
      config: { authCodeExpireSeconds: 60, localSessionTtlSeconds: 120 },
    });
    const generation = randomUUID();
    const operations = createSubjectAccessOperations({
      barrier: { readCommittedTransitionId: async () => generation },
      revocation: createSubjectAccessSessionRevocation(scope.writer),
    });
    const principal = await operations.run(async (operation) => {
      const permission = await operation.acquireForAuthentication(subjectIdentifier);
      return await scope.writer.createPrincipalSession(subjectIdentifier, createSubjectAccessSessionContext(operation, permission));
    });
    if (principal.status !== "created")
      throw new Error("Principal Session creation failed");
    const input = { clientCode, globalSessionToken: principal.externalToken!, redirectUrl, tokenSource: "cookie" as const };
    const continuation = await operations.run(operation => protocol.forOperation(operation).checkLoginContinuation.execute(input));
    expect(continuation).toBe("valid");
    async function authorize() {
      const grant = await operations.run(operation => protocol.forOperation(operation).authorize.execute(input));
      if (!grant.isLogin)
        throw new Error("Authorization failed");
      const artifact = await scope.observer.resolveProtocolArtifact(grant.code, { protocol: "custom-sso", artifactType: "auth_code" });
      if (artifact.status !== "resolved")
        throw new Error("Artifact was not persisted");
      const grantId = artifact.value.artifactId;
      grantIds.push(grantId);
      const record = await grants.inspect(grantId);
      expect(record).toMatchObject({ state: "issued" });
      return grant.code;
    }
    const code = await authorize();
    let rejected: unknown;
    try {
      if (independent)
        await operations.run(operation => protocol.forOperation(operation).exchangeCode.execute({ clientCode, code, clientSecret: "test-secret", redirectUri: "https://other.example.com" }));
      else
        await operations.run(operation => protocol.forOperation(operation).completeCallback.execute({ clientCode, code, redirectUrl: "https://other.example.com" }));
    }
    catch (error) { rejected = error; }
    expect(rejected).toBeInstanceOf(Error);
    const token = independent
      ? (await operations.run(operation => protocol.forOperation(operation).exchangeCode.execute({ clientCode, code, clientSecret: "test-secret", redirectUri: redirectUrl }))).sid
      : (await operations.run(operation => protocol.forOperation(operation).completeCallback.execute({ clientCode, code, redirectUrl }))).token;
    const wire = await operations.run(async (operation) => {
      const authentication = await protocol.forOperation(operation).resolvePublicAuthentication(token, clientCode);
      return await authentication.subjectDeliveryCapability.resolveUserInfo();
    });
    expect(wire).toEqual({ version: 2, subjectIdentifier });
    expect(events.includes("orcas")).toBe(mode === "gateway-orcas");
    const pendingCode = await authorize();
    await redis.set(sentinel, "keep");
    await authorize();
    const removedGrantId = grantIds.at(-1)!;
    const retainedGrantId = grantIds.at(-2)!;
    const removed = await grants.remove(removedGrantId);
    const removedRecord = await grants.inspect(removedGrantId);
    const retainedRecord = await grants.inspect(retainedGrantId);
    expect(removed).toBe("removed");
    expect(removedRecord).toBeNull();
    expect(retainedRecord).toMatchObject({ state: "issued" });
    await protocol.logout.execute({ sessionToken: principal.externalToken! });
    const remaining = await Promise.all(grantIds.map(id => grants.inspect(id)));
    const kept = await redis.get(sentinel);
    const pending = await scope.observer.resolveProtocolArtifact(pendingCode, { protocol: "custom-sso", artifactType: "auth_code" });
    const credential = await scope.observer.resolveCredential(token, { protocol: "custom-sso", credentialType: "local_session" });
    expect(remaining).toEqual(grantIds.map(() => null));
    expect(kept).toBe("keep");
    expect(pending.status).not.toBe("resolved");
    expect(credential.status).not.toBe("resolved");
  }
  finally {
    await redis.unlink(sentinel);
    await Promise.all(grantIds.map(id => grants.remove(id)));
    await scope.close();
    await harness.close();
    await redis.quit();
  }
});
