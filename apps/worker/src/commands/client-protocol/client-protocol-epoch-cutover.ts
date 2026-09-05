import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { ClientProtocolCutoverManifest } from "@iam/domain/client";
import { clientProtocolCutoverTargets } from "@iam/domain/client";

export interface ClientProtocolEpochInventoryRecord {
  clientCode: string;
  customSsoConfigured: boolean;
  customSsoEpoch: number;
  oidcConfigured: boolean;
  oidcEpoch: number;
}

export interface ClientProtocolEpochTarget {
  clientCode: string;
  customSsoExpectedEpoch?: number;
  oidcExpectedEpoch?: number;
}

export interface ClientProtocolEpochCutoverDeps {
  runtimeSnapshot: {
    invalidateClient: (clientCode: string) => Promise<unknown>;
  };
  uow: UnitOfWorkPort<{
    clients: {
      advanceEpochs: (
        targets: ClientProtocolEpochTarget[],
      ) => Promise<ClientProtocolEpochInventoryRecord[]>;
    };
  }>;
}

type Protocol = "custom-sso" | "oidc";
type FailureReason
  = | "epoch-fence-mismatch"
    | "epoch-not-advanced"
    | "manifest-client-not-found"
    | "manifest-missing-client"
    | "owner-unconfirmed"
    | "protocol-config-mismatch";

export function createClientProtocolEpochCutover(
  deps: ClientProtocolEpochCutoverDeps,
) {
  async function inspect(
    manifest: ClientProtocolCutoverManifest,
    inventory: ClientProtocolEpochInventoryRecord[],
    phase: "before" | "after",
  ) {
    const inventoryByCode = new Map(inventory.map(record => [record.clientCode, record]));
    const manifestByCode = new Map(manifest.clients.map(client => [client.clientCode, client]));
    const failures: Array<{
      clientCode: string;
      protocol?: Protocol;
      reason: FailureReason;
    }> = [];
    let protocols = 0;
    let pendingEpochs = 0;
    let advancedEpochs = 0;

    for (const record of inventory) {
      if (!manifestByCode.has(record.clientCode)) {
        failures.push({
          clientCode: record.clientCode,
          reason: "manifest-missing-client",
        });
      }
    }

    for (const client of manifest.clients) {
      const record = inventoryByCode.get(client.clientCode);
      if (!record) {
        failures.push({
          clientCode: client.clientCode,
          reason: "manifest-client-not-found",
        });
        continue;
      }
      inspectProtocol({
        clientCode: client.clientCode,
        configured: record.customSsoConfigured,
        currentEpoch: record.customSsoEpoch,
        phase,
        protocol: "custom-sso",
        target: client.customSso,
      });
      inspectProtocol({
        clientCode: client.clientCode,
        configured: record.oidcConfigured,
        currentEpoch: record.oidcEpoch,
        phase,
        protocol: "oidc",
        target: client.oidc,
      });
    }

    failures.sort((left, right) =>
      left.clientCode.localeCompare(right.clientCode)
      || (left.protocol ?? "").localeCompare(right.protocol ?? "")
      || left.reason.localeCompare(right.reason));
    return {
      version: 2 as const,
      phase,
      status: failures.length === 0 ? "passed" as const : "failed" as const,
      counts: {
        clients: inventory.length,
        protocols,
        pendingEpochs,
        advancedEpochs,
      },
      failures,
    };

    function inspectProtocol(input: {
      clientCode: string;
      configured: boolean;
      currentEpoch: number;
      phase: "before" | "after";
      protocol: Protocol;
      target: {
        expectedEpoch: number;
        ownerStatus: "confirmed" | "pending";
      } | null;
    }) {
      if (input.configured !== (input.target !== null)) {
        failures.push({
          clientCode: input.clientCode,
          protocol: input.protocol,
          reason: "protocol-config-mismatch",
        });
        return;
      }
      if (input.target === null)
        return;
      protocols += 1;
      if (input.target.ownerStatus !== "confirmed") {
        failures.push({
          clientCode: input.clientCode,
          protocol: input.protocol,
          reason: "owner-unconfirmed",
        });
      }
      if (input.currentEpoch === input.target.expectedEpoch) {
        pendingEpochs += 1;
        if (input.phase === "after") {
          failures.push({
            clientCode: input.clientCode,
            protocol: input.protocol,
            reason: "epoch-not-advanced",
          });
        }
        return;
      }
      if (input.currentEpoch === input.target.expectedEpoch + 1) {
        advancedEpochs += 1;
        return;
      }
      failures.push({
        clientCode: input.clientCode,
        protocol: input.protocol,
        reason: "epoch-fence-mismatch",
      });
    }
  }

  async function dryRun(
    manifest: ClientProtocolCutoverManifest,
    inventory: ClientProtocolEpochInventoryRecord[],
  ) {
    return await inspect(manifest, inventory, "before");
  }

  async function apply(
    manifest: ClientProtocolCutoverManifest,
  ) {
    const targets = clientProtocolCutoverTargets(manifest);
    const ownerFailures = targets.filter(target => !target.ownerConfirmed).map(target => ({
      clientCode: target.clientCode,
      protocol: target.protocol,
      reason: "owner-unconfirmed" as const,
    })).sort((left, right) =>
      left.clientCode.localeCompare(right.clientCode)
      || left.protocol.localeCompare(right.protocol));
    if (ownerFailures.length > 0) {
      return {
        version: 2 as const,
        phase: "before" as const,
        status: "failed" as const,
        counts: {
          clients: manifest.clients.length,
          protocols: manifest.clients.reduce((count, client) =>
            count + Number(client.customSso !== null) + Number(client.oidc !== null), 0),
          pendingEpochs: 0,
          advancedEpochs: 0,
        },
        failures: ownerFailures,
      };
    }

    const targetsByClient = new Map<string, ClientProtocolEpochTarget>();
    for (const target of targets) {
      const epochTarget = targetsByClient.get(target.clientCode) ?? {
        clientCode: target.clientCode,
      };
      if (target.protocol === "custom-sso") {
        epochTarget.customSsoExpectedEpoch = target.expectedEpoch;
      }
      else {
        epochTarget.oidcExpectedEpoch = target.expectedEpoch;
      }
      targetsByClient.set(target.clientCode, epochTarget);
    }
    const inventory = await deps.uow.transaction(async (tx) => {
      const appliedInventory = await tx.clients.advanceEpochs(
        [...targetsByClient.values()],
      );
      for (const client of manifest.clients) {
        if (client.customSso === null && client.oidc === null)
          continue;
        tx.afterCommit.required(
          `invalidate-client-runtime-snapshots:${client.clientCode}`,
          async () => {
            await deps.runtimeSnapshot.invalidateClient(client.clientCode);
          },
        );
      }
      return appliedInventory;
    });
    const after = await inspect(manifest, inventory, "after");
    if (after.status === "failed")
      throw new Error("Client Protocol epoch repository returned an invalid applied batch");
    return after;
  }

  async function verify(
    manifest: ClientProtocolCutoverManifest,
    inventory: ClientProtocolEpochInventoryRecord[],
  ) {
    return await inspect(manifest, inventory, "after");
  }

  return { apply, dryRun, verify };
}
