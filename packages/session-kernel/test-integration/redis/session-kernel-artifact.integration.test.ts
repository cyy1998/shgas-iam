import type {
  RedisTestHarness,
  SessionKernelRedisTestScope,
} from "./redis-test-harness";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { createRedisTestHarness } from "./redis-test-harness";

const subjectIdentifier = "00000000-0000-4000-8000-000000000001";

let harness: RedisTestHarness | undefined;
let scope: SessionKernelRedisTestScope | undefined;

beforeAll(async () => {
  harness = await createRedisTestHarness();
});

beforeEach(async () => {
  scope = await harness!.createSessionKernelScope();
});

afterEach(async () => {
  await scope?.close();
  scope = undefined;
});

afterAll(async () => {
  await harness?.close();
  harness = undefined;
});

describe("Session Kernel artifact real Redis contract", () => {
  test("reports and removes a dangling client protocol owner exactly", async () => {
    await scope!.seedClientProtocolIndexMember({
      clientCode: "portal",
      id: "missing-artifact",
      kind: "artifact",
      protocol: "oidc",
    });

    await expect(scope!.observer.inventoryClientProtocol("portal", "oidc"))
      .resolves
      .toMatchObject({ counts: { stale: 1, total: 1 } });

    await scope!.writer.revokeClientProtocol(
      "portal",
      "oidc",
      "client_config_changed",
    );

    await expect(scope!.observer.inventoryClientProtocol("portal", "oidc"))
      .resolves
      .toMatchObject({ counts: { stale: 0, total: 0 } });
  });

  test("does not erase an owner member when the same object identity is recreated concurrently", async () => {
    await scope!.seedClientProtocolIndexMember({
      clientCode: "portal",
      id: "recreated-artifact",
      kind: "artifact",
      protocol: "oidc",
    });
    scope!.recreateObjectBeforeNextInactiveIndexRemoval();

    await scope!.writer.revokeClientProtocol(
      "portal",
      "oidc",
      "client_config_changed",
    );

    await expect(scope!.observer.inventoryClientProtocol("portal", "oidc"))
      .resolves
      .toMatchObject({ counts: { invalid: 1, total: 1 } });
  });

  test("does not revoke an object replaced after resolution", async () => {
    const artifact = await scope!.writer.createProtocolArtifact({
      artifactType: "authorization_code",
      clientCode: "portal",
      protocol: "oidc",
      ttlMs: 30_000,
    });
    if (artifact.status !== "created")
      throw new Error("expected an artifact fixture");
    scope!.replaceObjectBeforeNextRevoke();

    const summary = await scope!.writer.revokeClientProtocol(
      "portal",
      "oidc",
      "client_config_changed",
    );

    expect(summary.artifacts).toMatchObject({ revoked: 0, missing: 1 });
    await expect(scope!.observer.inventoryClientProtocol("portal", "oidc"))
      .resolves
      .toMatchObject({ counts: { artifacts: 1, total: 1 } });
  });

  test("does not let a delayed renewal recreate a revoked active session", async () => {
    const principal = await scope!.writer.createPrincipalSession(subjectIdentifier, { subjectContext: "test-context" });
    if (principal.status !== "created")
      throw new Error("expected a Principal Session fixture");
    const update = scope!.pauseNextLifecycleObservation();

    const renewal = scope!.writer.renewPrincipalSession(
      principal.value.principalSessionId,
    );
    try {
      await withinTestStep(update.reached, "renewal did not reach principal validation");
      await withinTestStep(
        scope!.observer.revokePrincipalSession(
          principal.value.principalSessionId,
          "admin_revoke",
        ),
        "concurrent revocation did not complete",
      );
    }
    finally {
      update.release();
    }
    const renewed = await withinTestStep(renewal, "delayed renewal did not settle");

    expect(renewed).toMatchObject({ status: "revoked" });
    await expect(scope!.activeObjectExists({
      id: principal.value.principalSessionId,
      kind: "principal_session",
    })).resolves.toBe(false);
  });

  test("does not finalize cleanup against a replaced tombstone owner", async () => {
    await scope!.close();
    scope = await harness!.createSessionKernelScope({
      cleanupAdapters: [{
        protocol: "oidc",
        kind: "payload",
        cleanup: async () => {},
      }],
    });
    const artifact = await scope.writer.createProtocolArtifact({
      artifactType: "authorization_code",
      cleanupRefs: [{ protocol: "oidc", kind: "payload", ref: "payload:cas" }],
      clientCode: "portal",
      protocol: "oidc",
      ttlMs: 30_000,
    });
    if (artifact.status !== "created")
      throw new Error("expected an artifact fixture");
    scope.replaceTombstoneBeforeNextFinalize();

    await scope.writer.revokeClientProtocol(
      "portal",
      "oidc",
      "client_config_changed",
    );

    await expect(scope.observer.inventoryClientProtocol("portal", "oidc"))
      .resolves
      .toMatchObject({ counts: { cleanupPending: 1, total: 1 } });
    expect(await scope.cleanupTombstoneTtl({
      id: artifact.value.artifactId,
      kind: "artifact",
    })).toBe(-1);
  });

  test("pins failed cleanup and completes it from another Kernel instance on forward retry", async () => {
    await scope!.close();
    let cleanupShouldFail = true;
    let cleanupAttempts = 0;
    scope = await harness!.createSessionKernelScope({
      cleanupAdapters: [{
        protocol: "oidc",
        kind: "payload",
        cleanup: async () => {
          cleanupAttempts += 1;
          if (cleanupShouldFail)
            throw new Error("payload cleanup unavailable");
        },
      }],
    });
    const principal = await scope.writer.createPrincipalSession(subjectIdentifier, { subjectContext: "test-context" });
    if (principal.status !== "created")
      throw new Error("expected a Principal Session fixture");
    const credential = await scope.writer.issueCredential({
      clientCode: "portal",
      cleanupRefs: [{ protocol: "oidc", kind: "payload", ref: "payload:retry" }],
      credentialType: "access_token",
      principalSessionId: principal.value.principalSessionId,
      protocol: "oidc",
      ttlMs: 30_000,
    });
    if (credential.status !== "created")
      throw new Error("expected a Credential fixture");

    const failed = await scope.writer.revokeClientProtocol(
      "portal",
      "oidc",
      "client_config_changed",
    );
    expect(failed.cleanup.failed).toBe(1);
    expect(cleanupAttempts).toBe(1);
    await expect(scope.observer.inventoryClientProtocol("portal", "oidc"))
      .resolves
      .toMatchObject({ counts: { cleanupPending: 1, total: 1 } });
    expect(await scope.cleanupTombstoneTtl({
      id: credential.value.credentialId,
      kind: "credential",
    })).toBe(-1);

    cleanupShouldFail = false;
    const retried = await scope.observer.revokeClientProtocol(
      "portal",
      "oidc",
      "client_config_changed",
    );
    expect(retried.cleanup).toMatchObject({ attempted: 1, succeeded: 1, failed: 0 });
    expect(cleanupAttempts).toBe(2);
    await expect(scope.writer.inventoryClientProtocol("portal", "oidc"))
      .resolves
      .toMatchObject({ counts: { cleanupPending: 0, total: 0 } });
    expect(await scope.cleanupTombstoneTtl({
      id: credential.value.credentialId,
      kind: "credential",
    })).toBeGreaterThan(0);
  });

  test("atomically consumes an artifact once across Redis clients", async () => {
    const principalSession = await scope!.writer.createPrincipalSession(
      subjectIdentifier,
      { subjectContext: "test-context" },
    );
    if (principalSession.status !== "created")
      throw new Error("expected a Principal Session fixture");

    const artifact = await scope!.writer.createProtocolArtifact({
      artifactType: "authorization_code",
      clientCode: "gateway",
      principalSessionId: principalSession.value.principalSessionId,
      protocol: "custom-sso",
      ttlMs: 30_000,
    });
    if (artifact.status !== "created" || artifact.externalToken === undefined)
      throw new Error("expected an authorization artifact fixture");

    const results = await Promise.all([
      scope!.writer.consumeProtocolArtifact(artifact.externalToken),
      scope!.observer.consumeProtocolArtifact(artifact.externalToken),
    ]);

    expect(results.map(result => result.status).sort()).toEqual([
      "consumed_replay",
      "resolved",
    ]);
    const replay = await scope!.observer.consumeProtocolArtifact(
      artifact.externalToken,
    );
    expect(replay).toMatchObject({
      status: "consumed_replay",
    });
  });

  test("does not consume an artifact whose payload changes after resolution", async () => {
    const artifact = await scope!.writer.createProtocolArtifact({
      artifactType: "authorization_code",
      clientCode: "gateway",
      protocol: "custom-sso",
      ttlMs: 30_000,
    });
    if (artifact.status !== "created" || artifact.externalToken === undefined)
      throw new Error("expected an authorization artifact fixture");

    scope!.replaceArtifactPayloadBeforeNextValidation({
      artifactId: artifact.value.artifactId,
      serializedPayload: JSON.stringify({
        ...artifact.value,
        artifactType: "replaced_authorization_code",
      }),
    });

    const result = await scope!.writer.consumeProtocolArtifact(
      artifact.externalToken,
    );
    expect(result).toMatchObject({
      status: "missing_or_expired",
    });
  });
});

async function withinTestStep<T>(promise: Promise<T>, message: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), 2_000);
      }),
    ]);
  }
  finally {
    if (timeout)
      clearTimeout(timeout);
  }
}
