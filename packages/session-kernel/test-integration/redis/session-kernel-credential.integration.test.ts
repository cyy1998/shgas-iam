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
import { createRedisTestHarness, waitForRedisCondition } from "./redis-test-harness";

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

describe("Session Kernel credential real Redis contract", () => {
  test("gives one concurrent creator a caller-known identity without overwriting it", async () => {
    const principalSession = await scope!.writer.createPrincipalSession(
      subjectIdentifier,
    );
    if (principalSession.status !== "created")
      throw new Error("expected a Principal Session fixture");

    const credentialId = "30000000-0000-4000-8000-000000000002";
    const [writerResult, observerResult] = await Promise.all([
      scope!.writer.issueCredential({
        credentialId,
        externalToken: "writer-bearer-token",
        principalSessionId: principalSession.value.principalSessionId,
        protocol: "custom-sso",
        clientCode: "writer-client",
        credentialType: "local_sid",
        ttlMs: 30_000,
      }),
      scope!.observer.issueCredential({
        credentialId,
        externalToken: "observer-bearer-token",
        principalSessionId: principalSession.value.principalSessionId,
        protocol: "custom-sso",
        clientCode: "observer-client",
        credentialType: "local_sid",
        ttlMs: 30_000,
      }),
    ]);

    expect([writerResult.status, observerResult.status].sort()).toEqual([
      "created",
      "fail_closed",
    ]);
    const createdToken = writerResult.status === "created"
      ? "writer-bearer-token"
      : "observer-bearer-token";
    const rejectedToken = writerResult.status === "created"
      ? "observer-bearer-token"
      : "writer-bearer-token";
    const createdCredential = await scope!.writer.resolveCredential(createdToken);
    expect(createdCredential).toMatchObject({
      status: "resolved",
      value: { credentialId },
    });
    const rejectedCredential = await scope!.observer.resolveCredential(rejectedToken);
    expect(rejectedCredential).toMatchObject({
      status: "missing_or_expired",
    });
  });

  test("rejects a tombstoned identity while preserving credential indexes", async () => {
    const principalSession = await scope!.writer.createPrincipalSession(
      subjectIdentifier,
    );
    if (principalSession.status !== "created")
      throw new Error("expected a Principal Session fixture");

    const credentialId = "30000000-0000-4000-8000-000000000003";
    const issued = await scope!.writer.issueCredential({
      credentialId,
      externalToken: "revoked-bearer-token",
      principalSessionId: principalSession.value.principalSessionId,
      protocol: "custom-sso",
      clientCode: "portal",
      credentialType: "local_sid",
      ttlMs: 30_000,
    });
    expect(issued.status).toBe("created");

    const revoked = await scope!.observer.revokeClientProtocol(
      "portal",
      "custom-sso",
      "client_config_changed",
    );
    expect(revoked.credentials.revoked).toBe(1);
    const reused = await scope!.writer.issueCredential({
      credentialId,
      externalToken: "replacement-bearer-token",
      principalSessionId: principalSession.value.principalSessionId,
      protocol: "custom-sso",
      clientCode: "portal",
      credentialType: "local_sid",
      ttlMs: 30_000,
    });

    expect(reused).toMatchObject({ status: "fail_closed" });
    const revokedCredential = await scope!.observer.resolveCredential("revoked-bearer-token");
    expect(revokedCredential).toMatchObject({
      status: "revoked",
    });
    const replacementCredential = await scope!.writer.resolveCredential("replacement-bearer-token");
    expect(replacementCredential).toMatchObject({
      status: "missing_or_expired",
    });
  });

  test("keeps one lookup owner when concurrent identities use the same bearer token", async () => {
    const principalSession = await scope!.writer.createPrincipalSession(
      subjectIdentifier,
    );
    if (principalSession.status !== "created")
      throw new Error("expected a Principal Session fixture");

    const externalToken = "shared-bearer-token";
    const credentialIds = [
      "30000000-0000-4000-8000-000000000004",
      "30000000-0000-4000-8000-000000000005",
    ] as const;
    const results = await Promise.all([
      scope!.writer.issueCredential({
        credentialId: credentialIds[0],
        externalToken,
        principalSessionId: principalSession.value.principalSessionId,
        protocol: "custom-sso",
        clientCode: "writer-client",
        credentialType: "local_sid",
        ttlMs: 30_000,
      }),
      scope!.observer.issueCredential({
        credentialId: credentialIds[1],
        externalToken,
        principalSessionId: principalSession.value.principalSessionId,
        protocol: "custom-sso",
        clientCode: "observer-client",
        credentialType: "local_sid",
        ttlMs: 30_000,
      }),
    ]);

    expect(results.map(result => result.status).sort()).toEqual([
      "created",
      "fail_closed",
    ]);
    const resolved = await scope!.writer.resolveCredential(externalToken);
    expect(resolved.status).toBe("resolved");
    if (resolved.status !== "resolved")
      return;
    expect((credentialIds as readonly string[]).includes(
      resolved.value.credentialId,
    )).toBe(true);
    const rejectedCredentialId = credentialIds.find(
      credentialId => credentialId !== resolved.value.credentialId,
    )!;
    const missing = await scope!.observer.revokeCredential(rejectedCredentialId);
    expect(missing.credentials.missing).toBe(1);
  });

  test("uses fresh server UUIDs for new issuance after natural expiry", async () => {
    const principalSession = await scope!.writer.createPrincipalSession(
      subjectIdentifier,
    );
    if (principalSession.status !== "created")
      throw new Error("expected a Principal Session fixture");

    const expired = await scope!.writer.issueCredential({
      externalToken: "expiring-bearer-token",
      principalSessionId: principalSession.value.principalSessionId,
      protocol: "custom-sso",
      clientCode: "portal",
      credentialType: "local_sid",
      ttlMs: 100,
    });
    expect(expired.status).toBe("created");
    if (expired.status !== "created")
      throw new Error("expected a Credential fixture");
    expect(expired.value.credentialId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    await waitForRedisCondition(async () =>
      (await scope!.observer.resolveCredential("expiring-bearer-token")).status === "missing_or_expired", "Credential did not expire within the observation deadline");

    const resolvedExpired = await scope!.observer.resolveCredential("expiring-bearer-token");
    expect(resolvedExpired).toMatchObject({
      status: "missing_or_expired",
    });
    const expiredIndex = await scope!.observer.revokeClientProtocol(
      "portal",
      "custom-sso",
    );
    expect(expiredIndex.credentials).toMatchObject({
      revoked: 0,
      alreadyRevoked: 0,
      missing: 1,
    });

    const replacement = await scope!.writer.issueCredential({
      externalToken: "replacement-after-expiry",
      principalSessionId: principalSession.value.principalSessionId,
      protocol: "custom-sso",
      clientCode: "portal",
      credentialType: "local_sid",
      ttlMs: 30_000,
    });
    expect(replacement.status).toBe("created");
    if (replacement.status !== "created")
      throw new Error("expected a new Credential");
    expect(replacement.value.credentialId).not.toBe(expired.value.credentialId);
    expect(replacement.value.credentialId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const resolvedReplacement = await scope!.observer.resolveCredential("replacement-after-expiry");
    expect(resolvedReplacement).toMatchObject({
      status: "resolved",
      value: { credentialId: replacement.value.credentialId },
    });
  });

  test("revokes a caller-known credential after Redis commits and the adapter reports failure", async () => {
    const principalSession = await scope!.writer.createPrincipalSession(
      subjectIdentifier,
    );
    if (principalSession.status !== "created")
      throw new Error("expected a Principal Session fixture");

    const credentialId = "30000000-0000-4000-8000-000000000006";
    scope!.failNextCredentialCreateAfterCommit();
    const ambiguousIssue = await scope!.ambiguousWriter.issueCredential({
      credentialId,
      principalSessionId: principalSession.value.principalSessionId,
      protocol: "custom-sso",
      clientCode: "portal",
      credentialType: "local_sid",
      ttlMs: 30_000,
    });
    expect(ambiguousIssue).toMatchObject({ status: "fail_closed" });

    const compensated = await scope!.observer.revokeCredential(
      credentialId,
      "credential_corrupted",
    );
    expect(compensated.credentials.revoked).toBe(1);
    const repeated = await scope!.writer.revokeCredential(
      credentialId,
      "credential_corrupted",
    );
    expect(repeated.credentials.alreadyRevoked).toBe(1);

    const missing = await scope!.observer.revokeCredential(
      "30000000-0000-4000-8000-000000000007",
      "credential_corrupted",
    );
    expect(missing.credentials.missing).toBe(1);
  });
});
