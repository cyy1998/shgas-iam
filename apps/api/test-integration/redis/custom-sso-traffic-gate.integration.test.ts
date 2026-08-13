import {
  createCustomSsoTrafficGate,
  CustomSsoTrafficGateUnavailableError,
} from "@api/services/sso/custom-sso-traffic-gate";
import {
  beginClientTrafficGateMutation,
  createClientTrafficGateReader,
  invalidateClientTrafficGate,
  publishClientTrafficGateMutation,
} from "@iam/api-core/client-traffic-gate";
import { AuthzMaintenanceError } from "@iam/api-core/errors/AuthzMaintenanceError";
import { ClientStatus } from "@iam/contracts";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApiRedisTestHarness } from "./redis-test-harness";

describe("Custom SSO Traffic Gate Redis integration", () => {
  let harness: Awaited<ReturnType<typeof createApiRedisTestHarness>>;

  beforeAll(async () => {
    harness = await createApiRedisTestHarness();
  });

  afterAll(async () => {
    if (harness)
      await harness.close();
  });

  test("observes Maintenance across readers and resumes after Enable", async () => {
    const scope = await harness.createScope();
    try {
      const clientCode = scope.clientCode("gate-cycle");
      let currentStatus = ClientStatus.Enable;
      let now = Date.now();
      const source = {
        findClientTrafficState: async () => ({
          clientCode,
          isDelete: false,
          status: currentStatus,
        }),
      };
      const first = createCustomSsoTrafficGate({
        gate: createClientTrafficGateReader({
          cache: { negativeTtlMs: 500, positiveTtlMs: 1_000 },
          clock: { now: () => now },
          redis: scope.redis,
          source,
        }),
      });
      const second = createCustomSsoTrafficGate({
        gate: createClientTrafficGateReader({
          cache: { negativeTtlMs: 500, positiveTtlMs: 1_000 },
          clock: { now: () => now },
          redis: scope.observer,
          source,
        }),
      });

      await expect(first.assertIssuanceAllowed(clientCode)).resolves.toBeUndefined();
      currentStatus = ClientStatus.Maintenance;
      await invalidateClientTrafficGate(scope.redis, clientCode);

      await expect(second.assertIssuanceAllowed(clientCode))
        .rejects
        .toBeInstanceOf(AuthzMaintenanceError);

      const enableMutation = await beginClientTrafficGateMutation(scope.redis, {
        clientCode,
        mutationId: "00000000-0000-4000-8000-000000000202",
      });
      currentStatus = ClientStatus.Enable;
      const published = await publishClientTrafficGateMutation(
        scope.redis,
        enableMutation,
        ClientStatus.Enable,
        { clock: { now: () => now }, ttlMs: 1_000 },
      );
      expect(published).toBe("published");
      await second.assertSessionUseAllowed(clientCode);
      now += 1_001;
      await second.assertSessionUseAllowed(clientCode);
    }
    finally {
      await scope.close();
    }
  });

  test("fails closed generically while an Admin status mutation is in progress", async () => {
    const scope = await harness.createScope();
    try {
      const clientCode = scope.clientCode("gate-fence");
      const gate = createCustomSsoTrafficGate({
        gate: createClientTrafficGateReader({
          redis: scope.redis,
          source: {
            findClientTrafficState: async () => ({
              clientCode,
              isDelete: false,
              status: ClientStatus.Enable,
            }),
          },
        }),
      });
      const mutation = await beginClientTrafficGateMutation(scope.redis, {
        clientCode,
        mutationId: "00000000-0000-4000-8000-000000000203",
      });

      let failure: unknown;
      try {
        await gate.assertSessionUseAllowed(clientCode);
      }
      catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(CustomSsoTrafficGateUnavailableError);
      const published = await publishClientTrafficGateMutation(
        scope.redis,
        mutation,
        ClientStatus.Enable,
      );
      expect(published).toBe("published");
    }
    finally {
      await scope.close();
    }
  });
});
