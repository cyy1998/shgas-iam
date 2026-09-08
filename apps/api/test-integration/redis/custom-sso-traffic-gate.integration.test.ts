import {
  createClientRuntimeSnapshotModule,
} from "@iam/api-core/client-runtime-snapshot";
import {
  createClientTrafficGateReader,
  createClientTrafficGateSnapshotAdapter,
} from "@iam/api-core/client-traffic-gate";
import { AuthzMaintenanceError } from "@iam/api-core/errors/AuthzMaintenanceError";
import { ClientStatus } from "@iam/contracts";
import {
  createCustomSsoTrafficGate,
  CustomSsoTrafficGateUnavailableError,
} from "@iam/custom-sso/testing";
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

  test("keeps an accepted normal Snapshot until targeted invalidation exposes Maintenance", async () => {
    const scope = await harness.createScope();
    try {
      const clientCode = scope.clientCode("gate-cycle");
      let currentStatus = ClientStatus.Enable;
      const source = {
        findClientTrafficState: async () => ({
          clientCode,
          isDelete: false,
          status: currentStatus,
        }),
      };
      const runtime = createClientRuntimeSnapshotModule({
        redis: scope.redis,
        adapters: [createClientTrafficGateSnapshotAdapter({ source })],
      });
      const gate = createCustomSsoTrafficGate({
        gate: createClientTrafficGateReader(runtime.reader("traffic-gate")),
      });

      const initialDecision = await gate.assertIssuanceAllowed(clientCode);
      expect(initialDecision).toBeUndefined();

      currentStatus = ClientStatus.Maintenance;
      const acceptedBeforeRepair = await gate.assertSessionUseAllowed(clientCode);
      expect(acceptedBeforeRepair).toBeUndefined();

      await runtime.invalidateClient(clientCode);
      let maintenanceFailure: unknown;
      try {
        await gate.assertIssuanceAllowed(clientCode);
      }
      catch (error) {
        maintenanceFailure = error;
      }
      expect(maintenanceFailure).toBeInstanceOf(AuthzMaintenanceError);

      currentStatus = ClientStatus.Enable;
      await runtime.invalidateClient(clientCode);
      const enabledAgain = await gate.assertSessionUseAllowed(clientCode);
      expect(enabledAgain).toBeUndefined();
    }
    finally {
      await scope.close();
    }
  });

  test("fails closed when the Snapshot source cannot produce a trusted Client", async () => {
    const scope = await harness.createScope();
    try {
      const clientCode = scope.clientCode("gate-source-corrupt");
      const runtime = createClientRuntimeSnapshotModule({
        redis: scope.redis,
        adapters: [createClientTrafficGateSnapshotAdapter({
          source: {
            findClientTrafficState: async () => ({
              clientCode: `${clientCode}-wrong`,
              isDelete: false,
              status: ClientStatus.Enable,
            }),
          },
        })],
      });
      const gate = createCustomSsoTrafficGate({
        gate: createClientTrafficGateReader(runtime.reader("traffic-gate")),
      });

      let failure: unknown;
      try {
        await gate.assertSessionUseAllowed(clientCode);
      }
      catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(CustomSsoTrafficGateUnavailableError);
    }
    finally {
      await scope.close();
    }
  });
});
