import type { OwnedStateRedis } from "@iam/api-core/utils/redis-owned-state-maintenance";
import { maintainOwnedRedisState } from "@iam/api-core/utils/redis-owned-state-maintenance";
import { customSsoMaintenancePrefixes } from "@iam/custom-sso/maintenance";
import { sessionKernelMaintenancePrefixes } from "@iam/session-kernel/maintenance";
import { providerSessionMaintenancePrefixes } from "../../session/provider-session.ts";
import { oidcObjectMaintenanceOwner } from "../stores/online-auth-state.ts";

export type OnlineAuthStateOperation = "dry-run" | "apply" | "verify";

export async function maintainOnlineAuthState(options: {
  redis: OwnedStateRedis;
  kernelNamespace: string;
  operation: OnlineAuthStateOperation;
  writersStopped: boolean;
  signal?: AbortSignal;
}) {
  const counts: Record<string, { observed: number; removed: number }> = {};
  try {
    if (!options.writersStopped || !options.kernelNamespace.trim())
      throw new Error("Stopped writers and explicit namespace required");
    // Delete all online authority first, then its protocol state. No index is trusted as inventory.
    const owners = [
      { owner: "kernel", prefixes: sessionKernelMaintenancePrefixes(options.kernelNamespace) },
      { owner: "grant", prefixes: customSsoMaintenancePrefixes() },
      oidcObjectMaintenanceOwner(),
      { owner: "providerSession", prefixes: providerSessionMaintenancePrefixes() },
    ];
    for (const { owner, prefixes } of owners) {
      counts[owner] = await maintainOwnedRedisState(options.redis, prefixes, options.operation, options.signal);
    }
    const empty = Object.values(counts).every(count => count.observed === 0);
    return { status: options.operation === "verify" && !empty ? "failed" : "passed", operation: options.operation, counts };
  }
  catch {
    return { status: "failed", operation: options.operation, counts };
  }
}
