import type { ClientProtocolRevocationSelector, CreateResult } from "@iam/session-kernel";
import type { RedisTestHarness, SessionKernelRedisTestScope } from "./redis-test-harness";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { createRedisTestHarness } from "./redis-test-harness";

let harness: RedisTestHarness;
let scope: SessionKernelRedisTestScope;
const diagnostics = mock((..._args: unknown[]) => {});
beforeAll(async () => {
  harness = await createRedisTestHarness();
});
beforeEach(async () => {
  diagnostics.mockClear();
  scope = await harness.createSessionKernelScope({ logger: { warn: diagnostics } });
});
afterEach(async () => {
  await scope?.close();
});
afterAll(async () => {
  await harness?.close();
});

function created<T>(result: CreateResult<T>) {
  if (result.status !== "created")
    throw new Error("fixture creation failed");
  return result.value;
}
function selector(boundary: number): ClientProtocolRevocationSelector {
  return { metadataFields: ["epoch"], select({ metadata }) {
    const epoch = metadata.epoch;
    if (typeof epoch !== "number" || !Number.isSafeInteger(epoch) || epoch < 0)
      return "unconfirmed";
    return epoch < boundary ? "select" : "retain";
  } };
}

describe("explicit selected Client protocol revocation", () => {
  test("selects each object independently, protects new Binding descendants and reports unknown versions once", async () => {
    const root = created(await scope.writer.createPrincipalSession("00000000-0000-4000-8000-000000000001", { subjectContext: "test" }));
    const binding = created(await scope.writer.createClientBinding({ principalSessionId: root.principalSessionId, protocol: "oidc", clientCode: "portal", metadata: { epoch: 1 } }));
    const old = created(await scope.writer.issueCredential({ principalSessionId: root.principalSessionId, bindingId: binding.bindingId, protocol: "oidc", clientCode: "portal", credentialType: "access_token", metadata: { epoch: 1 } }));
    const newer = created(await scope.writer.issueCredential({ principalSessionId: root.principalSessionId, bindingId: binding.bindingId, protocol: "oidc", clientCode: "portal", credentialType: "access_token", metadata: { epoch: 3 } }));
    const protectedArtifacts = [];
    for (const metadata of [{ epoch: 2 }, { epoch: 4 }, {}, { epoch: "1", subject: "sensitive", token: "secret" }, { epoch: -1 }, { epoch: 1.5 }]) {
      protectedArtifacts.push(created(await scope.writer.createProtocolArtifact({ bindingId: binding.bindingId, protocol: "oidc", clientCode: "portal", artifactType: "code", ttlMs: 30_000, metadata })));
    }
    const otherProtocol = created(await scope.writer.createProtocolArtifact({ protocol: "custom-sso", clientCode: "portal", artifactType: "code", ttlMs: 30_000, metadata: { epoch: 1 } }));
    const otherClient = created(await scope.writer.createProtocolArtifact({ protocol: "oidc", clientCode: "another", artifactType: "code", ttlMs: 30_000, metadata: { epoch: 1 } }));
    const result = await scope.writer.revokeSelectedClientProtocolObjects("portal", "oidc", selector(2), "client_config_changed");
    expect(result).toMatchObject({ bindings: { revoked: 1 }, credentials: { revoked: 1, excluded: 1 }, artifacts: { revoked: 0, excluded: 6 } });
    expect(await scope.activeObjectExists({ kind: "client_binding", id: binding.bindingId })).toBe(false);
    expect(await scope.activeObjectExists({ kind: "credential", id: old.credentialId })).toBe(false);
    expect(await scope.activeObjectExists({ kind: "credential", id: newer.credentialId })).toBe(true);
    for (const artifact of [...protectedArtifacts, otherProtocol, otherClient])
      expect(await scope.activeObjectExists({ kind: "artifact", id: artifact.artifactId })).toBe(true);
    expect((await scope.observer.resolvePrincipalSessionById(root.principalSessionId)).status).toBe("resolved");
    expect(diagnostics).toHaveBeenCalledTimes(1);
    expect(diagnostics.mock.calls[0]?.[0]).toEqual({ event: "session_kernel.bulk_revocation.unconfirmed", clientCode: "portal", protocol: "oidc", count: 4 });
    // The independent all-current command remains available for explicit maintenance.
    await scope.writer.revokeClientProtocol("portal", "oidc", "admin_revoke");
    expect(await scope.activeObjectExists({ kind: "credential", id: newer.credentialId })).toBe(false);
    expect(await scope.activeObjectExists({ kind: "artifact", id: otherProtocol.artifactId })).toBe(true);
  });

  for (const kind of ["artifact", "credential", "client_binding"] as const) {
    test(`${kind}: a replacement after selection survives without cleanup`, async () => {
      const root = created(await scope.writer.createPrincipalSession("00000000-0000-4000-8000-000000000002", { subjectContext: "test" }));
      const common = { principalSessionId: root.principalSessionId, protocol: "oidc", clientCode: "portal", metadata: { epoch: 1 }, cleanupRefs: [{ protocol: "oidc", kind: "payload", ref: "sensitive-reference" }] };
      const object = kind === "artifact"
        ? created(await scope.writer.createProtocolArtifact({ ...common, artifactType: "code", ttlMs: 30_000 }))
        : kind === "credential"
          ? created(await scope.writer.issueCredential({ ...common, credentialType: "access_token" }))
          : created(await scope.writer.createClientBinding(common));
      const id = "artifactId" in object ? object.artifactId : "credentialId" in object ? object.credentialId : object.bindingId;
      scope.replaceObjectBeforeNextRevoke();
      const result = await scope.writer.revokeSelectedClientProtocolObjects("portal", "oidc", selector(2), "client_config_changed");
      expect(result.cleanup.attempted).toBe(0);
      expect(result.bindings.revoked + result.credentials.revoked + result.artifacts.revoked).toBe(0);
      expect(await scope.activeObjectExists({ kind, id })).toBe(true);
    });
  }

  test("selector receives only a detached readonly requested field and missing cleanup adapters stay pending", async () => {
    const artifact = created(await scope.writer.createProtocolArtifact({ protocol: "oidc", clientCode: "portal", artifactType: "code", ttlMs: 30_000, metadata: { epoch: 1, subject: "private-subject", token: "private-token" }, cleanupRefs: [{ protocol: "oidc", kind: "payload", ref: "private-cleanup" }] }));
    let observation: unknown;
    const selected: ClientProtocolRevocationSelector = { metadataFields: ["epoch"], select(object) {
      observation = object;
      expect(Object.isFrozen(object)).toBe(true);
      expect(Object.isFrozen(object.metadata)).toBe(true);
      return "select";
    } };
    const result = await scope.writer.revokeSelectedClientProtocolObjects("portal", "oidc", selected, "client_config_changed");
    expect(observation).toEqual({ kind: "artifact", metadata: { epoch: 1 } });
    expect(result).toMatchObject({ artifacts: { revoked: 1 }, cleanup: { attempted: 1, failed: 1, succeeded: 0 } });
    expect(await scope.activeObjectExists({ kind: "artifact", id: artifact.artifactId })).toBe(false);
    expect((await scope.observer.inventoryClientProtocol("portal", "oidc")).counts.cleanupPending).toBe(1);
  });

  test("a production reissue under the observed artifact identity retains its new token and owner", async () => {
    const old = created(await scope.writer.createProtocolArtifact({ artifactId: "reissued", protocol: "oidc", clientCode: "portal", artifactType: "code", ttlMs: 30_000, metadata: { epoch: 1 }, cleanupRefs: [{ protocol: "oidc", kind: "payload", ref: "old-payload" }] }));
    const pause = scope.pauseNextLifecycleObservation("artifact");
    const pending = scope.writer.revokeSelectedClientProtocolObjects("portal", "oidc", selector(2), "client_config_changed");
    try {
      await pause.reached;
      const replacement = await scope.observer.createProtocolArtifact({ artifactId: old.artifactId, protocol: "oidc", clientCode: "portal", artifactType: "code", ttlMs: 30_000, metadata: { epoch: 3 } });
      if (replacement.status !== "created" || !replacement.externalToken)
        throw new Error("replacement fixture failed");
      pause.release();
      const result = await pending;
      expect(result).toMatchObject({ artifacts: { revoked: 0 }, cleanup: { attempted: 0 } });
      const resolved = await scope.observer.resolveProtocolArtifact(replacement.externalToken, { protocol: "oidc", artifactType: "code" });
      expect(resolved).toMatchObject({ status: "resolved", value: { metadata: { epoch: 3 } } });
      const inventory = await scope.observer.inventoryClientProtocol("portal", "oidc");
      expect(inventory.counts).toMatchObject({ artifacts: 1, cleanupPending: 0 });
    }
    finally {
      pause.release();
      await pending;
    }
  });
});
