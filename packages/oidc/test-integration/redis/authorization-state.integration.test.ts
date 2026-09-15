import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import { randomUUID } from "node:crypto";
import process from "node:process";
import {
  createSubjectAccessOperations,
  createUnifiedSubjectAccessSessionRevocation,
  requireSubjectAccessOperation,
} from "@iam/api-core/subject-access";
import { ClientSsoProtocol, ClientStatus, OidcClientType, OidcScope } from "@iam/contracts";
import { createOidcAuthorization } from "@iam/oidc";
import { createOidcInventory, createOidcMaintenance } from "@iam/oidc/maintenance";
import { createOidcRedisTestScope } from "@iam/oidc/testing";
import { createUnifiedSessionRedisTestScope } from "@iam/session-kernel/testing";
import { expect, test } from "bun:test";
import Redis from "ioredis";

async function fixture() {
  const url = process.env.IAM_OIDC_TEST_REDIS_URL;
  if (!url)
    throw new Error("IAM_OIDC_TEST_REDIS_URL is required");
  const scope = await createUnifiedSessionRedisTestScope(url, { user: 120, client: 60 });
  const state = await createOidcRedisTestScope(url);
  const kernel = scope.createFactoryForOperations<SubjectAccessOperation>(requireSubjectAccessOperation);
  const generation = randomUUID();
  let operations: ReturnType<typeof createSubjectAccessOperations>;
  const revocation = createUnifiedSubjectAccessSessionRevocation(kernel, {
    run: callback => operations.run(callback),
  });
  operations = createSubjectAccessOperations({
    barrier: {
      async readCommittedTransitionId() {
        return generation;
      },
    },
    revocation,
  });
  const root = await operations.run(async (operation) => {
    const subjectIdentifier = randomUUID();
    const permission = await operation.acquireForAuthentication(subjectIdentifier);
    return await kernel
      .forOperation(operation)
      .createUserSession({
        subjectIdentifier,
        subjectContext: operation.getSubjectContext(permission),
        amr: ["pwd"],
      });
  });
  const oidc = createOidcAuthorization({
    kernel,
    redis: state.redis,
    namespace: state.namespace,
    codeTtlSeconds: 30,
    continuationTtlSeconds: 60,
    clients: {
      async acquire(clientCode) {
        return {
          kind: "present",
          value: {
            clientCode,
            status: ClientStatus.Enable,
            ssoEnabled: true,
            ssoConfig: {
              protocol: ClientSsoProtocol.Oidc,
              clientType: OidcClientType.Public,
              redirectUris: ["https://rp.example/cb"],
              postLogoutRedirectUris: [],
              allowedScopes: [OidcScope.OpenId],
            },
          },
        };
      },
    },
  });
  async function authorize(clientId: string, loggedIn = true) {
    return await operations.run(operation =>
      oidc
        .forOperation(operation)
        .authorize(
          new URLSearchParams({
            client_id: clientId,
            redirect_uri: "https://rp.example/cb",
            response_type: "code",
            scope: "openid",
            state: "state",
            code_challenge: "a".repeat(43),
            code_challenge_method: "S256",
          }),
          loggedIn ? { globalSessionToken: root.bearer } : {},
        ),
    );
  }
  return {
    scope,
    state,
    kernel,
    operations,
    root,
    authorize,
    url,
    async close() {
      await state.close();
      await scope.close();
    },
  };
}

