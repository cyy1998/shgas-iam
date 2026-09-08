import { LoggerSourceApp } from "@iam/api-core/logger";
import {
  createSessionKernelConfig,
} from "@iam/session-kernel";
import { createSessionKernelForTesting } from "@iam/session-kernel/testing";
import { describe, expect, it } from "vitest";
import {
  createOidcSessionKernelCleanupAdapter,
  OIDC_PROVIDER_TOKEN_PAYLOAD_CLEANUP_KIND,
  OIDC_SESSION_PROTOCOL,
} from "../../src/session/oidc-session-kernel.adapter.ts";
import { KernelRedis } from "./support/kernel-redis.ts";
import { ProviderSessionStateFake } from "./support/provider-session-state.ts";

function createKernelFixture() {
  const redis = new KernelRedis({ failDeleteContaining: "opaque-access-token" });
  const providerSessionState = new ProviderSessionStateFake();
  const logs: Array<{ data: Record<string, unknown>; message: string }> = [];
  const logger = {
    warn(data: Record<string, unknown>, message: string) {
      logs.push({ data, message });
    },
  };
  const kernel = createSessionKernelForTesting({
    redis,
    principalAccessFence: {
      capture: () => "20000000-0000-4000-8000-000000000001",
      validate: () => ({ ok: true }),
    },
    config: createSessionKernelConfig({
      principalIdleTtlMs: 60_000,
      principalAbsoluteTtlMs: 300_000,
      tombstoneTtlMs: 60_000,
      tombstoneGraceMs: 5_000,
      lookupHmacKeys: {
        current: { id: "current", secret: "c".repeat(32) },
      },
      clock: { now: () => redis.now },
    }),
    cleanupAdapters: createOidcSessionKernelCleanupAdapter({ providerSessionState, redis }),
    logger,
    sourceApp: LoggerSourceApp.OidcProvider,
  });
  return { kernel, logs, redis };
}

describe("oidc Session Kernel release logging", () => {
  it("logs authorization code replay without leaking code, token, verifier, secret, or cookie values", async () => {
    const { kernel, logs } = createKernelFixture();
    const session = await kernel.createPrincipalSession("00000000-0000-4000-8000-000000000007");
    expect(session.status).toBe("created");
    if (session.status !== "created")
      return;

    const code = "oidc-authorization-code-secret-12345678901234567890";
    const artifact = await kernel.createProtocolArtifact({
      principalSessionId: session.value.principalSessionId,
      protocol: OIDC_SESSION_PROTOCOL,
      clientCode: "public-client",
      artifactType: "authorization_code",
      ttlMs: 60_000,
      externalToken: code,
    });
    expect(artifact.status).toBe("created");
    await kernel.consumeProtocolArtifact(code);
    logs.length = 0;

    await expect(kernel.consumeProtocolArtifact(code)).resolves.toMatchObject({ status: "consumed_replay" });

    const output = JSON.stringify(logs);
    expect(output).toContain("session_kernel.tombstone_replay.detected");
    expect(output).toContain(LoggerSourceApp.OidcProvider);
    expect(output).toContain("authorization_code");
    expect(output).not.toContain(code);
    expect(output).not.toContain("pkce-verifier-secret");
    expect(output).not.toContain("clientSecret");
    expect(output).not.toContain("Cookie");
  });

  it("logs OIDC cleanup failure summaries without private payload refs", async () => {
    const { kernel, logs } = createKernelFixture();
    const session = await kernel.createPrincipalSession("00000000-0000-4000-8000-000000000007");
    expect(session.status).toBe("created");
    if (session.status !== "created")
      return;

    const tokenRef = "oidc:model:AccessToken:opaque-access-token-12345678901234567890";
    const credential = await kernel.issueCredential({
      principalSessionId: session.value.principalSessionId,
      protocol: OIDC_SESSION_PROTOCOL,
      clientCode: "public-client",
      credentialType: "access_token",
      ttlMs: 60_000,
      externalToken: "provider-token-secret-12345678901234567890",
      cleanupRefs: [{
        protocol: OIDC_SESSION_PROTOCOL,
        kind: OIDC_PROVIDER_TOKEN_PAYLOAD_CLEANUP_KIND,
        ref: tokenRef,
      }],
    });
    expect(credential.status).toBe("created");
    if (credential.status !== "created")
      return;

    await kernel.revokeCredential(credential.value.credentialId, "admin_revoke");

    const output = JSON.stringify(logs);
    expect(output).toContain("session_kernel.revoke.cleanup_failed");
    expect(output).toContain(LoggerSourceApp.OidcProvider);
    expect(output).toContain("public-client");
    expect(output).not.toContain(tokenRef);
    expect(output).not.toContain("provider-token-secret-12345678901234567890");
    expect(output).not.toContain("clientSecret");
    expect(output).not.toContain("Cookie");
  });
});
