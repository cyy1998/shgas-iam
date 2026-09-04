import {
  createClientRuntimeSnapshotModule,
} from "@iam/api-core/client-runtime-snapshot";
import {
  clientRuntimeSnapshotTestingKeys,
} from "@iam/api-core/client-runtime-snapshot/testing";
import {
  createClientTrafficGateReader,
  createClientTrafficGateSnapshotAdapter,
} from "@iam/api-core/client-traffic-gate";
import { ClientStatus } from "@iam/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOidcClientTrafficGate } from "../../src/provider/client-traffic-gate.ts";
import { createOidcProviderRedisTestHarness } from "./redis-test-harness.ts";

describe("oIDC Client Traffic Gate Redis integration", () => {
  let harness: Awaited<ReturnType<typeof createOidcProviderRedisTestHarness>>;

  beforeAll(async () => {
    harness = await createOidcProviderRedisTestHarness();
  });

  afterAll(async () => {
    if (harness)
      await harness.close();
  });

  it("observes Maintenance only after shared Snapshot invalidation and then resumes", async () => {
    const scope = await harness.createScope();
    const clientCode = scope.unique("traffic-cycle");
    const keys = clientRuntimeSnapshotTestingKeys(clientCode);
    scope.trackKey(keys.control);
    for (const payload of keys.payloads)
      scope.trackKey(payload);
    try {
      let sourceStatus = ClientStatus.Enable;
      const source = {
        findClientTrafficState: async () => ({
          clientCode,
          isDelete: false,
          status: sourceStatus,
        }),
      };
      const runtime = createClientRuntimeSnapshotModule({
        redis: scope.writer,
        adapters: [createClientTrafficGateSnapshotAdapter({ source })],
      });
      const gate = createOidcClientTrafficGate({
        gate: createClientTrafficGateReader(runtime.reader("traffic-gate")),
      });

      await gate.assertIssuanceAllowed(clientCode);
      await gate.assertOnlineAccessAllowed(clientCode);

      sourceStatus = ClientStatus.Maintenance;
      await gate.assertIssuanceAllowed(clientCode);
      await runtime.invalidateClient(clientCode);

      let issuanceFailure: unknown;
      try {
        await gate.assertIssuanceAllowed(clientCode);
      }
      catch (error) {
        issuanceFailure = error;
      }
      expect(issuanceFailure).toMatchObject({ error: "temporarily_unavailable" });

      let onlineFailure: unknown;
      try {
        await gate.assertOnlineAccessAllowed(clientCode);
      }
      catch (error) {
        onlineFailure = error;
      }
      expect(onlineFailure).toMatchObject({
        error: "temporarily_unavailable",
        statusCode: 503,
      });

      sourceStatus = ClientStatus.Enable;
      await runtime.invalidateClient(clientCode);
      await gate.assertIssuanceAllowed(clientCode);
      await gate.assertOnlineAccessAllowed(clientCode);
    }
    finally {
      await scope.close();
    }
  });
});
