import type { ArtifactMaintenanceObject, ArtifactMaintenanceReader, ArtifactMaintenanceWriter } from "@iam/session-kernel/maintenance";
import { createLegacyGrantMaintenance, createLegacyGrantVerifier, isCustomSsoAuthorizationArtifact } from "@iam/custom-sso/maintenance";
import { createArtifactMaintenance, createArtifactMaintenanceVerifier } from "@iam/session-kernel/maintenance";

type Options = { kernelNamespace: string; writersStopped: boolean; signal?: AbortSignal };

function selectGrant(object: ArtifactMaintenanceObject) {
  return isCustomSsoAuthorizationArtifact(object) ? "select" as const : "retain" as const;
}

function requireStoppedWriters(options: Options) {
  if (!options.writersStopped || !options.kernelNamespace.trim() || /[*?[\]\\]/.test(options.kernelNamespace))
    throw new Error("Stopped writers and literal namespace required");
}

/** Inventory and verification can be constructed with only SCAN/GET. */
export function createCustomSsoGrantVerifier(options: Options & { redis: ArtifactMaintenanceReader }) {
  requireStoppedWriters(options);
  const kernel = createArtifactMaintenanceVerifier({ ...options, namespace: options.kernelNamespace, select: selectGrant });
  const grants = createLegacyGrantVerifier(options);
  return {
    async inventory() { return combine("inventory", await kernel.inventory(), await grants.inventory()); },
    async verify() { return combine("verify", await kernel.verify(), await grants.verify()); },
  };
}

export function createCustomSsoGrantMaintenance(options: Options & { redis: ArtifactMaintenanceWriter }) {
  requireStoppedWriters(options);
  const reader = { scan: options.redis.scan.bind(options.redis), get: options.redis.get.bind(options.redis) };
  const verifier = createCustomSsoGrantVerifier({ ...options, redis: reader });
  const kernel = createArtifactMaintenance({ ...options, namespace: options.kernelNamespace, select: selectGrant });
  const grants = createLegacyGrantMaintenance(options);
  return {
    inventory: verifier.inventory,
    async apply() { return combine("apply", await kernel.apply(), await grants.apply()); },
  };
}

function combine(
  operation: "inventory" | "apply" | "verify",
  kernel: Awaited<ReturnType<ReturnType<typeof createArtifactMaintenanceVerifier>["verify"]>>,
  grants: Awaited<ReturnType<ReturnType<typeof createLegacyGrantVerifier>["verify"]>>,
) {
  return {
    status: kernel.status === "passed" && grants.status === "passed" ? "passed" : "failed",
    operation,
    kernel,
    grants,
    preservation: "requires_independent_baseline_comparison",
  };
}
