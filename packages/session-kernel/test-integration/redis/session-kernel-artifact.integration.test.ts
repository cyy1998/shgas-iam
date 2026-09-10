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
  test("consumption removes only its active inventory member and retains replay tombstone", async () => {
    const artifacts = await Promise.all(["first", "peer"].map(name => scope!.writer.createProtocolArtifact({
      protocol: "oidc",
      artifactType: "authorization_code",
      clientCode: "portal",
      ttlMs: 30_000,
      metadata: { name },
    })));
    const first = artifacts[0]!;
    if (first.status !== "created" || !first.externalToken)
      throw new Error("Expected artifact");
    const purpose = { protocol: "oidc", artifactType: "authorization_code", clientCode: "portal" };
    const observed = await scope!.writer.resolveProtocolArtifact(first.externalToken, purpose);
    if (observed.status !== "resolved")
      throw new Error("Expected observed artifact");
    const consumed = await scope!.writer.consumeProtocolArtifact(first.externalToken, purpose, observed.value);
    const inventory = await scope!.observer.inventoryClientProtocol("portal", "oidc");
    const replay = await scope!.observer.resolveProtocolArtifact(first.externalToken, purpose);
    expect(consumed.status).toBe("resolved");
    expect(inventory.counts).toMatchObject({ total: 1, stale: 0, artifacts: 1 });
    expect(replay.status).toBe("consumed_replay");
  });
  test("reports and removes a dangling client protocol owner exactly", async () => {
    await scope!.seedClientProtocolIndexMember({
      clientCode: "portal",
      id: "missing-artifact",
      kind: "artifact",
      protocol: "oidc",
    });

    const observedResult1 = await scope!.observer.inventoryClientProtocol("portal", "oidc");
    expect(observedResult1).toMatchObject({ counts: { stale: 1, total: 1 } });

    await scope!.writer.revokeClientProtocol(
      "portal",
      "oidc",
      "client_config_changed",
    );

    const observedResult2 = await scope!.observer.inventoryClientProtocol("portal", "oidc");
    expect(observedResult2).toMatchObject({ counts: { stale: 0, total: 0 } });
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

    const observedResult3 = await scope!.observer.inventoryClientProtocol("portal", "oidc");
    expect(observedResult3).toMatchObject({ counts: { invalid: 1, total: 1 } });
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

    expect(summary.artifacts).toMatchObject({ revoked: 0, excluded: 1, missing: 0 });
    const inventory = await scope!.observer.inventoryClientProtocol("portal", "oidc");
    expect(inventory).toMatchObject({ counts: { artifacts: 1, total: 1 } });
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
    const observedResult4 = await scope!.activeObjectExists({
      id: principal.value.principalSessionId,
      kind: "principal_session",
    });
    expect(observedResult4).toBe(false);
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

    const observedResult5 = await scope.observer.inventoryClientProtocol("portal", "oidc");
    expect(observedResult5).toMatchObject({ counts: { cleanupPending: 1, total: 1 } });
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
    const observedResult6 = await scope.observer.inventoryClientProtocol("portal", "oidc");
    expect(observedResult6).toMatchObject({ counts: { cleanupPending: 1, total: 1 } });
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
    const observedResult7 = await scope.writer.inventoryClientProtocol("portal", "oidc");
    expect(observedResult7).toMatchObject({ counts: { cleanupPending: 0, total: 0 } });
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
      scope!.writer.consumeProtocolArtifact(artifact.externalToken, artifact.value, artifact.value),
      scope!.observer.consumeProtocolArtifact(artifact.externalToken, artifact.value, artifact.value),
    ]);

    expect(results.map(result => result.status).sort()).toEqual([
      "consumed_replay",
      "resolved",
    ]);
    const replay = await scope!.observer.consumeProtocolArtifact(
      artifact.externalToken,
      artifact.value,
      artifact.value,
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

    const observed = await scope!.writer.resolveProtocolArtifact(artifact.externalToken, artifact.value);
    if (observed.status !== "resolved")
      throw new Error("expected observed artifact");
    const result = await scope!.writer.consumeProtocolArtifact(
      artifact.externalToken,
      artifact.value,
      observed.value,
    );
    expect(result).toMatchObject({
      status: "fail_closed",
    });
  });
  test("purpose and observed identity constrain consumption and precise revocation", async () => {
    const original = await scope!.writer.createProtocolArtifact({
      protocol: "oidc",
      clientCode: "portal",
      artifactType: "authorization_code",
      ttlMs: 30_000,
      metadata: { oidcConfigVersion: 1 },
    });
    if (original.status !== "created" || !original.externalToken)
      throw new Error("expected original");
    for (const purpose of [
      { protocol: "custom-sso", artifactType: "authorization_code", clientCode: "portal" },
      { protocol: "oidc", artifactType: "login_return_handle", clientCode: "portal" },
      { protocol: "oidc", artifactType: "authorization_code", clientCode: "other" },
    ]) {
      const rejected = await scope!.writer.resolveProtocolArtifact(original.externalToken, purpose);
      expect(rejected.status).toBe("purpose_mismatch");
      const consumed = await scope!.writer.consumeProtocolArtifact(original.externalToken, purpose, original.value);
      expect(consumed.status).toBe("fail_closed");
      const retained = await scope!.observer.resolveProtocolArtifact(original.externalToken, original.value);
      expect(retained.status).toBe("resolved");
    }
    const observed = await scope!.writer.resolveProtocolArtifact(original.externalToken, original.value);
    if (observed.status !== "resolved")
      throw new Error("expected observed object");
    await scope!.expireArtifactGeneration(original.value);
    const replacement = await scope!.observer.createProtocolArtifact({
      artifactId: original.value.artifactId,
      externalToken: original.externalToken,
      protocol: "oidc",
      clientCode: "portal",
      artifactType: "authorization_code",
      ttlMs: 30_000,
      metadata: { oidcConfigVersion: 2 },
    });
    if (replacement.status !== "created")
      throw new Error("expected replacement");
    const consumed = await scope!.writer.consumeProtocolArtifact(original.externalToken, original.value, observed.value);
    expect(consumed.status).toBe("fail_closed");
    const revoked = await scope!.writer.revokeObservedObject(observed.value, "client_config_changed");
    expect(revoked.artifacts.revoked).toBe(0);
    const retained = await scope!.observer.resolveProtocolArtifact(original.externalToken, original.value);
    expect(retained).toMatchObject({ status: "resolved", value: { metadata: { oidcConfigVersion: 2 } } });
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
