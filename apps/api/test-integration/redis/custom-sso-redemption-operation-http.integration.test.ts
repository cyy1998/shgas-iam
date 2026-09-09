import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { createApiOperationAuthenticationHandlers, createCustomSsoOperationAdapter } from "@api/composition/custom-sso-operation.adapter";
import { createApiCustomSsoOperations } from "@api/composition/custom-sso-operations";
import { createAuthHandlers } from "@api/routes/auth/auth.handlers";
import { createAuthRoute } from "@api/routes/auth/auth.index";
import { createSsoHandlers } from "@api/routes/sso/sso.handlers";
import { createSsoRoute } from "@api/routes/sso/sso.index";
import { createCustomSsoSubjectDeliveryRequestScope } from "@api/services/sso/subject-delivery/custom-sso-subject-delivery-request-scope";
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
import { SubjectProjectionNotReadyError } from "@iam/client-subject-projection";
import { ApiErrorCode, ClientStatus, CustomSsoClientMode, SubjectClaim } from "@iam/contracts";
import { createCustomSsoOperations } from "@iam/custom-sso";
import { createCustomSsoCleanup } from "@iam/custom-sso/cleanup";
import { createLegacyGrantMaintenance, createLegacyGrantVerifier, isCustomSsoAuthorizationArtifact } from "@iam/custom-sso/maintenance";
import { createAuthorizationGrantRedisInspection } from "@iam/custom-sso/testing";
import { CustomSsoSubjectProjectionInvariantError } from "@iam/custom-sso/wire";
import { createArtifactMaintenance, createArtifactMaintenanceVerifier } from "@iam/session-kernel/maintenance";
import { createKernelMaintenanceFixture, createSessionKernelRedisTestHarness } from "@iam/session-kernel/testing";
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
    let callbackFailure: "none" | "orcas" | "issuance" = "none";
    let userFailure: "none" | "identity" | "profile" = "none";
    let barrier: "enabled" | "blocking" | "disabled" | "new-generation" = "enabled";
    let changeAfterPermission = false;
    let projectionFailure: "none" | "not-ready" | "invalid" = "none";
    const generatedIds: string[] = [];
    const common = {
      clients: { findRuntimeRecord: async () => client },
      clientSecrets: { findSecretRecord: async () => ({ ...client, customSsoSecretHash: "hash" }) },
      secrets: { verify: async () => true },
      traffic: { check: async () => ({ outcome: "enabled" as const }) },
      orcas: { orcasLogin: async () => {
        orcasCalls += 1;
        if (callbackFailure === "orcas")
          throw new Error("ORCAS response unavailable");
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
      kernel: {
        ...scope.writer,
        async issueCredential(input) {
          const result = await scope.writer.issueCredential(input);
          if (callbackFailure === "issuance")
            throw new Error("credential committed, response unavailable");
          return result;
        },
      },
      permittedUsers: { findOrcasUserBySubjectIdentifier: async () => {
        if (userFailure === "identity")
          throw new Error("identity query failed");
        if (userFailure === "profile")
          return null;
        return { id: 1, username: "test", name: "Test" };
      } },
      subjectFacts: { read: async () => {
        factsReads += 1;
        if (projectionFailure === "not-ready")
          throw new SubjectProjectionNotReadyError();
        if (projectionFailure === "invalid")
          throw new CustomSsoSubjectProjectionInvariantError("invalid_wire");
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
    function request(code: string, redirect = redirectUrl) {
      return independent
        ? app.request("/sso/token", {
            method: "POST",
            headers: {
              "Authorization": `Basic ${Buffer.from(`${encodeCustomSsoClientCode(clientCode)}:secret`).toString("base64")}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ code, redirect_uri: redirect }),
          })
        : app.request(`/sso/callback?${new URLSearchParams({ code, client: clientCode, redirectUrl: redirect })}`, {
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
      const artifact = await scope.writer.resolveProtocolArtifact(grant.code, { protocol: "custom-sso", artifactType: "auth_code" });
      if (artifact.status !== "resolved")
        throw new Error("Grant fixture resolution failed");
      const grantId = artifact.value.artifactId;
      grantIds.push(grantId);
      return { code: grant.code, grantId, principalToken: principal.externalToken };
    }

    const grant = await seedGrant();
    const initialGrant = await grants.inspect(grant.grantId);
    expect(initialGrant).toBeNull();
    const original = await scope.writer.resolveProtocolArtifact(grant.code, { protocol: "custom-sso", artifactType: "auth_code" });
    if (original.status !== "resolved" || !original.value.principalSessionId)
      throw new Error("Expected original artifact");
    const oidc = await scope.writer.createProtocolArtifact({ principalSessionId: original.value.principalSessionId, protocol: "oidc", clientCode, artifactType: "authorization_code", ttlMs: 60_000, metadata: { oidcConfigVersion: 7, redirectUri: redirectUrl } });
    if (oidc.status !== "created" || !oidc.externalToken)
      throw new Error("Expected real OIDC artifact");
    const otherRoot = await scope.writer.createPrincipalSession(randomUUID(), { subjectContext: "unrelated" });
    if (otherRoot.status !== "created")
      throw new Error("Expected unrelated root");
    const peers = await Promise.all([clientCode, `other-${randomUUID()}`].map(code => scope.writer.issueCredential({ principalSessionId: otherRoot.value.principalSessionId, protocol: "custom-sso", clientCode: code, credentialType: "local_session", metadata: { version: 2, mode: CustomSsoClientMode.Gateway, configVersion: 7 } })));
    barrier = "disabled";
    const denied = await request(oidc.externalToken);
    const wrongRedirect = await request(grant.code, "https://wrong.example.com/callback");
    expect(denied.status).toBeGreaterThanOrEqual(400);
    expect(wrongRedirect.status).toBeGreaterThanOrEqual(400);
    expect(denied.headers.getSetCookie()).toEqual([]);
    expect(wrongRedirect.headers.getSetCookie()).toEqual([]);
    const oidcRetained = await scope.observer.resolveProtocolArtifact(oidc.externalToken, { protocol: "oidc", artifactType: "authorization_code" });
    const grantRetained = await grants.inspect(grant.grantId);
    const roots = await Promise.all([original.value.principalSessionId, otherRoot.value.principalSessionId].map(id => scope.observer.resolvePrincipalSessionById(id)));
    for (const peer of peers) {
      if (peer.status !== "created" || !peer.externalToken)
        throw new Error("Expected peer credential");
      const retained = await scope.observer.resolveCredential(peer.externalToken, { protocol: "custom-sso", credentialType: "local_session" });
      expect(retained.status).toBe("resolved");
    }
    expect(oidcRetained.status).toBe("resolved");
    expect(grantRetained).toEqual(initialGrant);
    expect(roots.map(value => value.status)).toEqual(["resolved", "resolved"]);
    expect({ reads, factsReads, orcasCalls }).toEqual({ reads: 0, factsReads: 0, orcasCalls: 0 });
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
    const credential = await scope.writer.resolveCredential(token, { protocol: "custom-sso", credentialType: "local_session" });
    expect(credential.status).toBe("resolved");
    if (credential.status !== "resolved")
      throw new Error("Expected persisted credential");
    expect(credential.value.subjectContext).toBe(subjectContext);
    const consumed = await scope.writer.resolveProtocolArtifact(grant.code, { protocol: "custom-sso", artifactType: "auth_code" });
    expect(consumed.status).not.toBe("resolved");

    changeAfterPermission = false;
    if (independent) {
      barrier = "enabled";
      async function authorizeAgain() {
        const response = await app.request(`/sso/authorize?${new URLSearchParams({ client: clientCode, redirectUrl })}`, {
          headers: { Cookie: `global_session=${grant.principalToken}` },
        });
        expect(response.status).toBe(302);
        expect(response.headers.getSetCookie()).toEqual([]);
        const location = new URL(response.headers.get("Location")!);
        expect(location.origin + location.pathname).toBe(redirectUrl);
        const code = location.searchParams.get("code");
        if (!code)
          throw new Error("Expected fresh code through authorization continuation");
        return code;
      }
      for (const failure of ["not-ready", "invalid"] as const) {
        const code = await authorizeAgain();
        projectionFailure = failure;
        const failed = await request(code);
        const body = await failed.json();
        expect(failed.status).toBe(failure === "not-ready" ? 503 : 500);
        expect(body.code).toBe(failure === "not-ready" ? ApiErrorCode.SubjectProjectionNotReady : ApiErrorCode.InternalError);
        expect(failed.headers.get("Retry-After")).toBe(failure === "not-ready" ? "3" : null);
        expect(failed.headers.getSetCookie()).toEqual([]);
        projectionFailure = "none";
        const old = await request(code);
        const oldBody = await old.json();
        expect(old.status).toBe(401);
        expect(oldBody.code).toBe(ApiErrorCode.InvalidAuthCode);
        const fresh = await authorizeAgain();
        expect(fresh).not.toBe(code);
        const recovered = await request(fresh);
        const recoveredBody = await recovered.json();
        expect(recovered.status).toBe(200);
        expect(recoveredBody.data.subject).toEqual({ version: 2, subjectIdentifier, profile: { name: "Test" } });
        const retainedRoot = await scope.observer.resolvePrincipalSession(grant.principalToken);
        expect(retainedRoot.status).toBe("resolved");
      }
    }
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
        const record = await scope.observer.resolveProtocolArtifact(retryableGrant.code, { protocol: "custom-sso", artifactType: "auth_code" });
        expect(record.status).toBe("consumed_replay");
      }
    }
    if (!independent) {
      barrier = "enabled";
      userFailure = "none";
      const recoveryRoot = await seedGrant();
      async function authorizeGatewayAgain() {
        const response = await app.request(`/sso/authorize?${new URLSearchParams({ client: clientCode, redirectUrl, state: "fresh opaque state" })}`, {
          headers: { Cookie: `global_session=${recoveryRoot.principalToken}` },
        });
        expect(response.status).toBe(302);
        expect(response.headers.getSetCookie()).toEqual([]);
        const location = new URL(response.headers.get("Location")!);
        expect(location.origin + location.pathname).toBe("https://app.example.com/sso/callback");
        expect(location.searchParams.get("redirectUrl")).toBe(redirectUrl);
        const code = location.searchParams.get("code");
        if (!code)
          throw new Error("Expected Gateway authorization continuation");
        return code;
      }
      for (const failure of mode === "gateway-orcas" ? ["orcas", "issuance"] as const : ["issuance"] as const) {
        const code = await authorizeGatewayAgain();
        callbackFailure = failure;
        const failed = await request(code);
        const body = await failed.json();
        expect(failed.status).toBe(500);
        expect(body).toMatchObject({ code: ApiErrorCode.InternalError });
        expect(failed.headers.get("Location")).toBeNull();
        expect(failed.headers.getSetCookie()).toEqual([]);
        callbackFailure = "none";
        const old = await request(code);
        const oldBody = await old.json();
        expect(old.status).toBe(401);
        expect(oldBody.code).toBe(ApiErrorCode.Unauthorized);
        expect(old.headers.getSetCookie()).toEqual([]);
        const fresh = await authorizeGatewayAgain();
        expect(fresh).not.toBe(code);
        const recovered = await request(fresh);
        expect(recovered.status).toBe(302);
        const location = new URL(recovered.headers.get("Location")!);
        expect(location.origin + location.pathname).toBe(redirectUrl);
        expect(location.searchParams.get("state")).toBe("fresh opaque state");
        expect(recovered.headers.getSetCookie().some(cookie => cookie.startsWith(`${cookieName}=`))).toBe(true);
        expect(recovered.headers.getSetCookie().some(cookie => cookie.startsWith("orcas_sso_sessionid="))).toBe(mode === "gateway-orcas");
        const retainedRoot = await scope.observer.resolvePrincipalSession(recoveryRoot.principalToken);
        expect(retainedRoot.status).toBe("resolved");
        const replay = await request(fresh); // Successful response lost: do not replay delivery.
        expect(replay.status).toBe(401);
        expect(replay.headers.getSetCookie()).toEqual([]);
      }
    }

    // Final composition: maintenance zero-gate precedes every new authorization writer.
    barrier = "enabled";
    userFailure = "none";
    callbackFailure = "none";
    const cutoverRoot = await seedGrant();
    async function authorizeCutover() {
      const response = await app.request(`/sso/authorize?${new URLSearchParams({ client: clientCode, redirectUrl, state: "cutover state" })}`, {
        headers: { Cookie: `global_session=${cutoverRoot.principalToken}` },
      });
      expect(response.status).toBe(302);
      expect(response.headers.getSetCookie()).toEqual([]);
      const location = new URL(response.headers.get("Location")!);
      expect(location.origin + location.pathname).toBe(independent ? redirectUrl : "https://app.example.com/sso/callback");
      const code = location.searchParams.get("code");
      if (!code)
        throw new Error("Expected cutover authorization Code");
      return code;
    }
    async function redeemCutover(code: string) {
      const response = await request(code);
      expect(response.status).toBe(independent ? 200 : 302);
      if (independent) {
        const body = await response.json();
        expect(body.data.subject).toEqual({ version: 2, subjectIdentifier, profile: { name: "Test" } });
        expect(body.data.ttl).toBeGreaterThan(0);
        return String(body.data.sid);
      }
      const location = new URL(response.headers.get("Location")!);
      expect(location.origin + location.pathname).toBe(redirectUrl);
      expect(location.searchParams.get("state")).toBe("cutover state");
      expect(response.headers.getSetCookie().some(cookie => cookie.startsWith(`${cookieName}=`))).toBe(true);
      return location.searchParams.get("token")!;
    }
    const beforeCode = await authorizeCutover();
    const retainedToken = await redeemCutover(beforeCode);
    const oldCode = await authorizeCutover();
    const retainedCredential = await scope.observer.resolveCredential(retainedToken, { protocol: "custom-sso", credentialType: "local_session" });
    const retainedPrincipal = await scope.observer.resolvePrincipalSession(cutoverRoot.principalToken);
    if (retainedCredential.status !== "resolved" || retainedPrincipal.status !== "resolved")
      throw new Error("Expected retained cutover objects");
    const cutoverOidc = await scope.writer.createProtocolArtifact({
      principalSessionId: retainedPrincipal.value.principalSessionId,
      protocol: "oidc",
      clientCode,
      artifactType: "authorization_code",
      ttlMs: 60_000,
      metadata: { oidcConfigVersion: 7, redirectUri: redirectUrl },
    });
    if (cutoverOidc.status !== "created" || !cutoverOidc.externalToken)
      throw new Error("Expected retained OIDC Code");
    const inspection = createKernelMaintenanceFixture(redis, scope.namespace);
    const principalBefore = await inspection.observe("principal_session", retainedPrincipal.value.principalSessionId);
    const credentialBefore = await inspection.observe("credential", retainedCredential.value.credentialId);
    const oidcBefore = await inspection.observe("artifact", cutoverOidc.value.artifactId);
    const maintenanceOptions = {
      namespace: scope.namespace,
      writersStopped: true,
      select: (object: Parameters<typeof isCustomSsoAuthorizationArtifact>[0]) => isCustomSsoAuthorizationArtifact(object) ? "select" as const : "retain" as const,
    };
    const inventory = await createArtifactMaintenanceVerifier({ ...maintenanceOptions, redis }).inventory();
    expect(inventory.status).toBe("passed");
    expect(inventory.targets).toBeGreaterThan(0);
    const applied = await createArtifactMaintenance({ ...maintenanceOptions, redis }).apply();
    const legacyApplied = await createLegacyGrantMaintenance({ redis, writersStopped: true }).apply();
    expect(applied.status).toBe("passed");
    expect(legacyApplied.status).toBe("passed");
    const verifierRedis = new Redis(url, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0 });
    try {
      await verifierRedis.connect();
      const reader = { scan: verifierRedis.scan.bind(verifierRedis), get: verifierRedis.get.bind(verifierRedis) };
      const verified = await createArtifactMaintenanceVerifier({ ...maintenanceOptions, redis: reader }).verify();
      const legacyVerified = await createLegacyGrantVerifier({ redis: reader, writersStopped: true }).verify();
      expect(verified).toMatchObject({ status: "passed", targets: 0, failed: 0, unverified: 0, scanComplete: true });
      expect(legacyVerified).toMatchObject({ status: "passed", targets: 0, failed: 0, unverified: 0, scanComplete: true });
    }
    finally {
      verifierRedis.disconnect();
    }
    const oldAfterCleanup = await request(oldCode);
    expect(oldAfterCleanup.status).toBe(401);
    const oldAfterCleanupBody = await oldAfterCleanup.json();
    expect(oldAfterCleanupBody.code).toBe(independent ? ApiErrorCode.InvalidAuthCode : ApiErrorCode.Unauthorized);
    expect(oldAfterCleanup.headers.getSetCookie()).toEqual([]);
    const principalAfter = await inspection.observe("principal_session", retainedPrincipal.value.principalSessionId);
    const credentialAfter = await inspection.observe("credential", retainedCredential.value.credentialId);
    const oidcAfter = await inspection.observe("artifact", cutoverOidc.value.artifactId);
    expect(principalAfter).toEqual(principalBefore);
    expect(credentialAfter).toEqual(credentialBefore);
    expect(oidcAfter).toEqual(oidcBefore);
    const freshCode = await authorizeCutover();
    expect(freshCode).not.toBe(oldCode);
    const freshToken = await redeemCutover(freshCode);
    expect(freshToken).not.toBe(retainedToken);

    const deliveries = createCustomSsoSubjectDeliveryRequestScope();
    const accessHandlers = createApiOperationAuthenticationHandlers({
      subjectAccessOperations,
      customSsoOperations: operations,
      clientService: { getClientBySecret: async () => null },
      subjectDeliveryRequests: deliveries,
      config: { projectionRetryAfterSeconds: 3 },
    });
    const accessApp = new Hono();
    accessApp.use("/public/*", accessHandlers.publicAuthenticationHandler);
    accessApp.get("/public/user-info", async context => context.json(await deliveries.resolveUserInfoForRequest(context)));
    accessApp.route("/auth", createAuthRoute(createAuthHandlers({
      authentication: {
        loginWithMobile: { execute: async () => { throw new Error("unused"); } },
        loginWithPassword: { execute: async () => { throw new Error("unused"); } },
      },
      clientService: { getClientBySecret: async () => null },
      localSessionAuthorizer: adapter,
      loginCredentialParser: { parseLoginPasswordCredential: async () => { throw new Error("unused"); } },
      logger,
      config: { projectionRetryAfterSeconds: 3, redisExpireSeconds: 120 },
    })));
    accessApp.onError(createErrorHandler(logger));
    for (const accessToken of [retainedToken, freshToken]) {
      for (const path of independent ? ["/public/user-info"] : ["/public/user-info", "/auth/authz"]) {
        const accessRequest = () => accessApp.request(path, { headers: {
          "Client": encodeCustomSsoClientCode(clientCode),
          "Cookie": `${cookieName}=${accessToken}; global_session=${cutoverRoot.principalToken}`,
          "X-Forwarded-Uri": "/business",
        } });
        barrier = "blocking";
        const temporary = await accessRequest();
        const temporaryBody = await temporary.json();
        expect(temporary.status).toBe(503);
        expect(temporaryBody.code).toBe(ApiErrorCode.SubjectAccessUnavailable);
        expect(temporary.headers.get("Retry-After")).toBe("3");
        expect(temporary.headers.getSetCookie()).toEqual([]);
        barrier = "enabled";
        const retried = await accessRequest();
        expect(retried.status).toBe(200);
        if (path === "/public/user-info") {
          const wire = await retried.json();
          expect(wire).toEqual(independent
            ? { version: 2, subjectIdentifier, profile: { name: "Test" } }
            : { version: 2, subjectIdentifier });
        }
        else {
          expect(retried.headers.get("X-User-Info")).toBeTruthy();
        }
        expect(retried.headers.getSetCookie().some(cookie => cookie.includes("Max-Age=0"))).toBe(false);
      }
    }
    const oidcStillValid = await scope.observer.resolveProtocolArtifact(cutoverOidc.externalToken, { protocol: "oidc", artifactType: "authorization_code" });
    expect(oidcStillValid.status).toBe("resolved");
  }
  finally {
    if (grantIds.length > 0)
      await Promise.all(grantIds.map(id => grants.remove(id)));
    await scope.close();
    await harness.close();
    await redis.quit();
  }
});