test("OIDC maintenance inventories Codes and continuations without TTL and preserves other Clients and unknown data", async () => {
  const f = await fixture();
  try {
    const authorized = await f.authorize("target");
    if (authorized.kind !== "response" || !("code" in authorized.response.parameters))
      throw new Error("Code required");
    const code = authorized.response.parameters.code;
    const continuation = await f.authorize("target", false);
    if (continuation.kind !== "login")
      throw new Error("Continuation required");
    await f.state.removeCodeTtl("target", code);
    await f.state.removeContinuationTtl(continuation.handle);
    await f.authorize("other");
    await f.state.addUnknown();
    const before = await f.state.snapshot();
    const maintenance = createOidcMaintenance(f.state.redis, f.state.namespace);
    let cursor = "0";
    let matched = 0;
    do {
      const page = await maintenance.inventory({ cursor, clientId: "target", limit: 1 });
      matched += page.matching;
      cursor = page.nextCursor;
    } while (cursor !== "0");
    expect(matched).toBe(2);
    let removed = 0;
    do {
      const page = await maintenance.apply({ cursor, clientId: "target", limit: 100 });
      removed += page.removed;
      cursor = page.nextCursor;
    } while (cursor !== "0");
    expect(removed).toBe(2);
    const after = await f.state.snapshot();
    expect(after).toHaveLength(2);
    for (const record of after) expect(before).toContainEqual(record);
    const connection = new Redis(f.url, { maxRetriesPerRequest: 0, retryStrategy: () => null });
    try {
      await connection.ping();
      const verifier = createOidcInventory(
        { scan: (...args) => connection.scan(...args), get: key => connection.get(key) },
        f.state.namespace,
      );
      let matching = 0;
      do {
        const page = await verifier.inventory({ cursor, clientId: "target" });
        cursor = page.nextCursor;
        matching += page.matching;
      } while (cursor !== "0");
      expect(matching).toBe(0);
    }
    finally {
      connection.disconnect();
    }
    const roots = await f.operations.run(operation =>
      f.kernel.forOperation(operation).resolveUserSession(f.root.bearer),
    );
    expect(roots.status).toBe("resolved");
  }
  finally {
    await f.close();
  }
});

test("OIDC maintenance preserves corrupt records and partial failed targets can be explicitly retried", async () => {
  const f = await fixture();
  try {
    const authorization = await f.authorize("target");
    if (authorization.kind !== "response" || !("code" in authorization.response.parameters))
      throw new Error("Code required");
    const maintenance = createOidcMaintenance(
      {
        scan: (...args) => f.state.redis.scan(...args),
        get: key => f.state.redis.get(key),
        eval: async () => {
          throw new Error("Injected write unavailable");
        },
      },
      f.state.namespace,
    );
    const failed = await maintenance.apply({ clientId: "target" });
    expect(failed).toMatchObject({ removed: 0, unknown: 1 });
    const surviving = await f.state.readCode("target", authorization.response.parameters.code);
    expect(surviving).not.toBeNull();
    const retry = await createOidcMaintenance(f.state.redis, f.state.namespace).apply({ clientId: "target" });
    expect(retry).toMatchObject({ removed: 1, unknown: 0 });
    const next = await f.authorize("target");
    if (next.kind !== "response" || !("code" in next.response.parameters))
      throw new Error("Code required");
    await f.state.corruptCode("target", next.response.parameters.code);
    const before = await f.state.snapshot();
    const corrupt = await createOidcMaintenance(f.state.redis, f.state.namespace).apply();
    expect(corrupt).toMatchObject({ removed: 0, unknown: 1 });
    const after = await f.state.snapshot();
    expect(after).toEqual(before);
  }
  finally {
    await f.close();
  }
});

test("OIDC record keeps original instance and fixed deadline when authorization renews or recreates relationship", async () => {
  const f = await fixture();
  try {
    const first = await f.authorize("target");
    if (first.kind !== "response" || !("code" in first.response.parameters))
      throw new Error("Code required");
    const original = await f.state.readCode("target", first.response.parameters.code);
    const renewed = await f.authorize("target");
    if (renewed.kind !== "response" || !("code" in renewed.response.parameters))
      throw new Error("Code required");
    const second = await f.state.readCode("target", renewed.response.parameters.code);
    expect(second!.clientSessionId).toBe(original!.clientSessionId);
    await f.operations.run(async (operation) => {
      const sessions = f.kernel.forOperation(operation);
      const target = await sessions.resolveClientSessionForUse({
        clientId: "target",
        userSessionId: original!.userSessionId,
        clientSessionId: original!.clientSessionId,
      });
      if (target.status !== "resolved")
        throw new Error("ClientSession required");
      const revoked = await sessions.revokeObservedClientSession(target.value);
      expect(revoked.status).toBe("terminated");
    });
    const reopened = await f.authorize("target");
    if (reopened.kind !== "response" || !("code" in reopened.response.parameters))
      throw new Error("Code required");
    const replacement = await f.state.readCode("target", reopened.response.parameters.code);
    expect(replacement!.clientSessionId).not.toBe(original!.clientSessionId);
    const retained = await f.state.readCode("target", first.response.parameters.code);
    expect(retained).toEqual(original);
    expect(original!.expiresAt).toBeLessThanOrEqual(f.root.observation.userSession.expiresAt);
  }
  finally {
    await f.close();
  }
});
