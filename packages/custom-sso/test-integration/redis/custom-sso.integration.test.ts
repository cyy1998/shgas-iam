import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { ClientStatus, CustomSsoClientMode, SubjectClaim } from "@iam/contracts";
import { createCustomSso } from "@iam/custom-sso";
import { createCustomSsoCleanup } from "@iam/custom-sso/cleanup";
import { customSsoMaintenancePrefixes } from "@iam/custom-sso/maintenance";
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
  const grantKeys: string[] = [];
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
    const protocol = createCustomSso({
      redis,
      kernel: scope.writer,
      clients: { findRuntimeRecord: async () => client },
      clientSecrets: { findSecretRecord: async () => ({ ...client, customSsoSecretHash: "test-hash" }) },
      secrets: { verify: async secret => secret === "test-secret" },
      traffic: { check: async () => ({ outcome: "enabled" }) },
      subjectProjection: { resolve: async input => ({ subjectIdentifier: input.subjectIdentifier }) },
      users: {
        getActiveUserBySubjectIdentifier: async () => ({ id: 1 }),
        getUserDetailById: async () => ({ id: 1, username: "test", name: "Test" }),
      },
      orcas: { orcasLogin: async () => {
        events.push("orcas");
        return { orcasId: "test-orcas", orcasSessionId: "test-session" };
      } },
      auditLogWriter: { recordAuditLog: async (input) => { events.push(input.action); } },
      logger: { info() {}, warn() {} },
      random: { uuid: randomUUID },
      config: { authCodeExpireSeconds: 60, localSessionTtlSeconds: 120 },
    });
    const principal = await scope.writer.createPrincipalSession(subjectIdentifier);
    if (principal.status !== "created")
      throw new Error("Principal Session creation failed");
    const input = { clientCode, globalSessionToken: principal.externalToken!, redirectUrl, tokenSource: "cookie" as const };
    const continuation = await protocol.checkLoginContinuation.execute(input);
    expect(continuation).toBe("valid");
    async function authorize() {
      const grant = await protocol.authorize.execute(input);
      if (!grant.isLogin)
        throw new Error("Authorization failed");
      const artifact = await scope.observer.resolveProtocolArtifact(grant.code);
      if (artifact.status !== "resolved")
        throw new Error("Artifact was not persisted");
      const key = `${customSsoMaintenancePrefixes()[0]}${artifact.value.artifactId}`;
      grantKeys.push(key);
      const exists = await redis.exists(key);
      expect(exists).toBe(1);
      return grant.code;
    }
    const code = await authorize();
    let rejected: unknown;
    try {
      if (independent)
        await protocol.exchangeCode.execute({ clientCode, code, clientSecret: "test-secret", redirectUri: "https://other.example.com" });
      else
        await protocol.completeCallback.execute({ clientCode, code, redirectUrl: "https://other.example.com" });
    }
    catch (error) { rejected = error; }
    expect(rejected).toBeInstanceOf(Error);
    const token = independent
      ? (await protocol.exchangeCode.execute({ clientCode, code, clientSecret: "test-secret", redirectUri: redirectUrl })).sid
      : (await protocol.completeCallback.execute({ clientCode, code, redirectUrl })).token;
    const authentication = await protocol.resolvePublicAuthentication(token, clientCode);
    const wire = await authentication.subjectDeliveryCapability.resolveUserInfo();
    expect(wire).toEqual({ version: 2, subjectIdentifier });
    expect(events.includes("orcas")).toBe(mode === "gateway-orcas");
    const pendingCode = await authorize();
    await redis.set(sentinel, "keep");
    await protocol.logout.execute({ sessionToken: principal.externalToken! });
    const remaining = await redis.exists(...grantKeys);
    const kept = await redis.get(sentinel);
    const pending = await scope.observer.resolveProtocolArtifact(pendingCode);
    const credential = await scope.observer.resolveCredential(token);
    expect(remaining).toBe(0);
    expect(kept).toBe("keep");
    expect(pending.status).not.toBe("resolved");
    expect(credential.status).not.toBe("resolved");
  }
  finally {
    await redis.unlink(sentinel, ...grantKeys);
    await scope.close();
    await harness.close();
    await redis.quit();
  }
});
