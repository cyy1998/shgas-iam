import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { createCustomSsoOperationAdapter } from "@api/composition/custom-sso-operation.adapter";
import { createApiCustomSsoOperations } from "@api/composition/custom-sso-operations";
import { createSsoHandlers } from "@api/routes/sso/sso.handlers";
import { createSsoRoute } from "@api/routes/sso/sso.index";
import { customSsoLocalSessionCookieName, encodeCustomSsoClientCode } from "@api/services/sso/transport/custom-sso-client-code.transport";
import { createCheckSsoLoginContinuationUseCase } from "@api/use-cases/sso/check-login-continuation/check-login-continuation.use-case";
import { createErrorHandler } from "@iam/api-core/middlewares/error-handler";
import {
  createSubjectAccessOperations,
  createSubjectAccessSessionRevocation,
  encodeSubjectAccessContext,
  SubjectAccessDisabledError,
  SubjectAccessUnavailableError,
} from "@iam/api-core/subject-access";
import { ApiErrorCode, ClientStatus, CustomSsoClientMode, SubjectClaim } from "@iam/contracts";
import { createCustomSsoOperations } from "@iam/custom-sso";
import { createCustomSsoCleanup } from "@iam/custom-sso/cleanup";
import { createAuthorizationGrantRedisInspection } from "@iam/custom-sso/testing";
import { createSessionKernelRedisTestHarness } from "@iam/session-kernel/testing";
import { expect, test } from "bun:test";
import { Hono } from "hono";
import Redis from "ioredis";

