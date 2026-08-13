import {
  beginClientTrafficGateMutation,
  createClientTrafficGateReader,
  publishClientTrafficGateMutation,
} from "@iam/api-core/client-traffic-gate";
import { deleteClientTrafficGateTestState } from "@iam/api-core/client-traffic-gate/testing";
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

  it("observes Maintenance across readers and recovers after Enable publication", async () => {
    const scope = await harness.createScope();
    const clientCode = scope.unique("traffic-cycle");
    try {
      let sourceStatus = ClientStatus.Enable;
      let now = Date.now();
      const source = {
        findClientTrafficState: async () => ({
          clientCode,
          isDelete: false,
          status: sourceStatus,
        }),
      };
      const warmingReader = createOidcClientTrafficGate({
        gate: createClientTrafficGateReader({
          cache: { negativeTtlMs: 500, positiveTtlMs: 1_000 },
          clock: { now: () => now },
          redis: scope.writer,
          source,
        }),
      });
      const observingReader = createOidcClientTrafficGate({
        gate: createClientTrafficGateReader({
          cache: { negativeTtlMs: 500, positiveTtlMs: 1_000 },
          clock: { now: () => now },
          redis: scope.observer,
          source,
        }),
      });

      await expect(warmingReader.assertIssuanceAllowed(clientCode)).resolves.toBeUndefined();
      await expect(warmingReader.assertOnlineAccessAllowed(clientCode)).resolves.toBeUndefined();
      const maintenanceMutation = await beginClientTrafficGateMutation(scope.writer, {
        clientCode,
        mutationId: "00000000-0000-4000-8000-000000000303",
      });
      sourceStatus = ClientStatus.Maintenance;
      await expect(publishClientTrafficGateMutation(
        scope.writer,
        maintenanceMutation,
        ClientStatus.Maintenance,
        { clock: { now: () => now }, ttlMs: 1_000 },
      )).resolves.toBe("published");
      await expect(observingReader.assertIssuanceAllowed(clientCode)).rejects.toMatchObject({
        error: "temporarily_unavailable",
      });
      await expect(observingReader.assertOnlineAccessAllowed(clientCode)).rejects.toMatchObject({
        error: "temporarily_unavailable",
        statusCode: 503,
      });

      const enableMutation = await beginClientTrafficGateMutation(scope.writer, {
        clientCode,
        mutationId: "00000000-0000-4000-8000-000000000304",
      });
      sourceStatus = ClientStatus.Enable;
      await expect(publishClientTrafficGateMutation(
        scope.writer,
        enableMutation,
        ClientStatus.Enable,
        { clock: { now: () => now }, ttlMs: 1_000 },
      )).resolves.toBe("published");
      await observingReader.assertIssuanceAllowed(clientCode);
      await observingReader.assertOnlineAccessAllowed(clientCode);
      now += 1_001;
      await observingReader.assertIssuanceAllowed(clientCode);
      await observingReader.assertOnlineAccessAllowed(clientCode);
    }
    finally {
      try {
        await deleteClientTrafficGateTestState(scope.writer, clientCode);
      }
      finally {
        await scope.close();
      }
    }
  });
});
