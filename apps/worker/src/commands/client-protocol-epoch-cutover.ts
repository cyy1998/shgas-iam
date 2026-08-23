import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { ClientProtocolCutoverManifest } from "@iam/domain/client";
import { consumeTransactionRollbackConfirmation } from "@iam/api-core/uow";
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
  runtimeCache: {
    beginMutation: (clientCode: string) => Promise<{
      abort: () => Promise<unknown>;
      complete: () => Promise<unknown>;
      heartbeat: {
        assertOwned: () => Promise<void>;
        stopAndSettle: <T>(settle: () => Promise<T>) => Promise<T>;
      };
    }>;
  };
  uow: UnitOfWorkPort<{
    clients: {
      advanceEpochs: (
        targets: ClientProtocolEpochTarget[],
        afterLockBeforeWrite: () => Promise<void>,
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
    const runtimeCoordinations: Array<Awaited<ReturnType<
      ClientProtocolEpochCutoverDeps["runtimeCache"]["beginMutation"]
    >> & { clientCode: string; settlementStarted: boolean }> = [];
    let inventory: ClientProtocolEpochInventoryRecord[];
    try {
      inventory = await deps.uow.transaction(async (tx) => {
        const appliedInventory = await tx.clients.advanceEpochs(
          [...targetsByClient.values()],
          async () => {
            for (const client of manifest.clients) {
              if (client.customSso === null)
                continue;
              runtimeCoordinations.push({
                ...await deps.runtimeCache.beginMutation(client.clientCode),
                clientCode: client.clientCode,
                settlementStarted: false,
              });
            }
          },
        );
        for (const coordination of runtimeCoordinations)
          await coordination.heartbeat.assertOwned();
        for (const coordination of runtimeCoordinations.toReversed()) {
          tx.afterCommit.required(
            `complete-custom-sso-client-runtime-mutation:${coordination.clientCode}`,
            async () => {
              coordination.settlementStarted = true;
              await coordination.heartbeat.stopAndSettle(coordination.complete);
            },
          );
        }
        return appliedInventory;
      });
    }
    catch (error) {
      if (runtimeCoordinations.length === 0)
        throw error;
      if (!consumeTransactionRollbackConfirmation(error)) {
        for (const coordination of runtimeCoordinations.toReversed()) {
          if (coordination.settlementStarted)
            continue;
          try {
            await coordination.heartbeat.stopAndSettle(async () => undefined);
          }
          catch {
            // The transaction may already be committed. Preserve the original error and leave the fence to expire.
          }
        }
        throw error;
      }
      const abortFailures: unknown[] = [];
      for (const coordination of runtimeCoordinations.toReversed()) {
        try {
          await coordination.heartbeat.stopAndSettle(coordination.abort);
        }
        catch (abortError) {
          abortFailures.push(abortError);
        }
      }
      if (abortFailures.length > 0) {
        throw new AggregateError(
          [error, ...abortFailures],
          "Client Protocol epoch mutation failed and remains fenced",
        );
      }
      throw error;
    }
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