test.each(["independent", "gateway", "gateway-orcas"])("%s redemption HTTP owns one permission before real Grant and Kernel effects", async (mode) => {
  const url = process.env.IAM_API_TEST_REDIS_URL;
  if (!url)
    throw new Error("IAM_API_TEST_REDIS_URL is required; no fallback is allowed");
  const redis = new Redis(url, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0 });
  await redis.connect();
  const harness = await createSessionKernelRedisTestHarness(url);
  const scope = await harness.createSessionKernelScope({ cleanupAdapters: [createCustomSsoCleanup({ redis })] });
  const grantIds: string[] = [];
  const grants = createAuthorizationGrantRedisInspection(redis);
  try {
    const subjectIdentifier = randomUUID();
    const generation = randomUUID();
    const nextGeneration = randomUUID();
    const subjectContext = encodeSubjectAccessContext({ version: 1, subjectIdentifier, transitionId: generation });
    const clientCode = `client-${randomUUID()}`;
    const redirectUrl = "https://app.example.com/callback";
    const independent = mode === "independent";
    const client: CustomSsoClientRuntimeDto = {
      id: 1,
      clientCode,
      clientName: "redemption HTTP test",
      status: ClientStatus.Enable,
      isDelete: false,
      customSsoEnabled: true,
      customSsoConfigVersion: 7,
      customSsoConfig: independent
        ? {
            mode: CustomSsoClientMode.Independent,
            subjectClaims: [SubjectClaim.SubjectIdentifier, SubjectClaim.ProfileName],
            validRedirectUrls: ["https://app.example.com/callback"],
            callbackEndpoint: redirectUrl,
            logoutEndpoint: "https://app.example.com/logout",
          }
        : {
            mode: CustomSsoClientMode.Gateway,
            subjectClaims: [SubjectClaim.SubjectIdentifier],
            validRedirectUrls: ["https://app.example.com/callback"],
            orcas: { enabled: mode === "gateway-orcas" },
          },
    };
    const logger = { info() {}, warn() {}, error() {}, bindings: () => ({ sourceApp: "api-redemption-test" }) };
    let reads = 0;
    let factsReads = 0;
    let orcasCalls = 0;
    let userFailure: "none" | "identity" | "profile" = "none";
    let barrier: "enabled" | "blocking" | "disabled" | "new-generation" = "enabled";
    let changeAfterPermission = false;
    const generatedIds: string[] = [];
    const common = {
      redis,
      clients: { findRuntimeRecord: async () => client },
      clientSecrets: { findSecretRecord: async () => ({ ...client, customSsoSecretHash: "hash" }) },
      secrets: { verify: async () => true },
      traffic: { check: async () => ({ outcome: "enabled" as const }) },
      orcas: { orcasLogin: async () => {
        orcasCalls += 1;
        return { orcasId: "orcas-user", orcasSessionId: "orcas-session" };
      } },
      auditLogWriter: { recordAuditLog: async () => {} },
      logger,
      random: { uuid: () => {
        const id = randomUUID();
        generatedIds.push(id);
        return id;
      } },
      config: { authCodeExpireSeconds: 60, localSessionTtlSeconds: 120 },
    };
    const fixtureOperations = createSubjectAccessOperations({
      barrier: { readCommittedTransitionId: async () => generation },
      revocation: createSubjectAccessSessionRevocation(scope.writer),
    });
    const revocation = createSubjectAccessSessionRevocation(scope.writer);
    const issuer = createCustomSsoOperations({
      ...common,
      kernel: scope.writer,
      permittedUsers: { findOrcasUserBySubjectIdentifier: async () => ({ id: 1, username: "test", name: "Test" }) },
      subjectProjection: { resolve: async () => ({ subjectIdentifier }) },
    });
    const subjectAccessOperations = createSubjectAccessOperations({
      barrier: { readCommittedTransitionId: async () => {
        reads += 1;
        if (barrier === "blocking")
          throw new SubjectAccessUnavailableError();
        if (barrier === "disabled")
          throw new SubjectAccessDisabledError();
        const result = barrier === "new-generation" ? nextGeneration : generation;
        if (changeAfterPermission)
          barrier = "new-generation";
        return result;
      } },
      revocation,
    });
    const operations = createApiCustomSsoOperations({
      ...common,
      kernel: scope.writer,
      permittedUsers: { findOrcasUserBySubjectIdentifier: async () => {
        if (userFailure === "identity")
          throw new Error("identity query failed");
        if (userFailure === "profile")
          return null;
        return { id: 1, username: "test", name: "Test" };
      } },
      subjectFacts: { read: async () => {
        factsReads += 1;
        return {
          subjectIdentifier,
          sourceDirtyVersion: "1",
          profile: { username: "test", name: "Test", phone: null },
          employments: [],
        };
      } },
      authorizationFreshness: { check: async () => ({ status: "fresh" }) },
    });
    const adapter = createCustomSsoOperationAdapter({ subjectAccessOperations, customSsoOperations: operations });
    const handlers = createSsoHandlers({
      logger,
      sso: {
        ...adapter,
        checkLoginContinuation: createCheckSsoLoginContinuationUseCase(adapter),
        logout: issuer.logout,
      },
      authentication: {
        loginWithOa: { execute: async () => { throw new Error("Unused authentication route"); } },
        loginWithWechat: { execute: async () => { throw new Error("Unused authentication route"); } },
      },
      config: {
        authCodeExpireSeconds: 60,
        authorizationEndpoint: "/sso/authorize",
        loginEndpoint: "/login",
        logoutEndpoint: "/sso/logout",
        projectionRetryAfterSeconds: 3,
        redisExpireSeconds: 120,
        ssoExternalOrigin: "https://iam.example.com",
        ssoInternalOrigin: "https://iam.internal.example.com",
        thirdPartyOAEndpoint: "/sso/thirdparty/oa",
      },
    });
    const app = new Hono().route("/sso", createSsoRoute(handlers));
    app.onError(createErrorHandler(logger));
    const cookieName = customSsoLocalSessionCookieName(clientCode);
    function request(code: string) {
      return independent
        ? app.request("/sso/token", {
            method: "POST",
            headers: {
              "Authorization": `Basic ${Buffer.from(`${encodeCustomSsoClientCode(clientCode)}:secret`).toString("base64")}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ code, redirect_uri: redirectUrl }),
          })
        : app.request(`/sso/callback?${new URLSearchParams({ code, client: clientCode, redirectUrl })}`, {
            headers: { Cookie: `global_session=global; ${cookieName}=local; orcas_sso_sessionid=orcas` },
          });
    }
    async function seedGrant() {
      const principal = await scope.writer.createPrincipalSession(subjectIdentifier, {
        subjectContext,
      });
      if (principal.status !== "created" || !principal.externalToken)
        throw new Error("Principal fixture creation failed");
      const grant = await fixtureOperations.run(operation => issuer.forOperation(operation).authorize.execute({
        clientCode,
        globalSessionToken: principal.externalToken,
        redirectUrl,
        tokenSource: "cookie",
        state: "opaque state",
      }));
      if (!grant.isLogin)
        throw new Error("Grant fixture creation failed");
      const artifact = await scope.writer.resolveProtocolArtifact(grant.code);
      if (artifact.status !== "resolved")
        throw new Error("Grant fixture resolution failed");
      const grantId = artifact.value.artifactId;
      grantIds.push(grantId);
      return { code: grant.code, grantId };
    }

    const grant = await seedGrant();
    const initialGrant = await grants.inspect(grant.grantId);
    expect(initialGrant).toMatchObject({ state: "issued" });
    barrier = "blocking";
    const blocked = await request(grant.code);
    const blockedBody = await blocked.json();
    expect(blocked.status).toBe(503);
    expect(blockedBody).toMatchObject({ code: ApiErrorCode.SubjectAccessUnavailable });
    expect(blocked.headers.get("Retry-After")).toBe("3");
    expect(blocked.headers.getSetCookie()).toEqual([]);
    expect(reads).toBe(1);
    expect(factsReads).toBe(0);
    expect(orcasCalls).toBe(0);
    const afterBlock = await grants.inspect(grant.grantId);
    expect(afterBlock).toEqual(initialGrant);
    for (const id of generatedIds) {
      const exists = await scope.activeObjectExists({ kind: "credential", id });
      expect(exists).toBe(false);
    }

    barrier = "enabled";
    changeAfterPermission = true;
    const success = await request(grant.code);
    expect(success.status).toBe(independent ? 200 : 302);
    expect(reads).toBe(2);
    expect(factsReads).toBe(independent ? 1 : 0);
    expect(orcasCalls).toBe(mode === "gateway-orcas" ? 1 : 0);
    let token: string;
    if (independent) {
      const body = await success.json();
      token = body.data.sid;
      expect(body).toMatchObject({ data: { sid: expect.any(String), ttl: expect.any(Number), subject: {
        version: 2,
        subjectIdentifier,
        profile: { name: "Test" },
      } } });
      expect(success.headers.getSetCookie()).toEqual([]);
    }
    else {
      const location = new URL(success.headers.get("Location") ?? "");
      token = location.searchParams.get("token") ?? "";
      expect(location.searchParams.get("state")).toBe("opaque state");

      expect(location.searchParams.get("orcasToken")).toBe(mode === "gateway-orcas" ? "orcas-session" : null);
      expect(success.headers.getSetCookie().some(cookie => cookie.startsWith(`${cookieName}=${token};`))).toBe(true);
    }
    const credential = await scope.writer.resolveCredential(token);
    expect(credential.status).toBe("resolved");
    if (credential.status !== "resolved")
      throw new Error("Expected persisted credential");
    expect(credential.value.subjectContext).toBe(subjectContext);
    const consumed = await scope.writer.resolveProtocolArtifact(grant.code);
    expect(consumed.status).not.toBe("resolved");

    changeAfterPermission = false;
    // A distinct HTTP request checks the old generation and preserves browser-specific wire rules.
    for (const state of ["new-generation", "disabled"] as const) {
      const nextGrant = await seedGrant();
      barrier = state;
      const before = reads;
      const denied = await request(nextGrant.code);
      const body = await denied.json();
      expect(denied.status).toBe(401);
      expect(body).toMatchObject({ code: ApiErrorCode.SessionInvalid });
      expect(reads).toBe(before + 1);
      expect(orcasCalls).toBe(mode === "gateway-orcas" ? 1 : 0);
      const cookies = denied.headers.getSetCookie();
      expect(cookies).toHaveLength(independent ? 0 : 3);
      for (const name of independent ? [] : ["global_session", cookieName, "orcas_sso_sessionid"])
        expect(cookies.some(cookie => cookie.startsWith(`${name}=`) && cookie.includes("Max-Age=0"))).toBe(true);
    }
    if (mode === "gateway-orcas") {
      barrier = "enabled";
      for (const failure of ["identity", "profile"] as const) {
        userFailure = failure;
        const retryableGrant = await seedGrant();
        const response = await request(retryableGrant.code);
        expect(response.status).toBe(failure === "identity" ? 500 : 401);
        expect(orcasCalls).toBe(1);
        const record = await grants.inspect(retryableGrant.grantId);
        expect(record).toMatchObject({ state: "issued" });
      }
    }
  }
  finally {
    if (grantIds.length > 0)
      await Promise.all(grantIds.map(id => grants.remove(id)));
    await scope.close();
    await harness.close();
    await redis.quit();
  }
});
