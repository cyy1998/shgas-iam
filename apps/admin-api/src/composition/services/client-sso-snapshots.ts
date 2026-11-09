import type { AdminClientCachePort } from "@admin-api/services/client/client.port";
import { createClientRepository } from "@admin-api/services/client/client.repository";
import type { ClientSsoServiceDeps } from "@admin-api/services/client-sso/client-sso.port";
import type { ClientSnapshotsOptions } from "@iam/client-snapshot/composition";
import { createClientSnapshots } from "@iam/client-snapshot/composition";
import type { DbClient } from "@iam/db";
import { createClientSnapshotRepository } from "@iam/db/client-snapshot";
import type { AfterCommitLoggerPort } from "@iam/unit-of-work";
import { createClientSsoManagement } from "./client-sso-management";

export function createClientSsoSnapshotManagement(options: {
  db: DbClient;
  clientCache: AdminClientCachePort;
  redis: ClientSnapshotsOptions["redis"];
  logger: AfterCommitLoggerPort;
  sessionTermination?: ClientSsoServiceDeps["sessionTermination"];
}) {
  const snapshots = createClientSnapshots({
    redis: options.redis,
    source: createClientSnapshotRepository(options.db),
  });
  const genericClients = createClientRepository(options.db);
  const invalidation = {
    async invalidateClient(clientCode: string) {
      const results = await Promise.allSettled([
        snapshots.invalidateClient(clientCode),
        (async () => {
          const client = await genericClients.getAnyClientByCode(clientCode);
          if (client) await options.clientCache.invalidateClient(client);
        })(),
      ]);
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    },
  };
  return {
    management: createClientSsoManagement({
      ...options,
      invalidation,
    }),
    snapshots,
  };
}
