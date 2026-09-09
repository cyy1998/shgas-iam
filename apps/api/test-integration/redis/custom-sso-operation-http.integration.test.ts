import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import type { CustomSsoSubjectDeliveryCapability } from "@iam/custom-sso";
import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { createApiOperationAuthenticationHandlers, createCustomSsoOperationAdapter } from "@api/composition/custom-sso-operation.adapter";
import { createApiCustomSsoOperations } from "@api/composition/custom-sso-operations";
import { createAuthHandlers } from "@api/routes/auth/auth.handlers";
import { createAuthRoute } from "@api/routes/auth/auth.index";
import { createCustomSsoSubjectDeliveryRequestScope } from "@api/services/sso/subject-delivery/custom-sso-subject-delivery-request-scope";
import { customSsoLocalSessionCookieName, encodeCustomSsoClientCode } from "@api/services/sso/transport/custom-sso-client-code.transport";
import { createErrorHandler } from "@iam/api-core/middlewares/error-handler";
import {
  createSubjectAccessOperations,
  createSubjectAccessSessionRevocation,
  encodeSubjectAccessContext,
  SubjectAccessDisabledError,
  SubjectAccessPermissionRequiredError,
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

test.each(["iam", "gateway", "gateway-orcas", "independent"])("Public UserInfo %s keeps a real operation through HTTP delivery", async (mode) => {
  const url = process.env.IAM_API_TEST_REDIS_URL;
  if (!url)
    throw new Error("IAM_API_TEST_REDIS_URL is required; no fallback is allowed");
  const redis = new Redis(url, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0 });
  await redis.connect();
  const harness = await createSessionKernelRedisTestHarness(url);
  let commandObservations: Array<{ name: string; startedAt: number; completedAt: number }> | undefined;
  const scope = await harness.createSessionKernelScope({
    cleanupAdapters: [createCustomSsoCleanup({ redis })],
    observeWriterCommand: observation => commandObservations?.push(observation),
  });
  const grantIds: string[] = [];
  const grants = createAuthorizationGrantRedisInspection(redis);
  try {
    const subjectIdentifier = randomUUID();
    const clientCode = mode === "iam" ? "iam" : `client-${randomUUID()}`;
    const redirectUrl = "https://app.example.com/callback";
    const independent = mode === "independent";
    const claims = [SubjectClaim.SubjectIdentifier, SubjectClaim.ProfileName, SubjectClaim.IamAuthorization];
    const client: CustomSsoClientRuntimeDto = {
      id: 1,
      clientCode,
      clientName: "operation test",
      status: ClientStatus.Enable,
      isDelete: false,
      customSsoEnabled: true,
      customSsoConfigVersion: 7,
      customSsoConfig: independent
        ? {
            mode: CustomSsoClientMode.Independent,
            subjectClaims: claims,
            validRedirectUrls: [redirectUrl],
            callbackEndpoint: redirectUrl,
            logoutEndpoint: "https://app.example.com/logout",
          }
        : {
            mode: CustomSsoClientMode.Gateway,
            subjectClaims: claims,
            validRedirectUrls: [redirectUrl],
            orcas: { enabled: mode === "gateway-orcas" },
          },
    };
    const logger = { info() {}, warn() {}, error() {}, bindings: () => ({ sourceApp: "api-operation-test" }) };
    let configurationUnavailable = false;
    let gateUnavailable = false;
    const common = {
      redis,
      clients: { findRuntimeRecord: async () => {
        if (configurationUnavailable)
          throw new Error("configuration reader failed");
        return client;
      } },
      clientSecrets: { findSecretRecord: async () => ({ ...client, customSsoSecretHash: "hash" }) },
      secrets: { verify: async () => true },
      traffic: { check: async () => {
        if (gateUnavailable)
          throw new Error("gate reader failed");
        return { outcome: "enabled" as const };
      } },
      orcas: { orcasLogin: async () => ({ orcasId: "orcas-user", orcasSessionId: "orcas-session" }) },
      auditLogWriter: { recordAuditLog: async () => {} },
      logger,
      random: { uuid: randomUUID },
      config: { authCodeExpireSeconds: 60, localSessionTtlSeconds: 120 },
    };
    const generation = randomUUID();
    const fixtureOperations = createSubjectAccessOperations({
      barrier: { readCommittedTransitionId: async () => generation },
      revocation: createSubjectAccessSessionRevocation(scope.writer),
    });
    const revocation = createSubjectAccessSessionRevocation(scope.writer);
    // The production issuer prepares real Grant/Credential fixtures with opaque lifecycle context.
    const issuer = createCustomSsoOperations({
      ...common,
      kernel: scope.writer,
      permittedUsers: { findOrcasUserBySubjectIdentifier: async () => ({ id: 1, username: "test", name: "Test" }) },
      subjectProjection: { resolve: async input => ({ subjectIdentifier: input.subjectIdentifier }) },
    });
    let barrier: "enabled" | "blocking" | "disabled" | "new-generation" = "enabled";
    let reads = 0;
    let factsReads = 0;
    let publishedRole: string | undefined;
    let publishedVersion = 1;
    let failureMode: "none" | "handler" | "facts" | "block-in-facts" = "none";
    const operations = createSubjectAccessOperations({
      barrier: { readCommittedTransitionId: async () => {
        reads += 1;
        if (barrier === "blocking")
          throw new SubjectAccessUnavailableError();
        if (barrier === "disabled")
          throw new SubjectAccessDisabledError();
        return barrier === "new-generation" ? randomUUID() : generation;
      } },
      revocation,
    });
    let capturedOperation: SubjectAccessOperation | undefined;
    const tracedOperations: typeof operations = {
      ...operations,
      run: callback => operations.run(async (operation) => {
        capturedOperation = operation;
        return await callback(operation);
      }),
    };
    const sso = createApiCustomSsoOperations({
      ...common,
      permittedUsers: { findOrcasUserBySubjectIdentifier: async () => ({ id: 1, username: "test", name: "Test" }) },
      kernel: scope.writer,
      subjectFacts: { read: async () => {
        factsReads += 1;
        if (failureMode === "facts")
          return null;
        if (failureMode === "block-in-facts")
          barrier = "blocking";
        return {
          subjectIdentifier,
          sourceDirtyVersion: String(publishedVersion),
          profile: { username: "test", name: "Test", phone: null },
          employments: publishedRole === undefined
            ? []
            : [{
                isPrimary: true,
                organization: { code: "org", name: "Organization", type: "department", path: [{ code: "org", name: "Organization", type: "department" }] },
                position: { code: "position", name: "Position" },
                responsibilities: [],
                clientAuthorizations: [{ clientCode, roles: [{ code: publishedRole, privileges: ["read"] }] }],
              }],
        };
      } },
    });
    const requests = createCustomSsoSubjectDeliveryRequestScope();
    let captured: CustomSsoSubjectDeliveryCapability | undefined;
    const handlers = createApiOperationAuthenticationHandlers({
      subjectAccessOperations: tracedOperations,
      customSsoOperations: sso,
      clientService: { getClientBySecret: async () => null },
      subjectDeliveryRequests: {
        runWithCapability(request, capability, action) {
          captured = capability;
          return requests.runWithCapability(request, capability, action);
        },
      },
      config: { projectionRetryAfterSeconds: 3 },
    });
    const app = new Hono();
    app.use("*", handlers.publicAuthenticationHandler);
    app.get("/public/user-info", async (context) => {
      if (failureMode === "handler")
        throw new Error("handler failed");
      return context.json(await requests.resolveUserInfoForRequest(context));
    });
    app.onError(createErrorHandler(logger));
    const cookieName = mode === "iam" ? "global_session" : customSsoLocalSessionCookieName(clientCode);
    function request(token: string) {
      return app.request("http://localhost/public/user-info", {
        headers: { Client: encodeCustomSsoClientCode(clientCode), Cookie: `${cookieName}=${token}; orcas_sso_sessionid=orcas` },
      });
    }
    let principalToken = "";
    async function seedToken() {
      const principal = await scope.writer.createPrincipalSession(subjectIdentifier, {
        subjectContext: encodeSubjectAccessContext({ version: 1, subjectIdentifier, transitionId: generation }),
      });
      if (principal.status !== "created" || !principal.externalToken)
        throw new Error("Principal fixture creation failed");
      principalToken = principal.externalToken;
      if (mode === "iam")
        return principal.externalToken;
      const grant = await fixtureOperations.run(operation => issuer.forOperation(operation).authorize.execute({
        clientCode,
        globalSessionToken: principal.externalToken,
        redirectUrl,
        tokenSource: "cookie",
      }));
      if (!grant.isLogin)
        throw new Error("Grant fixture creation failed");
      const artifact = await scope.writer.resolveProtocolArtifact(grant.code, { protocol: "custom-sso", artifactType: "auth_code" });
      if (artifact.status !== "resolved")
        throw new Error("Grant fixture resolution failed");
      grantIds.push(artifact.value.artifactId);
      return independent
        ? (await fixtureOperations.run(operation => issuer.forOperation(operation).exchangeCode.execute({ clientCode, code: grant.code, clientSecret: "secret", redirectUri: redirectUrl }))).sid
        : (await fixtureOperations.run(operation => issuer.forOperation(operation).completeCallback.execute({ clientCode, code: grant.code, redirectUrl }))).token;
    }
    async function assertClosed() {
      if (!captured)
        throw new Error("Expected a captured subject delivery capability");
      const before = { reads, factsReads };
      const error = await rejection(captured.resolveUserInfo());
      expect(error).toBeInstanceOf(SubjectAccessPermissionRequiredError);
      expect({ reads, factsReads }).toEqual(before);
    }

    function assertOperationClosed() {
      expect(() => capturedOperation?.requirePermission(subjectIdentifier))
        .toThrow(SubjectAccessPermissionRequiredError);
    }
    const adapter = createCustomSsoOperationAdapter({
      subjectAccessOperations: tracedOperations,
      customSsoOperations: sso,
    });

    const token = await seedToken();
    const authApp = new Hono().route("/auth", createAuthRoute(createAuthHandlers({
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
    authApp.onError(createErrorHandler(logger));
    const authRequest = (value: string) => authApp.request("/auth/authz", {
      headers: { "Client": encodeCustomSsoClientCode(clientCode), "X-Forwarded-Uri": "/business", "Cookie": `${customSsoLocalSessionCookieName(clientCode)}=${value}; orcas_sso_sessionid=orcas` },
    });
    if (mode !== "iam") {
      const principal = await scope.writer.resolvePrincipalSession(principalToken);
      if (principal.status !== "resolved")
        throw new Error("Expected fixture root");
      const oidc = await scope.writer.issueCredential({ principalSessionId: principal.value.principalSessionId, protocol: "oidc", clientCode, credentialType: "access_token", metadata: { oidcConfigVersion: 7 } });
      if (oidc.status !== "created" || !oidc.externalToken)
        throw new Error("Expected real OIDC credential");
      barrier = "disabled";
      const responses = await Promise.all([request(oidc.externalToken), authRequest(oidc.externalToken)]);
      expect(responses.map(value => value.status)).toEqual([401, 401]);
      expect(responses.flatMap(value => value.headers.getSetCookie())).toEqual([]);
      const retained = await scope.observer.resolveCredential(oidc.externalToken, { protocol: "oidc", credentialType: "access_token" });
      const retainedCustom = await scope.observer.resolveCredential(token, { protocol: "custom-sso", credentialType: "local_session" });
      const root = await scope.observer.resolvePrincipalSession(principalToken);
      expect([retained.status, retainedCustom.status, root.status]).toEqual(["resolved", "resolved", "resolved"]);
      expect(reads).toBe(0);
      barrier = "enabled";
      for (const failure of ["configuration", "gate"] as const) {
        configurationUnavailable = failure === "configuration";
        gateUnavailable = failure === "gate";
        const unavailable = await request(token);
        const body = await unavailable.json();
        expect(unavailable.status).toBe(503);
        expect(body).toMatchObject({ code: ApiErrorCode.InternalError });
        expect(unavailable.headers.getSetCookie()).toEqual([]);
        expect(reads).toBe(0);
        const unchanged = await scope.observer.resolveCredential(token, { protocol: "custom-sso", credentialType: "local_session" });
        expect(unchanged.status).toBe("resolved");
      }
      configurationUnavailable = false;
      gateUnavailable = false;
    }
    const invalid = await request("invalid-token");
    expect(invalid.status).toBe(401);
    expect(reads).toBe(0);

    const authorizationInput = {
      clientCode,
      globalSessionToken: principalToken,
      redirectUrl,
      tokenSource: "cookie" as const,
    };
    const continued = await adapter.checkLoginContinuation.execute(authorizationInput);
    expect(continued).toBe("valid");
    expect(reads).toBe(1);
    assertOperationClosed();
    const granted = await adapter.authorize.execute(authorizationInput);
    expect(granted.isLogin).toBe(true);
    if (!granted.isLogin)
      throw new Error("Expected authorization grant");
    const pending = await scope.writer.resolveProtocolArtifact(granted.code, { protocol: "custom-sso", artifactType: "auth_code" });
    if (pending.status !== "resolved")
      throw new Error("Expected persisted grant");
    grantIds.push(pending.value.artifactId);
    expect(reads).toBe(2);
    assertOperationClosed();
    if (mode === "gateway" || mode === "gateway-orcas") {
      const header = await adapter.authorizeLocalSession(token, clientCode);
      expect(typeof header).toBe("string");
      expect(reads).toBe(3);
      assertOperationClosed();
    }
    barrier = "blocking";
    for (const action of [
      () => adapter.checkLoginContinuation.execute(authorizationInput),
      () => adapter.authorize.execute(authorizationInput),
      ...(mode === "gateway" || mode === "gateway-orcas" ? [() => adapter.authorizeLocalSession(token, clientCode)] : []),
    ]) {
      const before = reads;
      const error = await rejection(action());
      expect(error).toBeInstanceOf(SubjectAccessUnavailableError);
      expect(reads).toBe(before + 1);
      assertOperationClosed();
    }
    barrier = "enabled";
    reads = 0;
    factsReads = 0;

    failureMode = "block-in-facts";
    const permitted = await request(token);
    const wire = await permitted.json();
    expect(permitted.status).toBe(200);
    expect(wire).toEqual({
      version: 2,
      subjectIdentifier,
      profile: { name: "Test" },
      authorization: { employments: [], roles: [], privileges: [] },
    });
    expect(reads).toBe(1);
    expect(factsReads).toBe(1);
    await assertClosed();
    const blocked = await request(token);
    const blockedBody = await blocked.json();
    expect(blocked.status).toBe(503);
    expect(blockedBody).toMatchObject({ code: ApiErrorCode.SubjectAccessUnavailable });
    expect(blocked.headers.getSetCookie()).toEqual([]);
    expect(reads).toBe(2);
    expect(factsReads).toBe(1);

    barrier = "enabled";
    for (const mode of ["handler", "facts"] as const) {
      failureMode = mode;
      const before = reads;
      const response = await request(token);
      expect(response.status).toBe(mode === "handler" ? 500 : 503);
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(reads).toBe(before + 1);
      await assertClosed();
    }
    failureMode = "none";
    publishedRole = "operator";
    publishedVersion = 2;
    const restored = await request(token);
    const restoredBody = await restored.json();
    expect(restored.status).toBe(200);
    expect(restoredBody).toMatchObject({ version: 2, subjectIdentifier, authorization: { roles: ["operator"] } });
    publishedRole = "auditor";
    publishedVersion = 3;
    const updated = await request(token);
    const updatedBody = await updated.json();
    expect(updated.status).toBe(200);
    expect(updatedBody).toMatchObject({ version: 2, subjectIdentifier, authorization: { roles: ["auditor"] } });
    if (mode === "gateway" || mode === "independent") {
      const monitor = await redis.monitor();
      let serverCommands: Array<{ name: string; source: string }> | undefined;
      monitor.on("monitor", (_time, args: string[], source: string) => {
        if (args[0]?.toLowerCase() !== "echo")
          serverCommands?.push({ name: args[0]!.toLowerCase(), source: source === "lua" ? "lua" : "client" });
      });
      try {
        for (const [entry, action] of [
          ["userinfo", () => request(token)],
          ...(mode === "gateway" ? [["authz", () => authRequest(token)] as const] : []),
        ] as const) {
          const warmup = await action();
          expect(warmup.status).toBe(200);
          for (let sample = 0; sample < 5; sample += 1) {
            commandObservations = [];
            serverCommands = [];
            const startedAt = performance.now();
            const response = await action();
            expect(response.status).toBe(200);
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
            await redis.echo(marker);
            await drained;
            const observations = commandObservations;
            commandObservations = undefined;
            let waveEnd = -Infinity;
            let waves = 0;
            for (const observation of observations.toSorted((a, b) => a.startedAt - b.startedAt)) {
              if (observation.startedAt >= waveEnd)
                waves += 1;
              waveEnd = Math.max(waveEnd, observation.completedAt);
            }
            console.warn("Credential Redis observation", JSON.stringify({
              mode,
              entry,
              sample,
              waves,
              commands: observations.map(value => ({
                name: value.name,
                startMs: value.startedAt - startedAt,
                endMs: value.completedAt - startedAt,
                rttMs: value.completedAt - value.startedAt,
              })),
              serverCommands,
            }));
            serverCommands = undefined;
          }
        }
      }
      finally {
        commandObservations = undefined;
        monitor.disconnect();
      }
    }
    for (const deniedState of ["disabled", "new-generation"] as const) {
      const credential = await seedToken();
      barrier = deniedState;
      const before = reads;
      const denied = await request(credential);
      const body = await denied.json();
      expect(denied.status).toBe(401);
      expect(body).toMatchObject({ code: ApiErrorCode.SessionInvalid });
      expect(denied.headers.getSetCookie().some(cookie => cookie.startsWith(`${cookieName}=`) && cookie.includes("Max-Age=0"))).toBe(true);
      expect(reads).toBe(before + 1);
      barrier = "enabled";
    }
    if (mode === "iam") {
      const rootToken = await seedToken();
      const root = await scope.observer.resolvePrincipalSession(rootToken);
      if (root.status !== "resolved")
        throw new Error("Expected IAM root");
      await scope.writer.revokePrincipalSession(root.value.principalSessionId);
      const denied = await request(rootToken);
      expect(denied.status).toBe(401);
    }
    else {
      const peerToken = await seedToken();
      for (const { context, status } of [
        { context: undefined, status: 503 },
        { context: "{broken", status: 503 },
        { context: JSON.stringify({ version: 1, subjectIdentifier, transitionId: "invalid" }), status: 503 },
        { context: encodeSubjectAccessContext({ version: 1, subjectIdentifier: randomUUID(), transitionId: generation }), status: 401 },
      ]) {
        const corruptedToken = await seedToken();
        const credential = await scope.observer.resolveCredential(corruptedToken, { protocol: "custom-sso", credentialType: "local_session" });
        if (credential.status !== "resolved")
          throw new Error("Expected Credential before context corruption");
        await scope.seedCredentialPayload(credential.value.credentialId, JSON.stringify({ ...credential.value, subjectContext: context }));
        const before = { reads, factsReads };
        const denied = await request(corruptedToken);
        expect(denied.status).toBe(status);
        if (!independent) {
          const authz = await authRequest(corruptedToken);
          expect(authz.status).toBe(status);
        }
        expect({ reads, factsReads }).toEqual(before);
        const root = await scope.observer.resolvePrincipalSession(principalToken);
        const peer = await scope.observer.resolveCredential(peerToken, { protocol: "custom-sso", credentialType: "local_session" });
        expect(root.status).toBe("resolved");
        expect(peer.status).toBe("resolved");
      }
      const acceptedPeer = await request(peerToken);
      expect(acceptedPeer.status).toBe(200);
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

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  }
  catch (error) {
    return error;
  }
  throw new Error("Expected rejection");
}
