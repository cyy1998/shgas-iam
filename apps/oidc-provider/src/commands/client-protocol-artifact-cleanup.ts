import type { ClientProtocolCutoverManifest } from "@iam/domain/client";
import { clientProtocolCutoverTargets } from "@iam/domain/client";

type Protocol = "custom-sso" | "oidc";
type Operation = "dry-run" | "apply" | "verify";

interface KernelCounts {
  bindings: number;
  credentials: number;
  artifacts: number;
  cleanupPending: number;
  invalid: number;
  stale: number;
  total: number;
}

interface ProtocolObjectCounts {
  total: number;
  invalid: number;
  stale: number;
  byModel: Record<string, number>;
}

interface ProviderSessionBindingCounts {
  bindings: number;
  invalid: number;
  stale: number;
  total: number;
}

export interface ClientProtocolArtifactCleanupDeps {
  kernel: {
    inventoryClientProtocol: (
      clientCode: string,
      protocol: string,
    ) => Promise<{ counts: KernelCounts }>;
    revokeClientProtocol: (
      clientCode: string,
      protocol: string,
      reason: "client_config_changed",
    ) => Promise<{ cleanup: { failed: number } }>;
  };
  protocolObjects: {
    inspectClient: (clientCode: string) => Promise<{ counts: ProtocolObjectCounts }>;
    revokeClient: (clientCode: string) => Promise<void>;
  };
  providerSessionBindings: {
    inventoryClientStagedBindings: (
      clientCode: string,
    ) => Promise<{ counts: ProviderSessionBindingCounts }>;
    revokeClientStagedBindings: (clientCode: string) => Promise<void>;
  };
}

export function createClientProtocolArtifactCleanup(
  deps: ClientProtocolArtifactCleanupDeps,
) {
  async function inspect(
    manifest: ClientProtocolCutoverManifest,
    operation: Operation,
    requireClean: boolean,
  ) {
    const entries = [] as Array<{
      clientCode: string;
      protocol: Protocol;
      kernel: KernelCounts;
      protocolObjects?: ProtocolObjectCounts;
      providerSessionBindings?: ProviderSessionBindingCounts;
    }>;
    const failures = [] as Array<{
      clientCode: string;
      protocol: Protocol;
      reason: "invalid-inventory" | "owner-unconfirmed" | "residual-artifacts";
    }>;
    for (const target of clientProtocolCutoverTargets(manifest)) {
      const kernel = await deps.kernel.inventoryClientProtocol(
        target.clientCode,
        target.protocol,
      );
      const protocolObjects = target.protocol === "oidc"
        ? await deps.protocolObjects.inspectClient(target.clientCode)
        : undefined;
      const providerSessionBindings = target.protocol === "oidc"
        ? await deps.providerSessionBindings.inventoryClientStagedBindings(target.clientCode)
        : undefined;
      entries.push({
        clientCode: target.clientCode,
        protocol: target.protocol,
        kernel: kernel.counts,
        ...(protocolObjects ? { protocolObjects: protocolObjects.counts } : {}),
        ...(providerSessionBindings
          ? { providerSessionBindings: providerSessionBindings.counts }
          : {}),
      });
      if (!target.ownerConfirmed) {
        failures.push({
          clientCode: target.clientCode,
          protocol: target.protocol,
          reason: "owner-unconfirmed",
        });
      }
      else if (
        kernel.counts.invalid > 0
        || (protocolObjects?.counts.invalid ?? 0) > 0
        || (providerSessionBindings?.counts.invalid ?? 0) > 0
      ) {
        failures.push({
          clientCode: target.clientCode,
          protocol: target.protocol,
          reason: "invalid-inventory",
        });
      }
      else if (
        requireClean
        && (
          kernel.counts.total > 0
          || (protocolObjects?.counts.total ?? 0) > 0
          || (providerSessionBindings?.counts.total ?? 0) > 0
        )
      ) {
        failures.push({
          clientCode: target.clientCode,
          protocol: target.protocol,
          reason: "residual-artifacts",
        });
      }
    }
    return {
      version: 1 as const,
      operation,
      status: failures.length === 0 ? "passed" as const : "failed" as const,
      counts: {
        clients: manifest.clients.length,
        protocols: entries.length,
        kernelObjects: entries.reduce((sum, entry) => sum + entry.kernel.total, 0),
        protocolObjects: entries.reduce(
          (sum, entry) => sum + (entry.protocolObjects?.total ?? 0),
          0,
        ),
        providerSessionBindings: entries.reduce(
          (sum, entry) => sum + (entry.providerSessionBindings?.total ?? 0),
          0,
        ),
      },
      entries,
      failures,
    };
  }

  async function dryRun(manifest: ClientProtocolCutoverManifest) {
    return await inspect(manifest, "dry-run", false);
  }

  async function apply(manifest: ClientProtocolCutoverManifest) {
    const before = await dryRun(manifest);
    if (before.status === "failed")
      return { ...before, operation: "apply" as const };
    const cleanupFailures = [] as Array<{
      clientCode: string;
      protocol: Protocol;
      reason: "cleanup-failed";
    }>;
    for (const target of clientProtocolCutoverTargets(manifest)) {
      const summary = await deps.kernel.revokeClientProtocol(
        target.clientCode,
        target.protocol,
        "client_config_changed",
      );
      if (summary.cleanup.failed > 0) {
        cleanupFailures.push({
          clientCode: target.clientCode,
          protocol: target.protocol,
          reason: "cleanup-failed",
        });
      }
      if (target.protocol === "oidc") {
        await deps.providerSessionBindings.revokeClientStagedBindings(target.clientCode);
        await deps.protocolObjects.revokeClient(target.clientCode);
      }
    }
    const after = await inspect(manifest, "apply", true);
    return cleanupFailures.length === 0
      ? after
      : {
          ...after,
          status: "failed" as const,
          failures: [...cleanupFailures, ...after.failures],
        };
  }

  async function verify(manifest: ClientProtocolCutoverManifest) {
    return await inspect(manifest, "verify", true);
  }

  return { apply, dryRun, verify };
}
